/**
 * Subscription Query Hooks Tests
 *
 * Tests for subscription data fetching with TanStack Query:
 * - useSubscriptionsQuery - Fetch all user subscriptions
 * - useSubscriptionQuery - Fetch single subscription by ID
 *
 * Uses queryClient.setQueryData() pattern for testing query hooks
 * following the established pattern in pricing-screen.test.tsx
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseAuthCheckReturn } from '@/hooks';
import {
  createActiveSubscription,
  createEmptySubscriptionListResponse,
  createMultipleSubscriptions,
  createSubscriptionDetailResponse,
  createSubscriptionErrorResponse,
  createSubscriptionListErrorResponse,
  createSubscriptionListResponse,
  renderHook,
  waitFor,
} from '@/lib/testing';

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

// Mock state - must be hoisted
const { mockState } = vi.hoisted(() => ({
  mockState: {
    authState: {
      isAuthenticated: true,
      isPending: false,
      userId: 'test-user-id',
    } as UseAuthCheckReturn,
  },
}));

// Mock auth check hook
vi.mock('@/hooks/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...actual,
    useAuthCheck: () => mockState.authState,
  };
});

// ============================================================================
// useSubscriptionsQuery Tests
// ============================================================================

describe('useSubscriptionsQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockState.authState = {
      isAuthenticated: true,
      isPending: false,
      userId: 'test-user-id',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return multiple subscriptions from cache', async () => {
    const mockSubscriptions = createMultipleSubscriptions();
    const mockResponse = createSubscriptionListResponse(mockSubscriptions);

    queryClient.setQueryData(['subscriptions', 'current'], mockResponse);

    const { result } = renderHook(() => useSubscriptionsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data?.items).toHaveLength(3);
    expect(result.current.data?.success).toBe(true);
  });

  it('should return empty list from cache', async () => {
    const mockResponse = createEmptySubscriptionListResponse();

    queryClient.setQueryData(['subscriptions', 'current'], mockResponse);

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
    mockState.authState = {
      isAuthenticated: false,
      isPending: false,
      userId: undefined,
    };

    const { result } = renderHook(() => useSubscriptionsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('should return error response from cache', async () => {
    const mockErrorResponse = createSubscriptionListErrorResponse('Failed to fetch subscriptions');

    queryClient.setQueryData(['subscriptions', 'current'], mockErrorResponse);

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
    mockState.authState = {
      isAuthenticated: true,
      isPending: false,
      userId: 'test-user-id',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return specific subscription from cache', async () => {
    const mockSubscription = createActiveSubscription({ id: 'sub_test_123' });
    const mockResponse = createSubscriptionDetailResponse(mockSubscription);

    queryClient.setQueryData(['subscriptions', 'detail', 'sub_test_123'], mockResponse);

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
    mockState.authState = {
      isAuthenticated: false,
      isPending: false,
      userId: undefined,
    };

    const { result } = renderHook(() => useSubscriptionQuery('sub_test'), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('should not fetch when subscriptionId is empty', async () => {
    const { result } = renderHook(() => useSubscriptionQuery(''), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('should return not found error from cache', async () => {
    const mockErrorResponse = createSubscriptionErrorResponse('Subscription not found');

    queryClient.setQueryData(['subscriptions', 'detail', 'sub_nonexistent'], mockErrorResponse);

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

  it('should return unauthorized error from cache', async () => {
    const unauthorizedResponse = createSubscriptionErrorResponse('Unauthorized');

    queryClient.setQueryData(['subscriptions', 'detail', 'sub_other_user'], unauthorizedResponse);

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
