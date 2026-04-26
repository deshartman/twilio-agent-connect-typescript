/**
 * ConversationRelaySession — one WebSocket, one session.
 *
 * Owns everything previously keyed by CallSid on the old `ConversationRelay`
 * singleton: the `ws` handle, session identity (callSid/from/to/startedAt/
 * customParameters), listen-mode + suppressed-count, the per-session
 * `SilenceHandler`, the `pendingTerminalMessage` deferral slot, and the
 * reference to the shared `ToolRegistry`. All public methods operate on
 * `this` — callers never thread a CallSid through.
 *
 * Owned by `ConversationRelay` (one per WebSocket upgrade). Constructed on
 * the first `setup` frame; destroyed on WS close.
 */

import { WebSocket, type RawData } from 'ws';

import type { Logger } from './logger';
import { SilenceHandler } from './silence-handler';
import type { ToolRegistry } from './tool-registry';
import {
  type CallSid,
  type SetupMessage,
  type OutgoingMessage,
  type WebSocketMessage,
  OutgoingMessageSchema,
} from '../types';

/**
 * Silence-handling config supplied at `ConversationRelay` construction and
 * forwarded to each session. Absent = silence handling disabled for the
 * session (no `SilenceHandler` constructed). Reminder sequence is always
 * `['Are you still there?', ...additionalPrompts]`; the terminal reminder's
 * breach ends the call via `endCall` with `{ reasonCode: 'unresponsive' }`.
 */
export interface SilenceConfig {
  /** Seconds of silence before a reminder fires. Default: 20. */
  thresholdSeconds?: number;
  /** Up to 2 custom prompts appended after the default "Are you still there?". */
  additionalPrompts?: [string] | [string, string];
}

/**
 * Outgoing message types suppressed when a session has listen-mode enabled.
 * `sendDigits` and `end` are deliberately excluded — DTMF navigation and
 * call termination must always work.
 */
const LISTEN_MODE_GATED_TYPES: ReadonlySet<OutgoingMessage['type']> = new Set([
  'text',
  'play',
  'language',
]);

/**
 * Callbacks the manager supplies so the session can fan events out to
 * subscribers without importing the manager class (keeps the session
 * free of circular deps).
 */
export interface SessionCallbacks {
  onPrompt?: (session: ConversationRelaySession, message: string, data: unknown) => void;
  onInterrupt?: (session: ConversationRelaySession, data: unknown) => void;
  onDtmf?: (session: ConversationRelaySession, data: unknown) => void;
  onInfo?: (session: ConversationRelaySession, data: unknown) => void;
  onError?: (session: ConversationRelaySession, error: Error) => void;
}

export interface ConversationRelaySessionOptions {
  ws: WebSocket;
  setup: SetupMessage;
  toolRegistry: ToolRegistry;
  logger: Logger;
  silenceTemplate?: SilenceConfig | undefined;
  callbacks: SessionCallbacks;
}

export class ConversationRelaySession {
  public readonly callSid: CallSid;
  public readonly from: string;
  public readonly to: string;
  public readonly startedAt: Date;
  public readonly customParameters: Record<string, string> | undefined;

  private readonly ws: WebSocket;
  private readonly logger: Logger;
  private readonly toolRegistry: ToolRegistry;
  private readonly callbacks: SessionCallbacks;

  private _listenMode = false;
  private _suppressedCount = 0;
  private readonly _silenceHandler: SilenceHandler | undefined;

  /**
   * Terminal `OutgoingMessage` (currently only `type: 'end'`) deferred until
   * the next `sendText(..., last: true)` flush. This gives the LLM's
   * streaming farewell a chance to reach TTS before Twilio hangs up —
   * today's race produces mid-sentence cutoffs.
   */
  private pendingTerminalMessage: OutgoingMessage | null = null;

  constructor(opts: ConversationRelaySessionOptions) {
    this.ws = opts.ws;
    this.logger = opts.logger;
    this.toolRegistry = opts.toolRegistry;
    this.callbacks = opts.callbacks;

    this.callSid = opts.setup.callSid as CallSid;
    this.from = opts.setup.from;
    this.to = opts.setup.to;
    this.startedAt = new Date();
    this.customParameters = opts.setup.customParameters;

    if (opts.silenceTemplate) {
      this._silenceHandler = this.buildSilenceHandler(opts.silenceTemplate);
      this._silenceHandler.reset();
    }
  }

  // ===========================================================================
  // Public accessors — keep fields internal, expose what callers need
  // ===========================================================================

  public isListenMode(): boolean {
    return this._listenMode;
  }

