/**
 * Date Transformation Utilities - Single Source of Truth
 *
 * Centralized date conversion utilities for transforming API responses.
 * Prevents duplicated date transformation logic across stores and hooks.
 *
 * **SINGLE SOURCE OF TRUTH**: All date transformations must use these utilities.
 * Do NOT duplicate date conversion logic inline.
 *
 * @module lib/utils/date-transforms
 */

import { z } from 'zod';

import type { ChatMessage, ChatParticipant, ChatThread, StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
import { StoredPreSearchSchema } from '@/api/routes/chat/schema';

// ============================================================================
// ZOD SCHEMAS FOR API RESPONSES - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Schema for raw API response with string dates (before transformation)
 * Used for validating and inferring types from API responses
 */
const RawStoredModeratorAnalysisSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  mode: z.string(),
  userQuestion: z.string(),
  status: z.string(),
  participantMessageIds: z.array(z.string()),
  errorMessage: z.string().nullable(),
  analysisData: z.unknown().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  completedAt: z.union([z.string(), z.date()]).nullable(),
}).passthrough(); // Allow additional fields from API

/** Inferred type for raw API response */
export type RawStoredModeratorAnalysis = z.infer<typeof RawStoredModeratorAnalysisSchema>;

// ============================================================================
// CORE DATE UTILITIES
// ============================================================================

/**
 * Ensure value is a Date object (convert string if needed)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this for all string → Date conversions.
 *
 * @param value - String or Date value
 * @returns Date object
 *
 * @example
 * ```typescript
 * const date = ensureDate(apiResponse.createdAt); // string | Date → Date
 * ```
 */
export function ensureDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/**
 * Ensure nullable value is a Date object or null
 *
 * @param value - String, Date, or null value
 * @returns Date object or null
 *
 * @example
 * ```typescript
 * const date = ensureDateOrNull(apiResponse.lastMessageAt); // string | Date | null → Date | null
 * ```
 */
export function ensureDateOrNull(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return ensureDate(value);
}

// ============================================================================
// ENTITY-SPECIFIC TRANSFORMATIONS
// ============================================================================

/**
 * Transform ChatThread API response with date fields
 *
 * **SINGLE SOURCE OF TRUTH**: Use for all thread data transformations.
 *
 * Converts string dates to Date objects:
 * - createdAt: always present
 * - updatedAt: always present
 * - lastMessageAt: nullable
 *
 * @param thread - Raw thread from API (may have string dates)
 * @returns Thread with Date objects
 *
 * @example
 * ```typescript
 * // In store actions or hooks
 * const thread = transformChatThread(apiResponse.data.thread);
 * ```
 */
export function transformChatThread(
  thread: Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
    createdAt: string | Date;
    updatedAt: string | Date;
    lastMessageAt: string | Date | null;
  },
): ChatThread {
  return {
    ...thread,
    createdAt: ensureDate(thread.createdAt),
    updatedAt: ensureDate(thread.updatedAt),
    lastMessageAt: ensureDateOrNull(thread.lastMessageAt),
  };
}

/**
 * Transform ChatParticipant API response with date fields
 *
 * **SINGLE SOURCE OF TRUTH**: Use for all participant data transformations.
 *
 * Converts string dates to Date objects:
 * - createdAt: always present
 * - updatedAt: always present
 *
 * @param participant - Raw participant from API (may have string dates)
 * @returns Participant with Date objects
 *
 * @example
 * ```typescript
 * const participants = apiResponse.data.participants.map(transformChatParticipant);
 * ```
 */
export function transformChatParticipant(
  participant: Omit<ChatParticipant, 'createdAt' | 'updatedAt'> & {
    createdAt: string | Date;
    updatedAt: string | Date;
  },
): ChatParticipant {
  return {
    ...participant,
    createdAt: ensureDate(participant.createdAt),
    updatedAt: ensureDate(participant.updatedAt),
  };
}

/**
 * Transform ChatMessage API response with date fields
 *
 * **SINGLE SOURCE OF TRUTH**: Use for all message data transformations.
 *
 * Converts string dates to Date objects:
 * - createdAt: always present
 *
 * @param message - Raw message from API (may have string dates)
 * @returns Message with Date objects
 *
 * @example
 * ```typescript
 * const messages = apiResponse.data.messages.map(transformChatMessage);
 * ```
 */
export function transformChatMessage(
  message: Omit<ChatMessage, 'createdAt'> & {
    createdAt: string | Date;
  },
): ChatMessage {
  return {
    ...message,
    createdAt: ensureDate(message.createdAt),
  };
}

/**
 * Transform StoredModeratorAnalysis API response with date fields
 *
 * **SINGLE SOURCE OF TRUTH**: Use for all analysis data transformations.
 * Uses Zod schema validation for type safety.
 *
 * Converts string dates to Date objects:
 * - createdAt: always present
 * - completedAt: nullable
 *
 * @param analysis - Raw analysis from API (validated against schema)
 * @returns Analysis with Date objects
 *
 * @example
 * ```typescript
 * const analyses = apiResponse.data.items.map(transformModeratorAnalysis);
 * ```
 */
export function transformModeratorAnalysis(
  analysis: unknown,
): StoredModeratorAnalysis {
  // Validate input against schema
  const validated = RawStoredModeratorAnalysisSchema.parse(analysis);

  return {
    ...validated,
    createdAt: ensureDate(validated.createdAt),
    completedAt: ensureDateOrNull(validated.completedAt),
  } as StoredModeratorAnalysis;
}

// ============================================================================
// BATCH TRANSFORMATIONS
// ============================================================================

