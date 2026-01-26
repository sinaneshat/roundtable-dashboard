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
  completionTokens: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
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
  displayNumber: z.number().int().positive(),
  downloadUrl: z.string().optional(),
  excerpt: z.string().optional(),
  filename: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  id: z.string().min(1),
  mimeType: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),
  sourceId: z.string().min(1),
  sourceType: CitationSourceTypeSchema,
  threadId: z.string().optional(),
  threadTitle: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
}).strict();

export type DbCitation = z.infer<typeof DbCitationSchema>;

// ============================================================================
// AVAILABLE SOURCE SCHEMA
// ============================================================================

/**
 * Available sources - files/context that were available to AI
 */
export const AvailableSourceSchema = z.object({
  description: z.string().optional(),
  domain: z.string().optional(),
  downloadUrl: z.string().optional(),
  excerpt: z.string().optional(),
  filename: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  id: z.string(),
  mimeType: z.string().optional(),
  sourceType: CitationSourceTypeSchema,
  threadTitle: z.string().optional(),
  title: z.string(),
  url: z.string().optional(),
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
  createdAt: z.string().datetime().optional(),
  role: z.enum(['user', 'assistant']),
  roundNumber: z.number().int().nonnegative(),
}).strict();

/**
 * User Message Metadata Schema
 */
export const DbUserMessageMetadataSchema = z.object({
  createdAt: z.string().datetime().optional(),
  isParticipantTrigger: z.boolean().optional(),
  role: z.literal(UIMessageRoles.USER),
  roundNumber: z.number().int().nonnegative(),
}).strict();

export type DbUserMessageMetadata = z.infer<typeof DbUserMessageMetadataSchema>;

/**
 * Assistant/Participant Message Metadata Schema
 */
export const DbAssistantMessageMetadataSchema = z.object({
  aborted: z.boolean().optional(),
  availableSources: z.array(AvailableSourceSchema).optional(),
  citations: z.array(DbCitationSchema).optional(),
  createdAt: z.string().datetime().optional(),
  errorCategory: z.string().optional(),
  errorMessage: z.string().optional(),
  errorType: ErrorTypeSchema.optional(),
  finishReason: FinishReasonSchema,
  hasError: z.boolean().default(false),
  isEmptyResponse: z.boolean().optional(),
  isPartialResponse: z.boolean().default(false),
  isTransient: z.boolean().default(false),
  model: z.string().min(1),
  openRouterCode: z.union([z.string(), z.number()]).optional(),
  openRouterError: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ])).optional(),
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),
  providerMessage: z.string().optional(),
  rawErrorMessage: z.string().optional(),
  reasoningDuration: z.number().int().nonnegative().optional(),
  responseBody: z.string().optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  role: z.literal(UIMessageRoles.ASSISTANT),
  roundNumber: z.number().int().nonnegative(),
  statusCode: z.number().int().optional(),
  usage: UsageSchema,
}).strict();

export type DbAssistantMessageMetadata = z.infer<typeof DbAssistantMessageMetadataSchema>;

// ============================================================================
// WEB SEARCH SCHEMAS
// ============================================================================

/**
 * Web search result item schema
 */
export const WebSearchResultItemSchema = z.object({
  content: z.string(),
  contentType: WebSearchContentTypeSchema.optional(),
  domain: z.string().optional(),
  excerpt: z.string().optional(),
  fullContent: z.string().optional(),
  images: z.array(z.object({
    alt: z.string().optional(),
    description: z.string().optional(),
    url: z.string(),
  }).strict()).optional(),
  keyPoints: z.array(z.string()).optional(),
  metadata: z.object({
    author: z.string().optional(),
    description: z.string().optional(),
    faviconUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    readingTime: z.number().optional(),
    wordCount: z.number().optional(),
  }).strict().optional(),
  publishedDate: z.string().nullable().optional(),
  rawContent: z.string().optional(),
  score: z.number().min(0).max(1),
  title: z.string(),
  url: z.string().url(),
}).strict();

export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

/**
 * Generated search query schema
 */
export const GeneratedSearchQuerySchema = z.object({
  complexity: z.string().optional(),
  depth: z.string().optional(),
  index: z.number().optional(),
  query: z.string(),
  rationale: z.string().optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  sourceCount: z.number().optional(),
  timeRange: z.string().optional(),
  topic: z.string().optional(),
  total: z.number().optional(),
}).strict();

export type GeneratedSearchQuery = z.infer<typeof GeneratedSearchQuerySchema>;

/**
 * Pre-search query schema
 * Note: rationale, searchDepth, and total are required to match API contract
 */
export const PreSearchQuerySchema = z.object({
  index: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  total: z.number(),
}).strict();

export type PreSearchQuery = z.infer<typeof PreSearchQuerySchema>;

