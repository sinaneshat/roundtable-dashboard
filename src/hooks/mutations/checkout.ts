/**
 * Checkout Mutation Hooks
 *
 * TanStack Mutation hooks for Stripe checkout operations
 * Following patterns from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { createCheckoutSessionService, syncAfterCheckoutService } from '@/services/api';

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
 * Invalidates all billing-related queries on success
 */
export function useSyncAfterCheckoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncAfterCheckoutService,
    onSuccess: () => {
      // Invalidate all billing queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

      // Invalidate usage queries to reflect new quota limits from subscription
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.all });

      // ✅ FIX: Invalidate models query to refresh tier-based model access after plan upgrade
      // Without this, users must hard refresh to see newly unlocked models in participant selector
      queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
    },
    retry: false,
    throwOnError: false,
  });
}
