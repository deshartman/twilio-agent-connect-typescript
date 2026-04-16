import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SMSChannel, TACConfig, createLogger, ConversationClient } from '@twilio/tac-core';
import type { ChannelMessage } from '@twilio/tac-core';

describe('SMS Channel', () => {
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

  let channel: SMSChannel;

  beforeEach(() => {
    channel = new SMSChannel({ config, logger, conversationClient });
  });

  describe('initialization', () => {
    it('should create SMS channel with config', () => {
      expect(channel).toBeInstanceOf(SMSChannel);
      expect(channel.channelType).toBe('sms');
    });

    it('should start with no active conversations', () => {
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });

    it('should reject zero dedupCapacity', () => {
      expect(
        () => new SMSChannel({ config, logger, conversationClient }, { dedupCapacity: 0 })
      ).toThrow('dedupCapacity must be a positive integer');
    });

    it('should reject negative dedupCapacity', () => {
      expect(
        () => new SMSChannel({ config, logger, conversationClient }, { dedupCapacity: -1 })
      ).toThrow('dedupCapacity must be a positive integer');
    });

    it('should reject non-integer dedupCapacity', () => {
      expect(
        () => new SMSChannel({ config, logger, conversationClient }, { dedupCapacity: 1.5 })
      ).toThrow('dedupCapacity must be a positive integer');
    });
  });

  describe('webhook processing', () => {
    it('should process conversation.created event', async () => {
      const webhookPayload = {
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          profileId: 'mem_profile_01ktestghijklmnopqrstuvwxy',
        },
      };

      await expect(channel.processWebhook(webhookPayload)).resolves.not.toThrow();

      // Should have started a conversation
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);
    });

    it('should process communication.created event', async () => {
      let capturedMessage: ChannelMessage | null = null;

      // Set up message callback
      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: 'Hello world',
          },
          author: {
            address: '+15559876543', // Different from twilioPhoneNumber
            channel: 'SMS',
          },
        },
      };

      await channel.processWebhook(webhookPayload);

      // Wait a tick for callback to execute
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have triggered message callback
      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(capturedMessage!.message).toBe('Hello world');
      expect(capturedMessage!.conversation?.author).toBe('+15559876543');
    });

    it('should skip events with unexpected eventType format', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      await channel.processWebhook({
        eventType: 'communication.created', // already normalized format
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should process conversation.updated event (close)', async () => {
      // First add a conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      // Then close it
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          status: 'CLOSED',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });

    it('should ignore empty messages', async () => {
      let messageReceived = false;

      channel.on('message', () => {
        messageReceived = true;
      });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: '', // Empty message
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
          },
        },
      };

      await channel.processWebhook(webhookPayload);

      // Should not have triggered callback for empty message
      expect(messageReceived).toBe(false);
    });

    it('should auto-initialize conversation on first message', async () => {
      let capturedMessage: ChannelMessage | null = null;

      channel.on('message', (msg: ChannelMessage) => {
        capturedMessage = msg;
      });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: 'First message',
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
          },
        },
      };

      // Conversation not active initially
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);

      await channel.processWebhook(webhookPayload);

      // Should auto-initialize and process message
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);
      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage!.message).toBe('First message');
    });
  });

  describe('participant address', () => {
    it('should create SMS participant address', () => {
      const address = { channel: 'SMS' as const, address: '+15551234567' };

      expect(address.channel).toBe('SMS');
      expect(address.address).toBe('+15551234567');
    });
  });

  describe('conversation management', () => {
    it('should track multiple active conversations', async () => {
      // Add multiple conversations
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);
    });
  });

  describe('conversation ended callback', () => {
    it('should fire conversationEnded callback with full session on close', async () => {
      const captured: { conversationId: string; channel: string }[] = [];

      channel.on('conversationEnded', ({ session }) => {
        captured.push({ conversationId: session.conversationId, channel: session.channel });
      });

      // Start conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          profileId: 'mem_profile_01ktestghijklmnopqrstuvwxy',
        },
      });

      // Close conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs', status: 'CLOSED' },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(captured[0].channel).toBe('sms');
    });

    it('should still clean up session if callback throws', async () => {
      channel.on('conversationEnded', () => {
        throw new Error('boom');
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs' },
      });
      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs', status: 'CLOSED' },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });

    it('should support async callback', async () => {
      const captured: { conversationId: string }[] = [];

      channel.on('conversationEnded', async ({ session }) => {
        captured.push({ conversationId: session.conversationId });
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs' },
      });
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs', status: 'CLOSED' },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
    });

    it('should clean up silently when no callback is registered', async () => {
      // No callback registered — should not throw
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs' },
      });
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs', status: 'CLOSED' },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle invalid webhook payload gracefully', async () => {
      await expect(channel.processWebhook(null)).resolves.not.toThrow();
      await expect(channel.processWebhook({})).resolves.not.toThrow();
    });

    it('should handle unknown event types', async () => {
      const webhookPayload = {
        eventType: 'UNKNOWN_EVENT',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      };

      await expect(channel.processWebhook(webhookPayload)).resolves.not.toThrow();
    });
  });

  describe('idempotency token deduplication', () => {
    it('should skip duplicate webhooks with the same idempotency token', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'SMS' },
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
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'SMS' },
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
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      };

      await channel.processWebhook(payload);
      await channel.processWebhook(payload);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should evict oldest tokens when capacity is reached', async () => {
      const smallChannel = new SMSChannel(
        { config, logger, conversationClient },
        { dedupCapacity: 2 }
      );
      const callback = vi.fn();
      smallChannel.on('message', callback);

      const makePayload = (text: string) => ({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: { type: 'TEXT', text },
          author: { address: '+15559876543', channel: 'SMS' },
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

    it('should allow retry when processing fails', async () => {
      let callCount = 0;
      channel.on('message', () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('transient failure');
        }
      });

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      };

      // First attempt — callback throws
      await channel.processWebhook(payload, 'tok-retry');

      // Retry with same token — should NOT be deduped since first attempt failed
      await channel.processWebhook(payload, 'tok-retry');

      expect(callCount).toBe(2);
    });

    it('should block concurrent duplicates while first request is in-flight', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      const payload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      };

      // Fire both concurrently with the same token
      await Promise.all([
        channel.processWebhook(payload, 'tok-concurrent'),
        channel.processWebhook(payload, 'tok-concurrent'),
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendResponse', () => {
    it('should send SMS via Send API', async () => {
      // Start conversation and receive message to populate author_info
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: 'Hello',
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
            participantId: 'conv_participant_01pa123456789012345',
          },
        },
      });

      // Mock conversationClient methods (channel calls these directly)
      vi.mocked(conversationClient.listParticipants).mockResolvedValueOnce([
        {
          id: 'conv_participant_01pa111456789012345',
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          accountId: 'ACtest123456789',
          type: 'HUMAN_AGENT',
          addresses: [{ channel: 'SMS', address: '+15551234567' }],
        },
        {
          id: 'conv_participant_01pa123456789012345',
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          accountId: 'ACtest123456789',
          type: 'CUSTOMER',
          addresses: [{ channel: 'SMS', address: '+15559876543' }],
        },
      ] as any);
      vi.mocked(conversationClient.sendCommunication).mockResolvedValueOnce(undefined as any);

      await channel.sendResponse('conv_conversation_01ktestabcdefghijklmnopqrs', 'Hello back!');

      expect(conversationClient.listParticipants).toHaveBeenCalledWith(
        'conv_conversation_01ktestabcdefghijklmnopqrs'
      );
      expect(conversationClient.sendCommunication).toHaveBeenCalledWith(
        'conv_conversation_01ktestabcdefghijklmnopqrs',
        expect.objectContaining({
          author: {
            address: '+15551234567',
            channel: 'SMS',
            participantId: 'conv_participant_01pa111456789012345',
          },
          recipients: [
            {
              address: '+15559876543',
              channel: 'SMS',
              participantId: 'conv_participant_01pa123456789012345',
            },
          ],
          content: {
            type: 'TEXT',
            text: 'Hello back!',
          },
        })
      );
    });

    it('should throw error when no session exists', async () => {
      await expect(channel.sendResponse('conv_conversation_01ktestabcdefghijklmnopqrs', 'Test')).rejects.toThrow(
        'No active session found'
      );
    });

    it('should throw error when no author_info exists', async () => {
      // Start conversation but don't receive any message
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      await expect(
        channel.sendResponse('conv_conversation_01ktestabcdefghijklmnopqrs', 'Test')
      ).rejects.toThrow('No author info found');
    });
  });
});
