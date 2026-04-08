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
  isProfileId,
  Channel,
  ChannelEvents,
} from '../types/index';
import type { TAC } from '../lib/tac';
import { TACConfig } from '../lib/config';
import { Logger } from '../lib/logger';
import { ConversationRelay, type CallSid } from '@twilio/tac-conversationrelay';

/**
 * ConversationRelay channel event callbacks extending base callbacks
 */
export interface ConversationRelayChannelEvents extends ChannelEvents {
  onPrompt?: (data: {
    conversationId: ConversationId;
    transcript: string;
    session?: ConversationSession;
  }) => void;
  onInterrupt?: (data: {
    conversationId: ConversationId;
    reason: string;
    transcript: string | undefined;
  }) => void;
}

/**
 * ConversationRelay-only voice channel (no Maestro)
 *
 * Handles voice conversations using ConversationRelay protocol without
 * Maestro Conversations Service. Uses CallSid as session identifier.
 */
export class ConversationRelayChannel implements Channel {
  public readonly channelType: ChannelType = 'voice';

  protected readonly tac: TAC;
  protected readonly config: TACConfig;
  protected readonly logger: Logger;
  protected readonly activeConversations: Map<ConversationId, ConversationSession>;
  protected readonly callbacks: ConversationRelayChannelEvents;
  private readonly conversationRelay: ConversationRelay;
  private readonly callSidToSessionId: Map<string, string>;
  private readonly promptQueues: Map<ConversationId, Promise<void>>;

  constructor(tac: TAC) {
    this.tac = tac;
    this.config = tac.getConfig();
    this.logger = tac.logger.child({ component: 'crelay-channel' });
    this.activeConversations = new Map();
    this.callbacks = {};
    this.callSidToSessionId = new Map();
    this.promptQueues = new Map();

    // Verify we're in crelay mode
    if (this.config.tacMode !== 'crelay') {
      throw new Error(
        'ConversationRelayChannel requires TAC_MODE=crelay. ' +
          'Use VoiceChannel for TAC_MODE=conversation.'
      );
    }

    // Initialize ConversationRelay utility
    this.conversationRelay = new ConversationRelay(tac.logger.child({ component: 'crelay' }));

    // Wire up ConversationRelay callbacks
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

    this.logger.info('ConversationRelayChannel initialized (CR-only mode)');
  }

  // =========================================================================
  // Setup/Prompt/Interrupt Handlers (from ConversationRelay)
  // =========================================================================

  private handleSetupFromRelay(callSid: CallSid, data: SetupMessage): void {
    // Use CallSid directly as sessionId
    const sessionId = callSid as string;
    this.callSidToSessionId.set(callSid as string, sessionId);

    // Extract profileId from custom parameters if provided
    let profileId: ProfileId | undefined;
    if (
      data.customParameters?.profile_id &&
      typeof data.customParameters.profile_id === 'string' &&
      isProfileId(data.customParameters.profile_id)
    ) {
      profileId = data.customParameters.profile_id;
    }

    // Create session (minimal - CR-only)
    const session: ConversationSession = {
      sessionId,
      profileId,
      channel: this.channelType,
      startedAt: new Date(),
      metadata: {},
    };

    this.startConversation(sessionId as ConversationId, session);

    this.logger.info(
      { call_sid: callSid, session_id: sessionId, profile_id: profileId },
      'Setup complete for CR-only call'
    );
  }

  private handlePromptFromRelay(callSid: CallSid, data: PromptMessage): void {
    const sessionId = this.callSidToSessionId.get(callSid as string);
    if (!sessionId) {
      this.logger.warn({ call_sid: callSid }, 'No session found for CallSid in prompt');
      return;
    }

    this.handlePromptMessage(sessionId as ConversationId, data);
  }

  private handleInterruptFromRelay(callSid: CallSid, data: InterruptMessage): void {
    const sessionId = this.callSidToSessionId.get(callSid as string);
    if (!sessionId) {
      this.logger.warn({ call_sid: callSid }, 'No session found for CallSid in interrupt');
      return;
    }

    this.handleInterruptMessage(sessionId as ConversationId, data);
  }

