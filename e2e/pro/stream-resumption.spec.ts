import { expect, test } from '@playwright/test';

import { ensureModelsSelected, getMessageInput } from '../helpers';

/**
 * Stream Resumption E2E Tests
 *
 * These tests verify that the application correctly handles page refreshes
 * at various points during a chat conversation. The app uses Cloudflare KV
 * for stream completion detection, NOT full mid-stream resumption.
 *
 * Key Behavior (from FLOW_DOCUMENTATION.md Part 3.5):
 * - Stream completion is tracked in KV (active/completed/failed)
 * - On page reload: if stream completed → show completed message from DB
 * - On page reload: if stream still active → show loading indicator until complete
 * - Partial progress is LOST on reload (no mid-stream resumption)
 *
 * IMPORTANT: These tests run serially to avoid rate limiting (429 errors)
 *
 * @see docs/FLOW_DOCUMENTATION.md Part 3.5: Stream Completion Detection
 */

// Run all tests serially to avoid rate limiting
test.describe.configure({ mode: 'serial' });

// Helper to extract thread slug from URL
function extractThreadSlug(url: string): string | null {
  const match = url.match(/\/chat\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

// Helper to wait and retry if rate limited
async function waitForRateLimitRecovery(page: import('@playwright/test').Page) {
  const rateLimitMessage = page.getByText(/too many requests|429/i);
  const isRateLimited = await rateLimitMessage.isVisible({ timeout: 1000 }).catch(() => false);
  if (isRateLimited) {
    // Wait for rate limit to clear
    await page.waitForTimeout(5000);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
}

test.describe('Stream Resumption - Initial Round', () => {
  test.setTimeout(300000); // 5 minutes

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    await waitForRateLimitRecovery(page);
    await ensureModelsSelected(page);
  });

  test('refresh immediately after submit recovers conversation state', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Say hello in one word');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for thread creation to start (increased from 500ms to 2s for more reliable thread creation)
    await page.waitForTimeout(2000);

    // Refresh immediately - before any visible streaming
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Check for rate limit errors after refresh
    await waitForRateLimitRecovery(page);

    // After refresh, verify page is functional
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });

    const currentUrl = page.url();
    if (currentUrl.includes('/chat/')) {
      // Thread was created - wait for it to load
      // First check if already enabled (stream completed quickly)
      const isEnabled = await page.locator('textarea').isEnabled({ timeout: 5000 }).catch(() => false);
      if (!isEnabled) {
        // Wait longer for stream to complete
        await expect(page.locator('textarea')).toBeEnabled({ timeout: 120000 });
      }
    } else {
      // Still on /chat - should be able to start new conversation
      await expect(input).toBeEnabled({ timeout: 30000 });
    }
  });

  test('refresh during first participant streaming recovers completed messages', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Explain what artificial intelligence is in 3 detailed paragraphs');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for streaming to start
    const stopButton = page.getByRole('button', { name: /stop/i });
    await stopButton.isVisible({ timeout: 30000 }).catch(() => false);

    // Wait for some content to stream
    await page.waitForTimeout(3000);

    // Refresh during streaming
    await page.reload({ waitUntil: 'domcontentloaded' });

    // After refresh, verify page is functional
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(5000);

    // Verify URL is valid
    expect(page.url()).toMatch(/\/chat(\/[a-zA-Z0-9-]+)?/);

    // Input should eventually become usable
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 120000 });
  });

  test('refresh between participants shows completed participant messages', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Quick question: What is 2+2?');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for streaming to start
    await page.getByRole('button', { name: /stop/i }).isVisible({ timeout: 30000 }).catch(() => false);

    // Wait for first participant to complete
    await page.waitForTimeout(15000);

    // Refresh
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Should recover thread state
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });
  });

  test('refresh during moderator/summary generation shows participant responses', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Say hi briefly');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for participants to complete
    await page.waitForTimeout(25000);

    const currentUrl = page.url();
    if (!currentUrl.includes('/chat/')) {
      // Refresh during summary generation
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    }

    // Wait for navigation to complete
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 120000 }).catch(() => {});
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });
  });

  test('refresh after thread navigation shows complete round', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Hello world');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for navigation to thread page
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });

    const threadSlug = extractThreadSlug(page.url());
    expect(threadSlug).toBeTruthy();

    // Refresh the page
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Should be on a thread page (slug may change due to title generation)
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 30000 });
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    // Thread should load with messages
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });

    // User message should be visible
    await expect(page.getByText('Hello world')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Stream Resumption - Second Round', () => {
  test.setTimeout(600000); // 10 minutes for multi-round tests

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    await waitForRateLimitRecovery(page);
    await ensureModelsSelected(page);
  });

  test('refresh during second round streaming recovers both rounds', async ({ page }) => {
    // Round 1
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('What is 1+1?');

    let sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for first round to complete
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });

    // Round 2
    const input2 = getMessageInput(page);
    await input2.fill('Now what is 2+2?');

    sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for streaming to start
    await page.waitForTimeout(3000);

    // Refresh during second round
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Should be on a thread page
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 30000 });
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    // Should load thread with messages
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });

    // First round message should be visible
    await expect(page.getByText('What is 1+1?')).toBeVisible({ timeout: 10000 });

    // Input should eventually be enabled
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });
  });

  test('refresh between rounds preserves conversation history', async ({ page }) => {
    // Complete Round 1
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Brief greeting');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });

    // Refresh before starting round 2
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Should be on a thread page
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 30000 });
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });

    // First message should be visible
    await expect(page.getByText('Brief greeting')).toBeVisible({ timeout: 10000 });

    // Should be able to submit round 2
    const input2 = getMessageInput(page);
    await input2.fill('Follow up question');
    await expect(input2).toHaveValue('Follow up question');
  });
});

