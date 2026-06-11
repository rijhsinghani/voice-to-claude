# Architecture

## Runtime Flow

```text
Slack Socket Mode
  -> bolt-app.ts
  -> allowlistMiddleware
  -> session-router.ts
  -> session-manager.ts
  -> Claude Code or Codex process
  -> Slack thread response
```

`src/index.ts` loads environment variables, starts the Slack Bolt app, mounts the
hook relay on `127.0.0.1`, and logs periodic health state.

## Slack Intake

`src/bolt-app.ts` is the event boundary. It handles:

- Slack action buttons for permission and plan decisions.
- Text messages in the configured channel.
- Audio files, which are downloaded from Slack and transcribed with Gemini when
  `GEMINI_API_KEY` is available.
- Video files, which are downloaded and matched to an idea thread, but do not
  yet call a video-ingest backend.

The allowlist middleware in `src/security.ts` blocks non-allowed users before
message handling continues.

## Routing And State

`src/session-router.ts` detects the target repository from `REPO_PATHS` prefixes
or falls back to `DEFAULT_REPO`. It maps each Slack thread to a session entry and
persists that mapping through `src/state-persistence.ts`.

Thread replies resume the same session. Output is cleaned and split into Slack
safe chunks before posting.

## Executors

`src/session-manager.ts` selects the executor from `AGENT_EXECUTOR`:

- `claude` runs `claude -p` with a fixed session id or resume id.
- `codex` runs `codex exec --cd <repo> --output-last-message <tmpfile> -`.

Both executor paths use the routed repository as the working directory and have
a 30-minute timeout. A per-thread FIFO queue prevents concurrent resume writes.

## Hook Relay

The hook relay is an Express server bound to `127.0.0.1`. Claude Code hooks post
permission, notification, and plan-approval payloads to the relay. The bridge
creates pending decisions, posts Slack buttons, and resolves the HTTP response
when Sameer chooses an action.

Codex-specific approval hooks are not implemented in this repo yet.
