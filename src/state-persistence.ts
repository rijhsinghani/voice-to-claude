import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import type { SessionEntry } from "./types.js";

const logger = pino({ name: "state-persistence" });

// State file path: defaults to sessions.json in the current working directory.
// Override with STATE_FILE env var to use a custom location.
export const STATE_FILE =
  process.env.STATE_FILE ?? join(process.cwd(), "sessions.json");

/** Max age for loaded sessions: 7 days in milliseconds.
 * The JSONL transcript on disk is permanent — this only protects the thread->UUID mapping.
 * 7 days means you can return to any thread within a week and Claude remembers context. */
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persist the session registry to disk.
 * Converts the Map to a JSON-serializable array of [key, value] pairs.
 * Best-effort: logs on error but never throws (persistence must not crash the bridge).
 *
 * Called on every mutation so restarts don't lose session mappings.
 */
export function saveState(registry: Map<string, SessionEntry>): void {
  try {
    const pairs: Array<[string, SessionEntry]> = Array.from(registry.entries());
    writeFileSync(STATE_FILE, JSON.stringify(pairs, null, 2), "utf8");
    logger.debug(
      { count: pairs.length, path: STATE_FILE },
      "Session state saved to disk",
    );
  } catch (err) {
    logger.error({ err, path: STATE_FILE }, "Failed to save session state");
    // Never throw — persistence is best-effort
  }
}

/**
 * Load the session registry from disk.
 * Filters out entries older than 7 days.
 * Returns an empty Map if the file doesn't exist or can't be parsed.
 */
export function loadState(): Map<string, SessionEntry> {
  if (!existsSync(STATE_FILE)) {
    logger.info(
      { path: STATE_FILE },
      "No session state file found — starting fresh",
    );
    return new Map();
  }

  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    const pairs: Array<[string, SessionEntry]> = JSON.parse(raw);

    if (!Array.isArray(pairs)) {
      logger.warn(
        { path: STATE_FILE },
        "Session state file has unexpected format — starting fresh",
      );
      return new Map();
    }

    const cutoff = Date.now() - MAX_SESSION_AGE_MS;
    const fresh = pairs.filter(([, entry]) => {
      if (!entry || typeof entry.lastActivity !== "number") return false;
      return entry.lastActivity >= cutoff;
    });

    const staleCount = pairs.length - fresh.length;
    if (staleCount > 0) {
      logger.info(
        { total: pairs.length, stale: staleCount, loaded: fresh.length },
        "Filtered stale sessions on load",
      );
    }

    logger.info(
      { count: fresh.length, path: STATE_FILE },
      "Session state loaded from disk",
    );

    return new Map(fresh);
  } catch (err) {
    logger.warn(
      { err, path: STATE_FILE },
      "Failed to load session state — starting fresh",
    );
    return new Map();
  }
}
