import { config } from 'dotenv';
import {
  ConversationRelay,
  CRelayServer,
  createLogger,
  type CallSid,
  type CRelaySession,
  type SetupMessage,
  type PromptMessage,
} from '@twilio/tac-conversationrelay';
import OpenAI from 'openai';

// Load environment variables from parent directory
config({ path: '../.env' });

const logger = createLogger({ name: 'crelay-example' });

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

// Initialize ConversationRelay voice handler (defaults its own logger when none is passed)
const conversationRelay = new ConversationRelay();

// Per-call state: conversation history + handle to any in-flight OpenAI stream.
// The AbortController is what lets us cancel the LLM mid-turn when the caller
// interrupts — without it, tokens keep streaming into TTS after the user cuts in.
type CallState = {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  activeStream?: AbortController;
};
const calls = new Map<CallSid, CallState>();

// Handle incoming voice messages
conversationRelay.onSessionStarted(
  (callSid: CallSid, _session: CRelaySession, data: SetupMessage) => {
    logger.info({ callSid, from: data.from, to: data.to }, 'Call started');
    calls.set(callSid, { history: [] });
  }
);

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

async function dispatchToolCalls(
  callSid: CallSid,
  toolCalls: Map<number, ToolCallAccumulator>
): Promise<void> {
  for (const call of toolCalls.values()) {
    if (!call.name) continue;
    try {
      const args: unknown = call.argumentsJson ? JSON.parse(call.argumentsJson) : {};
      await conversationRelay.executeTool(callSid, call.name, args);
    } catch (error) {
      logger.error({ err: error, callSid, tool: call.name }, 'Tool execution failed');
    }
  }
}

async function streamAssistantTurn(callSid: CallSid, state: CallState): Promise<void> {
  // Cancel any previous in-flight stream for this call before starting a new one.
  state.activeStream?.abort();
  const controller = new AbortController();
  state.activeStream = controller;

  // Discover tools via the CR registry (built-in protocol tools + any user-registered tools).
  // toOpenAIFormat() returns Record<string, unknown>; cast for OpenAI's typed slot.
  const tools = conversationRelay
    .listTools()
    .map(t => t.toOpenAIFormat() as unknown as OpenAI.Chat.ChatCompletionTool);

  const stream = await openai.chat.completions.create(
    {
      model: 'gpt-4',
      messages: [SYSTEM_MESSAGE, ...state.history],
      ...(tools.length > 0 && { tools }),
      stream: true,
    },
    { signal: controller.signal }
  );

  let fullResponse = '';
  const toolCalls = new Map<number, ToolCallAccumulator>();

  try {
    for await (const chunk of stream) {
      // If the caller interrupted, stop pushing tokens to TTS immediately.
      if (controller.signal.aborted) break;
      const delta = chunk.choices[0]?.delta;
      const token = delta?.content || '';
      if (token) {
        fullResponse += token;
        conversationRelay.sendResponse(callSid, token, false);
      }
      accumulateToolCallFragments(toolCalls, delta?.tool_calls ?? []);
    }
    // Signal completion so TTS can synthesize the final utterance
    conversationRelay.sendResponse(callSid, '', true);
  } catch (err) {
    // OpenAI SDK throws AbortError when controller.abort() fires — that's the
    // interruption path and is a clean exit, not a failure.
    if ((err as { name?: string })?.name === 'AbortError') return;
    throw err;
  } finally {
    if (state.activeStream === controller) delete state.activeStream;
  }

  if (fullResponse) {
    state.history.push({ role: 'assistant', content: fullResponse });
  }

  // Protocol tools (playMedia/sendDigits/switchLanguage/endCall) are auto-shipped
  // via the WebSocket by executeTool.
  await dispatchToolCalls(callSid, toolCalls);

  logger.info({ callSid, response: fullResponse }, 'Assistant responded');
}

conversationRelay.onPrompt((callSid: CallSid, message: string, _data: PromptMessage) => {
  logger.info({ callSid, message }, 'User spoke');

  const state = calls.get(callSid);
  if (!state) return;
  state.history.push({ role: 'user', content: message });

  void streamAssistantTurn(callSid, state).catch((error: unknown) => {
    logger.error({ err: error, callSid }, 'OpenAI error');
    conversationRelay.sendResponse(
      callSid,
      'Sorry, I encountered an error. Please try again.',
      true
    );
  });
});

// Interruption handling: the caller spoke over the agent's TTS. We must
// (1) cancel the in-flight LLM stream, and (2) rewrite the last assistant
// turn to what was actually heard — otherwise the next prompt will carry
// text the caller never received, and multi-turn accuracy degrades fast.
conversationRelay.onInterrupt((callSid, data) => {
  const state = calls.get(callSid);
  if (!state) return;
  state.activeStream?.abort();

  const heard = data.utteranceUntilInterrupt;
  const last = state.history.at(-1);
  if (heard && last?.role === 'assistant') {
    last.content = heard;
  } else if (!heard && last?.role === 'assistant') {
    state.history.pop();
  }
  logger.info({ callSid, heard, durationMs: data.durationUntilInterruptMs }, 'User interrupted');
});

conversationRelay.onSessionEnded((callSid: CallSid) => {
  logger.info({ callSid }, 'Call ended');
  calls.delete(callSid);
});

conversationRelay.onError((callSid: CallSid, error: Error) => {
  logger.error({ err: error, callSid }, 'ConversationRelay error');
});

// Create and start standalone server
const server = new CRelayServer(conversationRelay, {
  host: '0.0.0.0',
  port: Number.parseInt(process.env.PORT || '8000', 10),
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
