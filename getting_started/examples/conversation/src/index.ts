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
  type ConversationId,
  ConversationSession,
  TACMemoryResponse,
  TACServer,
  ConversationRelay,
  ConversationRelayServer,
} from 'twilio-agent-connect';
// Load environment variables from parent directory
config({ path: '../.env' });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize TAC and channels
const tac = await TAC.create({ config: TACConfig.fromEnv() });

// Active voice mode: construct a ConversationRelay and pass it to VoiceChannel.
// VoiceChannel handles the CR ↔ Maestro bridge (setup, prompt, interrupt events
// become unified ChannelMessages). Omit `conversationRelay` for passive mode
// (webhook-only / BYO-CR).
const conversationRelay = new ConversationRelay(tac.logger.child({ component: 'crelay' }));
const voiceChannel = new VoiceChannel(tac.getChannelDeps(), { conversationRelay });
const smsChannel = new SMSChannel(tac.getChannelDeps());

// Register channels
tac.registerChannel(voiceChannel);
tac.registerChannel(smsChannel);

// Store conversation history per conversation
const conversationMessages: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

// Per-voice-conversation handle to the in-flight OpenAI stream. Used by the
// interruption handler to cancel the LLM mid-turn when the caller speaks over
// the agent's TTS — otherwise tokens keep streaming after they cut in.
const voiceStreams = new Map<string, AbortController>();

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

type ToolCallAccumulator = { id: string; name: string; argumentsJson: string };

function accumulateToolCallFragments(
  toolCalls: Map<number, ToolCallAccumulator>,
  fragments: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
): void {
  for (const tc of fragments) {
    const existing = toolCalls.get(tc.index) ?? { id: '', name: '', argumentsJson: '' };
    if (tc.id) existing.id = tc.id;
    if (tc.function?.name) existing.name = tc.function.name;
    if (tc.function?.arguments) existing.argumentsJson += tc.function.arguments;
    toolCalls.set(tc.index, existing);
  }
}

async function dispatchVoiceToolCalls(
  convId: ConversationId,
  toolCalls: Map<number, ToolCallAccumulator>
): Promise<void> {
  for (const call of toolCalls.values()) {
    if (!call.name) continue;
    try {
      const args: unknown = call.argumentsJson ? JSON.parse(call.argumentsJson) : {};
      await voiceChannel.executeTool(convId, call.name, args);
    } catch (err) {
      console.error(`Tool execution failed (${call.name}):`, err);
    }
  }
}

async function handleVoiceMessage(
  convId: ConversationId,
  convIdStr: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  signal: AbortSignal
): Promise<void> {
  // Discover voice tools via the uniform Channel surface. Includes CR built-ins
  // (playMedia, sendDigits, switchLanguage, endCall) plus any user-registered tools.
  // toOpenAIFormat() returns Record<string, unknown>; cast for OpenAI's typed slot.
  const tools = voiceChannel
    .listTools()
    .map(t => t.toOpenAIFormat() as unknown as OpenAI.Chat.ChatCompletionTool);

  const stream = await openai.chat.completions.create(
    {
      model: 'gpt-5.4-mini',
      messages,
      ...(tools.length > 0 && { tools }),
      stream: true,
    },
    { signal }
  );

  let fullResponse = '';
  const toolCalls = new Map<number, ToolCallAccumulator>();

  try {
    for await (const chunk of stream) {
      // If the caller interrupted, stop pushing tokens to TTS immediately.
      if (signal.aborted) break;
      const delta = chunk.choices[0]?.delta;
      const token = delta?.content || '';
      if (token) {
        fullResponse += token;
        await voiceChannel.sendResponse(convId, token, { last: false });
      }
      accumulateToolCallFragments(toolCalls, delta?.tool_calls ?? []);
    }
    // Final empty token signals completion to TTS
    await voiceChannel.sendResponse(convId, '', { last: true });
  } catch (err) {
    // OpenAI SDK throws AbortError when the signal fires — that's the
    // interruption path and is a clean exit, not a failure.
    if ((err as { name?: string })?.name === 'AbortError') return;
    throw err;
  }

  conversationMessages[convIdStr]?.push({ role: 'assistant', content: fullResponse });

  // CR protocol tools are auto-shipped via the WebSocket by executeTool.
  await dispatchVoiceToolCalls(convId, toolCalls);
}

