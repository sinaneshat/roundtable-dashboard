/**
 * Chat Metadata Schemas - Single Source of Truth
 *
 * ✅ DRIZZLE-ZOD PATTERN: Database-first type-safe metadata definitions
 * ✅ SINGLE SOURCE OF TRUTH: All metadata shapes defined here, shared across layers
 * ✅ TYPE INFERENCE: Drizzle column definitions → Zod schemas → TypeScript types
 *
 * This file defines strict, discriminated union types for all metadata used in chat:
 * - Message metadata (user, assistant/participant, pre-search system messages)
 * - Thread metadata (tags, summary)
 * - Participant settings metadata (temperature, maxTokens, systemPrompt)
 * - Custom role metadata (tags, category)
 * - Changelog metadata (mode changes, participant changes, reordering)
 *
 * Usage Pattern:
 * 1. Database layer imports column definitions from here
 * 2. API layer imports Zod schemas for validation
 * 3. Frontend imports TypeScript types for type-safe access
 */

import {
  ChangelogChangeTypes,
  ChatModeSchema,
  CitationSourceTypeSchema,
  ErrorTypeSchema,
  FinishReasonSchema,
  MessageRoles,
  UIMessageRoles,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
} from '@roundtable/shared/enums';
import * as z from 'zod';

import { RoundNumberSchema } from '@/lib/schemas/round-schemas';

// ============================================================================
// SHARED SCHEMAS - Used across message and chat metadata
// ============================================================================
// NOTE: FinishReasonSchema, ErrorTypeSchema, and their types are now
// centralized in /src/api/core/enums.ts following the 5-part enum pattern

/**
 * Token usage schema - reusable across message metadata and API responses
 * Single source of truth for usage tracking structure
 *
 * Uses DB naming (promptTokens/completionTokens) for schema stability.
 * API layer (metadata-builder.ts) maps AI SDK naming (inputTokens/outputTokens)
 * to these field names before persistence.
 */
export const UsageSchema = z.object({
  completionTokens: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type Usage = z.infer<typeof UsageSchema>;

// ============================================================================
// AI SDK v6 MESSAGE PARTS SCHEMAS - Type-safe message content structure
// ============================================================================

/**
 * Text Part Schema
 * Standard text content in messages
 */
export const DbTextPartSchema = z.object({
  text: z.string(),
  type: z.literal('text'),
});

export type DbTextPart = z.infer<typeof DbTextPartSchema>;

/**
 * Reasoning Part Schema
 * Claude extended thinking / reasoning content
 */
export const DbReasoningPartSchema = z.object({
  text: z.string(),
  type: z.literal('reasoning'),
});

export type DbReasoningPart = z.infer<typeof DbReasoningPartSchema>;

/**
 * Tool Call Arguments Schema
 * Type-safe wrapper for tool call arguments (JSON object)
 */
export const DbToolCallArgsSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
]));

export type DbToolCallArgs = z.infer<typeof DbToolCallArgsSchema>;

/**
 * Tool Result Value Schema
 * Type-safe wrapper for tool execution results (JSON-serializable)
 */
export const DbToolResultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
]);

export type DbToolResultValue = z.infer<typeof DbToolResultValueSchema>;

/**
 * Tool Call Part Schema
 * Function invocation by AI model
 */
export const DbToolCallPartSchema = z.object({
  args: DbToolCallArgsSchema,
  toolCallId: z.string(),
  toolName: z.string(),
  type: z.literal('tool-call'),
});

export type DbToolCallPart = z.infer<typeof DbToolCallPartSchema>;

/**
 * Tool Result Part Schema
 * Execution result from tool call
 */
export const DbToolResultPartSchema = z.object({
  isError: z.boolean().optional(),
  result: DbToolResultValueSchema,
  toolCallId: z.string(),
  toolName: z.string(),
  type: z.literal('tool-result'),
});

export type DbToolResultPart = z.infer<typeof DbToolResultPartSchema>;

