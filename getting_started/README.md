# Getting Started with Twilio Agent Connect (TAC)

This guide will walk you through setting up and running your first TAC application in TypeScript.

## Prerequisites

1. **Node.js 22.13.0+** installed
2. **Twilio account** with a phone number
3. **API key** for the SDK you're using (e.g., OpenAI API key)
4. **ngrok** or similar tunneling tool for local development

## Step 1: Choose Your TAC Mode

TAC supports three operating modes via the `TAC_MODE` environment variable:

| Mode | Description | When to Use |
|------|-------------|-------------|
| `crelay` | Voice-only via ConversationRelay | You want voice AI without Maestro |
| `conversation` | Multi-channel with full Maestro integration | You want voice, SMS, and chat with memory and profiles |
| `passive` | Maestro-only (bring your own CR server) | You already have a ConversationRelay server |

## Step 2: Set Up Twilio Services

Create services through the [Twilio Console](https://1console.twilio.com/).

**Required Services:**

- **Conversation Configuration** (required for `conversation` and `passive` modes): For managing conversations via Maestro
- **Memory Service** (optional): For storing and retrieving user context (e.g., persistent profiles, observations, summaries, and richer communication history)

> **Note**: If using `TAC_MODE=crelay`, you can skip Conversation Configuration setup — only Twilio account credentials are needed.

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

From the `getting_started/examples/openai` directory:

```bash
cd getting_started/examples/openai
npm install
npm run dev
```

The server will start on `http://localhost:8000`.

### Expose Your Server

In another terminal, start ngrok:

```bash
ngrok http 8000
# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
```

Update `VOICE_PUBLIC_DOMAIN` in your `.env` file with the full ngrok URL (including `https://`).

## Environment Variables

See [`examples/.env.example`](examples/.env.example) for all available configuration options. Key variables:

### TAC Mode (Required)

- `TAC_MODE`: Operating mode — `crelay`, `conversation`, or `passive`

### Twilio Credentials (Required)

- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_API_KEY`: Twilio API key
- `TWILIO_API_TOKEN`: Twilio API token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number

### Maestro (Required for `conversation` and `passive` modes)

- `CONVERSATION_SERVICE_ID`: Conversation service ID

### Optional

- `MEMORY_STORE_ID`: Memory store ID (for memory integration)
- `VOICE_PUBLIC_DOMAIN`: Your ngrok domain (required for voice in `crelay` and `conversation` modes)
- `OPENAI_API_KEY`: Your OpenAI API key (for OpenAI example)

**Note**: The `ENVIRONMENT` variable is optional and defaults to `prod`. You can omit it for production use.

## Other Examples

- **[Chat Example](examples/chat/)** - Web-based chat using the Twilio Conversations JS SDK and ChatChannel (`conversation` mode)
- **[CRelay Example](examples/crelay/)** - Voice-only with ConversationRelay (`crelay` mode)

## Next Steps

- Customize the agent's behavior by modifying the message handler in `examples/openai/src/index.ts`
- Add tool calling to enable agent actions beyond text responses
- Explore the main [README](../README.md) for advanced features
- Review [CLAUDE.md](../CLAUDE.md) for architecture and development guidelines
