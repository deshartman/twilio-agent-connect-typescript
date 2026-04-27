/**
 * VoiceChannel — passive Maestro voice channel.
 *
 * Consumes voice-channel Conversation Orchestrator (Maestro) webhooks and
 * emits unified `ChannelMessage`s like SMS/Chat. Use for BYO-CR flows,
 * inbound-analysis pipelines, or any voice path where this service
 * does not own the CR WebSocket.
 *
 * Outbound voice is **not supported** here — Maestro's Actions API rejects
 * `channel: 'VOICE'`. For active voice (agent speaks over a CR WS), use
 * `ConversationRelayChannel` in `./crelay.ts`.
 *
 * Zero dependency on `@twilio/tac-conversationrelay` — that boundary is
 * owned exclusively by `ConversationRelayChannel`.
 */

import {
  type ChannelType,
  type ConversationId,
  type ConversationSession,
  type ChannelMessage,
  type MemoryRetriever,
  type Channel,
  type ChannelEvents,
} from '../types/index';
import { TACConfig } from '../lib/config';
import { ConversationClient } from '../clients/conversation';
import { Logger } from '../lib/logger';
import { TACMemoryResponse } from '../lib/tac-memory-response';
import {
  ConversationSessionStore,
  ConversationsWebhookProcessor,
  extractConversationId,
  extractProfileId,
  type MessagingWebhookPayload,
  type WebhookProcessorConfig,
} from './utility';

export interface VoiceChannelConfig {
  /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
  dedupCapacity?: number | undefined;
}

export class VoiceChannel implements Channel {
  public readonly channelType: ChannelType = 'voice';
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly callbacks: ChannelEvents;
  private readonly memoryRetriever: MemoryRetriever;
  private readonly sessionStore: ConversationSessionStore;
  private readonly webhookProcessor: ConversationsWebhookProcessor;

