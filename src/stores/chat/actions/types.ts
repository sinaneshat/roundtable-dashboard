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

import { AnalysisStatusSchema } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

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
        analysisData: z.unknown().nullable(),
        participantMessageIds: z.array(z.string()),
        mode: z.string(),
        userQuestion: z.string(),
        createdAt: z.union([z.date(), z.string()]),
        errorMessage: z.string().nullable().optional(),
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
 * Helper to transform analyses cache with type safety
 *
 * @param data - Raw cache data
 * @param transformer - Function to transform items array
 * @returns Updated cache data or original data if invalid
 *
 * @example
 * ```typescript
 * queryClient.setQueryData(queryKey, (oldData) =>
 *   transformAnalysesCache(oldData, (items) =>
 *     items.map(item =>
 *       item.id === analysisId ? { ...item, status: 'completed' } : item
 *     )
 *   )
 * );
 * ```
 */
export function transformAnalysesCache(
  data: unknown,
  transformer: (items: StoredModeratorAnalysis[]) => StoredModeratorAnalysis[],
): AnalysesCacheData | unknown {
  const validated = validateAnalysesCache(data);
  if (!validated) {
    return data; // Return original if validation fails (graceful degradation)
  }

  const transformedItems = transformer(validated.data.items as StoredModeratorAnalysis[]);
  return {
    ...validated,
    data: {
      ...validated.data,
      items: transformedItems,
    },
  };
}
