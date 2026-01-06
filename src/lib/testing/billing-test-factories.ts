/**
 * Billing & Pricing Test Factories
 *
 * Factory functions for creating mock billing data (products, prices, subscriptions)
 * for use in component tests.
 */

import { StripeSubscriptionStatuses, UIBillingIntervals } from '@/api/core/enums';
import type { Price, Product, Subscription } from '@/api/routes/billing/schema';

/**
 * Creates a mock price for testing
 */
export function createMockPrice(overrides?: Partial<Price>): Price {
  return {
    id: overrides?.id ?? 'price_test_123',
    productId: overrides?.productId ?? 'prod_test_123',
    unitAmount: overrides?.unitAmount ?? 999,
    currency: overrides?.currency ?? 'usd',
    interval: overrides?.interval ?? UIBillingIntervals.MONTH,
    trialPeriodDays: overrides?.trialPeriodDays ?? null,
    active: overrides?.active ?? true,
  };
}

/**
 * Creates a mock product for testing
 */
export function createMockProduct(overrides?: Partial<Product>): Product {
  const productId = overrides?.id ?? 'prod_test_123';

  return {
    id: productId,
    name: overrides?.name ?? 'Pro Plan',
    description: overrides?.description ?? 'Professional features for power users',
    active: overrides?.active ?? true,
    features: overrides?.features ?? [
      'Unlimited AI conversations',
      'Access to all models',
      'Priority support',
      'Advanced analytics',
    ],
    prices: overrides?.prices ?? [
      createMockPrice({ productId }),
    ],
  };
}

/**
 * Creates a mock subscription for testing
 */
export function createMockSubscription(overrides?: Partial<Subscription>): Subscription {
  const priceId = overrides?.priceId ?? 'price_test_123';

  return {
    id: overrides?.id ?? 'sub_test_123',
    status: overrides?.status ?? StripeSubscriptionStatuses.ACTIVE,
    priceId,
    cancelAtPeriodEnd: overrides?.cancelAtPeriodEnd ?? false,
    currentPeriodStart: overrides?.currentPeriodStart ?? new Date().toISOString(),
    currentPeriodEnd: overrides?.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    canceledAt: overrides?.canceledAt ?? null,
    trialStart: overrides?.trialStart ?? null,
    trialEnd: overrides?.trialEnd ?? null,
    price: overrides?.price ?? {
      productId: 'prod_test_123',
    },
  };
}

/**
 * Creates a free tier product (no subscription)
 */
export function createMockFreeProduct(): Product {
  return createMockProduct({
    id: 'prod_free',
    name: 'Free Plan',
    description: 'Get started with basic features',
    features: [
      '100 credits per month',
      'Basic AI models',
      'Community support',
    ],
    prices: [
      createMockPrice({
        id: 'price_free',
        productId: 'prod_free',
        unitAmount: 0,
        interval: UIBillingIntervals.MONTH,
      }),
    ],
  });
}

/**
 * Creates a pro tier product with trial
 */
export function createMockProProduct(): Product {
  return createMockProduct({
    id: 'prod_pro',
    name: 'Pro Plan',
    description: 'Advanced features for professionals',
    features: [
      'Unlimited AI conversations',
      'All premium models',
      'Priority support',
      'Advanced analytics',
    ],
    prices: [
      createMockPrice({
        id: 'price_pro_monthly',
        productId: 'prod_pro',
        unitAmount: 1999,
        interval: UIBillingIntervals.MONTH,
        trialPeriodDays: 14,
      }),
    ],
  });
}

/**
 * Creates an enterprise tier product
 */
export function createMockEnterpriseProduct(): Product {
  return createMockProduct({
    id: 'prod_enterprise',
    name: 'Enterprise Plan',
    description: 'Custom solutions for teams',
    features: [
      'Everything in Pro',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantees',
      'Volume discounts',
    ],
    prices: [
      createMockPrice({
        id: 'price_enterprise_monthly',
        productId: 'prod_enterprise',
        unitAmount: 9999,
        interval: UIBillingIntervals.MONTH,
      }),
    ],
  });
}

/**
 * Creates a complete product catalog for testing
 */
export function createMockProductCatalog(): Product[] {
  return [
    createMockFreeProduct(),
    createMockProProduct(),
    createMockEnterpriseProduct(),
  ];
}

/**
 * Creates an active subscription
 */
export function createActiveSubscription(priceId: string): Subscription {
  return createMockSubscription({
    id: 'sub_active_test',
    priceId,
    status: StripeSubscriptionStatuses.ACTIVE,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

/**
 * Creates a trialing subscription
 */
export function createTrialingSubscription(priceId: string): Subscription {
  const now = Date.now();
  return createMockSubscription({
    id: 'sub_trial_test',
    priceId,
    status: StripeSubscriptionStatuses.TRIALING,
    cancelAtPeriodEnd: false,
    trialStart: new Date(now).toISOString(),
    trialEnd: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

/**
 * Creates a subscription marked for cancellation
 */
export function createCancelingSubscription(priceId: string): Subscription {
  return createMockSubscription({
    id: 'sub_canceling_test',
    priceId,
    status: StripeSubscriptionStatuses.ACTIVE,
    cancelAtPeriodEnd: true,
    canceledAt: new Date().toISOString(),
  });
}

/**
 * Creates a canceled subscription
 */
export function createCanceledSubscription(priceId: string): Subscription {
  return createMockSubscription({
    id: 'sub_canceled_test',
    priceId,
    status: StripeSubscriptionStatuses.CANCELED,
    cancelAtPeriodEnd: false,
    canceledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
