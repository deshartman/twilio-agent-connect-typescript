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

import { ConversationRelay } from '../crelay';
import {
  ConversationRelayCallbackPayloadSchema,
  type ConversationRelayConfig,
  type ConversationRelayCallbackPayload,
  type CustomParameters,
} from '../types';
import { registerSignatureValidation, validateWebSocketSignature } from './signature';

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

  /**
   * Twilio auth token used to validate every incoming webhook and WebSocket
   * upgrade. Required — there is no opt-out. Matches the always-on posture
   * of TACServer (see PR #69).
   */
  authToken: string;

  /**
   * Called on POST /twiml when an incoming call arrives. Return a record of
   * custom parameters that CRelayServer will splice into the `<ConversationRelay>`
   * TwiML element (rendered by `conversationRelay.generateTwiML`).
   *
   * Integrated mode (with `@twilio/tac-core`): wire this to
   * `voiceChannel.createConversationForCall(input)` — the four Maestro IDs
   * (conversation_id, profile_id, customer_participant_id, ai_agent_participant_id)
   * flow to CR as customParameters and arrive at the CR WebSocket on the
   * `setup` message.
   *
   * Standalone mode: omit this — CR generates TwiML with `{}` as customParameters
   * and the caller drives their own LLM via CR event subscriptions.
   */
  onIncomingCall?: (input: {
    toNumber: string;
    fromNumber: string;
    callSid?: string;
  }) => Promise<CustomParameters>;

  /**
   * Called on POST /conversation-relay-callback when Twilio fires the CR
   * action URL (call ended, handoff requested, etc.). Return the HTTP
   * response the server should echo back to Twilio.
   *
   * Integrated mode: wire this to
   * `voiceChannel.handleConversationRelayCallback(payload, handoffHandler)`
   * — core closes the Maestro conversation and returns any handoff TwiML.
   *
   * Standalone mode: omit this — CRelayServer replies 200 OK no-op and the
   * caller handles call-end via the CR `onSessionEnded` event subscription.
   */
  onCRCallback?: (
    payload: ConversationRelayCallbackPayload
  ) => Promise<{ status: number; content: string; contentType: string }>;
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
    Omit<
      CRelayServerConfig,
      'fastify' | 'conversationRelayConfig' | 'onIncomingCall' | 'onCRCallback'
    >
  > & {
    conversationRelayConfig: Omit<ConversationRelayConfig, 'url'>;
    onIncomingCall?: CRelayServerConfig['onIncomingCall'];
    onCRCallback?: CRelayServerConfig['onCRCallback'];
  };

  constructor(conversationRelay: ConversationRelay, config: CRelayServerConfig) {
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
      authToken: config.authToken,
      ...(config.onIncomingCall ? { onIncomingCall: config.onIncomingCall } : {}),
      ...(config.onCRCallback ? { onCRCallback: config.onCRCallback } : {}),
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

      // Webhook signature validation is always on — see PR #69
      registerSignatureValidation(this.fastify, {
        authToken: this.config.authToken,
      });

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
        },
        'CRelayServer started (standalone ConversationRelay)'
      );
    } catch (error) {
      this.fastify.log.error({ err: error }, 'Failed to start CRelayServer');
      throw error;
    }
  }

  /**
   * Setup routes
   */
  private async setupRoutes(): Promise<void> {
    // TwiML endpoint (incoming call)
    // Standalone mode: no onIncomingCall callback → emit TwiML with CallSid
    //   as conversation_id (caller's own LLM loop has no Maestro conversation).
    // Integrated mode: onIncomingCall returns Maestro IDs as customParameters,
    //   which land on the CR WebSocket `setup` message.
    this.fastify.post(
      this.config.webhookPaths.twiml!,
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const formData = request.body as Record<string, string>;
          const callSid = formData['CallSid'] || '';
          const toNumber = formData['To'] || '';
          const fromNumber = formData['From'] || '';
          const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
          const host = request.headers.host as string;
          const websocketUrl = `${protocol === 'https' ? 'wss' : 'ws'}://${host}${this.config.webhookPaths.ws!}`;
          const callbackUrl = `${protocol}://${host}${this.config.webhookPaths.callback!}`;

          const customParams: CustomParameters = this.config.onIncomingCall
            ? await this.config.onIncomingCall({ toNumber, fromNumber, callSid })
            : { conversation_id: callSid };

          const twiml = this.conversationRelay.generateTwiML(
            { url: websocketUrl, ...this.config.conversationRelayConfig },
            customParams,
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

    // WebSocket endpoint — validate Twilio signature on upgrade (see PR #69)
    await this.fastify.register(fastify => {
      fastify.get(
        this.config.webhookPaths.ws!,
        { websocket: true },
        (socket: WebSocket, request: FastifyRequest) => {
          const isValid = validateWebSocketSignature(request, this.config.authToken);

          if (!isValid) {
            this.fastify.log.warn(
              {
                url: request.url,
                hasSignature: !!request.headers['x-twilio-signature'],
              },
              'WebSocket connection rejected: invalid Twilio signature'
            );
            socket.close(1008, 'Invalid signature');
            return;
          }

          this.conversationRelay.handleConnection(socket);
        }
      );
    });

    // ConversationRelay action URL (call ended / handoff request).
    // Standalone mode: no onCRCallback → 200 OK no-op. Caller handles call-end
    //   via `cr.onSessionEnded` event subscription.
    // Integrated mode: onCRCallback closes the Maestro conversation and
    //   returns handoff TwiML (or 200 OK for normal completion).
    this.fastify.post(
      this.config.webhookPaths.callback!,
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!this.config.onCRCallback) {
          await reply.code(200).send('OK');
          return;
        }

        const parseResult = ConversationRelayCallbackPayloadSchema.safeParse(request.body);
        if (!parseResult.success) {
          this.fastify.log.error(
            { errors: parseResult.error.errors },
            'Invalid ConversationRelay callback payload'
          );
          await reply.code(400).send({ error: 'Invalid payload' });
          return;
        }

        try {
          const result = await this.config.onCRCallback(parseResult.data);
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
