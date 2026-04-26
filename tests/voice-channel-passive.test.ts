import { describe, it, expect, vi } from 'vitest';
import {
  VoiceChannel,
  TACConfig,
  createLogger,
  ConversationClient,
  TACMemoryResponse,
  type ChannelMessage,
} from '@twilio/tac-core';

/**
 * VoiceChannel — passive Maestro voice channel.
 *
 * After the WS-SESSIONS split, VoiceChannel is passive-only: it consumes
 * Maestro voice webhooks and emits ChannelMessages like SMS/Chat. Active
 * voice (CR WebSocket egress) lives in ConversationRelayChannel and is
 * tested separately in conversation-relay-channel.test.ts.
 */

const getTestConfig = () => ({
  accountSid: 'ACtest123456789',
  authToken: 'test_token_123',
  apiKey: 'SKtest_api_key',
  apiSecret: 'test_api_token',
  phoneNumber: '+15555555555',
  conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
});

const TEST_CONVERSATION_ID = 'conv_conversation_01testvoiceaabbccddeeffggh';
const TEST_PROFILE_ID = 'mem_profile_01testvoiceaabbccddeeffgg';

const makeDeps = () => {
  const config = new TACConfig(getTestConfig());
  const logger = createLogger({ name: 'test', level: 'silent' });
  const conversationClient = {
    createConversation: vi.fn(),
    addParticipant: vi.fn(),
    addOrFetchParticipant: vi.fn(),
    listConversations: vi.fn(),
    updateConversation: vi.fn(),
    listParticipants: vi.fn(),
    createAction: vi.fn(),
    listCommunications: vi.fn(),
  } as unknown as ConversationClient;
  const memoryRetriever = vi.fn().mockResolvedValue(
    new TACMemoryResponse({ observations: [], summaries: [], communications: [] })
  );
  return { config, logger, conversationClient, memoryRetriever };
};

describe('VoiceChannel (passive Maestro)', () => {
  describe('construction', () => {
    it('constructs without extra config', () => {
      const deps = makeDeps();
      expect(() => new VoiceChannel(deps)).not.toThrow();
    });

    it('reports channelType as voice', () => {
      const deps = makeDeps();
      const channel = new VoiceChannel(deps);
      expect(channel.channelType).toBe('voice');
    });
  });

  describe('sendResponse throws — passive voice has no outbound path', () => {
    it('rejects sendResponse with a clear message pointing at ConversationRelayChannel', async () => {
      const channel = new VoiceChannel(makeDeps());
      await expect(channel.sendResponse(TEST_CONVERSATION_ID, 'hi')).rejects.toThrow(
        /VoiceChannel\.sendResponse is not supported.*ConversationRelayChannel/s
      );
    });

    it('does not expose sendDigits / sendPlay / endCall / executeTool methods', () => {
      const channel = new VoiceChannel(makeDeps());
      // Active-voice protocol methods live on ConversationRelayChannel only.
      // Passive VoiceChannel intentionally lacks them — contrast with ChannelMessage
      // pattern which is the shared emit path.
      expect(
        (channel as unknown as { sendDigits?: unknown }).sendDigits
      ).toBeUndefined();
      expect((channel as unknown as { sendPlay?: unknown }).sendPlay).toBeUndefined();
      expect((channel as unknown as { endCall?: unknown }).endCall).toBeUndefined();
      expect(
        (channel as unknown as { executeTool?: unknown }).executeTool
      ).toBeUndefined();
    });
  });

  describe('processWebhook emits ChannelMessages like SMS/Chat', () => {
    it('emits a user-type ChannelMessage on COMMUNICATION_CREATED', async () => {
      const channel = new VoiceChannel(makeDeps());

      const captured: ChannelMessage[] = [];
      const messageReceived = new Promise<void>(resolve => {
        channel.on('message', (msg: ChannelMessage) => {
          captured.push(msg);
          resolve();
        });
      });

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          profileId: TEST_PROFILE_ID,
          author: { address: '+15559876543', channel: 'VOICE', participantId: 'PA_customer' },
          content: { type: 'TEXT', text: 'Hello from the transcript' },
        },
      });

      await messageReceived;

      expect(captured).toHaveLength(1);
      expect(captured[0].channel).toBe('voice');
      expect(captured[0].messageType).toBe('user');
      expect(captured[0].message).toBe('Hello from the transcript');
      expect(captured[0].conversationId).toBe(TEST_CONVERSATION_ID);
    });

    it('skips COMMUNICATION_CREATED authored by the bot itself (phoneNumber match)', async () => {
      const channel = new VoiceChannel(makeDeps());

      const emitted = vi.fn();
      channel.on('message', emitted);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          author: { address: '+15555555555', channel: 'VOICE' }, // matches config.phoneNumber
          content: { type: 'TEXT', text: 'bot speaking' },
        },
      });

      expect(emitted).not.toHaveBeenCalled();
    });

    it('handles CONVERSATION_CREATED by starting a session', async () => {
      const channel = new VoiceChannel(makeDeps());

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(false);

      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID, profileId: TEST_PROFILE_ID },
      });

      expect(channel.isConversationActive(TEST_CONVERSATION_ID)).toBe(true);
    });

    it('handles CONVERSATION_UPDATED with status=CLOSED by ending the session', async () => {
      const channel = new VoiceChannel(makeDeps());

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

    it('filters out events whose author.channel is not VOICE', async () => {
      const channel = new VoiceChannel(makeDeps());

      const emitted = vi.fn();
      channel.on('message', emitted);

      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'from SMS' },
        },
      });

      expect(emitted).not.toHaveBeenCalled();
    });
  });
});
