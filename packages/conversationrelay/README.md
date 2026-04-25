# @twilio/tac-conversationrelay

Pure ConversationRelay protocol utility for voice-only Twilio applications. Can be used standalone or as part of the TAC framework.

## Features

- WebSocket protocol handling for Twilio ConversationRelay
- Session lifecycle management (per CallSid)
- Event routing via callbacks
- TwiML generation for `<ConversationRelay>` noun
- Built-in protocol tool registry — LLM-discoverable, auto-ships outgoing messages
- Standalone server option (no Maestro required)

## Architecture

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

## Installation

```bash
npm install @twilio/tac-conversationrelay
```

## Usage

### Option 1: Standalone Server (Recommended)

```typescript
import { ConversationRelay, CRelayServer } from '@twilio/tac-conversationrelay';

const conversationRelay = new ConversationRelay();

// Register event callbacks
conversationRelay.onSessionStarted((callSid, session, data) => {
  console.log(`Call started: ${callSid}`);
});

conversationRelay.onPrompt(async (callSid, message, data) => {
  console.log(`User said: ${message}`);

  // Generate your response (LLM, business logic, etc.)
  const response = await generateResponse(message);

  // Send response back to caller
  conversationRelay.sendResponse(callSid, response);
});

conversationRelay.onSessionEnded((callSid) => {
  console.log(`Call ended: ${callSid}`);
});

// Create and start server
if (!process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('TWILIO_AUTH_TOKEN is required');
}
const server = new CRelayServer(conversationRelay, {
  host: '0.0.0.0',
  port: 3000,
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! How can I help you today?',
    transcriptionProvider: 'Deepgram',
    ttsProvider: 'Google',
  },
  authToken: process.env.TWILIO_AUTH_TOKEN, // required — always-on signature validation
});

await server.start();
```

### Option 2: Library Only (Bring Your Own Server)

```typescript
import { ConversationRelay } from '@twilio/tac-conversationrelay';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

const fastify = Fastify();
const conversationRelay = new ConversationRelay();

// Register callbacks
conversationRelay.onPrompt((callSid, message) => {
  const response = generateResponse(message);
  conversationRelay.sendResponse(callSid, response);
});

// TwiML endpoint
fastify.post('/twiml', (req, res) => {
  const wsUrl = `wss://${req.headers.host}/ws`;
  const twiml = conversationRelay.generateTwiML(
    { url: wsUrl, welcomeGreeting: 'Hello!' },
    { conversation_id: req.body.CallSid }
  );
  res.type('application/xml').send(twiml);
});

// WebSocket endpoint
await fastify.register(websocket);
fastify.get('/ws', { websocket: true }, (socket) => {
  conversationRelay.handleConnection(socket);
});

