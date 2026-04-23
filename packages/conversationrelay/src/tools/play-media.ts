/**
 * Play Media Tool - Play audio file from URL during CR call
 */

import { defineTool } from './define-tool';
import type { PlayMessage } from '../types';

/**
 * Tool parameters for playing media
 */
interface PlayMediaParams {
  source: string;
  loop?: number;
  interruptible?: boolean;
  preemptible?: boolean;
}

/**
 * Tool result with outgoing CR message
 */
interface PlayMediaResult {
  success: boolean;
  message: string;
  outgoingMessage: PlayMessage;
}

/**
 * Play media tool for ConversationRelay
 *
 * Plays an audio file from a URL to the caller. The audio must be accessible
 * from Twilio's network.
 *
 * @example
 * ```typescript
 * const result = await playMediaTool.implementation({
 *   source: 'https://example.com/audio.mp3',
 *   loop: 1,
 *   interruptible: true,
 * });
 * // Handle result.outgoingMessage via CRelayChannel.handleToolResult()
 * ```
 */
export const playMediaTool = defineTool<PlayMediaParams, PlayMediaResult>(
  'play_media',
  'Play audio file from URL to caller',
  {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        format: 'uri',
        description: 'URL of audio file to play (must be accessible to Twilio)',
      },
      loop: {
        type: 'integer',
        minimum: 0,
        description: 'Whole number of times to loop (0 = 1000 times max, default = 1)',
      },
      interruptible: {
        type: 'boolean',
        description: 'Allow user to interrupt playback with speech or DTMF',
      },
      preemptible: {
        type: 'boolean',
        description: 'Allow subsequent messages to preempt this playback',
      },
    },
    required: ['source'],
  },
  (params: PlayMediaParams): PlayMediaResult => {
    return {
      success: true,
      message: `Playing media: ${params.source}`,
      outgoingMessage: {
        type: 'play',
        source: params.source,
        loop: params.loop,
        interruptible: params.interruptible,
        preemptible: params.preemptible,
      },
    };
  }
);
