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
  DAY: 'day' as const,
  MONTH: 'month' as const,
  WEEK: 'week' as const,
  YEAR: 'year' as const,
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

export function isUIBillingInterval(value: unknown): value is UIBillingInterval {
  return UIBillingIntervalSchema.safeParse(value).success;
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
  CHANGE: 'change' as const,
  DOWNGRADE: 'downgrade' as const,
  UPGRADE: 'upgrade' as const,
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
  CANCELED: 'canceled' as const,
  INCOMPLETE: 'incomplete' as const,
  INCOMPLETE_EXPIRED: 'incomplete_expired' as const,
  PAST_DUE: 'past_due' as const,
  PAUSED: 'paused' as const,
  TRIALING: 'trialing' as const,
  UNPAID: 'unpaid' as const,
} as const;

// Active subscription status subset (billable states)
export const ACTIVE_SUBSCRIPTION_STATUSES = [
  StripeSubscriptionStatuses.ACTIVE,
  StripeSubscriptionStatuses.TRIALING,
  StripeSubscriptionStatuses.PAST_DUE,
] as const;

export type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

// Zod schema for active subscription status subset
const ActiveSubscriptionStatusSchema = z.enum(ACTIVE_SUBSCRIPTION_STATUSES);

export function isActiveSubscriptionStatus(status: unknown): status is ActiveSubscriptionStatus {
  return ActiveSubscriptionStatusSchema.safeParse(status).success;
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
  return SyncedSubscriptionStatusSchema.safeParse(value).success;
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
  throw new Error(`Unhandled tier: ${String(tier)}. Update all tier configurations.`);
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
  CRITICAL: 'critical' as const,
  DEFAULT: 'default' as const,
  WARNING: 'warning' as const,
} as const;

