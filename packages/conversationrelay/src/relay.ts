/**
 * ConversationRelay Utility
 *
 * Pure utility for handling ConversationRelay WebSocket protocol.
 * No Channel interface, no TAC knowledge, no Maestro concepts - just protocol handling.
 *
 * Used internally by VoiceChannel for both CR-only and Maestro modes.
 */

import { WebSocket } from 'ws';
import type { Logger } from 'pino';
import {
  CallSid,
  SetupMessage,
  PromptMessage,
  InterruptMessage,
  TextTokenMessage,
  WebSocketMessageSchema,
} from './types.js';

/**
 * Callback types for ConversationRelay events
 */
type SetupCallback = (callSid: CallSid, data: SetupMessage) => void;
type PromptCallback = (callSid: CallSid, data: PromptMessage) => void;
type InterruptCallback = (callSid: CallSid, data: InterruptMessage) => void;
type CloseCallback = (callSid: CallSid) => void;
type ErrorCallback = (callSid: CallSid, error: Error) => void;

/**
 * Pure ConversationRelay protocol utility
 *
 * Handles WebSocket connections and message routing for ConversationRelay protocol.
 * CallSid-based operations only - no conversation or session concepts.
 */
export class ConversationRelay {
  private readonly logger: Logger;
  private readonly connections: Map<CallSid, WebSocket>;
  private readonly callbacks: {
    onSetup?: SetupCallback;
    onPrompt?: PromptCallback;
    onInterrupt?: InterruptCallback;
    onClose?: CloseCallback;
    onError?: ErrorCallback;
  };

  constructor(logger: Logger) {
    this.logger = logger;
    this.connections = new Map();
    this.callbacks = {};
  }

  /**
   * Register setup message callback
   */
  public onSetup(callback: SetupCallback): void {
    this.callbacks.onSetup = callback;
  }

  /**
   * Register prompt message callback
   */
  public onPrompt(callback: PromptCallback): void {
    this.callbacks.onPrompt = callback;
  }

  /**
   * Register interrupt message callback
   */
  public onInterrupt(callback: InterruptCallback): void {
    this.callbacks.onInterrupt = callback;
  }

  /**
   * Register close callback
   */
  public onClose(callback: CloseCallback): void {
    this.callbacks.onClose = callback;
  }

  /**
   * Register error callback
   */
  public onError(callback: ErrorCallback): void {
    this.callbacks.onError = callback;
  }

  /**
   * Handle incoming WebSocket connection
   *
   * Extracts CallSid from setup message and routes subsequent messages.
   */
  public handleConnection(ws: WebSocket): void {
    let callSid: CallSid | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const messageText = data.toString();
        const messageData = JSON.parse(messageText) as unknown;

        this.logger.debug({ raw_message: messageData }, 'Received ConversationRelay message');

        // Validate message structure
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
          case 'setup':
            callSid = message.callSid as CallSid;
            this.connections.set(callSid, ws);
            if (this.callbacks.onSetup) {
              this.callbacks.onSetup(callSid, message);
            }
            break;

          case 'prompt':
            if (callSid && this.callbacks.onPrompt) {
              this.callbacks.onPrompt(callSid, message);
            }
            break;

          case 'interrupt':
            if (callSid && this.callbacks.onInterrupt) {
              this.callbacks.onInterrupt(callSid, message);
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
        if (callSid && this.callbacks.onError) {
          this.callbacks.onError(callSid, err);
        }
      }
    });

    ws.on('close', () => {
      if (callSid) {
        this.connections.delete(callSid);
        this.logger.debug({ call_sid: callSid }, 'ConversationRelay WebSocket closed');
        if (this.callbacks.onClose) {
          this.callbacks.onClose(callSid);
        }
      }
    });

    ws.on('error', (error: Error) => {
      this.logger.error({ err: error, call_sid: callSid }, 'ConversationRelay WebSocket error');
      if (callSid && this.callbacks.onError) {
        this.callbacks.onError(callSid, error);
      }
    });
  }

  /**
   * Get WebSocket connection for a CallSid
   */
  public getWebSocket(callSid: CallSid): WebSocket | null {
    return this.connections.get(callSid) || null;
  }

  /**
   * Send text token message via WebSocket
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

  /**
   * Close WebSocket connection
   */
  public closeConnection(callSid: CallSid): void {
    const ws = this.connections.get(callSid);
    if (ws) {
      ws.close();
      this.connections.delete(callSid);
      this.logger.debug({ call_sid: callSid }, 'Closed ConversationRelay connection');
    }
  }

  /**
   * Shutdown utility - close all connections
   */
  public shutdown(): void {
    for (const [callSid, ws] of this.connections.entries()) {
      ws.close();
      this.logger.debug({ call_sid: callSid }, 'Shutdown: closed ConversationRelay connection');
    }
    this.connections.clear();
  }
}