/**
 * File Part Schema
 * Multi-modal file attachments (images, PDFs)
 * Reference: AI SDK v6 FilePart
 */
export const DbFilePartSchema = z.object({
  filename: z.string().optional(),
  mediaType: z.string(),
  type: z.literal('file'),
  url: z.string(),
});

export type DbFilePart = z.infer<typeof DbFilePartSchema>;

/**
 * Step Start Part Schema
 * AI SDK v6 streaming lifecycle marker
 */
export const DbStepStartPartSchema = z.object({
  type: z.literal('step-start'),
});

export type DbStepStartPart = z.infer<typeof DbStepStartPartSchema>;

/**
 * Message Parts Schema - Union of all part types
 * AI SDK v6 aligned structure for chat message content
 */
export const DbMessagePartSchema = z.discriminatedUnion('type', [
  DbTextPartSchema,
  DbReasoningPartSchema,
  DbToolCallPartSchema,
  DbToolResultPartSchema,
  DbFilePartSchema,
  DbStepStartPartSchema,
]);

export type DbMessagePart = z.infer<typeof DbMessagePartSchema>;

/**
 * Message Parts Array Schema
 * Used by chatMessage.parts column
 */
export const DbMessagePartsSchema = z.array(DbMessagePartSchema);

export type DbMessageParts = z.infer<typeof DbMessagePartsSchema>;

// ============================================================================
// TOOL CALLS SCHEMA - For separate toolCalls column
// ============================================================================

/**
 * Tool Call Entry Schema
 * Stored in chatMessage.toolCalls column
 */
export const DbToolCallEntrySchema = z.object({
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
  id: z.string(),
  type: z.string(),
});

export type DbToolCallEntry = z.infer<typeof DbToolCallEntrySchema>;

/**
 * Tool Calls Array Schema
 * Used by chatMessage.toolCalls column
 */
export const DbToolCallsSchema = z.array(DbToolCallEntrySchema);

export type DbToolCalls = z.infer<typeof DbToolCallsSchema>;

// ============================================================================
// USER PRESET MODEL ROLES SCHEMA
// ============================================================================

/**
 * Model Role Entry Schema
 * Single model-role pair in user presets (role is optional)
 */
export const DbModelRoleEntrySchema = z.object({
  modelId: z.string(),
  role: z.string().nullish(),
});

export type DbModelRoleEntry = z.infer<typeof DbModelRoleEntrySchema>;

/**
 * Model Roles Array Schema
 * Used by chatUserPreset.modelRoles column
 */
export const DbModelRolesSchema = z.array(DbModelRoleEntrySchema);

export type DbModelRoles = z.infer<typeof DbModelRolesSchema>;

/**
 * Citation Schema - RAG source references in AI responses
 *
 * When AI references information from project context (memories, other threads,
 * files, search results, or moderator summaries), it includes inline citations that map
 * to specific source records.
 *
 * Citation Format: AI uses [source_id] markers in text (e.g., [mem_abc123])
 * Frontend: Converts to display numbers [1], [2] and renders hover cards
 */
export const DbCitationSchema = z.object({
  // Display number for frontend rendering [1], [2], etc.
  displayNumber: z.number().int().positive(),

  // Attachment-specific metadata (for file citations)
  downloadUrl: z.string().optional(),

  excerpt: z.string().optional(),

  filename: z.string().optional(),

  fileSize: z.number().int().nonnegative().optional(),
  // Citation identifier - matches the [source_id] marker in AI response text
  id: z.string().min(1),
  mimeType: z.string().optional(),

  roundNumber: z.number().int().nonnegative().optional(),
  // ID of the source record (projectMemory.id, chatThread.id, etc.)
  sourceId: z.string().min(1),
  // Source type from CITATION_SOURCE_TYPES enum
  sourceType: CitationSourceTypeSchema,

  // Thread-specific metadata
  threadId: z.string().optional(),
  threadTitle: z.string().optional(),
  // Contextual info for hover card (resolved from source)
  title: z.string().optional(),
  url: z.string().optional(),
});

