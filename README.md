# Twilio Agent Connect (TAC)

Twilio Agent Connect (TAC) is a powerful TypeScript library designed to simplify the development of intelligent,
context-aware applications using Twilio's communication technologies. TAC provides seamless integration with Twilio's
Memory and Conversation services, enabling you to build LLM-powered agents with persistent memory and conversation context.

> [!NOTE]
> Looking for the Python version? Check out [TAC SDK Python](https://github.com/twilio-innovation/twilio-agent-connect-python).

Explore the [getting_started](getting_started) directory to see the SDK in action.

## Key Features

- **Multi-Channel Support**: SMS, Voice (ConversationRelay), and Chat channels
- **Three Operating Modes**: CR-only (`crelay`), full Maestro (`conversation`), or BYO CR server (`passive`)
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

## Operating Modes

TAC supports three operating modes via the `TAC_MODE` environment variable:

| Mode | Description | Channels | Requires |
|------|-------------|----------|----------|
| `crelay` | Voice-only via ConversationRelay, no Maestro | `CRelayChannel` | — |
| `conversation` | Multi-channel with full Maestro integration | `VoiceChannel`, `SMSChannel`, `ChatChannel` | `CONVERSATION_SERVICE_ID` |
| `passive` | Maestro-only (bring your own CR server) | `VoiceWebhookChannel`, `SMSChannel`, `ChatChannel` | `CONVERSATION_SERVICE_ID` |

## Quick Examples

Create Memory and Conversation services through the [Twilio Console](https://1console.twilio.com), then configure your `.env` file (see the [getting started guide](getting_started/README.md) for details).

### Multi-Channel with OpenAI SDK

Build an AI agent that works across both Voice and SMS channels with conversation memory and user context. Requires `TAC_MODE=conversation`.

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

  const convId = msg.sessionId;

  if (!conversationHistory[convId]) {
    conversationHistory[convId] = [];
  }

  conversationHistory[convId].push({ role: 'user', content: msg.message });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: conversationHistory[convId],
  });

  const llmResponse = response.choices[0]?.message?.content ?? '';
  conversationHistory[convId].push({ role: 'assistant', content: llmResponse });

  // Send response based on channel
  if (msg.channel === 'voice') {
    await voiceChannel.sendResponse(msg.sessionId as ConversationId, llmResponse);
  } else if (msg.channel === 'sms') {
    await smsChannel.sendResponse(msg.sessionId as ConversationId, llmResponse);
  }
});

const server = new TACServer(tac);
await server.start();
```

> **Note**: See the [getting started guide](getting_started/README.md) for complete setup instructions and `.env` configuration details.

**That's it!** The server automatically:
- Creates Fastify app with `/twiml`, `/ws`, and `/webhook` endpoints
- Handles both Voice and SMS conversations
- Provides conversation memory and user profile in the `msg.conversation` bundle
- Routes responses through the appropriate channel

For configuration details and environment variables, see the [getting started guide](getting_started/README.md).

## How It Works

TAC simplifies building AI agents by handling the integration between Twilio's communication channels and your LLM:

### Message Flow

1. **Webhook/Connection Received**: Twilio sends webhook (SMS) or WebSocket connection (Voice) to your server
2. **Channel Processing**: Channel validates and processes the incoming event
3. **Memory Retrieval**: TAC optionally retrieves user memories and profile from Memory
4. **Callback Invoked**: Your `onMessageReady` callback receives user message, context, and optional memory response
5. **LLM Integration**: Your code calls LLM with message and memories, sends response through the appropriate channel

For detailed architecture and advanced usage, see [CLAUDE.md](CLAUDE.md).

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
