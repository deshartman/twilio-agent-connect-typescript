/**
 * Session Types
 *
 * Session abstractions for Maestro-backed channels (voice / SMS / chat).
 * `ConversationId` is the canonical session key across all TAC channels —
 * this is the unified-identity model this branch's refactor standardises on.
 */

import type { ChannelType } from './config';

/**
 * Base session context for a TAC channel session.
 *
 * `conversationId` is always a Maestro ConversationId — the single session key
 * shared across voice, SMS and chat. If you need raw-CallSid sessions (standalone
 * ConversationRelay without Maestro), consume `@twilio/tac-conversationrelay`
 * directly — it ships its own `CallSid` branded type and does not use this interface.
 */
export interface SessionContext {
  /**
   * Maestro ConversationId — canonical session key for this context.
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
