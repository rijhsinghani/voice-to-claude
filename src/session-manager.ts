import { spawn } from "child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";

const logger = pino({ name: "session-manager" });

export const MAX_CONCURRENT_SESSIONS = 3;

// DEFAULT_REPO: The repo name to use when no explicit repo is detected in the message.
// Must be a key in REPO_PATHS.
export const DEFAULT_REPO = process.env.DEFAULT_REPO ?? "";

// REPO_PATHS: Map of repo name -> absolute path on disk.
// Loaded from REPO_PATHS env var (JSON format) or falls back to empty map.
//
// Example .env entry:
//   REPO_PATHS={"my-project":"/home/user/my-project","api":"/home/user/api"}
//
// If REPO_PATHS is not set, only the DEFAULT_REPO path (from DEFAULT_REPO env var) is used.
function loadRepoPaths(): Record<string, string> {
  const raw = process.env.REPO_PATHS;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      logger.warn({ raw }, "REPO_PATHS is not valid JSON — using empty map");
    }
  }

  // Fallback: build a single-repo map from DEFAULT_REPO if it looks like an absolute path
  if (DEFAULT_REPO && DEFAULT_REPO.startsWith("/")) {
    const repoName = DEFAULT_REPO.split("/").pop() ?? "default";
    return { [repoName]: DEFAULT_REPO };
  }

  return {};
}

export const REPO_PATHS: Record<string, string> = loadRepoPaths();

// Default system prompt for Claude sessions.
// Override with CLAUDE_SYSTEM_PROMPT env var to customize for your use case.
const DEFAULT_SYSTEM_PROMPT =
  "You are an AI assistant running via the Slack bridge. " +
  "You have access to ALL tools: Bash, Read, Edit, Write, Glob, Grep, WebSearch, WebFetch. " +
  "You have CLI access: git, gh, node, python. " +
  "All permissions are pre-approved — execute commands without asking. " +
  "Keep responses concise for Slack readability. Use markdown formatting.";

const SYSTEM_PROMPT = process.env.CLAUDE_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

/**
 * Spawn an ephemeral `claude -p` process for a single message turn.
 *
 * For the first message in a thread: uses `--session-id UUID` to assign a
 * known session ID so future messages can `--resume` it.
 * For follow-up messages: uses `--resume UUID` to replay the JSONL transcript
 * and retain full conversation context.
 *
 * Output is clean text (no ANSI codes, no TUI noise) — posted directly to Slack.
 * Process exit = turn complete. No debounce, no liveness polling, no tmux.
 *
 * Uses `spawn` (not `execSync`) so the Node.js event loop stays responsive
 * while Claude runs. A 30-minute timeout kills the process if it hangs.
 */
export async function spawnClaudeSession(opts: {
  prompt: string;
  repo: string;
  claudeSessionId: string;
  isResume: boolean;
  /** Optional comma-prefixed extra tools to add (e.g. ",Skill,Agent") */
  extraAllowedTools?: string;
  /** Called every 5 min with elapsed seconds so the caller can post progress pings */
  onPing?: (elapsedSec: number) => void;
}): Promise<{ output: string; exitCode: number }> {
  const { prompt, repo, claudeSessionId, isResume, extraAllowedTools } = opts;
  const repoPath = REPO_PATHS[repo];

  if (!repoPath) {
    throw new Error(
      `Unknown repo: ${repo}. Valid repos: ${Object.keys(REPO_PATHS).join(", ")}`,
    );
  }

  // Build claude args
  const args: string[] = ["-p", "--output-format", "text"];

  if (isResume) {
    args.push("--resume", claudeSessionId);
  } else {
    args.push("--session-id", claudeSessionId);
  }

  // Bypass mode: auto-approves ALL permissions so Slack users don't get
  // button prompts for every command. Safety via system prompt constraints.
  args.push("--permission-mode", "bypassPermissions");

  // System prompt: tell Claude about available tools and context
  args.push("--system-prompt", SYSTEM_PROMPT);

  // Pre-approve ALL tools so Claude has full resources at its disposal
  // NOTE: --allowedTools is variadic — prompt MUST go via stdin, not positional arg
  const baseTools = [
    "Bash",
    "Read",
    "Edit",
    "Write",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "Skill",
    "Agent",
    "LSP",
    "NotebookEdit",
  ];
  if (extraAllowedTools) {
    baseTools.push(...extraAllowedTools.split(",").filter(Boolean));
  }
  args.push("--allowedTools", ...baseTools);

  logger.info(
    {
      repo,
      repoPath,
      claudeSessionId,
      isResume,
      argsPreview: args.slice(0, 6).join(" "),
    },
    "Spawning ephemeral claude -p process",
  );

  return new Promise((resolve, reject) => {
    // Delete ANTHROPIC_API_KEY so Claude uses Max subscription OAuth (not API key)
    // Empty string = "invalid key" error. Must be fully absent.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    // Pipe prompt via stdin (--allowedTools is variadic, so positional arg gets consumed)
    const child = spawn("claude", args, {
      cwd: repoPath,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write prompt to stdin and close it
    child.stdin.write(prompt);
    child.stdin.end();

    // Progress pings — only fire after 5 min so short tasks stay silent
    const startTime = Date.now();
    const PING_INTERVAL_MS = 300_000;
    const pingInterval = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      opts.onPing?.(elapsedSec);
    }, PING_INTERVAL_MS);

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    // 30-minute safety timeout — kill with SIGTERM if Claude hangs
    // Real coding work can take 10-20 min; 30 min is a safe ceiling
    const TIMEOUT_MS = 30 * 60 * 1000;
    const timeout = setTimeout(() => {
      clearInterval(pingInterval);
      logger.warn(
        { claudeSessionId, repo },
        "claude -p process exceeded 30-minute timeout — killing",
      );
      child.kill("SIGTERM");
      reject(
        new Error(
          `Claude process timed out after 30 minutes (session: ${claudeSessionId})`,
        ),
      );
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearInterval(pingInterval);
      clearTimeout(timeout);
      logger.error({ err, claudeSessionId }, "Failed to spawn claude process");
      reject(err);
    });

    child.on("close", (code) => {
      clearInterval(pingInterval);
      clearTimeout(timeout);

      const exitCode = code ?? 1;

      if (stderrBuffer.trim()) {
        logger.debug(
          { claudeSessionId, stderr: stderrBuffer.slice(0, 500) },
          "claude stderr output",
        );
      }

      // Workaround: Claude Code v2.1.83+ bug — --output-format text produces
      // empty stdout even when the model responds. Read from session JSONL instead.
      let output = stdoutBuffer;
      if (output.trim().length === 0 && exitCode === 0) {
        try {
          output = extractOutputFromJsonl(claudeSessionId);
          if (output) {
            logger.info(
              {
                claudeSessionId,
                method: "jsonl-fallback",
                outputLength: output.length,
              },
              "Recovered output from session JSONL (stdout was empty)",
            );
          }
        } catch (jsonlErr) {
          logger.warn({ jsonlErr, claudeSessionId }, "JSONL fallback failed");
        }
      }

      logger.info(
        { claudeSessionId, exitCode, outputLength: output.length },
        "claude -p process exited",
      );

      resolve({ output, exitCode });
    });
  });
}

