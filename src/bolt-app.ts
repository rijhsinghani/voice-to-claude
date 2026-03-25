import dotenv from "dotenv";
dotenv.config({ override: true });
import pino from "pino";
import { App, LogLevel } from "@slack/bolt";
import { allowlistMiddleware } from "./security.js";
import { CLAUDE_CHANNEL } from "./types.js";
import { resolveDecision } from "./pending-store.js";
import { buildPermissionResolved } from "./slack-ui.js";
import { SessionRegistry, routeMessage } from "./session-router.js";
import {
  transcribeAudio,
  isAudioFile,
  type SlackFile,
} from "./audio-transcriber.js";

const logger = pino({ name: "bolt-app" });

export const boltApp = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
  logLevel: LogLevel.WARN,
});

// Security middleware: drop all messages from unauthorized users
boltApp.use(allowlistMiddleware);

// Session registry — loaded from disk on startup, persisted on every mutation
export const registry = new SessionRegistry();

// PITFALL: await ack() is the FIRST line in every action handler (Slack 3s timeout)

// Permission action: Allow
boltApp.action("perm_allow", async ({ ack, body, client }) => {
  await ack();
  const hookId = (body as any).actions[0].value;
  const entry = resolveDecision(hookId, { behavior: "allow" });
  if (entry) {
    await client.chat.update({
      channel: entry.channel,
      ts: entry.slackMsgTs,
      blocks: buildPermissionResolved((body as any).message.blocks, "ALLOWED"),
      text: "Permission: ALLOWED",
    });
  }
});

// Permission action: Deny
boltApp.action("perm_deny", async ({ ack, body, client }) => {
  await ack();
  const hookId = (body as any).actions[0].value;
  const entry = resolveDecision(hookId, { behavior: "deny" });
  if (entry) {
    await client.chat.update({
      channel: entry.channel,
      ts: entry.slackMsgTs,
      blocks: buildPermissionResolved((body as any).message.blocks, "DENIED"),
      text: "Permission: DENIED",
    });
  }
});

// Permission action: Always Allow
// Currently resolves as allow (persistent allowlist can be implemented later)
boltApp.action("perm_always", async ({ ack, body, client }) => {
  await ack();
  const hookId = (body as any).actions[0].value;
  const entry = resolveDecision(hookId, { behavior: "allow" });
  if (entry) {
    await client.chat.update({
      channel: entry.channel,
      ts: entry.slackMsgTs,
      blocks: buildPermissionResolved(
        (body as any).message.blocks,
        "ALWAYS ALLOWED",
      ),
      text: "Permission: ALWAYS ALLOWED",
    });
  }
});

// Plan action: Approve
// Resolves the ExitPlanMode hook decision as "allow" so the plan proceeds.
boltApp.action("plan_approve", async ({ ack, body, client }) => {
  await ack();
  const hookId = (body as any).actions[0].value;
  const entry = resolveDecision(hookId, { behavior: "allow" });
  if (entry) {
    await client.chat.update({
      channel: entry.channel,
      ts: entry.slackMsgTs,
      blocks: buildPermissionResolved((body as any).message.blocks, "APPROVED"),
      text: "Plan: APPROVED",
    });
  }
});

// Plan action: Cancel
// Resolves the ExitPlanMode hook decision as "deny" so the plan is stopped.
boltApp.action("plan_cancel", async ({ ack, body, client }) => {
  await ack();
  const hookId = (body as any).actions[0].value;
  const entry = resolveDecision(hookId, { behavior: "deny" });
  if (entry) {
    await client.chat.update({
      channel: entry.channel,
      ts: entry.slackMsgTs,
      blocks: buildPermissionResolved(
        (body as any).message.blocks,
        "CANCELLED",
      ),
      text: "Plan: CANCELLED",
    });
  }
});

