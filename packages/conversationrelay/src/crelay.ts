/**
 * ConversationRelay — Twilio ConversationRelay protocol manager.
 *
 * Holds only what is genuinely shared across sessions or lifecycle-external:
 *   - `sessions: Map<CallSid, ConversationRelaySession>` — directory for
 *     out-of-band lookup (status callbacks, shutdown).
 *   - `toolRegistry: ToolRegistry` — tool definitions shared by every
 *     active call; registering a tool makes it available to all sessions.
 *   - `silenceTemplate?: SilenceConfig` — blueprint copied into each
 *     session's `SilenceHandler` on setup.
 *   - `callbacks` — subscriber fan-out registered by consumers
 *     (`ConversationRelayChannel` or standalone apps).
 *   - TwiML generation.
 *
 * The manager owns `ws.on('message' | 'close' | 'error')` for every
 * upgrade. On the first `setup` frame it constructs a
 * `ConversationRelaySession`, registers it, fires `onSessionStarted`, and
 * forwards subsequent frames to `session.handleIncomingFrame(...)`. No
 * listener transfer — one set of ws handlers, owned by the manager.
 *
 * NO dependency on @twilio/tac-core — completely standalone.
 */

import { WebSocket, type RawData } from 'ws';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';

import { createLogger, type Logger } from './lib/logger';
import {
  ConversationRelaySession,
  type SilenceConfig,
  type SessionCallbacks,
} from './lib/conversation-relay-session';
import { CONVERSATION_RELAY_TOOLS, ToolRegistry } from './lib/tool-registry';
import {
  type CallSid,
  type SetupMessage,
  type PromptMessage,
  type InterruptMessage,
  type DtmfMessage,
  type InfoMessage,
  type ConversationRelayConfig,
  type CustomParameters,
  ConversationRelayConfigSchema,
  CustomParametersSchema,
  WebSocketMessageSchema,
} from './types';

export type { SilenceConfig } from './lib/conversation-relay-session';

/**
 * Optional config for `new ConversationRelay(logger, config)`.
 *
 * - `silence`: enables per-session silence monitoring with the supplied
 *   threshold + additional prompts. Omit to disable silence handling entirely.
 * - `tools`: the shared `ToolRegistry`. Omit for a default registry populated
 *   with the seven `CONVERSATION_RELAY_TOOLS` built-ins.
 */
export interface ConversationRelayConstructorConfig {
  silence?: SilenceConfig;
  tools?: ToolRegistry;
}

// =============================================================================
// Callback Types
// =============================================================================

type SessionStartedCallback = (session: ConversationRelaySession, data: SetupMessage) => void;
type PromptCallback = (
  session: ConversationRelaySession,
  message: string,
  data: PromptMessage
) => void;
type InterruptCallback = (session: ConversationRelaySession, data: InterruptMessage) => void;
type DtmfCallback = (session: ConversationRelaySession, data: DtmfMessage) => void;
type InfoCallback = (session: ConversationRelaySession, data: InfoMessage) => void;
type SessionEndedCallback = (session: ConversationRelaySession) => void;
type ErrorCallback = (session: ConversationRelaySession, error: Error) => void;

