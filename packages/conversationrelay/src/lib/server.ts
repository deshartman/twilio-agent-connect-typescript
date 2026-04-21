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

import { ConversationRelay } from '../crelay';
import type { ConversationRelayConfig } from '../types';

/**
 * Server configuration for standalone ConversationRelay (without Maestro)
 */
export interface CRelayServerConfig {
  /** Fastify server options */
  fastify?: FastifyServerOptions;

  /** Server host (default: 0.0.0.0) */
  host?: string;

  /** Server port (default: 3000) */
  port?: number;

  /** Custom webhook paths */
  webhookPaths?: {
    twiml?: string;
    ws?: string;
    callback?: string;
    webhook?: string;
  };

  /** ConversationRelay configuration (welcomeGreeting, TTS, etc.) */
  conversationRelayConfig?: Omit<ConversationRelayConfig, 'url'>;

  /** Enable development logging (pino-pretty) */
  development?: boolean;

  /** Enable Twilio webhook signature validation (default: true) */
  validateWebhooks?: boolean;

  /** Twilio auth token (required for webhook validation) */
  authToken?: string;
}

/**
 * CRelayServer — Standalone voice-only server using ConversationRelay
 *
 * Lightweight server for voice-only applications. No Maestro, no Memory, no multi-channel.
 * Provides TwiML endpoint, WebSocket endpoint, and callback handler.
 */
export class CRelayServer {
  private readonly fastify: FastifyInstance;
  private readonly conversationRelay: ConversationRelay;
  private readonly config: Required<
    Omit<CRelayServerConfig, 'fastify' | 'authToken' | 'conversationRelayConfig'>
  > & {
    conversationRelayConfig: Omit<ConversationRelayConfig, 'url'>;
    authToken: string | undefined;
  };

  constructor(conversationRelay: ConversationRelay, config: CRelayServerConfig = {}) {
    this.conversationRelay = conversationRelay;

    this.config = {
      host: config.host ?? '0.0.0.0',
      port: config.port ?? 3000,
      webhookPaths: {
        twiml: config.webhookPaths?.twiml ?? '/twiml',
        ws: config.webhookPaths?.ws ?? '/ws',
        callback: config.webhookPaths?.callback ?? '/callback',
        webhook: config.webhookPaths?.webhook ?? '/webhook',
      },
      conversationRelayConfig: config.conversationRelayConfig ?? {
        welcomeGreeting: 'Hello! How can I help you?',
      },
      development: config.development ?? false,
      validateWebhooks: config.validateWebhooks ?? true,
      authToken: config.authToken,
    };

    this.fastify = Fastify({
      logger: this.config.development
        ? {
            level: process.env.TWILIO_LOG_LEVEL || 'info',
            transport: { target: 'pino-pretty', options: { colorize: true } },
          }
        : { level: process.env.TWILIO_LOG_LEVEL || 'info' },
      ...config.fastify,
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Register plugins
      await this.fastify.register(formbody);
      await this.fastify.register(websocket);
      await this.fastify.register(gracefulShutdown);

      // Register webhook validation if enabled
      if (this.config.validateWebhooks) {
        this.registerWebhookValidation();
      }

      // Setup routes
      await this.setupRoutes();

      // Force-close CR WebSockets on SIGINT/SIGTERM so the port releases immediately
      // instead of Fastify waiting on long-lived Twilio CR connections.
      this.fastify.gracefulShutdown((signal: string) => {
        this.fastify.log.info({ signal }, 'Received shutdown signal');
        this.conversationRelay.shutdown();
      });

      // Start server
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
          twiml_webhook: this.config.webhookPaths.twiml,
          ws_websocket: this.config.webhookPaths.ws,
          callback_webhook: this.config.webhookPaths.callback,
          maestro_sink: this.config.webhookPaths.webhook,
          webhook_validation: this.config.validateWebhooks ? 'enabled' : 'disabled',
        },
        'CRelayServer started (standalone ConversationRelay)'
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to start CRelayServer');
      throw error;
    }
  }

  /**
   * Register webhook signature validation
   */
  private registerWebhookValidation(): void {
    if (!this.config.authToken) {
      this.fastify.log.warn('Webhook validation enabled but no authToken provided');
      return;
    }

    this.fastify.addHook('preHandler', async (request, reply) => {
      // Skip GET requests (WebSocket upgrades)
      if (request.method === 'GET') {
        return;
      }

      const signature = request.headers['x-twilio-signature'] as string;
      const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
      const host = (request.headers['x-forwarded-host'] as string) || request.headers.host || '';
      const url = `${proto}://${host}${request.url}`;

      const params = (request.body as Record<string, string>) || {};
      const isValid = twilio.validateRequest(this.config.authToken!, signature, url, params);

      if (!isValid) {
        this.fastify.log.warn({ url }, 'Invalid Twilio webhook signature');
        // Returning the reply short-circuits the Fastify lifecycle so the route
        // handler is not invoked after we send 403.
        return reply.code(403).send({ error: 'Invalid webhook signature' });
      }
    });
  }

  /**
   * Setup routes
   */
  private async setupRoutes(): Promise<void> {
    // TwiML endpoint (incoming call)
    this.fastify.post(
      this.config.webhookPaths.twiml!,
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const formData = request.body as Record<string, string>;
          const callSid = formData['CallSid'] || '';
          const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
          const host = request.headers.host as string;
          const websocketUrl = `${protocol === 'https' ? 'wss' : 'ws'}://${host}${this.config.webhookPaths.ws!}`;
          const callbackUrl = `${protocol}://${host}${this.config.webhookPaths.callback!}`;

          const twiml = this.conversationRelay.generateTwiML(
            { url: websocketUrl, ...this.config.conversationRelayConfig },
            { conversation_id: callSid },
            { actionUrl: callbackUrl }
          );

          await reply.type('application/xml').send(twiml);
        } catch (error) {
          this.fastify.log.error(
            'TwiML error: ' + (error instanceof Error ? error.message : String(error))
          );
          await reply.code(500).send({ error: 'Internal server error' });
        }
      }
    );

    // WebSocket endpoint
    await this.fastify.register(fastify => {
      fastify.get(this.config.webhookPaths.ws!, { websocket: true }, (socket: WebSocket) => {
        this.conversationRelay.handleConnection(socket);
      });
    });

    // Callback endpoint (call ended)
    this.fastify.post(
      this.config.webhookPaths.callback!,
      async (_request: FastifyRequest, reply: FastifyReply) => {
        await reply.code(200).send('OK');
      }
    );

    // Silent sink for Maestro webhooks
    // If the user has a Conversations Service webhook URL configured on the
    // same domain (e.g., from testing with Maestro), the system will still
    // send events here. Return 200 to acknowledge silently.
    this.fastify.post(
      this.config.webhookPaths.webhook!,
      async (_request: FastifyRequest, reply: FastifyReply) => {
        await reply.code(200).send('OK');
      }
    );
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    try {
      await this.fastify.close();
      this.fastify.log.info('CRelayServer stopped');
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Error stopping CRelayServer');
      throw error;
    }
  }
}
