/**
 * PostHog Revenue Tracking
 *
 * Captures revenue events for PostHog Revenue Analytics.
 * Designed for Stripe webhook integration.
 *
 * PostHog Revenue Analytics Best Practices:
 * - revenue: Amount in minor units (cents) - we send cents to avoid floating point issues
 * - $revenue: PostHog Revenue Analytics dashboard property (same as revenue)
 * - currency: ISO 4217 format (USD, EUR, etc.)
 * - product: Product name
 * - subscription_id: Unique subscription identifier
 * - coupon: Coupon code if applicable
 *
 * Person Properties:
 * - $set: Updates person properties every time (subscription_status, total_revenue, lifetime_value)
 * - $set_once: Sets properties only on first occurrence (first_purchase_date, stripe_customer_id, subscription_started_at)
 *
 * @see https://posthog.com/docs/revenue-analytics/events
 * @see https://posthog.com/docs/product-analytics/person-properties
 */

import type { BillingInterval, StripeSubscriptionStatus } from '@/api/core/enums';

import { getDistinctIdFromCookie, getPostHogClient } from './posthog-server';

type RevenueEventType
  = 'subscription_started'
    | 'subscription_renewed'
    | 'subscription_upgraded'
    | 'subscription_downgraded'
    | 'subscription_canceled'
    | 'credits_purchased'
    | 'payment_failed'
    | 'refund_issued';

type RevenueEventProperties = {
  revenue: number;
  currency: string;
  product?: string;
  subscription_id?: string;
  coupon?: string;
  interval?: BillingInterval;
  price_id?: string;
  invoice_id?: string;
  subscription_status?: StripeSubscriptionStatus;
  total_revenue?: number;
  lifetime_value?: number;
};

type CaptureRevenueOptions = {
  distinctId?: string;
  cookieHeader?: string | null;
  userId?: string;
  customerId?: string;
};

/**
 * Capture a revenue event to PostHog
 *
 * Usage (in webhook handler):
 * ```ts
 * await captureRevenueEvent('subscription_started', {
 *   revenue: 1999, // $19.99 in cents
 *   currency: 'USD',
 *   product: 'Pro Plan',
 *   subscription_id: 'sub_xxx',
 *   interval: 'month',
 * }, { userId: user.id });
 * ```
 */
export async function captureRevenueEvent(
  eventType: RevenueEventType,
  properties: RevenueEventProperties,
  options?: CaptureRevenueOptions,
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog)
    return;

  const distinctId = options?.distinctId
    ?? options?.userId
    ?? (options?.cookieHeader ? getDistinctIdFromCookie(options.cookieHeader) : null)
    ?? options?.customerId
    ?? 'anonymous';

  posthog.capture({
    distinctId,
    event: eventType,
    properties: {
      // Core revenue properties (PostHog Revenue Analytics)
      revenue: properties.revenue,
      $revenue: properties.revenue, // PostHog Revenue Analytics dashboard
      currency: properties.currency,
      product: properties.product,
      subscription_id: properties.subscription_id,
      coupon: properties.coupon,

      // Additional context
      billing_interval: properties.interval,
      stripe_price_id: properties.price_id,
      stripe_invoice_id: properties.invoice_id,

      // Person updates - set every time
      $set: {
        last_billing_event: eventType,
        last_billing_date: new Date().toISOString(),
        ...(properties.product && { current_plan: properties.product }),
        ...(properties.subscription_id && { stripe_subscription_id: properties.subscription_id }),
        ...(properties.subscription_status && { subscription_status: properties.subscription_status }),
        ...(properties.total_revenue !== undefined && { total_revenue: properties.total_revenue }),
        ...(properties.lifetime_value !== undefined && { lifetime_value: properties.lifetime_value }),
      },

      // Person updates - set only once (never overwrite)
      $set_once: {
        first_purchase_date: new Date().toISOString(),
        ...(options?.customerId && { stripe_customer_id: options.customerId }),
        ...(eventType === 'subscription_started' && { subscription_started_at: new Date().toISOString() }),
      },
    },
  });
}

/**
 * Track subscription lifecycle events
 */
export const revenueTracking = {
  subscriptionStarted: (
    props: Omit<RevenueEventProperties, 'revenue' | 'currency'> & {
      revenue: number;
      currency: string;
    },
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('subscription_started', props, options),

  subscriptionRenewed: (
    props: RevenueEventProperties,
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('subscription_renewed', props, options),

  subscriptionUpgraded: (
    props: RevenueEventProperties & { previous_product?: string },
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('subscription_upgraded', props, options),

  subscriptionDowngraded: (
    props: RevenueEventProperties & { previous_product?: string },
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('subscription_downgraded', props, options),

  subscriptionCanceled: (
    props: Partial<RevenueEventProperties> & { subscription_id: string; currency?: string },
    options?: CaptureRevenueOptions,
  ) => {
    const posthog = getPostHogClient();
    if (!posthog)
      return;

    const distinctId = options?.distinctId
      ?? options?.userId
      ?? (options?.cookieHeader ? getDistinctIdFromCookie(options.cookieHeader) : null)
      ?? options?.customerId
      ?? 'anonymous';

    posthog.capture({
      distinctId,
      event: 'subscription_canceled',
      properties: {
        revenue: 0,
        $revenue: 0,
        currency: props.currency ?? 'USD', // Use provided currency, fallback to USD
        subscription_id: props.subscription_id,
        product: props.product,
        $set: {
          last_billing_event: 'subscription_canceled',
          last_billing_date: new Date().toISOString(),
          subscription_status: 'canceled',
          subscription_canceled_at: new Date().toISOString(),
          ...(props.product && { current_plan: props.product }),
        },
      },
    });
  },

  creditsPurchased: (
    props: RevenueEventProperties & { credits_amount?: number },
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('credits_purchased', props, options),

  paymentFailed: (
    props: Partial<RevenueEventProperties> & { error_message?: string; currency?: string },
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('payment_failed', {
    revenue: 0,
    currency: props.currency ?? 'USD', // Use provided currency
    ...props,
  }, options),

  refundIssued: (
    props: RevenueEventProperties & { refund_reason?: string },
    options?: CaptureRevenueOptions,
  ) => captureRevenueEvent('refund_issued', {
    ...props,
    // Refunds should be negative for proper revenue tracking
    revenue: -Math.abs(props.revenue),
  }, options),
};
