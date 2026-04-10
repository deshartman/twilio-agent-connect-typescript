import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TAC,
  TACConfig,
  SMSChannel,
  ChannelMessage,
  KnowledgeClient,
  KnowledgeChunkResult,
} from '../src/index';
import { createKnowledgeSearchTool } from '@twilio/tac-tools';

/**
 * Create a mock Response object with proper clone() support
 * Matches the pattern used in knowledge-client.test.ts and knowledge-tools.test.ts
 */
function createMockResponse(
  data: unknown,
  options: { ok: boolean; status?: number; statusText?: string }
) {
  const body = JSON.stringify(data);
  return {
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 500),
    statusText: options.statusText ?? (options.ok ? 'OK' : 'Error'),
    json: async () => data,
    text: async () => body,
    clone: function () {
      return this;
    },
  };
}

describe('Knowledge Integration', () => {
  let tac: TAC;
  let smsChannel: SMSChannel;
  let knowledgeClient: KnowledgeClient;
  let originalFetch: typeof global.fetch;

  // Valid TTID formats (26 lowercase alphanumeric characters after prefix)
  const testConversationId = 'conv_conversation_01kknowintegtestabcdefgh12';
  const testProfileId = 'mem_profile_01kknowintegtestabcdefgh12';
  const testKnowledgeBaseId = 'know_knowledgebase_01kknowintegtestabcde';

  beforeEach(() => {
    const config = new TACConfig({
      environment: 'dev',
      tacMode: 'conversation',
      twilioAccountSid: 'ACtest123',
      twilioAuthToken: 'test_token',
      twilioApiKey: 'SKtest123',
      twilioApiToken: 'test_api_token',
      twilioPhoneNumber: '+15551234567',
      conversationServiceId: 'conv_configuration_01kknowintegtest1234567890',
      memoryStoreId: 'mem_store_01kknowintegtestabcdefgh12',
    });

    tac = new TAC({ config });
    knowledgeClient = new KnowledgeClient(config);

    const channelDeps = tac.getChannelDeps();
    smsChannel = new SMSChannel(channelDeps);

    tac.registerChannel(smsChannel);

    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
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

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks: mockChunks }, { ok: true }));

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
      expect(results[0].content).toContain('30 days');
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

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks: mockChunks }, { ok: true }));

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
      expect(typeof results[0].content).toBe('string');
      expect(typeof results[0].knowledgeId).toBe('string');
      expect(typeof results[0].createdAt).toBe('string');
      expect(typeof results[0].score).toBe('number');
    });

    it('should handle knowledge base unavailable gracefully', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(null, { ok: false, status: 503, statusText: 'Service Unavailable' })
        );

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      // Should throw error that can be caught and handled
      await expect(searchTool.implementation({ query: 'test' })).rejects.toThrow(
        'Failed to search knowledge base: 503 Service Unavailable'
      );
    });

    it('should handle empty knowledge results', async () => {
      global.fetch = vi.fn().mockResolvedValue(createMockResponse({ chunks: [] }, { ok: true }));

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      const results = await searchTool.implementation({ query: 'nonexistent query' });

      expect(results).toEqual([]);
      expect(results).toHaveLength(0);
    });

    it('should attribute knowledge sources in results', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Source 1 content',
          knowledgeId: 'know_knowledge_01source100000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.95,
        },
        {
          content: 'Source 2 content',
          knowledgeId: 'know_knowledge_02source200000000000000000',
          createdAt: '2024-01-02T00:00:00Z',
          score: 0.85,
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks: mockChunks }, { ok: true }));

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      const results = await searchTool.implementation({ query: 'test' });

      // Each result has unique knowledgeId for source attribution
      expect(results[0].knowledgeId).toBe('know_knowledge_01source100000000000000000');
      expect(results[1].knowledgeId).toBe('know_knowledge_02source200000000000000000');
      expect(results[0].knowledgeId).not.toBe(results[1].knowledgeId);
    });

    it('should include relevance scores in search results', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Highly relevant content',
          knowledgeId: 'know_knowledge_01000000000000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.95,
        },
        {
          content: 'Less relevant content',
          knowledgeId: 'know_knowledge_02000000000000000000000000',
          createdAt: '2024-01-02T00:00:00Z',
          score: 0.65,
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks: mockChunks }, { ok: true }));

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      const results = await searchTool.implementation({ query: 'test' });

      expect(results[0].score).toBeGreaterThan(results[1].score!);
      expect(results[0].score).toBe(0.95);
      expect(results[1].score).toBe(0.65);
    });
  });

  describe('Knowledge Tool in Conversation Flow', () => {
    it('should integrate knowledge search into SMS conversation', async () => {
      const messages: ChannelMessage[] = [];
      const mockChunks: KnowledgeChunkResult[] = [
        {
          content: 'Shipping takes 3-5 business days.',
          knowledgeId: 'know_knowledge_0shipping00000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks: mockChunks }, { ok: true }));

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // Start conversation
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      // User asks question
      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'How long does shipping take?' },
        },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe('How long does shipping take?');

      // LLM would call knowledge tool here
      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_policies',
        description: 'Search policies',
      });

      const knowledge = await searchTool.implementation({ query: 'shipping time' });

      // Knowledge results available to format LLM response
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0].content).toContain('3-5 business days');
    });

    it('should handle knowledge search failure without breaking conversation', async () => {
      const messages: ChannelMessage[] = [];

      // Mock memory API to return empty response (memory not needed for this test)
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse({ observations: [], summaries: [], communications: [] }, { ok: true })
        );

      tac.onMessageReady((msg) => {
        messages.push(msg);
      });

      // Start conversation
      await smsChannel.processWebhook({
        eventType: 'CONVERSATION_CREATED',
        data: {
          conversationId: testConversationId,
          profileId: testProfileId,
        },
      });

      await smsChannel.processWebhook({
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: testConversationId,
          author: { address: '+15559876543', channel: 'SMS' },
          content: { type: 'TEXT', text: 'Test message' },
        },
      });

      // Conversation still receives message even if knowledge unavailable
      expect(messages).toHaveLength(1);
      expect(messages[0].channel).toBe('sms');

      // Knowledge error can be caught and handled
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(null, { ok: false, status: 500, statusText: 'Internal Server Error' })
        );

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      let errorCaught = false;
      try {
        await searchTool.implementation({ query: 'test' });
      } catch (err) {
        errorCaught = true;
        expect(err).toBeInstanceOf(Error);
      }

      expect(errorCaught).toBe(true);
    });

    it('should support custom topK for conversation-specific needs', async () => {
      const mockChunks: KnowledgeChunkResult[] = [
        { content: 'Result 1', knowledgeId: 'know_knowledge_01000000000000000000000000', createdAt: '2024-01-01T00:00:00Z', score: 0.95 },
        { content: 'Result 2', knowledgeId: 'know_knowledge_02000000000000000000000000', createdAt: '2024-01-02T00:00:00Z', score: 0.85 },
        { content: 'Result 3', knowledgeId: 'know_knowledge_03000000000000000000000000', createdAt: '2024-01-03T00:00:00Z', score: 0.75 },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks: mockChunks }, { ok: true }));

      // Tool with custom topK=3 for detailed responses
      const detailedSearchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'detailed_search',
        description: 'Detailed search',
        topK: 3,
      });

      const results = await detailedSearchTool.implementation({ query: 'test' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"top":3'),
        })
      );

      expect(results).toHaveLength(3);
    });
  });

  describe('Multiple Knowledge Bases', () => {
    it('should support searching different knowledge bases in same conversation', async () => {
      const policiesKbId = 'know_knowledgebase_01kpoliciesabcdefghij';
      const productsKbId = 'know_knowledgebase_01kproductsabcdefghij';

      const policyChunks: KnowledgeChunkResult[] = [
        {
          content: 'Policy information',
          knowledgeId: 'know_knowledge_0policy0100000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.92,
        },
      ];

      const productChunks: KnowledgeChunkResult[] = [
        {
          content: 'Product specifications',
          knowledgeId: 'know_knowledge_0product010000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.88,
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(createMockResponse({ chunks: policyChunks }, { ok: true }))
        .mockResolvedValueOnce(createMockResponse({ chunks: productChunks }, { ok: true }));

      const policyTool = createKnowledgeSearchTool(knowledgeClient, policiesKbId, {
        name: 'search_policies',
        description: 'Search policies',
      });

      const productTool = createKnowledgeSearchTool(knowledgeClient, productsKbId, {
        name: 'search_products',
        description: 'Search products',
      });

      const policyResults = await policyTool.implementation({ query: 'return policy' });
      const productResults = await productTool.implementation({ query: 'product specs' });

      expect(policyResults[0].content).toBe('Policy information');
      expect(productResults[0].content).toBe('Product specifications');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle one KB being unavailable while other works', async () => {
      const kb1Id = 'know_knowledgebase_01kbase1abcdefghijklm';
      const kb2Id = 'know_knowledgebase_01kbase2abcdefghijklm';

      const chunks: KnowledgeChunkResult[] = [
        {
          content: 'Working KB content',
          knowledgeId: 'know_knowledge_01000000000000000000000000',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.9,
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse(null, { ok: false, status: 503, statusText: 'Service Unavailable' })
        )
        .mockResolvedValueOnce(createMockResponse({ chunks }, { ok: true }));

      const tool1 = createKnowledgeSearchTool(knowledgeClient, kb1Id, {
        name: 'search_kb1',
        description: 'Search KB1',
      });

      const tool2 = createKnowledgeSearchTool(knowledgeClient, kb2Id, {
        name: 'search_kb2',
        description: 'Search KB2',
      });

      // First KB fails
      await expect(tool1.implementation({ query: 'test' })).rejects.toThrow();

      // Second KB works
      const results = await tool2.implementation({ query: 'test' });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Working KB content');
    });
  });

  describe('Knowledge Tool Format Conversion', () => {
    it('should convert knowledge search tool to OpenAI format', () => {
      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_faq',
        description: 'Search FAQ knowledge base',
      });

      const openaiFormat = searchTool.toOpenAIFormat();

      expect(openaiFormat.type).toBe('function');
      expect(openaiFormat.function.name).toBe('search_faq');
      expect(openaiFormat.function.description).toBe('Search FAQ knowledge base');
      expect(openaiFormat.function.parameters).toHaveProperty('type', 'object');
      expect(openaiFormat.function.parameters.properties).toHaveProperty('query');
    });

    it('should convert knowledge search tool to Anthropic format', () => {
      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_faq',
        description: 'Search FAQ knowledge base',
      });

      const anthropicFormat = searchTool.toAnthropicFormat();

      expect(anthropicFormat.name).toBe('search_faq');
      expect(anthropicFormat.description).toBe('Search FAQ knowledge base');
      expect(anthropicFormat.input_schema).toHaveProperty('type', 'object');
      expect(anthropicFormat.input_schema.properties).toHaveProperty('query');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed API responses', async () => {
      // Invalid response format (missing chunks field)
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(
          {
            results: [], // Wrong field name
          },
          { ok: true }
        )
      );

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      // Should throw Zod validation error
      await expect(searchTool.implementation({ query: 'test' })).rejects.toThrow();
    });

    it('should handle network timeout scenarios', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      await expect(searchTool.implementation({ query: 'test' })).rejects.toThrow(
        'Network timeout'
      );
    });

    it('should handle rate limiting (429)', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(null, { ok: false, status: 429, statusText: 'Too Many Requests' })
        );

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      await expect(searchTool.implementation({ query: 'test' })).rejects.toThrow(
        'Failed to search knowledge base: 429 Too Many Requests'
      );
    });

    it('should handle knowledge base not found (404)', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(null, { ok: false, status: 404, statusText: 'Not Found' })
        );

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      await expect(searchTool.implementation({ query: 'test' })).rejects.toThrow(
        'Failed to search knowledge base: 404 Not Found'
      );
    });

    it('should always include score field (required by API)', async () => {
      const chunks: KnowledgeChunkResult[] = [
        {
          content: 'Content with score',
          knowledgeId: 'know_knowledge_01abc123def456ghi789jkl0mn',
          createdAt: '2024-01-01T00:00:00Z',
          score: 0.85,
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ chunks }, { ok: true }));

      const searchTool = createKnowledgeSearchTool(knowledgeClient, testKnowledgeBaseId, {
        name: 'search_kb',
        description: 'Search',
      });

      const results = await searchTool.implementation({ query: 'test' });

      // Score is always present per OpenAPI spec
      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0].score).toBe('number');
      expect(results[0].score).toBe(0.85);
    });
  });
});
