import { expect, test } from '@playwright/test';

import { getMessageInput, getModelSelectorButton, getSendButton } from '../helpers';

/**
 * Chat Overview Screen E2E Tests
 * Tests the initial chat experience at /chat (ChatOverviewScreen)
 *
 * @see docs/FLOW_DOCUMENTATION.md - PART 1: STARTING A NEW CHAT
 */
test.describe('Chat Overview Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Initial UI Elements', () => {
    test('displays main chat interface elements', async ({ page }) => {
      const inputArea = getMessageInput(page);
      await expect(inputArea).toBeVisible({ timeout: 15000 });
    });

    test('shows AI model selection button', async ({ page }) => {
      const modelsButton = getModelSelectorButton(page);
      await expect(modelsButton).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Chat Configuration', () => {
    test('can open AI model selector', async ({ page }) => {
      const modelsButton = getModelSelectorButton(page);
      await modelsButton.click();

      // Model dialog/popover should open
      await expect(
        page.getByRole('dialog').or(page.locator('[role="listbox"]')).or(page.locator('[data-radix-popper-content-wrapper]')),
      ).toBeVisible({ timeout: 5000 });
    });

    test('shows quick start suggestions', async ({ page }) => {
      // Look for the quick start suggestions (question cards)
      const suggestions = page.locator('button').filter({
        hasText: /privacy|extinct|merit|embryo|intelligence|growth/i,
      });

      // Should have at least one suggestion visible
      await expect(suggestions.first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Message Submission', () => {
    test('can type in message input', async ({ page }) => {
      const input = getMessageInput(page);
      await input.fill('What is the meaning of life?');

      await expect(input).toHaveValue('What is the meaning of life?');
    });

    test('send button is visible with message', async ({ page }) => {
      const input = getMessageInput(page);
      await input.fill('Test message');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeVisible({ timeout: 5000 });
    });
  });
});
