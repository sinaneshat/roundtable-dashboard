/**
 * Models Query Hooks
 *
 * TanStack Query hooks for dynamic OpenRouter models
 * Following SSG (Static Site Generation) pattern with infinite caching
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getModelService, listModelsService, listProvidersService } from '@/services/api/models';

/**
 * Filters for models list query
 */
export type ModelsFilters = {
  provider?: string;
  category?: 'reasoning' | 'general' | 'creative' | 'research';
  freeOnly?: boolean;
  search?: string;
  supportsVision?: boolean;
  includeAll?: boolean; // Include all models regardless of user's tier (for showing locked models)
};

/**
 * Hook to fetch all OpenRouter models with optional filters
 *
 * ✅ SSG STRATEGY: Server-prefetched data consumed client-side
 * - Models are prefetched on server in page.tsx with includeAll=true
 * - Backend returns ALL models with tier information
 * - Cached with infinite stale time (no refetches)
 * - Client components filter based on user's subscription tier
 *
 * Usage Pattern:
 * 1. Server prefetches: await queryClient.prefetchQuery({ includeAll: true })
 * 2. Client consumes: useModelsQuery(MODELS_QUERY_FILTERS) where MODELS_QUERY_FILTERS = { includeAll: true }
 * 3. No API calls on client - data served from cache immediately
 *
 * @param filters - Optional filters for models (provider, category, etc.)
 * @param filters.includeAll - Include all models (should match server prefetch)
 */
export function useModelsQuery(filters?: ModelsFilters) {
  return useQuery({
    queryKey: queryKeys.models.list(filters),
    queryFn: () =>
      listModelsService(
        filters
          ? {
              query: {
                provider: filters.provider,
                category: filters.category,
                freeOnly: filters.freeOnly ? 'true' : undefined,
                search: filters.search,
                supportsVision: filters.supportsVision ? 'true' : undefined,
                includeAll: filters.includeAll ? 'true' : undefined,
              },
            }
          : undefined,
      ),
    staleTime: STALE_TIMES.models, // Infinity - models cached indefinitely
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch when component mounts (rely on cache)
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific model by ID
 * Public endpoint - no authentication required
 *
 * Model details cached with infinite stale time
 *
 * @param modelId - OpenRouter model ID (e.g., "anthropic/claude-4")
 */
export function useModelQuery(modelId: string) {
  return useQuery({
    queryKey: queryKeys.models.detail(modelId),
    queryFn: () => getModelService(modelId),
    staleTime: STALE_TIMES.modelDetail, // Infinity - model details cached indefinitely
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch when component mounts (rely on cache)
    enabled: !!modelId, // Only fetch when modelId is available
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch all model providers with their counts
 * Public endpoint - no authentication required
 *
 * Providers cached with infinite stale time
 */
export function useProvidersQuery() {
  return useQuery({
    queryKey: queryKeys.models.providers(),
    queryFn: () => listProvidersService(),
    staleTime: STALE_TIMES.providers, // Infinity - providers cached indefinitely
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch when component mounts (rely on cache)
    retry: false,
    throwOnError: false,
  });
}
