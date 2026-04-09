import { describe, it, expect } from 'vitest';
import {
  TAC,
  TACConfig,
  TACMode,
  CRelayChannel,
  SMSChannel,
  ChatChannel,
  VoiceChannel,
  VoiceWebhookChannel,
  createLogger,
} from '@twilio/tac-core';

/**
 * Shared test credentials — no real API calls are made.
 */
const BASE_CREDENTIALS = {
  environment: 'dev' as const,
  twilioAccountSid: 'ACtest123456789',
  twilioAuthToken: 'test_token_123',
  twilioApiKey: 'test_api_key',
  twilioApiToken: 'test_api_token',
  twilioPhoneNumber: '+15551234567',
};

const CONVERSATION_SERVICE_ID = 'comms_service_01kbjqhn79f0fvwfsxqzd5nqhd';
const MEMORY_STORE_ID = 'mem_service_01kbjqhhdpft0tbp21jt4ktbxg';

const silentLogger = createLogger({ name: 'test', level: 'silent' });

describe('TAC mode-specific initialization', () => {
  // ---------------------------------------------------------------------------
  // crelay mode
  // ---------------------------------------------------------------------------
  describe('crelay mode', () => {
    const makeCrelayTac = () =>
      new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'crelay' as TACMode,
        }),
        logger: silentLogger,
      });

    it('should set tacMode to crelay', () => {
      const tac = makeCrelayTac();
      expect(tac.getConfig().tacMode).toBe('crelay');
    });

    it('should not initialize ConversationClient', () => {
      const tac = makeCrelayTac();
      expect(tac.getConversationClient()).toBeUndefined();
    });

    it('should not initialize MemoryClient', () => {
      const tac = makeCrelayTac();
      expect(tac.getMemoryClient()).toBeUndefined();
    });

    it('should not initialize KnowledgeClient', () => {
      const tac = makeCrelayTac();
      expect(tac.getKnowledgeClient()).toBeUndefined();
    });

    it('should start with no channels registered', () => {
      const tac = makeCrelayTac();
      expect(tac.getChannel('voice')).toBeUndefined();
      expect(tac.getChannel('sms')).toBeUndefined();
      expect(tac.getChannel('chat')).toBeUndefined();
    });

    it('should allow registering CRelayChannel', () => {
      const tac = makeCrelayTac();
      const channel = new CRelayChannel(silentLogger);
      tac.registerChannel(channel);
      expect(tac.getChannel('voice')).toBe(channel);
    });

    it('should throw from getChannelDeps (no ConversationClient)', () => {
      const tac = makeCrelayTac();
      expect(() => tac.getChannelDeps()).toThrow(/ConversationClient/);
    });
  });

  // ---------------------------------------------------------------------------
  // conversation mode — without memory
  // ---------------------------------------------------------------------------
  describe('conversation mode (no memory)', () => {
    const makeConversationTac = () =>
      new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'conversation' as TACMode,
          conversationServiceId: CONVERSATION_SERVICE_ID,
        }),
        logger: silentLogger,
      });

    it('should set tacMode to conversation', () => {
      const tac = makeConversationTac();
      expect(tac.getConfig().tacMode).toBe('conversation');
    });

    it('should initialize ConversationClient', () => {
      const tac = makeConversationTac();
      expect(tac.getConversationClient()).toBeDefined();
    });

    it('should not initialize MemoryClient without memoryStoreId', () => {
      const tac = makeConversationTac();
      expect(tac.getMemoryClient()).toBeUndefined();
    });

    it('should not initialize KnowledgeClient without memoryStoreId', () => {
      const tac = makeConversationTac();
      expect(tac.getKnowledgeClient()).toBeUndefined();
    });

    it('should allow registering SMSChannel via getChannelDeps', () => {
      const tac = makeConversationTac();
      const sms = new SMSChannel(tac.getChannelDeps());
      tac.registerChannel(sms);
      expect(tac.getChannel('sms')).toBe(sms);
    });

    it('should allow registering ChatChannel via getChannelDeps', () => {
      const tac = makeConversationTac();
      const chat = new ChatChannel(tac.getChannelDeps());
      tac.registerChannel(chat);
      expect(tac.getChannel('chat')).toBe(chat);
    });

    it('should allow registering VoiceChannel via getChannelDeps', () => {
      const tac = makeConversationTac();
      const voice = new VoiceChannel(tac.getChannelDeps());
      tac.registerChannel(voice);
      expect(tac.getChannel('voice')).toBe(voice);
    });

    it('should return channelDeps with undefined memoryRetriever', () => {
      const tac = makeConversationTac();
      const deps = tac.getChannelDeps();
      expect(deps.conversationClient).toBeDefined();
      expect(deps.config).toBe(tac.getConfig());
      expect(deps.memoryRetriever).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // conversation mode — with memory
  // ---------------------------------------------------------------------------
  describe('conversation mode (with memory)', () => {
    const makeConversationWithMemoryTac = () =>
      new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'conversation' as TACMode,
          conversationServiceId: CONVERSATION_SERVICE_ID,
          memoryStoreId: MEMORY_STORE_ID,
        }),
        logger: silentLogger,
      });

    it('should initialize ConversationClient', () => {
      const tac = makeConversationWithMemoryTac();
      expect(tac.getConversationClient()).toBeDefined();
    });

    it('should initialize MemoryClient when memoryStoreId provided', () => {
      const tac = makeConversationWithMemoryTac();
      expect(tac.getMemoryClient()).toBeDefined();
    });

    it('should initialize KnowledgeClient when memoryStoreId provided', () => {
      const tac = makeConversationWithMemoryTac();
      expect(tac.getKnowledgeClient()).toBeDefined();
    });

    it('should return channelDeps with defined memoryRetriever', () => {
      const tac = makeConversationWithMemoryTac();
      const deps = tac.getChannelDeps();
      expect(deps.memoryRetriever).toBeDefined();
      expect(typeof deps.memoryRetriever).toBe('function');
    });
  });

  // ---------------------------------------------------------------------------
  // passive mode — without memory
  // ---------------------------------------------------------------------------
  describe('passive mode (no memory)', () => {
    const makePassiveTac = () =>
      new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'passive' as TACMode,
          conversationServiceId: CONVERSATION_SERVICE_ID,
        }),
        logger: silentLogger,
      });

    it('should set tacMode to passive', () => {
      const tac = makePassiveTac();
      expect(tac.getConfig().tacMode).toBe('passive');
    });

    it('should initialize ConversationClient', () => {
      const tac = makePassiveTac();
      expect(tac.getConversationClient()).toBeDefined();
    });

    it('should not initialize MemoryClient without memoryStoreId', () => {
      const tac = makePassiveTac();
      expect(tac.getMemoryClient()).toBeUndefined();
    });

    it('should not initialize KnowledgeClient without memoryStoreId', () => {
      const tac = makePassiveTac();
      expect(tac.getKnowledgeClient()).toBeUndefined();
    });

    it('should allow registering VoiceWebhookChannel via getChannelDeps', () => {
      const tac = makePassiveTac();
      const voice = new VoiceWebhookChannel(tac.getChannelDeps());
      tac.registerChannel(voice);
      expect(tac.getChannel('voice')).toBe(voice);
    });

    it('should allow registering SMSChannel via getChannelDeps', () => {
      const tac = makePassiveTac();
      const sms = new SMSChannel(tac.getChannelDeps());
      tac.registerChannel(sms);
      expect(tac.getChannel('sms')).toBe(sms);
    });

    it('should allow registering ChatChannel via getChannelDeps', () => {
      const tac = makePassiveTac();
      const chat = new ChatChannel(tac.getChannelDeps());
      tac.registerChannel(chat);
      expect(tac.getChannel('chat')).toBe(chat);
    });
  });

  // ---------------------------------------------------------------------------
  // passive mode — with memory
  // ---------------------------------------------------------------------------
  describe('passive mode (with memory)', () => {
    const makePassiveWithMemoryTac = () =>
      new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'passive' as TACMode,
          conversationServiceId: CONVERSATION_SERVICE_ID,
          memoryStoreId: MEMORY_STORE_ID,
        }),
        logger: silentLogger,
      });

    it('should initialize ConversationClient', () => {
      const tac = makePassiveWithMemoryTac();
      expect(tac.getConversationClient()).toBeDefined();
    });

    it('should initialize MemoryClient when memoryStoreId provided', () => {
      const tac = makePassiveWithMemoryTac();
      expect(tac.getMemoryClient()).toBeDefined();
    });

    it('should initialize KnowledgeClient when memoryStoreId provided', () => {
      const tac = makePassiveWithMemoryTac();
      expect(tac.getKnowledgeClient()).toBeDefined();
    });

    it('should return channelDeps with defined memoryRetriever', () => {
      const tac = makePassiveWithMemoryTac();
      const deps = tac.getChannelDeps();
      expect(deps.memoryRetriever).toBeDefined();
      expect(typeof deps.memoryRetriever).toBe('function');
    });
  });

  // ---------------------------------------------------------------------------
  // getChannelDeps behavior across modes
  // ---------------------------------------------------------------------------
  describe('getChannelDeps behavior', () => {
    it('should return deps with ConversationClient in conversation mode', () => {
      const tac = new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'conversation' as TACMode,
          conversationServiceId: CONVERSATION_SERVICE_ID,
        }),
        logger: silentLogger,
      });
      const deps = tac.getChannelDeps();
      expect(deps.config).toBe(tac.getConfig());
      expect(deps.logger).toBeDefined();
      expect(deps.conversationClient).toBeDefined();
    });

    it('should return deps with ConversationClient in passive mode', () => {
      const tac = new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'passive' as TACMode,
          conversationServiceId: CONVERSATION_SERVICE_ID,
        }),
        logger: silentLogger,
      });
      const deps = tac.getChannelDeps();
      expect(deps.config).toBe(tac.getConfig());
      expect(deps.logger).toBeDefined();
      expect(deps.conversationClient).toBeDefined();
    });

    it('should throw in crelay mode', () => {
      const tac = new TAC({
        config: new TACConfig({
          ...BASE_CREDENTIALS,
          tacMode: 'crelay' as TACMode,
        }),
        logger: silentLogger,
      });
      expect(() => tac.getChannelDeps()).toThrow(/ConversationClient/);
      expect(() => tac.getChannelDeps()).toThrow(/crelay/);
    });
  });

  // ---------------------------------------------------------------------------
  // Config validation — conversation/passive requires conversationServiceId
  // ---------------------------------------------------------------------------
  describe('config validation across modes', () => {
    it('should throw when conversation mode lacks conversationServiceId', () => {
      expect(
        () =>
          new TACConfig({
            ...BASE_CREDENTIALS,
            tacMode: 'conversation' as TACMode,
          })
      ).toThrow(/CONVERSATION_SERVICE_ID/);
    });

    it('should throw when passive mode lacks conversationServiceId', () => {
      expect(
        () =>
          new TACConfig({
            ...BASE_CREDENTIALS,
            tacMode: 'passive' as TACMode,
          })
      ).toThrow(/CONVERSATION_SERVICE_ID/);
    });

    it('should not throw when crelay mode lacks conversationServiceId', () => {
      expect(
        () =>
          new TACConfig({
            ...BASE_CREDENTIALS,
            tacMode: 'crelay' as TACMode,
          })
      ).not.toThrow();
    });
  });
});
