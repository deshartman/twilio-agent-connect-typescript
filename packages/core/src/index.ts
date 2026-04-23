/**
 * Twilio Agent Connect - Core Package
 *
 * This is the main entry point for the Twilio Agent Connect.
 * It provides the core functionality for building intelligent agents
 * that integrate with Twilio's communication infrastructure.
 */

// Main TAC class
export { TAC } from './lib/tac';
export type {
  MessageReadyCallback,
  ErrorCallback,
  HandoffCallback,
  ConversationEndedCallback,
  TACOptions,
} from './lib/tac';

// Configuration management
export { TACConfig } from './lib/config';

// Logger
export { createLogger } from './lib/logger';
export type { Logger } from './lib/logger';

// API clients
export { BaseClient } from './clients/base';
export { MemoryClient } from './clients/memory';
export { ConversationClient } from './clients/conversation';
export { KnowledgeClient } from './clients/knowledge';

// Channel implementations
export { SMSChannel } from './channels/sms';
export type { SMSChannelConfig } from './channels/sms';

export { ChatChannel } from './channels/chat';
export type { ChatChannelConfig } from './channels/chat';

export { VoiceChannel } from './channels/voice';
export type { VoiceChannelConfig } from './channels/voice';

// Channel composition helpers (shared by all channels)
export {
  ConversationSessionStore,
  ConversationsWebhookProcessor,
  ensureAgentParticipant,
} from './channels/utility';
export type {
  MessagingWebhookPayload,
  SessionStoreCallbacks,
  ConversationsWebhookHandlers,
  WebhookProcessorConfig,
} from './channels/utility';

// Utility functions
export { handleFlexHandoffLogic } from './util/flex';
export type { FlexHandoffResult } from './util/flex';

// Conversation Intelligence processor
export { OperatorResultProcessor } from './lib/operator-result-processor';

// TAC Memory Response wrapper
export { TACMemoryResponse } from './lib/tac-memory-response';

// Re-export types for convenience
export * from './types/index';
