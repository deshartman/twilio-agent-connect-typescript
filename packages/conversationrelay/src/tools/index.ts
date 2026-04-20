/**
 * ConversationRelay Tools
 *
 * Built-in protocol tools for ConversationRelay. Each tool returns an
 * `outgoingMessage` that the ConversationRelay WebSocket ships automatically
 * when dispatched via `conversationRelay.executeTool(...)`.
 *
 * Built-in protocol tools: playMediaTool, sendDigitsTool, switchLanguageTool, endCallTool.
 */

// Protocol tools (send CR WebSocket messages)
export { playMediaTool } from './play-media';
export { sendDigitsTool } from './send-digits';
export { switchLanguageTool } from './switch-language';
export { endCallTool } from './end-call';

// Tool definition helpers (for user-authored CR tools)
export { CRTool, defineTool, JSONSchemaSchema } from './define-tool';
export type { JSONSchema, ToolFunction } from './define-tool';
