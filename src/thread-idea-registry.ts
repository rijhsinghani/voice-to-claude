import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";

const logger = pino({ name: "thread-idea-registry" });

/** Represents a thread-to-idea mapping stored in thread-ideas.json */
interface ThreadIdeaEntry {
  ideaId: string;
  threadTs: string;
  status: "scripted" | "uploaded" | "published";
  createdAt: number;
}

// Thread ideas file path: defaults to thread-ideas.json in the current working directory.
// Override with THREAD_IDEAS_FILE env var to use a custom location.
export const THREAD_IDEAS_FILE =
  process.env.THREAD_IDEAS_FILE ?? join(process.cwd(), "thread-ideas.json");

/** Max age for loaded thread-idea entries: 30 days in milliseconds.
 * Ideas stay relevant longer than sessions — 30 days ensures you can return
 * to a thread well after recording and still have the idea linked. */
const MAX_IDEA_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Load the thread-idea registry from disk.
 * Filters out entries older than 30 days.
 * Returns an empty Map if the file doesn't exist or can't be parsed.
 */
function loadThreadIdeas(): Map<string, ThreadIdeaEntry> {
  if (!existsSync(THREAD_IDEAS_FILE)) {
    logger.info(
      { path: THREAD_IDEAS_FILE },
      "No thread-idea registry file found — starting fresh",
    );
    return new Map();
  }

  try {
    const raw = readFileSync(THREAD_IDEAS_FILE, "utf8");
    const pairs: Array<[string, ThreadIdeaEntry]> = JSON.parse(raw);

    if (!Array.isArray(pairs)) {
      logger.warn(
        { path: THREAD_IDEAS_FILE },
        "Thread-idea registry file has unexpected format — starting fresh",
      );
      return new Map();
    }

    const cutoff = Date.now() - MAX_IDEA_AGE_MS;
    const fresh = pairs.filter(([, entry]) => {
      if (!entry || typeof entry.createdAt !== "number") return false;
      return entry.createdAt >= cutoff;
    });

    const staleCount = pairs.length - fresh.length;
    if (staleCount > 0) {
      logger.info(
        { total: pairs.length, stale: staleCount, loaded: fresh.length },
        "Filtered stale thread-idea entries on load",
      );
    }

    logger.info(
      { count: fresh.length, path: THREAD_IDEAS_FILE },
      "Thread-idea registry loaded from disk",
    );

    return new Map(fresh);
  } catch (err) {
    logger.warn(
      { err, path: THREAD_IDEAS_FILE },
      "Failed to load thread-idea registry — starting fresh",
    );
    return new Map();
  }
}

/**
 * Persist the thread-idea registry to disk.
 * Converts the Map to a JSON-serializable array of [key, value] pairs.
 * Best-effort: logs on error but never throws (persistence must not crash the bridge).
 *
 * Called on every mutation so restarts don't lose thread-to-idea mappings.
 */
function saveThreadIdeas(map: Map<string, ThreadIdeaEntry>): void {
  try {
    const pairs: Array<[string, ThreadIdeaEntry]> = Array.from(map.entries());
    writeFileSync(THREAD_IDEAS_FILE, JSON.stringify(pairs, null, 2), "utf8");
    logger.debug(
      { count: pairs.length, path: THREAD_IDEAS_FILE },
      "Thread-idea registry saved to disk",
    );
  } catch (err) {
    logger.error(
      { err, path: THREAD_IDEAS_FILE },
      "Failed to save thread-idea registry",
    );
    // Never throw — persistence is best-effort
  }
}

// Module-level in-memory registry, loaded from disk at module init
let registry: Map<string, ThreadIdeaEntry> = loadThreadIdeas();

/**
 * Register an idea for a Slack thread.
 * Persists to disk immediately so the mapping survives bridge restarts.
 *
 * @param threadTs - Slack thread timestamp (ts of the parent message)
 * @param ideaId - UUID of the idea in the content engine database
 * @param status - Current idea status (default: "scripted")
 */
export function registerIdeaForThread(
  threadTs: string,
  ideaId: string,
  status: ThreadIdeaEntry["status"] = "scripted",
): void {
  registry.set(threadTs, { ideaId, threadTs, status, createdAt: Date.now() });
  saveThreadIdeas(registry);
}

/**
 * Look up the idea ID registered for a Slack thread.
 * Returns undefined if no idea is linked to this thread.
 *
 * @param threadTs - Slack thread timestamp to look up
 */
export function getIdeaForThread(threadTs: string): string | undefined {
  return registry.get(threadTs)?.ideaId;
}

/**
 * Update the status of an existing thread-idea entry.
 * No-op if the thread has no registered idea.
 *
 * @param threadTs - Slack thread timestamp
 * @param status - New status to set
 */
export function updateThreadIdeaStatus(
  threadTs: string,
  status: ThreadIdeaEntry["status"],
): void {
  const entry = registry.get(threadTs);
  if (entry) {
    registry.set(threadTs, { ...entry, status });
    saveThreadIdeas(registry);
  }
}

/**
 * Remove the idea registration for a Slack thread.
 * Persists to disk immediately.
 *
 * @param threadTs - Slack thread timestamp to deregister
 */
export function removeIdeaForThread(threadTs: string): void {
  registry.delete(threadTs);
  saveThreadIdeas(registry);
}
