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

import { WebSearchContentTypeSchema, WebSearchDepthSchema } from '@/api/core/enums';

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
  'failed',
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
 * isParticipantTrigger: Transient flag for triggering participant streaming (not persisted to DB)
 */
export const UserMessageMetadataSchema = z.object({
  roundNumber: z.number().int().positive(),
  createdAt: z.string().datetime().optional(),
  isParticipantTrigger: z.boolean().optional(), // Frontend-only flag for triggering participants
});

export type UserMessageMetadata = z.infer<typeof UserMessageMetadataSchema>;

// ============================================================================
// Usage Tracking Schema (Reusable)
// ============================================================================

/**
 * Token usage schema - reusable across message metadata and API responses
 * Single source of truth for usage tracking structure
 */
export const UsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type Usage = z.infer<typeof UsageSchema>;

// ============================================================================
// Assistant Message Metadata Schema (Strict Requirements)
// ============================================================================

// ============================================================================
// Pre-Search Metadata Schema (for web search results)
// ============================================================================

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

export type PreSearchQueryMetadata = z.infer<typeof PreSearchQueryMetadataSchema>;

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

/**
 * Pre-search metadata
 * Contains information about initial web searches performed before streaming
 * Now includes full search results with URLs for citation
 */
export const PreSearchMetadataSchema = z.object({
  queries: z.array(PreSearchQueryMetadataSchema),
  analysis: z.string(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
  // Full search results with URLs for participant citation
  results: z.array(PreSearchResultSchema),
});

export type PreSearchMetadata = z.infer<typeof PreSearchMetadataSchema>;

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
  status: z.enum(['pending', 'searching', 'complete', 'failed']),
  result: z.object({
    answer: z.string().nullable().optional(),
    results: z.array(PreSearchResultItemSchemaEnhanced).optional(),
    responseTime: z.number().optional(),
  }).optional(),
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
    results: z.array(z.object({
      title: z.string(),
      url: z.string().url(),
      content: z.string(),
    })).optional(),
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
export type PreSearchCompleteEvent = z.infer<typeof PreSearchCompleteEventSchema>;
export type PreSearchErrorEvent = z.infer<typeof PreSearchErrorEventSchema>;
export type PreSearchStreamEvent = z.infer<typeof PreSearchStreamEventSchema>;

// ============================================================================
// Pre-Search Message Metadata Schema (System Messages with Web Search)
// ============================================================================

/**
 * Pre-search message metadata schema
 * These are system messages containing web search results, not participant responses
 *
 * DISTINGUISHING CHARACTERISTICS:
 * - role: 'system' (NOT 'assistant' like participant messages)
 * - isPreSearch: true (explicit flag for type narrowing)
 * - NO participantId (these are not from specific participants)
 * - Contains preSearch data with web search results
 */
export const PreSearchMessageMetadataSchema = z.object({
  role: z.literal('system'),
  roundNumber: z.number().int().positive(),
  isPreSearch: z.literal(true),
  preSearch: PreSearchMetadataSchema,
  createdAt: z.string().datetime().optional(),
});

export type PreSearchMessageMetadata = z.infer<typeof PreSearchMessageMetadataSchema>;

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
  // ✅ AI SDK FIX: null gets stripped from SSE - provide default
  participantRole: z.string().nullable().default(null),

  // AI SDK core fields - REQUIRED for tracking
  model: z.string().min(1), // Must specify which model was used
  finishReason: FinishReasonSchema, // Zod enum - single source of truth

  // Usage tracking - REQUIRED for cost/performance monitoring
  usage: UsageSchema,

  // Error state - REQUIRED booleans
  // ✅ AI SDK FIX: false gets stripped from SSE - provide defaults
  hasError: z.boolean().default(false),
  isTransient: z.boolean().default(false),
  isPartialResponse: z.boolean().default(false),

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
  aborted: z.boolean().optional(), // Whether request was aborted
});

export type AssistantMessageMetadata = z.infer<typeof AssistantMessageMetadataSchema>;

// ============================================================================
// Participant Message Metadata Schema (Alias for clarity in filtering)
// ============================================================================

/**
 * Participant message metadata - alias for assistant metadata with explicit naming
 * Use this type when specifically filtering for participant responses (vs pre-search)
 *
 * This is the same as AssistantMessageMetadata but with clearer naming
 * for contexts where we're explicitly filtering out pre-search messages
 */
export const ParticipantMessageMetadataSchema = AssistantMessageMetadataSchema;
export type ParticipantMessageMetadata = AssistantMessageMetadata;

// ============================================================================
// Discriminated Union - Type-Safe Message Metadata
// ============================================================================

/**
 * Type-safe message metadata that enforces different requirements across message types
 * Use this for runtime validation and type narrowing
 *
 * THREE MESSAGE TYPES:
 * 1. User messages: Only roundNumber required
 * 2. Assistant/Participant messages: Full participant tracking + error state
 * 3. Pre-search/System messages: Web search results, no participant
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
  PreSearchMessageMetadataSchema,
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

/**
 * Type guard to check if metadata is for a pre-search message
 * Pre-search messages contain web search results and are NOT participant responses
 */
export function isPreSearchMetadata(
  metadata: MessageMetadata,
): metadata is PreSearchMessageMetadata {
  return metadata.role === 'system' && 'isPreSearch' in metadata && metadata.isPreSearch === true;
}

/**
 * Type guard to check if metadata is for a participant message
 * Participant messages are assistant messages that are NOT pre-search
 */
export function isParticipantMetadata(
  metadata: MessageMetadata,
): metadata is Extract<MessageMetadata, { role: 'assistant' }> {
  return metadata.role === 'assistant' && 'participantId' in metadata;
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
  usage: UsageSchema.optional(),
  hasError: z.boolean().optional(),
  isTransient: z.boolean().optional(),
  isPartialResponse: z.boolean().optional(),
  errorType: ErrorTypeSchema.optional(), // Zod enum - reused
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),
  preSearch: PreSearchMetadataSchema.optional(),
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
