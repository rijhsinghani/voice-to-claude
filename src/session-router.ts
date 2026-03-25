import { randomUUID } from "node:crypto";
import pino from "pino";
import type { WebClient } from "@slack/web-api";
import type { SessionEntry } from "./types.js";
import {
  spawnClaudeSession,
  messageQueue,
  REPO_PATHS,
  DEFAULT_REPO,
} from "./session-manager.js";
import { saveState, loadState } from "./state-persistence.js";

const logger = pino({ name: "session-router" });

// ---------------------------------------------------------------------------
// Output chunking helpers
// ---------------------------------------------------------------------------

/**
 * Clean up Claude's output for Slack readability.
 * - Replace em/en dashes with regular dashes
 * - Remove decorative line characters
 */
function formatForSlack(text: string): string {
  let cleaned = text;

  // Replace em dashes and en dashes with regular dashes
  cleaned = cleaned.replace(/\u2014/g, "-");
  cleaned = cleaned.replace(/\u2013/g, "-");

  // Remove decorative box-drawing horizontal lines
  cleaned = cleaned.replace(/[─━]{3,}/g, "");

  // Remove lines that are ONLY whitespace + decorative chars
  cleaned = cleaned.replace(/^\s*[`]*\s*$/gm, "");

  // Collapse 3+ consecutive blank lines into 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Split text at natural paragraph boundaries, keeping each chunk under maxLen.
 * Handles unclosed code fences by closing/reopening across chunk boundaries.
 */
function splitAtNaturalBoundaries(text: string, maxLen = 3500): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = maxLen;

    // Prefer splitting at a blank line (paragraph boundary)
    const lastBlankLine = remaining.lastIndexOf("\n\n", maxLen);
    if (lastBlankLine > maxLen * 0.5) {
      splitAt = lastBlankLine + 2;
    } else {
      // Fall back to last newline
      const lastNewline = remaining.lastIndexOf("\n", maxLen);
      if (lastNewline > maxLen * 0.3) {
        splitAt = lastNewline + 1;
      }
      // Last resort: hard split at maxLen
    }

    let chunk = remaining.slice(0, splitAt).trimEnd();
    remaining = remaining.slice(splitAt).trimStart();

    // Handle unclosed code fences — odd count of ``` means one is open
    const fenceCount = (chunk.match(/^```/gm) ?? []).length;
    if (fenceCount % 2 !== 0) {
      chunk += "\n```";
      remaining = "```\n" + remaining;
    }

    chunks.push(chunk);
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

async function postChunked(
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  text: string,
): Promise<void> {
  const trimmed = formatForSlack(text);
  if (trimmed.length === 0) {
    await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Session completed with no output.",
    });
    return;
  }

  const chunks = splitAtNaturalBoundaries(trimmed);
  for (const chunk of chunks) {
    await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: chunk,
    });
  }
}

// ---------------------------------------------------------------------------
// Repo detection patterns
// ---------------------------------------------------------------------------

/**
 * Build repo detection patterns from REPO_PATHS keys.
 * Pattern format: "repo-name:" prefix or keyword match.
 */
function buildRepoPatterns(): Array<{ pattern: RegExp; repo: string }> {
  return Object.keys(REPO_PATHS).map((repoName) => ({
    pattern: new RegExp(`^${repoName}:`, "i"),
    repo: repoName,
  }));
}

export { DEFAULT_REPO };

// ---------------------------------------------------------------------------
// SessionRegistry
// ---------------------------------------------------------------------------

/**
 * Thread-to-session registry with disk persistence.
 * Maps Slack thread_ts -> SessionEntry so thread replies route to the correct
 * existing Claude session (via --resume UUID) instead of spawning a new one.
 *
 * On construction: loads persisted state from disk.
 * On every mutation (set/delete): persists to disk.
 */
export class SessionRegistry {
  private sessions: Map<string, SessionEntry>;

  constructor() {
    this.sessions = loadState();
    this.cleanStale();
  }

  get(threadTs: string): SessionEntry | undefined {
    return this.sessions.get(threadTs);
  }

  set(threadTs: string, entry: SessionEntry): void {
    this.sessions.set(threadTs, entry);
    saveState(this.sessions);
  }

  delete(threadTs: string): void {
    this.sessions.delete(threadTs);
    saveState(this.sessions);
  }

