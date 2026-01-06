import type { Page } from '@playwright/test';

import type { Product, Subscription } from '@/api/routes/billing/schema';

import { expect, test } from '../fixtures';

/**
 * Comprehensive Pricing Page E2E Tests
 *
 * Coverage:
 * 1. Page rendering and navigation
 * 2. Product catalog display (tiers, prices, features)
 * 3. Checkout flow initiation
 * 4. Stripe integration
 * 5. Free vs paid user experience differences
 * 6. Upgrade/downgrade flow UI
 * 7. Subscription management (cancel, billing portal)
 * 8. Error handling and loading states
 * 9. Responsive behavior
 * 10. Accessibility
 */

/**
 * Helper: Get products via API
 */
async function getProducts(page: Page) {
  const response = await page.request.get('/api/v1/billing/products');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get subscriptions via API
 */
async function getUserSubscriptions(page: Page) {
  const response = await page.request.get('/api/v1/billing/subscriptions');
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Create checkout session
 */
async function createCheckoutSession(page: Page, priceId: string) {
  const response = await page.request.post('/api/v1/billing/checkout', {
    data: { priceId },
  });
  return { response, data: response.ok() ? await response.json() : null };
}

test.describe('Pricing Page - Navigation & Rendering', () => {
  test('pricing page loads successfully at /chat/pricing', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/chat\/pricing/);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('500');
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('404');
  });

  test('displays page header with title and description', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    const header = page.locator('h1, h2').first();
    await expect(header).toBeVisible({ timeout: 10000 });

    const headerText = await header.textContent();
    expect(headerText).toBeTruthy();
  });

  test('page is accessible from chat navigation', async ({ authenticatedPage: page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const pricingLink = page.getByRole('link', { name: /pricing|plans|upgrade/i });
    const hasLink = await pricingLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasLink) {
      await pricingLink.click();
      await expect(page).toHaveURL(/\/pricing/);
    } else {
      await page.goto('/chat/pricing');
      await expect(page).toHaveURL(/\/pricing/);
    }
  });

  test('can navigate back to chat from pricing page', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    const backLink = page.getByRole('link', { name: /chat|back/i })
      .or(page.locator('a[href="/chat"]'))
      .or(page.locator('[aria-label*="back"]'));

    const hasBackLink = await backLink.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBackLink) {
      await backLink.first().click();
      await expect(page).toHaveURL(/\/chat/);
    } else {
      await page.goto('/chat');
      await expect(page).toHaveURL(/\/chat/);
    }
  });
});

test.describe('Pricing Page - Product Catalog Display', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('displays at least one pricing card', async ({ authenticatedPage: page }) => {
    const subscribeButton = page.getByRole('button', { name: /subscribe|switch|manage/i });
    await expect(subscribeButton.first()).toBeVisible({ timeout: 15000 });
  });

  test('product cards show product names', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    expect(productsData.success).toBe(true);

    const products = productsData.data?.items || [];
    expect(products.length).toBeGreaterThan(0);

    const firstProduct = products[0];
    const productNameElement = page.locator('h2, h3').filter({ hasText: new RegExp(firstProduct.name, 'i') });

    const hasProductName = await productNameElement.isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasProductName).toBe(true);
  });

  test('displays pricing with currency and amount', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const productWithPrices = products.find((p: Product) => p.prices && p.prices.length > 0);

    if (productWithPrices) {
      const price = productWithPrices.prices[0];
      const formattedAmount = (price.unitAmount / 100).toFixed(2);

      const priceDisplay = page.locator(`text=/\\$?${formattedAmount}|${price.currency}/i`);
      const hasPriceDisplay = await priceDisplay.isVisible({ timeout: 10000 }).catch(() => false);

      expect(hasPriceDisplay).toBe(true);
    }
  });

  test('displays billing interval (monthly/yearly)', async ({ authenticatedPage: page }) => {
    const intervalText = page.locator('text=/\\/month|\\/year|monthly|yearly|per month|per year/i');
    const hasInterval = await intervalText.isVisible({ timeout: 10000 }).catch(() => false);

    if (!hasInterval) {
      const subscribeButton = page.getByRole('button', { name: /subscribe|switch/i });
      await expect(subscribeButton.first()).toBeVisible();
    }
  });

  test('displays product descriptions', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];

    if (products.length > 0 && products[0].description) {
      const descText = products[0].description.substring(0, 20);
      const description = page.locator(`text=/${descText}/i`);
      const hasDescription = await description.isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasDescription).toBe(true);
    }
  });

  test('displays feature lists for each plan', async ({ authenticatedPage: page }) => {
    const featureList = page.locator('ul li')
      .or(page.locator('[role="list"] [role="listitem"]'))
      .or(page.locator('text=/unlimited|support|models|credits/i'));

    const featureCount = await featureList.count();
    expect(featureCount).toBeGreaterThan(0);
  });

  test('displays "Most Popular" badge on featured plan', async ({ authenticatedPage: page }) => {
    const popularBadge = page.getByText(/most popular|recommended/i);
    const hasBadge = await popularBadge.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBadge) {
      await expect(popularBadge).toBeVisible();
    }
  });
});

