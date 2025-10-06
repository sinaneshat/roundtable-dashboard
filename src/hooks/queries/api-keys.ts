/**
 * API Keys Query Hooks
 *
 * TanStack Query hooks for fetching API keys
 * Following patterns from chat-threads.ts and subscriptions.ts
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { getApiKeyService, listApiKeysService } from '@/services/api';

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Query hook for fetching all API keys
 * Prefetches and caches results for instant modal display
 */
export function useApiKeysQuery() {
  return useQuery({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: async () => listApiKeysService(),
    staleTime: 1000 * 60 * 5, // 5 minutes - API keys don't change frequently
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: 2,
  });
}

/**
 * Query hook for fetching a specific API key by ID
 */
export function useApiKeyQuery(keyId: string) {
  return useQuery({
    queryKey: queryKeys.apiKeys.detail(keyId),
    queryFn: async () => getApiKeyService(keyId),
    enabled: !!keyId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
