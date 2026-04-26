/**
 * Set Silence Detection Tool — toggle per-session silence monitoring.
 *
 * Side-effect is applied by CR via the result-convention pattern: tools
 * that return a `silenceEnabled: boolean` field in their result trigger
 * `session.silenceHandler.setEnabled(value)` inside `executeTool` — and,
 * on enable, also call `reset()` so the timer restarts fresh.
 *
 * No-op for sessions that were not constructed with silence config on
 * their ConversationRelay instance (no handler to toggle).
 */

import { defineTool } from '../lib/define-tool';

interface SetSilenceDetectionParams {
  enabled: boolean;
}

/**
 * Tool result. CR's `executeTool` picks up `silenceEnabled` and applies
 * the session's `silenceHandler.setEnabled(...)` side-effect.
 */
interface SetSilenceDetectionResult {
  success: boolean;
  message: string;
  silenceEnabled: boolean;
}

/**
 * Use when the LLM wants to pause silence monitoring for a known-quiet
 * stretch of call (e.g. waiting on hold) without hanging up, or restart
 * monitoring after a period of expected silence.
 */
export const setSilenceDetectionTool = defineTool<
  SetSilenceDetectionParams,
  SetSilenceDetectionResult
>(
  'set_silence_detection',
  'Toggle silence detection monitoring. Enable (true) to monitor for caller silence and trigger reminders/termination; disable (false) to suppress silence reminders entirely.',
  {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description:
          'true = monitor for silence and fire reminders/terminate. false = suppress reminders entirely.',
      },
    },
    required: ['enabled'],
  },
  (params: SetSilenceDetectionParams): SetSilenceDetectionResult => {
    return {
      success: true,
      message: `Silence detection ${params.enabled ? 'enabled (monitoring for silence)' : 'disabled (reminders suppressed)'}`,
      silenceEnabled: params.enabled,
    };
  }
);
