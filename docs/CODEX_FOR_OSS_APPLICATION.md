# Codex for OSS application plan

This document keeps the OpenAI Codex for OSS application story public-safe and
truthful.

## Application repository

Primary repository:

- `https://github.com/rijhsinghani/voice-to-claude`

Public positioning:

- Owned public bridge for open-source maintainer automation.
- Provider-neutral direction, with Claude Code and Codex executor paths.
- OpenClaw, Hermes, and issue-worker projects are ecosystem context and design
  influence, not a substitute for maintainer authority on upstream repos.

## Maintainer role

Sameer is the owner and maintainer of this repository. Application language
should claim maintainer authority for this repo only unless separate upstream
maintainer permissions are verified.

Do not claim primary or core maintainer status for upstream OpenClaw, Hermes, or
agent-worker repositories unless that authority is visible or otherwise
verifiable.

## Repository qualification narrative

Agent Maintainer Bridge is a public self-hosted control plane for maintainers
who want to operate coding agents from Slack or mobile workflows without opening
public endpoints. It routes messages to local repositories, preserves thread
context across sessions, relays approval decisions back to the agent, and posts
results where the maintainer is already collaborating.

The project addresses a recurring maintainer problem: coding agents are most
useful when they can review pull requests, triage issues, draft release notes,
and investigate failures, but many maintainers still need local control,
approval gates, and a mobile-friendly way to supervise work. This bridge turns a
Slack thread into the control plane while keeping repository access local.

## API credit use case

Requested API credits would be used for public open-source maintainer workflows:

- Codex-assisted pull request review.
- GitHub issue triage and implementation-plan drafting.
- Release-note and changelog generation.
- Security and dependency review before releases.
- Maintaining and testing Codex executor support.
- Public examples that show maintainers how to run agent workflows safely.

Credits should not be used for private client work, studio operations, family
finance workflows, or non-public business automation.

## Requested benefits

Recommended request:

- API credits for maintainer automation workflows.
- ChatGPT Pro with Codex for day-to-day OSS coding, triage, review, and docs.
- Codex Security only after the public repo is ready for security review and
  authorization is unambiguous.

## Public proof checklist

Before submitting the application, confirm:

- README positions the repo as maintainer automation.
- SECURITY and CONTRIBUTING docs exist.
- Example configuration contains placeholders only.
- No private Slack IDs, tokens, repo paths, client names, family finance
  details, or proprietary operations are present in public docs.
- Tests and type checks pass, or any failure is documented.
- A public PR or release demonstrates active maintenance.

## Application draft

### Why does this repository qualify?

I maintain Agent Maintainer Bridge, a public self-hosted bridge for open-source
maintainers who want to operate coding agents from Slack and mobile workflows
while keeping repository access local. The project supports maintainer workflows
such as issue triage, PR review, release-note drafting, and approval-gated agent
execution from the same Slack thread where collaboration already happens.

The project is intentionally focused on safe maintainer automation: Socket Mode
avoids public webhooks, the hook relay binds to localhost, access is allowlisted,
and approval flows let maintainers review plans or decisions before an agent
continues. The current implementation supports Claude Code and Codex executor
paths; the next public milestone is Codex-powered review/triage examples.

### How will API credits be used?

API credits will be used only for public open-source maintainer workflows:
Codex-assisted PR review, issue triage, release notes, dependency/security
review, and maintaining Codex executor examples for this bridge. The goal is to
make it easier for maintainers to run useful coding-agent workflows without
exposing unauthenticated endpoints or private repositories.

### What should stay out of the application?

Do not include confidential details, private repository names that are not part
of the public application, client data, family finance context, Slack IDs,
production paths, secrets, or private run logs.
