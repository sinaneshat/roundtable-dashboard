/**
 * Message Metadata Schemas
 *
 * Design Principles:
 * 1. Critical fields (roundNumber, participantId, participantIndex) are REQUIRED for assistant messages
 * 2. NO .passthrough() - only explicitly defined fields allowed
 * 3. NO .nullable() on schemas - use explicit null types for optional fields
 * 4. User messages have minimal required metadata (only roundNumber)
 *
 * Re-exports shared schemas where applicable.
 * Web-specific schemas remain here for UI streaming state.
 */

import type {
  PreSearchResult as SharedPreSearchResult,
  WebSearchResultItem,
} from '@roundtable/shared';
import {
  ErrorTypeSchema,
  FinishReasonSchema,
  MessageRoles,
  PreSearchQueryStateStatusSchema,
  // Re-export shared pre-search schemas
  PreSearchResultSchema as SharedPreSearchResultSchema,
  WebSearchDepthSchema,
  WebSearchResultItemSchema,
} from '@roundtable/shared';
import { z } from 'zod';

import type { DbMessageMetadata as MessageMetadata } from '@/services/api';
import {
  isAssistantMessageMetadata as isAssistantMetadata,
  UsageSchema,
} from '@/services/api';

// ============================================================================
// Re-export shared schemas for convenience
// ============================================================================

// Full pre-search result from shared (includes all fields)
export { SharedPreSearchResultSchema as PreSearchResultSchema };
export type { SharedPreSearchResult as PreSearchResult };
export { WebSearchResultItemSchema as PreSearchResultItemSchema };
export type { WebSearchResultItem as PreSearchResultItem };

// ============================================================================
// Pre-search query metadata (web-specific: omits 'total' field for UI usage)
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
// Pre-Search Streaming State Schemas (Web-Specific)
// ============================================================================

/**
 * Enhanced pre-search result item for UI streaming state
 * Uses shared WebSearchResultItemSchema as base
 */
export const PreSearchResultItemSchemaEnhanced = WebSearchResultItemSchema;

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
// Helper Functions
// ============================================================================

export function messageHasError(
  metadata: unknown,
): boolean {
  // First narrow unknown to DbMessageMetadata, then check if assistant
  if (!metadata || typeof metadata !== 'object' || !('role' in metadata)) {
    return false;
  }
  const parsed = metadata as MessageMetadata;
  if (isAssistantMetadata(parsed)) {
    return parsed.hasError === true;
  }
  return false;
}

// ============================================================================
// Partial Metadata Schemas (for message creation/conversion)
// ============================================================================

export const PartialUserMetadataSchema = z.object({
  role: z.literal(MessageRoles.USER),
  roundNumber: z.number().int().nonnegative(),
  createdAt: z.string().datetime().optional(),
});

export type PartialUserMetadata = z.infer<typeof PartialUserMetadataSchema>;

export const PartialAssistantMetadataSchema = z.object({
  role: z.literal(MessageRoles.ASSISTANT),
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
  // OpenRouter error responses contain variable structure from provider
  openRouterError: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
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
