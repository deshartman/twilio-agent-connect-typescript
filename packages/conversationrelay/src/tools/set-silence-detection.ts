/**
 * Set Silence Detection Tool - Control silence monitoring during CR call
 *
 * This is a STATE MANAGEMENT tool - it does NOT send a CR protocol message.
 * Users must wire up the returned flag to control their SilenceDetector instance.
 */

import { defineTool } from './define-tool';

/**
 * Tool parameters for silence detection control
 */
interface SetSilenceDetectionParams {
  enabled: boolean;
}

/**
 * Tool result with silence detection state flag
 */
interface SetSilenceDetectionResult {
  success: boolean;
  message: string;
  silenceDetectionEnabled: boolean;
}

/**
 * Set silence detection tool for ConversationRelay
 *
 * Controls whether silence monitoring should be active. When enabled, the application
 * should start monitoring for silence and sending reminders. When disabled, silence
 * monitoring should stop.
 *
 * **Important**: This tool returns a state flag - users must implement the control logic:
 * ```typescript
 * const result = setSilenceDetectionTool.implementation({ enabled: true });
 * if (result.silenceDetectionEnabled) {
 *   silenceDetector.reset(callSid); // Start monitoring
 * } else {
 *   silenceDetector.stop(callSid);  // Stop monitoring
 * }
 * ```
 *
 * @example
 * ```typescript
 * // In your tool execution handler
 * const result = await setSilenceDetectionTool.implementation({ enabled: false });
 * if (result.success) {
 *   // Stop silence monitoring for this call
 *   silenceDetector.stop(callSid);
 * }
 * ```
 */
export const setSilenceDetectionTool = defineTool<
  SetSilenceDetectionParams,
  SetSilenceDetectionResult
>(
  'set_silence_detection',
  'Enable or disable silence monitoring during the call',
  {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: 'Whether to enable (true) or disable (false) silence monitoring',
      },
    },
    required: ['enabled'],
  },
  (params: SetSilenceDetectionParams): SetSilenceDetectionResult => {
    const modeDescription = params.enabled
      ? 'enabled (will monitor for silence and send reminders)'
      : 'disabled (no silence monitoring)';

    return {
      success: true,
      message: `Silence detection ${modeDescription}`,
      silenceDetectionEnabled: params.enabled,
    };
  }
);
