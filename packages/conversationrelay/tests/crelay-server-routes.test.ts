/**
 * Staging file for Phase 2 of cr-hard-split.
 *
 * These tests currently exercise voice-specific routes (/twiml, /ws,
 * /conversation-relay-callback) through TACServer. Once Phase 5 moves those
 * routes out of TACServer and into CRelayServer, this file will be rewritten
 * to target CRelayServer directly.
 *
 * Block provenance (from tests/server.test.ts pre-split):
 * - 'validation on different endpoints'        (was nested at line 318)
 * - 'TACServer with conversationRelayConfig'   (was line 498)
 * - 'TACServer WebSocket signature validation' (was line 1029)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestTAC } from '../../../tests/helpers/tac';
import { TAC, TACConfig, SMSChannel, VoiceChannel } from '@twilio/tac-core';
import { TACServer } from '@twilio/tac-server';
import WebSocket from 'ws';

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
  createClient.validateRequest = mockValidateRequest;
  createClient.validateRequestWithBody = mockValidateRequestWithBody;

  return {
    default: createClient,
  };
});

// Use port 0 to let OS assign available ports (prevents parallel test collisions)
const getNextPort = () => 0;

const SHARED_TEST_CONFIG = {
  accountSid: 'ACtest123456789',
  authToken: 'test_token_123',
  apiKey: 'test_api_key',
  apiSecret: 'test_api_token',
  phoneNumber: '+15551234567',
  conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
};

// Helper to get actual port after server starts
const getActualPort = (srv: TACServer): number => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const address = (srv as any).fastify.server.address();
  return typeof address === 'string' ? 0 : address.port;
};

// ===========================================================================
// /twiml + /conversation-relay-callback signature validation
// (promoted from nested describe inside 'TACServer Webhook Validation')
// ===========================================================================
describe('CR routes: signature validation on /twiml + /conversation-relay-callback', () => {
  let tac: TAC;
  let server: TACServer;
  let currentPort: number;

  beforeEach(async () => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    currentPort = getNextPort();

    const config = new TACConfig(SHARED_TEST_CONFIG);
    tac = await createTestTAC(config);

    const smsChannel = new SMSChannel(tac.getChannelDeps());
    const voiceChannel = new VoiceChannel(tac.getChannelDeps());
    tac.registerChannel(smsChannel);
    tac.registerChannel(voiceChannel);

    vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);

    mockValidateRequest.mockReturnValue(false);

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop().catch(() => {});
    }
    tac.shutdown();
  });

  it('should validate /twiml webhook endpoint', async () => {
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

  it('should validate /conversation-relay-callback endpoint', async () => {
    const response = await fetch(
      `http://localhost:${getActualPort(server)}/conversation-relay-callback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': 'invalid',
        },
        body: 'AccountSid=AC123&CallSid=CA123&CallStatus=completed&From=%2B1234&To=%2B5678',
      }
    );

    expect(response.status).toBe(403);
  });
});

// ===========================================================================
// conversationRelayConfig merging + /twiml request handling
// (was 'TACServer with conversationRelayConfig')
// ===========================================================================
describe('CR routes: /twiml with conversationRelayConfig', () => {
  let tac: TAC;
  let server: TACServer;
  let voiceChannel: VoiceChannel;
  let currentPort: number;

  beforeEach(async () => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();
    mockValidateRequest.mockReturnValue(true);

    currentPort = getNextPort();

    const config = new TACConfig(SHARED_TEST_CONFIG);
    tac = await createTestTAC(config);

    const smsChannel = new SMSChannel(tac.getChannelDeps());
    voiceChannel = new VoiceChannel(tac.getChannelDeps());
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
      }
    }
    tac.shutdown();
  });

  it('should accept conversationRelayConfig parameter', async () => {
    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
      conversationRelayConfig: {
        welcomeGreeting: 'Hello from TACServer!',
        transcriptionProvider: 'Deepgram',
        ttsProvider: 'Google',
        voice: 'en-US-Journey-O',
        interruptible: 'any',
      },
    });

    await server.start();

    expect(server).toBeDefined();
  });

  it('should pass server conversationRelayConfig to handleIncomingCall', async () => {
    const handleIncomingCallSpy = vi.spyOn(voiceChannel, 'handleIncomingCall');
    handleIncomingCallSpy.mockResolvedValue(
      '<Response><Connect><ConversationRelay/></Connect></Response>'
    );

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
      conversationRelayConfig: {
        welcomeGreeting: 'Test greeting',
        transcriptionProvider: 'Deepgram',
        interruptible: 'any',
      },
    });

    await server.start();

    await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(handleIncomingCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRelayConfig: expect.objectContaining({
          welcomeGreeting: 'Test greeting',
          transcriptionProvider: 'Deepgram',
          interruptible: 'any',
          url: expect.stringMatching(/^wss?:\/\//),
        }),
      })
    );
  });

  it('should merge server config with dynamic WebSocket URL', async () => {
    const handleIncomingCallSpy = vi.spyOn(voiceChannel, 'handleIncomingCall');
    handleIncomingCallSpy.mockResolvedValue(
      '<Response><Connect><ConversationRelay/></Connect></Response>'
    );

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
      conversationRelayConfig: {
        welcomeGreeting: 'Dynamic merge test',
        ttsProvider: 'Google',
        interruptible: 'any',
      },
    });

    await server.start();

    await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(handleIncomingCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRelayConfig: expect.objectContaining({
          url: expect.stringMatching(/^wss?:\/\//),
          welcomeGreeting: 'Dynamic merge test',
          ttsProvider: 'Google',
          interruptible: 'any',
        }),
      })
    );
  });

  it('should handle undefined server conversationRelayConfig', async () => {
    const handleIncomingCallSpy = vi.spyOn(voiceChannel, 'handleIncomingCall');
    handleIncomingCallSpy.mockResolvedValue(
      '<Response><Connect><ConversationRelay/></Connect></Response>'
    );

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();

    await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(handleIncomingCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRelayConfig: expect.objectContaining({
          url: expect.stringMatching(/^wss?:\/\//),
          welcomeGreeting: 'Hello! Set up your welcome greeting in the server config.',
        }),
      })
    );
  });

  it('should use wss:// protocol when X-Forwarded-Proto is https', async () => {
    const handleIncomingCallSpy = vi.spyOn(voiceChannel, 'handleIncomingCall');
    handleIncomingCallSpy.mockResolvedValue(
      '<Response><Connect><ConversationRelay/></Connect></Response>'
    );

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();

    await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-Proto': 'https',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(handleIncomingCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRelayConfig: expect.objectContaining({
          url: expect.stringMatching(/^wss:\/\//),
        }),
      })
    );
  });

  it('should use ws:// protocol when X-Forwarded-Proto is http', async () => {
    const handleIncomingCallSpy = vi.spyOn(voiceChannel, 'handleIncomingCall');
    handleIncomingCallSpy.mockResolvedValue(
      '<Response><Connect><ConversationRelay/></Connect></Response>'
    );

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();

    await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-Proto': 'http',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(handleIncomingCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRelayConfig: expect.objectContaining({
          url: expect.stringMatching(/^ws:\/\//),
        }),
      })
    );
  });

  it('should preserve all server config attributes', async () => {
    const handleIncomingCallSpy = vi.spyOn(voiceChannel, 'handleIncomingCall');
    handleIncomingCallSpy.mockResolvedValue(
      '<Response><Connect><ConversationRelay/></Connect></Response>'
    );

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
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

    await fetch(`http://localhost:${getActualPort(server)}/twiml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'From=%2B15551234567&To=%2B15559876543&CallSid=CA123',
    });

    expect(handleIncomingCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRelayConfig: expect.objectContaining({
          url: expect.any(String),
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
        }),
      })
    );
  });
});

// ===========================================================================
// WebSocket upgrade signature validation — see PR #69
// (was 'TACServer WebSocket signature validation')
// ===========================================================================
describe('CR routes: /ws WebSocket signature validation', () => {
  let tac: TAC;
  let server: TACServer;
  let currentPort: number;

  beforeEach(async () => {
    mockValidateRequest.mockReset();
    mockValidateRequestWithBody.mockReset();

    currentPort = 0;

    const config = new TACConfig(SHARED_TEST_CONFIG);
    tac = await createTestTAC(config);

    const smsChannel = new SMSChannel(tac.getChannelDeps());
    const voiceChannel = new VoiceChannel(tac.getChannelDeps());
    tac.registerChannel(smsChannel);
    tac.registerChannel(voiceChannel);

    vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
  });

  afterEach(async () => {
    if (server) {
      await server.stop().catch(() => {});
    }
    tac.shutdown();
  });

  it('should reject WebSocket without X-Twilio-Signature', async () => {
    mockValidateRequest.mockReturnValue(false);

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
    const actualPort = getActualPort(server);

    const ws = new WebSocket(`ws://localhost:${actualPort}/ws`);

    const closeCode = await new Promise<number>((resolve, reject) => {
      ws.on('close', (code: number) => resolve(code));
      ws.on('error', (err: Error) => reject(err));
    });

    expect(closeCode).toBe(1008);
  });

  it('should reject WebSocket with invalid Twilio signature', async () => {
    mockValidateRequest.mockReturnValue(false);

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
    const actualPort = getActualPort(server);

    const ws = new WebSocket(`ws://localhost:${actualPort}/ws`, {
      headers: { 'X-Twilio-Signature': 'invalid-signature' },
    });

    const closeCode = await new Promise<number>((resolve, reject) => {
      ws.on('close', (code: number) => resolve(code));
      ws.on('error', (err: Error) => reject(err));
    });

    expect(closeCode).toBe(1008);
  });

  it('should accept WebSocket with valid Twilio signature', async () => {
    mockValidateRequest.mockReturnValue(true);

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
    const actualPort = getActualPort(server);

    const ws = new WebSocket(`ws://localhost:${actualPort}/ws`, {
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

  it('should call validateRequest with correct params for WebSocket upgrade', async () => {
    mockValidateRequest.mockReturnValue(true);

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
    const actualPort = getActualPort(server);

    const ws = new WebSocket(`ws://localhost:${actualPort}/ws`, {
      headers: { 'X-Twilio-Signature': 'test-ws-sig' },
    });

    await new Promise<void>(resolve => {
      ws.on('open', () => resolve());
      ws.on('error', () => resolve());
    });

    expect(mockValidateRequest).toHaveBeenCalledWith(
      'test_token_123',
      'test-ws-sig',
      expect.stringMatching(/^wss?:\/\/.*\/ws$/),
      {}
    );

    ws.close();
  });

  it('should extract query params from WebSocket URL for signature validation', async () => {
    mockValidateRequest.mockReturnValue(true);

    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
    const actualPort = getActualPort(server);

    const ws = new WebSocket(
      `ws://localhost:${actualPort}/ws?AccountSid=AC123&CallSid=CA456`,
      {
        headers: { 'X-Twilio-Signature': 'test-ws-sig' },
      }
    );

    await new Promise<void>(resolve => {
      ws.on('open', () => resolve());
      ws.on('error', () => resolve());
    });

    expect(mockValidateRequest).toHaveBeenCalledWith(
      'test_token_123',
      'test-ws-sig',
      expect.stringMatching(/^wss?:\/\/.*\/ws$/),
      { AccountSid: 'AC123', CallSid: 'CA456' }
    );

    ws.close();
  });

  it('should reject WebSocket when host header is missing', async () => {
    server = new TACServer(tac, {
      development: true,
      voice: { port: currentPort },
    });

    await server.start();
    const actualPort = getActualPort(server);

    const ws = new WebSocket(`ws://localhost:${actualPort}/ws`, {
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
