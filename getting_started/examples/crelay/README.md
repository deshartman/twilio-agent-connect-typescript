# ConversationRelay (CRelay) Standalone Example

Demonstrates using the `@twilio/tac-conversationrelay` package standalone for voice-only applications. No Maestro, no Memory, no multi-channel - just pure ConversationRelay with OpenAI integration.

**Note:** This example uses a file path to reference the local package for development. In production, install from npm: `npm install @twilio/tac-conversationrelay`. Other examples use the full `twilio-agent-connect` package; this one intentionally uses only the minimal ConversationRelay package.

## Features

- ✅ Voice-only (no SMS, no Chat)
- ✅ Uses standalone `ConversationRelayServer` from conversationrelay package
- ✅ No dependency on TAC framework
- ✅ OpenAI GPT-4 integration with streaming
- ✅ Built-in CR protocol tools (`play_media`, `send_digits`, `switch_language`, `end_call`) auto-registered and LLM-dispatchable
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
3. Voice audio transcribed and delivered to `conversationRelay.onPrompt(...)`
4. OpenAI GPT-4 generates a streamed response, optionally emitting `tool_calls`
5. For each tool call, `conversationRelay.executeTool(callSid, name, args)` runs the tool and, if it's a CR protocol tool, auto-ships the resulting `outgoingMessage` (play/sendDigits/language/end) over the WebSocket
6. Text tokens are streamed back via `sendResponse(...)` and spoken to the caller

## Architecture

```
Phone Call → Twilio → POST /twiml → TwiML (connect to WS)
                   → WS /ws → ConversationRelay ↔ OpenAI GPT-4
                                  │
                                  ├─ listTools()        → pass CR built-ins to OpenAI
                                  └─ executeTool(...)   → run tool + auto-ship protocol message
```

## Tool Flow

The example uses CR's uniform tool surface:

```typescript
// 1. Discover available tools (built-ins + anything you register)
const tools = conversationRelay
  .listTools()
  .map(t => t.toOpenAIFormat() as unknown as OpenAI.Chat.ChatCompletionTool);

// 2. Hand them to OpenAI
const stream = await openai.chat.completions.create({ model, messages, tools, stream: true });

// 3. Dispatch tool calls — protocol tools auto-ship their outgoingMessage
for (const call of toolCalls.values()) {
  const args: unknown = JSON.parse(call.argumentsJson);
  await conversationRelay.executeTool(callSid, call.name, args);
}
```

No manual `Map<string, CRTool>` dispatcher, no hand-rolled `ws.send({ type: 'sendDigits', ... })`. Ask the agent "send digits 1234" or "say goodbye and hang up" and the corresponding protocol frame is shipped automatically.

### Registering your own tools

```typescript
import { defineTool } from '@twilio/tac-conversationrelay';

const lookupOrder = defineTool(
  'lookup_order',
  'Look up an order by id',
  { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  async ({ id }) => ({ id, status: 'shipped' })
);
conversationRelay.registerTool(lookupOrder);
```

User tools participate in the same `listTools()` / `executeTool()` flow. Non-protocol tools (no `outgoingMessage` in the result) return their payload unchanged for the LLM loop to consume on the next turn.

## Handling interruptions

When the caller speaks over the agent's TTS, ConversationRelay sends an `interrupt` frame with two fields that drive correct recovery:

- `utteranceUntilInterrupt` — what the caller actually *heard* before cutting in.
- `durationUntilInterruptMs` — ms into the TTS turn when the cut-in happened.

This example holds per-call state with an `AbortController`:

```typescript
type CallState = {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  activeStream?: AbortController;
};
```

The `onInterrupt` handler does two things the framework cannot do for you:

1. **Abort the in-flight OpenAI stream** via `state.activeStream?.abort()`. Without this, tokens keep streaming into TTS after the caller has already moved on.
2. **Rewrite the last assistant turn** in `state.history` to `utteranceUntilInterrupt`. This is the critical step — if you skip it, the next LLM call will believe the assistant said text the caller never heard, and multi-turn accuracy drops quickly.

See `src/index.ts` for the complete pattern.

## Key Differences from Full TAC

| Feature | CRelay (This Example) | Full TAC (Conversation Mode) |
|---------|----------------------|------------------------------|
| Package | `@twilio/tac-conversationrelay` | `twilio-agent-connect` |
| Channels | Voice only | Voice + SMS + Chat |
| Maestro | ❌ Not used | ✅ Required |
| Memory | ❌ Not available | ✅ Optional |
| Session ID | CallSid | ConversationId |
| Server | `ConversationRelayServer` | `TACServer` |

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
