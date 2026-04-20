import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '@twilio/tac-core';
import { ConversationRelay } from '@twilio/tac-conversationrelay';
import type { CallSid } from '@twilio/tac-conversationrelay';

describe('ConversationRelay Protocol Methods', () => {
  let conversationRelay: ConversationRelay;
  const logger = createLogger({ name: 'test', level: 'silent' });
  const CALL_SID: CallSid = 'CA1234567890abcdef1234567890abcdef' as CallSid;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createMockWebSocket(): any {
    const handlers: Record<string, ((...args: any[]) => void)[]> = {};
    return {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // WebSocket.OPEN
      _handlers: handlers,
      simulateMessage(data: unknown) {
        for (const h of handlers['message'] || []) {
          h(Buffer.from(JSON.stringify(data)));
        }
      },
    };
  }

  beforeEach(() => {
    conversationRelay = new ConversationRelay(logger);
  });

  afterEach(() => {
    conversationRelay.shutdown();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // sendPlay
  // =========================================================================

  describe('sendPlay', () => {
    it('should send play message with source only', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);

      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3');

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'play',
          source: 'https://example.com/audio.mp3',
        })
      );
    });

    it('should send play message with loop option', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3', { loop: 3 });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        loop: 3,
      });
    });

    it('should send play message with interruptible option', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3', { interruptible: true });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        interruptible: true,
      });
    });

    it('should send play message with all options', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3', {
        loop: 5,
        interruptible: true,
        preemptible: false,
      });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        loop: 5,
        interruptible: true,
        preemptible: false,
      });
    });

    it('should throw when no WebSocket connection exists', () => {
      expect(() => conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3')).toThrow(
        /No WebSocket connection found/
      );
    });

    it('should throw when WebSocket is not open', () => {
      const mockWs = createMockWebSocket();
      mockWs.readyState = 0; // WebSocket.CONNECTING
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      expect(() => conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3')).toThrow(
        /WebSocket not open/
      );
    });
  });

  // =========================================================================
  // sendDigits
  // =========================================================================

  describe('sendDigits', () => {
    it('should send DTMF digits message', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendDigits(CALL_SID, '1234');

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'sendDigits',
          digits: '1234',
        })
      );
    });

    it('should send digits with pauses', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendDigits(CALL_SID, '123w456w789');

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.digits).toBe('123w456w789');
    });

    it('should throw when no WebSocket connection exists', () => {
      expect(() => conversationRelay.sendDigits(CALL_SID, '123')).toThrow(/No WebSocket connection found/);
    });
  });

  // =========================================================================
  // switchLanguage
  // =========================================================================

  describe('switchLanguage', () => {
    it('should send language message with TTS only', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.switchLanguage(CALL_SID, { ttsLanguage: 'es-ES' });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'language',
        ttsLanguage: 'es-ES',
      });
    });

    it('should send language message with transcription only', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.switchLanguage(CALL_SID, { transcriptionLanguage: 'fr-FR' });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'language',
        transcriptionLanguage: 'fr-FR',
      });
    });

    it('should send language message with both TTS and transcription', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.switchLanguage(CALL_SID, {
        ttsLanguage: 'de-DE',
        transcriptionLanguage: 'de-DE',
      });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'language',
        ttsLanguage: 'de-DE',
        transcriptionLanguage: 'de-DE',
      });
    });

    it('should throw when no WebSocket connection exists', () => {
      expect(() => conversationRelay.switchLanguage(CALL_SID, { ttsLanguage: 'es-ES' })).toThrow(
        /No WebSocket connection found/
      );
    });
  });

  // =========================================================================
  // endCall
  // =========================================================================

  describe('endCall', () => {
    it('should send end message without handoff data', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.endCall(CALL_SID);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'end',
      });
    });

    it('should send end message with handoff data', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      const handoffData = {
        reasonCode: 'live-agent-handoff',
        issueType: 'billing',
        priority: 'high',
      };

      conversationRelay.endCall(CALL_SID, handoffData);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe('end');
      expect(sentData.handoffData).toBeDefined();

      const parsedHandoff = JSON.parse(sentData.handoffData);
      expect(parsedHandoff).toEqual(handoffData);
    });

    it('should send end message with empty handoff data object', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.endCall(CALL_SID, {});

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe('end');
      expect(sentData.handoffData).toBe('{}');
    });

    it('should throw when no WebSocket connection exists', () => {
      expect(() => conversationRelay.endCall(CALL_SID)).toThrow(/No WebSocket connection found/);
    });
  });

  // =========================================================================
  // Protocol method integration
  // =========================================================================

  describe('protocol method integration', () => {
    it('should allow sending multiple protocol messages in sequence', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3');
      conversationRelay.sendDigits(CALL_SID, '123');
      conversationRelay.switchLanguage(CALL_SID, { ttsLanguage: 'es-ES' });

      expect(mockWs.send).toHaveBeenCalledTimes(3);

      const messages = mockWs.send.mock.calls.map((call: any[]) => JSON.parse(call[0] as string));
      expect(messages[0].type).toBe('play');
      expect(messages[1].type).toBe('sendDigits');
      expect(messages[2].type).toBe('language');
    });

    it('should work alongside existing sendResponse method', () => {
      const mockWs = createMockWebSocket();
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage({
        type: 'setup',
        sessionId: 'sess_test',
        callSid: CALL_SID,
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
      });

      conversationRelay.sendResponse(CALL_SID, 'Hello');
      conversationRelay.sendPlay(CALL_SID, 'https://example.com/audio.mp3');

      expect(mockWs.send).toHaveBeenCalledTimes(2);

      const messages = mockWs.send.mock.calls.map((call: any[]) => JSON.parse(call[0] as string));
      expect(messages[0].type).toBe('text');
      expect(messages[1].type).toBe('play');
    });
  });
});
