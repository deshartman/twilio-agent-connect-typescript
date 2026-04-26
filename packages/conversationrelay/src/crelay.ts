/**
 * ConversationRelay — Twilio ConversationRelay Voice Handler
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

import { WebSocket, type RawData } from 'ws';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import { createLogger, type Logger } from './lib/logger';
import {
  type CallSid,
  type CRelaySession,
  type SetupMessage,
  type PromptMessage,
  type InterruptMessage,
  type DtmfMessage,
  type InfoMessage,
  type OutgoingMessage,
  type ConversationRelayConfig,
  type CustomParameters,
  ConversationRelayConfigSchema,
  CustomParametersSchema,
  OutgoingMessageSchema,
  WebSocketMessageSchema,
} from './types';

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
import { CRTool } from './lib/define-tool';
import {
  playMediaTool,
  sendDigitsTool,
  switchLanguageTool,
  endCallTool,
  setListenModeTool,
} from './tools/index';
import { SilenceHandler } from './lib/silence-handler';

// =============================================================================
// Constructor Configuration
// =============================================================================

/**
 * Silence-handling config supplied at `ConversationRelay` construction.
 * Absent = silence handling disabled (no per-session handler constructed).
 * Present = a `SilenceHandler` is constructed for each session on setup,
 * using this as a template.
 *
 * Reminder sequence is always `['Are you still there?', ...additionalPrompts]`.
 * The terminal reminder's breach ends the call via `endCall` with
 * `{ reasonCode: 'unresponsive', reason: 'The caller was not speaking' }`.
 */
export interface SilenceConfig {
  /** Seconds of silence before a reminder fires. Default: 20. */
  thresholdSeconds?: number;
  /** Up to 2 custom prompts appended after the default "Are you still there?". */
  additionalPrompts?: [string] | [string, string];
}

/**
 * Optional config for `new ConversationRelay(logger, config)`.
 */
export interface ConversationRelayConstructorConfig {
  silence?: SilenceConfig;
}

// =============================================================================
// Callback Types
// =============================================================================

type SessionStartedCallback = (callSid: CallSid, session: CRelaySession, data: SetupMessage) => void;
type PromptCallback = (callSid: CallSid, message: string, data: PromptMessage) => void;
type InterruptCallback = (callSid: CallSid, data: InterruptMessage) => void;
type DtmfCallback = (callSid: CallSid, data: DtmfMessage) => void;
type InfoCallback = (callSid: CallSid, data: InfoMessage) => void;
type SessionEndedCallback = (callSid: CallSid) => void;
type ErrorCallback = (callSid: CallSid, error: Error) => void;

/**
 * ConversationRelay — Twilio ConversationRelay voice handler
 *
 * Manages WebSocket connections, session lifecycle, and event routing
 * for the Twilio ConversationRelay protocol.
 */
export class ConversationRelay {
  private readonly logger: Logger;
  private readonly connections: Map<CallSid, WebSocket>;
  private readonly sessions: Map<CallSid, CRelaySession>;
  private readonly tools: Map<string, CRTool>;
  private readonly silenceTemplate: SilenceConfig | undefined;
  private readonly callbacks: {
    onSessionStarted?: SessionStartedCallback;
    onPrompt?: PromptCallback;
    onInterrupt?: InterruptCallback;
    onDtmf?: DtmfCallback;
    onInfo?: InfoCallback;
    onSessionEnded?: SessionEndedCallback;
    onError?: ErrorCallback;
  };

  constructor(logger?: Logger, config?: ConversationRelayConstructorConfig) {
    this.logger = logger ?? createLogger({ name: 'conversation-relay' });
    this.connections = new Map();
    this.sessions = new Map();
    this.callbacks = {};
    this.silenceTemplate = config?.silence;

    // Auto-register built-in tools. Users can remove any via unregisterTool().
    // Protocol tools ship an outgoingMessage; setListenModeTool mutates session
    // state via the listenMode result-convention (see executeTool).
    this.tools = new Map();
    const builtIns = [
      playMediaTool,
      sendDigitsTool,
      switchLanguageTool,
      endCallTool,
      setListenModeTool,
    ];
    for (const tool of builtIns) {
      this.tools.set(tool.name, tool as unknown as CRTool);
    }
  }

