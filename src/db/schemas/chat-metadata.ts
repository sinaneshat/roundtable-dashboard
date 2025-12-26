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

import { z } from 'zod';

import {
  ChatModeSchema,
  CitationSourceTypeSchema,
  ErrorTypeSchema,
  FinishReasonSchema,
  MessageRoles,
  UIMessageRoles,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
} from '@/api/core/enums';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';

// ============================================================================
// SHARED SCHEMAS - Used across message and chat metadata
// ============================================================================
// NOTE: FinishReasonSchema, ErrorTypeSchema, and their types are now
// centralized in /src/api/core/enums.ts following the 5-part enum pattern

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
  // Citation identifier - matches the [source_id] marker in AI response text
  id: z.string().min(1),

  // Source type from CITATION_SOURCE_TYPES enum
  sourceType: CitationSourceTypeSchema,

  // ID of the source record (projectMemory.id, chatThread.id, etc.)
  sourceId: z.string().min(1),

  // Display number for frontend rendering [1], [2], etc.
  displayNumber: z.number().int().positive(),

  // Contextual info for hover card (resolved from source)
  title: z.string().optional(),
  excerpt: z.string().optional(),
  url: z.string().url().optional(),

  // Thread-specific metadata
  threadId: z.string().optional(),
  threadTitle: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),

  // Attachment-specific metadata (for file citations)
  downloadUrl: z.string().url().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
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
  role: z.literal('user'),
  roundNumber: RoundNumberSchema, // ✅ 0-BASED
  createdAt: z.string().datetime().optional(),
  // Frontend-only flag for triggering participants (not persisted)
  isParticipantTrigger: z.boolean().optional(),
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
  role: z.literal('assistant'),

  // ✅ REQUIRED: Round tracking
  roundNumber: RoundNumberSchema, // ✅ 0-BASED

  // ✅ REQUIRED: Participant identification
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),

  // ✅ REQUIRED: Model and completion tracking
  model: z.string().min(1),
  finishReason: FinishReasonSchema,

  // ✅ REQUIRED: Usage tracking for cost/performance monitoring
  usage: UsageSchema,

  // ✅ REQUIRED: Error state (with defaults)
  hasError: z.boolean().default(false),
  isTransient: z.boolean().default(false),
  isPartialResponse: z.boolean().default(false),

  // Optional error details (only when hasError = true)
  errorType: ErrorTypeSchema.optional(),
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),

  // Optional backend/debugging fields
  providerMessage: z.string().optional(),
  openRouterError: z.record(z.string(), z.unknown()).optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  isEmptyResponse: z.boolean().optional(),
  statusCode: z.number().int().optional(),
  responseBody: z.string().optional(),
  aborted: z.boolean().optional(),

  // RAG citation references (when AI cites project context)
  citations: z.array(DbCitationSchema).optional(),

  // Reasoning duration tracking (for "Thought for X seconds" display on page refresh)
  reasoningDuration: z.number().int().nonnegative().optional(),

  // Available sources - files/context that were available to AI (shown even without inline citations)
  // This enables "Sources" UI to display what files the AI had access to
  availableSources: z.array(z.object({
    id: z.string(), // Citation ID (e.g., att_abc12345)
    sourceType: CitationSourceTypeSchema,
    title: z.string(), // Filename or source title
    downloadUrl: z.string().url().optional(),
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    fileSize: z.number().int().nonnegative().optional(),
  })).optional(),

  // Timestamp
  createdAt: z.string().datetime().optional(),
});

export type DbAssistantMessageMetadata = z.infer<typeof DbAssistantMessageMetadataSchema>;

/**
 * Pre-Search Result Schemas
 * For web search results embedded in system messages
 */
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
});

const DbPreSearchResultSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
  results: z.array(DbPreSearchResultItemSchema),
  responseTime: z.number(),
});

export const DbPreSearchDataSchema = z.object({
  queries: z.array(z.object({
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    index: z.number().int().nonnegative(),
  })),
  summary: z.string(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  totalTime: z.number(),
  results: z.array(DbPreSearchResultSchema),
});

export type DbPreSearchData = z.infer<typeof DbPreSearchDataSchema>;

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
  role: z.literal('system'),
  roundNumber: RoundNumberSchema, // ✅ 0-BASED
  isPreSearch: z.literal(true),
  preSearch: DbPreSearchDataSchema,
  createdAt: z.string().datetime().optional(),
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
  role: z.literal('assistant'),
  isModerator: z.literal(true), // Discriminator from participant messages
  roundNumber: RoundNumberSchema, // ✅ 0-BASED
  model: z.string().min(1), // AI model used for summary (e.g., gemini-2.0-flash)

  // Completion tracking
  finishReason: FinishReasonSchema.optional(),
  usage: UsageSchema.optional(),

  // Error state
  hasError: z.boolean().default(false),
  errorType: ErrorTypeSchema.optional(),
  errorMessage: z.string().optional(),

  // Timestamp
  createdAt: z.string().datetime().optional(),
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
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
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
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
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
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
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
 * For participant added/removed events
 *
 * participantId is optional because:
 * - When ADDING a participant, ID may not exist yet (being created)
 * - When REMOVING a participant, ID exists from database
 */
const DbParticipantChangeDataSchema = z.object({
  type: z.literal('participant'),
  participantId: z.string().optional(), // ✅ Optional for newly added participants
  modelId: z.string(),
  role: z.string().nullable().optional(),
});

/**
 * Participant Role Change Metadata
 * For role reassignment events
 */
const DbParticipantRoleChangeDataSchema = z.object({
  type: z.literal('participant_role'),
  participantId: z.string(),
  modelId: z.string(), // ✅ Required for UI to display model info
  oldRole: z.string().nullable().optional(),
  newRole: z.string().nullable().optional(),
});

/**
 * Mode Change Metadata
 * For conversation mode changes
 */
const DbModeChangeDataSchema = z.object({
  type: z.literal('mode_change'),
  oldMode: ChatModeSchema,
  newMode: ChatModeSchema,
});

/**
 * Participant Reorder Metadata
 * For priority/order changes
 */
const DbParticipantReorderDataSchema = z.object({
  type: z.literal('participant_reorder'),
  participants: z.array(z.object({
    id: z.string(),
    modelId: z.string(),
    role: z.string().nullable(),
    priority: z.number().int().nonnegative(),
  })),
});

/**
 * Web Search Toggle Metadata
 * For enabling/disabling web search mid-conversation
 */
const DbWebSearchChangeDataSchema = z.object({
  type: z.literal('web_search'),
  enabled: z.boolean(),
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
  return data.type === 'participant';
}

/**
 * Type guard: Check if changelog data is participant role change
 */
export function isParticipantRoleChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'participant_role' }> {
  return data.type === 'participant_role';
}

/**
 * Type guard: Check if changelog data is mode change
 */
export function isModeChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'mode_change' }> {
  return data.type === 'mode_change';
}

/**
 * Type guard: Check if changelog data is participant reorder
 */
export function isParticipantReorder(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'participant_reorder' }> {
  return data.type === 'participant_reorder';
}

/**
 * Type guard: Check if changelog data is web search toggle change
 */
export function isWebSearchChange(
  data: DbChangelogData,
): data is Extract<DbChangelogData, { type: 'web_search' }> {
  return data.type === 'web_search';
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