  public getSuppressedMessageCount(): number {
    return this._suppressedCount;
  }

  public get silenceHandler(): SilenceHandler | undefined {
    return this._silenceHandler;
  }

  // ===========================================================================
  // Incoming frames — dispatched by the manager after setup
  // ===========================================================================

  /**
   * Dispatch a validated incoming frame (post-setup) to the session.
   * The manager owns `ws.on('message')` and does schema validation; this
   * method fans out to callbacks and resets the silence timer on signal-
   * of-life events.
   */
  public handleIncomingFrame(message: WebSocketMessage): void {
    switch (message.type) {
      case 'prompt':
        this._silenceHandler?.reset();
        this.callbacks.onPrompt?.(this, message.voicePrompt, message);
        break;
      case 'interrupt':
        this._silenceHandler?.reset();
        this.callbacks.onInterrupt?.(this, message);
        break;
      case 'dtmf':
        this._silenceHandler?.reset();
        this.callbacks.onDtmf?.(this, message);
        break;
      case 'info':
        this.callbacks.onInfo?.(this, message);
        break;
      case 'error': {
        const err = new Error(message.description ?? 'ConversationRelay error');
        this.callbacks.onError?.(this, err);
        break;
      }
      case 'setup':
        // Second setup on the same ws — ignore, we already bound this session.
        break;
      default:
        this.logger.warn({ call_sid: this.callSid, message }, 'Unhandled CR message type');
    }
  }

  // ===========================================================================
  // Listen mode
  // ===========================================================================

  /**
   * Toggle listen-mode. When enabled, outgoing speech-equivalent messages
   * (`text`, `play`, `language`) are suppressed; DTMF and end-call still work.
   * Also interlocks with the silence handler: enabling listen-mode pauses
   * silence monitoring; disabling re-enables and resets from zero.
   */
  public setListenMode(enabled: boolean): void {
    this._listenMode = enabled;

    if (this._silenceHandler) {
      if (enabled) {
        this._silenceHandler.setEnabled(false);
      } else {
        this._silenceHandler.setEnabled(true);
        this._silenceHandler.reset();
      }
    }

    this.logger.info(
      { call_sid: this.callSid, listen_mode: enabled },
      `Listen-mode ${enabled ? 'enabled' : 'disabled'}`
    );
  }

  // ===========================================================================
  // Outgoing — the single path back to Twilio for this session
  // ===========================================================================

  /**
   * Ship a validated `OutgoingMessage` to Twilio via this session's ws.
   * Listen-mode gating: when enabled, `text`/`play`/`language` are suppressed
   * and `suppressedCount` is incremented. `sendDigits` and `end` are never
   * suppressed.
   */
  public sendResponse(message: OutgoingMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(
        `WebSocket not open for CallSid: ${this.callSid} (state: ${this.ws.readyState})`
      );
    }

    if (this._listenMode && LISTEN_MODE_GATED_TYPES.has(message.type)) {
      this._suppressedCount += 1;
      this.logger.debug(
        {
          call_sid: this.callSid,
          message_type: message.type,
          suppressed_count: this._suppressedCount,
        },
        'Outgoing message suppressed (listen mode)'
      );
      return;
    }

