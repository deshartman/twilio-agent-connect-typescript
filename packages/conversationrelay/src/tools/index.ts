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
export { playMediaTool } from './play-media.js';
export { sendDigitsTool } from './send-digits.js';
export { switchLanguageTool } from './switch-language.js';
export { endCallTool } from './end-call.js';

// State management tools (return flags for user logic)
export { setSilenceDetectionTool } from './set-silence-detection.js';
export { setListenModeTool } from './set-listen-mode.js';
