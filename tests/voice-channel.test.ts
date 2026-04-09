import { describe, it, expect, vi } from 'vitest';
import {
  VoiceChannel,
  TAC,
  TACConfig,
  ConversationSession,
  TACMode,
  createLogger,
  ConversationClient,
  ConversationId,
} from '@twilio/tac-core';

describe('VoiceChannel', () => {
  const getTestConfig = () => ({
    environment: 'prod' as const,
    tacMode: 'conversation' as TACMode,
    twilioAccountSid: 'ACtest123',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'test_api_key',
    twilioApiToken: 'test_api_token',
    twilioPhoneNumber: '+15551234567',
    conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  const createVoiceChannel = (overrides?: { conversationClient?: Partial<ConversationClient> }) => {
    const config = new TACConfig(getTestConfig());
    const logger = createLogger({ name: 'test', level: 'silent' });
    const conversationClient = {
      createConversation: vi.fn(),
      addParticipant: vi.fn(),
      listConversations: vi.fn(),
      updateConversation: vi.fn(),
      listParticipants: vi.fn(),
      sendCommunication: vi.fn(),
      listCommunications: vi.fn(),
      ...overrides?.conversationClient,
    } as unknown as ConversationClient;

    const channel = new VoiceChannel({ config, logger, conversationClient });
    return { channel, config, logger, conversationClient };
  };

  describe('getWebsocket()', () => {
    it('should return null for unknown conversation', () => {
      const { channel } = createVoiceChannel();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ws = channel.getWebsocket('CA_unknown' as any);
      expect(ws).toBeNull();
    });
  });

  describe('isConversationActive()', () => {
    it('should return false for unknown conversation', () => {
      const { channel } = createVoiceChannel();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isActive = channel.isConversationActive('CA_unknown' as any);
      expect(isActive).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('should clear WebSocket references on shutdown', () => {
      const { channel } = createVoiceChannel();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(channel.getWebsocket('CH_test' as any)).toBeNull();
      channel.shutdown();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(channel.getWebsocket('CH_test' as any)).toBeNull();
    });
  });

  describe('handleIncomingCall', () => {
    it('should apply conversationRelayConfig to generated TwiML', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      vi.spyOn(conversationClient, 'createConversation').mockResolvedValue({
        id: 'CH_test',
      } as any);
      vi.spyOn(conversationClient, 'addParticipant').mockResolvedValue({
        id: 'PA_test',
        profileId: 'mem_test',
      } as any);

      const twiml = await channel.handleIncomingCall({
        toNumber: '+15559876543',
        fromNumber: '+15551234567',
        conversationRelayConfig: {
          url: 'wss://example.com/conversation-relay',
          transcriptionProvider: 'Deepgram',
          interruptible: 'any',
          hints: 'technical support, billing',
        },
      });

      expect(twiml).toContain('transcriptionProvider="Deepgram"');
      expect(twiml).toContain('interruptible="any"');
      expect(twiml).toContain('hints="technical support, billing"');
    });

    it('should apply multi-language config to handleIncomingCall', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      vi.spyOn(conversationClient, 'createConversation').mockResolvedValue({
        id: 'CH_test',
      } as any);
      vi.spyOn(conversationClient, 'addParticipant').mockResolvedValue({
        id: 'PA_test',
        profileId: 'mem_test',
      } as any);

      const twiml = await channel.handleIncomingCall({
        toNumber: '+15559876543',
        fromNumber: '+15551234567',
        conversationRelayConfig: {
          url: 'wss://example.com/conversation-relay',
          language: 'en-US',
          languages: [
            {
              code: 'en-US',
              ttsProvider: 'Google',
              voice: 'en-US-Journey-O',
            },
            {
              code: 'es-ES',
              ttsProvider: 'Google',
              voice: 'es-ES-Standard-A',
            },
          ],
        },
      });

      expect(twiml).toContain('language="en-US"');
      expect(twiml).toContain('<Language code="en-US"');
      expect(twiml).toContain('<Language code="es-ES"');
    });

    it('should include welcomeGreeting in TwiML', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      vi.spyOn(conversationClient, 'createConversation').mockResolvedValue({
        id: 'CH_test',
      } as any);
      vi.spyOn(conversationClient, 'addParticipant').mockResolvedValue({
        id: 'PA_test',
        profileId: 'mem_test',
      } as any);

      const twiml = await channel.handleIncomingCall({
        toNumber: '+15559876543',
        fromNumber: '+15551234567',
        conversationRelayConfig: {
          url: 'wss://example.com/conversation-relay',
          welcomeGreeting: 'Hello! How can I help you today?',
        },
      });

      expect(twiml).toContain('welcomeGreeting="Hello! How can I help you today?"');
    });
  });

  describe('conversation ended callback', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createMockWebSocket = (): any => {
      const handlers: Record<string, ((...args: any[]) => void)[]> = {};
      return {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
        }),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        _handlers: handlers,
        _emit(event: string, ...args: any[]) {
          for (const h of handlers[event] || []) {
            h(...args);
          }
        },
      };
    };

    const setupMessage = JSON.stringify({
      type: 'setup',
      sessionId: 'sess_cb_test',
      callSid: 'CA_cb_test',
      from: '+15551234567',
      to: '+15559876543',
      direction: 'inbound',
      callType: 'PSTN',
      callStatus: 'ringing',
      accountSid: 'ACtest123',
      customParameters: {
        conversation_id: 'conv_conversation_01callback123test',
        profile_id: 'mem_profile_cb_test',
      },
    });

    it('should fire onConversationEnded on WebSocket disconnect', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });
      const { channel } = createVoiceChannel();
      const captured: ConversationSession[] = [];

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(({ session }) => {
          captured.push(session);
          resolve();
        });
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01callback123test')).toBe(true);

      mockWs._emit('close');
      await ended;

      expect(captured).toHaveLength(1);
      expect(captured[0].sessionId).toBe('conv_conversation_01callback123test');
      expect(captured[0].channel).toBe('voice');
    });

    it('should still clean up session if callback throws', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });
      const { channel } = createVoiceChannel();

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(() => {
          resolve();
          throw new Error('boom');
        });
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01callback123test')).toBe(true);

      mockWs._emit('close');
      await ended;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive('conv_conversation_01callback123test')).toBe(false);
    });

    it('should support async callback', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });
      const { channel } = createVoiceChannel();
      const captured: ConversationSession[] = [];

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(async ({ session }) => {
          captured.push(session);
          resolve();
        });
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));

      mockWs._emit('close');
      await ended;

      expect(captured).toHaveLength(1);
      expect(captured[0].sessionId).toBe('conv_conversation_01callback123test');
    });

    it('should clean up silently when no callback is registered', async () => {
      const { channel } = createVoiceChannel();

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01callback123test')).toBe(true);

      mockWs._emit('close');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive('conv_conversation_01callback123test')).toBe(false);
    });
  });

  describe('handleConversationRelayCallback()', () => {
    it('should return 200 OK for completed call without conversations', async () => {
      const { channel, conversationClient } = createVoiceChannel();
      vi.spyOn(conversationClient, 'listConversations').mockResolvedValue([]);

      const result = await channel.handleConversationRelayCallback({
        AccountSid: 'ACtest123',
        CallSid: 'CA123',
        CallStatus: 'completed',
        From: '+15551234567',
        To: '+15559876543',
      });

      expect(result.status).toBe(200);
      expect(result.content).toBe('OK');
      expect(result.contentType).toBe('text/plain');
    });

    it('should return 501 when handoff requested but no handler registered', async () => {
      const { channel } = createVoiceChannel();

      const result = await channel.handleConversationRelayCallback({
        AccountSid: 'ACtest123',
        CallSid: 'CA123',
        CallStatus: 'in-progress',
        From: '+15551234567',
        To: '+15559876543',
        HandoffData: JSON.stringify({ reason: 'User requested agent' }),
      });

      expect(result.status).toBe(501);
      expect(result.content).toBe('No handoff handler registered');
    });

    it('should call handoff handler when provided', async () => {
      const { channel } = createVoiceChannel();
      const handoffHandler = vi
        .fn()
        .mockResolvedValue('<Response><Say>Transferring...</Say></Response>');

      const payload = {
        AccountSid: 'ACtest123',
        CallSid: 'CA123',
        CallStatus: 'in-progress',
        From: '+15551234567',
        To: '+15559876543',
        HandoffData: JSON.stringify({ reason: 'User requested agent' }),
      };

      const result = await channel.handleConversationRelayCallback(payload, handoffHandler);

      expect(handoffHandler).toHaveBeenCalledWith(payload);
      expect(result.status).toBe(200);
      expect(result.content).toBe('<Response><Say>Transferring...</Say></Response>');
      expect(result.contentType).toBe('application/xml');
    });

    it('should return 500 when handoff handler throws', async () => {
      const { channel } = createVoiceChannel();
      const handoffHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      const result = await channel.handleConversationRelayCallback(
        {
          AccountSid: 'ACtest123',
          CallSid: 'CA123',
          CallStatus: 'in-progress',
          From: '+15551234567',
          To: '+15559876543',
          HandoffData: JSON.stringify({ reason: 'Transfer' }),
        },
        handoffHandler
      );

      expect(result.status).toBe(500);
      expect(result.content).toBe('Handoff handler error');
    });

    it('should close conversations on call completion', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      const mockConversation = { id: 'conv_conversation_01testconv' };
      const listSpy = vi
        .spyOn(conversationClient, 'listConversations')
        .mockResolvedValue([mockConversation] as any);
      const updateSpy = vi
        .spyOn(conversationClient, 'updateConversation')
        .mockResolvedValue({} as any);

      await channel.handleConversationRelayCallback({
        AccountSid: 'ACtest123',
        CallSid: 'CA123',
        CallStatus: 'completed',
        From: '+15551234567',
        To: '+15559876543',
      });

      expect(listSpy).toHaveBeenCalledWith({ channelId: 'CA123' });
      expect(updateSpy).toHaveBeenCalledWith('conv_conversation_01testconv', 'CLOSED');
    });
  });

  describe('sendResponse', () => {
    it('should throw error when ConversationId not found', () => {
      const { channel } = createVoiceChannel();

      // Channel interface: only knows about ConversationId
      expect(() => {
        channel.sendResponse('conv_conversation_01nonexistent' as ConversationId, 'Test message');
      }).toThrow('No CallSid found for conversation');
    });
  });
});
