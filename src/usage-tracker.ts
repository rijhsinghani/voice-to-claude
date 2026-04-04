/**
 * Usage pattern tracker for the Slack bridge.
 *
 * Logs every intent classification to a local JSON file,
 * then generates weekly skill suggestions based on usage patterns.
 *
 * Log file: ./data/usage-log.json (relative to bridge directory)
 * Weekly digest: Sunday 9am via node-cron (optional, requires node-cron)
 */

import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import type { WebClient } from "@slack/web-api";
import type { IntentType } from "./intent-detector.js";
import { CLAUDE_CHANNEL } from "./types.js";

const logger = pino({ name: "usage-tracker" });

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_PATH = path.join(DATA_DIR, "usage-log.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageEntry {
  timestamp: string; // ISO 8601
  intentType: IntentType;
  repo: string;
  keywordsMatched: string[];
  /** true = handled directly (database query, vault, etc.); false = spawned Claude */
  directAction: boolean;
}

interface UsageLog {
  entries: UsageEntry[];
}

// ---------------------------------------------------------------------------
// Read / Write log (append-friendly)
// ---------------------------------------------------------------------------

function readLog(): UsageLog {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      return { entries: [] };
    }
    const raw = fs.readFileSync(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as UsageLog;
    if (!Array.isArray(parsed.entries)) {
      return { entries: [] };
    }
    return parsed;
  } catch {
    logger.warn("Failed to read usage log, starting fresh");
    return { entries: [] };
  }
}

function writeLog(log: UsageLog): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to write usage log");
  }
}

// ---------------------------------------------------------------------------
// trackUsage -- fire-and-forget from the router
// ---------------------------------------------------------------------------

const DIRECT_ACTION_INTENTS: Set<IntentType> = new Set([
  "delivery_query",
  "today_briefing",
  "vault_add",
  "pipeline_status",
]);

/**
 * Log a single usage event. Non-blocking: catches all errors internally.
 */
export function trackUsage(opts: {
  intentType: IntentType;
  repo: string;
  keywordsMatched?: string[];
}): void {
  try {
    const entry: UsageEntry = {
      timestamp: new Date().toISOString(),
      intentType: opts.intentType,
      repo: opts.repo,
      keywordsMatched: opts.keywordsMatched ?? [],
      directAction: DIRECT_ACTION_INTENTS.has(opts.intentType),
    };

    const log = readLog();
    log.entries.push(entry);

    // Retain last 90 days to keep the file manageable
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    log.entries = log.entries.filter(
      (e) => new Date(e.timestamp).getTime() > cutoff,
    );

    writeLog(log);
    logger.debug(
      { intentType: entry.intentType, repo: entry.repo },
      "Usage tracked",
    );
  } catch (err) {
    logger.warn({ err }, "trackUsage failed (non-blocking)");
  }
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

interface IntentCount {
  intent: IntentType;
  count: number;
}

interface RepoCount {
  repo: string;
  count: number;
}

function countBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function topN<T extends { count: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.count - a.count).slice(0, n);
}

// All known intents (to detect unused ones)
const ALL_INTENTS: IntentType[] = [
  "delivery_query",
  "ship",
  "today_briefing",
  "session_context",
  "vault_add",
  "pipeline_status",
  "publish_content",
  "passthrough",
];

// ---------------------------------------------------------------------------
// generateWeeklySuggestions
// ---------------------------------------------------------------------------

export interface WeeklySuggestion {
  category:
    | "top_intent"
    | "top_repo"
    | "repeated_workflow"
    | "unused_intent"
    | "new_skill";
  message: string;
}

/**
 * Analyze the last 7 days of usage data and generate actionable suggestions.
 */
