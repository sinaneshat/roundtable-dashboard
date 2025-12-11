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

import { Environments } from '@/api/core/enums';
import type { AnalysesCacheResponse } from '@/api/routes/chat/schema';
import {
  AnalysesCacheResponseSchema,
  ChatThreadCacheSchema,
  createCacheResponseSchema,
} from '@/api/routes/chat/schema';
import { chatParticipantSelectSchema } from '@/db/validation/chat';

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
    if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
      console.error('Invalid API response structure for usage stats:', response.error);
    }
    return null;
  }

  const usageData = UsageStatsDataSchema.safeParse(response.data.data);
  if (!usageData.success) {
    if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
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
    if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
      console.error('Invalid API response structure for thread detail:', response.error);
    }
    return null;
  }

  const threadData = ThreadDetailPayloadCacheSchema.safeParse(response.data.data);
  if (!threadData.success) {
    if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
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
      items: z.array(ChatThreadCacheSchema).optional(),
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
    if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
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
export function validateAnalysesCache(data: unknown): AnalysesCacheResponse | undefined {
  const result = AnalysesCacheResponseSchema.safeParse(data);
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
