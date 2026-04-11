import { BuiltInTools, SessionId, TAC } from '@twilio/tac-core';
import { TACTool, defineTool } from '../lib/builder';

/**
 * Parameters for handoff tool
 */
interface HandoffParams {
  reason: string;
  urgency?: 'low' | 'medium' | 'high';
  context?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result from handoff tool
 */
interface HandoffResult {
  success: boolean;
  handoff_id: string;
  estimated_wait_time?: string;
  error?: string;
}

/**
 * Create human handoff tool
 *
 * @param tac - The TAC instance
 * @param sessionId - The session ID (accepts CallSid or ConversationId)
 */
export function createHandoffTool(
  tac: TAC,
  sessionId: SessionId
): TACTool<HandoffParams, HandoffResult> {
  return defineTool(
    BuiltInTools.ESCALATE_TO_HUMAN,
    'Escalate the conversation to a human agent when the AI cannot help further',
    {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'The reason for escalating to a human agent',
        },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'The urgency level of the handoff (default: medium)',
        },
        context: {
          type: 'string',
          description: 'Additional context to provide to the human agent',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata for the handoff',
        },
      },
      required: ['reason'],
      description: 'Escalate to human agent',
    },
    async (params: HandoffParams) => {
      try {
        // Build comprehensive handoff reason
        let fullReason = params.reason;

        if (params.context) {
          fullReason += `\n\nAdditional Context: ${params.context}`;
        }

        if (params.urgency) {
          fullReason += `\n\nUrgency: ${params.urgency}`;
        }

        // Trigger the handoff callback - TAC.triggerHandoff accepts SessionId and casts internally
        await tac.triggerHandoff(sessionId, fullReason);

        return {
          success: true,
          handoff_id: `handoff_${Date.now()}`,
          estimated_wait_time: getEstimatedWaitTime(params.urgency ?? 'medium'),
        };
      } catch (error) {
        return {
          success: false,
          handoff_id: `failed_${Date.now()}`,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}

/**
 * Get estimated wait time based on urgency
 */
function getEstimatedWaitTime(urgency: 'low' | 'medium' | 'high'): string {
  switch (urgency) {
    case 'high':
      return '< 2 minutes';
    case 'medium':
      return '2-5 minutes';
    case 'low':
      return '5-10 minutes';
    default:
      return '2-5 minutes';
  }
}

/**
 * Create factory function for handoff tools
 */
export function createHandoffTools() {
  return {
    /**
     * Create handoff tool for specific TAC instance and session
     *
     * @param tac - The TAC instance
     * @param sessionId - The session ID (accepts CallSid or ConversationId)
     */
    forSession: (tac: TAC, sessionId: SessionId) => createHandoffTool(tac, sessionId),
  };
}
