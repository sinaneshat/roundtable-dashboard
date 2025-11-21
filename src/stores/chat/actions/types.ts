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
