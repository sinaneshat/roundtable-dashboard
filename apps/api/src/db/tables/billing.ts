import { BILLING_INTERVALS, DEFAULT_PRICE_TYPE, INVOICE_STATUSES, PAYMENT_METHOD_TYPES, PRICE_TYPES, STRIPE_SUBSCRIPTION_STATUSES } from '@roundtable/shared/enums';
import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { StripeMetadataType, StripeWebhookEventData } from '@/db/validation/billing';

import { user } from './auth';

/**
 * Stripe Products - Represents items/services you sell
 * Synced from Stripe Product objects
 */
export const stripeProduct = sqliteTable(
  'stripe_product',
  {
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    defaultPriceId: text('default_price_id'), // Default Stripe price ID
    description: text('description'),
    features: text('features', { mode: 'json' }).$type<string[]>(), // Product features list
    id: text('id').primaryKey(), // Stripe product ID (e.g., prod_xxx)
    images: text('images', { mode: 'json' }).$type<string[]>(),
    // ✅ TYPE-SAFE: Stripe metadata (string-to-string map) - type inferred from validation schema
    metadata: text('metadata', { mode: 'json' }).$type<StripeMetadataType>(),
    name: text('name').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [index('stripe_product_active_idx').on(table.active)],
);

/**
 * Stripe Prices - Pricing plans for products
 * Synced from Stripe Price objects
 */
export const stripePrice = sqliteTable(
  'stripe_price',
  {
    active: integer('active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    currency: text('currency').notNull().default('usd'), // ISO currency code
    id: text('id').primaryKey(), // Stripe price ID (e.g., price_xxx)
    interval: text('interval', {
      enum: BILLING_INTERVALS,
    }), // For recurring prices
    intervalCount: integer('interval_count').default(1), // Billing frequency (e.g., every 3 months)
    // ✅ TYPE-SAFE: Stripe metadata (string-to-string map) - type inferred from validation schema
    metadata: text('metadata', { mode: 'json' }).$type<StripeMetadataType>(),
    productId: text('product_id')
      .notNull()
      .references(() => stripeProduct.id, { onDelete: 'cascade' }),
    trialPeriodDays: integer('trial_period_days'), // Free trial duration
    type: text('type', { enum: PRICE_TYPES })
      .notNull()
      .default(DEFAULT_PRICE_TYPE),
    unitAmount: integer('unit_amount'), // Price in smallest currency unit (cents for USD)
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('stripe_price_product_idx').on(table.productId),
    index('stripe_price_active_idx').on(table.active),
  ],
);

/**
 * Stripe Customers - Links users to Stripe customer objects
 * One user can have one Stripe customer
 */
export const stripeCustomer = sqliteTable(
  'stripe_customer',
  {
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    defaultPaymentMethodId: text('default_payment_method_id'),
    email: text('email').notNull(),
    id: text('id').primaryKey(), // Stripe customer ID (e.g., cus_xxx)
    // ✅ TYPE-SAFE: Stripe metadata (string-to-string map) - type inferred from validation schema
    metadata: text('metadata', { mode: 'json' }).$type<StripeMetadataType>(),
    name: text('name'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [index('stripe_customer_user_idx').on(table.userId)],
);

/**
 * Stripe Subscriptions - Active and historical subscription records
 * Synced from Stripe Subscription objects via webhooks
 */
export const stripeSubscription = sqliteTable(
  'stripe_subscription',
  {
    cancelAt: integer('cancel_at', { mode: 'timestamp_ms' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' })
      .default(false)
      .notNull(),
    canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    currentPeriodEnd: integer('current_period_end', {
      mode: 'timestamp_ms',
    }).notNull(),
    currentPeriodStart: integer('current_period_start', {
      mode: 'timestamp_ms',
    }).notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => stripeCustomer.id, { onDelete: 'cascade' }),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    id: text('id').primaryKey(), // Stripe subscription ID (e.g., sub_xxx)
    // ✅ TYPE-SAFE: Stripe metadata (string-to-string map) - type inferred from validation schema
    metadata: text('metadata', { mode: 'json' }).$type<StripeMetadataType>(),
    priceId: text('price_id')
      .notNull()
      .references(() => stripePrice.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').default(1).notNull(),
    status: text('status', {
      enum: STRIPE_SUBSCRIPTION_STATUSES,
    }).notNull(),
    trialEnd: integer('trial_end', { mode: 'timestamp_ms' }),
    trialStart: integer('trial_start', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Optimistic locking - prevents lost updates from webhook races
    version: integer('version').notNull().default(1),
  },
  table => [
    index('stripe_subscription_customer_idx').on(table.customerId),
    index('stripe_subscription_user_idx').on(table.userId),
    index('stripe_subscription_status_idx').on(table.status),
    index('stripe_subscription_price_idx').on(table.priceId),
    // ✅ Composite index for efficient active subscription queries
    index('stripe_subscription_user_status_idx').on(table.userId, table.status),
  ],
);

/**
 * Stripe Payment Methods - Saved payment methods for customers
 * Synced from Stripe PaymentMethod objects
 */
export const stripePaymentMethod = sqliteTable(
  'stripe_payment_method',
  {
    bankLast4: text('bank_last4'),
    // Bank account details (if applicable)
    bankName: text('bank_name'),
    // Card details
    cardBrand: text('card_brand'), // visa, mastercard, etc.
    cardExpMonth: integer('card_exp_month'),
    cardExpYear: integer('card_exp_year'),
    cardLast4: text('card_last4'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => stripeCustomer.id, { onDelete: 'cascade' }),
    id: text('id').primaryKey(), // Stripe payment method ID (e.g., pm_xxx)
    isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
    // ✅ TYPE-SAFE: Stripe metadata (string-to-string map) - type inferred from validation schema
    metadata: text('metadata', { mode: 'json' }).$type<StripeMetadataType>(),
    type: text('type', { enum: PAYMENT_METHOD_TYPES }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('stripe_payment_method_customer_idx').on(table.customerId),
    index('stripe_payment_method_default_idx').on(table.isDefault),
  ],
);

/**
 * Stripe Invoices - Invoice records for subscriptions
 * Synced from Stripe Invoice objects
 */
export const stripeInvoice = sqliteTable(
  'stripe_invoice',
  {
    amountDue: integer('amount_due').notNull(), // Amount in smallest currency unit
    amountPaid: integer('amount_paid').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    currency: text('currency').notNull().default('usd'),
    customerId: text('customer_id')
      .notNull()
      .references(() => stripeCustomer.id, { onDelete: 'cascade' }),
    hostedInvoiceUrl: text('hosted_invoice_url'),
    id: text('id').primaryKey(), // Stripe invoice ID (e.g., in_xxx)
    invoicePdf: text('invoice_pdf'),
    // ✅ TYPE-SAFE: Stripe metadata (string-to-string map) - type inferred from validation schema
    metadata: text('metadata', { mode: 'json' }).$type<StripeMetadataType>(),
    paid: integer('paid', { mode: 'boolean' }).default(false).notNull(),
    periodEnd: integer('period_end', { mode: 'timestamp_ms' }),
    periodStart: integer('period_start', { mode: 'timestamp_ms' }),
    status: text('status', {
      enum: INVOICE_STATUSES,
    }).notNull(),
    subscriptionId: text('subscription_id').references(
      () => stripeSubscription.id,
      { onDelete: 'set null' },
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('stripe_invoice_customer_idx').on(table.customerId),
    index('stripe_invoice_subscription_idx').on(table.subscriptionId),
    index('stripe_invoice_status_idx').on(table.status),
  ],
);

/**
 * Stripe Webhook Events - Audit log of all webhook events
 * Used for idempotency and debugging
 */
export const stripeWebhookEvent = sqliteTable(
  'stripe_webhook_event',
  {
    apiVersion: text('api_version'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    // ✅ TYPE-SAFE: Stripe webhook event data - type inferred from validation schema
    data: text('data', { mode: 'json' }).$type<StripeWebhookEventData>(),
    id: text('id').primaryKey(), // Stripe event ID (e.g., evt_xxx)
    processed: integer('processed', { mode: 'boolean' })
      .default(false)
      .notNull(),
    processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
    processingError: text('processing_error'),
    type: text('type').notNull(), // Event type (e.g., customer.subscription.updated)
  },
  table => [
    index('stripe_webhook_event_type_idx').on(table.type),
    index('stripe_webhook_event_processed_idx').on(table.processed),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const stripeProductRelations = relations(stripeProduct, ({ many, one }) => ({
  defaultPrice: one(stripePrice, {
    fields: [stripeProduct.defaultPriceId],
    references: [stripePrice.id],
  }),
  prices: many(stripePrice),
}));

export const stripePriceRelations = relations(stripePrice, ({ many, one }) => ({
  product: one(stripeProduct, {
    fields: [stripePrice.productId],
    references: [stripeProduct.id],
  }),
  subscriptions: many(stripeSubscription),
}));

export const stripeCustomerRelations = relations(stripeCustomer, ({ many, one }) => ({
  invoices: many(stripeInvoice),
  paymentMethods: many(stripePaymentMethod),
  subscriptions: many(stripeSubscription),
  user: one(user, {
    fields: [stripeCustomer.userId],
    references: [user.id],
  }),
}));

export const stripeSubscriptionRelations = relations(stripeSubscription, ({ one }) => ({
  customer: one(stripeCustomer, {
    fields: [stripeSubscription.customerId],
    references: [stripeCustomer.id],
  }),
  price: one(stripePrice, {
    fields: [stripeSubscription.priceId],
    references: [stripePrice.id],
  }),
  user: one(user, {
    fields: [stripeSubscription.userId],
    references: [user.id],
  }),
}));

export const stripePaymentMethodRelations = relations(stripePaymentMethod, ({ one }) => ({
  customer: one(stripeCustomer, {
    fields: [stripePaymentMethod.customerId],
    references: [stripeCustomer.id],
  }),
}));

export const stripeInvoiceRelations = relations(stripeInvoice, ({ one }) => ({
  customer: one(stripeCustomer, {
    fields: [stripeInvoice.customerId],
    references: [stripeCustomer.id],
  }),
  subscription: one(stripeSubscription, {
    fields: [stripeInvoice.subscriptionId],
    references: [stripeSubscription.id],
  }),
}));
