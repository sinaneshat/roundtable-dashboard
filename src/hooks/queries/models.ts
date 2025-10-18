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
 * ✅ NO CLIENT REFETCHING: Models are prefetched server-side and rarely change
 */
export function useModelsQuery() {
  return useQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - server cache is 24h, never refetch on client
    refetchOnWindowFocus: false, // ✅ PERFORMANCE FIX: Don't refetch on focus (was causing constant RSC requests)
    refetchOnMount: false, // ✅ PERFORMANCE FIX: Use server-prefetched data (was causing refetch loops)
    retry: 2, // Retry failed requests
    throwOnError: false,
  });
}
