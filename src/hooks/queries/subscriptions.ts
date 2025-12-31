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

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getSubscriptionService,
  getSubscriptionsService,
} from '@/services/api';

/**
 * Hook to fetch all user subscriptions
 * Protected endpoint - requires authentication
 *
 * Stale time: 2 minutes (subscription data moderately fresh)
 *
 * @param options - Optional query options
 * @param options.forceEnabled - Force enable query regardless of auth state
 */
export function useSubscriptionsQuery(options?: { forceEnabled?: boolean }) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.subscriptions.list(),
    queryFn: () => getSubscriptionsService(),
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    retry: false,
    enabled: options?.forceEnabled ?? isAuthenticated, // Only fetch when authenticated
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific subscription by ID
 * Protected endpoint - requires authentication and ownership
 *
 * @param subscriptionId - Subscription ID
 */
export function useSubscriptionQuery(subscriptionId: string) {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  return useQuery({
    queryKey: queryKeys.subscriptions.detail(subscriptionId),
    queryFn: () => getSubscriptionService({ param: { id: subscriptionId } }),
    staleTime: STALE_TIMES.subscriptions, // 2 minutes - match server-side prefetch
    enabled: isAuthenticated && !!subscriptionId,
    retry: false,
    throwOnError: false,
  });
}
