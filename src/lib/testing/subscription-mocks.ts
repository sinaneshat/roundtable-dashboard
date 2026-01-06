/**
 * Subscription Test Mock Factories
 *
 * Factory functions for creating mock subscription data for testing.
 * Provides type-safe mocks for subscriptions and API responses.
 *
 * NOTE: For product and price mocks, import from billing-test-factories.ts
 */

import type { StripeSubscriptionStatus } from '@/api/core/enums';
import { StripeSubscriptionStatuses } from '@/api/core/enums';
import type { Subscription } from '@/api/routes/billing/schema';
import type {
  GetSubscriptionResponse,
  GetSubscriptionsResponse,
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
    id: data?.id ?? 'sub_test_active',
    status: data?.status ?? StripeSubscriptionStatuses.ACTIVE,
    priceId: data?.priceId ?? 'price_test_monthly',
    cancelAtPeriodEnd: data?.cancelAtPeriodEnd ?? false,
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    canceledAt: data?.canceledAt ? new Date(data.canceledAt).toISOString() : null,
    trialStart: data?.trialStart ? new Date(data.trialStart).toISOString() : null,
    trialEnd: data?.trialEnd ? new Date(data.trialEnd).toISOString() : null,
    price: {
      productId: data?.productId ?? 'prod_test_pro',
    },
  };
}

// ============================================================================
// Active Subscription Presets
// ============================================================================

export function createActiveSubscription(overrides?: MockSubscriptionData | string): Subscription {
  const data = typeof overrides === 'string' ? { priceId: overrides } : overrides;
  return createMockSubscription({
    id: 'sub_active',
    status: StripeSubscriptionStatuses.ACTIVE,
    cancelAtPeriodEnd: false,
    ...data,
  });
}

export function createCanceledSubscription(overrides?: MockSubscriptionData): Subscription {
  const now = new Date();
  return createMockSubscription({
    id: 'sub_canceled',
    status: StripeSubscriptionStatuses.CANCELED,
    cancelAtPeriodEnd: true,
    canceledAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    currentPeriodEnd: new Date(now.getTime() + 13 * 24 * 60 * 60 * 1000), // 13 days from now
    ...overrides,
  });
}

export function createPastDueSubscription(overrides?: MockSubscriptionData): Subscription {
  return createMockSubscription({
    id: 'sub_past_due',
    status: StripeSubscriptionStatuses.PAST_DUE,
    cancelAtPeriodEnd: false,
    ...overrides,
  });
}

export function createTrialingSubscription(overrides?: MockSubscriptionData): Subscription {
  const now = new Date();
  return createMockSubscription({
    id: 'sub_trialing',
    status: StripeSubscriptionStatuses.TRIALING,
    trialStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    trialEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    cancelAtPeriodEnd: false,
    ...overrides,
  });
}

export function createIncompleteSubscription(overrides?: MockSubscriptionData): Subscription {
  return createMockSubscription({
    id: 'sub_incomplete',
    status: StripeSubscriptionStatuses.INCOMPLETE,
    cancelAtPeriodEnd: false,
    ...overrides,
  });
}

// ============================================================================
// API Response Factories
// ============================================================================

export function createSubscriptionListResponse(
  subscriptions: Subscription[],
): GetSubscriptionsResponse {
  return {
    success: true,
    data: {
      items: subscriptions,
      count: subscriptions.length,
    },
  };
}

export function createSubscriptionDetailResponse(
  subscription: Subscription,
): GetSubscriptionResponse {
  return {
    success: true,
    data: {
      subscription,
    },
  };
}

export function createEmptySubscriptionListResponse(): GetSubscriptionsResponse {
  return {
    success: true,
    data: {
      items: [],
      count: 0,
    },
  };
}

// ============================================================================
// Error Response Factories
// ============================================================================

export function createSubscriptionErrorResponse(message = 'Subscription not found'): GetSubscriptionResponse {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message,
    },
  };
}

export function createSubscriptionListErrorResponse(message = 'Failed to fetch subscriptions'): GetSubscriptionsResponse {
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
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
    id: 'sub_near_expiry',
    status: StripeSubscriptionStatuses.ACTIVE,
    cancelAtPeriodEnd: true,
    canceledAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000), // Canceled 25 days ago
    currentPeriodStart: new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
  });
}

/**
 * Create a subscription in grace period (expired but still active for a few days)
 */
export function createGracePeriodSubscription(): Subscription {
  const now = new Date();
  return createMockSubscription({
    id: 'sub_grace_period',
    status: StripeSubscriptionStatuses.PAST_DUE,
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // Expired 2 days ago
  });
}

/**
 * Create a subscription that just started (1 day old)
 */
export function createNewSubscription(): Subscription {
  const now = new Date();
  return createMockSubscription({
    id: 'sub_new',
    status: StripeSubscriptionStatuses.ACTIVE,
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    currentPeriodEnd: new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000), // 29 days from now
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
