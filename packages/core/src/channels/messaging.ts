import {
  ConversationId,
  ProfileId,
  ConversationSession,
  ChannelType,
  Channel,
  ChannelEvents,
  ChannelMessage,
  MemoryRetriever,
} from '../types/index';
import { TACConfig } from '../lib/config';
import { ConversationClient } from '../clients/conversation';
import { Logger } from '../lib/logger';
import { TACMemoryResponse } from '../lib/tac-memory-response';
import type { CRTool } from '@twilio/tac-conversationrelay';
import {
  ConversationsWebhookProcessor,
  ConversationSessionStore,
  extractConversationId,
  extractProfileId,
  type MessagingWebhookPayload,
  type WebhookProcessorConfig,
} from './utility';

// Re-export for backwards compatibility with subclass files importing from './messaging'
export type { MessagingWebhookPayload };

/**
 * Messaging channel configuration options
 */
export interface MessagingChannelConfig {
  /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
  dedupCapacity?: number | undefined;
}

/**
 * Abstract Messaging Channel base class for SMS and Chat channels
 *
 * Delegates webhook processing and session management to composition helpers
 * in `./utility.ts`. Subclasses implement channel-specific `sendResponse` and
 * `isOwnMessage` logic.
 *
 * @remarks
 * This base class will be deleted once SMS/Chat/VoiceWebhook are rewritten to
 * compose the helpers directly (Steps 3-6 of the channel refactor).
 */
export abstract class MessagingChannel implements Channel {
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly callbacks: ChannelEvents;
  private readonly memoryRetriever: MemoryRetriever;
  private readonly tools: Map<string, CRTool> = new Map();
  /**
   * Lazily constructed because it needs `this.channelType`, which is abstract
   * and not readable in the base-class constructor.
   */
  private _sessionStore?: ConversationSessionStore;
  private readonly webhookProcessor: ConversationsWebhookProcessor;

