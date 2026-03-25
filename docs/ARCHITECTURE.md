# Architecture

## Component Overview

```
Slack (Socket Mode WebSocket)
        |
        v
 [bolt-app.ts]
  - Receives Slack messages
  - Handles button actions (Allow/Deny/Approve/Cancel)
  - Calls allowlistMiddleware (security.ts)
        |
        v
 [session-router.ts]
  - Detects target repo from message text
  - Looks up existing session for thread (registry)
  - Enqueues work via MessageQueue
        |
        v
 [session-manager.ts]
  - Spawns ephemeral `claude -p` process
  - Passes prompt via stdin
  - Collects stdout, returns text output
        |
        v
 `claude -p --session-id UUID` or `--resume UUID`
  (runs in repo directory, exits when done)
        |
        v
 [session-router.ts]
  - Posts output back to Slack thread
  - Updates session registry
```

## Hook Relay Flow

Claude Code can be configured to send HTTP hooks to the bridge. This enables interactive permission and plan approval flows from Slack.

```
Claude Code CLI (running via session-manager.ts)
        |
        | POST /hooks/permission
        | POST /hooks/notification
        | POST /hooks/plan-approval
        v
 [hook-relay.ts]  (Express on localhost:3847)
        |
        v
 [pending-store.ts]
  - Creates Promise for the decision
  - Sets 120s (permission) or 300s (plan) timeout
        |
        v
 Slack Block Kit message with buttons
        |
        | User taps Allow / Deny / Approve / Cancel
        v
 [bolt-app.ts] action handlers
  - Calls resolveDecision(hookId, behavior)
        |
        v
 [pending-store.ts]
  - Resolves Promise with {behavior: "allow"|"deny"}
        |
        v
 [hook-relay.ts]
  - Returns HTTP response to Claude Code
  - Claude proceeds or stops
```

## Session Lifecycle

### New message (first in thread)

1. Slack message arrives via Socket Mode
2. `bolt-app.ts` passes it to `routeMessage()`
3. `detectRepo()` parses prefix or uses default
4. New UUID assigned: `claudeSessionId = randomUUID()`
5. `spawnClaudeSession()` called with `--session-id UUID`
6. Prompt sent via stdin, stdout collected
7. Session registered: `registry.set(threadTs, { repo, claudeSessionId })`
8. Output posted to Slack thread

### Thread reply (follow-up message)

1. Slack message arrives with `thread_ts` matching existing session
2. `registry.get(threadTs)` returns the existing session entry
3. `spawnClaudeSession()` called with `--resume UUID`
4. Claude Code replays the JSONL transcript for full context
5. New turn processed, output posted to thread
6. `lastActivity` timestamp updated in registry

### Session expiry

Sessions older than 7 days are removed from the registry on startup via `cleanStale()`. The JSONL transcript on disk is permanent (Claude Code manages it). Only the thread-to-UUID mapping expires.

## Message Queue

Each Slack thread has its own FIFO queue (`MessageQueue` in `session-manager.ts`). This prevents concurrent `--resume` race conditions: if a user sends two messages quickly, the second waits for the first `claude -p` process to exit before starting.

Without this queue, two processes could write to the same session JSONL simultaneously, corrupting the transcript.

## State Persistence

Thread-to-session mappings are persisted to `sessions.json` (or `STATE_FILE` env var) on every mutation. On restart, the bridge loads this file and resumes from where it left off.

Format: array of `[threadTs, SessionEntry]` pairs:

```json
[
  [
    "1716000000.000100",
    {
      "repo": "my-project",
      "slackThread": "1716000000.000100",
      "claudeSessionId": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": 1716000000000,
      "lastActivity": 1716000010000
    }
  ]
]
```

## Security Model

- **Single-user allowlist:** Only `ALLOWED_SLACK_USER` can interact. All other users are silently blocked by `allowlistMiddleware`.
- **Localhost-only Express:** The hook relay binds to `127.0.0.1`, not `0.0.0.0`. No public HTTP surface.
- **Socket Mode:** No public URL needed. Slack connects via WebSocket to the bridge. No reverse proxy, no firewall rules.
- **No credentials in code:** All tokens are env vars. The plist template stores them in `EnvironmentVariables` (not in the codebase).

## JSONL Output Workaround

Claude Code CLI v2.1.83+ has a bug where `--output-format text` produces empty stdout even when the model responds. The bridge works around this by reading the session JSONL file from `~/.claude/projects/`.

When stdout is empty (and exit code is 0), `extractOutputFromJsonl()` scans the projects directory for a JSONL file matching the session UUID and extracts the last assistant text block.

## Claude Code Hook Configuration

To receive hooks, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:3847/hooks/permission -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:3847/hooks/notification -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:3847/hooks/plan-approval -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

The bridge auto-allows all PermissionRequest hooks from bridge-spawned sessions (safety enforced via system prompt). The plan-approval hook is the interactive one that posts buttons to Slack.
