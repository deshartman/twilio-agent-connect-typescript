import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TAC,
  TACConfig,
  SMSChannel,
  ChannelMessage,
  KnowledgeClient,
  KnowledgeChunkResult,
  KnowledgeBaseId,
} from '../src/index';
import { createKnowledgeSearchTool } from '@twilio/tac-tools';
import MockAdapter from 'axios-mock-adapter';

describe('Knowledge Integration', () => {
  let tac: TAC;
  let smsChannel: SMSChannel;
  let knowledgeClient: KnowledgeClient;
  let mockAdapter: MockAdapter;

  // Valid TTID formats (26 lowercase alphanumeric characters after prefix)
  const testConversationId = 'conv_conversation_01kknowintegtestabcdefgh12';
  const testProfileId = 'mem_profile_01kknowintegtestabcdefgh12';
  const testKnowledgeBaseId = 'know_knowledgebase_01kknowintegtestabcde' as KnowledgeBaseId;

  beforeEach(() => {
    const config = new TACConfig({
      accountSid: 'ACtest123',
      authToken: 'test_token',
      apiKey: 'SKtest123',
      apiSecret: 'test_api_token',
      phoneNumber: '+15551234567',
      conversationConfigurationId: 'conv_configuration_01kknowintegtest1234567890',
      memoryStoreId: 'mem_store_01kknowintegtestabcdefgh12',
    });

    tac = new TAC({ config });
    knowledgeClient = new KnowledgeClient(config);
    mockAdapter = new MockAdapter((knowledgeClient as any).axiosInstance);

    const channelDeps = tac.getChannelDeps();
    smsChannel = new SMSChannel(channelDeps);

    tac.registerChannel(smsChannel);
  });

  afterEach(() => {
    mockAdapter.restore();
    vi.restoreAllMocks();
  });

  describe('Knowledge Search Tool Integration', () => {
    it('should retrieve knowledge documents during conversation', async () => {
      const messages: ChannelMessage[] = [];
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Our return policy allows returns within 30 days of purchase.',
          knowledgeId: 'know_knowledge_01returnpolicy000000000000',
          createdAt: '2024-01-10T00:00:00Z',
          score: 0.95,
        },
        {
          content: 'All items must be in original packaging with tags attached.',
          knowledgeId: 'know_knowledge_02returnreqs00000000000000',
          createdAt: '2024-01-11T00:00:00Z',
          score: 0.87,
        },
      ];

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: mockChunks });

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // Create knowledge search tool
      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_policies',
        description: 'Search company policies and FAQs',
      });

      // Execute search as if LLM called the tool during conversation
      const results = await searchTool.implementation({ query: 'What is the return policy?' });

      expect(results).toEqual(mockChunks);
      expect(results).toHaveLength(2);
      expect(results[0]?.content).toContain('30 days');
    });

    it('should format knowledge results with proper schema', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Test knowledge content',
          knowledgeId: 'know_knowledge_01test00000000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: mockChunks });

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search knowledge base',
      });

      const results = await searchTool.implementation({ query: 'test' });

      // Verify schema matches KnowledgeChunkResult from packages/core/src/types/knowledge.ts
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('knowledgeId');
      expect(results[0]).toHaveProperty('createdAt');
      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0]?.content).toBe('string');
      expect(typeof results[0]?.knowledgeId).toBe('string');
      expect(typeof results[0]?.createdAt).toBe('string');
      expect(typeof results[0]?.score).toBe('number');
    });

    it('should handle knowledge base unavailable gracefully', async () => {
      mockAdapter.onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`).reply(503);

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search knowledge base',
      });

      await expect(searchTool.implementation({ query: 'test' })).rejects.toThrow(
        /Failed to search knowledge base/
      );
    });

    it('should handle empty knowledge results', async () => {
      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: [] });

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search knowledge base',
      });

      const results = await searchTool.implementation({ query: 'nonexistent query' });

      expect(results).toEqual([]);
      expect(results).toHaveLength(0);
    });

    it('should attribute knowledge sources in results', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Test content',
          knowledgeId: 'know_knowledge_01source100000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: mockChunks });

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search knowledge base',
      });

      const results = await searchTool.implementation({ query: 'test' });

      // Each result should have a knowledgeId that can be traced back to the source
      expect(results[0]?.knowledgeId).toBe('know_knowledge_01source100000000000000000');
    });

    it('should include relevance scores in search results', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Highly relevant content',
          knowledgeId: 'know_knowledge_01highscore000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.95,
        },
        {
          content: 'Less relevant content',
          knowledgeId: 'know_knowledge_01lowscore0000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.65,
        },
      ];

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: mockChunks });

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search knowledge base',
      });

      const results = await searchTool.implementation({ query: 'test' });

      expect(results[0]?.score).toBe(0.95);
      expect(results[1]?.score).toBe(0.65);
      expect(results[0]?.score).toBeGreaterThan(results[1]!.score);
    });
  });

  describe('Knowledge Tool in Conversation Flow', () => {
    it('should integrate knowledge search into SMS conversation', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'SMS integration test content',
          knowledgeId: 'know_knowledge_01smstest00000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: mockChunks });

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search knowledge base',
      });

      const results = await searchTool.implementation({ query: 'SMS integration' });

      expect(results).toHaveLength(1);
      expect(results[0]?.content).toContain('SMS integration');
    });

    it('should support custom topK for conversation-specific needs', async () => {
      const mockChunks: KnowledgeChunkResult[] = Array.from({ length: 10 }, (_, i) => ({
        content: `Result ${i + 1}`,
        knowledgeId: `know_knowledge_01result${String(i).padStart(18, '0')}` as any,
        createdAt: '2024-01-01T00:00:00Z',
        score: 0.9 - i * 0.05,
      }));

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`, { query: 'test', top: 10 })
        .reply(200, { chunks: mockChunks });

      const results = await knowledgeClient.searchKnowledgeBase(testKnowledgeBaseId, 'test', 10);

      expect(results).toHaveLength(10);
    });
  });

  describe('Multiple Knowledge Bases', () => {
    it('should support searching different knowledge bases in same conversation', async () => {
      const kb1Id = 'know_knowledgebase_01kb100000000000000000' as KnowledgeBaseId;
      const kb2Id = 'know_knowledgebase_01kb200000000000000000' as KnowledgeBaseId;

      const kb1Chunks: KnowledgeChunkResult[] = [
        {
          content: 'KB1 content',
          knowledgeId: 'know_knowledge_01kb1content00000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      const kb2Chunks: KnowledgeChunkResult[] = [
        {
          content: 'KB2 content',
          knowledgeId: 'know_knowledge_01kb2content00000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.85,
        },
      ];

      mockAdapter.onPost(`/v2/KnowledgeBases/${kb1Id}/Search`).reply(200, { chunks: kb1Chunks });
      mockAdapter.onPost(`/v2/KnowledgeBases/${kb2Id}/Search`).reply(200, { chunks: kb2Chunks });

      const results1 = await knowledgeClient.searchKnowledgeBase(kb1Id, 'test');
      const results2 = await knowledgeClient.searchKnowledgeBase(kb2Id, 'test');

      expect(results1[0]?.content).toContain('KB1');
      expect(results2[0]?.content).toContain('KB2');
    });

    it('should handle one KB being unavailable while other works', async () => {
      const kb1Id = 'know_knowledgebase_01kb100000000000000000' as KnowledgeBaseId;
      const kb2Id = 'know_knowledgebase_01kb200000000000000000' as KnowledgeBaseId;

      const kb1Chunks: KnowledgeChunkResult[] = [
        {
          content: 'KB1 works',
          knowledgeId: 'know_knowledge_01kb1works0000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      mockAdapter.onPost(`/v2/KnowledgeBases/${kb1Id}/Search`).reply(200, { chunks: kb1Chunks });
      mockAdapter.onPost(`/v2/KnowledgeBases/${kb2Id}/Search`).reply(503);

      const results1 = await knowledgeClient.searchKnowledgeBase(kb1Id, 'test');
      expect(results1).toHaveLength(1);

      await expect(knowledgeClient.searchKnowledgeBase(kb2Id, 'test')).rejects.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network timeout scenarios', async () => {
      mockAdapter.onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`).timeout();

      await expect(
        knowledgeClient.searchKnowledgeBase(testKnowledgeBaseId, 'test')
      ).rejects.toThrow();
    });

    it('should handle rate limiting (429)', async () => {
      mockAdapter.onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`).reply(429);

      await expect(
        knowledgeClient.searchKnowledgeBase(testKnowledgeBaseId, 'test')
      ).rejects.toThrow(/Failed to search knowledge base/);
    });

    it('should handle knowledge base not found (404)', async () => {
      mockAdapter.onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`).reply(404);

      await expect(
        knowledgeClient.searchKnowledgeBase(testKnowledgeBaseId, 'test')
      ).rejects.toThrow(/Failed to search knowledge base/);
    });

    it('should always include score field (required by API)', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Test',
          knowledgeId: 'know_knowledge_01scorefield00000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.85,
        },
      ];

      mockAdapter
        .onPost(`/v2/KnowledgeBases/${testKnowledgeBaseId}/Search`)
        .reply(200, { chunks: mockChunks });

      const results = await knowledgeClient.searchKnowledgeBase(testKnowledgeBaseId, 'test');

      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0]?.score).toBe('number');
    });
  });
});
