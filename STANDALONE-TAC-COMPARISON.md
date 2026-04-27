# Standalone ConversationRelay: Main vs Feature Branch Comparison (v2)

## Executive Summary

**Health Status: ✅ HEALTHY — All main branch functionality preserved, plus a complete CR protocol + tool system and a two-server split that lets CR ship standalone.**

This branch extracts ConversationRelay into a standalone package (`@twilio/tac-conversationrelay`) with **zero** dependency on `@twilio/tac-core`, and ships the substance the extraction needed to be useful: full outgoing CR protocol coverage (`play` / `sendDigits` / `language` / `end`), a `ToolRegistry` with seven built-in protocol tools, a per-session API (`ConversationRelaySession`) that owns outbound calls, a per-session `SilenceHandler` + listen-mode gate, and a dedicated `ConversationRelayServer` that runs on its own port independent of `TACServer`.

### Key Changes (v1 → v2)

1. **✅ ConversationRelay package extracted** — Separate `@twilio/tac-conversationrelay` package with zero dependency on `@twilio/tac-core` and its own Fastify server (`ConversationRelayServer`).
2. **✅ Two-server architecture** — `ConversationRelayServer` (`:8001`, voice: `/twiml` · `/ws` · `/conversation-relay-callback`) and `TACServer` (`:8000`, Maestro: `/webhook`) run as independent processes. Both require explicit `publicDomain` config.
3. **✅ Manager + per-session split** — `ConversationRelay` (manager) owns the shared `ToolRegistry`, session Map, and TwiML generation. `ConversationRelaySession` (one per WebSocket upgrade) owns the `ws`, session identity, listen-mode flag, `SilenceHandler`, and terminal-message deferral slot. Outbound methods (`sendText`, `sendPlay`, `sendDigits`, `switchLanguage`, `endCall`, `executeTool`, `setListenMode`) act on `this` — no CallSid threading through the API.
4. **✅ Complete outgoing CR protocol** — `sendText`, `sendPlay`, `sendDigits`, `switchLanguage`, `endCall` on `ConversationRelaySession`, backed by `OutgoingMessageSchema` discriminated union. Terminal `{type:'end'}` frames are stashed by the session and flushed on the next `sendText(..., last: true)` so the farewell reaches TTS before hangup.
5. **✅ Seven built-in tools auto-registered** — `play_media`, `send_digits`, `switch_language`, `end_call`, `live_agent_handoff`, `set_listen_mode`, `set_silence_detection` preloaded on every `ConversationRelay`. `ConversationRelayTool` (previously `CRTool`) carries `toOpenAIFormat()` / `toAnthropicFormat()` adapters.
6. **✅ Channel composition (no inheritance)** — All channels (`SMSChannel`, `ChatChannel`, `VoiceChannel`, `ConversationRelayChannel`) `implements Channel` directly. `MessagingChannel` / `VoiceWebhookChannel` base classes and `BaseChannel` are deleted. Shared webhook logic lives in `channels/utility.ts` (`ConversationSessionStore`, `ConversationsWebhookProcessor`, `ensureAgentParticipant`) and is composed.
7. **✅ Active vs passive voice split** — Active voice (CR↔Maestro bridge) is `ConversationRelayChannel` (`channelType: 'crelay'`) — the only file in core that imports `@twilio/tac-conversationrelay`. Passive voice is `VoiceChannel` (`channelType: 'voice'`) — Maestro webhooks only, no outbound, zero CR dependency. For BYO-CR flows or inbound-analysis pipelines.
8. **✅ Send API: Actions, not Communications** — SMS and Chat outbound uses `conversationClient.createAction(convId, { type: 'SEND_MESSAGE', ... })`. The `/v2/Communications` endpoint is retired (returns 404); `sendCommunication` is deleted. Active voice outbound goes via `ConversationRelayChannel.sendResponse` → `ConversationRelaySession.sendText`. Passive `VoiceChannel.sendResponse` throws.
9. **✅ Per-session silence + listen mode** — `SilenceHandler` (per-session, auto-wired from a `silence` template on the manager) replaces the main-branch `SilenceDetector` standalone primitive. Listen-mode gate lives on `ConversationRelaySession`; `setListenMode` / `set_listen_mode` / `set_silence_detection` tools toggle it at runtime.
10. **✅ Vendored CR logger** — optional `Logger` on `ConversationRelay`, `createLogger` helper vendored into CR; standalone CR usage no longer needs the core package.
11. **✅ Branded types** (carried from v1) — `ConversationId`, `ProfileId`, `MemoryStoreId`, `KnowledgeBaseId`, `ParticipantId`. `MemoryStoreId` schema tightened to `mem_store_*` only.
12. **✅ Maestro / Memory / Knowledge / CI: PRESERVED** — API surface and runtime behavior identical to main (minor type-safety tightening + new `addOrFetchParticipant` + `getConfiguration`).

### Test Coverage

- **Main branch:** ~250 tests
- **This branch:** **580 tests across 39 files (39/39 files passing, 580/580 cases passing)**
- **Net:** +330 tests, concentrated in CR protocol methods, manager/session split, tool registry, silence/listen-mode, channel interface surfaces, the two-server architecture, signature validation, and BYO-Fastify customization.

