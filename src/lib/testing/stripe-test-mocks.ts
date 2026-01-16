/**
 * Stripe Test Mock Factories
 *
 * Zod-first mock factories for Stripe webhook testing.
 *
 * Pattern:
 * 1. Define Zod schemas for the subset of Stripe data we use in tests
 * 2. z.infer extracts the type (single source of truth)
 * 3. Factory functions return validated data via .parse()
 * 4. Tests use these type-safe mocks for webhook handler testing
 *
 * NOTE: For production Stripe integration, use stripe-mock or actual Stripe types.
 * These mocks are specifically designed for unit testing webhook handlers.
 */

import { z } from 'zod';

import type { StripeSubscriptionStatus } from '@/api/core/enums';
import { StripeSubscriptionStatuses } from '@/api/core/enums';

// ============================================================================
// STRIPE SUBSCRIPTION MOCK (Zod-first pattern)
// ============================================================================

/**
 * Stripe subscription statuses as Zod enum
 * Maps to Stripe.Subscription.Status
 */
const StripeSubscriptionStatusSchema = z.enum([
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
]);

/**
 * Minimal Stripe Price schema for subscription items
 */
const StripePriceSchema = z.object({
  id: z.string(),
  object: z.literal('price'),
  active: z.boolean(),
  billing_scheme: z.literal('per_unit'),
  created: z.number(),
  currency: z.string(),
  custom_unit_amount: z.null(),
  livemode: z.boolean(),
  lookup_key: z.null(),
  metadata: z.record(z.string(), z.string()),
  nickname: z.null(),
  product: z.string(),
  recurring: z.object({
    aggregate_usage: z.null(),
    interval: z.enum(['day', 'week', 'month', 'year']),
    interval_count: z.number(),
    meter: z.null(),
    trial_period_days: z.null(),
    usage_type: z.literal('licensed'),
  }),
  tax_behavior: z.string(),
  tiers_mode: z.null(),
  transform_quantity: z.null(),
  type: z.literal('recurring'),
  unit_amount: z.number(),
  unit_amount_decimal: z.string(),
});

/**
 * Stripe subscription item schema
 */
const StripeSubscriptionItemSchema = z.object({
  id: z.string(),
  object: z.literal('subscription_item'),
  billing_thresholds: z.null(),
  created: z.number(),
  current_period_start: z.number(),
  current_period_end: z.number(),
  discounts: z.array(z.string()),
  metadata: z.record(z.string(), z.string()),
  plan: z.null(),
  price: StripePriceSchema,
  quantity: z.number(),
  subscription: z.string(),
  tax_rates: z.array(z.string()),
});

/**
 * Stripe subscription schema - defines fields used in webhook handlers
 */
const MockStripeSubscriptionSchema = z.object({
  id: z.string(),
  object: z.literal('subscription'),
  application: z.null(),
  application_fee_percent: z.null(),
  automatic_tax: z.object({
    enabled: z.boolean(),
    disabled_reason: z.null(),
    liability: z.null(),
  }),
  billing_cycle_anchor: z.number(),
  billing_cycle_anchor_config: z.null(),
  billing_thresholds: z.null(),
  cancel_at: z.null(),
  cancel_at_period_end: z.boolean(),
  canceled_at: z.number().nullable(),
  cancellation_details: z.null(),
  collection_method: z.literal('charge_automatically'),
  created: z.number(),
  currency: z.string(),
  current_period_start: z.number(),
  current_period_end: z.number(),
  customer: z.string(),
  days_until_due: z.null(),
  default_payment_method: z.null(),
  default_source: z.null(),
  default_tax_rates: z.null(),
  description: z.null(),
  discount: z.null(),
  discounts: z.array(z.string()),
  ended_at: z.null(),
  invoice_settings: z.object({
    account_tax_ids: z.null(),
    issuer: z.object({ type: z.literal('self') }),
  }),
  items: z.object({
    object: z.literal('list'),
    data: z.array(StripeSubscriptionItemSchema),
    has_more: z.boolean(),
    url: z.string(),
  }),
  latest_invoice: z.null(),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.string()),
  next_pending_invoice_item_invoice: z.null(),
  on_behalf_of: z.null(),
  pause_collection: z.null(),
  payment_settings: z.null(),
  pending_invoice_item_interval: z.null(),
  pending_setup_intent: z.null(),
  pending_update: z.null(),
  plan: z.null(),
  quantity: z.null(),
  schedule: z.null(),
  start_date: z.number(),
  status: StripeSubscriptionStatusSchema,
  test_clock: z.null(),
  transfer_data: z.null(),
  trial_end: z.number().nullable(),
  trial_settings: z.null(),
  trial_start: z.number().nullable(),
});

