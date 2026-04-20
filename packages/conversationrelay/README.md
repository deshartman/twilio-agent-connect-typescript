# @twilio/tac-conversationrelay

Pure ConversationRelay protocol utility for voice-only Twilio applications. Can be used standalone or as part of the TAC framework.

## Features

- WebSocket protocol handling for Twilio ConversationRelay
- Session lifecycle management (per CallSid)
- Event routing via callbacks
- TwiML generation for `<ConversationRelay>` noun
- Standalone server option (no Maestro required)

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

conversationRelay.onMessage(async (callSid, message, data) => {
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
const server = new CRelayServer(conversationRelay, {
  host: '0.0.0.0',
  port: 3000,
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! How can I help you today?',
    transcriptionProvider: 'Deepgram',
    ttsProvider: 'Google',
  },
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN, // For webhook validation
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
conversationRelay.onMessage((callSid, message) => {
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

**Methods:**
- `onSessionStarted(callback)` - Called when call connects
- `onMessage(callback)` - Called when user speaks
- `onInterrupt(callback)` - Called when user interrupts agent
- `onDtmf(callback)` - Called on DTMF input
- `onInfo(callback)` - Called for INFO messages (diagnostic/metadata)
- `onSessionEnded(callback)` - Called when call ends
- `onError(callback)` - Called on errors
- `sendResponse(callSid, message, last?)` - Send text to be spoken
- `generateTwiML(config, parameters, options)` - Generate TwiML
- `handleConnection(ws)` - Accept WebSocket connection
- `shutdown()` - Close all connections

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
- `validateWebhooks` - Enable signature validation
- `twilioAuthToken` - Auth token for validation

## Tools

The package ships with six built-in CR tools plus a `defineTool()` factory for authoring your own. Tools are plain objects you can hand to an LLM — each exposes `name`, `description`, `parameters` (JSON schema), `implementation`, plus format helpers `toOpenAIFormat()`, `toAnthropicFormat()`, `toJSON()`.

### Built-in tools

| Tool | Purpose |
|------|---------|
| `playMediaTool` | Play audio URL to the caller |
| `sendDigitsTool` | Send DTMF digits |
| `switchLanguageTool` | Change TTS / transcription language mid-call |
| `endCallTool` | Terminate the call, optional handoff data |
| `setSilenceDetectionTool` | Returns a flag — wire to your silence monitor |
| `setListenModeTool` | Returns a flag — suppress text responses |

Protocol tools (first four) return `{ outgoingMessage }` — forward it to the CR socket. State tools return flags for your own control logic.

```typescript
import { playMediaTool, endCallTool } from '@twilio/tac-conversationrelay';

const result = playMediaTool.implementation({ source: 'https://example.com/hold.mp3' });
if (result.outgoingMessage) {
  // send via ConversationRelay.sendMessage(callSid, result.outgoingMessage)
}
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

// Feed to an LLM
const openaiTools = [lookupOrderTool.toOpenAIFormat()];
```

## License

MIT
