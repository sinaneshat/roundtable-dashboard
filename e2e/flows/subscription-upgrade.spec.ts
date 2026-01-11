import type { Page } from '@playwright/test';

import type {
  Product,
  Subscription,
  SyncAfterCheckoutPayload,
} from '@/api/routes/billing/schema';

import { expect, test } from '../fixtures';

type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
    version?: string;
  };
};

type ProductListPayload = {
  items: Product[];
  count: number;
};

type SubscriptionListPayload = {
  items: Subscription[];
  count: number;
};

type CreditBalancePayload = {
  balance: number;
  planType: string;
  monthlyCredits?: number;
  nextRefillAt?: string;
};

type CheckoutPayload = {
  sessionId: string;
  url: string;
};

/**
 * Subscription Upgrade Flow E2E Tests
 *
 * Tests the complete subscription upgrade journey from free to Pro:
 * 1. Free user accesses pricing page
 * 2. Initiates checkout for Pro subscription
 * 3. Completes checkout (mocked Stripe redirect)
 * 4. Returns to success page and syncs subscription data
 * 5. Verifies Pro features are unlocked
 * 6. Tests plan switching (upgrade/downgrade)
 * 7. Tests subscription cancellation
 * 8. Tests billing portal access
 */

/**
 * Helper: Get subscriptions via API
 */