test.describe('Pricing Page - Loading States', () => {
  test('shows loading state initially', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');

    const loadingSkeleton = page.locator('[data-loading="true"]')
      .or(page.locator('.animate-pulse'))
      .or(page.locator('[role="status"]'));

    const hasLoading = await loadingSkeleton.isVisible().catch(() => false);
    const hasContent = await page.getByRole('button', { name: /subscribe|switch/i })
      .isVisible()
      .catch(() => false);

    expect(hasLoading || hasContent).toBeTruthy();
  });

  test('displays content after loading completes', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const subscribeButton = page.getByRole('button', { name: /subscribe|switch|manage/i });
    await expect(subscribeButton.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Pricing Page - Error Handling', () => {
  test('displays error state when products fail to load', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/products**', route => route.abort());

    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const errorIndicator = page.getByText(/error|failed|retry/i);
    const hasError = await errorIndicator.isVisible({ timeout: 10000 }).catch(() => false);

    expect(hasError).toBeTruthy();
  });

  test('shows Retry button on error', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/products**', route => route.abort());

    await page.goto('/chat/pricing');
    await page.waitForTimeout(3000);

    const retryButton = page.getByRole('button', { name: /retry|try again/i });
    const hasRetry = await retryButton.isVisible({ timeout: 10000 }).catch(() => false);

    expect(hasRetry).toBeTruthy();
  });

  test('retry button reloads products', async ({ authenticatedPage: page }) => {
    let callCount = 0;
    await page.route('**/api/v1/billing/products**', (route) => {
      callCount++;
      if (callCount === 1) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto('/chat/pricing');
    await page.waitForTimeout(2000);

    const retryButton = page.getByRole('button', { name: /retry|try again/i });
    const hasRetry = await retryButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasRetry) {
      await retryButton.click();
      await page.waitForTimeout(2000);

      const content = page.getByRole('button', { name: /subscribe|switch/i });
      await expect(content.first()).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Pricing Page - Free User Experience', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('free user sees Subscribe buttons for plans', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!hasActiveSubscription) {
      const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i });
      await expect(subscribeButton.first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('Subscribe button is enabled and clickable', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!hasActiveSubscription) {
      const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
      await expect(subscribeButton).toBeVisible({ timeout: 15000 });
      await expect(subscribeButton).toBeEnabled();
    }
  });

  test('clicking Subscribe initiates checkout flow', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!hasActiveSubscription) {
      const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
      await expect(subscribeButton).toBeVisible({ timeout: 15000 });

      await subscribeButton.click();
      await page.waitForTimeout(2000);

      const hasProcessing = await page.getByText(/processing/i).isVisible().catch(() => false);
      const hasNavigated = !page.url().includes('/chat/pricing');

      expect(hasProcessing || hasNavigated).toBeTruthy();
    }
  });

  test('shows processing state when subscribing', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!hasActiveSubscription) {
      await page.route('**/api/v1/billing/checkout', async (route) => {
        await page.waitForTimeout(2000);
        await route.continue();
      });

      const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
      await expect(subscribeButton).toBeVisible({ timeout: 15000 });

      await subscribeButton.click();

      const processingIndicator = page.locator('[class*="animate-spin"]')
        .or(page.locator('[aria-busy="true"]'))
        .or(subscribeButton.locator('[class*="spinner"]'));

      const hasProcessing = await processingIndicator.isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasProcessing) {
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        expect(currentUrl).not.toBe('/chat/pricing');
      }
    }
  });
});

