/**
 * Models Query Hooks
 *
 * TanStack Query hook for fetching curated AI models
 * All model data sourced from models-config.service.ts on backend
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { listModelsService } from '@/services/api';

/**
 * Hook to fetch curated AI models
 *
 * ✅ CURATED LIST: Returns top 20 models from models-config.service.ts
 * ✅ TIER-BASED ACCESS: Model accessibility computed per user's subscription tier
 * ✅ SMART REFETCHING: Refetches when invalidated (e.g., after plan upgrade) but not on focus
 * ✅ TYPE SAFETY: Fully typed response inferred from Zod schemas
 */
export function useModelsQuery() {
  return useQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - models are static, only refetch when invalidated
    refetchOnWindowFocus: false,
    // With Infinity staleTime, data is never stale - refetch only via invalidateQueries
    refetchOnMount: false,
    retry: 2,
    throwOnError: false,
  });
}
