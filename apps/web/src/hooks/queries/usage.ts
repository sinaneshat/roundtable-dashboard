/**
 * Usage Query Hooks
 *
 * TanStack Query hooks for chat usage tracking and quotas
 *
 * CRITICAL: Uses shared queryOptions from query-options.ts
 * This ensures SSR hydration works correctly - same config in loader and hook
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthCheck } from '@/hooks/utils';
import { usageQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES } from '@/lib/data/stale-times';

/**
 * ✅ SINGLE SOURCE OF TRUTH - Usage statistics and quota checks
 *
 * This is the ONLY hook needed for both quota checking AND usage display.
 *
 * Returns ALL quota information in one call:
 * - threads: { used, limit, remaining, percentage, status }
 * - messages: { used, limit, remaining, percentage, status }
 * - moderator: { used, limit, remaining, percentage, status }
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
 * ✅ SSR HYDRATION: Uses shared queryOptions for seamless server-client data transfer
 * Note: staleTime is set in queryOptions to prevent immediate refetch on hydration
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
  const { handleAuthError, isAuthenticated } = useAuthCheck();

  const query = useQuery({
    ...usageQueryOptions,
    enabled: options?.forceEnabled ?? isAuthenticated,
    gcTime: GC_TIMES.STANDARD, // 5 minutes - keep in memory for instant UI
    // NO POLLING - stats are prefetched server-side and invalidated after:
    // - Chat operations (via afterChatOperation invalidation pattern)
    // - Subscription changes (via subscriptions invalidation pattern)
    // - Checkout completion (via afterCheckout invalidation pattern)
    // This prevents unnecessary client-side requests
    retry: false,
    throwOnError: false,
  });

  // Handle 401 errors by verifying session and signing out if invalid
  useEffect(() => {
    if (query.error) {
      void handleAuthError(query.error);
    }
  }, [query.error, handleAuthError]);

  return query;
}