// Plan action: Modify
// Resolves the hook as "deny" immediately (prevents deadlock), then posts
// a feedback prompt so the user can describe changes. The reply routes
// through routeMessage -> --resume -> Claude re-plans with the feedback.
boltApp.action("plan_modify", async ({ ack, body, client }) => {
  await ack();
  const hookId = (body as any).actions[0].value;
  const threadTs = (body as any).message.thread_ts ?? (body as any).message.ts;
  const entry = resolveDecision(hookId, { behavior: "deny" });
  if (entry) {
    await client.chat.update({
      channel: entry.channel,
      ts: entry.slackMsgTs,
      blocks: buildPermissionResolved(
        (body as any).message.blocks,
        "MODIFY REQUESTED",
      ),
      text: "Plan: MODIFY REQUESTED",
    });
    await client.chat.postMessage({
      channel: entry.channel,
      thread_ts: threadTs,
      text: "What changes do you want? Reply in this thread and I'll revise the plan.",
    });
  }
});

// Message handler: Slack messages in the designated channel route through session router
// - New messages: detect repo, create Claude session in the right repo directory
// - Thread replies: route to existing session for continuity
// - Audio files: transcribe via Gemini Flash before routing
boltApp.message(async ({ message, client }) => {
  // Skip subtypes (edits, file shares, etc.)
  // Exception: "file_share" subtype is how Slack delivers messages with attached files —
  // we must NOT skip those, as audio clips arrive this way.
  if (message.subtype && message.subtype !== "file_share") return;

  const msg = message as {
    text?: string;
    ts: string;
    channel: string;
    bot_id?: string;
    user?: string;
    thread_ts?: string;
    files?: SlackFile[];
  };

  // Skip bot messages to prevent loops
  if (msg.bot_id) return;

  // Only respond to messages from the allowed user (enforced by allowlistMiddleware,
  // but double-check here for the message handler)
  if (!msg.user) return;

  // Only respond to messages in the designated Claude channel
  if (msg.channel !== CLAUDE_CHANNEL) return;

  // If this is a reply in an existing thread, use the parent thread ts.
  const threadTs = msg.thread_ts ?? msg.ts;

  // ---------------------------------------------------------------------------
  // Audio file transcription
  // If the message contains audio files, transcribe them via Gemini Flash and
  // prepend the transcription to any existing message text.
  // ---------------------------------------------------------------------------
  let audioTranscription: string | null = null;

  const audioFiles = (msg.files ?? []).filter(isAudioFile);
  if (audioFiles.length > 0) {
    const audioFile = audioFiles[0]; // process first audio file

    logger.info(
      {
        fileId: audioFile.id,
        fileName: audioFile.name,
        fileSize: audioFile.size,
      },
      "Audio file detected — transcribing",
    );

    // React with microphone emoji to acknowledge receipt immediately
    try {
      await client.reactions.add({
        channel: msg.channel,
        timestamp: msg.ts,
        name: "microphone",
      });
    } catch (err) {
      logger.warn({ err }, "Failed to add microphone reaction");
    }

    const botToken = process.env.SLACK_BOT_TOKEN!;
    try {
      audioTranscription = await transcribeAudio(audioFile, botToken);

      // Post transcription as a thread reply so the user can verify what was heard
      await client.chat.postMessage({
        channel: msg.channel,
        thread_ts: threadTs,
        text: `:speech_balloon: *Transcription:* ${audioTranscription}`,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error({ err, fileId: audioFile.id }, "Audio transcription failed");

      await client.chat.postMessage({
        channel: msg.channel,
        thread_ts: threadTs,
        text: `:x: Audio transcription failed: ${errMsg}`,
      });

      // Cannot proceed without transcription — stop processing
      return;
    }
  }

  // Build the final prompt:
  // - If audio was transcribed: use transcription (prepend any typed text if both exist)
  // - Otherwise: use the message text as before
  let prompt: string | undefined;

  if (audioTranscription !== null) {
    const typedText = msg.text?.trim();
    prompt = typedText
      ? `${typedText}\n\n${audioTranscription}`
      : audioTranscription;
  } else {
    prompt = msg.text?.trim();
  }

  if (!prompt) return;

  try {
    await routeMessage({
      text: prompt,
      threadTs,
      channel: msg.channel,
      slackClient: client,
      registry,
    });
  } catch (err) {
    await client.chat.postMessage({
      channel: msg.channel,
      thread_ts: threadTs,
      text: `:x: Error: ${(err as Error).message}`,
    });
  }
});
