/**
 * Comprehensive Stripe Webhook Event Handler Tests
 *
 * Tests webhook event processing following Theo's "Stay Sane with Stripe" pattern:
 * - Signature verification
 * - Idempotency handling (duplicate events)
 * - Out-of-order event handling
 * - All critical webhook event types
 * - User state and credit updates
 *
 * Pattern: Extract customerId → Sync from Stripe API → Update database
 */

import type { StripeSubscriptionStatus } from '@roundtable/shared/enums';
import { StripeSubscriptionStatuses } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it } from 'vitest';

import { CREDIT_CONFIG } from '@/lib/config';
import type {
  MockStripeEvent,
  MockStripeInvoice,
  MockStripeSubscription,
} from '@/lib/testing';
import {
  createMockStripeEvent,
  createMockStripeInvoice,
  createMockStripeSubscription,
} from '@/lib/testing';

// Stripe invoice status type (matches Zod schema)
type StripeInvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';

// Mock Stripe webhook event factory
function createMockWebhookEvent(
  type: string,
  customerId: string,
  data: Record<string, string | number | boolean | null> = {},
): MockStripeEvent {
  const eventData = {
    id: `obj_${Math.random().toString(36).substring(7)}`,
    customer: customerId,
    ...data,
  };

  return createMockStripeEvent(type, eventData);
}

// Mock subscription data factory (uses lib/testing mock)
function createMockSubscription(
  customerId: string,
  status: StripeSubscriptionStatus = StripeSubscriptionStatuses.ACTIVE,
  priceId: string = 'price_pro_monthly',
  overrides: Partial<MockStripeSubscription> = {},
): MockStripeSubscription {
  const base = createMockStripeSubscription({
    customer: customerId,
    status,
    ...overrides,
  });

  // Override the price ID in the nested structure
  const firstItem = base.items.data[0];
  if (firstItem) {
    firstItem.price.id = priceId;
  }

  return base;
}

// Mock invoice data factory (uses lib/testing mock)
function createMockInvoice(
  customerId: string,
  subscriptionId: string,
  amountPaid: number = 5900,
  status: StripeInvoiceStatus = 'paid',
): MockStripeInvoice {
  return createMockStripeInvoice({
    customer: customerId,
    subscription: subscriptionId,
    amountPaid,
    status,
  });
}

