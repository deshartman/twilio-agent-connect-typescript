/**
 * @twilio/tac-conversationrelay
 *
 * ConversationRelay voice handler package.
 * NO dependency on @twilio/tac-core — completely standalone.
 *
 * Provides CRelayVoice for WebSocket handling, session management,
 * TwiML generation, and event routing for Twilio ConversationRelay.
 */

export { CRelayVoice } from './crelay.js';

// Message types (incoming WebSocket)
export type {
  CallSid,
  SetupMessage,
  PromptMessage,
  InterruptMessage,
  DtmfMessage,
  InfoMessage,
  ErrorMessage,
  WebSocketMessage,
  TextTokenMessage,
  CustomParameters,
  ConversationRelayConfig,
  ConversationRelayAttributes,
  LanguageAttributes,
  ConversationRelayCallbackPayload,
  HandoffData,
  CRelaySession,
} from './types.js';

// Zod schemas (for runtime validation)
export {
  SetupMessageSchema,
  PromptMessageSchema,
  InterruptMessageSchema,
  DtmfMessageSchema,
  InfoMessageSchema,
  ErrorMessageSchema,
  WebSocketMessageSchema,
  TextTokenMessageSchema,
  CustomParametersSchema,
  ConversationRelayConfigSchema,
  ConversationRelayAttributesSchema,
  LanguageAttributesSchema,
  ConversationRelayCallbackPayloadSchema,
  HandoffDataSchema,
} from './types.js';
