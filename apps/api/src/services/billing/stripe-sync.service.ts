/**
 * Stripe Data Synchronization Service
 */

import type {
  BillingInterval,
  InvoiceStatus,
  PaymentMethodType,
  PriceType,
} from '@roundtable/shared/enums';
import {
  BillingIntervals,
  DEFAULT_PAYMENT_METHOD_TYPE,
  InvoiceStatuses,
  isPaymentMethodType,
  PriceTypes,
  StripeSubscriptionStatusSchema,
  SyncedSubscriptionStatuses,
} from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { executeBatch } from '@/common/batch-operations';
import { createError } from '@/common/error-handling';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import { getUserSubscriptionCacheTags } from '@/db/cache/cache-tags';
import {
  hasBillingCycleAnchor,
  hasPeriodTimestamps,
  isStringRecord,
  isStripePaymentMethod,
  safeParse,
} from '@/lib/utils';
import { syncUserQuotaFromSubscription } from '@/services/usage';

import { stripeService } from './stripe.service';
import {
  cacheCustomerId,
  cacheSubscriptionData,
  getCachedCustomerId,
  invalidateSubscriptionCache,
} from './stripe-kv-cache';
import type { SyncedSubscriptionState } from './stripe-sync-schemas';

const INTERVAL_CALCULATORS: Record<BillingInterval, (date: Date, count: number) => void> = {
  [BillingIntervals.DAY]: (d, c) => d.setDate(d.getDate() + c),
  [BillingIntervals.MONTH]: (d, c) => d.setMonth(d.getMonth() + c),
  [BillingIntervals.WEEK]: (d, c) => d.setDate(d.getDate() + (7 * c)),
  [BillingIntervals.YEAR]: (d, c) => d.setFullYear(d.getFullYear() + c),
};

function calculatePeriodEnd(
  startTimestamp: number,
  interval: BillingInterval = BillingIntervals.MONTH,
  intervalCount = 1,
): number {
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(startDate);

  const calculator = INTERVAL_CALCULATORS[interval];
  calculator(endDate, intervalCount);

  return Math.floor(endDate.getTime() / 1000);
}

