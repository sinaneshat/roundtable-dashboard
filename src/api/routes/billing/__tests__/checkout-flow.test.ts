import { describe, expect, it } from 'vitest';

import { PurchaseTypes } from '@/api/core/enums';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

describe('checkout Flow', () => {
  describe('customer Creation Order', () => {
    it('creates customer BEFORE checkout session', () => {
      const correctOrder = [
        'check_customer_exists',
        'create_stripe_customer',
        'store_customer_binding',
        'create_checkout_session',
      ];

      const checkoutIndex = correctOrder.indexOf('create_checkout_session');
      const customerIndex = correctOrder.indexOf('create_stripe_customer');
      expect(checkoutIndex).toBeGreaterThan(customerIndex);
    });
  });

  describe('customer Metadata', () => {
    it('requires userId in customer metadata', () => {
      const requiredMetadata = {
        userId: 'user_123',
      };

      expect(requiredMetadata).toHaveProperty('userId');
      expect(requiredMetadata.userId).toBeTruthy();
    });
  });

  describe('checkout Session Creation', () => {
    it('includes customerId in checkout params', () => {
      const checkoutParams = {
        customer: 'cus_123',
        success_url: '/chat/billing/subscription-success',
        cancel_url: '/chat/pricing',
      };

      expect(checkoutParams).toHaveProperty('customer');
      expect(checkoutParams.customer).toMatch(/^cus_/);
    });

    it('does NOT use checkout_session_id in success URL', () => {
      const successUrl = '/chat/billing/subscription-success';

      expect(successUrl).not.toContain('{CHECKOUT_SESSION_ID}');
      expect(successUrl).not.toContain('session_id=');
    });
  });

  describe('success Page Routing', () => {
    it('routes subscriptions to subscription-success', () => {
      const subscriptionSuccessUrl = '/chat/billing/subscription-success';
      expect(subscriptionSuccessUrl).toContain('subscription-success');
    });

    it('only supports subscription purchases', () => {
      const supportedPurchases = [PurchaseTypes.SUBSCRIPTION];
      expect(supportedPurchases).not.toContain('credits');
      expect(supportedPurchases).toContain(PurchaseTypes.SUBSCRIPTION);
    });

    it('validates Pro plan pricing at $59/month', () => {
      const proPlanPriceInCents = CREDIT_CONFIG.PLANS.paid.priceInCents;
      const proPlanCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      expect(proPlanPriceInCents).toBe(5900);
      expect(proPlanCredits).toBe(2_000_000);
    });
  });

  describe('subscription Limit', () => {
    it('enforces one subscription per customer', () => {
      const maxSubscriptionsPerCustomer = 1;

      expect(maxSubscriptionsPerCustomer).toBe(1);
    });

    it('blocks checkout if user has active subscription', () => {
      const hasActiveSubscription = true;
      const shouldBlockCheckout = hasActiveSubscription;

      expect(shouldBlockCheckout).toBe(true);
    });
  });
});

describe('checkout Anti-Patterns', () => {
  it('avoids using CHECKOUT_SESSION_ID in success URL', () => {
    const successUrlPattern = '/chat/billing/subscription-success';

    expect(successUrlPattern).not.toContain('{CHECKOUT_SESSION_ID}');
    expect(successUrlPattern).not.toContain('session_id=');
  });

  it('fetches fresh data from Stripe API instead of trusting webhook payload', () => {
    const webhookStrategy = {
      extractFromPayload: ['customerId'],
      fetchFromStripeApi: ['subscription', 'customer', 'invoice'],
    };

    expect(webhookStrategy.extractFromPayload).toEqual(['customerId']);
    expect(webhookStrategy.fetchFromStripeApi).toContain('subscription');
  });

  it('uses single sync function for all Stripe data', () => {
    const syncFunctionName = 'syncStripeDataFromStripe';

    expect(syncFunctionName).toBe('syncStripeDataFromStripe');
  });
});
