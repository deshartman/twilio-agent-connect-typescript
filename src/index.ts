/**
 * Twilio Agent Connect
 *
 * Single entry point that composes all sub-packages.
 * Consumers import everything from 'twilio-agent-connect'.
 */

// Core — all types, classes, and utilities
export * from '@twilio/tac-core';

// Tools — TACTool class, defineTool, and built-in tool creators
export * from '@twilio/tac-tools';

// Server — TACServer and its config
export * from '@twilio/tac-server';

// ConversationRelay — construct and pass to VoiceChannel for active-mode voice.
// ConversationRelayServer — the voice-routes server (/twiml, /ws, /conversation-relay-callback).
// Typical deployment runs TACServer for Maestro webhooks and ConversationRelayServer for
// voice on separate ports/processes; both are first-class entry points.
// The rest of the CR surface (SilenceHandler, tools, protocol types) stays
// behind `@twilio/tac-conversationrelay` for advanced users.
export { ConversationRelay, ConversationRelayServer } from '@twilio/tac-conversationrelay';
export type { ConversationRelayServerConfig } from '@twilio/tac-conversationrelay';