---

## The Headline: Same Tool Interface, CR-Only or CR-with-TAC

The core design goal of this branch is that a user reaches for **the same two methods** — `listTools()` and `executeTool(...)` — whether they are running ConversationRelay standalone or through `ConversationRelayChannel` inside TAC. Seven protocol tools (`play_media`, `send_digits`, `switch_language`, `end_call`, `live_agent_handoff`, `set_listen_mode`, `set_silence_detection`) come pre-registered in both cases, and `executeTool` auto-ships the corresponding WebSocket frame. No LLM SDK dependency, no hand-rolled dispatcher, no branch on "tool type" at the call site.

### CR-Only (standalone `@twilio/tac-conversationrelay`)

```
 +------------+         +-------------------------------------------------+
 |  Twilio    |         |  ConversationRelay (manager) + Session (per-WS) |
 | ConvRelay  |<---WS-->|                                                 |    +---------+
 |  (voice)   |         |   +-------------------+   +-----------------+   |<-->|  User   |
 +------------+         |   | ToolRegistry      |   | callbacks       |   |    |  LLM    |
                        |   |  play_media       |   |  onSessionStart |   |    |  loop   |
                        |   |  send_digits      |   |  onPrompt       |   |    +---------+
                        |   |  switch_language  |   |  onInterrupt    |   |         ^
                        |   |  end_call         |   |  onDtmf / onInfo|   |         |
                        |   |  live_agent_handoff|  |  onSessionEnded |   |         |
                        |   |  set_listen_mode  |   |  onError        |   |         |
                        |   |  set_silence_det  |   +-----------------+   |         |
                        |   |  + user tools     |                         |         |
                        |   +-------------------+                         |         |
                        |                                                 |         |
                        |   public API (on ConversationRelaySession):     |         |
                        |     session.sendText(token, last)               |         |
                        |     session.sendPlay / sendDigits / etc.        |         |
                        |     session.executeTool(name, args)             |         |
                        |       +-- auto-ships outgoingMessage            |         |
                        |       +-- defers terminal 'end' until next      |         |
                        |           sendText(.., last=true) flush         |         |
                        |     session.setListenMode(enabled)              |         |
                        |     per-session SilenceHandler (auto-wired)     |         |
                        +-------------------------------------------------+         |
                                                                                    |
    LLM SDK (OpenAI, Anthropic, Google...) lives in USER code, never in CR. --------+
    Tool format conversion via ConversationRelayTool.toOpenAIFormat() /
    toAnthropicFormat() at call site.
```

### CR-with-TAC (multi-channel via `@twilio/tac-core`)

```
      Twilio WS             +-------------------------------+
      (ConvRelay) <-------->| ConversationRelayChannel      |
       :8001                |   (channelType='crelay')      | <-- Channel[crelay] --+
                            |   |- embeds CR manager        |                       |
                            |   |- bindings: convId→session |                       |
                            |   |- listTools/executeTool    |                       |
                            |   +- sendResponse             |                       |
                            +-------------------------------+                       |
      Twilio Voice          +-------------------------------+                       |
      (via Maestro) <------>| VoiceChannel (passive)        |                       |
       :8000                |   (channelType='voice')       | <-- Channel[voice] ---+
                            |   |- webhooks only            |                       |
                            |   +- sendResponse throws      |                       |
                            +-------------------------------+                       |
      Twilio SMS            +-------------------------------+                       |     +----------+
      (via Maestro) <------>| SMSChannel                    |                       |     |  User    |
       :8000                |   |- listTools/executeTool    | <-- Channel[sms] -----+     |  LLM     |
                            |   +- sendResponse (Actions)   |                       |     |  loop    |
                            +-------------------------------+                       |     +----------+
      Twilio Chat           +-------------------------------+                       |         ^
      (via Maestro) <------>| ChatChannel                   |                       |         |
       :8000                |   |- listTools/executeTool    | <-- Channel[chat] ----+         |
                            |   +- sendResponse (Actions)   |         ^                       |
                            +-------------------------------+         |                       |
                                                        +-------------+---------+             |
                                                        |          TAC          |             |
                                                        |  - composes channels  | ------------+
                                                        |  - getChannel<T>()    | onMessageReady
                                                        |  - onMessageReady     |   (unified)
                                                        |  - onHandoff /        |
                                                        |    onConversationEnded|
                                                        +-----------------------+

    LLM SDK lives in USER code. Uniform dispatch:
      channel.listTools().map(t => t.toOpenAIFormat())
      channel.executeTool(msg.conversationId, name, args)
    msg.channel discriminator routes to the right channel.
    ConversationRelayServer runs on :8001; TACServer runs on :8000.
```

### Active vs passive hydration — who creates the Maestro conversation?

The two voice channels differ in where the Maestro conversation is born:

