# TAC CRelay Example

Example demonstrating voice-only ConversationRelay integration with Twilio Agent Connect. Uses `TAC_MODE=crelay` — no Maestro Conversations Service required.

This is the simplest way to build a voice AI agent with TAC.

## Setup

1. From the repository root, install and build the SDK:
   ```bash
   npm install
   npm run build
   ```

2. Configure environment variables. From the `getting_started/examples/` directory, copy and fill in the template:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

   Required credentials:
   - `TAC_MODE=crelay`
   - `TWILIO_ACCOUNT_SID` - Account SID
   - `TWILIO_AUTH_TOKEN` - Auth token
   - `TWILIO_API_KEY` - API Key SID (starts with SK)
   - `TWILIO_API_TOKEN` - API Token
   - `TWILIO_PHONE_NUMBER` - Your Twilio phone number
   - `OPENAI_API_KEY` - OpenAI API key
   - `VOICE_PUBLIC_DOMAIN` - Your ngrok URL (e.g., `https://abc123.ngrok.app`)

   **Not required**: `CONVERSATION_SERVICE_ID`, `MEMORY_STORE_ID` — crelay mode doesn't use Maestro.

3. Install the example's dependencies:
   ```bash
   cd getting_started/examples/crelay
   npm install
   ```

4. Start ngrok in another terminal:
   ```bash
   ngrok http 8000
   ```
   Update `VOICE_PUBLIC_DOMAIN` in `.env` with the ngrok URL.

5. Configure your Twilio phone number:
   - In the [Console](https://1console.twilio.com/), go to **Products & services** > **Numbers & senders**
   - Select your Twilio phone number
   - Under **Voice configuration**, set the webhook URL to `https://your-ngrok.ngrok.app/twiml` with HTTP method `POST`

6. Start the server:
   ```bash
   npm start
   ```

7. Call your Twilio phone number!

## How it Works

1. Twilio calls `POST /twiml` when a call comes in
2. Server responds with TwiML that connects the call to a WebSocket via ConversationRelay
3. Voice audio is transcribed and sent as `prompt` messages over the WebSocket
4. TAC's `onMessageReady` callback receives each message:
   - `messageType: 'user'` — voice prompts → generate LLM response
   - `messageType: 'system'` — setup, interrupt, dtmf, info → context only
5. LLM response is sent back via `sendResponse()` and spoken to the caller

## Architecture

```
Phone Call → Twilio → POST /twiml → TwiML (connect to WS)
                   → WS /ws → CRelayChannel → onMessageReady → OpenAI → sendResponse → TTS
```

## Key Differences from Conversation Mode

| Feature | CRelay (`crelay`) | Conversation (`conversation`) |
|---------|-------------------|-------------------------------|
| Maestro | Not used | Required |
| Memory | Not available | Available (optional) |
| Channels | Voice only | Voice + SMS + Chat |
| Session ID | CallSid | ConversationId |
| Channel deps | `tac.logger` | `tac.getChannelDeps()` |

## Notes

- No `CONVERSATION_SERVICE_ID` needed — crelay mode skips Maestro entirely
- Session ID is the Twilio CallSid (not a Maestro ConversationId)
- Interrupt events include `utteranceUntilInterrupt` and `durationUntilInterruptMs` metadata
- The `conversation` bundle (`msg.conversation`) is not populated in crelay mode
