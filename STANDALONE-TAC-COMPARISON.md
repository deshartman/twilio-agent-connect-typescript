# Standalone ConversationRelay: Main vs Feature Branch Comparison (v2)

## Executive Summary

**Health Status: ✅ HEALTHY — All main branch functionality preserved, plus a complete CR protocol + tool system built on top.**

This branch extracts ConversationRelay into a standalone package (`@twilio/tac-conversationrelay`) **and** ships the substance that the v1 extraction was missing: full outgoing CR protocol coverage (`play` / `sendDigits` / `language` / `end`), a tool registry with four built-in protocol tools, a unified `Channel.{listTools, registerTool, executeTool}` interface across voice and messaging, silence-detection primitives, and a vendored logger so CR no longer leans on `@twilio/tac-core`.

### Key Changes (v1 → v2)

1. **✅ ConversationRelay Extracted** (carried from v1) — Separate `@twilio/tac-conversationrelay` package with zero dependency on `@twilio/tac-core`.
2. **✅ NEW: Complete outgoing CR protocol** — `sendPlay`, `sendDigits`, `switchLanguage`, `endCall` on `ConversationRelay`, backed by `OutgoingMessageSchema` discriminated union.
3. **✅ NEW: CR Tool Registry + four built-in tools** — `playMediaTool`, `sendDigitsTool`, `switchLanguageTool`, `endCallTool` auto-registered on every `ConversationRelay` instance, with `toOpenAIFormat()` / `toAnthropicFormat()` adapters.
4. **✅ NEW: Unified `Channel` tool interface** — `listTools` / `registerTool` / `executeTool` on all channels; `VoiceChannel.executeTool` auto-ships any `outgoingMessage` the tool returns.
5. **✅ NEW: `SilenceDetector` primitive** — per-`CallSid` progressive reminders with optional terminal timeout (replaces removed `setListenModeTool` / `setSilenceDetectionTool`).
6. **✅ NEW: Vendored CR logger** — optional `Logger` on `ConversationRelay`, `createLogger` helper vendored into CR; standalone CR usage no longer needs the core package.
7. **✅ Architecture Improved** (carried from v1) — `VoiceChannel` composes CR instead of inheriting a protocol parser. `BaseChannel` removed in favor of composition.
8. **✅ Type Safety Enhanced** (carried from v1) — Branded `ConversationId`, `ProfileId`, `MemoryStoreId`, `KnowledgeBaseId`. `MemoryStoreId` schema tightened to `mem_store_*` only.
9. **✅ Maestro / Memory / Knowledge / CI: PRESERVED** — API surface and runtime behavior identical to main (minor type-safety tightening + new `addOrFetchParticipant` + `getConfiguration`).

### Test Coverage

- **Main branch:** ~250 tests
- **This branch:** **494 tests** across 30 files (30/30 files passing, 494/494 cases passing)
- **Net:** +244 tests, largely concentrated in the new CR protocol methods, tool registry, silence detector, channel tool-interface surfaces, `twilioRegion` support, and BYO-Fastify customization.

---

## The Headline: Same Tool Interface, CR-Only or CR-with-TAC

The core design goal of this branch is that a user reaches for **the same two methods** — `listTools()` and `executeTool(...)` — whether they are running ConversationRelay standalone or through `VoiceChannel` inside TAC. Protocol tools (`play_media`, `send_digits`, `switch_language`, `end_call`) come pre-registered in both cases, and `executeTool` auto-ships the corresponding WebSocket frame. No LLM SDK dependency, no hand-rolled dispatcher, no branch on "tool type" at the call site.

### CR-Only (standalone `@twilio/tac-conversationrelay`)