export const UsageStatusMetadata: Record<UsageStatus, {
  label: string;
  color: string;
  textColor: string;
  progressColor: string;
  threshold: number;
}> = {
  [UsageStatuses.CRITICAL]: {
    color: 'bg-destructive',
    label: 'Critical',
    progressColor: 'bg-destructive',
    textColor: 'text-destructive',
    threshold: 0.1,
  },
  [UsageStatuses.DEFAULT]: {
    color: 'bg-primary',
    label: 'Normal',
    progressColor: 'bg-primary',
    textColor: 'text-foreground',
    threshold: 0.5,
  },
  [UsageStatuses.WARNING]: {
    color: 'bg-warning',
    label: 'Low Credits',
    progressColor: 'bg-warning',
    textColor: 'text-orange-600 dark:text-orange-500',
    threshold: 0.2,
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
  return PlanTypeSchema.safeParse(value).success;
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
  ADJUSTMENT: 'adjustment' as const,
  CREDIT_GRANT: 'credit_grant' as const,
  DEDUCTION: 'deduction' as const,
  MONTHLY_REFILL: 'monthly_refill' as const,
  PURCHASE: 'purchase' as const,
  RELEASE: 'release' as const,
  RESERVATION: 'reservation' as const,
} as const;

export function isCreditTransactionType(value: unknown): value is CreditTransactionType {
  return CreditTransactionTypeSchema.safeParse(value).success;
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
  'memory_extraction',
  'rag_query',
  'project_file_link',
  'project_storage',
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
  AI_RESPONSE: 'ai_response' as const,
  ANALYSIS_GENERATION: 'analysis_generation' as const,
  CREDIT_PURCHASE: 'credit_purchase' as const,
  FILE_READING: 'file_reading' as const,
  FREE_ROUND_COMPLETE: 'free_round_complete' as const,
  MEMORY_EXTRACTION: 'memory_extraction' as const,
  MONTHLY_RENEWAL: 'monthly_renewal' as const,
  PROJECT_FILE_LINK: 'project_file_link' as const,
  PROJECT_STORAGE: 'project_storage' as const,
  RAG_QUERY: 'rag_query' as const,
  SIGNUP_BONUS: 'signup_bonus' as const,
  THREAD_CREATION: 'thread_creation' as const,
  USER_MESSAGE: 'user_message' as const,
  WEB_SEARCH: 'web_search' as const,
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
  NONE: 'none' as const,
  SUBSCRIPTION: 'subscription' as const,
} as const;

export function isPurchaseType(value: unknown): value is PurchaseType {
  return PurchaseTypeSchema.safeParse(value).success;
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
  return SubscriptionPlanTypeSchema.safeParse(value).success;
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
  AUTHENTICATION_FAILED: 'authentication_failed' as const,
  PAYMENT_FAILED: 'payment_failed' as const,
  SYNC_FAILED: 'sync_failed' as const,
  UNKNOWN: 'unknown' as const,
} as const;

export function isBillingErrorType(value: unknown): value is BillingErrorType {
  return BillingErrorTypeSchema.safeParse(value).success;
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
  BANK_ACCOUNT: 'bank_account' as const,
  CARD: 'card' as const,
  SEPA_DEBIT: 'sepa_debit' as const,
} as const;

export function isPaymentMethodType(value: unknown): value is PaymentMethodType {
  return PaymentMethodTypeSchema.safeParse(value).success;
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
  FLAGSHIP: 'flagship' as const, // $3-$10/M input - top-tier
  PRO: 'pro' as const, // $0.50-$3/M input - premium models
  STANDARD: 'standard' as const, // $0.10-$0.50/M input - mid-range
  ULTIMATE: 'ultimate' as const, // >$10/M input - most expensive
} as const;

// Credit multipliers by tier - based on actual cost ratios to ensure profitability
export const MODEL_TIER_CREDIT_MULTIPLIERS: Record<ModelPricingTier, number> = {
  [ModelPricingTiers.BUDGET]: 1, // Base rate: ~$0.25/M blended
  [ModelPricingTiers.FLAGSHIP]: 75, // ~$19/M blended (76x budget)
  [ModelPricingTiers.PRO]: 25, // ~$6.7/M blended (27x budget)
  [ModelPricingTiers.STANDARD]: 3, // ~$0.85/M blended (3.4x budget)
  [ModelPricingTiers.ULTIMATE]: 200, // ~$50/M blended (200x budget)
} as const;

// Input price thresholds (per million tokens) for tier classification
export const MODEL_TIER_THRESHOLDS: Record<ModelPricingTier, { min: number; max: number }> = {
  [ModelPricingTiers.BUDGET]: { max: 0.10, min: 0 },
  [ModelPricingTiers.FLAGSHIP]: { max: 10.00, min: 3.00 },
  [ModelPricingTiers.PRO]: { max: 3.00, min: 0.50 },
  [ModelPricingTiers.STANDARD]: { max: 0.50, min: 0.10 },
  [ModelPricingTiers.ULTIMATE]: { max: Number.POSITIVE_INFINITY, min: 10.00 },
} as const;

export function isModelPricingTier(value: unknown): value is ModelPricingTier {
  return ModelPricingTierSchema.safeParse(value).success;
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
  HIGH: 'high' as const,
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
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
  ALWAYS_INVOICE: 'always_invoice' as const,
  CREATE_PRORATIONS: 'create_prorations' as const,
  NONE: 'none' as const,
} as const;

// ============================================================================
// STRIPE BILLING REASON
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values (matches Stripe.Invoice.BillingReason)
export const STRIPE_BILLING_REASONS = [
  'automatic_pending_invoice_item_invoice',
  'manual',
  'quote_accept',
  'subscription',
  'subscription_create',
  'subscription_cycle',
  'subscription_threshold',
  'subscription_update',
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
  AUTOMATIC_PENDING_INVOICE_ITEM_INVOICE: 'automatic_pending_invoice_item_invoice' as const,
  MANUAL: 'manual' as const,
  QUOTE_ACCEPT: 'quote_accept' as const,
  SUBSCRIPTION: 'subscription' as const,
  SUBSCRIPTION_CREATE: 'subscription_create' as const,
  SUBSCRIPTION_CYCLE: 'subscription_cycle' as const,
  SUBSCRIPTION_THRESHOLD: 'subscription_threshold' as const,
  SUBSCRIPTION_UPDATE: 'subscription_update' as const,
  UPCOMING: 'upcoming' as const,
} as const;

// ============================================================================
// TIER CREDIT LIMITS (single source of truth for credit amounts)
// ============================================================================

/**
 * Monthly credit allocations by subscription tier.
 * FREE: One-time signup bonus only, no monthly refill
 * PRO: Monthly recurring credits
 */
export const TIER_MONTHLY_CREDITS = {
  [SubscriptionTiers.FREE]: 0,
  [SubscriptionTiers.PRO]: 2_000_000,
} as const satisfies Record<SubscriptionTier, number>;

/**
 * One-time signup credit bonus (free tier only)
 */
export const SIGNUP_BONUS_CREDITS = 5_000 as const;

/**
 * Price in cents for subscription plans
 */
export const TIER_PRICE_CENTS = {
  [SubscriptionTiers.FREE]: 0,
  [SubscriptionTiers.PRO]: 5900, // $59.00
} as const satisfies Record<SubscriptionTier, number>;

/**
 * Get monthly credits for a subscription tier
 */
export function getMonthlyCreditsForPlanTier(tier: SubscriptionTier): number {
  return TIER_MONTHLY_CREDITS[tier];
}

/**
 * Get price in cents for a subscription tier
 */
export function getTierPriceCents(tier: SubscriptionTier): number {
  return TIER_PRICE_CENTS[tier];
}

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
  return TrialStateSchema.safeParse(value).success;
}

// ============================================================================
// CREDIT STATUS (for chat input credit availability)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const CREDIT_STATUSES = ['ok', 'low', 'insufficient'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CREDIT_STATUS: CreditStatus = 'ok';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CreditStatusSchema = z.enum(CREDIT_STATUSES).openapi({
  description: 'Credit availability status for chat input',
  example: 'ok',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CreditStatus = z.infer<typeof CreditStatusSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const CreditStatuses = {
  INSUFFICIENT: 'insufficient' as const,
  LOW: 'low' as const,
  OK: 'ok' as const,
} as const;

export function isValidCreditStatus(value: unknown): value is CreditStatus {
  return CreditStatusSchema.safeParse(value).success;
}