  private handleCloseFromRelay(callSid: CallSid): void {
    const sessionId = this.callSidToSessionId.get(callSid as string);
    if (!sessionId) {
      this.logger.warn({ call_sid: callSid }, 'No session found for CallSid in close');
      return;
    }

    void this.endConversation(sessionId as ConversationId);
    this.callSidToSessionId.delete(callSid as string);
  }

  // =========================================================================
  // Message Handlers
  // =========================================================================

  private handlePromptMessage(sessionId: ConversationId, message: PromptMessage): void {
    const { voicePrompt } = message;

    // Queue prompt handling to prevent overlapping responses
    const existingQueue = this.promptQueues.get(sessionId);
    const promptTask = async () => {
      if (existingQueue) await existingQueue;
      this.processPrompt(sessionId, voicePrompt || '');
    };

    this.promptQueues.set(sessionId, promptTask());
  }

  private processPrompt(sessionId: ConversationId, transcript: string): void {
    const session = this.getConversationSession(sessionId);
    if (!session) return;

    this.callbacks.onPrompt?.({
      conversationId: sessionId,
      transcript,
      session,
    });
  }

  private handleInterruptMessage(sessionId: ConversationId, message: InterruptMessage): void {
    const { reason, transcript } = message;

    this.callbacks.onInterrupt?.({
      conversationId: sessionId,
      reason: reason ?? 'unknown',
      transcript: transcript ?? undefined,
    });
  }

  // =========================================================================
  // Channel Interface Implementation
  // =========================================================================

  public sendResponse(
    conversationId: ConversationId,
    message: string,
    _metadata?: Record<string, unknown>
  ): Promise<void> {
    // Get CallSid from sessionId
    const callSid = conversationId as string; // In CR-only mode, sessionId IS callSid

    const textMessage: TextTokenMessage = {
      type: 'text',
      token: message,
      last: true,
    };

    this.conversationRelay.sendMessage(callSid as CallSid, textMessage);
    return Promise.resolve();
  }

  public on(event: string, callback: (...args: unknown[]) => void): void {
    switch (event) {
      case 'prompt':
        this.callbacks.onPrompt = callback;
        break;
      case 'interrupt':
        this.callbacks.onInterrupt = callback;
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
    this.callSidToSessionId.clear();
    this.promptQueues.clear();
    this.activeConversations.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
  }

  // =========================================================================
  // WebSocket Handling
  // =========================================================================

  public handleWebSocketConnection(ws: WebSocket): void {
    this.conversationRelay.handleConnection(ws);
  }

  // =========================================================================
  // TwiML Generation
  // =========================================================================

  public handleIncomingCall(options: {
    toNumber: string;
    fromNumber: string;
    callSid?: string;
    actionUrl?: string;
    conversationRelayConfig: ConversationRelayConfig;
  }): string {
    const { callSid, conversationRelayConfig, actionUrl } = options;

    if (!callSid) {
      throw new Error('callSid is required for ConversationRelay-only mode');
    }

    this.logger.debug({ call_sid: callSid }, 'Generating TwiML for CR-only call');

    // Generate TwiML using CallSid as conversation_id
    return this.connectConversationRelay(
      conversationRelayConfig,
      { conversation_id: callSid },
      actionUrl ? { actionUrl } : undefined
    );
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  protected startConversation(conversationId: ConversationId, session: ConversationSession): void {
    this.activeConversations.set(conversationId, session);
    this.callbacks.onConversationStarted?.({ session });
    this.logger.debug({ session_id: session.sessionId }, 'Conversation started');
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
      this.logger.debug({ session_id: session.sessionId }, 'Conversation ended');
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

  // =========================================================================
  // ConversationRelay TwiML Utility
  // =========================================================================

  private connectConversationRelay(
    config: ConversationRelayConfig,
    parameters: CustomParameters,
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

    // Filter out undefined values to keep TwiML clean
    const filteredConfig = this.filterUnsetValues(
      validatedConfig as unknown as Record<string, unknown>
    );

    // Build TwiML using SDK
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(
      filteredConfig as Parameters<typeof connect.conversationRelay>[0]
    );

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
}
