import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth';
import { chatMessage, chatThread } from './chat';

/**
 * RAG Context Embeddings
 * Stores vector embeddings for chat messages to enable semantic search
 * and context retrieval for enhanced AI responses
 *
 * Following Cloudflare RAG tutorial pattern:
 * https://developers.cloudflare.com/workers-ai/tutorials/build-a-retrieval-augmented-generation-ai/
 */
export const ragEmbedding = sqliteTable('rag_embedding', {
  id: text('id').primaryKey(),

  // Reference to the chat message this embedding represents
  messageId: text('message_id')
    .notNull()
    .references(() => chatMessage.id, { onDelete: 'cascade' }),

  // Reference to thread for efficient filtering
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),

  // User who owns this context (for access control)
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Text content that was embedded (extracted from message parts)
  content: text('content').notNull(),

  // Vectorize index ID - links D1 record to Vectorize vector
  // This is the ID used in Vectorize.upsert() and Vectorize.query()
  vectorId: text('vector_id').notNull().unique(),

  // Metadata for filtering and debugging
  metadata: text('metadata', { mode: 'json' }).$type<{
    role?: 'user' | 'assistant';
    participantId?: string;
    roundNumber?: number;
    modelId?: string;
    importance?: number; // 0-1 score for importance (higher = more important)
    [key: string]: unknown;
  }>(),

  // Embedding model used (for versioning if we change models)
  embeddingModel: text('embedding_model')
    .notNull()
    .default('@cf/baai/bge-base-en-v1.5'),

  // Vector dimensions (768 for bge-base-en-v1.5)
  dimensions: integer('dimensions')
    .notNull()
    .default(768),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
}, table => [
  // Indexes for efficient queries
  index('rag_embedding_message_idx').on(table.messageId),
  index('rag_embedding_thread_idx').on(table.threadId),
  index('rag_embedding_user_idx').on(table.userId),
  index('rag_embedding_vector_idx').on(table.vectorId),
  index('rag_embedding_created_idx').on(table.createdAt),

  // Composite index for thread-scoped queries
  index('rag_embedding_thread_created_idx').on(table.threadId, table.createdAt),
]);

/**
 * RAG Context Stats
 * Tracks usage and performance metrics for RAG context retrieval
 */
export const ragContextStats = sqliteTable('rag_context_stats', {
  id: text('id').primaryKey(),

  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),

  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Query that was used for context retrieval
  query: text('query').notNull(),

  // Number of results retrieved
  resultsCount: integer('results_count').notNull(),

  // Top similarity score
  topSimilarity: real('top_similarity'),

  // IDs of embeddings that were retrieved
  retrievedEmbeddingIds: text('retrieved_embedding_ids', { mode: 'json' })
    .notNull()
    .$type<string[]>(),

  // Performance metrics
  queryTimeMs: integer('query_time_ms'), // Time to query Vectorize

  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
}, table => [
  index('rag_context_stats_thread_idx').on(table.threadId),
  index('rag_context_stats_user_idx').on(table.userId),
  index('rag_context_stats_created_idx').on(table.createdAt),
]);

/**
 * Relations
 */
export const ragEmbeddingRelations = relations(ragEmbedding, ({ one }) => ({
  message: one(chatMessage, {
    fields: [ragEmbedding.messageId],
    references: [chatMessage.id],
  }),
  thread: one(chatThread, {
    fields: [ragEmbedding.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [ragEmbedding.userId],
    references: [user.id],
  }),
}));

export const ragContextStatsRelations = relations(ragContextStats, ({ one }) => ({
  thread: one(chatThread, {
    fields: [ragContextStats.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [ragContextStats.userId],
    references: [user.id],
  }),
}));
