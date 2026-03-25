import pino from "pino";
import type { HookDecision } from "./types.js";

const logger = pino({ name: "pending-store" });

type PendingEntry = {
  resolve: (decision: HookDecision) => void;
  timer: NodeJS.Timeout;
  slackMsgTs: string;
  channel: string;
  createdAt: number;
};

// Every entry has a TTL timer. No Promise is ever left without a cleanup path.
const pending = new Map<string, PendingEntry>();

/**
 * Wait for a human decision on a permission request.
 * Auto-denies after timeoutMs if no button is tapped.
 */
export function waitForDecision(
  hookId: string,
  slackMsgTs: string,
  channel: string,
  timeoutMs = 120_000,
): Promise<HookDecision> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(hookId);
      logger.warn({ hookId }, "Permission auto-denied (timeout)");
      resolve({ behavior: "deny" });
    }, timeoutMs);

    pending.set(hookId, {
      resolve,
      timer,
      slackMsgTs,
      channel,
      createdAt: Date.now(),
    });

    logger.info(
      { hookId, timeoutMs, pendingCount: pending.size },
      "Waiting for decision",
    );
  });
}

/**
 * Resolve a pending decision from a Slack button tap.
 * Returns the entry so the caller can update the Slack message.
 */
export function resolveDecision(
  hookId: string,
  decision: HookDecision,
): PendingEntry | undefined {
  const entry = pending.get(hookId);
  if (!entry) {
    logger.warn({ hookId }, "resolveDecision called for unknown hookId");
    return undefined;
  }
  clearTimeout(entry.timer);
  pending.delete(hookId);
  entry.resolve(decision);
  logger.info(
    { hookId, behavior: decision.behavior, pendingCount: pending.size },
    "Decision resolved",
  );
  return entry;
}

/** Number of pending decisions awaiting Slack button taps. */
export function getPendingCount(): number {
  return pending.size;
}

/**
 * Clear all pending decisions. Auto-denies all of them.
 * Used on bridge shutdown to prevent leaked Promises.
 */
export function clearAll(): void {
  for (const [hookId, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve({ behavior: "deny" });
    logger.info({ hookId }, "clearAll: auto-denied on shutdown");
  }
  pending.clear();
}