export type MockStripeSubscription = z.infer<typeof MockStripeSubscriptionSchema>;

/**
 * Options for creating mock subscription
 */
export type MockStripeSubscriptionOptions = {
  id?: string;
  customer?: string;
  status?: StripeSubscriptionStatus;
  priceId?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: number | null;
  trialStart?: number | null;
  trialEnd?: number | null;
};

/**
 * Creates a validated mock Stripe subscription
 *
 * @example
 * const subscription = createMockStripeSubscription({
 *   customer: 'cus_test_123',
 *   status: 'active',
 * });
 */
export function createMockStripeSubscription(
  options: MockStripeSubscriptionOptions = {},
): MockStripeSubscription {
  const now = Math.floor(Date.now() / 1000);
  const periodEnd = now + 30 * 24 * 60 * 60;
  const subscriptionId = options.id ?? `sub_${Math.random().toString(36).substring(7)}`;
  const priceId = options.priceId ?? 'price_pro_monthly';

  const data = {
    id: subscriptionId,
    object: 'subscription' as const,
    application: null,
    application_fee_percent: null,
    automatic_tax: {
      enabled: false,
      disabled_reason: null,
      liability: null,
    },
    billing_cycle_anchor: options.currentPeriodStart ?? now,
    billing_cycle_anchor_config: null,
    billing_thresholds: null,
    cancel_at: null,
    cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
    canceled_at: options.canceledAt ?? null,
    cancellation_details: null,
    collection_method: 'charge_automatically' as const,
    created: now - 86400,
    currency: 'usd',
    current_period_start: options.currentPeriodStart ?? now,
    current_period_end: options.currentPeriodEnd ?? periodEnd,
    customer: options.customer ?? 'cus_test_123',
    days_until_due: null,
    default_payment_method: null,
    default_source: null,
    default_tax_rates: null,
    description: null,
    discount: null,
    discounts: [],
    ended_at: null,
    invoice_settings: {
      account_tax_ids: null,
      issuer: { type: 'self' as const },
    },
    items: {
      object: 'list' as const,
      data: [
        {
          id: `si_${Math.random().toString(36).substring(7)}`,
          object: 'subscription_item' as const,
          billing_thresholds: null,
          created: now,
          current_period_start: options.currentPeriodStart ?? now,
          current_period_end: options.currentPeriodEnd ?? periodEnd,
          discounts: [],
          metadata: {},
          plan: null,
          price: {
            id: priceId,
            object: 'price' as const,
            active: true,
            billing_scheme: 'per_unit' as const,
            created: now - 86400 * 30,
            currency: 'usd',
            custom_unit_amount: null,
            livemode: false,
            lookup_key: null,
            metadata: {},
            nickname: null,
            product: 'prod_pro_plan',
            recurring: {
              aggregate_usage: null,
              interval: 'month' as const,
              interval_count: 1,
              meter: null,
              trial_period_days: null,
              usage_type: 'licensed' as const,
            },
            tax_behavior: 'unspecified',
            tiers_mode: null,
            transform_quantity: null,
            type: 'recurring' as const,
            unit_amount: 5900,
            unit_amount_decimal: '5900',
          },
          quantity: 1,
          subscription: subscriptionId,
          tax_rates: [],
        },
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
    latest_invoice: null,
    livemode: false,
    metadata: {},
    next_pending_invoice_item_invoice: null,
    on_behalf_of: null,
    pause_collection: null,
    payment_settings: null,
    pending_invoice_item_interval: null,
    pending_setup_intent: null,
    pending_update: null,
    plan: null,
    quantity: null,
    schedule: null,
    start_date: now,
    status: options.status ?? StripeSubscriptionStatuses.ACTIVE,
    test_clock: null,
    transfer_data: null,
    trial_end: options.trialEnd ?? null,
    trial_settings: null,
    trial_start: options.trialStart ?? null,
  };

  return MockStripeSubscriptionSchema.parse(data);
}

// ============================================================================
// STRIPE INVOICE MOCK (Zod-first pattern)
// ============================================================================

/**
 * Stripe invoice status schema
 */
const StripeInvoiceStatusSchema = z.enum([
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
]);

/**
 * Stripe invoice line item schema
 */
const StripeInvoiceLineItemSchema = z.object({
  id: z.string(),
  object: z.literal('line_item'),
  amount: z.number(),
  amount_excluding_tax: z.number(),
  currency: z.string(),
  description: z.string(),
  discount_amounts: z.array(z.string()),
  discountable: z.boolean(),
  discounts: z.array(z.string()),
  invoice: z.string(),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.string()),
  parent: z.null(),
  period: z.object({
    end: z.number(),
    start: z.number(),
  }),
  plan: z.null(),
  pretax_credit_amounts: z.array(z.string()),
  price: z.null(),
  pricing: z.null(),
  proration: z.boolean(),
  proration_details: z.null(),
  quantity: z.number(),
  subscription: z.string().nullable(),
  subscription_item: z.null(),
  subtotal: z.number(),
  subtotal_excluding_tax: z.number(),
  tax_amounts: z.array(z.string()),
  tax_rates: z.array(z.string()),
  taxes: z.array(z.string()),
  type: z.literal('subscription'),
  unit_amount_excluding_tax: z.null(),
});

/**
 * Stripe invoice billing reason schema
 */
const StripeBillingReasonSchema = z.enum([
  'automatic_pending_invoice_item_invoice',
  'manual',
  'quote_accept',
  'subscription',
  'subscription_create',
  'subscription_cycle',
  'subscription_threshold',
  'subscription_update',
  'upcoming',
]);

/**
 * Stripe invoice schema - defines fields used in webhook handlers
 */
const MockStripeInvoiceSchema = z.object({
  id: z.string(),
  object: z.literal('invoice'),
  account_country: z.string(),
  account_name: z.string(),
  account_tax_ids: z.null(),
  amount_due: z.number(),
  amount_paid: z.number(),
  amount_remaining: z.number(),
  amount_shipping: z.number(),
  application: z.null(),
  application_fee_amount: z.null(),
  attempt_count: z.number(),
  attempted: z.boolean(),
  auto_advance: z.boolean(),
  automatic_tax: z.object({
    disabled_reason: z.null(),
    enabled: z.boolean(),
    liability: z.null(),
    provider: z.null(),
    status: z.null(),
  }),
  automatically_finalizes_at: z.null(),
  billing_reason: StripeBillingReasonSchema,
  charge: z.null(),
  collection_method: z.literal('charge_automatically'),
  created: z.number(),
  currency: z.string(),
  custom_fields: z.null(),
  customer: z.string(),
  customer_address: z.null(),
  customer_email: z.null(),
  customer_name: z.null(),
  customer_phone: z.null(),
  customer_shipping: z.null(),
  customer_tax_exempt: z.string(),
  customer_tax_ids: z.null(),
  default_payment_method: z.null(),
  default_source: z.null(),
  default_tax_rates: z.array(z.string()),
  description: z.null(),
  discount: z.null(),
  discounts: z.array(z.string()),
  due_date: z.null(),
  effective_at: z.null(),
  ending_balance: z.null(),
  footer: z.null(),
  from_invoice: z.null(),
  hosted_invoice_url: z.null(),
  invoice_pdf: z.null(),
  issuer: z.object({ type: z.literal('self') }),
  last_finalization_error: z.null(),
  latest_revision: z.null(),
  lines: z.object({
    object: z.literal('list'),
    data: z.array(StripeInvoiceLineItemSchema),
    has_more: z.boolean(),
    url: z.string(),
  }),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.string()),
  next_payment_attempt: z.null(),
  number: z.null(),
  on_behalf_of: z.null(),
  paid: z.boolean(),
  paid_out_of_band: z.boolean(),
  payment_intent: z.null(),
  payment_settings: z.null(),
  period_end: z.number(),
  period_start: z.number(),
  post_payment_credit_notes_amount: z.number(),
  pre_payment_credit_notes_amount: z.number(),
  quote: z.null(),
  receipt_number: z.null(),
  rendering: z.null(),
  rendering_options: z.null(),
  shipping_cost: z.null(),
  shipping_details: z.null(),
  starting_balance: z.number(),
  statement_descriptor: z.null(),
  status: StripeInvoiceStatusSchema,
  status_transitions: z.null(),
  subscription: z.string().nullable(),
  subscription_details: z.null(),
  subscription_proration_date: z.null(),
  subtotal: z.number(),
  subtotal_excluding_tax: z.number(),
  tax: z.null(),
  test_clock: z.null(),
  threshold_reason: z.null(),
  total: z.number(),
  total_discount_amounts: z.null(),
  total_excluding_tax: z.number(),
  total_tax_amounts: z.array(z.string()),
  transfer_data: z.null(),
  webhooks_delivered_at: z.null(),
});

