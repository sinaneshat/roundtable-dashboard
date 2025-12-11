/**
 * Billing and Subscription Enums
 *
 * Enums for subscription management, billing intervals, and usage tracking.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// BILLING INTERVAL
// ============================================================================

export const BILLING_INTERVALS = ['month', 'year', 'week', 'day'] as const;

export const BillingIntervalSchema = z.enum(BILLING_INTERVALS).openapi({
  description: 'Subscription billing cycle interval',
  example: 'month',
});

export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

export const BillingIntervals = {
  MONTH: 'month' as const,
  YEAR: 'year' as const,
  WEEK: 'week' as const,
  DAY: 'day' as const,
} as const;

// ============================================================================
// UI BILLING INTERVAL (subset for pricing UI)
// ============================================================================

export const UI_BILLING_INTERVALS = ['month', 'year'] as const;

export const UIBillingIntervalSchema = z.enum(UI_BILLING_INTERVALS).openapi({
  description: 'UI billing cycle interval (monthly/annual)',
  example: 'month',
});

export type UIBillingInterval = z.infer<typeof UIBillingIntervalSchema>;

export const UIBillingIntervals = {
  MONTH: 'month' as const,
  YEAR: 'year' as const,
} as const;

export const DEFAULT_UI_BILLING_INTERVAL: UIBillingInterval = 'month';

/**
 * Type guard to validate UIBillingInterval from string
 */
export function isUIBillingInterval(value: string): value is UIBillingInterval {
  return UI_BILLING_INTERVALS.includes(value as UIBillingInterval);
}

// ============================================================================
// SUBSCRIPTION CHANGE TYPE
// ============================================================================

export const SUBSCRIPTION_CHANGE_TYPES = ['upgrade', 'downgrade', 'change'] as const;

export const SubscriptionChangeTypeSchema = z.enum(SUBSCRIPTION_CHANGE_TYPES).openapi({
  description: 'Type of subscription change',
  example: 'upgrade',
});

export type SubscriptionChangeType = z.infer<typeof SubscriptionChangeTypeSchema>;

export const SubscriptionChangeTypes = {
  UPGRADE: 'upgrade' as const,
  DOWNGRADE: 'downgrade' as const,
  CHANGE: 'change' as const,
} as const;

// ============================================================================
// STRIPE SUBSCRIPTION STATUS
// ============================================================================

export const STRIPE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;

export const StripeSubscriptionStatusSchema = z.enum(STRIPE_SUBSCRIPTION_STATUSES).openapi({
  description: 'Stripe subscription status matching Stripe API values',
  example: 'active',
});

export type StripeSubscriptionStatus = z.infer<typeof StripeSubscriptionStatusSchema>;

export const StripeSubscriptionStatuses = {
  ACTIVE: 'active' as const,
  TRIALING: 'trialing' as const,
  PAST_DUE: 'past_due' as const,
  UNPAID: 'unpaid' as const,
  CANCELED: 'canceled' as const,
  INCOMPLETE: 'incomplete' as const,
  INCOMPLETE_EXPIRED: 'incomplete_expired' as const,
  PAUSED: 'paused' as const,
} as const;

// ============================================================================
// USAGE STATUS
// ============================================================================

export const USAGE_STATUSES = ['default', 'warning', 'critical'] as const;

export const UsageStatusSchema = z.enum(USAGE_STATUSES).openapi({
  description: 'Visual status indicator for usage metrics',
  example: 'default',
});

export type UsageStatus = z.infer<typeof UsageStatusSchema>;
