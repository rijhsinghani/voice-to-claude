# Runtime Reference

## Required Environment

The README and `src/types.ts` define these required variables:

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `CLAUDE_CHANNEL`
- `ALLOWED_SLACK_USER`
- `DEFAULT_REPO`

`REPO_PATHS` is optional but important for multi-repo routing. It is a JSON map
from repo alias to absolute local path. When no explicit prefix matches a Slack
message, the bridge falls back to `DEFAULT_REPO`.

## Optional Environment

- `AGENT_EXECUTOR`: `claude` or `codex`; defaults to `claude`.
- `CODEX_CLI`: Codex binary name or path; defaults to `codex`.
- `CODEX_SANDBOX`: Codex sandbox mode; defaults to `workspace-write`.
- `CODEX_APPROVAL_POLICY`: Codex approval policy; defaults to `never`.
- `CLAUDE_SYSTEM_PROMPT`: custom prompt for Claude Code sessions.
- `HOOK_RELAY_PORT`: localhost relay port; defaults to `3847`.
- `STATE_FILE`: alternate state persistence path.
- `GEMINI_API_KEY`: enables audio transcription.
- `CONTENT_APPROVAL_CHANNEL`: currently optional and used by unfinished content
  approval work.

## Local Services

- Slack intake uses Socket Mode, so no public request URL is required.
- The hook relay binds to `127.0.0.1`.
- Health is available through the relay process as documented in `docs/SETUP.md`.
- Launchd operation is described by `com.example.voice-to-claude.plist`, but the
  file is a template and must stay placeholder-only in git.

## Operational Boundaries

- Audio transcription uses Gemini and should be treated as optional.
- Codex executor support is present through `codex exec`.
- Claude Code hook approvals are implemented.
- Codex-specific approval hooks and video ingest are not implemented yet.