// ---------------------------------------------------------------------------
// JSONL output extraction (workaround for CLI v2.1.83+ empty stdout bug)
// ---------------------------------------------------------------------------

/**
 * Read the session JSONL file and extract all assistant text responses.
 * Claude Code stores session transcripts as JSONL in ~/.claude/projects/.
 * Each assistant turn is a JSON line with type:"assistant" containing the
 * full model response including text blocks and tool_use blocks.
 */
function extractOutputFromJsonl(sessionId: string): string {
  const projectsDir = join(process.env.HOME ?? "", ".claude", "projects");

  // Find the JSONL file by scanning project directories
  let jsonlPath = "";
  try {
    const dirs = readdirSync(projectsDir);
    for (const dir of dirs) {
      const candidate = join(projectsDir, dir, `${sessionId}.jsonl`);
      try {
        readFileSync(candidate, "utf-8"); // existence check
        jsonlPath = candidate;
        break;
      } catch {
        // not in this dir
      }
    }
  } catch {
    return "";
  }

  if (!jsonlPath) return "";

  const content = readFileSync(jsonlPath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  // Extract text from all assistant messages (last one is the final response)
  const textParts: string[] = [];
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      if (j.type !== "assistant") continue;
      const msg = j.message ?? j;
      const contentBlocks = msg.content ?? [];
      for (const block of contentBlocks) {
        if (block.type === "text" && block.text) {
          textParts.push(block.text.trim());
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  // Return the LAST assistant text (most recent response)
  return textParts.length > 0 ? textParts[textParts.length - 1] : "";
}

// ---------------------------------------------------------------------------
// MessageQueue — prevents concurrent --resume race conditions
// ---------------------------------------------------------------------------

/**
 * Per-thread FIFO message queue.
 *
 * Ensures that if a user sends two messages quickly in the same thread,
 * the second `claude -p --resume` waits until the first process exits before
 * starting. This prevents two processes from writing to the same session JSONL
 * simultaneously, which would corrupt the transcript.
 */
class MessageQueue {
  private queues: Map<
    string,
    Array<{
      task: () => Promise<string>;
      resolve: (v: string) => void;
      reject: (e: unknown) => void;
    }>
  > = new Map();
  private running: Set<string> = new Set();

  async enqueue(
    threadTs: string,
    task: () => Promise<string>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(threadTs) ?? [];
      queue.push({ task, resolve, reject });
      this.queues.set(threadTs, queue);

      if (!this.running.has(threadTs)) {
        this.drain(threadTs);
      }
    });
  }

  private async drain(threadTs: string): Promise<void> {
    const queue = this.queues.get(threadTs);
    if (!queue || queue.length === 0) {
      this.running.delete(threadTs);
      this.queues.delete(threadTs);
      return;
    }

    this.running.add(threadTs);
    const { task, resolve, reject } = queue.shift()!;

    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      // Process next item in queue
      this.drain(threadTs);
    }
  }
}

/** Singleton message queue — one instance shared across all route calls */
export const messageQueue = new MessageQueue();

// ---------------------------------------------------------------------------
// killProcess — cleanup utility for tracked PIDs
// ---------------------------------------------------------------------------

/**
 * Send SIGTERM to a process by PID.
 * Silently ignores errors (process may already be dead).
 */
export function killProcess(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already dead or PID not found — not an error
  }
}
