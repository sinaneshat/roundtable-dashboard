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

import type { z } from 'zod';

import type { ChatMessage, ChatParticipant, ChatThread, StoredPreSearch, StoredRoundSummary } from '@/api/routes/chat/schema';
import { StoredPreSearchSchema, StoredRoundSummarySchema } from '@/api/routes/chat/schema';

// ============================================================================
// TYPE INFERENCE FROM SINGLE SOURCE OF TRUTH
// ============================================================================

/** Inferred type for raw API response - uses schema from @/api/routes/chat/schema */
export type RawStoredRoundSummary = z.infer<typeof StoredRoundSummarySchema>;

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

/**
 * Convert Date or string to ISO string (for cache serialization)
 *
 * **SINGLE SOURCE OF TRUTH**: Use for Date → string when serializing for cache/API.
 *
 * @param value - Date or string value
 * @returns ISO string
 *
 * @example
 * ```typescript
 * const isoString = toISOString(item.createdAt); // Date | string → string
 * ```
 */
export function toISOString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Convert nullable Date or string to ISO string or null
 *
 * @param value - Date, string, or null value
 * @returns ISO string or null
 *
 * @example
 * ```typescript
 * const isoString = toISOStringOrNull(item.lastMessageAt); // Date | string | null → string | null
 * ```
 */
export function toISOStringOrNull(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toISOString(value);
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
 * Transform StoredRoundSummary API response with date fields
 *
 * **SINGLE SOURCE OF TRUTH**: Use for all round summary data transformations.
 * Uses Zod schema validation for type safety.
 *
 * Converts string dates to Date objects:
 * - createdAt: always present
 * - completedAt: nullable
 *
 * @param summary - Raw summary from API (validated against schema)
 * @returns Summary with Date objects
 *
 * @example
 * ```typescript
 * const summaries = apiResponse.data.items.map(transformRoundSummary);
 * ```
 */
export function transformRoundSummary(
  summary: unknown,
): StoredRoundSummary {
  // Validate input against schema
  const validated = StoredRoundSummarySchema.parse(summary);

  // ✅ TYPE-SAFE: Return properly typed object
  // Schema validation ensures this matches StoredRoundSummary
  return {
    ...validated,
    createdAt: ensureDate(validated.createdAt),
    completedAt: ensureDateOrNull(validated.completedAt),
  };
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
 * Transform array of round summaries
 *
 * **Zod-validated transformation** - No type assertions needed.
 *
 * @param summaries - Array of raw summaries from API (validated against schema)
 * @returns Array of summaries with Date objects
 *
 * @example
 * ```typescript
 * const summaries = transformRoundSummaries(apiResponse.data.items);
 * ```
 */
export function transformRoundSummaries(
  summaries: unknown[],
): StoredRoundSummary[] {
  return summaries.map(transformRoundSummary);
}

/**
 * @deprecated Use transformRoundSummaries instead
 */
export const transformModeratorAnalyses = transformRoundSummaries;

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
  summaries?: unknown[];
};

/**
 * Transformed thread data bundle with Date objects
 */
export type TransformedThreadDataBundle = {
  thread?: ChatThread;
  participants?: ChatParticipant[];
  messages?: ChatMessage[];
  summaries?: StoredRoundSummary[];
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
    summaries: bundle.summaries ? transformRoundSummaries(bundle.summaries) : undefined,
  };
}
