# Overview

Agent Maintainer Bridge is a self-hosted Slack and mobile control plane for
maintainer coding-agent workflows. The repo was originally named
`voice-to-claude`, but the public direction is provider-neutral: Slack routes
messages or voice memos to local repositories, then runs either Claude Code or
Codex as the local executor.

## Core Jobs

- Receive Slack text messages and file shares through Socket Mode.
- Restrict operation to a single allowlisted Slack user.
- Detect the target repository from a message prefix or default route.
- Preserve thread-to-agent session continuity.
- Queue messages per thread so resume operations do not race.
- Run local coding-agent CLIs and post output back to the Slack thread.
- Relay Claude Code plan and permission decisions through localhost-only Slack
  approval buttons.

## Repository Shape

- `src/index.ts` starts the Bolt app and localhost hook relay.
- `src/bolt-app.ts` receives Slack events, transcribes audio, handles approval
  buttons, and routes messages.
- `src/session-router.ts` owns repo detection, thread registry, output chunking,
  and Slack posting.
- `src/session-manager.ts` spawns Claude Code or Codex and enforces per-thread
  queueing.
- `src/hook-relay.ts`, `src/pending-store.ts`, and `src/slack-ui.ts` implement
  approval relay flows.
- `src/security.ts` enforces the Slack allowlist.
- `docs/` contains setup, architecture, iPhone shortcut, and public OSS
  application notes.

## Known Boundaries

Codex execution works through `codex exec`, but Codex-specific approval hooks are
future work. Video file handling currently downloads and associates a video with
an idea thread, then stops before the future ingest step.
