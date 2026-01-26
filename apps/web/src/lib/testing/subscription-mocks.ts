/**
 * Subscription Test Mock Factories
 *
 * Factory functions for creating mock subscription data for testing.
 * Provides type-safe mocks for subscriptions and API responses.
 *
 * NOTE: For product and price mocks, import from billing-test-factories.ts
 */

import type { ApiErrorResponse, StripeSubscriptionStatus } from '@roundtable/shared';
import { StripeSubscriptionStatuses } from '@roundtable/shared';

import type {
  GetSubscriptionResponse,
  ListSubscriptionsResponse,
  Subscription,
} from '@/services/api';

// ============================================================================
// Subscription Factory
// ============================================================================

type MockSubscriptionData = {
  id?: string;
  status?: StripeSubscriptionStatus;
  priceId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: Date | string;
  currentPeriodEnd?: Date | string;
  canceledAt?: Date | string | null;
  trialStart?: Date | string | null;
  trialEnd?: Date | string | null;
  productId?: string;
};

export function createMockSubscription(data?: MockSubscriptionData): Subscription {
  const now = new Date();
  const periodStart = data?.currentPeriodStart
    ? new Date(data.currentPeriodStart)
    : new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
  const periodEnd = data?.currentPeriodEnd
    ? new Date(data.currentPeriodEnd)
    : new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

  return {
    cancelAtPeriodEnd: data?.cancelAtPeriodEnd ?? false,
    canceledAt: data?.canceledAt ? new Date(data.canceledAt).toISOString() : null,
    currentPeriodEnd: periodEnd.toISOString(),
    currentPeriodStart: periodStart.toISOString(),
    id: data?.id ?? 'sub_test_active',
    price: {
      productId: data?.productId ?? 'prod_test_pro',
    },
    priceId: data?.priceId ?? 'price_test_monthly',
    status: data?.status ?? StripeSubscriptionStatuses.ACTIVE,
    trialEnd: data?.trialEnd ? new Date(data.trialEnd).toISOString() : null,
    trialStart: data?.trialStart ? new Date(data.trialStart).toISOString() : null,
  };
}

// ============================================================================
// Active Subscription Presets
// ============================================================================

export function createActiveSubscription(overrides?: MockSubscriptionData | string): Subscription {
  const data = typeof overrides === 'string' ? { priceId: overrides } : overrides;
  return createMockSubscription({
    cancelAtPeriodEnd: false,
    id: 'sub_active_test',
    status: StripeSubscriptionStatuses.ACTIVE,
    ...data,
  });
}

export function createCanceledSubscription(overrides?: MockSubscriptionData): Subscription {
  const now = new Date();
  return createMockSubscription({
    cancelAtPeriodEnd: true,
    canceledAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    currentPeriodEnd: new Date(now.getTime() + 13 * 24 * 60 * 60 * 1000), // 13 days from now
    id: 'sub_canceled',
    status: StripeSubscriptionStatuses.CANCELED,
    ...overrides,
  });
}

export function createPastDueSubscription(overrides?: MockSubscriptionData): Subscription {
  return createMockSubscription({
    cancelAtPeriodEnd: false,
    id: 'sub_past_due',
    status: StripeSubscriptionStatuses.PAST_DUE,
    ...overrides,
  });
}

export function createTrialingSubscription(overrides?: MockSubscriptionData | string): Subscription {
  const data = typeof overrides === 'string' ? { priceId: overrides } : overrides;
  const now = new Date();
  return createMockSubscription({
    cancelAtPeriodEnd: false,
    id: 'sub_trialing',
    status: StripeSubscriptionStatuses.TRIALING,
    trialEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    trialStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    ...data,
  });
}

export function createIncompleteSubscription(overrides?: MockSubscriptionData): Subscription {
  return createMockSubscription({
    cancelAtPeriodEnd: false,
    id: 'sub_incomplete',
    status: StripeSubscriptionStatuses.INCOMPLETE,
    ...overrides,
  });
}

export function createCancelingSubscription(overrides?: MockSubscriptionData | string): Subscription {
  const data = typeof overrides === 'string' ? { priceId: overrides } : overrides;
  return createMockSubscription({
    cancelAtPeriodEnd: true,
    id: 'sub_canceling',
    status: StripeSubscriptionStatuses.ACTIVE,
    ...data,
  });
}

// ============================================================================
// API Response Factories
// ============================================================================

export function createSubscriptionListResponse(
  subscriptions: Subscription[],
): ListSubscriptionsResponse {
  return {
    data: {
      count: subscriptions.length,
      items: subscriptions,
    },
    success: true,
  };
}

export function createSubscriptionDetailResponse(
  subscription: Subscription,
): GetSubscriptionResponse {
  return {
    data: {
      subscription,
    },
    success: true,
  };
}

export function createEmptySubscriptionListResponse(): ListSubscriptionsResponse {
  return {
    data: {
      count: 0,
      items: [],
    },
    success: true,
  };
}

// ============================================================================
// Error Response Factories
// ============================================================================

export function createSubscriptionErrorResponse(message = 'Subscription not found'): ApiErrorResponse {
  return {
    error: {
      code: 'NOT_FOUND',
      message,
    },
    success: false,
  };
}

export function createSubscriptionListErrorResponse(message = 'Failed to fetch subscriptions'): ApiErrorResponse {
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
    success: false,
  };
}

// ============================================================================
// Subscription State Scenarios
// ============================================================================

/**
 * Create a subscription nearing expiry (3 days left)
 */
export function createNearExpirySubscription(): Subscription {
  const now = new Date();
  return createMockSubscription({
    cancelAtPeriodEnd: true,
    canceledAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000), // Canceled 25 days ago
    currentPeriodEnd: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    currentPeriodStart: new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000),
    id: 'sub_near_expiry',
    status: StripeSubscriptionStatuses.ACTIVE,
  });
}

/**
 * Create a subscription in grace period (expired but still active for a few days)
 */
export function createGracePeriodSubscription(): Subscription {
  const now = new Date();
  return createMockSubscription({
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // Expired 2 days ago
    currentPeriodStart: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000),
    id: 'sub_grace_period',
    status: StripeSubscriptionStatuses.PAST_DUE,
  });
}

/**
 * Create a subscription that just started (1 day old)
 */
export function createNewSubscription(): Subscription {
  const now = new Date();
  return createMockSubscription({
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000), // 29 days from now
    currentPeriodStart: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    id: 'sub_new',
    status: StripeSubscriptionStatuses.ACTIVE,
  });
}

/**
 * Create multiple subscriptions for testing list state
 */
export function createMultipleSubscriptions(): Subscription[] {
  return [
    createActiveSubscription({ id: 'sub_1', priceId: 'price_monthly_pro' }),
    createCanceledSubscription({ id: 'sub_2', priceId: 'price_yearly_premium' }),
    createTrialingSubscription({ id: 'sub_3', priceId: 'price_monthly_starter' }),
  ];
}
