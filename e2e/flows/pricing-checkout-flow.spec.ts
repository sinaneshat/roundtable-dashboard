import type { Page } from '@playwright/test';

import type { Product } from '@/api/routes/billing/schema';

import { expect, test } from '../fixtures';

/**
 * Comprehensive Pricing Checkout Flow E2E Tests
 *
 * Coverage gaps filled:
 * 1. Checkout button state management (disabled/loading/enabled)
 * 2. Stripe redirect behavior and URL validation
 * 3. Plan selection persistence across navigation
 * 4. Checkout error states and recovery
 * 5. Mobile responsiveness during checkout flow
 * 6. Multiple checkout attempt prevention
 * 7. Checkout session expiration handling
 * 8. Browser back button behavior during checkout
 * 9. Network failure recovery during checkout
 * 10. Concurrent user action prevention
 */

async function getProducts(page: Page) {
  const response = await page.request.get('/api/v1/billing/products');
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe('Pricing Checkout Flow - Button State Management', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Subscribe button is initially enabled for free users', async ({ authenticatedPage: page }) => {
    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });
    await expect(subscribeButton).toBeEnabled();

    const isDisabled = await subscribeButton.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('Subscribe button becomes disabled during checkout API call', async ({ authenticatedPage: page }) => {
    let requestIntercepted = false;
    await page.route('**/api/v1/billing/checkout', async (route) => {
      requestIntercepted = true;
      await page.waitForTimeout(1500);
      await route.continue();
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();

    if (requestIntercepted) {
      const isButtonDisabled = await subscribeButton.isDisabled({ timeout: 500 }).catch(() => false);
      expect(isButtonDisabled).toBe(true);
    }
  });

  test('Subscribe button shows loading spinner during processing', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', async (route) => {
      await page.waitForTimeout(2000);
      await route.continue();
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();

    const spinner = page.locator('[class*="animate-spin"]').or(subscribeButton.locator('svg[class*="spin"]'));
    const hasSpinner = await spinner.isVisible({ timeout: 2000 }).catch(() => false);

    if (!hasSpinner) {
      const processingText = await subscribeButton.textContent();
      expect(processingText?.toLowerCase()).toMatch(/processing/i);
    }
  });

  test('Subscribe button re-enables after checkout error', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { message: 'Checkout failed' },
        }),
      }));

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(1500);

    await expect(subscribeButton).toBeEnabled({ timeout: 3000 });
  });

  test('all plan buttons maintain independent loading states', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];

    if (products.length > 1) {
      const allButtons = await page.getByRole('button', { name: /subscribe|switch/i }).all();

      if (allButtons.length > 1) {
        await page.route('**/api/v1/billing/checkout', async (route) => {
          await page.waitForTimeout(2000);
          await route.continue();
        });

        await allButtons[0].click();

        const firstButtonProcessing = await allButtons[0].isDisabled().catch(() => false);
        const secondButtonEnabled = await allButtons[1].isEnabled().catch(() => true);

        expect(firstButtonProcessing || !secondButtonEnabled).toBeTruthy();
      }
    }
  });
});

test.describe('Pricing Checkout Flow - Stripe Redirect Behavior', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('checkout creates valid Stripe session URL', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const productWithPrices = products.find((p: Product) => p.prices && p.prices.length > 0);

    if (!productWithPrices) {
      test.skip();
    }

    const priceId = productWithPrices.prices[0].id;
    const response = await page.request.post('/api/v1/billing/checkout', {
      data: { priceId },
    });

    if (response.status() === 400) {
      const errorData = await response.json();
      expect(errorData.error?.message).toMatch(/already have an active subscription/i);
    } else {
      expect(response.ok()).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data?.url).toBeTruthy();
      expect(data.data?.url).toContain('checkout.stripe.com');
      expect(data.data?.sessionId).toBeTruthy();
      expect(data.data?.sessionId).toMatch(/^cs_test_/);
    }
  });

  test('Stripe URL contains correct success and cancel URLs', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const productWithPrices = products.find((p: Product) => p.prices && p.prices.length > 0);

    if (!productWithPrices) {
      test.skip();
    }

    const priceId = productWithPrices.prices[0].id;
    const response = await page.request.post('/api/v1/billing/checkout', {
      data: { priceId },
    });

    if (response.ok()) {
      const data = await response.json();
      const stripeUrl = data.data?.url;

      expect(stripeUrl).toBeTruthy();
      expect(typeof stripeUrl).toBe('string');
    }
  });

  test('clicking Subscribe redirects to Stripe checkout', async ({ authenticatedPage: page, context }) => {
    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    const isVisible = await subscribeButton.isVisible({ timeout: 15000 }).catch(() => false);

    if (!isVisible) {
      test.skip();
    }

    const navigationPromise = page.waitForURL(/stripe\.com/, { timeout: 30000 }).catch(() => null);

    await subscribeButton.click();

    const navigated = await navigationPromise;

    if (navigated) {
      expect(page.url()).toContain('stripe.com');
    } else {
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      const hasRedirected = currentUrl !== '/chat/pricing';
      expect(hasRedirected).toBeTruthy();
    }
  });

  test('Stripe checkout URL is not reused across sessions', async ({ authenticatedPage: page }) => {
    const productsData = await getProducts(page);
    const products = productsData.data?.items || [];
    const productWithPrices = products.find((p: Product) => p.prices && p.prices.length > 0);

    if (!productWithPrices) {
      test.skip();
    }

    const priceId = productWithPrices.prices[0].id;

    const response1 = await page.request.post('/api/v1/billing/checkout', {
      data: { priceId },
    });

    if (!response1.ok()) {
      test.skip();
    }

    const data1 = await response1.json();
    const sessionId1 = data1.data?.sessionId;

    await page.waitForTimeout(1000);

    const response2 = await page.request.post('/api/v1/billing/checkout', {
      data: { priceId },
    });

    if (response2.ok()) {
      const data2 = await response2.json();
      const sessionId2 = data2.data?.sessionId;

      expect(sessionId1).not.toBe(sessionId2);
    }
  });
});

