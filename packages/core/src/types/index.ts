/**
 * Twilio Agent Connect - Core Types
 *
 * This module provides all TypeScript types and Zod schemas used
 * throughout the Twilio Agent Connect.
 */

// Configuration types
export * from './config';

// Memory types
export * from './memory';

// Session types (base abstractions)
export * from './session';

// Conversation types
export * from './conversation';

// Channel interface
export * from './channels';

// Re-export CallSid from CR package (used internally by VoiceChannel for WebSocket communication)
export type { CallSid } from '@twilio/tac-conversationrelay';

// TAC Custom Parameters (Maestro-specific, for bridging CR calls to Conversations)
// All ConversationRelay protocol types now live in @twilio/tac-conversationrelay
export { TACCustomParametersSchema, type TACCustomParameters } from './crelay';

// Tool types (TACTool interface excluded — use the TACTool class from the tools package)
export {
  JSONSchemaSchema,
  type JSONSchema,
  type ToolFunction,
  OpenAIToolSchema,
  type OpenAITool,
  type ToolContext,
  ToolExecutionResultSchema,
  type ToolExecutionResult,
  BuiltInTools,
  type BuiltInToolName,
} from './tools';

// Conversation Intelligence types
export * from './cintel';

// TAC unified response types
export * from './tac';

// Knowledge types
export * from './knowledge';

// Re-export Zod for convenience
export { z } from 'zod';
