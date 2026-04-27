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
  ConversationRelayChannel,
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

// Active voice: construct a ConversationRelay and pass it to
// ConversationRelayChannel. The channel handles the CR ↔ Maestro bridge
// (setup, prompt, interrupt events become unified ChannelMessages).
// Passive Maestro voice (webhook-only / BYO-CR) would use VoiceChannel instead.
const conversationRelay = new ConversationRelay(tac.logger.child({ component: 'crelay' }));
const crChannel = new ConversationRelayChannel(tac.getChannelDeps(), { conversationRelay });
const smsChannel = new SMSChannel(tac.getChannelDeps());

// Register channels
tac.registerChannel(crChannel);
tac.registerChannel(smsChannel);

// Store conversation history per conversation
const conversationMessages: Record<string, OpenAI.Chat.ChatCompletionMessageParam[]> = {};

// Per-voice-conversation interrupt flag. Pattern borrowed from simple-cr:
// onInterrupt sets it true; the in-flight Responses API stream loop checks
// it each iteration and breaks. No AbortController — the OpenAI fetch keeps
// flowing until it naturally ends, we just stop forwarding events. Clean
// turn boundaries, no APIUserAbortError noise.
const voiceInterrupted = new Map<string, boolean>();

// LLM model. Must be set in .env. Must support the Responses API and
// function-calling for the voice (crelay) path. Recommended: gpt-5.4-mini.
if (!process.env.OPENAI_MODEL) {
  throw new Error('OPENAI_MODEL is required in .env (e.g. OPENAI_MODEL=gpt-5.4-mini)');
}
const OPENAI_MODEL: string = process.env.OPENAI_MODEL;

