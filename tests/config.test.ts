import { describe, it, expect, vi, afterEach } from 'vitest';
import { TACConfig } from '@twilio/tac-core';

describe('TACConfig', () => {
  const getTestConfigData = () => ({
    accountSid: 'ACtest123456789',
    authToken: 'test_token_123',
    apiKey: 'SKtest123456789',
    apiSecret: 'test_api_token_123',
    phoneNumber: '+15551234567',
    conversationConfigurationId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('should create config with valid data', () => {
      const configData = getTestConfigData();
      const config = new TACConfig(configData);

      expect(config.accountSid).toBe('ACtest123456789');
      expect(config.authToken).toBe('test_token_123');
      expect(config.phoneNumber).toBe('+15551234567');
      expect(config.conversationConfigurationId).toBe(
        'conv_configuration_01testconfigabc123xyzabcde'
      );
    });

    it('should validate required fields', () => {
      expect(() => {
        new TACConfig({} as any);
      }).toThrow();
    });

    it('should validate Twilio SID formats', () => {
      const invalidConfig = {
        ...getTestConfigData(),
        accountSid: 'invalid_sid',
        conversationConfigurationId: 'invalid_conv_sid',
      };

      expect(() => {
        new TACConfig(invalidConfig);
      }).toThrow();
    });

    it('should reject legacy comms_service format', () => {
      const legacyConfig = {
        ...getTestConfigData(),
        conversationConfigurationId: 'comms_service_01testcommsservice00000000',
      };

      expect(() => {
        new TACConfig(legacyConfig);
      }).toThrow('Invalid Conversation Configuration ID format');
    });

    it('should store region when provided', () => {
      const config = new TACConfig({
        ...getTestConfigData(),
        region: 'test-region',
      });

      expect(config.region).toBe('test-region');
    });

    it('should leave region undefined when not provided', () => {
      const config = new TACConfig(getTestConfigData());

      expect(config.region).toBeUndefined();
    });

    it('should accept single-character region', () => {
      const config = new TACConfig({ ...getTestConfigData(), region: 'a' });

      expect(config.region).toBe('a');
    });

    it('should reject invalid region values', () => {
      const invalidRegions = [
        'has spaces',
        'has/slash',
        'has:colon',
        'UPPERCASE',
        '-leading-dash',
        'trailing-dash-',
        'a'.repeat(64),
      ];

      for (const region of invalidRegions) {
        expect(() => {
          new TACConfig({ ...getTestConfigData(), region: region });
        }).toThrow('Invalid Twilio region format');
      }
    });
  });

  describe('fromEnv', () => {
    const stubRequiredEnvVars = () => {
      vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest123');
      vi.stubEnv('TWILIO_AUTH_TOKEN', 'test_auth_token');
      vi.stubEnv('TWILIO_API_KEY', 'SKtest123');
      vi.stubEnv('TWILIO_API_SECRET', 'test_api_token');
      vi.stubEnv('TWILIO_PHONE_NUMBER', '+1234567890');
      vi.stubEnv(
        'TWILIO_CONVERSATION_CONFIGURATION_ID',
        'conv_configuration_01testconfigabc123xyzabcde'
      );
    };

    it('should create config when all required env vars are set', () => {
      stubRequiredEnvVars();

      const config = TACConfig.fromEnv();

      expect(config.accountSid).toBe('ACtest123');
      expect(config.authToken).toBe('test_auth_token');
      expect(config.phoneNumber).toBe('+1234567890');
      expect(config.conversationConfigurationId).toBe(
        'conv_configuration_01testconfigabc123xyzabcde'
      );
    });

    it('should include optional voicePublicDomain when set', () => {
      stubRequiredEnvVars();
      vi.stubEnv('VOICE_PUBLIC_DOMAIN', 'https://example.com');

      const config = TACConfig.fromEnv();

      expect(config.voicePublicDomain).toBe('https://example.com');
    });

    it('should throw error when TWILIO_ACCOUNT_SID is missing', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_ACCOUNT_SID', undefined);

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_ACCOUNT_SID');
    });

    it('should throw error when TWILIO_AUTH_TOKEN is missing', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_AUTH_TOKEN', undefined);

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_AUTH_TOKEN');
    });

    it('should throw error when TWILIO_API_KEY is missing', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_API_KEY', undefined);

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_API_KEY');
    });

    it('should throw error when TWILIO_API_SECRET is missing', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_API_SECRET', undefined);

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_API_SECRET');
    });

    it('should throw error when TWILIO_PHONE_NUMBER is missing', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_PHONE_NUMBER', undefined);

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_PHONE_NUMBER');
    });

    it('should throw error when TWILIO_CONVERSATION_CONFIGURATION_ID is missing', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_CONVERSATION_CONFIGURATION_ID', undefined);

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable: TWILIO_CONVERSATION_CONFIGURATION_ID');
    });

    it('should throw error when no environment variables are set', () => {
      // Clear all env vars by stubbing empty values (properly restored by afterEach)
      vi.stubEnv('TWILIO_ACCOUNT_SID', '');
      vi.stubEnv('TWILIO_AUTH_TOKEN', '');
      vi.stubEnv('TWILIO_API_KEY', '');
      vi.stubEnv('TWILIO_API_SECRET', '');
      vi.stubEnv('TWILIO_PHONE_NUMBER', '');

      expect(() => {
        TACConfig.fromEnv();
      }).toThrow('Missing required environment variable');
    });

    it('should read TWILIO_REGION from environment', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_REGION', 'test-region');

      const config = TACConfig.fromEnv();

      expect(config.region).toBe('test-region');
    });

    it('should leave region undefined when TWILIO_REGION is not set', () => {
      stubRequiredEnvVars();
      vi.stubEnv('TWILIO_REGION', undefined);

      const config = TACConfig.fromEnv();

      expect(config.region).toBeUndefined();
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
