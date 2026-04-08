import { WebSocket } from 'ws';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import {
  ChannelType,
  ConversationId,
  ConversationSession,
  ProfileId,
  SetupMessage,
  PromptMessage,
  InterruptMessage,
  TextTokenMessage,
  CustomParameters,
  CustomParametersSchema,
  ConversationRelayConfig,
  ConversationRelayConfigSchema,
  ConversationRelayCallbackPayload,
  isConversationId,
  isProfileId,
  Channel,
  ChannelEvents,
} from '../types/index';
import type { TAC } from '../lib/tac';
import { TACConfig } from '../lib/config';
import { ConversationClient } from '../clients/conversation';
import { Logger } from '../lib/logger';
import { TACMemoryResponse } from '../lib/tac-memory-response';
import { ConversationRelay, type CallSid } from '@twilio/tac-conversationrelay';

/**
 * Voice channel event callbacks extending base callbacks
 */
export interface VoiceChannelEvents extends ChannelEvents {
  onSetup?: (data: {
    conversationId: ConversationId;
    profileId: ProfileId | undefined;
    callSid: string;
    from: string;
    to: string;
    customParameters: CustomParameters | undefined;
  }) => void;
  onPrompt?: (data: {
    conversationId: ConversationId;
    transcript: string;
    userMemory?: TACMemoryResponse;
    session?: ConversationSession;
  }) => void;
  onInterrupt?: (data: {
    conversationId: ConversationId;
    reason: string;
    transcript: string | undefined;
  }) => void;
  onWebSocketConnected?: (data: { conversationId: ConversationId }) => void;
  onWebSocketDisconnected?: (data: { conversationId: ConversationId }) => void;
}

/**
 * Voice Channel implementation for Twilio ConversationRelay
 *
 * Handles voice conversations through WebSocket connections.
 * Manages real-time audio streaming and conversation state.
 */
export class VoiceChannel implements Channel {
  protected readonly tac: TAC;
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient?: ConversationClient;
  protected readonly activeConversations: Map<ConversationId, ConversationSession>;
  protected readonly callbacks: ChannelEvents;
  private readonly conversationRelay: ConversationRelay;
  private readonly callSidToConversationId: Map<string, ConversationId>;
  private readonly voiceCallbacks: VoiceChannelEvents;
  private readonly promptQueues: Map<ConversationId, Promise<void>>;

  constructor(tac: TAC) {
    this.tac = tac;
    this.config = tac.getConfig();
    this.logger = tac.logger.child({ component: 'channel' });
    this.activeConversations = new Map();
    this.callbacks = {};
    this.voiceCallbacks = {};

    // Get ConversationClient from TAC (undefined in crelay mode)
    const client = tac.getConversationClient();
    if (client) {
      this.conversationClient = client;
      this.logger.info('Voice channel initialized with Maestro support');
    } else {
      this.logger.info('Voice channel initialized in CR-only mode');
    }

    // Initialize ConversationRelay utility
    this.conversationRelay = new ConversationRelay(tac.logger.child({ component: 'crelay' }));

    // Wire up ConversationRelay callbacks to VoiceChannel handlers
    this.conversationRelay.onSetup((callSid, data) => {
      this.handleSetupFromRelay(callSid, data);
    });

    this.conversationRelay.onPrompt((callSid, data) => {
      this.handlePromptFromRelay(callSid, data);
    });

    this.conversationRelay.onInterrupt((callSid, data) => {
      this.handleInterruptFromRelay(callSid, data);
    });

    this.conversationRelay.onClose(callSid => {
      this.handleCloseFromRelay(callSid);
    });

    this.conversationRelay.onError((callSid, error) => {
      this.handleError(error, { callSid: callSid as string });
    });

    this.callSidToConversationId = new Map();
    this.promptQueues = new Map();
  }

  public get channelType(): ChannelType {
    return 'voice';
  }

  /**
   * Get WebSocket connection for a conversation
   */
  public getWebsocket(conversationId: ConversationId): WebSocket | null {
    // Look up CallSid from conversationId
    for (const [callSid, convId] of this.callSidToConversationId.entries()) {
      if (convId === conversationId) {
        return this.conversationRelay.getWebSocket(callSid as CallSid);
      }
    }
    return null;
  }

