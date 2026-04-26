/**
 * ConversationRelay Tools
 *
 * Built-in tools for ConversationRelay. Protocol tools return an
 * `outgoingMessage` that the ConversationRelay WebSocket ships automatically
 * when dispatched via `conversationRelay.executeTool(...)`. State tools
 * (e.g. set_listen_mode) return a result field that CR's executeTool
 * reads and applies as a side-effect on the session.
 *
 * Built-in tools: playMediaTool, sendDigitsTool, switchLanguageTool,
 * endCallTool, setListenModeTool.
 */

// Protocol tools (send CR WebSocket messages)
export { playMediaTool } from './play-media';
export { sendDigitsTool } from './send-digits';
export { switchLanguageTool } from './switch-language';
export { endCallTool } from './end-call';

// State tools (mutate CR session state via result-convention)
export { setListenModeTool } from './set-listen-mode';

// Tool definition helpers (for user-authored CR tools)
export { CRTool, defineTool, JSONSchemaSchema } from './define-tool';
export type { JSONSchema, ToolFunction } from './define-tool';
