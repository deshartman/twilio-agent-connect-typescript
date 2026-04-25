/**
 * ConversationRelay Type Definitions
 *
 * Single source of truth for all ConversationRelay types and Zod schemas.
 * Compile-time SDK drift guards ensure schemas stay in sync with the Twilio SDK.
 *
 * @see https://www.twilio.com/docs/voice/conversationrelay
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun
 */

import { z } from 'zod';
import type VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';

// =============================================================================
// CallSid Branded Type
// =============================================================================

/**
 * CallSid - Twilio call identifier (branded for type safety)
 */
export type CallSid = string & { readonly _brand: 'CallSid' };

// =============================================================================
// WebSocket Message Schemas (Incoming from Twilio)
// =============================================================================

/**
 * Setup message — first message on WebSocket connection
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#setup-message
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
  customParameters: z.record(z.string(), z.string()).optional(),
});

export type SetupMessage = z.infer<typeof SetupMessageSchema>;

/**
 * Prompt message — user speech transcription
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#prompt-message
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
 * Interrupt message — user interrupted agent speech
 *
 * Fields verified from Twilio docs:
 * - utteranceUntilInterrupt: TTS text that was played before interruption
 * - durationUntilInterruptMs: duration in ms before interruption
 *
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#interrupt-message
 */
export const InterruptMessageSchema = z.object({
  type: z.literal('interrupt'),
  utteranceUntilInterrupt: z.string().optional(),
  durationUntilInterruptMs: z.number().optional(),
});

export type InterruptMessage = z.infer<typeof InterruptMessageSchema>;

/**
 * DTMF message — user pressed a key (placeholder)
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#dtmf-message
 */
export const DtmfMessageSchema = z.object({
  type: z.literal('dtmf'),
  digit: z.string(),
});

export type DtmfMessage = z.infer<typeof DtmfMessageSchema>;

/**
 * Info message — informational event from ConversationRelay (placeholder)
 */
export const InfoMessageSchema = z.object({
  type: z.literal('info'),
  info: z.record(z.unknown()).optional(),
});

export type InfoMessage = z.infer<typeof InfoMessageSchema>;

/**
 * Error message — error event from ConversationRelay (placeholder)
 */
export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  description: z.string().optional(),
});

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

/**
 * Union of all incoming WebSocket message types
 */
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  SetupMessageSchema,
  PromptMessageSchema,
  InterruptMessageSchema,
  DtmfMessageSchema,
  InfoMessageSchema,
  ErrorMessageSchema,
]);

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// =============================================================================
// Outgoing WebSocket Messages (Sent to Twilio)
// =============================================================================

/**
 * Text token message to send via ConversationRelay
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#text-tokens-message
 */
export const TextTokenMessageSchema = z.object({
  type: z.literal('text'),
  token: z.string(),
  last: z.boolean().optional().default(true),
});

export type TextTokenMessage = z.infer<typeof TextTokenMessageSchema>;

/**
 * Play media message - play audio file from URL
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#play-message
 */
export const PlayMessageSchema = z.object({
  type: z.literal('play'),
  source: z.string().url(),
  loop: z.number().int().min(0).optional(),
  interruptible: z.boolean().optional(),
  preemptible: z.boolean().optional(),
});

export type PlayMessage = z.infer<typeof PlayMessageSchema>;

/**
 * Send DTMF digits message
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#send-digits-message
 */
export const SendDigitsMessageSchema = z.object({
  type: z.literal('sendDigits'),
  digits: z.string().regex(/^[0-9w*#]+$/),
});

export type SendDigitsMessage = z.infer<typeof SendDigitsMessageSchema>;

/**
 * Switch language message - change TTS or transcription language
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#language-message
 */
export const SwitchLanguageMessageBaseSchema = z.object({
  type: z.literal('language'),
  ttsLanguage: z.string().optional(),
  transcriptionLanguage: z.string().optional(),
});

/**
 * Switch language message with validation (at least one language required).
 * Use this for validating user input; use base schema for union types.
 */
export const SwitchLanguageMessageSchema = SwitchLanguageMessageBaseSchema.refine(
  data => data.ttsLanguage || data.transcriptionLanguage,
  {
    message: 'At least one language must be specified',
  }
);

export type SwitchLanguageMessage = z.infer<typeof SwitchLanguageMessageBaseSchema>;

/**
 * End session message - terminate call with optional handoff data
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#end-message
 */
export const EndMessageSchema = z.object({
  type: z.literal('end'),
  handoffData: z.string().optional(), // JSON string
});

export type EndMessage = z.infer<typeof EndMessageSchema>;

/**
 * Union of all outgoing WebSocket message types
 */
export const OutgoingMessageSchema = z.discriminatedUnion('type', [
  TextTokenMessageSchema,
  PlayMessageSchema,
  SendDigitsMessageSchema,
  SwitchLanguageMessageBaseSchema,
  EndMessageSchema,
]);

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;

// =============================================================================
// TwiML Configuration Schemas
// =============================================================================

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
  voice: z.string().optional(),
  /** TTS language (may differ from code) */
  ttsLanguage: z.string().optional(),
  /** Transcription provider for this language */
  transcriptionProvider: z.string().optional(),
  /** Speech model for transcription */
  speechModel: z.string().optional(),
  /** Transcription language (may differ from code) */
  transcriptionLanguage: z.string().optional(),
});

