/**
 * RAG Service - Retrieval Augmented Generation
 *
 * Implements semantic search and context retrieval for chat conversations
 * using Cloudflare Workers AI and Vectorize.
 *
 * Following Cloudflare RAG tutorial:
 * https://developers.cloudflare.com/workers-ai/tutorials/build-a-retrieval-augmented-generation-ai/
 *
 * Architecture:
 * 1. Generate embeddings using Workers AI (@cf/baai/bge-base-en-v1.5)
 * 2. Store vectors in Vectorize for efficient similarity search
 * 3. Store metadata in D1 for filtering and access control
 * 4. Query Vectorize for relevant context before AI responses
 * 5. Inject retrieved context into AI prompts for better responses
 *
 * ✅ FOLLOWS: openrouter.service.ts class-based singleton pattern
 * ✅ FOLLOWS: Zod validation for configuration
 * ✅ FOLLOWS: Structured error handling with ErrorContext
 */

import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { ApiEnv } from '@/api/types';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';

/**
 * Embedding model configuration
 * bge-base-en-v1.5 produces 768-dimensional vectors
 */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_TOP_K = 5; // Number of results to retrieve
const DEFAULT_MIN_SIMILARITY = 0.7; // Minimum similarity threshold (70%)

// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================

/**
 * RAG service configuration schema
 * Used for runtime validation when initializing the service
 */
const RAGServiceConfigSchema = z.object({
  ai: z.custom<Ai>(data => typeof data === 'object' && data !== null),
  vectorize: z.custom<VectorizeIndex>(data => typeof data === 'object' && data !== null),
});

export type RAGServiceConfig = z.infer<typeof RAGServiceConfigSchema>;

/**
 * Query result from Vectorize with D1 metadata
 */
export type RAGContext = {
  id: string;
  messageId: string;
  content: string;
  similarity: number;
  metadata?: {
    role?: 'user' | 'assistant';
    participantId?: string;
    roundNumber?: number;
    modelId?: string;
    importance?: number;
  };
};

/**
 * Context retrieval parameters schema
 */
export const RetrieveContextParamsSchema = z.object({
  query: z.string().min(1),
  threadId: z.string().optional(),
  userId: z.string().min(1),
  topK: z.number().int().positive().max(20).optional().default(DEFAULT_TOP_K),
  minSimilarity: z.number().min(0).max(1).optional().default(DEFAULT_MIN_SIMILARITY),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(data => typeof data === 'object' && data !== null),
});

export type RetrieveContextParams = z.infer<typeof RetrieveContextParamsSchema>;

/**
 * RAG service class
 * Singleton pattern - initialized once with environment config
 *
 * ✅ FOLLOWS: openrouter.service.ts pattern exactly
 */
class RAGService {
  private ai: Ai | null = null;
  private vectorize: VectorizeIndex | null = null;

