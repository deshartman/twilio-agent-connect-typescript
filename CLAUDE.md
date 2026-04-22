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
  conversationrelay/  # Standalone ConversationRelay: WebSocket protocol,
               #   TwiML generation, can be used independently of TAC
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
  - `VoiceChannel` implements `Channel` interface directly
  - All channels share same `channelType: 'voice'` for voice channels
- **Channel construction**: All channels take `{ config, logger, conversationClient, memoryRetriever? }` via `tac.getChannelDeps()`
- **Callback pattern**: `onMessageReady(msg: ChannelMessage)` — unified callback for all message types with `messageType: 'user'|'system'` discriminator. Also `onHandoff`, `onConversationEnded`, `onError`
- **Tool system** (`packages/tools/src/lib/builder.ts`): `defineTool()` with JSON schema; supports conversion to OpenAI and Anthropic formats
- **Config via Zod** (`packages/core/src/lib/config.ts`): `TACConfig.fromEnv()` validates env vars
- **API client architecture** (`packages/core/src/clients/`):
  - `BaseClient` abstract class provides common HTTP functionality using **axios**
  - All API clients (Memory, Conversation, Knowledge) inherit from BaseClient
  - **HTTP client**: axios with axios-retry for resilience
  - **Automatic retry**: 3 retries with exponential backoff; retries idempotent methods on 5xx and 429 responses, non-idempotent methods only on network/no-response failures
  - **Timeout**: Fixed 30-second timeout for all requests
  - **Redirect handling**: Follows up to 5 redirects; preserves Authorization header for same-origin redirects only (prevents credential leaks to malicious redirect targets)
  - **Authentication**: Automatic Basic Auth using Twilio API credentials
  - **User-Agent**: Automatic header injection (`twilio-agent-connect-typescript/{version}`)
  - **JSON handling**: Automatic serialization/deserialization
  - **Type safety**: Generic type parameters on `makeRequest<T>()` for better IDE support
  - **Validation**: Zod schemas validate all responses at runtime
  - **Error logging**: Logs 4xx client errors as warnings, 5xx/network failures as errors via interceptors
  - **Branded types**: Compile-time type safety for domain identifiers (`ConversationId`, `MemoryStoreId`, `ProfileId`, `KnowledgeBaseId`, `KnowledgeId`, `ParticipantId`)
  - Credentials consolidated at `TACConfig` level (apiKey/apiSecret shared across clients)
- **TACServer** (`packages/server/src/lib/server.ts`): Fastify-based server with mode-conditional route registration — no dead routes in any mode

## Channel Architecture

TAC provides multi-channel conversation orchestration using Maestro Conversations Service.

### Channels
- **VoiceChannel**: Voice calls via ConversationRelay WebSocket + Maestro
- **SMSChannel**: SMS messages via Maestro webhooks
- **ChatChannel**: Web chat via Maestro webhooks
- **VoiceWebhookChannel**: (Advanced) Voice via webhooks only - manual construction for BYO CR server

### Session Identity
- Session ID is always `ConversationId` (Maestro conversation identifier)
- Single conversation thread across all channels (voice, SMS, chat)
- Session identity provided via `TWILIO_CONVERSATION_CONFIGURATION_ID` (required)

### Unified ChannelMessage

All channels emit a unified `ChannelMessage` via `onMessageReady`:
```typescript
{
  conversationId: ConversationId;  // Maestro conversation identifier
  messageType: 'user' | 'system';  // 'user' = generate response, 'system' = context only
  message: string;                 // Human-readable text for LLM
  channel: ChannelType;            // 'voice' | 'sms' | 'chat'
  metadata?: Record<string, unknown>;  // Source type in metadata.type
  conversation?: { ... };          // Maestro conversation context (memory, profile, etc.)
}
```

### Channel Construction

All channels take explicit dependencies via `tac.getChannelDeps()`:
```typescript
const channel = new VoiceChannel(tac.getChannelDeps());
// or manually: new VoiceChannel({ config, logger, conversationClient, memoryRetriever })
```

The `getChannelDeps()` method returns:
- `config`: TACConfig instance
- `logger`: Pino logger
- `conversationClient`: ConversationClient (always available - TWILIO_CONVERSATION_CONFIGURATION_ID is required)
- `memoryRetriever`: MemoryRetriever function (if Memory is configured)

## Participant Management: Race Condition Handling

Maestro capture rules and TAC's explicit `addParticipant()` calls can race when both try to add participants simultaneously. VoiceChannel uses `addOrFetchParticipant()` which checks first, then adds if missing, and catches 409 Conflict to re-fetch what Maestro added. Use `addOrFetchParticipant()` instead of `addParticipant()` to handle this race condition gracefully.

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
    messaging: '/webhook',
    twiml: '/twiml',
    ws: '/ws',
    conversationRelayCallback: '/conversation-relay-callback',
  },
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! Set up your welcome greeting in the server config.',
  },
  development: false,
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

### Server Routes

TACServer registers the following routes for multi-channel conversation orchestration:
- **Voice routes**: WebSocket endpoint (`/ws`), TwiML webhook (`/twiml`), ConversationRelay callback (`/conversation-relay-callback`)
- **Messaging routes**: Maestro webhook endpoint (`/webhook`) for SMS, Chat, and voice webhook events
- **Optional routes**: Conversation Intelligence webhook (`/cintel`) - only registered if `webhookPaths.cintel` is configured

All routes are registered automatically based on channel availability. The server supports full Maestro integration with ConversationRelay WebSocket for voice.

## Pull Requests

When creating PRs, read and fill in `.github/PULL_REQUEST_TEMPLATE.md`.
