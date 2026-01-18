/**
 * Billing types - Manually defined from API schema
 *
 * These types match the API response schemas exactly.
 * Used when Hono type inference doesn't work properly.
 */

import type { StripeSubscriptionStatus } from '@roundtable/shared';

/**
 * Subscription type matching API response
 */
export type Subscription = {
  id: string;
  status: StripeSubscriptionStatus;
  priceId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  price: {
    productId: string;
  };
};

/**
 * Price type from product prices array
 */
export type Price = {
  id: string;
  productId: string;
  currency: string;
  unitAmount: number | null;
  interval: string;
  intervalCount: number;
  trialPeriodDays: number | null;
};

/**
 * Product type from products list
 */
export type Product = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  features: string[];
  prices?: Price[];
};
