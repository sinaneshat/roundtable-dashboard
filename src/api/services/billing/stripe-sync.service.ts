/**
 * Stripe Data Synchronization Service
 */

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { executeBatch } from '@/api/common/batch-operations';
import { createError } from '@/api/common/error-handling';
import type {
  BillingInterval,
  InvoiceStatus,
  PaymentMethodType,
  PriceType,
} from '@/api/core/enums';
import {
  BillingIntervals,
  DEFAULT_PAYMENT_METHOD_TYPE,
  InvoiceStatuses,
  isPaymentMethodType,
  PriceTypes,
  StripeSubscriptionStatusSchema,
  SyncedSubscriptionStatuses,
} from '@/api/core/enums';
import { syncUserQuotaFromSubscription } from '@/api/services/usage';
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

import { stripeService } from './stripe.service';
import type { SyncedSubscriptionState } from './stripe-sync-schemas';

function calculatePeriodEnd(
  startTimestamp: number,
  interval: BillingInterval = BillingIntervals.MONTH,
  intervalCount: number = 1,
): number {
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(startDate);

  if (interval === BillingIntervals.MONTH) {
    endDate.setMonth(endDate.getMonth() + intervalCount);
  } else if (interval === BillingIntervals.YEAR) {
    endDate.setFullYear(endDate.getFullYear() + intervalCount);
  } else if (interval === BillingIntervals.WEEK) {
    endDate.setDate(endDate.getDate() + (7 * intervalCount));
  } else if (interval === BillingIntervals.DAY) {
    endDate.setDate(endDate.getDate() + intervalCount);
  }

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
    const stripe = stripeService.getClient();
    subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method', 'data.items.data.price'],
    });
  } catch {
    throw createError.internal(
      'Failed to sync subscription data',
      { errorType: 'external_service', service: 'stripe', operation: 'sync_subscription', resourceId: customerId },
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
      { errorType: 'external_service', service: 'stripe', operation: 'sync_subscription', resourceId: subscription.id },
    );
  }

  const price = firstItem.price;
  const product = typeof price.product === 'string' ? price.product : price.product?.id;

  if (!product) {
    throw createError.internal(
      'Price has no associated product',
      { errorType: 'external_service', service: 'stripe', operation: 'sync_subscription', resourceId: price.id },
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

  const stripe = stripeService.getClient();

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
      { errorType: 'external_service', service: 'stripe', operation: 'sync_parallel', resourceId: customerId },
    );
  }

  if ('deleted' in stripeCustomer && stripeCustomer.deleted) {
    throw createError.notFound(
      'Customer has been deleted in Stripe',
      { errorType: 'external_service', service: 'stripe', operation: 'sync_customer', resourceId: customerId },
    );
  }

  const customerData = stripeCustomer;

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

  const now = new Date();

  const productUpsert = db.insert(tables.stripeProduct).values({
    id: product,
    name: price.nickname || 'Subscription Plan',
    description: null,
    active: price.active,
    defaultPriceId: price.id,
    metadata: null,
    images: null,
    features: null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: tables.stripeProduct.id,
    set: {
      active: price.active,
      defaultPriceId: price.id,
      updatedAt: now,
    },
  });

  const priceType: PriceType = price.type === PriceTypes.ONE_TIME ? PriceTypes.ONE_TIME : PriceTypes.RECURRING;
  const priceInterval: BillingInterval | null = price.recurring?.interval ?? null;

  const priceUpsert = db.insert(tables.stripePrice).values({
    id: price.id,
    productId: product,
    active: price.active,
    currency: price.currency,
    unitAmount: price.unit_amount ?? null,
    type: priceType,
    interval: priceInterval,
    intervalCount: price.recurring?.interval_count ?? null,
    trialPeriodDays: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: tables.stripePrice.id,
    set: {
      active: price.active,
      currency: price.currency,
      unitAmount: price.unit_amount ?? null,
      interval: priceInterval,
      intervalCount: price.recurring?.interval_count ?? null,
      updatedAt: now,
    },
  });

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
    metadata: isStringRecord(subscription.metadata) ? subscription.metadata : null,
    createdAt: new Date(subscription.created * 1000),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: tables.stripeSubscription.id,
    set: {
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
      metadata: isStringRecord(subscription.metadata) ? subscription.metadata : null,
      updatedAt: new Date(),
    },
  });

  const invoiceUpserts = invoices.data.map((invoice) => {
    const sub = invoice.parent?.subscription_details?.subscription;
    const subscriptionId = sub ? (typeof sub === 'string' ? sub : sub.id) : null;
    const invoiceStatus: InvoiceStatus = invoice.status || InvoiceStatuses.DRAFT;
    const isPaid = invoiceStatus === InvoiceStatuses.PAID;

    return db.insert(tables.stripeInvoice).values({
      id: invoice.id,
      customerId,
      subscriptionId,
      status: invoiceStatus,
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
        status: invoiceStatus,
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

  const defaultPaymentMethodId = typeof customerData.invoice_settings?.default_payment_method === 'string'
    ? customerData.invoice_settings.default_payment_method
    : customerData.invoice_settings?.default_payment_method?.id;

  const paymentMethodUpserts = paymentMethods.data.map((pm) => {
    const isDefault = pm.id === defaultPaymentMethodId;
    const paymentType: PaymentMethodType = isPaymentMethodType(pm.type)
      ? pm.type
      : DEFAULT_PAYMENT_METHOD_TYPE;

    return db.insert(tables.stripePaymentMethod).values({
      id: pm.id,
      customerId,
      type: paymentType,
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

export async function getCustomerIdByUserId(userId: string): Promise<string | null> {
  const db = await getDbAsync();
  // NO CACHE: Customer data must always be fresh
  const customerResults = await db
    .select()
    .from(tables.stripeCustomer)
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  return customerResults[0]?.id ?? null;
}
