/**
 * CRelay Voice-Only Server for Twilio Agent Connect
 *
 * Example demonstrating CRelayChannel for voice-only applications
 * without Maestro Conversations Service. Uses ConversationRelay
 * for real-time voice conversations with an AI agent.
 *
 * Usage:
 *     npm start
 *
 * Required env vars:
 *     TAC_MODE=crelay
 *     TWILIO_ACCOUNT_SID    - Twilio account SID
 *     TWILIO_AUTH_TOKEN      - Twilio auth token
 *     TWILIO_API_KEY         - API Key SID (starts with SK)
 *     TWILIO_API_TOKEN       - API Token
 *     TWILIO_PHONE_NUMBER    - Your Twilio phone number
 *     OPENAI_API_KEY         - OpenAI API key
 *     VOICE_PUBLIC_DOMAIN    - Your ngrok domain (e.g., https://abc123.ngrok.app)
 */

import { config } from 'dotenv';
import OpenAI from 'openai';
import { TAC, TACConfig, CRelayChannel, TACServer } from 'twilio-agent-connect';

// Default to crelay mode before dotenv loads (dotenv won't override existing vars).
// If your .env has a different TAC_MODE, this example overrides it to 'crelay'.
const tacModeWasSet = !!process.env.TAC_MODE;
process.env.TAC_MODE ??= 'crelay';
config({ path: '../.env' });

if (!tacModeWasSet) {
  console.log(
    'TAC_MODE defaulted to "crelay" for this example. ' +
      'Set TAC_MODE=crelay in your .env to make this explicit.'
  );
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize TAC (crelay mode — no Maestro, no ConversationClient)
const tac = new TAC({ config: TACConfig.fromEnv() });

// CRelayChannel takes just a logger — no getChannelDeps() needed
const crelayChannel = new CRelayChannel(tac.logger);

// Register channel
tac.registerChannel(crelayChannel);

// Store conversation history per call (keyed by CallSid)
const conversationMessages: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

const SYSTEM_MESSAGE: OpenAI.Chat.ChatCompletionSystemMessageParam = {
  role: 'system',
  content: `You are a Twilio Conversation Relay specialist having a natural voice conversation with the user. You help users understand what Conversation Relay is, how it works, its capabilities, implementation patterns, and best practices. You explain technical concepts verbally and answer questions conversationally.

Style: Be concise and get to the point quickly. Keep responses short - address one thing at a time. Speak like a human, use everyday language, add occasional filler words. Don't repeat what's in the transcript - rephrase if needed. Be conversational, not formal. Show enthusiasm about the technology while being honest about trade-offs. End with a question or suggested next step to keep the conversation moving.

Key knowledge: Conversation Relay is Twilio's AI voice technology that bridges your AI application and phone calls via WebSocket. It handles speech-to-text, text-to-speech, interruptions, and orchestration so you focus on building great AI experiences. Unlike Media Streams (raw audio), you work with text messages. Supports multiple providers (Deepgram, Google, Amazon, ElevenLabs), natural interruptions, token streaming for low latency, language switching, and graceful agent handoff. Pricing is seven cents per minute. Common use cases include customer support, appointment scheduling, lead qualification, and IVR modernization.

Important constraints: This is VOICE - never reference websites, documentation, or code examples. Explain concepts verbally using clear descriptions. If transcription seems garbled, be colloquial (say "didn't catch that" or "you're cutting out"). Always stay in your role as a Conversation Relay specialist. Create smooth, human-like conversation that responds directly to what the user just said.

This demo: You're running ON Conversation Relay right now - the user is experiencing the technology firsthand. You can discuss the WebSocket message types, voice configuration, implementation patterns, and how this application itself works as a working example.`,
};

/**
 * Handle all ConversationRelay events.
 *
 * onMessageReady receives a unified ChannelMessage with messageType discriminator:
 *   - 'user': voice prompt — generate a response
 *   - 'system': context events (setup, interrupt, dtmf, info) — update context, don't respond
 */
tac.onMessageReady(async msg => {
  const callSid = msg.sessionId;

  // System messages: add to context but don't generate a response
  if (msg.messageType === 'system') {
    // Handle interrupt: you could cancel an in-flight LLM stream here
    if (msg.metadata?.type === 'interrupt') {
      console.log(`Call ${callSid} interrupted: ${msg.message}`);
    }
    return;
  }

  // User messages: generate a response
  console.log(`Processing voice prompt for call ${callSid}`);

  try {
    // Initialize conversation history if needed
    let messages = conversationMessages[callSid];
    if (!messages) {
      messages = [];
      conversationMessages[callSid] = messages;
    }

    // Add user message to history
    messages.push({
      role: 'user',
      content: msg.message,
    });

    // Build message array for OpenAI
    const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [SYSTEM_MESSAGE, ...messages];

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: allMessages,
    });

    const llmResponse = response.choices[0]?.message?.content ?? '';

    if (llmResponse) {
      // Add assistant response to history
      messages.push({
        role: 'assistant',
        content: llmResponse,
      });

      // Send response back to the caller via ConversationRelay
      await crelayChannel.sendResponse(callSid, llmResponse);
    }
  } catch (error) {
    console.error(`Error processing voice prompt for call ${callSid}:`, error);
  }
});

// Clean up conversation history when a call ends
tac.onConversationEnded(({ session }) => {
  console.log(`Call ${session.sessionId} ended`);
  delete conversationMessages[session.sessionId];
});

// Create and start server (crelay mode: TwiML + WebSocket + CR callback only)
const server = new TACServer(tac, {
  voice: {
    host: '0.0.0.0',
    port: 8000,
  },
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! What can I tell you about Conversation Relay today?',
    ttsProvider: 'ElevenLabs',
    voice: 'jqcCZkN6Knx8BJ5TBdYR',
  },
  development: true,
});

server
  .start()
  .then(() => {
    console.log('TAC CRelay Server started on http://0.0.0.0:8000');
    console.log('Endpoints: POST /twiml, WS /ws, POST /conversation-relay-callback');
  })
  .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
