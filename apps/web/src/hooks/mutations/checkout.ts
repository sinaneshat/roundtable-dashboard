/**
 * Checkout Mutation Hooks
 *
 * TanStack Mutation hooks for Stripe checkout operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { billingInvalidationHelpers, invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import { createCheckoutSessionService, getSubscriptionsService, syncAfterCheckoutService } from '@/services/api';

/**
 * Hook to create Stripe checkout session
 * Protected endpoint - requires authentication
 *
 * After successful checkout session creation, invalidates subscription queries
 */
export function useCreateCheckoutSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCheckoutSessionService,
    onSuccess: () => {
      // Use centralized pattern: subscriptions + usage
      invalidationPatterns.checkoutSession.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to sync Stripe data after checkout
 * Protected endpoint - requires authentication
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Eagerly syncs subscription data from Stripe API immediately after checkout
 * to prevent race conditions with webhooks
 *
 * Invalidates and refetches all billing-related queries on success
 */
export function useSyncAfterCheckoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncAfterCheckoutService,
    onSuccess: async () => {
      // Wrap ALL cache operations - failures should NOT prevent success page from showing
      // The sync API succeeded; cache invalidation issues are non-critical
      try {
        // Step 1: Invalidate products with refetchType: 'all'
        queryClient.invalidateQueries({
          queryKey: queryKeys.products.all,
          refetchType: 'all',
        });

        // Step 2: Fetch fresh subscription data (bypass HTTP cache)
        try {
          const freshSubscriptionsData = await getSubscriptionsService({ bypassCache: true });
          queryClient.setQueryData(queryKeys.subscriptions.current(), freshSubscriptionsData);
        } catch (error) {
          console.error('[Checkout] Failed to refresh subscriptions after checkout:', error);
          billingInvalidationHelpers.invalidateSubscriptions(queryClient);
        }

        // Step 3: Refresh usage/models with cache bypass (tier-based access)
        await Promise.all([
          billingInvalidationHelpers.refreshUsageStats(queryClient),
          billingInvalidationHelpers.refreshModels(queryClient),
        ]);
      } catch (error) {
        console.error('[Checkout] Cache invalidation failed (non-critical):', error);
      }
    },
    retry: false,
    throwOnError: false,
  });
}
