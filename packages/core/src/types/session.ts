/**
 * Session Types
 *
 * Generic session abstractions that work with any identifier (CallSid, ConversationId, etc.)
 */

import type { ChannelType } from './index';

/**
 * Base session context - works with any session identifier
 *
 * This minimal interface supports both CR-only mode (CallSid) and
 * Maestro mode (ConversationId) without forcing conversation concepts.
 */
export interface SessionContext {
  /**
   * Session identifier - generic string that can be CallSid, ConversationId, or any identifier
   */
  sessionId: string;

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
