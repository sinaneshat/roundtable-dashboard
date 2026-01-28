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
  PreSearchResult,
  WebSearchResultItem,
} from '@roundtable/shared';
import {
  ErrorTypeSchema,
  FinishReasonSchema,
  MessageRoles,
  PreSearchQueryStateStatusSchema,
  PreSearchResultSchema,
  WebSearchDepthSchema,
  WebSearchResultItemSchema,
} from '@roundtable/shared';
import { z } from 'zod';

import { UsageSchema } from '@/services/api';

// ============================================================================
// Re-export shared schemas with canonical names
// ============================================================================

// Full pre-search result from shared (includes all fields)
export { PreSearchResultSchema };
export type { PreSearchResult };
// Alias for backward compatibility - consumers should migrate to WebSearchResultItemSchema
export { WebSearchResultItemSchema as PreSearchResultItemSchema };
export type { WebSearchResultItem as PreSearchResultItem };

// ============================================================================
// Pre-search query metadata (web-specific: omits 'total' field for UI usage)
// ============================================================================

export const PreSearchQueryMetadataSchema = z.object({
  index: z.number().int().nonnegative(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
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
  query: z.string(),
  rationale: z.string(),
  result: z
    .object({
      answer: z.string().nullable().optional(),
      responseTime: z.number().optional(),
      results: z.array(PreSearchResultItemSchemaEnhanced).optional(),
    })
    .optional(),
  searchDepth: WebSearchDepthSchema,
  status: PreSearchQueryStateStatusSchema,
  total: z.number().int().positive(),
});

export type PreSearchQueryState = z.infer<typeof PreSearchQueryStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Minimal schema for hasError extraction from assistant metadata
 * Used when we only need to check if an assistant message has an error
 */
const AssistantErrorCheckSchema = z.object({
  hasError: z.boolean().optional(),
  role: z.literal(MessageRoles.ASSISTANT),
});

/**
 * Check if metadata indicates a message has an error
 *
 * Uses Zod safeParse for type-safe validation instead of manual type guards.
 * Only returns true for assistant messages with hasError === true.
 *
 * @param metadata - Raw metadata to check
 * @returns true if metadata is assistant type with hasError === true
 */
export function messageHasError(
  metadata: unknown,
): boolean {
  const result = AssistantErrorCheckSchema.safeParse(metadata);
  if (!result.success) {
    return false;
  }
  return result.data.hasError === true;
}

// ============================================================================
// Partial Metadata Schemas (for message creation/conversion)
// ============================================================================

export const PartialUserMetadataSchema = z.object({
  createdAt: z.string().datetime().optional(),
  role: z.literal(MessageRoles.USER),
  roundNumber: z.number().int().nonnegative(),
});

export type PartialUserMetadata = z.infer<typeof PartialUserMetadataSchema>;

export const PartialAssistantMetadataSchema = z.object({
  aborted: z.boolean().optional(),
  createdAt: z.string().datetime().optional(),
  error: z.string().optional(),
  errorCategory: z.string().optional(),
  errorMessage: z.string().optional(),
  errorType: ErrorTypeSchema.optional(),
  finishReason: FinishReasonSchema.optional(),
  hasError: z.boolean().optional(),
  isEmptyResponse: z.boolean().optional(),
  isPartialResponse: z.boolean().optional(),
  isTransient: z.boolean().optional(),
  model: z.string().min(1).optional(),
  // OpenRouter error responses contain variable structure from provider
  openRouterError: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative().optional(),
  participantRole: z.string().nullable().optional(),
  providerMessage: z.string().optional(),
  responseBody: z.string().optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  role: z.literal(MessageRoles.ASSISTANT),
  roundNumber: z.number().int().nonnegative(),
  statusCode: z.number().int().optional(),
  usage: UsageSchema.optional(),
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
