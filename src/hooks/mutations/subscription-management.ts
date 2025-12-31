/**
 * Subscription Management Mutation Hooks
 *
 * TanStack Mutation hooks for in-app subscription changes
 * Following Theo's "Stay Sane with Stripe" pattern - handle everything in-app
 *
 * Operations:
 * - Switch: Intelligently handles upgrades (immediate with proration) and downgrades (at period end)
 * - Cancel: Cancel subscription (at period end or immediately)
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import type { GetSubscriptionsResponse } from '@/services/api';
import {
  cancelSubscriptionService,
  switchSubscriptionService,
} from '@/services/api';

/**
 * Hook to switch subscription to a different price plan
 * Protected endpoint - requires authentication
 *
 * Automatically handles:
 * - Upgrades (new > current): Applied immediately with proration
 * - Downgrades (new < current): Scheduled for end of billing period
 * - Updates cache immediately with fresh data from API response
 * - Invalidates subscription queries to ensure consistency
 */
export function useSwitchSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: switchSubscriptionService,
    onSuccess: (response) => {
      // Immediately update the subscriptions list cache with the updated subscription
      if (response.success && response.data?.subscription) {
        const updatedSubscription = response.data.subscription;

        queryClient.setQueryData<GetSubscriptionsResponse>(
          queryKeys.subscriptions.list(),
          (oldData: GetSubscriptionsResponse | undefined) => {
            if (!oldData?.success || !oldData.data?.items) {
              return oldData;
            }

            // Replace the updated subscription in the list
            const updatedSubscriptions = oldData.data.items.map((sub: typeof updatedSubscription) =>
              sub.id === updatedSubscription.id ? updatedSubscription : sub,
            );

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: updatedSubscriptions,
              },
            };
          },
        );
      }

      // Invalidate all subscription-related queries to ensure UI updates
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
        refetchType: 'active',
      });

      // Invalidate usage queries since quota limits are tied to subscription tier
      // This ensures quota limits, stats, and remaining usage are immediately updated
      void queryClient.invalidateQueries({
        queryKey: queryKeys.usage.all,
        refetchType: 'active',
      });

      // ✅ FIX: Invalidate models query since model access is tier-based
      // This ensures model availability updates immediately after subscription changes
      void queryClient.invalidateQueries({
        queryKey: queryKeys.models.all,
        refetchType: 'active',
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to cancel subscription
 * Protected endpoint - requires authentication
 *
 * - Default: Cancel at period end (user retains access)
 * - Optional: Cancel immediately (user loses access)
 * - Updates cache immediately with fresh data from API response
 * - Invalidates subscription queries to ensure consistency
 */
export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelSubscriptionService,
    onSuccess: (response) => {
      // Immediately update the subscriptions list cache with the updated subscription
      if (response.success && response.data?.subscription) {
        const updatedSubscription = response.data.subscription;

        queryClient.setQueryData<GetSubscriptionsResponse>(
          queryKeys.subscriptions.list(),
          (oldData: GetSubscriptionsResponse | undefined) => {
            if (!oldData?.success || !oldData.data?.items) {
              return oldData;
            }

            // Replace the updated subscription in the list
            const updatedSubscriptions = oldData.data.items.map((sub: typeof updatedSubscription) =>
              sub.id === updatedSubscription.id ? updatedSubscription : sub,
            );

            return {
              ...oldData,
              data: {
                ...oldData.data,
                items: updatedSubscriptions,
              },
            };
          },
        );
      }

      // Invalidate all subscription-related queries to ensure UI updates
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
        refetchType: 'active',
      });

      // Invalidate usage queries since quota limits are tied to subscription tier
      // When subscription is cancelled, user may revert to free tier limits
      void queryClient.invalidateQueries({
        queryKey: queryKeys.usage.all,
        refetchType: 'active',
      });

      // ✅ FIX: Invalidate models query since model access is tier-based
      // When cancelled, user may lose access to premium models
      void queryClient.invalidateQueries({
        queryKey: queryKeys.models.all,
        refetchType: 'active',
      });
    },
    retry: false,
    throwOnError: false,
  });
}
