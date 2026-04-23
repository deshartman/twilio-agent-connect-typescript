/**
 * Shared composition helpers for channels.
 *
 * Channels compose these helpers instead of inheriting from a base class:
 *   - ConversationSessionStore — owns the per-channel active-conversation Map
 *   - ConversationsWebhookProcessor — dedup + event routing for Maestro webhooks
 *   - ensureAgentParticipant (pure function) — resolve or lazy-create the
 *     conversation's AI_AGENT participant with 409-race handling
 */

import {
  ConversationAddress,
  ConversationId,
  ConversationParticipant,
  ProfileId,
  ConversationSession,
  ChannelType,
  isConversationId,
  isProfileId,
} from '../types/index';
import type { ConversationClient } from '../clients/conversation';
import { Logger } from '../lib/logger';

/**
 * Messaging webhook event types from Twilio Conversations Service
 *
 * @remarks
 * **SCHEMA VERIFICATION NEEDED**: This webhook payload structure is inferred from
 * internal usage patterns and observation of actual webhook events. The official
 * Twilio Maestro Conversations documentation does not explicitly specify the complete
 * webhook event schema.
 */
export interface MessagingWebhookPayload {
  eventType: string;
  timestamp?: string;
  data?: {
    id?: string;
    conversationId?: string;
    accountId?: string;
    serviceId?: string;
    status?: string;
    participantType?: string;
    profileId?: string;
    channelId?: string;
    author?: {
      address?: string;
      channel?: string;
      participantId?: string;
    };
    content?: {
      type?: string;
      text?: string;
    };
    recipients?: Array<{
      address?: string;
      channel?: string;
      participantId?: string;
      deliveryStatus?: string;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// ConversationSessionStore
// ────────────────────────────────────────────────────────────────────────────

/**
 * Callbacks invoked by the session store on lifecycle transitions.
 * Channels wire their own onConversationStarted/Ended handlers here.
 */
export interface SessionStoreCallbacks {
  onConversationStarted?: (data: { session: ConversationSession }) => void;
  onConversationEnded?: (data: { session: ConversationSession }) => Promise<void> | void;
}

/**
 * Per-channel conversation session store.
 *
 * Owns the Map<ConversationId, ConversationSession> previously held on
 * MessagingChannel. Each channel instantiates its own store — sessions are
 * not shared across channels.
 */
export class ConversationSessionStore {
  private readonly sessions: Map<ConversationId, ConversationSession> = new Map();
  private readonly logger: Logger;
  private readonly channelType: ChannelType;
  private readonly callbacks: SessionStoreCallbacks;

  constructor(deps: {
    logger: Logger;
    channelType: ChannelType;
    callbacks: SessionStoreCallbacks;
  }) {
    this.logger = deps.logger;
    this.channelType = deps.channelType;
    this.callbacks = deps.callbacks;
  }

  /**
   * Start a new conversation session. No-op if the session already exists;
   * returns the existing session in that case.
   */
  public start(
    conversationId: ConversationId,
    profileId?: ProfileId,
    serviceId?: string
  ): ConversationSession {
    const existing = this.sessions.get(conversationId);
    if (existing) {
      this.logger.debug(
        {
          conversation_id: conversationId,
          profile_id: existing.profileId,
          service_id: existing.serviceId,
        },
        'Conversation already active'
      );
      return existing;
    }

    const session: ConversationSession = {
      conversationId,
      channel: this.channelType,
      startedAt: new Date(),
      metadata: {},
      profileId,
      serviceId,
    };

    this.sessions.set(conversationId, session);

    this.logger.debug(
      {
        conversation_id: conversationId,
        profile_id: profileId,
        service_id: serviceId,
        channel: this.channelType,
      },
      'Conversation started'
    );

    if (this.callbacks.onConversationStarted) {
      this.callbacks.onConversationStarted({ session });
    }

    return session;
  }

  /**
   * End a conversation session.
   *
   * Triggers onConversationEnded BEFORE removing the session so the callback
   * receives the full session. Errors in the callback do not prevent cleanup.
   */
  public async end(conversationId: ConversationId): Promise<void> {
    const session = this.sessions.get(conversationId);

    if (!session) {
      this.logger.debug(
        { conversation_id: conversationId, channel: this.channelType },
        'Conversation end requested but no active session found'
      );
      return;
    }

    if (this.callbacks.onConversationEnded) {
      try {
        await this.callbacks.onConversationEnded({ session });
      } catch (error) {
        this.logger.error(
          { err: error, conversation_id: conversationId },
          'Error in conversation ended callback'
        );
      }
    }

    this.sessions.delete(conversationId);
    this.logger.debug(
      {
        conversation_id: conversationId,
        channel: this.channelType,
        service_id: session.serviceId,
      },
      'Conversation ended'
    );
  }

  public get(conversationId: ConversationId): ConversationSession | undefined {
    return this.sessions.get(conversationId);
  }

  public isActive(conversationId: ConversationId): boolean {
    return this.sessions.has(conversationId);
  }

  /**
   * Clear all sessions (for shutdown).
   */
  public clear(): void {
    this.sessions.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ConversationsWebhookProcessor
// ────────────────────────────────────────────────────────────────────────────

/**
 * Handlers supplied by a channel to receive routed webhook events.
 *
 * The processor handles dedup, self-filtering, and payload validation; the
 * channel supplies handler callbacks for the event types it cares about.
 */
export interface ConversationsWebhookHandlers {
  /** Channel type used for self-filtering on author.channel */
  channelType: ChannelType;
  /** Optional: return true if the conversation is active on this channel (for CONVERSATION_UPDATED filtering) */
  isConversationActive?: (conversationId: ConversationId) => boolean;
  onConversationCreated?: (payload: MessagingWebhookPayload) => void;
  onParticipantAdded?: (payload: MessagingWebhookPayload) => void;
  onCommunicationCreated?: (payload: MessagingWebhookPayload) => Promise<void>;
  onConversationUpdated?: (payload: MessagingWebhookPayload) => Promise<void>;
  /** Called when processing fails — lets the channel emit onError */
  onError?: (error: Error, context: Record<string, unknown>) => void;
}

export interface WebhookProcessorConfig {
  /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
  dedupCapacity?: number | undefined;
}

const DEFAULT_DEDUP_CAPACITY = 10_000;

/**
 * Per-channel webhook processor.
 *
 * Owns the dedup set and event-routing logic previously on MessagingChannel.
 * Each channel instantiates its own processor — dedup state is not shared
 * across channels (matches today's per-instance behaviour).
 */
export class ConversationsWebhookProcessor {
  private readonly logger: Logger;
  private readonly processedTokens: Set<string> = new Set();
  private readonly maxTrackedTokens: number;

  constructor(deps: { logger: Logger }, config?: WebhookProcessorConfig) {
    this.logger = deps.logger;

    const capacity = config?.dedupCapacity ?? DEFAULT_DEDUP_CAPACITY;
    if (capacity < 1 || !Number.isInteger(capacity)) {
      throw new Error('dedupCapacity must be a positive integer');
    }
    this.maxTrackedTokens = capacity;
  }

  /**
   * Process a Maestro Conversations webhook payload, routing recognized event
   * types to the supplied handlers. Performs dedup, self-filtering, and
   * payload validation before dispatch.
   */
  public async process(
    payload: unknown,
    handlers: ConversationsWebhookHandlers,
    idempotencyToken?: string
  ): Promise<void> {
    this.logger.debug({ operation: 'webhook_processing', payload }, 'Processing webhook');

    try {
      if (idempotencyToken && this.isDuplicate(idempotencyToken)) {
        this.logger.debug({ idempotency_token: idempotencyToken }, 'Skipping duplicate webhook');
        return;
      }

      if (!this.validatePayload(payload)) {
        throw new Error('Invalid webhook payload');
      }

      const webhookData = payload as MessagingWebhookPayload;
      const eventType = webhookData.eventType;
      const conversationId = webhookData.data?.conversationId || webhookData.data?.id;

      if (!this.isEventForThisChannel(webhookData, handlers)) {
        this.logger.debug(
          { event_type: eventType, channel: handlers.channelType, conversation_id: conversationId },
          'Ignoring event for different channel type'
        );
        return;
      }

      this.logger.info(
        {
          event_type: eventType,
          raw_event_type: webhookData.eventType,
          conversation_id: conversationId,
        },
        'Processing webhook event'
      );

      switch (eventType) {
        case 'CONVERSATION_CREATED':
          this.logger.debug(
            { conversation_id: conversationId, profile_id: webhookData.data?.profileId },
            'Handling CONVERSATION_CREATED'
          );
          handlers.onConversationCreated?.(webhookData);
          break;

        case 'PARTICIPANT_ADDED':
          this.logger.debug(
            { conversation_id: conversationId, profile_id: webhookData.data?.profileId },
            'Handling PARTICIPANT_ADDED'
          );
          handlers.onParticipantAdded?.(webhookData);
          break;

        case 'COMMUNICATION_CREATED':
          this.logger.debug({ conversation_id: conversationId }, 'Handling COMMUNICATION_CREATED');
          if (handlers.onCommunicationCreated) {
            await handlers.onCommunicationCreated(webhookData);
          }
          break;

        case 'CONVERSATION_UPDATED':
          this.logger.debug(
            { conversation_id: conversationId, status: webhookData.data?.status },
            'Handling CONVERSATION_UPDATED'
          );
          if (handlers.onConversationUpdated) {
            await handlers.onConversationUpdated(webhookData);
          }
          break;

        default:
          this.logger.warn(
            {
              event_type: eventType,
              raw_event_type: webhookData.eventType,
              conversation_id: conversationId,
              payload,
            },
            'Unhandled event type - this event will be ignored'
          );
      }

      this.logger.debug({ event_type: eventType }, 'Webhook processing completed');
    } catch (error) {
      // Remove the token so retries are not blocked
      if (idempotencyToken) {
        this.processedTokens.delete(idempotencyToken);
      }
      this.logger.error(
        { err: error, operation: 'webhook_processing' },
        'Webhook processing error'
      );
      const err = error instanceof Error ? error : new Error(String(error));
      handlers.onError?.(err, { payload });
    }
  }

  /**
   * Check if a webhook has already been processed, and if not, record the token immediately.
   * Single synchronous check-and-record to prevent races where a duplicate arrives while
   * the first request is still awaiting async work. FIFO eviction at capacity.
   */
  private isDuplicate(idempotencyToken: string): boolean {
    if (this.processedTokens.has(idempotencyToken)) {
      return true;
    }

    if (this.processedTokens.size >= this.maxTrackedTokens) {
      const oldest = this.processedTokens.values().next().value!;
      this.processedTokens.delete(oldest);
    }

    this.processedTokens.add(idempotencyToken);
    return false;
  }

  private isEventForThisChannel(
    webhookData: MessagingWebhookPayload,
    handlers: ConversationsWebhookHandlers
  ): boolean {
    const eventType = webhookData.eventType;
    const authorChannel = webhookData.data?.author?.channel;

    // COMMUNICATION_CREATED: require author.channel for safe filtering
    if (eventType === 'COMMUNICATION_CREATED') {
      if (!authorChannel) {
        return false;
      }
      return authorChannel === handlers.channelType.toUpperCase();
    }

    // CONVERSATION_UPDATED: only process if this channel tracks the conversation
    if (eventType === 'CONVERSATION_UPDATED' && handlers.isConversationActive) {
      const conversationId = extractConversationId(webhookData, this.logger);
      if (conversationId && !handlers.isConversationActive(conversationId)) {
        return false;
      }
    }

    return true;
  }

  private validatePayload(payload: unknown): boolean {
    if (payload === null || payload === undefined) {
      return false;
    }

    const webhookData = payload as MessagingWebhookPayload;
    return (
      typeof webhookData === 'object' &&
      typeof webhookData.eventType === 'string' &&
      webhookData.eventType.length > 0
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Payload extraction helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract and validate conversationId from a Maestro webhook payload.
 * Logs observability info for invalid or missing IDs.
 */
export function extractConversationId(payload: unknown, logger: Logger): ConversationId | null {
  const webhookData = payload as MessagingWebhookPayload;
  const conversationId = webhookData.data?.conversationId || webhookData.data?.id;

  if (conversationId && isConversationId(conversationId)) {
    return conversationId;
  }

  if (conversationId) {
    logger.warn(
      {
        provided_id: conversationId,
        operation: 'extract_conversation_id',
        expected_pattern: '^conv_conversation_[0-9a-z]{26}$',
      },
      'Invalid conversation ID format in webhook payload'
    );
  } else {
    logger.debug(
      { operation: 'extract_conversation_id' },
      'Conversation ID missing in webhook payload'
    );
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// ensureAgentParticipant
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return the conversation's agent participant (AI_AGENT / HUMAN_AGENT / AGENT)
 * that owns `agentAddress`, creating one if absent.
 *
 * Behaviour:
 *   1. Match against `existingParticipants` — return the first AGENT-type
 *      participant with an address matching `agentAddress` on both channel and
 *      address.
 *   2. No match → create an AI_AGENT with `agentAddress`.
 *   3. Create failed (usually 409 from a concurrent worker) → re-list and
 *      re-match. Returns undefined if still not found, letting callers
 *      decide how to surface the failure.
 */
export async function ensureAgentParticipant(
  client: ConversationClient,
  logger: Logger,
  conversationId: ConversationId,
  existingParticipants: ConversationParticipant[],
  agentAddress: ConversationAddress
): Promise<ConversationParticipant | undefined> {
  const matches = (p: ConversationParticipant): boolean =>
    (p.type === 'AI_AGENT' || p.type === 'HUMAN_AGENT' || p.type === 'AGENT') &&
    Array.isArray(p.addresses) &&
    p.addresses.some(a => a.channel === agentAddress.channel && a.address === agentAddress.address);

  const existing = existingParticipants.find(matches);
  if (existing) {
    return existing;
  }

  logger.debug(
    {
      conversation_id: conversationId,
      channel: agentAddress.channel,
      address: agentAddress.address,
    },
    'No agent participant found, creating AI_AGENT'
  );

  try {
    const agent = await client.addParticipant(conversationId, [agentAddress], 'AI_AGENT');
    logger.debug(
      { conversation_id: conversationId, participant_id: agent.id },
      'Created AI_AGENT participant'
    );
    return agent;
  } catch (error) {
    // Most likely a 409 race (another worker just created the agent), but we
    // catch broadly here — log the original error so a real 5xx isn't hidden.
    logger.warn(
      { err: error, conversation_id: conversationId },
      'Failed to create AI_AGENT, retrying participant list'
    );
  }

  let retried: ConversationParticipant[];
  try {
    retried = await client.listParticipants(conversationId);
  } catch (error) {
    logger.error(
      { err: error, conversation_id: conversationId },
      'Failed to retry listing participants'
    );
    return undefined;
  }

  const agent = retried.find(matches);
  if (!agent) {
    logger.error(
      { conversation_id: conversationId },
      'Failed to create or find AI_AGENT participant'
    );
  }
  return agent;
}

/**
 * Extract and validate profileId from a Maestro webhook payload.
 * Logs observability info for invalid or missing IDs.
 */
export function extractProfileId(payload: unknown, logger: Logger): ProfileId | null {
  const webhookData = payload as MessagingWebhookPayload;
  const conversationId = webhookData.data?.conversationId;
  const profileId = webhookData.data?.profileId;

  if (profileId && isProfileId(profileId)) {
    return profileId;
  }

  if (profileId) {
    logger.warn(
      {
        provided_id: profileId,
        operation: 'extract_profile_id',
        expected_pattern: '^mem_profile_[0-9a-z]{26}$',
        conversation_id: conversationId,
      },
      'Invalid profile ID format in webhook payload'
    );
  } else {
    logger.debug(
      {
        operation: 'extract_profile_id',
        conversation_id: conversationId,
      },
      'Profile ID missing in webhook payload'
    );
  }

  return null;
}
