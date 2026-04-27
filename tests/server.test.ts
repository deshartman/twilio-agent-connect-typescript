import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestTAC } from './helpers/tac';
import { TAC, TACConfig, SMSChannel, VoiceChannel } from '@twilio/tac-core';
import { TACServer } from '@twilio/tac-server';

// Mock twilio module - use vi.hoisted since vi.mock is hoisted to top of file
const { mockValidateRequest, mockValidateRequestWithBody } = vi.hoisted(() => ({
  mockValidateRequest: vi.fn(),
  mockValidateRequestWithBody: vi.fn(),
}));

vi.mock('twilio', () => {
  const createClient = vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({ sid: 'SM00000000000000000000000000000000' }),
    },
  }));
  // Add validation functions to the default export
  createClient.validateRequest = mockValidateRequest;
  createClient.validateRequestWithBody = mockValidateRequestWithBody;

  return {
    default: createClient,
  };
});

// Use port 0 to let OS assign available ports (prevents parallel test collisions)
const getNextPort = () => 0;

const TEST_PUBLIC_DOMAIN = 'test.example.com';

// Shared config for describe blocks that just need a plain TACConfig.
const SHARED_TEST_CONFIG = {
  accountSid: 'ACtest123456789',
  authToken: 'test_token_123',
  apiKey: 'test_api_key',
  apiSecret: 'test_api_token',
  phoneNumber: '+15551234567',
  conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
};

describe('TACServer Webhook Validation', () => {
  let tac: TAC;
  let server: TACServer;
  let currentPort: number;

  // Helper to get actual port after server starts
  const getActualPort = (srv: TACServer): number => {
    const address = (srv as any).fastify.server.address();
    return typeof address === 'string' ? 0 : address.port;
  };

  beforeEach(async () => {
    // Reset mock
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();

    // Get unique port for this test (will be 0 for OS assignment)
    currentPort = getNextPort();

    // Create TAC instance
    const config = new TACConfig(SHARED_TEST_CONFIG);
    tac = await createTestTAC(config);

    // Register channels (required for route handlers)
    const smsChannel = new SMSChannel(tac.getChannelDeps());
    const voiceChannel = new VoiceChannel(tac.getChannelDeps());
    tac.registerChannel(smsChannel);
    tac.registerChannel(voiceChannel);

    // Isolate server tests from live memory HTTP calls (see merge-lessons:
    // "Channel tests must isolate from memory HTTP calls").
    vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch (error) {
        console.error('Server cleanup error:', error);
        // Allow test to complete - don't fail on cleanup
      }
    }
    tac.shutdown();
  });

  it('should reject requests with invalid signature', async () => {
    mockValidateRequest.mockReturnValue(false);

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      development: true,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    const response = await fetch(`http://localhost:${actualPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': 'invalid-signature',
      },
      body: 'From=%2B15551234567&Body=Hello',
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Invalid webhook signature');
  });

  it('should accept requests with valid signature', async () => {
    mockValidateRequest.mockReturnValue(true);

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      development: true,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    const response = await fetch(`http://localhost:${actualPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': 'valid-signature',
      },
      body: 'eventType=COMMUNICATION_CREATED&data=%7B%22conversationId%22%3A%22CH123%22%7D',
    });

    // Should not be 403 (may be 200 or 500 depending on further processing)
    expect(response.status).not.toBe(403);
  });

  it('should call validateRequest with correct parameters', async () => {
    mockValidateRequest.mockReturnValue(true);

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      development: true,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    await fetch(`http://localhost:${actualPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': 'test-signature',
      },
      body: 'From=%2B15551234567',
    });

    expect(mockValidateRequest).toHaveBeenCalledWith(
      'test_token_123',
      'test-signature',
      expect.stringContaining('/webhook'),
      expect.objectContaining({ From: '+15551234567' })
    );
  });

  describe('URL construction for validation', () => {
    it('builds the signed URL from publicDomain, ignoring X-Forwarded-* / Host', async () => {
      mockValidateRequest.mockReturnValue(true);

      server = new TACServer(tac, {
        publicDomain: TEST_PUBLIC_DOMAIN,
        development: true,
        port: currentPort,
      });

      await server.start();
      const actualPort = getActualPort(server);

      await fetch(`http://localhost:${actualPort}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': 'sig',
          // Spoofed headers that would previously have been honoured.
          'X-Forwarded-Proto': 'http',
          'X-Forwarded-Host': 'evil.example.com',
        },
        body: 'From=test',
      });

      expect(mockValidateRequest).toHaveBeenCalledWith(
        expect.any(String),
        'sig',
        `https://${TEST_PUBLIC_DOMAIN}/webhook`,
        expect.any(Object)
      );
    });

    it('normalises publicDomain supplied with an https:// prefix', async () => {
      mockValidateRequest.mockReturnValue(true);

      server = new TACServer(tac, {
        publicDomain: 'https://scheme.example.com/',
        development: true,
        port: currentPort,
      });

      await server.start();
      const actualPort = getActualPort(server);

      await fetch(`http://localhost:${actualPort}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': 'sig',
        },
        body: 'From=test',
      });

      expect(mockValidateRequest).toHaveBeenCalledWith(
        expect.any(String),
        'sig',
        'https://scheme.example.com/webhook',
        expect.any(Object)
      );
    });

    it('includes query-string parameters in the signed URL', async () => {
      mockValidateRequestWithBody.mockReturnValue(true);

      server = new TACServer(tac, {
        publicDomain: TEST_PUBLIC_DOMAIN,
        development: true,
        port: currentPort,
      });

      await server.start();
      const actualPort = getActualPort(server);

      await fetch(`http://localhost:${actualPort}/webhook?bodySHA256=abc123`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Twilio-Signature': 'sig',
        },
        body: '{"k":"v"}',
      });

      expect(mockValidateRequestWithBody).toHaveBeenCalledWith(
        expect.any(String),
        'sig',
        `https://${TEST_PUBLIC_DOMAIN}/webhook?bodySHA256=abc123`,
        '{"k":"v"}'
      );
    });

    it('throws at construction when publicDomain is empty', () => {
      expect(
        () =>
          new TACServer(tac, {
            publicDomain: '',
            port: currentPort,
          })
      ).toThrow(/required/i);
    });
  });

  // 'validation on different endpoints' sub-block moved to
  // packages/conversationrelay/tests/crelay-server-routes.test.ts (Phase 2).

  it('should pass raw JSON body to validateRequestWithBody for bodySHA256 validation', async () => {
    mockValidateRequestWithBody.mockReturnValue(true);

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      development: true,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    const jsonBody = '{"key":"value","number":42}';

    await fetch(`http://localhost:${actualPort}/webhook?bodySHA256=abc123`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Twilio-Signature': 'test-sig',
      },
      body: jsonBody,
    });

    expect(mockValidateRequestWithBody).toHaveBeenCalledWith(
      'test_token_123',
      'test-sig',
      expect.stringContaining('/webhook?bodySHA256=abc123'),
      jsonBody
    );
  });
});