| | Active Voice (`ConversationRelayChannel`) | Passive Voice (`VoiceChannel`) | SMS (`SMSChannel`) |
|---|---|---|---|
| Who creates the Maestro conversation? | **TAC** — inside `/twiml` via `createConversationForCall`, before WS opens (**active hydration**) | **Maestro / external** — TAC reacts via webhook (**passive hydration**) | **Maestro / external** — TAC reacts via webhook (**passive hydration**) |
| Transport into TAC | WebSocket + customParameters on setup | `POST /webhook` with `COMMUNICATION_CREATED` | `POST /webhook` with `COMMUNICATION_CREATED` |
| Transport out of TAC | WebSocket `{type:"text", token}` via `ConversationRelaySession.sendText` | **None** — `sendResponse` throws (Actions API rejects `channel: VOICE`) | Actions API `POST /v2/Conversations/{id}/Actions` with `SEND_MESSAGE` |
| Session identity | `ConversationId` → `ConversationRelaySession` via `bindings` Map on the channel | `ConversationId` from webhook | `ConversationId` from webhook |
| `msg.channel` discriminator | `'crelay'` | `'voice'` | `'sms'` |
| Server | `ConversationRelayServer` (`:8001`) | `TACServer` (`:8000`) | `TACServer` (`:8000`) |

### The symmetry at the call site

```typescript
// CR-only — scoped by CallSid on the session
const tools = conversationRelay.listTools().map(t => t.toOpenAIFormat());
// ... onPrompt(session, ...): LLM call ...
await session.executeTool(call.name, JSON.parse(call.argumentsJson));

// CR-with-TAC (via ConversationRelayChannel) — scoped by ConversationId
const tools = crChannel.listTools().map(t => t.toOpenAIFormat());
// ... onMessageReady(msg): LLM call ...
await crChannel.executeTool(msg.conversationId, call.name, JSON.parse(call.argumentsJson));
```

Same method names; same built-ins auto-registered; same auto-shipping of `outgoingMessage` via the CR WebSocket. The only difference is the identifier (`CallSid`-scoped session vs. `ConversationId`-scoped channel) because TAC-mode conversations can span multiple channels.

Both quickstarts demonstrate this directly:

- **CR-only**: [getting_started/examples/crelay/src/index.ts](getting_started/examples/crelay/src/index.ts)
- **CR-with-TAC**: [getting_started/examples/conversation/src/index.ts](getting_started/examples/conversation/src/index.ts)

Ask either quickstart "play a hold tone", "send digits 1234", or "end the call with a goodbye" — the corresponding `play` / `sendDigits` / `end` frame is shipped on the Twilio WebSocket without a line of custom code.

---

## 1. ConversationRelay Package Extraction + Two-Server Split

### Main Branch (Before)

**File:** `packages/core/src/channels/voice.ts` — CR protocol embedded in `VoiceChannel` (~800 lines). Every new incoming message type (setup/prompt/interrupt/dtmf/info/error) meant adding branches inside `VoiceChannel.handleWebSocketConnection`. Voice and Maestro webhook routes coexisted on one Fastify server.

### This Branch (After)

**Standalone package:** [packages/conversationrelay/](packages/conversationrelay/) — `@twilio/tac-conversationrelay` with zero dependency on `@twilio/tac-core`. Depends only on `twilio`, `ws`, `zod`, `pino`, `fastify`.

**Two servers, one package layout:**

| Server | Package | Port | Routes |
|---|---|---|---|
| `ConversationRelayServer` | `@twilio/tac-conversationrelay` | `:8001` | `/twiml`, `/ws`, `/conversation-relay-callback` |
| `TACServer` | `@twilio/tac-server` | `:8000` | `/webhook` (Maestro fan-out), optional `/cintel` |

Twilio voice numbers point at `https://<host>:8001/twiml`. Conversations Service webhooks point at `https://<host>:8000/webhook`. A voice-only deployment can ship CR alone; a Maestro-only deployment can ship TAC without voice code.

**Channel split** — active voice moved out of `VoiceChannel`:

```typescript
// packages/core/src/channels/crelay.ts — active voice, CR↔Maestro bridge
export class ConversationRelayChannel implements Channel {
  public readonly channelType: ChannelType = 'crelay';
  private readonly conversationRelay: ConversationRelay;
  private readonly bindings: Map<ConversationId, ConversationRelaySession>;

  constructor(deps, channelConfig: { conversationRelay: ConversationRelay }) {
    this.conversationRelay = channelConfig.conversationRelay;
    this.bindings = new Map();
    this.wireCRCallbacks(); // subscribes to session-scoped callbacks
  }
}

// packages/core/src/channels/voice.ts — passive Maestro webhooks only
export class VoiceChannel implements Channel {
  public readonly channelType: ChannelType = 'voice';
  // Zero CR dependency. sendResponse throws.
}
```

**Benefits:**
- ✅ CR is usable independently of TAC (see [getting_started/examples/crelay](getting_started/examples/crelay/))
- ✅ Active and passive voice cleanly separated — the only core file importing CR is `ConversationRelayChannel`
- ✅ Deployments scale each concern independently; voice-only and Maestro-only are first-class
- ✅ Both servers enforce signature validation against an explicit `publicDomain` (no fragile `x-forwarded-*` fallback)
- ✅ CR owns its own test suite ([packages/conversationrelay/tests/](packages/conversationrelay/tests/)) plus CR-from-root tests in [tests/](tests/)

---

## 2. Complete CR Protocol Coverage (on `ConversationRelaySession`)

Main could only send `text` tokens outbound. This branch implements every outgoing message in the Twilio CR protocol, with outbound methods **on the per-session handle** — no CallSid threading through the API.

