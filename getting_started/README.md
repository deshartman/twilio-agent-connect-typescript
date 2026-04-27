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

### Install Example Dependencies and Run the Servers

From the `getting_started/examples/conversation` directory:

```bash
cd getting_started/examples/conversation
npm install
npm run dev
```

The example starts **two Fastify servers in one process**:

| Server | Port | What it serves | Twilio points at it from |
|---|---|---|---|
| `TACServer` | `:8000` | `POST /webhook` — Conversation Orchestrator fan-out (SMS, Chat, passive voice) | Conversation Configuration → Webhook > Callback method |
| `ConversationRelayServer` | `:8001` | `POST /twiml`, `WS /ws`, `POST /conversation-relay-callback` — the voice stack | Phone Number → Voice Configuration webhook |

The two servers exist because `@twilio/tac-conversationrelay` is deliberately standalone with zero dependency on `@twilio/tac-core`. See the root [README](../README.md) for the architectural background.

### Expose Your Servers (two ngrok tunnels)

ngrok forwards one port per tunnel, so you need two. Two separate terminals:

```bash
ngrok http 8000    # → TACServer (Conversation Orchestrator webhooks)
ngrok http 8001    # → ConversationRelayServer (voice)
```

Copy both URLs — they are different hosts (e.g. `https://abc123.ngrok.app` for Maestro and `https://xyz789.ngrok.app` for voice).

**Tip — reserved subdomains for a sane dev loop.** Both the phone-number Voice webhook and the Conversation Configuration callback are baked into Twilio config, so with random tunnels you paste two URLs into the console on every ngrok restart. With reserved ngrok subdomains you paste them once:

```bash
ngrok http --url sierra-des.ngrok.dev 8000   # stable Maestro URL
ngrok http --url cr-des.ngrok.dev     8001   # stable voice URL
```

### Configure Twilio (two URLs, two console pages)

**Voice — phone number webhook → `:8001` tunnel**

1. Console → **Phone Numbers → Manage → Active numbers → your number**.
2. Under **Voice Configuration**, set:
   - **A call comes in**: Webhook
   - **URL**: `https://<voice-ngrok>/twiml`
   - **HTTP**: `POST`

You don't configure `/ws` or `/conversation-relay-callback` anywhere — the TwiML returned from `/twiml` points them back at the same host, derived from the incoming request.

**SMS / Maestro — Conversation Configuration webhook → `:8000` tunnel**

1. Console → **Products & services → Conversation Orchestrator → Conversation Configurations → your configuration**.
2. In the **Overview** tab, click **Edit**.
3. Set **Webhook > Callback method** to `https://<maestro-ngrok>/webhook` with HTTP method `POST`.
4. Save.

Inbound SMS flows to Maestro first, then out to `/webhook` — you do **not** set a Messaging webhook on the phone number page.

> `TAC_PUBLIC_DOMAIN` and `CR_PUBLIC_DOMAIN` (the two `<subdomain>.ngrok.dev` hosts from the ngrok step) must be set in `.env` — both servers require them. `ConversationRelayServer` builds the `wss://` URL for `/ws` and the `https://` URL for `/conversation-relay-callback` directly from `CR_PUBLIC_DOMAIN` and splices them into the TwiML response; both servers also use their respective domain to validate `X-Twilio-Signature`.

## Environment Variables

> **Important**: TAC uses Conversation Orchestrator (Maestro) via `TWILIO_CONVERSATION_CONFIGURATION_ID` (format: `conv_configuration_*`). The chat example separately requires Conversations API v1 via `TWILIO_CONVERSATION_SERVICE_SID` (format: `IS*`) for SDK token generation. These are different Twilio services - do not confuse them.

See [`examples/.env.example`](examples/.env.example) for all available configuration options. Key variables:

### Twilio Credentials (Required)

- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_API_KEY`: Twilio API key
- `TWILIO_API_SECRET`: Twilio API secret
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number

### Conversation Orchestrator - Maestro (Required)

- `TWILIO_CONVERSATION_CONFIGURATION_ID`: Conversation Orchestrator configuration ID (format: `conv_configuration_*`). The memory store linked to this configuration is auto-fetched by `TAC.create()` — no separate `MEMORY_STORE_ID` env var is needed.

### Public Domains (Required)

- `TAC_PUBLIC_DOMAIN`: Public URL Twilio reaches `TACServer` at — used for Conversation Orchestrator webhook signature validation. Example: `https://tac-des.ngrok.dev`.
- `CR_PUBLIC_DOMAIN`: Public URL Twilio reaches `ConversationRelayServer` at — used for signature validation and to build the `wss://` URL in the TwiML response. Example: `https://cr-des.ngrok.dev`.

Accepts either a full `https://...` URL or a bare host (values are normalised). Required because load balancers and reverse proxies routinely rewrite `Host` headers to internal backend addresses, breaking header-based URL reconstruction. See the root [README's public-domain section](../README.md#public-domains-are-required) for the full rationale.

### Optional

- `TWILIO_REGION`: Twilio region subdomain for API routing
- `OPENAI_API_KEY`: Your OpenAI API key (for OpenAI example)

## Other Examples

- **[Chat Example](examples/chat/)** - Web-based chat using the Twilio Conversations JS SDK and ChatChannel
- **[CRelay Example](examples/crelay/)** - Standalone ConversationRelay usage (demonstrates the `@twilio/tac-conversationrelay` package)

## Next Steps

- Customize the agent's behavior by modifying the message handler in `examples/conversation/src/index.ts`
- Register your own tools with `crChannel.registerTool(defineTool(...))` — they show up in `crChannel.listTools()` alongside CR's seven built-in tools and dispatch through the same `crChannel.executeTool(conversationId, name, args)` call. Built-ins split into *protocol* tools that ship a WebSocket frame (`play_media`, `send_digits`, `switch_language`, `end_call`, `live_agent_handoff`) and *state* tools that mutate per-session CR state (`set_listen_mode`, `set_silence_detection`).
- Explore the main [README](../README.md) for advanced features
- Review [CLAUDE.md](../CLAUDE.md) for architecture and development guidelines
