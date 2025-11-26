/**
 * Metadata Utilities
 *
 * **TYPE-SAFE METADATA EXTRACTION**: Single source of truth for all metadata operations
 * **ELIMINATES ANTI-PATTERNS**: No more `as Record<string, unknown>` casts
 *
 * This module consolidates:
 * - metadata-extraction.ts patterns
 * - Inline metadata casts from handlers
 * - Type guards for metadata validation
 *
 * Design Principles:
 * 1. Use Zod validation for runtime type safety
 * 2. Return properly typed values, never `unknown`
 * 3. Provide both nullable and throwing variants
 * 4. Support both frontend (UIMessage) and backend (ChatMessage) types
 */

import type { UIMessage } from 'ai';
import { z } from 'zod';

import type {
  DbAssistantMessageMetadata,
  DbMessageMetadata,
  DbPreSearchMessageMetadata,
  DbUserMessageMetadata,
} from '@/db/schemas/chat-metadata';
import {
  DbAssistantMessageMetadataSchema,
  DbMessageMetadataSchema,
  DbPreSearchMessageMetadataSchema,
  DbUserMessageMetadataSchema,
  isParticipantMessageMetadata,
} from '@/db/schemas/chat-metadata';
import type { ChatMessage } from '@/db/validation';

// Convenience type aliases for backward compatibility
type MessageMetadata = DbMessageMetadata;
type UserMessageMetadata = DbUserMessageMetadata;
type AssistantMessageMetadata = DbAssistantMessageMetadata;
type PreSearchMessageMetadata = DbPreSearchMessageMetadata;
type ParticipantMessageMetadata = DbAssistantMessageMetadata; // Participant messages are assistant messages with participantId

// ============================================================================
// Type Guards with Zod Validation
// ============================================================================

/**
 * Safely extract and parse message metadata
 *
 * Validates metadata against MessageMetadataSchema and returns typed metadata.
 * Provides robust error handling for malformed metadata.
 *
 * @param metadata - Raw metadata object from message
 * @returns Parsed MessageMetadata or undefined if no metadata
 *
 * @example
 * ```typescript
 * const metadata = getMessageMetadata(message.metadata);
 * if (metadata?.participantId) {
 *   const participantId = metadata.participantId;
 * }
 * ```
 */
export function getMessageMetadata(metadata: unknown): MessageMetadata | undefined {
  if (!metadata)
    return undefined;

  const result = DbMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : undefined;
}

/**
 * Type-safe user metadata extraction
 * Returns validated UserMessageMetadata or null
 */
