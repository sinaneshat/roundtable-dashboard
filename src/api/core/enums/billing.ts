/**
 * Billing and Subscription Enums
 *
 * Enums for subscription management, billing intervals, and usage tracking.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// BILLING INTERVAL
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const BILLING_INTERVALS = ['month', 'year', 'week', 'day'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const BillingIntervalSchema = z.enum(BILLING_INTERVALS).openapi({
  description: 'Subscription billing cycle interval',
  example: 'month',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'month';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const BillingIntervals = {
  MONTH: 'month' as const,
  YEAR: 'year' as const,
  WEEK: 'week' as const,
  DAY: 'day' as const,
} as const;

// ============================================================================
// UI BILLING INTERVAL (subset for pricing UI)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const UI_BILLING_INTERVALS = ['month', 'year'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const UIBillingIntervalSchema = z.enum(UI_BILLING_INTERVALS).openapi({
  description: 'UI billing cycle interval (monthly/annual)',
  example: 'month',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UIBillingInterval = z.infer<typeof UIBillingIntervalSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_UI_BILLING_INTERVAL: UIBillingInterval = 'month';

// 5️⃣ CONSTANT OBJECT - For usage in code
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

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SUBSCRIPTION_CHANGE_TYPES = ['upgrade', 'downgrade', 'change'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SubscriptionChangeTypeSchema = z.enum(SUBSCRIPTION_CHANGE_TYPES).openapi({
  description: 'Type of subscription change',
  example: 'upgrade',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SubscriptionChangeType = z.infer<typeof SubscriptionChangeTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_SUBSCRIPTION_CHANGE_TYPE: SubscriptionChangeType = 'change';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const SubscriptionChangeTypes = {
  UPGRADE: 'upgrade' as const,
  DOWNGRADE: 'downgrade' as const,
  CHANGE: 'change' as const,
} as const;

// ============================================================================
// STRIPE SUBSCRIPTION STATUS
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
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

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const StripeSubscriptionStatusSchema = z.enum(STRIPE_SUBSCRIPTION_STATUSES).openapi({
  description: 'Stripe subscription status matching Stripe API values',
  example: 'active',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type StripeSubscriptionStatus = z.infer<typeof StripeSubscriptionStatusSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_STRIPE_SUBSCRIPTION_STATUS: StripeSubscriptionStatus = 'active';

// 5️⃣ CONSTANT OBJECT - For usage in code
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
// SUBSCRIPTION TIER - SINGLE SOURCE OF TRUTH
// ============================================================================
//
// ⚠️ TYPE-SAFE TIER SYSTEM: Adding/removing tiers will cause TypeScript errors
// in product-logic.service.ts until all tier-specific configurations are updated.
//
// To add a new tier:
// 1. Add it to SUBSCRIPTION_TIERS array below
// 2. Add to SubscriptionTiers object below
// 3. TypeScript will error on TIER_CONFIG in product-logic.service.ts
// 4. Add the new tier's configuration to TIER_CONFIG
// 5. All derived exports will automatically update
//
// This architecture ensures compile-time enforcement of tier consistency.
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SUBSCRIPTION_TIERS = ['free', 'pro'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SubscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS).openapi({
  description: 'Subscription tier for user account',
  example: 'pro',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = 'free';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const SubscriptionTiers = {
  FREE: 'free' as const,
  PRO: 'pro' as const,
} as const;

/**
 * Type utility to ensure exhaustive tier coverage
 * Use this to guarantee all tiers are handled in switch statements
 *
 * @example
 * ```ts
 * function handleTier(tier: SubscriptionTier): string {
 *   switch (tier) {
 *     case 'free': return 'Free';
 *     case 'pro': return 'Pro';
 *     default: return assertNever(tier); // TypeScript error if tier is missed
 *   }
 * }
 * ```
 */
export function assertNeverTier(tier: never): never {
  throw new Error(`Unhandled tier: ${tier}. Update all tier configurations.`);
}

