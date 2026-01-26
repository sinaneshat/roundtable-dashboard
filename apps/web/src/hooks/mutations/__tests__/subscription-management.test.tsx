/**
 * Subscription Management Mutation Tests
 *
 * Tests for subscription modification mutations with TanStack Query:
 * - useSwitchSubscriptionMutation - Switch between subscription plans
 * - useCancelSubscriptionMutation - Cancel subscription
 *
 * Coverage:
 * - Mutation execution
 * - Query invalidation (server is source of truth)
 * - Error handling
 * - Related query updates (usage, models)
 */

import { StripeSubscriptionStatuses } from '@roundtable/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
import {
  act,
  createActiveSubscription,
  createCanceledSubscription,
  createMockPrice,
  createMockSubscription,
  renderHook,
  waitFor,
} from '@/lib/testing';
import type { ListSubscriptionsResponse } from '@/services/api';
import * as apiServices from '@/services/api';

import {
  useCancelSubscriptionMutation,
  useSwitchSubscriptionMutation,
} from '../subscription-management';

// ============================================================================
// Test Setup
// ============================================================================

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        // Use a small but non-zero gcTime to prevent immediate cache eviction
        // when invalidateQueries is called after setQueryData
        gcTime: 1000,
        retry: false,
      },
    },
  });
}

