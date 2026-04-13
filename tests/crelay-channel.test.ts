import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CRelayChannel, createLogger } from '@twilio/tac-core';
import type { ChannelMessage } from '@twilio/tac-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const logger = createLogger({ name: 'test', level: 'silent' });

const CALL_SID = 'CA1234567890abcdef1234567890abcdef';

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
    simulateClose() {
      for (const h of handlers['close'] || []) {
        h();
      }
    },
  };
}

const setupMsg = {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CRelayChannel', () => {
  let channel: CRelayChannel;

  beforeEach(() => {
    channel = new CRelayChannel(logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Initialization
  // =========================================================================

  describe('initialization', () => {
    it('should create with channelType voice', () => {
      expect(channel).toBeInstanceOf(CRelayChannel);
      expect(channel.channelType).toBe('voice');
    });

    it('should start with no active conversations', () => {
      expect(channel.isConversationActive(CALL_SID)).toBe(false);
      expect(channel.getConversationSession(CALL_SID)).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. Event normalization
  // =========================================================================

  describe('event normalization', () => {
    it('should emit setup as system message', async () => {
      let capturedMessage: ChannelMessage | null = null;
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.sessionId).toBe(CALL_SID);
      expect(capturedMessage!.messageType).toBe('system');
      expect(capturedMessage!.channel).toBe('voice');
      expect(capturedMessage!.message).toContain('+15551234567');
      expect(capturedMessage!.message).toContain('+15559876543');
      expect(capturedMessage!.message).toContain(CALL_SID);
      expect(capturedMessage!.metadata?.type).toBe('setup');
      expect(capturedMessage!.metadata?.callSid).toBe(CALL_SID);
      expect(capturedMessage!.metadata?.from).toBe('+15551234567');
      expect(capturedMessage!.metadata?.to).toBe('+15559876543');
      expect(capturedMessage!.metadata?.direction).toBe('inbound');
      // No conversation property in CR-only mode
      expect(capturedMessage!.conversation).toBeUndefined();
    });

    it('should emit prompt as user message', async () => {
      let capturedMessage: ChannelMessage | null = null;
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      // Need setup first to establish callSid
      mockWs.simulateMessage(setupMsg);

      // Reset to capture next message
      capturedMessage = null;

      const promptMsg = {
        type: 'prompt',
        voicePrompt: 'Hello, I need help',
        lang: 'en-US',
        last: true,
      };
      mockWs.simulateMessage(promptMsg);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.sessionId).toBe(CALL_SID);
      expect(capturedMessage!.messageType).toBe('user');
      expect(capturedMessage!.message).toBe('Hello, I need help');
      expect(capturedMessage!.channel).toBe('voice');
      expect(capturedMessage!.metadata?.type).toBe('prompt');
      expect(capturedMessage!.metadata?.lang).toBe('en-US');
      expect(capturedMessage!.metadata?.last).toBe(true);
      expect(capturedMessage!.conversation).toBeUndefined();
    });

    it('should emit interrupt as system message with full metadata', async () => {
      let capturedMessage: ChannelMessage | null = null;
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);
      capturedMessage = null;

      const interruptMsg = {
        type: 'interrupt',
        utteranceUntilInterrupt: 'Life is a complex set of',
        durationUntilInterruptMs: 460,
      };
      mockWs.simulateMessage(interruptMsg);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.sessionId).toBe(CALL_SID);
      expect(capturedMessage!.messageType).toBe('system');
      expect(capturedMessage!.channel).toBe('voice');
      expect(capturedMessage!.message).toContain('460ms');
      expect(capturedMessage!.message).toContain('Life is a complex set of');
      expect(capturedMessage!.metadata?.type).toBe('interrupt');
      expect(capturedMessage!.metadata?.utteranceUntilInterrupt).toBe('Life is a complex set of');
      expect(capturedMessage!.metadata?.durationUntilInterruptMs).toBe(460);
      expect(capturedMessage!.conversation).toBeUndefined();
    });

    it('should emit dtmf as system message', async () => {
      let capturedMessage: ChannelMessage | null = null;
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);
      capturedMessage = null;

      const dtmfMsg = { type: 'dtmf', digit: '5' };
      mockWs.simulateMessage(dtmfMsg);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.sessionId).toBe(CALL_SID);
      expect(capturedMessage!.messageType).toBe('system');
      expect(capturedMessage!.channel).toBe('voice');
      expect(capturedMessage!.message).toContain('pressed 5');
      expect(capturedMessage!.metadata?.type).toBe('dtmf');
      expect(capturedMessage!.metadata?.digit).toBe('5');
      expect(capturedMessage!.conversation).toBeUndefined();
    });

    it('should emit info as system message', async () => {
      let capturedMessage: ChannelMessage | null = null;
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);
      capturedMessage = null;

      const infoMsg = { type: 'info', info: { key: 'value' } };
      mockWs.simulateMessage(infoMsg);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.sessionId).toBe(CALL_SID);
      expect(capturedMessage!.messageType).toBe('system');
      expect(capturedMessage!.channel).toBe('voice');
      expect(capturedMessage!.metadata?.type).toBe('info');
      expect(capturedMessage!.metadata?.info).toEqual({ key: 'value' });
      expect(capturedMessage!.conversation).toBeUndefined();
    });

    it('should mark conversation active after setup', () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);

      expect(channel.isConversationActive(CALL_SID)).toBe(false);

      mockWs.simulateMessage(setupMsg);

      expect(channel.isConversationActive(CALL_SID)).toBe(true);
    });

    it('should fire conversationStarted callback on setup', () => {
      const startedCallback = vi.fn();
      channel.on('conversationStarted', startedCallback);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      expect(startedCallback).toHaveBeenCalledTimes(1);
      expect(startedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            sessionId: CALL_SID,
            channel: 'voice',
          }),
        })
      );
    });
  });

  // =========================================================================
  // 3. Session lifecycle
  // =========================================================================

  describe('session lifecycle', () => {
    it('should create session on setup and return it via getConversationSession', () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      const session = channel.getConversationSession(CALL_SID);
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe(CALL_SID);
      expect(session!.channel).toBe('voice');
      expect(session!.startedAt).toBeInstanceOf(Date);
    });

    it('should remove session on WebSocket close', async () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      expect(channel.isConversationActive(CALL_SID)).toBe(true);

      mockWs.simulateClose();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive(CALL_SID)).toBe(false);
      expect(channel.getConversationSession(CALL_SID)).toBeUndefined();
    });

    it('should fire conversationEnded callback on WebSocket close', async () => {
      const endedCallback = vi.fn();
      channel.on('conversationEnded', endedCallback);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      mockWs.simulateClose();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(endedCallback).toHaveBeenCalledTimes(1);
      expect(endedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            sessionId: CALL_SID,
            channel: 'voice',
          }),
        })
      );
    });

    it('should support async conversationEnded callback', async () => {
      const captured: string[] = [];
      channel.on('conversationEnded', async ({ session }) => {
        captured.push(session.sessionId);
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);
      expect(channel.isConversationActive(CALL_SID)).toBe(true);

      mockWs.simulateClose();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(captured).toHaveLength(1);
      expect(captured[0]).toBe(CALL_SID);
      expect(channel.isConversationActive(CALL_SID)).toBe(false);
    });

    it('should clean up silently when no conversationEnded callback is registered', async () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);
      expect(channel.isConversationActive(CALL_SID)).toBe(true);

      mockWs.simulateClose();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive(CALL_SID)).toBe(false);
    });

    it('should handle multiple concurrent sessions', () => {
      const callSid2 = 'CAfedcba0987654321fedcba0987654321';
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      channel.handleWebSocketConnection(mockWs1);
      channel.handleWebSocketConnection(mockWs2);

      mockWs1.simulateMessage(setupMsg);
      mockWs2.simulateMessage({
        ...setupMsg,
        callSid: callSid2,
        sessionId: 'sess_test2',
      });

      expect(channel.isConversationActive(CALL_SID)).toBe(true);
      expect(channel.isConversationActive(callSid2)).toBe(true);
    });
  });

  // =========================================================================
  // 4. sendResponse
  // =========================================================================

  describe('sendResponse', () => {
    it('should delegate to CRelayVoice which sends via WebSocket', async () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      await channel.sendResponse(CALL_SID, 'Hello from the bot');

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData).toEqual({
        type: 'text',
        token: 'Hello from the bot',
        last: true,
      });
    });

    it('should throw when no WebSocket connection exists for the session', async () => {
      // CRelayVoice.sendResponse errors are now async promise rejections
      await expect(channel.sendResponse(CALL_SID, 'test')).rejects.toThrow(
        /No WebSocket connection found/
      );
    });

    it('should call onError callback when sendResponse fails', async () => {
      const errorCallback = vi.fn();
      channel.on('error', errorCallback);

      await expect(channel.sendResponse(CALL_SID, 'test message')).rejects.toThrow();

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          context: expect.objectContaining({
            callSid: CALL_SID,
            message: 'test message',
          }),
        })
      );
    });

    it('should include metadata in error context when provided', async () => {
      const errorCallback = vi.fn();
      channel.on('error', errorCallback);
      const metadata = { custom: 'data' };

      await expect(channel.sendResponse(CALL_SID, 'test', metadata)).rejects.toThrow();

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          context: expect.objectContaining({
            callSid: CALL_SID,
            message: 'test',
            metadata,
          }),
        })
      );
    });

    it('should handle WebSocket not open error', async () => {
      const mockWs = createMockWebSocket();
      mockWs.readyState = 0; // WebSocket.CONNECTING
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      const errorCallback = vi.fn();
      channel.on('error', errorCallback);

      // This should fail because WebSocket is not OPEN
      await expect(channel.sendResponse(CALL_SID, 'test')).rejects.toThrow(/not open/);
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. No Maestro code paths
  // =========================================================================

  describe('no Maestro code paths', () => {
    it('should construct with only a Logger (no config, no conversationClient)', () => {
      // The constructor signature is: constructor(logger: Logger)
      // This test just verifies the channel works without Maestro deps
      const ch = new CRelayChannel(createLogger({ name: 'bare', level: 'silent' }));
      expect(ch.channelType).toBe('voice');
    });

    it('should emit messages without conversation property', async () => {
      let capturedMessage: ChannelMessage | null = null;
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.conversation).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. shutdown
  // =========================================================================

  describe('shutdown', () => {
    it('should clear active conversations', () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      expect(channel.isConversationActive(CALL_SID)).toBe(true);

      channel.shutdown();

      expect(channel.isConversationActive(CALL_SID)).toBe(false);
      expect(channel.getConversationSession(CALL_SID)).toBeUndefined();
    });

    it('should close underlying WebSocket connections', () => {
      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      channel.shutdown();

      // CRelayVoice.shutdown() calls ws.close() on all connections
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. handleIncomingCall
  // =========================================================================

  describe('handleIncomingCall', () => {
    it('should return a TwiML string', () => {
      const twiml = channel.handleIncomingCall({
        callSid: CALL_SID,
        conversationRelayConfig: {
          url: 'wss://example.com/ws',
          welcomeGreeting: 'Hi there!',
        },
      });

      expect(typeof twiml).toBe('string');
      expect(twiml).toContain('ConversationRelay');
      expect(twiml).toContain('wss://example.com/ws');
      expect(twiml).toContain('Hi there!');
    });

    it('should throw if callSid is empty', () => {
      expect(() =>
        channel.handleIncomingCall({
          callSid: '',
          conversationRelayConfig: {
            url: 'wss://example.com/ws',
          },
        })
      ).toThrow('callSid is required');
    });

    it('should include actionUrl in TwiML when provided', () => {
      const twiml = channel.handleIncomingCall({
        callSid: CALL_SID,
        conversationRelayConfig: {
          url: 'wss://example.com/ws',
        },
        actionUrl: 'https://example.com/action',
      });

      expect(twiml).toContain('action="https://example.com/action"');
    });

    it('should include conversation_id parameter in TwiML', () => {
      const twiml = channel.handleIncomingCall({
        callSid: CALL_SID,
        conversationRelayConfig: {
          url: 'wss://example.com/ws',
        },
      });

      // The callSid is passed as conversation_id custom parameter
      expect(twiml).toContain('conversation_id');
      expect(twiml).toContain(CALL_SID);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('should fire error callback on CRelayVoice error event', async () => {
      const errorCallback = vi.fn();
      channel.on('error', errorCallback);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs.simulateMessage(setupMsg);

      // Simulate an error message from ConversationRelay
      mockWs.simulateMessage({
        type: 'error',
        description: 'Something went wrong',
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          context: expect.objectContaining({ callSid: CALL_SID }),
        })
      );
    });
  });
});
