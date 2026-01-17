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
import {
  cancelSubscriptionService,
  getUserUsageStatsService,
  listModelsService,
  switchSubscriptionService,
} from '@/services/api';

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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
      });

      // ⚠️ CRITICAL: Bypass HTTP cache for usage and models after plan switch
      // Tier changes affect quotas and available models
      try {
        const freshUsageData = await getUserUsageStatsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.usage.stats(), freshUsageData);
      } catch {
        void queryClient.invalidateQueries({ queryKey: queryKeys.usage.all });
      }

      try {
        const freshModelsData = await listModelsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.models.list(), freshModelsData);
      } catch {
        void queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
      }
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
      });

      // ⚠️ CRITICAL: Bypass HTTP cache for usage and models after cancellation
      // Cancellation affects quotas and available models
      try {
        const freshUsageData = await getUserUsageStatsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.usage.stats(), freshUsageData);
      } catch {
        void queryClient.invalidateQueries({ queryKey: queryKeys.usage.all });
      }

      try {
        const freshModelsData = await listModelsService({ bypassCache: true });
        queryClient.setQueryData(queryKeys.models.list(), freshModelsData);
      } catch {
        void queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
      }
    },
    retry: false,
    throwOnError: false,
  });
}