export type MockStripeInvoice = z.infer<typeof MockStripeInvoiceSchema>;

/**
 * Options for creating mock invoice
 */
export type MockStripeInvoiceOptions = {
  id?: string;
  customer?: string;
  subscription?: string;
  status?: z.infer<typeof StripeInvoiceStatusSchema>;
  amountPaid?: number;
  amountDue?: number;
  billingReason?: z.infer<typeof StripeBillingReasonSchema>;
};

/**
 * Creates a validated mock Stripe invoice
 */
export function createMockStripeInvoice(
  options: MockStripeInvoiceOptions = {},
): MockStripeInvoice {
  const now = Math.floor(Date.now() / 1000);
  const invoiceId = options.id ?? `in_${Math.random().toString(36).substring(7)}`;
  const amountPaid = options.amountPaid ?? 5900;
  const status = options.status ?? 'paid';

  const data = {
    id: invoiceId,
    object: 'invoice' as const,
    account_country: 'US',
    account_name: 'Test Account',
    account_tax_ids: null,
    amount_due: options.amountDue ?? (status === 'paid' ? 0 : amountPaid),
    amount_paid: amountPaid,
    amount_remaining: status === 'paid' ? 0 : amountPaid,
    amount_shipping: 0,
    application: null,
    application_fee_amount: null,
    attempt_count: status === 'paid' ? 1 : 0,
    attempted: status === 'paid',
    auto_advance: true,
    automatic_tax: {
      disabled_reason: null,
      enabled: false,
      liability: null,
      provider: null,
      status: null,
    },
    automatically_finalizes_at: null,
    billing_reason: options.billingReason ?? ('subscription_create' as const),
    charge: null,
    collection_method: 'charge_automatically' as const,
    created: now,
    currency: 'usd',
    custom_fields: null,
    customer: options.customer ?? 'cus_test_123',
    customer_address: null,
    customer_email: null,
    customer_name: null,
    customer_phone: null,
    customer_shipping: null,
    customer_tax_exempt: 'none',
    customer_tax_ids: null,
    default_payment_method: null,
    default_source: null,
    default_tax_rates: [],
    description: null,
    discount: null,
    discounts: [],
    due_date: null,
    effective_at: null,
    ending_balance: null,
    footer: null,
    from_invoice: null,
    hosted_invoice_url: null,
    invoice_pdf: null,
    issuer: { type: 'self' as const },
    last_finalization_error: null,
    latest_revision: null,
    lines: {
      object: 'list' as const,
      data: [
        {
          id: `il_${Math.random().toString(36).substring(7)}`,
          object: 'line_item' as const,
          amount: amountPaid,
          amount_excluding_tax: amountPaid,
          currency: 'usd',
          description: 'Pro Plan - Monthly',
          discount_amounts: [],
          discountable: true,
          discounts: [],
          invoice: invoiceId,
          livemode: false,
          metadata: {},
          parent: null,
          period: {
            end: now + 30 * 24 * 60 * 60,
            start: now,
          },
          plan: null,
          pretax_credit_amounts: [],
          price: null,
          pricing: null,
          proration: false,
          proration_details: null,
          quantity: 1,
          subscription: options.subscription ?? null,
          subscription_item: null,
          subtotal: amountPaid,
          subtotal_excluding_tax: amountPaid,
          tax_amounts: [],
          tax_rates: [],
          taxes: [],
          type: 'subscription' as const,
          unit_amount_excluding_tax: null,
        },
      ],
      has_more: false,
      url: '/v1/invoices/lines',
    },
    livemode: false,
    metadata: {},
    next_payment_attempt: null,
    number: null,
    on_behalf_of: null,
    paid: status === 'paid',
    paid_out_of_band: false,
    payment_intent: null,
    payment_settings: null,
    period_end: now,
    period_start: now - 30 * 24 * 60 * 60,
    post_payment_credit_notes_amount: 0,
    pre_payment_credit_notes_amount: 0,
    quote: null,
    receipt_number: null,
    rendering: null,
    rendering_options: null,
    shipping_cost: null,
    shipping_details: null,
    starting_balance: 0,
    statement_descriptor: null,
    status,
    status_transitions: null,
    subscription: options.subscription ?? null,
    subscription_details: null,
    subscription_proration_date: null,
    subtotal: amountPaid,
    subtotal_excluding_tax: amountPaid,
    tax: null,
    test_clock: null,
    threshold_reason: null,
    total: amountPaid,
    total_discount_amounts: null,
    total_excluding_tax: amountPaid,
    total_tax_amounts: [],
    transfer_data: null,
    webhooks_delivered_at: null,
  };

  return MockStripeInvoiceSchema.parse(data);
}