export type LanguageAttributes = z.infer<typeof LanguageAttributesSchema>;

/**
 * ConversationRelay attributes for TwiML configuration
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun
 */
export const ConversationRelayAttributesSchema = z.object({
  /** WebSocket URL for ConversationRelay (required) */
  url: z.string().url(),

  // Welcome greeting settings
  /** Initial greeting to play when call connects */
  welcomeGreeting: z.string().optional(),
  /** Whether welcome greeting can be interrupted */
  welcomeGreetingInterruptible: z.enum(['any', 'speech', 'none']).optional(),

  // Transcription settings
  /** Transcription provider (e.g., 'Deepgram', 'Google') */
  transcriptionProvider: z.string().optional(),
  /** Language for transcription (e.g., 'en-US') */
  transcriptionLanguage: z.string().optional(),
  /** Speech model for transcription (e.g., 'nova-3-general') */
  speechModel: z.string().optional(),

  // TTS settings
  /** Text-to-speech provider (e.g., 'Google', 'ElevenLabs') */
  ttsProvider: z.string().optional(),
  /** Language for TTS (e.g., 'en-US') */
  ttsLanguage: z.string().optional(),
  /** Voice identifier for TTS (e.g., 'en-US-Journey-O') */
  voice: z.string().optional(),
  /** ElevenLabs text normalization setting */
  elevenlabsTextNormalization: z.string().optional(),

  // Interaction settings
  /** When agent speech can be interrupted */
  interruptible: z.enum(['any', 'speech', 'none']).optional(),
  /** Interrupt detection sensitivity */
  interruptSensitivity: z.enum(['low', 'medium', 'high']).optional(),
  /** Enable DTMF tone detection */
  dtmfDetection: z.boolean().optional(),
  /** Recognition hints for domain-specific vocabulary */
  hints: z.string().optional(),
  /** Whether prompts should be reported when TTS is playing and interrupt is disabled */
  reportInputDuringAgentSpeech: z.boolean().optional(),

  // Advanced settings
  /** Enable partial prompts (streaming) */
  partialPrompts: z.boolean().optional(),
  /** Enable profanity filtering */
  profanityFilter: z.boolean().optional(),
  /** Allow preemption of agent speech */
  preemptible: z.boolean().optional(),
  /** Default language code */
  language: z.string().optional(),
  /** Debug options for troubleshooting (string per SDK, not boolean) */
  debug: z.string().optional(),

  // Intelligence service
  /** Conversational Intelligence Service ID or unique name */
  intelligenceService: z.string().optional(),
});

export type ConversationRelayAttributes = z.infer<typeof ConversationRelayAttributesSchema>;

/**
 * Extended ConversationRelay configuration that includes child elements.
 * Includes all ConversationRelayAttributes fields plus support for languages array.
 *
 * Note: The type is defined as an explicit interface and the schema is annotated
 * with z.ZodType<ConversationRelayConfig> to prevent TypeScript's type inference
 * from collapsing to `any` when resolving complex Zod generics with many optional
 * fields (especially under exactOptionalPropertyTypes).
 */
export interface ConversationRelayConfig extends ConversationRelayAttributes {
  /** Optional language configurations as child <Language> elements */
  languages?: LanguageAttributes[] | undefined;
}

export const ConversationRelayConfigSchema: z.ZodType<ConversationRelayConfig> =
  ConversationRelayAttributesSchema.extend({
    /** Optional language configurations as child <Language> elements */
    languages: z.array(LanguageAttributesSchema).optional(),
  });

