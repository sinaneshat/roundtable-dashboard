/**
 * Shared Types for Chat Store Actions
 *
 * **SINGLE SOURCE OF TRUTH**: Consolidates type definitions used across
 * multiple action files to prevent inline type definitions and duplication.
 *
 * Following backend-patterns.md: Zod-based schema validation and type safety.
 *
 * @module stores/chat/actions/types
 */

import { z } from 'zod';

import { UsageStatusSchema } from '@/api/core/enums';
import {
  ChatThreadCacheSchema,
  createCacheResponseSchema,
} from '@/api/routes/chat/schema';
import { chatThreadChangelogSelectSchema } from '@/db/validation/chat';

// ============================================================================
// API RESPONSE SCHEMAS - Uses Backend Single Source of Truth
// ============================================================================

/**
 * Standard API response wrapper schema
 */
export const ApiResponseSchema = createCacheResponseSchema(z.unknown());

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

// ============================================================================
// USAGE STATS CACHE SCHEMAS
// ============================================================================

/**
 * Credits schema for cache validation
 * ✅ BACKEND-ALIGNED: Matches UsageStatsPayloadSchema.credits
 */
const UsageCreditsSchema = z.object({
  balance: z.number(),
  available: z.number(),
  status: UsageStatusSchema.optional(),
});

/**
 * Plan schema for cache validation
 * ✅ BACKEND-ALIGNED: Matches UsageStatsPayloadSchema.plan
 */
const UsagePlanSchema = z.object({
  type: z.string(),
  name: z.string(),
  monthlyCredits: z.number(),
  hasPaymentMethod: z.boolean(),
  nextRefillAt: z.string().datetime().nullable(),
});

/**
 * Usage stats data structure schema
 * Validates optimistic cache updates for credit balance
 *
 * SINGLE SOURCE OF TRUTH for usage stats cache validation in mutations
 * ✅ BACKEND-ALIGNED: Matches UsageStatsPayloadSchema (credits + plan)
 */
export const UsageStatsDataSchema = z.object({
  credits: UsageCreditsSchema,
  plan: UsagePlanSchema,
});

export type UsageStatsData = z.infer<typeof UsageStatsDataSchema>;

/**
 * Helper function to safely parse usage stats cache data
 *
 * **USE THIS INSTEAD OF**: Manual parsing in each mutation
 *
 * @param data - Raw cache data from React Query
 * @returns Validated usage stats data or null if invalid
 */
export function validateUsageStatsCache(data: unknown): UsageStatsData | null {
  // Handle uninitialized queries silently
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid API response structure for usage stats:', response.error);
    }
    return null;
  }

  const usageData = UsageStatsDataSchema.safeParse(response.data.data);
  if (!usageData.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid usage stats data structure:', usageData.error);
    }
    return null;
  }

  return usageData.data;
}

// ============================================================================
// THREAD CACHE VALIDATION HELPERS
// ============================================================================

/**
 * User schema for cache validation (minimal fields needed)
 * ✅ BACKEND-ALIGNED: Uses userSelectSchema.pick() pattern from ThreadDetailPayloadSchema
 * ✅ FIX: Made optional for cache operations where user may not be present
 */
const UserCacheSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

/**
 * ✅ CACHE-SPECIFIC: Thread schema that accepts ISO strings OR Date objects for dates
 * Used for optimistic updates where toISOString() converts dates to strings
 */
const ChatThreadCacheCompatSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  projectId: z.string().nullable().optional(),
  title: z.string(),
  slug: z.string(),
  previousSlug: z.string().nullable().optional(),
  mode: z.string(),
  status: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isAiGeneratedTitle: z.boolean().optional(),
  enableWebSearch: z.boolean().optional(),
  metadata: z.unknown().nullable().optional(),
  version: z.number().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
  lastMessageAt: z.union([z.date(), z.string()]).nullable().optional(),
});

/**
 * ✅ CACHE-SPECIFIC: Participant schema that accepts ISO strings OR Date objects
 */
const ChatParticipantCacheCompatSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  modelId: z.string(),
  customRoleId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  priority: z.number().optional(),
  isEnabled: z.boolean().optional(),
  settings: z.unknown().nullable().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

/**
 * ✅ CACHE-SPECIFIC: Message schema for UI messages (from AI SDK)
 * UI messages have different structure than DB messages
 */
