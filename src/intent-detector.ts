/**
 * Intent detector for the Slack bridge.
 *
 * Classifies incoming messages into intent types so the router can
 * dispatch them appropriately -- direct action, custom handler, or
 * pass-through to Claude.
 *
 * Built-in intents:
 *   - delivery_query:  "where are Patel's photos?" -> query database directly
 *   - ship:            "ship the PR" -> translate to /ship prompt for Claude
 *   - retry:           "try again" -> clear stale session
 *   - today_briefing:  "/today" -> generate cross-repo daily briefing
 *   - vault_add:       "vault add decision ..." -> propose knowledge base entry
 *   - pipeline_status: "pipeline status" -> query pipeline tables
 *   - recording_start: "about to record X" -> pull_script + mark RECORDING
 *   - idea_capture:    "idea about X" -> capture_idea MCP tool
 *   - publish_content: "publish <topic>" -> spawn Claude for content creation
 *   - session_context: "what are you working on?" -> pass-through to --resume
 *   - passthrough:     everything else -> spawn Claude normally
 *
 * To add custom intents, see docs/INTENTS.md.
 */

export type IntentType =
  | "delivery_query"
  | "ship"
  | "retry"
  | "today_briefing"
  | "session_context"
  | "vault_add"
  | "pipeline_status"
  | "recording_start"
  | "idea_capture"
  | "publish_content"
  | "passthrough";

export type VaultType = "decision" | "principle" | "rule" | "axiom" | "persona";

export interface DetectedIntent {
  type: IntentType;
  /** Only populated for delivery_query intents. */
  clientName?: string;
  /** Only populated for vault_add intents. */
  vaultType?: VaultType;
  /** Only populated for vault_add intents -- the content to codify. */
  vaultContent?: string;
  /** Only populated for publish_content intents -- the topic to publish about. */
  publishTopic?: string;
  /** Only populated for idea_capture intents -- full text for MCP tool to parse. */
  ideaCaptureText?: string;
  /** Only populated for recording_start intents -- the topic being recorded. */
  recordingTopic?: string;
}

