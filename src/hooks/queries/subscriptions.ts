/**
 * Subscription Query Hooks
 *
 * TanStack Query hooks for Stripe subscriptions
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

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
 * Stale time: 2 minutes (subscription data moderately fresh)
 */
export function useSubscriptionsQuery() {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.subscriptions.list(),
    queryFn: () => getSubscriptionsService(),
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    enabled: isAuthenticated,
    retry: false,
  });
}

/**
 * Hook to fetch a specific subscription by ID
 * Protected endpoint - requires authentication and ownership (handled by backend)
 *
 * @param subscriptionId - Subscription ID
 */
export function useSubscriptionQuery(subscriptionId: string) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.subscriptions.detail(subscriptionId),
    queryFn: () => getSubscriptionService({ param: { id: subscriptionId } }),
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    enabled: isAuthenticated && !!subscriptionId,
    retry: false,
  });
}
