import { BuiltInTools, SessionId, Channel } from '@twilio/tac-core';
import { TACTool, defineTool } from '../lib/builder';

/**
 * Parameters for send message tool
 */
interface SendMessageParams {
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result from send message tool
 */
interface SendMessageResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

/**
 * Create send message tool
 *
 * @param channel - The channel to send messages through
 * @param sessionId - The session ID (accepts CallSid or ConversationId)
 */
export function createSendMessageTool(
  channel: Channel,
  sessionId: SessionId
): TACTool<SendMessageParams, SendMessageResult> {
  return defineTool(
    BuiltInTools.SEND_MESSAGE,
    'Send a message to the user in the current conversation',
    {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message content to send to the user',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata to include with the message',
        },
      },
      required: ['message'],
      description: 'Send a message to the user',
    },
    async (params: SendMessageParams) => {
      try {
        // Use sessionId directly - Channel.sendResponse accepts SessionId and casts internally
        await channel.sendResponse(sessionId, params.message, params.metadata);

        return {
          success: true,
          message_id: `msg_${Date.now()}`, // Simple ID generation
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}

/**
 * Create factory function for messaging tools
 */
export function createMessagingTools() {
  return {
    /**
     * Create send message tool for specific channel and session
     *
     * @param channel - The channel to send messages through
     * @param sessionId - The session ID (accepts CallSid or ConversationId)
     */
    forSession: (channel: Channel, sessionId: SessionId) =>
      createSendMessageTool(channel, sessionId),
  };
}