### Outgoing messages (sent to Twilio)

| Protocol type | Method on `ConversationRelaySession` | Schema |
|---|---|---|
| `text` | `sendText(token, last)` | `TextTokenMessageSchema` |
| `play` | `sendPlay(source, options?)` | `PlayMessageSchema` |
| `sendDigits` | `sendDigits(digits)` | `SendDigitsMessageSchema` |
| `language` | `switchLanguage(options)` | `SwitchLanguageMessageBaseSchema` (+ refined variant requiring at least one language) |
| `end` | `endCall(handoffData?)` | `EndMessageSchema` |

All five are unified under a discriminated union:

```typescript
export const OutgoingMessageSchema = z.discriminatedUnion('type', [
  TextTokenMessageSchema,
  PlayMessageSchema,
  SendDigitsMessageSchema,
  SwitchLanguageMessageBaseSchema,
  EndMessageSchema,
]);
```

Every outbound frame is routed through `ConversationRelaySession.sendResponse`, which enforces `WebSocket.OPEN` state, applies the listen-mode gate, and handles terminal-frame deferral.

### Terminal-frame deferral

Tools that return `{ outgoingMessage: { type: 'end', ... } }` (e.g. `end_call`, `live_agent_handoff`) don't ship the frame immediately. The session stashes it as `pendingTerminalMessage` and flushes it on the next `sendText(token, last: true)` — so the LLM's farewell reaches TTS before Twilio hangs up.

### TypeScript signatures

```typescript
// On ConversationRelaySession (one per WebSocket upgrade)
sendText(token: string, last: boolean): void;
sendPlay(source: string, options?: {
  loop?: number; interruptible?: boolean; preemptible?: boolean;
}): void;
sendDigits(digits: string): void;  // regex: /^[0-9w*#]+$/
switchLanguage(options: {
  ttsLanguage?: string; transcriptionLanguage?: string;
}): void;
endCall(handoffData?: Record<string, unknown>): void;
setListenMode(enabled: boolean): void;
```

### Tests

- [tests/crelay-outgoing-messages.test.ts](tests/crelay-outgoing-messages.test.ts) — schema validation for all five outgoing message types.
- [tests/crelay-protocol-methods.test.ts](tests/crelay-protocol-methods.test.ts) + [packages/conversationrelay/tests/crelay-protocol-methods.test.ts](packages/conversationrelay/tests/crelay-protocol-methods.test.ts) — end-to-end WebSocket behavior including terminal-frame deferral.

---

## 3. CR Tool Registry & Seven Built-in Tools

Main exposed no tool system. This branch ships a standalone `ToolRegistry` class: any `ConversationRelay` instance starts with **seven** protocol tools preloaded, and callers can add domain tools that are immediately visible to every active session.

### ConversationRelayTool class (previously `CRTool`)

```typescript
// packages/conversationrelay/src/lib/tool.ts
export class ConversationRelayTool<TParams = unknown, TResult = unknown> {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly parameters: JSONSchema,
    public readonly implementation: ToolFunction<TParams, TResult>
  ) {}

  toOpenAIFormat(): Record<string, unknown>;    // { type: 'function', function: {...} }
  toAnthropicFormat(): Record<string, unknown>; // { name, description, input_schema }
}

export function defineTool<TParams, TResult>(...): ConversationRelayTool<TParams, TResult>;
```

`defineTool` is vendored locally — the CR package has no dependency on `@twilio/tac-tools`.

### Built-in protocol tools (auto-registered — seven of them)

| Tool | Name | Result shape | Effect |
|---|---|---|---|
| `playMediaTool` | `play_media` | `{ outgoingMessage: {type:'play', ...} }` | Ships play frame |
| `sendDigitsTool` | `send_digits` | `{ outgoingMessage: {type:'sendDigits', ...} }` | Ships DTMF frame |
| `switchLanguageTool` | `switch_language` | `{ outgoingMessage: {type:'language', ...} }` | Ships language frame |
| `endCallTool` | `end_call` | `{ outgoingMessage: {type:'end', ...} }` | Deferred-flushes end frame |
| `liveAgentHandoffTool` | `live_agent_handoff` | `{ outgoingMessage: {type:'end', handoffData}}` | Deferred-flushes end with handoff payload |
| `setListenModeTool` | `set_listen_mode` | `{ listenMode: boolean }` | Session toggles listen-mode flag |
| `setSilenceDetectionTool` | `set_silence_detection` | `{ silenceEnabled: boolean }` | Session starts/stops `SilenceHandler` |

Each tool's implementation is a pure function returning one of the three **result-convention keys** (`outgoingMessage`, `listenMode`, `silenceEnabled`). `session.executeTool` inspects the result, validates `outgoingMessage` against `OutgoingMessageSchema`, and applies the convention automatically — ships protocol frames (with terminal deferral), toggles session state for listen-mode / silence. User-authored tools can return any shape; the session only acts on known keys and otherwise returns the result untouched for your LLM loop.

### ToolRegistry API (on the manager — shared across sessions)

