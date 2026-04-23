import Fastify, {
  FastifyInstance,
  FastifyServerOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import gracefulShutdown from 'fastify-graceful-shutdown';
import type { WebSocket } from 'ws';
import twilio from 'twilio';

import {
  VoiceServerConfig,
  VoiceServerConfigSchema,
  TAC,
  VoiceChannel,
  SMSChannel,
  ChatChannel,
  type Channel,
} from '@twilio/tac-core';
import {
  type ConversationRelayCallbackPayload,
  ConversationRelayCallbackPayloadSchema,
  type ConversationRelayConfig,
} from '@twilio/tac-conversationrelay';

/**
 * Server configuration options
 */
export interface TACServerConfig {
  /** Fastify server options (ignored if `fastifyInstance` is provided) */
  fastify?: FastifyServerOptions;

  /**
   * Pre-configured Fastify instance to mount TAC routes onto.
   *
   * Use this to control construction-time settings (logger, `trustProxy`,
   * schema, ...) or to register your own plugins/hooks before TAC's
   * routes are set up. If provided, the `fastify` options field is
   * ignored.
   */
  fastifyInstance?: FastifyInstance;

  /** Voice server configuration */
  voice?: Partial<VoiceServerConfig>;

  /** Custom webhook paths */
  webhookPaths?: {
    messaging?: string;
    twiml?: string;
    ws?: string;
    conversationRelayCallback?: string;
    /** Path for Conversation Intelligence webhook (optional - only registered if provided) */
    cintel?: string;
  };

  /** ConversationRelay configuration (welcomeGreeting, transcription, TTS, interaction settings, etc.) */
  conversationRelayConfig?: Partial<Omit<ConversationRelayConfig, 'url'>>;

  /** Handler for voice handoff requests (returns TwiML string) */
  handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>;

  /** Enable development features */
  development?: boolean;

  /** Voice channel instance (alternative to registering on TAC) */
  voiceChannel?: VoiceChannel;

  /**
   * Channels consuming Conversation Orchestrator webhooks (SMS, Chat, and
   * passive Voice). Webhooks are fanned out to every channel in this list;
   * each channel's `processWebhook` self-filters on `author.channel`.
   *
   * Alternative to registering channels on TAC — provide this array to
   * override TAC's channel registry for server-level fan-out.
   */
  conversationChannels?: Channel[];
}

/**
 * Default server configuration
 */
const DEFAULT_CONFIG = {
  voice: {
    host: '0.0.0.0',
    port: 3000,
  },
  webhookPaths: {
    messaging: '/webhook',
    twiml: '/twiml',
    ws: '/ws',
    conversationRelayCallback: '/conversation-relay-callback',
  },
  conversationRelayConfig: {
    welcomeGreeting: 'Hello! Set up your welcome greeting in the server config.',
  },
  development: false,
} satisfies Omit<
  TACServerConfig,
  'fastify' | 'fastifyInstance' | 'handoffHandler' | 'voiceChannel' | 'conversationChannels'
>;

/**
 * Batteries-included Fastify server for TAC
 *
 * Provides out-of-the-box setup for SMS and Voice channels with
 * proper webhook handling, WebSocket support, and production-ready defaults.
 *
 * Customization:
 *   - Pass your own Fastify instance via `config.fastifyInstance` to control
 *     construction-time settings (logger, `trustProxy`, schema, ...) and to
 *     register plugins/hooks before TAC's routes are set up.
 *   - Or mutate `server.fastify` after construction to add routes,
 *     decorators, or hooks — before calling `start()`.
 *
 * Example:
 *   import Fastify from 'fastify';
 *
 *   const app = Fastify({ logger: true, trustProxy: true });
 *   const server = new TACServer(tac, { fastifyInstance: app });
 *
 *   server.fastify.get('/health', async () => ({ status: 'ok' }));
 *
 *   await server.start();
 */
export class TACServer {
  public readonly fastify: FastifyInstance;
  private readonly tac: TAC;
  private readonly config: Required<
    Omit<
      TACServerConfig,
      'fastify' | 'fastifyInstance' | 'handoffHandler' | 'voiceChannel' | 'conversationChannels'
    >
  > & {
    handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>;
  };
  /** Channels consuming Conversation Orchestrator webhooks — fanned out on POST /webhook */
  private readonly conversationChannels: Channel[];
  /** Voice channel instance */
  private readonly voiceChannel: VoiceChannel | undefined;

  constructor(tac: TAC, config: TACServerConfig = {}) {
    this.tac = tac;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // Deep merge webhookPaths to preserve defaults while allowing overrides
      webhookPaths: {
        ...DEFAULT_CONFIG.webhookPaths,
        ...config.webhookPaths,
      },
      // Deep merge conversationRelayConfig to preserve defaults while allowing overrides
      conversationRelayConfig: {
        ...DEFAULT_CONFIG.conversationRelayConfig,
        ...config.conversationRelayConfig,
      },
    };

    // Resolve channels (always VoiceChannel + SMS + Chat with Maestro)
    this.voiceChannel = config.voiceChannel ?? tac.getChannel<VoiceChannel>('voice');
    this.conversationChannels =
      config.conversationChannels ??
      (
        [tac.getChannel<SMSChannel>('sms'), tac.getChannel<ChatChannel>('chat')] as (
          | Channel
          | undefined
        )[]
      ).filter((ch): ch is Channel => ch != null);

    if (this.conversationChannels.length === 0) {
      this.tac.logger.warn(
        'TACServer: No conversation channels (SMS/Chat) configured. Messaging webhooks will not be registered. ' +
          'Register a channel with tac.registerChannel() before creating TACServer to enable SMS/Chat.'
      );
    }

    // Use the user-supplied Fastify instance if provided; otherwise create
    // a default one with Pino logging.
    if (config.fastifyInstance) {
      this.fastify = config.fastifyInstance;
    } else {
      this.fastify = Fastify({
        logger: this.config.development
          ? {
              level: process.env.TWILIO_LOG_LEVEL || 'info',
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                },
              },
            }
          : {
              level: process.env.TWILIO_LOG_LEVEL || 'info',
            },
        ...config.fastify,
      });
    }
  }

  /**
   * Get the full URL for webhook validation
   * Handles X-Forwarded-* headers for proxy/ngrok scenarios
   */
  private getWebhookUrl(request: FastifyRequest): string {
    const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
    const host = (request.headers['x-forwarded-host'] as string) || request.headers.host || '';
    return `${proto}://${host}${request.url}`;
  }

  /**
   * Register global Twilio webhook signature validation hook
   */
  private registerWebhookValidation(): void {
    this.fastify.addHook('preHandler', (request, reply, done): void => {
      // Skip GET requests — WebSocket upgrades are validated in the route handler
      if (request.method === 'GET') {
        done();
        return;
      }

      const signature = request.headers['x-twilio-signature'] as string;
      const url = this.getWebhookUrl(request);
      const authToken = this.tac.getConfig().authToken;

      let isValid: boolean;

      // Check if this is a JSON body webhook (has bodySHA256 in query string)
      if (request.url.includes('bodySHA256=')) {
        // JSON body validation - use raw body string
        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        isValid = twilio.validateRequestWithBody(authToken, signature, url, body);
      } else {
        // Form-encoded validation - use parsed params
        const params = (request.body as Record<string, string>) || {};
        isValid = twilio.validateRequest(authToken, signature, url, params);
      }

      if (!isValid) {
        this.fastify.log.warn(
          { url, hasSignature: !!signature },
          'Invalid Twilio webhook signature'
        );
        void reply.code(403).send({ error: 'Invalid webhook signature' });
        done();
        return;
      }

      done();
    });
  }

  /**
   * Setup routes — registers all routes for conversation mode (voice + messaging + optional cintel).
   */
  private async setupRoutes(): Promise<void> {
    // ── Voice / CR routes ──────────────────────────────────────────
    // Voice webhook (POST - Twilio calls this when an incoming call arrives)
    this.fastify.post(
      this.config.webhookPaths.twiml || '/twiml',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const formData = request.body as Record<string, string>;
          const callSid = formData['CallSid'] || '';
          const fromNumber = formData['From'] || '';
          const toNumber = formData['To'] || '';

          const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
          const host = request.headers.host as string;
          const websocketUrl = `${protocol === 'https' ? 'wss' : 'ws'}://${host}${this.config.webhookPaths.ws || '/ws'}`;
          const callbackUrl = `${protocol}://${host}${this.config.webhookPaths.conversationRelayCallback || '/conversation-relay-callback'}`;

          if (!this.voiceChannel) {
            await reply.code(500).send({ error: 'Voice channel not available' });
            return;
          }

          const twiml = await this.voiceChannel.handleIncomingCall({
            toNumber,
            fromNumber,
            callSid,
            actionUrl: callbackUrl,
            conversationRelayConfig: {
              url: websocketUrl,
              ...this.config.conversationRelayConfig,
            },
          });

          await reply.type('application/xml').send(twiml);
        } catch (error) {
          this.fastify.log.error(
            'TwiML generation error: ' + (error instanceof Error ? error.message : String(error))
          );
          await reply.code(500).send({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    // ConversationRelay callback endpoint
    this.fastify.post(
      this.config.webhookPaths.conversationRelayCallback || '/conversation-relay-callback',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          if (!this.voiceChannel) {
            await reply.code(500).send({ error: 'Voice channel not available' });
            return;
          }

          const formData = request.body as Record<string, string>;
          const parseResult = ConversationRelayCallbackPayloadSchema.safeParse(formData);

          if (!parseResult.success) {
            this.fastify.log.error(
              { errors: parseResult.error.errors },
              'Invalid ConversationRelay callback payload'
            );
            await reply.code(400).send({ error: 'Invalid payload' });
            return;
          }

          const result = await this.voiceChannel.handleConversationRelayCallback(
            parseResult.data,
            this.config.handoffHandler
          );

          await reply.code(result.status).type(result.contentType).send(result.content);
        } catch (error) {
          this.fastify.log.error(
            'ConversationRelay callback error: ' +
              (error instanceof Error ? error.message : String(error))
          );
          await reply.code(500).send({ error: 'Internal server error' });
        }
      }
    );

    // Voice WebSocket endpoint
    await this.fastify.register(fastify => {
      fastify.get(
        this.config.webhookPaths.ws || '/ws',
        { websocket: true },
        (socket: WebSocket, request: FastifyRequest) => {
          const signature = request.headers['x-twilio-signature'] as string;
          const url = this.getWebhookUrl(request);
          const authToken = this.tac.getConfig().authToken;
          const isValid = twilio.validateRequest(authToken, signature, url, {});

          if (!isValid) {
            this.fastify.log.warn(
              { url, hasSignature: !!signature },
              'WebSocket connection rejected: invalid Twilio signature'
            );
            socket.close(1008, 'Invalid signature');
            return;
          }

          if (!this.voiceChannel) {
            socket.terminate();
            return;
          }

          this.voiceChannel.handleWebSocketConnection(socket);
        }
      );
    });

    // ── Messaging webhook ─────────────────────────────────────────
    if (this.conversationChannels.length > 0) {
      this.fastify.post(
        this.config.webhookPaths.messaging || '/webhook',
        async (request: FastifyRequest, reply: FastifyReply) => {
          const rawHeader = request.headers['i-twilio-idempotency-token'];
          const idempotencyToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
          for (const channel of this.conversationChannels) {
            channel.processWebhook?.(request.body, idempotencyToken).catch((err: unknown) => {
              this.fastify.log.error(
                { err, channel: channel.channelType },
                'Conversation webhook processing error'
              );
            });
          }
          await reply.code(200).send({ status: 'ok' });
        }
      );
    }

    // ── Conversation Intelligence webhook (optional) ──────────────
    if (this.config.webhookPaths.cintel) {
      this.fastify.post(
        this.config.webhookPaths.cintel,
        async (request: FastifyRequest, reply: FastifyReply) => {
          if (!this.tac.isCintelEnabled()) {
            await reply.code(400).send({
              error: 'Conversation Intelligence is not enabled',
              message:
                'Set TWILIO_TAC_CI_CONFIGURATION_ID and memory credentials to enable CI processing',
            });
            return;
          }

          try {
            this.fastify.log.info('Processing Conversation Intelligence webhook');
            const result = await this.tac.processCintelEvent(request.body);

            if (result.success) {
              if (result.skipped) {
                this.fastify.log.debug({ reason: result.skipReason }, 'CI event skipped');
              } else {
                this.fastify.log.info(
                  { eventType: result.eventType, createdCount: result.createdCount },
                  'CI event processed'
                );
              }
            } else {
              this.fastify.log.error({ error: result.error }, 'CI event processing failed');
            }

            await reply.send(result);
          } catch (error) {
            this.fastify.log.error(
              'CI webhook error: ' + (error instanceof Error ? error.message : String(error))
            );
            await reply.code(500).send({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      );
    }
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Register required plugins, guarding against users who pre-registered
      // them on a supplied `fastifyInstance` (duplicate registration throws).
      if (!this.fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
        await this.fastify.register(formbody);
      }
      if (!this.fastify.hasDecorator('websocketServer')) {
        await this.fastify.register(websocket);
      }
      if (!this.fastify.hasDecorator('gracefulShutdown')) {
        await this.fastify.register(gracefulShutdown);
      }

      // Register webhook signature validation (must be after formbody for body access)
      this.registerWebhookValidation();

      // Set up routes (must be after plugin registration)
      await this.setupRoutes();

      // Configure graceful shutdown. Force-close channel WebSockets first so the
      // wait loop below exits on its next tick instead of hanging up to 30s on
      // long-lived Twilio CR connections.
      this.fastify.gracefulShutdown(async (signal: string) => {
        this.fastify.log.info({ signal }, 'Received shutdown signal');
        this.tac.shutdown();
        await this.waitForWebSocketsToClose();
      });

      // Start Fastify server
      const voiceConfig = VoiceServerConfigSchema.parse(this.config.voice);
      await this.fastify.listen({
        host: voiceConfig.host,
        port: voiceConfig.port,
      });

      // Read the actual bound port (port 0 asks the OS for an ephemeral port,
      // so voiceConfig.port would log `0` instead of the real port number).
      const address = this.fastify.server.address();
      const boundPort = typeof address === 'object' && address ? address.port : voiceConfig.port;

      this.fastify.log.info(
        {
          host: voiceConfig.host,
          port: boundPort,
          twiml_webhook: this.config.webhookPaths.twiml,
          ws_websocket: this.config.webhookPaths.ws,
          conversation_relay_callback: this.config.webhookPaths.conversationRelayCallback,
          messaging_webhook: this.config.webhookPaths.messaging,
          ...(this.config.webhookPaths.cintel && {
            cintel_webhook: this.config.webhookPaths.cintel,
          }),
        },
        'TAC Server started'
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to start TAC Server');
      throw error;
    }
  }

  /**
   * Wait for all WebSocket connections to close
   */
  private async waitForWebSocketsToClose(timeoutMs = 30000): Promise<void> {
    const wsServer = this.fastify.websocketServer;
    if (!wsServer || wsServer.clients.size === 0) {
      return;
    }

    this.fastify.log.info(
      { websocket_count: wsServer.clients.size },
      'Waiting for WebSocket connections to close...'
    );

    const startTime = Date.now();

    return new Promise<void>(resolve => {
      const checkInterval = setInterval(() => {
        const clientCount = wsServer.clients.size;

        if (clientCount === 0) {
          clearInterval(checkInterval);
          this.fastify.log.info('All WebSocket connections closed');
          resolve();
          return;
        }

        // Check for timeout
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(checkInterval);
          this.fastify.log.warn(
            { remaining_websockets: clientCount },
            'Timeout waiting for WebSockets to close, proceeding with shutdown'
          );
          resolve();
          return;
        }

        this.fastify.log.info(
          { remaining_websockets: clientCount },
          'Waiting for WebSockets to close...'
        );
      }, 5000);
    });
  }

  /**
   * Stop the server gracefully
   */
  public async stop(): Promise<void> {
    try {
      await this.fastify.close();
      this.fastify.log.info('TAC Server stopped');
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Error stopping TAC Server');
      throw error;
    }
  }
}
