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

export const DEFAULT_UI_BILLING_INTERVAL: UIBillingInterval = 'month';

export const UIBillingIntervalSchema = z.enum(UI_BILLING_INTERVALS).openapi({
  description: 'UI billing cycle interval (monthly/annual)',
  example: 'month',
});

export type UIBillingInterval = z.infer<typeof UIBillingIntervalSchema>;

export const UIBillingIntervals = {
  MONTH: 'month' as const,
  YEAR: 'year' as const,
} as const;

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
// SUBSCRIPTION TIER
// ============================================================================

export const SUBSCRIPTION_TIERS = ['free', 'starter', 'pro', 'power'] as const;

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = 'free';

export const SubscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS).openapi({
  description: 'Subscription tier for user account',
  example: 'pro',
});

export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export const SubscriptionTiers = {
  FREE: 'free' as const,
  STARTER: 'starter' as const,
  PRO: 'pro' as const,
  POWER: 'power' as const,
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

export const UsageStatuses = {
  DEFAULT: 'default' as const,
  WARNING: 'warning' as const,
  CRITICAL: 'critical' as const,
} as const;

export const UsageStatusMetadata: Record<UsageStatus, {
  label: string;
  color: string;
  textColor: string;
  progressColor: string;
  threshold: number;
}> = {
  [UsageStatuses.DEFAULT]: {
    label: 'Normal',
    color: 'bg-primary',
    textColor: 'text-foreground',
    progressColor: 'bg-primary',
    threshold: 0.5,
  },
  [UsageStatuses.WARNING]: {
    label: 'Low Credits',
    color: 'bg-warning',
    textColor: 'text-orange-600 dark:text-orange-500',
    progressColor: 'bg-warning',
    threshold: 0.2,
  },
  [UsageStatuses.CRITICAL]: {
    label: 'Critical',
    color: 'bg-destructive',
    textColor: 'text-destructive',
    progressColor: 'bg-destructive',
    threshold: 0.1,
  },
} as const;

export function getUsageStatusFromPercentage(remaining: number, total: number): UsageStatus {
  const percentage = total > 0 ? remaining / total : 1;

  if (percentage <= UsageStatusMetadata[UsageStatuses.CRITICAL].threshold) {
    return UsageStatuses.CRITICAL;
  }
  if (percentage <= UsageStatusMetadata[UsageStatuses.WARNING].threshold) {
    return UsageStatuses.WARNING;
  }
  return UsageStatuses.DEFAULT;
}

// ============================================================================
// PLAN TYPE (Credit-based system - replaces tiers)
// ============================================================================

export const PLAN_TYPES = ['free', 'paid'] as const;

export const DEFAULT_PLAN_TYPE: PlanType = 'free';

export const PlanTypeSchema = z.enum(PLAN_TYPES).openapi({
  description: 'User plan type: free (10K signup credits) or paid ($100/month, 1M credits)',
  example: 'free',
});

export type PlanType = z.infer<typeof PlanTypeSchema>;

export const PlanTypes = {
  FREE: 'free' as const,
  PAID: 'paid' as const,
} as const;

// ============================================================================
// CREDIT TRANSACTION TYPE
// ============================================================================

export const CREDIT_TRANSACTION_TYPES = [
  'credit_grant',
  'monthly_refill',
  'purchase',
  'deduction',
  'reservation',
  'release',
  'adjustment',
] as const;

export const CreditTransactionTypeSchema = z.enum(CREDIT_TRANSACTION_TYPES).openapi({
  description: 'Type of credit transaction in the ledger',
  example: 'deduction',
});

export type CreditTransactionType = z.infer<typeof CreditTransactionTypeSchema>;

export const CreditTransactionTypes = {
  CREDIT_GRANT: 'credit_grant' as const,
  MONTHLY_REFILL: 'monthly_refill' as const,
  PURCHASE: 'purchase' as const,
  DEDUCTION: 'deduction' as const,
  RESERVATION: 'reservation' as const,
  RELEASE: 'release' as const,
  ADJUSTMENT: 'adjustment' as const,
} as const;

// ============================================================================
// CREDIT ACTION TYPE
// ============================================================================

export const CREDIT_ACTIONS = [
  'user_message',
  'ai_response',
  'web_search',
  'file_reading',
  'thread_creation',
  'analysis_generation',
  'signup_bonus',
  'monthly_renewal',
  'credit_purchase',
  'card_connection',
] as const;

export const CreditActionSchema = z.enum(CREDIT_ACTIONS).openapi({
  description: 'Action that triggered a credit transaction',
  example: 'ai_response',
});

export type CreditAction = z.infer<typeof CreditActionSchema>;

export const CreditActions = {
  USER_MESSAGE: 'user_message' as const,
  AI_RESPONSE: 'ai_response' as const,
  WEB_SEARCH: 'web_search' as const,
  FILE_READING: 'file_reading' as const,
  THREAD_CREATION: 'thread_creation' as const,
  ANALYSIS_GENERATION: 'analysis_generation' as const,
  SIGNUP_BONUS: 'signup_bonus' as const,
  MONTHLY_RENEWAL: 'monthly_renewal' as const,
  CREDIT_PURCHASE: 'credit_purchase' as const,
  CARD_CONNECTION: 'card_connection' as const,
} as const;
