/**
 * VoiceChannel — CR + Maestro voice channel
 *
 * Handles voice conversations using ConversationRelay WebSocket protocol
 * WITH full Maestro Conversations Service integration. Always has ConversationClient.
 * Uses ConversationRelay from the CR package for WebSocket protocol handling.
 *
 * All CR events are emitted as unified 'message' events with conversation bundle.
 */

import {
  ConversationRelay,
  type CallSid,
  type SetupMessage,
  type PromptMessage,
  type InterruptMessage,
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
import {
  ConversationSessionStore,
  ConversationsWebhookProcessor,
  extractConversationId,
  extractProfileId,
  type MessagingWebhookPayload,
  type WebhookProcessorConfig,
} from './utility';

/**
 * VoiceChannel construction options.
 */
export interface VoiceChannelConfig {
  /**
   * ConversationRelay instance. When provided, VoiceChannel runs in **active** mode:
   *   - WebSocket events (prompt, interrupt, dtmf, info) are the source of user turns
   *   - Passive Maestro webhook COMMUNICATION_CREATED events are dropped to avoid
   *     double-emitting user turns (CR WebSocket is authoritative)
   *   - sendResponse routes through CR's WebSocket
   *
   * When omitted, VoiceChannel runs in **passive** mode (BYO-CR or webhook-only):
   *   - Maestro webhook events emit ChannelMessages like SMS/Chat
   *   - sendResponse throws (outbound voice requires CR)
   *   - WebSocket / TwiML / CR callback methods are not available
   */
  conversationRelay?: ConversationRelay | undefined;
  /** Maximum number of idempotency tokens to track for passive-mode deduplication (default: 10,000) */
  dedupCapacity?: number | undefined;
}

/**
 * Voice Channel — Maestro-backed voice with two construction modes.
 *
 * **Active mode** (`conversationRelay` provided): Handles voice via
 * ConversationRelay WebSocket (CR). Creates Maestro conversations in
 * createConversationForCall(). WebSocket events are the source of user
 * turns; passive Maestro webhook COMMUNICATION_CREATED events are dropped
 * to avoid double-emits. Wire `createConversationForCall` and
 * `handleConversationRelayCallback` into `CRelayServer`'s callbacks
 * (onIncomingCall / onCRCallback) — CRelayServer owns the /twiml, /ws,
 * and /conversation-relay-callback routes.
 *
 * **Passive mode** (`conversationRelay` omitted): Webhook-only / BYO-CR.
 * Inbound user turns come through Maestro webhooks just like SMS/Chat.
 * sendResponse throws because the Actions API rejects `channel: 'VOICE'`;
 * outbound voice requires a CR WebSocket.
 */
export class VoiceChannel implements Channel {
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly conversationClient: ConversationClient;
  protected readonly callbacks: ChannelEvents;
  private readonly conversationRelay: ConversationRelay | undefined;
  private readonly callSidToConversationId: Map<CallSid, ConversationId>;
  private readonly memoryRetriever: MemoryRetriever;
  private readonly sessionStore: ConversationSessionStore;
  private readonly webhookProcessor: ConversationsWebhookProcessor;
  private readonly tools: Map<string, CRTool> = new Map();

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
    this.callSidToConversationId = new Map();
    this.conversationRelay = channelConfig?.conversationRelay;

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

    // Wire up CR callbacks when in active mode
    if (this.conversationRelay) {
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

      this.logger.info('VoiceChannel initialized in active mode (CR + Maestro)');
    } else {
      this.logger.info('VoiceChannel initialized in passive mode (Maestro webhooks only)');
    }
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

  /**
   * Returns the active ConversationRelay, or throws a clear error if the
   * channel was constructed in passive mode.
   */
  private assertCR(op: string): ConversationRelay {
    if (!this.conversationRelay) {
      throw new Error(
        `VoiceChannel.${op} requires an active ConversationRelay. ` +
          'Pass { conversationRelay } to the VoiceChannel constructor to enable CR features.'
      );
    }
    return this.conversationRelay;
  }

  // Wrapping sync code in async to honor Channel interface's Promise<void> contract
  // eslint-disable-next-line @typescript-eslint/require-await
  public async sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const cr = this.assertCR('sendResponse');

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
      cr.sendResponse(callSid as CallSid, message, last);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata,
      });
      throw error;
    }
  }

  /**
   * Process a voice-channel Maestro webhook event.
   *
   * In **active mode** (CR connected), COMMUNICATION_CREATED events are
   * intentionally dropped: the CR WebSocket is the source of truth for user
   * turns, so letting the webhook path also emit would double-deliver.
   * Lifecycle events (CONVERSATION_CREATED / CONVERSATION_UPDATED) are
   * handled for session bookkeeping regardless.
   *
   * In **passive mode** (no CR), COMMUNICATION_CREATED emits `ChannelMessage`
   * exactly like SMS/Chat — this is the BYO-CR / webhook-only path.
   */
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
  // Passive-Mode Webhook Handlers
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

    // Active-mode drop: CR WebSocket is the source of truth for user turns.
    // Letting the webhook path also emit would double-deliver the same turn.
    if (this.conversationRelay) {
      this.logger.debug(
        { conversation_id: conversationId, author },
        'Active mode: dropping passive voice webhook communication (CR owns user turns)'
      );
      return;
    }

    // Ignore messages authored by the bot itself. Voice passive mode uses the
    // caller's phone number from config; if the AI's address matches, skip it.
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
    this.conversationRelay?.shutdown();
    this.callSidToConversationId.clear();
    this.sessionStore.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }

  // ===========================================================================
  // Tool Registry
  // ===========================================================================

  /**
   * List tools registered on this channel (for LLM discovery).
   *
   * In active mode, returns CR built-in protocol tools (playMedia, sendDigits,
   * switchLanguage, endCall) plus any user-registered tools.
   * In passive mode, returns only user-registered tools on the local registry —
   * CR protocol tools are unavailable because there is no WebSocket to ship
   * outgoingMessage frames over.
   */
  public listTools(): CRTool[] {
    return this.conversationRelay
      ? this.conversationRelay.listTools()
      : Array.from(this.tools.values());
  }

  /**
   * Register a tool on this channel. Overwrites any tool with the same name.
   * In active mode, the tool is delegated to the embedded ConversationRelay so
   * that protocol-tool outgoingMessage frames can be auto-shipped.
   */
  public registerTool(tool: CRTool): void {
    if (this.conversationRelay) {
      this.conversationRelay.registerTool(tool);
    } else {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Execute a registered tool by name.
   *
   * Active mode: if the tool returns an `outgoingMessage` (CR protocol tool),
   * it is validated and auto-shipped via the ConversationRelay WebSocket.
   * Passive mode: throws — CR protocol tools cannot dispatch without a WS.
   */
  public async executeTool(
    conversationId: ConversationId,
    name: string,
    args: unknown
  ): Promise<unknown> {
    const cr = this.assertCR('executeTool');
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    return cr.executeTool(callSid, name, args);
  }

  /**
   * Send DTMF digits to the caller.
   * @throws in passive mode, or if no active CallSid is mapped to the conversationId
   */
  public sendDigits(conversationId: ConversationId, digits: string): void {
    const cr = this.assertCR('sendDigits');
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    cr.sendDigits(callSid, digits);
  }

  /**
   * Play media from a URL to the caller.
   * @throws in passive mode, or if no active CallSid is mapped to the conversationId
   */
  public sendPlay(
    conversationId: ConversationId,
    source: string,
    options?: { loop?: number; interruptible?: boolean; preemptible?: boolean }
  ): void {
    const cr = this.assertCR('sendPlay');
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    cr.sendPlay(callSid, source, options);
  }

  /**
   * End the call with optional handoff data.
   * @throws in passive mode, or if no active CallSid is mapped to the conversationId
   */
  public endCall(conversationId: ConversationId, handoffData?: Record<string, unknown>): void {
    const cr = this.assertCR('endCall');
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    cr.endCall(callSid, handoffData);
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
  // Incoming Call Handling — Maestro Only
  // ===========================================================================

  /**
   * Create the Maestro conversation for an incoming voice call and return the
   * four IDs that CR needs to inject as TwiML customParameters. No CR, no
   * TwiML — pure Maestro work. Wire this to `CRelayServer.onIncomingCall` so
   * the CR server renders the TwiML with these IDs as customParameters.
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
    const conversationName = `tac-voice-${fromNumber}-${timestamp}`;

    const conversation = await this.conversationClient.createConversation(conversationName);

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