export type DbCitation = z.infer<typeof DbCitationSchema>;

// ============================================================================
// MESSAGE METADATA - Discriminated Union by Role
// ============================================================================

/**
 * User Message Metadata Schema
 * Minimal requirements - only round tracking needed
 */
export const DbUserMessageMetadataSchema = z.object({
  createdAt: z.string().datetime().optional(),
  // Frontend-only flag for triggering participants (not persisted)
  isParticipantTrigger: z.boolean().optional(),
  role: z.literal(UIMessageRoles.USER),
  roundNumber: RoundNumberSchema, // ✅ 0-BASED
});

export type DbUserMessageMetadata = z.infer<typeof DbUserMessageMetadataSchema>;

/**
 * Assistant/Participant Message Metadata Schema
 * Complete tracking for AI model responses
 *
 * REQUIRED fields enforce strict data integrity:
 * - Round tracking (roundNumber)
 * - Participant identification (participantId, participantIndex, participantRole)
 * - Model tracking (model)
 * - Completion state (finishReason)
 * - Usage tracking (usage)
 * - Error state (hasError, isTransient, isPartialResponse)
 */
export const DbAssistantMessageMetadataSchema = z.object({
  aborted: z.boolean().optional(),

  // Available sources - files/context that were available to AI (shown even without inline citations)
  // This enables "Sources" UI to display what files the AI had access to
  availableSources: z.array(z.object({
    description: z.string().optional(), // Short description
    domain: z.string().optional(), // Domain for search results
    // Attachment-specific fields
    downloadUrl: z.string().optional(),
    excerpt: z.string().optional(), // Content excerpt/quote for citation display
    filename: z.string().optional(),
    fileSize: z.number().int().nonnegative().optional(),
    id: z.string(), // Citation ID (e.g., att_abc12345, sch_q0r0)
    mimeType: z.string().optional(),
    sourceType: CitationSourceTypeSchema,
    // Context fields
    threadTitle: z.string().optional(),
    title: z.string(), // Filename or source title
    // Search-specific fields
    url: z.string().optional(), // Source URL for search results
  })).optional(),

  // RAG citation references (when AI cites project context)
  citations: z.array(DbCitationSchema).optional(),
  // Timestamp
  createdAt: z.string().datetime().optional(),
  errorCategory: z.string().optional(),

  errorMessage: z.string().optional(),
  // Optional error details (only when hasError = true)
  errorType: ErrorTypeSchema.optional(),

  finishReason: FinishReasonSchema,

  // ✅ REQUIRED: Error state (with defaults)
  hasError: z.boolean().default(false),
  isEmptyResponse: z.boolean().optional(),
  isPartialResponse: z.boolean().default(false),

  isTransient: z.boolean().default(false),
  // ✅ REQUIRED: Model and completion tracking
  model: z.string().min(1),
  openRouterCode: z.union([z.string(), z.number()]).optional(),
  openRouterError: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ])).optional(),

  // ✅ REQUIRED: Participant identification
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),
  // Optional backend/debugging fields
  providerMessage: z.string().optional(),
  rawErrorMessage: z.string().optional(),
  // Reasoning duration tracking (for "Thought for X seconds" display on page refresh)
  reasoningDuration: z.number().int().nonnegative().optional(),
  responseBody: z.string().optional(),
  retryAttempts: z.number().int().nonnegative().optional(),

  role: z.literal(UIMessageRoles.ASSISTANT),

  // ✅ REQUIRED: Round tracking
  roundNumber: RoundNumberSchema, // ✅ 0-BASED

  statusCode: z.number().int().optional(),

  // ✅ REQUIRED: Usage tracking for cost/performance monitoring
  usage: UsageSchema,
});

