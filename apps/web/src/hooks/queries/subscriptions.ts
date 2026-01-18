/**
 * Subscription Query Hooks
 *
 * TanStack Query hooks for Stripe subscriptions
 *
 * CRITICAL: Uses shared queryOptions from query-options.ts
 * This ensures SSR hydration works correctly - same config in loader and hook
 */

import { useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { subscriptionsQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import { getSubscriptionService } from '@/services/api';

/**
 * Hook to fetch all user subscriptions
 * Protected endpoint - requires authentication (handled by backend)
 *
 * ✅ SSR HYDRATION: Uses shared queryOptions for seamless server-client data transfer
 * Note: staleTime is set in queryOptions to prevent immediate refetch on hydration
 */
export function useSubscriptionsQuery() {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    ...subscriptionsQueryOptions,
    gcTime: GC_TIMES.STANDARD, // 5 minutes - keep in memory for instant UI
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific subscription by ID
 * Protected endpoint - requires authentication and ownership (handled by backend)
 *
 * ⚠️ NO CACHE - subscription data must always be fresh after plan changes
 *
 * @param subscriptionId - Subscription ID
 */
export function useSubscriptionQuery(subscriptionId: string) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.subscriptions.detail(subscriptionId),
    queryFn: () => getSubscriptionService({ param: { id: subscriptionId } }),
    staleTime: STALE_TIMES.subscriptions, // ⚠️ NO CACHE (0) - always fresh
    gcTime: GC_TIMES.STANDARD, // 5 minutes - keep in memory for instant UI
    enabled: isAuthenticated && !!subscriptionId,
    retry: false,
    throwOnError: false,
  });
}
