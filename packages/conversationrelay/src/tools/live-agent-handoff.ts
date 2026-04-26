/**
 * Live Agent Handoff Tool — preset variant of end_call for human escalation.
 *
 * Produces an `{ type: 'end', handoffData: ... }` outgoing frame with a
 * standard `reasonCode: 'live-agent-handoff'` payload. The CR action URL
 * (POST /conversation-relay-callback) then fires with this handoffData
 * string, at which point the user's callback handler typically returns
 * TwiML like `<Dial>` to bridge the caller to a live agent.
 *
 * Thin wrapper over the `outgoingMessage` convention already handled by
 * `executeTool` — no new plumbing.
 */

import { defineTool } from '../lib/define-tool';
import type { EndMessage } from '../types';

interface LiveAgentHandoffParams {
  /** Short explanation of why the handoff is happening. Included in handoffData. */
  summary: string;
  /** Optional extra fields merged into the handoffData object. */
  extra?: Record<string, unknown>;
}

interface LiveAgentHandoffResult {
  success: boolean;
  message: string;
  summary: string;
  outgoingMessage: EndMessage;
}

/**
 * Use when the LLM determines the caller should be transferred to a human
 * agent. Terminates the CR session and signals the handoff intent via the
 * action-URL callback's handoffData.
 */
export const liveAgentHandoffTool = defineTool<LiveAgentHandoffParams, LiveAgentHandoffResult>(
  'live_agent_handoff',
  'Terminate the current call and hand off to a live agent. Provide a brief summary of the interaction so far; the server-side callback handler will typically bridge the caller to a queue.',
  {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Short summary of the conversation, forwarded to the handoff handler.',
      },
      extra: {
        type: 'object',
        description:
          'Optional extra context to include in handoffData (e.g. { priority: "high", skill: "billing" }).',
      },
    },
    required: ['summary'],
  },
  (params: LiveAgentHandoffParams): LiveAgentHandoffResult => {
    const handoffPayload = {
      reasonCode: 'live-agent-handoff',
      reason: params.summary,
      ...(params.extra ?? {}),
    };
    return {
      success: true,
      message: `Handing off to live agent: ${params.summary}`,
      summary: params.summary,
      outgoingMessage: {
        type: 'end',
        handoffData: JSON.stringify(handoffPayload),
      },
    };
  }
);