  /**
   * Start a new conversation session
   */
  protected startConversation(
    conversationId: ConversationId,
    profileId?: ProfileId,
    serviceId?: string
  ): ConversationSession {
    if (this.activeConversations.has(conversationId)) {
      this.logger.debug(
        {
          conversation_id: conversationId,
          profile_id: this.activeConversations.get(conversationId)?.profileId,
          service_id: this.activeConversations.get(conversationId)?.serviceId,
        },
        'Conversation already active'
      );
      return this.activeConversations.get(conversationId)!;
    }

    const session: ConversationSession = {
      // Base SessionContext fields
      sessionId: conversationId, // Generic session identifier
      channel: this.channelType,
      startedAt: new Date(),
      metadata: {},
      // Maestro-specific fields
      profileId: profileId,
      serviceId: serviceId,
    };

    this.activeConversations.set(conversationId, session);

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
   * Triggers the onConversationEnded callback BEFORE removing the session,
   * so the callback receives the full ConversationSession data.
   * Errors in the callback do not prevent session cleanup.
   */
  protected async endConversation(conversationId: ConversationId): Promise<void> {
    const session = this.activeConversations.get(conversationId);

    if (session) {
      // Trigger callback BEFORE deleting the session
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

      this.activeConversations.delete(conversationId);
      this.logger.debug(
        {
          conversation_id: conversationId,
          channel: this.channelType,
          service_id: session.serviceId,
        },
        'Conversation ended'
      );
    } else {
      this.logger.debug(
        { conversation_id: conversationId, channel: this.channelType },
        'Conversation end requested but no active session found'
      );
    }
  }

  /**
   * Get an active conversation session
   */
  public getConversationSession(conversationId: ConversationId): ConversationSession | undefined {
    return this.activeConversations.get(conversationId);
  }

  /**
   * Check if a conversation is active
   */
  public isConversationActive(conversationId: ConversationId): boolean {
    return this.activeConversations.has(conversationId);
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

  /**
   * Cleanup resources when shutting down
   */
  public shutdown(): void {
    // Voice-specific cleanup
    this.conversationRelay.shutdown();
    this.callSidToConversationId.clear();
    this.promptQueues.clear();

    // Base cleanup
    this.activeConversations.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
  }

  /**
   * Register event callbacks (override for Voice-specific events)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic event callback needs to accept any args
  public on(event: string, callback: (...args: any[]) => void): void {
    switch (event) {
      case 'setup':
        this.voiceCallbacks.onSetup = callback;
        break;
      case 'prompt':
        this.voiceCallbacks.onPrompt = callback;
        break;
      case 'interrupt':
        this.voiceCallbacks.onInterrupt = callback;
        break;
      case 'webSocketConnected':
        this.voiceCallbacks.onWebSocketConnected = callback;
        break;
      case 'webSocketDisconnected':
        this.voiceCallbacks.onWebSocketDisconnected = callback;
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

  /**
   * Process webhook - Voice channel doesn't use traditional webhooks,
   * but this method is required by the base class
   */
  public processWebhook(_payload: unknown): Promise<void> {
    this.logger.warn('processWebhook called but Voice channel uses WebSocket connections');
    return Promise.resolve();
  }

  /**
   * Handle WebSocket connection from ConversationRelay
   *
   * Delegates to ConversationRelay utility for protocol handling.
   */
  public handleWebSocketConnection(ws: WebSocket): void {
    this.conversationRelay.handleConnection(ws);
  }

  /**
   * Handle setup message from ConversationRelay (CallSid → ConversationId bridge)
   */
  private handleSetupFromRelay(_callSid: CallSid, data: SetupMessage): void {
    this.handleSetupMessage(data);
    // Store the CallSid → ConversationId mapping is done in handleSetupMessage
  }

  /**
   * Handle prompt message from ConversationRelay (CallSid → ConversationId bridge)
   */
  private handlePromptFromRelay(callSid: CallSid, data: PromptMessage): void {
    const conversationId = this.callSidToConversationId.get(callSid as string);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, 'No conversation found for CallSid in prompt');
      return;
    }

    // Serialize prompt handling per conversation to prevent race conditions
    const previousPrompt = this.promptQueues.get(conversationId) ?? Promise.resolve();
    const currentPrompt = previousPrompt
      .then(() => this.handlePromptMessage(conversationId, data))
      .catch((err: unknown) => {
        this.logger.error(
          { err, conversation_id: conversationId },
          'Failed to handle prompt message'
        );
      });
    this.promptQueues.set(conversationId, currentPrompt);
  }