```typescript
// packages/conversationrelay/src/lib/tool-registry.ts — standalone class
class ToolRegistry {
  register(tool: ConversationRelayTool): void;    // add or overwrite
  unregister(name: string): void;                 // drop by name
  get(name: string): ConversationRelayTool | undefined;
  has(name: string): boolean;
  list(): ConversationRelayTool[];                // for LLM discovery
}

// On ConversationRelay (manager)
cr.getToolRegistry();   // → shared ToolRegistry
cr.listTools();         // shortcut: getToolRegistry().list()
```

Dispatch lives on the session (not the manager) — `session.executeTool(name, args)` applies result conventions and auto-ships any `outgoingMessage`.

### Tests

- [packages/conversationrelay/tests/crelay-tool-registry.test.ts](packages/conversationrelay/tests/crelay-tool-registry.test.ts) — registry CRUD
- [packages/conversationrelay/tests/define-tool.test.ts](packages/conversationrelay/tests/define-tool.test.ts) — tool definition + format adapters
- [tests/crelay-tools.test.ts](tests/crelay-tools.test.ts) — full registry + executeTool behavior incl. all seven built-ins

---

## 4. Channel Interface — Optional Tool Dispatch

The `Channel` interface gained **optional** tool methods so active-voice can participate in an LLM tool loop without forcing messaging channels to stub empty registries.

### Interface contract (optional methods)

```typescript
// packages/core/src/types/channels.ts
export interface Channel {
  readonly channelType: ChannelType;
  sendResponse(conversationId, message, metadata?): Promise<void>;
  // ... processWebhook?, session helpers ...

  // Optional tool surface — only channels with outbound capability implement.
  // Passive VoiceChannel has no outbound path and omits these.
  listTools?(): ConversationRelayTool[];
  registerTool?(tool: ConversationRelayTool): void;
  executeTool?(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
}
```

### ConversationRelayChannel — delegates to per-session handle

```typescript
// packages/core/src/channels/crelay.ts
public listTools(): ConversationRelayTool[] {
  return this.conversationRelay.listTools();
}

public registerTool(tool: ConversationRelayTool): void {
  this.conversationRelay.getToolRegistry().register(tool);
}

public async executeTool(conversationId: ConversationId, name: string, args: unknown): Promise<unknown> {
  const session = this.bindings.get(conversationId);
  if (!session) throw new Error(`No active session for conversation ${conversationId}`);
  return session.executeTool(name, args);  // auto-ships outgoingMessage, applies conventions
}
```

Calling `crChannel.executeTool(convId, 'end_call', { reason: 'done' })` stashes the terminal `end` frame on the session, to be flushed on the next `sendText(..., last: true)`.

### SMS / Chat channels — plain tool dispatch

SMS/Chat implement the optional tool methods over their own internal `Map<string, ConversationRelayTool>`. Tools are plain side-effect functions (DB lookups, API calls); there is no `outgoingMessage` auto-shipping because there's no CR WebSocket.

### Passive VoiceChannel — no tool methods

`VoiceChannel` (`channelType: 'voice'`) is passive webhooks only. It implements none of `listTools` / `registerTool` / `executeTool`. Calling `sendResponse` throws with an explicit message pointing users at `ConversationRelayChannel` for active voice.

### Result: one code path across outbound-capable channels

```typescript
// Works identically for crelay, sms, chat
const tools = channel.listTools?.().map(t => t.toOpenAIFormat()) ?? [];
// feed to LLM, receive tool_calls, dispatch:
const result = await channel.executeTool?.(convId, call.name, JSON.parse(call.arguments));
```

Both quickstarts ([conversation](getting_started/examples/conversation/src/index.ts) and [crelay](getting_started/examples/crelay/src/index.ts)) use this shape with the built-in tools — asking either one to play media, send DTMF, switch language, or end the call works out of the box.

---

## 5. Silence Detection + Listen Mode (per-session, auto-wired)

Two patterns come up on nearly every production voice agent. Neither is a ConversationRelay **wire-protocol** feature — CR does not emit a "silence" event, and it has no concept of a "listen-only" mode. Both are now **built into the CR package itself** — the manager auto-wires a per-session `SilenceHandler` from the constructor config, and the session carries a listen-mode flag that gates outgoing `text` / `play` / `language` frames. Customers can still override the behavior via custom tools; the defaults just work.

### Silence detection — per-session `SilenceHandler`

**The problem:** the caller goes quiet. Maybe they put you on hold, stepped away, or dropped into a dead zone. CR happily keeps the WebSocket open and will never tell you the caller is silent — it only emits `{type:"prompt"}` when the STT engine has a transcript to hand you. Without a host-side timer, the agent just sits there.

**The built-in:** pass a `silence` template to `new ConversationRelay(logger, { silence })`. On every session the manager constructs a dedicated `SilenceHandler` ([packages/conversationrelay/src/lib/silence-handler.ts](packages/conversationrelay/src/lib/silence-handler.ts)) with a reminder sequence of `['Are you still there?', ...additionalPrompts]`. It resets automatically on `prompt` / `interrupt` / `dtmf` (see `ConversationRelaySession.handleIncomingFrame`), fires the next reminder on each threshold breach via `session.sendText(reminder, true)`, and ends the call via `session.endCall({ reasonCode: 'unresponsive' })` when the terminal reminder breaches. Omit the config to disable silence handling entirely.

