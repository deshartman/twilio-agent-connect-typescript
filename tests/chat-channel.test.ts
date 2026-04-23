import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatChannel, TAC, ConversationSession, ConversationId, ProfileId } from '@twilio/tac-core';
import MockAdapter from 'axios-mock-adapter';
import { createTestTAC } from './helpers/tac';

describe('Chat Channel', () => {
  let mockAdapter: MockAdapter;

  // Valid TTID format test IDs (26 chars after prefix)
  const TEST_CONVERSATION_ID = 'conv_conversation_01testchataabbccddeeffgghh' as ConversationId;
  const TEST_PROFILE_ID = 'mem_profile_01testprofileaabbccddeeffg' as ProfileId;

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

  let channel: ChatChannel;
  let tac: TAC;

  beforeEach(async () => {
    tac = await createTestTAC(getTestConfig());
    // Isolate channel tests from live memory HTTP calls.
    // Memory flow is covered by memory.test.ts.
    vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
    channel = new ChatChannel(tac.getChannelDeps());
  });

  describe('initialization', () => {
    it('should create chat channel with default config', () => {
      expect(channel).toBeInstanceOf(ChatChannel);
      expect(channel.channelType).toBe('chat');
    });

    it('should create chat channel with custom agent address', () => {
      const customChannel = new ChatChannel(tac.getChannelDeps(), { agentAddress: 'custom-bot' });
      expect(customChannel).toBeInstanceOf(ChatChannel);
      expect(customChannel.channelType).toBe('chat');
    });

    it('should start with no active conversations', () => {
      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);
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

      const startedCallback = vi.fn();
      channel.on('conversationStarted', startedCallback);

      await channel.processWebhook(webhookPayload);

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);
      expect(startedCallback).toHaveBeenCalledWith({
        session: expect.objectContaining({
          conversationId: TEST_CONVERSATION_ID,
          profileId: TEST_PROFILE_ID,
          channel: 'chat',
        }),
      });
    });

    it('should process communication.created event', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);
      expect(messageCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: TEST_CONVERSATION_ID,
          message: 'Hello from chat',
          messageType: 'user',
          channel: 'chat',
          conversation: expect.objectContaining({
            author: 'customer@example.com',
          }),
        })
      );
    });

    it('should ignore messages from bot itself (default agent address)', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
      const customChannel = new ChatChannel(tac.getChannelDeps(), { agentAddress: 'custom-bot' });

      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
      customChannel.on('messageReceived', messageCallback);

      await customChannel.processWebhook(webhookPayload);

      expect(messageCallback).not.toHaveBeenCalled();
    });

    it('should store channelId in session metadata', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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

      const session = channel.getConversationSession(TEST_CONVERSATION_ID);
      expect(session?.metadata?.channelId).toBe('CH00000000000000000000000000000000');
    });

    it('should process conversation.updated (closed) event', async () => {
      // First create a conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });

      const endedCallback = vi.fn();
      channel.on('conversationEnded', endedCallback);

      // Then close it
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          status: 'CLOSED',
        },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);
      expect(endedCallback).toHaveBeenCalledWith({
        session: expect.objectContaining({
          conversationId: TEST_CONVERSATION_ID,
          channel: 'chat',
        }),
      });
    });

    it('should ignore empty messages', async () => {
      const webhookPayload = {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
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
      // Access the conversation client's axios instance through TAC
      const conversationClient = (tac as any).conversationClient;
      mockAdapter = new MockAdapter(conversationClient.axiosInstance);
      // Reset history to clear the getConfiguration call from TAC initialization
      mockAdapter.resetHistory();

      // Stub retrieveMemory to avoid HTTP calls during webhook processing
      vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as any);
    });

    it('should send response via Actions API with existing AI_AGENT', async () => {
      // Setup conversation
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_123',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      // Mock listParticipants (AI_AGENT exists)
      mockAdapter.onGet(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`).reply(200, {
        participants: [
          {
            id: 'PA_agent_123',
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'AI_AGENT',
            addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
          },
          {
            id: 'PA_customer_123',
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'CUSTOMER',
            addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
          },
        ],
      });

      // Mock createAction
      mockAdapter.onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`).reply(202, {
        id: 'AC_action_01test00000000000000000000',
        type: 'SEND_MESSAGE',
        status: 'PENDING',
        conversationId: TEST_CONVERSATION_ID,
        createdAt: '2026-04-23T00:00:00Z',
      });

      await channel.sendResponse(TEST_CONVERSATION_ID, 'Hello from bot');

      // Verify requests (listParticipants + createAction)
      const history = mockAdapter.history;
      expect(history.get.length).toBe(1); // listParticipants
      expect(history.post.length).toBe(1);
      expect(history.post[0].url).toBe(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`);
      const sendBody = JSON.parse(history.post[0].data);
      expect(sendBody).toMatchObject({
        type: 'SEND_MESSAGE',
        payload: {
          from: {
            channel: 'CHAT',
            participantId: 'PA_agent_123',
          },
          to: [
            {
              channel: 'CHAT',
              participantId: 'PA_customer_123',
            },
          ],
          content: { text: 'Hello from bot' },
          channelSettings: { channelId: 'CH00000000000000000000000000000000' },
        },
      });
      // from/to should not carry redundant address when participantId is present (Mode 1)
      expect(sendBody.payload.from.address).toBeUndefined();
      expect(sendBody.payload.to[0].address).toBeUndefined();
    });

    it('should create AI_AGENT participant if not exists', async () => {
      // Setup conversation
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_123',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      // Mock listParticipants (no AI_AGENT)
      mockAdapter.onGet(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`).reply(200, {
        participants: [
          {
            id: 'PA_customer_123',
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'CUSTOMER',
            addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
          },
        ],
      });

      // Mock addParticipant
      mockAdapter.onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`).reply(201, {
        id: 'PA_agent_123',
        conversationId: TEST_CONVERSATION_ID,
        accountId: 'ACtest123456789',
        type: 'AI_AGENT',
        addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
      });

      // Mock createAction
      mockAdapter.onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`).reply(202, {
        id: 'AC_action_01test00000000000000000000',
        type: 'SEND_MESSAGE',
        status: 'PENDING',
        conversationId: TEST_CONVERSATION_ID,
      });

      await channel.sendResponse(TEST_CONVERSATION_ID, 'Hello from bot');

      // Verify requests (listParticipants + addParticipant + createAction)
      const history = mockAdapter.history;
      expect(history.get.length).toBe(1); // listParticipants
      expect(history.post.length).toBe(2); // addParticipant + createAction

      // Verify addParticipant call
      const addCall = history.post[0];
      expect(addCall.url).toBe(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`);
      const addBody = JSON.parse(addCall.data);
      expect(addBody).toMatchObject({
        type: 'AI_AGENT',
        addresses: [
          {
            channel: 'CHAT',
            address: 'ai-assistant',
            channelId: 'CH00000000000000000000000000000000',
          },
        ],
      });

      // Verify createAction call
      const actionCall = history.post[1];
      expect(actionCall.url).toBe(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`);
      const actionBody = JSON.parse(actionCall.data);
      expect(actionBody.type).toBe('SEND_MESSAGE');
      expect(actionBody.payload.from.participantId).toBe('PA_agent_123');
      expect(actionBody.payload.to[0].participantId).toBe('PA_customer_123');
    });

    it('should handle race condition when creating AI_AGENT', async () => {
      // Setup conversation
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_123',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hello' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      // Mock listParticipants - first call returns no AI_AGENT, second call returns AI_AGENT
      mockAdapter
        .onGet(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`)
        .replyOnce(200, {
          participants: [
            {
              id: 'PA_customer_123',
              conversationId: TEST_CONVERSATION_ID,
              accountId: 'ACtest123456789',
              type: 'CUSTOMER',
              addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
            },
          ],
        })
        .onGet(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`)
        .replyOnce(200, {
          participants: [
            {
              id: 'PA_agent_123',
              conversationId: TEST_CONVERSATION_ID,
              accountId: 'ACtest123456789',
              type: 'AI_AGENT',
              addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
            },
            {
              id: 'PA_customer_123',
              conversationId: TEST_CONVERSATION_ID,
              accountId: 'ACtest123456789',
              type: 'CUSTOMER',
              addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
            },
          ],
        });

      // Mock addParticipant failure (already exists)
      mockAdapter.onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`).reply(409, {
        error: 'Participant already exists',
      });

      // Mock createAction
      mockAdapter.onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`).reply(202, {
        id: 'AC_action_01test00000000000000000000',
        type: 'SEND_MESSAGE',
        status: 'PENDING',
        conversationId: TEST_CONVERSATION_ID,
      });

      await channel.sendResponse(TEST_CONVERSATION_ID, 'Hello from bot');

      // Verify requests: 2x listParticipants + addParticipant + createAction
      const history = mockAdapter.history;
      expect(history.get.length).toBe(2); // 2x listParticipants (retry after 409)
      expect(history.post.length).toBe(2); // addParticipant + createAction
    });

    it('should throw error if no active session', async () => {
      await expect(channel.sendResponse(TEST_CONVERSATION_ID, 'Hello')).rejects.toThrow(
        'No active session found'
      );
    });

    it('should throw error if no author info', async () => {
      // Create conversation without author info
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });

      await expect(channel.sendResponse(TEST_CONVERSATION_ID, 'Hello')).rejects.toThrow(
        'No author info found'
      );
    });

    it('forwards conversationsV1ServiceSid as channelSettings.chatService when set', async () => {
      // Fresh channel with the V1 bridge SID wired via ChatChannelConfig.
      const chatWithBridge = new ChatChannel(tac.getChannelDeps(), {
        conversationsV1ServiceSid: 'IS01testv1bridgeaabbccddeeff',
      });

      // Seed session via inbound webhook so metadata.channelId is populated.
      await chatWithBridge.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          author: {
            address: 'customer@example.com',
            participantId: 'PA_customer_bridge',
            channel: 'CHAT',
          },
          content: { type: 'TEXT', text: 'Hi' },
          channelId: 'CH00000000000000000000000000000000',
        },
      });

      mockAdapter.onGet(`/v2/Conversations/${TEST_CONVERSATION_ID}/Participants`).reply(200, {
        participants: [
          {
            id: 'PA_agent_bridge',
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'AI_AGENT',
            addresses: [{ channel: 'CHAT', address: 'ai-assistant' }],
          },
          {
            id: 'PA_customer_bridge',
            conversationId: TEST_CONVERSATION_ID,
            accountId: 'ACtest123456789',
            type: 'CUSTOMER',
            addresses: [{ channel: 'CHAT', address: 'customer@example.com' }],
          },
        ],
      });
      mockAdapter.onPost(`/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`).reply(202, {
        id: 'AC_action_01test00000000000000000000',
        type: 'SEND_MESSAGE',
        status: 'PENDING',
        conversationId: TEST_CONVERSATION_ID,
      });

      await chatWithBridge.sendResponse(TEST_CONVERSATION_ID, 'Hello back');

      const actionCall = mockAdapter.history.post.find(
        c => c.url === `/v2/Conversations/${TEST_CONVERSATION_ID}/Actions`
      );
      expect(actionCall).toBeDefined();
      const body = JSON.parse(actionCall!.data);
      expect(body.payload.channelSettings.chatService).toBe('IS01testv1bridgeaabbccddeeff');
      expect(body.payload.channelSettings.channelId).toBe('CH00000000000000000000000000000000');
    });
  });
});