const UIMessageCacheCompatSchema = z.object({
  id: z.string(),
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
  metadata: z.unknown().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});

/**
 * Thread detail payload schema for cache operations
 * Validates thread detail payload structure
 *
 * ✅ TYPE-SAFE: Uses cache-compatible schemas that accept Date OR string
 * ✅ FIX: Handles optimistic updates where toISOString() converts dates to strings
 */
export const ThreadDetailPayloadCacheSchema = z.object({
  thread: ChatThreadCacheCompatSchema,
  participants: z.array(ChatParticipantCacheCompatSchema).optional(),
  messages: z.array(UIMessageCacheCompatSchema).optional(),
  changelog: z.array(chatThreadChangelogSelectSchema).optional(),
  user: UserCacheSchema.optional(),
});

export type ThreadDetailPayloadCache = z.infer<typeof ThreadDetailPayloadCacheSchema>;

/**
 * Helper function to safely parse thread detail data from cache
 *
 * @param data - Raw cache data from React Query
 * @returns Validated cache data or null if invalid
 */
export function validateThreadDetailPayloadCache(data: unknown): ThreadDetailPayloadCache | null {
  // Handle uninitialized queries silently
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid API response structure for thread detail:', response.error);
    }
    return null;
  }

  const threadData = ThreadDetailPayloadCacheSchema.safeParse(response.data.data);
  if (!threadData.success) {
    if (process.env.NODE_ENV === 'development') {
      // 🔍 DEBUG LOG 2: Thread detail validation failure - check message structure
      // ✅ DEBUG-ONLY TYPE RELAXATION: Use lenient record schema for inspection
      // JUSTIFICATION: Debug logging should not fail due to type safety.
      // This code only runs in development and doesn't affect production behavior.
      // The lenient schema allows us to inspect malformed data for debugging.
      const debugData = z.record(z.string(), z.unknown()).safeParse(response.data.data);
      const rawData = debugData.success ? debugData.data : {};
      const messages = Array.isArray(rawData.messages) ? rawData.messages : [];
      const participants = Array.isArray(rawData.participants) ? rawData.participants : [];

      console.error('[DEBUG-2] validateThreadDetailPayloadCache failed:', {
        messageCount: messages.length,
        firstMessageKeys: messages[0] ? Object.keys(messages[0] as object) : [],
        participantCount: participants.length,
        firstParticipantId: (participants[0] as { id?: string } | undefined)?.id,
        errorIssues: threadData.error.issues.slice(0, 5),
      });
    }
    return null;
  }

  return threadData.data;
}

/**
 * Paginated page schema for infinite query cache
 * Validates infinite query page structure
 */
export const PaginatedPageCacheSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      items: z.array(ChatThreadCacheSchema).optional(),
    })
    .optional(),
});

export type PaginatedPageCache = z.infer<typeof PaginatedPageCacheSchema>;

/**
 * Infinite query data schema
 * Validates the complete infinite query structure
 *
 * ✅ TYPE-SAFE: pageParams are cursor strings (or null/undefined for first page)
 * ✅ FIX: TanStack Query uses undefined for initial page cursor, not null
 */
export const InfiniteQueryCacheSchema = z.object({
  pages: z.array(PaginatedPageCacheSchema),
  pageParams: z.array(z.string().nullable().optional()).optional(),
});

export type InfiniteQueryCache = z.infer<typeof InfiniteQueryCacheSchema>;

/**
 * Helper function to safely parse infinite query data from cache
 *
 * @param data - Raw cache data from React Query
 * @returns Validated infinite query data or null if invalid
 */
export function validateInfiniteQueryCache(data: unknown): InfiniteQueryCache | null {
  // Handle uninitialized queries silently
  if (data === undefined || data === null) {
    return null;
  }

  const queryData = InfiniteQueryCacheSchema.safeParse(data);
  if (!queryData.success) {
    if (process.env.NODE_ENV === 'development') {
      // 🔍 DEBUG LOG 1: Infinite query validation failure
      // ✅ DEBUG-ONLY TYPE RELAXATION: Use lenient record schema for inspection
      // JUSTIFICATION: Debug logging should not fail due to type safety.
      // This code only runs in development and doesn't affect production behavior.
      // The lenient schema allows us to inspect malformed data for debugging.
      const debugData = z.record(z.string(), z.unknown()).safeParse(data);
      const rawData = debugData.success ? debugData.data : {};

      console.error('[DEBUG-1] validateInfiniteQueryCache failed:', {
        pageParams: rawData.pageParams,
        pagesCount: Array.isArray(rawData.pages) ? rawData.pages.length : 0,
        error: queryData.error.issues.slice(0, 3),
      });
    }
    return null;
  }

  return queryData.data;
}