// ---------------------------------------------------------------------------
// Delivery query patterns -- extract client name from capture group 1
// ---------------------------------------------------------------------------
const DELIVERY_PATTERNS: RegExp[] = [
  /where\s+are\s+(?:the\s+)?(\w+)(?:'s|s)?\s+(?:photos?|videos?|deliver)/i,
  /status\s+of\s+(\w+)(?:'s)?\s+(?:deliver|photos?|videos?)/i,
  /(\w+)(?:'s)?\s+(?:photos?|videos?)\s+(?:status|ready|done)/i,
];

// ---------------------------------------------------------------------------
// Ship patterns -- "ship the PR", "ship it", "create a PR", etc.
// ---------------------------------------------------------------------------
const SHIP_PATTERNS: RegExp[] = [
  /\b(ship|push|merge)\s+(the\s+)?pr\b/i,
  /\bship\s+it\b/i,
  /\bcreate\s+(a\s+)?pr\b/i,
  /\bpush\s+(for\s+)?review\b/i,
];

// ---------------------------------------------------------------------------
// Retry patterns -- "try again", "retry", "start over", "restart"
// ---------------------------------------------------------------------------
const RETRY_PATTERNS: RegExp[] = [
  /^try\s+again\b/i,
  /^retry\b/i,
  /^start\s+over\b/i,
  /^restart\b/i,
];

// ---------------------------------------------------------------------------
// Today briefing patterns -- "/today", "today's briefing", "what's on my plate"
// ---------------------------------------------------------------------------
const TODAY_PATTERNS: RegExp[] = [
  /^\/today\b/i,
  /\btoday(?:'s)?\s+briefing\b/i,
  /\bwhat(?:'s|s)?\s+(?:on\s+)?(?:my\s+)?(?:plate|agenda)\s+today\b/i,
];

// ---------------------------------------------------------------------------
// Session context patterns -- "what are you working on?", etc.
// ---------------------------------------------------------------------------
const SESSION_CONTEXT_PATTERNS: RegExp[] = [
  /\bwhat\s+are\s+you\s+working\s+on\b/i,
  /\bcurrent\s+task\b/i,
  /\bsession\s+status\b/i,
  /\bwhat(?:'s|s)?\s+(?:your\s+)?status\b/i,
];

// ---------------------------------------------------------------------------
// Vault add patterns -- "vault add decision ...", "save to vault"
// ---------------------------------------------------------------------------
const VAULT_TYPED_PATTERN =
  /\bvault\s+add\s+(decision|principle|rule|axiom|persona)\s+(.+)/is;
const VAULT_SAVE_PATTERNS: RegExp[] = [
  /\bsave\s+to\s+vault\b/i,
  /\bcodify\s+this\b/i,
  /\bvault\s+(?:save|write|store)\b/i,
];

const VALID_VAULT_TYPES = new Set<VaultType>([
  "decision",
  "principle",
  "rule",
  "axiom",
  "persona",
]);

// ---------------------------------------------------------------------------
// Pipeline status patterns
// ---------------------------------------------------------------------------
const PIPELINE_STATUS_PATTERNS: RegExp[] = [
  /\bpipeline\s+status\b/i,
  /\bcontent\s+pipeline\b/i,
  /\bcontent\s+status\b/i,
  /\bpublishing\s+pipeline\b/i,
  /\bpipeline\s+overview\b/i,
];

// ---------------------------------------------------------------------------
// Idea capture patterns -- "idea about X", "content idea", "I want to make"
// ---------------------------------------------------------------------------
const IDEA_CAPTURE_PATTERNS: RegExp[] = [
  /\bidea\s+about\b/i,
  /\bcontent\s+idea\b/i,
  /\bi\s+(?:want|have\s+an\s+idea)\s+to\s+make\b/i,
  /\bhave\s+an\s+idea\b/i,
];

// ---------------------------------------------------------------------------
// Recording start patterns -- "about to record X", "recording X"
// ---------------------------------------------------------------------------
const RECORDING_START_PATTERNS: Array<{ pattern: RegExp; topicGroup: number }> =
  [
    { pattern: /\babout\s+to\s+record\s+(.+)/i, topicGroup: 1 },
    { pattern: /\brecording\s+(.+)/i, topicGroup: 1 },
  ];

// ---------------------------------------------------------------------------
// Publish content patterns -- "publish <topic>", "create post about <topic>"
// ---------------------------------------------------------------------------
const PUBLISH_PATTERNS: Array<{ pattern: RegExp; topicGroup: number }> = [
  {
    pattern: /\bpublish\s+(?:a\s+)?(?:post\s+)?(?:about\s+)?(.+)/i,
    topicGroup: 1,
  },
  { pattern: /\bcreate\s+(?:a\s+)?post\s+(?:about|on)\s+(.+)/i, topicGroup: 1 },
  { pattern: /\bwrite\s+(?:a\s+)?post\s+(?:about|on)\s+(.+)/i, topicGroup: 1 },
  { pattern: /\bdraft\s+(?:a\s+)?post\s+(?:about|on)\s+(.+)/i, topicGroup: 1 },
];

// ---------------------------------------------------------------------------
// detectIntent
// ---------------------------------------------------------------------------

/**
 * Classify the intent of a cleaned message (repo prefix already stripped).
 *
 * Precedence: delivery_query > ship > retry > today_briefing > vault_add >
 *             pipeline_status > recording_start > idea_capture > publish_content >
 *             session_context > passthrough
 */
export function detectIntent(text: string): DetectedIntent {
  // 1. Delivery query
  for (const pattern of DELIVERY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const clientName = match[1];
      return { type: "delivery_query", clientName };
    }
  }

  // 2. Ship intent
  if (SHIP_PATTERNS.some((p) => p.test(text))) {
    return { type: "ship" };
  }

  // 3. Retry intent
  if (RETRY_PATTERNS.some((p) => p.test(text))) {
    return { type: "retry" };
  }

  // 4. Today briefing
  if (TODAY_PATTERNS.some((p) => p.test(text))) {
    return { type: "today_briefing" };
  }

  // 5. Vault add
  const vaultTypedMatch = VAULT_TYPED_PATTERN.exec(text);
  if (vaultTypedMatch) {
    const rawType = vaultTypedMatch[1].toLowerCase();
    const vaultType = VALID_VAULT_TYPES.has(rawType as VaultType)
      ? (rawType as VaultType)
      : undefined;
    return {
      type: "vault_add",
      vaultType,
      vaultContent: vaultTypedMatch[2].trim(),
    };
  }
  if (VAULT_SAVE_PATTERNS.some((p) => p.test(text))) {
    return { type: "vault_add" };
  }

  // 6. Pipeline status
  if (PIPELINE_STATUS_PATTERNS.some((p) => p.test(text))) {
    return { type: "pipeline_status" };
  }

  // 7. Recording start
  for (const { pattern, topicGroup } of RECORDING_START_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return {
        type: "recording_start",
        recordingTopic: match[topicGroup].trim(),
      };
    }
  }

  // 8. Idea capture
  if (IDEA_CAPTURE_PATTERNS.some((p) => p.test(text))) {
    return { type: "idea_capture", ideaCaptureText: text };
  }

  // 9. Publish content
  for (const { pattern, topicGroup } of PUBLISH_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return {
        type: "publish_content",
        publishTopic: match[topicGroup].trim(),
      };
    }
  }

  // 10. Session context
  if (SESSION_CONTEXT_PATTERNS.some((p) => p.test(text))) {
    return { type: "session_context" };
  }

  // 11. Default
  return { type: "passthrough" };
}
