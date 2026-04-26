/**
 * ConversationRelay built-in tools — concrete, LLM-callable.
 *
 * Protocol tools return an `outgoingMessage` that CR's WebSocket ships
 * automatically via the outgoingMessage result-convention. State tools
 * return a convention field (`listenMode`) that CR applies as a
 * per-session side effect.
 *
 * Tool-authoring infrastructure (`defineTool`, `CRTool`, `JSONSchema`)
 * lives in `../lib/define-tool` — it's framework, not a tool.
 */

// Protocol tools (emit OutgoingMessage via the outgoingMessage convention)
export { playMediaTool } from './play-media';
export { sendDigitsTool } from './send-digits';
export { switchLanguageTool } from './switch-language';
export { endCallTool } from './end-call';

// State tools (mutate CR session state via result-convention)
export { setListenModeTool } from './set-listen-mode';
