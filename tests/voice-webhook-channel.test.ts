import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VoiceWebhookChannel,
  TACConfig,
  createLogger,
  ConversationClient,
} from '@twilio/tac-core';
import type { ChannelMessage } from '@twilio/tac-core';

describe('VoiceWebhookChannel', () => {
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
    tacMode: 'passive',
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

  let channel: VoiceWebhookChannel;

  beforeEach(() => {
    channel = new VoiceWebhookChannel({ config, logger, conversationClient });
  });

  describe('initialization', () => {
    it('should create channel with channelType voice', () => {
      expect(channel).toBeInstanceOf(VoiceWebhookChannel);
      expect(channel.channelType).toBe('voice');
    });

    it('should start with no active conversations', () => {
      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);
    });

    it('should default agentAddress to twilioPhoneNumber', async () => {
      // Send a message from the configured phone number — should be filtered as own message
      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: '+15551234567', // same as twilioPhoneNumber
            channel: 'VOICE',
          },
          content: { type: 'TEXT', text: 'Bot response' },
        },
      });

      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('should accept custom agentAddress', async () => {
      const customChannel = new VoiceWebhookChannel(
        { config, logger, conversationClient },
        { agentAddress: 'custom-voice-agent' }
      );

      const messageCallback = vi.fn();
      customChannel.on('message', messageCallback);

      // Message from custom agent address — should be filtered
      await customChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: 'custom-voice-agent',
            channel: 'VOICE',
          },
          content: { type: 'TEXT', text: 'Bot response' },
        },
      });

      expect(messageCallback).not.toHaveBeenCalled();

      // Message from a different address — should be processed
      await customChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: {
            address: '+15559876543',
            channel: 'VOICE',
          },
          content: { type: 'TEXT', text: 'Customer message' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(messageCallback).toHaveBeenCalledTimes(1);
    });

    it('should reject zero dedupCapacity', () => {
      expect(
        () =>
          new VoiceWebhookChannel(
            { config, logger, conversationClient },
            { dedupCapacity: 0 }
          )
      ).toThrow('dedupCapacity must be a positive integer');
    });

    it('should reject negative dedupCapacity', () => {
      expect(
        () =>
          new VoiceWebhookChannel(
            { config, logger, conversationClient },
            { dedupCapacity: -1 }
          )
      ).toThrow('dedupCapacity must be a positive integer');
    });

    it('should reject non-integer dedupCapacity', () => {
      expect(
        () =>
          new VoiceWebhookChannel(
            { config, logger, conversationClient },
            { dedupCapacity: 1.5 }
          )
      ).toThrow('dedupCapacity must be a positive integer');
    });
  });

  describe('webhook processing — VOICE events', () => {
    it('should process CONVERSATION_CREATED event', async () => {
      const startedCallback = vi.fn();
      channel.on('conversationStarted', startedCallback);

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          profileId: 'test_profile_123',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);
      expect(startedCallback).toHaveBeenCalledWith({
        session: expect.objectContaining({
          sessionId: 'conv_conversation_01test1234567890abc',
          profileId: 'test_profile_123',
          channel: 'voice',
        }),
      });
    });

    it('should process COMMUNICATION_CREATED with author.channel VOICE', async () => {
      let capturedMessage: ChannelMessage | null = null;

      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: {
            type: 'TEXT',
            text: 'Hello from voice',
          },
          author: {
            address: '+15559876543',
            channel: 'VOICE',
          },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.sessionId).toBe('conv_conversation_01test1234567890abc');
      expect(capturedMessage!.messageType).toBe('user');
      expect(capturedMessage!.message).toBe('Hello from voice');
      expect(capturedMessage!.channel).toBe('voice');
      expect(capturedMessage!.conversation?.author).toBe('+15559876543');
    });

    it('should process CONVERSATION_UPDATED with status CLOSED', async () => {
      // Start conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);

      // Close conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          status: 'CLOSED',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);
    });

    it('should ignore empty messages', async () => {
      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: {
            type: 'TEXT',
            text: '',
          },
          author: {
            address: '+15559876543',
            channel: 'VOICE',
          },
        },
      });

      expect(messageCallback).not.toHaveBeenCalled();
    });
  });

  describe('channel filtering', () => {
    it('should process events with author.channel VOICE', async () => {
      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Voice message' },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(messageCallback).toHaveBeenCalledTimes(1);
    });

    it('should skip events with author.channel SMS', async () => {
      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'SMS message' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('should skip events with author.channel CHAT', async () => {
      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Chat message' },
          author: { address: 'user@example.com', channel: 'CHAT' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('should skip own messages where author.address matches agentAddress', async () => {
      const messageCallback = vi.fn();
      channel.on('message', messageCallback);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Agent echo' },
          author: { address: '+15551234567', channel: 'VOICE' }, // same as twilioPhoneNumber
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(messageCallback).not.toHaveBeenCalled();
    });
  });

  describe('sendResponse via Maestro Send API', () => {
    beforeEach(() => {
      vi.mocked(conversationClient.listParticipants).mockClear();
      vi.mocked(conversationClient.sendCommunication).mockClear();
      vi.mocked(conversationClient.addParticipant).mockClear();
    });

    it('should send via conversationClient.sendCommunication with channel VOICE', async () => {
      // Start conversation and receive a message to populate authorInfo
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: {
            address: '+15559876543',
            channel: 'VOICE',
            participantId: 'PA123',
          },
          channelId: 'CA00000000000000000000000000000000',
        },
      });

      vi.mocked(conversationClient.listParticipants).mockResolvedValueOnce([
        {
          id: 'PA111',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'AI_AGENT',
          addresses: [{ channel: 'VOICE', address: '+15551234567' }],
        },
        {
          id: 'PA123',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'CUSTOMER',
          addresses: [{ channel: 'VOICE', address: '+15559876543' }],
        },
      ] as any);
      vi.mocked(conversationClient.sendCommunication).mockResolvedValueOnce(undefined as any);

      await channel.sendResponse('conv_conversation_01test1234567890abc', 'Hello back!');

      expect(conversationClient.listParticipants).toHaveBeenCalledWith('conv_conversation_01test1234567890abc');
      expect(conversationClient.sendCommunication).toHaveBeenCalledWith(
        'conv_conversation_01test1234567890abc',
        expect.objectContaining({
          author: {
            address: '+15551234567',
            channel: 'VOICE',
            participantId: 'PA111',
          },
          recipients: [
            {
              address: '+15559876543',
              channel: 'VOICE',
              participantId: 'PA123',
            },
          ],
          content: {
            type: 'TEXT',
            text: 'Hello back!',
          },
          channelId: 'CA00000000000000000000000000000000',
        })
      );
    });

    it('should prefer AI_AGENT participant when multiple voice participants exist', async () => {
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: {
            address: '+15559876543',
            channel: 'VOICE',
            participantId: 'PA_customer',
          },
        },
      });

      vi.mocked(conversationClient.listParticipants).mockResolvedValueOnce([
        {
          id: 'PA_other',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'CUSTOMER',
          addresses: [{ channel: 'VOICE', address: '+15551234567' }],
        },
        {
          id: 'PA_agent',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'AI_AGENT',
          addresses: [{ channel: 'VOICE', address: '+15551234567' }],
        },
      ] as any);
      vi.mocked(conversationClient.sendCommunication).mockResolvedValueOnce(undefined as any);

      await channel.sendResponse('conv_conversation_01test1234567890abc', 'Reply');

      expect(conversationClient.sendCommunication).toHaveBeenCalledWith(
        'conv_conversation_01test1234567890abc',
        expect.objectContaining({
          author: expect.objectContaining({
            participantId: 'PA_agent',
          }),
        })
      );
    });

    it('should throw when no session exists', async () => {
      await expect(channel.sendResponse('conv_conversation_01nonexistent', 'Test')).rejects.toThrow(
        'No active session found'
      );
    });

    it('should throw when no author info exists', async () => {
      // Start conversation but don't receive any message
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      await expect(channel.sendResponse('conv_conversation_01test1234567890abc', 'Test')).rejects.toThrow(
        'No author info found'
      );
    });

    it('should throw when no agent participant found', async () => {
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: {
            address: '+15559876543',
            channel: 'VOICE',
            participantId: 'PA123',
          },
        },
      });

      // Return participants without any matching the agent address
      vi.mocked(conversationClient.listParticipants).mockResolvedValueOnce([
        {
          id: 'PA123',
          conversationId: 'conv_conversation_01test1234567890abc',
          accountId: 'ACtest123456789',
          type: 'CUSTOMER',
          addresses: [{ channel: 'VOICE', address: '+15559876543' }],
        },
      ] as any);

      await expect(channel.sendResponse('conv_conversation_01test1234567890abc', 'Test')).rejects.toThrow(
        'Agent participant not found'
      );
    });
  });

  describe('auto-initialize conversation on first message', () => {
    it('should auto-init session when no CONVERSATION_CREATED was received', async () => {
      let capturedMessage: ChannelMessage | null = null;

      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      // No CONVERSATION_CREATED received — conversation not active
      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'First message' },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should auto-initialize and process the message
      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);
      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.message).toBe('First message');
      expect(capturedMessage!.channel).toBe('voice');
    });
  });

  describe('conversation ended callback', () => {
    it('should fire conversationEnded callback with full session on close', async () => {
      const captured: { sessionId: string; channel: string }[] = [];

      channel.on('conversationEnded', ({ session }) => {
        captured.push({ sessionId: session.sessionId, channel: session.channel });
      });

      // Start conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc', profileId: 'test_profile_123' },
      });

      // Close conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc', status: 'CLOSED' },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].sessionId).toBe('conv_conversation_01test1234567890abc');
      expect(captured[0].channel).toBe('voice');
    });

    it('should still clean up session if callback throws', async () => {
      channel.on('conversationEnded', () => {
        throw new Error('boom');
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });
      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);

      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc', status: 'CLOSED' },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);
    });

    it('should support async callback', async () => {
      const captured: { sessionId: string }[] = [];

      channel.on('conversationEnded', async ({ session }) => {
        captured.push({ sessionId: session.sessionId });
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc', status: 'CLOSED' },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].sessionId).toBe('conv_conversation_01test1234567890abc');
    });

    it('should clean up silently when no callback is registered', async () => {
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc', status: 'CLOSED' },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle invalid webhook payload gracefully', async () => {
      await expect(channel.processWebhook(null)).resolves.not.toThrow();
      await expect(channel.processWebhook({})).resolves.not.toThrow();
    });

    it('should handle unknown event types', async () => {
      await expect(
        channel.processWebhook({
          eventType: 'UNKNOWN_EVENT',
          data: { conversationId: 'conv_conversation_01test1234567890abc' },
        })
      ).resolves.not.toThrow();
    });

    it('should skip events with unexpected eventType format', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      await channel.processWebhook({
        eventType: 'communication.created',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('idempotency token deduplication', () => {
    it('should skip duplicate webhooks with the same idempotency token', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      };

      await channel.processWebhook(payload, 'tok-123');
      await channel.processWebhook(payload, 'tok-123');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should process webhooks with different idempotency tokens', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      };

      await channel.processWebhook(payload, 'tok-1');
      await channel.processWebhook(payload, 'tok-2');

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should always process webhooks without an idempotency token', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      };

      await channel.processWebhook(payload);
      await channel.processWebhook(payload);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should evict oldest tokens when capacity is reached', async () => {
      const smallChannel = new VoiceWebhookChannel(
        { config, logger, conversationClient },
        { dedupCapacity: 2 }
      );
      const callback = vi.fn();
      smallChannel.on('message', callback);

      const makePayload = (text: string) => ({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      });

      // Fill capacity: [tok-1, tok-2]
      await smallChannel.processWebhook(makePayload('msg1'), 'tok-1');
      await smallChannel.processWebhook(makePayload('msg2'), 'tok-2');
      expect(callback).toHaveBeenCalledTimes(2);

      // tok-1 is still tracked — should be deduped
      await smallChannel.processWebhook(makePayload('msg1-dup'), 'tok-1');
      expect(callback).toHaveBeenCalledTimes(2);

      // tok-3 evicts tok-1 (oldest): [tok-2, tok-3]
      await smallChannel.processWebhook(makePayload('msg3'), 'tok-3');
      expect(callback).toHaveBeenCalledTimes(3);

      // tok-1 was evicted — should be processed again
      await smallChannel.processWebhook(makePayload('msg1-again'), 'tok-1');
      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should block concurrent duplicates while first request is in-flight', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'VOICE' },
        },
      };

      await Promise.all([
        channel.processWebhook(payload, 'tok-concurrent'),
        channel.processWebhook(payload, 'tok-concurrent'),
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('conversation management', () => {
    it('should track multiple active conversations', async () => {
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test1234567890abc' },
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01test9876543210xyz' },
      });

      expect(channel.isConversationActive('conv_conversation_01test1234567890abc')).toBe(true);
      expect(channel.isConversationActive('conv_conversation_01test9876543210xyz')).toBe(true);
    });

    it('should return session data via getConversationSession', async () => {
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          profileId: 'test_profile_123',
        },
      });

      const session = channel.getConversationSession('conv_conversation_01test1234567890abc');
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe('conv_conversation_01test1234567890abc');
      expect(session!.channel).toBe('voice');
      expect(session!.profileId).toBe('test_profile_123');
    });

    it('should return undefined for unknown conversation', () => {
      expect(channel.getConversationSession('conv_conversation_01nonexistent')).toBeUndefined();
    });

    it('should store channelId in session metadata from webhook', async () => {
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01test1234567890abc',
          author: { address: '+15559876543', channel: 'VOICE' },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CA00000000000000000000000000000000',
        },
      });

      const session = channel.getConversationSession('conv_conversation_01test1234567890abc');
      expect(session?.metadata?.channelId).toBe('CA00000000000000000000000000000000');
    });
  });
});
