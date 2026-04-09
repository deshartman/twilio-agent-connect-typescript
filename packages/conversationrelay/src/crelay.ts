/**
 * CRelayVoice — ConversationRelay Voice Handler
 *
 * Owns ALL ConversationRelay protocol logic:
 * - WebSocket connection management and message routing
 * - Session lifecycle (CRelaySession per CallSid)
 * - Event callbacks aligned with the CR protocol
 * - TwiML generation for <ConversationRelay> noun
 * - Response sending via WebSocket
 *
 * NO dependency on @twilio/tac-core — completely standalone.
 */

import { WebSocket } from 'ws';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import type { Logger } from 'pino';
import {
  type CallSid,
  type CRelaySession,
  type SetupMessage,
  type PromptMessage,
  type InterruptMessage,
  type DtmfMessage,
  type InfoMessage,
  type TextTokenMessage,
  type ConversationRelayConfig,
  type CustomParameters,
  ConversationRelayConfigSchema,
  CustomParametersSchema,
  WebSocketMessageSchema,
} from './types.js';

// =============================================================================
// Callback Types
// =============================================================================

type SessionStartedCallback = (callSid: CallSid, session: CRelaySession, data: SetupMessage) => void;
type MessageCallback = (callSid: CallSid, message: string, data: PromptMessage) => void;
type InterruptCallback = (callSid: CallSid, data: InterruptMessage) => void;
type DtmfCallback = (callSid: CallSid, data: DtmfMessage) => void;
type InfoCallback = (callSid: CallSid, data: InfoMessage) => void;
type SessionEndedCallback = (callSid: CallSid) => void;
type ErrorCallback = (callSid: CallSid, error: Error) => void;

/**
 * CRelayVoice — ConversationRelay voice handler
 *
 * Manages WebSocket connections, session lifecycle, and event routing
 * for the Twilio ConversationRelay protocol.
 */
export class CRelayVoice {
  private readonly logger: Logger;
  private readonly connections: Map<CallSid, WebSocket>;
  private readonly sessions: Map<CallSid, CRelaySession>;
  private readonly callbacks: {
    onSessionStarted?: SessionStartedCallback;
    onMessage?: MessageCallback;
    onInterrupt?: InterruptCallback;
    onDtmf?: DtmfCallback;
    onInfo?: InfoCallback;
    onSessionEnded?: SessionEndedCallback;
    onError?: ErrorCallback;
  };

  constructor(logger: Logger) {
    this.logger = logger;
    this.connections = new Map();
    this.sessions = new Map();
    this.callbacks = {};
  }

  // ===========================================================================
  // Callback Registration
  // ===========================================================================

  /** Register callback for session started (setup message received) */
  public onSessionStarted(callback: SessionStartedCallback): void {
    this.callbacks.onSessionStarted = callback;
  }

  /** Register callback for user message (prompt transcription) */
  public onMessage(callback: MessageCallback): void {
    this.callbacks.onMessage = callback;
  }

  /** Register callback for user interrupt */
  public onInterrupt(callback: InterruptCallback): void {
    this.callbacks.onInterrupt = callback;
  }

  /** Register callback for DTMF input (placeholder) */
  public onDtmf(callback: DtmfCallback): void {
    this.callbacks.onDtmf = callback;
  }

  /** Register callback for info events (placeholder) */
  public onInfo(callback: InfoCallback): void {
    this.callbacks.onInfo = callback;
  }

  /** Register callback for session ended (WebSocket closed) */
  public onSessionEnded(callback: SessionEndedCallback): void {
    this.callbacks.onSessionEnded = callback;
  }

  /** Register callback for errors */
  public onError(callback: ErrorCallback): void {
    this.callbacks.onError = callback;
  }

  // ===========================================================================
  // WebSocket Connection Handling
  // ===========================================================================

