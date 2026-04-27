import { config } from 'dotenv';
import {
  ConversationRelay,
  ConversationRelayServer,
  ConversationRelaySession,
  createLogger,
  type CallSid,
} from '@twilio/tac-conversationrelay';
import OpenAI from 'openai';

// Load environment variables from parent directory
config({ path: '../.env' });

const logger = createLogger({ name: 'crelay-example' });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// LLM model. Must be set in .env. Must support the Responses API and
// function-calling. Recommended: gpt-5.4-mini.
if (!process.env.OPENAI_MODEL) {
  throw new Error('OPENAI_MODEL is required in .env (e.g. OPENAI_MODEL=gpt-5.4-mini)');
}
const OPENAI_MODEL: string = process.env.OPENAI_MODEL;

// System instructions for the Responses API. Responses API takes this as
// the `instructions` field rather than a leading system message in input.
const INSTRUCTIONS = `You are a Twilio Conversation Relay specialist having a natural voice conversation with the user. You help users understand what Conversation Relay is, how it works, its capabilities, implementation patterns, and best practices. You explain technical concepts verbally and answer questions conversationally.

Style: Be concise and get to the point quickly. Keep responses short - address one thing at a time. Speak like a human, use everyday language, add occasional filler words. Don't repeat what's in the transcript - rephrase if needed. Be conversational, not formal. Show enthusiasm about the technology while being honest about trade-offs. End with a question or suggested next step to keep the conversation moving.

Key knowledge: Conversation Relay is Twilio's AI voice technology that bridges your AI application and phone calls via WebSocket. It handles speech-to-text, text-to-speech, interruptions, and orchestration so you focus on building great AI experiences. Unlike Media Streams (raw audio), you work with text messages. Supports multiple providers (Deepgram, Google, Amazon, ElevenLabs), natural interruptions, token streaming for low latency, language switching, and graceful agent handoff. Pricing is seven cents per minute. Common use cases include customer support, appointment scheduling, lead qualification, and IVR modernization.

Important constraints: This is VOICE - never reference websites, documentation, or code examples. Explain concepts verbally using clear descriptions. If transcription seems garbled, be colloquial (say "didn't catch that" or "you're cutting out"). Always stay in your role as a Conversation Relay specialist. Create smooth, human-like conversation that responds directly to what the user just said.

Ending the call: You have a tool called "end_call" that terminates the call. Invoke it when the user clearly wants to end the conversation — for example "goodbye", "bye", "that's all", "thanks", "I'm done", "hang up", or "end the call".

CRITICAL ordering rules for end_call:
1. ALWAYS emit a spoken farewell as assistant TEXT first — at least one full sentence like "Thanks for chatting, goodbye!" or "Happy to help — take care!"
2. THEN call end_call as the final action of the same turn.
3. NEVER call end_call without a farewell text. NEVER call end_call with farewell text placed inside the tool's "reason" argument — "reason" is for logging only and is NOT spoken to the user.

If you skip the spoken farewell, the caller hears Twilio's default robotic fallback voice instead of yours, which is a broken experience.

This demo: You're running ON Conversation Relay right now - the user is experiencing the technology firsthand. You can discuss the WebSocket message types, voice configuration, implementation patterns, and how this application itself works as a working example.`;

// Initialize ConversationRelay voice handler.
//
// Silence handling is enabled with a 30s threshold: after 30s of silence, CR
// fires "Are you still there?" via TTS; after 30s more, it hangs up with
// reasonCode: 'unresponsive'. The per-session SilenceHandler is auto-wired
// by CR — it resets on prompt/interrupt/dtmf and stops on WS close, with
// zero code in this file.
const conversationRelay = new ConversationRelay(logger, {
  silence: { thresholdSeconds: 30 },
});

// Per-call state: conversation history + interrupt flag.
//
// Simple-cr pattern: `onInterrupt` sets the flag true; the stream loop
// checks it every iteration and breaks. No AbortController, no SDK
// cancellation — the OpenAI fetch keeps flowing until it naturally ends,
// we just stop forwarding events. Clean turn boundaries, no
// APIUserAbortError noise in the logs.
type CallState = {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  interrupted: boolean;
};
const calls = new Map<CallSid, CallState>();

// Handle incoming voice messages
conversationRelay.onSessionStarted((session, data) => {
  logger.info({ callSid: session.callSid, from: data.from, to: data.to }, 'Call started');
  calls.set(session.callSid, { history: [], interrupted: false });
});

