import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  VoiceChannel,
  TAC,
  TACConfig,
  createLogger,
  ConversationClient,
  TACMemoryResponse,
  ChannelMessage,
} from '@twilio/tac-core';

describe('VoiceChannel - Active Voice Memory Enrichment', () => {
  let voiceChannel: VoiceChannel;
  let tac: TAC;

  const getTestConfig = () => ({
    accountSid: 'ACtest123456789',
    authToken: 'test_token_123',
    apiKey: 'SKtest_api_key',
    apiSecret: 'test_api_token',
    phoneNumber: '+15555555555',
    conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
    memoryStoreId: 'mem_store_01234567890123456789abcdef', // Enable memory
  });

  const createMockConversationClient = () =>
    ({
      createConversation: vi.fn(),
      addParticipant: vi.fn(),
      listConversations: vi.fn(),
      updateConversation: vi.fn(),
      listParticipants: vi.fn(),
      sendCommunication: vi.fn(),
      listCommunications: vi.fn(),
    }) as unknown as ConversationClient;

  const getTestConfigWithoutMemory = () => ({
    accountSid: 'ACtest123456789',
    authToken: 'test_token_123',
    apiKey: 'SKtest_api_key',
    apiSecret: 'test_api_token',
    phoneNumber: '+15555555555',
    conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
    // No memoryStoreId - memory disabled
  });

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
        for (const h of handlers[event] || []) h(...args);
      },
    };
  };

  const setupMessage = JSON.stringify({
    type: 'setup',
    sessionId: 'sess_test',
    callSid: 'CA_test',
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

  const promptMessage = JSON.stringify({
    type: 'prompt',
    voicePrompt: 'Hello, I need help with my order',
    lang: 'en-US',
    last: false,
  });

  const createMockMemory = () =>
    new TACMemoryResponse({
      observations: [
        {
          id: 'obs1',
          content: 'User prefers email communication',
          createdAt: '2024-01-01T00:00:00Z',
          occurredAt: '2024-01-01T00:00:00Z',
          source: 'test',
        },
      ],
      summaries: [],
      communications: [],
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    voiceChannel?.shutdown();
  });

  describe('Memory Retrieval via Injected memoryRetriever', () => {
    it('should retrieve memory when memoryRetriever is provided', async () => {
      const mockMemory = createMockMemory();
      const memoryRetriever = vi.fn().mockResolvedValue(mockMemory);

      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient, memoryRetriever });

      const captured: ChannelMessage[] = [];
      const messageReceived = new Promise<void>(resolve => {
        voiceChannel.on('message', (msg: ChannelMessage) => {
          if (msg.messageType === 'user') {
            captured.push(msg);
            resolve();
          }
        });
      });

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      mockWs._emit('message', Buffer.from(promptMessage));

      await messageReceived;

      // Verify memoryRetriever was called with the session and transcript
      expect(memoryRetriever).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          profileId: 'mem_profile_01ktestghijklmnopqrstuvwxy',
        }),
        'Hello, I need help with my order'
      );

      // Verify the ChannelMessage includes memory in conversation bundle
      expect(captured).toHaveLength(1);
      const msg = captured[0];
      expect(msg.conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(msg.messageType).toBe('user');
      expect(msg.message).toBe('Hello, I need help with my order');
      expect(msg.channel).toBe('voice');
      expect(msg.metadata).toEqual({ type: 'prompt', lang: 'en-US', last: false });
      expect(msg.conversation).toBeDefined();
      expect(msg.conversation?.profileId).toBe('mem_profile_01ktestghijklmnopqrstuvwxy');
      expect(msg.conversation?.memory).toBe(mockMemory);
      expect(msg.conversation?.author).toBe('+15551234567');
      expect(msg.conversation?.startedAt).toBeInstanceOf(Date);
    });

    it('should NOT retrieve memory when no memoryRetriever is provided', async () => {
      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test', level: 'silent' });
      const conversationClient = createMockConversationClient();

      // No memoryRetriever passed
      voiceChannel = new VoiceChannel({ config, logger, conversationClient });

      const captured: ChannelMessage[] = [];
      const messageReceived = new Promise<void>(resolve => {
        voiceChannel.on('message', (msg: ChannelMessage) => {
          if (msg.messageType === 'user') {
            captured.push(msg);
            resolve();
          }
        });
      });

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      mockWs._emit('message', Buffer.from(promptMessage));

      await messageReceived;

      // Verify ChannelMessage emitted without memory
      expect(captured).toHaveLength(1);
      const msg = captured[0];
      expect(msg.conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(msg.messageType).toBe('user');
      expect(msg.message).toBe('Hello, I need help with my order');
      expect(msg.conversation).toBeDefined();
      expect(msg.conversation?.memory).toBeUndefined();
    });

    it('should handle memory retrieval errors gracefully', async () => {
      const memoryRetriever = vi.fn().mockRejectedValue(new Error('Memory API unavailable'));

      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient, memoryRetriever });

      const captured: ChannelMessage[] = [];
      const messageReceived = new Promise<void>(resolve => {
        voiceChannel.on('message', (msg: ChannelMessage) => {
          if (msg.messageType === 'user') {
            captured.push(msg);
            resolve();
          }
        });
      });

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      mockWs._emit('message', Buffer.from(promptMessage));

      // Should not throw - graceful degradation
      await messageReceived;

      // Callback should still be invoked without memory
      expect(captured).toHaveLength(1);
      const msg = captured[0];
      expect(msg.conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(msg.message).toBe('Hello, I need help with my order');
      expect(msg.conversation?.memory).toBeUndefined();
    });
  });

  describe('Memory Retrieval via Config (Memory API)', () => {
    it('should not enable memory when memoryStoreId not configured', () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      tac = new TAC({ config });

      // Memory should not be enabled when memoryStoreId is not configured
      expect(tac.isMemoryEnabled()).toBe(false);
    });
  });

  describe('ChannelMessage Shape', () => {
    it('should emit a well-formed ChannelMessage with all expected fields', async () => {
      const mockMemory = createMockMemory();
      const memoryRetriever = vi.fn().mockResolvedValue(mockMemory);

      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient, memoryRetriever });

      const captured: ChannelMessage[] = [];
      const messageReceived = new Promise<void>(resolve => {
        voiceChannel.on('message', (msg: ChannelMessage) => {
          if (msg.messageType === 'user') {
            captured.push(msg);
            resolve();
          }
        });
      });

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      mockWs._emit('message', Buffer.from(promptMessage));

      await messageReceived;

      expect(captured[0]).toEqual(
        expect.objectContaining({
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          messageType: 'user',
          message: 'Hello, I need help with my order',
          channel: 'voice',
          metadata: { type: 'prompt', lang: 'en-US', last: false },
          conversation: expect.objectContaining({
            profileId: 'mem_profile_01ktestghijklmnopqrstuvwxy',
            memory: mockMemory,
            author: '+15551234567',
            startedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should emit interrupt as system message type', async () => {
      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient });

      const systemMessages: ChannelMessage[] = [];
      const interruptReceived = new Promise<void>(resolve => {
        voiceChannel.on('message', (msg: ChannelMessage) => {
          if (msg.messageType === 'system' && msg.metadata?.type === 'interrupt') {
            systemMessages.push(msg);
            resolve();
          }
        });
      });

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));

      const interruptMessage = JSON.stringify({
        type: 'interrupt',
        utteranceUntilInterrupt: 'wait',
        durationUntilInterruptMs: 500,
      });
      mockWs._emit('message', Buffer.from(interruptMessage));

      await interruptReceived;

      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0].messageType).toBe('system');
      expect(systemMessages[0].metadata?.type).toBe('interrupt');
      expect(systemMessages[0].metadata?.utteranceUntilInterrupt).toBe('wait');
      expect(systemMessages[0].metadata?.durationUntilInterruptMs).toBe(500);
    });
  });

  describe('Integration with TAC onMessageReady', () => {
    it('should pass enriched ChannelMessage to TAC.onMessageReady callback', async () => {
      const mockMemory = createMockMemory();
      const memoryRetriever = vi.fn().mockResolvedValue(mockMemory);

      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test-tac', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient, memoryRetriever });

      const tac = new TAC({ config });
      const captured: ChannelMessage[] = [];
      const messageReady = new Promise<void>(resolve => {
        tac.onMessageReady((msg: ChannelMessage) => {
          if (msg.messageType === 'user') {
            captured.push(msg);
            resolve();
          }
        });
      });
      tac.registerChannel(voiceChannel);

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      mockWs._emit('message', Buffer.from(promptMessage));

      await messageReady;

      // TAC's onMessageReady should receive the full ChannelMessage
      expect(captured).toHaveLength(1);
      expect(captured[0]).toEqual(
        expect.objectContaining({
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          messageType: 'user',
          message: 'Hello, I need help with my order',
          channel: 'voice',
          conversation: expect.objectContaining({
            profileId: 'mem_profile_01ktestghijklmnopqrstuvwxy',
            memory: mockMemory,
            author: '+15551234567',
          }),
        })
      );
    });

    it('should work without memory when no memoryRetriever is provided', async () => {
      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test-tac', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient });

      const tac = new TAC({ config });
      const captured: ChannelMessage[] = [];
      const messageReady = new Promise<void>(resolve => {
        tac.onMessageReady((msg: ChannelMessage) => {
          if (msg.messageType === 'user') {
            captured.push(msg);
            resolve();
          }
        });
      });
      tac.registerChannel(voiceChannel);

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));
      mockWs._emit('message', Buffer.from(promptMessage));

      await messageReady;

      expect(captured).toHaveLength(1);
      expect(captured[0]).toEqual(
        expect.objectContaining({
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          messageType: 'user',
          message: 'Hello, I need help with my order',
          channel: 'voice',
        })
      );
      expect(captured[0].conversation?.memory).toBeUndefined();
    });

    it('should work without memory when memoryStoreId not configured', () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      // Should be able to instantiate TAC without memory configured
      expect(tac).toBeInstanceOf(TAC);
      expect(tac.isMemoryEnabled()).toBe(false);
    });
  });

  describe('Multiple Prompts', () => {
    it('should retrieve memory independently for each prompt', async () => {
      const mockMemory1 = createMockMemory();
      const mockMemory2 = new TACMemoryResponse({
        observations: [
          {
            id: 'obs2',
            content: 'User has premium subscription',
            createdAt: '2024-02-01T00:00:00Z',
            source: 'test',
          },
        ],
        summaries: [],
        communications: [],
      });

      let callCount = 0;
      const memoryRetriever = vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? mockMemory1 : mockMemory2;
      });

      const config = new TACConfig(getTestConfig());
      const logger = createLogger({ name: 'test', level: 'silent' });
      const conversationClient = createMockConversationClient();

      voiceChannel = new VoiceChannel({ config, logger, conversationClient, memoryRetriever });

      const captured: ChannelMessage[] = [];
      let resolveSecond: () => void;
      const secondMessageReceived = new Promise<void>(resolve => {
        resolveSecond = resolve;
      });

      voiceChannel.on('message', (msg: ChannelMessage) => {
        if (msg.messageType === 'user') {
          captured.push(msg);
          if (captured.length === 2) resolveSecond();
        }
      });

      const mockWs = createMockWebSocket();
      voiceChannel.handleWebSocketConnection(mockWs);

      mockWs._emit('message', Buffer.from(setupMessage));

      // Send first prompt
      mockWs._emit('message', Buffer.from(promptMessage));

      // Send second prompt
      const secondPrompt = JSON.stringify({
        type: 'prompt',
        voicePrompt: 'Can you check my subscription?',
        lang: 'en-US',
        last: false,
      });
      mockWs._emit('message', Buffer.from(secondPrompt));

      await secondMessageReceived;

      expect(memoryRetriever).toHaveBeenCalledTimes(2);
      expect(captured).toHaveLength(2);

      // First prompt got first memory
      expect(captured[0].message).toBe('Hello, I need help with my order');
      expect(captured[0].conversation?.memory).toBe(mockMemory1);

      // Second prompt got second memory
      expect(captured[1].message).toBe('Can you check my subscription?');
      expect(captured[1].conversation?.memory).toBe(mockMemory2);
    });
  });
});