// ============================================================================
// STRIPE CUSTOMER MOCK (Zod-first pattern)
// ============================================================================

/**
 * Stripe customer schema
 */
const MockStripeCustomerSchema = z.object({
  id: z.string(),
  object: z.literal('customer'),
  address: z.null(),
  balance: z.number(),
  created: z.number(),
  currency: z.string(),
  default_source: z.null(),
  delinquent: z.boolean(),
  description: z.null(),
  discount: z.null(),
  email: z.string(),
  invoice_prefix: z.null(),
  invoice_settings: z.object({
    custom_fields: z.null(),
    default_payment_method: z.null(),
    footer: z.null(),
    rendering_options: z.null(),
  }),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.string()),
  name: z.string(),
  next_invoice_sequence: z.number(),
  phone: z.null(),
  preferred_locales: z.null(),
  shipping: z.null(),
  tax_exempt: z.string(),
  test_clock: z.null(),
});

export type MockStripeCustomer = z.infer<typeof MockStripeCustomerSchema>;

export type MockStripeCustomerOptions = {
  id?: string;
  email?: string;
  name?: string;
};

/**
 * Creates a validated mock Stripe customer
 */
export function createMockStripeCustomer(
  options: MockStripeCustomerOptions = {},
): MockStripeCustomer {
  const now = Math.floor(Date.now() / 1000);

  const data = {
    id: options.id ?? `cus_${Math.random().toString(36).substring(7)}`,
    object: 'customer' as const,
    address: null,
    balance: 0,
    created: now,
    currency: 'usd',
    default_source: null,
    delinquent: false,
    description: null,
    discount: null,
    email: options.email ?? 'test@example.com',
    invoice_prefix: null,
    invoice_settings: {
      custom_fields: null,
      default_payment_method: null,
      footer: null,
      rendering_options: null,
    },
    livemode: false,
    metadata: {},
    name: options.name ?? 'Test Customer',
    next_invoice_sequence: 1,
    phone: null,
    preferred_locales: null,
    shipping: null,
    tax_exempt: 'none',
    test_clock: null,
  };

  return MockStripeCustomerSchema.parse(data);
}

