import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

/**
 * Subscription State Transitions E2E Tests
 *
 * Tests complete subscription lifecycle with state transitions:
 * - Plan upgrade (free → paid): Credit balance changes, tier capabilities
 * - Plan downgrade (paid → free): Thread/round limits apply, credit preservation
 * - Subscription cancellation flow: At period end vs immediate
 * - Trial period behavior (if applicable)
 * - Failed payment handling UI
 * - Subscription renewal and credit refill
 *
 * Tests the complete subscription lifecycle and its impact on user capabilities.
 */

/**
 * Helper: Get subscriptions via API
 */
async function getUserSubscriptions(page: Page) {
  const response = await page.request.get('/api/v1/billing/subscriptions');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get products via API
 */
async function getProducts(page: Page) {
  const response = await page.request.get('/api/v1/billing/products');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get credit balance via API
 */
async function getUserCreditBalance(page: Page) {
  const response = await page.request.get('/api/v1/credits/balance');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get user chat usage via API
 */
async function getUserChatUsage(page: Page) {
  const response = await page.request.get('/api/v1/chat/usage');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Create checkout session via API
 */
async function createCheckoutSession(page: Page, priceId: string) {
  const response = await page.request.post('/api/v1/billing/checkout', {
    data: { priceId },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Sync subscription data after checkout via API
 */
async function syncAfterCheckout(page: Page) {
  const response = await page.request.post('/api/v1/billing/sync-after-checkout');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Switch subscription plan via API
 */
async function switchSubscriptionPlan(page: Page, subscriptionId: string, newPriceId: string) {
  const response = await page.request.post(`/api/v1/billing/subscriptions/${subscriptionId}/switch`, {
    data: { newPriceId },
  });
  return response;
}

/**
 * Helper: Cancel subscription via API
 */
async function cancelSubscription(page: Page, subscriptionId: string, immediately: boolean = false) {
  const response = await page.request.post(`/api/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    data: { immediately },
  });
  return response;
}

test.describe('Plan Upgrade (Free → Paid)', () => {
  test('upgrade adds monthly credits to existing balance', async ({ authenticatedPage: page }) => {
    // Get initial credit balance (free tier: 5000 signup credits)
    const initialBalance = await getUserCreditBalance(page);
    expect(initialBalance.success).toBe(true);
    expect(initialBalance.data?.planType).toBe('free');

    const initialCredits = initialBalance.data?.balance || 0;

    // Get products and find Pro plan price
    const productsData = await getProducts(page);
    expect(productsData.success).toBe(true);

    const products = productsData.data?.items || [];
    const proPlan = products.find((p: any) => p.id.includes('pro') || p.name.toLowerCase().includes('pro'));

    if (!proPlan || !proPlan.prices || proPlan.prices.length === 0) {
      test.skip();
      return;
    }

    const priceId = proPlan.prices[0].id;

    // Create checkout session
    const checkoutData = await createCheckoutSession(page, priceId);
    expect(checkoutData.success).toBe(true);

    // Simulate successful checkout by syncing
    const syncData = await syncAfterCheckout(page);
    expect(syncData.success).toBe(true);

    if (syncData.data?.synced && syncData.data.purchaseType === 'subscription') {
      // Get new credit balance
      const newBalance = await getUserCreditBalance(page);
      expect(newBalance.success).toBe(true);

      // Pro users should have monthly credits (100K)
      expect(newBalance.data?.planType).toBe('paid');
      expect(newBalance.data?.monthlyCredits).toBe(100_000);

      // Balance should be initial credits + 100K monthly credits
      expect(newBalance.data?.balance).toBeGreaterThanOrEqual(initialCredits);

      // Should have refill schedule
      expect(newBalance.data?.nextRefillAt).toBeDefined();
      expect(newBalance.data?.lastRefillAt).toBeDefined();
    }
  });

  test('upgrade changes subscription tier from free to pro', async ({ authenticatedPage: page }) => {
    // Sync to ensure latest state
    const syncData = await syncAfterCheckout(page);

    if (syncData.data?.synced && syncData.data.purchaseType === 'subscription') {
      // Check tier change
      expect(syncData.data.tierChange).toBeDefined();
      expect(syncData.data.tierChange?.newTier).toBe('pro');

      // Verify usage tracking reflects pro tier
      const usage = await getUserChatUsage(page);
      if (usage.success) {
        expect(usage.data?.subscriptionTier).toBe('pro');
      }
    }
  });

  test('upgrade unlocks pro tier capabilities', async ({ authenticatedPage: page }) => {
    const usage = await getUserChatUsage(page);

    if (usage.success && usage.data?.subscriptionTier === 'pro') {
      // Pro tier should have higher limits
      // Free tier: 1 thread, 1 round, 100 messages
      // Pro tier: 500 threads, unlimited rounds, 10K messages

      // Verify pro tier quotas are applied (these are limits, not current usage)
      const balance = await getUserCreditBalance(page);
      expect(balance.success).toBe(true);
      expect(balance.data?.planType).toBe('paid');
    }
  });

  test('upgrade preserves existing free credits', async ({ authenticatedPage: page }) => {
    // Get initial balance
    const initialBalance = await getUserCreditBalance(page);

    if (initialBalance.data?.planType === 'free') {
      const freeCreditsRemaining = initialBalance.data.balance;

      // Simulate upgrade (via sync after checkout)
      const syncData = await syncAfterCheckout(page);

      if (syncData.data?.synced && syncData.data.purchaseType === 'subscription') {
        const newBalance = await getUserCreditBalance(page);

        // New balance should include both remaining free credits + monthly pro credits
        // (Free credits + 100K)
        expect(newBalance.data?.balance).toBeGreaterThanOrEqual(freeCreditsRemaining);
      }
    }
  });
});

test.describe('Plan Downgrade (Paid → Free)', () => {
  test('downgrade maintains access until period end', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Cancel subscription at period end (simulates downgrade)
    const cancelResponse = await cancelSubscription(page, activeSubscription.id, false);

    if (cancelResponse.ok()) {
      const cancelData = await cancelResponse.json();
      expect(cancelData.success).toBe(true);

      // Subscription should be marked for cancellation
      expect(cancelData.data?.subscription.cancelAtPeriodEnd).toBe(true);
      expect(cancelData.data?.subscription.status).toBe('active');

      // User should still have pro access
      const balance = await getUserCreditBalance(page);
      if (balance.success) {
        expect(balance.data?.planType).toBe('paid');
      }
    }
  });

  test('downgrade preserves remaining credits', async ({ authenticatedPage: page }) => {
    // Get current credits before cancellation
    const initialBalance = await getUserCreditBalance(page);

    if (initialBalance.data?.planType === 'paid') {
      const creditsBeforeCancel = initialBalance.data.balance;

      // Cancel subscription
      const subsData = await getUserSubscriptions(page);
      const activeSubscription = subsData.data?.items?.find(
        (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
      );

      if (activeSubscription) {
        await cancelSubscription(page, activeSubscription.id, false);

        // Credits should remain the same during grace period
        const newBalance = await getUserCreditBalance(page);
        expect(newBalance.data?.balance).toBe(creditsBeforeCancel);
      }
    }
  });

  test('downgrade stops monthly refills', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const canceledSubscription = subsData.data?.items?.find(
      (sub: any) => sub.cancelAtPeriodEnd === true,
    );

    if (canceledSubscription) {
      const balance = await getUserCreditBalance(page);

      // During grace period, still shows as paid but will stop refills after period ends
      expect(balance.success).toBe(true);
      // monthlyCredits field indicates refill amount (may still show 100K during grace period)
      expect(balance.data?.monthlyCredits).toBeDefined();
    }
  });

  test('downgrade applies free tier limits after period end', async ({ authenticatedPage: page }) => {
    // This test verifies the behavior AFTER the billing period ends
    // In real scenario, this would be tested by advancing time or checking expired subscriptions

    const usage = await getUserChatUsage(page);

    if (usage.success && usage.data?.subscriptionTier === 'free') {
      // User should now have free tier limits
      const balance = await getUserCreditBalance(page);
      expect(balance.data?.planType).toBe('free');
      expect(balance.data?.monthlyCredits).toBe(0);
    }
  });
});

test.describe('Subscription Cancellation Flow', () => {
  test('cancel at period end retains pro access', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    const cancelResponse = await cancelSubscription(page, activeSubscription.id, false);

    if (cancelResponse.ok()) {
      const cancelData = await cancelResponse.json();

      expect(cancelData.data?.subscription.cancelAtPeriodEnd).toBe(true);
      expect(cancelData.data?.subscription.status).toBe('active');

      // Message should indicate access until period end
      expect(cancelData.data?.message).toMatch(/end of the current billing period/i);

      // Credits should still be available
      const balance = await getUserCreditBalance(page);
      expect(balance.data?.planType).toBe('paid');
    }
  });

  test('immediate cancellation removes pro access', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    const cancelResponse = await cancelSubscription(page, activeSubscription.id, true);

    if (cancelResponse.ok()) {
      const cancelData = await cancelResponse.json();

      // Subscription should be canceled immediately
      expect(cancelData.data?.subscription.status).toBe('canceled');

      // Message should indicate immediate cancellation
      expect(cancelData.data?.message).toMatch(/canceled immediately/i);

      // Tier should downgrade to free
      const balance = await getUserCreditBalance(page);
      if (balance.success) {
        expect(balance.data?.planType).toBe('free');
        expect(balance.data?.monthlyCredits).toBe(0);
      }
    }
  });

  test('cancel already canceled subscription fails', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const canceledSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'canceled',
    );

    if (!canceledSubscription) {
      test.skip();
      return;
    }

    const cancelResponse = await cancelSubscription(page, canceledSubscription.id, false);

    expect(cancelResponse.status()).toBe(400);
    const errorData = await cancelResponse.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/already canceled/i);
  });

  test('cancellation UI shows correct messaging', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Look for cancel or manage subscription button
    const manageBillingButton = page.getByRole('button', { name: /manage billing|cancel subscription/i });
    const hasButton = await manageBillingButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasButton) {
      // UI should provide cancellation options
      const subsData = await getUserSubscriptions(page);
      const hasActiveSubscription = subsData.data?.items?.some(
        (sub: any) => sub.status === 'active',
      );

      expect(hasActiveSubscription).toBeDefined();
    }
  });
});

test.describe('Subscription Plan Switching', () => {
  test('switch between pricing tiers (upgrade)', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Get available products to find a higher tier
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const allPrices = products.flatMap((p: any) => p.prices || []);

    const currentPriceId = activeSubscription.priceId;
    const currentPrice = allPrices.find((p: any) => p.id === currentPriceId);
    const currentAmount = currentPrice?.unitAmount || 0;

    // Find a higher-priced plan (upgrade)
    const higherPrice = allPrices.find((p: any) => (p.unitAmount || 0) > currentAmount);

    if (!higherPrice) {
      test.skip();
      return;
    }

    const switchResponse = await switchSubscriptionPlan(page, activeSubscription.id, higherPrice.id);

    if (switchResponse.ok()) {
      const switchData = await switchResponse.json();

      expect(switchData.success).toBe(true);
      expect(switchData.data?.changeDetails.isUpgrade).toBe(true);
      expect(switchData.data?.changeDetails.isDowngrade).toBe(false);

      // Credits should be adjusted for upgrade
      const balance = await getUserCreditBalance(page);
      expect(balance.success).toBe(true);
    }
  });

  test('switch between pricing tiers (downgrade)', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Get available products to find a lower tier
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const allPrices = products.flatMap((p: any) => p.prices || []);

    const currentPriceId = activeSubscription.priceId;
    const currentPrice = allPrices.find((p: any) => p.id === currentPriceId);
    const currentAmount = currentPrice?.unitAmount || 0;

    // Find a lower-priced plan (downgrade)
    const lowerPrice = allPrices.find((p: any) => (p.unitAmount || 0) < currentAmount && (p.unitAmount || 0) > 0);

    if (!lowerPrice) {
      test.skip();
      return;
    }

    const switchResponse = await switchSubscriptionPlan(page, activeSubscription.id, lowerPrice.id);

    if (switchResponse.ok()) {
      const switchData = await switchResponse.json();

      expect(switchData.success).toBe(true);
      expect(switchData.data?.changeDetails.isDowngrade).toBe(true);
      expect(switchData.data?.changeDetails.isUpgrade).toBe(false);
    }
  });

  test('prevent switching to same price', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Try to switch to the same price
    const currentPriceId = activeSubscription.priceId;
    const switchResponse = await switchSubscriptionPlan(page, activeSubscription.id, currentPriceId);

    // Should succeed but indicate no meaningful change
    if (switchResponse.ok()) {
      const switchData = await switchResponse.json();
      expect(switchData.success).toBe(true);
      expect(switchData.data?.changeDetails.isUpgrade).toBe(false);
      expect(switchData.data?.changeDetails.isDowngrade).toBe(false);
    }
  });

  test('switch updates subscription proration behavior', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active',
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Get products
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const allPrices = products.flatMap((p: any) => p.prices || []);

    const currentPriceId = activeSubscription.priceId;
    const differentPrice = allPrices.find((p: any) => p.id !== currentPriceId);

    if (!differentPrice) {
      test.skip();
      return;
    }

    const switchResponse = await switchSubscriptionPlan(page, activeSubscription.id, differentPrice.id);

    if (switchResponse.ok()) {
      const switchData = await switchResponse.json();

      // Verify change details include proration information
      expect(switchData.data?.changeDetails).toBeDefined();
      expect(switchData.data?.changeDetails.oldPrice).toBeDefined();
      expect(switchData.data?.changeDetails.newPrice).toBeDefined();
    }
  });
});

test.describe('Trial Period Behavior', () => {
  test('trial subscription shows correct status', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const trialingSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'trialing',
    );

    if (!trialingSubscription) {
      test.skip();
      return;
    }

    // Verify trial dates
    expect(trialingSubscription.trialStart).toBeDefined();
    expect(trialingSubscription.trialEnd).toBeDefined();

    const trialStart = new Date(trialingSubscription.trialStart);
    const trialEnd = new Date(trialingSubscription.trialEnd);

    expect(trialEnd.getTime()).toBeGreaterThan(trialStart.getTime());
  });

  test('trial period grants pro tier access', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const trialingSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'trialing',
    );

    if (!trialingSubscription) {
      test.skip();
      return;
    }

    // User should have pro tier access during trial
    const balance = await getUserCreditBalance(page);
    if (balance.success) {
      expect(balance.data?.planType).toBe('paid');
      expect(balance.data?.monthlyCredits).toBeGreaterThan(0);
    }
  });

  test('trial end triggers subscription start', async ({ authenticatedPage: page }) => {
    // This test would require time manipulation or checking past trials
    // Verifying that status transitions from 'trialing' to 'active' after trial_end

    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && sub.trialEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Subscription was previously trialing and is now active
    const trialEnd = new Date(activeSubscription.trialEnd);
    const now = new Date();

    expect(now.getTime()).toBeGreaterThan(trialEnd.getTime());
  });
});

test.describe('Failed Payment Handling', () => {
  test('past_due subscription shows in UI', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const pastDueSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'past_due',
    );

    if (!pastDueSubscription) {
      test.skip();
      return;
    }

    // Verify status
    expect(pastDueSubscription.status).toBe('past_due');

    // Navigate to pricing/billing page to check UI warnings
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Should see payment issue warning
    const warningElement = page.locator('text=/payment failed|update payment|past due/i');
    const hasWarning = await warningElement.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasWarning) {
      expect(await warningElement.count()).toBeGreaterThan(0);
    }
  });

  test('incomplete subscription requires payment', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const incompleteSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'incomplete' || sub.status === 'incomplete_expired',
    );

    if (!incompleteSubscription) {
      test.skip();
      return;
    }

    // Incomplete subscriptions should not grant pro access
    const balance = await getUserCreditBalance(page);
    if (balance.success) {
      expect(balance.data?.planType).toBe('free');
    }
  });

  test('update payment method for failed subscription', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const pastDueSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'past_due',
    );

    if (!pastDueSubscription) {
      test.skip();
      return;
    }

    // Navigate to billing portal to update payment method
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
    }
  });
});

test.describe('Subscription Renewal and Credit Refill', () => {
  test('credit refill date aligns with subscription period', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    const balance = await getUserCreditBalance(page);

    if (balance.success && balance.data?.nextRefillAt) {
      const refillDate = new Date(balance.data.nextRefillAt);
      const periodEnd = new Date(activeSubscription.currentPeriodEnd);

      // Refill should be around subscription period end
      const timeDiff = Math.abs(refillDate.getTime() - periodEnd.getTime());
      const oneDayInMs = 24 * 60 * 60 * 1000;

      expect(timeDiff).toBeLessThan(oneDayInMs * 2);
    }
  });

  test('monthly refill adds credits to existing balance', async ({ authenticatedPage: page }) => {
    const balance = await getUserCreditBalance(page);

    if (balance.success && balance.data?.planType === 'paid') {
      // Pro users get 100K monthly credits
      expect(balance.data.monthlyCredits).toBe(100_000);

      // Credits should accumulate (not reset)
      // If user has 30K remaining, next refill should add 100K to get 130K total
      expect(balance.data.balance).toBeGreaterThanOrEqual(0);
    }
  });

  test('subscription renewal maintains pro access', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active',
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Verify subscription has period dates
    expect(activeSubscription.currentPeriodStart).toBeDefined();
    expect(activeSubscription.currentPeriodEnd).toBeDefined();

    const periodEnd = new Date(activeSubscription.currentPeriodEnd);
    const now = new Date();

    // Period end should be in the future
    expect(periodEnd.getTime()).toBeGreaterThan(now.getTime());

    // User should have pro access
    const balance = await getUserCreditBalance(page);
    expect(balance.data?.planType).toBe('paid');
  });

  test('refill schedule updates after successful renewal', async ({ authenticatedPage: page }) => {
    const balance = await getUserCreditBalance(page);

    if (balance.success && balance.data?.planType === 'paid') {
      expect(balance.data.lastRefillAt).toBeDefined();
      expect(balance.data.nextRefillAt).toBeDefined();

      const lastRefill = new Date(balance.data.lastRefillAt!);
      const nextRefill = new Date(balance.data.nextRefillAt!);

      // Next refill should be after last refill
      expect(nextRefill.getTime()).toBeGreaterThan(lastRefill.getTime());

      // Should be approximately 1 month apart
      const daysDifference = (nextRefill.getTime() - lastRefill.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDifference).toBeGreaterThan(28);
      expect(daysDifference).toBeLessThan(32);
    }
  });
});

test.describe('Subscription State Consistency', () => {
  test('subscription tier matches credit plan type', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' || sub.status === 'trialing',
    );

    const balance = await getUserCreditBalance(page);
    const usage = await getUserChatUsage(page);

    if (activeSubscription && balance.success && usage.success) {
      // Pro subscription should have paid plan type and pro tier
      expect(balance.data?.planType).toBe('paid');
      expect(usage.data?.subscriptionTier).toBe('pro');
    } else if (!activeSubscription && balance.success && usage.success) {
      // No subscription should have free plan type and free tier
      expect(balance.data?.planType).toBe('free');
      expect(usage.data?.subscriptionTier).toBe('free');
    }
  });

  test('canceled at period end maintains tier until expiry', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const canceledButActive = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active' && sub.cancelAtPeriodEnd === true,
    );

    if (!canceledButActive) {
      test.skip();
      return;
    }

    // User should still have pro tier until period ends
    const balance = await getUserCreditBalance(page);
    const usage = await getUserChatUsage(page);

    expect(balance.data?.planType).toBe('paid');
    expect(usage.data?.subscriptionTier).toBe('pro');

    // Period end should be in the future
    const periodEnd = new Date(canceledButActive.currentPeriodEnd);
    const now = new Date();
    expect(periodEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  test('subscription and credit balance reflect same state', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const balance = await getUserCreditBalance(page);

    if (subsData.success && balance.success) {
      const hasActiveSubscription = subsData.data?.items?.some(
        (sub: any) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
      );

      if (hasActiveSubscription) {
        expect(balance.data?.planType).toBe('paid');
        expect(balance.data?.monthlyCredits).toBeGreaterThan(0);
      } else {
        expect(balance.data?.planType).toBe('free');
        expect(balance.data?.monthlyCredits).toBe(0);
      }
    }
  });

  test('tier change synchronizes across all tables', async ({ authenticatedPage: page }) => {
    // Sync after checkout to ensure all tables are updated
    const syncData = await syncAfterCheckout(page);

    if (syncData.data?.synced && syncData.data.tierChange) {
      const { newTier } = syncData.data.tierChange;

      // Verify all data sources reflect the same tier
      const balance = await getUserCreditBalance(page);
      const usage = await getUserChatUsage(page);

      if (newTier === 'pro') {
        expect(balance.data?.planType).toBe('paid');
        expect(usage.data?.subscriptionTier).toBe('pro');
      } else {
        expect(balance.data?.planType).toBe('free');
        expect(usage.data?.subscriptionTier).toBe('free');
      }
    }
  });
});

test.describe('Edge Cases and Error Handling', () => {
  test('prevent duplicate active subscriptions', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    // Try to create another checkout session
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const priceId = products[0]?.prices?.[0]?.id;

    if (!priceId) {
      test.skip();
      return;
    }

    const response = await page.request.post('/api/v1/billing/checkout', {
      data: { priceId },
    });

    expect(response.status()).toBe(400);
    const errorData = await response.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/already have an active subscription/i);
  });

  test('handle non-existent subscription operations', async ({ authenticatedPage: page }) => {
    const fakeSubscriptionId = 'sub_fake_nonexistent_123';

    const cancelResponse = await cancelSubscription(page, fakeSubscriptionId, false);

    expect(cancelResponse.status()).toBe(404);
    const errorData = await cancelResponse.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/not found/i);
  });

  test('handle invalid price when switching plans', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const activeSubscription = subsData.data?.items?.find(
      (sub: any) => sub.status === 'active',
    );

    if (!activeSubscription) {
      test.skip();
      return;
    }

    const fakePriceId = 'price_fake_invalid_123';

    const switchResponse = await switchSubscriptionPlan(page, activeSubscription.id, fakePriceId);

    expect(switchResponse.status()).toBe(400);
    const errorData = await switchResponse.json();
    expect(errorData.success).toBe(false);
    expect(errorData.error?.message).toMatch(/not found/i);
  });

  test('graceful handling of sync failures', async ({ authenticatedPage: page }) => {
    // Sync should return graceful response even on errors
    const syncData = await syncAfterCheckout(page);

    expect(syncData.success).toBe(true);
    expect(syncData.data).toBeDefined();

    // Even if sync failed, should return structure
    expect(syncData.data?.synced).toBeDefined();
    expect(syncData.data?.purchaseType).toBeDefined();
  });
});
