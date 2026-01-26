/**
 * API Keys Query Hooks
 *
 * TanStack Query hooks for fetching API keys
 * Following patterns from chat-threads.ts and subscriptions.ts
 */

import { useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import {
  getApiKeyService,
  listApiKeysService,
} from '@/services/api';

/**
 * Query hook for fetching all API keys
 * Only fetches when explicitly enabled (e.g., when modal is open)
 */
export function useApiKeysQuery(enabled = true) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: isAuthenticated && enabled,
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: () => listApiKeysService(),
    queryKey: queryKeys.apiKeys.list(),
    refetchOnMount: false, // Use staleTime to control freshness, invalidate on mutation
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.apiKeys, // 5 minutes - API keys don't change frequently
    throwOnError: false,
  });
}

/**
 * Query hook for fetching a specific API key by ID
 */
export function useApiKeyQuery(keyId: string) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    enabled: isAuthenticated && !!keyId,
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    queryFn: () => getApiKeyService({ param: { keyId } }),
    queryKey: queryKeys.apiKeys.detail(keyId),
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.apiKeys, // 5 minutes
    throwOnError: false,
  });
}