const SYSTEM_MESSAGE: OpenAI.Chat.ChatCompletionSystemMessageParam = {
  role: 'system',
  content: `You are a Twilio Agent Connect specialist having a natural conversation with the user across voice, SMS, and chat channels. You help users understand how the multi-channel conversation system works, its capabilities, and best practices.

Style: Be concise and get to the point quickly. Keep responses short - address one thing at a time. Speak like a human, use everyday language. Don't repeat what's in the transcript - rephrase if needed. Be conversational, not formal. Show enthusiasm about the technology while being honest about trade-offs. End with a question or suggested next step to keep the conversation moving.

Key knowledge: The system brings voice, text messages, and email together by treating them all as just different inputs to a single, continuous conversation thread. Instead of keeping phone calls and text messages in separate silos, it converts every interaction into a standardized text format and places them on the exact same timeline. When a customer reaches out, the system automatically takes their phone number or email and checks the memory database to see if they are a known user. If they are, the new interaction is instantly linked to their persistent profile. Because the conversation is anchored to this customer memory rather than a temporary channel session, the context persists even if the customer switches channels over time. This allows for seamless channel switching, meaning if a customer is chatting via text and requests a call, the system can transition to voice while carrying over their exact identity and all the dialogue history. It also supports using multiple channels at the very same time. For example, you can send a text message with a verification code or an order receipt to a customer while you are actively speaking with them on a voice call, and the system seamlessly records everything in that same conversation history without breaking the connection.

Important constraints: Adapt your communication style to the channel. On voice, never reference websites, documentation, or code examples - explain concepts verbally. On SMS, keep messages brief and scannable. Always stay in your role as a multi-channel conversation specialist. Respond directly to what the user just said.

Ending the call (voice only): You have a tool called "end_call" that terminates the call. Invoke it when the user clearly wants to end the conversation — for example "goodbye", "bye", "that's all", "thanks", "I'm done", "hang up", or "end the call".

CRITICAL ordering rules for end_call:
1. ALWAYS emit a spoken farewell as assistant TEXT first — at least one full sentence like "Thanks for chatting, goodbye!" or "Happy to help — take care!"
2. THEN call end_call as the final action of the same turn.
3. NEVER call end_call without a farewell text. NEVER call end_call with farewell text placed inside the tool's "reason" argument — "reason" is for logging only and is NOT spoken to the user.

If you skip the spoken farewell, the caller hears Twilio's default robotic fallback voice instead of yours, which is a broken experience. end_call applies to voice only — on SMS or chat, just acknowledge the goodbye and stop sending messages.

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

// Adapt the CR tool registry (Chat Completions shape) to the Responses API
// shape. Chat Completions nests name/description/parameters under a `function`
// key; Responses API wants them flat at the top level.
function crToolsForResponsesApi(): OpenAI.Responses.Tool[] {
  return crChannel.listTools().map(t => {
    const oai = t.toOpenAIFormat() as {
      type: 'function';
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    };
    return {
      type: 'function' as const,
      name: oai.function.name,
      description: oai.function.description,
      parameters: oai.function.parameters,
      strict: null,
    };
  });
}

async function handleVoiceMessage(
  convId: ConversationId,
  convIdStr: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<void> {
  // Reset the interrupt flag at the top of this turn. Any prior loop has
  // already exited (its closure scope closed); this flag-watcher is fresh.
  voiceInterrupted.set(convIdStr, false);

  const tools = crToolsForResponsesApi();

  // Split messages array into (instructions, input). Responses API takes
  // system instructions as a top-level field; the input is just user +
  // assistant turns. Any "system" messages the caller built into messages
  // (SYSTEM_MESSAGE + optional memory context) are concatenated into
  // instructions.
  const systemParts: string[] = [];
  const input: OpenAI.Responses.ResponseInput = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') systemParts.push(m.content);
    } else if (m.role === 'user' || m.role === 'assistant') {
      if (typeof m.content === 'string') {
        input.push({ role: m.role, content: m.content });
      }
    }
  }
  const instructions = systemParts.join('\n\n');

  const stream = await openai.responses.create({
    model: OPENAI_MODEL,
    input,
    instructions,
    ...(tools.length > 0 && { tools }),
    stream: true,
  });

  let fullResponse = '';
  type InFlightToolCall = { name: string; args: string };
  let currentCall: InFlightToolCall | null = null;

  for await (const event of stream) {
    if (voiceInterrupted.get(convIdStr)) break;

    switch (event.type) {
      case 'response.output_text.delta': {
        const token = event.delta || '';
        if (token) {
          fullResponse += token;
          await crChannel.sendResponse(convId, token, { last: false });
        }
        break;
      }
      case 'response.output_item.added': {
        if (event.item?.type === 'function_call') {
          currentCall = {
            name: event.item.name || '',
            args: event.item.arguments || '',
          };
        }
        break;
      }
      case 'response.function_call_arguments.delta': {
        if (currentCall) currentCall.args += event.delta || '';
        break;
      }
      case 'response.function_call_arguments.done': {
        if (currentCall?.name) {
          const toolName = currentCall.name;
          const rawArgs = currentCall.args;
          currentCall = null;

          // Fire-and-forget. The terminal sendResponse below awaits in-flight
          // executeTool via the session's inFlightToolCalls guard, then
          // flushes any deferred terminal frame the tool stashed.
          void (async (): Promise<void> => {
            let parsed: unknown = {};
            try {
              parsed = rawArgs ? JSON.parse(rawArgs) : {};
            } catch (err) {
              console.error(`Tool argument JSON parse failed (${toolName}):`, err, {
                rawArgs,
              });
            }
            try {
              await crChannel.executeTool(convId, toolName, parsed);
            } catch (err) {
              console.error(`Tool execution failed (${toolName}):`, err);
            }
          })();
        }
        break;
      }
      default:
        break;
    }
  }

  if (fullResponse) {
    conversationMessages[convIdStr]?.push({ role: 'assistant', content: fullResponse });
  }

  // Final empty token: signals completion to TTS, awaits in-flight tool
  // calls, then flushes any deferred terminal frame they stashed.
  await crChannel.sendResponse(convId, '', { last: true });
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

  // Interruption: the caller spoke over the agent's TTS. Set the interrupt
  // flag so the in-flight Responses API stream loop breaks on its next
  // iteration, and rewrite the last assistant turn to what was actually
  // heard. Without the rewrite, the next prompt carries text the caller
  // never received and multi-turn accuracy degrades fast.
  if (
    msg.channel === 'crelay' &&
    msg.messageType === 'system' &&
    (msg.metadata as { type?: string } | undefined)?.type === 'interrupt'
  ) {
    voiceInterrupted.set(convIdStr, true);

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

    if (msg.channel === 'crelay') {
      try {
        await handleVoiceMessage(convId, convIdStr, messages);
      } finally {
        voiceInterrupted.delete(convIdStr);
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
if (!process.env.TAC_PUBLIC_DOMAIN) {
  throw new Error(
    'TAC_PUBLIC_DOMAIN is required — the public URL Twilio reaches TACServer at ' +
      '(e.g. https://tac-<you>.ngrok.dev). Used for Conversation Orchestrator webhook ' +
      'signature validation.'
  );
}
if (!process.env.CR_PUBLIC_DOMAIN) {
  throw new Error(
    'CR_PUBLIC_DOMAIN is required — the public URL Twilio reaches ConversationRelayServer ' +
      'at (e.g. https://cr-<you>.ngrok.dev). Used for webhook signature validation and ' +
      'WebSocket URL generation.'
  );
}

const tacServer = new TACServer(tac, {
  host: '0.0.0.0',
  port: 8000,
  publicDomain: process.env.TAC_PUBLIC_DOMAIN,
  development: true,
});

const crServer = new ConversationRelayServer(conversationRelay, {
  authToken: tac.getConfig().authToken,
  host: '0.0.0.0',
  port: 8001,
  publicDomain: process.env.CR_PUBLIC_DOMAIN,
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! What can I tell you about Conversations today?',
    ttsProvider: 'ElevenLabs',
    voice: 'jqcCZkN6Knx8BJ5TBdYR',
  },
  onIncomingCall: input => crChannel.createConversationForCall(input),
  onConversationRelayCallback: payload => crChannel.handleConversationRelayCallback(payload),
  development: true,
});

try {
  await Promise.all([tacServer.start(), crServer.start()]);
  console.log('Both servers started: TACServer :8000, ConversationRelayServer :8001');
} catch (error) {
  console.error('Failed to start servers:', error);
  process.exit(1);
}
