/**
 * Models Query Hooks
 *
 * Simplified TanStack Query hook for OpenRouter models
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { listModelsService } from '@/services/api/models';

/**
 * Hook to fetch all OpenRouter models
 *
 * ✅ SERVER-SIDE CACHING: Backend caches models for 24h, client reuses server data
 * ✅ NO REASONING MODELS: Backend filters out all reasoning models
 * ✅ TIER-BASED ACCESS: Model accessibility updates when subscription tier changes
 * ✅ SMART REFETCHING: Refetches when invalidated (e.g., after plan upgrade) but not on focus
 */
export function useModelsQuery() {
  return useQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - server cache is 24h, never refetch on client
    refetchOnWindowFocus: false, // ✅ PERFORMANCE FIX: Don't refetch on focus (was causing constant RSC requests)
    // ✅ FIX: Refetch on mount when query is stale (marked by invalidateQueries after plan upgrade)
    // Using true (not 'always') means it only refetches if the query is marked as stale/invalid
    // This ensures fresh tier-based model access after subscription changes without wasteful refetching
    refetchOnMount: true,
    retry: 2, // Retry failed requests
    throwOnError: false,
  });
}
