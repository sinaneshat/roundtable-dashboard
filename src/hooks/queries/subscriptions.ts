/**
 * Subscription Query Hooks
 *
 * TanStack Query hooks for Stripe subscriptions
 * Following patterns from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getSubscriptionService, getSubscriptionsService } from '@/services/api';

/**
 * Hook to fetch all user subscriptions
 * Protected endpoint - requires authentication
 *
 * Stale time: 2 minutes (subscription data moderately fresh)
 */
export function useSubscriptionsQuery() {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.subscriptions.list(),
    queryFn: getSubscriptionsService,
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    retry: false,
    enabled: isAuthenticated, // Only fetch when authenticated
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific subscription by ID
 * Protected endpoint - requires authentication and ownership
 *
 * @param subscriptionId - Stripe subscription ID
 */
export function useSubscriptionQuery(subscriptionId: string) {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: queryKeys.subscriptions.detail(subscriptionId),
    queryFn: () => getSubscriptionService(subscriptionId),
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    enabled: isAuthenticated && !!subscriptionId,
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to get current active subscription
 * Reuses subscriptions list cache with data selection
 *
 * This pattern prevents making a separate API call by transforming
 * the cached subscriptions data to find the active subscription
 */
export function useCurrentSubscriptionQuery() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: queryKeys.subscriptions.list(), // Reuse list cache
    queryFn: getSubscriptionsService,
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    enabled: isAuthenticated,
    retry: false,
    throwOnError: false,
    // Transform data to get current subscription
    select: (data) => {
      if (data.success && data.data && Array.isArray(data.data.subscriptions)) {
        // Find active subscription or return first one
        return (
          data.data.subscriptions.find(sub => sub.status === 'active')
          || data.data.subscriptions[0]
        );
      }
      return null;
    },
  });
}