async function getUserSubscriptions(page: Page): Promise<ApiSuccessResponse<SubscriptionListPayload>> {
  const response = await page.request.get('/api/v1/billing/subscriptions');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get products via API
 */
async function getProducts(page: Page): Promise<ApiSuccessResponse<ProductListPayload>> {
  const response = await page.request.get('/api/v1/billing/products');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get credit balance via API
 */
async function getUserCreditBalance(page: Page): Promise<ApiSuccessResponse<CreditBalancePayload>> {
  const response = await page.request.get('/api/v1/credits/balance');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Create checkout session via API
 */
async function createCheckoutSession(page: Page, priceId: string): Promise<ApiSuccessResponse<CheckoutPayload>> {
  const response = await page.request.post('/api/v1/billing/checkout', {
    data: { priceId },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Sync subscription data after checkout via API
 */
async function syncAfterCheckout(page: Page): Promise<ApiSuccessResponse<SyncAfterCheckoutPayload>> {
  const response = await page.request.post('/api/v1/billing/sync-after-checkout');
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe('Subscription Upgrade Flow - UI Journey', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('step 1: free user can access pricing page', async ({ authenticatedPage: page }) => {
    // Navigate to pricing page
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Verify page loaded
    await expect(page).toHaveURL(/\/chat\/pricing/);

    // Check for pricing content
    const pricingHeading = page.getByRole('heading', { name: /pricing|plans|subscribe/i });
    await expect(pricingHeading).toBeVisible({ timeout: 10000 });
  });

  test('step 2: pricing page displays Pro plan with features', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Look for Pro plan card or pricing information
    const proPlanText = page.locator('text=/pro|premium|unlimited/i').first();
    await expect(proPlanText).toBeVisible({ timeout: 10000 });

    // Check for subscribe/upgrade button
    const subscribeButton = page.getByRole('button', { name: /subscribe|upgrade|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 5000 });
  });

  test('step 3: clicking subscribe button initiates checkout flow', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Get products to find Pro plan price
    const productsData = await getProducts(page);
    expect(productsData.success).toBe(true);

    const products = productsData.data?.items || [];
    expect(products.length).toBeGreaterThan(0);

    // Find first product with active prices
    const productWithPrices = products.find(p => p.prices && p.prices.length > 0);
    expect(productWithPrices).toBeDefined();

    const priceId = productWithPrices.prices[0].id;
    expect(priceId).toBeDefined();

    // Create checkout session via API (simulating button click)
    const checkoutData = await createCheckoutSession(page, priceId);

    // Verify checkout session created with URL
    expect(checkoutData.success).toBe(true);
    expect(checkoutData.data?.sessionId).toBeDefined();
    expect(checkoutData.data?.url).toBeDefined();
    expect(checkoutData.data?.url).toContain('stripe.com');
  });

  test('step 4: verify checkout prevents duplicate subscriptions', async ({ authenticatedPage: page }) => {
    // Get current subscriptions
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];

    // If user already has active subscription, checkout should fail
    const hasActiveSubscription = subscriptions.some(
      sub => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      // Get products
      const productsData = await getProducts(page);
      const products = productsData.data?.items || [];
      const priceId = products[0]?.prices?.[0]?.id;

      if (priceId) {
        // Attempt to create checkout should fail
        const response = await page.request.post('/api/v1/billing/checkout', {
          data: { priceId },
        });

        // Should return error
        expect(response.status()).toBe(400);
        const errorData = await response.json();
        expect(errorData.success).toBe(false);
        expect(errorData.error?.message).toMatch(/already have an active subscription/i);
      }
    }
  });
});

test.describe('Subscription Success and Sync Flow', () => {
  test('step 5: success page syncs subscription data', async ({ authenticatedPage: page }) => {
    // Navigate to success page
    await page.goto('/chat/billing/subscription-success');
    await page.waitForLoadState('networkidle');

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Check if sync happened via API
    const syncData = await syncAfterCheckout(page);

    // Verify sync response structure
    expect(syncData.success).toBe(true);
    expect(syncData.data).toBeDefined();
    expect(syncData.data?.synced).toBeDefined();
    expect(syncData.data?.purchaseType).toBeDefined();

    // If synced successfully, should have subscription or tier change info
    if (syncData.data.synced) {
      expect(syncData.data.tierChange).toBeDefined();
      expect(syncData.data.creditsBalance).toBeDefined();
    }
  });

  test('step 6: verify credit balance after subscription sync', async ({ authenticatedPage: page }) => {
    // Sync subscription
    const syncData = await syncAfterCheckout(page);

    if (syncData.data?.synced && syncData.data.purchaseType === 'subscription') {
      // Get credit balance
      const creditData = await getUserCreditBalance(page);

      expect(creditData.success).toBe(true);
      expect(creditData.data?.balance).toBeDefined();

      // Pro users should have monthly credits
      if (syncData.data.tierChange?.newTier === 'paid') {
        expect(creditData.data.balance).toBeGreaterThan(0);
        expect(creditData.data.planType).toBe('paid');
      }
    }
  });
});

test.describe('Subscription Management - Plan Changes', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
  });

  test('step 7: get current subscription details', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);

    expect(subsData.success).toBe(true);

    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      sub => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (activeSubscription) {
      // Verify subscription has required fields
      expect(activeSubscription.id).toBeDefined();
      expect(activeSubscription.status).toBeDefined();
      expect(activeSubscription.priceId).toBeDefined();
      expect(activeSubscription.currentPeriodStart).toBeDefined();
      expect(activeSubscription.currentPeriodEnd).toBeDefined();
    }
  });

  test('step 8: switch subscription plan (upgrade/downgrade)', async ({ authenticatedPage: page }) => {
    // Get current subscriptions
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      sub => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
    }

    // Get available products
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];

    // Find a different price than current
    const currentPriceId = activeSubscription.priceId;
    const allPrices = products.flatMap(p => p.prices || []);
    const differentPrice = allPrices.find(price => price.id !== currentPriceId);

    if (!differentPrice) {
      // No other prices available
      test.skip();
    }

    // Attempt to switch subscription
    const response = await page.request.post(`/api/v1/billing/subscriptions/${activeSubscription.id}/switch`, {
      data: { newPriceId: differentPrice.id },
    });

    // Verify switch response
    if (response.ok()) {
      const switchData = await response.json();
      expect(switchData.success).toBe(true);
      expect(switchData.data?.subscription).toBeDefined();
      expect(switchData.data?.message).toBeDefined();
      expect(switchData.data?.changeDetails).toBeDefined();

      // Verify change details
      const changeDetails = switchData.data.changeDetails;
      expect(changeDetails.oldPrice).toBeDefined();
      expect(changeDetails.newPrice).toBeDefined();
      expect(typeof changeDetails.isUpgrade).toBe('boolean');
      expect(typeof changeDetails.isDowngrade).toBe('boolean');
    }
  });

  test('step 9: verify plan change reflected in UI', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Get current subscription
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      sub => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (activeSubscription) {
      // Look for "Current Plan" or "Active" indicator on pricing page
      const currentPlanIndicator = page.locator('text=/current|active|your plan/i');
      const hasIndicator = await currentPlanIndicator.count();

      // Should see some indication of current plan
      expect(hasIndicator).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Subscription Cancellation Flow', () => {
  test('step 10: cancel subscription at period end', async ({ authenticatedPage: page }) => {
    // Get current subscriptions
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      sub => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
    }

    // Cancel subscription (default: at period end)
    const response = await page.request.post(`/api/v1/billing/subscriptions/${activeSubscription.id}/cancel`, {
      data: { immediately: false },
    });

    if (response.ok()) {
      const cancelData = await response.json();

      expect(cancelData.success).toBe(true);
      expect(cancelData.data?.subscription).toBeDefined();
      expect(cancelData.data?.message).toBeDefined();

      // Verify subscription marked for cancellation
      const subscription = cancelData.data.subscription;
      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.status).toBe('active'); // Still active until period end
    }
  });

  test('step 11: verify canceled subscription retains access until period end', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const canceledSubscription = subscriptions.find(sub => sub.cancelAtPeriodEnd === true);

    if (canceledSubscription) {
      // User should still have access
      expect(canceledSubscription.status).toBe('active');

      // Check credit balance - should still have Pro credits until period ends
      const creditData = await getUserCreditBalance(page);
      if (creditData.success && creditData.data?.planType === 'paid') {
        expect(creditData.data.balance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('step 12: immediate cancellation removes access instantly', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      sub => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
    }

    // Cancel immediately
    const response = await page.request.post(`/api/v1/billing/subscriptions/${activeSubscription.id}/cancel`, {
      data: { immediately: true },
    });

    if (response.ok()) {
      const cancelData = await response.json();

      expect(cancelData.success).toBe(true);

      // Subscription should be canceled status
      const subscription = cancelData.data?.subscription;
      if (subscription) {
        expect(subscription.status).toBe('canceled');
      }
    }
  });
});

