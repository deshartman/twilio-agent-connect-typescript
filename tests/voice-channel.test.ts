import { describe, it, expect, vi } from 'vitest';
import {
  VoiceChannel,
  TAC,
  TACConfig,
  ConversationSession,
  createLogger,
  ConversationClient,
  ConversationId,
} from '@twilio/tac-core';

describe('VoiceChannel', () => {
  const getTestConfig = () => ({
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
      addOrFetchParticipant: vi.fn(),
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
      const isActive = channel.isConversationActive('CA_unknown' as ConversationId);
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
        id: 'conv_conversation_01jg3r5h4zx8yvw6kqp2mn7std',
      } as any);
      vi.spyOn(conversationClient, 'addOrFetchParticipant').mockResolvedValue({
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
        id: 'conv_conversation_01jg3r5h4zx8yvw6kqp2mn7std',
      } as any);
      vi.spyOn(conversationClient, 'addOrFetchParticipant').mockResolvedValue({
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
        id: 'conv_conversation_01jg3r5h4zx8yvw6kqp2mn7std',
      } as any);
      vi.spyOn(conversationClient, 'addOrFetchParticipant').mockResolvedValue({
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
        on(event: string, handler: (...args: any[]) => void) {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
        },
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
        conversation_id: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profile_id: 'mem_profile_01ktestghijklmnopqrstuvwxy',
      },
    });

    it('should fire onConversationEnded on WebSocket disconnect', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });
      const captured: ConversationSession[] = [];

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(({ session }) => {
          captured.push(session);
          resolve();
        });
      });

      const channel = new VoiceChannel(tac.getChannelDeps());
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      mockWs._emit('close');
      await ended;

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(captured[0].channel).toBe('voice');
    });

    it('should still clean up session if callback throws', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(() => {
          resolve();
          throw new Error('boom');
        });
      });

      const channel = new VoiceChannel(tac.getChannelDeps());
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      mockWs._emit('close');
      await ended;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });

    it('should support async callback', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });
      const captured: ConversationSession[] = [];

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(async ({ session }) => {
          captured.push(session);
          resolve();
        });
      });

      const channel = new VoiceChannel(tac.getChannelDeps());
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));

      mockWs._emit('close');
      await ended;

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
    });

    it('should clean up silently when no callback is registered', async () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });
      const channel = new VoiceChannel(tac.getChannelDeps());
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      channel.handleWebSocketConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      mockWs._emit('close');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
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

      const mockConversation = { id: 'conv_conversation_01ktestabcdefghijklmnopqrs' };
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
      expect(updateSpy).toHaveBeenCalledWith('conv_conversation_01ktestabcdefghijklmnopqrs', 'CLOSED');
    });
  });

  describe('sendResponse', () => {
    it('should throw error when ConversationId not found', async () => {
      const { channel } = createVoiceChannel();

      // Channel interface: accepts ConversationId
      await expect(
        channel.sendResponse(
          'conv_conversation_01ktestabcdefghijklmnopqrs' as ConversationId,
          'Test message'
        )
      ).rejects.toThrow('No CallSid found for conversation');
    });
  });

  describe('tool registry passthrough', () => {
    it('listTools exposes CR built-in protocol tools', () => {
      const { channel } = createVoiceChannel();
      const names = channel.listTools().map(t => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['play_media', 'send_dtmf', 'switch_language', 'end_call'])
      );
    });

    it('registerTool adds a user tool to the underlying CR instance', async () => {
      const { channel } = createVoiceChannel();
      const { defineTool } = await import('@twilio/tac-conversationrelay');
      const userTool = defineTool(
        'lookup_order',
        'Fetch order status',
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        async () => ({ status: 'ok' })
      );
      channel.registerTool(userTool);
      expect(channel.listTools().map(t => t.name)).toContain('lookup_order');
    });

    it('executeTool throws when conversation has no associated CallSid', async () => {
      const { channel } = createVoiceChannel();
      await expect(
        channel.executeTool(
          'conv_conversation_01ktestabcdefghijklmnopqrs' as ConversationId,
          'send_dtmf',
          { digits: '1' }
        )
      ).rejects.toThrow('No CallSid found for conversation');
    });

    it('sendDigits/sendPlay/endCall throw when conversation has no CallSid', () => {
      const { channel } = createVoiceChannel();
      const missing = 'conv_conversation_01ktestabcdefghijklmnopqrs' as ConversationId;
      expect(() => channel.sendDigits(missing, '1')).toThrow('No CallSid found for conversation');
      expect(() => channel.sendPlay(missing, 'https://example.com/a.mp3')).toThrow(
        'No CallSid found for conversation'
      );
      expect(() => channel.endCall(missing)).toThrow('No CallSid found for conversation');
    });

    describe('happy-path frame shipping', () => {
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
          readyState: 1,
          _emit(event: string, ...args: any[]) {
            for (const h of handlers[event] || []) h(...args);
          },
        };
      };

      const CONV_ID = 'conv_conversation_01ktestabcdefghijklmnopqrs' as ConversationId;
      const setupMessage = JSON.stringify({
        type: 'setup',
        sessionId: 'sess_happy',
        callSid: 'CA_happy',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        callType: 'PSTN',
        callStatus: 'ringing',
        accountSid: 'ACtest123',
        customParameters: { conversation_id: CONV_ID },
      });

      const primeChannel = () => {
        const { channel } = createVoiceChannel();
        const ws = createMockWebSocket();
        channel.handleWebSocketConnection(ws);
        ws._emit('message', Buffer.from(setupMessage));
        ws.send.mockClear();
        return { channel, ws };
      };

      it('sendDigits ships a sendDigits frame for the mapped call', () => {
        const { channel, ws } = primeChannel();
        channel.sendDigits(CONV_ID, '1234');
        expect(ws.send).toHaveBeenCalledTimes(1);
        expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({
          type: 'sendDigits',
          digits: '1234',
        });
      });

      it('sendPlay ships a play frame for the mapped call', () => {
        const { channel, ws } = primeChannel();
        channel.sendPlay(CONV_ID, 'https://example.com/a.mp3', { loop: 2 });
        expect(ws.send).toHaveBeenCalledTimes(1);
        expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({
          type: 'play',
          source: 'https://example.com/a.mp3',
          loop: 2,
        });
      });

      it('endCall ships an end frame for the mapped call', () => {
        const { channel, ws } = primeChannel();
        channel.endCall(CONV_ID, { reason: 'user_requested' });
        expect(ws.send).toHaveBeenCalledTimes(1);
        expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({
          type: 'end',
          handoffData: JSON.stringify({ reason: 'user_requested' }),
        });
      });
    });
  });
});
