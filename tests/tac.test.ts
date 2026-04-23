import { describe, it, expect, vi } from 'vitest';
import { TAC, SMSChannel, ConversationId } from '@twilio/tac-core';
import { createTestTAC, createTestTACWithMemory } from './helpers/tac';

describe('TAC Core', () => {
  const getTestConfig = () => ({
    accountSid: 'ACtest123456789',
    authToken: 'test_token_123',
    apiKey: 'test_api_key',
    apiSecret: 'test_api_token',
    phoneNumber: '+15551234567',
    conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  describe('initialization', () => {
    it('should prevent direct construction with clear error message', () => {
      expect(() => {
        new (TAC as any)();
      }).toThrow('TAC constructor is private. Use TAC.create() instead of new TAC().');
    });

    it('should initialize TAC with config object', async () => {
      const tac = await createTestTAC(getTestConfig());

      expect(tac).toBeInstanceOf(TAC);
    });

    it('should initialize TAC without config (from environment)', async () => {
      // This will fail without env vars but should instantiate
      const keys = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_PHONE_NUMBER',
        'MEMORY_STORE_ID',
        'TWILIO_CONVERSATION_CONFIGURATION_ID',
        'VOICE_PUBLIC_DOMAIN',
      ] as const;
      const snapshot: Record<(typeof keys)[number], string | undefined> = {
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
        MEMORY_STORE_ID: process.env.MEMORY_STORE_ID,
        TWILIO_CONVERSATION_CONFIGURATION_ID: process.env.TWILIO_CONVERSATION_CONFIGURATION_ID,
        VOICE_PUBLIC_DOMAIN: process.env.VOICE_PUBLIC_DOMAIN,
      };

      try {
        keys.forEach(key => {
          delete process.env[key];
        });

        await expect(TAC.create()).rejects.toThrow();
      } finally {
        keys.forEach(key => {
          const value = snapshot[key];
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        });
      }
    });

    it('should provide access to config', async () => {
      const tac = await createTestTAC(getTestConfig());

      const retrievedConfig = tac.getConfig();
      expect(retrievedConfig.accountSid).toBe('ACtest123456789');
    });

    it('should provide access to clients', async () => {
      const tac = await createTestTAC(getTestConfig());

      expect(tac.getMemoryClient()).toBeDefined();
      expect(tac.getConversationClient()).toBeDefined();
    });

    it('should initialize memory client when memoryStoreId is provided from conversation config', async () => {
      const tac = await createTestTACWithMemory(getTestConfig());

      expect(tac.getMemoryClient()).toBeDefined();
    });

    it('should start with no channels (until explicitly registered)', async () => {
      const tac = await createTestTAC(getTestConfig());

      // Verify no channels are registered by default
      const smsChannel = tac.getChannel('sms');
      const voiceChannel = tac.getChannel('voice');
      expect(smsChannel).toBeUndefined();
      expect(voiceChannel).toBeUndefined();
    });
  });

  describe('callback registration', () => {
    it('should register message ready callback', async () => {
      const tac = await createTestTAC(getTestConfig());

      const mockCallback = () => 'response';

      expect(() => {
        tac.onMessageReady(mockCallback);
      }).not.toThrow();
    });

    it('should register error callback', async () => {
      const tac = await createTestTAC(getTestConfig());

      const mockCallback = () => {};

      expect(() => {
        tac.onError(mockCallback);
      }).not.toThrow();
    });

    it('should register handoff callback', async () => {
      const tac = await createTestTAC(getTestConfig());

      const mockCallback = () => {};

      expect(() => {
        tac.onHandoff(mockCallback);
      }).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('should shutdown cleanly', async () => {
      const tac = await createTestTAC(getTestConfig());

      expect(() => {
        tac.shutdown();
      }).not.toThrow();
    });
  });

  describe('auto-send return-value dispatch', () => {
    const TEST_CONVERSATION_ID =
      'conv_conversation_01testautosendaabbccddeeff' as ConversationId;

    const drainMessage = async (channel: SMSChannel): Promise<void> => {
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          content: { type: 'TEXT', text: 'hello' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      });
      // Flush microtasks so the message handler (and any auto-send) completes
      // before we assert.
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    it('should warn and skip auto-send on empty string', async () => {
      const tac = await createTestTAC(getTestConfig());
      vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
      const channel = new SMSChannel(tac.getChannelDeps());
      tac.registerChannel(channel);

      const sendSpy = vi.spyOn(channel, 'sendResponse').mockResolvedValue();
      const warnSpy = vi.spyOn(tac.logger, 'warn').mockImplementation(() => {});

      tac.onMessageReady(() => '');

      // The webhook → handleMessage chain crosses multiple microtask boundaries
      // (event emit, async callback await, then the warn). Use vi.waitFor so
      // the assertion polls until the warn fires rather than gating on a
      // single setTimeout(0) flush.
      await channel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: TEST_CONVERSATION_ID },
      });
      await channel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: TEST_CONVERSATION_ID,
          content: { type: 'TEXT', text: 'hello' },
          author: { address: '+15559876543', channel: 'SMS' },
        },
      });

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          { conversation_id: TEST_CONVERSATION_ID, channel: 'sms' },
          'Callback returned empty string, skipping auto-send'
        );
      });

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should not auto-send when callback returns null', async () => {
      const tac = await createTestTAC(getTestConfig());
      vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);
      const channel = new SMSChannel(tac.getChannelDeps());
      tac.registerChannel(channel);

      const sendSpy = vi.spyOn(channel, 'sendResponse').mockResolvedValue();
      tac.onMessageReady(() => null);

      await drainMessage(channel);

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should not auto-send when callback returns a non-string value', async () => {
      // TAC's auto-send is a typeof === 'string' check. Numbers, objects,
      // booleans, etc. must all fall through to the manual-handling path.
      // We cover number and object here because those are the two a callback
      // is most likely to return by accident (forgot to stringify a response
      // payload, returned the raw LLM response envelope, etc).
      const tac = await createTestTAC(getTestConfig());
      vi.spyOn(tac, 'retrieveMemory').mockResolvedValue(undefined as never);

      const numberChannel = new SMSChannel(tac.getChannelDeps());
      tac.registerChannel(numberChannel);
      const numberSpy = vi.spyOn(numberChannel, 'sendResponse').mockResolvedValue();

      tac.onMessageReady(() => 123 as unknown as string);
      await drainMessage(numberChannel);
      expect(numberSpy).not.toHaveBeenCalled();

      tac.onMessageReady(() => ({ message: 'test' }) as unknown as string);
      await drainMessage(numberChannel);
      expect(numberSpy).not.toHaveBeenCalled();
    });
  });
});