```ts
const conversationRelay = new ConversationRelay(logger, {
  silence: {
    thresholdSeconds: 30,
    additionalPrompts: ['Hello? Can you hear me?'], // optional, up to 2
  },
});
```

No per-session wiring needed in customer code. The LLM can still toggle it at runtime via the built-in `set_silence_detection` tool.

### Listen mode (response suppression)

**The problem:** sometimes you want the agent to **listen but not speak**. Classic examples: the caller is reading out a credit-card number, a one-time code, or an account number, and the agent should receive the transcript without interrupting. You also want this during "playback" moments where the system is playing media and the LLM shouldn't speak over it.

**The built-in:** every `ConversationRelaySession` carries a listen-mode flag toggled via `session.setListenMode(enabled)` (also settable by the LLM via the built-in `set_listen_mode` tool). When enabled, `session.sendResponse` suppresses outgoing `text` / `play` / `language` frames. `sendDigits` and `end` are deliberately *not* gated — DTMF navigation and call termination must always work. Listen mode also interlocks with the silence handler: enabling it pauses silence monitoring; disabling it re-enables and resets the timer.

Customers don't need to wire anything. If you want a custom listen-mode toggle (e.g. business-logic-driven rather than LLM-driven), call `session.setListenMode(enabled)` directly — inside an `onPrompt` callback, the session is in hand.

**What's still on the LLM provider:**
1. **Keep running the LLM while suppressed.** Listen mode suppresses the *wire write*, not the LLM call. Keep running inference so the transcript is captured in your history — if you also skip inference, you lose context and the next turn will be incoherent.
2. **Tool-triggered speech is gated too.** `play_media` and `switch_language` outgoing frames go through `session.sendResponse` and will also be suppressed in listen mode. `send_digits` and `end_call` still fire.
3. **Have an exit condition.** Calls that enter listen mode and never leave strand the caller talking to a silent agent.

### Breaking change from main

Main shipped a standalone `SilenceDetector` class keyed by `CallSid`, plus exposed `setListenModeTool` / `setSilenceDetectionTool` as user-facing tool modules. This branch replaces that with:
- Per-session `SilenceHandler` (auto-wired, no external keying)
- Listen-mode flag + `setListenMode` method on `ConversationRelaySession`
- Built-in `set_listen_mode` and `set_silence_detection` tools (auto-registered on every `ConversationRelay` — no separate module to import)

Tests: [packages/conversationrelay/tests/silence-handler.test.ts](packages/conversationrelay/tests/silence-handler.test.ts), [packages/conversationrelay/tests/crelay-silence-template.test.ts](packages/conversationrelay/tests/crelay-silence-template.test.ts).

---

## 6. NEW: Logger Decoupling

v1's `ConversationRelay` required a Pino logger. v2 makes the logger optional and vendors a `createLogger` helper inside the CR package, so standalone CR users can instantiate without importing anything from `@twilio/tac-core`.

```typescript
// packages/conversationrelay/src/crelay.ts:79-80
constructor(logger?: Logger) {
  this.logger = logger ?? createLogger({ name: 'conversation-relay' });
  // ...
}
```

```typescript
// packages/conversationrelay/src/lib/logger.ts
export type Logger = pino.Logger;
export function createLogger(options?: { level?: string; pretty?: boolean; name?: string }): Logger;
```

`createLogger` honours `TWILIO_LOG_LEVEL`, auto-enables `pino-pretty` in development, and reads `NODE_ENV` for defaults.

---

## 7. Package Structure

```
packages/
├── conversationrelay/           # Standalone CR package — its own package.json + dist
│   ├── src/
│   │   ├── crelay.ts            # ConversationRelay manager (owns WS handleConnection)
│   │   ├── types.ts             # Schemas: incoming + outgoing unions
│   │   ├── lib/
│   │   │   ├── server.ts                   # ConversationRelayServer (Fastify)
│   │   │   ├── conversation-relay-session.ts  # Per-WS session handle
│   │   │   ├── tool-registry.ts            # Standalone ToolRegistry class
│   │   │   ├── tool.ts                     # ConversationRelayTool + defineTool
│   │   │   ├── silence-handler.ts          # Per-session silence monitor
│   │   │   ├── signature.ts                # Shared signature validation (used by both servers)
│   │   │   ├── public-domain.ts            # normalizePublicDomain helper
│   │   │   ├── logger.ts                   # Vendored pino wrapper
│   │   │   └── tools/                      # Seven built-in protocol tools
│   │   └── index.ts
│   └── tests/                              # CR-internal test suite
├── core/                        # TAC + channels + API clients (bundles into root dist/)
├── server/                      # TACServer (Fastify — Maestro webhooks only)
└── tools/                       # Higher-level tools (memory, handoff, messaging, knowledge)
```

`@twilio/tac-conversationrelay` depends only on `twilio`, `ws`, `zod`, `pino`, `fastify`, `@fastify/websocket` — no TAC core dependency. It is the only package with its own `package.json` + independent `dist/` — `core`, `server`, and `tools` bundle into the root `dist/` via the repo-level `tsup` config.

---

## 8. Channel Architecture — Composition, No Inheritance

