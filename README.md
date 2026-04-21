# Twilio Agent Connect (TAC)

Twilio Agent Connect (TAC) is a powerful TypeScript library designed to simplify the development of intelligent,
context-aware applications using Twilio's communication technologies. TAC provides seamless integration with Twilio's
Memory and Conversation services, enabling you to build LLM-powered agents with persistent memory and conversation context.

> [!NOTE]
> Looking for the Python version? Check out [TAC SDK Python](https://github.com/twilio-innovation/twilio-agent-connect-python).

Explore the [getting_started](getting_started) directory to see the SDK in action.

## Key Features

- **Multi-Channel Support**: SMS, Voice (ConversationRelay), and Chat channels
- **Unified Architecture**: Uses Maestro Conversations Service for all channels with ConversationRelay for voice
- **Memory Management**: Automatic integration with Twilio Memory for persistent user context
- **Conversation Lifecycle**: Automatic tracking of conversation sessions and state
- **Type-Safe**: Full TypeScript support with strict type checking
- **Callback-Based**: Unified `onMessageReady` callback for LLM integration with `messageType` discriminator
- **Production Ready**: Comprehensive test coverage and error handling

## Get Started

To get started, set up your Node.js environment (Node.js 22.13.0 or newer required).

> [!IMPORTANT]
> TAC packages are not yet published to npm. We recommend building your agent directly in this repository.

### Option 1: Build in This Repository (Recommended)

Clone this repository and work within it:

```bash
git clone https://github.com/twilio-innovation/twilio-agent-connect-typescript.git
cd twilio-agent-connect-typescript

# Install dependencies
npm install

# Build packages
npm run build
```

### Option 2: Install from GitHub

If you have an existing project, you can install directly from GitHub:

```bash
npm install git@github.com:twilio-innovation/twilio-agent-connect-typescript.git
```

## Architecture

TAC uses **Maestro Conversations Service** for unified conversation orchestration across all channels:

- **Voice**: Integrates ConversationRelay WebSocket with Maestro for real-time bidirectional streaming
- **SMS**: Maestro webhook ingestion and response delivery
- **Chat**: Maestro webhook ingestion and response delivery

All channels require `TWILIO_CONVERSATION_CONFIGURATION_ID` to be configured in your environment.

For advanced use cases, `VoiceWebhookChannel` is available for bring-your-own ConversationRelay server setups (webhook-only, no WebSocket management).

```
          Twilio WS         +-------------------------+
          (ConvRelay) <---->| VoiceChannel            |
                            |   |- embeds CR          | <-- Channel[voice] -----+
                            |   |- listTools/exec     |                         |
                            |   +- sendResponse       |                         |
                            +-------------------------+                         |
          Twilio SMS        +-------------------------+                         |                +----------+
        (via Maestro) <---->| SMSChannel              |                         | onMessageReady |  User    |
                            |   |- listTools/exec     | <-- Channel[sms] -------+---(unified)--->|  LLM     |
                            |   +- sendResponse       |                         |                |  loop    |
                            +-------------------------+                         |  executeTool   +----------+
          Twilio Chat       +-------------------------+                         | <--(by conv id)-----^
        (via Maestro) <---->| ChatChannel             |                         |                     |
                            |   |- listTools/exec     | <-- Channel[chat] ------+                     |
                            |   +- sendResponse       |         ^                                     |
                            +-------------------------+         |                                     |
                                                     +----------+------------+                        |
                                                     |         TAC           |                        |
                                                     |  - composes channels  |                        |
                                                     |  - tac.getChannel()   |                        |
                                                     |  - onMessageReady     |  <- single callback    |
                                                     |  - onHandoff/         |    for all channels    |
                                                     |    onConversationEnded|                        |
                                                     +-----------------------+                        |
                                                                                                      |
    LLM SDK lives in USER code. -----------------------------------------------------------------------+
    Uniform dispatch:
      channel.listTools().map(t => t.toOpenAIFormat())
      channel.executeTool(msg.conversationId, name, args)
    msg.channel discriminator routes to the right channel.
```

Two principles drive the design:

- **LLM-agnostic.** Neither `@twilio/tac-core` nor `@twilio/tac-conversationrelay` imports any LLM SDK. Vendor format is opt-in via `CRTool.toOpenAIFormat()` / `toAnthropicFormat()` at the call site.
- **Uniform tool flow.** A user integrating an LLM looks at exactly one place per channel to find tools and dispatch them: `channel.listTools()` + `channel.executeTool(conversationId, ...)`. No branching on tool "type" in user code — voice `outgoingMessage` auto-shipping happens inside `executeTool`, not at the call site.

## Quick Examples

Create Memory and Conversation services through the [Twilio Console](https://1console.twilio.com), then configure your `.env` file (see the [getting started guide](getting_started/README.md) for details).

### Multi-Channel with OpenAI SDK

Build an AI agent that works across both Voice and SMS channels with conversation memory and user context.

First, install the required dependencies in the repository:

```bash
npm install openai dotenv
```

Then create your application (e.g., in `getting_started/examples/` or your own directory):

```typescript
import { config } from 'dotenv';
import OpenAI from 'openai';
import {
  TAC,
  TACConfig,
  VoiceChannel,
  SMSChannel,
  ConversationId,
  TACServer,
} from 'twilio-agent-connect';

config();

const openai = new OpenAI();

// Initialize TAC and channels
const tac = new TAC({ config: TACConfig.fromEnv() });
const voiceChannel = new VoiceChannel(tac.getChannelDeps());
const smsChannel = new SMSChannel(tac.getChannelDeps());

// Register channels
tac.registerChannel(voiceChannel);
tac.registerChannel(smsChannel);

// Store conversation history
const conversationHistory: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

// Handle incoming messages (unified callback for all channels)
tac.onMessageReady(async msg => {
  // Only generate responses for user messages, not system events
  if (msg.messageType !== 'user') return;

  const convId = msg.conversationId;

  if (!conversationHistory[convId]) {
    conversationHistory[convId] = [];
  }

  conversationHistory[convId].push({ role: 'user', content: msg.message });

  // Uniform tool discovery — works for voice, sms, chat
  const channel = tac.getChannel(msg.channel)!;
  const tools = channel
    .listTools()
    .map(t => t.toOpenAIFormat() as unknown as OpenAI.Chat.ChatCompletionTool);

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: conversationHistory[convId],
    ...(tools.length > 0 && { tools }),
  });

  const choice = response.choices[0]?.message;
  const llmResponse = choice?.content ?? '';
  conversationHistory[convId].push({ role: 'assistant', content: llmResponse });

  // Send response via the channel that delivered the message
  await channel.sendResponse(convId as ConversationId, llmResponse);

  // Uniform tool dispatch. On voice, CR protocol tools are auto-shipped via the
  // WebSocket by executeTool. On sms/chat, messaging tools are plain functions.
  for (const call of choice?.tool_calls ?? []) {
    await channel.executeTool(
      convId as ConversationId,
      call.function.name,
      JSON.parse(call.function.arguments)
    );
  }
});

const server = new TACServer(tac);
await server.start();
```

> **Note**: The framework defaults to port 3000 (configurable via `TACServer` constructor). Examples override to port 8000 to avoid conflicts with common development services. For production, consider using the default or setting via environment configuration.

> **Note**: See the [getting started guide](getting_started/README.md) for complete setup instructions and `.env` configuration details.

**That's it!** The server automatically:
- Creates Fastify app with `/twiml`, `/ws`, and `/webhook` endpoints
- Handles both Voice and SMS conversations
- Provides conversation memory and user profile in the `msg.conversation` bundle
- Routes responses through the appropriate channel

For configuration details and environment variables, see the [getting started guide](getting_started/README.md).

### Customizing the Server

`TACServer` exposes its underlying Fastify instance as `server.fastify` so you can add hooks, plugins, or extra routes (e.g. a health check for your load balancer):

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { TACServer } from 'twilio-agent-connect';

// Optional: pass your own Fastify instance to customize logger, trustProxy, etc.
const app = Fastify({ logger: true, trustProxy: true });
await app.register(cors, { origin: '*' });

const server = new TACServer(tac, { fastifyInstance: app });

// Add routes alongside TAC's voice/messaging/CI webhooks
server.fastify.get('/health', async () => ({ status: 'ok' }));

await server.start();
```

## How It Works

TAC simplifies building AI agents by handling the integration between Twilio's communication channels and your LLM:

### Message Flow

1. **Webhook/Connection Received**: Twilio sends webhook (SMS) or WebSocket connection (Voice) to your server
2. **Channel Processing**: Channel validates and processes the incoming event
3. **Memory Retrieval**: TAC optionally retrieves user memories and profile from Memory
4. **Callback Invoked**: Your `onMessageReady` callback receives user message, context, and optional memory response
5. **LLM Integration**: Your code calls LLM with message and memories, sends response through the appropriate channel

For detailed architecture and advanced usage, see [CLAUDE.md](CLAUDE.md).

## Real-time conversation control (voice)

Voice calls have turn-taking signals that SMS and chat don't — caller interruptions, DTMF keypresses, and silence. TAC surfaces all three as `ChannelMessage` events with `messageType: 'system'` (so your LLM loop can skip them) and a discriminator in `metadata.type`.

### Interruptions (caller speaks over the agent)

When the caller cuts in while the agent is speaking, ConversationRelay sends an `interrupt` frame:

```json
{
  "type": "interrupt",
  "utteranceUntilInterrupt": "Sure, let me help you with",
  "durationUntilInterruptMs": 1342
}
```

- `utteranceUntilInterrupt` — the slice of TTS the caller actually *heard* before cutting in. Anything after this was never spoken.
- `durationUntilInterruptMs` — ms into the agent's TTS turn when the interruption fired.

Your handler has two responsibilities the framework cannot do for you:

1. **Abort the in-flight LLM stream.** Hold an `AbortController` per call and call `.abort()` — otherwise tokens keep streaming into TTS after the caller cuts in.
2. **Truncate the last assistant turn** in history to `utteranceUntilInterrupt`. Otherwise the next LLM call carries text the caller never heard, and multi-turn accuracy degrades fast.

See [getting_started/examples/conversation/src/index.ts](getting_started/examples/conversation/src/index.ts) and [getting_started/examples/crelay/src/index.ts](getting_started/examples/crelay/src/index.ts) for the working pattern.

### DTMF (keypad input)

Keypresses arrive as a `ChannelMessage` with `metadata.type: 'dtmf'` and the digit in `metadata.digit`. Route them in your `onMessageReady` callback (or `onDtmf` if using `ConversationRelay` directly) — typical use is IVR-style menus or collecting account/PIN numbers mid-call.

### Silence detection and listen-mode

The CR package ships a `SilenceDetector` class for idle-call detection (prompt the caller, escalate, or hang up after N seconds of silence). Listen-mode is a user-space pattern — gate your LLM loop on a `Map<ConversationId, boolean>` so specific calls go mute without tearing down the connection. Recipes and examples: [packages/conversationrelay/README.md](packages/conversationrelay/README.md).

## Learn More

**Examples & Guides:**
- **[Getting Started Guide](getting_started/)** - Examples and comprehensive documentation
- **[Conversation Example](getting_started/examples/conversation/)** - Multi-channel example with Voice and SMS (`conversation` mode)
- **[Chat Example](getting_started/examples/chat/)** - Web chat with Twilio Conversations JS SDK
- **[CRelay Example](getting_started/examples/crelay/)** - Voice-only with ConversationRelay (`crelay` mode)

**Documentation:**
- **[CLAUDE.md](CLAUDE.md)** - Architecture, development guide, and API reference
- **[Getting Started Guide](getting_started/README.md)** - Setup instructions, environment variables, and troubleshooting

---

# TAC Development / Contribution

TAC uses npm workspaces for package management. Ensure you have Node.js and npm installed:

```bash
node --version  # Should be 22.13.0 or newer
npm --version   # Should be 9 or newer
```

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/twilio-innovation/twilio-agent-connect-typescript.git
cd twilio-agent-connect-typescript

# Install all dependencies
npm install

# Build all packages
npm run build
```

### Running Tests and Checks

```bash
# Format code
npm run format

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run all checks at once
npm run build && npm run lint && npm run typecheck && npm test
```

# TAC E2E Tests
[![Build status](https://badge.buildkite.com/7d2c17fcc93d8f8cff917730fb17ce8fa935c4e9009b6084ec.svg?branch=main)](https://buildkite.com/twilio/tac-e2e-tests-typescript)