await fastify.listen({ port: 3000 });
```

## API Reference

### ConversationRelay

Main class for ConversationRelay protocol handling.

**Callbacks:**
- `onSessionStarted(callback)` — call connects (setup message received)
- `onPrompt(callback)` — user transcript arrived (CR `prompt` message)
- `onInterrupt(callback)` — user interrupted agent speech
- `onDtmf(callback)` — DTMF input
- `onInfo(callback)` — INFO / diagnostic messages
- `onSessionEnded(callback)` — call ended (WebSocket closed)
- `onError(callback)` — error reported

**Response / action methods:**
- `sendResponse(callSid, message, last?)` — send text for TTS
- `sendPlay(callSid, source, options?)` — play media
- `sendDigits(callSid, digits)` — send DTMF
- `switchLanguage(callSid, options)` — switch TTS/transcription language
- `endCall(callSid, handoffData?)` — end the call

**Tool registry:**
- `listTools()` — all registered tools (built-ins + user-registered)
- `registerTool(tool)` — register an additional `CRTool`
- `unregisterTool(name)` — remove a tool
- `executeTool(callSid, name, args)` — run a tool; auto-ships any protocol `outgoingMessage`

**Server / lifecycle:**
- `generateTwiML(config, parameters, options)` — generate `<ConversationRelay>` TwiML
- `handleConnection(ws)` — accept a WebSocket connection
- `shutdown()` — close all connections

### CRelayServer

Standalone Fastify server for voice-only applications.

**Constructor:**
```typescript
new CRelayServer(conversationRelay: ConversationRelay, config?: CRelayServerConfig)
```

**Config Options:**
- `host` - Server host (default: '0.0.0.0')
- `port` - Server port (default: 3000)
- `webhookPaths` - Custom paths for endpoints
- `conversationRelayConfig` - CR configuration
- `development` - Enable pretty logging
- `authToken` - **Required.** Twilio auth token used to validate every incoming webhook and WebSocket upgrade. Signature validation is always on (see PR #69).
- `onIncomingCall?` - Optional callback invoked on POST `/twiml`. Receives `{ toNumber, fromNumber, callSid }`, returns `Promise<CustomParameters>` (a plain `Record<string, string>`). The record is spliced into the `<ConversationRelay>` TwiML element as `<Parameter>` pairs and arrives on the CR WebSocket `setup` message. Omit for standalone — CR renders TwiML with `{ conversation_id: CallSid }`.
- `onCRCallback?` - Optional callback invoked on POST `/conversation-relay-callback`. Receives the validated `ConversationRelayCallbackPayload`, returns `Promise<{ status, content, contentType }>`. The route echoes whatever the callback returns. Omit for standalone — route is a 200 OK no-op and call-end is observable via `cr.onSessionEnded`.

### Two modes: standalone vs integrated

**Standalone** — drive your own LLM via CR events. Zero TAC, zero Maestro.

```typescript
const conversationRelay = new ConversationRelay();
conversationRelay.onPrompt(async (callSid, prompt) => {
  const reply = await myLLM.chat(prompt);
  conversationRelay.sendResponse(callSid, reply);
});

const server = new CRelayServer(conversationRelay, {
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  port: 8001,
  conversationRelayConfig: { welcomeGreeting: 'Hello!' },
});
await server.start();
```

**Integrated with `@twilio/tac-core`** — wire the two optional callbacks into `VoiceChannel` so each call gets a Maestro conversation with memory, profile, and cross-channel identity. CR itself still has zero dependency on tac-core; the callbacks cross the seam with plain data records.

```typescript
import { TAC, VoiceChannel, TACServer } from '@twilio/tac-core';
import { ConversationRelay, CRelayServer } from '@twilio/tac-conversationrelay';

const tac = await TAC.create({ config: TACConfig.fromEnv() });
const conversationRelay = new ConversationRelay(tac.logger.child({ component: 'crelay' }));
const voiceChannel = new VoiceChannel(tac.getChannelDeps(), { conversationRelay });
tac.registerChannel(voiceChannel);

const crServer = new CRelayServer(conversationRelay, {
  authToken: tac.getConfig().authToken,
  port: 8001,
  conversationRelayConfig: { welcomeGreeting: 'Welcome!' },
  // Integrated wiring: plain data across the seam.
  onIncomingCall: (input) => voiceChannel.createConversationForCall(input),
  onCRCallback:   (payload) => voiceChannel.handleConversationRelayCallback(payload),
});

// TACServer on :8000 serves Maestro webhooks (/webhook + optional /cintel).
// CRelayServer on :8001 serves voice (/twiml + /ws + /conversation-relay-callback).
await Promise.all([new TACServer(tac, { port: 8000 }).start(), crServer.start()]);
```

## Tools

### Built-in protocol tools

Four CR protocol tools are auto-registered on every `ConversationRelay` instance:

| Tool | Purpose |
|------|---------|
| `playMediaTool` | Play audio URL to the caller |
| `sendDigitsTool` | Send DTMF digits |
| `switchLanguageTool` | Change TTS / transcription language mid-call |
| `endCallTool` | Terminate the call, optional handoff data |

Each tool is a `CRTool` exposing `name`, `description`, `parameters` (JSON schema), `implementation`, plus format helpers `toOpenAIFormat()`, `toAnthropicFormat()`, `toJSON()`.

Remove any built-in you don't want discoverable:

```typescript
conversationRelay.unregisterTool('end_call');
```

### Tool flow (LLM dispatch)

Hand the tool list to your LLM, then dispatch each tool call back through CR. For protocol tools, `executeTool` validates and auto-ships the `outgoingMessage` via the WebSocket — you never have to shuttle it yourself.

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

conversationRelay.onPrompt(async (callSid, message) => {
  const tools = conversationRelay
    .listTools()
    .map(t => t.toOpenAIFormat() as unknown as OpenAI.Chat.ChatCompletionTool);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [/* system + history + user */],
    tools,
  });

  const choice = completion.choices[0];

  // Send spoken response
  if (choice?.message?.content) {
    conversationRelay.sendResponse(callSid, choice.message.content);
  }

  // Dispatch tool calls — CR ships protocol outgoingMessages automatically
  for (const call of choice?.message?.tool_calls ?? []) {
    await conversationRelay.executeTool(
      callSid,
      call.function.name,
      JSON.parse(call.function.arguments)
    );
  }
});
```