**Pattern:** All channels `implements Channel` directly; shared logic is composed.

| Channel | `channelType` | Base class? | Composed helpers |
|---|---|---|---|
| `SMSChannel` | `'sms'` | None — `implements Channel` | `ConversationSessionStore`, `ConversationsWebhookProcessor`, `ensureAgentParticipant` |
| `ChatChannel` | `'chat'` | None — `implements Channel` | Same + `ChatChannelConfig.conversationsV1ServiceSid` |
| `VoiceChannel` (passive) | `'voice'` | None — `implements Channel` | Same three helpers; no CR dependency |
| `ConversationRelayChannel` (active) | `'crelay'` | None — `implements Channel` | Embeds `ConversationRelay` manager; `addOrFetchParticipant` on `ConversationClient` |

### Deleted since main

- `MessagingChannel` base class (SMS/Chat/VoiceWebhook extended this)
- `VoiceWebhookChannel` — replaced by passive `VoiceChannel`
- `BaseChannel` abstract class
- `/v2/Communications` Send API (retired by Twilio, returns 404); `sendCommunication` method

Shared helpers live in [`packages/core/src/channels/utility.ts`](packages/core/src/channels/utility.ts):
- `ConversationSessionStore` — per-channel `Map<ConversationId, ConversationSession>` with lifecycle callbacks
- `ConversationsWebhookProcessor` — per-channel dedup Set + event router (`CONVERSATION_CREATED`, `PARTICIPANT_ADDED`, `COMMUNICATION_CREATED`, `CONVERSATION_UPDATED`) with self-filtering on `author.channel`
- `ensureAgentParticipant` — pure function: finds an AI_AGENT / HUMAN_AGENT / AGENT matching a channel+address, lazy-creates one if missing, handles 409 races

### Tool interface is now optional

`listTools` / `registerTool` / `executeTool` are **optional** methods on `Channel` — only channels with outbound capability implement them. Passive `VoiceChannel` omits the lot; `ConversationRelayChannel` / `SMSChannel` / `ChatChannel` all provide them.

---

## 9. API Surface Comparison

### ConversationClient

Identical to main except for two additions (carried from v1):
- ✅ **New:** `addOrFetchParticipant()` — handles Maestro capture-rule races; matches on type AND addresses (channel + address + channelId) both on first scan and after 409 conflict re-fetch
- ✅ **New:** `getConfiguration()`

### MemoryClient

Type safety tightened (carried from v1):
- `serviceSid: string` → `memoryStoreId: MemoryStoreId`
- `profileId: string` → `profileId: ProfileId`
- **Fix:** `MemoryStoreId` schema regex is now `/^mem_store_[0-9a-z]{26}$/` only (no `mem_service_` acceptance); `isMemoryStoreId()` uses the same regex — brand cast in `TACConfig` is sound.

### KnowledgeClient

Type safety tightened (carried from v1):
- `knowledgeBaseId: string` → `knowledgeBaseId: KnowledgeBaseId`

### Channel interface

`listTools` / `registerTool` / `executeTool` are **optional** — only channels with outbound capability (`ConversationRelayChannel`, `SMSChannel`, `ChatChannel`) implement them. `processWebhook` is also optional — `ConversationRelayChannel` omits it because it doesn't consume Maestro webhooks directly.

---

## 10. Branded Types for Type Safety

Carried from main: `ConversationId`, `ProfileId`, `MemoryStoreId`, `KnowledgeBaseId`, `ParticipantId`, `CallSid`. Compile-time only — zero runtime cost.

`MemoryStoreId` branding is sound — both the config schema and the `isMemoryStoreId` guard enforce the `mem_store_` prefix, so the cast at [packages/core/src/lib/config.ts](packages/core/src/lib/config.ts) is safe.

---

## 11. Breaking Changes Summary

### Channel construction & event wiring
1. **`VoiceChannel` is passive-only.** Existing active-voice callers must switch to `ConversationRelayChannel`:
   ```typescript
   // Before
   const voice = new VoiceChannel(tac);

   // After (active voice)
   const cr = new ConversationRelay(logger);
   const crChannel = new ConversationRelayChannel(tac.getChannelDeps(), { conversationRelay: cr });

   // After (passive / BYO-CR)
   const voice = new VoiceChannel(tac.getChannelDeps());
   ```
2. **`MessagingChannel` and `VoiceWebhookChannel` base classes are deleted.** Custom channels `implements Channel` directly and compose helpers from `channels/utility.ts`.
3. **All channels take `{ config, logger, conversationClient, memoryRetriever? }` via `tac.getChannelDeps()`** plus an optional channel-specific config. No positional TAC reference.
4. **Event Callback**: `tac.on('prompt', ...)` → `tac.onMessageReady(msg => ...)` (carried from main).

