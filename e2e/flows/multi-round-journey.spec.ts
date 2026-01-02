import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getModelSelectorButton,
} from '../helpers';

/**
 * Multi-Round Chat Journey E2E Tests
 *
 * Note: Full streaming tests require billing setup (payment method connected)
 * and real AI API access. These are skipped by default.
 *
 * @see docs/FLOW_DOCUMENTATION.md
 */

/**
 * Configuration Tests - These work without billing setup
 */
test.describe('Chat Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('allows model selection before first message', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await expect(modelSelector).toBeVisible({ timeout: 15000 });
    await modelSelector.click();

    // Model dialog/popover should open
    await expect(
      page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]')),
    ).toBeVisible({ timeout: 5000 });
  });

  test('can type message before sending', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Test message for multi-round');
    await expect(input).toHaveValue('Test message for multi-round');
  });
});

/**
 * Full Streaming Tests - Require billing setup
 * Skip these unless ENABLE_CHAT_STREAMING_TESTS=1 is set
 */
test.describe('Multi-Round Streaming (requires billing setup)', () => {
  test.skip(
    () => !process.env.ENABLE_CHAT_STREAMING_TESTS,
    'Streaming tests require billing setup - set ENABLE_CHAT_STREAMING_TESTS=1 to enable',
  );

  test.setTimeout(300000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('can complete multi-round chat flow', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('What is 2+2?');
    await input.press('Enter');

    // Wait for thread page navigation
    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 180000 });
    expect(page.url()).toMatch(/\/chat\/[\w-]+/);

    // Wait for input to be ready for round 2
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
  });

  test('stop button appears during streaming', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Write a long story');
    await input.press('Enter');

    const stopButton = page.getByRole('button', { name: /stop/i });
    await expect(stopButton).toBeVisible({ timeout: 30000 });
  });
});
