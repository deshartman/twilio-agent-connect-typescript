import { config } from 'dotenv';
import {
  ConversationRelay,
  CRelayServer,
  type CallSid,
  type CRelaySession,
  type SetupMessage,
  type PromptMessage,
} from '@twilio/tac-conversationrelay';
import { pino } from 'pino';
import OpenAI from 'openai';

// Load environment variables from parent directory
config({ path: '../.env' });

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System message for OpenAI
const SYSTEM_MESSAGE: OpenAI.Chat.ChatCompletionSystemMessageParam = {
  role: 'system',
  content: `You are a Twilio Conversation Relay specialist having a natural voice conversation with the user. You help users understand what Conversation Relay is, how it works, its capabilities, implementation patterns, and best practices. You explain technical concepts verbally and answer questions conversationally.

Style: Be concise and get to the point quickly. Keep responses short - address one thing at a time. Speak like a human, use everyday language, add occasional filler words. Don't repeat what's in the transcript - rephrase if needed. Be conversational, not formal. Show enthusiasm about the technology while being honest about trade-offs. End with a question or suggested next step to keep the conversation moving.

Key knowledge: Conversation Relay is Twilio's AI voice technology that bridges your AI application and phone calls via WebSocket. It handles speech-to-text, text-to-speech, interruptions, and orchestration so you focus on building great AI experiences. Unlike Media Streams (raw audio), you work with text messages. Supports multiple providers (Deepgram, Google, Amazon, ElevenLabs), natural interruptions, token streaming for low latency, language switching, and graceful agent handoff. Pricing is seven cents per minute. Common use cases include customer support, appointment scheduling, lead qualification, and IVR modernization.

Important constraints: This is VOICE - never reference websites, documentation, or code examples. Explain concepts verbally using clear descriptions. If transcription seems garbled, be colloquial (say "didn't catch that" or "you're cutting out"). Always stay in your role as a Conversation Relay specialist. Create smooth, human-like conversation that responds directly to what the user just said.

This demo: You're running ON Conversation Relay right now - the user is experiencing the technology firsthand. You can discuss the WebSocket message types, voice configuration, implementation patterns, and how this application itself works as a working example.`,
};

// Initialize ConversationRelay voice handler
const conversationRelay = new ConversationRelay(logger);

// Store conversation history per call
const conversations = new Map<CallSid, Array<{ role: 'user' | 'assistant'; content: string }>>();

// Handle incoming voice messages
conversationRelay.onSessionStarted(
  (callSid: CallSid, _session: CRelaySession, data: SetupMessage) => {
    logger.info({ callSid, from: data.from, to: data.to }, 'Call started');
    conversations.set(callSid, []);
  }
);

conversationRelay.onMessage((callSid: CallSid, message: string, _data: PromptMessage) => {
  logger.info({ callSid, message }, 'User spoke');

  const history = conversations.get(callSid) || [];
  history.push({ role: 'user', content: message });

  // Stream from OpenAI (fire-and-forget to satisfy void return type)
  void (async () => {
    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [SYSTEM_MESSAGE, ...history],
        stream: true,
      });

      let fullResponse = '';
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullResponse += token;
          // Send token incrementally with last=false (more coming)
          conversationRelay.sendResponse(callSid, token, false);
        }
      }

      // Signal completion so TTS can synthesize the final utterance
      conversationRelay.sendResponse(callSid, '', true);

      if (fullResponse) {
        history.push({ role: 'assistant', content: fullResponse });
      }
      logger.info({ callSid, response: fullResponse }, 'Assistant responded');
    } catch (error) {
      logger.error({ err: error, callSid }, 'OpenAI error');
      conversationRelay.sendResponse(
        callSid,
        'Sorry, I encountered an error. Please try again.',
        true
      );
    }
  })();
});

conversationRelay.onSessionEnded((callSid: CallSid) => {
  logger.info({ callSid }, 'Call ended');
  conversations.delete(callSid);
});

conversationRelay.onError((callSid: CallSid, error: Error) => {
  logger.error({ err: error, callSid }, 'ConversationRelay error');
});

// Create and start standalone server
const server = new CRelayServer(conversationRelay, {
  host: '0.0.0.0',
  port: parseInt(process.env.PORT || '8000'),
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! What can I tell you about Conversation Relay today?',
    transcriptionProvider: 'Deepgram',
    ttsProvider: 'ElevenLabs',
    voice: 'jqcCZkN6Knx8BJ5TBdYR',
  },
  ...(process.env.TWILIO_AUTH_TOKEN && { twilioAuthToken: process.env.TWILIO_AUTH_TOKEN }),
  validateWebhooks: true,
  development: true,
});

await server.start();

logger.info('CRelay server ready. Configure your Twilio phone number to point to this server.');
