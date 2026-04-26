import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationRelay } from '../src/crelay';
import { ConversationRelaySession } from '../src/lib/conversation-relay-session';
import pino from 'pino';
import { WebSocket } from 'ws';
import type { CallSid } from '../src/types';

describe('ConversationRelay', () => {
  const createTestLogger = () => pino({ level: 'silent' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockWebSocket = (): any => {
    const handlers: Record<string, ((...args: any[]) => void)[]> = {};
    return {
      on(event: string, handler: (...args: any[]) => void) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      _handlers: handlers,
      _emit(event: string, ...args: any[]) {
        for (const h of handlers[event] || []) h(...args);
      },
    };
  };

  const setupPayload = (callSid: string, overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
      type: 'setup',
      sessionId: 'sess_test',
      callSid,
      from: '+15551234567',
      to: '+15559876543',
      direction: 'inbound',
      callType: 'PSTN',
      callStatus: 'ringing',
      accountSid: 'ACtest',
      ...overrides,
    });

  describe('TwiML Generation', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should generate basic TwiML with URL', () => {
      const twiml = conversationRelay.generateTwiML({
        url: 'wss://example.com/conversation-relay',
      });

      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Connect>');
      expect(twiml).toContain('<ConversationRelay');
      expect(twiml).toContain('url="wss://example.com/conversation-relay"');
      expect(twiml).toContain('</Connect>');
      expect(twiml).toContain('</Response>');
    });

    it('should apply transcription configuration', () => {
      const twiml = conversationRelay.generateTwiML({
        url: 'wss://example.com/conversation-relay',
        transcriptionProvider: 'Deepgram',
        transcriptionLanguage: 'en-AU',
        speechModel: 'nova-3-general',
      });

      expect(twiml).toContain('transcriptionProvider="Deepgram"');
      expect(twiml).toContain('transcriptionLanguage="en-AU"');
      expect(twiml).toContain('speechModel="nova-3-general"');
    });

    it('should apply TTS configuration', () => {
      const twiml = conversationRelay.generateTwiML({
        url: 'wss://example.com/conversation-relay',
        ttsProvider: 'Google',
        voice: 'en-US-Journey-O',
      });

      expect(twiml).toContain('ttsProvider="Google"');
      expect(twiml).toContain('voice="en-US-Journey-O"');
    });

    it('should apply interaction configuration', () => {
      const twiml = conversationRelay.generateTwiML({
        url: 'wss://example.com/conversation-relay',
        interruptible: 'any',
        interruptSensitivity: 'high',
        dtmfDetection: true,
        hints: 'account balance, billing, payment',
      });

      expect(twiml).toContain('interruptible="any"');
      expect(twiml).toContain('dtmfDetection="true"');
      expect(twiml).toContain('hints="account balance, billing, payment"');
    });

    it('should filter out undefined attributes', () => {
      const twiml = conversationRelay.generateTwiML({
        url: 'wss://example.com/conversation-relay',
        interruptible: 'any',
        hints: undefined,
      });

      expect(twiml).toContain('interruptible="any"');
      expect(twiml).not.toContain('hints=');
    });

    it('should support multiple language configurations', () => {
      const twiml = conversationRelay.generateTwiML({
        url: 'wss://example.com/conversation-relay',
        language: 'en-AU',
        languages: [
          {
            code: 'en-AU',
            ttsProvider: 'ElevenLabs',
            voice: 'IKne3meq5aSn9XLyUdCD',
          },
          {
            code: 'es-ES',
            ttsProvider: 'Google',
            voice: 'es-ES-Standard-A',
          },
        ],
      });

      expect(twiml).toContain('language="en-AU"');
      expect(twiml).toContain('<Language code="en-AU"');
      expect(twiml).toContain('ttsProvider="ElevenLabs"');
      expect(twiml).toContain('<Language code="es-ES"');
      expect(twiml).toContain('voice="es-ES-Standard-A"');
    });

    it('should throw error for invalid configuration', () => {
      expect(() => {
        conversationRelay.generateTwiML({
          url: 'not-a-valid-url',
        });
      }).toThrow('Invalid ConversationRelay configuration');
    });

    it('should include custom parameters as child elements', () => {
      const twiml = conversationRelay.generateTwiML(
        {
          url: 'wss://example.com/conversation-relay',
        },
        {
          conversation_id: 'conv_test123',
          profile_id: 'mem_test456',
        }
      );

      expect(twiml).toContain('<Parameter name="conversation_id" value="conv_test123"');
      expect(twiml).toContain('<Parameter name="profile_id" value="mem_test456"');
    });

    it('should include action URL when provided', () => {
      const twiml = conversationRelay.generateTwiML(
        {
          url: 'wss://example.com/conversation-relay',
        },
        undefined,
        { actionUrl: 'https://example.com/callback' }
      );

      expect(twiml).toContain('action="https://example.com/callback"');
    });
  });

  describe('WebSocket Connection Handling', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should process setup message and create session', () => {
      const setupCallback = vi.fn();
      conversationRelay.onSessionStarted(setupCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      expect(setupCallback).toHaveBeenCalledTimes(1);
      const [session, data] = setupCallback.mock.calls[0];
      expect(session).toBeInstanceOf(ConversationRelaySession);
      expect(session.callSid).toBe('CA_test123');
      expect(session.from).toBe('+15551234567');
      expect(session.to).toBe('+15559876543');
      expect(data).toEqual(expect.objectContaining({ type: 'setup' }));
    });

    it('should route prompt message to callback', () => {
      const messageCallback = vi.fn();
      conversationRelay.onPrompt(messageCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      const promptMessage = JSON.stringify({
        type: 'prompt',
        voicePrompt: 'Hello, I need help',
        lang: 'en-US',
        last: false,
      });
      mockWs._emit('message', Buffer.from(promptMessage));

      expect(messageCallback).toHaveBeenCalledTimes(1);
      const [session, message, data] = messageCallback.mock.calls[0];
      expect(session).toBeInstanceOf(ConversationRelaySession);
      expect(session.callSid).toBe('CA_test123');
      expect(message).toBe('Hello, I need help');
      expect(data).toEqual(expect.objectContaining({ type: 'prompt', lang: 'en-US' }));
    });

    it('should route interrupt message to callback', () => {
      const interruptCallback = vi.fn();
      conversationRelay.onInterrupt(interruptCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      const interruptMessage = JSON.stringify({
        type: 'interrupt',
        utteranceUntilInterrupt: 'wait',
        durationUntilInterruptMs: 500,
      });
      mockWs._emit('message', Buffer.from(interruptMessage));

      expect(interruptCallback).toHaveBeenCalledTimes(1);
      const [session, data] = interruptCallback.mock.calls[0];
      expect(session.callSid).toBe('CA_test123');
      expect(data).toEqual(expect.objectContaining({ type: 'interrupt' }));
    });

    it('should route DTMF message to callback', () => {
      const dtmfCallback = vi.fn();
      conversationRelay.onDtmf(dtmfCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      const dtmfMessage = JSON.stringify({
        type: 'dtmf',
        digit: '5',
      });
      mockWs._emit('message', Buffer.from(dtmfMessage));

      expect(dtmfCallback).toHaveBeenCalledTimes(1);
      const [session, data] = dtmfCallback.mock.calls[0];
      expect(session.callSid).toBe('CA_test123');
      expect(data).toEqual(expect.objectContaining({ type: 'dtmf', digit: '5' }));
    });

    it('should handle invalid message gracefully', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const invalidMessage = JSON.stringify({
        type: 'unknown',
        data: 'invalid',
      });

      // Should not throw
      expect(() => {
        mockWs._emit('message', Buffer.from(invalidMessage));
      }).not.toThrow();
    });

    it('should handle multiple concurrent connections', () => {
      const setupCallback = vi.fn();
      conversationRelay.onSessionStarted(setupCallback);

      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      conversationRelay.handleConnection(mockWs1);
      conversationRelay.handleConnection(mockWs2);

      mockWs1._emit('message', Buffer.from(setupPayload('CA_test1', {
        sessionId: 'sess_test1',
        from: '+15551111111',
        to: '+15559999999',
      })));
      mockWs2._emit('message', Buffer.from(setupPayload('CA_test2', {
        sessionId: 'sess_test2',
        from: '+15552222222',
        to: '+15558888888',
      })));

      expect(setupCallback).toHaveBeenCalledTimes(2);
      expect(conversationRelay.hasSession('CA_test1' as CallSid)).toBe(true);
      expect(conversationRelay.hasSession('CA_test2' as CallSid)).toBe(true);
    });

    it('should invoke session ended callback on close', () => {
      const endedCallback = vi.fn();
      conversationRelay.onSessionEnded(endedCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(true);

      mockWs._emit('close');

      expect(endedCallback).toHaveBeenCalledTimes(1);
      const [session] = endedCallback.mock.calls[0];
      expect(session).toBeInstanceOf(ConversationRelaySession);
      expect(session.callSid).toBe('CA_test123');
      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(false);
    });
  });

  describe('Session Management', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should retrieve session by CallSid', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      const session = conversationRelay.getSession('CA_test123' as CallSid);

      expect(session).toBeDefined();
      expect(session?.callSid).toBe('CA_test123');
      expect(session?.from).toBe('+15551234567');
    });

    it('should return undefined for unknown session', () => {
      const session = conversationRelay.getSession('CA_unknown' as CallSid);
      expect(session).toBeUndefined();
    });

    it('should check session existence', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(true);
      expect(conversationRelay.hasSession('CA_unknown' as CallSid)).toBe(false);
    });
  });

  describe('Response Sending (via session)', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should send text via session with last=true default', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      const session = conversationRelay.getSession('CA_test123' as CallSid);
      session?.sendText('Hello there!');

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('text');
      expect(sentMessage.token).toBe('Hello there!');
      expect(sentMessage.last).toBe(true);
    });

    it('should send text with last=false when streaming', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupPayload('CA_test123')));

      const session = conversationRelay.getSession('CA_test123' as CallSid);
      session?.sendText('Streaming...', false);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.last).toBe(false);
    });

    it('getSession returns undefined for unknown CallSid', () => {
      // The CallSid-threading sendText is gone; out-of-band callers that only
      // have a CallSid must first resolve the session.
      expect(conversationRelay.getSession('CA_unknown' as CallSid)).toBeUndefined();
    });
  });

  describe('Connection Lifecycle', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should shutdown all connections', () => {
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      conversationRelay.handleConnection(mockWs1);
      conversationRelay.handleConnection(mockWs2);

      mockWs1._emit('message', Buffer.from(setupPayload('CA_test1', {
        sessionId: 'sess_test1',
        from: '+15551111111',
        to: '+15559999999',
      })));
      mockWs2._emit('message', Buffer.from(setupPayload('CA_test2', {
        sessionId: 'sess_test2',
        from: '+15552222222',
        to: '+15558888888',
      })));

      conversationRelay.shutdown();

      expect(mockWs1.close).toHaveBeenCalled();
      expect(mockWs2.close).toHaveBeenCalled();
      expect(conversationRelay.hasSession('CA_test1' as CallSid)).toBe(false);
      expect(conversationRelay.hasSession('CA_test2' as CallSid)).toBe(false);
    });

    it('should log error and return early for non-Buffer WebSocket data', () => {
      const testLogger = createTestLogger();
      const errorSpy = vi.spyOn(testLogger, 'error');
      const conversationRelay = new ConversationRelay(testLogger);
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      // Emit ArrayBuffer (edge case that should never happen with Twilio)
      const arrayBuffer = new TextEncoder().encode('{"type":"setup"}').buffer;
      mockWs._emit('message', arrayBuffer);

      // Should log error and not process message
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ data_type: 'ArrayBuffer' }),
        'Unexpected WebSocket data type - expected Buffer from ConversationRelay'
      );
    });
  });
});
