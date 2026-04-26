/**
 * Send DTMF Digits Tool - Send touch-tone digits to caller
 */

import { defineTool } from '../lib/define-tool';
import type { SendDigitsMessage } from '../types';

/**
 * Tool parameters for sending DTMF digits
 */
interface SendDigitsParams {
  digits: string;
}

/**
 * Tool result with outgoing CR message
 */
interface SendDigitsResult {
  success: boolean;
  message: string;
  outgoingMessage: SendDigitsMessage;
}

/**
 * Send DTMF digits tool for ConversationRelay
 *
 * Sends DTMF (touch-tone) digits to the caller. Supports digits 0-9, *, #,
 * and 'w' for a 500ms pause.
 *
 * @example
 * ```typescript
 * const result = await sendDigitsTool.implementation({
 *   digits: '1234w*#',
 * });
 * // Handle result.outgoingMessage via CRelayChannel.handleToolResult()
 * ```
 */
export const sendDigitsTool = defineTool<SendDigitsParams, SendDigitsResult>(
  'send_digits',
  'Send DTMF digits to caller',
  {
    type: 'object',
    properties: {
      digits: {
        type: 'string',
        pattern: '^[0-9w*#]+$',
        description: 'Digits to send (0-9, w=500ms pause, *, #)',
      },
    },
    required: ['digits'],
  },
  (params: SendDigitsParams): SendDigitsResult => {
    return {
      success: true,
      message: `Sending DTMF: ${params.digits}`,
      outgoingMessage: {
        type: 'sendDigits',
        digits: params.digits,
      },
    };
  }
);