describe('TACServer idempotency token', () => {
  let tac: TAC;
  let server: TACServer;
  let smsChannel: SMSChannel;
  let currentPort: number;

  // Helper to get actual port after server starts
  const getActualPort = (srv: TACServer): number => {
    const address = (srv as any).fastify.server.address();
    return typeof address === 'string' ? 0 : address.port;
  };

  beforeEach(async () => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    mockValidateRequest.mockReturnValue(true);

    currentPort = getNextPort();

    const config = new TACConfig(SHARED_TEST_CONFIG);
    tac = await createTestTAC(config);

    smsChannel = new SMSChannel(tac.getChannelDeps());
    const voiceChannel = new VoiceChannel(tac.getChannelDeps());
    tac.registerChannel(smsChannel);
    tac.registerChannel(voiceChannel);

    vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch (error) {
        console.error('Server cleanup error:', error);
        // Allow test to complete - don't fail on cleanup
      }
    }
    tac.shutdown();
  });

  it('should pass i-twilio-idempotency-token header to channels', async () => {
    const processWebhookSpy = vi.spyOn(smsChannel, 'processWebhook');

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      development: true,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    await fetch(`http://localhost:${actualPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'i-twilio-idempotency-token': 'tok-abc-123',
      },
      body: JSON.stringify({
        eventType: 'COMMUNICATION_CREATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs' },
      }),
    });

    await vi.waitFor(() => {
      expect(processWebhookSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'COMMUNICATION_CREATED' }),
        'tok-abc-123'
      );
    });
  });

  it('should pass undefined when no idempotency token header is present', async () => {
    const processWebhookSpy = vi.spyOn(smsChannel, 'processWebhook');

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      development: true,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    await fetch(`http://localhost:${actualPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType: 'COMMUNICATION_CREATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs' },
      }),
    });

    await vi.waitFor(() => {
      expect(processWebhookSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'COMMUNICATION_CREATED' }),
        undefined
      );
    });
  });
});

// describe('TACServer with conversationRelayConfig') moved to
// packages/conversationrelay/tests/crelay-server-routes.test.ts (Phase 2).


