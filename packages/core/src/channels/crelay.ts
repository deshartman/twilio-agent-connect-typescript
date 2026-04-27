/**
 * ConversationRelayChannel — CR + Maestro active-voice channel.
 *
 * Bridges the `@twilio/tac-conversationrelay` WebSocket protocol to Maestro
 * Conversations: CR events (setup/prompt/interrupt/dtmf/info/close/error)
 * are translated into TAC `ChannelMessage`s and emitted via `onMessage`.
 * Outbound text/dtmf/play/endCall go through the ConversationRelaySession
 * handle.
 *
 * This is the **only** file in tac-core that imports CR payload types
 * (SetupMessage / PromptMessage / InterruptMessage). Passive voice via
 * Maestro webhooks lives in `./voice.ts` and has zero CR dependency.
 */

import type {
  ConversationRelay,
  ConversationRelaySession,
  ConversationRelayTool,
  ConversationRelayCallbackPayload,
  SetupMessage,
  PromptMessage,
  InterruptMessage,
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
import { ConversationSessionStore } from './utility';

export interface ConversationRelayChannelConfig {
  /** Active ConversationRelay instance. Required — this channel is the CR bridge. */
  conversationRelay: ConversationRelay;
}

export class ConversationRelayChannel implements Channel {
  public readonly channelType: ChannelType = 'crelay';
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly callbacks: ChannelEvents;
  private readonly conversationRelay: ConversationRelay;

  /** Primary per-call handle. Keyed by `ConversationId` → O(1) public lookups. */
  private readonly bindings: Map<ConversationId, ConversationRelaySession>;
  /** Reverse index for teardown. WeakMap → auto-cleanup when session GC'd. */
  private readonly reverseIndex: WeakMap<ConversationRelaySession, ConversationId>;

  private readonly memoryRetriever: MemoryRetriever;
  private readonly sessionStore: ConversationSessionStore;

  constructor(
    deps: {
      config: TACConfig;
      logger: Logger;
      conversationClient: ConversationClient;
      memoryRetriever: MemoryRetriever;
    },
    channelConfig: ConversationRelayChannelConfig
  ) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: 'channel' });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;
    this.callbacks = {};
    this.bindings = new Map();
    this.reverseIndex = new WeakMap();
    this.conversationRelay = channelConfig.conversationRelay;

    this.sessionStore = new ConversationSessionStore({
      logger: this.logger,
      channelType: 'crelay',
      callbacks: {
        onConversationStarted: (data): void => {
          this.callbacks.onConversationStarted?.(data);
        },
        onConversationEnded: (data): Promise<void> | void =>
          this.callbacks.onConversationEnded?.(data),
      },
    });

    this.wireCRCallbacks();
    this.logger.info('ConversationRelayChannel initialized');
  }

  // ===========================================================================
  // CR Callback Wiring — the one place in core that names CR payload types
  // ===========================================================================

  private wireCRCallbacks(): void {
    this.conversationRelay.onSessionStarted((session, data) => {
      this.handleSetupFromRelay(session, data);
    });

    this.conversationRelay.onPrompt((session, _message, data) => {
      this.handlePromptFromRelay(session, data);
    });

    this.conversationRelay.onInterrupt((session, data) => {
      this.handleInterruptFromRelay(session, data);
    });

    this.conversationRelay.onDtmf((session, data) => {
      const conversationId = this.reverseIndex.get(session);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: 'system',
          message: `User pressed ${data.digit}`,
          metadata: { type: 'dtmf', digit: data.digit },
        });
      }
    });

    this.conversationRelay.onInfo((session, data) => {
      const conversationId = this.reverseIndex.get(session);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: 'system',
          message: JSON.stringify(data.info ?? {}),
          metadata: { type: 'info', info: data.info },
        });
      }
    });

    this.conversationRelay.onSessionEnded(session => {
      this.handleCloseFromRelay(session);
    });

    this.conversationRelay.onError((session, error) => {
      this.handleError(error, { callSid: session.callSid as string });
    });
  }

  private handleSetupFromRelay(session: ConversationRelaySession, data: SetupMessage): void {
    const conversationId = this.handleSetupMessage(data);
    this.bindings.set(conversationId, session);
    this.reverseIndex.set(session, conversationId);

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

  private handlePromptFromRelay(session: ConversationRelaySession, data: PromptMessage): void {
    const conversationId = this.reverseIndex.get(session);
    if (!conversationId) {
      this.logger.warn({ call_sid: session.callSid }, 'No conversation bound to session in prompt');
      return;
    }
    void this.handlePromptMessage(conversationId, data).catch((err: unknown) => {
      this.logger.error(
        { err, conversation_id: conversationId },
        'Failed to handle prompt message'
      );
    });
  }

  private handleInterruptFromRelay(
    session: ConversationRelaySession,
    data: InterruptMessage
  ): void {
    const conversationId = this.reverseIndex.get(session);
    if (!conversationId) {
      this.logger.warn(
        { call_sid: session.callSid },
        'No conversation bound to session in interrupt'
      );
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

  private handleCloseFromRelay(session: ConversationRelaySession): void {
    const conversationId = this.reverseIndex.get(session);
    if (!conversationId) {
      this.logger.warn({ call_sid: session.callSid }, 'No conversation bound to session in close');
      return;
    }
    this.bindings.delete(conversationId);
    void this.endConversation(conversationId).catch((err: unknown) => {
      this.logger.error(
        { err, conversation_id: conversationId },
        'WebSocket disconnect handler error'
      );
    });
  }

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

    let userMemory: TACMemoryResponse | undefined;
    if (session) {
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
      channel: 'crelay',
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
  // Outbound — all methods resolve the session O(1) via bindings
  // ===========================================================================

  private requireSession(conversationId: ConversationId): ConversationRelaySession {
    const session = this.bindings.get(conversationId);
    if (!session) {
      throw new Error(`No active session for conversation ${conversationId}`);
    }
    return session;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const session = this.requireSession(conversationId);
      const last = metadata?.last === undefined ? true : (metadata.last as boolean);
      session.sendText(message, last);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata,
      });
      throw error;
    }
  }

  public sendDigits(conversationId: ConversationId, digits: string): void {
    this.requireSession(conversationId).sendDigits(digits);
  }

  public sendPlay(
    conversationId: ConversationId,
    source: string,
    options?: { loop?: number; interruptible?: boolean; preemptible?: boolean }
  ): void {
    this.requireSession(conversationId).sendPlay(source, options);
  }

  public endCall(conversationId: ConversationId, handoffData?: Record<string, unknown>): void {
    this.requireSession(conversationId).endCall(handoffData);
  }

  // ===========================================================================
  // Tool Registry — forwards to the shared CR registry
  // ===========================================================================

  public listTools(): ConversationRelayTool[] {
    return this.conversationRelay.getToolRegistry().list();
  }

  public registerTool(tool: ConversationRelayTool): void {
    this.conversationRelay.getToolRegistry().register(tool);
  }

  public async executeTool(
    conversationId: ConversationId,
    name: string,
    args: unknown
  ): Promise<unknown> {
    return this.requireSession(conversationId).executeTool(name, args);
  }

  // ===========================================================================
  // Channel Interface plumbing
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
    this.conversationRelay.shutdown();
    this.bindings.clear();
    this.sessionStore.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }

  protected startConversation(
    conversationId: ConversationId,
    profileId?: ProfileId,
    serviceId?: string
  ): ConversationSession {
    return this.sessionStore.start(conversationId, profileId, serviceId);
  }

  protected async endConversation(conversationId: ConversationId): Promise<void> {
    await this.sessionStore.end(conversationId);
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
  // Incoming Call — Maestro conversation creation for TwiML params
  // ===========================================================================

  /**
   * Create the Maestro conversation for an incoming voice call and return the
   * IDs that CR injects as TwiML customParameters. Wire to
   * `ConversationRelayServer.onIncomingCall`.
   */
  public async createConversationForCall(input: {
    toNumber: string;
    fromNumber: string;
    callSid?: string;
  }): Promise<{
    conversation_id: string;
    profile_id: string;
    customer_participant_id: string;
    ai_agent_participant_id: string;
  }> {
    const { toNumber, fromNumber, callSid } = input;

    const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, '').slice(0, 15) + 'Z';
    const conversationName = `tac-crelay-${fromNumber}-${timestamp}`;

    const conversation = await this.conversationClient.createConversation(conversationName);

    if (!isConversationId(conversation.id)) {
      throw new Error(
        `Invalid conversation ID returned from Conversation Service: ${conversation.id}. ` +
          'Expected format: conv_conversation_[0-9a-z]{26}.'
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

    const aiAgentParticipant = await this.conversationClient.addOrFetchParticipant(
      conversationId,
      [{ channel: 'VOICE', address: toNumber, channelId: callSid }],
      'AI_AGENT'
    );

    return {
      conversation_id: conversationId,
      profile_id: customerParticipant.profileId || '',
      customer_participant_id: customerParticipant.id,
      ai_agent_participant_id: aiAgentParticipant.id,
    };
  }

  // ===========================================================================
  // ConversationRelay HTTP Callback Handling
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
        if (!isConversationId(conversation.id)) {
          this.logger.warn(
            { conversation_id: conversation.id, call_sid: callSid },
            'Invalid conversation ID format from Conversation Service. Skipping.'
          );
          continue;
        }

        // Skip conversations already in terminal state. A second CallStatus=completed
        // callback (Twilio retry), a listConversations dupe, or an app-level close via
        // onConversationEnded would otherwise PUT CLOSED→CLOSED and trip a benign 400.
        if (conversation.status === 'CLOSED') {
          this.logger.debug(
            { conversation_id: conversation.id, call_sid: callSid },
            'Conversation already CLOSED; skipping update'
          );
          continue;
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