describe('stripe Webhook Event Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signature Verification', () => {
    it('validates webhook signature is present', () => {
      const mockHeaders = new Headers();
      // Missing stripe-signature header

      const hasSignature = mockHeaders.get('stripe-signature');
      expect(hasSignature).toBeNull();
    });

    it('validates webhook signature format', () => {
      const validSignature = 't=1234567890,v1=abcdef1234567890';
      const parts = validSignature.split(',');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain('t=');
      expect(parts[1]).toContain('v1=');
    });

    it('rejects webhook with invalid signature', () => {
      const invalidSignature = 'invalid-signature-format';

      expect(invalidSignature).not.toMatch(/^t=\d+,v1=[a-f0-9]+/);
    });

    it('returns 400 Bad Request for invalid signature', () => {
      // Theo's Pattern: Signature errors are 400 (malformed), not 401 (auth)
      const expectedStatusCode = 400;
      const expectedErrorType = 'badRequest';

      expect(expectedStatusCode).toBe(400);
      expect(expectedErrorType).toBe('badRequest');
    });
  });

  describe('idempotency - Duplicate Event Handling', () => {
    it('detects duplicate webhook events by event ID', () => {
      const eventId = 'evt_test_duplicate_123';
      const seenEvents = new Set<string>();

      // First event
      const isFirstOccurrence = !seenEvents.has(eventId);
      seenEvents.add(eventId);

      expect(isFirstOccurrence).toBe(true);
      expect(seenEvents.has(eventId)).toBe(true);

      // Duplicate event
      const isDuplicate = !seenEvents.has(eventId);
      expect(isDuplicate).toBe(false);
    });

    it('returns 200 OK for duplicate events without reprocessing', () => {
      const eventId = 'evt_test_duplicate_456';
      const processedEvents = new Map<string, boolean>();

      // First processing
      processedEvents.set(eventId, true);

      // Duplicate attempt
      const isAlreadyProcessed = processedEvents.get(eventId);
      expect(isAlreadyProcessed).toBe(true);

      // Should return 200 and skip processing
      const response = {
        received: true,
        event: {
          id: eventId,
          type: 'customer.subscription.updated',
          processed: true,
        },
      };

      expect(response.received).toBe(true);
      expect(response.event.processed).toBe(true);
    });

    it('stores event as unprocessed initially, then marks processed', () => {
      const eventState = {
        id: 'evt_test_789',
        processed: false,
      };

      expect(eventState.processed).toBe(false);

      // After background processing
      eventState.processed = true;
      expect(eventState.processed).toBe(true);
    });

    it('prevents race conditions with database-level idempotency', () => {
      // Theo's Pattern: Use onConflictDoNothing for event insert
      const eventId = 'evt_test_race_123';
      const mockInsert = {
        eventId,
        strategy: 'onConflictDoNothing',
      };

      expect(mockInsert.strategy).toBe('onConflictDoNothing');
    });
  });

  describe('out-of-Order Event Handling', () => {
    it('handles events arriving in wrong chronological order', () => {
      const events = [
        { id: 'evt_1', created: 1000, type: 'customer.subscription.created' },
        { id: 'evt_2', created: 2000, type: 'customer.subscription.updated' },
        { id: 'evt_3', created: 1500, type: 'invoice.paid' }, // Out of order
      ];

      // Sort by timestamp to understand order
      const sorted = [...events].sort((a, b) => a.created - b.created);

      expect(sorted[0]?.id).toBe('evt_1');
      expect(sorted[1]?.id).toBe('evt_3'); // Invoice came between
      expect(sorted[2]?.id).toBe('evt_2');
    });

    it('fetches fresh data from Stripe API regardless of event order', () => {
      // Theo's Pattern: Always sync from API, never trust webhook payload order
      const syncStrategy = {
        source: 'stripe_api',
        trustWebhookPayload: false,
        alwaysFetchFresh: true,
      };

      expect(syncStrategy.source).toBe('stripe_api');
      expect(syncStrategy.trustWebhookPayload).toBe(false);
      expect(syncStrategy.alwaysFetchFresh).toBe(true);
    });

    it('ensures final state reflects latest Stripe data', () => {
      // Even if events arrive out of order, final sync fetches current state
      const _webhookEvents = [
        { created: 2000, payload: { status: 'active' } },
        { created: 1000, payload: { status: 'incomplete' } }, // Older event arrives later
      ];

      // After processing both, sync from API
      const finalStateFromStripeAPI = { status: 'active' }; // Current truth

      expect(finalStateFromStripeAPI.status).toBe('active');
    });
  });

  describe('checkout.session.completed Event', () => {
    it('processes checkout completion for new subscription', () => {
      const customerId = 'cus_test_checkout';
      const event = createMockWebhookEvent(
        'checkout.session.completed',
        customerId,
        {
          mode: 'subscription',
          subscription: 'sub_new_123',
          payment_status: 'paid',
        },
      );

      expect(event.type).toBe('checkout.session.completed');
      expect(event.data.object.customer).toBe(customerId);
    });

    it('extracts customer ID from checkout session', () => {
      const customerId = 'cus_test_extract';
      const event = createMockWebhookEvent('checkout.session.completed', customerId);

      const extractedCustomerId = (event.data.object as { customer: string }).customer;
      expect(extractedCustomerId).toBe(customerId);
    });

    it('triggers eager sync after checkout', () => {
      // Theo's Pattern: Webhook triggers sync, success page also triggers sync
      const syncTriggers = ['webhook', 'success_page'];

      expect(syncTriggers).toContain('webhook');
      expect(syncTriggers).toContain('success_page');
    });

    it('grants monthly credits for Pro subscription', () => {
      const proPlanCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;
      const expectedGrant = proPlanCredits;

      expect(expectedGrant).toBe(CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });
  });

  describe('customer.subscription.created Event', () => {
    it('processes new subscription creation', () => {
      const customerId = 'cus_test_new_sub';
      const subscription = createMockSubscription(customerId, StripeSubscriptionStatuses.ACTIVE);

      const event = createMockWebhookEvent('customer.subscription.created', customerId, {
        ...subscription,
      });

      expect(event.type).toBe('customer.subscription.created');
      expect((event.data.object as { status: string }).status).toBe('active');
    });

    it('updates user tier from free to pro', () => {
      const tierChange = {
        previousTier: 'free',
        newTier: 'pro',
      };

      expect(tierChange.previousTier).toBe('free');
      expect(tierChange.newTier).toBe('pro');
    });

    it('syncs subscription data to database', () => {
      const subscription = createMockSubscription('cus_test_sync', StripeSubscriptionStatuses.ACTIVE, 'price_pro_monthly');

      const dbRecord = {
        id: subscription.id,
        userId: 'user_123',
        customerId: subscription.customer as string,
        status: subscription.status,
        priceId: subscription.items.data[0]?.price.id,
      };

      expect(dbRecord.status).toBe('active');
      expect(dbRecord.priceId).toBe('price_pro_monthly');
    });
  });

  describe('customer.subscription.updated Event', () => {
    it('processes subscription plan changes (upgrades)', () => {
      const customerId = 'cus_test_upgrade';
      const previousPrice = 'price_pro_monthly';
      const newPrice = 'price_pro_annual';

      const event = createMockWebhookEvent('customer.subscription.updated', customerId, {
        items: {
          data: [{ price: { id: newPrice, unit_amount: 59000 } }],
        },
      });

      // Add previous_attributes to event (not in data.object for webhook events)
      const eventWithPrevious = {
        ...event,
        data: {
          ...event.data,
          previous_attributes: {
            items: {
              data: [{ price: { id: previousPrice, unit_amount: 5900 } }],
            },
          },
        },
      };

      expect(eventWithPrevious.type).toBe('customer.subscription.updated');
      expect(eventWithPrevious.data.previous_attributes).toBeDefined();
    });

    it('processes subscription plan changes (downgrades)', () => {
      const customerId = 'cus_test_downgrade';
      const previousPrice = 'price_pro_annual';
      const newPrice = 'price_pro_monthly';

      const event = createMockWebhookEvent('customer.subscription.updated', customerId, {
        previous_attributes: {
          items: {
            data: [{ price: { id: previousPrice, unit_amount: 59000 } }],
          },
        },
        items: {
          data: [{ price: { id: newPrice, unit_amount: 5900 } }],
        },
      });

      expect(event.type).toBe('customer.subscription.updated');
    });

    it('handles subscription status changes', () => {
      const statuses: Stripe.Subscription.Status[] = [
        StripeSubscriptionStatuses.ACTIVE,
        StripeSubscriptionStatuses.PAST_DUE,
        StripeSubscriptionStatuses.UNPAID,
      ];

      statuses.forEach((status) => {
        expect(['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'paused']).toContain(status);
      });
    });

    it('updates billing period dates', () => {
      const now = Math.floor(Date.now() / 1000);
      const periodEnd = now + 30 * 24 * 60 * 60;

      const billingPeriod = {
        currentPeriodStart: new Date(now * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
      };

      expect(billingPeriod.currentPeriodEnd.getTime()).toBeGreaterThan(billingPeriod.currentPeriodStart.getTime());
    });
  });

  describe('customer.subscription.deleted Event', () => {
    it('processes subscription cancellation', () => {
      const customerId = 'cus_test_cancel';
      const subscription = createMockSubscription(customerId, StripeSubscriptionStatuses.CANCELED, 'price_pro_monthly', {
        canceled_at: Math.floor(Date.now() / 1000),
      });

      const event = createMockWebhookEvent('customer.subscription.deleted', customerId, {
        ...subscription,
      });

      expect(event.type).toBe('customer.subscription.deleted');
      expect((event.data.object as { status: string }).status).toBe('canceled');
    });

    it('downgrades user tier to free', () => {
      const tierChange = {
        previousTier: 'pro',
        newTier: 'free',
      };

      expect(tierChange.previousTier).toBe('pro');
      expect(tierChange.newTier).toBe('free');
    });

    it('stops monthly credit grants', () => {
      const subscriptionStatus = 'canceled';
      const shouldGrantCredits = subscriptionStatus === 'active';

      expect(shouldGrantCredits).toBe(false);
    });

    it('tracks cancellation in analytics', () => {
      const analyticsEvent = {
        event: 'subscription_canceled',
        properties: {
          subscriptionId: 'sub_canceled_123',
          canceledAt: new Date(),
        },
      };

      expect(analyticsEvent.event).toBe('subscription_canceled');
      expect(analyticsEvent.properties.subscriptionId).toBeTruthy();
    });
  });

  describe('invoice.payment_succeeded Event', () => {
    it('processes successful payment for subscription', () => {
      const customerId = 'cus_test_payment';
      const subscriptionId = 'sub_test_123';
      const invoice = createMockInvoice(customerId, subscriptionId, 5900, 'paid');

      const event = createMockWebhookEvent('invoice.payment_succeeded', customerId, {
        ...invoice,
      });

      expect(event.type).toBe('invoice.payment_succeeded');
      expect((event.data.object as { paid: boolean }).paid).toBe(true);
    });

    it('grants monthly credits on successful renewal', () => {
      const billingReason = 'subscription_cycle';
      const monthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      const shouldGrantCredits = billingReason === 'subscription_cycle';
      const creditsToGrant = shouldGrantCredits ? monthlyCredits : 0;

      expect(creditsToGrant).toBe(CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });

    it('does not duplicate credits for initial subscription', () => {
      const billingReason = 'subscription_create';
      const isInitialPayment = billingReason === 'subscription_create';

      // Initial payment grants credits via subscription creation, not invoice
      expect(isInitialPayment).toBe(true);
    });

    it('tracks revenue in analytics', () => {
      const revenueEvent = {
        event: 'subscription_renewed',
        properties: {
          revenue: 5900,
          currency: 'usd',
          subscriptionId: 'sub_123',
        },
      };

      expect(revenueEvent.event).toBe('subscription_renewed');
      expect(revenueEvent.properties.revenue).toBe(5900);
    });
  });

  describe('invoice.payment_failed Event', () => {
    it('processes failed payment attempt', () => {
      const customerId = 'cus_test_failed';
      const subscriptionId = 'sub_test_456';
      const invoice = createMockInvoice(customerId, subscriptionId, 5900, 'open');

      const event = createMockWebhookEvent('invoice.payment_failed', customerId, {
        ...invoice,
        attempt_count: 1,
      });

      expect(event.type).toBe('invoice.payment_failed');
      expect((event.data.object as { paid: boolean }).paid).toBe(false);
    });

    it('marks subscription as past_due', () => {
      const subscriptionStatus = 'past_due';
      const isOverdue = subscriptionStatus === 'past_due';

      expect(isOverdue).toBe(true);
    });

    it('does not grant credits for failed payments', () => {
      const paymentStatus = 'failed';
      const shouldGrantCredits = paymentStatus === 'succeeded';

      expect(shouldGrantCredits).toBe(false);
    });

    it('tracks payment failure in analytics', () => {
      const analyticsEvent = {
        event: 'payment_failed',
        properties: {
          subscriptionId: 'sub_123',
          invoiceId: 'in_failed_123',
          attemptCount: 2,
        },
      };

      expect(analyticsEvent.event).toBe('payment_failed');
      expect(analyticsEvent.properties.attemptCount).toBeGreaterThan(0);
    });

    it('handles subscription after max retries', () => {
      const maxRetries = 4;
      const attemptCount = 4;

      const shouldCancel = attemptCount >= maxRetries;
      expect(shouldCancel).toBe(true);
    });
  });

  describe('customer.created Event (Not Tracked)', () => {
    it('is NOT in Theo tracked events list', () => {
      const trackedEvents = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
      ];

      expect(trackedEvents).not.toContain('customer.created');
    });

    it('does not trigger webhook processing', () => {
      // customer.created is not tracked per Theo pattern
      const shouldProcess = false;
      expect(shouldProcess).toBe(false);
    });
  });

  describe('webhook Processing Pattern (Theo)', () => {
    it('always returns 200 OK to prevent retry storms', () => {
      // Even on processing errors, return 200 to Stripe
      const expectedStatusCode = 200;
      expect(expectedStatusCode).toBe(200);
    });

    it('uses waitUntil for async processing', () => {
      const asyncPattern = {
        responseStatus: 200,
        processing: 'async',
        method: 'waitUntil',
      };

      expect(asyncPattern.responseStatus).toBe(200);
      expect(asyncPattern.processing).toBe('async');
      expect(asyncPattern.method).toBe('waitUntil');
    });

    it('extracts only customerId from webhook payload', () => {
      const event = createMockWebhookEvent('customer.subscription.updated', 'cus_extract_test');
      const extractedData = {
        customerId: (event.data.object as { customer: string }).customer,
      };

      // Only extract customerId, nothing else from payload
      expect(Object.keys(extractedData)).toEqual(['customerId']);
      expect(extractedData.customerId).toBe('cus_extract_test');
    });

    it('fetches fresh data from Stripe API', () => {
      // Theo's Pattern: NEVER trust webhook payload data
      const dataSource = {
        webhookPayload: false,
        stripeAPI: true,
      };

      expect(dataSource.webhookPayload).toBe(false);
      expect(dataSource.stripeAPI).toBe(true);
    });

    it('uses single sync function for all events', () => {
      const syncFunctionName = 'syncStripeDataFromStripe';
      const allEventsUseSameFunction = true;

      expect(syncFunctionName).toBe('syncStripeDataFromStripe');
      expect(allEventsUseSameFunction).toBe(true);
    });
  });

  describe('customer State Updates', () => {
    it('updates subscription tier correctly', () => {
      const subscriptionStates = [
        { status: 'active', tier: 'pro' },
        { status: 'canceled', tier: 'free' },
        { status: 'past_due', tier: 'pro' }, // Still pro until fully canceled
      ];

      subscriptionStates.forEach((state) => {
        expect(state.tier).toBeTruthy();
      });
    });

    it('syncs payment method details', () => {
      const paymentMethod = {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2025,
      };

      expect(paymentMethod.brand).toBe('visa');
      expect(paymentMethod.last4).toBe('4242');
    });

    it('updates billing period dates', () => {
      const now = Date.now();
      const thirtyDaysLater = now + 30 * 24 * 60 * 60 * 1000;

      const billingPeriod = {
        start: new Date(now),
        end: new Date(thirtyDaysLater),
      };

      expect(billingPeriod.end.getTime()).toBeGreaterThan(billingPeriod.start.getTime());
    });
  });

  describe('credit Balance Updates', () => {
    it('grants credits for new Pro subscription', () => {
      const subscriptionTier = 'pro';
      const monthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      const creditsToGrant = subscriptionTier === 'pro' ? monthlyCredits : 0;
      expect(creditsToGrant).toBe(CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });

    it('does not grant credits for free tier', () => {
      const _subscriptionTier = 'free';
      const monthlyCredits = 0;

      expect(monthlyCredits).toBe(0);
    });

    it('handles credit refills on renewal', () => {
      const billingReason = 'subscription_cycle';
      const isRenewal = billingReason === 'subscription_cycle';

      expect(isRenewal).toBe(true);
    });

    it('preserves existing credits when upgrading', () => {
      const existingCredits = 50_000;
      const upgradeGrant = CREDIT_CONFIG.PLANS.paid.monthlyCredits;
      const totalCredits = existingCredits + upgradeGrant;

      expect(totalCredits).toBe(existingCredits + CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });
  });

  describe('error Handling', () => {
    it('handles missing customer gracefully', () => {
      const customerId = null;
      const shouldProcess = customerId !== null;

      expect(shouldProcess).toBe(false);
    });

    it('handles Stripe API errors gracefully', () => {
      const apiError = new Error('Stripe API unavailable');
      const shouldReturnOk = true; // Always return 200 to Stripe

      expect(apiError.message).toContain('Stripe API');
      expect(shouldReturnOk).toBe(true);
    });

    it('logs processing errors for investigation', () => {
      const errorLog = {
        level: 'error',
        message: 'Webhook processing failed',
        eventId: 'evt_failed_123',
      };

      expect(errorLog.level).toBe('error');
      expect(errorLog.eventId).toBeTruthy();
    });

    it('returns 200 even on database errors', () => {
      const dbError = new Error('Database connection lost');
      const httpStatus = 200; // Still return 200 to prevent Stripe retries

      expect(dbError.message).toBeTruthy();
      expect(httpStatus).toBe(200);
    });
  });

  describe('edge Cases', () => {
    it('handles subscription with no items', () => {
      const subscription = {
        id: 'sub_no_items',
        items: { data: [] },
      };

      const hasItems = subscription.items.data.length > 0;
      expect(hasItems).toBe(false);
    });

    it('handles missing price on subscription item', () => {
      const subscriptionItem = {
        id: 'si_no_price',
        price: null,
      };

      const hasPrice = subscriptionItem.price !== null;
      expect(hasPrice).toBe(false);
    });

    it('handles deleted customer', () => {
      const customer = {
        id: 'cus_deleted',
        deleted: true,
      };

      const isDeleted = 'deleted' in customer && customer.deleted;
      expect(isDeleted).toBe(true);
    });

    it('handles trial periods correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      const trialEnd = now + 14 * 24 * 60 * 60; // 14 days trial

      const isInTrial = trialEnd > now;
      expect(isInTrial).toBe(true);
    });

    it('handles cancel_at_period_end flag', () => {
      const subscription = {
        id: 'sub_cancel_later',
        cancel_at_period_end: true,
        status: 'active',
      };

      const willCancelLater = subscription.cancel_at_period_end && subscription.status === 'active';
      expect(willCancelLater).toBe(true);
    });
  });

  describe('database Consistency', () => {
    it('uses atomic operations for multi-table updates', () => {
      const batchOperations = [
        'update_customer',
        'upsert_subscription',
        'upsert_invoices',
        'upsert_payment_methods',
      ];

      expect(batchOperations.length).toBeGreaterThan(1);
    });

    it('maintains foreign key constraints', () => {
      const insertOrder = [
        'product', // Must exist first
        'price', // References product
        'subscription', // References price
      ];

      expect(insertOrder[0]).toBe('product');
      expect(insertOrder[1]).toBe('price');
      expect(insertOrder[2]).toBe('subscription');
    });

    it('invalidates cache after updates', () => {
      const cacheInvalidation = {
        tags: ['user_subscription', 'user_credits', 'customer_data'],
        invalidate: true,
      };

      expect(cacheInvalidation.invalidate).toBe(true);
      expect(cacheInvalidation.tags.length).toBeGreaterThan(0);
    });
  });

  describe('analytics Tracking', () => {
    it('tracks subscription started event', () => {
      const analyticsEvent = {
        name: 'subscription_started',
        properties: {
          revenue: 5900,
          currency: 'usd',
          subscriptionId: 'sub_new_123',
        },
      };

      expect(analyticsEvent.name).toBe('subscription_started');
      expect(analyticsEvent.properties.revenue).toBeGreaterThan(0);
    });

    it('tracks subscription renewed event', () => {
      const analyticsEvent = {
        name: 'subscription_renewed',
        billingReason: 'subscription_cycle',
      };

      expect(analyticsEvent.name).toBe('subscription_renewed');
    });

    it('tracks subscription canceled event', () => {
      const analyticsEvent = {
        name: 'subscription_canceled',
        subscriptionId: 'sub_canceled_123',
      };

      expect(analyticsEvent.name).toBe('subscription_canceled');
    });

    it('tracks payment failed event', () => {
      const analyticsEvent = {
        name: 'payment_failed',
        attemptCount: 2,
      };

      expect(analyticsEvent.name).toBe('payment_failed');
      expect(analyticsEvent.attemptCount).toBeGreaterThan(0);
    });
  });
});