  /**
   * Initialize RAG service with Cloudflare bindings
   * Must be called before using any RAG methods
   *
   * ✅ ZOD VALIDATION: Config validated at runtime
   */
  initialize(config: RAGServiceConfig): void {
    if (this.ai && this.vectorize) {
      return; // Already initialized
    }

    // ✅ Runtime validation with Zod
    const validationResult = RAGServiceConfigSchema.safeParse(config);
    if (!validationResult.success) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'rag',
      };
      throw createError.internal(
        `Invalid RAG configuration: ${validationResult.error.message}`,
        context,
      );
    }

    this.ai = config.ai;
    this.vectorize = config.vectorize;
  }

  /**
   * Get initialized AI binding
   * Throws if not initialized
   */
  private getAI(): Ai {
    if (!this.ai) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'rag',
      };
      throw createError.internal('RAG service not initialized. Call initialize() first.', context);
    }
    return this.ai;
  }

  /**
   * Get initialized Vectorize binding
   * Throws if not initialized
   */
  private getVectorize(): VectorizeIndex {
    if (!this.vectorize) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'rag',
      };
      throw createError.internal('RAG service not initialized. Call initialize() first.', context);
    }
    return this.vectorize;
  }

  // ============================================================================
  // Embedding Operations
  // ============================================================================

  /**
   * Generate embedding vector for text using Workers AI
   *
   * @param text - Text to embed (truncated to 5000 chars)
   * @returns 768-dimensional vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const ai = this.getAI();

    try {
      const response = await ai.run(EMBEDDING_MODEL, {
        text: text.slice(0, 5000), // Limit to 5000 chars to avoid token limits
      }) as { data?: number[][] };

      const values = response.data?.[0];
      if (!values || !Array.isArray(values)) {
        throw new Error('Invalid embedding response format');
      }

      return values;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'workers_ai',
        operation: 'generate_embedding',
      };

      throw createError.internal(
        `Failed to generate embedding: ${errorMessage}`,
        context,
      );
    }
  }

  /**
   * Store message embedding in Vectorize and D1
   *
   * @returns The created embedding record ID
   */
  async storeEmbedding(params: {
    messageId: string;
    threadId: string;
    userId: string;
    content: string;
    metadata?: RAGContext['metadata'];
    db: Awaited<ReturnType<typeof getDbAsync>>;
  }): Promise<string> {
    const { messageId, threadId, userId, content, metadata, db } = params;

    // Skip empty content
    if (!content.trim()) {
      throw new Error('Cannot create embedding for empty content');
    }

    const vectorize = this.getVectorize();

    try {
      // Generate embedding vector
      const embedding = await this.generateEmbedding(content);

      // Create unique IDs
      const embeddingId = ulid();
      const vectorId = `vec_${embeddingId}`;

      // Store in Vectorize (vector database)
      await vectorize.upsert([
        {
          id: vectorId,
          values: embedding,
          metadata: {
            messageId,
            threadId,
            userId,
            ...metadata,
          },
        },
      ]);

      // Store metadata in D1 (relational database)
      await db.insert(tables.ragEmbedding).values({
        id: embeddingId,
        messageId,
        threadId,
        userId,
        content: content.slice(0, 5000), // Store truncated content for reference
        vectorId,
        metadata,
        embeddingModel: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        createdAt: new Date(),
      });

      return embeddingId;
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid embedding response format') {
        throw error; // Re-throw embedding generation errors
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'insert',
        table: 'ragEmbedding',
        userId,
        resourceId: messageId,
      };

      throw createError.internal(
        `Failed to store embedding: ${errorMessage}`,
        context,
      );
    }
  }

  // ============================================================================
  // Context Retrieval
  // ============================================================================

  /**
   * Retrieve relevant context for a query using semantic search
   *
   * @param params - Query configuration
   * @returns Array of relevant context chunks with similarity scores
   */
  async retrieveContext(params: RetrieveContextParams): Promise<RAGContext[]> {
    // ✅ Runtime validation with Zod
    const validationResult = RetrieveContextParamsSchema.safeParse(params);
    if (!validationResult.success) {
      const context: ErrorContext = {
        errorType: 'validation',
        schemaName: 'RetrieveContextParams',
      };
      throw createError.badRequest(
        `Invalid context retrieval parameters: ${validationResult.error.message}`,
        context,
      );
    }

    const { query, threadId, userId, topK, minSimilarity, db } = validationResult.data;
    const vectorize = this.getVectorize();

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Query Vectorize for similar vectors
      const vectorQuery = await vectorize.query(queryEmbedding, {
        topK,
        returnMetadata: true,
        filter: threadId
          ? { threadId: { $eq: threadId }, userId: { $eq: userId } }
          : { userId: { $eq: userId } },
      });

      // Filter by similarity threshold
      const matches = (vectorQuery.matches || [])
        .filter(match => match.score >= minSimilarity)
        .sort((a, b) => b.score - a.score);

      if (matches.length === 0) {
        return [];
      }

      // Get vector IDs to query D1
      const vectorIds = matches.map(m => m.id);

      // Fetch full metadata from D1
      const embeddings = await db.query.ragEmbedding.findMany({
        where: (fields, { inArray }) => inArray(fields.vectorId, vectorIds),
      });

      // Map results with similarity scores
      const embeddingMap = new Map(embeddings.map(e => [e.vectorId, e]));

      const results: RAGContext[] = [];
      for (const match of matches) {
        const embedding = embeddingMap.get(match.id);

        if (embedding) {
          results.push({
            id: embedding.id,
            messageId: embedding.messageId,
            content: embedding.content,
            similarity: match.score,
            metadata: embedding.metadata || undefined,
          });
        }
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'vectorize',
        operation: 'query',
        userId,
      };

      throw createError.internal(
        `Failed to retrieve context: ${errorMessage}`,
        context,
      );
    }
  }

  /**
   * Format RAG context for injection into AI prompts
   *
   * @param contexts - Retrieved context chunks
   * @returns Formatted context string
   */
  formatContextForPrompt(contexts: RAGContext[]): string {
    if (contexts.length === 0) {
      return '';
    }

    const contextItems = contexts
      .map((ctx, index) => {
        const roleLabel = ctx.metadata?.role === 'user' ? 'User' : 'Assistant';
        const modelLabel = ctx.metadata?.modelId ? ` (${ctx.metadata.modelId})` : '';
        const roundLabel = ctx.metadata?.roundNumber ? ` [Round ${ctx.metadata.roundNumber}]` : '';

        return `[${index + 1}] ${roleLabel}${modelLabel}${roundLabel} (relevance: ${(ctx.similarity * 100).toFixed(1)}%):
${ctx.content}`;
      })
      .join('\n\n');

    return `## Relevant Context from Previous Conversations

The following are relevant excerpts from earlier in this conversation or related threads:

${contextItems}

---

Use the above context to inform your response when relevant, but do not explicitly reference "the context" in your answer. Provide a natural, coherent response.`;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Store embedding for a chat message (called after message creation)
   */
  async storeMessageEmbedding(params: {
    message: typeof tables.chatMessage.$inferSelect;
    threadId: string;
    userId: string;
    db: Awaited<ReturnType<typeof getDbAsync>>;
  }): Promise<string | null> {
    const { message, threadId, userId, db } = params;

    // Extract text content from message parts
    const content = extractTextFromParts(message.parts);

    // Skip if no content
    if (!content.trim()) {
      return null;
    }

    // Store embedding
    return this.storeEmbedding({
      messageId: message.id,
      threadId,
      userId,
      content,
      metadata: {
        role: message.role,
        participantId: message.participantId || undefined,
        roundNumber: message.roundNumber,
        modelId: message.metadata?.model,
      },
      db,
    });
  }

  /**
   * Delete embeddings for a message (when message is deleted)
   */
  async deleteMessageEmbeddings(params: {
    messageId: string;
    db: Awaited<ReturnType<typeof getDbAsync>>;
  }): Promise<void> {
    const { messageId, db } = params;
    const vectorize = this.getVectorize();

    try {
      // Find embeddings to delete
      const embeddings = await db.query.ragEmbedding.findMany({
        where: eq(tables.ragEmbedding.messageId, messageId),
      });

      if (embeddings.length === 0) {
        return;
      }

      // Delete from Vectorize
      const vectorIds = embeddings.map(e => e.vectorId);
      await vectorize.deleteByIds(vectorIds);

      // Delete from D1
      await db.delete(tables.ragEmbedding)
        .where(eq(tables.ragEmbedding.messageId, messageId));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'delete',
        table: 'ragEmbedding',
        resourceId: messageId,
      };

      throw createError.internal(
        `Failed to delete message embeddings: ${errorMessage}`,
        context,
      );
    }
  }

  /**
   * Delete all embeddings for a thread (when thread is deleted)
   * Note: CASCADE foreign key will handle D1 cleanup automatically
   */
  async deleteThreadEmbeddings(params: {
    threadId: string;
    db: Awaited<ReturnType<typeof getDbAsync>>;
  }): Promise<void> {
    const { threadId, db } = params;
    const vectorize = this.getVectorize();

    try {
      // Find all embeddings for thread
      const embeddings = await db.query.ragEmbedding.findMany({
        where: eq(tables.ragEmbedding.threadId, threadId),
      });

      if (embeddings.length === 0) {
        return;
      }

      // Delete from Vectorize
      const vectorIds = embeddings.map(e => e.vectorId);
      await vectorize.deleteByIds(vectorIds);

      // D1 cleanup happens automatically via CASCADE foreign key
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'delete',
        table: 'ragEmbedding',
        resourceId: threadId,
      };

      throw createError.internal(
        `Failed to delete thread embeddings: ${errorMessage}`,
        context,
      );
    }
  }

  /**
   * Track RAG context retrieval stats for analytics
   */
  async trackContextRetrieval(params: {
    threadId: string;
    userId: string;
    query: string;
    contexts: RAGContext[];
    queryTimeMs: number;
    db: Awaited<ReturnType<typeof getDbAsync>>;
  }): Promise<void> {
    const { threadId, userId, query, contexts, queryTimeMs, db } = params;

    try {
      await db.insert(tables.ragContextStats).values({
        id: ulid(),
        threadId,
        userId,
        query: query.slice(0, 1000), // Truncate for storage
        resultsCount: contexts.length,
        topSimilarity: contexts[0]?.similarity || null,
        retrievedEmbeddingIds: contexts.map(c => c.id),
        queryTimeMs,
        createdAt: new Date(),
      });
    } catch {
      // Log error but don't throw - analytics failure shouldn't break the flow

    }
  }
}

/**
 * Singleton instance
 */
export const ragService = new RAGService();

/**
 * Initialize RAG service from environment
 * Must be called before using ragService
 *
 * ✅ FOLLOWS: initializeOpenRouter() pattern exactly
 */
export function initializeRAG(env: ApiEnv['Bindings']): void {
  ragService.initialize({
    ai: env.AI,
    vectorize: env.VECTORIZE,
  });
}
