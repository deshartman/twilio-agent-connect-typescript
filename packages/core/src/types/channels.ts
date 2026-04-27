/**
 * Channel interface definitions
 *
 * Minimal contract that TAC requires from all channel implementations.
 * Channels use composition instead of inheritance.
 */

import type { ConversationId, ConversationSession, ProfileId } from './conversation';
import type { ChannelType } from './config';
import type { TACMemoryResponse } from '../lib/tac-memory-response';
import type { JSONSchema, ToolFunction } from './tools';

/**
 * Package-agnostic tool contract for channels.
 *
 * Lives in core so the `Channel` interface does not depend on any
 * channel-specific package (e.g. `@twilio/tac-conversationrelay`).
 * `ConversationRelayTool` and `TACTool` both structurally satisfy this —
 * TypeScript duck-types them at the `Channel` boundary, and concrete
 * channels keep their richer internal tool types.
 */
export interface ChannelTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema;
  readonly implementation: ToolFunction;
  toOpenAIFormat(): Record<string, unknown>;
  toAnthropicFormat(): Record<string, unknown>;
}

/**
 * Unified message shape emitted by all channels via the 'message' event.
 *
 * - messageType 'user': generate a response (prompt, SMS text, voice webhook text)
 * - messageType 'system': add to LLM context but don't necessarily respond (setup, interrupt, dtmf)
 * - metadata.type identifies the source message type for programmatic handling
 * - conversation bundle is only present in Conversation/Passive modes (Maestro)
 */
export interface ChannelMessage {
  conversationId: ConversationId;
  messageType: 'user' | 'system';
  message: string;
  channel: ChannelType;
  metadata?: Record<string, unknown> | undefined;
  conversation?:
    | {
        profileId?: ProfileId | undefined;
        memory?: TACMemoryResponse | undefined;
        author: string;
        serviceId?: string | undefined;
        authorInfo?: { address: string } | undefined;
        startedAt: Date;
      }
    | undefined;
}

/**
 * Function that retrieves memory for a conversation session.
 * Injected into Maestro channels (VoiceChannel, SMSChannel, ChatChannel)
 * to decouple them from the TAC instance.
 */
export type MemoryRetriever = (
  session: ConversationSession,
  query?: string
) => Promise<TACMemoryResponse | undefined>;

/**
 * Base channel event callbacks
 */
export interface ChannelEvents {
  onMessage?: (message: ChannelMessage) => Promise<void> | void;
  onConversationStarted?: (data: { session: ConversationSession }) => void;
  onConversationEnded?: (data: { session: ConversationSession }) => Promise<void> | void;
  onError?: (data: { error: Error; context?: Record<string, unknown> }) => void;
}

/**
 * Base interface for all channel implementations
 *
 * Defines the minimal contract that TAC requires:
 * - Send responses to users
 * - Register event callbacks
 * - Provide session lookup
 * - Lifecycle management
 */
export interface Channel {
  /**
   * Channel type identifier
   */
  readonly channelType: ChannelType;

  /**
   * Send a response message to the user
   *
   * @param conversationId - Conversation identifier
   * @param message - The message text to send
   * @param metadata - Optional metadata to include
   */
  sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Register event callback for TAC integration
   *
   * @param event - Event name (e.g., 'message', 'conversationStarted', 'conversationEnded', 'error')
   * @param callback - Event handler function
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, callback: (...args: any[]) => void): void;

  /**
   * Get conversation session by identifier
   *
   * @param conversationId - Conversation identifier
   * @returns Session if active, undefined otherwise
   */
  getConversationSession(conversationId: ConversationId): ConversationSession | undefined;

  /**
   * Check if conversation is active
   *
   * @param conversationId - Conversation identifier
   * @returns True if conversation is active
   */
  isConversationActive(conversationId: ConversationId): boolean;

  /**
   * Shutdown channel and cleanup resources
   */
  shutdown(): void;

  /**
   * List all tools registered on this channel (for LLM discovery).
   * Optional — only channels with outbound capability (SMS, Chat,
   * ConversationRelayChannel) implement tool dispatch. Passive VoiceChannel
   * has no outbound path and omits this.
   */
  listTools?(): ChannelTool[];

  /**
   * Register an additional tool on this channel. Overwrites any tool with the same name.
   */
  registerTool?(tool: ChannelTool): void;

  /**
   * Execute a registered tool by name.
   *
   * ConversationRelayChannel auto-ships any `outgoingMessage` the tool produces
   * via the CR WebSocket. Other channels simply invoke the tool's implementation.
   *
   * @param conversationId - Conversation identifier to scope the execution
   * @param name - Registered tool name
   * @param args - Arguments forwarded to the tool's implementation
   * @returns The tool's result (to feed back to the LLM loop)
   */
  executeTool?(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;

  /**
   * Process a Maestro Conversations Service webhook payload.
   *
   * Optional because some channels (e.g. `ConversationRelayChannel`) don't
   * consume Maestro webhooks directly. The server fans out every incoming
   * webhook to all registered channels via
   * `channel.processWebhook?.(body, idempotencyToken)`; channels that don't
   * implement it simply ignore the event.
   *
   * @param payload - Raw webhook body from Twilio
   * @param idempotencyToken - Optional token from the `I-Twilio-Idempotency-Token` header
   */
  processWebhook?(payload: unknown, idempotencyToken?: string): Promise<void>;
}
