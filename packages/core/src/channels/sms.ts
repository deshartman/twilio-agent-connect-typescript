import type { CRTool } from '@twilio/tac-conversationrelay';

import {
  Channel,
  ChannelEvents,
  ChannelMessage,
  ChannelType,
  ConversationId,
  ConversationSession,
  MemoryRetriever,
} from '../types/index';
import type { TACConfig } from '../lib/config';
import type { ConversationClient } from '../clients/conversation';
import type { Logger } from '../lib/logger';
import { TACMemoryResponse } from '../lib/tac-memory-response';
import {
  ConversationSessionStore,
  ConversationsWebhookProcessor,
  extractConversationId,
  extractProfileId,
  type MessagingWebhookPayload,
  type WebhookProcessorConfig,
} from './utility';

export interface SMSChannelConfig {
  /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
  dedupCapacity?: number | undefined;
}

/**
 * SMS Channel implementation for Twilio Conversations Service.
 *
 * Handles SMS conversations through Conversation Orchestrator webhooks.
 * Composes ConversationsWebhookProcessor + ConversationSessionStore from
 * `./utility.ts` instead of inheriting from a base class.
 */
export class SMSChannel implements Channel {
  public readonly channelType: ChannelType = 'sms';

  private readonly config: TACConfig;
  private readonly logger: Logger;
  private readonly conversationClient: ConversationClient;
  private readonly memoryRetriever: MemoryRetriever;
  private readonly callbacks: ChannelEvents = {};
  private readonly tools: Map<string, CRTool> = new Map();
  private readonly webhookProcessor: ConversationsWebhookProcessor;
  private readonly sessionStore: ConversationSessionStore;

  constructor(
    deps: {
      config: TACConfig;
      logger: Logger;
      conversationClient: ConversationClient;
      memoryRetriever: MemoryRetriever;
    },
    channelConfig?: SMSChannelConfig
  ) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: 'channel', channel: this.channelType });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;

    const processorConfig: WebhookProcessorConfig | undefined =
      channelConfig?.dedupCapacity !== undefined
        ? { dedupCapacity: channelConfig.dedupCapacity }
        : undefined;
    this.webhookProcessor = new ConversationsWebhookProcessor(
      { logger: this.logger },
      processorConfig
    );

    this.sessionStore = new ConversationSessionStore({
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
  }

  // ── Channel interface ────────────────────────────────────────────────────

  public getConversationSession(conversationId: ConversationId): ConversationSession | undefined {
    return this.sessionStore.get(conversationId);
  }

  public isConversationActive(conversationId: ConversationId): boolean {
    return this.sessionStore.isActive(conversationId);
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

  public shutdown(): void {
    this.sessionStore.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
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
   * Process an SMS webhook event from Twilio Conversation Orchestrator.
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

  /**
   * Send SMS response using Conversation Orchestrator Send API.
   */
  public async sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.logger.debug(
      {
        conversation_id: conversationId,
        message_length: message.length,
        operation: 'send_response',
      },
      'Sending SMS response'
    );

    try {
      const session = this.getConversationSession(conversationId);

      if (!session) {
        throw new Error(`No active session found for conversation ${conversationId}`);
      }

      if (!session.authorInfo) {
        throw new Error(
          `No author info found for conversation ${conversationId} - no inbound message received yet`
        );
      }

      const recipientAddress = session.authorInfo.address;

      const participants = await this.conversationClient.listParticipants(conversationId);

      const smsParticipants = participants.filter(
        p =>
          Array.isArray(p.addresses) &&
          p.addresses.some(
            addr => addr.channel === 'SMS' && addr.address === this.config.phoneNumber
          )
      );

      const agentParticipant =
        smsParticipants.find(
          p => p.type === 'AI_AGENT' || p.type === 'HUMAN_AGENT' || p.type === 'AGENT'
        ) ?? smsParticipants[0];

      if (!agentParticipant) {
        throw new Error(
          `Agent participant not found for conversation ${conversationId} with phone ${this.config.phoneNumber}`
        );
      }

      this.logger.debug(
        {
          conversation_id: conversationId,
          recipient_address: recipientAddress,
          recipient_participant_id: session.authorInfo.participantId,
          agent_participant_id: agentParticipant.id,
          from_number: this.config.phoneNumber,
        },
        'Sending SMS via Send API'
      );

      await this.conversationClient.sendCommunication(conversationId, {
        author: {
          address: this.config.phoneNumber,
          channel: 'SMS',
          participantId: agentParticipant.id,
        },
        recipients: [
          {
            address: recipientAddress,
            channel: 'SMS',
            participantId: session.authorInfo.participantId,
          },
        ],
        content: {
          type: 'TEXT',
          text: message,
        },
      });

      this.logger.info(
        { conversation_id: conversationId, recipient_address: recipientAddress },
        'SMS sent successfully via Send API'
      );
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, 'Send response error');
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata,
      });
      throw error;
    }
  }

  // ── Private helpers (webhook handlers) ───────────────────────────────────

  private isOwnMessage(authorAddress: string): boolean {
    return authorAddress === this.config.phoneNumber;
  }

  private handleError(error: Error, context?: Record<string, unknown>): void {
    this.logger.error({ err: error, ...context }, 'Channel error');
    if (this.callbacks.onError) {
      if (context) {
        this.callbacks.onError({ error, context });
      } else {
        this.callbacks.onError({ error });
      }
    }
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

    this.sessionStore.start(conversationId, profileId ?? undefined, payload.data?.serviceId);
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
        message_length: message?.length,
        operation: 'handle_communication_created',
      },
      'Handling communication.created'
    );

    if (!conversationId) {
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
          'Failed to retrieve user memory'
        );
      }
    }

    if (this.callbacks.onMessage) {
      const channelMessage: ChannelMessage = {
        conversationId,
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
      await this.sessionStore.end(conversationId);
    }
  }
}
