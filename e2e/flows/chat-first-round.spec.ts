import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getModelSelectorButton,
} from '../helpers';

/**
 * Chat Interface E2E Tests
 * Tests the initial chat interface and configuration options
 *
 * Note: Full streaming tests require billing setup (payment method connected)
 * and real AI API access. These are skipped by default.
 *
 * @see docs/FLOW_DOCUMENTATION.md
 */
test.describe('Chat Interface Setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('shows chat input area', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeVisible();
  });

  test('shows model selection button', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await expect(modelSelector).toBeVisible({ timeout: 10000 });
  });

  test('can type in message input', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Test message');
    await expect(input).toHaveValue('Test message');
  });

  test('can open model selector dialog', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    // Dialog should open
    await expect(
      page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]')),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows quick start suggestions', async ({ page }) => {
    // Look for quick start suggestion buttons
    const suggestions = page.locator('button').filter({
      hasText: /privacy|extinct|merit|embryo|intelligence|growth/i,
    });

    await expect(suggestions.first()).toBeVisible({ timeout: 15000 });
  });
});

/**
 * Full Chat Streaming Tests
 * These tests require:
 * - Payment method connected (free tier users need card on file)
 * - Real AI API access
 * - Longer timeouts for AI responses
 *
 * Skip these unless ENABLE_CHAT_STREAMING_TESTS=1 is set
 */
test.describe('Chat Streaming (requires billing setup)', () => {
  test.skip(
    () => !process.env.ENABLE_CHAT_STREAMING_TESTS,
    'Streaming tests require billing setup - set ENABLE_CHAT_STREAMING_TESTS=1 to enable',
  );

  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('can submit message and see response', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Say hi in 1 word only');
    await input.press('Enter');

    // Wait for either:
    // 1. URL to change to thread page (streaming completed)
    // 2. Streaming indicator (pulsing dot) to appear
    // 3. Stop button to appear (streaming in progress)
    await Promise.race([
      page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 }),
      page.locator('.animate-pulse').first().waitFor({ state: 'visible', timeout: 60000 }),
      page.getByRole('button', { name: /stop/i }).waitFor({ state: 'visible', timeout: 60000 }),
    ]);

    // Verify we see AI response content or are on thread page
    const isOnThreadPage = page.url().match(/\/chat\/[a-zA-Z0-9-]+/);
    if (!isOnThreadPage) {
      // If not on thread page yet, wait for it
      await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    }
  });
});