  constructor(
    deps: {
      config: TACConfig;
      logger: Logger;
      conversationClient: ConversationClient;
      memoryRetriever: MemoryRetriever;
    },
    channelConfig?: MessagingChannelConfig
  ) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: 'channel' });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;
    this.callbacks = {};

    const processorConfig: WebhookProcessorConfig | undefined =
      channelConfig?.dedupCapacity !== undefined
        ? { dedupCapacity: channelConfig.dedupCapacity }
        : undefined;
    this.webhookProcessor = new ConversationsWebhookProcessor(
      { logger: this.logger },
      processorConfig
    );
  }

  private get sessionStore(): ConversationSessionStore {
    this._sessionStore ??= new ConversationSessionStore({
      logger: this.logger,
      channelType: this.channelType,
      callbacks: {
        onConversationStarted: (data): void => {
          this.callbacks.onConversationStarted?.(data);
        },
        onConversationEnded: (data): Promise<void> | void =>
          this.callbacks.onConversationEnded?.(data),
      },
    });
    return this._sessionStore;
  }

  /**
   * Abstract method to check if a message is from the bot itself
   * Subclasses implement channel-specific filtering (e.g., by phone number or agent address)
   */
  protected abstract isOwnMessage(authorAddress: string): boolean;

  /**
   * Get the channel type (implemented by subclasses)
   */
  public abstract get channelType(): ChannelType;

  /**
   * Send a response back to the user (implemented by subclasses)
   */
  public abstract sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Start a new conversation session.
   *
   * Subclasses may call this directly (e.g. VoiceWebhookChannel overrides behavior).
   * Delegates to the composed ConversationSessionStore.
   */
  protected startConversation(
    conversationId: ConversationId,
    profileId?: ProfileId,
    serviceId?: string
  ): ConversationSession {
    return this.sessionStore.start(conversationId, profileId, serviceId);
  }

  /**
   * End a conversation session.
   * Delegates to the composed ConversationSessionStore.
   */
  protected async endConversation(conversationId: ConversationId): Promise<void> {
    await this.sessionStore.end(conversationId);
  }

  public getConversationSession(conversationId: ConversationId): ConversationSession | undefined {
    return this.sessionStore.get(conversationId);
  }

  public isConversationActive(conversationId: ConversationId): boolean {
    return this.sessionStore.isActive(conversationId);
  }

  /**
   * Handle errors with proper context
   */
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

  public shutdown(): void {
    this.sessionStore.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }

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

  public listTools(): CRTool[] {
    return Array.from(this.tools.values());
  }

  public registerTool(tool: CRTool): void {
    this.tools.set(tool.name, tool);
  }

  public executeTool(
    _conversationId: ConversationId,
    name: string,
    args: unknown
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return Promise.resolve(tool.implementation(args));
  }

  /**
   * Process messaging channel webhook from Twilio Conversations Service.
   * Delegates dedup + routing to the composed ConversationsWebhookProcessor.
   */
  public async processWebhook(payload: unknown, idempotencyToken?: string): Promise<void> {
    await this.webhookProcessor.process(
      payload,
      {
        channelType: this.channelType,
        isConversationActive: id => this.isConversationActive(id),
        onConversationCreated: p => this.handleConversationCreated(p),
        onParticipantAdded: p => this.handleParticipantAdded(p),
        onCommunicationCreated: p => this.handleCommunicationCreated(p),
        onConversationUpdated: p => this.handleConversationUpdated(p),
        onError: (err, ctx) => this.handleError(err, ctx),
      },
      idempotencyToken
    );
  }

  private handleConversationCreated(payload: MessagingWebhookPayload): void {
    const conversationId = extractConversationId(payload, this.logger);
    const profileId = extractProfileId(payload, this.logger);

    if (!conversationId) {
      this.logger.warn(
        { payload, operation: 'handle_conversation_created' },
        'Missing conversation ID in conversation.created event'
      );
      throw new Error('Missing conversation ID in conversation.created event');
    }

    this.startConversation(conversationId, profileId ?? undefined, payload.data?.serviceId);
  }

  private handleParticipantAdded(payload: MessagingWebhookPayload): void {
    const conversationId = extractConversationId(payload, this.logger);
    const profileId = extractProfileId(payload, this.logger);

    if (!conversationId) {
      this.logger.warn(
        { payload, operation: 'handle_participant_added' },
        'Missing conversation ID in participant.added event'
      );
      throw new Error('Missing conversation ID in participant.added event');
    }

    if (this.isConversationActive(conversationId)) {
      const session = this.getConversationSession(conversationId);
      if (session) {
        if (profileId) {
          this.logger.debug(
            {
              conversation_id: conversationId,
              old_profile_id: session.profileId,
              new_profile_id: profileId,
            },
            'Updating conversation profile ID from participant.added'
          );
          session.profileId = profileId;
        }

        if (payload.data?.serviceId && session.serviceId !== payload.data.serviceId) {
          this.logger.debug(
            {
              conversation_id: conversationId,
              old_service_id: session.serviceId,
              new_service_id: payload.data.serviceId,
            },
            'Updating conversation configuration ID from participant.added'
          );
          session.serviceId = payload.data.serviceId;
        }
      }
    } else {
      this.logger.debug(
        { conversation_id: conversationId, profile_id: profileId },
        'Auto-starting conversation from participant.added'
      );
      this.startConversation(conversationId, profileId ?? undefined, payload.data?.serviceId);
    }
  }

  private async handleCommunicationCreated(payload: MessagingWebhookPayload): Promise<void> {
    const conversationId = extractConversationId(payload, this.logger);
    const profileId = extractProfileId(payload, this.logger);
    const message = payload.data?.content?.text?.trim();
    const author = payload.data?.author?.address || 'unknown';

    this.logger.info(
      {
        conversation_id: conversationId,
        profile_id: profileId,
        author,
        message,
        message_length: message?.length,
        operation: 'handle_communication_created',
      },
      'Handling communication.created'
    );

    if (!conversationId) {
      this.logger.warn(
        { payload, operation: 'handle_communication_created' },
        'Missing conversation ID in communication.created event'
      );
      throw new Error('Missing conversation ID in communication.created event');
    }

    if (!message) {
      this.logger.info({ conversation_id: conversationId }, 'Ignoring empty message');
      return;
    }

    if (this.isOwnMessage(author)) {
      this.logger.info(
        { conversation_id: conversationId, author_address: author },
        'Ignoring message from AI agent'
      );
      return;
    }

    if (!this.isConversationActive(conversationId)) {
      this.logger.debug({ conversation_id: conversationId }, 'Starting new conversation');
      this.startConversation(conversationId, profileId ?? undefined, payload.data?.serviceId);
    } else if (payload.data?.serviceId) {
      const session = this.getConversationSession(conversationId);
      if (session && session.serviceId !== payload.data.serviceId) {
        this.logger.debug(
          {
            conversation_id: conversationId,
            old_service_id: session.serviceId,
            new_service_id: payload.data.serviceId,
          },
          'Updating conversation configuration ID from communication.created'
        );
        session.serviceId = payload.data.serviceId;
      }
    }

    const session = this.getConversationSession(conversationId);
    if (session) {
      session.authorInfo = {
        address: author,
        participantId: payload.data?.author?.participantId,
      };

      if (payload.data?.channelId) {
        if (!session.metadata) {
          session.metadata = {};
        }
        session.metadata.channelId = payload.data.channelId;
        this.logger.debug(
          { conversation_id: conversationId, channel_id: payload.data.channelId },
          'Stored channelId in session metadata'
        );
      }
    }

    let userMemory: TACMemoryResponse | undefined;
    if (session) {
      this.logger.debug({ conversation_id: conversationId, author }, 'Retrieving user memory');
      try {
        userMemory = await this.memoryRetriever(session, message);
        this.logger.debug(
          { conversation_id: conversationId, profile_id: session.profileId },
          'User memory retrieved'
        );
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          'Failed to retrieve user memory'
        );
      }
    }

    if (this.callbacks.onMessage) {
      this.logger.debug({ conversation_id: conversationId }, 'Emitting message event');
      const channelMessage: ChannelMessage = {
        conversationId: conversationId,
        messageType: 'user',
        message,
        channel: this.channelType,
        metadata: { type: 'communication_created' },
        conversation: session
          ? {
              profileId: session.profileId ?? profileId ?? undefined,
              memory: userMemory,
              author,
              serviceId: session.serviceId,
              authorInfo: session.authorInfo ? { address: session.authorInfo.address } : undefined,
              startedAt: session.startedAt,
            }
          : undefined,
      };

      void Promise.resolve(this.callbacks.onMessage(channelMessage)).catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.handleError(error, { conversationId, event: 'message' });
      });
    }
  }

  private async handleConversationUpdated(payload: MessagingWebhookPayload): Promise<void> {
    const conversationId = extractConversationId(payload, this.logger);

    if (!conversationId) {
      throw new Error('Missing conversation ID in conversation.updated event');
    }

    if (payload.data?.status === 'CLOSED') {
      this.logger.info(
        { conversation_id: conversationId, status: payload.data.status },
        'Conversation closed, cleaning up'
      );
      await this.endConversation(conversationId);
    }
  }
}
