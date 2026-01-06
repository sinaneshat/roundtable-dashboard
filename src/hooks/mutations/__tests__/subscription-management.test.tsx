/**
 * Subscription Management Mutation Tests
 *
 * Tests for subscription modification mutations with TanStack Query:
 * - useSwitchSubscriptionMutation - Switch between subscription plans
 * - useCancelSubscriptionMutation - Cancel subscription
 *
 * Coverage:
 * - Mutation execution
 * - Cache updates (optimistic and on success)
 * - Query invalidation
 * - Error handling
 * - Related query updates (usage, models)
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StripeSubscriptionStatuses } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import {
  createActiveSubscription,
  createCanceledSubscription,
  createMockPrice,
  createMockSubscription,
  createSubscriptionListResponse,
} from '@/lib/testing';
import type { GetSubscriptionsResponse } from '@/services/api';
import * as apiServices from '@/services/api';

import {
  useCancelSubscriptionMutation,
  useSwitchSubscriptionMutation,
} from '../subscription-management';

// ============================================================================
// Test Setup
// ============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

type WrapperProps = {
  children: ReactNode;
};

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

// ============================================================================
// useSwitchSubscriptionMutation Tests
// ============================================================================

describe('useSwitchSubscriptionMutation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  describe('Successful Subscription Switch', () => {
    it('should switch subscription and update cache', async () => {
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
        success: true as const,
        data: {
          subscription: updatedSubscription,
          message: 'Subscription upgraded successfully',
          changeDetails: {
            oldPrice,
            newPrice,
            isUpgrade: true,
            isDowngrade: false,
          },
        },
      };

      // Pre-populate cache with old subscription
      queryClient.setQueryData<GetSubscriptionsResponse>(queryKeys.subscriptions.list(), {
        success: true,
        data: {
          items: [oldSubscription],
          count: 1,
        },
      });

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Execute mutation
      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_old' },
          json: { newPriceId: 'price_monthly_pro' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify cache was updated
      const cachedData = queryClient.getQueryData<GetSubscriptionsResponse>(
        queryKeys.subscriptions.list(),
      );

      expect(cachedData?.data?.items[0].priceId).toBe('price_monthly_pro');
      expect(apiServices.switchSubscriptionService).toHaveBeenCalledWith({
        param: { id: 'sub_old' },
        json: { newPriceId: 'price_monthly_pro' },
      });
    });

    it('should invalidate subscription queries after switch', async () => {
      const updatedSubscription = createActiveSubscription({ priceId: 'price_new' });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: updatedSubscription,
          message: 'Subscription upgraded',
        },
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { newPriceId: 'price_new' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify subscriptions invalidated
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );

      // Verify usage invalidated (quota limits tied to tier)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.usage.all,
        }),
      );

      // Verify models invalidated (model access tier-based)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.models.all,
        }),
      );
    });

    it('should handle upgrade (immediate proration)', async () => {
      const upgradedSubscription = createActiveSubscription({ priceId: 'price_premium' });
      const oldPrice = createMockPrice({ id: 'price_basic', unitAmount: 1000 });
      const newPrice = createMockPrice({ id: 'price_premium', unitAmount: 5000 });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: upgradedSubscription,
          message: 'Subscription upgraded immediately with proration',
          changeDetails: {
            oldPrice,
            newPrice,
            isUpgrade: true,
            isDowngrade: false,
          },
        },
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { newPriceId: 'price_premium' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.changeDetails?.isUpgrade).toBe(true);
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
        success: true as const,
        data: {
          subscription: downgradedSubscription,
          message: 'Subscription downgrade scheduled for end of billing period',
          changeDetails: {
            oldPrice,
            newPrice,
            isUpgrade: false,
            isDowngrade: true,
          },
        },
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { newPriceId: 'price_basic' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.changeDetails?.isDowngrade).toBe(true);
      expect(result.current.data?.data?.message).toContain('scheduled');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      const mockErrorResponse = {
        success: false as const,
        error: {
          code: 'INVALID_PRICE',
          message: 'Invalid price ID',
        },
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { newPriceId: 'price_invalid' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(false);
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
            param: { id: 'sub_test' },
            json: { newPriceId: 'price_new' },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
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
            param: { id: 'sub_test' },
            json: { newPriceId: 'price_new' },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Should only be called once (no retries)
      expect(apiServices.switchSubscriptionService).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Update Logic', () => {
    it('should update subscription in list cache', async () => {
      const subscription1 = createActiveSubscription({ id: 'sub_1', priceId: 'price_old_1' });
      const subscription2 = createActiveSubscription({ id: 'sub_2', priceId: 'price_old_2' });
      const subscription3 = createActiveSubscription({ id: 'sub_3', priceId: 'price_old_3' });

      const updatedSubscription2 = { ...subscription2, priceId: 'price_new_2' };

      const mockResponse = {
        success: true as const,
        data: {
          subscription: updatedSubscription2,
          message: 'Updated',
        },
      };

      // Pre-populate cache with multiple subscriptions
      queryClient.setQueryData<GetSubscriptionsResponse>(queryKeys.subscriptions.list(), {
        success: true,
        data: {
          items: [subscription1, subscription2, subscription3],
          count: 3,
        },
      });

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_2' },
          json: { newPriceId: 'price_new_2' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify only sub_2 was updated
      const cachedData = queryClient.getQueryData<GetSubscriptionsResponse>(
        queryKeys.subscriptions.list(),
      );

      expect(cachedData?.data?.items[0].id).toBe('sub_1');
      expect(cachedData?.data?.items[0].priceId).toBe('price_old_1');
      expect(cachedData?.data?.items[1].id).toBe('sub_2');
      expect(cachedData?.data?.items[1].priceId).toBe('price_new_2');
      expect(cachedData?.data?.items[2].id).toBe('sub_3');
      expect(cachedData?.data?.items[2].priceId).toBe('price_old_3');
    });

    it('should handle cache update when no existing cache', async () => {
      const updatedSubscription = createActiveSubscription({ priceId: 'price_new' });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: updatedSubscription,
          message: 'Updated',
        },
      };

      vi.spyOn(apiServices, 'switchSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSwitchSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { newPriceId: 'price_new' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should not crash, invalidation will fetch fresh data
      expect(result.current.isSuccess).toBe(true);
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
  });

  describe('Successful Subscription Cancellation', () => {
    it('should cancel subscription at period end (default)', async () => {
      const canceledSubscription = createCanceledSubscription({
        id: 'sub_cancel',
        cancelAtPeriodEnd: true,
      });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: canceledSubscription,
          message: 'Subscription will be canceled at the end of the billing period',
        },
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_cancel' },
          json: { immediately: false },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.subscription.cancelAtPeriodEnd).toBe(true);
      expect(result.current.data?.data?.message).toContain('end of the billing period');
    });

    it('should cancel subscription immediately when requested', async () => {
      const canceledSubscription = createMockSubscription({
        id: 'sub_immediate',
        status: StripeSubscriptionStatuses.CANCELED,
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
      });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: canceledSubscription,
          message: 'Subscription canceled immediately',
        },
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_immediate' },
          json: { immediately: true },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.subscription.status).toBe(StripeSubscriptionStatuses.CANCELED);
      expect(result.current.data?.data?.subscription.canceledAt).toBeTruthy();
    });

    it('should update cache with canceled subscription', async () => {
      const activeSubscription = createActiveSubscription({ id: 'sub_test' });
      const canceledSubscription = createCanceledSubscription({ id: 'sub_test' });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: canceledSubscription,
          message: 'Canceled',
        },
      };

      // Pre-populate cache
      queryClient.setQueryData<GetSubscriptionsResponse>(queryKeys.subscriptions.list(), {
        success: true,
        data: {
          items: [activeSubscription],
          count: 1,
        },
      });

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { immediately: false },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify cache was updated
      const cachedData = queryClient.getQueryData<GetSubscriptionsResponse>(
        queryKeys.subscriptions.list(),
      );

      expect(cachedData?.data?.items[0].cancelAtPeriodEnd).toBe(true);
    });

    it('should invalidate related queries after cancellation', async () => {
      const canceledSubscription = createCanceledSubscription();

      const mockResponse = {
        success: true as const,
        data: {
          subscription: canceledSubscription,
          message: 'Canceled',
        },
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { immediately: false },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify subscriptions invalidated
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.subscriptions.all,
        }),
      );

      // Verify usage invalidated (reverts to free tier limits)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.usage.all,
        }),
      );

      // Verify models invalidated (loses premium model access)
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.models.all,
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle cancellation errors', async () => {
      const mockErrorResponse = {
        success: false as const,
        error: {
          code: 'ALREADY_CANCELED',
          message: 'Subscription already canceled',
        },
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_test' },
          json: { immediately: false },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(false);
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
            param: { id: 'sub_test' },
            json: { immediately: false },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
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
            param: { id: 'sub_test' },
            json: { immediately: false },
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Should only be called once (no retries)
      expect(apiServices.cancelSubscriptionService).toHaveBeenCalledTimes(1);
    });
  });

  describe('Grace Period Handling', () => {
    it('should handle cancellation during grace period', async () => {
      const now = new Date();
      const gracePeriodSubscription = createMockSubscription({
        id: 'sub_grace',
        status: StripeSubscriptionStatuses.PAST_DUE,
        currentPeriodEnd: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // Expired 2 days ago
      });

      const mockResponse = {
        success: true as const,
        data: {
          subscription: gracePeriodSubscription,
          message: 'Subscription canceled during grace period',
        },
      };

      vi.spyOn(apiServices, 'cancelSubscriptionService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCancelSubscriptionMutation(), {
        wrapper: createWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'sub_grace' },
          json: { immediately: true },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.subscription.status).toBe(StripeSubscriptionStatuses.PAST_DUE);
    });
  });
});
