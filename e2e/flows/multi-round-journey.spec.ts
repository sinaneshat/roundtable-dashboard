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

// NOTE: Full multi-round streaming tests are in e2e/pro/streaming-chat.spec.ts
// Those tests use pro user auth with billing access
