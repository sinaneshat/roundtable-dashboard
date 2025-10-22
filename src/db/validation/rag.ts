/**
 * RAG Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic validations
 *
 * Following established pattern from validation/chat.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

import {
  ragContextStats,
  ragEmbedding,
} from '@/db/tables/rag';

import { Refinements } from './refinements';

/**
 * RAG Embedding Schemas
 */
export const ragEmbeddingSelectSchema = createSelectSchema(ragEmbedding);
export const ragEmbeddingInsertSchema = createInsertSchema(ragEmbedding, {
  content: Refinements.content(),
});
export const ragEmbeddingUpdateSchema = createUpdateSchema(ragEmbedding);

/**
 * RAG Context Stats Schemas
 */
export const ragContextStatsSelectSchema = createSelectSchema(ragContextStats);
export const ragContextStatsInsertSchema = createInsertSchema(ragContextStats, {
  query: Refinements.content(),
});
export const ragContextStatsUpdateSchema = createUpdateSchema(ragContextStats);
