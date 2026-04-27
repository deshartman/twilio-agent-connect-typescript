import {
  TACConfigData,
  ConversationSession,
  ConversationId,
  ProfileId,
  ProfileResponse,
  ChannelType,
  OperatorProcessingResult,
  ChannelMessage,
  MemoryRetriever,
  MemoryStoreId,
  isProfileId,
  isMemoryStoreId,
} from '../types/index';
import { TACMemoryResponse } from './tac-memory-response';
import { TACConfig } from './config';
import { MemoryClient } from '../clients/memory';
import { ConversationClient } from '../clients/conversation';
import { KnowledgeClient } from '../clients/knowledge';
import { Channel } from '../types/channels';
import { Logger, createLogger } from './logger';
import { OperatorResultProcessor } from './operator-result-processor';

export interface TACOptions {
  config?: TACConfig | TACConfigData;
  logger?: Logger;
}

/**
 * Callback function signatures for TAC events
 */
export type MessageReadyCallback = (
  message: ChannelMessage
) => Promise<string | null | void> | string | null | void;

export type ErrorCallback = (params: {
  error: Error;
  context?: Record<string, unknown> | undefined;
}) => void;

export type HandoffCallback = (params: {
  /** Conversation identifier */
  conversationId: ConversationId;
  profileId: ProfileId | undefined;
  reason: string;
  session: ConversationSession;
}) => Promise<void> | void;

export type ConversationEndedCallback = (params: {
  session: ConversationSession;
}) => Promise<void> | void;

/**
 * Main Twilio Agent Connect class
 *
 * Central orchestrator that manages configuration, channels, callbacks,
 * and coordinates between memory, conversations, and LLM integrations.
 */
export class TAC {
  private static readonly FACTORY_TOKEN = Symbol('TAC.create');

  private readonly config: TACConfig;
  public readonly logger: Logger;
  private memoryClient!: MemoryClient;
  private knowledgeClient!: KnowledgeClient;
  private readonly conversationClient: ConversationClient;
  private readonly channels: Map<ChannelType, Channel>;
  private cintelProcessor?: OperatorResultProcessor;
  private memoryStoreId!: MemoryStoreId;
  /**
   * Cached from `conversationConfig.conversationsV1Bridge?.serviceId` at init.
   * ChatChannel forwards this as `channelSettings.chatService` on outbound
   * SEND_MESSAGE actions.
   *
   * Until the server-side fix ships, CHAT sends fail with
   *   "chatService attribute is required for CHAT channel"
   * unless we pass it on channelSettings.chatService.
   *
   * TODO(conv-orch): Drop this field plus ActionChannelSettings.chatService
   * and ChatChannel's chatServiceSid plumbing once the Actions API resolves
   * the V1 Chat service SID server-side.
   */
  public conversationsV1ServiceSid?: string;

  // Callback registrations
  private messageReadyCallback?: MessageReadyCallback;
  private handoffCallback?: HandoffCallback;
  private conversationEndedCallback?: ConversationEndedCallback;
  private errorCallback?: ErrorCallback;

  private constructor(token: symbol, options: TACOptions = {}) {
    if (token !== TAC.FACTORY_TOKEN) {
      throw new Error('TAC constructor is private. Use TAC.create() instead of new TAC().');
    }
    // Handle config resolution:
    // - If it's already a TACConfig instance, use it
    // - If it's data, create a new TACConfig
    // - If not provided, load from environment variables
    const finalConfig = options.config
      ? options.config instanceof TACConfig
        ? options.config
        : new TACConfig(options.config)
      : TACConfig.fromEnv();
    const finalLogger = options.logger ?? createLogger({ name: 'tac' });

    this.config = finalConfig;
    this.logger = finalLogger;
    this.channels = new Map();
    this.conversationClient = new ConversationClient(
      this.config,
      this.logger.child({ component: 'conversation' })
    );
    this.logger.info('ConversationClient initialized');
  }