  constructor(
    deps: {
      config: TACConfig;
      logger: Logger;
      conversationClient: ConversationClient;
      memoryRetriever: MemoryRetriever;
    },
    channelConfig?: VoiceChannelConfig
  ) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: 'channel' });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;
    this.callbacks = {};

    this.sessionStore = new ConversationSessionStore({
      logger: this.logger,
      channelType: 'voice',
      callbacks: {
        onConversationStarted: (data): void => {
          this.callbacks.onConversationStarted?.(data);
        },
        onConversationEnded: (data): Promise<void> | void =>
          this.callbacks.onConversationEnded?.(data),
      },
    });

    const processorConfig: WebhookProcessorConfig | undefined =
      channelConfig?.dedupCapacity !== undefined
        ? { dedupCapacity: channelConfig.dedupCapacity }
        : undefined;
    this.webhookProcessor = new ConversationsWebhookProcessor(
      { logger: this.logger },
      processorConfig
    );

    this.logger.info('VoiceChannel initialized (passive Maestro webhooks)');
  }

  // ===========================================================================
  // Unified Message Emission
  // ===========================================================================

  private emitMessage(
    conversationId: ConversationId,
    msg: {
      messageType: 'user' | 'system';
      message: string;
      metadata?: Record<string, unknown> | undefined;
      memory?: TACMemoryResponse | undefined;
    }
  ): void {
    const session = this.getConversationSession(conversationId);

    const channelMessage: ChannelMessage = {
      conversationId,
      messageType: msg.messageType,
      message: msg.message,
      channel: 'voice',
      metadata: msg.metadata,
      conversation: session
        ? {
            profileId: session.profileId,
            memory: msg.memory,
            author: session.authorInfo?.address ?? 'unknown',
            serviceId: session.serviceId,
            authorInfo: session.authorInfo ? { address: session.authorInfo.address } : undefined,
            startedAt: session.startedAt,
          }
        : undefined,
    };

    if (this.callbacks.onMessage) {
      void Promise.resolve(this.callbacks.onMessage(channelMessage)).catch((err: unknown) => {
        this.logger.error({ err, conversation_id: conversationId }, 'Error in message callback');
      });
    }
  }

  // ===========================================================================
  // Channel Interface
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/require-await
  public async sendResponse(
    _conversationId: ConversationId,
    _message: string,
    _metadata?: Record<string, unknown>
  ): Promise<void> {
    throw new Error(
      'VoiceChannel.sendResponse is not supported. Passive voice has no outbound path ' +
        '— Maestro Actions API rejects `channel: VOICE`. Use ConversationRelayChannel for ' +
        'active voice (CR WebSocket egress).'
    );
  }

  public async processWebhook(payload: unknown, idempotencyToken?: string): Promise<void> {
    await this.webhookProcessor.process(
      payload,
      {
        channelType: 'voice',
        isConversationActive: id => this.isConversationActive(id),
        onConversationCreated: p => this.handleVoiceConversationCreated(p),
        onParticipantAdded: p => this.handleVoiceParticipantAdded(p),
        onCommunicationCreated: p => this.handleVoiceCommunicationCreated(p),
        onConversationUpdated: p => this.handleVoiceConversationUpdated(p),
        onError: (err, ctx) => this.handleError(err, ctx),
      },
      idempotencyToken
    );
  }

  // ===========================================================================
  // Webhook Handlers
  // ===========================================================================

  private handleVoiceConversationCreated(payload: MessagingWebhookPayload): void {
    const conversationId = extractConversationId(payload, this.logger);
    const profileId = extractProfileId(payload, this.logger);

    if (!conversationId) {
      throw new Error('Missing conversation ID in conversation.created event');
    }

    this.sessionStore.start(conversationId, profileId ?? undefined, payload.data?.serviceId);
  }

  private handleVoiceParticipantAdded(payload: MessagingWebhookPayload): void {
    const conversationId = extractConversationId(payload, this.logger);
    const profileId = extractProfileId(payload, this.logger);

    if (!conversationId) {
      throw new Error('Missing conversation ID in participant.added event');
    }

    if (this.isConversationActive(conversationId)) {
      const session = this.getConversationSession(conversationId);
      if (session) {
        if (profileId) {
          session.profileId = profileId;
        }
        if (payload.data?.serviceId && session.serviceId !== payload.data.serviceId) {
          session.serviceId = payload.data.serviceId;
        }
      }
    } else {
      this.sessionStore.start(conversationId, profileId ?? undefined, payload.data?.serviceId);
    }
  }

  private async handleVoiceCommunicationCreated(payload: MessagingWebhookPayload): Promise<void> {
    const conversationId = extractConversationId(payload, this.logger);
    const profileId = extractProfileId(payload, this.logger);
    const message = payload.data?.content?.text?.trim();
    const author = payload.data?.author?.address || 'unknown';

    if (!conversationId) {
      throw new Error('Missing conversation ID in communication.created event');
    }

    if (!message) {
      this.logger.info({ conversation_id: conversationId }, 'Ignoring empty voice webhook message');
      return;
    }

    // Ignore messages authored by the bot itself (caller's phone number).
    if (author === this.config.phoneNumber) {
      this.logger.info(
        { conversation_id: conversationId, author_address: author },
        'Ignoring voice webhook message from AI agent'
      );
      return;
    }

    if (!this.isConversationActive(conversationId)) {
      this.sessionStore.start(conversationId, profileId ?? undefined, payload.data?.serviceId);
    } else if (payload.data?.serviceId) {
      const existing = this.getConversationSession(conversationId);
      if (existing && existing.serviceId !== payload.data.serviceId) {
        existing.serviceId = payload.data.serviceId;
      }
    }

    const session = this.getConversationSession(conversationId);
    if (session) {
      session.authorInfo = {
        address: author,
        participantId: payload.data?.author?.participantId,
      };
      if (payload.data?.channelId) {
        session.metadata ??= {};
        session.metadata.channelId = payload.data.channelId;
      }
    }

    let userMemory: TACMemoryResponse | undefined;
    if (session) {
      try {
        userMemory = await this.memoryRetriever(session, message);
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          'Failed to retrieve memory for passive voice webhook'
        );
      }
    }

    this.emitMessage(conversationId, {
      messageType: 'user',
      message,
      metadata: { type: 'communication_created' },
      memory: userMemory,
    });
  }

  private async handleVoiceConversationUpdated(payload: MessagingWebhookPayload): Promise<void> {
    const conversationId = extractConversationId(payload, this.logger);
    if (!conversationId) {
      throw new Error('Missing conversation ID in conversation.updated event');
    }
    if (payload.data?.status === 'CLOSED') {
      this.logger.info(
        { conversation_id: conversationId, status: payload.data.status },
        'Conversation closed, cleaning up'
      );
      await this.sessionStore.end(conversationId);
    }
  }

  // ===========================================================================
  // Channel plumbing
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic event callback needs to accept any args
  public on(event: string, callback: (...args: any[]) => void): void {
    switch (event) {
      case 'message':
        this.callbacks.onMessage = callback;
        break;
      case 'conversationStarted':
        this.callbacks.onConversationStarted = callback;
        break;
      case 'conversationEnded':
        this.callbacks.onConversationEnded = callback;
        break;
      case 'error':
        this.callbacks.onError = callback;
        break;
    }
  }

  public getConversationSession(conversationId: ConversationId): ConversationSession | undefined {
    return this.sessionStore.get(conversationId);
  }

  public isConversationActive(conversationId: ConversationId): boolean {
    return this.sessionStore.isActive(conversationId);
  }

  public shutdown(): void {
    this.sessionStore.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }

  protected handleError(error: Error, context?: Record<string, unknown>): void {
    this.logger.error({ err: error, ...context }, 'Channel error');
    if (this.callbacks.onError) {
      if (context) {
        this.callbacks.onError({ error, context });
      } else {
        this.callbacks.onError({ error });
      }
    }
  }
}