Diagram from [packages/conversationrelay/README.md](packages/conversationrelay/README.md#architecture):

```
 +------------+         +-------------------------------------------------+
 |  Twilio    |         |  ConversationRelay (this package)               |
 | ConvRelay  |<---WS-->|                                                 |    +---------+
 |  (voice)   |         |   +-------------------+   +-----------------+   |<-->|  User   |
 +------------+         |   | tool registry     |   | callbacks       |   |    |  LLM    |
                        |   |  playMedia        |   |  onPrompt       |   |    |  loop   |
                        |   |  sendDigits       |   |  onDtmf         |   |    +---------+
                        |   |  switchLanguage   |   |  onInterrupt    |   |         ^
                        |   |  endCall          |   |  onSession*     |   |         |
                        |   |  + user tools     |   |  onError/Info   |   |         |
                        |   +-------------------+   +-----------------+   |         |
                        |                                                 |         |
                        |   public API:                                   |         |
                        |     sendResponse(callSid, text)                 |         |
                        |     listTools()                                 |         |
                        |     executeTool(callSid, name, args)            |         |
                        |       +-- auto-ships protocol outgoingMessage   |         |
                        |          via Twilio WS                          |         |
                        +-------------------------------------------------+         |
                                                                                    |
    LLM SDK (OpenAI, Anthropic, Google...) lives in USER code, never in CR. --------+
    Tool format conversion via CRTool.toOpenAIFormat() / toAnthropicFormat()
    at call site.
```

### CR-with-TAC (multi-channel via `@twilio/tac-core`)

Diagram from [README.md](README.md#architecture):

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

### The symmetry at the call site

```typescript
// CR-only — scoped by CallSid
const tools = conversationRelay.listTools().map(t => t.toOpenAIFormat());
// ... LLM call ...
await conversationRelay.executeTool(callSid, call.name, JSON.parse(call.argumentsJson));

// CR-with-TAC (via VoiceChannel) — scoped by ConversationId
const tools = voiceChannel.listTools().map(t => t.toOpenAIFormat());
// ... LLM call ...
await voiceChannel.executeTool(conversationId, call.name, JSON.parse(call.argumentsJson));
```

Same three method calls; same built-ins auto-registered; same auto-shipping of `outgoingMessage` via the CR WebSocket. The only difference is the identifier (`CallSid` vs. `ConversationId`) because TAC-mode conversations can span multiple channels.

Both quickstarts demonstrate this directly:

- **CR-only**: [getting_started/examples/crelay/src/index.ts](getting_started/examples/crelay/src/index.ts)
- **CR-with-TAC**: [getting_started/examples/conversation/src/index.ts](getting_started/examples/conversation/src/index.ts)

Ask either quickstart "play a hold tone", "send digits 1234", or "end the call with a goodbye" — the corresponding `play` / `sendDigits` / `end` frame is shipped on the Twilio WebSocket without a line of custom code.

---

## 1. ConversationRelay Package Extraction

### Main Branch (Before)

**File:** `packages/core/src/channels/voice.ts` — CR protocol embedded in `VoiceChannel` (~800 lines). Every new incoming message type (setup/prompt/interrupt/dtmf/info/error) meant adding branches inside `VoiceChannel.handleWebSocketConnection`.

### This Branch (After)

**File:** [packages/conversationrelay/src/crelay.ts](packages/conversationrelay/src/crelay.ts) (568 lines) — standalone CR protocol handler.

`VoiceChannel` shrank from 800+ lines to 678 lines and now composes CR:

```typescript
// packages/core/src/channels/voice.ts
export class VoiceChannel implements Channel {
  private readonly conversationRelay: ConversationRelay;

  constructor(deps) {
    this.conversationRelay = new ConversationRelay(deps.logger);

    // Wire CR callbacks to TAC events
    this.conversationRelay.onSessionStarted((callSid, session, data) => { /* ... */ });
    this.conversationRelay.onPrompt((callSid, message, data) => { /* ... */ });
  }

  public handleWebSocketConnection(ws: WebSocket): void {
    this.conversationRelay.handleConnection(ws);
  }
}
```

**Benefits:**
- ✅ CR is usable independently of TAC (see [getting_started/examples/crelay](getting_started/examples/crelay/))
- ✅ `VoiceChannel` focuses on Maestro orchestration, not protocol parsing
- ✅ CR owns its own test suite (CR-internal: `packages/conversationrelay/tests/`; CR-from-root: `tests/crelay-*.test.ts`)

---

## 2. NEW: Complete CR Protocol Coverage

v1 could only send `text` tokens outbound. v2 implements every outgoing message in the Twilio CR protocol.

### Outgoing messages (sent to Twilio)

| Protocol type | Method on `ConversationRelay` | Schema |
|---|---|---|
| `text` | [sendResponse](packages/conversationrelay/src/crelay.ts#L346) | `TextTokenMessageSchema` |
| `play` | [sendPlay](packages/conversationrelay/src/crelay.ts#L387) | `PlayMessageSchema` |
| `sendDigits` | [sendDigits](packages/conversationrelay/src/crelay.ts#L404) | `SendDigitsMessageSchema` |
| `language` | [switchLanguage](packages/conversationrelay/src/crelay.ts#L416) | `SwitchLanguageMessageBaseSchema` (+ refined variant requiring at least one language) |
| `end` | [endCall](packages/conversationrelay/src/crelay.ts#L431) | `EndMessageSchema` |

All five are unified under a discriminated union:

```typescript
// packages/conversationrelay/src/types.ts:203
export const OutgoingMessageSchema = z.discriminatedUnion('type', [
  TextTokenMessageSchema,
  PlayMessageSchema,
  SendDigitsMessageSchema,
  SwitchLanguageMessageBaseSchema,
  EndMessageSchema,
]);
```

Every outbound frame is routed through the private `sendRawMessage(callSid, message)` helper, which JSON-serializes into the open socket and enforces `WebSocket.OPEN` state with structured error messages.

### TypeScript signatures

```typescript
sendPlay(
  callSid: CallSid,
  source: string,
  options?: { loop?: number; interruptible?: boolean; preemptible?: boolean }
): void;

sendDigits(callSid: CallSid, digits: string): void;  // digits regex: /^[0-9w*#]+$/

switchLanguage(
  callSid: CallSid,
  options: { ttsLanguage?: string; transcriptionLanguage?: string }
): void;

endCall(callSid: CallSid, handoffData?: Record<string, unknown>): void;
```

### New tests

- [tests/crelay-outgoing-messages.test.ts](tests/crelay-outgoing-messages.test.ts) — schema validation for all five outgoing message types.
- [tests/crelay-protocol-methods.test.ts](tests/crelay-protocol-methods.test.ts) — end-to-end WebSocket behavior (467 lines, 40+ cases).

---

## 3. NEW: CR Tool Registry & Built-in Tools

v1 exposed no tool system. v2 ships a complete registry: any `ConversationRelay` instance starts with four protocol tools preloaded, and callers can add domain tools.

### CRTool class

```typescript
// packages/conversationrelay/src/tools/define-tool.ts
export class CRTool<TParams = unknown, TResult = unknown> {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly parameters: JSONSchema,
    public readonly implementation: ToolFunction<TParams, TResult>
  ) {}

  toOpenAIFormat(): Record<string, unknown>;    // { type: 'function', function: { name, description, parameters } }
  toAnthropicFormat(): Record<string, unknown>; // { name, description, input_schema }
  toJSON(): string;
}

export function defineTool<TParams, TResult>(
  name, description, parameters, implementation
): CRTool<TParams, TResult>;
```

`defineTool` is vendored locally — the CR package has no dependency on `@twilio/tac-tools`.

### Built-in protocol tools (auto-registered)

```typescript
// packages/conversationrelay/src/crelay.ts:85-90
// Auto-register built-in CR protocol tools. Users can remove any via unregisterTool().
this.tools = new Map();
const builtIns = [playMediaTool, sendDigitsTool, switchLanguageTool, endCallTool];
for (const tool of builtIns) {
  this.tools.set(tool.name, tool as unknown as CRTool);
}
```

| Tool | Name | Returned `outgoingMessage.type` |
|---|---|---|
| [playMediaTool](packages/conversationrelay/src/tools/play-media.ts) | `play_media` | `play` |
| [sendDigitsTool](packages/conversationrelay/src/tools/send-digits.ts) | `send_digits` | `sendDigits` |
| [switchLanguageTool](packages/conversationrelay/src/tools/switch-language.ts) | `switch_language` | `language` |
| [endCallTool](packages/conversationrelay/src/tools/end-call.ts) | `end_call` | `end` |

Each tool's implementation is a pure function returning `{ success, message, outgoingMessage }` — CR inspects the `outgoingMessage`, validates it against `OutgoingMessageSchema`, and ships it via the WebSocket automatically.

### Registry API

```typescript
// packages/conversationrelay/src/crelay.ts
public registerTool(tool: CRTool): void;          // add or overwrite
public unregisterTool(name: string): void;         // drop by name
public listTools(): CRTool[];                      // for LLM discovery
public executeTool(callSid, name, args): Promise<unknown>; // invokes + auto-ships outgoingMessage
```

### New tests

- [packages/conversationrelay/tests/crelay-tool-registry.test.ts](packages/conversationrelay/tests/crelay-tool-registry.test.ts) (195 lines)
- [packages/conversationrelay/tests/define-tool.test.ts](packages/conversationrelay/tests/define-tool.test.ts) (162 lines)
- [tests/crelay-tools.test.ts](tests/crelay-tools.test.ts) (289 lines) — full registry + executeTool behavior

---

## 4. NEW: Unified Channel Tool Interface

The `Channel` interface gained three required methods so every channel (voice, SMS, chat) can participate in an LLM tool loop with the same call shape.

### Interface contract

```typescript
// packages/core/src/types/channels.ts
export interface Channel {
  // ... existing ...
  listTools(): CRTool[];
  registerTool(tool: CRTool): void;
  executeTool(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
}
```

### VoiceChannel: delegates to embedded ConversationRelay

```typescript
// packages/core/src/channels/voice.ts:409-437
public listTools(): CRTool[] {
  return this.conversationRelay.listTools();
}

public registerTool(tool: CRTool): void {
  this.conversationRelay.registerTool(tool);
}

public async executeTool(conversationId: ConversationId, name: string, args: unknown): Promise<unknown> {
  const callSid = this.findCallSid(conversationId);
  if (!callSid) throw new Error(`No CallSid found for conversation ${conversationId}`);
  return this.conversationRelay.executeTool(callSid, name, args);
}
```

Because CR's `executeTool` auto-ships any `outgoingMessage`, calling `voiceChannel.executeTool(convId, 'end_call', { reason: 'done' })` sends the `end` frame on the WebSocket with no additional code.

### MessagingChannel: own in-memory registry

Messaging channels (SMS, Chat, VoiceWebhook) get an empty registry by default:

```typescript
// packages/core/src/channels/messaging.ts:313-341
public listTools(): CRTool[] {
  return Array.from(this.tools.values());
}
public registerTool(tool: CRTool): void {
  this.tools.set(tool.name, tool);
}
public executeTool(_conversationId, name, args): Promise<unknown> {
  const tool = this.tools.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return Promise.resolve(tool.implementation(args));
}
```

Messaging tools are plain side-effect functions — there is no `outgoingMessage` auto-shipping.

### Result: one code path across channels

```typescript
// Works identically for voice, SMS, chat
const tools = channel.listTools().map(t => t.toOpenAIFormat());
// feed to LLM, receive tool_calls, dispatch:
const result = await channel.executeTool(convId, call.name, JSON.parse(call.arguments));
```

Both quickstarts ([conversation](getting_started/examples/conversation/src/index.ts) and [crelay](getting_started/examples/crelay/src/index.ts)) use this shape today with the built-in tools — asking either one to play media, send DTMF, switch language, or end the call works out of the box.

---

## 5. NEW: Silence Detection Primitive

`SilenceDetector` is a standalone per-`CallSid` reminder system. It replaces the removed `setListenModeTool` / `setSilenceDetectionTool` LLM-exposed tools with a non-LLM primitive the application owns.

```typescript
// packages/conversationrelay/src/lib/silence-detector.ts
export class SilenceDetector {
  constructor(config: SilenceDetectorConfig, logger: Logger);

  reset(callSid: CallSid): void;          // call when user speaks / DTMFs
  stop(callSid: CallSid): void;           // call when call ends
  shutdown(): void;
  getActiveCount(): number;
  isActive(callSid: CallSid): boolean;
}

interface SilenceDetectorConfig {
  thresholdSeconds: number;
  reminders: string[];
  onSilence: (callSid, reminder, isTerminal) => void;
}
```

The detector walks the `reminders` array on each timeout. The last reminder fires with `isTerminal === true`, after which monitoring stops automatically — the caller decides whether to send the text or end the call.

Tests: [tests/crelay-silence-detector.test.ts](tests/crelay-silence-detector.test.ts) (511 lines).

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

`createLogger` honours `LOG_LEVEL`, auto-enables `pino-pretty` in development, and reads `NODE_ENV` for defaults.

---

## 7. Package Structure

```
packages/
├── conversationrelay/           # Standalone CR package
│   ├── src/
│   │   ├── crelay.ts            # Protocol handler (568 lines)
│   │   ├── types.ts             # Schemas: incoming + outgoing unions
│   │   ├── lib/
│   │   │   ├── logger.ts        # Vendored pino wrapper
│   │   │   ├── server.ts        # CRelayServer (optional helper)
│   │   │   └── silence-detector.ts
│   │   └── tools/
│   │       ├── define-tool.ts   # CRTool + defineTool (vendored)
│   │       ├── end-call.ts
│   │       ├── play-media.ts
│   │       ├── send-digits.ts
│   │       ├── switch-language.ts
│   │       └── index.ts
│   └── tests/
│       ├── crelay.test.ts
│       ├── crelay-tool-registry.test.ts
│       └── define-tool.test.ts
├── core/                        # TAC + channels + API clients
├── server/                      # TACServer (Fastify)
└── tools/                       # Higher-level tools (memory, handoff)
```

`@twilio/tac-conversationrelay` depends only on `twilio`, `ws`, `zod`, and `pino` — no TAC core dependency.

---

## 8. Channel Architecture

**Pattern:** Interface implementation + composition
- `VoiceChannel` implements `Channel`, composes `ConversationRelay`
- `SMSChannel`, `ChatChannel`, `VoiceWebhookChannel` extend `MessagingChannel`
- `BaseChannel` abstract class removed (composition over inheritance) — carried from v1

New in v2: the `Channel` interface requires `listTools` / `registerTool` / `executeTool`, and each subtree provides the appropriate implementation (CR delegation for voice, in-memory Map for messaging).

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

New in v2: `listTools` / `registerTool` / `executeTool` — required on all channel implementations.

---

## 10. Branded Types for Type Safety

Unchanged from v1: `ConversationId`, `ProfileId`, `MemoryStoreId`, `KnowledgeBaseId`, `ParticipantId`, `CallSid`. Compile-time only — zero runtime cost.

v2 note: `MemoryStoreId` branding is now sound — both the config schema and the `isMemoryStoreId` guard enforce the `mem_store_` prefix, so the cast at [packages/core/src/lib/config.ts:44](packages/core/src/lib/config.ts#L44) is safe.

---

## 11. Breaking Changes Summary

Carried from v1:
1. **Channel Constructor**: `new VoiceChannel(tac)` → `new VoiceChannel(tac.getChannelDeps())`
2. **Event Callback**: `tac.on('prompt', ...)` → `tac.onMessageReady(msg => ...)`
3. **BaseChannel removed** — use composition

New in v2:
4. **`ConversationRelay.onMessage` → `onPrompt`** — callback renamed to match CR protocol semantics
5. **Removed types:** `ResponseService`, `ResponseHandler`, `ContentResponse`, `ToolResultEvent` — replaced by the `executeTool` + `outgoingMessage` flow
6. **Removed tools:** `setListenModeTool`, `setSilenceDetectionTool` — replaced by the `SilenceDetector` class (non-LLM primitive owned by the application)
7. **`Channel` interface gains 3 required methods:** `listTools`, `registerTool`, `executeTool` — any custom channel implementation must provide all three
8. **`ConversationRelay` logger is now optional** — existing code that passes a logger still works

---

## 12. Migration Impact

**Time per app:** 15–30 minutes (unchanged from v1 estimate).

**Replacing bespoke tool wiring** with the registry pattern:

```typescript
// Before (v1 / hand-rolled)
const tools = [myCustomTool1, myCustomTool2];
// ... manual dispatch in LLM loop, manual WebSocket frames for end/play/etc.

// After (v2)
voiceChannel.registerTool(myCustomTool1);
voiceChannel.registerTool(myCustomTool2);

const tools = voiceChannel.listTools().map(t => t.toOpenAIFormat());
// feed to LLM ...
const result = await voiceChannel.executeTool(convId, call.name, JSON.parse(call.arguments));
// If the tool was a built-in CR protocol tool, the outgoing WebSocket frame
// has already been shipped. `result` is returned for the LLM loop.
```

No new wiring required to get DTMF, media playback, language switching, or call end — those arrive pre-registered.

---

## Summary

### ✅ PRESERVED
Maestro / Memory / Knowledge / CI — runtime identical to main. Channel lifecycle unchanged.

### 🔄 CHANGED (Architecture & API)
v1 extraction carried forward; v2 adds the CR protocol substance + unified tool interface + silence primitive + logger decoupling.

### 📊 Test Coverage
Main ~250 → **494 tests on this branch** (+244 net). All 494 pass.

---

## Recommendation

✅ **MERGE** — v1 justified the extraction on architectural grounds; v2 adds the substance that makes the extracted package genuinely useful on its own. Standalone CR users get a complete protocol + tool surface with no core dependency, while TAC users get a more expressive `Channel` interface at no cost to existing wiring (aside from the listed breaking changes).
