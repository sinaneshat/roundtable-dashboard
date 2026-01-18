/**
 * Subscription Query Hooks
 *
 * TanStack Query hooks for Stripe subscriptions
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

import { useQuery } from '@tanstack/react-query';

import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getSubscriptionService,
  getSubscriptionsService,
} from '@/services/api';

/**
 * Hook to fetch all user subscriptions
 * Protected endpoint - requires authentication (handled by backend)
 *
 * ⚠️ NO CACHE - subscription data must always be fresh after plan changes
 */
export function useSubscriptionsQuery() {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.subscriptions.current(),
    queryFn: () => getSubscriptionsService(),
    staleTime: STALE_TIMES.subscriptions, // ⚠️ NO CACHE (0) - always fresh
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in memory for instant UI
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
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in memory for instant UI
    enabled: isAuthenticated && !!subscriptionId,
    retry: false,
    throwOnError: false,
  });
}
