import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatChannel, TACConfig, createLogger, ConversationClient } from '@twilio/tac-core';
import type { ChannelMessage } from '@twilio/tac-core';

describe('Chat Channel', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const config = new TACConfig({
    environment: 'prod',
    tacMode: 'conversation',
    twilioAccountSid: 'ACtest123456789',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'test_api_key',
    twilioApiToken: 'test_api_token',
    twilioPhoneNumber: '+15551234567',
    conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
  });
  const logger = createLogger({ name: 'test', level: 'silent' });
  const conversationClient = {
    listParticipants: vi.fn(),
    sendCommunication: vi.fn(),
    addParticipant: vi.fn(),
  } as unknown as ConversationClient;

  let channel: ChatChannel;

  beforeEach(() => {
    channel = new ChatChannel({ config, logger, conversationClient });
  });

  describe('initialization', () => {
    it('should create chat channel with default config', () => {
      expect(channel).toBeInstanceOf(ChatChannel);
      expect(channel.channelType).toBe('chat');
    });

    it('should create chat channel with custom agent address', () => {
      const customChannel = new ChatChannel(
        { config, logger, conversationClient },
        { agentAddress: 'custom-bot' }
      );
      expect(customChannel).toBeInstanceOf(ChatChannel);
      expect(customChannel.channelType).toBe('chat');
    });

    it('should start with no active conversations', () => {
      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);
    });
  });

  describe('webhook processing', () => {
    it('should process conversation.created event', async () => {
      const webhookPayload = {
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          profileId: 'test_profile_123',
        },
      };

      const startedCallback = vi.fn();
      channel.on('conversationStarted', startedCallback);

      await channel.processWebhook(webhookPayload);

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);
      expect(startedCallback).toHaveBeenCalledWith({
        session: expect.objectContaining({
          sessionId: 'conv_conversation_01test1234567890abc',
          profileId: 'test_profile_123',
          channel: 'chat',
        }),
      });
    });

    it('should process communication.created event', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'customer@example.com',
            channel: 'CHAT',
          },
          content: {
            type: 'TEXT',
            text: 'Hello from chat',
          },
          channelId: 'CH00000000000000000000000000000000',
        },
      };

      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook(webhookPayload);

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);
      expect(messageCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'conv_conversation_01test1234567890abc',
          messageType: 'user',
          message: 'Hello from chat',
          channel: 'chat',
          conversation: expect.objectContaining({
            author: 'customer@example.com',
            memory: undefined,
          }),
        })
      );
    });

    it('should ignore messages from bot itself (default agent address)', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'ai-assistant',
            channel: 'CHAT',
          },
          content: {
            type: 'TEXT',
            text: 'Bot response',
          },
        },
      };

      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook(webhookPayload);

      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('should ignore messages from bot with custom agent address', async () => {
      const customChannel = new ChatChannel(
        { config, logger, conversationClient },
        { agentAddress: 'custom-bot' }
      );

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'custom-bot',
            channel: 'CHAT',
          },
          content: {
            type: 'TEXT',
            text: 'Bot response',
          },
        },
      };

      const messageCallback = vi.fn();
      customChannel.on('message', messageCallback);

      await customChannel.processWebhook(webhookPayload);

      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('should store channelId in session metadata', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'customer@example.com',
            channel: 'CHAT',
          },
          content: {
            type: 'TEXT',
            text: 'Hello',
          },
          channelId: 'CH00000000000000000000000000000000',
        },
      };

      await channel.processWebhook(webhookPayload);

      const session = channel.getConversationSession('conv_conversation_01test1234567890abc');
      expect(session?.metadata?.channelId).toBe('CH00000000000000000000000000000000');
    });

    it('should process conversation.updated (closed) event', async () => {
      // First create a conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      const endedCallback = vi.fn();
      channel.on('conversationEnded', endedCallback);

      // Then close it
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          status: 'CLOSED',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);
      expect(endedCallback).toHaveBeenCalledWith({
        session: expect.objectContaining({
          sessionId: 'conv_conversation_01test1234567890abc',
          channel: 'chat',
        }),
      });
    });

    it('should ignore empty messages', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'customer@example.com',
            channel: 'CHAT',
          },
          content: {
            type: 'TEXT',
            text: '   ',
          },
        },
      };

      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook(webhookPayload);

      expect(messageCallback).not.toHaveBeenCalled();
    });
  });

  describe('send response', () => {
    beforeEach(() => {
      // Clear conversationClient mock call counts between tests
      vi.mocked(conversationClient.listParticipants).mockClear();
      vi.mocked(conversationClient.sendCommunication).mockClear();
      vi.mocked(conversationClient.addParticipant).mockClear();
    });

    it('should send response via Send API with existing AI_AGENT', async () => {
      // Setup conversation
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_123',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      // Mock conversationClient methods (channel calls these directly)
      vi.mocked(conversationClient.listParticipants).mockResolvedValueOnce([
        {
          id: 'PA_agent_123',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'AI_AGENT',
          addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
        },
        {
          id: 'PA_customer_123',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'CUSTOMER',
          addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
        },
      ] as any);
      vi.mocked(conversationClient.sendCommunication).mockResolvedValueOnce(undefined as any);

      await channel.sendResponse('conv_conversation_01test1234567890abc', 'Hello from bot');

      expect(conversationClient.listParticipants).toHaveBeenCalledWith(
        'conv_conversation_01test1234567890abc'
      );
      expect(conversationClient.sendCommunication).toHaveBeenCalledWith(
        'conv_conversation_01test1234567890abc',
        expect.objectContaining({
          author: {
            address: 'ai-assistant',
            channel: 'CHAT',
            participantId: 'PA_agent_123',
          },
          recipients: [
            {
              address: 'customer@example.com',
              channel: 'CHAT',
              participantId: 'PA_customer_123',
            },
          ],
          content: {
            type: 'TEXT',
            text: 'Hello from bot',
          },
          channelId: 'CH00000000000000000000000000000000',
        })
      );
    });

    it('should create AI_AGENT participant if not exists', async () => {
      // Setup conversation
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_123',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      // Mock conversationClient methods — no AI_AGENT in participants
      vi.mocked(conversationClient.listParticipants).mockResolvedValueOnce([
        {
          id: 'PA_customer_123',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'CUSTOMER',
          addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
        },
      ] as any);
      vi.mocked(conversationClient.addParticipant).mockResolvedValueOnce({
        id: 'PA_agent_123',
        conversationId: 'conv_conversation_01test1234567890abc',
        accountId: 'ACtest123456789',
        type: 'AI_AGENT',
        addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
      } as any);
      vi.mocked(conversationClient.sendCommunication).mockResolvedValueOnce(undefined as any);

      await channel.sendResponse('conv_conversation_01test1234567890abc', 'Hello from bot');

      // Verify addParticipant was called with correct args including channelId
      expect(conversationClient.addParticipant).toHaveBeenCalledWith(
        'conv_conversation_01test1234567890abc',
        [
          {
            channel: 'CHAT',
            address: 'ai-assistant',
            channelId: 'CH00000000000000000000000000000000',
          },
        ],
        'AI_AGENT'
      );
    });

    it('should handle race condition when creating AI_AGENT', async () => {
      // Setup conversation
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_123',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      // Mock conversationClient: first listParticipants returns no AI_AGENT
      vi.mocked(conversationClient.listParticipants)
        .mockResolvedValueOnce([
          {
            id: 'PA_customer_123',
            conversationId: 'conv_conversation_01test1234567890abc',
            accountId: 'ACtest123456789',
            type: 'CUSTOMER',
            addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
          },
        ] as any)
        // Retry listParticipants after addParticipant conflict — AI_AGENT now exists
        .mockResolvedValueOnce([
          {
            id: 'PA_agent_123',
            conversationId: 'conv_conversation_01test1234567890abc',
            accountId: 'ACtest123456789',
            type: 'AI_AGENT',
            addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
          },
          {
            id: 'PA_customer_123',
            conversationId: 'conv_conversation_01test1234567890abc',
            accountId: 'ACtest123456789',
            type: 'CUSTOMER',
            addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
          },
        ] as any);

      // addParticipant fails (conflict — another process created it)
      vi.mocked(conversationClient.addParticipant).mockRejectedValueOnce(
        new Error('Participant already exists')
      );
      vi.mocked(conversationClient.sendCommunication).mockResolvedValueOnce(undefined as any);

      await channel.sendResponse('conv_conversation_01test1234567890abc', 'Hello from bot');

      // Verify: listParticipants called twice (initial + retry), addParticipant once, sendCommunication once
      expect(conversationClient.listParticipants).toHaveBeenCalledTimes(2);
      expect(conversationClient.addParticipant).toHaveBeenCalledTimes(1);
      expect(conversationClient.sendCommunication).toHaveBeenCalledTimes(1);
    });

    it('should throw error if no active session', async () => {
      await expect(
        channel.sendResponse('conv_conversation_01test1234567890abc', 'Hello')
      ).rejects.toThrow('No active session found');
    });

    it('should throw error if no author info', async () => {
      // Create conversation without author info
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      await expect(
        channel.sendResponse('conv_conversation_01test1234567890abc', 'Hello')
      ).rejects.toThrow('No author info found');
    });
  });
});