export function generateWeeklySuggestions(): WeeklySuggestion[] {
  const log = readLog();
  const suggestions: WeeklySuggestion[] = [];

  // Filter to last 7 days
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentEntries = log.entries.filter(
    (e) => new Date(e.timestamp).getTime() > weekAgo,
  );

  if (recentEntries.length === 0) {
    suggestions.push({
      category: "top_intent",
      message: "No usage data in the last 7 days.",
    });
    return suggestions;
  }

  // Top intents
  const intentCounts = countBy(recentEntries, (e) => e.intentType);
  const intentRanked: IntentCount[] = [];
  for (const [intent, count] of intentCounts.entries()) {
    intentRanked.push({ intent: intent as IntentType, count });
  }
  const topIntents = topN(intentRanked, 3);
  for (const { intent, count } of topIntents) {
    if (intent !== "passthrough") {
      suggestions.push({
        category: "top_intent",
        message: `You used the *${intent}* intent ${count} time(s) this week.`,
      });
    }
  }

  // Top repos
  const repoCounts = countBy(recentEntries, (e) => e.repo);
  const repoRanked: RepoCount[] = [];
  for (const [repo, count] of repoCounts.entries()) {
    repoRanked.push({ repo, count });
  }
  const topRepos = topN(repoRanked, 3);
  for (const { repo, count } of topRepos) {
    suggestions.push({
      category: "top_repo",
      message: `\`${repo}\` was the target repo ${count} time(s) this week.`,
    });
  }

  // Passthrough analysis
  const passthroughs = recentEntries.filter(
    (e) => e.intentType === "passthrough",
  );
  if (passthroughs.length > 5) {
    suggestions.push({
      category: "repeated_workflow",
      message: `${passthroughs.length} passthrough messages this week. Consider creating dedicated intents for repeated patterns.`,
    });
  }

  // Unused intents in last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const monthEntries = log.entries.filter(
    (e) => new Date(e.timestamp).getTime() > thirtyDaysAgo,
  );
  const monthIntents = new Set(monthEntries.map((e) => e.intentType));
  const unusedIntents = ALL_INTENTS.filter(
    (i) => i !== "passthrough" && !monthIntents.has(i),
  );
  for (const unused of unusedIntents) {
    suggestions.push({
      category: "unused_intent",
      message: `The *${unused}* intent has not been used in 30 days. Consider removing or updating it.`,
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// formatWeeklyDigest
// ---------------------------------------------------------------------------

export function formatWeeklyDigest(suggestions: WeeklySuggestion[]): string {
  const lines: string[] = [];
  lines.push(":bar_chart: *Weekly Usage Digest*\n");

  const grouped: Record<string, string[]> = {
    top_intent: [],
    top_repo: [],
    repeated_workflow: [],
    unused_intent: [],
    new_skill: [],
  };

  for (const s of suggestions) {
    grouped[s.category].push(s.message);
  }

  if (grouped.top_intent.length > 0) {
    lines.push("*Top Intents*");
    for (const msg of grouped.top_intent) lines.push(`  ${msg}`);
    lines.push("");
  }

  if (grouped.top_repo.length > 0) {
    lines.push("*Top Repos*");
    for (const msg of grouped.top_repo) lines.push(`  ${msg}`);
    lines.push("");
  }

  if (grouped.repeated_workflow.length > 0) {
    lines.push("*Workflow Patterns*");
    for (const msg of grouped.repeated_workflow) lines.push(`  ${msg}`);
    lines.push("");
  }

  if (grouped.unused_intent.length > 0) {
    lines.push("*Unused Intents (30 days)*");
    for (const msg of grouped.unused_intent) lines.push(`  ${msg}`);
    lines.push("");
  }

  if (suggestions.length === 0) {
    lines.push("_No usage data to analyze._");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// registerWeeklyDigest -- cron job for Sunday 9am
// ---------------------------------------------------------------------------

/**
 * Register a weekly usage digest cron job.
 * Requires `node-cron` as an optional dependency.
 * If node-cron is not installed, this function is a no-op.
 */
export function registerWeeklyDigest(slackClient: WebClient): void {
  try {
    // Dynamic import so node-cron is optional
    import("node-cron")
      .then((cronModule) => {
        const cron = cronModule.default;
        const fireDigest = async () => {
          try {
            const suggestions = generateWeeklySuggestions();
            const message = formatWeeklyDigest(suggestions);
            await slackClient.chat.postMessage({
              channel: CLAUDE_CHANNEL,
              text: message,
            });
            logger.info(
              { suggestionCount: suggestions.length },
              "Weekly usage digest posted to Slack",
            );
          } catch (err) {
            logger.error({ err }, "Weekly usage digest failed");
          }
        };

        // Sunday at 9:00 AM (cron: minute hour * * day-of-week)
        cron.schedule("0 9 * * 0", fireDigest, {
          timezone: process.env.TZ ?? "America/New_York",
        });
        logger.info("Weekly usage digest registered - Sunday 9:00 AM");
      })
      .catch(() => {
        logger.info(
          "node-cron not installed - weekly digest cron disabled (usage tracking still works)",
        );
      });
  } catch {
    logger.info("node-cron not available - weekly digest cron disabled");
  }
}
