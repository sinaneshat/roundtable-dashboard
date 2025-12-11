/**
 * Message Metadata Schemas
 *
 * STRICT TYPE SAFETY - No loose typing or optional critical fields allowed.
 * All assistant messages MUST have complete metadata for proper tracking.
 *
 * Design Principles:
 * 1. Critical fields (roundNumber, participantId, participantIndex) are REQUIRED for assistant messages
 * 2. NO .passthrough() - only explicitly defined fields allowed
 * 3. NO .nullable() on schemas - use explicit null types for optional fields
 * 4. User messages have minimal required metadata (only roundNumber)
 *
 * ✅ ZOD-FIRST PATTERN: Schemas defined here, types inferred
 * ✅ SINGLE SOURCE OF TRUTH: Enums imported from @/api/core/enums
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
// SINGLE SOURCE OF TRUTH REFERENCES:
// - ErrorTypeSchema, FinishReasonSchema → @/api/core/enums
// - UsageSchema → @/db/schemas/chat-metadata
// ============================================================================

// Message metadata schemas: Import from @/db/schemas/chat-metadata (single source of truth)

/**
 * Pre-search query metadata
 * Describes individual search queries performed before streaming
 */
export const PreSearchQueryMetadataSchema = z.object({
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  index: z.number().int().nonnegative(),
});

export type PreSearchQueryMetadata = z.infer<
  typeof PreSearchQueryMetadataSchema
>;

/**
 * Individual search result item
 * Contains details about a single web search result
 */
export const PreSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  score: z.number().min(0).max(1),
  publishedDate: z.string().nullable().optional(),
});

export type PreSearchResultItem = z.infer<typeof PreSearchResultItemSchema>;

/**
 * Complete search result for a query
 * Contains the query, answer, and array of result items
 */
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

/**
 * Enhanced search result item for streaming state
 * Matches WebSearchResultItem schema with full metadata
 */
export const PreSearchResultItemSchemaEnhanced = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  score: z.number().min(0).max(1),
  publishedDate: z.string().nullable().optional(),
  // Enhanced metadata
  domain: z.string().optional(),
  fullContent: z.string().optional(),
  contentType: WebSearchContentTypeSchema.optional(),
  keyPoints: z.array(z.string()).optional(),
  wordCount: z.number().optional(),
});

/**
 * Individual query state during streaming
 * Tracks status and result for each search query as it executes
 * Enhanced to include full WebSearchResultItem data
 */
export const PreSearchQueryStateSchema = z.object({
  index: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  status: PreSearchQueryStateStatusSchema, // ✅ Uses centralized enum
  result: z
    .object({
      answer: z.string().nullable().optional(),
      results: z.array(PreSearchResultItemSchemaEnhanced).optional(),
      responseTime: z.number().optional(),
    })
    .optional(),
});

export type PreSearchQueryState = z.infer<typeof PreSearchQueryStateSchema>;

/**
 * Pre-search streaming event schemas
 * Used for validating real-time search progress events from backend
 */
export const PreSearchStartEventSchema = z.object({
  type: z.literal('pre_search_start'),
  userQuery: z.string(),
});

export const PreSearchQueryEventSchema = z.object({
  type: z.literal('pre_search_query'),
  index: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
});

export const PreSearchResultEventSchema = z.object({
  type: z.literal('pre_search_result'),
  index: z.number().int().nonnegative(),
  result: z.object({
    results: z
      .array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          content: z.string(),
        }),
      )
      .optional(),
    responseTime: z.number().optional(),
  }),
});

export const PreSearchCompleteEventSchema = z.object({
  type: z.literal('pre_search_complete'),
});

export const PreSearchErrorEventSchema = z.object({
  type: z.literal('pre_search_error'),
  message: z.string(),
});

export const PreSearchStreamEventSchema = z.union([
  PreSearchStartEventSchema,
  PreSearchQueryEventSchema,
  PreSearchResultEventSchema,
  PreSearchCompleteEventSchema,
  PreSearchErrorEventSchema,
]);

export type PreSearchStartEvent = z.infer<typeof PreSearchStartEventSchema>;
export type PreSearchQueryEvent = z.infer<typeof PreSearchQueryEventSchema>;
export type PreSearchResultEvent = z.infer<typeof PreSearchResultEventSchema>;
export type PreSearchCompleteEvent = z.infer<
  typeof PreSearchCompleteEventSchema
>;
export type PreSearchErrorEvent = z.infer<typeof PreSearchErrorEventSchema>;
export type PreSearchStreamEvent = z.infer<typeof PreSearchStreamEventSchema>;

// ============================================================================
// Backward Compatibility Helpers
// ============================================================================

/**
 * Check if message has error WITHOUT loose type checking
 * Only works after metadata is validated
 *
 * Accepts both MessageMetadata and DbMessageMetadata for compatibility
 */
export function messageHasError(
  metadata:
    | MessageMetadata
    | import('@/db/schemas/chat-metadata').DbMessageMetadata,
): boolean {
  // Type guard narrows the metadata type
  const narrowedMetadata = metadata as MessageMetadata;
  if (isAssistantMetadata(narrowedMetadata)) {
    return narrowedMetadata.hasError === true;
  }
  return false; // User messages don't have error state
}

/**
 * Extract round number from metadata (required field, no optional chaining needed)
 */
export function getRoundNumber(metadata: MessageMetadata): number {
  return metadata.roundNumber; // Always present, no optional chaining
}

// ============================================================================
// Partial Metadata Schemas (for message creation/conversion)
// ============================================================================

/**
 * Partial user metadata schema for message creation
 * Only roundNumber required, role discriminator included
 *
 * Zod-first pattern: Schema is source of truth, type is inferred
 */
export const PartialUserMetadataSchema = z.object({
  role: z.literal('user'),
  roundNumber: z.number().int().nonnegative(), // ✅ 0-BASED: Allow round 0
  createdAt: z.string().datetime().optional(),
});

export type PartialUserMetadata = z.infer<typeof PartialUserMetadataSchema>;

/**
 * Partial assistant metadata schema for message creation
 * Only roundNumber and participantId required for creation
 * Other fields added during streaming (via mergeParticipantMetadata)
 *
 * Zod-first pattern: Merge required fields with optional fields explicitly
 */
export const PartialAssistantMetadataSchema = z.object({
  // Role discriminator - REQUIRED
  role: z.literal('assistant'),

  // Required fields for partial metadata
  roundNumber: z.number().int().nonnegative(), // ✅ 0-BASED: Allow round 0
  participantId: z.string().min(1),

  // All other fields from AssistantMessageMetadata are optional
  participantIndex: z.number().int().nonnegative().optional(),
  participantRole: z.string().nullable().optional(),
  model: z.string().min(1).optional(),
  finishReason: FinishReasonSchema.optional(), // Zod enum - reused
  usage: UsageSchema.optional(),
  hasError: z.boolean().optional(),
  isTransient: z.boolean().optional(),
  isPartialResponse: z.boolean().optional(),
  errorType: ErrorTypeSchema.optional(), // Zod enum - reused
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),
  createdAt: z.string().datetime().optional(),

  // Backend/debugging fields - all optional
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

/**
 * Partial metadata discriminated union for message creation
 *
 * Zod-first pattern: Schema union is source of truth
 */
export const PartialMessageMetadataSchema = z.discriminatedUnion('role', [
  PartialUserMetadataSchema,
  PartialAssistantMetadataSchema,
]);

export type PartialMessageMetadata = z.infer<
  typeof PartialMessageMetadataSchema
>;
