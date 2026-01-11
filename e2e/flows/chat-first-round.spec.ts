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

// NOTE: Full streaming tests are in e2e/pro/streaming-chat.spec.ts
// Those tests use pro user auth with billing access
