import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TACConfig, KnowledgeBase, KnowledgeChunkResult, KnowledgeBaseId } from '@twilio/tac-core';
import { KnowledgeClient } from '../packages/core/src/clients/knowledge';
import MockAdapter from 'axios-mock-adapter';

describe('KnowledgeClient', () => {
  const getTestConfig = () => ({

    twilioAccountSid: 'ACtest123',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'test_api_key',
    twilioApiToken: 'test_api_token',
    twilioPhoneNumber: '+15551234567',
    memoryStoreId: 'mem_store_01testmemorystore000000000',
    conversationServiceId: 'conv_configuration_01testconvservice000000000',
  });

  let knowledgeClient: KnowledgeClient;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    const config = new TACConfig(getTestConfig());
    knowledgeClient = new KnowledgeClient(config);
    mockAdapter = new MockAdapter((knowledgeClient as any).axiosInstance);
  });

  afterEach(() => {
    mockAdapter.restore();
  });

  describe('getKnowledgeBase()', () => {
    it('should fetch knowledge base metadata successfully', async () => {
      const mockResponse: KnowledgeBase = {
        id: 'know_knowledgebase_01abc123def456ghi789jkl012',
        displayName: 'Product FAQ',
        description: 'Frequently asked questions about our products',
        status: 'ACTIVE',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z',
        version: 1,
      };

      mockAdapter
        .onGet('/v2/ControlPlane/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012')
        .reply(200, mockResponse);

      const result = await knowledgeClient.getKnowledgeBase(
        'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle 404 errors', async () => {
      mockAdapter.onGet('/v2/ControlPlane/KnowledgeBases/know_knowledgebase_nonexistent').reply(404);

      await expect(
        knowledgeClient.getKnowledgeBase('know_knowledgebase_nonexistent' as any)
      ).rejects.toThrow(/Failed to get knowledge base/);
    });

    it('should handle 500 errors', async () => {
      mockAdapter
        .onGet('/v2/ControlPlane/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012')
        .reply(500);

      await expect(
        knowledgeClient.getKnowledgeBase('know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId)
      ).rejects.toThrow(/Failed to get knowledge base/);
    });
  });

  describe('searchKnowledgeBase()', () => {
    it('should search knowledge base successfully', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Our product supports multiple languages including English and Spanish.',
          knowledgeId: 'know_knowledge_01abc123def456ghi789jkl012',
          createdAt: '2024-01-10T00:00:00Z',
          score: 0.95,
        },
        {
          content: 'You can change the language in the settings menu.',
          knowledgeId: 'know_knowledge_01def456ghi789jkl012abc345',
          createdAt: '2024-01-11T00:00:00Z',
          score: 0.85,
        },
      ];

      mockAdapter
        .onPost('/v2/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012/Search')
        .reply(200, { chunks: mockChunks });

      const result = await knowledgeClient.searchKnowledgeBase(
        'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId,
        'What languages are supported?'
      );

      expect(result).toEqual(mockChunks);
    });

    it('should respect custom topK parameter', async () => {
      const mockChunks: KnowledgeChunkResult[] = [];

      mockAdapter
        .onPost('/v2/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012/Search', {
          query: 'test query',
          top: 10,
        })
        .reply(200, { chunks: mockChunks });

      await knowledgeClient.searchKnowledgeBase(
        'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId,
        'test query',
        10
      );
    });

    it('should clamp topK to maximum of 20', async () => {
      const mockChunks: KnowledgeChunkResult[] = [];

      mockAdapter
        .onPost('/v2/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012/Search', {
          query: 'test query',
          top: 20,
        })
        .reply(200, { chunks: mockChunks });

      await knowledgeClient.searchKnowledgeBase(
        'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId,
        'test query',
        50
      );
    });

    it('should include knowledgeIds filter when provided', async () => {
      const mockChunks: KnowledgeChunkResult[] = [];

      mockAdapter
        .onPost('/v2/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012/Search', {
          query: 'test query',
          top: 5,
          knowledgeIds: ['know_01abc', 'know_02def'],
        })
        .reply(200, { chunks: mockChunks });

      await knowledgeClient.searchKnowledgeBase(
        'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId,
        'test query',
        5,
        ['know_01abc', 'know_02def'] as any
      );
    });

    it('should handle empty results', async () => {
      mockAdapter
        .onPost('/v2/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012/Search')
        .reply(200, { chunks: [] });

      const result = await knowledgeClient.searchKnowledgeBase(
        'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId,
        'obscure query with no matches'
      );

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockAdapter
        .onPost('/v2/KnowledgeBases/know_knowledgebase_01abc123def456ghi789jkl012/Search')
        .reply(500);

      await expect(
        knowledgeClient.searchKnowledgeBase(
          'know_knowledgebase_01abc123def456ghi789jkl012' as KnowledgeBaseId,
          'test query'
        )
      ).rejects.toThrow(/Failed to search knowledge base/);
    });
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const config = new TACConfig(getTestConfig());

      expect(() => new KnowledgeClient(config)).not.toThrow();
    });
  });

  describe('region support', () => {
    it('should use region in base URL when configured', () => {
      const config = new TACConfig({ ...getTestConfig(), twilioRegion: 'test-region' });
      const regionClient = new KnowledgeClient(config);

      expect((regionClient as any).baseUrl).toBe('https://knowledge.test-region.twilio.com');
    });

    it('should use default base URL when region is not configured', () => {
      expect((knowledgeClient as any).baseUrl).toBe('https://knowledge.twilio.com');
    });
  });
});
