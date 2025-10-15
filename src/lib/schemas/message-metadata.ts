/**
 * ✅ SINGLE SOURCE OF TRUTH: Message Metadata Schemas
 *
 * This module imports the base metadata schema from the API and extends it with UI-specific fields.
 * This ensures zero divergence between backend and frontend metadata definitions.
 *
 * ✅ ZOD INFERENCE PATTERN: All types inferred from schemas (no hardcoded types)
 * ✅ EXTENSIBILITY PATTERN: Uses .passthrough().nullable() for future extensibility
 *
 * Single source of truth: @/api/routes/chat/schema:MessageMetadataSchema
 *
 * Frontend imports:
 * - src/lib/ai/message-helpers.ts
 * - src/hooks/utils/use-multi-participant-chat.ts
 * - src/containers/screens/chat/ChatThreadScreen.tsx
 * - src/containers/screens/chat/ChatOverviewScreen.tsx
 */

import { z } from 'zod';

import { MessageMetadataSchema as BaseMessageMetadataSchema } from '@/api/routes/chat/schema';

// ============================================================================
// Core Message Metadata Schema (Re-exported from API)
// ============================================================================

/**
 * ✅ REUSE: Base metadata schema from API routes
 * Single source of truth: @/api/routes/chat/schema:MessageMetadataSchema
 *
 * Pattern: z.object({}).passthrough().nullable()
 * - .passthrough() allows additional fields for extensibility
 * - .nullable() allows null values from database
 */
export const MessageMetadataSchema = BaseMessageMetadataSchema;

/**
 * ✅ ZOD INFERENCE: Type inferred from schema (no hardcoded types)
 */
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ============================================================================
// UI Message Metadata Schema (Frontend Extension)
// ============================================================================

/**
 * ✅ FRONTEND EXTENSION: Extends backend MessageMetadata with UI-specific fields
 *
 * This schema adds frontend-specific fields while maintaining compatibility
 * with backend MessageMetadata through the .extend() pattern.
 *
 * UI-specific fields:
 * - participantId, participantIndex, role (for rendering)
 * - createdAt (for timeline sorting)
 * - hasError, error, errorType, errorMessage (for error handling)
 * - mode, aborted, partialResponse (for streaming state)
 *
 * ✅ REUSE PATTERN: Uses .extend() to build upon base MessageMetadataSchema
 */
export const UIMessageMetadataSchema = MessageMetadataSchema
  .unwrap() // Remove nullable wrapper to extend
  .extend({
    // ✅ UI-specific fields for rendering
    participantId: z.string().nullable().optional(),
    participantIndex: z.number().optional(),
    role: z.string().nullable().optional(), // Allow null (backend sends null for participants without custom roles)
    createdAt: z.string().optional(),

    // ✅ Streaming state fields
    mode: z.string().optional(), // Chat mode (brainstorming, etc.)
    aborted: z.boolean().optional(), // Whether streaming was aborted
    partialResponse: z.boolean().optional(), // Whether response is partial

    // ✅ Error handling fields (AI SDK error handling pattern)
    hasError: z.boolean().optional(),
    error: z.string().optional(),
    errorType: z.string().optional(),
    errorMessage: z.string().optional(),
    isTransient: z.boolean().optional(),
    // ✅ Additional error details for debugging
    statusCode: z.number().optional(), // HTTP status code from API errors
    responseBody: z.string().optional(), // Truncated response body for debugging
    errorDetails: z.string().optional(), // JSON string with full error context
  })
  .passthrough(); // ✅ Allow additional fields (matches backend pattern)

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
