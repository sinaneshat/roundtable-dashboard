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

import { AnalysisStatusSchema, ChatModeSchema } from '@/api/core/enums';
import { chatParticipantSelectSchema } from '@/db/validation/chat';

// ============================================================================
// API RESPONSE SCHEMAS - Single Source of Truth
// ============================================================================

/**
 * Standard API response wrapper schema
 * Validates the common API response structure across all endpoints
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

// ============================================================================
// USAGE STATS CACHE SCHEMAS
// ============================================================================

/**
 * Usage stats data structure schema
 * Validates optimistic cache updates for thread/message counts
 *
 * SINGLE SOURCE OF TRUTH for usage stats cache validation in mutations
 */
export const UsageStatsDataSchema = z.object({
  messages: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  threads: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  subscription: z.unknown(),
  period: z.unknown(),
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
// THREAD CACHE SCHEMAS
// ============================================================================

/**
 * Thread data schema for cache operations
 * Validates thread object structure for optimistic updates
 *
 * ✅ FIX: Include all fields needed for sidebar display
 * Missing date fields caused NaN in groupChatsByPeriod when Zod stripped unknown keys
 */
export const ThreadCacheDataSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  slug: z.string().optional(),
  previousSlug: z.string().nullable().optional(),
  mode: z.string().optional(),
  status: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isAiGeneratedTitle: z.boolean().optional(),
  enableWebSearch: z.boolean().optional(),
  metadata: z.unknown().optional(),
  // ✅ FIX: Date fields required for sidebar grouping (createdAt, updatedAt)
  // Accept both string (from JSON API) and Date (from optimistic updates)
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  lastMessageAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export type ThreadCacheData = z.infer<typeof ThreadCacheDataSchema>;

/**
 * Thread detail payload schema for cache operations
 * Validates thread detail payload structure
 */
export const ThreadDetailPayloadCacheSchema = z.object({
  thread: z.unknown(),
  participants: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()).optional(),
  changelog: z.array(z.unknown()).optional(),
  user: z.unknown().optional(),
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
      console.error('Invalid thread detail data structure:', threadData.error);
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
      items: z.array(ThreadCacheDataSchema).optional(),
    })
    .optional(),
});

export type PaginatedPageCache = z.infer<typeof PaginatedPageCacheSchema>;

/**
 * Infinite query data schema
 * Validates the complete infinite query structure
 */
export const InfiniteQueryCacheSchema = z.object({
  pages: z.array(PaginatedPageCacheSchema),
  pageParams: z.array(z.unknown()).optional(),
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
      console.error('Invalid infinite query data structure:', queryData.error);
    }
    return null;
  }

  return queryData.data;
}

// ============================================================================
// DEDUPLICATION OPTIONS SCHEMAS
// ============================================================================

/**
 * Schema for analysis deduplication options
 *
 * **SINGLE SOURCE OF TRUTH**: Replaces `Record<string, unknown>` in orchestrators.
 * Provides type-safe options for deduplicateAnalyses() function.
 *
 * @see deduplicateAnalyses in @/lib/utils/analysis-utils.ts
 */
export const AnalysisDeduplicationOptionsSchema = z.object({
  /** Round being regenerated (filtered out during deduplication) */
  regeneratingRoundNumber: z.number().nullable().optional(),
  /** Whether to exclude failed analyses (default: true) */
  excludeFailed: z.boolean().optional(),
});

/**
 * Type for analysis deduplication options (inferred from schema)
 */
export type AnalysisDeduplicationOptions = z.infer<typeof AnalysisDeduplicationOptionsSchema>;

/**
 * Schema for analyses cache data structure
 *
 * **SINGLE SOURCE OF TRUTH**: Validates React Query cache structure for analyses.
 * Replaces unsafe type assertions in chat-analysis.ts (lines 204-208, 270-273, etc.)
 *
 * Used when reading/writing analyses cache in React Query.
 */
export const AnalysesCacheDataSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        threadId: z.string(),
        roundNumber: z.number(),
        status: AnalysisStatusSchema,
        // ✅ TYPE-SAFE: Match server schema - optional and nullable with proper type
        analysisData: z.unknown().nullable().optional(),
        participantMessageIds: z.array(z.string()),
        // ✅ ENUM PATTERN: Use ChatModeSchema for type-safe enum literals
        mode: ChatModeSchema,
        userQuestion: z.string(),
        createdAt: z.union([z.date(), z.string()]),
        // Match server response type: nullable but not optional
        completedAt: z.union([z.date(), z.string()]).nullable(),
        errorMessage: z.string().nullable(),
      }),
    ),
  }),
});

/**
 * Type for analyses cache data (inferred from schema)
 */
export type AnalysesCacheData = z.infer<typeof AnalysesCacheDataSchema>;

/**
 * Helper function to safely cast cache data with validation
 *
 * **USE THIS INSTEAD OF**: `oldData as { success: boolean; data: { items: ... } }`
 *
 * @param data - Raw cache data from React Query
 * @returns Validated cache data or undefined if invalid
 *
 * @example
 * ```typescript
 * queryClient.setQueryData(queryKey, (oldData) => {
 *   const cacheData = validateAnalysesCache(oldData);
 *   if (!cacheData) return oldData;
 *
 *   // Type-safe access to cacheData.data.items
 *   const updatedItems = [...cacheData.data.items, newAnalysis];
 *   return { ...cacheData, data: { items: updatedItems } };
 * });
 * ```
 */
export function validateAnalysesCache(data: unknown): AnalysesCacheData | undefined {
  const result = AnalysesCacheDataSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Schema for thread detail cache data structure with participants
 *
 * **SINGLE SOURCE OF TRUTH**: Validates React Query cache for thread details.
 * Replaces unsafe type assertions in chat-mutations.ts (lines 731, 788, 852, 925)
 *
 * Used when reading/writing thread detail cache in React Query.
 */
export const ThreadDetailCacheDataSchema = z.object({
  participants: z.array(chatParticipantSelectSchema),
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
 */
export const ThreadDetailResponseCacheSchema = z.object({
  success: z.boolean(),
  data: z.object({
    participants: z.array(chatParticipantSelectSchema),
  }).passthrough(), // Allow additional properties in data object
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
    items: z.array(
      z.object({
        id: z.string(),
        isFavorite: z.boolean().optional(),
        isPublic: z.boolean().optional(),
      }).passthrough(), // Allow additional properties
    ),
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
