import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import type { CallSid } from '../src/types';

/**
 * Session-level protocol senders: sendPlay / sendDigits / switchLanguage / endCall.
 * Invoked on the `ConversationRelaySession` handle — callers never thread a
 * CallSid through. Out-of-band lookups (tests, status-callback webhooks) resolve
 * the session via `cr.getSession(callSid)` first.
 */
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

  const setupPayload = {
    type: 'setup',
    sessionId: 'sess_test',
    callSid: CALL_SID,
    from: '+15551234567',
    to: '+15559876543',
    direction: 'inbound',
    callType: 'PSTN',
    callStatus: 'ringing',
    accountSid: 'ACtest123',
  };

  function startSession() {
    const mockWs = createMockWebSocket();
    conversationRelay.handleConnection(mockWs);
    mockWs.simulateMessage(setupPayload);
    const session = conversationRelay.getSession(CALL_SID)!;
    return { mockWs, session };
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
      const { mockWs, session } = startSession();

      session.sendPlay('https://example.com/audio.mp3');

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'play',
          source: 'https://example.com/audio.mp3',
        })
      );
    });

    it('should send play message with loop option', () => {
      const { mockWs, session } = startSession();
      session.sendPlay('https://example.com/audio.mp3', { loop: 3 });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        loop: 3,
      });
    });

    it('should send play message with interruptible option', () => {
      const { mockWs, session } = startSession();
      session.sendPlay('https://example.com/audio.mp3', { interruptible: true });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        interruptible: true,
      });
    });

    it('should send play message with all options', () => {
      const { mockWs, session } = startSession();
      session.sendPlay('https://example.com/audio.mp3', {
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

    it('getSession returns undefined when no session exists for a CallSid', () => {
      // The old "No WebSocket connection found" error came from the
      // manager-level sendPlay(callSid,...) path, which is gone. Callers
      // that hold only a CallSid now resolve via getSession first and see
      // `undefined` instead of a throw — a cleaner contract.
      expect(conversationRelay.getSession(CALL_SID)).toBeUndefined();
    });

    it('should throw when WebSocket is not open', () => {
      const mockWs = createMockWebSocket();
      mockWs.readyState = 0; // WebSocket.CONNECTING
      conversationRelay.handleConnection(mockWs);
      mockWs.simulateMessage(setupPayload);
      const session = conversationRelay.getSession(CALL_SID)!;

      expect(() => session.sendPlay('https://example.com/audio.mp3')).toThrow(
        /WebSocket not open/
      );
    });
  });

  // =========================================================================
  // sendDigits
  // =========================================================================

  describe('sendDigits', () => {
    it('should send DTMF digits message', () => {
      const { mockWs, session } = startSession();
      session.sendDigits('1234');

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'sendDigits',
          digits: '1234',
        })
      );
    });

    it('should send digits with pauses', () => {
      const { mockWs, session } = startSession();
      session.sendDigits('123w456w789');

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.digits).toBe('123w456w789');
    });
  });

  // =========================================================================
  // switchLanguage
  // =========================================================================

  describe('switchLanguage', () => {
    it('should send language message with TTS only', () => {
      const { mockWs, session } = startSession();
      session.switchLanguage({ ttsLanguage: 'es-ES' });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'language',
        ttsLanguage: 'es-ES',
      });
    });

    it('should send language message with transcription only', () => {
      const { mockWs, session } = startSession();
      session.switchLanguage({ transcriptionLanguage: 'fr-FR' });

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'language',
        transcriptionLanguage: 'fr-FR',
      });
    });

    it('should send language message with both TTS and transcription', () => {
      const { mockWs, session } = startSession();
      session.switchLanguage({
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
  });

  // =========================================================================
  // endCall
  // =========================================================================

  describe('endCall', () => {
    it('should send end message without handoff data', () => {
      const { mockWs, session } = startSession();
      session.endCall();

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({ type: 'end' });
    });

    it('should send end message with handoff data', () => {
      const { mockWs, session } = startSession();
      const handoffData = {
        reasonCode: 'live-agent-handoff',
        issueType: 'billing',
        priority: 'high',
      };

      session.endCall(handoffData);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe('end');
      expect(sentData.handoffData).toBeDefined();

      const parsedHandoff = JSON.parse(sentData.handoffData);
      expect(parsedHandoff).toEqual(handoffData);
    });

    it('should send end message with empty handoff data object', () => {
      const { mockWs, session } = startSession();
      session.endCall({});

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe('end');
      expect(sentData.handoffData).toBe('{}');
    });
  });

  // =========================================================================
  // Protocol method integration
  // =========================================================================

  describe('protocol method integration', () => {
    it('should allow sending multiple protocol messages in sequence', () => {
      const { mockWs, session } = startSession();

      session.sendPlay('https://example.com/audio.mp3');
      session.sendDigits('123');
      session.switchLanguage({ ttsLanguage: 'es-ES' });

      expect(mockWs.send).toHaveBeenCalledTimes(3);

      const messages = mockWs.send.mock.calls.map((call: any[]) => JSON.parse(call[0] as string));
      expect(messages[0].type).toBe('play');
      expect(messages[1].type).toBe('sendDigits');
      expect(messages[2].type).toBe('language');
    });

    it('should work alongside sendText method', () => {
      const { mockWs, session } = startSession();

      session.sendText('Hello');
      session.sendPlay('https://example.com/audio.mp3');

      expect(mockWs.send).toHaveBeenCalledTimes(2);

      const messages = mockWs.send.mock.calls.map((call: any[]) => JSON.parse(call[0] as string));
      expect(messages[0].type).toBe('text');
      expect(messages[1].type).toBe('play');
    });
  });
});
