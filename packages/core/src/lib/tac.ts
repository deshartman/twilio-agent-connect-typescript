import {
  TACConfigData,
  ConversationSession,
  SessionId,
  ProfileId,
  ProfileResponse,
  ChannelType,
  OperatorProcessingResult,
  ChannelMessage,
  MemoryRetriever,
  MemoryStoreId,
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
export type MessageReadyCallback = (message: ChannelMessage) => Promise<void> | void;

export type ErrorCallback = (params: {
  error: Error;
  context?: Record<string, unknown> | undefined;
}) => void;

export type HandoffCallback = (params: {
  /** Generic session identifier (CallSid or ConversationId) */
  sessionId: SessionId;
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
  private readonly config: TACConfig;
  public readonly logger: Logger;
  private readonly memoryClient?: MemoryClient;
  private readonly knowledgeClient?: KnowledgeClient;
  private readonly conversationClient?: ConversationClient;
  private readonly channels: Map<ChannelType, Channel>;
  private readonly cintelProcessor?: OperatorResultProcessor;

  // Callback registrations
  private messageReadyCallback?: MessageReadyCallback;
  private handoffCallback?: HandoffCallback;
  private conversationEndedCallback?: ConversationEndedCallback;
  private errorCallback?: ErrorCallback;

  constructor(options: TACOptions = {}) {
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

    // Log warning for misconfigured conversationServiceId in crelay mode
    if (this.config.tacMode === 'crelay' && this.config.conversationServiceId) {
      this.logger.warn(
        {
          tac_mode: this.config.tacMode,
          conversation_service_id: this.config.conversationServiceId,
        },
        'TAC_MODE=crelay but CONVERSATION_SERVICE_ID is configured. ' +
          'Maestro features will be ignored in crelay mode.'
      );
    }

    this.channels = new Map();

    // Initialize Memory client only if memoryStoreId is provided
    // API credentials are always available (required at TACConfig level)
    if (this.config.memoryStoreId) {
      this.memoryClient = new MemoryClient(this.config, this.logger.child({ component: 'memory' }));
      this.logger.info('Memory client initialized');

      // Initialize Knowledge client (uses same API credentials)
      this.knowledgeClient = new KnowledgeClient(
        this.config,
        this.logger.child({ component: 'knowledge' })
      );
      this.logger.info('Knowledge client initialized');
    } else {
      this.logger.info('Memory and Knowledge clients not initialized (credentials not provided)');
    }

    // Initialize Conversation Intelligence processor if configured
    if (this.memoryClient && this.config.cintelConfigurationId) {
      this.cintelProcessor = new OperatorResultProcessor(
        this.memoryClient,
        {
          configurationId: this.config.cintelConfigurationId,
          observationOperatorSid: this.config.cintelObservationOperatorSid,
          summaryOperatorSid: this.config.cintelSummaryOperatorSid,
        },
        this.logger.child({ component: 'cintel' })
      );
      this.logger.info('Conversation Intelligence processor initialized');
    }

    // Initialize ConversationClient for conversation and passive modes (both need Maestro)
    if (this.config.tacMode === 'conversation' || this.config.tacMode === 'passive') {
      this.conversationClient = new ConversationClient(
        this.config,
        this.logger.child({ component: 'conversation' })
      );
      this.logger.info({ mode: this.config.tacMode }, 'ConversationClient initialized');
    } else {
      this.logger.info('ConversationClient not initialized (crelay mode)');
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
        this.logger.error({ err, session_id: message.sessionId }, 'Message handler error');
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
              { err: error, session_id: session.sessionId },
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
        session_id: message.sessionId,
        message_type: message.messageType,
        channel: message.channel,
        metadata_type: message.metadata?.type,
      },
      'Forwarding message to callback'
    );

    try {
      await this.messageReadyCallback(message);
    } catch (error) {
      this.logger.error(
        { err: error, session_id: message.sessionId },
        'Message ready callback error'
      );
    }
  }

  /**
   * Register callback for when messages are ready to be processed
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
  public async triggerHandoff(sessionId: SessionId, reason: string): Promise<void> {
    if (!this.handoffCallback) {
      this.logger.warn({ session_id: sessionId }, 'No handoff callback registered');
      return;
    }

    const channel = this.getChannelBySessionId(sessionId);
    const session = channel?.getConversationSession(sessionId);

    if (!session) {
      throw new Error(`No session found for ${sessionId}`);
    }

    try {
      await this.handoffCallback({
        sessionId: session.sessionId,
        profileId: session.profileId,
        reason,
        session,
      });
    } catch (error) {
      this.logger.error({ err: error, session_id: sessionId }, 'Handoff callback error');
    }
  }

  /**
   * Get channel by session ID (CallSid or ConversationId)
   */
  private getChannelBySessionId(sessionId: SessionId): Channel | undefined {
    for (const channel of this.channels.values()) {
      if (channel.isConversationActive(sessionId)) {
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
   * Returns undefined if memory credentials are not configured
   */
  public getMemoryClient(): MemoryClient | undefined {
    return this.memoryClient;
  }

  /**
   * Get knowledge client for knowledge base operations
   * Returns undefined if memory credentials are not configured
   */
  public getKnowledgeClient(): KnowledgeClient | undefined {
    return this.knowledgeClient;
  }

  /**
   * Get conversation client for advanced conversation operations
   * Returns undefined in crelay mode
   */
  public getConversationClient(): ConversationClient | undefined {
    return this.conversationClient;
  }

  /**
   * Create a MemoryRetriever function for channel dependency injection.
   * Returns undefined if memory is not configured.
   */
  public createMemoryRetriever(): MemoryRetriever | undefined {
    if (!this.isMemoryEnabled()) {
      return undefined;
    }
    return (session: ConversationSession, query?: string) => this.retrieveMemory(session, query);
  }

  /**
   * Get channel dependencies for creating Maestro channels (VoiceChannel, MessagingChannel subclasses).
   * Throws if ConversationClient is not available (crelay mode).
   */
  public getChannelDeps(): {
    config: TACConfig;
    logger: Logger;
    conversationClient: ConversationClient;
    memoryRetriever: MemoryRetriever | undefined;
  } {
    const conversationClient = this.getConversationClient();
    if (!conversationClient) {
      throw new Error(
        'getChannelDeps() requires ConversationClient (TAC_MODE=conversation or passive). ' +
          'Use CRelayChannel with logger for TAC_MODE=crelay.'
      );
    }
    return {
      config: this.config,
      logger: this.logger,
      conversationClient,
      memoryRetriever: this.createMemoryRetriever(),
    };
  }

  /**
   * Check if Twilio Memory functionality is enabled
   *
   * @returns true if memory client is initialized, false otherwise
   */
  public isMemoryEnabled(): boolean {
    return this.memoryClient !== undefined;
  }

  /**
   * Check if Knowledge functionality is enabled
   *
   * @returns true if knowledge client is initialized, false otherwise
   */
  public isKnowledgeEnabled(): boolean {
    return this.knowledgeClient !== undefined;
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
          'Ensure both memory credentials and cintelConfigurationId are provided.'
      );
    }
    return this.cintelProcessor.processEvent(payload);
  }

  /**
   * Retrieve memories from Memory API or fallback to Conversations API
   *
   * @param session - Conversation session context
   * @param query - Optional semantic search query
   * @returns Promise containing TACMemoryResponse wrapper providing unified access to memory data.
   *
   * When Memory is configured:
   * - observations, summaries, and communications available
   * - communications include author name and type
   *
   * When using Maestro fallback:
   * - observations and summaries are empty arrays
   * - communications have basic fields only (no author name/type)
   */
  public async retrieveMemory(
    session: ConversationSession,
    query?: string
  ): Promise<TACMemoryResponse> {
    // If Memory API is configured
    if (this.memoryClient && this.config.memoryStoreId) {
      // If profileId is missing, try to lookup profile using address
      if (!session.profileId) {
        // Check if authorInfo and address are available
        if (!session.authorInfo || !session.authorInfo.address) {
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

        try {
          // Lookup profile using appropriate identity type
          const lookupResponse = await this.memoryClient.lookupProfile(
            this.config.memoryStoreId as MemoryStoreId,
            identityType,
            session.authorInfo.address
          );

          // Check if any profiles were found
          if (!lookupResponse.profiles || lookupResponse.profiles.length === 0) {
            throw new Error(
              `No profile found for ${identityType} ${session.authorInfo.address}. ` +
                'Profile lookup returned no results. Ensure the identity ' +
                'is registered in the identity resolution system.'
            );
          }

          // Use the first profile ID
          session.profileId = lookupResponse.profiles[0] as ProfileId;
        } catch (error) {
          this.logger.error(
            { err: error },
            `Failed to lookup profile for ${session.authorInfo.address}`
          );
          throw error;
        }
      }

      try {
        // At this point, profileId is guaranteed to be defined (either provided or looked up)
        const memoryResponse = await this.memoryClient.retrieveMemories(
          this.config.memoryStoreId as MemoryStoreId,
          session.profileId,
          { query }
        );
        return new TACMemoryResponse(memoryResponse);
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to retrieve memory');
        throw error;
      }
    } else {
      // Fallback to Conversations API
      if (!this.conversationClient) {
        throw new Error(
          'Cannot retrieve memory: Memory API not configured and ConversationClient not available. ' +
            'Ensure either MEMORY_STORE_ID is configured or TAC_MODE=conversation with CONVERSATION_SERVICE_ID.'
        );
      }

      this.logger.info('Twilio Memory not configured, falling back to Conversations API');

      try {
        const communications = await this.conversationClient.listCommunications(session.sessionId);

        // Return TACMemoryResponse wrapper with only communications populated
        return new TACMemoryResponse(communications);
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to retrieve communications');
        throw error;
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
    // Check if memory client is initialized
    if (!this.memoryClient || !this.config.memoryStoreId) {
      this.logger.warn(
        'Memory client is not initialized. Cannot fetch profile. ' +
          'Provide memory credentials when creating TAC to enable profile fetching.'
      );
      return undefined;
    }

    // Validate profile_id
    if (!profileId) {
      this.logger.warn('profile_id is required for profile fetching but was not provided');
      return undefined;
    }

    try {
      // Get trait_groups from config if provided
      const traitGroups = this.config.traitGroups;

      // Fetch profile
      const profileResponse = await this.memoryClient.getProfile(
        this.config.memoryStoreId as MemoryStoreId,
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
