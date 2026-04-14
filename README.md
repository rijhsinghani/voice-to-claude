# Voice to Claude

> **⏸ Status: deferred.** This project is on hold until the OpenClaw agents
> (Anisha for content, Ranveer for code) prove stable in production. When
> agent reliability is validated, this codebase resumes as the iPhone voice
> → Slack → Claude pipeline layer. Do not archive. Do not delete.
>
> Last active work: Phase 54 (content approval flow). Status as of
> 2026-04-14: dormant, no launchd service running, no active users.

Talk to Claude Code from your phone via Slack.

A self-hosted bridge that connects your iPhone voice memos (or any Slack message) to the Claude Code CLI running on your Mac. Speak a task, get a response in the Slack thread.

## Pipeline

```
iPhone Voice Memo
      |
      v
Supabase Edge Function (optional)
      |
      v
Slack #channel
      |
      v
Socket Mode Bridge (this repo)
      |
      v
Claude Code CLI (`claude -p`)
      |
      v
Reply in Slack Thread
```

The bridge listens to your Slack channel via Socket Mode WebSocket. No public URL needed. No ngrok. Runs 24/7 on your Mac under launchd.

## Features

- **Voice-to-text:** Send audio files to Slack and the bridge transcribes them via Gemini Flash before passing to Claude
- **Multi-repo support:** Route messages to different project directories by prefixing with repo name (e.g. `my-project: fix the auth bug`)
- **Session persistence:** Thread replies resume the same Claude conversation context via `--resume UUID`
- **Plan approval:** Claude's plan mode sends Slack buttons before executing. Approve, cancel, or request modifications.
- **Permission relay:** Claude hooks send Slack buttons for permission requests (can be auto-approved for trusted sessions)
- **Audio transcription:** m4a, mp3, wav, ogg, webm, aac, flac support via Gemini Flash
- **Health monitoring:** `/health` endpoint returns status, pending count, and uptime

## Quick Start

```bash
# 1. Clone
git clone https://github.com/rijhsinghani/voice-to-claude.git
cd voice-to-claude

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env with your Slack tokens and settings

# 4. Configure Claude Code hooks (see docs/SETUP.md for details)
# Add to ~/.claude/settings.json:
# {
#   "hooks": {
#     "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:3847/hooks/permission -H 'Content-Type: application/json' -d @-" }] }],
#     "Notification": [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:3847/hooks/notification -H 'Content-Type: application/json' -d @-" }] }]
#   }
# }

# 5. Start
npm start
```

Then send a message to your Slack channel and watch Claude respond in the thread.

## Prerequisites

- **Node.js >= 20** (check: `node --version`)
- **Claude Code CLI** installed: `npm install -g @anthropic-ai/claude-code` (requires Anthropic account or Claude Max subscription)
- **Slack app** with Socket Mode enabled (see [docs/SETUP.md](docs/SETUP.md))
- **macOS or Linux** (launchd for macOS auto-start, systemd for Linux)

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in your values.

| Variable               | Required | Description                                            |
| ---------------------- | -------- | ------------------------------------------------------ |
| `SLACK_BOT_TOKEN`      | Yes      | Slack bot token (`xoxb-...`)                           |
| `SLACK_APP_TOKEN`      | Yes      | Slack app-level token for Socket Mode (`xapp-...`)     |
| `CLAUDE_CHANNEL`       | Yes      | Slack channel ID where Claude listens                  |
| `ALLOWED_SLACK_USER`   | Yes      | Your Slack user ID (only this user can interact)       |
| `DEFAULT_REPO`         | Yes      | Default repo name for Claude sessions                  |
| `REPO_PATHS`           | No       | JSON map of `{"name": "/path"}` for multi-repo support |
| `CLAUDE_SYSTEM_PROMPT` | No       | Custom system prompt for Claude sessions               |
| `HOOK_RELAY_PORT`      | No       | Port for Claude Code hooks (default: `3847`)           |
| `STATE_FILE`           | No       | Path for session state file (default: `sessions.json`) |
| `GEMINI_API_KEY`       | No       | Google Gemini API key for audio transcription          |