/**
 * Transform array of chat threads
 *
 * @param threads - Array of raw threads from API
 * @returns Array of threads with Date objects
 *
 * @example
 * ```typescript
 * const threads = transformChatThreads(apiResponse.data.items);
 * ```
 */
export function transformChatThreads(
  threads: Array<Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
    createdAt: string | Date;
    updatedAt: string | Date;
    lastMessageAt: string | Date | null;
  }>,
): ChatThread[] {
  return threads.map(transformChatThread);
}

/**
 * Transform array of chat participants
 *
 * @param participants - Array of raw participants from API
 * @returns Array of participants with Date objects
 *
 * @example
 * ```typescript
 * const participants = transformChatParticipants(apiResponse.data.participants);
 * ```
 */
export function transformChatParticipants(
  participants: Array<Omit<ChatParticipant, 'createdAt' | 'updatedAt'> & {
    createdAt: string | Date;
    updatedAt: string | Date;
  }>,
): ChatParticipant[] {
  return participants.map(transformChatParticipant);
}

/**
 * Transform array of chat messages
 *
 * @param messages - Array of raw messages from API
 * @returns Array of messages with Date objects
 *
 * @example
 * ```typescript
 * const messages = transformChatMessages(apiResponse.data.messages);
 * ```
 */
export function transformChatMessages(
  messages: Array<Omit<ChatMessage, 'createdAt'> & {
    createdAt: string | Date;
  }>,
): ChatMessage[] {
  return messages.map(transformChatMessage);
}

/**
 * Transform array of moderator analyses
 *
 * **Zod-validated transformation** - No type assertions needed.
 *
 * @param analyses - Array of raw analyses from API (validated against schema)
 * @returns Array of analyses with Date objects
 *
 * @example
 * ```typescript
 * const analyses = transformModeratorAnalyses(apiResponse.data.items);
 * ```
 */
export function transformModeratorAnalyses(
  analyses: unknown[],
): StoredModeratorAnalysis[] {
  return analyses.map(transformModeratorAnalysis);
}

/**
 * Transform a single pre-search from API format to application format
 * Converts string dates to Date objects for type safety
 *
 * @param preSearch - Raw pre-search from API (validated against StoredPreSearchSchema)
 * @returns Pre-search with Date objects
 */
export function transformPreSearch(
  preSearch: unknown,
): StoredPreSearch {
  const validated = StoredPreSearchSchema.parse(preSearch);

  return {
    ...validated,
    createdAt: ensureDate(validated.createdAt),
    completedAt: validated.completedAt ? ensureDate(validated.completedAt) : null,
  };
}

/**
 * Transform array of pre-searches
 *
 * **Zod-validated transformation** - No type assertions needed.
 * ✅ FOLLOWS: transformModeratorAnalyses pattern exactly
 *
 * @param preSearches - Array of raw pre-searches from API (validated against schema)
 * @returns Array of pre-searches with Date objects
 *
 * @example
 * ```typescript
 * const preSearches = transformPreSearches(apiResponse.data.items);
 * ```
 */
export function transformPreSearches(
  preSearches: unknown[],
): StoredPreSearch[] {
  return preSearches.map(transformPreSearch);
}

// ============================================================================
// BUNDLE TRANSFORMATIONS - CONVENIENCE UTILITIES
// ============================================================================

/**
 * Thread data bundle type for batch transformation
 * Represents a complete thread response with related entities
 */
export type ThreadDataBundle = {
  thread?: Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
    createdAt: string | Date;
    updatedAt: string | Date;
    lastMessageAt: string | Date | null;
  };
  participants?: Array<Omit<ChatParticipant, 'createdAt' | 'updatedAt'> & {
    createdAt: string | Date;
    updatedAt: string | Date;
  }>;
  messages?: Array<Omit<ChatMessage, 'createdAt'> & {
    createdAt: string | Date;
  }>;
  analyses?: unknown[];
};

/**
 * Transformed thread data bundle with Date objects
 */
export type TransformedThreadDataBundle = {
  thread?: ChatThread;
  participants?: ChatParticipant[];
  messages?: ChatMessage[];
  analyses?: StoredModeratorAnalysis[];
};

/**
 * Transform complete thread data bundle in one call
 * Reduces boilerplate when transforming multiple related entities
 *
 * **SINGLE SOURCE OF TRUTH**: Use for all bulk API response transformations.
 *
 * @param bundle - Thread data bundle with string dates
 * @returns Transformed bundle with Date objects
 *
 * @example
 * ```typescript
 * // Instead of:
 * const thread = transformChatThread(apiResponse.data.thread);
 * const participants = transformChatParticipants(apiResponse.data.participants);
 * const messages = transformChatMessages(apiResponse.data.messages);
 *
 * // Use:
 * const { thread, participants, messages } = transformThreadBundle(apiResponse.data);
 * ```
 *
 * @example
 * ```typescript
 * // Partial transformations work too
 * const { thread, participants } = transformThreadBundle({
 *   thread: apiResponse.data.thread,
 *   participants: apiResponse.data.participants,
 * });
 * ```
 */
export function transformThreadBundle(
  bundle: ThreadDataBundle,
): TransformedThreadDataBundle {
  return {
    thread: bundle.thread ? transformChatThread(bundle.thread) : undefined,
    participants: bundle.participants ? transformChatParticipants(bundle.participants) : undefined,
    messages: bundle.messages ? transformChatMessages(bundle.messages) : undefined,
    analyses: bundle.analyses ? transformModeratorAnalyses(bundle.analyses) : undefined,
  };
}
