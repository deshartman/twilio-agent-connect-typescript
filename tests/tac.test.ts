import { describe, it, expect, vi } from 'vitest';
import { TAC, TACConfig, TACMode, createLogger } from '@twilio/tac-core';

describe('TAC Core', () => {
  const getTestConfig = () => ({
    environment: 'dev' as const,
    tacMode: 'conversation' as TACMode,
    twilioAccountSid: 'ACtest123456789',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'test_api_key',
    twilioApiToken: 'test_api_token',
    twilioPhoneNumber: '+15551234567',
    conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  describe('initialization', () => {
    it('should initialize TAC with config object', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      expect(tac).toBeInstanceOf(TAC);
    });

    it('should initialize TAC without config (from environment)', () => {
      // This will fail without env vars but should instantiate
      const keys = [
        'ENVIRONMENT',
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_PHONE_NUMBER',
        'MEMORY_STORE_ID',
        'CONVERSATION_SERVICE_ID',
        'VOICE_PUBLIC_DOMAIN',
      ] as const;
      const snapshot: Record<(typeof keys)[number], string | undefined> = {
        ENVIRONMENT: process.env.ENVIRONMENT,
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
        MEMORY_STORE_ID: process.env.MEMORY_STORE_ID,
        CONVERSATION_SERVICE_ID: process.env.CONVERSATION_SERVICE_ID,
        VOICE_PUBLIC_DOMAIN: process.env.VOICE_PUBLIC_DOMAIN,
      };

      try {
        keys.forEach(key => {
          delete process.env[key];
        });

        expect(() => new TAC()).toThrow();
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

    it('should provide access to config', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      const retrievedConfig = tac.getConfig();
      expect(retrievedConfig.environment).toBe('dev');
      expect(retrievedConfig.twilioAccountSid).toBe('ACtest123456789');
    });

    it('should provide access to clients', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      // Memory client should be undefined when memoryStoreId not provided
      expect(tac.getMemoryClient()).toBeUndefined();
      expect(tac.getConversationClient()).toBeDefined();
    });

    it('should initialize memory client when memoryStoreId is provided', () => {
      const configWithMemory = {
        ...getTestConfig(),
        memoryStoreId: 'mem_store_01kbjqhhdpft0tbp21jt4ktbxg',
      };
      const config = new TACConfig(configWithMemory);
      const tac = new TAC({ config });

      expect(tac.getMemoryClient()).toBeDefined();
    });

    it('should start with no channels (until explicitly registered)', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      // Verify no channels are registered by default
      const smsChannel = tac.getChannel('sms');
      const voiceChannel = tac.getChannel('voice');
      expect(smsChannel).toBeUndefined();
      expect(voiceChannel).toBeUndefined();
    });

    it('should log warning when crelay mode has conversationServiceId configured', () => {
      const logger = createLogger({ name: 'test', level: 'silent' });
      const loggerSpy = vi.spyOn(logger, 'warn');

      const config = new TACConfig({
        ...getTestConfig(),
        tacMode: 'crelay',
        // conversationServiceId is still set from getTestConfig()
      });

      const tac = new TAC({ config, logger });

      expect(loggerSpy).toHaveBeenCalledWith(
        {
          tac_mode: 'crelay',
          conversation_service_id: getTestConfig().conversationServiceId,
        },
        expect.stringContaining('Maestro features will be ignored in crelay mode')
      );
      expect(tac).toBeInstanceOf(TAC);
    });

    it('should not log warning when crelay mode has no conversationServiceId', () => {
      const logger = createLogger({ name: 'test', level: 'silent' });
      const loggerSpy = vi.spyOn(logger, 'warn');

      const config = new TACConfig({
        environment: 'dev' as const,
        tacMode: 'crelay' as TACMode,
        twilioAccountSid: 'ACtest123456789',
        twilioAuthToken: 'test_token_123',
        twilioApiKey: 'test_api_key',
        twilioApiToken: 'test_api_token',
        twilioPhoneNumber: '+15551234567',
        // No conversationServiceId
      });

      const tac = new TAC({ config, logger });

      expect(loggerSpy).not.toHaveBeenCalled();
      expect(tac).toBeInstanceOf(TAC);
    });

    it('should not log warning when conversation mode has conversationServiceId', () => {
      const logger = createLogger({ name: 'test', level: 'silent' });
      const loggerSpy = vi.spyOn(logger, 'warn');

      const config = new TACConfig(getTestConfig()); // conversation mode with conversationServiceId

      const tac = new TAC({ config, logger });

      expect(loggerSpy).not.toHaveBeenCalled();
      expect(tac).toBeInstanceOf(TAC);
    });
  });

  describe('callback registration', () => {
    it('should register message ready callback', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      const mockCallback = () => 'response';

      expect(() => {
        tac.onMessageReady(mockCallback);
      }).not.toThrow();
    });

    it('should register error callback', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      const mockCallback = () => {};

      expect(() => {
        tac.onError(mockCallback);
      }).not.toThrow();
    });

    it('should register handoff callback', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      const mockCallback = () => {};

      expect(() => {
        tac.onHandoff(mockCallback);
      }).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('should shutdown cleanly', () => {
      const config = new TACConfig(getTestConfig());
      const tac = new TAC({ config });

      expect(() => {
        tac.shutdown();
      }).not.toThrow();
    });
  });
});
