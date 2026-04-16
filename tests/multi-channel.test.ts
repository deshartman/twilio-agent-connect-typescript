import { describe, it, expect, beforeEach } from 'vitest';
import {
  TAC,
  TACConfig,
  VoiceWebhookChannel,
  SMSChannel,
  ChatChannel,
  ChannelMessage,
} from '../src/index';

describe('Multi-Channel Orchestration', () => {
  let tac: TAC;
  let voiceChannel: VoiceWebhookChannel;
  let smsChannel: SMSChannel;
  let chatChannel: ChatChannel;

  const testConversationId = 'conv_conversation_01kmultichantestabcdefgh12';
  const testProfileId = 'mem_profile_01kmultitestabcdefghijklmn';

  beforeEach(() => {
    const config = new TACConfig({
      twilioAccountSid: 'ACtest123',
      twilioAuthToken: 'test_token',
      twilioApiKey: 'SKtest123',
      twilioApiToken: 'test_api_token',
      twilioPhoneNumber: '+15551234567',
      conversationServiceId: 'conv_configuration_01kmultitest12345678901234',
    });

    tac = new TAC({ config });

    // Initialize all three channel types (Voice, SMS, Chat)
    const channelDeps = tac.getChannelDeps();
    voiceChannel = new VoiceWebhookChannel(channelDeps);
    smsChannel = new SMSChannel(channelDeps);
    chatChannel = new ChatChannel(channelDeps);

    // Register all channels
    tac.registerChannel(voiceChannel);
    tac.registerChannel(smsChannel);
    tac.registerChannel(chatChannel);
  });

  describe('Channel Switching', () => {
    it('should maintain context when user switches from SMS to Voice', async () => {
      const messages: ChannelMessage[] = [];

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // Step 1: User starts conversation on SMS
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'Hello via SMS' },
        },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].channel).toBe('sms');
      expect(messages[0].message).toBe('Hello via SMS');
      expect(messages[0].conversationId).toBe(testConversationId);

      // Step 2: Same user continues on Voice (same conversationId)
      await voiceChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'VOICE' },
          content: { type: 'TEXT', text: 'Continuing via Voice' },
        },
      });

      expect(messages).toHaveLength(2);
      expect(messages[1].channel).toBe('voice');
      expect(messages[1].message).toBe('Continuing via Voice');
      expect(messages[1].conversationId).toBe(testConversationId);

      // Verify both channels track same conversation
      expect(smsChannel.isConversationActive(testConversationId)).toBe(true);
      expect(voiceChannel.isConversationActive(testConversationId)).toBe(true);
    });

    it('should maintain profileId across channel switches', async () => {
      const messages: ChannelMessage[] = [];

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // SMS message with profileId
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'SMS message' },
        },
      });

      // Voice message in same conversation (with profileId)
      await voiceChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
          author: { address: '+15559876543', channel: 'VOICE' },
          content: { type: 'TEXT', text: 'Voice message' },
        },
      });

      // Both messages should have same profileId
      expect(messages[0].conversation?.profileId).toBe(testProfileId);
      expect(messages[1].conversation?.profileId).toBe(testProfileId);
    });
  });

  describe('Simultaneous Multi-Channel', () => {
    it('should route messages correctly with all channels active', async () => {
      const messages: ChannelMessage[] = [];

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // Initialize conversation
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      // SMS message
      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'SMS message' },
        },
      });

      // Voice message
      await voiceChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'VOICE' },
          content: { type: 'TEXT', text: 'Voice message' },
        },
      });

      // Chat message
      await chatChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: 'user@example.com', channel: 'CHAT' },
          content: { type: 'TEXT', text: 'Chat message' },
        },
      });

      // Should have received all 3 messages
      expect(messages).toHaveLength(3);
      expect(messages[0].channel).toBe('sms');
      expect(messages[1].channel).toBe('voice');
      expect(messages[2].channel).toBe('chat');

      // All messages from same conversation
      expect(messages[0].conversationId).toBe(testConversationId);
      expect(messages[1].conversationId).toBe(testConversationId);
      expect(messages[2].conversationId).toBe(testConversationId);
    });

    it('should handle concurrent messages on different channels', async () => {
      const messages: ChannelMessage[] = [];

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // Initialize conversation
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      // Process messages concurrently
      await Promise.all([
        smsChannel.processWebhook({
          eventType: 'COMMUNICATION_CREATED',
          data: {
            conversationId: testConversationId,
            author: { address: '+15559876543', channel: 'SMS' },
            content: { type: 'TEXT', text: 'Concurrent SMS' },
          },
        }),
        voiceChannel.processWebhook({
          eventType: 'COMMUNICATION_CREATED',
          data: {
            conversationId: testConversationId,
            author: { address: '+15559876543', channel: 'VOICE' },
            content: { type: 'TEXT', text: 'Concurrent Voice' },
          },
        }),
        chatChannel.processWebhook({
          eventType: 'COMMUNICATION_CREATED',
          data: {
            conversationId: testConversationId,
            author: { address: 'user@example.com', channel: 'CHAT' },
            content: { type: 'TEXT', text: 'Concurrent Chat' },
          },
        }),
      ]);

      // All messages should be processed
      expect(messages).toHaveLength(3);

      // Should have one message from each channel
      const channels = messages.map((m) => m.channel);
      expect(channels).toContain('sms');
      expect(channels).toContain('voice');
      expect(channels).toContain('chat');
    });
  });

  describe('Channel Isolation', () => {
    it('should filter messages by channel type', async () => {
      const messages: ChannelMessage[] = [];

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // SMS channel should only process SMS events
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'VOICE' },
          content: { type: 'TEXT', text: 'Voice message to SMS channel' },
        },
      });

      // SMS channel should not process VOICE messages
      expect(messages).toHaveLength(0);

      // Now send proper SMS message
      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'Proper SMS message' },
        },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].channel).toBe('sms');
    });

    it('should maintain separate channel states', async () => {
      const conversationId1 = 'conv_conversation_01kmultitestabcdefghijkl01';
      const conversationId2 = 'conv_conversation_01kmultitestabcdefghijkl02';

      // Create conversation on SMS
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: conversationId1 },
      });

      // Create different conversation on Voice
      await voiceChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: conversationId2 },
      });

      // Each channel should track its own conversations
      expect(smsChannel.isConversationActive(conversationId1)).toBe(true);
      expect(smsChannel.isConversationActive(conversationId2)).toBe(false);

      expect(voiceChannel.isConversationActive(conversationId1)).toBe(false);
      expect(voiceChannel.isConversationActive(conversationId2)).toBe(true);
    });
  });

  describe('Conversation Lifecycle', () => {
    it('should end conversation across all channels', async () => {
      const endedCallbacks: string[] = [];

      tac.onConversationEnded((data) => {
        endedCallbacks.push(data.session.conversationId);
      });

      // Start conversation on multiple channels
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      await voiceChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'VOICE' },
          content: { type: 'TEXT', text: 'Voice message' },
        },
      });

      // Both channels tracking conversation
      expect(smsChannel.isConversationActive(testConversationId)).toBe(true);
      expect(voiceChannel.isConversationActive(testConversationId)).toBe(true);

      // Close conversation via SMS channel
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: testConversationId,
          status: 'CLOSED',
        },
      });

      // SMS channel should remove conversation
      expect(smsChannel.isConversationActive(testConversationId)).toBe(false);

      // Voice channel should also clean up when it processes close event
      await voiceChannel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: testConversationId,
          status: 'CLOSED',
        },
      });

      expect(voiceChannel.isConversationActive(testConversationId)).toBe(false);

      // Should have called ended callback for each channel
      expect(endedCallbacks).toHaveLength(2);
      expect(endedCallbacks[0]).toBe(testConversationId);
      expect(endedCallbacks[1]).toBe(testConversationId);
    });
  });

  describe('Channel Retrieval', () => {
    it('should retrieve channels by type', () => {
      const retrievedVoice = tac.getChannel('voice');
      const retrievedSMS = tac.getChannel('sms');
      const retrievedChat = tac.getChannel('chat');

      expect(retrievedVoice).toBe(voiceChannel);
      expect(retrievedSMS).toBe(smsChannel);
      expect(retrievedChat).toBe(chatChannel);
    });

    it('should return undefined for unregistered channel', () => {
      const config = new TACConfig({
        twilioAccountSid: 'ACtest123',
        twilioAuthToken: 'test_token',
        twilioApiKey: 'SKtest123',
        twilioApiToken: 'test_api_token',
        twilioPhoneNumber: '+15551234567',
        conversationServiceId: 'conv_configuration_01kmultitest12345678901234',
      });

      const emptyTac = new TAC({ config });
      expect(emptyTac.getChannel('voice')).toBeUndefined();
    });
  });
});
