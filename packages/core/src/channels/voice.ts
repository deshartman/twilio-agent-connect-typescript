/**
 * VoiceChannel — CR + Maestro voice channel (TAC_MODE=conversation)
 *
 * Handles voice conversations using ConversationRelay WebSocket protocol
 * WITH full Maestro Conversations Service integration. Always has ConversationClient.
 * Uses CRelayVoice from the CR package for WebSocket protocol handling.
 *
 * All CR events are emitted as unified 'message' events with conversation bundle.
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
  type ChannelMessage,
  type MemoryRetriever,
  isConversationId,
  isProfileId,
  type Channel,
  type ChannelEvents,
} from '../types/index';
import { TACConfig } from '../lib/config';
import { ConversationClient } from '../clients/conversation';
import { Logger } from '../lib/logger';
import { TACMemoryResponse } from '../lib/tac-memory-response';

/**
 * Voice Channel — Conversation mode (CR + Maestro)
 *
 * Uses CRelayVoice for WebSocket protocol handling. Always has ConversationClient.
 * Creates Maestro conversations and participants in handleIncomingCall().
 * Emits all CR events as unified 'message' events with conversation bundle.
 */
export class VoiceChannel implements Channel {
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly activeConversations: Map<ConversationId, ConversationSession>;
  protected readonly callbacks: ChannelEvents;
  private readonly crelayVoice: CRelayVoice;
  private readonly callSidToConversationId: Map<string, ConversationId>;
  private readonly memoryRetriever?: MemoryRetriever | undefined;

  constructor(deps: {
    config: TACConfig;
    logger: Logger;
    conversationClient: ConversationClient;
    memoryRetriever?: MemoryRetriever | undefined;
  }) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: 'channel' });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;
    this.activeConversations = new Map();
    this.callbacks = {};
    this.callSidToConversationId = new Map();

    // Initialize CRelayVoice for WebSocket protocol handling
    this.crelayVoice = new CRelayVoice(deps.logger.child({ component: 'crelay' }));

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

    this.crelayVoice.onDtmf((callSid, data) => {
      const conversationId = this.callSidToConversationId.get(callSid as string);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: 'system',
          message: `User pressed ${data.digit}`,
          metadata: { type: 'dtmf', digit: data.digit },
        });
      }
    });

    this.crelayVoice.onInfo((callSid, data) => {
      const conversationId = this.callSidToConversationId.get(callSid as string);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: 'system',
          message: JSON.stringify(data.info ?? {}),
          metadata: { type: 'info', info: data.info },
        });
      }
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
      sessionId: conversationId,
      messageType: msg.messageType,
      message: msg.message,
      channel: 'voice',
      metadata: msg.metadata,
      conversation: session
        ? {
            profileId: session.profileId,
            memory: msg.memory,
            author: session.authorInfo?.address ?? 'user',
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
  // CRelayVoice → VoiceChannel Bridge
  // ===========================================================================

  private handleSetupFromRelay(_callSid: CallSid, data: SetupMessage): void {
    const conversationId = this.handleSetupMessage(data);

    // Emit setup as system message
    this.emitMessage(conversationId, {
      messageType: 'system',
      message: `Call details: from ${data.from}, to ${data.to}, callSid ${data.callSid}`,
      metadata: {
        type: 'setup',
        callSid: data.callSid,
        from: data.from,
        to: data.to,
        direction: data.direction,
      },
    });
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

    const parts: string[] = ['User interrupted'];
    if (data.durationUntilInterruptMs !== undefined) {
      parts.push(`after ${data.durationUntilInterruptMs}ms`);
    }
    if (data.utteranceUntilInterrupt) {
      parts.push(`Last heard: '${data.utteranceUntilInterrupt}'`);
    }

    this.emitMessage(conversationId, {
      messageType: 'system',
      message: parts.join('. '),
      metadata: {
        type: 'interrupt',
        utteranceUntilInterrupt: data.utteranceUntilInterrupt,
        durationUntilInterruptMs: data.durationUntilInterruptMs,
      },
    });
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
    const { callSid, from, customParameters } = message;

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

    this.callSidToConversationId.set(callSid, conversationId);
    const session = this.startConversation(conversationId, profileId);
    session.authorInfo = { address: from };

    return conversationId;
  }

  private async handlePromptMessage(
    conversationId: ConversationId,
    message: PromptMessage
  ): Promise<void> {
    const transcript = message.voicePrompt;
    const session = this.getConversationSession(conversationId);

    // Automatic memory retrieval via injected retriever
    let userMemory: TACMemoryResponse | undefined;
    if (session && this.memoryRetriever) {
      try {
        userMemory = await this.memoryRetriever(session, transcript);
        this.logger.debug({ conversation_id: conversationId }, 'Retrieved memory for voice prompt');
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          'Failed to retrieve memory for voice prompt'
        );
      }
    }

    this.emitMessage(conversationId, {
      messageType: 'user',
      message: transcript,
      metadata: { type: 'prompt', lang: message.lang, last: message.last },
      memory: userMemory,
    });
  }

  private async handleWebSocketDisconnect(conversationId: ConversationId): Promise<void> {
    for (const [callSid, cId] of this.callSidToConversationId.entries()) {
      if (cId === conversationId) {
        this.callSidToConversationId.delete(callSid);
        break;
      }
    }

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

  public async handleIncomingCall(options: {
    toNumber: string;
    fromNumber: string;
    callSid?: string;
    actionUrl?: string;
    conversationRelayConfig: ConversationRelayConfig;
  }): Promise<string> {
    const { toNumber, fromNumber, callSid, actionUrl, conversationRelayConfig } = options;

    const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, '').slice(0, 15) + 'Z';
    const conversationName = `tac-voice-${fromNumber}-${timestamp}`;

    const conversation = await this.conversationClient.createConversation(conversationName);
    const conversationId = conversation.id as ConversationId;

    this.logger.debug(
      { conversation_id: conversationId, call_sid: callSid },
      'Created Maestro conversation for voice call'
    );

    const customerParticipant = await this.conversationClient.addParticipant(
      conversationId,
      [{ channel: 'VOICE', address: fromNumber, channelId: callSid }],
      'CUSTOMER'
    );
    const profileId = customerParticipant.profileId || '';
    const customerParticipantId = customerParticipant.id;

    const aiAgentParticipant = await this.conversationClient.addParticipant(
      conversationId,
      [{ channel: 'VOICE', address: toNumber, channelId: callSid }],
      'AI_AGENT'
    );
    const aiAgentParticipantId = aiAgentParticipant.id;

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

  public async handleConversationRelayCallback(
    payload: ConversationRelayCallbackPayload,
    handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>
  ): Promise<{ status: number; content: string; contentType: string }> {
    this.logger.debug(
      { call_sid: payload.CallSid, call_status: payload.CallStatus },
      'ConversationRelay callback received'
    );

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
          await this.conversationClient.updateConversation(
            conversation.id as ConversationId,
            'CLOSED'
          );
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
}
