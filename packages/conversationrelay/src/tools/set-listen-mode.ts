/**
 * Set Listen Mode Tool — toggle outgoing-message suppression for this call.
 *
 * When enabled, the agent listens but does not speak: text tokens, play
 * (media), and language frames are suppressed by CR's `sendResponse`
 * chokepoint. DTMF and end-call still work so the LLM can navigate an IVR
 * and terminate.
 *
 * Side-effect is applied by CR via the result-convention pattern: tools
 * that return a `listenMode: boolean` field in their result trigger
 * `setListenMode(callSid, listenMode)` inside `executeTool`. This mirrors
 * the existing `outgoingMessage` convention, keeps tool bodies pure, and
 * means the tool never touches CR state or CallSid directly.
 */

import { defineTool } from '../lib/define-tool';

/**
 * Tool parameters for set_listen_mode
 */
interface SetListenModeParams {
  enabled: boolean;
}

/**
 * Tool result. CR's `executeTool` picks up `listenMode` and applies
 * `setListenMode(callSid, result.listenMode)` for this session.
 */
interface SetListenModeResult {
  success: boolean;
  message: string;
  listenMode: boolean;
}

/**
 * Typical use: outbound IVR navigation. The LLM calls `set_listen_mode`
 * with `enabled=true` while traversing DTMF menus, then `enabled=false`
 * once it detects a human has picked up, at which point it starts
 * speaking.
 */
export const setListenModeTool = defineTool<SetListenModeParams, SetListenModeResult>(
  'set_listen_mode',
  'Toggle whether the agent speaks aloud. Enable (true) when listening for IVR prompts or during sensitive-input capture; disable (false) when ready to speak again.',
  {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description:
          'true = agent listens but does not speak (text/play/language suppressed). false = normal speaking mode.',
      },
    },
    required: ['enabled'],
  },
  (params: SetListenModeParams): SetListenModeResult => {
    return {
      success: true,
      message: `Listen-mode ${params.enabled ? 'enabled (agent suppressed)' : 'disabled (agent will speak)'}`,
      listenMode: params.enabled,
    };
  }
);
