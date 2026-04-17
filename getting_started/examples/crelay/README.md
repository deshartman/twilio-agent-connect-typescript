# ConversationRelay (CRelay) Standalone Example

Demonstrates using the `@twilio/tac-conversationrelay` package standalone for voice-only applications. No Maestro, no Memory, no multi-channel - just pure ConversationRelay with OpenAI integration.

**Note:** This example uses a file path to reference the local package for development. In production, install from npm: `npm install @twilio/tac-conversationrelay`. Other examples use the full `twilio-agent-connect` package; this one intentionally uses only the minimal ConversationRelay package.

## Features

- ✅ Voice-only (no SMS, no Chat)
- ✅ Uses standalone `CRelayServer` from conversationrelay package
- ✅ No dependency on TAC framework
- ✅ OpenAI GPT-4 integration
- ✅ Session-based conversation history
- ✅ Webhook validation enabled

## Setup

1. From the repository root, build the packages:
   ```bash
   npm run build
   ```

2. Navigate to this example:
   ```bash
   cd getting_started/examples/crelay
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Configure environment variables (use shared `.env` in `getting_started/examples/`):
   ```bash
   cd ../
   cp .env.example .env
   # Edit .env with your credentials
   ```

   Required credentials:
   - `TWILIO_ACCOUNT_SID` - Your Twilio Account SID
   - `TWILIO_AUTH_TOKEN` - Your Twilio Auth Token
   - `TWILIO_PHONE_NUMBER` - Your Twilio phone number
   - `OPENAI_API_KEY` - OpenAI API key
   - `VOICE_PUBLIC_DOMAIN` - Your ngrok URL (e.g., `https://abc123.ngrok.app`)
   - `PORT` - Server port (optional, defaults to 8000)

   
5. Start ngrok:
   ```bash
   ngrok http 8000
   ```

6. Configure your Twilio phone number:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Select your phone number
   - Under **Voice Configuration**, set webhook to `https://your-ngrok-url.ngrok.io/twiml` (POST)

7. Start the server:
   ```bash
   npm start
   ```

8. Call your Twilio phone number!

## How It Works

1. Twilio calls `POST /twiml` when a call arrives
2. Server responds with TwiML connecting to WebSocket at `/ws`
3. Voice audio transcribed and sent via WebSocket
4. OpenAI GPT-4 generates response
5. Response sent back and spoken to caller

## Architecture

```
Phone Call → Twilio → POST /twiml → TwiML (connect to WS)
                   → WS /ws → ConversationRelay → OpenAI GPT-4 → TTS
```

## Key Differences from Full TAC

| Feature | CRelay (This Example) | Full TAC (Conversation Mode) |
|---------|----------------------|------------------------------|
| Package | `@twilio/tac-conversationrelay` | `twilio-agent-connect` |
| Channels | Voice only | Voice + SMS + Chat |
| Maestro | ❌ Not used | ✅ Required |
| Memory | ❌ Not available | ✅ Optional |
| Session ID | CallSid | ConversationId |
| Server | `CRelayServer` | `TACServer` |

## When to Use This

✅ **Use CRelay standalone when:**
- You only need voice (no SMS/Chat)
- You don't need persistent memory/profiles
- You want minimal dependencies
- You're building a simple voice bot

❌ **Use full TAC when:**
- You need multi-channel (voice + SMS + chat)
- You need Twilio Memory for profiles
- You need conversation history across channels
- You need Conversation Intelligence