export type DbAssistantMessageMetadata = z.infer<typeof DbAssistantMessageMetadataSchema>;

/**
 * Pre-Search Result Schemas
 * For web search results embedded in system messages
 */
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
});

const DbPreSearchResultSchema = z.object({
  answer: z.string().nullable(),
  query: z.string(),
  responseTime: z.number(),
  results: z.array(DbPreSearchResultItemSchema),
});

export const DbPreSearchDataSchema = z.object({
  failureCount: z.number().int().nonnegative(),
  queries: z.array(z.object({
    index: z.number().int().nonnegative(),
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
  })),
  results: z.array(DbPreSearchResultSchema),
  successCount: z.number().int().nonnegative(),
  summary: z.string(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
});

export type DbPreSearchData = z.infer<typeof DbPreSearchDataSchema>;

// ============================================================================
// PRE-SEARCH TABLE SCHEMA - For chatPreSearch.searchData column
// More comprehensive than DbPreSearchDataSchema (metadata message version)
// ============================================================================

/**
 * Image schema for Tavily search results
 */
const DbSearchImageSchema = z.object({
  alt: z.string().optional(),
  description: z.string().optional(),
  url: z.string(),
});

/**
 * Result metadata schema for enriched search results
 */
const DbSearchResultMetadataSchema = z.object({
  author: z.string().optional(),
  description: z.string().optional(),
  faviconUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  readingTime: z.number().optional(),
  wordCount: z.number().optional(),
});

/**
 * Individual search result item schema (Tavily-enhanced)
 */
const DbSearchResultItemSchema = z.object({
  content: z.string(),
  contentType: z.string().optional(),
  domain: z.string().optional(),
  excerpt: z.string().optional(),
  fullContent: z.string().optional(),
  images: z.array(DbSearchImageSchema).optional(),
  keyPoints: z.array(z.string()).optional(),
  metadata: DbSearchResultMetadataSchema.optional(),
  publishedDate: z.string().nullable(),
  rawContent: z.string().optional(),
  score: z.number(),
  title: z.string(),
  url: z.string(),
});

/**
 * Auto-detected search parameters schema
 */
const DbAutoParametersSchema = z.object({
  reasoning: z.string().optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  timeRange: z.string().optional(),
  topic: z.string().optional(),
});

/**
 * Query result schema with all results for a single query
 */
const DbQueryResultSchema = z.object({
  answer: z.string().nullable(),
  autoParameters: DbAutoParametersSchema.optional(),
  images: z.array(z.object({
    description: z.string().optional(),
    url: z.string(),
  })).optional(),
  query: z.string(),
  responseTime: z.number(),
  results: z.array(DbSearchResultItemSchema),
});

/**
 * Query entry schema for the queries array
 */
const DbQueryEntrySchema = z.object({
  index: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  total: z.number(),
});

/**
 * Complete pre-search table data schema
 * Used by chatPreSearch.searchData column
 */
export const DbPreSearchTableDataSchema = z.object({
  failureCount: z.number(),
  queries: z.array(DbQueryEntrySchema),
  results: z.array(DbQueryResultSchema),
  successCount: z.number(),
  summary: z.string(),
  totalResults: z.number(),
  totalTime: z.number(),
});

export type DbPreSearchTableData = z.infer<typeof DbPreSearchTableDataSchema>;

/**
 * Pre-Search/System Message Metadata Schema
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
  role: z.literal(UIMessageRoles.SYSTEM),
  roundNumber: RoundNumberSchema, // ✅ 0-BASED
});

export type DbPreSearchMessageMetadata = z.infer<typeof DbPreSearchMessageMetadataSchema>;

/**
 * Moderator Message Metadata Schema
 * System-generated round summaries that appear after all participants respond
 *
 * DISTINGUISHING CHARACTERISTICS:
 * - role: 'assistant' (same as participants for rendering consistency)
 * - isModerator: true (explicit discriminator)
 * - NO participantId (not from a specific participant)
 * - Streams text like participants (no structured JSON)
 */
export const DbModeratorMessageMetadataSchema = z.object({
  // Timestamp
  createdAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
  errorType: ErrorTypeSchema.optional(),
  // Completion tracking
  finishReason: FinishReasonSchema.optional(),

  // Error state
  hasError: z.boolean().default(false),
  isModerator: z.literal(true), // Discriminator from participant messages

  model: z.string().min(1), // AI model used for summary (e.g., gemini-2.5-flash)
  role: z.literal(UIMessageRoles.ASSISTANT),
  roundNumber: RoundNumberSchema, // ✅ 0-BASED

  usage: UsageSchema.optional(),
});

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
// THREAD METADATA
// ============================================================================

/**
 * Thread Metadata Schema
 * Custom properties for chat threads
 */
export const DbThreadMetadataSchema = z.object({
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).strict(); // ✅ STRICT: No additional properties allowed

export type DbThreadMetadata = z.infer<typeof DbThreadMetadataSchema>;

// ============================================================================
// PARTICIPANT SETTINGS METADATA
// ============================================================================

/**
 * Participant Settings Metadata Schema
 * Configuration for individual participants
 */
export const DbParticipantSettingsSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
}).strict(); // ✅ STRICT: No additional properties allowed

