/**
 * CRelayChannel — CR-only voice channel (TAC_MODE=crelay)
 *
 * Thin adapter wrapping CRelayVoice from the CR package.
 * No Maestro. No memory. No ConversationClient.
 * Uses CallSid as session identifier.
 */

import { WebSocket } from 'ws';
import type { Logger } from 'pino';
import {
  CRelayVoice,
  type CallSid,
  type InterruptMessage,
  type ConversationRelayConfig,
} from '@twilio/tac-conversationrelay';
import {
  type ConversationId,
  type ConversationSession,
  type ChannelType,
  type Channel,
  type ChannelEvents,
} from '../types/index';

/**
 * CRelayChannel event callbacks
 */
export interface CRelayChannelEvents extends ChannelEvents {
  onPrompt?: (data: {
    conversationId: ConversationId;
    transcript: string;
    session?: ConversationSession | undefined;
  }) => void;
  onInterrupt?: (data: {
    conversationId: ConversationId;
    utteranceUntilInterrupt: string | undefined;
    durationUntilInterruptMs: number | undefined;
  }) => void;
}

/**
 * CR-only voice channel adapter.
 *
 * Wraps CRelayVoice for WebSocket protocol handling, maps CRelaySession
 * to ConversationSession, and exposes the Channel interface for TAC.
 */
export class CRelayChannel implements Channel {
  public readonly channelType: ChannelType = 'voice';

  private readonly logger: Logger;
  private readonly crelayVoice: CRelayVoice;
  private readonly activeConversations: Map<ConversationId, ConversationSession>;
  private readonly callbacks: CRelayChannelEvents;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'crelay-channel' });
    this.crelayVoice = new CRelayVoice(logger.child({ component: 'crelay' }));
    this.activeConversations = new Map();
    this.callbacks = {};

    this.wireCRelayEvents();
    this.logger.info('CRelayChannel initialized');
  }

  private wireCRelayEvents(): void {
    this.crelayVoice.onSessionStarted((callSid, session) => {
      const conversationId = callSid as string as ConversationId;
      const convSession: ConversationSession = {
        sessionId: conversationId,
        channel: 'voice',
        startedAt: session.startedAt,
        metadata: {},
      };
      this.activeConversations.set(conversationId, convSession);
      this.callbacks.onConversationStarted?.({ session: convSession });
    });

    this.crelayVoice.onMessage((callSid, message) => {
      const conversationId = callSid as string as ConversationId;
      const session = this.activeConversations.get(conversationId);
      this.callbacks.onPrompt?.({ conversationId, transcript: message, session });
    });

    this.crelayVoice.onInterrupt((callSid, data: InterruptMessage) => {
      const conversationId = callSid as string as ConversationId;
      this.callbacks.onInterrupt?.({
        conversationId,
        utteranceUntilInterrupt: data.utteranceUntilInterrupt,
        durationUntilInterruptMs: data.durationUntilInterruptMs,
      });
    });

    this.crelayVoice.onSessionEnded(callSid => {
      const conversationId = callSid as string as ConversationId;
      const session = this.activeConversations.get(conversationId);
      if (session) {
        void Promise.resolve(this.callbacks.onConversationEnded?.({ session })).catch(
          (err: unknown) => {
            this.logger.error(
              { err, conversation_id: conversationId },
              'Error in conversation ended callback'
            );
          }
        );
        this.activeConversations.delete(conversationId);
      }
    });

    this.crelayVoice.onError((callSid, error) => {
      this.callbacks.onError?.({ error, context: { callSid: callSid as string } });
    });
  }

  // ===========================================================================
  // Channel Interface
  // ===========================================================================

  public sendResponse(
    conversationId: ConversationId,
    message: string,
    _metadata?: Record<string, unknown>
  ): Promise<void> {
    this.crelayVoice.sendResponse(conversationId as string as CallSid, message);
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic event callback
  public on(event: string, callback: (...args: any[]) => void): void {
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
    this.crelayVoice.shutdown();
    this.activeConversations.clear();
  }

  // ===========================================================================
  // WebSocket + TwiML
  // ===========================================================================

  public handleWebSocketConnection(ws: WebSocket): void {
    this.crelayVoice.handleConnection(ws);
  }

  public handleIncomingCall(options: {
    callSid: string;
    conversationRelayConfig: ConversationRelayConfig;
    actionUrl?: string;
  }): string {
    if (!options.callSid) {
      throw new Error('callSid is required for CRelayChannel');
    }

    return this.crelayVoice.generateTwiML(
      options.conversationRelayConfig,
      { conversation_id: options.callSid },
      options.actionUrl ? { actionUrl: options.actionUrl } : undefined
    );
  }
}
