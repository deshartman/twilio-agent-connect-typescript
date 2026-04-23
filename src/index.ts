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
// The full CR surface (CRelayServer, SilenceDetector, tools) stays behind
// `@twilio/tac-conversationrelay` — we only re-export what VoiceChannel users
// are expected to touch from the aggregated `twilio-agent-connect` entry point.
export { ConversationRelay } from '@twilio/tac-conversationrelay';
