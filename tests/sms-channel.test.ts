import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SMSChannel, TAC, ConversationSession, ConversationId, ProfileId } from '@twilio/tac-core';
import MockAdapter from 'axios-mock-adapter';
import { createTestTAC } from './helpers/tac';

describe('SMS Channel', () => {
  let mockAdapter: MockAdapter;

  // Valid TTID format test IDs (26 chars after prefix)
  const TEST_CONVERSATION_ID = 'conv_conversation_01testsmsaabbccddeeffgghhj' as ConversationId;
  const TEST_CONVERSATION_ID_2 = 'conv_conversation_01testsms2aabbccddeeffffgg' as ConversationId;
  const TEST_PROFILE_ID = 'mem_profile_01testprofileaabbccddeeffg' as ProfileId;
  const TEST_AGENT_PARTICIPANT_ID = 'conv_participant_01testsmsagent000000000000';
  const TEST_CUSTOMER_PARTICIPANT_ID = 'conv_participant_01testsmscust0000000000000';

  afterEach(() => {
    mockAdapter?.restore();
    vi.restoreAllMocks();
  });
  const getTestConfig = () => ({

    accountSid: 'ACtest123456789',
    authToken: 'test_token_123',
    apiKey: 'test_api_key',
    apiSecret: 'test_api_token',
    phoneNumber: '+15551234567',
    conversationConfigurationId: 'conv_configuration_01testconvservice000000000',
  });

  let channel: SMSChannel;
  let tac: TAC;

  beforeEach(async () => {
    tac = await createTestTAC(getTestConfig());
    // Isolate channel tests from live memory HTTP calls.
    // Memory flow is covered by memory.test.ts.
    vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
    channel = new SMSChannel(tac.getChannelDeps());
  });

  describe('initialization', () => {
    it('should create SMS channel with config', () => {
      expect(channel).toBeInstanceOf(SMSChannel);
      expect(channel.channelType).toBe('sms');
    });

    it('should start with no active conversations', () => {
      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);
    });

    it('should reject zero dedupCapacity', () => {
      expect(() => new SMSChannel(tac.getChannelDeps(), { dedupCapacity: 0 })).toThrow(
        'dedupCapacity must be a positive integer'
      );
    });

    it('should reject negative dedupCapacity', () => {
      expect(() => new SMSChannel(tac.getChannelDeps(), { dedupCapacity: -1 })).toThrow(
        'dedupCapacity must be a positive integer'
      );
    });

    it('should reject non-integer dedupCapacity', () => {
      expect(() => new SMSChannel(tac.getChannelDeps(), { dedupCapacity: 1.5 })).toThrow(
        'dedupCapacity must be a positive integer'
      );
    });
  });

  describe('webhook processing', () => {
    it('should process conversation.created event', async () => {
      const webhookPayload = {
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          profileId: TEST_PROFILE_ID,
        },
      };

      await expect(channel.processWebhook(webhookPayload)).resolves.not.toThrow();

      // Should have started a conversation
      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);
    });

    it('should process communication.created event', async () => {
      let capturedMessage: any = null;

      // Set up message received callback
      channel.on('message', data => {
        capturedMessage = data;
      });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          content: {
            type: 'TEXT',
            text: 'Hello world',
          },
          author: {
            address: '+15559876543', // Different from config.phoneNumber
            channel: 'SMS',
          },
        },
      };

      await channel.processWebhook(webhookPayload);

      // Wait a tick for callback to execute
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have triggered message callback
      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage.conversationId).toBe(TEST_CONVERSATION_ID);
      expect(capturedMessage.message).toBe('Hello world');
      expect(capturedMessage.messageType).toBe('user');
      expect(capturedMessage.channel).toBe('sms');
      expect(capturedMessage.conversation.author).toBe('+15559876543');
    });

    it('should skip events with unexpected eventType format', async () => {
      const callback = vi.fn();
      channel.on('message', callback);

      await channel.processWebhook({
        eventType: 'communication.created', // already normalized format
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
          conversationId: TEST_CONVERSATION_ID,
        },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);

      // Then close it
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          status: 'CLOSED',
        },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);
    });

    it('should ignore empty messages', async () => {
      let messageReceived = false;

      channel.on('message', () => {
        messageReceived = true;
      });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
      let capturedMessage: any = null;

      channel.on('message', data => {
        capturedMessage = data;
      });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);

      await channel.processWebhook(webhookPayload);

      // Should auto-initialize and process message
      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);
      expect(capturedMessage).not.toBeNull();
      expect(capturedMessage.message).toBe('First message');
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
          conversationId: TEST_CONVERSATION_ID,
        },
      });

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID_2,
        },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);
      expect(channel.isConversationActive(TEST_CONVERSATION_ID_2)).toBe(true);
    });
  });

  describe('conversation ended callback', () => {
    it('should fire onConversationEnded callback with full session on close', async () => {
      const captured: ConversationSession[] = [];

      tac.onConversationEnded(({ session }) => {
        captured.push(session);
      });
      tac.registerChannel(channel);

      // Start conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID, profileId: TEST_PROFILE_ID },
      });

      // Close conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: TEST_CONVERSATION_ID, status: 'CLOSED' },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe(TEST_CONVERSATION_ID);
      expect(captured[0].channel).toBe('sms');
    });

    it('should still clean up session if callback throws', async () => {
      tac.onConversationEnded(() => {
        throw new Error('boom');
      });
      tac.registerChannel(channel);

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });
      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);

      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: TEST_CONVERSATION_ID, status: 'CLOSED' },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);
    });

    it('should support async callback', async () => {
      const captured: ConversationSession[] = [];

      tac.onConversationEnded(async ({ session }) => {
        captured.push(session);
      });
      tac.registerChannel(channel);

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: TEST_CONVERSATION_ID, status: 'CLOSED' },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].conversationId).toBe(TEST_CONVERSATION_ID);
    });

    it('should clean up silently when no callback is registered', async () => {
      // No callback registered — should not throw
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: TEST_CONVERSATION_ID, status: 'CLOSED' },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);
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
          conversationId: TEST_CONVERSATION_ID,
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
          conversationId: TEST_CONVERSATION_ID,
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
          conversationId: TEST_CONVERSATION_ID,
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
          conversationId: TEST_CONVERSATION_ID,
          content: { type: 'TEXT', text: 'Hello' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      };

      await channel.processWebhook(payload);
      await channel.processWebhook(payload);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should evict oldest tokens when capacity is reached', async () => {
      const smallChannel = new SMSChannel(tac.getChannelDeps(), { dedupCapacity: 2 });
      const callback = vi.fn();
      smallChannel.on('message', callback);

      const makePayload = (text: string) => ({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
          conversationId: TEST_CONVERSATION_ID,
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
          conversationId: TEST_CONVERSATION_ID,
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

  describe('tool registry', () => {
    it('listTools returns an empty list on a fresh messaging channel', () => {
      expect(channel.listTools()).toEqual([]);
    });

    it('registerTool makes a user tool visible via listTools', async () => {
      const { defineTool } = await import('@twilio/tac-conversationrelay');
      const lookup = defineTool(
        'lookup_order',
        'Fetch an order by id',
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        async ({ id }) => ({ id, status: 'shipped' })
      );
      channel.registerTool(lookup);
      expect(channel.listTools().map(t => t.name)).toContain('lookup_order');
    });

    it('executeTool returns the tool result unchanged (no auto-ship on messaging)', async () => {
      const { defineTool } = await import('@twilio/tac-conversationrelay');
      const tool = defineTool(
        'get_balance',
        'Fetch account balance',
        { type: 'object', properties: {}, additionalProperties: false },
        async () => ({ balance: 42 })
      );
      channel.registerTool(tool);
      const result = await channel.executeTool(TEST_CONVERSATION_ID, 'get_balance', {});
      expect(result).toEqual({ balance: 42 });
    });
  });

  describe('sendResponse', () => {
    beforeEach(() => {
      // Access the conversation client's axios instance through TAC
      const conversationClient = (tac as any).conversationClient;
      mockAdapter = new MockAdapter(conversationClient.axiosInstance);
      // Reset history to clear the getConfiguration call from TAC initialization
      mockAdapter.resetHistory();

      // Stub retrieveMemory to avoid HTTP calls during webhook processing
      vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as any);

      // Mock listParticipants call
      mockAdapter.onGet(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`).reply(200, {
        participants: [
          {
            id: TEST_AGENT_PARTICIPANT_ID,
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'HUMAN_AGENT',
            addresses: [{ channel: 'SMS', address: '+15551234567' }],
          },
          {
            id: TEST_CUSTOMER_PARTICIPANT_ID,
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'CUSTOMER',
            addresses: [{ channel: 'SMS', address: '+15559876543' }],
          },
        ],
      });

      // Mock createAction call (returns 202 Accepted)
      mockAdapter
        .onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`)
        .reply(202, {
          id: 'AC_action_01test00000000000000000000',
          type: 'SEND_MESSAGE',
          status: 'PENDING',
          conversationId: TEST_CONVERSATION_ID,
          createdAt: '2026-04-23T00:00:00Z',
        });
    });

    it('should send SMS via Actions API', async () => {
      // Start conversation and receive message to populate author_info
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
        },
      });

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          content: {
            type: 'TEXT',
            text: 'Hello',
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
            participantId: TEST_CUSTOMER_PARTICIPANT_ID,
          },
        },
      });

      await channel.sendResponse(TEST_CONVERSATION_ID, 'Hello back!');

      // Verify that the correct requests were made (listParticipants + createAction)
      const history = mockAdapter.history;
      expect(history.get.length).toBe(1); // listParticipants
      expect(history.get[0].url).toBe(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`);

      expect(history.post.length).toBe(1);
      expect(history.post[0].url).toBe(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`);
      const body = JSON.parse(history.post[0].data);
      expect(body.type).toBe('SEND_MESSAGE');
      // Mode 1 refs: participantId + channel only, no address
      expect(body.payload.from.channel).toBe('SMS');
      expect(body.payload.from.participantId).toBe(TEST_AGENT_PARTICIPANT_ID);
      expect(body.payload.from.address).toBeUndefined();
      expect(body.payload.to).toHaveLength(1);
      expect(body.payload.to[0].channel).toBe('SMS');
      expect(body.payload.to[0].participantId).toBe(TEST_CUSTOMER_PARTICIPANT_ID);
      expect(body.payload.to[0].address).toBeUndefined();
      expect(body.payload.content.text).toBe('Hello back!');
    });

    it('should throw error when no session exists', async () => {
      await expect(channel.sendResponse('CHnonexistent', 'Test')).rejects.toThrow(
        'No active session found'
      );
    });

    it('should throw error when no author_info exists', async () => {
      // Start conversation but don't receive any message
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
        },
      });

      await expect(channel.sendResponse(TEST_CONVERSATION_ID, 'Test')).rejects.toThrow(
        'No author info found'
      );
    });
  });
});
