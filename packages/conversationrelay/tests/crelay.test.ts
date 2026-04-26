import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationRelay } from '../src/crelay';
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

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });

      mockWs._emit('message', Buffer.from(setupMessage));

      expect(setupCallback).toHaveBeenCalledTimes(1);
      expect(setupCallback).toHaveBeenCalledWith(
        'CA_test123',
        expect.objectContaining({
          callSid: 'CA_test123',
          from: '+15551234567',
          to: '+15559876543',
        }),
        expect.objectContaining({ type: 'setup' })
      );
    });

    it('should route prompt message to callback', () => {
      const messageCallback = vi.fn();
      conversationRelay.onPrompt(messageCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      // First send setup
      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      // Then send prompt
      const promptMessage = JSON.stringify({
        type: 'prompt',
        voicePrompt: 'Hello, I need help',
        lang: 'en-US',
        last: false,
      });
      mockWs._emit('message', Buffer.from(promptMessage));

      expect(messageCallback).toHaveBeenCalledTimes(1);
      expect(messageCallback).toHaveBeenCalledWith(
        'CA_test123',
        'Hello, I need help',
        expect.objectContaining({ type: 'prompt', lang: 'en-US' })
      );
    });

    it('should route interrupt message to callback', () => {
      const interruptCallback = vi.fn();
      conversationRelay.onInterrupt(interruptCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      const interruptMessage = JSON.stringify({
        type: 'interrupt',
        utteranceUntilInterrupt: 'wait',
        durationUntilInterruptMs: 500,
      });
      mockWs._emit('message', Buffer.from(interruptMessage));

      expect(interruptCallback).toHaveBeenCalledTimes(1);
      expect(interruptCallback).toHaveBeenCalledWith(
        'CA_test123',
        expect.objectContaining({ type: 'interrupt' })
      );
    });

    it('should route DTMF message to callback', () => {
      const dtmfCallback = vi.fn();
      conversationRelay.onDtmf(dtmfCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      const dtmfMessage = JSON.stringify({
        type: 'dtmf',
        digit: '5',
      });
      mockWs._emit('message', Buffer.from(dtmfMessage));

      expect(dtmfCallback).toHaveBeenCalledTimes(1);
      expect(dtmfCallback).toHaveBeenCalledWith(
        'CA_test123',
        expect.objectContaining({ type: 'dtmf', digit: '5' })
      );
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

      const setupMessage1 = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test1',
        callSid: 'CA_test1',
        from: '+15551111111',
        to: '+15559999999',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });

      const setupMessage2 = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test2',
        callSid: 'CA_test2',
        from: '+15552222222',
        to: '+15558888888',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });

      mockWs1._emit('message', Buffer.from(setupMessage1));
      mockWs2._emit('message', Buffer.from(setupMessage2));

      expect(setupCallback).toHaveBeenCalledTimes(2);
      expect(conversationRelay.hasSession('CA_test1' as CallSid)).toBe(true);
      expect(conversationRelay.hasSession('CA_test2' as CallSid)).toBe(true);
    });

    it('should invoke session ended callback on close', () => {
      const endedCallback = vi.fn();
      conversationRelay.onSessionEnded(endedCallback);

      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(true);

      mockWs._emit('close');

      expect(endedCallback).toHaveBeenCalledTimes(1);
      expect(endedCallback).toHaveBeenCalledWith('CA_test123');
      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(false);
    });
  });

  describe('Session Management', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should retrieve session data', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

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

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(true);
      expect(conversationRelay.hasSession('CA_unknown' as CallSid)).toBe(false);
    });
  });

  describe('Response Sending', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should send response message', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      conversationRelay.sendText('CA_test123' as CallSid, 'Hello there!');

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('text');
      expect(sentMessage.token).toBe('Hello there!');
      expect(sentMessage.last).toBe(true);
    });

    it('should send response with last flag false', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      conversationRelay.sendText('CA_test123' as CallSid, 'Streaming...', false);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.last).toBe(false);
    });

    it('should throw error when connection not found', () => {
      expect(() => {
        conversationRelay.sendText('CA_unknown' as CallSid, 'Hello');
      }).toThrow('No WebSocket connection found');
    });
  });

  describe('Connection Lifecycle', () => {
    let conversationRelay: ConversationRelay;

    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('should get WebSocket for CallSid', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      const ws = conversationRelay.getWebSocket('CA_test123' as CallSid);
      expect(ws).toBe(mockWs);
    });

    it('should return null for unknown CallSid', () => {
      const ws = conversationRelay.getWebSocket('CA_unknown' as CallSid);
      expect(ws).toBeNull();
    });

    it('should close specific connection', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: 'CA_test123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });
      mockWs._emit('message', Buffer.from(setupMessage));

      conversationRelay.closeConnection('CA_test123' as CallSid);

      expect(mockWs.close).toHaveBeenCalled();
      expect(conversationRelay.hasSession('CA_test123' as CallSid)).toBe(false);
    });

    it('should shutdown all connections', () => {
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      conversationRelay.handleConnection(mockWs1);
      conversationRelay.handleConnection(mockWs2);

      const setupMessage1 = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test1',
        callSid: 'CA_test1',
        from: '+15551111111',
        to: '+15559999999',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });

      const setupMessage2 = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_test2',
        callSid: 'CA_test2',
        from: '+15552222222',
        to: '+15558888888',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest',
      });

      mockWs1._emit('message', Buffer.from(setupMessage1));
      mockWs2._emit('message', Buffer.from(setupMessage2));

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
