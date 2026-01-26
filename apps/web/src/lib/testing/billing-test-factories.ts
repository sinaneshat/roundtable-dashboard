/**
 * Billing & Pricing Test Factories
 *
 * Factory functions for creating mock billing data (products, prices)
 * for use in component tests.
 *
 * NOTE: For subscription mocks, use the factories from subscription-mocks.ts
 */

import type { ApiErrorResponse } from '@roundtable/shared';
import { UIBillingIntervals } from '@roundtable/shared';

import type { GetProductResponse, ListProductsResponse, Price, Product } from '@/services/api';

/**
 * Creates a mock price for testing
 */
export function createMockPrice(overrides?: Partial<Price>): Price {
  return {
    active: overrides?.active ?? true,
    currency: overrides?.currency ?? 'usd',
    id: overrides?.id ?? 'price_test_123',
    interval: overrides?.interval ?? UIBillingIntervals.MONTH,
    productId: overrides?.productId ?? 'prod_test_123',
    trialPeriodDays: overrides?.trialPeriodDays ?? null,
    unitAmount: overrides?.unitAmount ?? 999,
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
    active: overrides?.active ?? true,
    description: overrides?.description ?? 'Professional features for power users',
    features: overrides?.features ?? [
      'Unlimited AI conversations',
      'Access to all models',
      'Priority support',
      'Advanced analytics',
    ],
    id: productId,
    name: overrides?.name ?? 'Pro Plan',
    prices: defaultPrices,
  };
}

/**
 * Creates a free tier product (no subscription)
 */
export function createMockFreeProduct(): Product {
  return createMockProduct({
    description: 'Get started with basic features',
    features: [
      '100 credits per month',
      'Basic AI models',
      'Community support',
    ],
    id: 'prod_free',
    name: 'Free Plan',
    prices: [
      createMockPrice({
        id: 'price_free',
        interval: UIBillingIntervals.MONTH,
        productId: 'prod_free',
        unitAmount: 0,
      }),
    ],
  });
}

/**
 * Creates a pro tier product with trial
 */
export function createMockProProduct(): Product {
  return createMockProduct({
    description: 'Advanced features for professionals',
    features: [
      'Unlimited AI conversations',
      'All premium models',
      'Priority support',
      'Advanced analytics',
    ],
    id: 'prod_pro',
    name: 'Pro Plan',
    prices: [
      createMockPrice({
        id: 'price_pro_monthly',
        interval: UIBillingIntervals.MONTH,
        productId: 'prod_pro',
        trialPeriodDays: 14,
        unitAmount: 1999,
      }),
    ],
  });
}

/**
 * Creates an enterprise tier product
 */
export function createMockEnterpriseProduct(): Product {
  return createMockProduct({
    description: 'Custom solutions for teams',
    features: [
      'Everything in Pro',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantees',
      'Volume discounts',
    ],
    id: 'prod_enterprise',
    name: 'Enterprise Plan',
    prices: [
      createMockPrice({
        id: 'price_enterprise_monthly',
        interval: UIBillingIntervals.MONTH,
        productId: 'prod_enterprise',
        unitAmount: 9999,
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
    data: {
      count: products.length,
      items: products,
    },
    success: true,
  };
}

/**
 * Creates a successful product detail API response
 */
export function createProductDetailResponse(product: Product): GetProductResponse {
  return {
    data: {
      product,
    },
    success: true,
  };
}

/**
 * Creates an empty products list API response
 */
export function createEmptyProductsListResponse(): ListProductsResponse {
  return {
    data: {
      count: 0,
      items: [],
    },
    success: true,
  };
}

/**
 * Creates a product error API response
 */
export function createProductErrorResponse(message = 'Product not found'): ApiErrorResponse {
  return {
    error: {
      code: 'NOT_FOUND',
      message,
    },
    success: false,
  };
}

/**
 * Creates a products list error API response
 */
export function createProductsListErrorResponse(message = 'Failed to fetch products'): ApiErrorResponse {
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
    success: false,
  };
}
