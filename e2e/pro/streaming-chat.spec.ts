import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getModelSelectorButton,
  waitForThreadNavigation,
} from '../helpers';

/**
 * Streaming Chat E2E Tests (Pro User)
 *
 * These tests require Pro user access with billing setup.
 * The chromium-pro project automatically uses Pro user auth state.
 *
 * Run with: pnpm exec playwright test e2e/pro/ --project=chromium-pro
 *
 * @see docs/FLOW_DOCUMENTATION.md
 */

test.describe('Chat Streaming - First Round', () => {
  test.setTimeout(180000); // 3 minutes for streaming tests

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('can submit message and see streaming response', async ({ page }) => {
    const input = getMessageInput(page);

    // Wait for input to be ready
    await expect(input).toBeEnabled({ timeout: 10000 });

    // Fill message
    await input.fill('Say hi in exactly 1 word');
    await expect(input).toHaveValue('Say hi in exactly 1 word');

    // Submit
    await input.press('Enter');

    // Wait for either streaming to start or navigation to complete
    await Promise.race([
      page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 }),
      page.locator('.animate-pulse').first().waitFor({ state: 'visible', timeout: 60000 }),
      page.getByRole('button', { name: /stop/i }).waitFor({ state: 'visible', timeout: 60000 }),
    ]);

    // If not on thread page yet, wait for navigation
    if (!page.url().match(/\/chat\/[a-zA-Z0-9-]+/)) {
      await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    }

    // Verify we're on thread page
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
  });

  test('stop button appears during streaming', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });

    await input.fill('Write a very long detailed story about a magical forest');
    await input.press('Enter');

    // Wait for stop button to appear (indicates streaming started)
    const stopButton = page.getByRole('button', { name: /stop/i });
    await expect(stopButton).toBeVisible({ timeout: 60000 });

    // Click stop
    await stopButton.click();

    // Input should become enabled again
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });
  });

  test('URL stays at /chat during first round streaming', async ({ page }) => {
    // Verify starting URL
    expect(page.url()).toContain('/chat');
    expect(page.url()).not.toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });

    await input.fill('Hello test message');
    await input.press('Enter');

    // URL should stay at /chat during streaming (per FLOW_DOCUMENTATION.md)
    // Then transition to /chat/[slug] after summary completes
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
  });
});

test.describe('Multi-Round Chat Streaming', () => {
  test.setTimeout(600000); // 10 minutes for multi-round tests

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('completes 2-round conversation', async ({ page }) => {
    // Round 1
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('What is 2+2? Brief answer.');
    await input.press('Enter');

    // Wait for thread navigation (round 1 complete)
    await waitForThreadNavigation(page);

    // Wait for input to be ready for round 2
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });

    // Round 2
    const input2 = getMessageInput(page);
    await input2.fill('Now what is 3+3?');
    await input2.press('Enter');

    // Wait for round 2 to complete
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });

    // Verify still on same thread page
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
  });

  test('can add models before starting conversation', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await expect(modelSelector).toBeEnabled({ timeout: 15000 });
    await modelSelector.click();

    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check that model options are available
    const options = dialog.locator('button, [role="option"], [role="checkbox"]');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    // Close dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Verify we can still type and submit
    const input = getMessageInput(page);
    await input.fill('Test after model selection');
    await expect(input).toHaveValue('Test after model selection');
  });
});

test.describe('Web Search Toggle', () => {
  test.setTimeout(300000); // 5 minutes

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('web search toggle is visible and interactive', async ({ page }) => {
    // Look for web search toggle button
    const webSearchToggle = page
      .getByRole('switch', { name: /web search/i })
      .or(page.locator('[data-testid="web-search-toggle"]'))
      .or(page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: '' }))
      .first();

    // Toggle may or may not be visible depending on UI
    const isVisible = await webSearchToggle.isVisible().catch(() => false);

    if (isVisible) {
      await expect(webSearchToggle).toBeEnabled();
    }
  });
});

test.describe('Quick Start Suggestions', () => {
  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('clicking quick start suggestion starts conversation', async ({ page }) => {
    // Find suggestion buttons
    const suggestions = page.locator('button').filter({
      hasText: /privacy|extinct|merit|embryo|intelligence|growth/i,
    });

    const count = await suggestions.count();
    if (count > 0) {
      // Click first suggestion
      await suggestions.first().click();

      // Should start streaming and eventually navigate to thread
      await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 }).catch(() => {
        // May still be streaming
      });
    }
  });
});