// =============================================================================
// Custom Parameters (generic, for TwiML <Parameter> elements)
// =============================================================================

/**
 * Custom parameters passed via TwiML <Parameter> elements.
 *
 * TwiML <Parameter> is an XML attribute pair (name + value), so values must
 * be strings. Callers should stringify non-string values before passing them
 * (e.g. `String(num)`, `JSON.stringify(obj)`) to make the encoding explicit.
 */
export const CustomParametersSchema = z.record(z.string(), z.string()).refine(
  params => {
    return Object.keys(params).every(key => key.trim().length > 0);
  },
  { message: 'Custom parameter keys must be non-empty strings' }
);

export type CustomParameters = z.infer<typeof CustomParametersSchema>;

// =============================================================================
// SDK Drift Guards
// =============================================================================

/**
 * @internal Compile-time SDK drift guards — do not use directly.
 * If the Twilio SDK updates VoiceResponse.ConversationRelayAttributes or
 * VoiceResponse.LanguageAttributes, these checks will fail during typecheck,
 * signaling that our Zod schemas need to be updated to match.
 */
export type _SDKDriftGuards = {
  langCompat: LanguageAttributes extends VoiceResponse.LanguageAttributes ? true : never;
  langKeys: keyof VoiceResponse.LanguageAttributes extends keyof LanguageAttributes ? true : never;
  crelayCompat: ConversationRelayAttributes extends VoiceResponse.ConversationRelayAttributes
    ? true
    : never;
  crelayKeys: keyof VoiceResponse.ConversationRelayAttributes extends keyof ConversationRelayAttributes
    ? true
    : never;
};

// =============================================================================
// ConversationRelay Callback Payload (HTTP webhook)
// =============================================================================

/**
 * ConversationRelay callback payload from Twilio webhook
 *
 * Sent when a ConversationRelay session ends or transitions state.
 * Includes standard voice webhook parameters plus ConversationRelay-specific fields.
 *
 * @see https://www.twilio.com/docs/voice/twiml#request-parameters
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun#statuscallback
 */
export const ConversationRelayCallbackPayloadSchema = z.object({
  // Core Twilio identifiers (required)
  AccountSid: z.string(),
  CallSid: z.string(),

  /** Call status with strict type checking for all valid Twilio call states */
  CallStatus: z.enum([
    'queued',
    'initiated',
    'ringing',
    'in-progress',
    'completed',
    'busy',
    'no-answer',
    'failed',
    'canceled',
  ]),

  // Call participants (required)
  From: z.string(),
  To: z.string(),

  /** Direction of the call */
  Direction: z.enum(['inbound', 'outbound-api', 'outbound-dial']),

  // Standard voice webhook parameters (optional)
  ApiVersion: z.string().optional(),
  ForwardedFrom: z.string().optional(),
  CallerName: z.string().optional(),
  ParentCallSid: z.string().optional(),
  ApplicationSid: z.string().optional(),

  // ConversationRelay session information (optional)
  SessionId: z.string().optional(),
  SessionStatus: z.string().optional(),
  SessionDuration: z.string().optional(),
  HandoffData: z.string().optional(), // JSON string
});

export type ConversationRelayCallbackPayload = z.infer<
  typeof ConversationRelayCallbackPayloadSchema
>;

/**
 * Handoff data for Flex escalation
 */
export const HandoffDataSchema = z.object({
  reason: z.string(),
  call_summary: z.string(),
  sentiment: z.string(),
});

export type HandoffData = z.infer<typeof HandoffDataSchema>;

// =============================================================================
// CRelay Session
// =============================================================================

/**
 * CR-only session data — no Maestro concepts (no profileId, no conversationId).
 * Tracks the state of a single ConversationRelay WebSocket connection.
 */
export interface CRelaySession {
  callSid: CallSid;
  from: string;
  to: string;
  startedAt: Date;
  customParameters?: Record<string, string> | undefined;

  /**
   * When true, `sendResponse` / `sendPlay` / `switchLanguage` are suppressed
   * for this session — the agent listens but does not speak. `sendDigits`
   * and `endCall` are never suppressed (DTMF navigation and termination
   * must always work). Toggle via `ConversationRelay.setListenMode` or the
   * `set_listen_mode` built-in tool.
   */
  listenMode: boolean;

  /**
   * Count of outgoing protocol messages suppressed by listen-mode on this
   * session. Test-observable; not intended for production logic.
   */
  suppressedCount: number;
}