// ============================================================================
// STRIPE EVENT MOCK (Zod-first pattern)
// ============================================================================

/**
 * Stripe event schema
 */
const MockStripeEventSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  api_version: z.string(),
  created: z.number(),
  data: z.object({
    object: z.unknown(),
  }),
  livemode: z.boolean(),
  pending_webhooks: z.number(),
  request: z.null(),
  type: z.string(),
});

export type MockStripeEvent = z.infer<typeof MockStripeEventSchema>;

/**
 * Creates a validated mock Stripe event for webhook testing
 *
 * @param type - Stripe event type (e.g., 'customer.subscription.updated')
 * @param data - Event data object (e.g., subscription, invoice)
 */
export function createMockStripeEvent<T>(
  type: string,
  data: T,
): MockStripeEvent {
  const now = Math.floor(Date.now() / 1000);

  const eventData = {
    id: `evt_${Math.random().toString(36).substring(7)}`,
    object: 'event' as const,
    api_version: '2025-12-15.clover',
    created: now,
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
  };

  return MockStripeEventSchema.parse(eventData);
}

// ============================================================================
// SCHEMA EXPORTS (for external validation if needed)
// ============================================================================

export {
  MockStripeCustomerSchema,
  MockStripeEventSchema,
  MockStripeInvoiceSchema,
  MockStripeSubscriptionSchema,
};
