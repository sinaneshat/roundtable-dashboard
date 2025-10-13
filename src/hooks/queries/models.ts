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
 * Returns ALL models from OpenRouter API with no filtering
 * Cached with infinite stale time (no refetches)
 */
export function useModelsQuery() {
  return useQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - models cached indefinitely
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch when component mounts (rely on cache)
    retry: false,
    throwOnError: false,
  });
}
