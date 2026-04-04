# Instagram Reel Script: Voice-to-Claude

**Account:** @SameerAutomates
**Format:** Instagram Reel, 70 seconds
**Concept:** "I talk to my phone. My AI writes the code."

---

## 1. REEL SCRIPT (Spoken Words + Timing)

### HOOK (0-3s)

> _[Holding phone to mouth, speaking into it]_
> "Fix the auth bug in my client portal."

_[SMASH CUT to: code changes appearing on a terminal screen]_

### PROBLEM (3-10s)

> "Claude Code completely changed how I build software. But it lives in my terminal. I'm not always at my desk. I needed it in my pocket."

### SOLUTION (10-25s)

> "So I built a bridge. I open my phone, record a voice note, it hits Slack, Slack triggers Claude Code on my Mac, Claude reads my codebase, makes the changes, and replies right in the thread.
>
> The whole loop takes seconds."

### ARCHITECTURE (25-45s)

> "Here's how it works.
>
> Your voice note goes to a Slack channel. A Socket Mode WebSocket picks it up. No public URL, no ngrok, nothing exposed to the internet.
>
> The bridge transcribes the audio, figures out which project you're talking about, and spawns a Claude Code session in that repo.
>
> Claude reads your files, writes code, creates PRs. When it needs permission to do something, it sends you a Slack button. Approve or deny, right from your phone.
>
> It works across multiple repos. Just say the project name."

### RESULTS / PROOF (45-60s)

> "I use this every day. From my couch, from the car, at 2am when I can't sleep and have an idea.
>
> 'What's the status of booking 1483?' Claude queries the database and answers.
>
> 'Deploy the video pipeline.' Claude runs the deployment.
>
> It's been running 24/7 on my Mac for weeks."

### CTA (60-70s)

> "I open sourced the whole thing. Link in bio.
>
> Clone it, configure your Slack tokens, run npm start. That's it.
>
> Star it, fork it, make it yours."

---

## 2. VISUAL SHOT LIST

| Timestamp | Visual                                                                                      | Audio/Voiceover                                     |
| --------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0-1s      | Close-up of Sameer holding iPhone to mouth, natural lighting, casual setting                | Speaking into phone: "Fix the auth bug..."          |
| 1-3s      | Screen recording: terminal showing code diff appearing in real-time (green additions)       | Music hits                                          |
| 3-7s      | Sameer at desk with monitor showing Claude Code terminal, talking to camera                 | "Claude Code completely changed..."                 |
| 7-10s     | B-roll: walking away from desk, phone in hand, looking at it                                | "I needed it in my pocket."                         |
| 10-13s    | Screen recording: iPhone recording voice memo in Shortcuts app                              | "I open my phone, record a voice note..."           |
| 13-16s    | Screen recording: Slack channel showing the message arriving with audio file                | "...it hits Slack..."                               |
| 16-20s    | Screen recording: Terminal showing Claude Code session spinning up, reading files           | "...Claude reads my codebase, makes the changes..." |
| 20-25s    | Screen recording: Slack thread with Claude's reply containing code summary                  | "...and replies right in the thread."               |
| 25-30s    | **Architecture Illustration #1** (see Section 4) fades in, hand-drawn style                 | "Here's how it works."                              |
| 30-35s    | **Architecture Illustration #2** zooms into the Socket Mode section                         | "No public URL, no ngrok..."                        |
| 35-40s    | **Architecture Illustration #3** shows multi-repo routing                                   | "...figures out which project..."                   |
| 40-45s    | Screen recording: Slack showing Approve/Deny buttons from Claude                            | "...sends you a Slack button."                      |
| 45-50s    | B-roll: Sameer on couch with phone, casual, relaxed                                         | "I use this every day."                             |
| 50-55s    | Screen recording: Slack thread with booking query and Claude's database response            | "'What's the status of booking 1483?'"              |
| 55-60s    | Screen recording: Slack showing deployment confirmation                                     | "'Deploy the video pipeline.'"                      |
| 60-63s    | Sameer to camera, confident, direct                                                         | "I open sourced the whole thing."                   |
| 63-67s    | Screen recording: GitHub repo page (github.com/rijhsinghani/voice-to-claude) showing README | "Clone it, configure your Slack tokens..."          |
| 67-70s    | Sameer to camera, slight smile, pointing down (toward link in bio)                          | "Star it, fork it, make it yours."                  |

---

## 3. INSTAGRAM CAPTION

