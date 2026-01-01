/**
 * API Keys Query Hooks
 *
 * TanStack Query hooks for fetching API keys
 * Following patterns from chat-threads.ts and subscriptions.ts
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getApiKeyService,
  listApiKeysService,
} from '@/services/api';

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Query hook for fetching all API keys
 * Only fetches when explicitly enabled (e.g., when modal is open)
 */
export function useApiKeysQuery(enabled = true) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: () => listApiKeysService(),
    staleTime: STALE_TIMES.apiKeys, // 5 minutes - API keys don't change frequently
    refetchOnMount: 'always', // Always refetch when modal opens to ensure fresh data
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && enabled,
    retry: false,
    throwOnError: false,
  });
}

/**
 * Query hook for fetching a specific API key by ID
 */
export function useApiKeyQuery(keyId: string) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.apiKeys.detail(keyId),
    queryFn: () => getApiKeyService({ param: { keyId } }),
    enabled: isAuthenticated && !!keyId,
    staleTime: STALE_TIMES.apiKeys, // 5 minutes
    refetchOnWindowFocus: false,
    retry: false,
    throwOnError: false,
  });
}
