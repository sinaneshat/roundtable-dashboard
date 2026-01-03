import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  waitForStreamingStart,
  waitForThreadNavigation,
} from '../helpers';

/**
 * Web Search Transition Bug E2E Tests
 *
 * Tests for the critical bug: When web search is enabled mid-conversation (after first round
 * without web search), the web search completes but the first participant never starts.
 *
 * Root Cause:
 * - use-round-resumption.ts line 193 and 215 use `storeThread?.enableWebSearch`
 * - This checks thread's stored value, NOT the form state
 * - When user enables web search mid-conversation, form state is true but thread is false
 * - shouldWaitForPreSearch(false, ...) returns false immediately (skips pre-search)
 * - But pre-search WAS created because form state was true
 * - Race condition: Pre-search runs but participants don't wait for it properly
 *
 * Expected Behavior:
 * - Round 1 without web search completes normally
 * - User enables web search toggle
 * - Round 2 starts, web search runs
 * - When web search completes, first participant should start streaming immediately
 */

test.describe('Web Search Mid-Conversation Enable Bug', () => {
  test.setTimeout(600000); // 10 minutes

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('BUG: enabling web search mid-conversation blocks first participant', async ({ page }) => {
    // =========================================================
    // ROUND 1: Submit without web search
    // =========================================================
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 15000 });

    // Verify web search is OFF (default state)
    const webSearchToggle = page.getByRole('switch', { name: /web search/i });
    const isWebSearchOn = await webSearchToggle.isChecked().catch(() => false);

    if (isWebSearchOn) {
      // Turn off web search for round 1
      await webSearchToggle.click();
      await page.waitForTimeout(300);
    }

    // Submit first message
    await input.fill('What is 2+2? Brief answer only.');
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 10000 });
    await sendButton.click();

    // Wait for round 1 to complete and navigate to thread
    await waitForThreadNavigation(page);

    // Wait for input to be ready for round 2
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 120000 });

    // =========================================================
    // ENABLE WEB SEARCH MID-CONVERSATION
    // =========================================================

    // Find and enable web search toggle
    const webSearchToggle2 = page.getByRole('switch', { name: /web search/i });
    await expect(webSearchToggle2).toBeVisible({ timeout: 10000 });

    // Enable web search
    const isChecked = await webSearchToggle2.isChecked();
    if (!isChecked) {
      await webSearchToggle2.click();
      await page.waitForTimeout(500);
    }

    // Verify web search is now ON
    await expect(webSearchToggle2).toBeChecked({ timeout: 5000 });

    // =========================================================
    // ROUND 2: Submit with web search enabled
    // =========================================================
    const input2 = getMessageInput(page);
    await input2.fill('What year was JavaScript created? Brief answer.');

    const sendButton2 = page.getByRole('button', { name: /send message/i });
    await expect(sendButton2).toBeEnabled({ timeout: 30000 });
    await sendButton2.click();

    // =========================================================
    // VERIFY: Web search starts AND participants start after
    // =========================================================

    // Wait for either:
    // 1. Web search indicator (if web search is working)
    // 2. Streaming indicator (if participants are speaking)
    // 3. Timeout (BUG - nothing happens)

    // Look for any streaming/activity indicator with generous timeout
    const activityIndicator = page
      .locator('[data-streaming="true"]')
      .or(page.locator('[data-round-streaming="true"]'))
      .or(page.locator('.animate-pulse'))
      .or(page.getByRole('button', { name: /stop/i }))
      .or(page.locator('[data-presearch-status]'))
      .first();

    // Wait up to 60s for any activity
    const activityVisible = await activityIndicator.isVisible({ timeout: 60000 }).catch(() => false);

    if (!activityVisible) {
      // BUG DETECTED: No activity after 60 seconds - stuck state
      test.fail(true, 'BUG: No streaming activity detected after enabling web search mid-conversation');
      return;
    }

    // Wait for round 2 to complete (textarea becomes enabled again)
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });

    // Verify we stayed on the same thread page
    expect(page.url()).toMatch(/\/chat\/[\w-]+/);
  });

  test('measures time between web search completion and participant start', async ({ page }) => {
    // This test measures the transition timing to detect "flash" issues

    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 15000 });

    // Enable web search
    const webSearchToggle = page.getByRole('switch', { name: /web search/i });
    await expect(webSearchToggle).toBeVisible({ timeout: 10000 });

    const isChecked = await webSearchToggle.isChecked();
    if (!isChecked) {
      await webSearchToggle.click();
      await page.waitForTimeout(500);
    }

    // Submit message with web search
    await input.fill('What is the population of Japan? Brief answer.');
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 10000 });

    // Start timing
    const startTime = Date.now();
    await sendButton.click();

    // Wait for web search indicator
    const webSearchIndicator = page
      .locator('[data-presearch-status="streaming"]')
      .or(page.locator('[data-testid="web-search-loading"]'))
      .or(page.locator('text=/searching/i'))
      .first();

    let webSearchCompletedTime: number | null = null;
    let participantStartTime: number | null = null;

    // Monitor for web search completion and participant start
    const checkInterval = setInterval(async () => {
      try {
        // Check for web search completion
        if (!webSearchCompletedTime) {
          const isWebSearchVisible = await webSearchIndicator.isVisible().catch(() => false);
          if (!isWebSearchVisible && Date.now() - startTime > 5000) {
            // Web search likely completed (or wasn't visible)
            webSearchCompletedTime = Date.now();
          }
        }

        // Check for participant streaming
        if (!participantStartTime) {
          const streamingIndicator = await page.locator('[data-streaming="true"]').isVisible().catch(() => false);
          if (streamingIndicator) {
            participantStartTime = Date.now();
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 100);

    // Wait for round to complete
    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 120000 });

    clearInterval(checkInterval);

    const totalTime = Date.now() - startTime;

    // Log timing information
    // eslint-disable-next-line no-console
    console.log(`[TIMING] Total round time: ${totalTime}ms`);
    if (webSearchCompletedTime && participantStartTime) {
      const gap = participantStartTime - webSearchCompletedTime;
      // eslint-disable-next-line no-console
      console.log(`[TIMING] Gap between web search and participant: ${gap}ms`);

      // If gap is too large (>3 seconds), there might be a blocking issue
      if (gap > 3000) {
        // eslint-disable-next-line no-console
        console.warn(`[WARNING] Large gap (${gap}ms) between web search completion and participant start`);
      }
    }
  });
});