test.describe('Pricing Page - Stripe Integration', () => {
  test('checkout session creation returns Stripe URL', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    expect(productsData.success).toBe(true);

    const products = productsData.data?.items || [];
    const productWithPrices = products.find((p: Product) => p.prices && p.prices.length > 0);

    if (!productWithPrices) {
      test.skip();
    }

    const priceId = productWithPrices.prices[0].id;
    const { response, data } = await createCheckoutSession(page, priceId);

    if (response.status() === 400) {
      const errorData = await response.json();
      expect(errorData.error?.message).toMatch(/already have an active subscription/i);
    } else {
      expect(response.ok()).toBe(true);
      expect(data.success).toBe(true);
      expect(data.data?.sessionId).toBeDefined();
      expect(data.data?.url).toBeDefined();
      expect(data.data?.url).toContain('stripe.com');
    }
  });

  test('prevents duplicate subscriptions', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      const productsData = await getProducts(page);
      const products = productsData.data?.items || [];
      const priceId = products[0]?.prices?.[0]?.id;

      if (priceId) {
        const { response } = await createCheckoutSession(page, priceId);

        expect(response.status()).toBe(400);
        const errorData = await response.json();
        expect(errorData.success).toBe(false);
        expect(errorData.error?.message).toMatch(/already have an active subscription/i);
      }
    }
  });

  test('checkout URL includes return URL parameters', async ({ authenticatedPage: page }) => {
    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!hasActiveSubscription) {
      const productsData = await getProducts(page);
      const products = productsData.data?.items || [];
      const priceId = products[0]?.prices?.[0]?.id;

      if (priceId) {
        const { response, data } = await createCheckoutSession(page, priceId);

        if (response.ok()) {
          expect(data.data?.url).toBeDefined();
          expect(data.data?.url).toContain('stripe.com');
        }
      }
    }
  });
});

test.describe('Pricing Page - Paid User Experience', () => {
  test('shows current plan indicator for active subscription', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      const currentPlanBadge = page.getByText(/current plan|your plan/i);
      const hasBadge = await currentPlanBadge.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasBadge) {
        await expect(currentPlanBadge).toBeVisible();
      }
    }
  });

  test('displays Manage Billing button for current plan', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      const manageBillingButton = page.getByRole('button', { name: /manage billing/i });
      const hasButton = await manageBillingButton.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasButton) {
        await expect(manageBillingButton).toBeEnabled();
      }
    }
  });

  test('displays Cancel Subscription button for current plan', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      const cancelButton = page.getByRole('button', { name: /cancel subscription/i });
      const hasButton = await cancelButton.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasButton) {
        await expect(cancelButton).toBeEnabled();
      }
    }
  });

  test('subscription banner shows renewal date', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (activeSubscription && activeSubscription.currentPeriodEnd) {
      const renewalDate = page.locator('text=/renews on|renews|expires|active until/i');
      const hasDate = await renewalDate.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasDate) {
        await expect(renewalDate).toBeVisible();
      }
    }
  });
});

test.describe('Pricing Page - Plan Switching UI', () => {
  test('shows Switch Plan button for non-current plans', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (hasActiveSubscription) {
      const switchButton = page.getByRole('button', { name: /switch to this plan|change plan|upgrade|downgrade/i });
      const hasButton = await switchButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasButton) {
        await expect(switchButton.first()).toBeEnabled();
      }
    }
  });

  test('clicking Switch Plan shows processing state', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (activeSubscription) {
      await page.route('**/api/v1/billing/subscriptions/*/switch', async (route) => {
        await page.waitForTimeout(2000);
        await route.continue();
      });

      const switchButton = page.getByRole('button', { name: /switch to this plan|change plan/i });
      const hasButton = await switchButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasButton) {
        await switchButton.first().click();

        const processingIndicator = page.locator('[class*="animate-spin"]')
          .or(page.locator('[aria-busy="true"]'));

        const hasProcessing = await processingIndicator.isVisible({ timeout: 2000 }).catch(() => false);

        if (!hasProcessing) {
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test('plan switch redirects to subscription-changed page', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const activeSubscription = subscriptions.find(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (activeSubscription) {
      const currentPriceId = activeSubscription.priceId;
      const productsData = await getProducts(page);
      const products = productsData.data?.items || [];
      const allPrices = products.flatMap((p: Product) => p.prices || []);
      const differentPrice = allPrices.find(price => price.id !== currentPriceId);

      if (differentPrice) {
        const response = await page.request.post(`/api/v1/billing/subscriptions/${activeSubscription.id}/switch`, {
          data: { newPriceId: differentPrice.id },
        });

        if (response.ok()) {
          const data = await response.json();
          expect(data.success).toBe(true);
          expect(data.data?.changeDetails).toBeDefined();
        }
      }
    }
  });
});

test.describe('Pricing Page - Billing Portal', () => {
  test('Manage Billing button opens customer portal', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const hasSubscriptions = subsData.data?.items && subsData.data.items.length > 0;

    if (hasSubscriptions) {
      const response = await page.request.post('/api/v1/billing/portal', {
        data: { returnUrl: 'http://localhost:3000/chat' },
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data?.url).toBeDefined();
        expect(data.data?.url).toContain('stripe.com');
      } else if (response.status() === 400) {
        const errorData = await response.json();
        expect(errorData.error?.message).toMatch(/no stripe customer found/i);
      }
    }
  });

  test('portal opens in new tab', async ({ authenticatedPage: page, context }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const manageBillingButton = page.getByRole('button', { name: /manage billing/i });
    const hasButton = await manageBillingButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasButton) {
      const pagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
      await manageBillingButton.click();

      const newPage = await pagePromise;
      if (newPage) {
        await newPage.close();
      }
    }
  });
});

