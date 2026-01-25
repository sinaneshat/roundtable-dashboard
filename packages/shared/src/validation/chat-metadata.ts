/**
 * Chat Metadata Schemas - Shared Validation
 *
 * ✅ SINGLE SOURCE OF TRUTH: All chat metadata schemas shared between API and web
 * ✅ ZOD-FIRST PATTERN: Types inferred from schemas using z.infer
 *
 * Used by:
 * - Backend: Database persistence, API validation
 * - Frontend: Type-safe metadata access in UI components
 */

import * as z from 'zod';

import {
  ChatModeSchema,
  CitationSourceTypeSchema,
  ErrorTypeSchema,
  FinishReasonSchema,
  UIMessageRoles,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
} from '../enums';

// ============================================================================
// USAGE SCHEMA
// ============================================================================

/**
 * Token usage schema - reusable across message metadata and API responses
 * Single source of truth for usage tracking structure
 */
export const UsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict();

export type Usage = z.infer<typeof UsageSchema>;

// ============================================================================
// CITATION SCHEMA
// ============================================================================

/**
 * Citation Schema - RAG source references in AI responses
 */
export const DbCitationSchema = z.object({
  id: z.string().min(1),
  sourceType: CitationSourceTypeSchema,
  sourceId: z.string().min(1),
  displayNumber: z.number().int().positive(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  url: z.string().optional(),
  threadId: z.string().optional(),
  threadTitle: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),
  downloadUrl: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
}).strict();

export type DbCitation = z.infer<typeof DbCitationSchema>;

// ============================================================================
// AVAILABLE SOURCE SCHEMA
// ============================================================================

/**
 * Available sources - files/context that were available to AI
 */
export const AvailableSourceSchema = z.object({
  id: z.string(),
  sourceType: CitationSourceTypeSchema,
  title: z.string(),
  downloadUrl: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  domain: z.string().optional(),
  threadTitle: z.string().optional(),
  description: z.string().optional(),
  excerpt: z.string().optional(),
}).strict();

export type AvailableSource = z.infer<typeof AvailableSourceSchema>;

/**
 * Type guard: Check if value is a valid AvailableSource
 * ✅ ZOD VALIDATION: Uses schema safeParse for runtime type safety
 */
export function isAvailableSource(value: unknown): value is AvailableSource {
  return AvailableSourceSchema.safeParse(value).success;
}

// ============================================================================
// MESSAGE METADATA SCHEMAS
// ============================================================================

/**
 * Base message metadata (common fields)
 */
export const DbMessageMetadataBaseSchema = z.object({
  role: z.enum(['user', 'assistant']),
  roundNumber: z.number().int().nonnegative(),
  createdAt: z.string().datetime().optional(),
}).strict();

/**
 * User Message Metadata Schema
 */
export const DbUserMessageMetadataSchema = z.object({
  role: z.literal(UIMessageRoles.USER),
  roundNumber: z.number().int().nonnegative(),
  createdAt: z.string().datetime().optional(),
  isParticipantTrigger: z.boolean().optional(),
}).strict();

export type DbUserMessageMetadata = z.infer<typeof DbUserMessageMetadataSchema>;

/**
 * Assistant/Participant Message Metadata Schema
 */
export const DbAssistantMessageMetadataSchema = z.object({
  role: z.literal(UIMessageRoles.ASSISTANT),
  roundNumber: z.number().int().nonnegative(),
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),
  model: z.string().min(1),
  finishReason: FinishReasonSchema,
  usage: UsageSchema,
  hasError: z.boolean().default(false),
  isTransient: z.boolean().default(false),
  isPartialResponse: z.boolean().default(false),
  errorType: ErrorTypeSchema.optional(),
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),
  rawErrorMessage: z.string().optional(),
  providerMessage: z.string().optional(),
  openRouterError: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ])).optional(),
  openRouterCode: z.union([z.string(), z.number()]).optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  isEmptyResponse: z.boolean().optional(),
  statusCode: z.number().int().optional(),
  responseBody: z.string().optional(),
  aborted: z.boolean().optional(),
  citations: z.array(DbCitationSchema).optional(),
  reasoningDuration: z.number().int().nonnegative().optional(),
  availableSources: z.array(AvailableSourceSchema).optional(),
  createdAt: z.string().datetime().optional(),
}).strict();

