# Multi-Channel Conversation Example

This example demonstrates how to use Twilio Agent Connect (TAC) in conversation mode to build an intelligent conversational agent that works across both SMS and Voice channels, with OpenAI as the LLM provider.

## What This Example Does

- **Multi-Channel Support**: Handles both SMS and Voice conversations in a single application
- **OpenAI Integration**: Uses gpt-5.4-mini for intelligent, context-aware responses
- **Memory Integration**: Automatically retrieves user profiles and conversation history from Twilio Memory
- **Profile Personalization**: Incorporates user profile traits into responses for personalized interactions
- **Conversation History**: Maintains context across multiple message exchanges
- **Uniform Tool Flow**: Voice channel exposes CR's seven built-in tools — protocol (`play_media`, `send_digits`, `switch_language`, `end_call`, `live_agent_handoff`) plus state (`set_listen_mode`, `set_silence_detection`) — through the same `listTools()` / `executeTool()` surface used by every channel

## Prerequisites

1. **Node.js 22.13.0+** installed
2. **Twilio Account** with a phone number
3. **OpenAI API Key** for gpt-5.4-mini access
4. **ngrok** or similar tunneling tool for local development

## Setup

### 1. Install Dependencies

From the repository root:

```bash
npm install
npm run build
```

Then install the example's dependencies:

```bash
cd getting_started/examples/conversation
npm install
```

### 2. Configure Environment Variables

From the `getting_started/examples/` directory:

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
TWILIO_CONVERSATION_CONFIGURATION_ID=conv_configuration_xxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Run the Servers

```bash
npm run dev
```

The example starts **two Fastify servers** in the same process:

| Server | Port | Endpoints |
|---|---|---|
| `TACServer` (Maestro webhooks) | `8000` | `POST /webhook` — Conversation Orchestrator fan-out (SMS) |
| `ConversationRelayServer` (voice) | `8001` | `POST /twiml`, `WS /ws`, `POST /conversation-relay-callback` |

The split exists because `@twilio/tac-conversationrelay` is deliberately a standalone package with no dependency on `@twilio/tac-core` — the two servers are composed via two optional callbacks (`onIncomingCall`, `onConversationRelayCallback`) that carry plain data records, not protocol types.

### 4. Expose Your Servers

ngrok (or your tunnel of choice) only forwards one port at a time, so you need two tunnels. In two separate terminals:

```bash
ngrok http 8000   # SMS / Maestro webhooks → TACServer
ngrok http 8001   # Voice numbers          → ConversationRelayServer
```

Copy both ngrok URLs — they are different (e.g. `https://abc123.ngrok.io` for Maestro and `https://xyz789.ngrok.io` for voice).

> **Dev-loop tip.** Both webhook URLs are baked into Twilio config (phone-number page + Conversation Configuration), so ephemeral tunnels mean re-pasting two URLs every restart. Reserved ngrok subdomains let you paste them once:
>
> ```bash
> ngrok http --url sierra-des.ngrok.dev 8000
> ngrok http --url cr-des.ngrok.dev     8001
> ```

### 5. Configure Twilio Webhooks

**SMS (→ TACServer on :8000):**