// ============================================================================
// USAGE STATUS
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const USAGE_STATUSES = ['default', 'warning', 'critical'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const UsageStatusSchema = z.enum(USAGE_STATUSES).openapi({
  description: 'Visual status indicator for usage metrics',
  example: 'default',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UsageStatus = z.infer<typeof UsageStatusSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_USAGE_STATUS: UsageStatus = 'default';

// 5️⃣ CONSTANT OBJECT - For usage in code
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

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PLAN_TYPES = ['free', 'paid'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PlanTypeSchema = z.enum(PLAN_TYPES).openapi({
  description: 'User plan type: free (10K signup credits) or paid ($100/month, 1M credits)',
  example: 'free',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PlanType = z.infer<typeof PlanTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_PLAN_TYPE: PlanType = 'free';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PlanTypes = {
  FREE: 'free' as const,
  PAID: 'paid' as const,
} as const;

/**
 * Type guard for PlanType validation
 * Use instead of type casting for type-safe validation
 */
export function isPlanType(value: unknown): value is PlanType {
  return typeof value === 'string' && PLAN_TYPES.includes(value as PlanType);
}

/**
 * Parse and validate PlanType with fallback to default
 * Use for database values that should already be valid
 */
export function parsePlanType(value: unknown): PlanType {
  return isPlanType(value) ? value : DEFAULT_PLAN_TYPE;
}

// ============================================================================
// CREDIT TRANSACTION TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const CREDIT_TRANSACTION_TYPES = [
  'credit_grant',
  'monthly_refill',
  'purchase',
  'deduction',
  'reservation',
  'release',
  'adjustment',
] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CreditTransactionTypeSchema = z.enum(CREDIT_TRANSACTION_TYPES).openapi({
  description: 'Type of credit transaction in the ledger',
  example: 'deduction',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CreditTransactionType = z.infer<typeof CreditTransactionTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_CREDIT_TRANSACTION_TYPE: CreditTransactionType = 'deduction';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const CreditTransactionTypes = {
  CREDIT_GRANT: 'credit_grant' as const,
  MONTHLY_REFILL: 'monthly_refill' as const,
  PURCHASE: 'purchase' as const,
  DEDUCTION: 'deduction' as const,
  RESERVATION: 'reservation' as const,
  RELEASE: 'release' as const,
  ADJUSTMENT: 'adjustment' as const,
} as const;

/**
 * Type guard for CreditTransactionType validation
 */
export function isCreditTransactionType(value: unknown): value is CreditTransactionType {
  return typeof value === 'string' && CREDIT_TRANSACTION_TYPES.includes(value as CreditTransactionType);
}

/**
 * Type-safe map from grant type literals to CreditTransactionType
 * Use instead of runtime string manipulation + casting
 */
const GRANT_TYPE_TO_TRANSACTION: Record<'credit_grant' | 'monthly_refill' | 'purchase', CreditTransactionType> = {
  credit_grant: CreditTransactionTypes.CREDIT_GRANT,
  monthly_refill: CreditTransactionTypes.MONTHLY_REFILL,
  purchase: CreditTransactionTypes.PURCHASE,
};

/**
 * Convert grant type to CreditTransactionType without type casting
 */
export function getGrantTransactionType(
  grantType: 'credit_grant' | 'monthly_refill' | 'purchase',
): CreditTransactionType {
  return GRANT_TYPE_TO_TRANSACTION[grantType];
}

// ============================================================================
// CREDIT ACTION TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
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

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CreditActionSchema = z.enum(CREDIT_ACTIONS).openapi({
  description: 'Action that triggered a credit transaction',
  example: 'ai_response',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CreditAction = z.infer<typeof CreditActionSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_CREDIT_ACTION: CreditAction = 'ai_response';

// 5️⃣ CONSTANT OBJECT - For usage in code
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

// ============================================================================
// PURCHASE TYPE (checkout result classification)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PURCHASE_TYPES = ['subscription', 'credits', 'none'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PurchaseTypeSchema = z.enum(PURCHASE_TYPES).openapi({
  description: 'Type of purchase made during checkout',
  example: 'subscription',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PurchaseType = z.infer<typeof PurchaseTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_PURCHASE_TYPE: PurchaseType = 'none';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PurchaseTypes = {
  SUBSCRIPTION: 'subscription' as const,
  CREDITS: 'credits' as const,
  NONE: 'none' as const,
} as const;

export function isPurchaseType(value: unknown): value is PurchaseType {
  return PURCHASE_TYPES.includes(value as PurchaseType);
}

// ============================================================================
// SUBSCRIPTION PLAN TYPE (billing cycle for subscriptions)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SUBSCRIPTION_PLAN_TYPES = ['monthly', 'yearly', 'lifetime'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SubscriptionPlanTypeSchema = z.enum(SUBSCRIPTION_PLAN_TYPES).openapi({
  description: 'Subscription plan billing cycle type',
  example: 'monthly',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SubscriptionPlanType = z.infer<typeof SubscriptionPlanTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_SUBSCRIPTION_PLAN_TYPE: SubscriptionPlanType = 'monthly';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const SubscriptionPlanTypes = {
  MONTHLY: 'monthly' as const,
  YEARLY: 'yearly' as const,
  LIFETIME: 'lifetime' as const,
} as const;

export function isSubscriptionPlanType(value: unknown): value is SubscriptionPlanType {
  return SUBSCRIPTION_PLAN_TYPES.includes(value as SubscriptionPlanType);
}

// ============================================================================
// BILLING ERROR TYPE (Checkout/Payment Error Classification)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const BILLING_ERROR_TYPES = [
  'payment_failed',
  'sync_failed',
  'authentication_failed',
  'unknown',
] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const BillingErrorTypeSchema = z.enum(BILLING_ERROR_TYPES).openapi({
  description: 'Type of billing/payment error',
  example: 'payment_failed',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type BillingErrorType = z.infer<typeof BillingErrorTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_BILLING_ERROR_TYPE: BillingErrorType = 'unknown';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const BillingErrorTypes = {
  PAYMENT_FAILED: 'payment_failed' as const,
  SYNC_FAILED: 'sync_failed' as const,
  AUTHENTICATION_FAILED: 'authentication_failed' as const,
  UNKNOWN: 'unknown' as const,
} as const;

/**
 * Type guard for BillingErrorType validation
 * Use instead of type casting for type-safe validation from URL params
 */
export function isBillingErrorType(value: unknown): value is BillingErrorType {
  return typeof value === 'string' && BILLING_ERROR_TYPES.includes(value as BillingErrorType);
}

/**
 * Parse and validate BillingErrorType with fallback to default
 * Use for URL params and external data that may be invalid
 */
export function parseBillingErrorType(value: unknown): BillingErrorType {
  return isBillingErrorType(value) ? value : DEFAULT_BILLING_ERROR_TYPE;
}

// ============================================================================
// PAYMENT METHOD TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PAYMENT_METHOD_TYPES = ['card', 'bank_account', 'sepa_debit'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PaymentMethodTypeSchema = z.enum(PAYMENT_METHOD_TYPES).openapi({
  description: 'Type of payment method (Stripe)',
  example: 'card',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_PAYMENT_METHOD_TYPE: PaymentMethodType = 'card';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PaymentMethodTypes = {
  CARD: 'card' as const,
  BANK_ACCOUNT: 'bank_account' as const,
  SEPA_DEBIT: 'sepa_debit' as const,
} as const;

/**
 * Type guard for PaymentMethodType validation
 */
export function isPaymentMethodType(value: unknown): value is PaymentMethodType {
  return typeof value === 'string' && PAYMENT_METHOD_TYPES.includes(value as PaymentMethodType);
}

// ============================================================================
// PRICE TYPE (Stripe price billing type)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PRICE_TYPES = ['one_time', 'recurring'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PriceTypeSchema = z.enum(PRICE_TYPES).openapi({
  description: 'Stripe price billing type',
  example: 'recurring',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PriceType = z.infer<typeof PriceTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_PRICE_TYPE: PriceType = 'recurring';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PriceTypes = {
  ONE_TIME: 'one_time' as const,
  RECURRING: 'recurring' as const,
} as const;

// ============================================================================
// INVOICE STATUS (Stripe invoice lifecycle)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const INVOICE_STATUSES = ['draft', 'open', 'paid', 'uncollectible', 'void'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES).openapi({
  description: 'Stripe invoice lifecycle status',
  example: 'paid',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_INVOICE_STATUS: InvoiceStatus = 'draft';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const InvoiceStatuses = {
  DRAFT: 'draft' as const,
  OPEN: 'open' as const,
  PAID: 'paid' as const,
  UNCOLLECTIBLE: 'uncollectible' as const,
  VOID: 'void' as const,
} as const;
