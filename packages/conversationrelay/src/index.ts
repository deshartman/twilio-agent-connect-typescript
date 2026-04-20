/**
 * @twilio/tac-conversationrelay
 *
 * ConversationRelay voice handler package.
 * NO dependency on @twilio/tac-core — completely standalone.
 *
 * Provides ConversationRelay for WebSocket handling, session management,
 * TwiML generation, and event routing for Twilio ConversationRelay.
 */

export { ConversationRelay } from './crelay.js';
export { CRelayServer } from './lib/server.js';

// Server types
export type { CRelayServerConfig } from './lib/server.js';

// Silence detection helper
export { SilenceDetector } from './lib/silence-detector.js';
export type { SilenceDetectorConfig } from './lib/silence-detector.js';

// ResponseService interface (optional LLM integration pattern)
export type {
  ResponseService,
  ResponseHandler,
  ContentResponse,
  ToolResultEvent,
} from './lib/response-service.js';

// Built-in tools
export {
  playMediaTool,
  sendDigitsTool,
  switchLanguageTool,
  endCallTool,
  setSilenceDetectionTool,
  setListenModeTool,
} from './tools/index.js';

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
} from './types.js';