export async function syncStripeDataFromStripe(
  customerId: string,
): Promise<SyncedSubscriptionState> {
  if (typeof customerId !== 'string' || !customerId) {
    throw createError.badRequest(
      'Invalid customer ID',
      { errorType: 'validation', field: 'customerId' },
    );
  }

  const db = await getDbAsync();

  // NO CACHE: Customer/subscription data must always be fresh
  const customerResults = await db
    .select()
    .from(tables.stripeCustomer)
    .where(eq(tables.stripeCustomer.id, customerId))
    .limit(1);

  const customer = customerResults[0];
  if (!customer) {
    throw createError.notFound(
      'Customer not found',
      { errorType: 'database', operation: 'select', table: 'stripeCustomer' },
    );
  }

  let subscriptions: Stripe.ApiList<Stripe.Subscription>;
  try {
    const stripe = await stripeService.ensureClient();
    subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      expand: ['data.default_payment_method', 'data.items.data.price'],
      limit: 1,
      status: 'all',
    });
  } catch {
    throw createError.internal(
      'Failed to sync subscription data',
      { errorType: 'external_service', operation: 'sync_subscription', resourceId: customerId, service: 'stripe' },
    );
  }

  if (subscriptions.data.length === 0) {
    return { status: SyncedSubscriptionStatuses.NONE };
  }

  const subscription = subscriptions.data[0];
  if (!subscription) {
    return { status: SyncedSubscriptionStatuses.NONE };
  }

  const firstItem = subscription.items.data[0];
  if (!firstItem) {
    throw createError.internal(
      'Subscription has no items',
      { errorType: 'external_service', operation: 'sync_subscription', resourceId: subscription.id, service: 'stripe' },
    );
  }

  const price = firstItem.price;
  const product = typeof price.product === 'string' ? price.product : price.product?.id;

  if (!product) {
    throw createError.internal(
      'Price has no associated product',
      { errorType: 'external_service', operation: 'sync_subscription', resourceId: price.id, service: 'stripe' },
    );
  }

  let paymentMethod: { brand: string | null; last4: string | null } | null = null;
  if (subscription.default_payment_method && typeof subscription.default_payment_method !== 'string') {
    const pm = subscription.default_payment_method;
    if (isStripePaymentMethod(pm)) {
      paymentMethod = {
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
      };
    }
  }

  let currentPeriodStart: number;
  let currentPeriodEnd: number;

  if (hasPeriodTimestamps(subscription) && subscription.current_period_start && subscription.current_period_end) {
    currentPeriodStart = subscription.current_period_start;
    currentPeriodEnd = subscription.current_period_end;
  } else if (hasPeriodTimestamps(firstItem) && firstItem.current_period_start && firstItem.current_period_end) {
    currentPeriodStart = firstItem.current_period_start;
    currentPeriodEnd = firstItem.current_period_end;
  } else {
    const billingCycleAnchor = hasBillingCycleAnchor(subscription) ? subscription.billing_cycle_anchor : undefined;
    const interval = price.recurring?.interval || BillingIntervals.MONTH;
    const intervalCount = price.recurring?.interval_count || 1;

    if (billingCycleAnchor) {
      currentPeriodStart = billingCycleAnchor;
      currentPeriodEnd = calculatePeriodEnd(billingCycleAnchor, interval, intervalCount);
    } else {
      currentPeriodStart = subscription.created;
      currentPeriodEnd = calculatePeriodEnd(subscription.created, interval, intervalCount);
    }
  }

  const stripe = await stripeService.ensureClient();

  let invoices: Stripe.ApiList<Stripe.Invoice>;
  let paymentMethods: Stripe.ApiList<Stripe.PaymentMethod>;
  let stripeCustomer: Stripe.Customer | Stripe.DeletedCustomer;

  try {
    [invoices, paymentMethods, stripeCustomer] = await Promise.all([
      stripe.invoices.list({ customer: customerId, limit: 10 }),
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
      stripe.customers.retrieve(customerId),
    ]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw createError.internal(
      `Failed to sync Stripe data: ${errorMessage}`,
      { errorType: 'external_service', operation: 'sync_parallel', resourceId: customerId, service: 'stripe' },
    );
  }

  if ('deleted' in stripeCustomer && stripeCustomer.deleted) {
    throw createError.notFound(
      'Customer has been deleted in Stripe',
      { errorType: 'external_service', operation: 'sync_customer', resourceId: customerId, service: 'stripe' },
    );
  }

  const customerData = stripeCustomer;

  const customerUpdate = db.update(tables.stripeCustomer)
    .set({
      defaultPaymentMethodId: typeof customerData.invoice_settings?.default_payment_method === 'string'
        ? customerData.invoice_settings.default_payment_method
        : customerData.invoice_settings?.default_payment_method?.id || null,
      email: customerData.email || customer.email,
      name: customerData.name || customer.name,
      updatedAt: new Date(),
    })
    .where(eq(tables.stripeCustomer.id, customerId));

  const now = new Date();

  const productUpsert = db.insert(tables.stripeProduct).values({
    active: price.active,
    createdAt: now,
    defaultPriceId: price.id,
    description: null,
    features: null,
    id: product,
    images: null,
    metadata: null,
    name: price.nickname || 'Subscription Plan',
    updatedAt: now,
  }).onConflictDoUpdate({
    set: {
      active: price.active,
      defaultPriceId: price.id,
      updatedAt: now,
    },
    target: tables.stripeProduct.id,
  });

  const priceType: PriceType = price.type === PriceTypes.ONE_TIME ? PriceTypes.ONE_TIME : PriceTypes.RECURRING;
  const priceInterval: BillingInterval | null = price.recurring?.interval ?? null;

  const priceUpsert = db.insert(tables.stripePrice).values({
    active: price.active,
    createdAt: now,
    currency: price.currency,
    id: price.id,
    interval: priceInterval,
    intervalCount: price.recurring?.interval_count ?? null,
    metadata: null,
    productId: product,
    trialPeriodDays: null,
    type: priceType,
    unitAmount: price.unit_amount ?? null,
    updatedAt: now,
  }).onConflictDoUpdate({
    set: {
      active: price.active,
      currency: price.currency,
      interval: priceInterval,
      intervalCount: price.recurring?.interval_count ?? null,
      unitAmount: price.unit_amount ?? null,
      updatedAt: now,
    },
    target: tables.stripePrice.id,
  });

  const subscriptionUpsert = db.insert(tables.stripeSubscription).values({
    cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    createdAt: new Date(subscription.created * 1000),
    currentPeriodEnd: new Date(currentPeriodEnd * 1000),
    currentPeriodStart: new Date(currentPeriodStart * 1000),
    customerId: customer.id,
    endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
    id: subscription.id,
    metadata: isStringRecord(subscription.metadata) ? subscription.metadata : null,
    priceId: price.id,
    quantity: firstItem.quantity ?? 1,
    status: subscription.status,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
    updatedAt: new Date(),
    userId: customer.userId,
  }).onConflictDoUpdate({
    set: {
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      currentPeriodEnd: new Date(currentPeriodEnd * 1000),
      currentPeriodStart: new Date(currentPeriodStart * 1000),
      endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
      metadata: isStringRecord(subscription.metadata) ? subscription.metadata : null,
      priceId: price.id,
      quantity: firstItem.quantity ?? 1,
      status: subscription.status,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      updatedAt: new Date(),
    },
    target: tables.stripeSubscription.id,
  });

  const invoiceUpserts = invoices.data.map((invoice) => {
    const sub = invoice.parent?.subscription_details?.subscription;
    const subscriptionId = sub ? (typeof sub === 'string' ? sub : sub.id) : null;
    const invoiceStatus: InvoiceStatus = invoice.status || InvoiceStatuses.DRAFT;
    const isPaid = invoiceStatus === InvoiceStatuses.PAID;

    return db.insert(tables.stripeInvoice).values({
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      attemptCount: invoice.attempt_count,
      createdAt: new Date(invoice.created * 1000),
      currency: invoice.currency,
      customerId,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      id: invoice.id,
      invoicePdf: invoice.invoice_pdf ?? null,
      paid: isPaid,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      status: invoiceStatus,
      subscriptionId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      set: {
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        attemptCount: invoice.attempt_count,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdf: invoice.invoice_pdf ?? null,
        paid: isPaid,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        status: invoiceStatus,
        updatedAt: new Date(),
      },
      target: tables.stripeInvoice.id,
    });
  });

  const defaultPaymentMethodId = typeof customerData.invoice_settings?.default_payment_method === 'string'
    ? customerData.invoice_settings.default_payment_method
    : customerData.invoice_settings?.default_payment_method?.id;

  const paymentMethodUpserts = paymentMethods.data.map((pm) => {
    const isDefault = pm.id === defaultPaymentMethodId;
    const paymentType: PaymentMethodType = isPaymentMethodType(pm.type)
      ? pm.type
      : DEFAULT_PAYMENT_METHOD_TYPE;

    return db.insert(tables.stripePaymentMethod).values({
      bankLast4: pm.us_bank_account?.last4 || null,
      bankName: pm.us_bank_account?.bank_name || null,
      cardBrand: pm.card?.brand || null,
      cardExpMonth: pm.card?.exp_month || null,
      cardExpYear: pm.card?.exp_year || null,
      cardLast4: pm.card?.last4 || null,
      createdAt: new Date(pm.created * 1000),
      customerId,
      id: pm.id,
      isDefault,
      type: paymentType,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      set: {
        bankLast4: pm.us_bank_account?.last4 || null,
        bankName: pm.us_bank_account?.bank_name || null,
        cardBrand: pm.card?.brand || null,
        cardExpMonth: pm.card?.exp_month || null,
        cardExpYear: pm.card?.exp_year || null,
        cardLast4: pm.card?.last4 || null,
        isDefault,
        updatedAt: new Date(),
      },
      target: tables.stripePaymentMethod.id,
    });
  });

  await executeBatch(db, [
    customerUpdate,
    productUpsert,
    priceUpsert,
    subscriptionUpsert,
    ...invoiceUpserts,
    ...paymentMethodUpserts,
  ]);

  const validatedStatus = safeParse(StripeSubscriptionStatusSchema, subscription.status);
  if (!validatedStatus) {
    throw createError.internal(
      'Invalid subscription status',
      { errorType: 'validation', field: 'subscription.status' },
    );
  }

  await syncUserQuotaFromSubscription(
    customer.userId,
    price.id,
    validatedStatus,
    new Date(currentPeriodStart * 1000),
    new Date(currentPeriodEnd * 1000),
  );

  if (db.$cache?.invalidate) {
    await db.$cache.invalidate({
      tags: getUserSubscriptionCacheTags(customer.userId, customerId, price.id),
    });
  }

  const syncedState: SyncedSubscriptionState = {
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ?? null,
    currentPeriodEnd,
    currentPeriodStart,
    paymentMethod,
    priceId: price.id,
    productId: product,
    status: subscription.status,
    subscriptionId: subscription.id,
    trialEnd: subscription.trial_end ?? null,
    trialStart: subscription.trial_start ?? null,
  };

  // KV cache: invalidate old, cache new (Theo pattern)
  await invalidateSubscriptionCache(customerId);
  await cacheSubscriptionData(customerId, syncedState);

  // Also cache userId → customerId mapping
  await cacheCustomerId(customer.userId, customerId);

  return syncedState;
}

export async function getCustomerIdByUserId(userId: string): Promise<string | null> {
  // KV cache first (Theo pattern: stripe:user:${userId})
  const cachedCustomerId = await getCachedCustomerId(userId);
  if (cachedCustomerId) {
    return cachedCustomerId;
  }

  // Fall back to database
  const db = await getDbAsync();
  const customerResults = await db
    .select()
    .from(tables.stripeCustomer)
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  const customerId = customerResults[0]?.id ?? null;

  // Cache for next time if found
  if (customerId) {
    await cacheCustomerId(userId, customerId);
  }

  return customerId;
}