type WrapperProps = {
  children: ReactNode;
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// ============================================================================
// useSwitchSubscriptionMutation Tests
// ============================================================================

// Default mock data for services called in onSuccess
const defaultMockUsageData = {
  data: { creditsLimit: 1000, creditsUsed: 0, modelsLimit: 10, modelsUsed: 0 },
  success: true as const,
};

const defaultMockModelsData = {
  data: { count: 0, items: [] },
  success: true as const,
};

describe('useSwitchSubscriptionMutation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    // Mock services called in onSuccess to prevent hanging
    vi.spyOn(apiServices, 'getUserUsageStatsService').mockResolvedValue(defaultMockUsageData);
    vi.spyOn(apiServices, 'listModelsService').mockResolvedValue(defaultMockModelsData);
  });

  describe('successful subscription switch', () => {
    it('should switch subscription and invalidate cache', async () => {
      const oldSubscription = createActiveSubscription({
        id: 'sub_old',
        priceId: 'price_monthly_basic',
      });

      const updatedSubscription = createMockSubscription({
        id: 'sub_old',
        priceId: 'price_monthly_pro',
        status: StripeSubscriptionStatuses.ACTIVE,
      });

      const oldPrice = createMockPrice({ id: 'price_monthly_basic', unitAmount: 1000 });
      const newPrice = createMockPrice({ id: 'price_monthly_pro', unitAmount: 2000 });

      const mockResponse = {
        data: {
          changeDetails: {
            isDowngrade: false,
            isUpgrade: true,
            newPrice,
            oldPrice,
          },
          message: 'Subscription upgraded successfully',
          subscription: updatedSubscription,
        },
        success: true as const,
      };

      // Pre-populate cache with old subscription
      queryClient.setQueryData<ListSubscriptionsResponse>(queryKeys.subscriptions.list(), {
        data: {
          count: 1,
          items: [oldSubscription],
        },
        success: true,
      });

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Execute mutation
      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_monthly_pro' },
          param: { id: 'sub_old' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      // Verify cache was invalidated (not directly updated - will refetch on next access)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );
      expect(apiServices.switchSubscriptionService).toHaveBeenCalledWith(
        expect.objectContaining({
          json: { newPriceId: 'price_monthly_pro' },
          param: { id: 'sub_old' },
        }),
        expect.anything(),
      );
    });

    it('should invalidate subscription queries after switch', async () => {
      const updatedSubscription = createActiveSubscription({ priceId: 'price_new' });

      const mockResponse = {
        data: {
          message: 'Subscription upgraded',
          subscription: updatedSubscription,
        },
        success: true as const,
      };

      const mockUsageData = {
        data: { creditsLimit: 1000, creditsUsed: 0, modelsLimit: 10, modelsUsed: 0 },
        success: true as const,
      };

      const mockModelsData = {
        data: { count: 0, items: [] },
        success: true as const,
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);
      vi.spyOn(apiServices, 'getUserUsageStatsService').mockResolvedValue(mockUsageData);
      vi.spyOn(apiServices, 'listModelsService').mockResolvedValue(mockModelsData);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_new' },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      // Verify subscriptions invalidated
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );

      // Verify usage data fetched and set (quota limits tied to tier)
      expect(apiServices.getUserUsageStatsService).toHaveBeenCalledWith({ bypassCache: true });
      expect(setQueryDataSpy).toHaveBeenCalledWith(queryKeys.usage.stats(), mockUsageData);

      // Verify models data fetched and set (model access tier-based)
      expect(apiServices.listModelsService).toHaveBeenCalledWith({ bypassCache: true });
      expect(setQueryDataSpy).toHaveBeenCalledWith(queryKeys.models.list(), mockModelsData);
    });

    it('should handle upgrade (immediate proration)', async () => {
      const upgradedSubscription = createActiveSubscription({ priceId: 'price_premium' });
      const oldPrice = createMockPrice({ id: 'price_basic', unitAmount: 1000 });
      const newPrice = createMockPrice({ id: 'price_premium', unitAmount: 5000 });

      const mockResponse = {
        data: {
          changeDetails: {
            isDowngrade: false,
            isUpgrade: true,
            newPrice,
            oldPrice,
          },
          message: 'Subscription upgraded immediately with proration',
          subscription: upgradedSubscription,
        },
        success: true as const,
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_premium' },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.data?.changeDetails?.isUpgrade).toBeTruthy();
      expect(result.current.data?.data?.message).toContain('upgraded');
    });

    it('should handle downgrade (scheduled at period end)', async () => {
      const downgradedSubscription = createMockSubscription({
        id: 'sub_downgrade',
        priceId: 'price_basic',
        status: StripeSubscriptionStatuses.ACTIVE,
      });

      const oldPrice = createMockPrice({ id: 'price_premium', unitAmount: 5000 });
      const newPrice = createMockPrice({ id: 'price_basic', unitAmount: 1000 });

      const mockResponse = {
        data: {
          changeDetails: {
            isDowngrade: true,
            isUpgrade: false,
            newPrice,
            oldPrice,
          },
          message: 'Subscription downgrade scheduled for end of billing period',
          subscription: downgradedSubscription,
        },
        success: true as const,
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_basic' },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.data?.changeDetails?.isDowngrade).toBeTruthy();
      expect(result.current.data?.data?.message).toContain('scheduled');
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      const mockErrorResponse = {
        error: {
          code: 'INVALID_PRICE',
          message: 'Invalid price ID',
        },
        success: false as const,
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_invalid' },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.success).toBeFalsy();
      expect(result.current.data?.error?.message).toBe('Invalid price ID');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network failure');
      vi.spyOn(apiServices, 'switchSubscriptionService').mockRejectedValue(networkError);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            json: { newPriceId: 'price_new' },
            param: { id: 'sub_test' },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBeTruthy();
      });

      expect(result.current.error).toEqual(networkError);
    });

    it('should not retry on failure', async () => {
      const networkError = new Error('Network failure');
      vi.spyOn(apiServices, 'switchSubscriptionService').mockRejectedValue(networkError);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            json: { newPriceId: 'price_new' },
            param: { id: 'sub_test' },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBeTruthy();
      });

      // Should only be called once (no retries)
      expect(apiServices.switchSubscriptionService).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache invalidation logic', () => {
    it('should invalidate subscription cache after switch', async () => {
      const subscription1 = createActiveSubscription({ id: 'sub_1', priceId: 'price_old_1' });
      const subscription2 = createActiveSubscription({ id: 'sub_2', priceId: 'price_old_2' });
      const subscription3 = createActiveSubscription({ id: 'sub_3', priceId: 'price_old_3' });

      const updatedSubscription2 = { ...subscription2, priceId: 'price_new_2' };

      const mockResponse = {
        data: {
          message: 'Updated',
          subscription: updatedSubscription2,
        },
        success: true as const,
      };

      // Pre-populate cache with multiple subscriptions
      queryClient.setQueryData<ListSubscriptionsResponse>(queryKeys.subscriptions.list(), {
        data: {
          count: 3,
          items: [subscription1, subscription2, subscription3],
        },
        success: true,
      });

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_new_2' },
          param: { id: 'sub_2' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      // Verify invalidation was called (cache will be refetched on next access)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );

      // Mutation response contains updated subscription
      expect(result.current.data?.data?.subscription.priceId).toBe('price_new_2');
    });

    it('should handle cache update when no existing cache', async () => {
      const updatedSubscription = createActiveSubscription({ priceId: 'price_new' });

      const mockResponse = {
        data: {
          message: 'Updated',
          subscription: updatedSubscription,
        },
        success: true as const,
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { newPriceId: 'price_new' },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      // Should not crash, invalidation will fetch fresh data
      expect(result.current.isSuccess).toBeTruthy();
    });
  });
});

// ============================================================================
// useCancelSubscriptionMutation Tests
// ============================================================================

describe('useCancelSubscriptionMutation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    // Mock services called in onSuccess to prevent hanging
    vi.spyOn(apiServices, 'getUserUsageStatsService').mockResolvedValue(defaultMockUsageData);
    vi.spyOn(apiServices, 'listModelsService').mockResolvedValue(defaultMockModelsData);
  });

  describe('successful subscription cancellation', () => {
    it('should cancel subscription at period end (default)', async () => {
      const canceledSubscription = createCanceledSubscription({
        cancelAtPeriodEnd: true,
        id: 'sub_cancel',
      });

      const mockResponse = {
        data: {
          message: 'Subscription will be canceled at the end of the billing period',
          subscription: canceledSubscription,
        },
        success: true as const,
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { immediately: false },
          param: { id: 'sub_cancel' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.data?.subscription.cancelAtPeriodEnd).toBeTruthy();
      expect(result.current.data?.data?.message).toContain('end of the billing period');
    });

    it('should cancel subscription immediately when requested', async () => {
      const canceledSubscription = createMockSubscription({
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
        id: 'sub_immediate',
        status: StripeSubscriptionStatuses.CANCELED,
      });

      const mockResponse = {
        data: {
          message: 'Subscription canceled immediately',
          subscription: canceledSubscription,
        },
        success: true as const,
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { immediately: true },
          param: { id: 'sub_immediate' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.data?.subscription.status).toBe(StripeSubscriptionStatuses.CANCELED);
      expect(result.current.data?.data?.subscription.canceledAt).toBeTruthy();
    });

    it('should invalidate cache after subscription cancellation', async () => {
      const activeSubscription = createActiveSubscription({ id: 'sub_test' });
      const canceledSubscription = createCanceledSubscription({ id: 'sub_test' });

      const mockResponse = {
        data: {
          message: 'Canceled',
          subscription: canceledSubscription,
        },
        success: true as const,
      };

      // Pre-populate cache
      queryClient.setQueryData<ListSubscriptionsResponse>(queryKeys.subscriptions.list(), {
        data: {
          count: 1,
          items: [activeSubscription],
        },
        success: true,
      });

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { immediately: false },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      // Verify cache was invalidated (will refetch on next access)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );

      // Mutation response contains canceled subscription
      expect(result.current.data?.data?.subscription.cancelAtPeriodEnd).toBeTruthy();
    });

    it('should invalidate related queries after cancellation', async () => {
      const canceledSubscription = createCanceledSubscription();

      const mockResponse = {
        data: {
          message: 'Canceled',
          subscription: canceledSubscription,
        },
        success: true as const,
      };

      const mockUsageData = {
        data: { creditsLimit: 100, creditsUsed: 0, modelsLimit: 1, modelsUsed: 0 },
        success: true as const,
      };

      const mockModelsData = {
        data: { count: 0, items: [] },
        success: true as const,
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);
      vi.spyOn(apiServices, 'getUserUsageStatsService').mockResolvedValue(mockUsageData);
      vi.spyOn(apiServices, 'listModelsService').mockResolvedValue(mockModelsData);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { immediately: false },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      // Verify subscriptions invalidated
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );

      // Verify usage data fetched and set (reverts to free tier limits)
      expect(apiServices.getUserUsageStatsService).toHaveBeenCalledWith({ bypassCache: true });
      expect(setQueryDataSpy).toHaveBeenCalledWith(queryKeys.usage.stats(), mockUsageData);

      // Verify models data fetched and set (loses premium model access)
      expect(apiServices.listModelsService).toHaveBeenCalledWith({ bypassCache: true });
      expect(setQueryDataSpy).toHaveBeenCalledWith(queryKeys.models.list(), mockModelsData);
    });
  });

  describe('error handling', () => {
    it('should handle cancellation errors', async () => {
      const mockErrorResponse = {
        error: {
          code: 'ALREADY_CANCELED',
          message: 'Subscription already canceled',
        },
        success: false as const,
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { immediately: false },
          param: { id: 'sub_test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.success).toBeFalsy();
      expect(result.current.data?.error?.message).toBe('Subscription already canceled');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network failure');
      vi.spyOn(apiServices, 'cancelSubscriptionService').mockRejectedValue(networkError);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            json: { immediately: false },
            param: { id: 'sub_test' },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBeTruthy();
      });

      expect(result.current.error).toEqual(networkError);
    });

    it('should not retry on failure', async () => {
      const networkError = new Error('Network failure');
      vi.spyOn(apiServices, 'cancelSubscriptionService').mockRejectedValue(networkError);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            json: { immediately: false },
            param: { id: 'sub_test' },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBeTruthy();
      });

      // Should only be called once (no retries)
      expect(apiServices.cancelSubscriptionService).toHaveBeenCalledTimes(1);
    });
  });

  describe('grace period handling', () => {
    it('should handle cancellation during grace period', async () => {
      const now = new Date();
      const gracePeriodSubscription = createMockSubscription({
        currentPeriodEnd: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // Expired 2 days ago
        id: 'sub_grace',
        status: StripeSubscriptionStatuses.PAST_DUE,
      });

      const mockResponse = {
        data: {
          message: 'Subscription canceled during grace period',
          subscription: gracePeriodSubscription,
        },
        success: true as const,
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          json: { immediately: true },
          param: { id: 'sub_grace' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBeTruthy();
      });

      expect(result.current.data?.data?.subscription.status).toBe(StripeSubscriptionStatuses.PAST_DUE);
    });
  });
});