    this.ws.send(JSON.stringify(message));
    this.logger.debug({ call_sid: this.callSid, message_type: message.type }, 'Sent CR message');
  }

  /**
   * Send a text token to Twilio TTS. When `last` is true and a terminal
   * frame is stashed (from a prior `executeTool`), flush the terminal
   * *after* the text. Listen-mode suppression still applies to the text
   * frame; the terminal frame (`end`) is never suppressed and always fires.
   */
  public sendText(token: string, last = true): void {
    this.sendResponse({ type: 'text', token, last });

    if (last && this.pendingTerminalMessage) {
      const terminal = this.pendingTerminalMessage;
      this.pendingTerminalMessage = null;
      this.logger.debug(
        { call_sid: this.callSid, message_type: terminal.type },
        'Flushing deferred terminal message after last text token'
      );
      this.sendResponse(terminal);
    }
  }

  public sendDigits(digits: string): void {
    this.sendResponse({ type: 'sendDigits', digits });
  }

  public sendPlay(
    source: string,
    options?: { loop?: number; interruptible?: boolean; preemptible?: boolean }
  ): void {
    this.sendResponse({ type: 'play', source, ...options });
  }

  public switchLanguage(options: { ttsLanguage?: string; transcriptionLanguage?: string }): void {
    this.sendResponse({ type: 'language', ...options });
  }

  /**
   * End the call with optional handoff data. Bypasses terminal deferral —
   * callers who invoke this directly are asking for immediate hangup.
   */
  public endCall(handoffData?: Record<string, unknown>): void {
    this.sendResponse({
      type: 'end',
      handoffData: handoffData ? JSON.stringify(handoffData) : undefined,
    });
  }

  // ===========================================================================
  // Tool dispatch
  // ===========================================================================

  /**
   * Execute a registered tool against this session. Result conventions:
   *
   *   - `outgoingMessage`: validated and shipped. Terminal `type: 'end'`
   *     frames are stashed for deferred flush after the next
   *     `sendText(..., last: true)` — this prevents Twilio from hanging up
   *     mid-farewell. All other types ship immediately.
   *   - `listenMode: boolean`: applied via `setListenMode`.
   *   - `silenceEnabled: boolean`: applied against the per-session silence
   *     handler (on enable, also resets the timer). No-op for sessions
   *     without a silence handler.
   *
   * @throws if the tool is not registered or produces an invalid
   *   `outgoingMessage`.
   */
  public async executeTool(name: string, args: unknown): Promise<unknown> {
    const tool = this.toolRegistry.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.implementation(args);

    this.applyOutgoingMessageConvention(name, result);
    this.applyListenModeConvention(result);
    this.applySilenceConvention(result);

    return result;
  }

  private applyOutgoingMessageConvention(name: string, result: unknown): void {
    if (
      result === null ||
      typeof result !== 'object' ||
      !('outgoingMessage' in result) ||
      (result as { outgoingMessage?: unknown }).outgoingMessage === undefined
    ) {
      return;
    }

    const candidate = (result as { outgoingMessage: unknown }).outgoingMessage;
    const validated = OutgoingMessageSchema.safeParse(candidate);
    if (!validated.success) {
      this.logger.error(
        { tool: name, errors: validated.error.errors, outgoingMessage: candidate },
        'Tool produced invalid outgoingMessage — not shipping'
      );
      throw new Error(`Tool '${name}' produced invalid outgoingMessage`);
    }

    if (validated.data.type === 'end') {
      this.pendingTerminalMessage = validated.data;
      this.logger.debug(
        { call_sid: this.callSid, tool: name },
        'Deferring terminal message until next last-text flush'
      );
      return;
    }

    this.sendResponse(validated.data);
  }

  private applyListenModeConvention(result: unknown): void {
    if (
      result !== null &&
      typeof result === 'object' &&
      'listenMode' in result &&
      typeof (result as { listenMode?: unknown }).listenMode === 'boolean'
    ) {
      this.setListenMode((result as { listenMode: boolean }).listenMode);
    }
  }

  private applySilenceConvention(result: unknown): void {
    if (
      result === null ||
      typeof result !== 'object' ||
      !('silenceEnabled' in result) ||
      typeof (result as { silenceEnabled?: unknown }).silenceEnabled !== 'boolean'
    ) {
      return;
    }

    const enabled = (result as { silenceEnabled: boolean }).silenceEnabled;
    if (!this._silenceHandler) {
      this.logger.debug(
        { call_sid: this.callSid, silence_enabled: enabled },
        'silenceEnabled result had no effect — no silence handler on this session'
      );
      return;
    }
    this._silenceHandler.setEnabled(enabled);
    if (enabled) {
      this._silenceHandler.reset();
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Handle ws close. Stops the silence handler. The manager handles
   * registry removal and `onSessionEnded` callback dispatch.
   */
  public handleClose(): void {
    this._silenceHandler?.stop();
  }

  /** Force-close the ws. Used by `ConversationRelay.shutdown()`. */
  public close(): void {
    this._silenceHandler?.stop();
    this.ws.close();
  }

  /** Read-only access to the raw ws — for diagnostics / tests. */
  public getWebSocket(): WebSocket {
    return this.ws;
  }

  /** @internal Used by the manager to detect non-Buffer frames in the raw listener. */
  public static isBuffer(data: RawData): data is Buffer {
    return Buffer.isBuffer(data);
  }

  // ===========================================================================
  // Silence handler factory
  // ===========================================================================

  private buildSilenceHandler(template: SilenceConfig): SilenceHandler {
    const reminders: string[] = ['Are you still there?', ...(template.additionalPrompts ?? [])];
    const thresholdSeconds = template.thresholdSeconds ?? 20;

    return new SilenceHandler(
      {
        thresholdSeconds,
        reminders,
        onReminder: (reminder: string): void => {
          this.sendText(reminder, true);
        },
        onTerminate: (): void => {
          this.endCall({
            reasonCode: 'unresponsive',
            reason: 'The caller was not speaking',
          });
        },
      },
      this.logger
    );
  }
}