/**
 * Schema for thread detail cache data structure with participants
 *
 * **SINGLE SOURCE OF TRUTH**: Validates React Query cache for thread details.
 * Replaces unsafe type assertions in chat-mutations.ts (lines 731, 788, 852, 925)
 *
 * Used when reading/writing thread detail cache in React Query.
 * ✅ FIX: Uses cache-compatible schema that accepts Date OR string for dates
 */
export const ThreadDetailCacheDataSchema = z.object({
  participants: z.array(ChatParticipantCacheCompatSchema),
});

/**
 * Type for thread detail cache data (inferred from schema)
 */
export type ThreadDetailCacheData = z.infer<typeof ThreadDetailCacheDataSchema>;

/**
 * Helper function to safely cast thread detail cache data with validation
 *
 * **USE THIS INSTEAD OF**: `old.data as { participants: Array<Record<string, unknown>> }`
 *
 * @param data - Raw cache data from React Query
 * @returns Validated cache data or undefined if invalid
 */
export function validateThreadDetailCache(data: unknown): ThreadDetailCacheData | undefined {
  const result = ThreadDetailCacheDataSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Schema for full thread detail API response cache
 *
 * **SINGLE SOURCE OF TRUTH**: Validates complete API response for thread details.
 * Replaces unsafe type assertions like `old.data as { participants: Array<Record<string, unknown>> }`
 *
 * Used when reading/writing thread detail cache in React Query setQueryData callbacks.
 * ✅ FIX: Uses cache-compatible schema that accepts Date OR string for dates
 */
export const ThreadDetailResponseCacheSchema = z.object({
  success: z.boolean(),
  data: ThreadDetailPayloadCacheSchema, // Use full thread detail schema
});

/**
 * Type for full thread detail response cache (inferred from schema)
 */
export type ThreadDetailResponseCache = z.infer<typeof ThreadDetailResponseCacheSchema>;

/**
 * Helper function to safely validate full thread detail response cache
 *
 * **USE THIS INSTEAD OF**: Manual type guards + `old.data as { participants: Array<Record<string, unknown>> }`
 *
 * @param data - Raw cache data from React Query
 * @returns Validated response cache or undefined if invalid
 *
 * @example
 * ```typescript
 * queryClient.setQueryData(queryKey, (old: unknown) => {
 *   const cache = validateThreadDetailResponseCache(old);
 *   if (!cache) return old;
 *
 *   // Type-safe access to cache.data.participants
 *   return {
 *     ...cache,
 *     data: {
 *       ...cache.data,
 *       participants: cache.data.participants.map(p => ...),
 *     },
 *   };
 * });
 * ```
 */
export function validateThreadDetailResponseCache(data: unknown): ThreadDetailResponseCache | undefined {
  const result = ThreadDetailResponseCacheSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Schema for threads list cache page structure
 *
 * **SINGLE SOURCE OF TRUTH**: Validates paginated threads list cache.
 * Replaces inline types in chat-mutations.ts (lines 508, 610)
 */
export const ThreadsListCachePageSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(ChatThreadCacheCompatSchema), // Use full thread schema
  }).optional(),
});

/**
 * Type for threads list cache page (inferred from schema)
 */
export type ThreadsListCachePage = z.infer<typeof ThreadsListCachePageSchema>;

/**
 * Helper to validate threads list cache pages
 *
 * **USE THIS INSTEAD OF**: `old.pages as Array<{ success: boolean; data?: { items?: ... } }>`
 */
export function validateThreadsListPages(data: unknown): ThreadsListCachePage[] | undefined {
  if (!Array.isArray(data))
    return undefined;

  const validated = data.map(page => ThreadsListCachePageSchema.safeParse(page));

  // Return undefined if any page fails validation
  if (validated.some(result => !result.success))
    return undefined;

  return validated.map(result => result.data!);
}