  /**
   * Handle interrupt message from ConversationRelay (CallSid → ConversationId bridge)
   */
  private handleInterruptFromRelay(callSid: CallSid, data: InterruptMessage): void {
    const conversationId = this.callSidToConversationId.get(callSid as string);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, 'No conversation found for CallSid in interrupt');
      return;
    }
    this.handleInterruptMessage(conversationId, data);
  }

  /**
   * Handle close from ConversationRelay (CallSid → ConversationId bridge)
   */
  private handleCloseFromRelay(callSid: CallSid): void {
    const conversationId = this.callSidToConversationId.get(callSid as string);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, 'No conversation found for CallSid in close');
      return;
    }

    void this.handleWebSocketDisconnect(conversationId).catch((err: unknown) => {
      this.logger.error(
        { err, conversation_id: conversationId },
        'WebSocket disconnect handler error'
      );
    });
  }

  /**
   * Handle WebSocket setup message
   */
  private handleSetupMessage(message: SetupMessage): ConversationId {
    const { callSid, from, to, customParameters } = message;

    // Extract conversation ID and profile ID from custom parameters
    let conversationId: ConversationId;
    let profileId: ProfileId | undefined;

    if (
      customParameters?.conversation_id &&
      typeof customParameters.conversation_id === 'string' &&
      isConversationId(customParameters.conversation_id)
    ) {
      conversationId = customParameters.conversation_id;
    } else {
      // Generate conversation ID from call SID if not provided
      conversationId = callSid as ConversationId;
    }

    if (
      customParameters?.profile_id &&
      typeof customParameters.profile_id === 'string' &&
      isProfileId(customParameters.profile_id)
    ) {
      profileId = customParameters.profile_id;
    }

    // Store CallSid mapping (WebSocket stored in ConversationRelay utility)
    this.callSidToConversationId.set(callSid, conversationId);

    // Start conversation session
    const session = this.startConversation(conversationId, profileId);

    // Populate authorInfo with caller's phone number for profile lookup
    session.authorInfo = {
      address: from,
    };

    // Invoke setup callback
    if (this.voiceCallbacks.onSetup) {
      this.voiceCallbacks.onSetup({
        conversationId,
        profileId: profileId ?? undefined,
        callSid,
        from,
        to,
        customParameters: customParameters ?? undefined,
      });
    }

    if (this.voiceCallbacks.onWebSocketConnected) {
      this.voiceCallbacks.onWebSocketConnected({ conversationId });
    }

    return conversationId;
  }

  /**
   * Handle WebSocket prompt message (user speech)
   */
  private async handlePromptMessage(
    conversationId: ConversationId,
    message: PromptMessage
  ): Promise<void> {
    const transcript = message.voicePrompt;

    // Get session for memory retrieval
    const session = this.getConversationSession(conversationId);

    // Automatic memory retrieval (matching passive voice behavior)
    let userMemory: TACMemoryResponse | undefined;
    if (session && this.tac.isMemoryEnabled()) {
      try {
        userMemory = await this.tac.retrieveMemory(session, transcript);
        this.logger.debug({ conversation_id: conversationId }, 'Retrieved memory for active voice');
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          'Failed to retrieve memory for active voice'
        );
      }
    }

    if (this.voiceCallbacks.onPrompt) {
      this.voiceCallbacks.onPrompt({
        conversationId,
        transcript,
        ...(userMemory !== undefined && { userMemory }),
        ...(session !== undefined && { session }),
      });
    }
  }

  /**
   * Handle WebSocket interrupt message
   */
  private handleInterruptMessage(conversationId: ConversationId, message: InterruptMessage): void {
    const { reason, transcript } = message;

    // Fire interrupt callback - application handles stream cancellation
    if (this.voiceCallbacks.onInterrupt) {
      this.voiceCallbacks.onInterrupt({
        conversationId,
        reason: reason ?? 'unknown',
        transcript: transcript ?? undefined,
      });
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private async handleWebSocketDisconnect(conversationId: ConversationId): Promise<void> {
    this.promptQueues.delete(conversationId);

    // Find and remove call SID mapping
    for (const [callSid, cId] of this.callSidToConversationId.entries()) {
      if (cId === conversationId) {
        this.callSidToConversationId.delete(callSid);
        break;
      }
    }

    if (this.voiceCallbacks.onWebSocketDisconnected) {
      this.voiceCallbacks.onWebSocketDisconnected({ conversationId });
    }

    // End conversation (async cleanup)
    await this.endConversation(conversationId);
  }

  /**
   * Send voice response via WebSocket
   *
   * Uses ConversationRelay utility for message sending.
   */
  public sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      // Find CallSid from ConversationId
      let callSid: string | undefined;
      for (const [cSid, cId] of this.callSidToConversationId.entries()) {
        if (cId === conversationId) {
          callSid = cSid;
          break;
        }
      }

      if (!callSid) {
        throw new Error(`No CallSid found for conversation ${conversationId}`);
      }

      const response: TextTokenMessage = {
        type: 'text',
        token: message,
        last: true,
      };

      // Delegate to ConversationRelay utility
      this.conversationRelay.sendMessage(callSid as CallSid, response);
      return Promise.resolve();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata,
      });
      throw error;
    }
  }

  // =========================================================================
  // Incoming Call Handling (with conversation creation)
  // =========================================================================

  /**
   * Handle incoming voice call - create conversation, add participants, generate TwiML
   *
   * @param options - Options for handling the incoming call
   * @returns TwiML XML string with ConversationRelay configuration
   */
  public async handleIncomingCall(options: {
    toNumber: string;
    fromNumber: string;
    callSid?: string;
    actionUrl?: string;
    conversationRelayConfig: ConversationRelayConfig;
  }): Promise<string> {
    const { toNumber, fromNumber, callSid, actionUrl, conversationRelayConfig } = options;

    // Get conversation client (may be undefined in CR-only mode)
    const conversationClient = this.tac.getConversationClient();

    if (conversationClient) {
      // ========== MAESTRO MODE ==========
      // Create conversation and participants via Maestro Conversations Service
      const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, '').slice(0, 15) + 'Z';
      const conversationName = `tac-voice-${fromNumber}-${timestamp}`;

      // Create conversation
      const conversation = await conversationClient.createConversation(conversationName);
      const conversationId = conversation.id;

      this.logger.debug(
        { conversation_id: conversationId, call_sid: callSid },
        'Created Maestro conversation for voice call'
      );

      // Add customer participant (caller)
      const customerParticipant = await conversationClient.addParticipant(
        conversationId,
        [{ channel: 'VOICE', address: fromNumber, channelId: callSid }],
        'CUSTOMER'
      );
      const profileId = customerParticipant.profileId || '';
      const customerParticipantId = customerParticipant.id;

      // Add AI agent participant (Twilio number)
      const aiAgentParticipant = await conversationClient.addParticipant(
        conversationId,
        [{ channel: 'VOICE', address: toNumber, channelId: callSid }],
        'AI_AGENT'
      );
      const aiAgentParticipantId = aiAgentParticipant.id;

      // Generate TwiML with Maestro conversation identifiers
      return this.connectConversationRelay(
        conversationRelayConfig,
        {
          conversation_id: conversationId,
          profile_id: profileId,
          customer_participant_id: customerParticipantId,
          ai_agent_participant_id: aiAgentParticipantId,
        },
        actionUrl ? { actionUrl } : undefined
      );
    } else {
      // ========== CR-ONLY MODE ==========
      // No Maestro - use CallSid as session identifier
      if (!callSid) {
        throw new Error('CallSid is required for ConversationRelay-only mode');
      }

      this.logger.debug(
        { call_sid: callSid },
        'Using ConversationRelay-only mode (no Maestro conversation)'
      );

      // Generate TwiML with CallSid as conversation identifier
      return this.connectConversationRelay(
        conversationRelayConfig,
        {
          conversation_id: callSid, // Use CallSid as session identifier
        },
        actionUrl ? { actionUrl } : undefined
      );
    }
  }

  // =========================================================================
  // ConversationRelay Callback Handling
  // =========================================================================

  /**
   * Handle ConversationRelay callback from Twilio
   *
   * @param payload - Callback payload from Twilio
   * @param handoffHandler - Optional handler for handoff requests
   * @returns Response with status, content, and content type
   */
  public async handleConversationRelayCallback(
    payload: ConversationRelayCallbackPayload,
    handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>
  ): Promise<{ status: number; content: string; contentType: string }> {
    this.logger.debug(
      { call_sid: payload.CallSid, call_status: payload.CallStatus },
      'ConversationRelay callback received'
    );

    // Check for handoff condition: call in-progress with handoff data
    if (payload.CallStatus === 'in-progress' && payload.HandoffData) {
      if (handoffHandler) {
        try {
          const response = await handoffHandler(payload);
          return { status: 200, content: response, contentType: 'application/xml' };
        } catch (error) {
          this.logger.error({ err: error }, 'Handoff handler failed');
          return { status: 500, content: 'Handoff handler error', contentType: 'text/plain' };
        }
      }
      return { status: 501, content: 'No handoff handler registered', contentType: 'text/plain' };
    }

    // On call completion, close associated conversations
    if (payload.CallStatus === 'completed') {
      await this.closeConversationsForCall(payload.CallSid);
    }

    return { status: 200, content: 'OK', contentType: 'text/plain' };
  }

  /**
   * Close all conversations associated with a call
   */
  private async closeConversationsForCall(callSid: string): Promise<void> {
    const conversationClient = this.tac.getConversationClient();
    if (!conversationClient) {
      this.logger.debug({ call_sid: callSid }, 'Skipping conversation cleanup (crelay mode)');
      return;
    }

    try {
      const conversations = await conversationClient.listConversations({ channelId: callSid });

      this.logger.info(
        { call_sid: callSid, count: conversations.length },
        'Closing conversations for completed call'
      );

      for (const conversation of conversations) {
        try {
          await conversationClient.updateConversation(conversation.id, 'CLOSED');
          this.logger.debug({ conversation_id: conversation.id }, 'Closed conversation');
        } catch (error) {
          this.logger.error(
            { err: error, conversation_id: conversation.id },
            'Failed to close conversation'
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error, call_sid: callSid }, 'Failed to list conversations for call');
    }
  }

  // =========================================================================
  // Stream Task Management
  // =========================================================================

  // =========================================================================
  // ConversationRelay TwiML Generation
  // =========================================================================

  /**
   * Generate TwiML to connect a call to ConversationRelay.
   * Validates configuration with Zod before generating TwiML.
   *
   * @param config - ConversationRelay configuration (url, transcription, TTS, etc.)
   * @param parameters - Optional custom parameters to pass via TwiML <Parameter> elements
   * @param options - Optional settings for the Connect verb (e.g., actionUrl)
   * @returns TwiML XML string
   * @throws {Error} if config validation fails
   */
  public connectConversationRelay(
    config: ConversationRelayConfig,
    parameters?: CustomParameters,
    options?: { actionUrl?: string }
  ): string {
    // Validate configuration with Zod schema (consistent with project pattern)
    const validationResult = ConversationRelayConfigSchema.safeParse(config);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new Error(`Invalid ConversationRelay configuration: ${errorMessage}`);
    }

    const validatedConfig = validationResult.data;

    // Extract languages array (child elements, not attributes)
    const { languages, ...conversationRelayAttributes } = validatedConfig;

    // Filter out undefined values to keep TwiML clean
    const filteredConfig = this.filterUnsetValues(conversationRelayAttributes);

    // Build TwiML using SDK
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);

    // Add language configurations as child <Language> elements
    if (languages && languages.length > 0) {
      for (const lang of languages) {
        // Filter out undefined values to satisfy exactOptionalPropertyTypes
        // Type assertion is safe here because we've already validated with Zod
        const filteredLang = this.filterUnsetValues(lang);
        relay.language(filteredLang as Parameters<typeof relay.language>[0]);
      }
    }

    // Validate and add custom parameters as child <Parameter> elements
    if (parameters) {
      const paramResult = CustomParametersSchema.safeParse(parameters);
      if (!paramResult.success) {
        throw new Error(`Invalid custom parameters: ${paramResult.error.message}`);
      }

      for (const [name, value] of Object.entries(paramResult.data)) {
        if (value !== undefined) {
          relay.parameter({ name, value });
        }
      }
    }

    return response.toString();
  }

  /**
   * Filter out undefined values from configuration object.
   * Keeps null, false, 0, and empty strings as they are valid values.
   */
  private filterUnsetValues(config: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  /**
   * Extract conversation ID - Not applicable for Voice channel
   */
  protected extractConversationId(_payload: unknown): ConversationId | null {
    // Voice channel doesn't use traditional webhooks
    return null;
  }

  /**
   * Extract profile ID - Not applicable for Voice channel
   */
  protected extractProfileId(_payload: unknown): ProfileId | null {
    // Voice channel doesn't use traditional webhooks
    return null;
  }
}