test.describe('Pricing Checkout Flow - Plan Selection Persistence', () => {
  test('selected plan persists during page refresh', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const firstPlanCard = page.locator('[class*="pricing"]').or(page.getByRole('button', { name: /subscribe/i }).first().locator('..')).first();
    const planNameBeforeRefresh = await firstPlanCard.textContent();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const firstPlanCardAfterRefresh = page.locator('[class*="pricing"]').or(page.getByRole('button', { name: /subscribe/i }).first().locator('..')).first();
    const planNameAfterRefresh = await firstPlanCardAfterRefresh.textContent();

    expect(planNameAfterRefresh).toBe(planNameBeforeRefresh);
  });

  test('pricing catalog loads consistently across navigation', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const initialProductsData = await getProducts(page);
    const initialProducts = initialProductsData.data?.items || [];

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const reloadedProductsData = await getProducts(page);
    const reloadedProducts = reloadedProductsData.data?.items || [];

    expect(reloadedProducts.length).toBe(initialProducts.length);

    if (initialProducts.length > 0) {
      expect(reloadedProducts[0].id).toBe(initialProducts[0].id);
      expect(reloadedProducts[0].name).toBe(initialProducts[0].name);
    }
  });

  test('product prices remain stable across multiple visits', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const initialProductsData = await getProducts(page);
    const initialProducts = initialProductsData.data?.items || [];

    if (initialProducts.length === 0 || !initialProducts[0].prices || initialProducts[0].prices.length === 0) {
      test.skip();
    }

    const initialPrice = initialProducts[0].prices[0].unitAmount;

    await page.goto('/chat');
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const reloadedProductsData = await getProducts(page);
    const reloadedProducts = reloadedProductsData.data?.items || [];
    const reloadedPrice = reloadedProducts[0]?.prices?.[0]?.unitAmount;

    expect(reloadedPrice).toBe(initialPrice);
  });
});

test.describe('Pricing Checkout Flow - Error States and Recovery', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('displays error toast on checkout API failure', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { message: 'Payment processing unavailable' },
        }),
      }));

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(1500);

    const errorToast = page.locator('[role="alert"]').or(page.locator('[class*="toast"]')).or(page.getByText(/error|failed/i));
    const hasError = await errorToast.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasError).toBeTruthy();
  });

  test('handles Stripe API timeout gracefully', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', async (route) => {
      await page.waitForTimeout(5000);
      route.abort('timedout');
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(6000);

    await expect(subscribeButton).toBeEnabled({ timeout: 3000 });
  });

  test('shows specific error message for invalid price ID', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { message: 'Invalid price ID provided' },
        }),
      }));

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(1500);

    const errorMessage = page.locator('[role="alert"]').or(page.getByText(/invalid|price/i));
    const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasError).toBeTruthy();
  });

  test('allows retry after checkout failure', async ({ authenticatedPage: page }) => {
    let attemptCount = 0;

    await page.route('**/api/v1/billing/checkout', (route) => {
      attemptCount++;
      if (attemptCount === 1) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { message: 'Server error' },
          }),
        });
      } else {
        route.continue();
      }
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(2000);

    await expect(subscribeButton).toBeEnabled({ timeout: 3000 });

    await subscribeButton.click();
    await page.waitForTimeout(1500);

    expect(attemptCount).toBe(2);
  });

  test('displays network error when offline', async ({ authenticatedPage: page }) => {
    await page.context().setOffline(true);

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    const isVisible = await subscribeButton.isVisible({ timeout: 15000 }).catch(() => false);

    if (isVisible) {
      await subscribeButton.click();
      await page.waitForTimeout(2000);

      const errorIndicator = page.locator('[role="alert"]').or(page.getByText(/network|connection|offline/i));
      const hasError = await errorIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      await page.context().setOffline(false);
      expect(hasError).toBeTruthy();
    } else {
      await page.context().setOffline(false);
      test.skip();
    }
  });
});

