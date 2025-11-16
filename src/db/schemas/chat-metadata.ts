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
  ErrorTypeSchema,
  FinishReasonSchema,
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
  analysis: z.string(),
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
 * Complete Message Metadata Schema - Discriminated Union
 *
 * ✅ TYPE-SAFE DISCRIMINATION: Use 'role' field to determine message type
 * ✅ EXHAUSTIVE: All possible metadata shapes defined
 * ✅ NO ESCAPE HATCHES: No [key: string]: unknown
 */
export const DbMessageMetadataSchema = z.discriminatedUnion('role', [
  DbUserMessageMetadataSchema,
  DbAssistantMessageMetadataSchema,
  DbPreSearchMessageMetadataSchema,
]);

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
  return metadata.role === 'user';
}

/**
 * Type guard: Check if message metadata is for assistant message
 */
export function isAssistantMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbAssistantMessageMetadata {
  return metadata.role === 'assistant';
}

/**
 * Type guard: Check if message metadata is for pre-search system message
 */
export function isPreSearchMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbPreSearchMessageMetadata {
  return metadata.role === 'system' && 'isPreSearch' in metadata && metadata.isPreSearch === true;
}

/**
 * Type guard: Check if message metadata is for participant message
 * (assistant messages that are not pre-search)
 */
export function isParticipantMessageMetadata(
  metadata: DbMessageMetadata,
): metadata is DbAssistantMessageMetadata {
  return metadata.role === 'assistant' && 'participantId' in metadata;
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
