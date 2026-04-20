/**
 * VoiceChannel — CR + Maestro voice channel
 *
 * Handles voice conversations using ConversationRelay WebSocket protocol
 * WITH full Maestro Conversations Service integration. Always has ConversationClient.
 * Uses ConversationRelay from the CR package for WebSocket protocol handling.
 *
 * All CR events are emitted as unified 'message' events with conversation bundle.
 */

import { WebSocket } from 'ws';
import {
  ConversationRelay,
  type CallSid,
  type SetupMessage,
  type PromptMessage,
  type InterruptMessage,
  type ConversationRelayConfig,
  type ConversationRelayCallbackPayload,
  type CRTool,
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
 * Voice Channel — Maestro-backed voice (CR WebSocket + Maestro Conversations)
 *
 * Uses ConversationRelay for WebSocket protocol handling. Always has ConversationClient.
 * Creates Maestro conversations and participants in handleIncomingCall().
 * Emits all CR events as unified 'message' events with conversation bundle.
 */
export class VoiceChannel implements Channel {
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly activeConversations: Map<ConversationId, ConversationSession>;
  protected readonly callbacks: ChannelEvents;
  private readonly conversationRelay: ConversationRelay;
  private readonly callSidToConversationId: Map<CallSid, ConversationId>;
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

    // Initialize ConversationRelay for WebSocket protocol handling
    this.conversationRelay = new ConversationRelay(deps.logger.child({ component: 'crelay' }));

    // Wire up ConversationRelay callbacks
    this.conversationRelay.onSessionStarted((callSid, _session, data) => {
      this.handleSetupFromRelay(callSid, data);
    });

    this.conversationRelay.onPrompt((callSid, _message, data) => {
      this.handlePromptFromRelay(callSid, data);
    });

    this.conversationRelay.onInterrupt((callSid, data) => {
      this.handleInterruptFromRelay(callSid, data);
    });

    this.conversationRelay.onDtmf((callSid, data) => {
      const conversationId = this.callSidToConversationId.get(callSid);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: 'system',
          message: `User pressed ${data.digit}`,
          metadata: { type: 'dtmf', digit: data.digit },
        });
      }
    });

    this.conversationRelay.onInfo((callSid, data) => {
      const conversationId = this.callSidToConversationId.get(callSid);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: 'system',
          message: JSON.stringify(data.info ?? {}),
          metadata: { type: 'info', info: data.info },
        });
      }
    });

    this.conversationRelay.onSessionEnded(callSid => {
      this.handleCloseFromRelay(callSid);
    });

    this.conversationRelay.onError((callSid, error) => {
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
      conversationId: conversationId,
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
  // ConversationRelay → VoiceChannel Bridge
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
    const conversationId = this.callSidToConversationId.get(callSid);
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
    const conversationId = this.callSidToConversationId.get(callSid);
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
    const conversationId = this.callSidToConversationId.get(callSid);
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

    this.callSidToConversationId.set(callSid as CallSid, conversationId);
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
        return this.conversationRelay.getWebSocket(callSid);
      }
    }
    return null;
  }

  // Wrapping sync code in async to honor Channel interface's Promise<void> contract
  // eslint-disable-next-line @typescript-eslint/require-await
  public async sendResponse(
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

      const last = metadata?.last === undefined ? true : (metadata.last as boolean);
      this.conversationRelay.sendResponse(callSid as CallSid, message, last);
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
    this.conversationRelay.shutdown();
    this.callSidToConversationId.clear();
    this.activeConversations.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }

  public handleWebSocketConnection(ws: WebSocket): void {
    this.conversationRelay.handleConnection(ws);
  }

  // ===========================================================================
  // Tool Registry (delegated to embedded ConversationRelay)
  // ===========================================================================

  /**
   * List tools registered on this channel (for LLM discovery).
   * Includes CR built-in protocol tools (playMedia, sendDigits, switchLanguage, endCall)
   * plus any user-registered tools.
   */
  public listTools(): CRTool[] {
    return this.conversationRelay.listTools();
  }

  /**
   * Register a tool on this channel. Overwrites any tool with the same name.
   */
  public registerTool(tool: CRTool): void {
    this.conversationRelay.registerTool(tool);
  }

  /**
   * Execute a registered tool by name.
   *
   * If the tool returns an `outgoingMessage` (CR protocol tool), it is validated
   * and auto-shipped via the ConversationRelay WebSocket. The tool's result is
   * returned unchanged for the caller to feed back to the LLM loop.
   */
  public async executeTool(
    conversationId: ConversationId,
    name: string,
    args: unknown
  ): Promise<unknown> {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    return this.conversationRelay.executeTool(callSid, name, args);
  }

  /**
   * Send DTMF digits to the caller.
   * @throws if no active CallSid is mapped to the conversationId
   */
  public sendDigits(conversationId: ConversationId, digits: string): void {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    this.conversationRelay.sendDigits(callSid, digits);
  }

  /**
   * Play media from a URL to the caller.
   * @throws if no active CallSid is mapped to the conversationId
   */
  public sendPlay(
    conversationId: ConversationId,
    source: string,
    options?: { loop?: number; interruptible?: boolean; preemptible?: boolean }
  ): void {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    this.conversationRelay.sendPlay(callSid, source, options);
  }

  /**
   * End the call with optional handoff data.
   * @throws if no active CallSid is mapped to the conversationId
   */
  public endCall(conversationId: ConversationId, handoffData?: Record<string, unknown>): void {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    this.conversationRelay.endCall(callSid, handoffData);
  }

  private findCallSid(conversationId: ConversationId): CallSid | undefined {
    for (const [callSid, convId] of this.callSidToConversationId.entries()) {
      if (convId === conversationId) {
        return callSid;
      }
    }
    return undefined;
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  protected startConversation(
    conversationId: ConversationId,
    profileId?: ProfileId,
    serviceId?: string
  ): ConversationSession {
    if (this.activeConversations.has(conversationId)) {
      this.logger.debug({ conversation_id: conversationId }, 'Conversation already active');
      return this.activeConversations.get(conversationId)!;
    }

    const session: ConversationSession = {
      conversationId: conversationId,
      channel: this.channelType,
      startedAt: new Date(),
      metadata: {},
      profileId: profileId,
      serviceId: serviceId,
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

    // Validate the conversation ID format
    if (!isConversationId(conversation.id)) {
      throw new Error(
        `Invalid conversation ID returned from Conversation Service: ${conversation.id}. ` +
          'Expected format: conv_conversation_[0-9a-z]{26}. ' +
          'This indicates an issue with the Conversations API.'
      );
    }

    const conversationId = conversation.id;

    this.logger.debug(
      { conversation_id: conversationId, call_sid: callSid },
      'Created Maestro conversation for voice call'
    );

    const customerParticipant = await this.conversationClient.addOrFetchParticipant(
      conversationId,
      [{ channel: 'VOICE', address: fromNumber, channelId: callSid }],
      'CUSTOMER'
    );
    const profileId = customerParticipant.profileId || '';
    const customerParticipantId = customerParticipant.id;

    const aiAgentParticipant = await this.conversationClient.addOrFetchParticipant(
      conversationId,
      [{ channel: 'VOICE', address: toNumber, channelId: callSid }],
      'AI_AGENT'
    );
    const aiAgentParticipantId = aiAgentParticipant.id;

    return this.conversationRelay.generateTwiML(
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
        // Validate conversation ID format
        if (!isConversationId(conversation.id)) {
          this.logger.warn(
            { conversation_id: conversation.id, call_sid: callSid },
            'Invalid conversation ID format from Conversation Service. Skipping conversation close.'
          );
          continue; // Skip this conversation, continue with others
        }

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
      this.logger.error({ err: error, call_sid: callSid }, 'Failed to list conversations for call');
    }
  }
}
