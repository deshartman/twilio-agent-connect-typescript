import { z } from 'zod';

/**
 * Branded types for Knowledge IDs
 */
export type KnowledgeBaseId = string & { readonly _brand: 'KnowledgeBaseId' };
export type KnowledgeId = string & { readonly _brand: 'KnowledgeId' };

/**
 * Type guard for KnowledgeBaseId
 */
export function isKnowledgeBaseId(value: string): value is KnowledgeBaseId {
  return /^know_knowledgebase_[0-7][0-9a-z]{25}$/.test(value);
}

/**
 * Type guard for KnowledgeId
 */
export function isKnowledgeId(value: string): value is KnowledgeId {
  return /^know_knowledge_[0-7][0-9a-z]{25}$/.test(value);
}

/**
 * Knowledge base status enum
 */
export const KnowledgeBaseStatusSchema = z.enum([
  'QUEUED',
  'PROVISIONING',
  'ACTIVE',
  'FAILED',
  'DELETING',
]);

export type KnowledgeBaseStatus = z.infer<typeof KnowledgeBaseStatusSchema>;

/**
 * Knowledge base metadata (from GET endpoint)
 */
export const KnowledgeBaseSchema = z.object({
  id: z.string().regex(/^know_knowledgebase_[0-7][0-9a-z]{25}$/, 'Invalid KnowledgeBase ID format'),
  displayName: z.string(),
  description: z.string().optional(),
  status: KnowledgeBaseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number(),
});

export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

/**
 * Search result chunk (from POST search endpoint)
 *
 * Combines base KnowledgeChunk data with semantic similarity scoring for search results.
 * The Knowledge API returns up to 20 chunks per search, ranked by relevance.
 *
 * @remarks
 * **SCHEMA VERIFIED**: Matches official Knowledge API v2 OpenAPI specification.
 *
 * @property content - The chunk content (max 65,536 characters / ~64KB)
 * @property createdAt - ISO 8601 date-time when the chunk was created
 * @property score - Semantic similarity score (0-1, higher = more relevant)
 * @property knowledgeId - Unique identifier of the knowledge source (TTID format)
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_knowledge_v2.json
 */
export const KnowledgeChunkResultSchema = z.object({
  content: z.string().max(65536),
  knowledgeId: z.string().regex(/^know_knowledge_[0-7][0-9a-z]{25}$/),
  createdAt: z.string(),
  score: z.number(),
});

export type KnowledgeChunkResult = Omit<
  z.infer<typeof KnowledgeChunkResultSchema>,
  'knowledgeId'
> & {
  knowledgeId: KnowledgeId;
};

/**
 * Search response wrapper
 */
export const KnowledgeSearchResponseSchema = z.object({
  chunks: z.array(KnowledgeChunkResultSchema),
});

export type KnowledgeSearchResponse = z.infer<typeof KnowledgeSearchResponseSchema>;
