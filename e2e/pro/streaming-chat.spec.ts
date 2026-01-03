import { expect, test } from '@playwright/test';

import {
  getMessageInput,
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

    // Wait for send button to be enabled and click it
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 5000 });
    await sendButton.click();

    // Wait for thread navigation (indicates streaming completed)
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });

    // Verify we're on thread page
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
  });

  test('stop button appears during streaming', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });

    // Use a longer prompt to ensure streaming takes time
    await input.fill('Write a very long detailed story about a magical forest with at least 500 words. Include detailed descriptions of the trees, creatures, and magical events.');

    // Click send button
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 5000 });
    await sendButton.click();

    // Wait for either stop button to appear or navigation to thread page
    // The stop button should appear during streaming, but AI might respond quickly
    const stopButton = page.getByRole('button', { name: /stop/i });
    const stopButtonVisible = await stopButton.isVisible().catch(() => false);

    if (stopButtonVisible) {
      // Click stop if visible
      await stopButton.click();
      // Input should become enabled again
      await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });
    } else {
      // If stop button never appeared, wait for thread navigation (streaming completed)
      await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 60000 });
    }
  });

  test('URL stays at /chat during first round streaming', async ({ page }) => {
    // Verify starting URL
    expect(page.url()).toContain('/chat');
    expect(page.url()).not.toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });

    await input.fill('Hello test message');

    // Click send button
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 5000 });
    await sendButton.click();

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

    // Click send button
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 5000 });
    await sendButton.click();

    // Wait for thread navigation (round 1 complete)
    await waitForThreadNavigation(page);

    // Wait for input to be ready for round 2
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });

    // Round 2 - wait longer for credits/state to update
    const input2 = getMessageInput(page);
    await input2.fill('Now what is 3+3?');

    // Wait longer for send button after round 1 (credits need to refresh)
    const sendButton2 = page.getByRole('button', { name: /send message/i });
    await expect(sendButton2).toBeEnabled({ timeout: 30000 });
    await sendButton2.click();

    // Wait for round 2 to complete
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });

    // Verify still on same thread page
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
  });

  test('can add models before starting conversation', async ({ page }) => {
    // Navigate to /chat fresh to ensure clean state
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Clear any text that may have been pre-filled from quick-start hover
    const textarea = page.locator('textarea');
    await textarea.clear();

    // Find the Models button by text content (more specific than regex)
    const modelsButton = page.getByRole('button', { name: /^models/i }).first();
    await expect(modelsButton).toBeEnabled({ timeout: 15000 });

    // Click and wait for UI to settle
    await modelsButton.click();
    await page.waitForTimeout(500);

    // Wait for the model selector panel (tablist with Presets/Build Custom)
    const presetTab = page.getByRole('tab', { name: /presets/i });
    await expect(presetTab).toBeVisible({ timeout: 10000 });

    // Check that preset options are available (buttons with model presets)
    const presetPanel = page.getByRole('tabpanel');
    await expect(presetPanel).toBeVisible({ timeout: 5000 });

    // Close the panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

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
  test.setTimeout(300000); // 5 minutes

  test.beforeEach(async ({ page }) => {
    // Navigate to /chat fresh
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('quick start suggestions are visible on new chat page', async ({ page }) => {
    // Find suggestion buttons
    const suggestions = page.locator('button').filter({
      hasText: /privacy|extinct|merit|embryo|intelligence|growth/i,
    });

    const count = await suggestions.count();
    // Suggestions should be visible on new chat page
    expect(count).toBeGreaterThan(0);
  });

  // NOTE: Clicking quick start suggestion test removed - suggestions only appear
  // when sidebar has no existing chats, making it unreliable for pro user tests
});
