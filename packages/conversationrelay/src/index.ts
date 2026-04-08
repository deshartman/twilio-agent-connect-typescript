/**
 * @twilio/tac-conversationrelay
 *
 * Pure ConversationRelay protocol utility package.
 * NO dependency on @twilio/tac-core - completely standalone.
 *
 * Provides WebSocket handling and TwiML generation for Twilio ConversationRelay.
 * CallSid-based operations only - no Conversation/Maestro concepts.
 */

export { ConversationRelay } from './relay.js';
export { ConversationRelayProtocol } from './protocol.js';
export type {
  CallSid,
  SetupMessage,
  PromptMessage,
  InterruptMessage,
  TextTokenMessage,
  WebSocketMessage,
  CustomParameters,
  ConversationRelayConfig,
  ConversationRelayAttributes,
  LanguageAttributes,
} from './types.js';
export {
  SetupMessageSchema,
  PromptMessageSchema,
  InterruptMessageSchema,
  TextTokenMessageSchema,
  WebSocketMessageSchema,
  CustomParametersSchema,
  ConversationRelayConfigSchema,
  ConversationRelayAttributesSchema,
  LanguageAttributesSchema,
} from './types.js';
