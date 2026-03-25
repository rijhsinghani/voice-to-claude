# iPhone Shortcut

There are two ways to use voice input with the bridge:

## Approach A: Direct Slack Voice Message (Simplest)

The Slack iPhone app supports voice memos natively. Long-press the microphone icon in the message input to record, then release to send.

The bridge handles audio files via the `audio-transcriber.ts` module:

1. You record and send a voice message in the Slack channel
2. Bridge receives the `file_share` event
3. Bridge downloads the audio file using your bot token
4. Bridge sends the audio to Gemini Flash for transcription
5. Bridge posts the transcription as a thread reply (so you can verify what was heard)
6. Bridge passes the transcribed text to Claude as the prompt
7. Claude's response appears in the thread

Requires: `GEMINI_API_KEY` in your `.env`.

## Approach B: iPhone Shortcut via Supabase (Voice-First UX)

This approach uses an iPhone Shortcut to create a dedicated voice-first workflow outside of the Slack app. You tap a shortcut, speak, and the message goes to Slack automatically.

The bridge works with ANY method of posting a message to the Slack channel. The bridge itself is transparent to how messages arrive.

### Option B1: Direct Slack API (No Supabase needed)

The simplest programmatic approach: use the Slack API directly from the Shortcut.

**Shortcut steps:**

1. **Dictate Text** action: speak your message
2. **Get Contents of URL** action:
   - URL: `https://slack.com/api/chat.postMessage`
   - Method: POST
   - Headers: `Authorization: Bearer xoxb-your-bot-token`
   - Request Body (JSON):
     ```json
     {
       "channel": "YOUR_CHANNEL_ID",
       "text": "[Shortcut input text]"
     }
     ```

This posts directly to the channel as your bot. The bridge picks it up, routes to Claude, replies in the thread.

Note: This posts as the bot user, not you. The bridge's allowlist checks `ALLOWED_SLACK_USER` from the message's `user` field. Bot messages have a `bot_id` instead.

To post as yourself, use the Slack user token (`xoxp-...`) instead of the bot token, or use the Supabase approach below.

### Option B2: Via Supabase Edge Function

This is the approach used in the original implementation. A Supabase edge function acts as a relay: it receives the voice transcript from the iPhone Shortcut and posts it to Slack on your behalf.

**Why this approach:**

- The edge function can authenticate with the Slack API using your user token (posts as you, not the bot)
- You can add pre-processing logic (keyword filtering, context injection) in the edge function
- The iPhone Shortcut only needs to know the Supabase URL, not the Slack tokens

**Supabase Edge Function (simplified):**

```typescript
// supabase/functions/voice-to-slack/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { text } = await req.json();

  // Post to Slack on behalf of the user
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Use user token (xoxp-) to post as you, not the bot
      Authorization: `Bearer ${Deno.env.get("SLACK_USER_TOKEN")}`,
    },
    body: JSON.stringify({
      channel: Deno.env.get("CLAUDE_CHANNEL"),
      text,
    }),
  });

  const result = await response.json();
  return new Response(JSON.stringify({ ok: result.ok }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

**iPhone Shortcut steps:**

1. **Dictate Text** action: captures your voice input
2. **Get Contents of URL** action:
   - URL: `https://your-project.supabase.co/functions/v1/voice-to-slack`
   - Method: POST
   - Headers: `Authorization: Bearer YOUR_SUPABASE_ANON_KEY`
   - Request Body (JSON): `{"text": "[Dictate Text result]"}`

**Deploy the edge function:**

```bash
supabase functions deploy voice-to-slack
supabase secrets set SLACK_USER_TOKEN=xoxp-your-user-token
supabase secrets set CLAUDE_CHANNEL=C1234567890
```

## Notes

- The bridge processes voice messages and typed messages identically once they land in Slack
- Audio file transcription (Approach A) and text-based approaches (Approach B) both work
- For the best mobile experience, create a home screen shortcut that launches directly into the dictation
- Consider adding a "Speak Text" action at the end of the Shortcut to read Claude's response aloud (requires polling the Slack API for the reply, or using a webhook)
