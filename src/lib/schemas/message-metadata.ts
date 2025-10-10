/**
 * ✅ SINGLE SOURCE OF TRUTH: Message Metadata Schemas
 *
 * This module defines the canonical metadata schemas used throughout the application.
 * Both backend and frontend import from this file to ensure zero divergence.
 *
 * ✅ ZOD INFERENCE PATTERN: All types inferred from schemas (no hardcoded types)
 * ✅ EXTENSIBILITY PATTERN: Uses .passthrough().nullable() for future extensibility
 *
 * Backend imports:
 * - src/api/services/message-variant.service.ts
 * - src/api/routes/chat/handler.ts
 *
 * Frontend imports:
 * - src/lib/ai/message-helpers.ts
 * - src/hooks/utils/use-chat-streaming.ts
 * - src/containers/screens/chat/ChatThreadScreen.tsx
 * - src/containers/screens/chat/ChatOverviewScreen.tsx
 */

import { z } from 'zod';

// ============================================================================
// Core Message Metadata Schema
// ============================================================================

/**
 * ✅ BASE METADATA SCHEMA: Core fields from backend ChatMessage.metadata
 * Defined in src/db/tables/chat.ts (metadata field)
 *
 * ✅ UPDATED: Now includes variant tracking fields (moved from columns)
 * - variantIndex: Which variant this is (0 = original, 1+ = regenerated)
 * - isActiveVariant: Currently displayed/active variant
 * - variantGroupId: Groups variants of the same response
 * - roundId: Groups messages from same conversation round
 * - parentMessageId: Reference to user message (for threading)
 *
 * Pattern: z.object({}).passthrough().nullable()
 * - .passthrough() allows additional fields for extensibility
 * - .nullable() allows null values from database
 */
export const MessageMetadataSchema = z.object({
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),
  // ✅ Variant tracking fields (moved from database columns to metadata)
  variantIndex: z.number().optional(),
  isActiveVariant: z.boolean().optional(),
  variantGroupId: z.string().optional(),
  roundId: z.string().optional(),
  parentMessageId: z.string().nullable().optional(),
}).passthrough().nullable();

/**
 * ✅ ZOD INFERENCE: Type inferred from schema (no hardcoded types)
 */
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ============================================================================
// Streaming Variant Schema
// ============================================================================

/**
 * ✅ STREAMING VARIANT SCHEMA: Full variant data for client-side switching
 * Used in SSE finish events and server-side pre-fetching
 *
 * ✅ UPDATED: Now includes full message data to enable client-side variant switching
 * without additional API calls
 *
 * Backend: src/api/services/message-variant.service.ts
 * Frontend: src/lib/ai/message-helpers.ts
 */
export const StreamingVariantSchema = z.object({
  id: z.string(),
  content: z.string(),
  variantIndex: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
  metadata: MessageMetadataSchema, // ✅ Reuses base metadata schema
  participantId: z.string().nullable(), // ✅ NEW: Participant ID (nullable for legacy messages)
  reasoning: z.string().optional(), // ✅ NEW: Optional reasoning/chain-of-thought data
});

/**
 * ✅ ZOD INFERENCE: Type inferred from schema (no hardcoded types)
 */
export type StreamingVariant = z.infer<typeof StreamingVariantSchema>;

// ============================================================================
// UI Message Metadata Schema (Frontend Extension)
// ============================================================================

/**
 * ✅ FRONTEND EXTENSION: Extends backend MessageMetadata with UI-specific fields
 *
 * This schema adds frontend-specific fields while maintaining compatibility
 * with backend MessageMetadata through the .passthrough() pattern.
 *
 * UI-specific fields:
 * - participantId, participantIndex, role (for rendering)
 * - createdAt, parentMessageId (for timeline and variants)
 * - variants, currentVariantIndex, etc. (for branching UI)
 * - hasError, error, errorType, errorMessage (for error handling)
 * - mode, aborted, partialResponse (for streaming state)
 */
export const UIMessageMetadataSchema = z.object({
  // ✅ Backend metadata fields (from MessageMetadataSchema)
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),

  // ✅ UI-specific fields for rendering
  participantId: z.string().nullable().optional(),
  participantIndex: z.number().optional(),
  role: z.string().nullable().optional(), // Allow null (backend sends null for participants without custom roles)
  createdAt: z.string().optional(),
  parentMessageId: z.string().nullable().optional(),

  // ✅ Streaming state fields
  mode: z.string().optional(), // Chat mode (brainstorming, etc.)
  aborted: z.boolean().optional(), // Whether streaming was aborted
  partialResponse: z.boolean().optional(), // Whether response is partial

  // ✅ Variant/branching fields (uses StreamingVariantSchema)
  variants: z.array(StreamingVariantSchema).optional(),
  currentVariantIndex: z.number().optional(),
  activeVariantIndex: z.number().optional(),
  totalVariants: z.number().optional(),
  hasVariants: z.boolean().optional(),
  roundId: z.string().optional(),

  // ✅ Error handling fields (AI SDK error handling pattern)
  hasError: z.boolean().optional(),
  error: z.string().optional(),
  errorType: z.string().optional(),
  errorMessage: z.string().optional(),
  isTransient: z.boolean().optional(),
}).passthrough(); // ✅ Allow additional fields (matches backend pattern)

/**
 * ✅ ZOD INFERENCE: Type inferred from schema (no hardcoded types)
 */
export type UIMessageMetadata = z.infer<typeof UIMessageMetadataSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * ✅ ZOD VALIDATION: Runtime-safe metadata extraction with proper validation
 * Parses and validates metadata using Zod schema
 *
 * @param metadata - Unknown metadata field
 * @param schema - Zod schema to validate against
 * @returns Validated and typed metadata, or undefined if invalid/missing
 */
export function validateMessageMetadata<T extends z.ZodTypeAny>(
  metadata: unknown,
  schema: T,
): z.infer<T> | undefined {
  if (!metadata) {
    return undefined;
  }

  // ✅ Use safeParse for graceful handling of invalid data
  const result = schema.safeParse(metadata);

  // If validation fails, return raw metadata as fallback
  // This prevents losing critical data when schema is outdated
  if (!result.success) {
    return metadata as z.infer<T>;
  }

  return result.data;
}
