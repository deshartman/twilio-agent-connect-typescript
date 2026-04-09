/**
 * CRelayChannel — CR-only voice channel (TAC_MODE=crelay)
 *
 * Thin adapter wrapping CRelayVoice from the CR package.
 * No Maestro. No memory. No ConversationClient.
 * Uses CallSid as session identifier.
 *
 * All CR events (setup, prompt, interrupt, dtmf, info) are emitted as
 * unified 'message' events with messageType 'user' or 'system'.
 */

import { WebSocket } from 'ws';
import type { Logger } from 'pino';
import {
  CRelayVoice,
  type CallSid,
  type ConversationRelayConfig,
} from '@twilio/tac-conversationrelay';
import {
  type ConversationId,
  type ConversationSession,
  type ChannelType,
  type ChannelMessage,
  type Channel,
  type ChannelEvents,
} from '../types/index';

/**
 * CR-only voice channel adapter.
 *
 * Wraps CRelayVoice for WebSocket protocol handling, maps CRelaySession
 * to ConversationSession, and exposes the Channel interface for TAC.
 * Emits all CR events as unified 'message' events.
 */
export class CRelayChannel implements Channel {
  public readonly channelType: ChannelType = 'voice';

  private readonly logger: Logger;
  private readonly crelayVoice: CRelayVoice;
  private readonly activeConversations: Map<ConversationId, ConversationSession>;
  private readonly callbacks: ChannelEvents;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'crelay-channel' });
    this.crelayVoice = new CRelayVoice(logger.child({ component: 'crelay' }));
    this.activeConversations = new Map();
    this.callbacks = {};

    this.wireCRelayEvents();
    this.logger.info('CRelayChannel initialized');
  }

  private wireCRelayEvents(): void {
    this.crelayVoice.onSessionStarted((callSid, session, data) => {
      const conversationId = callSid as string as ConversationId;
      const convSession: ConversationSession = {
        sessionId: conversationId,
        channel: 'voice',
        startedAt: session.startedAt,
        metadata: {},
      };
      this.activeConversations.set(conversationId, convSession);
      this.callbacks.onConversationStarted?.({ session: convSession });

      // Emit setup as system message
      this.emitMessage({
        sessionId: conversationId,
        messageType: 'system',
        message: `Call details: from ${data.from}, to ${data.to}, callSid ${data.callSid}`,
        channel: 'voice',
        metadata: {
          type: 'setup',
          callSid: data.callSid,
          from: data.from,
          to: data.to,
          direction: data.direction,
        },
      });
    });

    this.crelayVoice.onMessage((callSid, message, data) => {
      const conversationId = callSid as string as ConversationId;
      this.emitMessage({
        sessionId: conversationId,
        messageType: 'user',
        message,
        channel: 'voice',
        metadata: { type: 'prompt', lang: data.lang, last: data.last },
      });
    });

    this.crelayVoice.onInterrupt((callSid, data) => {
      const conversationId = callSid as string as ConversationId;
      const parts: string[] = ['User interrupted'];
      if (data.durationUntilInterruptMs !== undefined) {
        parts.push(`after ${data.durationUntilInterruptMs}ms`);
      }
      if (data.utteranceUntilInterrupt) {
        parts.push(`Last heard: '${data.utteranceUntilInterrupt}'`);
      }

      this.emitMessage({
        sessionId: conversationId,
        messageType: 'system',
        message: parts.join('. '),
        channel: 'voice',
        metadata: {
          type: 'interrupt',
          utteranceUntilInterrupt: data.utteranceUntilInterrupt,
          durationUntilInterruptMs: data.durationUntilInterruptMs,
        },
      });
    });

    this.crelayVoice.onDtmf((callSid, data) => {
      const conversationId = callSid as string as ConversationId;
      this.emitMessage({
        sessionId: conversationId,
        messageType: 'system',
        message: `User pressed ${data.digit}`,
        channel: 'voice',
        metadata: { type: 'dtmf', digit: data.digit },
      });
    });

    this.crelayVoice.onInfo((callSid, data) => {
      const conversationId = callSid as string as ConversationId;
      this.emitMessage({
        sessionId: conversationId,
        messageType: 'system',
        message: JSON.stringify(data.info ?? {}),
        channel: 'voice',
        metadata: { type: 'info', info: data.info },
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

  private emitMessage(msg: ChannelMessage): void {
    if (this.callbacks.onMessage) {
      void Promise.resolve(this.callbacks.onMessage(msg)).catch((err: unknown) => {
        this.logger.error({ err, session_id: msg.sessionId }, 'Error in message callback');
      });
    }
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