export type DbParticipantSettings = z.infer<typeof DbParticipantSettingsSchema>;

// ============================================================================
// CUSTOM ROLE METADATA
// ============================================================================

/**
 * Custom Role Metadata Schema
 * Tags and categorization for custom roles
 */
export const DbCustomRoleMetadataSchema = z.object({
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).strict(); // ✅ STRICT: No additional properties allowed

export type DbCustomRoleMetadata = z.infer<typeof DbCustomRoleMetadataSchema>;

// ============================================================================
// USER PRESET METADATA
// ============================================================================

/**
 * User Preset Metadata Schema
 * Additional metadata for user-defined chat presets
 */
export const DbUserPresetMetadataSchema = z.object({
  // Reserved for future extensions (e.g., tags, description, color)
}).strict(); // ✅ STRICT: No additional properties allowed

export type DbUserPresetMetadata = z.infer<typeof DbUserPresetMetadataSchema>;

// ============================================================================
// CHANGELOG METADATA - Discriminated Union by Type
// ============================================================================

/**
 * Participant Change Metadata
 * participantId is optional because ID may not exist yet when adding participants
 */
const DbParticipantChangeDataSchema = z.object({
  modelId: z.string(),
  participantId: z.string().optional(), // ✅ Optional for newly added participants
  role: z.string().nullable().optional(),
  type: z.literal(ChangelogChangeTypes.PARTICIPANT),
});

/**
 * Participant Role Change Metadata
 * For role reassignment events
 */
const DbParticipantRoleChangeDataSchema = z.object({
  modelId: z.string(), // ✅ Required for UI to display model info
  newRole: z.string().nullable().optional(),
  oldRole: z.string().nullable().optional(),
  participantId: z.string(),
  type: z.literal(ChangelogChangeTypes.PARTICIPANT_ROLE),
});

/**
 * Mode Change Metadata
 * For conversation mode changes
 */
const DbModeChangeDataSchema = z.object({
  newMode: ChatModeSchema,
  oldMode: ChatModeSchema,
  type: z.literal(ChangelogChangeTypes.MODE_CHANGE),
});

/**
 * Participant Reorder Metadata
 * For priority/order changes
 */
const DbParticipantReorderDataSchema = z.object({
  participants: z.array(z.object({
    id: z.string(),
    modelId: z.string(),
    priority: z.number().int().nonnegative(),
    role: z.string().nullable(),
  })),
  type: z.literal(ChangelogChangeTypes.PARTICIPANT_REORDER),
});

/**
 * Web Search Toggle Metadata
 * For enabling/disabling web search mid-conversation
 */
const DbWebSearchChangeDataSchema = z.object({
  enabled: z.boolean(),
  type: z.literal(ChangelogChangeTypes.WEB_SEARCH),
});

/**
 * Complete Changelog Data Schema - Discriminated Union
 *
 * ✅ TYPE-SAFE DISCRIMINATION: Use 'type' field to determine change type
 */
export const DbChangelogDataSchema = z.discriminatedUnion('type', [
  DbParticipantChangeDataSchema,
  DbParticipantRoleChangeDataSchema,
  DbModeChangeDataSchema,
  DbParticipantReorderDataSchema,
  DbWebSearchChangeDataSchema,
]);

export type DbChangelogData = z.infer<typeof DbChangelogDataSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: Check if message metadata is for user message
 */
export function isUserMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbUserMessageMetadata {
  return metadata.role === MessageRoles.USER;
}

/**
 * Type guard: Check if message metadata is for assistant message
 */
export function isAssistantMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbAssistantMessageMetadata {
  return metadata.role === MessageRoles.ASSISTANT;
}

/**
 * Type guard: Check if message metadata is for pre-search system message
 */
export function isPreSearchMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbPreSearchMessageMetadata {
  return metadata.role === UIMessageRoles.SYSTEM && 'isPreSearch' in metadata && metadata.isPreSearch === true;
}

/**
 * Type guard: Check if message metadata is for participant message
 * (assistant messages that are not pre-search and not moderator)
 */
export function isParticipantMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbAssistantMessageMetadata {
  return metadata.role === MessageRoles.ASSISTANT && 'participantId' in metadata && !('isModerator' in metadata);
}

/**
 * Type guard: Check if message metadata is for moderator message
 * (round summary after all participants respond)
 */
export function isModeratorMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbModeratorMessageMetadata {
  return metadata.role === MessageRoles.ASSISTANT && 'isModerator' in metadata && metadata.isModerator === true;
}

/**
 * Type guard: Check if changelog data is participant change
 */
export function isParticipantChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'participant' }> {
  return data.type === ChangelogChangeTypes.PARTICIPANT;
}