test.describe('Conversation Round Completion Flashiness', () => {
  test.setTimeout(300000); // 5 minutes

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('detects UI flashiness after conversation round completes', async ({ page }) => {
    // This test watches for rapid DOM changes that indicate flashiness

    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 15000 });

    await input.fill('Say hi in one word');
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 10000 });

    // Set up mutation observer via page.evaluate
    await page.evaluate(() => {
      (window as unknown as Record<string, number>).__visibilityChanges = 0;
      (window as unknown as Record<string, string[]>).__changedElements = [];

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const addedCount = mutation.addedNodes.length;
            const removedCount = mutation.removedNodes.length;

            // Track significant changes to message-related elements
            if (addedCount + removedCount > 0) {
              const target = mutation.target as Element;
              if (target.closest?.('[data-message-role]') || target.closest?.('[data-participant-index]')) {
                (window as unknown as Record<string, number>).__visibilityChanges++;
                (window as unknown as Record<string, string[]>).__changedElements.push(
                  `added:${addedCount} removed:${removedCount}`,
                );
              }
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      (window as unknown as Record<string, MutationObserver>).__flashObserver = observer;
    });

    // Submit message
    await sendButton.click();

    // Wait for streaming to start
    await waitForStreamingStart(page, 60000);

    // Wait for round to complete
    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 120000 });

    // Give a moment for any post-completion animations
    await page.waitForTimeout(1000);

    // Get visibility change count
    const changes = await page.evaluate(() => {
      const obs = (window as unknown as Record<string, MutationObserver>).__flashObserver;
      if (obs)
        obs.disconnect();
      return {
        count: (window as unknown as Record<string, number>).__visibilityChanges,
        changes: (window as unknown as Record<string, string[]>).__changedElements,
      };
    });

    // eslint-disable-next-line no-console
    console.log(`[FLASH] DOM visibility changes: ${changes.count}`);
    // eslint-disable-next-line no-console
    console.log(`[FLASH] Change details:`, changes.changes.slice(-10));

    // A high number of visibility changes indicates flashiness
    // Normal streaming should have gradual additions, not rapid add/remove cycles
    if (changes.count > 50) {
      // eslint-disable-next-line no-console
      console.warn(`[WARNING] High DOM churn detected (${changes.count} changes) - possible flashiness`);
    }
  });

  test('tracks key changes during participant transitions', async ({ page }) => {
    // This test specifically looks for React key instability during transitions

    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 15000 });

    await input.fill('Hello, give a brief response');
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 10000 });

    // Track data-key attributes
    await page.evaluate(() => {
      (window as unknown as Record<string, string[]>).__keyChanges = [];
      (window as unknown as Record<string, Set<string>>).__seenKeys = new Set();

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node instanceof Element) {
                const key = node.getAttribute('data-key') || node.getAttribute('data-participant-key');
                if (key) {
                  const keySet = (window as unknown as Record<string, Set<string>>).__seenKeys;
                  if (keySet.has(key)) {
                    (window as unknown as Record<string, string[]>).__keyChanges.push(`re-added: ${key}`);
                  } else {
                    keySet.add(key);
                    (window as unknown as Record<string, string[]>).__keyChanges.push(`added: ${key}`);
                  }
                }
              }
            }
            for (const node of Array.from(mutation.removedNodes)) {
              if (node instanceof Element) {
                const key = node.getAttribute('data-key') || node.getAttribute('data-participant-key');
                if (key) {
                  (window as unknown as Record<string, string[]>).__keyChanges.push(`removed: ${key}`);
                }
              }
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      (window as unknown as Record<string, MutationObserver>).__keyObserver = observer;
    });

    await sendButton.click();

    // Wait for round to complete
    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 180000 });
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 120000 });

    await page.waitForTimeout(500);

    const keyChanges = await page.evaluate(() => {
      const obs = (window as unknown as Record<string, MutationObserver>).__keyObserver;
      if (obs)
        obs.disconnect();
      return (window as unknown as Record<string, string[]>).__keyChanges;
    });

    // eslint-disable-next-line no-console
    console.log(`[KEY] Key changes during streaming:`, keyChanges.slice(-20));

    // Look for patterns like "added: X" followed by "removed: X" followed by "re-added: X"
    // This indicates React remounting due to key instability
    const reAddedCount = keyChanges.filter(k => k.startsWith('re-added')).length;

    if (reAddedCount > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[WARNING] ${reAddedCount} elements were re-added - indicates key instability causing remounts`);
    }
  });
});
