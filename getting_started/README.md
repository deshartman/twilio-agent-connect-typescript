# Getting Started with Twilio Agent Connect (TAC)

This guide will walk you through setting up and running your first TAC application in TypeScript.

## Prerequisites

1. **Node.js 22.13.0+** installed
2. **Twilio account** with a phone number
3. **API key** for the SDK you're using (e.g., OpenAI API key)
4. **ngrok** or similar tunneling tool for local development

## Step 1: Set Up Twilio Services

Create services through the [Twilio Console](https://1console.twilio.com/).

**Required Services:**

- **Conversation Configuration** (required): For managing conversations via Maestro across all channels (Voice, SMS, Chat)
- **Memory Service** (optional): For storing and retrieving user context (e.g., persistent profiles, observations, summaries, and richer communication history)

## Step 2: Run the Example

### Install Dependencies

From the repository root:

```bash
npm install
npm run build
```

### Configure Environment Variables

Create your `.env` file:

```bash
cd getting_started/examples
cp .env.example .env
# Edit .env with your credentials
```

See the **Environment Variables** section below for details.

### Install Example Dependencies and Run the Server

From the `getting_started/examples/conversation` directory:

```bash
cd getting_started/examples/conversation
npm install
npm run dev
```

The server will start on `http://localhost:8000` (as configured in the example). The TAC framework defaults to port 3000, but examples use 8000 for development convenience to avoid conflicts with other services.

### Expose Your Server

In another terminal, start ngrok:

```bash
ngrok http 8000
# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
```

Update `VOICE_PUBLIC_DOMAIN` in your `.env` file with the full ngrok URL (including `https://`).

## Environment Variables

> **Important**: TAC uses Conversation Orchestrator (Maestro) via `CONVERSATION_SERVICE_ID` (format: `conv_configuration_*`). The chat example separately requires Conversations API v1 via `TWILIO_CONVERSATION_SERVICE_SID` (format: `IS*`) for SDK token generation. These are different Twilio services - do not confuse them.

See [`examples/.env.example`](examples/.env.example) for all available configuration options. Key variables:

### Twilio Credentials (Required)

- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_API_KEY`: Twilio API key
- `TWILIO_API_TOKEN`: Twilio API token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number

### Conversation Orchestrator - Maestro (Required)

- `CONVERSATION_SERVICE_ID`: Conversation Orchestrator configuration ID (format: `conv_configuration_*`)

### Optional

- `MEMORY_STORE_ID`: Memory store ID (for memory integration)
- `VOICE_PUBLIC_DOMAIN`: Your ngrok domain (required for voice channel)
- `OPENAI_API_KEY`: Your OpenAI API key (for OpenAI example)

## Other Examples

- **[Chat Example](examples/chat/)** - Web-based chat using the Twilio Conversations JS SDK and ChatChannel
- **[CRelay Example](examples/crelay/)** - Standalone ConversationRelay usage (demonstrates the `@twilio/tac-conversationrelay` package)

## Next Steps

- Customize the agent's behavior by modifying the message handler in `examples/conversation/src/index.ts`
- Register your own tools with `channel.registerTool(defineTool(...))` — they show up in `channel.listTools()` alongside CR's built-in protocol tools (`play_media`, `send_dtmf`, `switch_language`, `end_call`) and dispatch through the same `channel.executeTool(conversationId, name, args)` call
- Explore the main [README](../README.md) for advanced features
- Review [CLAUDE.md](../CLAUDE.md) for architecture and development guidelines
