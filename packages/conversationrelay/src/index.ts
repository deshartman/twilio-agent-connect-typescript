/**
 * @twilio/tac-conversationrelay
 *
 * ConversationRelay voice handler package.
 * NO dependency on @twilio/tac-core — completely standalone.
 *
 * Provides ConversationRelay for WebSocket handling, session management,
 * TwiML generation, and event routing for Twilio ConversationRelay.
 */

export { ConversationRelay } from './crelay';
export type { ConversationRelayConstructorConfig, SilenceConfig } from './crelay';
export { ConversationRelaySession } from './lib/conversation-relay-session';
export type {
  SessionCallbacks,
  ConversationRelaySessionOptions,
} from './lib/conversation-relay-session';
export { ToolRegistry, CONVERSATION_RELAY_TOOLS } from './lib/tool-registry';
export { ConversationRelayServer } from './lib/server';

// Server types
export type { ConversationRelayServerConfig } from './lib/server';

// Shared Twilio signature-validation helpers
export {
  registerSignatureValidation,
  validateWebSocketSignature,
  getDefaultWebhookUrl,
} from './lib/signature';
export type { RegisterSignatureValidationOptions } from './lib/signature';

// Logger helpers (CR has its own logger — no dep on @twilio/tac-core)
export { createLogger } from './lib/logger';
export type { Logger } from './lib/logger';

// Silence handling helper
export { SilenceHandler } from './lib/silence-handler';
export type { SilenceHandlerConfig } from './lib/silence-handler';

// Built-in tools
export {
  playMediaTool,
  sendDigitsTool,
  switchLanguageTool,
  endCallTool,
  liveAgentHandoffTool,
  setListenModeTool,
  setSilenceDetectionTool,
} from './tools/index';

// Tool definition helpers (for user-authored CR tools)
export { ConversationRelayTool, defineTool, JSONSchemaSchema } from './lib/define-tool';
export type { JSONSchema, ToolFunction } from './lib/define-tool';

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
  PlayMessage,
  SendDigitsMessage,
  SwitchLanguageMessage,
  EndMessage,
  OutgoingMessage,
  CustomParameters,
  ConversationRelayConfig,
  ConversationRelayAttributes,
  LanguageAttributes,
  ConversationRelayCallbackPayload,
  HandoffData,
} from './types';

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
  PlayMessageSchema,
  SendDigitsMessageSchema,
  SwitchLanguageMessageSchema,
  SwitchLanguageMessageBaseSchema,
  EndMessageSchema,
  OutgoingMessageSchema,
  CustomParametersSchema,
  ConversationRelayConfigSchema,
  ConversationRelayAttributesSchema,
  LanguageAttributesSchema,
  ConversationRelayCallbackPayloadSchema,
  HandoffDataSchema,
} from './types';