### Single-repo setup

If you work on one project:

```env
DEFAULT_REPO=/path/to/my-project
```

### Multi-repo setup

If you want to route messages to different repos:

```env
REPO_PATHS={"my-app":"/path/to/my-app","api":"/path/to/api"}
DEFAULT_REPO=my-app
```

Send `api: fix the login endpoint` to route to the `api` repo.

## How It Works

### Components

**`src/bolt-app.ts`** - Slack Socket Mode connection. Receives messages, handles button actions (permission allow/deny, plan approve/cancel).

**`src/session-router.ts`** - Routes each Slack message to the right repo. New thread = new Claude session. Thread reply = resume existing session.

**`src/session-manager.ts`** - Spawns ephemeral `claude -p` processes. Each message is a separate process that exits when complete. Uses `--session-id` and `--resume` for conversation continuity.

**`src/hook-relay.ts`** - Express server on `localhost:3847`. Receives Claude Code hooks (permission requests, notifications, plan approvals) and relays them to Slack as interactive buttons.

**`src/pending-store.ts`** - Promise store for pending permission decisions. Each Slack button tap resolves the pending hook.

**`src/state-persistence.ts`** - Persists thread-to-session mappings to `sessions.json`. Survives restarts. 7-day TTL.

**`src/security.ts`** - Single-user allowlist middleware. Only `ALLOWED_SLACK_USER` can interact.

**`src/audio-transcriber.ts`** - Downloads Slack audio files and transcribes via Gemini Flash.

### Session lifecycle

1. User sends a message to Slack channel
2. Bridge receives it via Socket Mode WebSocket
3. New thread: assign UUID, spawn `claude -p --session-id UUID` in repo directory
4. Thread reply: look up UUID from state, spawn `claude -p --resume UUID`
5. Output posted back to Slack thread
6. Session entry persisted to disk

### Permission relay

Claude Code can be configured to send hook events to the bridge:

1. Claude wants to run a command that requires permission
2. Hook sends POST to `localhost:3847/hooks/permission`
3. Bridge posts Slack message with Allow/Deny/Always Allow buttons
4. User taps a button
5. Bridge resolves the pending hook promise with the decision
6. Claude proceeds or stops

### Plan approval

When Claude uses plan mode:

1. Claude finishes planning, ready to execute
2. ExitPlanMode hook fires, sends plan content to `localhost:3847/hooks/plan-approval`
3. Bridge posts plan to Slack with Approve/Modify/Cancel buttons
4. User reviews and decides
5. Claude executes or stops

## iPhone Shortcut

See [docs/IPHONE-SHORTCUT.md](docs/IPHONE-SHORTCUT.md) for instructions on setting up a voice-first workflow from your iPhone.

## macOS Auto-Start (launchd)

To run the bridge 24/7 and auto-restart on crash:

1. Copy and edit the template plist:

   ```bash
   cp com.example.voice-to-claude.plist ~/Library/LaunchAgents/com.yourdomain.voice-to-claude.plist
   # Edit the file: replace all /path/to/voice-to-claude and YOUR_USERNAME placeholders
   # Set your Slack tokens in EnvironmentVariables (do NOT use .env with launchd)
   ```

2. Load the service:

   ```bash
   launchctl load ~/Library/LaunchAgents/com.yourdomain.voice-to-claude.plist
   ```

3. Check it's running:

   ```bash
   curl http://127.0.0.1:3847/health
   # {"status":"ok","pending":0,"uptime":42.1}
   ```

4. View logs:
   ```bash
   tail -f /tmp/voice-to-claude.log
   ```

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component diagrams and flow documentation.

## Contributing

Pull requests welcome. Please keep personal configs out of code.

## License

MIT
