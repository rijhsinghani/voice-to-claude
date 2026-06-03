# Agent Maintainer Bridge

Self-hosted Slack and mobile control plane for coding agents.

Agent Maintainer Bridge lets an open-source maintainer send a message or voice
memo from Slack, route it to the right local repository, run a coding-agent CLI,
and receive the result back in the same Slack thread. It keeps the operator in
control with local-only hook relays, allowlisted users, thread/session
continuity, and plan/permission approval flows.

The project started as a `voice-to-claude` bridge. The public direction is now
provider-neutral maintainer automation: Claude Code and Codex can both be used
as local executors, with Codex-oriented maintainer workflows as the next public
focus.

## Why maintainers use it

Maintainers do not always want another public webhook, dashboard, or hosted
queue. This bridge keeps the sensitive part local:

- Slack uses Socket Mode, so no public HTTP endpoint is required.
- The hook relay binds to `127.0.0.1`.
- Only an allowlisted Slack user can interact with the bridge.
- Each Slack thread maps to a coding-agent session so follow-up messages resume
  context.
- Approval buttons let the maintainer review plans or permission requests from
  a phone before the agent proceeds.

## Current capabilities

- Slack Socket Mode intake for text messages and voice memo attachments.
- Optional audio transcription via Gemini.
- Multi-repo routing by safe aliases.
- Per-thread session persistence.
- Per-thread FIFO queue to avoid concurrent resume races.
- Local hook relay for plan approval and permission decisions.
- Health endpoint for local monitoring.
- Claude Code executor.
- Codex executor via `codex exec`.

## Codex-oriented roadmap

The next public milestone is deeper Codex-compatible maintainer workflows:

- GitHub issue and PR triage prompts.
- PR-review and remediation workflows.
- Release-note and changelog generation.
- Security/dependency review before public releases.
- Example workflows that help maintainers operate agents without opening
  unauthenticated endpoints.

See [Codex for OSS application plan](docs/CODEX_FOR_OSS_APPLICATION.md) for the
public-safe application narrative and API-credit use case.

## Architecture

```text
Slack message or voice memo
        |
        v
Slack Socket Mode bridge
        |
        v
Repo router and session registry
        |
        v
Coding-agent executor
        |
        v
Slack thread response
```

Optional approval flow:

```text
Coding-agent hook
        |
        v
Local relay on 127.0.0.1
        |
        v
Slack approval buttons
        |
        v
Allow, deny, approve, modify, or cancel
```

## Quick start

```bash
git clone https://github.com/rijhsinghani/voice-to-claude.git
cd voice-to-claude
npm install
cp .env.example .env
```

Edit `.env` with your Slack app tokens, allowlisted Slack user, and repository
aliases. Then start the bridge:

```bash
npm start
```

Send a message in the configured Slack channel:

```text
my-project: review the failing tests and propose a fix
```

The bridge routes the message to `my-project`, starts or resumes the local
agent session for that Slack thread, and posts the response back to the thread.

## Prerequisites

- Node.js 20 or newer.
- A Slack app with Socket Mode enabled.
- A local coding-agent CLI. Claude Code and Codex are supported executors.
- Optional: Gemini API key for audio transcription.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`
and use placeholder-free local values.

| Variable | Required | Description |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | Slack bot token. |
| `SLACK_APP_TOKEN` | Yes | Slack app-level token for Socket Mode. |
| `CLAUDE_CHANNEL` | Yes | Slack channel ID for bridge intake. |
| `ALLOWED_SLACK_USER` | Yes | Slack user ID allowed to operate the bridge. |
| `DEFAULT_REPO` | Yes | Default repo alias or path. |
| `REPO_PATHS` | No | JSON map of repo alias to absolute local path. |
| `CLAUDE_SYSTEM_PROMPT` | No | Extra context for Claude Code sessions. |
| `AGENT_EXECUTOR` | No | `claude` or `codex`. Defaults to `claude`. |
| `CODEX_CLI` | No | Codex binary name or path. Defaults to `codex`. |
| `CODEX_SANDBOX` | No | Codex sandbox mode. Defaults to `workspace-write`. |
| `CODEX_APPROVAL_POLICY` | No | Codex approval policy. Defaults to `never`. |
| `HOOK_RELAY_PORT` | No | Local relay port. Defaults to `3847`. |
| `STATE_FILE` | No | Path for persisted thread/session mappings. |
| `GEMINI_API_KEY` | No | Required only for audio transcription. |

Example multi-repo configuration:

```env
DEFAULT_REPO=docs
REPO_PATHS={"docs":"/home/user/open-source/docs","api":"/home/user/open-source/api"}
```

## Maintainer workflows

Use this project for workflows where Slack is the lightweight control plane and
the coding agent remains local:

- Ask for a PR review from your phone.
- Triage an issue and draft an implementation plan.
- Generate release-note candidates from merged changes.
- Resume a long-running investigation in the same Slack thread.
- Require a plan approval before the agent edits files.

## Executor selection

Claude Code remains the default:

```env
AGENT_EXECUTOR=claude
```

To run Codex non-interactively:

```env
AGENT_EXECUTOR=codex
CODEX_SANDBOX=workspace-write
CODEX_APPROVAL_POLICY=never
```

The Codex executor calls `codex exec` in the routed repository and writes the
last agent message back to the Slack thread. Claude-specific hook relay
features remain available for Claude Code sessions; Codex-specific approval
hooks are future work.

## Security model

- No public webhooks are required.
- The hook relay binds to localhost.
- Slack access is restricted by `ALLOWED_SLACK_USER`.
- Tokens and paths are environment variables, not source-controlled values.
- Example files use placeholders only.

See [SECURITY.md](SECURITY.md) before running the bridge on real repositories.

## Development

```bash
npm run typecheck
npm test
```

The repo is intentionally small: a Slack intake layer, a router/session layer,
an executor layer, and a local hook relay.

## Contributing

Maintainer-focused improvements are welcome, especially:

- Codex executor support.
- Safer approval workflows.
- GitHub issue and PR integrations.
- Better examples for open-source maintainers.
- Tests around routing, security, and hook decisions.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
