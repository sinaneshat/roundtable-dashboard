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
 */

import { z } from 'zod';

// ============================================================================
// Shared Enums (Zod-first Pattern - Single Source of Truth)
// ============================================================================

/**
 * AI SDK finish reason enum
 * Zod-first pattern: Schema is source of truth, reused across all metadata schemas
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/stream-text
 */
export const FinishReasonSchema = z.enum([
  'stop',
  'length',
  'tool-calls',
  'content-filter',
  'error',
  'other',
  'unknown',
]);

export type FinishReason = z.infer<typeof FinishReasonSchema>;

/**
 * Error type enum for categorizing AI operation errors
 * Zod-first pattern: Schema defines valid error types
 */
export const ErrorTypeSchema = z.enum([
  'rate_limit',
  'context_length',
  'api_error',
  'network',
  'timeout',
  'model_unavailable',
  'empty_response',
  'unknown',
]);

export type ErrorType = z.infer<typeof ErrorTypeSchema>;

// ============================================================================
// User Message Metadata Schema (Minimal Requirements)
// ============================================================================

/**
 * User messages only need roundNumber
 * Other fields are optional or system-generated
 */
export const UserMessageMetadataSchema = z.object({
  roundNumber: z.number().int().positive(),
  createdAt: z.string().datetime().optional(),
});

export type UserMessageMetadata = z.infer<typeof UserMessageMetadataSchema>;

// ============================================================================
// Assistant Message Metadata Schema (Strict Requirements)
// ============================================================================

/**
 * Core assistant message metadata - REQUIRED fields only
 * These fields are REQUIRED - no optional chaining needed
 */
const AssistantMessageMetadataCoreSchema = z.object({
  // Round tracking - REQUIRED
  roundNumber: z.number().int().positive(),

  // Participant tracking - REQUIRED for assistant messages
  participantId: z.string().min(1), // Must be valid ULID
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(), // Nullable but not optional - must be explicitly set

  // AI SDK core fields - REQUIRED for tracking
  model: z.string().min(1), // Must specify which model was used
  finishReason: FinishReasonSchema, // Zod enum - single source of truth

  // Usage tracking - REQUIRED for cost/performance monitoring
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),

  // Error state - REQUIRED booleans (no optional)
  hasError: z.boolean(),
  isTransient: z.boolean(),
  isPartialResponse: z.boolean(),

  // Error details - only present when hasError = true
  errorType: ErrorTypeSchema.optional(), // Zod enum - validated error types
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),

  // Timestamp
  createdAt: z.string().datetime().optional(),
});

/**
 * Full assistant message metadata including optional backend/debugging fields
 * All components should use this type to access metadata
 */
export const AssistantMessageMetadataSchema = AssistantMessageMetadataCoreSchema.extend({
  // Backend/debugging fields - OPTIONAL
  providerMessage: z.string().optional(),
  openRouterError: z.record(z.string(), z.unknown()).optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  isEmptyResponse: z.boolean().optional(),
  statusCode: z.number().int().optional(),
  responseBody: z.string().optional(),
  error: z.string().optional(), // Legacy error field
  aborted: z.boolean().optional(), // Whether request was aborted
});

export type AssistantMessageMetadata = z.infer<typeof AssistantMessageMetadataSchema>;

// ============================================================================
// Discriminated Union - Type-Safe Message Metadata
// ============================================================================

/**
 * Type-safe message metadata that enforces different requirements for user vs assistant messages
 * Use this for runtime validation and type narrowing
 */
export const MessageMetadataSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('user'),
    ...UserMessageMetadataSchema.shape,
  }),
  z.object({
    role: z.literal('assistant'),
    ...AssistantMessageMetadataSchema.shape,
  }),
]);

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ============================================================================
// Backend Storage Metadata (for database operations with defaults)
// ============================================================================

/**
 * Backend-only metadata schema with default values for database storage
 * Use this for validating metadata coming from API with defaults applied
 *
 * NOTE: AssistantMessageMetadata already includes all these fields as optional.
 * This schema adds defaults for database storage operations.
 */
export const BackendMessageMetadataSchema = AssistantMessageMetadataSchema.extend({
  retryAttempts: z.number().int().nonnegative().default(0),
  isEmptyResponse: z.boolean().default(false),
});

export type BackendMessageMetadata = z.infer<typeof BackendMessageMetadataSchema>;

// ============================================================================
// Type Guards - Strict Type Narrowing
// ============================================================================

/**
 * Type guard to check if metadata is for an assistant message
 * Enables strict type narrowing without optional chaining
 */
export function isAssistantMetadata(
  metadata: MessageMetadata,
): metadata is Extract<MessageMetadata, { role: 'assistant' }> {
  return metadata.role === 'assistant';
}

/**
 * Type guard to check if metadata is for a user message
 */
export function isUserMetadata(
  metadata: MessageMetadata,
): metadata is Extract<MessageMetadata, { role: 'user' }> {
  return metadata.role === 'user';
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and parse assistant message metadata
 * Throws if metadata is invalid or missing required fields
 */
export function validateAssistantMetadata(metadata: unknown): AssistantMessageMetadata {
  const result = AssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid assistant message metadata: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate and parse user message metadata
 */
export function validateUserMetadata(metadata: unknown): UserMessageMetadata {
  const result = UserMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid user message metadata: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Check if message has error WITHOUT loose type checking
 * Only works after metadata is validated
 */
export function messageHasError(metadata: MessageMetadata): boolean {
  if (isAssistantMetadata(metadata)) {
    return metadata.hasError === true;
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
  roundNumber: z.number().int().positive(),
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
  roundNumber: z.number().int().positive(),
  participantId: z.string().min(1),

  // All other fields from AssistantMessageMetadata are optional
  participantIndex: z.number().int().nonnegative().optional(),
  participantRole: z.string().nullable().optional(),
  model: z.string().min(1).optional(),
  finishReason: FinishReasonSchema.optional(), // Zod enum - reused
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).optional(),
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

export type PartialAssistantMetadata = z.infer<typeof PartialAssistantMetadataSchema>;

/**
 * Partial metadata discriminated union for message creation
 *
 * Zod-first pattern: Schema union is source of truth
 */
export const PartialMessageMetadataSchema = z.discriminatedUnion('role', [
  PartialUserMetadataSchema,
  PartialAssistantMetadataSchema,
]);

export type PartialMessageMetadata = z.infer<typeof PartialMessageMetadataSchema>;

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/**
 * @deprecated Use MessageMetadata instead
 * Backward-compatible alias for existing code
 */
export type UIMessageMetadata = MessageMetadata;

/**
 * @deprecated Use MessageMetadataSchema instead
 * Backward-compatible alias for existing code
 */
export const UIMessageMetadataSchema = MessageMetadataSchema;