// Adapt the CR tool registry (Chat Completions shape) to the Responses API
// shape. Chat Completions nests name/description/parameters under a `function`
// key; Responses API wants them flat at the top level. A toResponsesApiFormat()
// method on ConversationRelayTool would be a clean follow-up.
function crToolsForResponsesApi(): OpenAI.Responses.Tool[] {
  return conversationRelay
    .getToolRegistry()
    .list()
    .map(t => {
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

async function streamAssistantTurn(
  session: ConversationRelaySession,
  state: CallState
): Promise<void> {
  // Reset the interrupt flag at the top of every new turn. Any prior
  // in-flight stream loop has already exited (the function returned); we're
  // entering a fresh closure scope with its own local flag-watcher.
  state.interrupted = false;

  const tools = crToolsForResponsesApi();

  // Map history to Responses API input items. Each turn we pass the full
  // conversation so far; the API is stateless w.r.t. prior responses unless
  // `previous_response_id` is supplied (which we don't, to keep turn-by-turn
  // control simple).
  const input: OpenAI.Responses.ResponseInput = state.history.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const stream = await openai.responses.create({
    model: OPENAI_MODEL,
    input,
    instructions: INSTRUCTIONS,
    ...(tools.length > 0 && { tools }),
    stream: true,
  });

  let fullResponse = '';
  type InFlightToolCall = { name: string; args: string };
  let currentCall: InFlightToolCall | null = null;

  for await (const event of stream) {
    if (state.interrupted) break;

    switch (event.type) {
      case 'response.output_text.delta': {
        const token = event.delta || '';
        if (token) {
          fullResponse += token;
          await session.sendText(token, false);
        }
        break;
      }
      case 'response.output_item.added': {
        // A new output item starts. For function calls, capture the name
        // and any pre-populated arguments (the SDK sometimes delivers the
        // full args here; otherwise deltas follow).
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
        // Arguments complete — the Responses API guarantees the `arguments`
        // string is valid JSON at this point. Dispatch the tool fire-and-forget;
        // session.sendText('', true) at the end of the turn will await any
        // in-flight executeTool via its inFlightToolCalls guard, then flush
        // any deferred terminal frame.
        if (currentCall?.name) {
          const toolName = currentCall.name;
          const rawArgs = currentCall.args;
          currentCall = null;

          void (async (): Promise<void> => {
            let parsed: unknown = {};
            try {
              parsed = rawArgs ? JSON.parse(rawArgs) : {};
            } catch (err) {
              logger.error(
                { err, callSid: session.callSid, tool: toolName, rawArgs },
                'Tool argument JSON parse failed — invoking with empty args'
              );
            }
            try {
              await session.executeTool(toolName, parsed);
            } catch (err) {
              logger.error(
                { err, callSid: session.callSid, tool: toolName },
                'Tool execution failed'
              );
            }
          })();
        }
        break;
      }
      default:
        // Ignore everything else: response.created, response.in_progress,
        // response.completed, content_part_*, output_item.done, etc.
        break;
    }
  }

  if (fullResponse) {
    state.history.push({ role: 'assistant', content: fullResponse });
  }

  // Signal completion to TTS. `last: true` awaits any in-flight
  // executeTool via the session's inFlightToolCalls guard, then flushes
  // any deferred terminal frame a tool stashed (e.g. end_call). This is
  // what gives the LLM's farewell time to reach TTS before Twilio hangs up.
  await session.sendText('', true);

  logger.info({ callSid: session.callSid, response: fullResponse }, 'Assistant responded');
}

conversationRelay.onPrompt((session, message, _data) => {
  logger.info({ callSid: session.callSid, message }, 'User spoke');

  const state = calls.get(session.callSid);
  if (!state) return;
  state.history.push({ role: 'user', content: message });

  void streamAssistantTurn(session, state).catch((error: unknown) => {
    // Log and suppress, simple-cr style. Do NOT attempt a recovery sendText —
    // the error may be "WebSocket not open" from a stale turn hitting a
    // closed session, and another sendText would re-throw and kill the
    // process as an unhandled rejection. Next user prompt starts a fresh
    // turn naturally.
    logger.error({ err: error, callSid: session.callSid }, 'Stream error (suppressed)');
  });
});

// Interruption handling: the caller spoke over the agent's TTS. Two things
// happen here: (1) set the interrupted flag so the streamAssistantTurn loop
// breaks on its next iteration (tokens stop flowing to TTS), and (2) rewrite
// the last assistant turn in history to what was actually heard — otherwise
// the next prompt will carry text the caller never received, and multi-turn
// accuracy degrades fast.
conversationRelay.onInterrupt((session, data) => {
  const state = calls.get(session.callSid);
  if (!state) return;

  state.interrupted = true;

  const heard = data.utteranceUntilInterrupt;
  const last = state.history.at(-1);
  if (heard && last?.role === 'assistant') {
    last.content = heard;
  } else if (!heard && last?.role === 'assistant') {
    state.history.pop();
  }
  logger.info(
    { callSid: session.callSid, heard, durationMs: data.durationUntilInterruptMs },
    'User interrupted'
  );
});

conversationRelay.onSessionEnded(session => {
  logger.info({ callSid: session.callSid }, 'Call ended');
  calls.delete(session.callSid);
});

conversationRelay.onError((session, error) => {
  logger.error({ err: error, callSid: session.callSid }, 'ConversationRelay error');
});

// Create and start standalone server
if (!process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('TWILIO_AUTH_TOKEN is required for webhook signature validation');
}
if (!process.env.CR_PUBLIC_DOMAIN) {
  throw new Error(
    'CR_PUBLIC_DOMAIN is required — the public URL Twilio reaches this server at ' +
      '(e.g. https://cr-<you>.ngrok.dev). Used for webhook signature validation and ' +
      'WebSocket URL generation.'
  );
}

const server = new ConversationRelayServer(conversationRelay, {
  host: '0.0.0.0',
  port: 8001,
  publicDomain: process.env.CR_PUBLIC_DOMAIN,
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! What can I tell you about Conversation Relay today?',
    transcriptionProvider: 'Deepgram',
    ttsProvider: 'ElevenLabs',
    voice: 'jqcCZkN6Knx8BJ5TBdYR',
  },
  authToken: process.env.TWILIO_AUTH_TOKEN,
  development: true,
});

await server.start();

logger.info('CRelay server ready. Configure your Twilio phone number to point to this server.');
