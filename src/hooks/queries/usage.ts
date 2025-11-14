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
  getUserUsageStatsService,
} from '@/services/api';

/**
 * ✅ SINGLE SOURCE OF TRUTH - Usage statistics and quota checks
 *
 * This is the ONLY hook needed for both quota checking AND usage display.
 *
 * Returns ALL quota information in one call:
 * - threads: { used, limit, remaining, percentage, status }
 * - messages: { used, limit, remaining, percentage, status }
 * - analysis: { used, limit, remaining, percentage, status }
 * - customRoles: { used, limit, remaining, percentage, status }
 * - period: { start, end, daysRemaining }
 * - subscription: { tier, isAnnual }
 *
 * Quota blocking logic:
 * - canCreate = used < limit
 * - Check remaining === 0 or used >= limit to block UI
 *
 * Protected endpoint - requires authentication
 *
 * Stale time: 10 seconds (fresh data for UI blocking)
 * Refetch interval: 30 seconds (automatic background updates)
 *
 * @param options - Optional query options
 * @param options.forceEnabled - Force enable query regardless of auth state
 *
 * @example
 * const { data } = useUsageStatsQuery();
 * if (data?.success) {
 *   const { threads, messages } = data.data;
 *   const canCreateThread = threads.remaining > 0;
 *   const canSendMessage = messages.remaining > 0;
 * }
 */
export function useUsageStatsQuery(options?: { forceEnabled?: boolean }) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.usage.stats(),
    queryFn: getUserUsageStatsService,
    staleTime: STALE_TIMES.quota, // 10 seconds - fresh data for UI blocking
    refetchInterval: 30 * 1000, // Refetch every 30s for quota changes
    retry: false,
    enabled: options?.forceEnabled ?? isAuthenticated,
    throwOnError: false,
  });
}