/**
 * Type guard: Check if changelog data is participant role change
 */
export function isParticipantRoleChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'participant_role' }> {
  return data.type === ChangelogChangeTypes.PARTICIPANT_ROLE;
}

/**
 * Type guard: Check if changelog data is mode change
 */
export function isModeChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'mode_change' }> {
  return data.type === ChangelogChangeTypes.MODE_CHANGE;
}

/**
 * Type guard: Check if changelog data is participant reorder
 */
export function isParticipantReorder(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'participant_reorder' }> {
  return data.type === ChangelogChangeTypes.PARTICIPANT_REORDER;
}

/**
 * Type guard: Check if changelog data is web search toggle change
 */
export function isWebSearchChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'web_search' }> {
  return data.type === ChangelogChangeTypes.WEB_SEARCH;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate and parse message metadata
 * Throws detailed error if invalid
 */
export function validateMessageMetadata(metadata: unknown): DbMessageMetadata {
  const result = DbMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid message metadata: ${JSON.stringify(result.error.format())}`);
  }
  return result.data;
}

/**
 * Validate and parse changelog data
 * Throws detailed error if invalid
 */
export function validateChangelogData(data: unknown): DbChangelogData {
  const result = DbChangelogDataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid changelog data: ${JSON.stringify(result.error.format())}`);
  }
  return result.data;
}

/**
 * Safely parse message metadata
 * Returns undefined if invalid (for optional validation)
 */
export function safeParseMessageMetadata(metadata: unknown): DbMessageMetadata | undefined {
  const result = DbMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : undefined;
}

/**
 * Safely parse changelog data
 * Returns undefined if invalid (for optional validation)
 */
export function safeParseChangelogData(data: unknown): DbChangelogData | undefined {
  const result = DbChangelogDataSchema.safeParse(data);
  return result.success ? result.data : undefined;
}
