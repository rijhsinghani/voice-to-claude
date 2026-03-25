import dotenv from "dotenv";
dotenv.config({ override: true });
import { z } from "zod";

export const HookPayloadSchema = z.object({
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  message: z.string().optional(),
});

export type HookPayload = z.infer<typeof HookPayloadSchema>;

export interface HookDecision {
  behavior: "allow" | "deny";
}

export interface SessionEntry {
  repo: string;
  slackThread: string;
  pid?: number;
  createdAt: number;
  lastActivity: number;
  claudeSessionId: string;
  busy?: boolean;
}

// ALLOWED_SLACK_USER: Your Slack user ID (only this user can interact with the bridge)
// Get it from Slack: click your name -> View profile -> More -> Copy member ID
export const ALLOWED_USER = process.env.ALLOWED_SLACK_USER!;
if (!ALLOWED_USER) {
  throw new Error("ALLOWED_SLACK_USER environment variable is required");
}

// CLAUDE_CHANNEL: The Slack channel ID where Claude listens
// Get it from Slack: right-click the channel name -> View channel details -> Channel ID at the bottom
export const CLAUDE_CHANNEL = process.env.CLAUDE_CHANNEL!;
if (!CLAUDE_CHANNEL) {
  throw new Error("CLAUDE_CHANNEL environment variable is required");
}

export const HOOK_RELAY_PORT = parseInt(process.env.HOOK_RELAY_PORT ?? "3847");

// CONTENT_APPROVAL_CHANNEL: Slack channel ID where content approval messages are posted.
// Get it from Slack: right-click channel name -> View channel details -> Channel ID
// Optional until Phase 55 wires the full approval flow — empty string disables posting.
export const CONTENT_APPROVAL_CHANNEL =
  process.env.CONTENT_APPROVAL_CHANNEL ?? "";
