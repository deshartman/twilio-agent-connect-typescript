/**
 * ConversationRelay Tools
 *
 * Built-in tools for ConversationRelay protocol operations and state management.
 *
 * **Protocol Tools** - Return outgoingMessage for CR WebSocket:
 * - playMediaTool, sendDigitsTool, switchLanguageTool, endCallTool
 *
 * **State Management Tools** - Return flags for user control logic:
 * - setSilenceDetectionTool, setListenModeTool
 */

// Protocol tools (send CR WebSocket messages)
export { playMediaTool } from './play-media';
export { sendDigitsTool } from './send-digits';
export { switchLanguageTool } from './switch-language';
export { endCallTool } from './end-call';

// State management tools (return flags for user logic)
export { setSilenceDetectionTool } from './set-silence-detection';
export { setListenModeTool } from './set-listen-mode';

// Tool definition helpers (for user-authored CR tools)
export { CRTool, defineTool, JSONSchemaSchema } from './define-tool';
export type { JSONSchema, ToolFunction } from './define-tool';
