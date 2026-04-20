/**
 * Set Listen Mode Tool - Control text response suppression during CR call
 *
 * This is a STATE MANAGEMENT tool - it does NOT send a CR protocol message.
 * Users must wire up the returned flag to control response sending.
 */

import { defineTool } from './define-tool';

/**
 * Tool parameters for listen mode control
 */
interface SetListenModeParams {
  enabled: boolean;
}

/**
 * Tool result with listen mode state flag
 */
interface SetListenModeResult {
  success: boolean;
  message: string;
  listenMode: boolean;
}

/**
 * Set listen mode tool for ConversationRelay
 *
 * Controls whether text responses should be suppressed. When listen mode is enabled,
 * the agent listens to user input and executes tools, but does NOT send text responses
 * back to the caller. When disabled, normal text responses are sent.
 *
 * **Important**: This tool returns a state flag - users must implement the control logic:
 * ```typescript
 * const result = setListenModeTool.implementation({ enabled: true });
 * if (!result.listenMode) {
 *   // Only send text response if listen mode is OFF
 *   await channel.sendResponse(sessionId, responseText);
 * }
 * ```
 *
 * Use cases:
 * - Silent monitoring (agent listens, executes tools like logging, but doesn't speak)
 * - Conditional response sending based on conversation state
 * - Tool-only execution without TTS output
 *
 * @example
 * ```typescript
 * // Enable listen mode - suppress text responses
 * const result = await setListenModeTool.implementation({ enabled: true });
 * // Store result.listenMode and check before calling channel.sendResponse()
 *
 * // Later, when generating response:
 * if (!listenMode) {
 *   await channel.sendResponse(sessionId, responseText);
 * }
 * ```
 */
export const setListenModeTool = defineTool<SetListenModeParams, SetListenModeResult>(
  'set_listen_mode',
  'Enable or disable text responses while keeping tool execution active',
  {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description:
          'Whether to enable (true) listen-only mode or disable (false) for normal responses',
      },
    },
    required: ['enabled'],
  },
  (params: SetListenModeParams): SetListenModeResult => {
    const modeDescription = params.enabled
      ? 'listen-only mode (text responses suppressed)'
      : 'normal mode (text responses enabled)';

    return {
      success: true,
      message: `Listen mode set to ${params.enabled ? 'enabled' : 'disabled'}. ${modeDescription}`,
      listenMode: params.enabled,
    };
  }
);
