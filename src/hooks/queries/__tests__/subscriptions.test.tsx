/**
 * Subscription Query Hooks Tests
 *
 * Simplified tests for subscription data fetching with TanStack Query:
 * - useSubscriptionsQuery - Fetch all user subscriptions
 * - useSubscriptionQuery - Fetch single subscription by ID
 *
 * Coverage:
 * - Successful data fetching
 * - Authentication state handling
 * - Error responses from API
 * - Query configuration (retry, staleTime)
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createActiveSubscription,
  createEmptySubscriptionListResponse,
  createMultipleSubscriptions,
  createSubscriptionDetailResponse,
  createSubscriptionErrorResponse,
  createSubscriptionListErrorResponse,
  createSubscriptionListResponse,
} from '@/lib/testing';
import * as apiServices from '@/services/api';

import { useSubscriptionQuery, useSubscriptionsQuery } from '../subscriptions';

// ============================================================================
// Test Setup
// ============================================================================

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
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

// Mock auth check hook - default to authenticated
vi.mock('@/hooks/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...actual,
    useAuthCheck: vi.fn(() => ({ isAuthenticated: true, isPending: false, userId: 'test-user-id' })),
  };
});

// ============================================================================
// useSubscriptionsQuery Tests
// ============================================================================

describe('useSubscriptionsQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  it('should fetch and return multiple subscriptions', async () => {
    const mockSubscriptions = createMultipleSubscriptions();
    const mockResponse = createSubscriptionListResponse(mockSubscriptions);

    vi.spyOn(apiServices, 'getSubscriptionsService').mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSubscriptionsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data?.items).toHaveLength(3);
    expect(result.current.data?.success).toBe(true);
  });

  it('should return empty list when user has no subscriptions', async () => {
    const mockResponse = createEmptySubscriptionListResponse();

    vi.spyOn(apiServices, 'getSubscriptionsService').mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSubscriptionsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data?.items).toHaveLength(0);
    expect(result.current.data?.data?.count).toBe(0);
  });

  it('should not fetch when user is not authenticated', async () => {
    const { useAuthCheck } = await import('@/hooks/utils');
    vi.mocked(useAuthCheck).mockReturnValueOnce({ isAuthenticated: false });

    const serviceSpy = vi.spyOn(apiServices, 'getSubscriptionsService');

    const { result } = renderHook(() => useSubscriptionsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
    expect(serviceSpy).not.toHaveBeenCalled();
  });

  it('should handle API error responses', async () => {
    const mockErrorResponse = createSubscriptionListErrorResponse('Failed to fetch subscriptions');

    vi.spyOn(apiServices, 'getSubscriptionsService').mockResolvedValue(mockErrorResponse);

    const { result } = renderHook(() => useSubscriptionsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(false);
    expect(result.current.data?.error?.message).toBe('Failed to fetch subscriptions');
  });
});

// ============================================================================
// useSubscriptionQuery Tests
// ============================================================================

describe('useSubscriptionQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  it('should fetch and return specific subscription by ID', async () => {
    const mockSubscription = createActiveSubscription({ id: 'sub_test_123' });
    const mockResponse = createSubscriptionDetailResponse(mockSubscription);

    vi.spyOn(apiServices, 'getSubscriptionService').mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSubscriptionQuery('sub_test_123'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data?.subscription.id).toBe('sub_test_123');
    expect(result.current.data?.success).toBe(true);
  });

  it('should not fetch when user is not authenticated', async () => {
    const { useAuthCheck } = await import('@/hooks/utils');
    vi.mocked(useAuthCheck).mockReturnValueOnce({ isAuthenticated: false });

    const serviceSpy = vi.spyOn(apiServices, 'getSubscriptionService');

    const { result } = renderHook(() => useSubscriptionQuery('sub_test'), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
    expect(serviceSpy).not.toHaveBeenCalled();
  });

  it('should not fetch when subscriptionId is empty', async () => {
    const serviceSpy = vi.spyOn(apiServices, 'getSubscriptionService');

    const { result } = renderHook(() => useSubscriptionQuery(''), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
    expect(serviceSpy).not.toHaveBeenCalled();
  });

  it('should handle subscription not found error', async () => {
    const mockErrorResponse = createSubscriptionErrorResponse('Subscription not found');

    vi.spyOn(apiServices, 'getSubscriptionService').mockResolvedValue(mockErrorResponse);

    const { result } = renderHook(() => useSubscriptionQuery('sub_nonexistent'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(false);
    expect(result.current.data?.error?.code).toBe('NOT_FOUND');
    expect(result.current.data?.error?.message).toBe('Subscription not found');
  });

  it('should handle unauthorized access error', async () => {
    const unauthorizedResponse = createSubscriptionErrorResponse('Unauthorized');

    vi.spyOn(apiServices, 'getSubscriptionService').mockResolvedValue(unauthorizedResponse);

    const { result } = renderHook(() => useSubscriptionQuery('sub_other_user'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(false);
    expect(result.current.data?.error?.message).toBe('Unauthorized');
  });
});
