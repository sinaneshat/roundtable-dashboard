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

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { billingInvalidationHelpers } from '@/lib/data/query-keys';
import { cancelSubscriptionService, switchSubscriptionService } from '@/services/api';

/**
 * Hook to switch subscription to a different price plan
 * Protected endpoint - requires authentication
 *
 * Automatically handles:
 * - Upgrades (new > current): Applied immediately with proration
 * - Downgrades (new < current): Scheduled for end of billing period
 * - Invalidates subscription queries to fetch fresh data
 */
export function useSwitchSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: switchSubscriptionService,
    onSuccess: async () => {
      // Use shared helper: invalidates subscriptions, bypasses HTTP cache for usage/models
      await billingInvalidationHelpers.invalidateAfterBillingChange(queryClient);
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
 * - Invalidates subscription queries to fetch fresh data
 */
export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelSubscriptionService,
    onSuccess: async () => {
      // Use shared helper: invalidates subscriptions, bypasses HTTP cache for usage/models
      await billingInvalidationHelpers.invalidateAfterBillingChange(queryClient);
    },
    retry: false,
    throwOnError: false,
  });
}
