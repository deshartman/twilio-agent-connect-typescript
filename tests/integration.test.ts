import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpyInstance } from 'vitest';
import { TAC, SMSChannel } from '@twilio/tac-core';

describe('Integration Tests', () => {
  const getTestConfig = () => ({

    twilioAccountSid: 'ACtest123456789',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'test_api_key',
    twilioApiToken: 'test_api_token',
    twilioPhoneNumber: '+15551234567',
    conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  let tac: TAC;
  let channel: SMSChannel;
  let fetchSpy: SpyInstance;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL) => {
      const urlString = url.toString();

      // Mock listParticipants call
      if (urlString.includes('/Participants')) {
        const participantResponse = {
          participants: [
            {
              id: 'conv_participant_01pa111456789012345',
              conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
              accountId: 'ACtest123456789',
              type: 'HUMAN_AGENT',
              addresses: [{ channel: 'SMS', address: '+15551234567' }],
            },
            {
              id: 'PA222',
              conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
              accountId: 'ACtest123456789',
              type: 'CUSTOMER',
              addresses: [{ channel: 'SMS', address: '+15559876543' }],
            },
          ],
        };

        return new Response(JSON.stringify(participantResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mock sendCommunication call (returns 202 Accepted)
      const sendResponse = {
        message: 'Conversation setup complete',
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        channelId: 'SM123abc',
      };

      return new Response(JSON.stringify(sendResponse), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    tac = new TAC({ config: getTestConfig() });
    channel = new SMSChannel(tac.getChannelDeps());
    tac.registerChannel(channel);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('SMS end-to-end workflow', () => {
    it('should handle complete SMS conversation flow', async () => {
      let capturedContext: any = null;

      // Register message callback — receives ChannelMessage
      tac.onMessageReady(msg => {
        capturedContext = {
          conversationId: msg.conversationId,
          profileId: msg.conversation?.profileId,
          message: msg.message,
          author: msg.conversation?.author,
          session: msg.conversation,
        };
        return 'Hello back!';
      });

      // Simulate conversation start
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          profileId: 'mem_profile_01testprofile0000000000001',
        },
      });

      // Simulate message received
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: 'Hello TAC',
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
          },
        },
      });

      // Wait a tick for async callbacks
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify callback was invoked with correct context
      expect(capturedContext).not.toBeNull();
      expect(capturedContext.conversationId).toBe('conv_conversation_01ktestabcdefghijklmnopqrs');
      expect(capturedContext.message).toBe('Hello TAC');
      expect(capturedContext.author).toBe('+15559876543');
      expect(capturedContext.session).toBeDefined();
      expect(capturedContext.session.startedAt).toBeInstanceOf(Date);
    });

    it('should handle multiple concurrent conversations', async () => {
      const capturedMessages: any[] = [];

      tac.onMessageReady(msg => {
        capturedMessages.push(msg);
      });

      // Start multiple conversations with distinct IDs
      const conversations = [
        'conv_conversation_01ktest1abcdefghijklmnopqr',
        'conv_conversation_01ktest2abcdefghijklmnopqr',
        'conv_conversation_01ktest3abcdefghijklmnopqr',
      ];

      for (const convId of conversations) {
        await channel.processWebhook({
          eventType: 'CONVERSATION_CREATED',
          data: {
            conversationId: convId,
          },
        });

        await channel.processWebhook({
          eventType: 'COMMUNICATION_CREATED',
          data: {
            conversationId: convId,
            content: {
              type: 'TEXT',
              text: `Message from ${convId}`,
            },
            author: {
              address: '+15559876543',
              channel: 'SMS',
            },
          },
        });
      }

      // Verify all conversations were processed
      expect(capturedMessages).toHaveLength(3);
      expect(capturedMessages.map(m => m.conversationId)).toContain('conv_conversation_01ktest1abcdefghijklmnopqr');
      expect(capturedMessages.map(m => m.conversationId)).toContain('conv_conversation_01ktest2abcdefghijklmnopqr');
      expect(capturedMessages.map(m => m.conversationId)).toContain('conv_conversation_01ktest3abcdefghijklmnopqr');
    });

    it('should filter out empty messages', async () => {
      const capturedMessages: any[] = [];

      tac.onMessageReady(msg => {
        capturedMessages.push(msg);
      });

      // Send valid message
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: 'Valid message',
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
          },
        },
      });

      // Send empty messages (should be filtered)
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: '',
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
          },
        },
      });

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          content: {
            type: 'TEXT',
            text: '   ', // Whitespace only
          },
          author: {
            address: '+15559876543',
            channel: 'SMS',
          },
        },
      });

      // Only valid message should be processed
      expect(capturedMessages).toHaveLength(1);
      expect(capturedMessages[0].message).toBe('Valid message');
    });

    it('should handle conversation cleanup', async () => {
      // Start conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(true);

      // End conversation
      await channel.processWebhook({
        eventType: 'CONVERSATION_UPDATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          status: 'CLOSED',
        },
      });

      expect(channel.isConversationActive('conv_conversation_01ktestabcdefghijklmnopqrs')).toBe(false);
    });
  });

  describe('callback registration and execution', () => {
    it('should handle message callback errors gracefully', async () => {
      // Register callback that throws error
      tac.onMessageReady(() => {
        throw new Error('Callback error');
      });

      // Should not throw when callback errors
      await expect(
        channel.processWebhook({
          eventType: 'COMMUNICATION_CREATED',
          data: {
            conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
            content: {
              type: 'TEXT',
              text: 'Test message',
            },
            author: {
              address: '+15559876543',
              channel: 'SMS',
            },
          },
        })
      ).resolves.not.toThrow();
    });

    it('should handle handoff workflow', async () => {
      let handoffCalled = false;
      let handoffReason: string | null = null;

      tac.onHandoff(({ reason }) => {
        handoffCalled = true;
        handoffReason = reason;
      });

      // Start a conversation first
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        },
      });

      // Trigger handoff
      await tac.triggerHandoff(
        'conv_conversation_01ktestabcdefghijklmnopqrs',
        'User requested human agent'
      );

      expect(handoffCalled).toBe(true);
      expect(handoffReason).toBe('User requested human agent');
    });
  });

  describe('channel management', () => {
    it('should register and retrieve channels', () => {
      const smsChannel = tac.getChannel('sms');
      expect(smsChannel).toBe(channel);

      const voiceChannel = tac.getChannel('voice');
      expect(voiceChannel).toBeUndefined();
    });

    it('should replace existing channel of same type', () => {
      const newChannel = new SMSChannel(tac.getChannelDeps());

      // Register new channel of same type
      tac.registerChannel(newChannel);

      const smsChannel = tac.getChannel('sms');
      expect(smsChannel).toBe(newChannel);
      expect(smsChannel).not.toBe(channel);
    });
  });

  describe('framework lifecycle', () => {
    it('should shutdown cleanly', () => {
      tac.shutdown();

      expect(tac.getChannel('sms')).toBeUndefined();
      expect(tac.getChannel('voice')).toBeUndefined();
    });
  });
});
