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
- **Channel composition** (`packages/core/src/channels/`):
  - All channels (`SMSChannel`, `ChatChannel`, `VoiceChannel`) `implements Channel` directly — no inheritance. Shared webhook logic lives in `channels/utility.ts` and is composed (not inherited): `ConversationSessionStore` (session Map), `ConversationsWebhookProcessor` (dedup + event routing), and `ensureAgentParticipant` (pure 409-retry helper).
  - `VoiceChannel` has **two construction modes**: active (pass `{ conversationRelay }`) routes via CR WebSocket; passive (omit it) consumes Maestro webhooks only and throws on `sendResponse` / tool dispatch / TwiML generation.
- **Channel construction**: All channels take `{ config, logger, conversationClient, memoryRetriever? }` via `tac.getChannelDeps()`, plus an optional channel-specific config object for settings scoped to that channel (e.g. `ChatChannelConfig.conversationsV1ServiceSid`, `VoiceChannelConfig.conversationRelay`).
- **Callback pattern**: `onMessageReady(msg: ChannelMessage)` — unified callback for all message types with `messageType: 'user'|'system'` discriminator. Also `onHandoff`, `onConversationEnded`, `onError`
- **Callback responses**: `onMessageReady` callbacks may return `string` (auto-sent via the originating channel's `sendResponse`) or `void`/`null` (manual handling). Empty string is logged and skipped.
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
- **VoiceChannel (active mode)**: Voice calls via ConversationRelay WebSocket + Maestro. Construct with `new VoiceChannel(tac.getChannelDeps(), { conversationRelay: new ConversationRelay(logger) })`.
- **VoiceChannel (passive mode)**: Voice via Maestro webhooks only (BYO-CR or inbound-analysis flows). Construct with `new VoiceChannel(tac.getChannelDeps())` — no `conversationRelay`. `sendResponse` / tool dispatch / TwiML generation throw because outbound voice requires a CR WS.
- **SMSChannel**: SMS via Maestro webhooks in, Actions API `SEND_MESSAGE` out.
- **ChatChannel**: Web chat via Maestro webhooks in, Actions API `SEND_MESSAGE` out. Takes optional `conversationsV1ServiceSid` via its own config for V1 Chat backend routing.

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

All channels take explicit dependencies via `tac.getChannelDeps()`, plus an optional channel-specific config:

```typescript
import { ConversationRelay } from 'twilio-agent-connect';

// VoiceChannel, active mode (CR strapped in)
const conversationRelay = new ConversationRelay(tac.logger.child({ component: 'crelay' }));
const voiceChannel = new VoiceChannel(tac.getChannelDeps(), { conversationRelay });

// VoiceChannel, passive mode (webhook-only; no outbound)
const passiveVoice = new VoiceChannel(tac.getChannelDeps());

// SMSChannel
const smsChannel = new SMSChannel(tac.getChannelDeps());

// ChatChannel — pass conversationsV1ServiceSid explicitly (scoped to chat, not shared)
const chatChannel = new ChatChannel(tac.getChannelDeps(), {
  conversationsV1ServiceSid: tac.conversationsV1ServiceSid,
});
```

The `getChannelDeps()` method returns:
- `config`: TACConfig instance
- `logger`: Pino logger
- `conversationClient`: ConversationClient (always available - TWILIO_CONVERSATION_CONFIGURATION_ID is required)
- `memoryRetriever`: MemoryRetriever function (if Memory is configured)

`tac.conversationsV1ServiceSid` is cached from `conversationConfig.conversationsV1Bridge?.serviceId` at init. It's forwarded by `ChatChannel.sendResponse` as `channelSettings.chatService` so the V1 Chat backend picks the right thread. Temporary — tagged `TODO(conv-orch)` throughout; drop when the Actions API resolves this server-side.

### Channels composing your own

Anyone building a custom channel should `implements Channel` directly and compose these helpers from `@twilio/tac-core`:

- `ConversationSessionStore` — per-channel `Map<ConversationId, ConversationSession>` with start/end/get/isActive + lifecycle callbacks
- `ConversationsWebhookProcessor` — per-channel dedup Set + event router (`CONVERSATION_CREATED`, `PARTICIPANT_ADDED`, `COMMUNICATION_CREATED`, `CONVERSATION_UPDATED`) with self-filtering on `author.channel`
- `ensureAgentParticipant` — pure function: finds an AI_AGENT / HUMAN_AGENT / AGENT matching a channel+address in a participant list, lazy-creates one if missing, handles 409 races

`MessagingChannel` and `VoiceWebhookChannel` are deleted; do not reintroduce inheritance.

## Send API — Actions, not Communications

SMS and Chat outbound uses the Conversation Orchestrator Actions API: `POST /v2/Conversations/{id}/Actions` with `{ type: 'SEND_MESSAGE', payload: { from, to, content, channelSettings? } }`. Call `conversationClient.createAction(...)`, not `sendCommunication` (deleted — `/v2/Communications` is retired and returns 404). Voice outbound goes via ConversationRelay's WebSocket (`voiceChannel.sendResponse` in active mode) because the Actions API rejects `channel: 'VOICE'`.

## Participant Management: Race Condition Handling

Maestro capture rules and TAC's explicit `addParticipant()` calls can race when both try to add participants simultaneously. VoiceChannel uses `addOrFetchParticipant()` which checks first, then adds if missing, and catches 409 Conflict to re-fetch what Maestro added. SMSChannel and ChatChannel use the shared `ensureAgentParticipant` helper from `channels/utility.ts` which handles the same pattern. Do not call `addParticipant()` directly if there's any chance of concurrent adds.

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

TACServer registers routes conditionally based on what's configured:

- **Voice routes** — `/twiml` (POST), `/ws` (GET, WebSocket upgrade), `/conversation-relay-callback` (POST). Registered **only** when a `VoiceChannel` is present (either passed via `config.voiceChannel` or registered on TAC via `tac.registerChannel`). SMS/Chat-only deployments get 404s on these paths rather than dead 500s.
- **Messaging route** — `/webhook` (POST). Registered when `config.conversationChannels` is non-empty (or TAC has an SMS/Chat channel registered). Fans out every incoming webhook to all channels in `conversationChannels` via `channel.processWebhook?.(body, idempotencyToken)`; each channel self-filters on `author.channel`. The optional `?.` is important — channels that don't consume webhooks safely sit in the array.
- **Conversation Intelligence route** — `/cintel` (POST). Registered only when `webhookPaths.cintel` is set.

The config field is `conversationChannels: Channel[]` (renamed from `messagingChannels`; type widened from `MessagingChannel[]`). Passing the same channel instance via both `tac.registerChannel(channel)` and `config.conversationChannels: [channel]` is redundant — the server falls back to TAC's registry if the field is omitted.

All route registration happens at `server.start()` time.

### Signature Validation

Twilio webhook signature validation is always-on (see PR #69, follow-up fix `bf422f6`). `/webhook` and `/conversation-relay-callback` validate `X-Twilio-Signature` via a global `preHandler` hook. The `/ws` route validates in its own handler because Fastify doesn't run `preHandler` on WebSocket upgrades. Form-encoded bodies are validated via parsed params; JSON bodies (`?bodySHA256=...`) via a custom content-type parser that preserves the raw body string. The WebSocket URL is rebuilt with `wss://` (or `ws://` for local) because that's what Twilio signs against from the TwiML.

## Pull Requests

When creating PRs, read and fill in `.github/PULL_REQUEST_TEMPLATE.md`.