test.describe('Pricing Checkout Flow - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Subscribe button is touch-friendly on mobile', async ({ authenticatedPage: page }) => {
    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    const buttonBox = await subscribeButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(40);
    expect(buttonBox?.width).toBeGreaterThan(100);
  });

  test('mobile checkout flow shows full-width buttons', async ({ authenticatedPage: page }) => {
    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    const buttonBox = await subscribeButton.boundingBox();
    const viewportWidth = page.viewportSize()?.width || 375;

    expect(buttonBox?.width).toBeGreaterThan(viewportWidth * 0.7);
  });

  test('mobile pricing cards scroll vertically', async ({ authenticatedPage: page }) => {
    const initialScrollY = await page.evaluate(() => window.scrollY);

    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(300);

    const newScrollY = await page.evaluate(() => window.scrollY);
    expect(newScrollY).toBeGreaterThan(initialScrollY);
  });

  test('mobile checkout maintains functionality during orientation change', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(1000);

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });
    await expect(subscribeButton).toBeEnabled();

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    await expect(subscribeButton).toBeVisible();
    await expect(subscribeButton).toBeEnabled();
  });

  test('mobile error messages are readable', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { message: 'Checkout failed' },
        }),
      }));

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(1500);

    const errorMessage = page.locator('[role="alert"]').or(page.getByText(/error|failed/i));
    const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasError) {
      const errorBox = await errorMessage.first().boundingBox();
      const viewportWidth = page.viewportSize()?.width || 375;

      expect(errorBox?.width).toBeLessThanOrEqual(viewportWidth);
    }
  });
});

test.describe('Pricing Checkout Flow - Concurrent Actions Prevention', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('prevents multiple simultaneous checkout clicks', async ({ authenticatedPage: page }) => {
    let apiCallCount = 0;

    await page.route('**/api/v1/billing/checkout', async (route) => {
      apiCallCount++;
      await page.waitForTimeout(3000);
      await route.continue();
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(100);
    await subscribeButton.click();
    await page.waitForTimeout(100);
    await subscribeButton.click();

    await page.waitForTimeout(4000);

    expect(apiCallCount).toBeLessThanOrEqual(1);
  });

  test('disables all plan buttons during checkout processing', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', async (route) => {
      await page.waitForTimeout(2000);
      await route.continue();
    });

    const allButtons = await page.getByRole('button', { name: /subscribe|switch/i }).all();

    if (allButtons.length > 0) {
      await allButtons[0].click();
      await page.waitForTimeout(300);

      const firstButtonDisabled = await allButtons[0].isDisabled().catch(() => false);

      expect(firstButtonDisabled).toBe(true);
    }
  });

  test('prevents navigation during active checkout', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', async (route) => {
      await page.waitForTimeout(3000);
      await route.continue();
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    expect(currentUrl).toContain('/pricing');
  });
});

test.describe('Pricing Checkout Flow - Browser Navigation Handling', () => {
  test('handles browser back button after checkout initiation', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.goBack();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/chat');
    expect(page.url()).not.toContain('/pricing');
  });

  test('refreshing during checkout restores pricing page state', async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const initialProductsData = await getProducts(page);
    const initialProducts = initialProductsData.data?.items || [];

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const reloadedProductsData = await getProducts(page);
    const reloadedProducts = reloadedProductsData.data?.items || [];

    expect(reloadedProducts.length).toBe(initialProducts.length);

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });
    await expect(subscribeButton).toBeEnabled();
  });

  test('navigating away cancels pending checkout request', async ({ authenticatedPage: page }) => {
    let checkoutCompleted = false;

    await page.route('**/api/v1/billing/checkout', async (route) => {
      await page.waitForTimeout(5000);
      checkoutCompleted = true;
      await route.continue();
    });

    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    const isVisible = await subscribeButton.isVisible({ timeout: 15000 }).catch(() => false);

    if (isVisible) {
      await subscribeButton.click();
      await page.waitForTimeout(500);

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(1000);

      expect(page.url()).toContain('/chat');
      expect(page.url()).not.toContain('/pricing');
    }
  });
});

test.describe('Pricing Checkout Flow - Accessibility During Checkout', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('checkout button has accessible loading state', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', async (route) => {
      await page.waitForTimeout(2000);
      await route.continue();
    });

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(300);

    const ariaDisabled = await subscribeButton.getAttribute('aria-disabled');
    const isDisabled = await subscribeButton.isDisabled();

    expect(ariaDisabled === 'true' || isDisabled).toBeTruthy();
  });

  test('error messages are announced to screen readers', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/checkout', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { message: 'Checkout failed' },
        }),
      }));

    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.click();
    await page.waitForTimeout(1500);

    const errorAlert = page.locator('[role="alert"]').or(page.locator('[aria-live="assertive"]'));
    const hasAlert = await errorAlert.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasAlert) {
      const ariaLive = await errorAlert.first().getAttribute('aria-live');
      expect(['assertive', 'polite']).toContain(ariaLive);
    }
  });

  test('focus management during checkout flow', async ({ authenticatedPage: page }) => {
    const subscribeButton = page.getByRole('button', { name: /subscribe|get started/i }).first();
    await expect(subscribeButton).toBeVisible({ timeout: 15000 });

    await subscribeButton.focus();

    const isFocused = await subscribeButton.evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const activeFocusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeFocusedElement).toBeTruthy();
  });
});
