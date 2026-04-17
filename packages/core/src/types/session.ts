/**
 * Session Types
 *
 * Generic session abstractions that work with any identifier (CallSid, ConversationId, etc.)
 */

import type { ChannelType } from './config';

/**
 * Base session context - works with any session identifier
 *
 * This minimal interface supports both standalone CR (CallSid) and
 * Maestro-backed channels (ConversationId) without forcing conversation concepts.
 */
export interface SessionContext {
  /**
   * Conversation identifier
   */
  conversationId: string;

  /**
   * Channel type for this session
   */
  channel: ChannelType;

  /**
   * When the session started
   */
  startedAt: Date;

  /**
   * Arbitrary metadata for this session
   */
  metadata: Record<string, unknown>;
}