export type DbAssistantMessageMetadata = z.infer<typeof DbAssistantMessageMetadataSchema>;

// ============================================================================
// WEB SEARCH SCHEMAS
// ============================================================================

/**
 * Web search result item schema
 */
export const WebSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  score: z.number().min(0).max(1),
  publishedDate: z.string().nullable().optional(),
  domain: z.string().optional(),
  fullContent: z.string().optional(),
  rawContent: z.string().optional(),
  excerpt: z.string().optional(),
  contentType: WebSearchContentTypeSchema.optional(),
  keyPoints: z.array(z.string()).optional(),
  metadata: z.object({
    author: z.string().optional(),
    readingTime: z.number().optional(),
    wordCount: z.number().optional(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
  }).strict().optional(),
  images: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
    alt: z.string().optional(),
  }).strict()).optional(),
}).strict();

export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

/**
 * Generated search query schema
 */
export const GeneratedSearchQuerySchema = z.object({
  query: z.string(),
  topic: z.string().optional(),
  depth: z.string().optional(),
  timeRange: z.string().optional(),
  rationale: z.string().optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  index: z.number().optional(),
  complexity: z.string().optional(),
  sourceCount: z.number().optional(),
  total: z.number().optional(),
}).strict();

export type GeneratedSearchQuery = z.infer<typeof GeneratedSearchQuerySchema>;

/**
 * Pre-search query schema
 * Note: rationale, searchDepth, and total are required to match API contract
 */
export const PreSearchQuerySchema = z.object({
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  index: z.number(),
  total: z.number(),
}).strict();

export type PreSearchQuery = z.infer<typeof PreSearchQuerySchema>;

/**
 * Partial pre-search query schema (for streaming where fields may not be present yet)
 */
export const PartialPreSearchQuerySchema = z.object({
  query: z.string(),
  index: z.number(),
  rationale: z.string().optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  total: z.number().optional(),
  complexity: z.string().optional(),
  sourceCount: z.number().optional(),
}).strict();

export type PartialPreSearchQuery = z.infer<typeof PartialPreSearchQuerySchema>;

/**
 * Pre-search result schema
 * NOTE: answer and responseTime are required (non-optional) to match RPC inference from Hono API
 * During streaming, use null as default instead of undefined
 */
export const PreSearchResultSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
  results: z.array(WebSearchResultItemSchema),
  responseTime: z.number(),
  index: z.number().optional(),
}).strict();

export type PreSearchResult = z.infer<typeof PreSearchResultSchema>;

/**
 * Pre-search data payload schema
 * NOTE: Fields match DbPreSearchDataSchema to ensure RPC type compatibility
 */
export const PreSearchDataPayloadSchema = z.object({
  queries: z.array(PreSearchQuerySchema),
  results: z.array(PreSearchResultSchema),
  summary: z.string(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
}).strict();

export type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

/**
 * Partial pre-search data schema (for streaming updates)
 * Uses PartialPreSearchQuerySchema since streaming queries may not have all fields
 */
export const PartialPreSearchDataSchema = z.object({
  queries: z.array(PartialPreSearchQuerySchema).optional(),
  results: z.array(PreSearchResultSchema).optional(),
  answer: z.string().nullable().optional(),
  summary: z.string().optional(),
  totalResults: z.number().optional(),
  totalTime: z.number().optional(),
  index: z.number().optional(),
}).strict();

export type PartialPreSearchData = z.infer<typeof PartialPreSearchDataSchema>;

// ============================================================================
// PRE-SEARCH DATA SCHEMA (embedded in system messages)
// ============================================================================

const DbPreSearchResultItemSchema = z.object({
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
}).strict();

const DbPreSearchResultSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
  results: z.array(DbPreSearchResultItemSchema),
  responseTime: z.number(),
}).strict();

