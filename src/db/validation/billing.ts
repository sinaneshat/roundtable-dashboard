import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
  stripeCustomer,
  stripeInvoice,
  stripePaymentMethod,
  stripePrice,
  stripeProduct,
  stripeSubscription,
  stripeWebhookEvent,
} from '@/db/tables/billing';

import { Refinements } from './refinements';

// ============================================================================
// STRIPE METADATA SCHEMAS - Single Source of Truth
// ============================================================================

/**
 * Stripe Metadata Schema
 *
 * Stripe's metadata is always string-to-string (max 50 keys, 500 char values/40 char keys)
 * This matches Stripe.Metadata type from stripe-js SDK
 */
export const StripeMetadataSchema = z.record(z.string(), z.string()).nullable();

export type StripeMetadataType = z.infer<typeof StripeMetadataSchema>;

/**
 * Stripe Webhook Event Data Schema
 *
 * The full event data from Stripe webhooks.
 * This represents the event.data.object which is the actual Stripe object
 * that triggered the event (customer, subscription, invoice, etc.)
 *
 * Uses z.record for Stripe's dynamic object structure while maintaining type safety.
 * The schema is permissive because different event types have different object shapes.
 */
export const StripeWebhookEventDataSchema = z.record(z.string(), z.unknown()).nullable();

export type StripeWebhookEventData = z.infer<typeof StripeWebhookEventDataSchema>;

/**
 * Stripe Product Schemas
 * Validation for Stripe product records synced from Stripe
 */
export const stripeProductSelectSchema = createSelectSchema(stripeProduct);
export const stripeProductInsertSchema = createInsertSchema(stripeProduct, {
  name: Refinements.name(),
});
export const stripeProductUpdateSchema = createUpdateSchema(stripeProduct, {
  name: Refinements.nameOptional(),
});

/**
 * Stripe Price Schemas
 * Validation for pricing plans associated with products
 */
export const stripePriceSelectSchema = createSelectSchema(stripePrice);
export const stripePriceInsertSchema = createInsertSchema(stripePrice, {
  currency: Refinements.currencyCode(),
  unitAmount: Refinements.nonNegative(),
});
export const stripePriceUpdateSchema = createUpdateSchema(stripePrice);

/**
 * Stripe Customer Schemas
 * Links users to Stripe customer objects
 */
export const stripeCustomerSelectSchema = createSelectSchema(stripeCustomer);
export const stripeCustomerInsertSchema = createInsertSchema(stripeCustomer, {
  email: Refinements.email(),
});
export const stripeCustomerUpdateSchema = createUpdateSchema(stripeCustomer, {
  email: Refinements.emailOptional(),
});

/**
 * Stripe Subscription Schemas
 * Active and historical subscription records
 */
export const stripeSubscriptionSelectSchema = createSelectSchema(stripeSubscription);
export const stripeSubscriptionInsertSchema = createInsertSchema(stripeSubscription, {
  quantity: Refinements.positive(),
});
export const stripeSubscriptionUpdateSchema = createUpdateSchema(stripeSubscription);

/**
 * Stripe Payment Method Schemas
 * Saved payment methods for customers
 */
export const stripePaymentMethodSelectSchema = createSelectSchema(stripePaymentMethod);
export const stripePaymentMethodInsertSchema = createInsertSchema(stripePaymentMethod);
export const stripePaymentMethodUpdateSchema = createUpdateSchema(stripePaymentMethod);

/**
 * Stripe Invoice Schemas
 * Invoice records for subscriptions
 */
export const stripeInvoiceSelectSchema = createSelectSchema(stripeInvoice);
export const stripeInvoiceInsertSchema = createInsertSchema(stripeInvoice, {
  amountDue: Refinements.nonNegative(),
  amountPaid: Refinements.nonNegative(),
  attemptCount: Refinements.nonNegativeInt(),
});
export const stripeInvoiceUpdateSchema = createUpdateSchema(stripeInvoice);

/**
 * Stripe Webhook Event Schemas
 * Audit log of webhook events for idempotency
 */
export const stripeWebhookEventSelectSchema = createSelectSchema(stripeWebhookEvent);
export const stripeWebhookEventInsertSchema = createInsertSchema(stripeWebhookEvent, {
  type: Refinements.content(),
});
export const stripeWebhookEventUpdateSchema = createUpdateSchema(stripeWebhookEvent);

/**
 * Type exports
 */
export type StripeProduct = z.infer<typeof stripeProductSelectSchema>;
export type StripeProductInsert = z.infer<typeof stripeProductInsertSchema>;
export type StripeProductUpdate = z.infer<typeof stripeProductUpdateSchema>;

export type StripePrice = z.infer<typeof stripePriceSelectSchema>;
export type StripePriceInsert = z.infer<typeof stripePriceInsertSchema>;
export type StripePriceUpdate = z.infer<typeof stripePriceUpdateSchema>;

export type StripeCustomer = z.infer<typeof stripeCustomerSelectSchema>;
export type StripeCustomerInsert = z.infer<typeof stripeCustomerInsertSchema>;
export type StripeCustomerUpdate = z.infer<typeof stripeCustomerUpdateSchema>;

export type StripeSubscription = z.infer<typeof stripeSubscriptionSelectSchema>;
export type StripeSubscriptionInsert = z.infer<typeof stripeSubscriptionInsertSchema>;
export type StripeSubscriptionUpdate = z.infer<typeof stripeSubscriptionUpdateSchema>;

export type StripePaymentMethod = z.infer<typeof stripePaymentMethodSelectSchema>;
export type StripePaymentMethodInsert = z.infer<typeof stripePaymentMethodInsertSchema>;
export type StripePaymentMethodUpdate = z.infer<typeof stripePaymentMethodUpdateSchema>;

export type StripeInvoice = z.infer<typeof stripeInvoiceSelectSchema>;
export type StripeInvoiceInsert = z.infer<typeof stripeInvoiceInsertSchema>;
export type StripeInvoiceUpdate = z.infer<typeof stripeInvoiceUpdateSchema>;

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSelectSchema>;
export type StripeWebhookEventInsert = z.infer<typeof stripeWebhookEventInsertSchema>;
export type StripeWebhookEventUpdate = z.infer<typeof stripeWebhookEventUpdateSchema>;