### Server & deployment
5. **Two-server split.** `TACServer` handles Maestro (`/webhook`). Voice moved to `ConversationRelayServer` (`/twiml` · `/ws` · `/conversation-relay-callback`) in `@twilio/tac-conversationrelay`.
6. **`publicDomain` is required on both server configs.** No `x-forwarded-*` / `Host` header fallback. Env-var convention: `TAC_PUBLIC_DOMAIN`, `CR_PUBLIC_DOMAIN`.
7. **`VOICE_PUBLIC_DOMAIN` env var removed.** `VoiceServerConfigSchema` removed. Port defaults: TAC=8000, CR=8001.
8. **Signature validation is always on.** Both servers validate `X-Twilio-Signature`; WebSocket upgrades validate inline (Fastify doesn't run `preHandler` on upgrades).

### Send API
9. **`/v2/Communications` / `sendCommunication` removed.** SMS/Chat outbound uses `conversationClient.createAction(convId, { type: 'SEND_MESSAGE', ... })`. Active voice outbound via `ConversationRelaySession.sendText`. Passive `VoiceChannel.sendResponse` throws.

### CR package
10. **`CRTool` → `ConversationRelayTool`.** Import names and class name renamed.
11. **Manager + session split.** Outbound methods (`sendText`, `sendPlay`, `sendDigits`, `switchLanguage`, `endCall`, `executeTool`, `setListenMode`) moved from the manager (keyed by `CallSid`) to `ConversationRelaySession` (acts on `this`). Callbacks hand back a `ConversationRelaySession` — `session.callSid` exposes the identifier if needed.
12. **`SilenceDetector` standalone class replaced by per-session `SilenceHandler`.** Configure via `new ConversationRelay(logger, { silence: { thresholdSeconds, additionalPrompts } })` — no application-level keying by `CallSid`.
13. **`setListenModeTool` / `setSilenceDetectionTool` modules removed** — replaced by auto-registered built-in tools (`set_listen_mode`, `set_silence_detection`) on every `ConversationRelay`.
14. **`ConversationRelay.onMessage` → `onPrompt`** — callback renamed to match CR protocol semantics. Seven total session-scoped callbacks: `onSessionStarted`, `onPrompt`, `onInterrupt`, `onDtmf`, `onInfo`, `onSessionEnded`, `onError`.
15. **Removed types:** `ResponseService`, `ResponseHandler`, `ContentResponse`, `ToolResultEvent` — replaced by the `executeTool` + `outgoingMessage` flow.
16. **`ConversationRelay` logger is optional** — existing code that passes a logger still works.

---

## 12. Migration Impact

**Time per app:** 30–60 minutes (up from main→v1's ~15–30; the two-server split and active/passive voice rename are the dominant costs).

**Typical migration steps:**

```typescript
// 1. Split deployment: two Fastify servers
const tac = new TAC(config);
const cr = new ConversationRelay(logger, { silence: { thresholdSeconds: 30 } });
tac.registerChannel(new ConversationRelayChannel(tac.getChannelDeps(), { conversationRelay: cr }));
tac.registerChannel(new SMSChannel(tac.getChannelDeps()));

const tacServer = new TACServer(tac, { publicDomain: process.env.TAC_PUBLIC_DOMAIN! });  // :8000
const crServer = new ConversationRelayServer(cr, { publicDomain: process.env.CR_PUBLIC_DOMAIN! });  // :8001

await Promise.all([tacServer.start(), crServer.start()]);

// 2. Register custom tools on the shared registry (visible to every active session)
cr.getToolRegistry().register(myCustomTool);

// 3. Dispatch in LLM loop — use the channel or the session, same result conventions
const tools = crChannel.listTools().map(t => t.toOpenAIFormat());
// feed to LLM ...
const result = await crChannel.executeTool(convId, call.name, JSON.parse(call.arguments));
// Built-in protocol tools auto-ship outgoingMessage; terminal 'end' is deferred to next sendText(.., last=true).

// 4. Outbound text via the channel (which routes to the session)
await crChannel.sendResponse(convId, text, { last: true });
```

No new wiring required to get DTMF, media playback, language switching, call end, live-agent handoff, listen mode, or silence detection — those seven tools arrive pre-registered on every `ConversationRelay`.

Also update Twilio console: voice numbers now point at `https://<host>:8001/twiml`, Conversations Service webhooks at `https://<host>:8000/webhook`.

---

## Summary

### ✅ PRESERVED
Maestro / Memory / Knowledge / CI — runtime identical to main. Channel lifecycle unchanged.

### 🔄 CHANGED (Architecture & API)
Standalone `@twilio/tac-conversationrelay` package with its own Fastify server. Manager + per-session split (outbound methods act on `this`, no CallSid threading). Seven built-in tools auto-registered. Per-session `SilenceHandler` + listen-mode gate. Channels `implements Channel` directly — no base classes. Active voice split from passive `VoiceChannel` into `ConversationRelayChannel` (`'crelay'`). Send API moved to Actions. Signature validation always-on against explicit `publicDomain`.

### 📊 Test Coverage
Main ~250 → **580 tests on this branch across 39 files** (+330 net). All 580 pass.

---

## Recommendation

✅ **MERGE** — the extraction now ships a genuinely standalone package with complete protocol coverage, a per-session API that keeps outbound semantics local to the call, and a two-server architecture that lets voice-only and Maestro-only deployments ship without dragging the other in. TAC users get `ConversationRelayChannel` + passive `VoiceChannel` as cleanly-separated abstractions — no inheritance, no embedded protocol parser, and a uniform tool surface that works the same via the channel (CR+TAC) or the session (CR-only). Breaking changes are mechanical and documented above.