  public static async create(options: TACOptions = {}): Promise<TAC> {
    const tac = new TAC(TAC.FACTORY_TOKEN, options);

    try {
      const conversationConfig = await tac.conversationClient.getConfiguration(
        tac.config.conversationConfigurationId
      );

      const fetchedMemoryStoreId = conversationConfig.memoryStoreId;
      if (!isMemoryStoreId(fetchedMemoryStoreId)) {
        throw new Error(
          `Invalid memoryStoreId from conversation configuration: ${fetchedMemoryStoreId}. ` +
            'Expected format: mem_store_[0-7][0-9a-z]{25}.'
        );
      }
      tac.memoryStoreId = fetchedMemoryStoreId;
      // TODO(conv-orch): Drop once the Actions API resolves V1 Chat service SID
      // server-side. ChatChannel forwards this as channelSettings.chatService.
      const v1ServiceId = conversationConfig.conversationsV1Bridge?.serviceId;
      if (v1ServiceId !== undefined) {
        tac.conversationsV1ServiceSid = v1ServiceId;
      }
      tac.memoryClient = new MemoryClient(tac.config, tac.logger.child({ component: 'memory' }));

      tac.knowledgeClient = new KnowledgeClient(
        tac.config,
        tac.logger.child({ component: 'knowledge' })
      );

      if (tac.config.cintelConfigurationId) {
        tac.cintelProcessor = new OperatorResultProcessor(
          tac.memoryClient,
          {
            configurationId: tac.config.cintelConfigurationId,
            observationOperatorSid: tac.config.cintelObservationOperatorSid,
            summaryOperatorSid: tac.config.cintelSummaryOperatorSid,
          },
          tac.logger.child({ component: 'cintel' })
        );
      }

      return tac;
    } catch (error) {
      tac.logger.error({ err: error }, 'TAC initialization failed');
      throw error;
    }
  }

  /**
   * Register a channel with the framework
   */
  public registerChannel(channel: Channel): void {
    this.logger.info({ channel: channel.channelType }, 'Registering channel');

    // Remove existing channel of same type
    const existingChannel = this.channels.get(channel.channelType);
    if (existingChannel) {
      this.logger.info({ channel: channel.channelType }, 'Replacing existing channel registration');
      existingChannel.shutdown();
    }

    this.channels.set(channel.channelType, channel);

    // Set up channel event listeners
    this.setupChannelEventListeners(channel);

    this.logger.info({ channel: channel.channelType }, 'Channel registration complete');
  }

  /**
   * Set up event listeners for a channel.
   *
   * All channels emit three unified events:
   * - 'message': ChannelMessage (user or system messages)
   * - 'conversationEnded': { session: ConversationSession }
   * - 'error': { error: Error; context?: Record<string, unknown> }
   */
  private setupChannelEventListeners(channel: Channel): void {
    // Handle unified message events from all channels
    channel.on('message', (message: ChannelMessage) => {
      void this.handleMessage(message).catch((err: unknown) => {
        this.logger.error(
          { err, conversation_id: message.conversationId },
          'Message handler error'
        );
      });
    });

    // Handle conversation ended events
    channel.on(
      'conversationEnded',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Intentionally async event handler
      async ({ session }: { session: ConversationSession }) => {
        if (this.conversationEndedCallback) {
          try {
            await this.conversationEndedCallback({ session });
          } catch (error) {
            this.logger.error(
              { err: error, conversation_id: session.conversationId },
              'Conversation ended callback error'
            );
          }
        }
      }
    );

    // Handle channel errors — log and forward to error callback
    channel.on(
      'error',
      ({ error, context }: { error: Error; context?: Record<string, unknown> }) => {
        this.logger.error({ err: error, ...context }, 'Channel error');
        this.errorCallback?.({ error, context });
      }
    );
  }

