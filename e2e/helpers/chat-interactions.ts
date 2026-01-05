import type { Locator, Page } from '@playwright/test';

/**
 * Chat Page Interaction Helpers
 * Reusable functions for common chat page interactions
 */

/**
 * Get the message input element (textarea)
 */
export function getMessageInput(page: Page): Locator {
  return page.locator('textarea').first();
}

/**
 * Get the send/submit button
 * The button uses aria-label="Send message" from translations
 */
export function getSendButton(page: Page): Locator {
  return page
    .getByRole('button', { name: /send message/i })
    .or(page.locator('button[type="submit"]').filter({ hasNot: page.locator('[aria-label*="stop"]') }))
    .first();
}

/**
 * Get the stop button (shown during streaming)
 * The button uses aria-label="Stop streaming" from translations
 */
export function getStopButton(page: Page): Locator {
  return page
    .getByRole('button', { name: /stop/i })
    .first();
}

/**
 * Get the AI model selection button
 */
export function getModelSelectorButton(page: Page): Locator {
  return page
    .getByRole('button', { name: /model|ai|participant|add/i })
    .or(page.locator('[data-testid="model-selector"]'))
    .first();
}

/**
 * Type a message and submit it
 */
export async function submitMessage(page: Page, message: string): Promise<void> {
  const input = getMessageInput(page);
  await input.fill(message);

  // Use keyboard Enter to submit (more reliable than clicking submit button)
  await input.press('Enter');
}

/**
 * Wait for streaming to start by checking for streaming indicators
 */
export async function waitForStreamingStart(page: Page, timeout = 30000): Promise<void> {
  // Wait for any streaming indicator
  await page
    .locator('[data-streaming="true"]')
    .or(page.locator('.animate-pulse'))
    .or(page.getByRole('button', { name: /stop/i }))
    .or(page.locator('[data-round-streaming="true"]'))
    .first()
    .waitFor({ state: 'visible', timeout });
}

/**
 * Wait for AI response to appear
 */
export async function waitForAIResponse(page: Page, timeout = 60000): Promise<void> {
  await page
    .locator('[data-message-role="assistant"]')
    .or(page.locator('[data-participant-index]'))
    .or(page.locator('[data-model-message]'))
    .first()
    .waitFor({ state: 'visible', timeout });
}

/**
 * Wait for navigation to a thread page (/chat/[slug])
 */
export async function waitForThreadNavigation(page: Page, timeout = 60000): Promise<void> {
  await page.waitForURL(/\/chat\/[\w-]+/, { timeout });
}

/**
 * Ensure at least one model is selected by clicking the Models button
 * and selecting a model if none are selected.
 * Returns true if models were already selected or got selected successfully.
 */
export async function ensureModelsSelected(page: Page, timeout = 15000): Promise<boolean> {
  const sendButton = page.getByRole('button', { name: /send message/i });

  // Check if send button is enabled (models already selected)
  const isEnabled = await sendButton.isEnabled().catch(() => false);
  if (isEnabled) {
    return true;
  }

  // Check for "Select at least 1 model" message
  const noModelsMessage = page.getByText(/select at least 1 model/i);
  const hasNoModels = await noModelsMessage.isVisible().catch(() => false);

  if (hasNoModels) {
    // Click the Models button to open model selector
    const modelsButton = page.getByRole('button', { name: /models/i });
    await modelsButton.click({ timeout: 5000 });

    // Wait for dropdown to appear
    await page.waitForTimeout(500);

    // Try to select the first available model checkbox
    const modelCheckbox = page.locator('[role="menuitemcheckbox"]').first();
    const checkboxVisible = await modelCheckbox.isVisible().catch(() => false);

    if (checkboxVisible) {
      await modelCheckbox.click();
      // Close the dropdown by clicking elsewhere
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else {
      // Try clicking any model option
      const modelOption = page.locator('[data-model-id]').first();
      const optionVisible = await modelOption.isVisible().catch(() => false);
      if (optionVisible) {
        await modelOption.click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  }

  // Verify send button is now enabled
  await sendButton.waitFor({ state: 'visible', timeout });
  return await sendButton.isEnabled().catch(() => false);
}
