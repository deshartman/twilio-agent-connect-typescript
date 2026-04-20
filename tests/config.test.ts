import { describe, it, expect, vi, afterEach } from 'vitest';
import { TACConfig } from '@twilio/tac-core';

describe('TACConfig', () => {
  const getTestConfigData = () => ({
    twilioAccountSid: 'ACtest123456789',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'SKtest123456789',
    twilioApiToken: 'test_api_token_123',
    twilioPhoneNumber: '+15551234567',
    memoryStoreId: 'mem_store_01kbjqhhdpft0tbp21jt4ktbxg',
    conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('should create config with valid data', () => {
      const configData = getTestConfigData();
      const config = new TACConfig(configData);

      expect(config.twilioAccountSid).toBe('ACtest123456789');
      expect(config.twilioAuthToken).toBe('test_token_123');
      expect(config.twilioPhoneNumber).toBe('+15551234567');
      expect(config.memoryStoreId).toBe('mem_store_01kbjqhhdpft0tbp21jt4ktbxg');
      expect(config.conversationServiceId).toBe('conv_configuration_01testconfigabc123xyzabcde');
    });

    it('should validate required fields', () => {
      expect(() => {
        new TACConfig({} as any);
      }).toThrow();
    });

    it('should validate Twilio SID formats', () => {
      const invalidConfig = {
        ...getTestConfigData(),
        twilioAccountSid: 'invalid_sid',
        conversationServiceId: 'invalid_conv_sid',
      };

      expect(() => {
        new TACConfig(invalidConfig);
      }).toThrow();
    });

    it('should reject legacy comms_service format', () => {
      const legacyConfig = {
        ...getTestConfigData(),
        conversationServiceId: 'comms_service_01kbjqhn79f0fvwfsxqzd5nqhd',
      };

      expect(() => {
        new TACConfig(legacyConfig);
      }).toThrow('Invalid Conversation Configuration ID format');
    });

    it('should validate memory store ID format when provided', () => {
      const invalidConfig = {
        ...getTestConfigData(),
        memoryStoreId: 'invalid_memory_sid',
      };

      expect(() => {
        new TACConfig(invalidConfig);
      }).toThrow();
    });

    it('should reject legacy mem_service_ format', () => {
      const legacyConfig = {
        ...getTestConfigData(),
        memoryStoreId: 'mem_service_01kbjqhhdpft0tbp21jt4ktbxg',
      };

      expect(() => {
        new TACConfig(legacyConfig);
      }).toThrow('Invalid Memory Store ID format');
    });

    it('should accept mem_store_ format', () => {
      const validConfig = {
        ...getTestConfigData(),
        memoryStoreId: 'mem_store_01kbjqhhdpft0tbp21jt4ktbxg',
      };

      const config = new TACConfig(validConfig);
      expect(config.memoryStoreId).toBe('mem_store_01kbjqhhdpft0tbp21jt4ktbxg');
    });

    it('should work without memoryStoreId', () => {
      const configWithoutMemory = {
        ...getTestConfigData(),
        memoryStoreId: undefined,
      };

      const config = new TACConfig(configWithoutMemory);

      expect(config.memoryStoreId).toBeUndefined();
      expect(config.conversationServiceId).toBe('conv_configuration_01testconfigabc123xyzabcde');
    });
  });

  describe('fromEnv', () => {
    const stubRequiredEnvVars = () => {
      vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest123');
      vi.stubEnv('TWILIO_AUTH_TOKEN', 'test_auth_token');
      vi.stubEnv('TWILIO_API_KEY', 'SKtest123');
      vi.stubEnv('TWILIO_API_TOKEN', 'test_api_token');
      vi.stubEnv('TWILIO_PHONE_NUMBER', '+1234567890');
      vi.stubEnv('MEMORY_STORE_ID', 'mem_store_01kbjqhhdpft0tbp21jt4ktbxg');
      vi.stubEnv('CONVERSATION_SERVICE_ID', 'conv_configuration_01testconfigabc123xyzabcde');
    };

    it('should create config when all required env vars are set', () => {
      stubRequiredEnvVars();

      const config = TACConfig.fromEnv();

      expect(config.twilioAccountSid).toBe('ACtest123');
      expect(config.twilioAuthToken).toBe('test_auth_token');
      expect(config.twilioPhoneNumber).toBe('+1234567890');
      expect(config.memoryStoreId).toBe('mem_store_01kbjqhhdpft0tbp21jt4ktbxg');
      expect(config.conversationServiceId).toBe('conv_configuration_01testconfigabc123xyzabcde');
    });

    it('should include optional voicePublicDomain when set', () => {
      stubRequiredEnvVars();
      vi.stubEnv('VOICE_PUBLIC_DOMAIN', 'https://example.com');

      const config = TACConfig.fromEnv();

      expect(config.voicePublicDomain).toBe('https://example.com');
    });

    it('should throw error when TWILIO_ACCOUNT_SID is missing', () => {
      stubRequiredEnvVars();
      delete process.env.TWILIO_ACCOUNT_SID;

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_ACCOUNT_SID');
    });

    it('should throw error when TWILIO_AUTH_TOKEN is missing', () => {
      stubRequiredEnvVars();
      delete process.env.TWILIO_AUTH_TOKEN;

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_AUTH_TOKEN');
    });

    it('should throw error when TWILIO_API_KEY is missing', () => {
      stubRequiredEnvVars();
      delete process.env.TWILIO_API_KEY;

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_API_KEY');
    });

    it('should throw error when TWILIO_API_TOKEN is missing', () => {
      stubRequiredEnvVars();
      delete process.env.TWILIO_API_TOKEN;

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_API_TOKEN');
    });

    it('should throw error when TWILIO_PHONE_NUMBER is missing', () => {
      stubRequiredEnvVars();
      delete process.env.TWILIO_PHONE_NUMBER;

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_PHONE_NUMBER');
    });

    it('should work when MEMORY_STORE_ID is not provided', () => {
      stubRequiredEnvVars();
      delete process.env.MEMORY_STORE_ID;

      const config = TACConfig.fromEnv();

      expect(config.memoryStoreId).toBeUndefined();
      expect(config.conversationServiceId).toBe('conv_configuration_01testconfigabc123xyzabcde');
    });

    it('should throw error when CONVERSATION_SERVICE_ID is missing', () => {
      stubRequiredEnvVars();
      delete process.env.CONVERSATION_SERVICE_ID;

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: CONVERSATION_SERVICE_ID');
    });

    it('should throw error when no environment variables are set', () => {
      // Clear all env vars by stubbing empty values (properly restored by afterEach)
      vi.stubEnv('TWILIO_ACCOUNT_SID', '');
      vi.stubEnv('TWILIO_AUTH_TOKEN', '');
      vi.stubEnv('TWILIO_API_KEY', '');
      vi.stubEnv('TWILIO_API_TOKEN', '');
      vi.stubEnv('TWILIO_PHONE_NUMBER', '');

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable');
    });
  });

  describe('getBasicAuthCredentials', () => {
    it('should return basic auth credentials', () => {
      const configData = getTestConfigData();
      const config = new TACConfig(configData);

      const credentials = config.getBasicAuthCredentials();

      expect(credentials.username).toBe('ACtest123456789');
      expect(credentials.password).toBe('test_token_123');
    });
  });
});