export const DbPreSearchDataSchema = z.object({
  queries: z.array(z.object({
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    index: z.number().int().nonnegative(),
  }).strict()),
  summary: z.string(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
  results: z.array(DbPreSearchResultSchema),
}).strict();

export type DbPreSearchData = z.infer<typeof DbPreSearchDataSchema>;

/**
 * Pre-search/System message metadata schema
 * System messages containing web search results
 *
 * DISTINGUISHING CHARACTERISTICS:
 * - role: 'system' (NOT 'assistant')
 * - isPreSearch: true (explicit discriminator)
 * - NO participantId (not from specific participants)
 * - Contains preSearch data with web results
 */
export const DbPreSearchMessageMetadataSchema = z.object({
  role: z.literal('system'),
  roundNumber: z.number().int().nonnegative(),
  isPreSearch: z.literal(true),
  preSearch: DbPreSearchDataSchema,
  createdAt: z.string().datetime().optional(),
}).strict();

export type DbPreSearchMessageMetadata = z.infer<typeof DbPreSearchMessageMetadataSchema>;

// ============================================================================
// MODERATOR SCHEMAS
// ============================================================================

/**
 * Moderator payload schema
 */
export const ModeratorPayloadSchema = z.object({
  summary: z.string(),
  insights: z.array(z.string()).min(1),
  recommendations: z.array(z.string()).optional(),
}).strict();

export type ModeratorPayload = z.infer<typeof ModeratorPayloadSchema>;

/**
 * Moderator message metadata schema
 * System-generated round summaries that appear after all participants respond
 *
 * DISTINGUISHING CHARACTERISTICS:
 * - role: 'assistant' (same as participants for rendering consistency)
 * - isModerator: true (explicit discriminator)
 * - NO participantId (not from a specific participant)
 * - Streams text like participants (no structured JSON)
 */
export const DbModeratorMessageMetadataSchema = z.object({
  role: z.literal(UIMessageRoles.ASSISTANT),
  roundNumber: z.number().int().nonnegative(),
  isModerator: z.literal(true),
  model: z.string().min(1),
  // participantIndex is used for ordering (MODERATOR_PARTICIPANT_INDEX = -99)
  participantIndex: z.number().int().optional(),
  finishReason: FinishReasonSchema.optional(),
  usage: UsageSchema.optional(),
  hasError: z.boolean().default(false),
  errorType: ErrorTypeSchema.optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime().optional(),
}).strict();

export type DbModeratorMessageMetadata = z.infer<typeof DbModeratorMessageMetadataSchema>;

/**
 * Complete Message Metadata Schema - Discriminated Union with Moderator Extension
 *
 * ✅ TYPE-SAFE DISCRIMINATION: Use 'role' field to determine message type
 * ✅ EXHAUSTIVE: All possible metadata shapes defined
 * ✅ NO ESCAPE HATCHES: No [key: string]: unknown
 *
 * NOTE: Moderator messages use role='assistant' like participants but are distinguished
 * by isModerator=true. The .or() pattern handles this edge case cleanly.
 */
export const DbMessageMetadataSchema = z.discriminatedUnion('role', [
  DbUserMessageMetadataSchema,
  DbAssistantMessageMetadataSchema,
  DbPreSearchMessageMetadataSchema,
]).or(DbModeratorMessageMetadataSchema);

export type DbMessageMetadata = z.infer<typeof DbMessageMetadataSchema>;

// ============================================================================
// CHANGELOG SCHEMAS
// ============================================================================

/**
 * Changelog data schema
 */
/**
 * Participant changelog entry for tracking participant changes
 */
const DbChangelogParticipantSchema = z.object({
  modelId: z.string(),
  role: z.string().nullable(),
}).strict();

export const DbChangelogDataSchema = z.object({
  type: z.string(),
  modelId: z.string().optional(),
  role: z.string().nullable().optional(),
  oldRole: z.string().nullable().optional(),
  newRole: z.string().nullable().optional(),
  oldMode: z.string().optional(),
  newMode: z.string().optional(),
  enabled: z.boolean().optional(),
  participants: z.array(DbChangelogParticipantSchema).optional(),
}).strict();

export type DbChangelogData = z.infer<typeof DbChangelogDataSchema>;

// ============================================================================
// ANALYZE PROMPT SCHEMAS
// ============================================================================

/**
 * Recommended participant from auto mode analysis
 */
export const RecommendedParticipantSchema = z.object({
  modelId: z.string(),
  role: z.string().nullable(),
}).strict();

export type RecommendedParticipant = z.infer<typeof RecommendedParticipantSchema>;

/**
 * Auto mode analysis response payload
 */
export const AnalyzePromptPayloadSchema = z.object({
  participants: z.array(RecommendedParticipantSchema).min(1),
  mode: ChatModeSchema,
  enableWebSearch: z.boolean(),
}).strict();

export type AnalyzePromptPayload = z.infer<typeof AnalyzePromptPayloadSchema>;