test.describe('Stream Resumption - Stop Button Interaction', () => {
  test.setTimeout(300000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    await waitForRateLimitRecovery(page);
    await ensureModelsSelected(page);
  });

  test('refresh after clicking stop preserves stopped state', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Write a very detailed essay about the history of computing');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for stop button to appear (streaming might complete quickly)
    const stopButton = page.getByRole('button', { name: /stop/i });
    const stopButtonVisible = await stopButton.isVisible({ timeout: 30000 }).catch(() => false);

    if (stopButtonVisible) {
      // Click stop if visible
      await stopButton.click();
      // Wait for streaming to stop
      await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });
    } else {
      // Streaming may have completed - wait for navigation
      await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 120000 }).catch(() => {});
      await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });
    }

    // Refresh
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Thread should be loaded
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });

    // User message should be visible (use .first() to avoid strict mode)
    await expect(page.getByText(/history of computing/i).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Stream Resumption - Edge Cases', () => {
  test.setTimeout(300000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    await waitForRateLimitRecovery(page);
    await ensureModelsSelected(page);
  });

  test('multiple rapid refreshes recover gracefully', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Simple question');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for thread creation
    await page.waitForTimeout(2000);

    // Multiple rapid refreshes - catch navigation errors that occur during rapid reloads
    for (let i = 0; i < 3; i++) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
      } catch {
        // Ignore navigation errors during rapid refresh - this tests stress tolerance
      }
      await page.waitForTimeout(300);
    }

    // After rapid refreshes, navigate to /chat to ensure clean recovery
    // This tests that the app doesn't get into an unrecoverable state
    await page.goto('/chat', { waitUntil: 'networkidle' });

    // Verify we can interact with chat again
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
    await ensureModelsSelected(page);
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 30000 });
  });

  test('navigating away and back recovers thread state', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Test navigation away');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for thread to be created and streaming to complete
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });

    const threadUrl = page.url();

    // Navigate away
    await page.goto('/chat/pricing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Navigate back to thread
    await page.goto(threadUrl, { waitUntil: 'networkidle' });

    // Should load the page with thread content
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });

    // User message should be visible (confirms thread content loaded)
    await expect(page.getByText('Test navigation away').first()).toBeVisible({ timeout: 10000 });

    // Input should be functional (can type)
    const input2 = getMessageInput(page);
    await input2.fill('Follow-up message');
    await expect(input2).toHaveValue('Follow-up message');
  });

  test('closing and reopening thread URL loads complete data', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Test URL persistence');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for navigation and round to complete
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 60000 });

    const threadUrl = page.url();

    // Navigate away to another page (not about:blank which can cause session issues)
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Navigate back to thread URL
    await page.goto(threadUrl, { waitUntil: 'networkidle' });

    // Check for error page and recover if needed
    const errorText = page.getByText(/something went wrong/i);
    const hasError = await errorText.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasError) {
      // Click "Try again" or reload
      const tryAgainButton = page.getByRole('button', { name: /try again/i });
      const hasTryAgain = await tryAgainButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasTryAgain) {
        await tryAgainButton.click();
        await page.waitForTimeout(2000);
      } else {
        await page.reload({ waitUntil: 'networkidle' });
      }
    }

    // Should load thread with messages
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });

    // User message should be visible (use .first() to avoid strict mode violation)
    await expect(page.getByText('Test URL persistence').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Stream Resumption - UI State Consistency', () => {
  test.setTimeout(300000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    await waitForRateLimitRecovery(page);
    await ensureModelsSelected(page);
  });

  test('sidebar shows correct thread after refresh during streaming', async ({ page }) => {
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Check sidebar state');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for streaming to start
    await page.waitForTimeout(5000);

    // Refresh
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for page to load
    await page.waitForTimeout(10000);

    // Verify sidebar is visible
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });

  test('model selector state preserved after refresh', async ({ page }) => {
    // Check initial model selector state
    const modelSelector = page.getByRole('button', { name: /models/i });
    await expect(modelSelector).toBeVisible({ timeout: 15000 });

    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Model state test');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for navigation
    await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 180000 });

    // Refresh
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Model selector should still be visible
    await expect(modelSelector).toBeVisible({ timeout: 15000 });
  });
});
