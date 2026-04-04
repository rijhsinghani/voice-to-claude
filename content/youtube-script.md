# I Built a Voice-Controlled AI Developer That Runs 24/7

**Channel:** Sameer Automations (@SameerAutomates)
**Format:** Long-form YouTube (12-15 min)
**Pillar:** Behind-the-scenes build / AI tools in practice

---

## Timestamps

```
0:00 - The problem with Claude Code
1:15 - What I actually built
2:30 - Live demo: voice to working code
4:45 - Architecture walkthrough
7:30 - The hook relay (approval from your phone)
9:00 - Why not Claude Desktop / Web / Remote MCP?
10:30 - Running it 24/7 with launchd
11:30 - It's open source
12:45 - What's next + CTA
```

---

## SCRIPT

---

### [0:00] HOOK - The problem with Claude Code

[SCREEN RECORDING: Terminal with Claude Code running, then switching to phone lock screen]

I was in the middle of a shoot. Client delivery was due that night. I had Claude Code halfway through a fix on my booking system, and I realized... I can't touch it. It's on my Mac. In my office. I'm 40 minutes away with a camera in my hand.

[TALKING HEAD]

Claude Code is the best coding tool I've ever used. It reads your entire codebase, writes code, runs tests, deploys. But it's trapped in your terminal. You can't use it from your phone. You can't use it from your car. You can't use it while you're walking your dog or sitting in a waiting room or, in my case, standing at a wedding venue.

So I built something to fix that. And I open-sourced it.

[B-ROLL: Phone showing Slack with a voice memo being sent, then a code response appearing in the thread]

This is Voice to Claude. I speak into my phone, it shows up in Slack, Claude Code picks it up, does the work, and replies with the results. All from my phone. No laptop needed.

And the whole thing runs 24/7 on my Mac at home. If it crashes, it restarts itself. I've had it running for weeks without touching it.

Let me show you how it works.

---

### [1:15] What I actually built

[TALKING HEAD]

Here's the short version. Voice to Claude is a Node.js bridge that sits between Slack and the Claude Code CLI. It uses Slack's Socket Mode, which means no public URLs, no ngrok tunnels, no exposing your machine to the internet. It's a WebSocket connection that Slack initiates to your bridge. Runs entirely on localhost.

[DIAGRAM: Simple flow chart]

```
iPhone --> Slack --> Socket Mode Bridge --> Claude Code CLI --> Slack Thread
```

The bridge does a few things:

- Receives your Slack messages in under a second via Socket Mode
- Transcribes audio files if you send a voice memo (using Gemini Flash)
- Routes your message to the right repo if you work on multiple projects
- Spawns a `claude -p` process that does the actual work
- Posts the output back to your Slack thread
- Handles permission requests via buttons you can tap on your phone

[TALKING HEAD]

That last one is important. Claude Code asks for permission before running certain commands. Normally you'd see that in your terminal and type "y." With this bridge, it posts a Slack message with Allow and Deny buttons. You tap Allow from your phone, Claude continues working.

You're literally approving code execution from the gym.

---

### [2:30] Live demo: voice to working code

[SCREEN RECORDING: iPhone screen]

Let me show you the actual flow. I'm going to open my iPhone, hold the side button, and say...

[VOICE MEMO BEING RECORDED]

"Hey Claude, in studio-os, check if there are any failing tests in the photo workflow and fix them."

