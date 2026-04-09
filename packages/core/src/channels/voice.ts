/**
 * VoiceChannel — CR + Maestro voice channel (TAC_MODE=conversation)
 *
 * Handles voice conversations using ConversationRelay WebSocket protocol
 * WITH full Maestro Conversations Service integration. Always has ConversationClient.
 * Uses CRelayVoice from the CR package for WebSocket protocol handling.
 */

import { WebSocket } from 'ws';
import {
  CRelayVoice,
  type CallSid,
  type SetupMessage,
  type PromptMessage,
  type InterruptMessage,
  type ConversationRelayConfig,
  type ConversationRelayCallbackPayload,
} from '@twilio/tac-conversationrelay';
import {
  type ChannelType,
  type ConversationId,
  type ConversationSession,
  type ProfileId,
  type TACCustomParameters,
  isConversationId,
  isProfileId,
  type Channel,
  type ChannelEvents,
} from '../types/index';
import type { TAC } from '../lib/tac';
import { TACConfig } from '../lib/config';
import { ConversationClient } from '../clients/conversation';
import { Logger } from '../lib/logger';
import { TACMemoryResponse } from '../lib/tac-memory-response';

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
    customParameters: TACCustomParameters | undefined;
  }) => void;
  onPrompt?: (data: {
    conversationId: ConversationId;
    transcript: string;
    userMemory?: TACMemoryResponse | undefined;
    session?: ConversationSession | undefined;
  }) => void;
  onInterrupt?: (data: {
    conversationId: ConversationId;
    utteranceUntilInterrupt: string | undefined;
    durationUntilInterruptMs: number | undefined;
  }) => void;
  onWebSocketConnected?: (data: { conversationId: ConversationId }) => void;
  onWebSocketDisconnected?: (data: { conversationId: ConversationId }) => void;
}

/**
 * Voice Channel — Conversation mode (CR + Maestro)
 *
 * Uses CRelayVoice for WebSocket protocol handling. Always has ConversationClient.
 * Creates Maestro conversations and participants in handleIncomingCall().
 */
export class VoiceChannel implements Channel {
  protected readonly tac: TAC;
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly activeConversations: Map<ConversationId, ConversationSession>;
  protected readonly callbacks: ChannelEvents;
  private readonly crelayVoice: CRelayVoice;
  private readonly callSidToConversationId: Map<string, ConversationId>;
  private readonly voiceCallbacks: VoiceChannelEvents;

  constructor(tac: TAC) {
    this.tac = tac;
    this.config = tac.getConfig();
    this.logger = tac.logger.child({ component: 'channel' });
    this.activeConversations = new Map();
    this.callbacks = {};
    this.voiceCallbacks = {};
    this.callSidToConversationId = new Map();

    // Conversation mode requires ConversationClient
    const client = tac.getConversationClient();
    if (!client) {
      throw new Error(
        'VoiceChannel requires ConversationClient (TAC_MODE=conversation). ' +
          'Use CRelayChannel for TAC_MODE=crelay.'
      );
    }
    this.conversationClient = client;

    // Initialize CRelayVoice for WebSocket protocol handling
    this.crelayVoice = new CRelayVoice(tac.logger.child({ component: 'crelay' }));

    // Wire up CRelayVoice callbacks
    this.crelayVoice.onSessionStarted((callSid, _session, data) => {
      this.handleSetupFromRelay(callSid, data);
    });

    this.crelayVoice.onMessage((callSid, _message, data) => {
      this.handlePromptFromRelay(callSid, data);
    });

    this.crelayVoice.onInterrupt((callSid, data) => {
      this.handleInterruptFromRelay(callSid, data);
    });

    this.crelayVoice.onSessionEnded(callSid => {
      this.handleCloseFromRelay(callSid);
    });

    this.crelayVoice.onError((callSid, error) => {
      this.handleError(error, { callSid: callSid as string });
    });

    this.logger.info('VoiceChannel initialized with Maestro support');
  }

  public get channelType(): ChannelType {
    return 'voice';
  }

  // ===========================================================================
  // CRelayVoice → VoiceChannel Bridge
  // ===========================================================================

