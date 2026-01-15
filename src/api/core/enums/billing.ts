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

// 2️⃣ DEFAULT VALUE
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'month';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const BillingIntervalSchema = z.enum(BILLING_INTERVALS).openapi({
  description: 'Subscription billing cycle interval',
  example: 'month',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const BillingIntervals = {
  MONTH: 'month' as const,
  YEAR: 'year' as const,
  WEEK: 'week' as const,
  DAY: 'day' as const,
} as const;

// ============================================================================
// UI BILLING INTERVAL (monthly only)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const UI_BILLING_INTERVALS = ['month'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_UI_BILLING_INTERVAL: UIBillingInterval = 'month';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const UIBillingIntervalSchema = z.enum(UI_BILLING_INTERVALS).openapi({
  description: 'UI billing cycle interval (monthly only)',
  example: 'month',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UIBillingInterval = z.infer<typeof UIBillingIntervalSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const UIBillingIntervals = {
  MONTH: 'month' as const,
} as const;

export function isUIBillingInterval(value: string): value is UIBillingInterval {
  return UI_BILLING_INTERVALS.includes(value as UIBillingInterval);
}

// ============================================================================
// SUBSCRIPTION CHANGE TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SUBSCRIPTION_CHANGE_TYPES = ['upgrade', 'downgrade', 'change'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SUBSCRIPTION_CHANGE_TYPE: SubscriptionChangeType = 'change';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SubscriptionChangeTypeSchema = z.enum(SUBSCRIPTION_CHANGE_TYPES).openapi({
  description: 'Type of subscription change',
  example: 'upgrade',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SubscriptionChangeType = z.infer<typeof SubscriptionChangeTypeSchema>;

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

// 2️⃣ DEFAULT VALUE
export const DEFAULT_STRIPE_SUBSCRIPTION_STATUS: StripeSubscriptionStatus = 'active';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const StripeSubscriptionStatusSchema = z.enum(STRIPE_SUBSCRIPTION_STATUSES).openapi({
  description: 'Stripe subscription status matching Stripe API values',
  example: 'active',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type StripeSubscriptionStatus = z.infer<typeof StripeSubscriptionStatusSchema>;

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

// Active subscription status subset (billable states)
export const ACTIVE_SUBSCRIPTION_STATUSES = [
  StripeSubscriptionStatuses.ACTIVE,
  StripeSubscriptionStatuses.TRIALING,
  StripeSubscriptionStatuses.PAST_DUE,
] as const;

export type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isActiveSubscriptionStatus(status: StripeSubscriptionStatus): status is ActiveSubscriptionStatus {
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly StripeSubscriptionStatus[]).includes(status);
}

// ============================================================================
// SYNCED SUBSCRIPTION STATUS (includes 'none' for no subscription)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SYNCED_SUBSCRIPTION_STATUSES = [
  'none',
  ...STRIPE_SUBSCRIPTION_STATUSES,
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SYNCED_SUBSCRIPTION_STATUS: SyncedSubscriptionStatus = 'none';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SyncedSubscriptionStatusSchema = z.enum(SYNCED_SUBSCRIPTION_STATUSES).openapi({
  description: 'Subscription sync status: either no subscription (none) or Stripe status',
  example: 'active',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SyncedSubscriptionStatus = z.infer<typeof SyncedSubscriptionStatusSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const SyncedSubscriptionStatuses = {
  NONE: 'none' as const,
  ...StripeSubscriptionStatuses,
} as const;

export function isSyncedSubscriptionStatus(value: unknown): value is SyncedSubscriptionStatus {
  return typeof value === 'string' && SYNCED_SUBSCRIPTION_STATUSES.includes(value as SyncedSubscriptionStatus);
}

export function hasSubscription(status: SyncedSubscriptionStatus): status is StripeSubscriptionStatus {
  return status !== SyncedSubscriptionStatuses.NONE;
}

// ============================================================================
// SUBSCRIPTION TIER
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SUBSCRIPTION_TIERS = ['free', 'pro'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = 'free';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SubscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS).openapi({
  description: 'Subscription tier for user account',
  example: 'pro',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const SubscriptionTiers = {
  FREE: 'free' as const,
  PRO: 'pro' as const,
} as const;

export function assertNeverTier(tier: never): never {
  throw new Error(`Unhandled tier: ${tier}. Update all tier configurations.`);
}

// ============================================================================
// USAGE STATUS
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const USAGE_STATUSES = ['default', 'warning', 'critical'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_USAGE_STATUS: UsageStatus = 'default';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const UsageStatusSchema = z.enum(USAGE_STATUSES).openapi({
  description: 'Visual status indicator for usage metrics',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UsageStatus = z.infer<typeof UsageStatusSchema>;

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
// PLAN TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PLAN_TYPES = ['free', 'paid'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_PLAN_TYPE: PlanType = 'free';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PlanTypeSchema = z.enum(PLAN_TYPES).openapi({
  description: 'User plan type: free (no subscription, signup credits only) or paid (Pro subscription, 100K credits/month)',
  example: 'free',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PlanType = z.infer<typeof PlanTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PlanTypes = {
  FREE: 'free' as const,
  PAID: 'paid' as const,
} as const;

export function isPlanType(value: unknown): value is PlanType {
  return typeof value === 'string' && PLAN_TYPES.includes(value as PlanType);
}

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

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CREDIT_TRANSACTION_TYPE: CreditTransactionType = 'deduction';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CreditTransactionTypeSchema = z.enum(CREDIT_TRANSACTION_TYPES).openapi({
  description: 'Type of credit transaction in the ledger',
  example: 'deduction',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CreditTransactionType = z.infer<typeof CreditTransactionTypeSchema>;

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

export function isCreditTransactionType(value: unknown): value is CreditTransactionType {
  return typeof value === 'string' && CREDIT_TRANSACTION_TYPES.includes(value as CreditTransactionType);
}

// ============================================================================
// CREDIT GRANT TYPE (subset of transaction types used for granting credits)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for grant types
export const CREDIT_GRANT_TYPES = ['credit_grant', 'monthly_refill', 'purchase'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation
export const CreditGrantTypeSchema = z.enum(CREDIT_GRANT_TYPES).openapi({
  description: 'Type of credit grant operation',
  example: 'credit_grant',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CreditGrantType = z.infer<typeof CreditGrantTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_CREDIT_GRANT_TYPE: CreditGrantType = 'credit_grant';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const CreditGrantTypes = {
  CREDIT_GRANT: 'credit_grant' as const,
  MONTHLY_REFILL: 'monthly_refill' as const,
  PURCHASE: 'purchase' as const,
} as const;

const GRANT_TYPE_TO_TRANSACTION: Record<CreditGrantType, CreditTransactionType> = {
  credit_grant: CreditTransactionTypes.CREDIT_GRANT,
  monthly_refill: CreditTransactionTypes.MONTHLY_REFILL,
  purchase: CreditTransactionTypes.PURCHASE,
};

export function getGrantTransactionType(grantType: CreditGrantType): CreditTransactionType {
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
  'free_round_complete',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CREDIT_ACTION: CreditAction = 'ai_response';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CreditActionSchema = z.enum(CREDIT_ACTIONS).openapi({
  description: 'Action that triggered a credit transaction',
  example: 'ai_response',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CreditAction = z.infer<typeof CreditActionSchema>;

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
  FREE_ROUND_COMPLETE: 'free_round_complete' as const,
} as const;

// ============================================================================
// PURCHASE TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PURCHASE_TYPES = ['subscription', 'none'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_PURCHASE_TYPE: PurchaseType = 'none';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PurchaseTypeSchema = z.enum(PURCHASE_TYPES).openapi({
  description: 'Type of purchase made during checkout',
  example: 'subscription',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PurchaseType = z.infer<typeof PurchaseTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PurchaseTypes = {
  SUBSCRIPTION: 'subscription' as const,
  NONE: 'none' as const,
} as const;

export function isPurchaseType(value: unknown): value is PurchaseType {
  return PURCHASE_TYPES.includes(value as PurchaseType);
}

// ============================================================================
// SUBSCRIPTION PLAN TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SUBSCRIPTION_PLAN_TYPES = ['monthly'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SUBSCRIPTION_PLAN_TYPE: SubscriptionPlanType = 'monthly';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SubscriptionPlanTypeSchema = z.enum(SUBSCRIPTION_PLAN_TYPES).openapi({
  description: 'Subscription plan billing cycle type (monthly only)',
  example: 'monthly',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SubscriptionPlanType = z.infer<typeof SubscriptionPlanTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const SubscriptionPlanTypes = {
  MONTHLY: 'monthly' as const,
} as const;

export function isSubscriptionPlanType(value: unknown): value is SubscriptionPlanType {
  return SUBSCRIPTION_PLAN_TYPES.includes(value as SubscriptionPlanType);
}

// ============================================================================
// BILLING ERROR TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const BILLING_ERROR_TYPES = [
  'payment_failed',
  'sync_failed',
  'authentication_failed',
  'unknown',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_BILLING_ERROR_TYPE: BillingErrorType = 'unknown';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const BillingErrorTypeSchema = z.enum(BILLING_ERROR_TYPES).openapi({
  description: 'Type of billing/payment error',
  example: 'payment_failed',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type BillingErrorType = z.infer<typeof BillingErrorTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const BillingErrorTypes = {
  PAYMENT_FAILED: 'payment_failed' as const,
  SYNC_FAILED: 'sync_failed' as const,
  AUTHENTICATION_FAILED: 'authentication_failed' as const,
  UNKNOWN: 'unknown' as const,
} as const;

export function isBillingErrorType(value: unknown): value is BillingErrorType {
  return typeof value === 'string' && BILLING_ERROR_TYPES.includes(value as BillingErrorType);
}

export function parseBillingErrorType(value: unknown): BillingErrorType {
  return isBillingErrorType(value) ? value : DEFAULT_BILLING_ERROR_TYPE;
}

// ============================================================================
// PAYMENT METHOD TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PAYMENT_METHOD_TYPES = ['card', 'bank_account', 'sepa_debit'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_PAYMENT_METHOD_TYPE: PaymentMethodType = 'card';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PaymentMethodTypeSchema = z.enum(PAYMENT_METHOD_TYPES).openapi({
  description: 'Type of payment method (Stripe)',
  example: 'card',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PaymentMethodTypes = {
  CARD: 'card' as const,
  BANK_ACCOUNT: 'bank_account' as const,
  SEPA_DEBIT: 'sepa_debit' as const,
} as const;

export function isPaymentMethodType(value: unknown): value is PaymentMethodType {
  return typeof value === 'string' && PAYMENT_METHOD_TYPES.includes(value as PaymentMethodType);
}

// ============================================================================
// PRICE TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PRICE_TYPES = ['one_time', 'recurring'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_PRICE_TYPE: PriceType = 'recurring';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const PriceTypeSchema = z.enum(PRICE_TYPES).openapi({
  description: 'Stripe price billing type',
  example: 'recurring',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type PriceType = z.infer<typeof PriceTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const PriceTypes = {
  ONE_TIME: 'one_time' as const,
  RECURRING: 'recurring' as const,
} as const;

// ============================================================================
// MODEL PRICING TIER
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values (ordered by cost)
export const MODEL_PRICING_TIERS = ['budget', 'standard', 'pro', 'flagship', 'ultimate'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_MODEL_PRICING_TIER: ModelPricingTier = 'standard';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ModelPricingTierSchema = z.enum(MODEL_PRICING_TIERS).openapi({
  description: 'Model pricing tier based on cost per million tokens',
  example: 'standard',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ModelPricingTier = z.infer<typeof ModelPricingTierSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const ModelPricingTiers = {
  BUDGET: 'budget' as const, // ≤$0.10/M input - cheapest models
  STANDARD: 'standard' as const, // $0.10-$0.50/M input - mid-range
  PRO: 'pro' as const, // $0.50-$3/M input - premium models
  FLAGSHIP: 'flagship' as const, // $3-$10/M input - top-tier
  ULTIMATE: 'ultimate' as const, // >$10/M input - most expensive
} as const;

// Credit multipliers by tier - based on actual cost ratios to ensure profitability
export const MODEL_TIER_CREDIT_MULTIPLIERS: Record<ModelPricingTier, number> = {
  [ModelPricingTiers.BUDGET]: 1, // Base rate: ~$0.25/M blended
  [ModelPricingTiers.STANDARD]: 3, // ~$0.85/M blended (3.4x budget)
  [ModelPricingTiers.PRO]: 25, // ~$6.7/M blended (27x budget)
  [ModelPricingTiers.FLAGSHIP]: 75, // ~$19/M blended (76x budget)
  [ModelPricingTiers.ULTIMATE]: 200, // ~$50/M blended (200x budget)
} as const;

// Input price thresholds (per million tokens) for tier classification
export const MODEL_TIER_THRESHOLDS: Record<ModelPricingTier, { min: number; max: number }> = {
  [ModelPricingTiers.BUDGET]: { min: 0, max: 0.10 },
  [ModelPricingTiers.STANDARD]: { min: 0.10, max: 0.50 },
  [ModelPricingTiers.PRO]: { min: 0.50, max: 3.00 },
  [ModelPricingTiers.FLAGSHIP]: { min: 3.00, max: 10.00 },
  [ModelPricingTiers.ULTIMATE]: { min: 10.00, max: Number.POSITIVE_INFINITY },
} as const;

export function isModelPricingTier(value: unknown): value is ModelPricingTier {
  return typeof value === 'string' && MODEL_PRICING_TIERS.includes(value as ModelPricingTier);
}

export function getModelTierMultiplier(tier: ModelPricingTier): number {
  return MODEL_TIER_CREDIT_MULTIPLIERS[tier];
}

// ============================================================================
// MODEL COST CATEGORY (UI-facing cost display)
// ============================================================================

// 1. ARRAY CONSTANT
export const MODEL_COST_CATEGORIES = ['free', 'low', 'medium', 'high'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_MODEL_COST_CATEGORY: ModelCostCategory = 'low';

// 3. ZOD SCHEMA
export const ModelCostCategorySchema = z.enum(MODEL_COST_CATEGORIES).openapi({
  description: 'UI-facing model cost category for display purposes',
  example: 'medium',
});

// 4. TYPESCRIPT TYPE
export type ModelCostCategory = z.infer<typeof ModelCostCategorySchema>;

// 5. CONSTANT OBJECT
export const ModelCostCategories = {
  FREE: 'free' as const,
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
  HIGH: 'high' as const,
} as const;

// ============================================================================
// INVOICE STATUS
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const INVOICE_STATUSES = ['draft', 'open', 'paid', 'uncollectible', 'void'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_INVOICE_STATUS: InvoiceStatus = 'draft';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES).openapi({
  description: 'Stripe invoice lifecycle status',
  example: 'paid',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const InvoiceStatuses = {
  DRAFT: 'draft' as const,
  OPEN: 'open' as const,
  PAID: 'paid' as const,
  UNCOLLECTIBLE: 'uncollectible' as const,
  VOID: 'void' as const,
} as const;

// ============================================================================
// STRIPE PRORATION BEHAVIOR
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const STRIPE_PRORATION_BEHAVIORS = ['create_prorations', 'none', 'always_invoice'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_STRIPE_PRORATION_BEHAVIOR: StripeProratioBehavior = 'create_prorations';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const StripeProratioBehaviorSchema = z.enum(STRIPE_PRORATION_BEHAVIORS).openapi({
  description: 'Stripe proration behavior for subscription changes',
  example: 'create_prorations',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type StripeProratioBehavior = z.infer<typeof StripeProratioBehaviorSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const StripeProratioBehaviors = {
  CREATE_PRORATIONS: 'create_prorations' as const,
  NONE: 'none' as const,
  ALWAYS_INVOICE: 'always_invoice' as const,
} as const;

// ============================================================================
// STRIPE BILLING REASON
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const STRIPE_BILLING_REASONS = [
  'subscription_create',
  'subscription_update',
  'subscription_cycle',
  'manual',
  'upcoming',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_STRIPE_BILLING_REASON: StripeBillingReason = 'subscription_cycle';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const StripeBillingReasonSchema = z.enum(STRIPE_BILLING_REASONS).openapi({
  description: 'Stripe invoice billing reason (matches Stripe.Invoice.BillingReason)',
  example: 'subscription_create',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type StripeBillingReason = z.infer<typeof StripeBillingReasonSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const StripeBillingReasons = {
  SUBSCRIPTION_CREATE: 'subscription_create' as const,
  SUBSCRIPTION_UPDATE: 'subscription_update' as const,
  SUBSCRIPTION_CYCLE: 'subscription_cycle' as const,
  MANUAL: 'manual' as const,
  UPCOMING: 'upcoming' as const,
} as const;

// ============================================================================
// TRIAL STATE (free trial status for UI display)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const TRIAL_STATES = ['available', 'used'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_TRIAL_STATE: TrialState = 'available';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const TrialStateSchema = z.enum(TRIAL_STATES).openapi({
  description: 'Free trial state for UI display',
  example: 'available',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type TrialState = z.infer<typeof TrialStateSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const TrialStates = {
  AVAILABLE: 'available' as const,
  USED: 'used' as const,
} as const;

export function isValidTrialState(value: unknown): value is TrialState {
  return typeof value === 'string' && TRIAL_STATES.includes(value as TrialState);
}
