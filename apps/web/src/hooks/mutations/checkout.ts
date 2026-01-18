/**
 * Checkout Mutation Hooks
 *
 * TanStack Mutation hooks for Stripe checkout operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { createCheckoutSessionService, getSubscriptionsService, getUserUsageStatsService, listModelsService, syncAfterCheckoutService } from '@/services/api';

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
      // Invalidate subscriptions to prepare for post-checkout data
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all });

      // Invalidate usage queries since new subscription will have different quota limits
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.all });
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
      // Invalidate all billing queries and force immediate refetch
      // Using refetchType: 'all' to refetch both active and inactive queries
      // This ensures queries on the success page refetch even if not yet active

      // Product queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.products.all,
        refetchType: 'all',
      });

      // Subscription queries - critical for success page
      // ⚠️ CRITICAL: Must bypass HTTP cache to get fresh subscription data
      try {
        const freshSubscriptionsData = await getSubscriptionsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.subscriptions.current(), freshSubscriptionsData);
      } catch (error) {
        console.error('[Checkout] Failed to refresh subscriptions after checkout:', error);
        // Fallback: invalidate and let normal refetch handle it
        queryClient.invalidateQueries({
          queryKey: queryKeys.subscriptions.all,
          refetchType: 'all',
        });
      }

      // Usage queries - reflect new quota limits from subscription
      // ⚠️ CRITICAL: Usage stats API has HTTP caching (2min browser)
      // Must bypass cache to get fresh data with updated quota limits
      try {
        const freshUsageData = await getUserUsageStatsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.usage.stats(), freshUsageData);
      } catch (error) {
        console.error('[Checkout] Failed to refresh usage stats after checkout:', error);
        // Fallback: invalidate and let normal refetch handle it
        queryClient.invalidateQueries({
          queryKey: queryKeys.usage.all,
          refetchType: 'all',
        });
      }

      // Models query - tier-based access needs immediate refresh
      // ⚠️ CRITICAL: Models API has aggressive HTTP caching (1hr browser, 24hr CDN)
      // Must bypass cache to get fresh data with updated tier restrictions
      try {
        const freshModelsData = await listModelsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.models.list(), freshModelsData);
      } catch (error) {
        console.error('[Checkout] Failed to refresh models after checkout:', error);
        // Fallback: invalidate and let normal refetch handle it
        queryClient.invalidateQueries({
          queryKey: queryKeys.models.all,
          refetchType: 'all',
        });
      }
    },
    retry: false,
    throwOnError: false,
  });
}
