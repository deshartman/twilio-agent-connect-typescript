/**
 * ConversationRelayServer route tests.
 *
 * Covers the three routes ConversationRelayServer owns:
 *   - POST /twiml                         → always generates TwiML; customParameters
 *                                           come from onIncomingCall if supplied.
 *   - GET  /ws (upgrade)                  → validates x-twilio-signature against wss://.
 *   - POST /conversation-relay-callback   → 200 no-op, or delegates to onCRCallback.
 *
 * Integration with VoiceChannel is out of scope here — the callbacks are stubbed
 * with vi.fn(). The tac-core ↔ CR wiring is exercised by the example integration
 * and by voice-channel tests in the root package.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationRelayServer, ConversationRelay } from '../src/index';
import type {
  ConversationRelayServerConfig,
  CustomParameters,
  ConversationRelayCallbackPayload,
} from '../src/index';
import { createLogger } from '../src/lib/logger';
import WebSocket from 'ws';

// Mock twilio module — use vi.hoisted since vi.mock is hoisted.
const { mockValidateRequest, mockValidateRequestWithBody } = vi.hoisted(() => ({
  mockValidateRequest: vi.fn(),
  mockValidateRequestWithBody: vi.fn(),
}));

vi.mock('twilio', () => {
  const createClient = vi.fn(() => ({}));
  // The shared signature helper pulls these off the default export.
  (createClient as unknown as { validateRequest: typeof mockValidateRequest }).validateRequest =
    mockValidateRequest;
  (
    createClient as unknown as {
      validateRequestWithBody: typeof mockValidateRequestWithBody;
    }
  ).validateRequestWithBody = mockValidateRequestWithBody;

  return {
    default: createClient,
  };
});

const TEST_AUTH_TOKEN = 'test_token_123';

// Helper — constructs a ConversationRelayServer with a fresh CR instance on port 0.
const makeServer = (overrides: Partial<ConversationRelayServerConfig> = {}): ConversationRelayServer => {
  const logger = createLogger({ level: 'silent' });
  const cr = new ConversationRelay(logger);
  return new ConversationRelayServer(cr, {
    authToken: TEST_AUTH_TOKEN,
    port: 0,
    development: false,
    ...overrides,
  });
};

const getActualPort = (srv: ConversationRelayServer): number => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const address = (srv as any).fastify.server.address();
  return typeof address === 'string' ? 0 : address.port;
};

// ===========================================================================
// /twiml + /conversation-relay-callback — signature validation
// ===========================================================================
describe('ConversationRelayServer: signature validation on POST routes', () => {
  let server: ConversationRelayServer;

  beforeEach(() => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    mockValidateRequest.mockReturnValue(false);
  });

  afterEach(async () => {
    if (server) await server.stop().catch(() => {});
  });

  it('rejects /twiml with an invalid signature', async () => {
    server = makeServer();
    await server.start();

    const response = await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': 'invalid',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(response.status).toBe(403);
  });

  it('rejects /conversation-relay-callback with an invalid signature', async () => {
    server = makeServer();
    await server.start();

    const response = await fetch(`http://localhost:${getActualPort(server)}/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': 'invalid',
      },
      body: 'AccountSid=AC123&CallSid=CA123&CallStatus=completed&From=%2B1234&To=%2B5678',
    });

    expect(response.status).toBe(403);
  });
});

// ===========================================================================
// /twiml — standalone (no onIncomingCall) and integrated (callback supplied)
// ===========================================================================
describe('ConversationRelayServer: /twiml request handling', () => {
  let server: ConversationRelayServer;

  beforeEach(() => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    mockValidateRequest.mockReturnValue(true);
  });

  afterEach(async () => {
    if (server) await server.stop().catch(() => {});
  });

  it('renders TwiML with {conversation_id: callSid} when no onIncomingCall is supplied', async () => {
    server = makeServer({
      conversationRelayConfig: {
        welcomeGreeting: 'Standalone hello',
        ttsProvider: 'Google',
      },
    });
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA_standalone',
    });

    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).toContain('welcomeGreeting="Standalone hello"');
    expect(xml).toContain('ttsProvider="Google"');
    // Default standalone customParameters: conversation_id = CallSid
    expect(xml).toContain('name="conversation_id"');
    expect(xml).toContain('value="CA_standalone"');
  });

  it('invokes onIncomingCall with parsed form data and splices returned params into TwiML', async () => {
    const onIncomingCall = vi.fn(
      async (): Promise<CustomParameters> => ({
        conversation_id: 'conv_conversation_01integrated000000000000000',
        profile_id: 'mem_profile_integrated',
        customer_participant_id: 'PA_customer',
        ai_agent_participant_id: 'PA_agent',
      })
    );

    server = makeServer({
      conversationRelayConfig: { welcomeGreeting: 'Integrated' },
      onIncomingCall,
    });
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA_integrated',
    });

    expect(res.status).toBe(200);
    expect(onIncomingCall).toHaveBeenCalledWith({
      toNumber: '+15559876543',
      fromNumber: '+15551234567',
      callSid: 'CA_integrated',
    });

    const xml = await res.text();
    // All four customParameters from the callback land in the TwiML.
    expect(xml).toContain('value="conv_conversation_01integrated000000000000000"');
    expect(xml).toContain('value="mem_profile_integrated"');
    expect(xml).toContain('value="PA_customer"');
    expect(xml).toContain('value="PA_agent"');
  });

  it('uses wss:// when X-Forwarded-Proto is https', async () => {
    server = makeServer();
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-Proto': 'https',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA_proto_https',
    });

    const xml = await res.text();
    expect(xml).toMatch(/url="wss:\/\//);
  });

  it('uses ws:// when X-Forwarded-Proto is http', async () => {
    server = makeServer();
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-Proto': 'http',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA_proto_http',
    });

    const xml = await res.text();
    expect(xml).toMatch(/url="ws:\/\//);
  });

  it('preserves all server conversationRelayConfig attributes in TwiML', async () => {
    server = makeServer({
      conversationRelayConfig: {
        welcomeGreeting: 'Full config test',
        welcomeGreetingInterruptible: 'any',
        transcriptionProvider: 'Deepgram',
        transcriptionLanguage: 'en-US',
        speechModel: 'nova-3-general',
        ttsProvider: 'Google',
        ttsLanguage: 'en-US',
        voice: 'en-US-Journey-O',
        interruptible: 'any',
        interruptSensitivity: 'medium',
        dtmfDetection: true,
        hints: 'technical support, billing',
        partialPrompts: false,
        profanityFilter: false,
      },
    });
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA_full',
    });

    const xml = await res.text();
    expect(xml).toContain('welcomeGreeting="Full config test"');
    expect(xml).toContain('welcomeGreetingInterruptible="any"');
    expect(xml).toContain('transcriptionProvider="Deepgram"');
    expect(xml).toContain('speechModel="nova-3-general"');
    expect(xml).toContain('voice="en-US-Journey-O"');
    expect(xml).toContain('interruptSensitivity="medium"');
    expect(xml).toContain('hints="technical support, billing"');
  });
});

// ===========================================================================
// /conversation-relay-callback — callback delegation
// ===========================================================================
describe('ConversationRelayServer: /conversation-relay-callback handling', () => {
  let server: ConversationRelayServer;

  beforeEach(() => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    mockValidateRequest.mockReturnValue(true);
  });

  afterEach(async () => {
    if (server) await server.stop().catch(() => {});
  });

  it('returns 200 OK no-op when no onCRCallback is supplied (standalone mode)', async () => {
    server = makeServer();
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'AccountSid=AC123&CallSid=CA123&CallStatus=completed&From=%2B1234&To=%2B5678',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('delegates to onCRCallback and echoes its response (integrated mode)', async () => {
    const onCRCallback = vi.fn(
      async (): Promise<{ status: number; content: string; contentType: string }> => ({
        status: 200,
        content: '<Response><Dial>+15559999999</Dial></Response>',
        contentType: 'application/xml',
      })
    );

    server = makeServer({ onCRCallback });
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'AccountSid=AC123&CallSid=CA_handoff&CallStatus=in-progress&From=%2B1234&To=%2B5678&Direction=inbound&HandoffData=%7B%22reason%22%3A%22escalate%22%7D',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(await res.text()).toBe('<Response><Dial>+15559999999</Dial></Response>');

    expect(onCRCallback).toHaveBeenCalledTimes(1);
    const payload = onCRCallback.mock.calls[0]![0] as ConversationRelayCallbackPayload;
    expect(payload.CallSid).toBe('CA_handoff');
    expect(payload.CallStatus).toBe('in-progress');
    expect(payload.HandoffData).toBe('{"reason":"escalate"}');
  });

  it('returns 400 when the callback payload fails schema validation', async () => {
    const onCRCallback = vi.fn();
    server = makeServer({ onCRCallback });
    await server.start();

    const res = await fetch(`http://localhost:${getActualPort(server)}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Missing AccountSid + CallSid — schema demands them.
      body: 'CallStatus=completed',
    });

    expect(res.status).toBe(400);
    expect(onCRCallback).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// /ws — WebSocket upgrade signature validation
// ===========================================================================
describe('ConversationRelayServer: /ws WebSocket signature validation', () => {
  let server: ConversationRelayServer;

  beforeEach(() => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
  });

  afterEach(async () => {
    if (server) await server.stop().catch(() => {});
  });

  it('rejects a WS upgrade with no X-Twilio-Signature header', async () => {
    mockValidateRequest.mockReturnValue(false);
    server = makeServer();
    await server.start();

    const ws = new WebSocket(`ws://localhost:${getActualPort(server)}/ws`);
    const closeCode = await new Promise<number>((resolve, reject) => {
      ws.on('close', (code: number) => resolve(code));
      ws.on('error', (err: Error) => reject(err));
    });

    expect(closeCode).toBe(1008);
  });

  it('rejects a WS upgrade with an invalid signature', async () => {
    mockValidateRequest.mockReturnValue(false);
    server = makeServer();
    await server.start();

    const ws = new WebSocket(`ws://localhost:${getActualPort(server)}/ws`, {
      headers: { 'X-Twilio-Signature': 'invalid-signature' },
    });
    const closeCode = await new Promise<number>((resolve, reject) => {
      ws.on('close', (code: number) => resolve(code));
      ws.on('error', (err: Error) => reject(err));
    });

    expect(closeCode).toBe(1008);
  });

  it('accepts a WS upgrade with a valid signature', async () => {
    mockValidateRequest.mockReturnValue(true);
    server = makeServer();
    await server.start();

    const ws = new WebSocket(`ws://localhost:${getActualPort(server)}/ws`, {
      headers: { 'X-Twilio-Signature': 'valid-signature' },
    });
    const opened = await new Promise<boolean>(resolve => {
      ws.on('open', () => resolve(true));
      ws.on('close', () => resolve(false));
      ws.on('error', () => resolve(false));
    });

    expect(opened).toBe(true);
    ws.close();
  });

  it('forces wss:// when signing the URL for WS upgrade validation', async () => {
    mockValidateRequest.mockReturnValue(true);
    server = makeServer();
    await server.start();

    const ws = new WebSocket(`ws://localhost:${getActualPort(server)}/ws`, {
      headers: { 'X-Twilio-Signature': 'test-ws-sig' },
    });

    await new Promise<void>(resolve => {
      ws.on('open', () => resolve());
      ws.on('error', () => resolve());
    });

    expect(mockValidateRequest).toHaveBeenCalledWith(
      TEST_AUTH_TOKEN,
      'test-ws-sig',
      expect.stringMatching(/^wss?:\/\/.*\/ws$/),
      {}
    );

    ws.close();
  });

  it('extracts query-string parameters for signature validation', async () => {
    mockValidateRequest.mockReturnValue(true);
    server = makeServer();
    await server.start();

    const ws = new WebSocket(
      `ws://localhost:${getActualPort(server)}/ws?AccountSid=AC123&CallSid=CA456`,
      {
        headers: { 'X-Twilio-Signature': 'test-ws-sig' },
      }
    );

    await new Promise<void>(resolve => {
      ws.on('open', () => resolve());
      ws.on('error', () => resolve());
    });

    expect(mockValidateRequest).toHaveBeenCalledWith(
      TEST_AUTH_TOKEN,
      'test-ws-sig',
      expect.stringMatching(/^wss?:\/\/.*\/ws$/),
      { AccountSid: 'AC123', CallSid: 'CA456' }
    );

    ws.close();
  });

  it('rejects the WS upgrade when the Host header is missing', async () => {
    server = makeServer();
    await server.start();

    const ws = new WebSocket(`ws://localhost:${getActualPort(server)}/ws`, {
      headers: {
        'X-Twilio-Signature': 'test-sig',
        Host: '',
      },
    });
    const closeCode = await new Promise<number>((resolve, reject) => {
      ws.on('close', (code: number) => resolve(code));
      ws.on('error', (err: Error) => reject(err));
    });

    expect(closeCode).toBe(1008);
  });
});
