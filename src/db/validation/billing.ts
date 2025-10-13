import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type { z } from 'zod';

import {
  stripeCustomer,
  stripeInvoice,
  stripePaymentMethod,
  stripePrice,
  stripeProduct,
  stripeSubscription,
  stripeWebhookEvent,
} from '@/db/tables/billing';

/**
 * Stripe Product Schemas
 * Validation for Stripe product records synced from Stripe
 */
export const stripeProductSelectSchema = createSelectSchema(stripeProduct);
export const stripeProductInsertSchema = createInsertSchema(stripeProduct, {
  name: schema => schema.min(1),
});
export const stripeProductUpdateSchema = createUpdateSchema(stripeProduct, {
  name: schema => schema.min(1).optional(),
});

/**
 * Stripe Price Schemas
 * Validation for pricing plans associated with products
 */
export const stripePriceSelectSchema = createSelectSchema(stripePrice);
export const stripePriceInsertSchema = createInsertSchema(stripePrice, {
  currency: schema => schema.length(3), // ISO 4217 currency code
  unitAmount: schema => schema.min(0),
});
export const stripePriceUpdateSchema = createUpdateSchema(stripePrice);

/**
 * Stripe Customer Schemas
 * Links users to Stripe customer objects
 */
export const stripeCustomerSelectSchema = createSelectSchema(stripeCustomer);
export const stripeCustomerInsertSchema = createInsertSchema(stripeCustomer, {
  email: schema => schema.email(),
});
export const stripeCustomerUpdateSchema = createUpdateSchema(stripeCustomer, {
  email: schema => schema.email().optional(),
});

/**
 * Stripe Subscription Schemas
 * Active and historical subscription records
 */
export const stripeSubscriptionSelectSchema = createSelectSchema(stripeSubscription);
export const stripeSubscriptionInsertSchema = createInsertSchema(stripeSubscription, {
  quantity: schema => schema.min(1),
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
  amountDue: schema => schema.min(0),
  amountPaid: schema => schema.min(0),
  attemptCount: schema => schema.min(0),
});
export const stripeInvoiceUpdateSchema = createUpdateSchema(stripeInvoice);

/**
 * Stripe Webhook Event Schemas
 * Audit log of webhook events for idempotency
 */
export const stripeWebhookEventSelectSchema = createSelectSchema(stripeWebhookEvent);
export const stripeWebhookEventInsertSchema = createInsertSchema(stripeWebhookEvent, {
  type: schema => schema.min(1),
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