```
I talk to my phone. My AI writes the code.

I built a bridge between my iPhone and Claude Code.

Voice note -> Slack -> Claude Code -> code changes -> reply in Slack thread.

Works from my couch. Works at 2am. Works while I'm sleeping.

No public URLs. No ngrok. Socket Mode WebSocket keeps everything local.

It handles:
- Voice transcription (Gemini Flash)
- Multi-repo routing (just say the project name)
- Permission approval via Slack buttons
- Session persistence across messages

I've been running it 24/7 on my Mac for weeks.

Today I open sourced it. Link in bio.

Clone it. Configure 4 env vars. npm start.

Built by a wedding photographer who taught himself to code.

#AIAutomation #ClaudeCode #VoiceToClaude #BuildInPublic #OpenSource #SoloFounder #AITools #DeveloperTools #Automation #SlackAutomation #AnthropicClaude #IndieHacker #SmallBusiness #TechForCreatives #AIWorkflow
```

---

## 4. ILLUSTRATION SUGGESTIONS

### Illustration 1: Full Pipeline Flow (25-30s mark)

A horizontal flow diagram, clean and minimal, with icons:

- **Phone icon** (left) with sound waves coming out
- **Arrow** to **Slack logo** (purple #channel)
- **Arrow** to **Bridge icon** (a simple bridge or connector symbol, labeled "Socket Mode Bridge")
- **Arrow** to **Claude logo** or terminal icon (labeled "Claude Code CLI")
- **Arrow** to **Code file icon** with a green checkmark
- **Arrow** curving back to **Slack logo** with a reply bubble

Style: White or light background, thin lines, rounded shapes. Hand-drawn or clean vector. Not corporate. Think "whiteboard sketch that's been cleaned up."

### Illustration 2: Security Model (30-35s mark)

A zoomed-in view showing why Socket Mode matters:

- **Your Mac** (drawn as a laptop/desktop) with a shield icon
- **Dotted line** going outward labeled "WebSocket (outbound only)"
- **Slack cloud** on the other side
- **Red X** over "Public URL / ngrok / exposed port"
- **Green checkmark** over "localhost only"

Purpose: Visually communicate that nothing is exposed to the internet. The connection is outbound from your machine.

### Illustration 3: Multi-Repo Routing (35-40s mark)

A branching diagram:

- **Slack message** at the top: `"studio-os: fix the auth bug"`
- **Router** icon in the middle that reads the prefix
- **Three branches** going to different folder icons:
  - `~/studio-os/`
  - `~/content-engine/`
  - `~/investment-accounting/`
- Each folder has a small Claude icon inside it

Purpose: Show that one bridge handles multiple projects, routed by a prefix in the message.

### Illustration 4: Permission Flow (optional, for 40-45s mark)

A vertical sequence:

- Claude finds a file it wants to edit
- **Arrow down** to Slack showing two buttons: [Approve] [Deny]
- User taps Approve on phone
- **Arrow down** to Claude proceeding with the edit

Purpose: Show the human-in-the-loop safety model. Claude asks before acting.

---

## 5. AUDIO / MUSIC NOTES

**Style:** Lo-fi electronic with subtle energy. Not hype-music. Think "focused builder in a home office at night."

**Recommendations:**

- Start with a clean beat that hits on the smash cut (0-1s transition from voice to code)
- Keep it low and atmospheric during the talking sections (3-45s)
- Slight energy lift during the results/proof section (45-60s)
- Clean fade or beat drop on the CTA ("I open sourced the whole thing")

**Mood references:**

- The kind of music you'd hear in a Fireship YouTube video intro
- Or a late-night coding livestream background track

**Instagram audio library search terms:** "tech," "minimal electronic," "lo-fi beat," "coding," "startup"

**Volume:** Music should sit well under the voice. This is a speaking-heavy reel. The music provides texture, not energy.

---

## PRODUCTION NOTES

- **Shoot to-camera segments in natural light**, casual setting (home office, living room). Not a studio. The brand is "real builder," not "content creator."
- **Screen recordings should be real.** Use actual Slack threads and actual Claude output. Blur any sensitive data (API keys, client names) but keep the UI authentic.
- **Pacing:** Quick cuts between 1-3 seconds each during the solution/architecture sections. Slower, steadier shots for hook and CTA.
- **Text overlays:** Add key phrases as on-screen text during fast sections. Keep them short: "Voice note," "Slack," "Claude Code," "Reply in thread," "Open source."
- **Aspect ratio:** 9:16 vertical (standard Reel format)
- **Total runtime target:** 70 seconds (within 60-90s range, optimized for retention)
