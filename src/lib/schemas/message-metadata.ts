/**
 * Message Metadata Schemas
 *
 * Design Principles:
 * 1. Critical fields (roundNumber, participantId, participantIndex) are REQUIRED for assistant messages
 * 2. NO .passthrough() - only explicitly defined fields allowed
 * 3. NO .nullable() on schemas - use explicit null types for optional fields
 * 4. User messages have minimal required metadata (only roundNumber)
 */

import { z } from 'zod';

import {
  ErrorTypeSchema,
  FinishReasonSchema,
  PreSearchQueryStateStatusSchema,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
} from '@/api/core/enums';
import type { DbMessageMetadata as MessageMetadata } from '@/db/schemas/chat-metadata';
import {
  isAssistantMessageMetadata as isAssistantMetadata,
  UsageSchema,
} from '@/db/schemas/chat-metadata';

// ============================================================================
// Pre-search query metadata
// ============================================================================

export const PreSearchQueryMetadataSchema = z.object({
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  index: z.number().int().nonnegative(),
});

export type PreSearchQueryMetadata = z.infer<
  typeof PreSearchQueryMetadataSchema
>;

// ============================================================================
// Individual search result item
// ============================================================================

export const PreSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  score: z.number().min(0).max(1),
  publishedDate: z.string().nullable().optional(),
});

export type PreSearchResultItem = z.infer<typeof PreSearchResultItemSchema>;

// ============================================================================
// Complete search result for a query
// ============================================================================

export const PreSearchResultSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
  results: z.array(PreSearchResultItemSchema),
  responseTime: z.number(),
});

export type PreSearchResult = z.infer<typeof PreSearchResultSchema>;

// ============================================================================
// Pre-Search Streaming State Schemas
// ============================================================================

export const PreSearchResultItemSchemaEnhanced = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  score: z.number().min(0).max(1),
  publishedDate: z.string().nullable().optional(),
  domain: z.string().optional(),
  fullContent: z.string().optional(),
  contentType: WebSearchContentTypeSchema.optional(),
  keyPoints: z.array(z.string()).optional(),
  wordCount: z.number().optional(),
});

export const PreSearchQueryStateSchema = z.object({
  index: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  status: PreSearchQueryStateStatusSchema,
  result: z
    .object({
      answer: z.string().nullable().optional(),
      results: z.array(PreSearchResultItemSchemaEnhanced).optional(),
      responseTime: z.number().optional(),
    })
    .optional(),
});

export type PreSearchQueryState = z.infer<typeof PreSearchQueryStateSchema>;

// ============================================================================
// Pre-search streaming event schemas
// ============================================================================
// REMOVED: Duplicate PreSearch event schemas moved to authoritative location
// SINGLE SOURCE OF TRUTH: /src/api/routes/chat/schema.ts (lines 1388-1564)
// - PreSearchStartEventSchema
// - PreSearchQueryEventSchema
// - PreSearchResultEventSchema
// - PreSearchCompleteEventSchema
// - PreSearchDoneEventSchema
// - PreSearchFailedEventSchema
// - PreSearchAnswerChunkEventSchema
// - PreSearchAnswerCompleteEventSchema
// - PreSearchAnswerErrorEventSchema
// - PreSearchSSEEventSchema (discriminated union)
// All event schemas have OpenAPI decorators and `event` + `data` wrapper structure

// ============================================================================
// Helper Functions
// ============================================================================

export function messageHasError(
  metadata:
    | MessageMetadata
    | import('@/db/schemas/chat-metadata').DbMessageMetadata,
): boolean {
  const narrowedMetadata = metadata as MessageMetadata;
  if (isAssistantMetadata(narrowedMetadata)) {
    return narrowedMetadata.hasError === true;
  }
  return false;
}

export function getRoundNumber(metadata: MessageMetadata): number {
  return metadata.roundNumber;
}

// ============================================================================
// Partial Metadata Schemas (for message creation/conversion)
// ============================================================================

export const PartialUserMetadataSchema = z.object({
  role: z.literal('user'),
  roundNumber: z.number().int().nonnegative(),
  createdAt: z.string().datetime().optional(),
});

export type PartialUserMetadata = z.infer<typeof PartialUserMetadataSchema>;

export const PartialAssistantMetadataSchema = z.object({
  role: z.literal('assistant'),
  roundNumber: z.number().int().nonnegative(),
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative().optional(),
  participantRole: z.string().nullable().optional(),
  model: z.string().min(1).optional(),
  finishReason: FinishReasonSchema.optional(),
  usage: UsageSchema.optional(),
  hasError: z.boolean().optional(),
  isTransient: z.boolean().optional(),
  isPartialResponse: z.boolean().optional(),
  errorType: ErrorTypeSchema.optional(),
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  providerMessage: z.string().optional(),
  openRouterError: z.record(z.string(), z.unknown()).optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  isEmptyResponse: z.boolean().optional(),
  statusCode: z.number().int().optional(),
  responseBody: z.string().optional(),
  error: z.string().optional(),
  aborted: z.boolean().optional(),
});

export type PartialAssistantMetadata = z.infer<
  typeof PartialAssistantMetadataSchema
>;

export const PartialMessageMetadataSchema = z.discriminatedUnion('role', [
  PartialUserMetadataSchema,
  PartialAssistantMetadataSchema,
]);

export type PartialMessageMetadata = z.infer<
  typeof PartialMessageMetadataSchema
>;
