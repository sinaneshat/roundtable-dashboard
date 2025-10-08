/**
 * Usage Query Hooks
 *
 * TanStack Query hooks for chat usage tracking and quotas
 * Following patterns from subscriptions.ts
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  checkMessageQuotaService,
  checkThreadQuotaService,
  getUserUsageStatsService,
} from '@/services/api';

/**
 * Hook to fetch user usage statistics
 * Returns comprehensive usage data for threads and messages
 * Protected endpoint - requires authentication
 *
 * Stale time: 1 minute (usage data should be relatively fresh)
 */
export function useUsageStatsQuery() {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.usage.stats(),
    queryFn: getUserUsageStatsService,
    staleTime: STALE_TIMES.usage, // 1 minute - match server-side prefetch
    retry: false,
    enabled: isAuthenticated, // Only fetch when authenticated
    throwOnError: false,
  });
}

/**
 * Hook to check thread creation quota
 * Returns whether user can create more threads
 * Protected endpoint - requires authentication
 *
 * Stale time: 30 seconds (quota checks should be fresh)
 */
export function useThreadQuotaQuery() {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.usage.threadQuota(),
    queryFn: checkThreadQuotaService,
    staleTime: STALE_TIMES.quota, // 1 minute - consistent with usage stats
    retry: false,
    enabled: isAuthenticated,
    throwOnError: false,
  });
}

/**
 * Hook to check message creation quota
 * Returns whether user can send more messages
 * Protected endpoint - requires authentication
 *
 * Stale time: 30 seconds (quota checks should be fresh)
 */
export function useMessageQuotaQuery() {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.usage.messageQuota(),
    queryFn: checkMessageQuotaService,
    staleTime: STALE_TIMES.quota, // 1 minute - consistent with usage stats
    retry: false,
    enabled: isAuthenticated,
    throwOnError: false,
  });
}
