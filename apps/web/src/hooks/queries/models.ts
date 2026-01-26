/**
 * Models Query Hooks
 *
 * TanStack Query hook for fetching curated AI models
 * All model data sourced from models-config.service.ts on backend
 *
 * CRITICAL: Uses shared queryOptions from query-options.ts
 * This ensures SSR hydration works correctly - same config in loader and hook
 */

import { useQuery } from '@tanstack/react-query';

import { modelsQueryOptions } from '@/lib/data/query-options';

type UseModelsQueryOptions = {
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
};

/**
 * Hook to fetch curated AI models
 *
 * ✅ CURATED LIST: Returns top 20 models from models-config.service.ts
 * ✅ TIER-BASED ACCESS: Model accessibility computed per user's subscription tier
 * ✅ SMART REFETCHING: Refetches when invalidated (e.g., after plan upgrade) but not on focus
 * ✅ TYPE SAFETY: Fully typed response inferred from Zod schemas
 * ✅ SSR HYDRATION: Uses shared queryOptions for seamless server-client data transfer
 */
export function useModelsQuery(options?: UseModelsQueryOptions) {
  return useQuery({
    ...modelsQueryOptions,
    enabled: options?.enabled ?? true,
    throwOnError: false,
  });
}
