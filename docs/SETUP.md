# Setup Guide

## Prerequisites

Before starting, ensure you have:

- Node.js >= 20: `node --version`
- npm >= 8: `npm --version`
- Claude Code CLI: `claude --version` (install: `npm install -g @anthropic-ai/claude-code`)
- A Slack workspace where you have admin access (or can install apps)

## Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**
3. Name it (e.g. "Voice to Claude") and select your workspace
4. Click **Create App**

### Enable Socket Mode

1. In the sidebar, click **Socket Mode**
2. Toggle **Enable Socket Mode** to On
3. You will be prompted to create an App-Level Token
4. Name it (e.g. "socket-token"), add the scope `connections:write`
5. Click **Generate**
6. Copy the `xapp-...` token. This is your `SLACK_APP_TOKEN`.

### Add Bot Scopes

1. In the sidebar, go to **OAuth & Permissions**
2. Under **Scopes -> Bot Token Scopes**, add:
   - `chat:write` - post messages
   - `channels:history` - read channel history (for thread context)
   - `channels:read` - list channels
   - `files:read` - download audio files for transcription
   - `reactions:write` - add emoji reactions to acknowledge messages

### Enable Event Subscriptions

1. In the sidebar, go to **Event Subscriptions**
2. Toggle **Enable Events** to On
3. Socket Mode apps don't need a Request URL (it will show "Connected via Socket Mode")
4. Under **Subscribe to bot events**, add:
   - `message.channels` - receive messages in channels the bot is in

### Enable Interactivity (for button actions)

1. In the sidebar, go to **Interactivity & Shortcuts**
2. Toggle **Interactivity** to On
3. For the Request URL, enter any valid URL (Socket Mode intercepts this, but a URL is required by Slack's UI): `https://example.com/slack/events`

### Install the App

1. In the sidebar, go to **Install App**
2. Click **Install to Workspace** and authorize
3. Copy the `xoxb-...` token. This is your `SLACK_BOT_TOKEN`.

## Step 2: Get Your Channel and User IDs

### Channel ID

1. In Slack, right-click the channel name you want Claude to listen in
2. Click **View channel details**
3. Scroll to the bottom to find the **Channel ID** (starts with `C`)
4. Copy it. This is your `CLAUDE_CHANNEL`.

### User ID

1. In Slack, click your profile picture in the top right
2. Click **Profile**
3. Click the three dots (**...**) menu
4. Click **Copy member ID**
5. It starts with `U`. This is your `ALLOWED_SLACK_USER`.

### Invite the Bot to Your Channel

In Slack, open the channel and type: `/invite @YourBotName`

## Step 3: Configure the Bridge

```bash
cd voice-to-claude
cp .env.example .env
```

Edit `.env`:

```env
SLACK_BOT_TOKEN=xoxb-your-actual-token
SLACK_APP_TOKEN=xapp-your-actual-token
CLAUDE_CHANNEL=C1234567890
ALLOWED_SLACK_USER=U1234567890
DEFAULT_REPO=my-project
REPO_PATHS={"my-project":"/home/user/my-project"}
```

## Step 4: Configure Claude Code Hooks (Optional but Recommended)

To enable interactive plan approval and permission relay from Slack:

Edit (or create) `~/.claude/settings.json`:

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

## Step 5: First Run

```bash
npm start
```

You should see:

```
{"level":30,"name":"voice-to-claude","msg":"Voice to Claude bridge started — Socket Mode active"}
{"level":30,"name":"hook-relay","msg":"Hook relay server listening on 127.0.0.1","port":3847}
```

### Test the bridge

Send a message in your Slack channel: `hello, are you there?`

Claude should reply in the thread within a few seconds.

### Test the health endpoint

```bash
curl http://127.0.0.1:3847/health
# {"status":"ok","pending":0,"uptime":15.3}
```

## Troubleshooting

### "ALLOWED_SLACK_USER environment variable is required"

Your `.env` is missing `ALLOWED_SLACK_USER`. Set it to your Slack user ID (starts with `U`).

### "An API error occurred: not_authed"

Your `SLACK_BOT_TOKEN` is incorrect or missing the `xoxb-` prefix. Make sure you're using the Bot User OAuth Token, not a legacy token.

### "SocketModeReceiver could not connect"

- Check that Socket Mode is enabled in your Slack app settings
- Verify `SLACK_APP_TOKEN` starts with `xapp-` (not `xoxb-`)
- Verify the token was generated with the `connections:write` scope

### "Unknown repo: X. Valid repos: ..."

`REPO_PATHS` doesn't contain a path for repo `X`. Either:

- Add it: `REPO_PATHS={"X":"/path/to/X"}`
- Or use the default repo by not prefixing the message

### Claude doesn't respond

1. Check bridge logs: `tail -f /tmp/voice-to-claude.log`
2. Verify the bot is invited to the channel: `/invite @YourBotName`
3. Verify `CLAUDE_CHANNEL` matches the channel where you're sending messages
4. Check that `claude` CLI is in PATH: `which claude`

### No output from Claude (empty response)

This is a known Claude Code CLI bug (v2.1.83+) where `--output-format text` produces empty stdout. The bridge has a built-in JSONL fallback. If you're seeing empty responses:

1. Check that `HOME` is set correctly in your environment
2. Check that `~/.claude/projects/` exists and contains JSONL files

### Audio transcription not working

1. Verify `GEMINI_API_KEY` is set in `.env`
2. Check that your Gemini API key is valid (test at [aistudio.google.com](https://aistudio.google.com))
3. Check bridge logs for transcription errors

## macOS Auto-Start with launchd

See [README.md](../README.md#macos-auto-start-launchd) for instructions.

Key notes for launchd:

- Set all environment variables in the plist `EnvironmentVariables` dict, NOT in `.env`
- `launchd` does not source your shell profile, so you must set `PATH` explicitly
- Run `which node` and `which claude` to get the full paths for your plist
- After editing the plist: `launchctl unload ~/Library/LaunchAgents/com.yourdomain.voice-to-claude.plist && launchctl load ~/Library/LaunchAgents/com.yourdomain.voice-to-claude.plist`