  /**
   * Handle unified message from channels — pure pass-through to developer callback
   */
  private async handleMessage(message: ChannelMessage): Promise<void> {
    if (!this.messageReadyCallback) {
      this.logger.warn('No message ready callback registered');
      return;
    }

    this.logger.debug(
      {
        conversation_id: message.conversationId,
        message_type: message.messageType,
        channel: message.channel,
        metadata_type: message.metadata?.type,
      },
      'Forwarding message to callback'
    );

    try {
      const response = await this.messageReadyCallback(message);

      // Auto-send if callback returned a non-empty string.
      // - null/void/undefined → manual handling (existing contract)
      // - empty string → warn and skip (almost certainly not intended)
      // - non-empty string → route back through the originating channel
      if (typeof response === 'string') {
        if (response === '') {
          this.logger.warn(
            { conversation_id: message.conversationId, channel: message.channel },
            'Callback returned empty string, skipping auto-send'
          );
        } else {
          const channel = this.channels.get(message.channel);
          if (!channel) {
            this.logger.error(
              { conversation_id: message.conversationId, channel: message.channel },
              'No channel registered for auto-send'
            );
          } else {
            try {
              await channel.sendResponse(message.conversationId, response);
            } catch (sendError) {
              this.logger.error(
                { err: sendError, conversation_id: message.conversationId },
                'Failed to auto-send callback response'
              );
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        { err: error, conversation_id: message.conversationId },
        'Message ready callback error'
      );
    }
  }

  /**
   * Register callback for when messages are ready to be processed.
   * Return a string to auto-send, or null/void for manual handling.
   */
  public onMessageReady(callback: MessageReadyCallback): void {
    this.messageReadyCallback = callback;
  }

  /**
   * Register callback for channel errors
   */
  public onError(callback: ErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Register callback for human handoff
   */
  public onHandoff(callback: HandoffCallback): void {
    this.handoffCallback = callback;
  }

  /**
   * Register callback for when a conversation ends.
   *
   * The callback is triggered by channels when a conversation is closed
   * (e.g., SMS conversation status changed to CLOSED, or voice WebSocket
   * disconnected). The callback receives the full ConversationSession before
   * it is cleaned up.
   */
  public onConversationEnded(callback: ConversationEndedCallback): void {
    this.conversationEndedCallback = callback;
  }

  /**
   * Trigger handoff callback
   */
  public async triggerHandoff(conversationId: ConversationId, reason: string): Promise<void> {
    if (!this.handoffCallback) {
      this.logger.warn({ conversation_id: conversationId }, 'No handoff callback registered');
      return;
    }

    const channel = this.getChannelByConversationId(conversationId);
    const session = channel?.getConversationSession(conversationId);

    if (!session) {
      throw new Error(`No session found for ${conversationId}`);
    }

    try {
      await this.handoffCallback({
        conversationId: session.conversationId,
        profileId: session.profileId,
        reason,
        session,
      });
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, 'Handoff callback error');
    }
  }

  /**
   * Get channel by conversation ID
   */
  private getChannelByConversationId(conversationId: ConversationId): Channel | undefined {
    for (const channel of this.channels.values()) {
      if (channel.isConversationActive(conversationId)) {
        return channel;
      }
    }
    return undefined;
  }

  /**
   * Get registered channel by type
   */
  public getChannel<T extends Channel>(channelType: ChannelType): T | undefined {
    return this.channels.get(channelType) as T | undefined;
  }

  /**
   * Get configuration
   */
  public getConfig(): TACConfig {
    return this.config;
  }

  /**
   * Get memory client for advanced memory operations
   */
  public getMemoryClient(): MemoryClient {
    return this.memoryClient;
  }

  /**
   * Get knowledge client for knowledge base operations
   */
  public getKnowledgeClient(): KnowledgeClient {
    return this.knowledgeClient;
  }

  /**
   * Get conversation client for advanced conversation operations
   */
  public getConversationClient(): ConversationClient {
    return this.conversationClient;
  }

  /**
   * Create a MemoryRetriever function for channel dependency injection.
   */
  public createMemoryRetriever(): MemoryRetriever {
    return (session: ConversationSession, query?: string) => this.retrieveMemory(session, query);
  }

  /**
   * Get channel dependencies for creating channels (VoiceChannel, ConversationRelayChannel,
   * SMSChannel, ChatChannel). Returns all dependencies needed to construct a channel.
   */
  public getChannelDeps(): {
    config: TACConfig;
    logger: Logger;
    conversationClient: ConversationClient;
    memoryRetriever: MemoryRetriever;
  } {
    return {
      config: this.config,
      logger: this.logger,
      conversationClient: this.conversationClient,
      memoryRetriever: this.createMemoryRetriever(),
    };
  }

  /**
   * Check if Conversation Intelligence processing is enabled
   *
   * @returns true if CI processor is initialized, false otherwise
   */
  public isCintelEnabled(): boolean {
    return this.cintelProcessor !== undefined;
  }

  /**
   * Process a Conversation Intelligence operator result webhook event
   *
   * @param payload - The raw webhook payload from CI
   * @returns Promise containing the processing result
   * @throws Error if CI processor is not initialized
   */
  public async processCintelEvent(payload: unknown): Promise<OperatorProcessingResult> {
    if (!this.cintelProcessor) {
      throw new Error(
        'Conversation Intelligence processor is not initialized. ' +
          'Ensure cintelConfigurationId is provided in TAC configuration.'
      );
    }
    return this.cintelProcessor.processEvent(payload);
  }

  /**
   * Retrieve memories from Memory API with automatic fallback to Conversations API
   *
   * @param session - Conversation session context
   * @param query - Optional semantic search query
   * @returns Promise containing TACMemoryResponse wrapper providing unified access to memory data.
   *
   * Attempts to retrieve from Memory API first:
   * - observations, summaries, and communications available
   * - communications include author name and type
   *
   * Falls back to Conversations API on error:
   * - observations and summaries are empty arrays
   * - communications have basic fields only (no author name/type)
   */
  public async retrieveMemory(
    session: ConversationSession,
    query?: string
  ): Promise<TACMemoryResponse> {
    try {
      // If profileId is missing, try to lookup profile using address
      if (!session.profileId) {
        // Check if authorInfo and address are available
        if (!session.authorInfo?.address) {
          throw new Error(
            'profileId is required for memory retrieval but was not found in ' +
              'conversation context. Additionally, authorInfo.address is not available ' +
              'for profile lookup. Ensure either profileId or authorInfo.address is ' +
              'provided when creating the ConversationSession.'
          );
        }

        // Determine identity type based on address format
        // Email addresses contain '@', phone numbers start with '+'
        const address = session.authorInfo.address;
        let identityType: 'email' | 'phone';
        if (address.includes('@')) {
          identityType = 'email';
        } else if (address.startsWith('+')) {
          identityType = 'phone';
        } else {
          throw new Error(
            `Unsupported authorInfo.address format '${address}'. ` +
              "Expected an email address containing '@' or a phone number starting with '+'."
          );
        }
        this.logger.debug(
          { identityType, address, channel: session.channel },
          'profileId not found, attempting to lookup profile'
        );

        const lookupResponse = await this.memoryClient.lookupProfile(
          this.memoryStoreId,
          identityType,
          session.authorInfo.address
        );

        if (!lookupResponse.profiles || lookupResponse.profiles.length === 0) {
          throw new Error(
            `No profile found for ${identityType} ${session.authorInfo.address}. ` +
              'Profile lookup returned no results. Ensure the identity ' +
              'is registered in the identity resolution system.'
          );
        }

        const profileIdCandidate = lookupResponse.profiles[0];
        if (!profileIdCandidate || !isProfileId(profileIdCandidate)) {
          throw new Error(
            `Invalid profile ID format from identity resolution API: ${profileIdCandidate}. ` +
              'Expected format: mem_profile_[0-7][0-9a-z]{25}. ' +
              'This indicates a configuration issue with the identity resolution service.'
          );
        }

        session.profileId = profileIdCandidate;
      }

      const memoryResponse = await this.memoryClient.retrieveMemories(
        this.memoryStoreId,
        session.profileId,
        { query }
      );
      return new TACMemoryResponse(memoryResponse);
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Failed to retrieve memory from Memory API, falling back to Conversations API'
      );

      try {
        const communications = await this.conversationClient.listCommunications(
          session.conversationId
        );

        return new TACMemoryResponse(communications);
      } catch (fallbackError) {
        this.logger.error({ err: fallbackError }, 'Failed to retrieve communications');
        throw fallbackError;
      }
    }
  }

  /**
   * Fetch profile information with traits
   *
   * @param profileId - Profile ID to fetch
   * @returns Promise containing profile response or undefined if not available
   */
  public async fetchProfile(profileId: ProfileId): Promise<ProfileResponse | undefined> {
    if (!profileId) {
      this.logger.warn('profile_id is required for profile fetching but was not provided');
      return undefined;
    }

    try {
      const traitGroups = this.config.traitGroups;
      const profileResponse = await this.memoryClient.getProfile(
        this.memoryStoreId,
        profileId,
        traitGroups
      );
      return profileResponse;
    } catch (error) {
      this.logger.error({ err: error }, `Failed to fetch profile for ${profileId}`);
      return undefined;
    }
  }

  /**
   * Shutdown TAC and cleanup resources
   */
  public shutdown(): void {
    for (const channel of this.channels.values()) {
      this.logger.debug({ channel: channel.channelType }, 'Shutting down channel');
      channel.shutdown();
    }

    this.channels.clear();
    this.logger.info('TAC shutdown complete');
  }
}
