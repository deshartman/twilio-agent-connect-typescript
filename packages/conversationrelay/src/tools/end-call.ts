/**
 * End Call Tool - Terminate CR call with optional handoff data
 */

import { defineTool } from '../lib/define-tool';
import type { EndMessage } from '../types';

/**
 * Tool parameters for ending a call
 */
interface EndCallParams {
  reason: string;
  handoffData?: Record<string, unknown>;
}

/**
 * Tool result with outgoing CR message
 */
interface EndCallResult {
  success: boolean;
  message: string;
  outgoingMessage: EndMessage;
}

/**
 * End call tool for ConversationRelay
 *
 * Ends the ConversationRelay session and terminates the call. Optional handoff
 * data can be passed to the ConversationRelay callback webhook for routing
 * to another destination (e.g., Flex TaskRouter).
 *
 * @example
 * ```typescript
 * // Simple call termination
 * const result = await endCallTool.implementation({
 *   reason: 'User requested to end call',
 * });
 *
 * // End with handoff data for Flex transfer
 * const result = await endCallTool.implementation({
 *   reason: 'Escalating to human agent',
 *   handoffData: {
 *     reasonCode: 'live-agent-handoff',
 *     issueType: 'billing',
 *     priority: 'high',
 *   },
 * });
 * ```
 */
export const endCallTool = defineTool<EndCallParams, EndCallResult>(
  'end_call',
  'End the call with optional handoff data',
  {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Reason for ending the call',
      },
      handoffData: {
        type: 'object',
        description:
          'Optional handoff metadata (JSON object sent to ConversationRelay callback webhook)',
      },
    },
    required: ['reason'],
  },
  (params: EndCallParams): EndCallResult => {
    return {
      success: true,
      message: `Ending call: ${params.reason}`,
      outgoingMessage: {
        type: 'end',
        handoffData: params.handoffData ? JSON.stringify(params.handoffData) : undefined,
      },
    };
  }
);
