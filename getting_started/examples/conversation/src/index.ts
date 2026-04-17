/**
 * Example: OpenAI Integration with Voice and SMS Channels
 *
 * Demonstrates how to use OpenAI with TAC for intelligent, context-aware conversations
 * across both SMS and Voice channels.
 */

import { config } from 'dotenv';
import OpenAI from 'openai';
import {
  TAC,
  TACConfig,
  VoiceChannel,
  SMSChannel,
  ConversationSession,
  TACMemoryResponse,
  TACServer,
} from 'twilio-agent-connect';
// Load environment variables from parent directory
config({ path: '../.env' });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize TAC and channels
const tac = new TAC({ config: TACConfig.fromEnv() });
const voiceChannel = new VoiceChannel(tac.getChannelDeps());
const smsChannel = new SMSChannel(tac.getChannelDeps());

// Register channels
tac.registerChannel(voiceChannel);
tac.registerChannel(smsChannel);

// Store conversation history per conversation
const conversationMessages: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

const SYSTEM_MESSAGE: OpenAI.Chat.ChatCompletionSystemMessageParam = {
  role: 'system',
  content: `You are a Twilio Agent Connect specialist having a natural conversation with the user across voice, SMS, and chat channels. You help users understand how the multi-channel conversation system works, its capabilities, and best practices.

Style: Be concise and get to the point quickly. Keep responses short - address one thing at a time. Speak like a human, use everyday language. Don't repeat what's in the transcript - rephrase if needed. Be conversational, not formal. Show enthusiasm about the technology while being honest about trade-offs. End with a question or suggested next step to keep the conversation moving.

Key knowledge: The system brings voice, text messages, and email together by treating them all as just different inputs to a single, continuous conversation thread. Instead of keeping phone calls and text messages in separate silos, it converts every interaction into a standardized text format and places them on the exact same timeline. When a customer reaches out, the system automatically takes their phone number or email and checks the memory database to see if they are a known user. If they are, the new interaction is instantly linked to their persistent profile. Because the conversation is anchored to this customer memory rather than a temporary channel session, the context persists even if the customer switches channels over time. This allows for seamless channel switching, meaning if a customer is chatting via text and requests a call, the system can transition to voice while carrying over their exact identity and all the dialogue history. It also supports using multiple channels at the very same time. For example, you can send a text message with a verification code or an order receipt to a customer while you are actively speaking with them on a voice call, and the system seamlessly records everything in that same conversation history without breaking the connection.

Important constraints: Adapt your communication style to the channel. On voice, never reference websites, documentation, or code examples - explain concepts verbally. On SMS, keep messages brief and scannable. Always stay in your role as a multi-channel conversation specialist. Respond directly to what the user just said.

This demo: You're running ON the multi-channel system right now - the user is experiencing the technology firsthand. They can call you, text you, or both simultaneously, and you maintain full context across all channels.`,
};

/**
 * Build a memory context system message from TAC memory response.
 * Follows the same format as the Python SDK's MemoryPromptBuilder.
 */
function buildMemoryMessage(
  memoryResponse: TACMemoryResponse | null,
  context: ConversationSession
): OpenAI.Chat.ChatCompletionSystemMessageParam | null {
  const sections: string[] = [];

  // Add profile information if available
  if (context.profile?.traits) {
    const traitLines: string[] = [];
    for (const [key, value] of Object.entries(context.profile.traits)) {
      if (value !== null && value !== undefined) {
        traitLines.push(
          `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean)}`
        );
      }
    }
    if (traitLines.length > 0) {
      sections.push(
        ['## Customer Profile', 'Information about this customer:', ...traitLines].join('\n')
      );
    }
  }

  // Add observations
  if (memoryResponse && memoryResponse.observations.length > 0) {
    const lines = [
      '## Key Observations',
      'Important notes about the customer from previous interactions:',
    ];
    for (const obs of memoryResponse.observations) {
      lines.push(`- ${obs.content}`);
    }
    sections.push(lines.join('\n'));
  }

  // Add conversation summaries
  if (memoryResponse && memoryResponse.summaries.length > 0) {
    const lines = [
      '## Past Conversation Summaries',
      'Summaries of previous conversations with this customer:',
    ];
    for (const summary of memoryResponse.summaries) {
      lines.push(`- ${summary.content}`);
    }
    sections.push(lines.join('\n'));
  }

  // Add recent message history (limit to last 10 messages to avoid exceeding context limits)
  if (memoryResponse && memoryResponse.communications.length > 0) {
    const lines = ['## Recent Message History', 'Recent messages exchanged with this customer:'];
    const recentComms = memoryResponse.communications.slice(-10);
    for (const comm of recentComms) {
      let role: string;
      if (comm.author?.type === 'CUSTOMER') {
        role = 'User';
      } else if (comm.author?.type) {
        role = 'Assistant';
      } else {
        role = 'Unknown';
      }
      const content = comm.content?.text ?? '';
      lines.push(`${role}: ${content}`);
    }
    sections.push(lines.join('\n'));
  }

  if (sections.length === 0) {
    return null;
  }

  const header = [
    '# Customer Context',
    'You have access to the following information about this customer from previous interactions:',
    '',
  ].join('\n');

  return {
    role: 'system',
    content: header + '\n' + sections.join('\n\n'),
  };
}

/**
 * Handle incoming messages from SMS or Voice channels.
 *
 * onMessageReady receives a unified ChannelMessage with:
 * - messageType 'user': generate a response (prompt text, SMS, voice webhook)
 * - messageType 'system': context only (setup, interrupt, dtmf — don't respond)
 */
tac.onMessageReady(async msg => {
  // Only generate responses for 'user' messages
  if (msg.messageType !== 'user') return;

  const convId = msg.conversationId;
  const convIdStr = convId as string;
  const memory = msg.conversation?.memory;

  try {
    // Initialize conversation history if needed
    if (!conversationMessages[convIdStr]) {
      conversationMessages[convIdStr] = [];
    }

    // Add user message to history
    conversationMessages[convIdStr].push({
      role: 'user',
      content: msg.message,
    });

    // Build memory context message (uses conversation session data)
    const memorySession: ConversationSession = {
      conversationId: msg.conversationId,
      channel: msg.channel,
      startedAt: msg.conversation?.startedAt ?? new Date(),
      metadata: {},
      profileId: msg.conversation?.profileId,
      serviceId: msg.conversation?.serviceId,
    };
    const memoryMessage = buildMemoryMessage(memory ?? null, memorySession);

    // Combine system message, memory context, and conversation history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      SYSTEM_MESSAGE,
      ...(memoryMessage ? [memoryMessage] : []),
      ...conversationMessages[convIdStr],
    ];

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages,
    });

    const llmResponse = response.choices[0]?.message?.content ?? '';

    // Add assistant response to history
    conversationMessages[convIdStr].push({
      role: 'assistant',
      content: llmResponse,
    });

    // Send response based on channel
    if (msg.channel === 'voice') {
      await voiceChannel.sendResponse(convId, llmResponse);
    } else if (msg.channel === 'sms') {
      await smsChannel.sendResponse(convId, llmResponse);
    }
  } catch (error) {
    console.error(`Error processing message for conversation ${convId}:`, error);
  }
});

// Create and start server
const server = new TACServer(tac, {
  voice: {
    host: '0.0.0.0',
    port: 8000,
  },
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! What can I tell you about Conversations today?',
    ttsProvider: 'ElevenLabs',
    voice: 'jqcCZkN6Knx8BJ5TBdYR',
  },
  development: true,
});

try {
  await server.start();
  console.log('Server started successfully');
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
