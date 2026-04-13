# Twilio Agent Connect - TypeScript SDK

A TypeScript framework for building AI-powered conversational agents on Twilio infrastructure. Provides channel abstractions (SMS, Voice), tool integration, memory/knowledge APIs, and a production-ready Fastify server — designed for 1:1 parity with the [Python SDK](https://github.com/twilio-innovation/twilio-agent-connect-python).

## Development Commands

```bash
npm run build          # Build all packages (tsup)
npm run clean          # Remove dist/ directories
npm run test           # Run tests once (vitest --run)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with v8 coverage
npm run lint           # ESLint check
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check only
npm run typecheck      # tsc --noEmit
```

## Package Structure

```
packages/
  core/        # Central framework: TAC orchestrator, channels (SMS/Voice),
               #   API clients (Memory, Conversation, Knowledge), config, types
  tools/       # Tool system: TACTool class, defineTool(), built-in tools
               #   (memory, messaging, handoff, knowledge)
  server/      # TACServer: Fastify wrapper with webhook + WebSocket handlers
src/
  index.ts     # Root re-export of all three packages (single entry point)
tests/         # Vitest test suite
getting_started/  # Example apps (OpenAI integration)
```

## Code Conventions

- **TypeScript strict mode** with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Zod** for all runtime validation and type inference (`z.infer<typeof Schema>`)
- **ESM only** (`"type": "module"`) — imports use `.js` extensions in compiled output
- **Prettier**: single quotes, trailing commas (es5), 100 char width, no parens on single arrow params
- **ESLint**: `@typescript-eslint` with type-checking; unused vars prefixed `_` are allowed; explicit return types warned
- **Naming**: PascalCase classes, camelCase functions/variables
- **Logging**: Pino with hierarchical child loggers tagged by component

## Key Architecture

- **TAC class** (`packages/core/src/lib/tac.ts`): Central orchestrator managing config, channels, callbacks, and API clients
- **TAC composition** (`packages/core/src/lib/tac.ts`): Channels are composed into TAC (held by reference), not inherited from TAC. TAC stores channels in `Map<ChannelType, Channel>` and delegates to them
- **Channel inheritance hierarchy** (`packages/core/src/channels/`):
  - Messaging channels (`SMSChannel`, `ChatChannel`, `VoiceWebhookChannel`) extend abstract `MessagingChannel` base class for shared webhook handling logic
  - Non-messaging channels (`CRelayChannel`, `VoiceChannel`) implement `Channel` interface directly
  - All channels share same `channelType: 'voice'` for voice channels (differentiated by TAC mode: crelay/conversation/passive)
- **Channel construction**: Maestro channels take `{ config, logger, conversationClient, memoryRetriever? }`, CRelayChannel takes `logger` only
- **Callback pattern**: `onMessageReady(msg: ChannelMessage)` — unified callback for all message types with `messageType: 'user'|'system'` discriminator. Also `onHandoff`, `onConversationEnded`, `onError`
- **Tool system** (`packages/tools/src/lib/builder.ts`): `defineTool()` with JSON schema; supports conversion to OpenAI and Anthropic formats
- **Config via Zod** (`packages/core/src/lib/config.ts`): `TACConfig.fromEnv()` validates env vars; environment-aware API URL computation (dev/stage/prod)
- **API credentials consolidated** at `TACConfig` level (twilioApiKey/twilioApiToken shared across Memory, Conversation, Knowledge clients)
- **TACServer** (`packages/server/src/lib/server.ts`): Fastify-based server with mode-conditional route registration — no dead routes in any mode

## Channel Architecture

TAC provides three operating modes, selected via `TAC_MODE`:

### CRelayChannel (CR-only mode)
- **Mode**: `TAC_MODE=crelay`
- **Use case**: Voice-only applications without Maestro Conversations Service
- **Channels**: `CRelayChannel` only (wraps `CRelayVoice` from CR package)
- **Features**: WebSocket voice protocol, basic session tracking, all CR events (setup, prompt, interrupt, dtmf, info)
- **No**: ConversationClient, Memory, Knowledge, multi-channel
- **Session ID**: CallSid
- **Import**: `import { CRelayChannel } from '@twilio/tac-core'`

### VoiceChannel + SMS/Chat (Conversation mode)
- **Mode**: `TAC_MODE=conversation`
- **Use case**: Multi-channel with full Maestro integration
- **Channels**: `VoiceChannel` (CR + Maestro), `SMSChannel`, `ChatChannel`
- **Features**: Memory, profiles, multi-channel orchestration, participant management, rich CR events
- **Requires**: `CONVERSATION_SERVICE_ID`
- **Session ID**: ConversationId from Maestro
- **Import**: `import { VoiceChannel, SMSChannel, ChatChannel } from '@twilio/tac-core'`

### VoiceWebhookChannel + SMS/Chat (Passive mode)
- **Mode**: `TAC_MODE=passive`
- **Use case**: BYO ConversationRelay server, TAC handles Maestro orchestration only
- **Channels**: `VoiceWebhookChannel`, `SMSChannel`, `ChatChannel`
- **Features**: Same Maestro features as conversation mode, but no WebSocket/TwiML routes
- **Requires**: `CONVERSATION_SERVICE_ID`
- **Session ID**: ConversationId from Maestro
- **Import**: `import { VoiceWebhookChannel, SMSChannel, ChatChannel } from '@twilio/tac-core'`

### Unified ChannelMessage

All channels emit a unified `ChannelMessage` via `onMessageReady`:
```typescript
{
  sessionId: SessionId;             // CallSid (CR) or ConversationId (Maestro)
  messageType: 'user' | 'system';  // 'user' = generate response, 'system' = context only
  message: string;                 // Human-readable text for LLM
  channel: ChannelType;            // 'voice' | 'sms' | 'chat'
  metadata?: Record<string, unknown>;  // Source type in metadata.type
  conversation?: { ... };          // Only in conversation/passive modes (Maestro)
}
```

### Session Identity Types

Each layer uses the appropriate branded type:
- **Channel interface / TAC**: `SessionId = CallSid | ConversationId` — the honest union abstraction
- **CRelayChannel**: `CallSid` internally — CR-specific call identifier
- **Maestro channels**: `ConversationId` internally — Maestro conversation identifier
- **Tools package**: `ConversationId` — Maestro-specific (handoff contract redesign pending)

`ChannelMessage.sessionId` is typed as `SessionId`, so `msg.sessionId` flows directly to `sendResponse()` without casts in CR mode. Conversation-mode examples calling concrete Maestro channel types cast `msg.sessionId as ConversationId`.

### Channel Construction

Maestro channels (VoiceChannel, SMSChannel, ChatChannel, VoiceWebhookChannel) take explicit deps:
```typescript
const channel = new SMSChannel(tac.getChannelDeps());
// or manually: new SMSChannel({ config, logger, conversationClient, memoryRetriever })
```

CRelayChannel takes only a logger (bare parameter, not destructured):
```typescript
const channel = new CRelayChannel(createLogger({ name: 'app' }));
```

## Participant Management: Race Condition Handling

Maestro capture rules (passive ingestion) and TAC's `addParticipant()` calls (active ingestion) can race. VoiceChannel uses `addOrFetchParticipant()` which checks first, then adds if missing, and catches 409 Conflict to re-fetch what Maestro added. Use `addOrFetchParticipant()` instead of `addParticipant()` when both ingestion modes are active.

## Dependencies

**Runtime**: twilio, fastify, @fastify/websocket, @fastify/formbody, ws, zod, pino, pino-pretty, dotenv, fastify-graceful-shutdown
**Dev**: typescript, tsup, vitest, @vitest/coverage-v8, eslint, prettier, rimraf, @types/node, @types/ws

## TACServer Configuration

The `TACServer` class (`packages/server/src/lib/server.ts`) provides a production-ready Fastify server with sensible defaults:

### Default Configuration

```typescript
{
  voice: { host: '0.0.0.0', port: 3000 },
  webhookPaths: {
    sms: '/webhook',
    twiml: '/twiml',
    ws: '/ws',
    conversationRelayCallback: '/conversation-relay-callback',
  },
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! How can I assist you today?',
  },
  development: false,
  validateWebhooks: true,
}
```

### Customizing Voice Greeting

The default `welcomeGreeting` is automatically applied to all voice calls. Customize it via `conversationRelayConfig`:

```typescript
const server = new TACServer(tac, {
  conversationRelayConfig: {
    welcomeGreeting: 'Welcome to our support line!',
    welcomeGreetingInterruptible: 'any',
    transcriptionProvider: 'Deepgram',
    ttsProvider: 'Google',
  },
});
```

All ConversationRelay attributes except `url` are supported (see `packages/conversationrelay/src/types.ts`). The `url` field is automatically set by the server based on the request host and WebSocket path.

### Mode-Conditional Routes

TACServer only registers routes needed for the active mode:
- **crelay**: WebSocket + TwiML + ConversationRelay callback + silent sink on `/webhook` (gracefully handles Maestro events if user has a Conversations Service webhook URL on the same domain)
- **conversation**: WebSocket + TwiML + CR callback + messaging webhook + cintel (if configured)
- **passive**: messaging webhook + cintel (if configured) — no WebSocket, TwiML, or CR callback

## Pull Requests

When creating PRs, read and fill in `.github/PULL_REQUEST_TEMPLATE.md`.
