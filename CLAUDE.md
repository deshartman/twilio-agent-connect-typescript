# Twilio Agent Connect - TypeScript SDK

A TypeScript framework for building AI-powered conversational agents on Twilio infrastructure. Provides channel abstractions (SMS, Chat, passive Voice, active CR-backed voice), tool integration, memory/knowledge APIs, and a production-ready Fastify server — designed for 1:1 parity with the [Python SDK](https://github.com/twilio-innovation/twilio-agent-connect-python).

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
  core/        # Central framework: TAC orchestrator, channels (SMS/Chat/
               #   Voice/CRelay), API clients (Memory, Conversation,
               #   Knowledge), config, types
  conversationrelay/  # Standalone ConversationRelay: manager + per-WS session,
               #   ToolRegistry, WebSocket protocol, TwiML generation,
               #   can be used independently of TAC
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
  - All channels (`SMSChannel`, `ChatChannel`, `VoiceChannel`, `ConversationRelayChannel`) `implements Channel` directly — no inheritance. Shared webhook logic lives in `channels/utility.ts` and is composed (not inherited): `ConversationSessionStore` (session Map), `ConversationsWebhookProcessor` (dedup + event routing), and `ensureAgentParticipant` (pure 409-retry helper).
  - Active voice (CR↔Maestro bridge) is its own channel — `ConversationRelayChannel`, `channelType === 'crelay'`. It is the only core file that imports from `@twilio/tac-conversationrelay`. `VoiceChannel` is passive-only (webhook-in, no outbound) with `channelType === 'voice'` and zero CR dependency.
- **Channel construction**: All channels take `{ config, logger, conversationClient, memoryRetriever? }` via `tac.getChannelDeps()`, plus an optional channel-specific config object for settings scoped to that channel (e.g. `ChatChannelConfig.conversationsV1ServiceSid`, `ConversationRelayChannelConfig.conversationRelay`).
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
- **TACServer** (`packages/server/src/lib/server.ts`): Fastify-based Maestro webhook server. Voice routes (`/twiml`, `/ws`, `/conversation-relay-callback`) live on `ConversationRelayServer` in `@twilio/tac-conversationrelay` — see the two-server architecture section below.

## Channel Architecture

TAC provides multi-channel conversation orchestration using Maestro Conversations Service.

### Channels
- **ConversationRelayChannel** (`channelType: 'crelay'`): Active voice. Bridges CR WebSocket events (setup/prompt/interrupt/dtmf/info/close) to Maestro and emits unified `ChannelMessage`s. Outbound text/dtmf/play/endCall via the per-call `ConversationRelaySession` handle. Requires a `ConversationRelay` instance and a `ConversationRelayServer` running alongside. Only file in core that imports `@twilio/tac-conversationrelay`.
- **VoiceChannel** (`channelType: 'voice'`): Passive. Maestro voice webhooks in; no outbound (Actions API rejects `channel: 'VOICE'`). For BYO-CR flows or inbound-analysis pipelines. `sendResponse` and tool dispatch throw.
- **SMSChannel**: SMS via Maestro webhooks in, Actions API `SEND_MESSAGE` out.
- **ChatChannel**: Web chat via Maestro webhooks in, Actions API `SEND_MESSAGE` out. Takes optional `conversationsV1ServiceSid` via its own config for V1 Chat backend routing.

`ChannelMessage.channel === 'crelay'` for active voice (not `'voice'`) — discriminating consumers must match on both.

### Session Identity
- Session ID is always `ConversationId` (Maestro conversation identifier)
- Single conversation thread across all channels (voice, SMS, chat)
- Session identity provided via `TWILIO_CONVERSATION_CONFIGURATION_ID` (required)

### Unified ChannelMessage

All channels emit a unified `ChannelMessage` via `onMessageReady`. Fields: `conversationId: ConversationId`, `messageType: 'user' | 'system'` (discriminator — `'user'` triggers LLM turn, `'system'` is context-only), `message: string` (text for LLM), `channel: ChannelType` (one of `'sms' | 'voice' | 'chat' | 'crelay'`), optional `metadata: Record<string, unknown>` (source type in `metadata.type`), optional `conversation` (Maestro context: memory, profile, etc.).

### Channel Construction

All channels take explicit dependencies via `tac.getChannelDeps()` plus an optional channel-specific config. Construction shapes:

- `new SMSChannel(tac.getChannelDeps())`
- `new VoiceChannel(tac.getChannelDeps())` — passive only
- `new ChatChannel(tac.getChannelDeps(), { conversationsV1ServiceSid: tac.conversationsV1ServiceSid })`
- `new ConversationRelayChannel(tac.getChannelDeps(), { conversationRelay })` — `conversationRelay` is a `new ConversationRelay(logger)` instance that a `ConversationRelayServer` is also bound to

`getChannelDeps()` returns `config`, `logger`, `conversationClient` (always — `TWILIO_CONVERSATION_CONFIGURATION_ID` is required), and `memoryRetriever` (if Memory is configured).

`tac.conversationsV1ServiceSid` is cached from `conversationConfig.conversationsV1Bridge?.serviceId` at init. It's forwarded by `ChatChannel.sendResponse` as `channelSettings.chatService` so the V1 Chat backend picks the right thread. Temporary — tagged `TODO(conv-orch)` throughout; drop when the Actions API resolves this server-side.

### Channels composing your own

Anyone building a custom channel should `implements Channel` directly and compose these helpers from `@twilio/tac-core`:

- `ConversationSessionStore` — per-channel `Map<ConversationId, ConversationSession>` with start/end/get/isActive + lifecycle callbacks
- `ConversationsWebhookProcessor` — per-channel dedup Set + event router (`CONVERSATION_CREATED`, `PARTICIPANT_ADDED`, `COMMUNICATION_CREATED`, `CONVERSATION_UPDATED`) with self-filtering on `author.channel`
- `ensureAgentParticipant` — pure function: finds an AI_AGENT / HUMAN_AGENT / AGENT matching a channel+address in a participant list, lazy-creates one if missing, handles 409 races

`MessagingChannel` and `VoiceWebhookChannel` are deleted; do not reintroduce inheritance.

## Send API — Actions, not Communications

SMS and Chat outbound uses the Conversation Orchestrator Actions API: `POST /v2/Conversations/{id}/Actions` with `{ type: 'SEND_MESSAGE', payload: { from, to, content, channelSettings? } }`. Call `conversationClient.createAction(...)`, not `sendCommunication` (deleted — `/v2/Communications` is retired and returns 404). Active voice outbound goes via ConversationRelay's WebSocket through `ConversationRelayChannel.sendResponse` (which delegates to the per-call `ConversationRelaySession`) because the Actions API rejects `channel: 'VOICE'`. Passive `VoiceChannel` has no outbound path — `sendResponse` throws.

## Participant Management: Race Condition Handling

Maestro capture rules and TAC's explicit `addParticipant()` calls can race when both try to add participants simultaneously. `ConversationRelayChannel` uses `addOrFetchParticipant()` which checks first, then adds if missing, and catches 409 Conflict to re-fetch what Maestro added. SMSChannel, ChatChannel, and passive VoiceChannel use the shared `ensureAgentParticipant` helper from `channels/utility.ts` which handles the same pattern. Do not call `addParticipant()` directly if there's any chance of concurrent adds.

## Dependencies

**Runtime**: twilio, fastify, @fastify/websocket (ConversationRelayServer only), @fastify/formbody, ws, zod, pino, pino-pretty, dotenv, fastify-graceful-shutdown
**Dev**: typescript, tsup, vitest, @vitest/coverage-v8, eslint, prettier, rimraf, @types/node, @types/ws

## Two-Server Architecture

Voice and Conversation Orchestrator (Maestro) webhooks run on separate Fastify servers, typically on separate ports or processes. The split is enforced by the package layout: `@twilio/tac-conversationrelay` has **zero** dependency on `@twilio/tac-core`, so a voice-only deployment can ship CR alone and a Maestro-only deployment can ship TAC without voice code.

| Server | Package | Port (typical) | Routes | What it does |
|---|---|---|---|---|
| **ConversationRelayServer** | `@twilio/tac-conversationrelay` | `:8001` | `/twiml`, `/ws`, `/conversation-relay-callback` | Voice stack. TwiML generation + WS protocol. |
| **TACServer** | `@twilio/tac-server` | `:8000` | `/webhook`, optional `/cintel` | Conversation Orchestrator fan-out. Hands events to SMS / Chat / passive Voice channels. |

Twilio voice numbers point at `https://<host>:8001/twiml`. Conversations Service webhooks point at `https://<host>:8000/webhook`.

### ConversationRelayServer (`packages/conversationrelay/src/lib/server.ts`)

Standalone voice server. Two optional callbacks let users bridge into `tac-core`'s `ConversationRelayChannel` without CR importing core:

- `onIncomingCall` returns `Record<string, string>` — customParameters spliced into the `<ConversationRelay>` TwiML element. In integrated mode, `ConversationRelayChannel.createConversationForCall` supplies this. CR always calls `conversationRelay.generateTwiML()` itself. Omit for standalone (caller drives their own LLM via CR events); CR falls back to `{ conversation_id: CallSid }`.
- `onConversationRelayCallback` returns `{ status, content, contentType }` — the HTTP response for the URL declared as `<ConversationRelay action="…">`. Twilio fires this at call-end and on handoff requests. `ConversationRelayChannel.handleConversationRelayCallback` supplies this in integrated mode. Omit for standalone (200 OK no-op; caller handles call-end via `cr.onSessionEnded`).

Turn-by-turn traffic (`onPrompt` / `onInterrupt` / `onDtmf` / `onInfo`) does **not** go through callbacks. `ConversationRelayChannel` subscribes to these on the shared `ConversationRelay` manager in its constructor and emits `ChannelMessage`s via `onMessageReady`. Callback signatures hand back a `ConversationRelaySession` (not a CallSid); `session.callSid` exposes the underlying identifier.

### ConversationRelay internals (manager + session)

- `ConversationRelay` (manager, CR package) owns: `sessions: Map<CallSid, ConversationRelaySession>`, a shared `ToolRegistry`, an optional `silenceTemplate: SilenceConfig` (blueprint copied into each session's `SilenceHandler`), subscriber callbacks, and TwiML generation. No tool-dispatch methods live here.
- `ConversationRelaySession` (one per WebSocket upgrade, CR package) owns: the `ws` handle, session identity (`callSid`, `from`, `to`, `startedAt`, `customParameters`), listen-mode state, the per-session `SilenceHandler`, the terminal-message deferral slot, and the registry reference. Outbound methods (`sendText`, `sendPlay`, `sendDigits`, `switchLanguage`, `endCall`, `executeTool`, `setListenMode`) act on `this` — no CallSid threading through the API.
- Terminal deferral: tools returning `{ outgoingMessage: { type: 'end', ... } }` stash the message instead of shipping immediately; it is flushed on the next `sendText(token, true)` so the farewell reaches TTS before hangup.
- `ToolRegistry` is a standalone class with `register/unregister/get/has/list`; `CONVERSATION_RELAY_TOOLS` is the default array of seven built-in tools (play_media, send_digits, switch_language, end_call, live_agent_handoff, set_listen_mode, set_silence_detection). `ConversationRelayTool` is the tool base (previously `CRTool`).

### TACServer (`packages/server/src/lib/server.ts`)

Maestro-only webhook server. Defaults: `host: '0.0.0.0'`, `port: 3000`, `webhookPaths: { messaging: '/webhook' }`, `development: false`.

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