  /**
   * Handle incoming WebSocket connection from Twilio ConversationRelay.
   * Extracts CallSid from setup message and routes subsequent messages.
   */
  public handleConnection(ws: WebSocket): void {
    let callSid: CallSid | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const messageText = data.toString();
        const messageData = JSON.parse(messageText) as unknown;

        this.logger.debug({ raw_message: messageData }, 'Received ConversationRelay message');

        const validatedMessage = WebSocketMessageSchema.safeParse(messageData);

        if (!validatedMessage.success) {
          this.logger.error(
            { validation_errors: validatedMessage.error.errors, raw_message: messageData },
            'Invalid ConversationRelay message'
          );
          return;
        }

        const message = validatedMessage.data;

        switch (message.type) {
          case 'setup': {
            callSid = message.callSid as CallSid;
            this.connections.set(callSid, ws);

            // Create session
            const session: CRelaySession = {
              callSid,
              from: message.from,
              to: message.to,
              startedAt: new Date(),
              customParameters: message.customParameters as Record<string, unknown> | undefined,
            };
            this.sessions.set(callSid, session);

            this.callbacks.onSessionStarted?.(callSid, session, message);
            break;
          }

          case 'prompt':
            if (callSid) {
              this.callbacks.onMessage?.(callSid, message.voicePrompt, message);
            }
            break;

          case 'interrupt':
            if (callSid) {
              this.callbacks.onInterrupt?.(callSid, message);
            }
            break;

          case 'dtmf':
            if (callSid) {
              this.callbacks.onDtmf?.(callSid, message);
            }
            break;

          case 'info':
            if (callSid) {
              this.callbacks.onInfo?.(callSid, message);
            }
            break;

          case 'error':
            if (callSid) {
              const err = new Error(message.description ?? 'ConversationRelay error');
              this.callbacks.onError?.(callSid, err);
            }
            break;

          default:
            this.logger.warn(
              { call_sid: callSid, message: messageData },
              'Unhandled ConversationRelay message type'
            );
            break;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error({ err, call_sid: callSid }, 'Error processing ConversationRelay message');
        if (callSid) {
          this.callbacks.onError?.(callSid, err);
        }
      }
    });

    ws.on('close', () => {
      if (callSid) {
        this.connections.delete(callSid);
        this.sessions.delete(callSid);
        this.logger.debug({ call_sid: callSid }, 'ConversationRelay WebSocket closed');
        this.callbacks.onSessionEnded?.(callSid);
      }
    });

    ws.on('error', (error: Error) => {
      this.logger.error({ err: error, call_sid: callSid }, 'ConversationRelay WebSocket error');
      if (callSid) {
        this.callbacks.onError?.(callSid, error);
      }
    });
  }

  // ===========================================================================
  // Session Access
  // ===========================================================================

  /** Get session for a CallSid */
  public getSession(callSid: CallSid): CRelaySession | undefined {
    return this.sessions.get(callSid);
  }

  /** Check if a session exists for a CallSid */
  public hasSession(callSid: CallSid): boolean {
    return this.sessions.has(callSid);
  }

  // ===========================================================================
  // Response Sending
  // ===========================================================================

  /**
   * Send a text response to a call via WebSocket
   */
  public sendResponse(callSid: CallSid, message: string, last = true): void {
    const ws = this.connections.get(callSid);
    if (!ws) {
      throw new Error(`No WebSocket connection found for CallSid: ${callSid}`);
    }

    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not open for CallSid: ${callSid} (state: ${ws.readyState})`);
    }

    const textMessage: TextTokenMessage = {
      type: 'text',
      token: message,
      last,
    };

    ws.send(JSON.stringify(textMessage));
    this.logger.debug({ call_sid: callSid, last }, 'Sent text response');
  }

  /**
   * Send a raw message object via WebSocket
   */
  public sendMessage(callSid: CallSid, message: TextTokenMessage): void {
    const ws = this.connections.get(callSid);
    if (!ws) {
      throw new Error(`No WebSocket connection found for CallSid: ${callSid}`);
    }

    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not open for CallSid: ${callSid} (state: ${ws.readyState})`);
    }

    ws.send(JSON.stringify(message));
    this.logger.debug({ call_sid: callSid, message_type: message.type }, 'Sent ConversationRelay message');
  }

  // ===========================================================================
  // TwiML Generation
  // ===========================================================================

  /**
   * Generate TwiML for a ConversationRelay connection.
   *
   * Produces a <Response><Connect><ConversationRelay> TwiML document
   * with optional <Parameter> child elements and <Language> configurations.
   */
  public generateTwiML(
    config: ConversationRelayConfig,
    parameters?: CustomParameters,
    options?: { actionUrl?: string }
  ): string {
    // Validate configuration
    const validationResult = ConversationRelayConfigSchema.safeParse(config);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new Error(`Invalid ConversationRelay configuration: ${errorMessage}`);
    }

    const validatedConfig = validationResult.data;

    // Validate custom parameters if provided
    if (parameters) {
      const paramsValidation = CustomParametersSchema.safeParse(parameters);
      if (!paramsValidation.success) {
        const errorMessage = paramsValidation.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new Error(`Invalid custom parameters: ${errorMessage}`);
      }
    }

    // Extract languages array (child elements, not attributes)
    const { languages, ...conversationRelayAttributes } = validatedConfig;

    // Filter out undefined values to keep TwiML clean
    const filteredConfig = CRelayVoice.filterUnsetValues(conversationRelayAttributes);

    // Build TwiML using SDK
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);

    // Add language configurations as child <Language> elements
    if (languages && languages.length > 0) {
      for (const lang of languages) {
        const filteredLang = CRelayVoice.filterUnsetValues(lang);
        relay.language(filteredLang);
      }
    }

    // Add custom parameters as child <Parameter> elements (bug fix: per-parameter iteration)
    if (parameters) {
      for (const [name, value] of Object.entries(parameters)) {
        if (value !== undefined) {
          relay.parameter({ name, value: String(value) });
        }
      }
    }

    return response.toString();
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /** Get WebSocket connection for a CallSid */
  public getWebSocket(callSid: CallSid): WebSocket | null {
    return this.connections.get(callSid) || null;
  }

  /** Close a specific connection */
  public closeConnection(callSid: CallSid): void {
    const ws = this.connections.get(callSid);
    if (ws) {
      ws.close();
      this.connections.delete(callSid);
      this.sessions.delete(callSid);
      this.logger.debug({ call_sid: callSid }, 'Closed ConversationRelay connection');
    }
  }

  /** Shutdown — close all connections */
  public shutdown(): void {
    for (const [callSid, ws] of this.connections.entries()) {
      ws.close();
      this.logger.debug({ call_sid: callSid }, 'Shutdown: closed ConversationRelay connection');
    }
    this.connections.clear();
    this.sessions.clear();
  }

  // ===========================================================================
  // Private Utilities
  // ===========================================================================

  /**
   * Filter undefined/null values from object for clean TwiML attributes
   */
  private static filterUnsetValues<T extends Record<string, unknown>>(
    obj: T
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, value]) => value !== undefined && value !== null)
    );
  }
}