  private handleSetupFromRelay(_callSid: CallSid, data: SetupMessage): void {
    this.handleSetupMessage(data);
  }

  private handlePromptFromRelay(callSid: CallSid, data: PromptMessage): void {
    const conversationId = this.callSidToConversationId.get(callSid as string);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, 'No conversation found for CallSid in prompt');
      return;
    }

    void this.handlePromptMessage(conversationId, data).catch((err: unknown) => {
      this.logger.error(
        { err, conversation_id: conversationId },
        'Failed to handle prompt message'
      );
    });
  }

  private handleInterruptFromRelay(callSid: CallSid, data: InterruptMessage): void {
    const conversationId = this.callSidToConversationId.get(callSid as string);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, 'No conversation found for CallSid in interrupt');
      return;
    }
    this.handleInterruptMessage(conversationId, data);
  }

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

  // ===========================================================================
  // Message Handlers
  // ===========================================================================

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
      conversationId = callSid as ConversationId;
    }

    if (
      customParameters?.profile_id &&
      typeof customParameters.profile_id === 'string' &&
      isProfileId(customParameters.profile_id)
    ) {
      profileId = customParameters.profile_id;
    }

    // Store CallSid → ConversationId mapping
    this.callSidToConversationId.set(callSid, conversationId);

    // Start conversation session
    const session = this.startConversation(conversationId, profileId);

    // Populate authorInfo with caller's phone number
    session.authorInfo = { address: from };

    // Invoke setup callback
    this.voiceCallbacks.onSetup?.({
      conversationId,
      profileId: profileId ?? undefined,
      callSid,
      from,
      to,
      customParameters: customParameters as TACCustomParameters | undefined,
    });

    this.voiceCallbacks.onWebSocketConnected?.({ conversationId });

    return conversationId;
  }

  private async handlePromptMessage(
    conversationId: ConversationId,
    message: PromptMessage
  ): Promise<void> {
    const transcript = message.voicePrompt;
    const session = this.getConversationSession(conversationId);

    // Automatic memory retrieval
    let userMemory: TACMemoryResponse | undefined;
    if (session && this.tac.isMemoryEnabled()) {
      try {
        userMemory = await this.tac.retrieveMemory(session, transcript);
        this.logger.debug({ conversation_id: conversationId }, 'Retrieved memory for voice prompt');
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          'Failed to retrieve memory for voice prompt'
        );
      }
    }

    this.voiceCallbacks.onPrompt?.({
      conversationId,
      transcript,
      ...(userMemory !== undefined && { userMemory }),
      ...(session !== undefined && { session }),
    });
  }

  private handleInterruptMessage(conversationId: ConversationId, message: InterruptMessage): void {
    this.voiceCallbacks.onInterrupt?.({
      conversationId,
      utteranceUntilInterrupt: message.utteranceUntilInterrupt,
      durationUntilInterruptMs: message.durationUntilInterruptMs,
    });
  }

  private async handleWebSocketDisconnect(conversationId: ConversationId): Promise<void> {
    // Find and remove call SID mapping
    for (const [callSid, cId] of this.callSidToConversationId.entries()) {
      if (cId === conversationId) {
        this.callSidToConversationId.delete(callSid);
        break;
      }
    }

    this.voiceCallbacks.onWebSocketDisconnected?.({ conversationId });
    await this.endConversation(conversationId);
  }

  // ===========================================================================
  // Channel Interface
  // ===========================================================================

  public getWebsocket(conversationId: ConversationId): WebSocket | null {
    for (const [callSid, convId] of this.callSidToConversationId.entries()) {
      if (convId === conversationId) {
        return this.crelayVoice.getWebSocket(callSid as CallSid);
      }
    }
    return null;
  }

  public sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
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

      this.crelayVoice.sendResponse(callSid as CallSid, message);
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

  public getConversationSession(conversationId: ConversationId): ConversationSession | undefined {
    return this.activeConversations.get(conversationId);
  }

  public isConversationActive(conversationId: ConversationId): boolean {
    return this.activeConversations.has(conversationId);
  }

  public shutdown(): void {
    this.crelayVoice.shutdown();
    this.callSidToConversationId.clear();
    this.activeConversations.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
  }

  public handleWebSocketConnection(ws: WebSocket): void {
    this.crelayVoice.handleConnection(ws);
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  protected startConversation(
    conversationId: ConversationId,
    profileId?: ProfileId
  ): ConversationSession {
    if (this.activeConversations.has(conversationId)) {
      this.logger.debug({ conversation_id: conversationId }, 'Conversation already active');
      return this.activeConversations.get(conversationId)!;
    }

    const session: ConversationSession = {
      sessionId: conversationId,
      channel: this.channelType,
      startedAt: new Date(),
      metadata: {},
      profileId: profileId,
    };

    this.activeConversations.set(conversationId, session);
    this.logger.debug(
      { conversation_id: conversationId, profile_id: profileId },
      'Conversation started'
    );

    this.callbacks.onConversationStarted?.({ session });
    return session;
  }

  protected async endConversation(conversationId: ConversationId): Promise<void> {
    const session = this.activeConversations.get(conversationId);
    if (session) {
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
      this.logger.debug({ conversation_id: conversationId }, 'Conversation ended');
    }
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

  // ===========================================================================
  // Incoming Call Handling — Maestro Only
  // ===========================================================================

  /**
   * Handle incoming voice call — create Maestro conversation, add participants, generate TwiML.
   */
  public async handleIncomingCall(options: {
    toNumber: string;
    fromNumber: string;
    callSid?: string;
    actionUrl?: string;
    conversationRelayConfig: ConversationRelayConfig;
  }): Promise<string> {
    const { toNumber, fromNumber, callSid, actionUrl, conversationRelayConfig } = options;

    // Create conversation and participants via Maestro Conversations Service
    const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, '').slice(0, 15) + 'Z';
    const conversationName = `tac-voice-${fromNumber}-${timestamp}`;

    const conversation = await this.conversationClient.createConversation(conversationName);
    const conversationId = conversation.id;

    this.logger.debug(
      { conversation_id: conversationId, call_sid: callSid },
      'Created Maestro conversation for voice call'
    );

    // Add customer participant (caller)
    const customerParticipant = await this.conversationClient.addParticipant(
      conversationId,
      [{ channel: 'VOICE', address: fromNumber, channelId: callSid }],
      'CUSTOMER'
    );
    const profileId = customerParticipant.profileId || '';
    const customerParticipantId = customerParticipant.id;

    // Add AI agent participant (Twilio number)
    const aiAgentParticipant = await this.conversationClient.addParticipant(
      conversationId,
      [{ channel: 'VOICE', address: toNumber, channelId: callSid }],
      'AI_AGENT'
    );
    const aiAgentParticipantId = aiAgentParticipant.id;

    // Generate TwiML with Maestro conversation identifiers
    return this.crelayVoice.generateTwiML(
      conversationRelayConfig,
      {
        conversation_id: conversationId,
        profile_id: profileId,
        customer_participant_id: customerParticipantId,
        ai_agent_participant_id: aiAgentParticipantId,
      },
      actionUrl ? { actionUrl } : undefined
    );
  }

  // ===========================================================================
  // ConversationRelay Callback Handling
  // ===========================================================================

  /**
   * Handle ConversationRelay callback from Twilio (action URL webhook)
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

    // On call completion, close associated Maestro conversations
    if (payload.CallStatus === 'completed') {
      await this.closeConversationsForCall(payload.CallSid);
    }

    return { status: 200, content: 'OK', contentType: 'text/plain' };
  }

  private async closeConversationsForCall(callSid: string): Promise<void> {
    try {
      const conversations = await this.conversationClient.listConversations({ channelId: callSid });

      this.logger.info(
        { call_sid: callSid, count: conversations.length },
        'Closing conversations for completed call'
      );

      for (const conversation of conversations) {
        try {
          await this.conversationClient.updateConversation(conversation.id, 'CLOSED');
          this.logger.debug({ conversation_id: conversation.id }, 'Closed conversation');
        } catch (error) {
          this.logger.error(
            { err: error, conversation_id: conversation.id },
            'Failed to close conversation'
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { err: error, call_sid: callSid },
        'Failed to list conversations for call'
      );
    }
  }
}
