# Agents

## Working Rules

- Keep installed-wiki refreshes docs-only unless Sameer explicitly asks for code
  changes.
- Do not run Droid, Factory CLI, Claude CLI, paid model CLIs, or vendor-backed
  wiki generators for wiki updates.
- Do not commit Slack tokens, app tokens, API keys, real channel IDs, real user
  IDs, private repo paths, session files, transcripts, or command logs.
- Keep the bridge local-first: Socket Mode for Slack intake and `127.0.0.1` for
  the hook relay.
- Preserve the single-user allowlist model unless a separate security design is
  approved.

## Before Editing

1. Run `git status --short --branch`.
2. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`, `SECURITY.md`, and
   `package.json`.
3. Check for `.github/workflows/`; none exists in this checkout at this pass.
4. If runtime code is dirty from another active task, skip docs edits and report
   the reason.

## Implementation Notes

- `src/bolt-app.ts` is the Slack event boundary.
- `src/session-router.ts` owns repo detection and Slack thread continuity.
- `src/session-manager.ts` owns Claude and Codex process spawning.
- `src/hook-relay.ts` is localhost-only and supports Claude Code hooks.
- `src/security.ts` is the allowlist gate.

Run `npm run typecheck` and `npm test` for code changes. For docs-only wiki
refreshes, `git diff --check` is the required verification.
