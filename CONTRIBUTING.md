# Contributing

Thanks for helping improve Agent Maintainer Bridge.

## Good contribution areas

- Codex executor support.
- GitHub issue or pull request workflows.
- Safer plan and permission approval flows.
- Tests for routing, session persistence, and hook decisions.
- Documentation for public maintainer workflows.

## Public-safety rules

Do not commit:

- Slack tokens, app tokens, API keys, or session files.
- Real Slack channel IDs, user IDs, or private workspace names.
- Private repository paths or customer/project names.
- Client, family, finance, or proprietary operations data.
- Agent transcripts or logs from private repositories.

Use placeholders in examples.

## Local development

```bash
npm install
npm run typecheck
npm test
```

If a check fails because an external account or credential is missing, include
the exact reason in the pull request.

## Pull request expectations

- Keep changes focused.
- Add or update tests for behavior changes.
- Update docs when behavior or setup changes.
- Explain any security or deployment implications.