  // ===========================================================================
  // Callback Registration
  // ===========================================================================

  /** Register callback for session started (setup message received) */
  public onSessionStarted(callback: SessionStartedCallback): void {
    this.callbacks.onSessionStarted = callback;
  }

  /** Register callback for user prompt (transcribed speech from the caller) */
  public onPrompt(callback: PromptCallback): void {
    this.callbacks.onPrompt = callback;
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
  // Tool Registry
  // ===========================================================================

  /** Register an additional tool. Overwrites any tool with the same name. */
  public registerTool(tool: CRTool): void {
    this.tools.set(tool.name, tool);
  }

  /** Unregister a tool by name. */
  public unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  /**
   * List all registered tools (built-in protocol tools + user-registered).
   * Feed the results into your LLM via `tool.toOpenAIFormat()` / `toAnthropicFormat()`.
   */
  public listTools(): CRTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a registered tool by name. The tool result may trigger side
   * effects on CR via one of two result-convention fields:
   *
   *   - `outgoingMessage: OutgoingMessage` — validated and shipped via
   *     `sendResponse` (used by playMediaTool, sendDigitsTool,
   *     switchLanguageTool, endCallTool).
   *   - `listenMode: boolean` — applied via `setListenMode(callSid, ...)`
   *     (used by setListenModeTool).
   *
   * The tool result is returned so the caller can feed it back to the LLM
   * loop. Tools that need neither side effect return their own plain result.
   *
   * @throws if the tool is not registered or if an `outgoingMessage` fails
   *   schema validation.
   */
  public async executeTool(callSid: CallSid, name: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.implementation(args);

    if (
      result !== null &&
      typeof result === 'object' &&
      'outgoingMessage' in result &&
      (result as { outgoingMessage?: unknown }).outgoingMessage !== undefined
    ) {
      const candidate = (result as { outgoingMessage: unknown }).outgoingMessage;
      const validated = OutgoingMessageSchema.safeParse(candidate);
      if (!validated.success) {
        this.logger.error(
          { tool: name, errors: validated.error.errors, outgoingMessage: candidate },
          'Tool produced invalid outgoingMessage — not shipping'
        );
        throw new Error(`Tool '${name}' produced invalid outgoingMessage`);
      }
      this.sendResponse(callSid, validated.data);
    }

    if (
      result !== null &&
      typeof result === 'object' &&
      'listenMode' in result &&
      typeof (result as { listenMode?: unknown }).listenMode === 'boolean'
    ) {
      const enabled = (result as { listenMode: boolean }).listenMode;
      this.setListenMode(callSid, enabled);
    }

    return result;
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

    /**
     * Handle incoming WebSocket messages from Twilio ConversationRelay.
     *
     * Note: The ws library types data as RawData = Buffer | ArrayBuffer | Buffer[].
     * Twilio ConversationRelay always sends Buffer in practice. We validate this
     * with a type guard and log an error if we ever receive other types.
     *
     * Reference: https://github.com/websockets/ws - see RawData type definition
     */
    ws.on('message', (data: RawData) => {
      try {
        // Type guard: Twilio ConversationRelay sends Buffer
        if (!Buffer.isBuffer(data)) {
          this.logger.error(
            {
              data_type: data instanceof ArrayBuffer ? 'ArrayBuffer' : 'Buffer[]',
              call_sid: callSid
            },
            'Unexpected WebSocket data type - expected Buffer from ConversationRelay'
          );
          return;
        }

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

            // Create session. `silenceHandler` is attached below if the
            // constructor was given a silence template.
            const session: CRelaySession = {
              callSid,
              from: message.from,
              to: message.to,
              startedAt: new Date(),
              customParameters: message.customParameters,
              listenMode: false,
              suppressedCount: 0,
            };
            this.sessions.set(callSid, session);

            if (this.silenceTemplate) {
              session.silenceHandler = this.createSilenceHandler(callSid);
              session.silenceHandler.reset();
            }

            this.callbacks.onSessionStarted?.(callSid, session, message);
            break;
          }

          case 'prompt':
            if (callSid) {
              this.sessions.get(callSid)?.silenceHandler?.reset();
              this.callbacks.onPrompt?.(callSid, message.voicePrompt, message);
            }
            break;

          case 'interrupt':
            if (callSid) {
              this.sessions.get(callSid)?.silenceHandler?.reset();
              this.callbacks.onInterrupt?.(callSid, message);
            }
            break;

          case 'dtmf':
            if (callSid) {
              this.sessions.get(callSid)?.silenceHandler?.reset();
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
        this.sessions.get(callSid)?.silenceHandler?.stop();
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
  // Listen Mode
  // ===========================================================================

  /**
   * Toggle listen-mode for a session. When enabled, outgoing speech-equivalent
   * messages (`text`, `play`, `language`) are suppressed for this CallSid;
   * DTMF and end-call still work. Typical use: outbound IVR navigation where
   * the agent listens for a human before speaking.
   *
   * No-op (with a debug log) if no session exists for the CallSid — common
   * during call-end races.
   */
  public setListenMode(callSid: CallSid, enabled: boolean): void {
    const session = this.sessions.get(callSid);
    if (!session) {
      this.logger.debug(
        { call_sid: callSid, enabled },
        'setListenMode called for unknown CallSid — ignoring'
      );
      return;
    }
    session.listenMode = enabled;

    // Silence × listen-mode: listen-mode on → silence handler stops;
    // listen-mode off → silence handler re-enables and resets from zero.
    // (Decision A in the plan: fresh reset, not resume-from-paused.)
    if (session.silenceHandler) {
      if (enabled) {
        session.silenceHandler.setEnabled(false);
      } else {
        session.silenceHandler.setEnabled(true);
        session.silenceHandler.reset();
      }
    }

    this.logger.info(
      { call_sid: callSid, listen_mode: enabled },
      `Listen-mode ${enabled ? 'enabled' : 'disabled'}`
    );
  }

  /** Whether listen-mode is active for a CallSid. False if no session exists. */
  public isListenMode(callSid: CallSid): boolean {
    return this.sessions.get(callSid)?.listenMode ?? false;
  }

  /**
   * Count of messages suppressed by listen-mode on this session. Returns 0
   * for unknown CallSids. Primarily for tests and diagnostics.
   */
  public getSuppressedMessageCount(callSid: CallSid): number {
    return this.sessions.get(callSid)?.suppressedCount ?? 0;
  }

  // ===========================================================================
  // sendResponse — single path back to Twilio
  // ===========================================================================

  /**
   * Send a message to Twilio ConversationRelay via the session's WebSocket.
   * This is the single path back to Twilio for every outgoing protocol
   * frame — text tokens, play (media URL), sendDigits (DTMF), language
   * (TTS/STT switch), end (hang up).
   *
   * Listen-mode gating: when the session has listen-mode enabled, outgoing
   * speech-equivalent frames (`text`, `play`, `language`) are suppressed
   * and the session's `suppressedCount` is incremented. `sendDigits` and
   * `end` are never suppressed — DTMF navigation and termination must
   * always work.
   *
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#sending-messages-to-twilio
   */
  public sendResponse(callSid: CallSid, message: OutgoingMessage): void {
    const ws = this.connections.get(callSid);
    if (!ws) {
      throw new Error(`No WebSocket connection found for CallSid: ${callSid}`);
    }

    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not open for CallSid: ${callSid} (state: ${ws.readyState})`);
    }

    const session = this.sessions.get(callSid);
    if (session?.listenMode && LISTEN_MODE_GATED_TYPES.has(message.type)) {
      session.suppressedCount += 1;
      this.logger.debug(
        {
          call_sid: callSid,
          message_type: message.type,
          suppressed_count: session.suppressedCount,
        },
        'Outgoing message suppressed (listen mode)'
      );
      return;
    }

    ws.send(JSON.stringify(message));
    this.logger.debug({ call_sid: callSid, message_type: message.type }, 'Sent CR message');
  }

  // ===========================================================================
  // Typed senders — thin wrappers that build an OutgoingMessage and hand it
  // to `sendResponse`. Callers never touch protocol shape.
  // ===========================================================================

  /**
   * Send a text token to Twilio TTS.
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#text-message
   */
  public sendText(callSid: CallSid, token: string, last = true): void {
    this.sendResponse(callSid, { type: 'text', token, last });
  }

  /**
   * Send DTMF digits to the caller. Supports 0-9, `w` (500ms pause), `*`, `#`.
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#send-digits-message
   */
  public sendDigits(callSid: CallSid, digits: string): void {
    this.sendResponse(callSid, { type: 'sendDigits', digits });
  }

  /**
   * Play media from a URL to the caller.
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#play-message
   */
  public sendPlay(
    callSid: CallSid,
    source: string,
    options?: { loop?: number; interruptible?: boolean; preemptible?: boolean }
  ): void {
    this.sendResponse(callSid, { type: 'play', source, ...options });
  }

  /**
   * Switch TTS or transcription language mid-call.
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#language-message
   */
  public switchLanguage(
    callSid: CallSid,
    options: { ttsLanguage?: string; transcriptionLanguage?: string }
  ): void {
    this.sendResponse(callSid, { type: 'language', ...options });
  }

  /**
   * End the call with optional handoff data. Twilio expects `handoffData` as
   * a JSON string — the object is stringified here so callers pass a plain
   * object.
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#end-message
   */
  public endCall(callSid: CallSid, handoffData?: Record<string, unknown>): void {
    this.sendResponse(callSid, {
      type: 'end',
      handoffData: handoffData ? JSON.stringify(handoffData) : undefined,
    });
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
    const filteredConfig = ConversationRelay.filterUnsetValues(conversationRelayAttributes);

    // Build TwiML using SDK
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);

    // Add language configurations as child <Language> elements
    if (languages && languages.length > 0) {
      for (const lang of languages) {
        const filteredLang = ConversationRelay.filterUnsetValues(lang);
        relay.language(filteredLang);
      }
    }

    // Add custom parameters as child <Parameter> elements
    if (parameters) {
      for (const [name, value] of Object.entries(parameters)) {
        relay.parameter({ name, value });
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
  // Silence Handling — factory
  // ===========================================================================

  /**
   * Build a per-session `SilenceHandler` from `this.silenceTemplate`. Called
   * on CR `setup`. The handler's `onSilence` callback closes over the
   * CallSid and routes reminders through `sendText` (gateable by listen-mode
   * — though listen-mode also disables this handler entirely) and
   * terminal breach through `endCall`.
   */
  private createSilenceHandler(callSid: CallSid): SilenceHandler {
    const template = this.silenceTemplate;
    if (!template) {
      throw new Error('createSilenceHandler called without silence template');
    }

    const reminders: string[] = ['Are you still there?', ...(template.additionalPrompts ?? [])];
    const thresholdSeconds = template.thresholdSeconds ?? 20;

    return new SilenceHandler(
      {
        thresholdSeconds,
        reminders,
        onReminder: (reminder: string): void => {
          this.sendText(callSid, reminder, true);
        },
        onTerminate: (): void => {
          this.endCall(callSid, {
            reasonCode: 'unresponsive',
            reason: 'The caller was not speaking',
          });
        },
      },
      this.logger
    );
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