[SCREEN RECORDING: Slack mobile showing the voice memo appearing in #claude channel]

That voice memo just hit Slack. Now watch what happens.

[SCREEN RECORDING: Slack thread updating in real time]

The bridge picked it up. It transcribed the audio. It detected that I said "studio-os" so it routed to my studio-os repo. And now Claude is running.

You can see it's reading files, running the test suite, found 2 failing tests, and... it's fixing them. It's editing the test files. Now it's running the tests again to verify.

[SCREEN RECORDING: Final Slack response with test results]

Done. All tests passing. That whole thing took about 3 minutes, and I didn't open a terminal once.

[TALKING HEAD]

Now here's something subtle. If I reply in that same Slack thread, Claude remembers the full conversation. It's not starting from scratch. The bridge tracks a session ID for each thread, so when I reply, it does a `--resume` with that same session ID. Full context preserved.

I could say "now commit that and push it" in the same thread, and Claude would do it because it remembers exactly what it just fixed.

---

### [4:45] Architecture walkthrough

[TALKING HEAD]

Alright, let's open the hood. If you just want to use this, you don't need to understand any of this. Clone the repo, set your env vars, run `npm start`. But if you're the kind of person who wants to know how it works before you trust it, here's the full architecture.

[DIAGRAM: Detailed component diagram]

```
                     iPhone
                       |
                  Siri Shortcut
                       |
              Supabase Edge Function (optional)
                       |
                  Slack #claude
                       |
                Socket Mode WebSocket
                       |
              +--------+--------+
              |                 |
         bolt-app.ts      hook-relay.ts
         (Slack events)   (Express, localhost:3847)
              |                 |
       session-router.ts   pending-store.ts
              |                 |
       session-manager.ts      |
              |                 |
         claude -p CLI  <-------+
              |          (hooks POST back)
              |
        Slack Thread
         (response)
```

[TALKING HEAD]

There are 6 files. That's it. The whole bridge is about 800 lines of TypeScript. Let me walk through each one.

[SCREEN RECORDING: VS Code with source files]

**bolt-app.ts** handles the Slack connection. It uses `@slack/bolt`, which is the official Slack SDK. Socket Mode means the bridge opens a WebSocket to Slack's servers. No incoming connections to your machine. No firewall rules. No DNS. Your machine calls out to Slack, and Slack pushes events back over that same WebSocket.

When a message comes in, it checks the security allowlist. Only one Slack user ID can interact with this bridge. Mine. Everyone else gets silently ignored.

**session-router.ts** figures out where to send the message. If I write "studio-os: fix the auth bug," it strips the prefix and routes to my studio-os directory. If I just write "fix the auth bug," it goes to my default repo. It also handles thread context. New thread means new session. Reply in a thread means resume an existing session.

**session-manager.ts** is where the actual Claude process gets spawned. It runs `claude -p` with flags like `--session-id` for new conversations and `--resume` for follow-ups. The prompt goes in via stdin. Output comes back via stdout. Process exits when Claude is done. Clean, simple, no long-running processes to manage.

[TALKING HEAD]

There's a per-thread message queue in here too. If you send two messages fast in the same thread, the second one waits for the first Claude process to finish before starting. Without that, you'd get two processes writing to the same session file at the same time. Corrupted transcript. Bad times.

**hook-relay.ts** is an Express server running on localhost port 3847. This is how Claude Code communicates back to the bridge. When Claude wants permission to run a command, it sends an HTTP POST to this server. The server posts a Slack message with buttons. You tap Allow or Deny. The decision flows back to Claude.

[SCREEN RECORDING: Slack showing a permission request with Allow/Deny buttons]

Right now I auto-allow all permissions for bridge-spawned sessions. The system prompt constrains what Claude can do, and I trust it within my repos. But the plan approval flow is interactive. When Claude finishes planning and wants to execute, it sends a plan approval hook. The bridge posts the plan to Slack with Approve, Modify, and Cancel buttons. You review the plan on your phone and decide.

[TALKING HEAD]

**pending-store.ts** is a promise store. When a hook comes in, it creates a JavaScript Promise and waits. When you tap a button in Slack, it resolves that Promise. 120-second timeout for permissions, 300 seconds for plan approvals. If you don't respond, it auto-denies.

**audio-transcriber.ts** handles voice memos. When you send an audio file to Slack (m4a, mp3, wav, whatever), the bridge downloads it using the Slack API, sends it to Gemini Flash for transcription, and passes the text to Claude. Takes about 2-3 seconds for a 30-second voice memo.

**state-persistence.ts** saves thread-to-session mappings to a JSON file on disk. When the bridge restarts, it loads this file and picks up where it left off. Your active threads survive restarts. Sessions expire after 7 days.

---

### [7:30] The hook relay deep dive

[TALKING HEAD]

The hook relay deserves its own section because it's the piece that makes this actually usable from mobile. Without it, Claude Code is fire-and-forget. You send a message, you wait, you get a response. But real coding sessions are interactive. Claude needs to ask questions. It needs permission to do certain things. It shows you a plan and asks if it should proceed.

[DIAGRAM: Hook relay flow]

```
Claude Code CLI
    | runs a command needing permission
    |
    | POST localhost:3847/hooks/permission
    v
hook-relay.ts
    | creates pending Promise
    | posts Slack message with buttons
    v
Slack (your phone)
    | you tap "Allow"
    v
bolt-app.ts
    | resolves the Promise
    v
hook-relay.ts
    | returns HTTP response to Claude
    v
Claude Code CLI
    | continues executing
```

[SCREEN RECORDING: Claude Code settings.json showing hook configuration]

To set this up, you add hook configurations to your Claude Code settings. Three hooks:

- PermissionRequest: fires when Claude wants to use a tool
- Notification: fires for status updates (logged, not posted to Slack)
- PreToolUse with ExitPlanMode matcher: fires when Claude finishes a plan

Each hook is a curl command that POSTs to localhost:3847. Claude pipes the hook payload via stdin. The bridge parses it, acts on it, and returns a JSON response that tells Claude what to do.

[TALKING HEAD]

The security model here is simple. The Express server binds to 127.0.0.1, not 0.0.0.0. Nothing outside your machine can reach it. Socket Mode means no public URLs. Your Slack bot token and app token are the only credentials, and they're in environment variables. Not in code.

---

### [9:00] Why not Claude Desktop / Web / Remote MCP?

[TALKING HEAD]

Fair question. Anthropic ships Claude Desktop, Claude Web, and now there's Remote MCP. Why build something custom?

[SCREEN RECORDING: Side-by-side comparison table]

**Claude Desktop and Claude Web** are great for one-off questions. But they don't have access to your codebase in the same way Claude Code does. Claude Code reads your CLAUDE.md, understands your monorepo structure, knows your deployment patterns. It has Bash, file editing, git, all the tools. Desktop and Web don't run `npm test` for you.

**Claude Code CLI directly** is what I used before. It's excellent. But it requires a terminal on your Mac. I can't SSH into my Mac from my phone and use it (well, I could, but the experience is terrible on a phone screen).

**Remote MCP** lets you connect Claude to remote tools. But it's about tools, not about running a full coding agent. I don't want to call a tool. I want to say "fix the failing tests" and have an agent figure out what to do.

[TALKING HEAD]

What Voice to Claude gives you that none of those options do:

1. **Mobile voice input.** Speak naturally, get code written. No typing on a tiny keyboard.
2. **Multi-repo routing.** One Slack channel, multiple projects. Prefix your message and it goes to the right codebase.
3. **Session continuity.** Reply in a thread, pick up where you left off. Full conversation context.
4. **Approval workflows from your phone.** Review plans, approve permissions, all via Slack buttons.
5. **24/7 availability.** launchd keeps it running. Crash? Auto-restart. Reboot? Auto-start.
6. **Customizable intent routing.** You can add custom handlers for specific message patterns. I have one for daily briefings and one for querying delivery status.

It's not replacing Claude Code. It's giving Claude Code a phone.

---

### [10:30] Running it 24/7 with launchd

[TALKING HEAD]

The bridge needs to be always on. If it's not running, your voice memos go nowhere. On macOS, the right tool for this is launchd. It's the native process supervisor. You give it a plist file that says "run this process, and if it dies, restart it."

[SCREEN RECORDING: plist file in editor]

The repo includes a template plist. You fill in your paths, your Slack tokens (in the EnvironmentVariables section, not in code), and load it:

```
launchctl load ~/Library/LaunchAgents/com.yourdomain.voice-to-claude.plist
```

That's it. It starts immediately. It restarts on crash. It starts on login. You can check it's running with:

```
curl http://127.0.0.1:3847/health
```

You get back a JSON response with status, uptime, and how many pending permission requests are queued.

[TALKING HEAD]

One gotcha I hit: launchd doesn't load your shell profile. So the PATH doesn't include npm global binaries by default. The plist template handles this by setting the full PATH explicitly. If you get "command not found: claude," that's probably why. The docs cover it.

On Linux, you'd use systemd instead of launchd. Same concept, different config format. The bridge itself doesn't care what supervises it.

---

### [11:30] It's open source

[SCREEN RECORDING: GitHub repo page]

The whole thing is on GitHub. MIT license. Fork it, modify it, run it.

[TALKING HEAD]

The setup is straightforward. You need:

- Node.js 20 or higher
- Claude Code CLI installed (that requires a Claude Max subscription or Anthropic API key)
- A Slack app with Socket Mode enabled

The README walks you through creating the Slack app, getting your tokens, and configuring the hooks. There's a separate setup guide for the iPhone shortcut if you want the voice-first flow.

[SCREEN RECORDING: Terminal showing clone, install, configure, start]

```
git clone https://github.com/rijhsinghani/voice-to-claude.git
cd voice-to-claude
npm install
cp .env.example .env
# edit .env with your tokens
npm start
```

Send a message to your Slack channel. Watch Claude respond in the thread.

[TALKING HEAD]

If you work on a single repo, the config is one env var. Point DEFAULT_REPO to your project directory. If you work on multiple repos, REPO_PATHS takes a JSON map of names to paths. That's it.

The codebase is about 800 lines of TypeScript across 8 files. No framework. No abstraction layers. Express for the hook relay, Bolt for the Slack connection, pino for logging. You can read the whole thing in 20 minutes.

---

### [12:45] What's next

[TALKING HEAD]

There are a few things I want to add:

**Scheduled automations.** Right now the bridge is reactive. You send a message, it responds. I want cron-driven tasks: a daily briefing at 8am that summarizes what changed across my repos overnight. An SLA alert at 9am if any client deliveries are overdue. A weekly usage digest.

**More intent handlers.** Right now everything goes to Claude Code. But some messages don't need a full coding agent. "What's the status of the Johnson gallery?" should query the database directly, not spawn a Claude session. Intent detection with lightweight handlers for common queries.

**Content engine integration.** I run a separate content pipeline for social media. I want to say "publish the draft I wrote yesterday" and have it flow through the content engine without me opening a browser.

**Community contributions.** The architecture is modular. Each handler is a function. Adding a new intent is writing one function and registering it. If you build something useful, open a PR.

---

### [CTA]

[TALKING HEAD]

If you want to try this, the link to the repo is in the description. Star it if you find it useful. It helps other people find it.

If you build something cool with it, I want to see it. Drop a comment or tag me. I'm curious what workflows people come up with that I haven't thought of.

And if you're building automations for your business or just want to see more builds like this, subscribe. I post a new build walkthrough every week.

I'll see you in the next one.

---

## VIDEO DESCRIPTION

I built an open-source bridge that lets you control Claude Code from your phone using voice memos via Slack. No public URLs, no tunnels, runs 24/7 on your Mac.

In this video I walk through the full architecture: Socket Mode WebSocket, hook relay for mobile approvals, session persistence, audio transcription, and the launchd setup that keeps it running permanently.

**Timestamps:**
0:00 - The problem: Claude Code is trapped in your terminal
1:15 - What Voice to Claude actually is
2:30 - Live demo: voice memo to working code fix
4:45 - Full architecture walkthrough (6 files, 800 lines)
7:30 - The hook relay: approving code from your phone
9:00 - vs Claude Desktop, Web, and Remote MCP
10:30 - Running 24/7 with launchd
11:30 - Open source: how to set it up
12:45 - What's next

**Links:**
GitHub repo: https://github.com/rijhsinghani/voice-to-claude
Setup guide: see docs/SETUP.md in the repo

Book a free 15-min discovery call if you want help building automations for your business: [link]

#ClaudeCode #AIAutomation #VoiceToCode #OpenSource #DeveloperTools