export class ConversationRelay {
  private readonly logger: Logger;
  private readonly sessions: Map<CallSid, ConversationRelaySession>;
  private readonly toolRegistry: ToolRegistry;
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
    this.sessions = new Map();
    this.callbacks = {};
    this.silenceTemplate = config?.silence;
    this.toolRegistry = config?.tools ?? new ToolRegistry(CONVERSATION_RELAY_TOOLS);
  }

  // ===========================================================================
  // Callback Registration
  // ===========================================================================

  public onSessionStarted(callback: SessionStartedCallback): void {
    this.callbacks.onSessionStarted = callback;
  }

  public onPrompt(callback: PromptCallback): void {
    this.callbacks.onPrompt = callback;
  }

  public onInterrupt(callback: InterruptCallback): void {
    this.callbacks.onInterrupt = callback;
  }

  public onDtmf(callback: DtmfCallback): void {
    this.callbacks.onDtmf = callback;
  }

  public onInfo(callback: InfoCallback): void {
    this.callbacks.onInfo = callback;
  }

  public onSessionEnded(callback: SessionEndedCallback): void {
    this.callbacks.onSessionEnded = callback;
  }

  public onError(callback: ErrorCallback): void {
    this.callbacks.onError = callback;
  }

  // ===========================================================================
  // Tool registry accessor — for ConversationRelayChannel / app wiring
  // ===========================================================================

  /**
   * The shared tool registry. `ConversationRelayChannel` forwards `listTools()`
   * to this; standalone apps can read/register tools here before wiring the
   * CR server.
   */
  public getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // ===========================================================================
  // WebSocket Connection Handling
  // ===========================================================================

  /**
   * Handle incoming WebSocket connection from Twilio ConversationRelay.
   * The manager owns `ws.on(...)` for the lifetime of the session. On the
   * first `setup` frame, we construct a `ConversationRelaySession` and
   * forward subsequent frames to it.
   */
  public handleConnection(ws: WebSocket): void {
    let session: ConversationRelaySession | null = null;

    ws.on('message', (data: RawData) => {
      try {
        if (!Buffer.isBuffer(data)) {
          this.logger.error(
            {
              data_type: data instanceof ArrayBuffer ? 'ArrayBuffer' : 'Buffer[]',
              call_sid: session?.callSid,
            },
            'Unexpected WebSocket data type - expected Buffer from ConversationRelay'
          );
          return;
        }

        const messageText = data.toString();
        const messageData = JSON.parse(messageText) as unknown;

        this.logger.debug({ raw_message: messageData }, 'Received ConversationRelay message');

        const validated = WebSocketMessageSchema.safeParse(messageData);
        if (!validated.success) {
          this.logger.error(
            { validation_errors: validated.error.errors, raw_message: messageData },
            'Invalid ConversationRelay message'
          );
          return;
        }

        const message = validated.data;

        if (message.type === 'setup') {
          session = this.createSession(ws, message);
          this.callbacks.onSessionStarted?.(session, message);
          return;
        }

        if (!session) {
          this.logger.warn(
            { message_type: message.type },
            'Received non-setup frame before session was created — dropping'
          );
          return;
        }

        session.handleIncomingFrame(message);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          { err, call_sid: session?.callSid },
          'Error processing ConversationRelay message'
        );
        if (session) {
          this.callbacks.onError?.(session, err);
        }
      }
    });

    ws.on('close', () => {
      if (session) {
        session.handleClose();
        this.sessions.delete(session.callSid);
        this.logger.debug({ call_sid: session.callSid }, 'ConversationRelay WebSocket closed');
        this.callbacks.onSessionEnded?.(session);
      }
    });

    ws.on('error', (error: Error) => {
      this.logger.error(
        { err: error, call_sid: session?.callSid },
        'ConversationRelay WebSocket error'
      );
      if (session) {
        this.callbacks.onError?.(session, error);
      }
    });
  }

  private createSession(ws: WebSocket, setup: SetupMessage): ConversationRelaySession {
    const sessionCallbacks: SessionCallbacks = {
      onPrompt: (s, msg, data) => this.callbacks.onPrompt?.(s, msg, data as PromptMessage),
      onInterrupt: (s, data) => this.callbacks.onInterrupt?.(s, data as InterruptMessage),
      onDtmf: (s, data) => this.callbacks.onDtmf?.(s, data as DtmfMessage),
      onInfo: (s, data) => this.callbacks.onInfo?.(s, data as InfoMessage),
      onError: (s, err) => this.callbacks.onError?.(s, err),
    };

    const session = new ConversationRelaySession({
      ws,
      setup,
      toolRegistry: this.toolRegistry,
      logger: this.logger,
      silenceTemplate: this.silenceTemplate,
      callbacks: sessionCallbacks,
    });

    this.sessions.set(session.callSid, session);
    return session;
  }

  // ===========================================================================
  // Directory access — out-of-band callers (status webhooks, tests)
  // ===========================================================================

  /** Fetch the active session for a CallSid, or `undefined` if none. */
  public getSession(callSid: CallSid): ConversationRelaySession | undefined {
    return this.sessions.get(callSid);
  }

  /** Whether an active session exists for a CallSid. */
  public hasSession(callSid: CallSid): boolean {
    return this.sessions.has(callSid);
  }

  // ===========================================================================
  // TwiML Generation
  // ===========================================================================

  /**
   * Generate TwiML for a ConversationRelay connection.
   *
   * Produces a <Response><Connect><ConversationRelay> document with optional
   * <Parameter> child elements and <Language> configurations.
   */
  public generateTwiML(
    config: ConversationRelayConfig,
    parameters?: CustomParameters,
    options?: { actionUrl?: string }
  ): string {
    const validationResult = ConversationRelayConfigSchema.safeParse(config);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new Error(`Invalid ConversationRelay configuration: ${errorMessage}`);
    }
    const validatedConfig = validationResult.data;

    if (parameters) {
      const paramsValidation = CustomParametersSchema.safeParse(parameters);
      if (!paramsValidation.success) {
        const errorMessage = paramsValidation.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new Error(`Invalid custom parameters: ${errorMessage}`);
      }
    }

    const { languages, ...conversationRelayAttributes } = validatedConfig;
    const filteredConfig = ConversationRelay.filterUnsetValues(conversationRelayAttributes);

    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);

    if (languages && languages.length > 0) {
      for (const lang of languages) {
        const filteredLang = ConversationRelay.filterUnsetValues(lang);
        relay.language(filteredLang);
      }
    }

    if (parameters) {
      for (const [name, value] of Object.entries(parameters)) {
        relay.parameter({ name, value });
      }
    }

    return response.toString();
  }

  // ===========================================================================
  // Shutdown
  // ===========================================================================

  /** Close every session's ws and clear the registry. */
  public shutdown(): void {
    for (const session of this.sessions.values()) {
      session.close();
      this.logger.debug(
        { call_sid: session.callSid },
        'Shutdown: closed ConversationRelay connection'
      );
    }
    this.sessions.clear();
  }

  // ===========================================================================
  // Private Utilities
  // ===========================================================================

  private static filterUnsetValues<T extends Record<string, unknown>>(
    obj: T
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, value]) => value !== undefined && value !== null)
    );
  }
}
