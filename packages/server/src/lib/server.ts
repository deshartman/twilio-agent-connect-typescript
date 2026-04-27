import Fastify, {
  FastifyInstance,
  FastifyServerOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import formbody from '@fastify/formbody';
import gracefulShutdown from 'fastify-graceful-shutdown';

import { TAC, SMSChannel, ChatChannel, VoiceChannel, type Channel } from '@twilio/tac-core';
import { registerSignatureValidation, normalizePublicDomain } from '@twilio/tac-conversationrelay';

/**
 * Server configuration options
 *
 * TACServer handles Conversation Orchestrator (Maestro) webhooks only. Voice
 * routes (/twiml, /ws, /conversation-relay-callback) live on
 * `ConversationRelayServer` in `@twilio/tac-conversationrelay` — see the two-process
 * deployment story in the README.
 */
export interface TACServerConfig {
  /**
   * Public domain this server is reachable at (without scheme, e.g.
   * `tac-des.ngrok.dev` or `api.example.com`). Used to reconstruct the URL
   * Twilio signed webhooks against for signature validation.
   *
   * Required because load balancers (AWS ALB, GCP LB) and reverse proxies
   * (NGINX, Apache) routinely rewrite the `Host` header to internal backend
   * addresses; the old `x-forwarded-*` fallback was unreliable.
   *
   * Accepts either a bare host or a full `https://...` URL — values are
   * normalised via `normalizePublicDomain()`.
   */
  publicDomain: string;

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

  /** Server host (default: 0.0.0.0) */
  host?: string;

  /** Server port (default: 8000) */
  port?: number;

  /** Custom webhook paths */
  webhookPaths?: {
    messaging?: string;
    /** Path for Conversation Intelligence webhook (optional - only registered if provided) */
    cintel?: string;
  };

  /** Enable development features */
  development?: boolean;

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
  host: '0.0.0.0',
  port: 8000,
  webhookPaths: {
    messaging: '/webhook',
  },
  development: false,
} satisfies Omit<
  TACServerConfig,
  'fastify' | 'fastifyInstance' | 'conversationChannels' | 'publicDomain'
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
    Omit<TACServerConfig, 'fastify' | 'fastifyInstance' | 'conversationChannels'>
  >;
  /** Channels consuming Conversation Orchestrator webhooks — fanned out on POST /webhook */
  private readonly conversationChannels: Channel[];

  constructor(tac: TAC, config: TACServerConfig) {
    this.tac = tac;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      publicDomain: normalizePublicDomain(config.publicDomain),
      // Deep merge webhookPaths to preserve defaults while allowing overrides
      webhookPaths: {
        ...DEFAULT_CONFIG.webhookPaths,
        ...config.webhookPaths,
      },
    };

    // Fan-out channels for /webhook: SMS + Chat + passive Voice. All three
    // consume Maestro webhooks. `ConversationRelayChannel` is driven by
    // `ConversationRelayServer` on a separate process/port — it doesn't
    // participate in TACServer routes.
    this.conversationChannels =
      config.conversationChannels ??
      (
        [
          tac.getChannel<SMSChannel>('sms'),
          tac.getChannel<ChatChannel>('chat'),
          tac.getChannel<VoiceChannel>('voice'),
        ] as (Channel | undefined)[]
      ).filter((ch): ch is Channel => ch != null);

    if (this.conversationChannels.length === 0) {
      this.tac.logger.warn(
        'TACServer: No conversation channels (SMS/Chat/Voice) configured. Messaging webhooks will not be registered. ' +
          'Register a channel with tac.registerChannel() before creating TACServer to enable SMS/Chat/Voice.'
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
   * Setup routes — Maestro webhook fan-out and optional Conversation
   * Intelligence webhook. Voice routes are served by ConversationRelayServer in the
   * tac-conversationrelay package.
   */
  private setupRoutes(): void {
    this.setupMessagingRoutes();
    this.setupCintelRoute();
  }

  private setupMessagingRoutes(): void {
    if (this.conversationChannels.length === 0) {
      return;
    }
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

  private setupCintelRoute(): void {
    if (!this.config.webhookPaths.cintel) {
      return;
    }
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
      if (!this.fastify.hasDecorator('gracefulShutdown')) {
        await this.fastify.register(gracefulShutdown);
      }

      // Replace the default JSON parser with one that stores the raw body string,
      // needed by validateRequestWithBody for bodySHA256 signature validation.
      this.fastify.removeContentTypeParser('application/json');
      this.fastify.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        (request, body: string, done) => {
          (request as FastifyRequest & { rawBody?: string }).rawBody = body;
          try {
            done(null, JSON.parse(body));
          } catch (err) {
            done(err as Error, undefined);
          }
        }
      );

      // Register webhook signature validation (must be after formbody for body access)
      registerSignatureValidation(this.fastify, {
        authToken: this.tac.getConfig().authToken,
        publicDomain: this.config.publicDomain,
      });

      // Set up routes (must be after plugin registration)
      this.setupRoutes();

      this.fastify.gracefulShutdown((signal: string) => {
        this.fastify.log.info({ signal }, 'Received shutdown signal');
        this.tac.shutdown();
      });

      await this.fastify.listen({
        host: this.config.host,
        port: this.config.port,
      });

      // Read the actual bound port (port 0 asks the OS for an ephemeral port,
      // so config.port would log `0` instead of the real port number).
      const address = this.fastify.server.address();
      const boundPort = typeof address === 'object' && address ? address.port : this.config.port;

      this.fastify.log.info(
        {
          host: this.config.host,
          port: boundPort,
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