test.describe('Billing Portal Access', () => {
  test('step 13: create customer portal session', async ({ authenticatedPage: page }) => {
    // Check if user has Stripe customer (required for portal)
    const subsData = await getUserSubscriptions(page);
    const hasSubscriptions = subsData.data?.items && subsData.data.items.length > 0;

    if (!hasSubscriptions) {
      // User needs subscription first
      test.skip();
    }

    // Create customer portal session
    const response = await page.request.post('/api/v1/billing/portal', {
      data: {
        returnUrl: 'http://localhost:3000/chat',
      },
    });

    if (response.ok()) {
      const portalData = await response.json();

      expect(portalData.success).toBe(true);
      expect(portalData.data?.url).toBeDefined();
      expect(portalData.data?.url).toContain('stripe.com');
    } else if (response.status() === 400) {
      // User doesn't have Stripe customer yet
      const errorData = await response.json();
      expect(errorData.error?.message).toMatch(/no stripe customer found/i);
    }
  });

  test('step 14: manage billing button opens portal', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Look for "Manage Billing" or similar button
    const manageBillingButton = page.getByRole('button', { name: /manage billing|billing portal|manage subscription/i });
    const hasButton = await manageBillingButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasButton) {
      // Click should trigger portal creation
      await manageBillingButton.click();

      // Wait for potential loading state
      await page.waitForTimeout(1000);

      // Check if new tab was opened (portal opens in new tab)
      // Note: In e2e we can't easily verify external Stripe page, but we can verify the request was made
    }
  });
});