1. In the [Console](https://1console.twilio.com/), go to **Products & services** > **Conversation Orchestrator** > **Conversation Configurations**.
2. Select your conversation configuration.
3. In the **Overview** tab, click **Edit**.
4. Set **Webhook > Callback method** to `https://<maestro-ngrok>/webhook` with HTTP method `POST`.
5. Click **Save changes**.

**Voice (→ ConversationRelayServer on :8001):**

1. In the [Console](https://1console.twilio.com/), go to **Products & services** > **Numbers & senders**.
2. Select your Twilio phone number.
3. Under **Voice configuration**, set the webhook URL to `https://<voice-ngrok>/twiml` with HTTP method `POST`.

## Example Conversations

### SMS

Send an SMS to your Twilio number:

- "Hello!" → AI responds with a personalized greeting
- "What can you help me with?" → AI explains its capabilities
- "Remember my name is John" → AI remembers and uses your name in future conversations

### Voice

Call your Twilio number:

- Say "Hello" → AI responds via voice
- Have a natural conversation → AI maintains context across the call
- Conversation history is preserved for future calls

## Code Structure

```
getting_started/examples/conversation/
├── src/
│   └── index.ts           # Main application
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── README.md              # This file
```

## Key Features

### Memory Integration

When Memory is configured, TAC automatically:

- Retrieves user profile information before each conversation
- Includes profile traits (name, preferences, etc.) in the AI context
- Loads recent conversation history for context continuity

### Profile Personalization

The example extracts profile traits and includes them as system messages to OpenAI:

```typescript
User Profile:
Contact: {"firstName": "John", "lastName": "Doe"}
Preferences: {"language": "en"}
```

### Conversation History

The application maintains conversation history per conversation ID, allowing the AI to:

- Remember what was said earlier in the conversation
- Provide contextually relevant responses
- Build on previous exchanges

### Uniform Tool Dispatch

Every channel implements the same tool surface — `listTools()`, `registerTool(tool)`, `executeTool(conversationId, name, args)` — so the LLM glue is the same shape regardless of channel. On voice, the built-in CR protocol tools are auto-registered, and `executeTool` auto-ships their `outgoingMessage` (play/sendDigits/language/end) over the CR WebSocket:

```typescript
const tools = voiceChannel
  .listTools()
  .map(t => t.toOpenAIFormat() as unknown as OpenAI.Chat.ChatCompletionTool);

const stream = await openai.chat.completions.create({ model, messages, tools, stream: true });

for (const call of toolCalls.values()) {
  // Protocol tools ship their outgoing frame automatically; non-protocol tools
  // return their result for the next LLM turn to consume.
  const args: unknown = JSON.parse(call.argumentsJson);
  await voiceChannel.executeTool(convId, call.name, args);
}
```

SMS uses the same pattern — register a tool on `smsChannel`, it shows up in `smsChannel.listTools()`, and `smsChannel.executeTool(...)` invokes it. There's no special casing per channel in the LLM loop.

### Handling voice interruptions

Interruptions arrive on the unified `onMessageReady` surface as `ChannelMessage` with `messageType: 'system'` and `metadata.type: 'interrupt'`. The message metadata includes `utteranceUntilInterrupt` (what the caller actually heard) and `durationUntilInterruptMs`.

This example keeps a `Map<ConversationId, AbortController>` so the interruption handler can:

1. **Cancel the in-flight OpenAI stream** — `voiceStreams.get(convIdStr)?.abort()`. The `signal` is threaded into `openai.chat.completions.create` so TTS stops receiving tokens immediately.
2. **Rewrite the last assistant turn** in `conversationMessages[convIdStr]` to `utteranceUntilInterrupt`. This matters for multi-turn accuracy — without it the next prompt carries text the caller never heard, and the LLM starts referring to things it never actually said.

Because the branch runs before the `messageType !== 'user'` guard, the interrupt is handled as context rather than triggering a new LLM turn. See `src/index.ts` for the complete handler.

## Production Considerations

1. **Error Handling**: Add comprehensive error handling and retry logic
2. **Rate Limiting**: Implement rate limiting to prevent abuse
3. **Monitoring**: Add logging and metrics for production debugging
4. **Security**: Enable Twilio webhook signature validation in production
5. **Scaling**: Consider horizontal scaling for high-volume applications
6. **Cost Management**: Monitor OpenAI API usage and implement cost controls

## Next Steps

- Customize the system prompt for your specific use case
- Add tool calling to enable agent actions (e.g., look up information, create tickets)
- Implement conversation handoff to human agents
- Add support for additional channels (WhatsApp, etc.)

## Troubleshooting

- **OpenAI Errors**: Verify your API key and check for rate limits
- **Memory Errors**: Ensure Memory service credentials are correct
- **Webhook Errors**: Verify ngrok is running and webhooks are configured correctly
- **WebSocket Issues**: Check that your ngrok URL uses HTTPS for WebSocket connections
