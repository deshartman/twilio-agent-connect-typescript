import { describe, it, expect, vi } from 'vitest';
import {
  VoiceChannel,
  TACConfig,
  ConversationSession,
  createLogger,
  ConversationClient,
  ConversationId,
  TACMemoryResponse,
} from '@twilio/tac-core';
import { ConversationRelay } from '@twilio/tac-conversationrelay';
import { createTestTAC } from './helpers/tac';

describe('VoiceChannel', () => {
  const getTestConfig = () => ({
    accountSid: 'ACtest123',
    authToken: 'test_token_123',
    apiKey: 'test_api_key',
    apiSecret: 'test_api_token',
    phoneNumber: '+15551234567',
    conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
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
      listCommunications: vi.fn(),
      ...overrides?.conversationClient,
    } as unknown as ConversationClient;
    const memoryRetriever = vi.fn().mockResolvedValue(
      new TACMemoryResponse({ observations: [], summaries: [], communications: [] })
    );

    const conversationRelay = new ConversationRelay(logger.child({ component: 'crelay' }));
    const channel = new VoiceChannel(
      { config, logger, conversationClient, memoryRetriever },
      { conversationRelay }
    );
    return { channel, config, logger, conversationClient, memoryRetriever, conversationRelay };
  };

  describe('isConversationActive()', () => {
    it('should return false for unknown conversation', () => {
      const { channel } = createVoiceChannel();
      const isActive = channel.isConversationActive('CA_unknown' as ConversationId);
      expect(isActive).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('clears session state on shutdown', () => {
      const { channel } = createVoiceChannel();
      expect(channel.isConversationActive('CH_test' as ConversationId)).toBe(false);
      channel.shutdown();
      expect(channel.isConversationActive('CH_test' as ConversationId)).toBe(false);
    });
  });

  describe('createConversationForCall', () => {
    it('creates a Maestro conversation and returns the four CR customParameter IDs', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      const createConvSpy = vi
        .spyOn(conversationClient, 'createConversation')
        .mockResolvedValue({
          id: 'conv_conversation_01testconversation00000002',
        } as any);
      const addParticipantSpy = vi
        .spyOn(conversationClient, 'addOrFetchParticipant')
        .mockResolvedValueOnce({
          id: 'PA_customer',
          profileId: 'mem_profile_test',
        } as any)
        .mockResolvedValueOnce({
          id: 'PA_agent',
          profileId: null,
        } as any);

      const ids = await channel.createConversationForCall({
        toNumber: '+15559876543',
        fromNumber: '+15551234567',
        callSid: 'CA_test_123',
      });

      expect(ids).toEqual({
        conversation_id: 'conv_conversation_01testconversation00000002',
        profile_id: 'mem_profile_test',
        customer_participant_id: 'PA_customer',
        ai_agent_participant_id: 'PA_agent',
      });

      expect(createConvSpy).toHaveBeenCalledTimes(1);
      expect(createConvSpy.mock.calls[0][0]).toMatch(/^tac-voice-\+15551234567-\d{8}T\d{6}Z$/);

      expect(addParticipantSpy).toHaveBeenCalledTimes(2);
      expect(addParticipantSpy).toHaveBeenNthCalledWith(
        1,
        'conv_conversation_01testconversation00000002',
        [{ channel: 'VOICE', address: '+15551234567', channelId: 'CA_test_123' }],
        'CUSTOMER'
      );
      expect(addParticipantSpy).toHaveBeenNthCalledWith(
        2,
        'conv_conversation_01testconversation00000002',
        [{ channel: 'VOICE', address: '+15559876543', channelId: 'CA_test_123' }],
        'AI_AGENT'
      );
    });

    it('returns an empty string for profile_id when the customer participant has none', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      vi.spyOn(conversationClient, 'createConversation').mockResolvedValue({
        id: 'conv_conversation_01testconversation00000003',
      } as any);
      vi.spyOn(conversationClient, 'addOrFetchParticipant').mockResolvedValue({
        id: 'PA_x',
        profileId: null,
      } as any);

      const ids = await channel.createConversationForCall({
        toNumber: '+15559876543',
        fromNumber: '+15551234567',
      });

      expect(ids.profile_id).toBe('');
    });

    it('throws when Conversation Service returns an invalid conversation id', async () => {
      const { channel, conversationClient } = createVoiceChannel();

      vi.spyOn(conversationClient, 'createConversation').mockResolvedValue({
        id: 'not-a-valid-conversation-id',
      } as any);

      await expect(
        channel.createConversationForCall({
          toNumber: '+15559876543',
          fromNumber: '+15551234567',
        })
      ).rejects.toThrow(/Invalid conversation ID/);
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
      const tac = await createTestTAC(getTestConfig());
      const captured: ConversationSession[] = [];

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(({ session }) => {
          captured.push(session);
          resolve();
        });
      });

      const channel = new VoiceChannel(tac.getChannelDeps(), {
        conversationRelay: new ConversationRelay(tac.logger.child({ component: 'crelay' })),
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (channel as any).conversationRelay.handleConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      mockWs._emit('close');
      await ended;

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(captured[0].channel).toBe('voice');
    });

    it('should still clean up session if callback throws', async () => {
      const tac = await createTestTAC(getTestConfig());

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(() => {
          resolve();
          throw new Error('boom');
        });
      });

      const channel = new VoiceChannel(tac.getChannelDeps(), {
        conversationRelay: new ConversationRelay(tac.logger.child({ component: 'crelay' })),
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (channel as any).conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      mockWs._emit('close');
      await ended;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });

    it('should support async callback', async () => {
      const tac = await createTestTAC(getTestConfig());
      const captured: ConversationSession[] = [];

      const ended = new Promise<void>(resolve => {
        tac.onConversationEnded(async ({ session }) => {
          captured.push(session);
          resolve();
        });
      });

      const channel = new VoiceChannel(tac.getChannelDeps(), {
        conversationRelay: new ConversationRelay(tac.logger.child({ component: 'crelay' })),
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (channel as any).conversationRelay.handleConnection(mockWs);
      mockWs._emit('message', Buffer.from(setupMessage));

      mockWs._emit('close');
      await ended;

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
    });

    it('should clean up silently when no callback is registered', async () => {
      const tac = await createTestTAC(getTestConfig());
      const channel = new VoiceChannel(tac.getChannelDeps(), {
        conversationRelay: new ConversationRelay(tac.logger.child({ component: 'crelay' })),
      });
      tac.registerChannel(channel);

      const mockWs = createMockWebSocket();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (channel as any).conversationRelay.handleConnection(mockWs);
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
        expect.arrayContaining(['play_media', 'send_digits', 'switch_language', 'end_call'])
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
          'send_digits',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (channel as any).conversationRelay.handleConnection(ws);
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