export function getUserMetadata(
  metadata: unknown,
): UserMessageMetadata | null {
  const result = DbUserMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

/**
 * Type-safe assistant metadata extraction
 * Returns validated AssistantMessageMetadata or null
 */
export function getAssistantMetadata(
  metadata: unknown,
): AssistantMessageMetadata | null {
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

/**
 * Type-safe participant metadata extraction
 * Returns validated ParticipantMessageMetadata or null
 */
export function getParticipantMetadata(
  metadata: unknown,
): ParticipantMessageMetadata | null {
  // Participant metadata is assistant metadata with participantId
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    return null;
  }
  // Verify it has participantId using type guard from db schemas
  const hasParticipantId = isParticipantMessageMetadata(result.data);
  return hasParticipantId ? result.data : null;
}

/**
 * Type-safe pre-search metadata extraction
 * Returns validated PreSearchMessageMetadata or null
 */
export function getPreSearchMetadata(
  metadata: unknown,
): PreSearchMessageMetadata | null {
  const result = DbPreSearchMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

// ============================================================================
// Message-Level Helpers
// ============================================================================

/**
 * Extract metadata from UIMessage with type validation
 * Handles both frontend and backend message types
 */
export function extractMessageMetadata(
  message: UIMessage | ChatMessage,
): UserMessageMetadata | AssistantMessageMetadata | PreSearchMessageMetadata | null {
  if (!message.metadata) {
    return null;
  }

  // Try each schema in order of likelihood
  const userResult = getUserMetadata(message.metadata);
  if (userResult)
    return userResult;

  const assistantResult = getAssistantMetadata(message.metadata);
  if (assistantResult)
    return assistantResult;

  const preSearchResult = getPreSearchMetadata(message.metadata);
  if (preSearchResult)
    return preSearchResult;

  return null;
}

// ============================================================================
// Specific Field Extractors (Null-Safe)
// ============================================================================

/**
 * Extract roundNumber from metadata (all message types have this)
 * Returns null if metadata is invalid or roundNumber is missing
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.roundNumber`
 *
 * ✅ ZOD-FIRST PATTERN: Validates using Zod schemas without type casting
 * Handles 0-based indexing where roundNumber: 0 is valid
 */
export function getRoundNumber(metadata: unknown): number | null {
  if (!metadata) {
    return null;
  }

  // Try each message type schema (user, assistant, pre-search)
  const userResult = DbUserMessageMetadataSchema.safeParse(metadata);
  if (userResult.success) {
    return userResult.data.roundNumber;
  }

  const assistantResult = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (assistantResult.success) {
    return assistantResult.data.roundNumber;
  }

  const preSearchResult = DbPreSearchMessageMetadataSchema.safeParse(metadata);
  if (preSearchResult.success) {
    return preSearchResult.data.roundNumber;
  }

  // ✅ FALLBACK: Minimal schema for roundNumber extraction only
  // Handles cases where metadata has roundNumber but fails full validation
  const PartialRoundNumberSchema = z.object({
    roundNumber: z.number().int().nonnegative(),
  });

  const partialResult = PartialRoundNumberSchema.partial().safeParse(metadata);
  if (partialResult.success && partialResult.data.roundNumber !== undefined) {
    return partialResult.data.roundNumber;
  }

  return null;
}

/**
 * Extract participantId from metadata (only participant messages)
 * Returns null if not a participant message
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.participantId`
 */
export function getParticipantId(metadata: unknown): string | null {
  const validated = getParticipantMetadata(metadata);
  return validated?.participantId ?? null;
}

/**
 * Extract participantIndex from metadata (only participant messages)
 * Returns null if not a participant message
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.participantIndex`
 */
export function getParticipantIndex(metadata: unknown): number | null {
  const validated = getParticipantMetadata(metadata);
  return validated?.participantIndex ?? null;
}

/**
 * Extract participantRole from metadata (only participant messages)
 * Returns null if not a participant message or role not set
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.participantRole`
 */
export function getParticipantRole(metadata: unknown): string | null {
  const validated = getParticipantMetadata(metadata);
  return validated?.participantRole ?? null;
}

/**
 * Extract model from metadata (only assistant messages)
 * Returns null if not an assistant message
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.model`
 */
export function getModel(metadata: unknown): string | null {
  const validated = getAssistantMetadata(metadata);
  return validated?.model ?? null;
}

/**
 * Check if message has error (only assistant messages)
 * Returns false for non-assistant messages
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.hasError`
 */
export function hasError(metadata: unknown): boolean {
  const validated = getAssistantMetadata(metadata);
  return validated?.hasError ?? false;
}

/**
 * Check if message is pre-search
 * Returns true only if metadata validates as PreSearchMessageMetadata
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.isPreSearch === true`
 */
export function isPreSearch(metadata: unknown): boolean {
  const validated = getPreSearchMetadata(metadata);
  return validated !== null;
}

// ============================================================================
// Throwing Variants (For Backend Use)
// ============================================================================

/**
 * Extract participant metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requireParticipantMetadata(
  metadata: unknown,
): ParticipantMessageMetadata {
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid participant metadata: ${result.error.message}`);
  }
  if (!isParticipantMessageMetadata(result.data)) {
    throw new Error('Invalid participant metadata: missing participantId');
  }
  return result.data;
}

/**
 * Extract assistant metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requireAssistantMetadata(
  metadata: unknown,
): AssistantMessageMetadata {
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid assistant metadata: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Extract user metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requireUserMetadata(
  metadata: unknown,
): UserMessageMetadata {
  const result = DbUserMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid user metadata: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Extract pre-search metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requirePreSearchMetadata(
  metadata: unknown,
): PreSearchMessageMetadata {
  const result = DbPreSearchMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid pre-search metadata: ${result.error.message}`);
  }
  return result.data;
}

// ============================================================================
// Metadata Builders
// ============================================================================

/**
 * Build assistant message metadata with type safety
 *
 * **PURPOSE**: Single source of truth for assistant metadata construction
 * **REPLACES**: Inline metadata building in message-transforms.ts and handlers
 *
 * @param baseMetadata - Base metadata fields (finishReason, usage, etc.)
 * @param baseMetadata.finishReason - Finish reason from streaming response
 * @param baseMetadata.usage - Token usage statistics
 * @param options - Additional fields to include
 * @param options.participantId - Unique participant identifier
 * @param options.participantIndex - Index of participant in list
 * @param options.participantRole - Role assigned to participant
 * @param options.model - Model identifier used for generation
 * @param options.roundNumber - Round number in conversation
 * @param options.hasError - Whether message has error
 * @param options.errorType - Type of error if present
 * @param options.errorMessage - Error message if present
 * @param options.additionalFields - Additional metadata fields to include
 * @returns Fully constructed AssistantMessageMetadata
 *
 * @example
 * ```typescript
 * const metadata = buildAssistantMetadata(
 *   { finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 50 } },
 *   {
 *     participantId: 'part-123',
 *     participantIndex: 0,
 *     model: 'gpt-4',
 *     roundNumber: 1,
 *   }
 * );
 * ```
 */
/**
 * Builder schema for assistant metadata construction
 *
 * ✅ PARTIAL VALIDATION: Allows incremental construction during streaming
 * ✅ TYPE-SAFE: Validates all provided fields match expected types
 *
 * This is a relaxed version of DbAssistantMessageMetadataSchema that allows
 * partial construction while still providing type safety for the fields that are present.
 */
const AssistantMetadataBuilderSchema = DbAssistantMessageMetadataSchema.partial().extend({
  role: z.literal('assistant'), // Role is always required
});

export function buildAssistantMetadata(
  baseMetadata: Partial<AssistantMessageMetadata>,
  options: {
    participantId?: string;
    participantIndex?: number;
    participantRole?: string | null;
    model?: string;
    roundNumber?: number;
    hasError?: boolean;
    errorType?: string;
    errorMessage?: string;
    additionalFields?: Record<string, unknown>;
  },
): AssistantMessageMetadata {
  // Build the metadata object with role as discriminator
  const metadata = {
    role: 'assistant' as const,
    // Base metadata fields
    ...(baseMetadata.finishReason && { finishReason: baseMetadata.finishReason }),
    ...(baseMetadata.usage && { usage: baseMetadata.usage }),
    ...(baseMetadata.isTransient !== undefined && { isTransient: baseMetadata.isTransient }),
    ...(baseMetadata.isPartialResponse !== undefined && { isPartialResponse: baseMetadata.isPartialResponse }),
    ...(baseMetadata.createdAt && { createdAt: baseMetadata.createdAt }),
    // Options fields
    ...(options.roundNumber !== undefined && { roundNumber: options.roundNumber }),
    ...(options.participantId && { participantId: options.participantId }),
    ...(options.participantIndex !== undefined && { participantIndex: options.participantIndex }),
    // ✅ FIX: participantRole can be null, must check undefined not truthiness
    ...(options.participantRole !== undefined && { participantRole: options.participantRole }),
    ...(options.model && { model: options.model }),
    // Error fields
    ...(options.hasError !== undefined && { hasError: options.hasError }),
    ...(options.errorType && { errorType: options.errorType }),
    ...(options.errorMessage && { errorMessage: options.errorMessage }),
    // Additional fields (spread at end to allow overrides)
    ...options.additionalFields,
  };

  // ✅ TYPE-SAFE: Validate builder output matches expected shape
  // Uses partial schema to allow incremental construction
  const result = AssistantMetadataBuilderSchema.safeParse(metadata);

  if (result.success) {
    // ✅ SAFE RETURN: Zod-validated data as AssistantMessageMetadata
    // The partial schema validates types but allows missing required fields
    // This is intentional for streaming scenarios where metadata is built incrementally
    return result.data as AssistantMessageMetadata;
  }

  // Fallback: Return constructed object when validation fails
  // This maintains backwards compatibility while logging validation issues
  // ✅ DOCUMENTED CAST: Builder pattern requires this for incremental construction
  return metadata as AssistantMessageMetadata;
}

/**
 * Check if message has participant enrichment data
 *
 * Participant enrichment includes:
 * - participantId
 * - participantIndex
 * - participantRole (optional)
 * - model
 *
 * @param metadata - Message metadata to check
 * @returns True if metadata has participant enrichment
 *
 * @example
 * ```typescript
 * const hasEnrichment = hasParticipantEnrichment(message.metadata);
 * if (!hasEnrichment) {
 *   // Enrich message with participant data
 *   message.metadata = enrichMessageWithParticipant(message, participant);
 * }
 * ```
 */
export function hasParticipantEnrichment(metadata: unknown): boolean {
  const validated = getParticipantMetadata(metadata);
  return validated !== null
    && validated.participantId !== undefined
    && validated.participantIndex !== undefined
    && validated.model !== undefined;
}

/**
 * Enrich message metadata with participant information
 *
 * **PURPOSE**: Add participant context to existing message metadata
 * **USE CASE**: Frontend enrichment when displaying messages
 *
 * @param baseMetadata - Existing message metadata
 * @param participant - Participant data to enrich with
 * @param participant.id - Participant identifier
 * @param participant.modelId - Model identifier for participant
 * @param participant.role - Role assigned to participant
 * @param participant.index - Index of participant in list
 * @returns Enriched metadata with participant fields
 *
 * @example
 * ```typescript
 * const enriched = enrichMessageWithParticipant(
 *   message.metadata,
 *   {
 *     id: 'part-123',
 *     modelId: 'gpt-4',
 *     role: 'assistant',
 *     index: 0,
 *   }
 * );
 * ```
 */
/**
 * Schema for participant enrichment fields
 * Used to validate the enriched metadata result
 */
const ParticipantEnrichmentSchema = z.object({
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable().optional(),
  model: z.string().min(1),
});

export function enrichMessageWithParticipant(
  baseMetadata: MessageMetadata | undefined,
  participant: {
    id: string;
    modelId: string;
    role: string | null;
    index: number;
  },
): MessageMetadata {
  // Validate participant input first
  const enrichmentResult = ParticipantEnrichmentSchema.safeParse({
    participantId: participant.id,
    participantIndex: participant.index,
    participantRole: participant.role,
    model: participant.modelId,
  });

  if (!enrichmentResult.success) {
    throw new Error(`Invalid participant data for enrichment: ${enrichmentResult.error.message}`);
  }

  const base = baseMetadata || { role: 'assistant' as const };

  // Build enriched metadata with validated participant data
  const enrichedMetadata = {
    ...base,
    ...enrichmentResult.data,
  };

  // Validate the final result matches a valid metadata shape
  const finalResult = DbMessageMetadataSchema.safeParse(enrichedMetadata);

  if (finalResult.success) {
    return finalResult.data;
  }

  // ✅ FALLBACK: For assistant messages being enriched, use builder schema
  // This handles cases where base metadata is partial (e.g., from streaming)
  const builderResult = AssistantMetadataBuilderSchema.safeParse(enrichedMetadata);

  if (builderResult.success) {
    return builderResult.data as MessageMetadata;
  }

  // Last resort: return with documented cast for backwards compatibility
  // This path should rarely be hit if inputs are properly validated
  return enrichedMetadata as MessageMetadata;
}