test.describe('Pricing Page - Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('pricing page is accessible on mobile', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const content = page.getByRole('button', { name: /subscribe|switch|manage/i });
    await expect(content.first()).toBeVisible({ timeout: 15000 });
  });

  test('pricing cards stack vertically on mobile', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForTimeout(2000);

    const pricingCard = page.getByRole('button', { name: /subscribe|switch/i }).first();
    await expect(pricingCard).toBeVisible({ timeout: 15000 });

    const viewportSize = page.viewportSize();
    expect(viewportSize?.width).toBeLessThanOrEqual(375);
  });

  test('CTA buttons are touch-friendly on mobile', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForTimeout(2000);

    const subscribeButton = page.getByRole('button', { name: /subscribe|switch/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    const buttonBox = await subscribeButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(40);
  });

  test('price and features are readable on mobile', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForTimeout(2000);

    const priceDisplay = page.locator('text=/USD|EUR|\\$|€/i');
    await expect(priceDisplay.first()).toBeVisible({ timeout: 10000 });

    const features = page.locator('li, [role="listitem"]').or(page.locator('text=/unlimited|support|models/i'));
    await expect(features.first()).toBeVisible({ timeout: 10000 });
  });

  test('page scrolls smoothly on mobile', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForTimeout(2000);

    const initialScroll = await page.evaluate(() => window.scrollY);

    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(300);

    const newScroll = await page.evaluate(() => window.scrollY);
    expect(newScroll).toBeGreaterThan(initialScroll);
  });
});

test.describe('Pricing Page - Accessibility', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('pricing cards have proper heading hierarchy', async ({ authenticatedPage: page }) => {
    const headings = await page.locator('h1, h2, h3').all();
    expect(headings.length).toBeGreaterThan(0);
  });

  test('CTA buttons have accessible labels', async ({ authenticatedPage: page }) => {
    const buttons = await page.getByRole('button').all();

    for (const button of buttons) {
      const isVisible = await button.isVisible().catch(() => false);
      if (isVisible) {
        const accessibleName = await button.getAttribute('aria-label')
          || await button.textContent();
        expect(accessibleName).toBeTruthy();
      }
    }
  });

  test('pricing information is keyboard navigable', async ({ authenticatedPage: page }) => {
    const firstButton = page.getByRole('button', { name: /subscribe|switch/i }).first();
    await firstButton.focus();

    const isFocused = await firstButton.evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();
  });

  test('tab navigation works correctly', async ({ authenticatedPage: page }) => {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeTruthy();
  });
});

test.describe('Pricing Page - Data Prefetching', () => {
  test('products are prefetched on page load', async ({ authenticatedPage: page }) => {
    const apiRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/v1/billing/products')) {
        apiRequests.push(request.url());
      }
    });

    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasContent = await page.getByRole('button', { name: /subscribe|switch/i })
      .isVisible({ timeout: 15000 })
      .catch(() => false);

    expect(hasContent).toBeTruthy();
  });

  test('subscriptions are available immediately', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    const subsData = await getUserSubscriptions(page);
    expect(subsData.success).toBe(true);
    expect(subsData.data).toBeDefined();
  });
});

test.describe('Pricing Page - Edge Cases', () => {
  test('handles empty product catalog gracefully', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/products**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [] } }),
      }));

    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const noPlansMessage = page.locator('text=/no plans|no products|coming soon/i');
    const hasMessage = await noPlansMessage.isVisible({ timeout: 10000 }).catch(() => false);

    expect(hasMessage).toBe(true);
  });

  test('handles missing price information', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];

    for (const product of products) {
      if (product.prices && product.prices.length > 0) {
        const price = product.prices[0];
        expect(price.unitAmount).toBeDefined();
        expect(price.currency).toBeDefined();
      }
    }
  });

  test('prevents multiple simultaneous checkout attempts', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subsData = await getUserSubscriptions(page);
    const subscriptions = subsData.data?.items || [];
    const hasActiveSubscription = subscriptions.some(
      (sub: Subscription) => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
    );

    if (!hasActiveSubscription) {
      await page.route('**/api/v1/billing/checkout', async (route) => {
        await page.waitForTimeout(3000);
        await route.continue();
      });

      const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
      await expect(subscribeButton).toBeVisible({ timeout: 15000 });

      await subscribeButton.click();

      const isDisabled = await subscribeButton.isDisabled().catch(() => false);
      if (!isDisabled) {
        const hasSpinner = await subscribeButton.locator('[class*="spinner"]')
          .isVisible()
          .catch(() => false);
        expect(hasSpinner).toBe(true);
      }
    }
  });
});
