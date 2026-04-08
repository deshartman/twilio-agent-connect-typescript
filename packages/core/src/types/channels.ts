/**
 * Channel interface definitions
 *
 * Minimal contract that TAC requires from all channel implementations.
 * Channels use composition instead of inheritance.
 */

import type { ConversationId, ConversationSession } from './conversation';
import type { ChannelType } from './config';

/**
 * Base channel event callbacks
 */
export interface ChannelEvents {
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
   * @param conversationId - Internal channel session identifier
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
   * @param event - Event name (e.g., 'prompt', 'interrupt', 'conversationEnded')
   * @param callback - Event handler function
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, callback: (...args: any[]) => void): void;

  /**
   * Get conversation session by internal identifier
   *
   * @param conversationId - Internal channel session identifier
   * @returns Session if active, undefined otherwise
   */
  getConversationSession(conversationId: ConversationId): ConversationSession | undefined;

  /**
   * Check if conversation is active
   *
   * @param conversationId - Internal channel session identifier
   * @returns True if conversation is active
   */
  isConversationActive(conversationId: ConversationId): boolean;

  /**
   * Shutdown channel and cleanup resources
   */
  shutdown(): void;
}
