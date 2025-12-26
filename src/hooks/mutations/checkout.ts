/**
 * Checkout Mutation Hooks
 *
 * TanStack Mutation hooks for Stripe checkout operations
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { createCheckoutSessionService, listModelsService, syncAfterCheckoutService, syncCreditsAfterCheckoutService } from '@/services/api';

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

      // Subscription queries - critical for success page
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
        refetchType: 'all', // Refetch all queries, not just active
      });

      // Product queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.products.all,
        refetchType: 'all',
      });

      // Usage queries - reflect new quota limits from subscription
      queryClient.invalidateQueries({
        queryKey: queryKeys.usage.all,
        refetchType: 'all',
      });

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

/**
 * Hook to sync credits after one-time credit pack purchase
 * Protected endpoint - requires authentication
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Separate mutation for one-time purchases (simpler than subscriptions)
 * Eagerly syncs credit purchase data from Stripe API
 *
 * Invalidates usage queries on success to reflect new credit balance
 */
export function useSyncCreditsAfterCheckoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncCreditsAfterCheckoutService,
    onSuccess: () => {
      // Invalidate usage queries - credit balance needs refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.usage.all,
        refetchType: 'all',
      });

      // No need to invalidate subscriptions or models - credits don't affect those
    },
    retry: false,
    throwOnError: false,
  });
}
