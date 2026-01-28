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

import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation/chat';
import { log } from '@/lib/logger';
import type { StoredPreSearch } from '@/routes/chat/schema';
import { StoredPreSearchSchema } from '@/routes/chat/schema';

// ============================================================================
// RAW API RESPONSE TYPES (String Dates)
// ============================================================================

/**
 * Raw ChatThread from API (dates as strings)
 * Used for type-safe transformation from API response to ChatThread
 */
export type RawChatThread = Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
  createdAt: string | Date;
  lastMessageAt: string | Date | null;
  updatedAt: string | Date;
};

/**
 * Raw ChatParticipant from API (dates as strings)
 */
export type RawChatParticipant = Omit<ChatParticipant, 'createdAt' | 'updatedAt'> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

/**
 * Raw ChatMessage from API (dates as strings)
 */
export type RawChatMessage = Omit<ChatMessage, 'createdAt'> & {
  createdAt: string | Date;
};

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
  thread: RawChatThread,
): ChatThread {
  return {
    ...thread,
    createdAt: ensureDate(thread.createdAt),
    lastMessageAt: ensureDateOrNull(thread.lastMessageAt),
    updatedAt: ensureDate(thread.updatedAt),
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
  participant: RawChatParticipant,
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
 * const messages = apiResponse.data.items.map(transformChatMessage);
 * ```
 */
export function transformChatMessage(
  message: RawChatMessage,
): ChatMessage {
  return {
    ...message,
    createdAt: ensureDate(message.createdAt),
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
  threads: RawChatThread[],
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
  participants: RawChatParticipant[],
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
 * const messages = transformChatMessages(apiResponse.data.items);
 * ```
 */
export function transformChatMessages(
  messages: RawChatMessage[],
): ChatMessage[] {
  return messages.map(transformChatMessage);
}

/**
 * Transform a single pre-search from API format to application format
 * Converts string dates to Date objects for type safety
 *
 * @param preSearch - Raw pre-search from API (validated against StoredPreSearchSchema)
 * @returns Pre-search with Date objects, or null if validation fails
 */
export function transformPreSearch(
  preSearch: unknown,
): StoredPreSearch | null {
  const result = StoredPreSearchSchema.safeParse(preSearch);

  if (!result.success) {
    log.warn('Failed to validate pre-search schema', { error: result.error.message });
    return null;
  }

  return {
    ...result.data,
    completedAt: result.data.completedAt ? ensureDate(result.data.completedAt) : null,
    createdAt: ensureDate(result.data.createdAt),
  };
}

/**
 * Transform array of pre-searches
 *
 * **Zod-validated transformation** - No type assertions needed.
 * ✅ FOLLOWS: transformModerators pattern exactly
 *
 * @param preSearches - Array of raw pre-searches from API (validated against schema)
 * @returns Array of pre-searches with Date objects (filters out validation failures)
 *
 * @example
 * ```typescript
 * const preSearches = transformPreSearches(apiResponse.data.items);
 * ```
 */
export function transformPreSearches(
  preSearches: unknown[],
): StoredPreSearch[] {
  return preSearches
    .map(transformPreSearch)
    .filter((item): item is StoredPreSearch => item !== null);
}

// ============================================================================
// BUNDLE TRANSFORMATIONS - CONVENIENCE UTILITIES
// ============================================================================

/**
 * Thread data bundle type for batch transformation
 * Represents a complete thread response with related entities
 */
export type ThreadDataBundle = {
  messages?: RawChatMessage[];
  participants?: RawChatParticipant[];
  thread?: RawChatThread;
};

/**
 * Transformed thread data bundle with Date objects
 */
export type TransformedThreadDataBundle = {
  thread?: ChatThread;
  participants?: ChatParticipant[];
  messages?: ChatMessage[];
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
 * const messages = transformChatMessages(apiResponse.data.items);
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
  // Build result with only defined properties (satisfies exactOptionalPropertyTypes)
  const result: TransformedThreadDataBundle = {};
  if (bundle.messages) {
    result.messages = transformChatMessages(bundle.messages);
  }
  if (bundle.participants) {
    result.participants = transformChatParticipants(bundle.participants);
  }
  if (bundle.thread) {
    result.thread = transformChatThread(bundle.thread);
  }
  return result;
}