### Authoring custom tools

```typescript
import { defineTool } from '@twilio/tac-conversationrelay';

const lookupOrderTool = defineTool(
  'lookup_order',
  'Fetch order status by order ID',
  {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Order identifier' },
    },
    required: ['orderId'],
  },
  async ({ orderId }: { orderId: string }) => {
    const order = await orderService.get(orderId);
    return { success: true, status: order.status };
  }
);

conversationRelay.registerTool(lookupOrderTool);
```

User-authored tools without an `outgoingMessage` field simply return their result. `executeTool` hands that result back to you — feed it to the LLM loop.

## Best-practice patterns

Silence handling and listen-mode are **not** CR protocol operations, so they are not built-in tools. They're small patterns you wire in user code — both rely on primitives this package provides.

### Silence detection

Use the `SilenceDetector` helper to track gaps between prompts and take action (warn, end call, etc.) when the caller has been quiet for too long:

```typescript
import { ConversationRelay, SilenceDetector, createLogger } from '@twilio/tac-conversationrelay';

const logger = createLogger();
const conversationRelay = new ConversationRelay(logger);
const silenceDetectors = new Map<string, SilenceDetector>();

conversationRelay.onSessionStarted((callSid) => {
  const detector = new SilenceDetector(
    {
      thresholdSeconds: 15,
      reminders: ['Are you still there?', 'Hello? Can you hear me?', 'Ending call due to inactivity'],
      onSilence: (silencedCallSid, reminder, isTerminal) => {
        if (isTerminal) {
          conversationRelay.endCall(silencedCallSid);
        } else {
          conversationRelay.sendResponse(silencedCallSid, reminder);
        }
      },
    },
    logger
  );
  silenceDetectors.set(callSid, detector);
});

conversationRelay.onPrompt((callSid) => {
  silenceDetectors.get(callSid)?.reset(callSid);
});

conversationRelay.onSessionEnded((callSid) => {
  silenceDetectors.get(callSid)?.stop(callSid);
  silenceDetectors.delete(callSid);
});
```

### Listen-mode (response suppression)

Sometimes you want the agent to listen but not speak — e.g., during a verification flow where the caller is reading a code aloud. Gate your `sendResponse` calls with a per-call flag:

```typescript
const listenMode = new Map<string, boolean>();

conversationRelay.onPrompt(async (callSid, message) => {
  // ... run your LLM loop, build `response` ...
  if (!listenMode.get(callSid)) {
    conversationRelay.sendResponse(callSid, response);
  }
});

// Register a user tool the LLM can call to toggle listen-mode
import { defineTool } from '@twilio/tac-conversationrelay';

conversationRelay.registerTool(
  defineTool(
    'set_listen_mode',
    'Toggle whether the agent speaks aloud. Use during sensitive input flows.',
    {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
    },
    ({ enabled }: { enabled: boolean }) => {
      // `executeTool` receives the callSid internally; capture it via closure
      // in your session initializer, or key this tool per-call.
      listenMode.set(currentCallSid, enabled);
      return { success: true };
    }
  )
);
```

Both patterns compose cleanly with the tool registry — register the gating tool once and the LLM can toggle behavior via function calls.

## License

MIT