async function handleSmsMessage(
  convId: ConversationId,
  convIdStr: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<void> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages,
  });

  const llmResponse = response.choices[0]?.message?.content ?? '';
  conversationMessages[convIdStr]?.push({ role: 'assistant', content: llmResponse });
  await smsChannel.sendResponse(convId, llmResponse);
}

/**
 * Handle incoming messages from SMS or Voice channels.
 *
 * onMessageReady receives a unified ChannelMessage with:
 * - messageType 'user': generate a response (prompt text, SMS, voice webhook)
 * - messageType 'system': context only (setup, interrupt, dtmf — don't respond)
 */
tac.onMessageReady(async msg => {
  const convIdStr = msg.conversationId as string;

  // Interruption: the caller spoke over the agent's TTS. Cancel the in-flight
  // LLM stream and rewrite the last assistant turn to what was actually heard.
  // Without the rewrite, the next prompt carries text the caller never received
  // and multi-turn accuracy degrades fast.
  if (
    msg.channel === 'voice' &&
    msg.messageType === 'system' &&
    (msg.metadata as { type?: string } | undefined)?.type === 'interrupt'
  ) {
    voiceStreams.get(convIdStr)?.abort();
    voiceStreams.delete(convIdStr);

    const heard = (msg.metadata as { utteranceUntilInterrupt?: string } | undefined)
      ?.utteranceUntilInterrupt;
    const history = conversationMessages[convIdStr];
    const last = history?.at(-1);
    if (heard && last?.role === 'assistant') {
      last.content = heard;
    } else if (!heard && last?.role === 'assistant') {
      history?.pop();
    }
    return;
  }

  if (msg.messageType !== 'user') return;

  const convId = msg.conversationId;
  const memory = msg.conversation?.memory;

  try {
    conversationMessages[convIdStr] ??= [];
    conversationMessages[convIdStr].push({ role: 'user', content: msg.message });

    const memorySession: ConversationSession = {
      conversationId: msg.conversationId,
      channel: msg.channel,
      startedAt: msg.conversation?.startedAt ?? new Date(),
      metadata: {},
      profileId: msg.conversation?.profileId,
      serviceId: msg.conversation?.serviceId,
    };
    const memoryMessage = buildMemoryMessage(memory ?? null, memorySession);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      SYSTEM_MESSAGE,
      ...(memoryMessage ? [memoryMessage] : []),
      ...conversationMessages[convIdStr],
    ];

    if (msg.channel === 'voice') {
      const controller = new AbortController();
      voiceStreams.set(convIdStr, controller);
      try {
        await handleVoiceMessage(convId, convIdStr, messages, controller.signal);
      } finally {
        if (voiceStreams.get(convIdStr) === controller) {
          voiceStreams.delete(convIdStr);
        }
      }
    } else if (msg.channel === 'sms') {
      await handleSmsMessage(convId, convIdStr, messages);
    }
  } catch (error) {
    console.error(`Error processing message for conversation ${convId}:`, error);
  }
});

// Two-server deployment:
//   - TACServer  (:8000) serves /webhook — Conversation Orchestrator fan-out
//     for SMS / Chat / passive voice. Point your Conversations Service webhook
//     URL here.
//   - ConversationRelayServer (:8001) serves /twiml, /ws, /conversation-relay-callback —
//     the voice stack. Point your Twilio voice number's webhook here.
//
// The two callbacks thread VoiceChannel through ConversationRelayServer without CR
// importing from tac-core: createConversationForCall returns the four Maestro
// IDs that get spliced into <ConversationRelay> customParameters, and
// handleConversationRelayCallback closes the Maestro conversation when the
// call ends. Data flows as plain records — CR never learns about Maestro.
const tacServer = new TACServer(tac, {
  host: '0.0.0.0',
  port: 8000,
  development: true,
});

const crServer = new ConversationRelayServer(conversationRelay, {
  authToken: tac.getConfig().authToken,
  host: '0.0.0.0',
  port: 8001,
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! What can I tell you about Conversations today?',
    ttsProvider: 'ElevenLabs',
    voice: 'jqcCZkN6Knx8BJ5TBdYR',
  },
  onIncomingCall: input => voiceChannel.createConversationForCall(input),
  onCRCallback: payload => voiceChannel.handleConversationRelayCallback(payload),
  development: true,
});

try {
  await Promise.all([tacServer.start(), crServer.start()]);
  console.log('Both servers started: TACServer :8000, ConversationRelayServer :8001');
} catch (error) {
  console.error('Failed to start servers:', error);
  process.exit(1);
}
