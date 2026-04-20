/**
 * Switch Language Tool - Change TTS or transcription language mid-call
 */

import { defineTool } from '@twilio/tac-tools';
import type { SwitchLanguageMessage } from '../types.js';

/**
 * Tool parameters for switching language
 */
interface SwitchLanguageParams {
  ttsLanguage?: string;
  transcriptionLanguage?: string;
}

/**
 * Tool result with outgoing CR message or error
 */
interface SwitchLanguageResult {
  success: boolean;
  message: string;
  outgoingMessage?: SwitchLanguageMessage;
}

/**
 * Switch language tool for ConversationRelay
 *
 * Changes the TTS (text-to-speech) and/or transcription (speech-to-text)
 * language during an active call. At least one language must be specified.
 *
 * @example
 * ```typescript
 * // Switch both TTS and transcription to Spanish
 * const result = await switchLanguageTool.implementation({
 *   ttsLanguage: 'es-ES',
 *   transcriptionLanguage: 'es-ES',
 * });
 *
 * // Switch only TTS to French, keep transcription unchanged
 * const result = await switchLanguageTool.implementation({
 *   ttsLanguage: 'fr-FR',
 * });
 * ```
 */
export const switchLanguageTool = defineTool<SwitchLanguageParams, SwitchLanguageResult>(
  'switch_language',
  'Change TTS or transcription language during call',
  {
    type: 'object',
    properties: {
      ttsLanguage: {
        type: 'string',
        description: 'Language code for text-to-speech (e.g., en-US, es-ES, fr-FR)',
      },
      transcriptionLanguage: {
        type: 'string',
        description: 'Language code for speech-to-text (e.g., en-US, es-ES, fr-FR)',
      },
    },
  },
  (params: SwitchLanguageParams): SwitchLanguageResult => {
    if (!params.ttsLanguage && !params.transcriptionLanguage) {
      return {
        success: false,
        message: 'At least one language must be specified',
      };
    }

    return {
      success: true,
      message: `Switching language: TTS=${params.ttsLanguage || 'unchanged'}, STT=${params.transcriptionLanguage || 'unchanged'}`,
      outgoingMessage: {
        type: 'language',
        ttsLanguage: params.ttsLanguage,
        transcriptionLanguage: params.transcriptionLanguage,
      },
    };
  }
);