  getAll(): SessionEntry[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Remove stale sessions older than 7 days.
   * Sessions are ephemeral per-message.
   * State persistence handles expiry via loadState's built-in age filter.
   */
  cleanStale(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
    let removedCount = 0;

    for (const [threadTs, entry] of this.sessions.entries()) {
      if (entry.lastActivity < cutoff) {
        this.sessions.delete(threadTs);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      saveState(this.sessions);
    }

    logger.info(
      { loaded: this.sessions.size, removedStale: removedCount },
      "Registry loaded and cleaned",
    );
  }
}

// ---------------------------------------------------------------------------
// detectRepo
// ---------------------------------------------------------------------------

/**
 * Detect the target repo from a message's text.
 *
 * Priority order:
 * 1. Explicit prefix (e.g. "my-project: ...")  -> strip prefix, return repo
 * 2. Default repo (from DEFAULT_REPO env var)
 */
export function detectRepo(text: string): {
  repo: string;
  cleanedText: string;
} {
  const patterns = buildRepoPatterns();

  // 1. Explicit prefix matching
  for (const { pattern, repo } of patterns) {
    if (pattern.test(text)) {
      const cleaned = text.replace(pattern, "").trimStart();
      return { repo, cleanedText: cleaned };
    }
  }

  // 2. Default repo
  const defaultRepo = DEFAULT_REPO || (Object.keys(REPO_PATHS)[0] ?? "");
  return { repo: defaultRepo, cleanedText: text };
}

// ---------------------------------------------------------------------------
// routeMessage
// ---------------------------------------------------------------------------

/**
 * Route a Slack message to an ephemeral `claude -p` process.
 *
 * - First message in a thread: detect repo, assign a new UUID, spawn with
 *   `--session-id UUID`, register the session.
 * - Thread reply: load claudeSessionId from registry, spawn with `--resume UUID`
 *   to restore full conversation context.
 *
 * Messages in the same thread are queued via messageQueue to prevent concurrent
 * --resume race conditions.
 *
 * Process exit = turn complete. Output is clean text, posted directly to Slack.
 */
export async function routeMessage(opts: {
  text: string;
  threadTs: string;
  channel: string;
  slackClient: WebClient;
  registry: SessionRegistry;
}): Promise<void> {
  const { text, threadTs, channel, slackClient, registry } = opts;

  const existing = registry.get(threadTs);
  const isResume = !!existing;

  // Determine repo and prompt text
  const { repo, cleanedText } = isResume
    ? { repo: existing.repo, cleanedText: text }
    : detectRepo(text);

  // Handle "retry" keyword — clear stale session so next message starts fresh
  if (cleanedText.trim().toLowerCase() === "retry") {
    registry.delete(threadTs);
    await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Session cleared. What would you like to do?",
    });
    return;
  }

  // Validate repo path
  if (!REPO_PATHS[repo]) {
    await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `:x: Unknown repo: \`${repo}\`. Valid repos: ${Object.keys(REPO_PATHS).join(", ")}`,
    });
    return;
  }

  // Fetch Slack thread history for thread replies — ensures Claude has
  // conversation context even when session entry was lost or the thread
  // has many messages with short replies like "Yes" or "go ahead".
  let threadContext = "";
  try {
    const threadHistory = await slackClient.conversations.replies({
      channel,
      ts: threadTs,
      limit: 30, // Fetch up to 30 messages
    });
    const msgs = (threadHistory.messages ?? []).slice(-20); // Keep last 20
    if (msgs.length > 1) {
      // Only inject context if there ARE prior messages (skip for first message in thread)
      const contextLines = msgs.map((m: any) => {
        const who = m.bot_id ? "Claude" : "User";
        const msgText = (m.text ?? "").slice(0, 2000);
        return `${who}: ${msgText}`;
      });
      threadContext =
        `[CONTEXT: You are responding via Slack. Below is the conversation history from this thread. ` +
        `Use this context to understand what the user is referring to. ` +
        `If the user says "yes", "do it", "go ahead", look at your previous messages to understand what they're approving.]\n\n` +
        `--- Thread History (${contextLines.length} messages) ---\n` +
        `${contextLines.join("\n\n")}\n` +
        `--- End Thread History ---\n\n` +
        `User's latest message: `;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to fetch thread context — continuing without");
  }

  const promptToSend = threadContext + cleanedText;

  // Assign or retrieve the Claude session UUID
  const claudeSessionId = isResume ? existing.claudeSessionId : randomUUID();

  logger.info(
    { threadTs, repo, claudeSessionId, isResume },
    isResume
      ? "Thread reply: resuming Claude session"
      : "New thread: starting Claude session",
  );

  // Enqueue the work per-thread to prevent concurrent --resume races
  let output: string;
  try {
    output = await messageQueue.enqueue(threadTs, async () => {
      // Post working status immediately so user knows bridge received the message
      try {
        await slackClient.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: isResume
            ? `Continuing in \`${repo}\`...`
            : `Starting Claude in \`${repo}\`...`,
        });
      } catch (err) {
        logger.warn({ err }, "Failed to post status message");
      }

      const result = await spawnClaudeSession({
        prompt: promptToSend,
        repo,
        claudeSessionId,
        isResume,
        onPing: async (elapsedSec) => {
          const mins = Math.floor(elapsedSec / 60);
          try {
            await slackClient.chat.postMessage({
              channel,
              thread_ts: threadTs,
              text: `Still working... (${mins}m elapsed)`,
            });
          } catch {
            /* non-fatal */
          }
        },
      });

      return result.output;
    });
  } catch (err) {
    // Spawn error (timeout, crash, etc.) — log and notify, preserve registry so --resume still works
    logger.error(
      { err, threadTs, claudeSessionId },
      "spawnClaudeSession failed",
    );
    try {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `:x: Claude process error: ${(err as Error).message}`,
      });
    } catch (postErr) {
      logger.warn({ postErr }, "Failed to post error message to Slack");
    }
    return;
  }

  // Register or update session in registry after successful spawn
  if (!isResume) {
    registry.set(threadTs, {
      repo,
      slackThread: threadTs,
      claudeSessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  } else {
    registry.set(threadTs, {
      ...existing,
      lastActivity: Date.now(),
    });
  }

  // Post output to Slack — split at natural boundaries if longer than 3500 chars
  try {
    await postChunked(slackClient, channel, threadTs, output);
  } catch (err) {
    logger.error({ err }, "Failed to post Claude output to Slack");
  }
}
