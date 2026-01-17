/**
 * Billing Types
 *
 * Frontend type definitions for billing-related entities.
 * These types match the API schema structure from apps/api/src/routes/billing/schema.ts
 * but are defined locally for the web app to avoid coupling to backend implementation.
 */

import type { StripeSubscriptionStatus } from '@roundtable/shared';

/**
 * Price information from Stripe
 */
export type Price = {
  id: string;
  productId: string;
  unitAmount: number | null;
  currency: string;
  interval: 'month' | 'year' | null;
  trialPeriodDays: number | null;
  active: boolean;
};

/**
 * Product information from Stripe
 */
export type Product = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  features: string[] | null;
  prices?: Price[];
};

/**
 * Subscription information from Stripe
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
