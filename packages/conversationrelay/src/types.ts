/**
 * ConversationRelay type definitions
 */

import { z } from 'zod';

/**
 * CallSid - Twilio call identifier
 */
export type CallSid = string & { readonly __brand: 'CallSid' };

/**
 * Setup message from ConversationRelay
 */
export const SetupMessageSchema = z.object({
  type: z.literal('setup'),
  sessionId: z.string(),
  callSid: z.string(),
  parentCallSid: z.string().optional(),
  from: z.string(),
  to: z.string(),
  forwardedFrom: z.string().optional(),
  callerName: z.string().optional(),
  direction: z.string(),
  callType: z.string(),
  callStatus: z.string(),
  accountSid: z.string(),
  customParameters: z.record(z.unknown()).optional(),
});

export type SetupMessage = z.infer<typeof SetupMessageSchema>;

/**
 * Prompt message from ConversationRelay
 */
export const PromptMessageSchema = z.object({
  type: z.literal('prompt'),
  voicePrompt: z.string(),
  lang: z.string().optional(),
  last: z.boolean().optional(),
  agentSpeaking: z.string().optional(),
});

export type PromptMessage = z.infer<typeof PromptMessageSchema>;

/**
 * Interrupt message from ConversationRelay
 */
export const InterruptMessageSchema = z.object({
  type: z.literal('interrupt'),
  reason: z.string(),
  voicePrompt: z.string().optional(),
});

export type InterruptMessage = z.infer<typeof InterruptMessageSchema>;

/**
 * Text token message to send via ConversationRelay
 */
export const TextTokenMessageSchema = z.object({
  type: z.literal('text'),
  token: z.string(),
  last: z.boolean().optional().default(true),
});

export type TextTokenMessage = z.infer<typeof TextTokenMessageSchema>;

/**
 * Union of all WebSocket message types
 */
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  SetupMessageSchema,
  PromptMessageSchema,
  InterruptMessageSchema,
]);

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

/**
 * Custom parameters passed via TwiML
 */
export const CustomParametersSchema = z.record(z.string(), z.unknown()).refine(
  (params) => {
    // Ensure all keys are non-empty strings
    return Object.keys(params).every((key) => key.trim().length > 0);
  },
  { message: 'Custom parameter keys must be non-empty strings' }
);

export type CustomParameters = z.infer<typeof CustomParametersSchema>;

/**
 * Language configuration for multi-language ConversationRelay support
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun#language-attributes
 */
export const LanguageAttributesSchema = z.object({
  /** Language code (e.g., 'en-US', 'es-ES', 'en-AU') */
  code: z.string(),
  /** TTS provider for this language */
  ttsProvider: z.string().optional(),
  /** TTS voice for this language */
  ttsVoice: z.string().optional(),
  /** Speech model for this language */
  speechModel: z.string().optional(),
  /** Profanity filter setting */
  profanityFilter: z.string().optional(),
  /** Speech timeout in milliseconds */
  speechTimeout: z.string().optional(),
});

export type LanguageAttributes = z.infer<typeof LanguageAttributesSchema>;

/**
 * ConversationRelay attributes (maps to TwiML <ConversationRelay> attributes)
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun#attributes
 */
export const ConversationRelayAttributesSchema = z.object({
  /** WebSocket URL for ConversationRelay connection */
  url: z.string().url(),
  /** Welcome greeting message */
  welcomeGreeting: z.string().optional(),
  /** Welcome greeting interruptibility */
  welcomeGreetingInterruptible: z.enum(['before-start', 'any']).optional(),
  /** Voice for TTS (e.g., 'Google.en-US-Studio-O') */
  voice: z.string().optional(),
  /** TTS provider */
  ttsProvider: z.string().optional(),
  /** Transcription provider */
  transcriptionProvider: z.string().optional(),
  /** Speech model */
  speechModel: z.string().optional(),
  /** Profanity filter */
  profanityFilter: z.string().optional(),
  /** Speech timeout */
  speechTimeout: z.string().optional(),
  /** Interrupt by DTMF */
  dtmfDetection: z.boolean().optional(),
  /** Debug mode */
  debug: z.boolean().optional(),
});

export type ConversationRelayAttributes = z.infer<typeof ConversationRelayAttributesSchema>;

/**
 * Full ConversationRelay configuration including languages
 */
export const ConversationRelayConfigSchema = ConversationRelayAttributesSchema.extend({
  /** Multi-language configurations */
  languages: z.array(LanguageAttributesSchema).optional(),
});

export type ConversationRelayConfig = z.infer<typeof ConversationRelayConfigSchema>;
