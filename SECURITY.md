# Security

Agent Maintainer Bridge is designed for local, self-hosted maintainer workflows.
It can operate coding-agent CLIs against local repositories, so treat it as
sensitive infrastructure.

## Supported use

- Run the bridge only on machines and repositories you control.
- Keep the hook relay bound to `127.0.0.1`.
- Use Slack Socket Mode instead of exposing public HTTP endpoints.
- Restrict access with `ALLOWED_SLACK_USER`.
- Store tokens in environment variables or local secret managers.

## Do not publish

- Slack tokens or app tokens.
- API keys.
- Real Slack channel IDs or user IDs.
- Private repository paths.
- Session state files.
- Agent transcripts or command logs from private repositories.

## Reporting issues

Open a GitHub issue for non-sensitive security hardening ideas.

For sensitive reports, do not include secrets or exploit details in a public
issue. Contact the maintainer privately with a minimal description and a safe
way to reproduce the issue.

## Known boundaries

- The current executor implementations support Claude Code and Codex.
- Claude Code hook relay support is implemented; Codex-specific approval hooks
  are future work.
- The bridge should not be connected to repositories or systems the operator is
  not authorized to administer.