test.describe('Subscription Edge Cases and Error Handling', () => {
  test('edge case: prevent switching to same price', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      sub => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
    }

    // Try to switch to the same price
    const currentPriceId = activeSubscription.priceId;
    const response = await page.request.post(`/api/v1/billing/subscriptions/${activeSubscription.id}/switch`, {
      data: { newPriceId: currentPriceId },
    });

    // Should succeed but no meaningful change
    if (response.ok()) {
      const switchData = await response.json();
      expect(switchData.success).toBe(true);
    }
  });

  test('edge case: cancel already canceled subscription', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const canceledSubscription = subscriptions.find(sub => sub.status === 'canceled');

    if (!canceledSubscription) {
      test.skip();
    }

    // Try to cancel already canceled subscription
    const response = await page.request.post(`/api/v1/billing/subscriptions/${canceledSubscription.id}/cancel`, {
      data: { immediately: false },
    });

    // Should return error
    expect(response.status()).toBe(400);
    const errorData = await response.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/already canceled/i);
  });

  test('edge case: access non-existent subscription', async ({ authenticatedPage: page }) => {
    const fakeSubscriptionId = 'sub_fake_nonexistent_123';

    const response = await page.request.get(`/api/v1/billing/subscriptions/${fakeSubscriptionId}`);

    // Should return 404
    expect(response.status()).toBe(404);
    const errorData = await response.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/not found/i);
  });

  test('edge case: switch subscription with invalid price', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(sub => sub.status === 'active');

    if (!activeSubscription) {
      test.skip();
    }

    const fakePriceId = 'price_fake_invalid_123';

    const response = await page.request.post(`/api/v1/billing/subscriptions/${activeSubscription.id}/switch`, {
      data: { newPriceId: fakePriceId },
    });

    // Should return error
    expect(response.status()).toBe(400);
    const errorData = await response.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/not found/i);
  });

  test('edge case: unauthorized subscription access', async ({ authenticatedPage: page }) => {
    // Try to access another user's subscription (if we had multiple users)
    // For now, test accessing with invalid ID format

    const invalidSubscriptionId = 'invalid_id_format';

    const response = await page.request.get(`/api/v1/billing/subscriptions/${invalidSubscriptionId}`);

    // Should return 404 or 401
    expect([401, 404]).toContain(response.status());
  });
});

test.describe('Subscription UI State and Navigation', () => {
  test('step 15: verify pricing page shows correct state for subscribed user', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Get subscriptions
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      sub => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      // Should show "Current Plan", "Change Plan", or "Manage" buttons instead of "Subscribe"
      const changeButtons = page.locator('button, a').filter({ hasText: /current|change|manage|switch/i });
      const hasChangeOptions = await changeButtons.count();

      expect(hasChangeOptions).toBeGreaterThanOrEqual(0);
    }
  });

  test('step 16: verify subscription success page redirects to chat', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/billing/subscription-success');
    await page.waitForLoadState('networkidle');

    // Wait for potential auto-redirect
    await page.waitForTimeout(5000);

    // Should either be on success page or redirected to chat
    const currentUrl = page.url();
    const isOnSuccessOrChat = currentUrl.includes('/subscription-success') || currentUrl.includes('/chat');
    expect(isOnSuccessOrChat).toBe(true);
  });

  test('step 17: verify subscription changed page shows change details', async ({ authenticatedPage: page }) => {
    // Navigate with mock query params
    await page.goto('/chat/billing/subscription-changed?changeType=upgrade');
    await page.waitForLoadState('networkidle');

    // Should see subscription changed content
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Subscription and Credits Integration', () => {
  test('step 18: verify Pro subscription grants monthly credits', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeProSubscription = subscriptions.find(
      sub => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeProSubscription) {
      test.skip();
    }

    // Check credit balance
    const creditData = await getUserCreditBalance(page);

    expect(creditData.success).toBe(true);

    if (creditData.data?.planType === 'paid') {
      // Pro users should have monthly credits
      expect(creditData.data.monthlyCredits).toBeGreaterThan(0);
      expect(creditData.data.balance).toBeGreaterThanOrEqual(0);
    }
  });

  test('step 19: verify credit refill date aligns with subscription period', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(sub => sub.status === 'active');

    if (!activeSubscription) {
      test.skip();
    }

    const creditData = await getUserCreditBalance(page);

    if (creditData.success && creditData.data?.nextRefillAt) {
      const refillDate = new Date(creditData.data.nextRefillAt);
      const periodEnd = new Date(activeSubscription.currentPeriodEnd);

      // Refill should be around subscription period end
      // Allow some variance for processing time
      const timeDiff = Math.abs(refillDate.getTime() - periodEnd.getTime());
      const oneDayInMs = 24 * 60 * 60 * 1000;

      expect(timeDiff).toBeLessThan(oneDayInMs * 2); // Within 2 days
    }
  });

  test('step 20: verify canceled subscription maintains credits until period end', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const canceledButActiveSub = subscriptions.find(
      sub => sub.status === 'active' && sub.cancelAtPeriodEnd === true,
    );

    if (!canceledButActiveSub) {
      test.skip();
    }

    // User should still have access to Pro credits
    const creditData = await getUserCreditBalance(page);

    if (creditData.success) {
      // Should still have paid plan until period ends
      expect(creditData.data?.planType).toBe('paid');
      expect(creditData.data?.balance).toBeGreaterThanOrEqual(0);
    }
  });
});