/**
 * Partial pre-search query schema (for streaming where fields may not be present yet)
 */
export const PartialPreSearchQuerySchema = z.object({
  complexity: z.string().optional(),
  index: z.number(),
  query: z.string(),
  rationale: z.string().optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  sourceCount: z.number().optional(),
  total: z.number().optional(),
}).strict();

export type PartialPreSearchQuery = z.infer<typeof PartialPreSearchQuerySchema>;

/**
 * Pre-search result schema
 * NOTE: answer and responseTime are required (non-optional) to match RPC inference from Hono API
 * During streaming, use null as default instead of undefined
 */
export const PreSearchResultSchema = z.object({
  answer: z.string().nullable(),
  index: z.number().optional(),
  query: z.string(),
  responseTime: z.number(),
  results: z.array(WebSearchResultItemSchema),
}).strict();

export type PreSearchResult = z.infer<typeof PreSearchResultSchema>;

/**
 * Pre-search data payload schema
 * NOTE: Fields match DbPreSearchDataSchema to ensure RPC type compatibility
 */
export const PreSearchDataPayloadSchema = z.object({
  failureCount: z.number().int().nonnegative(),
  queries: z.array(PreSearchQuerySchema),
  results: z.array(PreSearchResultSchema),
  successCount: z.number().int().nonnegative(),
  summary: z.string(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
}).strict();

export type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

/**
 * Partial pre-search data schema (for streaming updates)
 * Uses PartialPreSearchQuerySchema since streaming queries may not have all fields
 */
export const PartialPreSearchDataSchema = z.object({
  answer: z.string().nullable().optional(),
  index: z.number().optional(),
  queries: z.array(PartialPreSearchQuerySchema).optional(),
  results: z.array(PreSearchResultSchema).optional(),
  summary: z.string().optional(),
  totalResults: z.number().optional(),
  totalTime: z.number().optional(),
}).strict();

export type PartialPreSearchData = z.infer<typeof PartialPreSearchDataSchema>;

// ============================================================================
// PRE-SEARCH DATA SCHEMA (embedded in system messages)
// ============================================================================

const DbPreSearchResultItemSchema = z.object({
  content: z.string(),
  contentType: WebSearchContentTypeSchema.optional(),
  domain: z.string().optional(),
  fullContent: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
  publishedDate: z.string().nullable().optional(),
  score: z.number().min(0).max(1),
  title: z.string(),
  url: z.string().url(),
  wordCount: z.number().optional(),
}).strict();

const DbPreSearchResultSchema = z.object({
  answer: z.string().nullable(),
  query: z.string(),
  responseTime: z.number(),
  results: z.array(DbPreSearchResultItemSchema),
}).strict();

export const DbPreSearchDataSchema = z.object({
  failureCount: z.number().int().nonnegative(),
  queries: z.array(z.object({
    index: z.number().int().nonnegative(),
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
  }).strict()),
  results: z.array(DbPreSearchResultSchema),
  successCount: z.number().int().nonnegative(),
  summary: z.string(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
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
  createdAt: z.string().datetime().optional(),
  isPreSearch: z.literal(true),
  preSearch: DbPreSearchDataSchema,
  role: z.literal('system'),
  roundNumber: z.number().int().nonnegative(),
}).strict();

export type DbPreSearchMessageMetadata = z.infer<typeof DbPreSearchMessageMetadataSchema>;

// ============================================================================
// MODERATOR SCHEMAS
// ============================================================================

/**
 * Moderator payload schema
 */
export const ModeratorPayloadSchema = z.object({
  insights: z.array(z.string()).min(1),
  recommendations: z.array(z.string()).optional(),
  summary: z.string(),
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
  createdAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
  errorType: ErrorTypeSchema.optional(),
  finishReason: FinishReasonSchema.optional(),
  hasError: z.boolean().default(false),
  isModerator: z.literal(true),
  model: z.string().min(1),
  // participantIndex is used for ordering (MODERATOR_PARTICIPANT_INDEX = -99)
  participantIndex: z.number().int().optional(),
  role: z.literal(UIMessageRoles.ASSISTANT),
  roundNumber: z.number().int().nonnegative(),
  usage: UsageSchema.optional(),
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
  enabled: z.boolean().optional(),
  modelId: z.string().optional(),
  newMode: z.string().optional(),
  newRole: z.string().nullable().optional(),
  oldMode: z.string().optional(),
  oldRole: z.string().nullable().optional(),
  participants: z.array(DbChangelogParticipantSchema).optional(),
  role: z.string().nullable().optional(),
  type: z.string(),
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
  enableWebSearch: z.boolean(),
  mode: ChatModeSchema,
  participants: z.array(RecommendedParticipantSchema).min(1),
}).strict();

export type AnalyzePromptPayload = z.infer<typeof AnalyzePromptPayloadSchema>;
