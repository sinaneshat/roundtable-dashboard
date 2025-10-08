/**
 * Stripe Data Synchronization Service
 *
 * Following Theo's "Stay Sane with Stripe" pattern:
 * https://github.com/t3dotgg/stay-sane-implementing-stripe
 *
 * Philosophy: Single source of truth for Stripe data sync
 * - ONE function that fetches ALL data from Stripe API
 * - Used by webhooks, success page, and manual sync
 * - Prevents race conditions and split brain issues
 * - Always fetches fresh data from Stripe API (never trust webhook payloads)
 */

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { createError, normalizeError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import { stripeService } from '@/api/services/stripe.service';
import { syncUserQuotaFromSubscription } from '@/api/services/usage-tracking.service';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

/**
 * Calculate period end date based on start date and interval
 * Helper to avoid duplicate logic in period extraction
 */
function calculatePeriodEnd(
  startTimestamp: number,
  interval: 'month' | 'year' | 'week' | 'day' = 'month',
  intervalCount: number = 1,
): number {
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(startDate);

  if (interval === 'month') {
    endDate.setMonth(endDate.getMonth() + intervalCount);
  } else if (interval === 'year') {
    endDate.setFullYear(endDate.getFullYear() + intervalCount);
  } else if (interval === 'week') {
    endDate.setDate(endDate.getDate() + (7 * intervalCount));
  } else if (interval === 'day') {
    endDate.setDate(endDate.getDate() + intervalCount);
  }

  return Math.floor(endDate.getTime() / 1000);
}

/**
 * Synced subscription state type (similar to Theo's STRIPE_SUB_CACHE)
 */
export type SyncedSubscriptionState =
  | {
    status: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused';
    subscriptionId: string;
    priceId: string;
    productId: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
    canceledAt: number | null;
    trialStart: number | null;
    trialEnd: number | null;
    paymentMethod: {
      brand: string | null;
      last4: string | null;
    } | null;
  }
  | {
    status: 'none';
  };

/**
 * SINGLE SOURCE OF TRUTH: Sync Stripe Data to Database
 *
 * This function:
 * 1. Fetches latest data from Stripe API (NOT webhook payloads)
 * 2. Upserts to database
 * 3. Returns synced state
 *
 * Called by:
 * - All webhook events (customer.subscription.*, invoice.*, etc.)
 * - Success page after checkout
 * - Manual sync operations
 *
 * @param customerId - Stripe customer ID
 * @returns Synced subscription state
 */
export async function syncStripeDataFromStripe(
  customerId: string,
): Promise<SyncedSubscriptionState> {
  // Theo's Pattern: Type-check customerId is string (throw if not)
  if (typeof customerId !== 'string' || !customerId) {
    throw createError.badRequest('Invalid customer ID: must be a non-empty string', {
      errorType: 'validation',
      field: 'customerId',
    });
  }

  const db = await getDbAsync();

  // Verify customer exists in our database
  const customer = await db.query.stripeCustomer.findFirst({
    where: eq(tables.stripeCustomer.id, customerId),
  });

  if (!customer) {
    throw createError.notFound(`Customer ${customerId} not found in database`, {
      errorType: 'database',
      operation: 'select',
      table: 'stripeCustomer',
    });
  }

  // Fetch latest subscription data from Stripe API (NOT webhook payload)
  // Wrapped in try/catch for proper error handling of Stripe API failures
  let subscriptions: Stripe.ApiList<Stripe.Subscription>;
  try {
    const stripe = stripeService.getClient();
    subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method', 'data.items.data.price'],
    });
  } catch (error) {
    apiLogger.error('Failed to fetch subscriptions from Stripe API', normalizeError(error));
    throw createError.internal('Failed to sync subscription data from Stripe', {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_subscription',
      resourceId: customerId,
    });
  }

  // No subscription exists - user should be on free tier
  if (subscriptions.data.length === 0) {
    // Ensure user usage exists and will be on free tier
    // The rolloverBillingPeriod will handle downgrade when period expires
    return { status: 'none' };
  }

  // Get the latest subscription (user can only have one per Theo's recommendation)
  const subscription = subscriptions.data[0];

  if (!subscription) {
    return { status: 'none' };
  }

  // Extract subscription data
  const firstItem = subscription.items.data[0];
  if (!firstItem) {
    const context: ErrorContext = {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_subscription',
      resourceId: subscription.id,
    };
    throw createError.internal('Subscription has no items', context);
  }

  const price = firstItem.price;
  const product = typeof price.product === 'string' ? price.product : price.product?.id;

  if (!product) {
    const context: ErrorContext = {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_subscription',
      resourceId: price.id,
    };
    throw createError.internal('Price has no associated product', context);
  }

  // Extract payment method details
  let paymentMethod: { brand: string | null; last4: string | null } | null = null;
  if (subscription.default_payment_method && typeof subscription.default_payment_method !== 'string') {
    const pm = subscription.default_payment_method as Stripe.PaymentMethod;
    paymentMethod = {
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
    };
  }

  // Extract period timestamps
  // For flexible billing mode, these are on the subscription item
  // For traditional subscriptions, they're on the subscription itself
  let currentPeriodStart: number;
  let currentPeriodEnd: number;

  const subWithPeriod = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  if (subWithPeriod.current_period_start && subWithPeriod.current_period_end) {
    // Traditional subscription structure
    currentPeriodStart = subWithPeriod.current_period_start;
    currentPeriodEnd = subWithPeriod.current_period_end;
  } else {
    // Flexible billing mode - get from subscription item
    const itemWithPeriod = firstItem as typeof firstItem & {
      current_period_start?: number;
      current_period_end?: number;
    };

    if (itemWithPeriod.current_period_start && itemWithPeriod.current_period_end) {
      currentPeriodStart = itemWithPeriod.current_period_start;
      currentPeriodEnd = itemWithPeriod.current_period_end;
    } else {
      // Fallback to billing_cycle_anchor and calculate end date
      const billingCycleAnchor = (subscription as typeof subscription & { billing_cycle_anchor?: number }).billing_cycle_anchor;
      const interval = price.recurring?.interval || 'month';
      const intervalCount = price.recurring?.interval_count || 1;

      if (billingCycleAnchor) {
        currentPeriodStart = billingCycleAnchor;
        currentPeriodEnd = calculatePeriodEnd(billingCycleAnchor, interval, intervalCount);
      } else {
        // Last resort: use subscription creation date
        currentPeriodStart = subscription.created;
        currentPeriodEnd = calculatePeriodEnd(subscription.created, interval, intervalCount);
      }
    }
  }

  // Fetch recent invoices (wrapped for error handling)
  let invoices: Stripe.ApiList<Stripe.Invoice>;
  try {
    const stripe = stripeService.getClient();
    invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });
  } catch (error) {
    apiLogger.error('Failed to fetch invoices from Stripe API', normalizeError(error));
    throw createError.internal('Failed to sync invoice data from Stripe', {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_invoices',
      resourceId: customerId,
    });
  }

  // Fetch payment methods for the customer (wrapped for error handling)
  let paymentMethods: Stripe.ApiList<Stripe.PaymentMethod>;
  try {
    const stripe = stripeService.getClient();
    paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
  } catch (error) {
    apiLogger.error('Failed to fetch payment methods from Stripe API', normalizeError(error));
    throw createError.internal('Failed to sync payment method data from Stripe', {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_payment_methods',
      resourceId: customerId,
    });
  }

  // Get customer details for updates (wrapped for error handling)
  let stripeCustomer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    const stripe = stripeService.getClient();
    stripeCustomer = await stripe.customers.retrieve(customerId);
  } catch (error) {
    apiLogger.error('Failed to fetch customer from Stripe API', normalizeError(error));
    throw createError.internal('Failed to sync customer data from Stripe', {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_customer',
      resourceId: customerId,
    });
  }

  if ('deleted' in stripeCustomer && stripeCustomer.deleted) {
    throw createError.notFound(`Customer ${customerId} has been deleted in Stripe`, {
      errorType: 'external_service',
      service: 'stripe',
      operation: 'sync_customer',
      resourceId: customerId,
    });
  }

  const customerData = stripeCustomer as Stripe.Customer;

  // Prepare customer update operation
  const customerUpdate = db.update(tables.stripeCustomer)
    .set({
      email: customerData.email || customer.email,
      name: customerData.name || customer.name,
      defaultPaymentMethodId: typeof customerData.invoice_settings?.default_payment_method === 'string'
        ? customerData.invoice_settings.default_payment_method
        : customerData.invoice_settings?.default_payment_method?.id || null,
      updatedAt: new Date(),
    })
    .where(eq(tables.stripeCustomer.id, customerId));

  // Prepare subscription upsert operation
  const subscriptionUpsert = db.insert(tables.stripeSubscription).values({
    id: subscription.id,
    userId: customer.userId,
    customerId: customer.id,
    priceId: price.id,
    status: subscription.status,
    quantity: firstItem.quantity ?? 1,
    currentPeriodStart: new Date(currentPeriodStart * 1000),
    currentPeriodEnd: new Date(currentPeriodEnd * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    metadata: subscription.metadata as Record<string, string> | null,
    createdAt: new Date(subscription.created * 1000),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: tables.stripeSubscription.id,
    set: {
      priceId: price.id, // CRITICAL: Update priceId when subscription plan changes
      status: subscription.status,
      quantity: firstItem.quantity ?? 1,
      currentPeriodStart: new Date(currentPeriodStart * 1000),
      currentPeriodEnd: new Date(currentPeriodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      metadata: subscription.metadata as Record<string, string> | null,
      updatedAt: new Date(),
    },
  });

  // Prepare invoice upsert operations
  const invoiceUpserts = invoices.data.map((invoice) => {
    // Extract subscription ID (can be string or Stripe.Subscription object or null)
    const invoiceData = invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    };
    const subscriptionId = invoiceData.subscription
      ? typeof invoiceData.subscription === 'string'
        ? invoiceData.subscription
        : invoiceData.subscription?.id ?? null
      : null;

    const isPaid = invoice.status === 'paid';

    return db.insert(tables.stripeInvoice).values({
      id: invoice.id,
      customerId,
      subscriptionId,
      status: invoice.status || 'draft',
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      paid: isPaid,
      attemptCount: invoice.attempt_count,
      createdAt: new Date(invoice.created * 1000),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: tables.stripeInvoice.id,
      set: {
        status: invoice.status || 'draft',
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdf: invoice.invoice_pdf ?? null,
        paid: isPaid,
        attemptCount: invoice.attempt_count,
        updatedAt: new Date(),
      },
    });
  });

  // Prepare payment method upsert operations
  const defaultPaymentMethodId = typeof customerData.invoice_settings?.default_payment_method === 'string'
    ? customerData.invoice_settings.default_payment_method
    : customerData.invoice_settings?.default_payment_method?.id;

  const paymentMethodUpserts = paymentMethods.data.map((pm) => {
    const isDefault = pm.id === defaultPaymentMethodId;

    return db.insert(tables.stripePaymentMethod).values({
      id: pm.id,
      customerId,
      type: pm.type as 'card' | 'bank_account' | 'sepa_debit',
      cardBrand: pm.card?.brand || null,
      cardLast4: pm.card?.last4 || null,
      cardExpMonth: pm.card?.exp_month || null,
      cardExpYear: pm.card?.exp_year || null,
      bankName: pm.us_bank_account?.bank_name || null,
      bankLast4: pm.us_bank_account?.last4 || null,
      isDefault,
      createdAt: new Date(pm.created * 1000),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: tables.stripePaymentMethod.id,
      set: {
        cardBrand: pm.card?.brand || null,
        cardLast4: pm.card?.last4 || null,
        cardExpMonth: pm.card?.exp_month || null,
        cardExpYear: pm.card?.exp_year || null,
        bankName: pm.us_bank_account?.bank_name || null,
        bankLast4: pm.us_bank_account?.last4 || null,
        isDefault,
        updatedAt: new Date(),
      },
    });
  });

  // Execute all operations atomically using batch (Cloudflare D1 batch-first architecture)
  // For local development with SQLite, operations execute sequentially (acceptable for dev)
  if ('batch' in db && typeof db.batch === 'function') {
    // Cloudflare D1 - atomic batch execution
    await db.batch([
      customerUpdate,
      subscriptionUpsert,
      ...invoiceUpserts,
      ...paymentMethodUpserts,
    ]);
  } else {
    // Local SQLite fallback - execute sequentially
    await customerUpdate;
    await subscriptionUpsert;
    for (const invoiceUpsert of invoiceUpserts) {
      await invoiceUpsert;
    }
    for (const paymentMethodUpsert of paymentMethodUpserts) {
      await paymentMethodUpsert;
    }
  }

  // Sync user quotas based on subscription changes
  // Handles upgrades (compounds quotas), downgrades, cancellations, and billing period resets
  // Following Theo's pattern: Always pass fresh Stripe data
  await syncUserQuotaFromSubscription(
    customer.userId,
    price.id,
    subscription.status as 'active' | 'trialing' | 'canceled' | 'past_due' | 'unpaid' | 'paused' | 'none',
    new Date(currentPeriodStart * 1000),
    new Date(currentPeriodEnd * 1000),
  );

  // Return synced subscription state (Theo's pattern)
  return {
    status: subscription.status,
    subscriptionId: subscription.id,
    priceId: price.id,
    productId: product,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ?? null,
    trialStart: subscription.trial_start ?? null,
    trialEnd: subscription.trial_end ?? null,
    paymentMethod,
  };
}

/**
 * Get customer ID from user ID
 * Helper for success page and other user-initiated syncs
 */
export async function getCustomerIdByUserId(userId: string): Promise<string | null> {
  const db = await getDbAsync();
  const customer = await db.query.stripeCustomer.findFirst({
    where: eq(tables.stripeCustomer.userId, userId),
  });
  return customer?.id ?? null;
}
