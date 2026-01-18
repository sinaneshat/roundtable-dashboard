/**
 * Billing & Pricing Test Factories
 *
 * Factory functions for creating mock billing data (products, prices)
 * for use in component tests.
 *
 * NOTE: For subscription mocks, use the factories from subscription-mocks.ts
 */

import { UIBillingIntervals } from '@roundtable/shared';

import type { GetProductResponse, ListProductsResponse } from '@/services/api';
import type { Price, Product } from '@/types/billing';

/**
 * Creates a mock price for testing
 */
export function createMockPrice(overrides?: Partial<Price>): Price {
  const hasIntervalKey = overrides && 'interval' in overrides;
  const defaultInterval = hasIntervalKey ? (overrides.interval ?? UIBillingIntervals.MONTH) : UIBillingIntervals.MONTH;

  return {
    id: overrides?.id ?? 'price_test_123',
    productId: overrides?.productId ?? 'prod_test_123',
    unitAmount: overrides?.unitAmount ?? 999,
    currency: overrides?.currency ?? 'usd',
    interval: defaultInterval,
    trialPeriodDays: overrides?.trialPeriodDays ?? null,
    active: overrides?.active ?? true,
  };
}

/**
 * Creates a mock product for testing
 */
export function createMockProduct(overrides?: Partial<Product>): Product {
  const productId = overrides?.id ?? 'prod_test_123';

  const hasPricesKey = overrides && 'prices' in overrides;
  const defaultPrices = hasPricesKey ? overrides.prices : [createMockPrice({ productId })];

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
    prices: defaultPrices,
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

// ============================================================================
// Product API Response Factories
// ============================================================================

/**
 * Creates a successful products list API response
 */
export function createProductsListResponse(products: Product[]): ListProductsResponse {
  return {
    success: true,
    data: {
      items: products,
      count: products.length,
    },
  };
}

/**
 * Creates a successful product detail API response
 */
export function createProductDetailResponse(product: Product): GetProductResponse {
  return {
    success: true,
    data: {
      product,
    },
  };
}

/**
 * Creates an empty products list API response
 */
export function createEmptyProductsListResponse(): ListProductsResponse {
  return {
    success: true,
    data: {
      items: [],
      count: 0,
    },
  };
}

/**
 * Creates a product error API response
 */
export function createProductErrorResponse(message = 'Product not found'): GetProductResponse {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message,
    },
  };
}

/**
 * Creates a products list error API response
 */
export function createProductsListErrorResponse(message = 'Failed to fetch products'): ListProductsResponse {
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  };
}