describe('TACServer customization', () => {
  const getTestConfig = () => ({
    accountSid: 'ACtest123456789',
    authToken: 'test_token_123',
    apiKey: 'test_api_key',
    apiSecret: 'test_api_token',
    phoneNumber: '+15551234567',
    conversationConfigurationId: 'conv_configuration_01testconvservice000000000',
  });

  let tac: TAC;
  let server: TACServer;
  let currentPort: number;

  // Helper to get actual port after server starts (matches pattern used above)
  const getActualPort = (srv: TACServer): number => {
    const address = (srv as any).fastify.server.address();
    return typeof address === 'string' ? 0 : address.port;
  };

  beforeEach(async () => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    mockValidateRequest.mockReturnValue(true);
    mockValidateRequestWithBody.mockReturnValue(true);

    currentPort = getNextPort();

    const config = new TACConfig(getTestConfig());
    tac = await createTestTAC(config);

    const smsChannel = new SMSChannel(tac.getChannelDeps());
    const voiceChannel = new VoiceChannel(tac.getChannelDeps());
    tac.registerChannel(smsChannel);
    tac.registerChannel(voiceChannel);

    // Scope: these tests verify Fastify routing, hooks, and plugin composition.
    // Stub only the HTTP boundary (ConversationClient) so real channel logic and
    // real ConversationRelay TwiML generation still run. This keeps CR / channel
    // internals out of the test file while eliminating 401 noise from test creds.
    const conversationClient = tac.getConversationClient();
    vi.spyOn(conversationClient, 'createConversation').mockResolvedValue({
      id: 'conv_conversation_01testserverabcdefghijklmn',
      accountId: 'ACtest123456789',
    });
    vi.spyOn(conversationClient, 'listParticipants').mockResolvedValue([]);
    vi.spyOn(conversationClient, 'addParticipant').mockResolvedValue({
      id: 'conv_participant_01testserverabcdefghijkl',
      conversationId: 'conv_conversation_01testserverabcdefghijklmn',
      accountId: 'ACtest123456789',
      addresses: [],
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop().catch(() => {});
    }
    tac.shutdown();
  });

  it('uses the provided Fastify instance', async () => {
    const Fastify = (await import('fastify')).default;
    const customApp = Fastify({ logger: false });

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      fastifyInstance: customApp,
      port: currentPort,
    });

    expect(server.fastify).toBe(customApp);
  });

  it('mounts TAC endpoints and user routes on a provided Fastify instance', async () => {
    const Fastify = (await import('fastify')).default;
    const customApp = Fastify({ logger: false });

    // User registers their own route + hook before TAC start()
    customApp.get('/health', async () => ({ status: 'ok' }));
    customApp.addHook('onSend', async (_req, reply, payload) => {
      reply.header('x-user-hook', 'yes');
      return payload;
    });

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      fastifyInstance: customApp,
      port: currentPort,
    });

    await server.start();
    const actualPort = getActualPort(server);

    // User route is reachable
    const health = await fetch(`http://localhost:${actualPort}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    // User hook also fires on the /webhook (messaging) route — TAC's own route
    const sms = await fetch(`http://localhost:${actualPort}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15551234567&Body=hi',
    });
    expect(sms.status).not.toBe(404); // TAC /webhook is mounted
    expect(sms.headers.get('x-user-hook')).toBe('yes');
  });

  it('does not crash when user pre-registers plugins TAC also needs', async () => {
    const Fastify = (await import('fastify')).default;
    const formbody = (await import('@fastify/formbody')).default;

    const customApp = Fastify({ logger: false });
    // Simulate a user who registers formbody themselves for their own routes.
    // start() should detect and skip duplicate registration.
    await customApp.register(formbody);

    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      fastifyInstance: customApp,
      port: currentPort,
    });

    // Must not throw
    await server.start();

    // TAC's form-body-parsed routes still work
    const resp = await fetch(`http://localhost:${getActualPort(server)}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15551234567&Body=hi',
    });
    expect(resp.status).not.toBe(404);
  });

  it('creates a default Fastify instance when none is provided', () => {
    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      port: currentPort,
    });

    expect(server.fastify).toBeDefined();
    expect(typeof server.fastify.listen).toBe('function');
  });

  it('exposes the same Fastify instance before and after start()', async () => {
    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      port: currentPort,
    });

    const before = server.fastify;
    await server.start();
    const after = server.fastify;

    expect(after).toBe(before);
  });

  it('allows adding a custom route to server.fastify after construction', async () => {
    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      port: currentPort,
    });

    server.fastify.get('/health', async () => ({ status: 'ok' }));

    await server.start();

    const resp = await fetch(`http://localhost:${getActualPort(server)}/health`);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ status: 'ok' });
  });

  it('allows adding a hook to server.fastify after construction', async () => {
    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      port: currentPort,
    });

    server.fastify.addHook('onSend', async (_request, reply, payload) => {
      reply.header('x-test', 'yes');
      return payload;
    });

    server.fastify.get('/ping', async () => ({ ok: true }));

    await server.start();

    const resp = await fetch(`http://localhost:${getActualPort(server)}/ping`);
    expect(resp.headers.get('x-test')).toBe('yes');
  });

  it('allows adding a custom error handler on server.fastify', async () => {
    server = new TACServer(tac, {
      publicDomain: TEST_PUBLIC_DOMAIN,
      port: currentPort,
    });

    class MyError extends Error {}

    server.fastify.setErrorHandler(async (error, _request, reply) => {
      if (error instanceof MyError) {
        await reply.code(418).send({ handled: true });
        return;
      }
      throw error;
    });

    server.fastify.get('/boom', async () => {
      throw new MyError('kapow');
    });

    await server.start();

    const resp = await fetch(`http://localhost:${getActualPort(server)}/boom`);
    expect(resp.status).toBe(418);
    expect(await resp.json()).toEqual({ handled: true });
  });
});

// Voice-route tests — describe('TACServer WebSocket signature validation')
// and describe('TACServer conditional route registration') have both moved
// to packages/conversationrelay/tests/crelay-server-routes.test.ts. TACServer
// itself no longer owns voice routes; ConversationRelayServer serves /twiml, /ws, and
// /conversation-relay-callback.
