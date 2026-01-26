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

import type { BillingInterval, StripeSubscriptionStatus } from '@roundtable/shared/enums';

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
  product?: string | undefined;
  subscription_id?: string | undefined;
  coupon?: string | undefined;
  interval?: BillingInterval | undefined;
  price_id?: string | undefined;
  invoice_id?: string | undefined;
  subscription_status?: StripeSubscriptionStatus | undefined;
  total_revenue?: number | undefined;
  lifetime_value?: number | undefined;
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
  if (!posthog) {
    return;
  }

  const distinctId = options?.distinctId
    ?? options?.userId
    ?? (options?.cookieHeader ? getDistinctIdFromCookie(options.cookieHeader) : null)
    ?? options?.customerId
    ?? 'anonymous';

  posthog.capture({
    distinctId,
    event: eventType,
    properties: {
      $revenue: properties.revenue, // PostHog Revenue Analytics dashboard
      // Person updates - set every time
      $set: {
        last_billing_date: new Date().toISOString(),
        last_billing_event: eventType,
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
      // Additional context
      billing_interval: properties.interval,
      coupon: properties.coupon,
      currency: properties.currency,

      product: properties.product,
      // Core revenue properties (PostHog Revenue Analytics)
      revenue: properties.revenue,
      stripe_invoice_id: properties.invoice_id,

      stripe_price_id: properties.price_id,

      subscription_id: properties.subscription_id,
    },
  });
}

/**
 * Track subscription lifecycle events
 */
export const revenueTracking = {
  creditsPurchased: async (
    props: RevenueEventProperties & { credits_amount?: number },
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('credits_purchased', props, options),

  paymentFailed: async (
    props: Partial<RevenueEventProperties> & { error_message?: string; currency?: string },
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('payment_failed', {
    currency: props.currency ?? 'USD', // Use provided currency
    revenue: 0,
    ...props,
  }, options),

  refundIssued: async (
    props: RevenueEventProperties & { refund_reason?: string },
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('refund_issued', {
    ...props,
    // Refunds should be negative for proper revenue tracking
    revenue: -Math.abs(props.revenue),
  }, options),

  subscriptionCanceled: (
    props: Partial<RevenueEventProperties> & { subscription_id: string; currency?: string },
    options?: CaptureRevenueOptions,
  ) => {
    const posthog = getPostHogClient();
    if (!posthog) {
      return;
    }

    const distinctId = options?.distinctId
      ?? options?.userId
      ?? (options?.cookieHeader ? getDistinctIdFromCookie(options.cookieHeader) : null)
      ?? options?.customerId
      ?? 'anonymous';

    posthog.capture({
      distinctId,
      event: 'subscription_canceled',
      properties: {
        $revenue: 0,
        $set: {
          last_billing_date: new Date().toISOString(),
          last_billing_event: 'subscription_canceled',
          subscription_canceled_at: new Date().toISOString(),
          subscription_status: 'canceled',
          ...(props.product && { current_plan: props.product }),
        },
        currency: props.currency ?? 'USD', // Use provided currency, fallback to USD
        product: props.product,
        revenue: 0,
        subscription_id: props.subscription_id,
      },
    });
  },

  subscriptionDowngraded: async (
    props: RevenueEventProperties & { previous_product?: string },
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('subscription_downgraded', props, options),

  subscriptionRenewed: async (
    props: RevenueEventProperties,
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('subscription_renewed', props, options),

  subscriptionStarted: async (
    props: Omit<RevenueEventProperties, 'revenue' | 'currency'> & {
      revenue: number;
      currency: string;
    },
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('subscription_started', props, options),

  subscriptionUpgraded: async (
    props: RevenueEventProperties & { previous_product?: string },
    options?: CaptureRevenueOptions,
  ) => await captureRevenueEvent('subscription_upgraded', props, options),
};
