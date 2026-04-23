import { describe, it, expect, vi } from 'vitest';
import {
  VoiceChannel,
  TACConfig,
  createLogger,
  ConversationClient,
  TACMemoryResponse,
  type ChannelMessage,
} from '@twilio/tac-core';
import { ConversationRelay } from '@twilio/tac-conversationrelay';

/**
 * Passive-mode VoiceChannel coverage.
 *
 * Passive mode = no ConversationRelay injected. Webhook events emit
 * ChannelMessages exactly like SMS/Chat. CR-exclusive methods throw with
 * a clear message.
 *
 * Active-mode-specific coverage (CR bridge, handleIncomingCall TwiML,
 * interrupt handling, etc.) lives in voice-channel.test.ts and
 * voice-channel-active-memory.test.ts.
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

describe('VoiceChannel (passive mode — no ConversationRelay)', () => {
  describe('construction', () => {
    it('constructs without throwing when conversationRelay is omitted', () => {
      const deps = makeDeps();
      expect(() => new VoiceChannel(deps)).not.toThrow();
    });

    it('still reports channelType as voice', () => {
      const deps = makeDeps();
      const channel = new VoiceChannel(deps);
      expect(channel.channelType).toBe('voice');
    });
  });

  describe('CR-exclusive methods throw with a clear message', () => {
    const makeChannel = () => new VoiceChannel(makeDeps());

    it('sendResponse throws', async () => {
      const channel = makeChannel();
      await expect(channel.sendResponse(TEST_CONVERSATION_ID, 'hi')).rejects.toThrow(
        /VoiceChannel\.sendResponse requires an active ConversationRelay/
      );
    });

    it('handleIncomingCall throws', async () => {
      const channel = makeChannel();
      await expect(
        channel.handleIncomingCall({
          toNumber: '+15551234567',
          fromNumber: '+15559876543',
          conversationRelayConfig: { url: 'wss://example/ws', welcomeGreeting: 'hi' },
        })
      ).rejects.toThrow(/handleIncomingCall requires an active ConversationRelay/);
    });

    it('handleWebSocketConnection throws', () => {
      const channel = makeChannel();
      expect(() =>
        channel.handleWebSocketConnection({} as unknown as Parameters<typeof channel.handleWebSocketConnection>[0])
      ).toThrow(/handleWebSocketConnection requires an active ConversationRelay/);
    });

    it('sendDigits / sendPlay / endCall throw', () => {
      const channel = makeChannel();
      expect(() => channel.sendDigits(TEST_CONVERSATION_ID, '1234')).toThrow(
        /sendDigits requires an active ConversationRelay/
      );
      expect(() => channel.sendPlay(TEST_CONVERSATION_ID, 'https://example/audio.mp3')).toThrow(
        /sendPlay requires an active ConversationRelay/
      );
      expect(() => channel.endCall(TEST_CONVERSATION_ID)).toThrow(
        /endCall requires an active ConversationRelay/
      );
    });

    it('executeTool throws', async () => {
      const channel = makeChannel();
      await expect(channel.executeTool(TEST_CONVERSATION_ID, 'tool_name', {})).rejects.toThrow(
        /executeTool requires an active ConversationRelay/
      );
    });

    it('getWebsocket returns null (not a throw — this is a lookup, not a CR call)', () => {
      const channel = makeChannel();
      expect(channel.getWebsocket(TEST_CONVERSATION_ID)).toBeNull();
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

      // First start the conversation so the CONVERSATION_UPDATED filter passes
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

describe('VoiceChannel (active mode) — passive-path drop behaviour', () => {
  it('drops passive COMMUNICATION_CREATED events when CR is connected (prevents double-emit)', async () => {
    const deps = makeDeps();
    const conversationRelay = new ConversationRelay(deps.logger.child({ component: 'crelay' }));
    const channel = new VoiceChannel(deps, { conversationRelay });

    const emitted = vi.fn();
    channel.on('message', emitted);

    await channel.processWebhook({
      eventType: 'COMMUNICATION_CREATED',
      data: {
        conversationId: TEST_CONVERSATION_ID,
        author: { address: '+15559876543', channel: 'VOICE', participantId: 'PA_customer' },
        content: { type: 'TEXT', text: 'transcript from Maestro' },
      },
    });

    expect(emitted).not.toHaveBeenCalled();
    channel.shutdown();
  });

  it('still handles CONVERSATION_CREATED / CONVERSATION_UPDATED in active mode for lifecycle bookkeeping', async () => {
    const deps = makeDeps();
    const conversationRelay = new ConversationRelay(deps.logger.child({ component: 'crelay' }));
    const channel = new VoiceChannel(deps, { conversationRelay });

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

    channel.shutdown();
  });
});
