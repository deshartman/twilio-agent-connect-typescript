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
  - `VoiceChannel` has **two construction modes**: active (pass `{ conversationRelay }`) routes via CR WebSocket; passive (omit it) consumes Maestro webhooks only and throws on `sendResponse` / tool dispatch. Active-mode voice also needs a `CRelayServer` running — VoiceChannel just bridges CR events to Maestro, the routes live in `tac-conversationrelay`.
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
- **TACServer** (`packages/server/src/lib/server.ts`): Fastify-based Maestro webhook server. Voice routes (`/twiml`, `/ws`, `/conversation-relay-callback`) live on `CRelayServer` in `@twilio/tac-conversationrelay` — see the two-server architecture section below.

## Channel Architecture

TAC provides multi-channel conversation orchestration using Maestro Conversations Service.

### Channels
- **VoiceChannel (active mode)**: Voice calls via ConversationRelay WebSocket + Maestro. Construct with `new VoiceChannel(tac.getChannelDeps(), { conversationRelay: new ConversationRelay(logger) })`.
- **VoiceChannel (passive mode)**: Voice via Maestro webhooks only (BYO-CR or inbound-analysis flows). Construct with `new VoiceChannel(tac.getChannelDeps())` — no `conversationRelay`. `sendResponse` and tool dispatch throw because outbound voice requires a CR WS.
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

**Runtime**: twilio, fastify, @fastify/websocket (CRelayServer only), @fastify/formbody, ws, zod, pino, pino-pretty, dotenv, fastify-graceful-shutdown
**Dev**: typescript, tsup, vitest, @vitest/coverage-v8, eslint, prettier, rimraf, @types/node, @types/ws

## Two-Server Architecture

Voice and Conversation Orchestrator (Maestro) webhooks run on separate Fastify servers, typically on separate ports or processes. The split is enforced by the package layout: `@twilio/tac-conversationrelay` has **zero** dependency on `@twilio/tac-core`, so a voice-only deployment can ship CR alone and a Maestro-only deployment can ship TAC without voice code.

| Server | Package | Port (typical) | Routes | What it does |
|---|---|---|---|---|
| **CRelayServer** | `@twilio/tac-conversationrelay` | `:8001` | `/twiml`, `/ws`, `/conversation-relay-callback` | Voice stack. TwiML generation + WS protocol. |
| **TACServer** | `@twilio/tac-server` | `:8000` | `/webhook`, optional `/cintel` | Conversation Orchestrator fan-out. Hands events to SMS / Chat / passive Voice channels. |

Twilio voice numbers point at `https://<host>:8001/twiml`. Conversations Service webhooks point at `https://<host>:8000/webhook`.

### CRelayServer (`packages/conversationrelay/src/lib/server.ts`)

Standalone voice server. Two optional callbacks let users bridge into `tac-core`'s `VoiceChannel` without CR importing core:

```typescript
const conversationRelay = new ConversationRelay(logger);
const voiceChannel = new VoiceChannel(tac.getChannelDeps(), { conversationRelay });

const crServer = new CRelayServer(conversationRelay, {
  authToken: tac.getConfig().authToken,
  port: 8001,
  conversationRelayConfig: {
    welcomeGreeting: 'Welcome to our support line!',
    transcriptionProvider: 'Deepgram',
    ttsProvider: 'Google',
  },
  // Integrated mode — return plain data records; CR stays ignorant of Maestro.
  onIncomingCall: (input) => voiceChannel.createConversationForCall(input),
  onCRCallback:   (payload) => voiceChannel.handleConversationRelayCallback(payload),
});
```

- `onIncomingCall` returns `Record<string, string>` — the customParameters that get spliced into the `<ConversationRelay>` TwiML element. CR always calls `conversationRelay.generateTwiML()` itself. Omit the callback for standalone mode (caller drives their own LLM via CR events); CR will use `{ conversation_id: CallSid }`.
- `onCRCallback` returns `{ status, content, contentType }` — the HTTP response. Omit for standalone (200 OK no-op; caller handles call-end via `cr.onSessionEnded`).
- Turn-by-turn traffic (`onPrompt` / `onInterrupt` / `onDtmf` / `onInfo`) does **not** go through callbacks. VoiceChannel subscribes to these on the shared `ConversationRelay` instance in its constructor and emits `ChannelMessage`s via `onMessageReady` — the regular data path, unchanged.

### TACServer (`packages/server/src/lib/server.ts`)

Maestro-only webhook server. Default configuration:

```typescript
{
  host: '0.0.0.0',
  port: 3000,
  webhookPaths: { messaging: '/webhook' },
  development: false,
}
```

Route registration:

- **`/webhook` (POST)** — registered when `config.conversationChannels` is non-empty (or TAC has an SMS/Chat/passive-Voice channel registered). Fans out every incoming webhook to all channels via `channel.processWebhook?.(body, idempotencyToken)`; each channel self-filters on `author.channel`.
- **`/cintel` (POST)** — registered only when `webhookPaths.cintel` is set.

`conversationChannels: Channel[]` is the fan-out array; passing the same channel via both `tac.registerChannel(channel)` and `config.conversationChannels: [channel]` is redundant — the server falls back to TAC's registry if the field is omitted. **Passive VoiceChannel belongs in this array** — it consumes Maestro webhooks exactly like SMS/Chat.

### Signature Validation

Always-on. Both servers validate `X-Twilio-Signature` via the shared helper in `@twilio/tac-conversationrelay/src/lib/signature.ts`:

- `registerSignatureValidation` — global `preHandler` hook for POST routes. Form-encoded bodies validate via parsed params; JSON bodies (`?bodySHA256=...`) via a raw-body content-type parser.
- `validateWebSocketSignature` — inline check in the `/ws` handler (Fastify doesn't run `preHandler` on upgrades). Forces `wss://` because that's what Twilio signs against from the TwiML.

## Pull Requests

When creating PRs, read and fill in `.github/PULL_REQUEST_TEMPLATE.md`.
