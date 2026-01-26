/**
 * Stripe Webhook Event Type Enums
 *
 * Defines all tracked Stripe webhook events for billing operations.
 * All events trigger sync from Stripe API and revenue tracking.
 */

import { z } from 'zod';

// ============================================================================
// STRIPE WEBHOOK EVENT TYPES
// ============================================================================

// 1. ARRAY CONSTANT
export const STRIPE_WEBHOOK_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.upcoming',
  'invoice.marked_uncollectible',
  'invoice.payment_succeeded',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
] as const;

// 2. ZOD SCHEMA
export const StripeWebhookEventTypeSchema = z.enum(STRIPE_WEBHOOK_EVENT_TYPES);

// 3. TYPESCRIPT TYPE (inferred from Zod)
export type StripeWebhookEventType = z.infer<typeof StripeWebhookEventTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_STRIPE_WEBHOOK_EVENT_TYPE: StripeWebhookEventType = 'invoice.paid';

// 5. CONSTANT OBJECT
export const StripeWebhookEventTypes = {
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed' as const,
  CUSTOMER_SUBSCRIPTION_CREATED: 'customer.subscription.created' as const,
  CUSTOMER_SUBSCRIPTION_DELETED: 'customer.subscription.deleted' as const,
  CUSTOMER_SUBSCRIPTION_PAUSED: 'customer.subscription.paused' as const,
  CUSTOMER_SUBSCRIPTION_PENDING_UPDATE_APPLIED: 'customer.subscription.pending_update_applied' as const,
  CUSTOMER_SUBSCRIPTION_PENDING_UPDATE_EXPIRED: 'customer.subscription.pending_update_expired' as const,
  CUSTOMER_SUBSCRIPTION_RESUMED: 'customer.subscription.resumed' as const,
  CUSTOMER_SUBSCRIPTION_TRIAL_WILL_END: 'customer.subscription.trial_will_end' as const,
  CUSTOMER_SUBSCRIPTION_UPDATED: 'customer.subscription.updated' as const,
  INVOICE_MARKED_UNCOLLECTIBLE: 'invoice.marked_uncollectible' as const,
  INVOICE_PAID: 'invoice.paid' as const,
  INVOICE_PAYMENT_ACTION_REQUIRED: 'invoice.payment_action_required' as const,
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed' as const,
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded' as const,
  INVOICE_UPCOMING: 'invoice.upcoming' as const,
  PAYMENT_INTENT_CANCELED: 'payment_intent.canceled' as const,
  PAYMENT_INTENT_PAYMENT_FAILED: 'payment_intent.payment_failed' as const,
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded' as const,
} as const;

// 6. TYPE GUARD (uses Zod safeParse - no type cast)
export function isStripeWebhookEventType(value: unknown): value is StripeWebhookEventType {
  return StripeWebhookEventTypeSchema.safeParse(value).success;
}

// 7. PARSE FUNCTION (returns typed value or undefined)
export function parseStripeWebhookEventType(value: unknown): StripeWebhookEventType | undefined {
  const result = StripeWebhookEventTypeSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
