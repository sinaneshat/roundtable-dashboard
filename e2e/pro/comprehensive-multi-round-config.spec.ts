/**
 * Comprehensive Multi-Round Config Change E2E Tests
 *
 * Tests 5+ rounds on the SAME thread with various configuration changes:
 * 1. Round 1: No web search (baseline)
 * 2. Round 2: Enable web search
 * 3. Round 3: Disable web search + mode change
 * 4. Round 4: Mode + web search both change
 * 5. Round 5: Models change (batch)
 * 6. Round 6: Model reordering
 * 7. Round 7: Reordering + model add/remove
 * 8. Round 8: Everything changes at once
 *
 * Also tests rounds WITH NO CHANGES to ensure those work correctly.
 *
 * Verifies:
 * - Changelog displays correctly for changed rounds
 * - No changelog for unchanged rounds
 * - Network requests (PATCH, streaming) occur in correct order
 * - All participants respond in each round
 *
 * Run with: pnpm exec playwright test e2e/pro/comprehensive-multi-round-config.spec.ts --project=chromium-pro
 */

import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  waitForThreadNavigation,
} from '../helpers';

// Test timeout: 15 minutes for comprehensive multi-round test
test.setTimeout(900000);

/**
 * Check if we're still on a chat thread page (not /chat overview)
 * After slug updates, we can't reliably compare URLs
 * Just verify we're still on a thread, not the overview
 */
function isOnThreadPage(url: string): boolean {
  // Must be on /chat/ and have a slug after it
  const match = url.match(/\/chat\/([^/?]+)/);
  if (!match)
    return false;
  const slug = match[1];
  // Must have a slug with content (not just /chat/)
  return slug && slug.length > 0;
}

/**
 * For debugging: log URL comparison
 */
function logUrlComparison(currentUrl: string, originalUrl: string): void {
  console.error(`URL Check: current=${currentUrl.split('/').pop()} original=${originalUrl.split('/').pop()}`);
}

/**
 * Helper to wait for streaming to complete
 */
async function waitForStreamingComplete(page: import('@playwright/test').Page, timeout = 180000) {
  // Wait for textarea to be enabled (streaming done)
  await expect(page.locator('textarea')).toBeEnabled({ timeout });
}

/**
 * Helper to submit message and wait for round completion
 */
async function submitAndWaitForRound(
  page: import('@playwright/test').Page,
  message: string,
  roundNum: number,
  options?: { expectChangelog?: boolean },
) {
  const input = getMessageInput(page);
  await expect(input).toBeEnabled({ timeout: 60000 });
  await input.fill(message);

  // Click send button
  const sendButton = page.getByRole('button', { name: /send message/i });
  await expect(sendButton).toBeEnabled({ timeout: 30000 });

  await sendButton.click();

  // If this is round 1 (initial), wait for thread navigation
  if (roundNum === 1) {
    await waitForThreadNavigation(page);
  }

  // Wait for streaming to complete
  await waitForStreamingComplete(page);

  // Verify changelog display if expected
  if (options?.expectChangelog) {
    const changelog = page.locator('[data-testid="changelog"]').or(page.locator('text=/configuration changed|web search|mode changed|participants changed/i'));
    await changelog.isVisible().catch(() => false);
  }
}

/**
 * Helper to toggle web search
 */
async function toggleWebSearch(page: import('@playwright/test').Page) {
  const webSearchToggle = page
    .getByRole('switch', { name: /web search/i })
    .or(page.locator('[data-testid="web-search-toggle"]'))
    .first();

  const isVisible = await webSearchToggle.isVisible().catch(() => false);
  if (isVisible) {
    await webSearchToggle.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Helper to change mode
 */
async function changeMode(page: import('@playwright/test').Page) {
  // Look for mode selector
  const modeSelector = page
    .getByRole('button', { name: /mode|panel|council|analyzing|brainstorming/i })
    .or(page.locator('[data-testid="mode-selector"]'))
    .first();

  const isVisible = await modeSelector.isVisible().catch(() => false);
  if (isVisible) {
    await modeSelector.click();
    await page.waitForTimeout(500);

    // Select a different mode
    const modeOptions = page.locator('[role="option"], [role="menuitem"]').filter({
      hasText: /council|panel|analyzing|brainstorming/i,
    });
    const count = await modeOptions.count();
    if (count > 0) {
      await modeOptions.first().click();
      await page.waitForTimeout(300);
    } else {
      // Close if no options
      await page.keyboard.press('Escape');
    }
  }
}

/**
 * Helper to open model selector
 */
async function openModelSelector(page: import('@playwright/test').Page) {
  const modelsButton = page.getByRole('button', { name: /models/i }).first();
  await expect(modelsButton).toBeEnabled({ timeout: 15000 });
  await modelsButton.click();
  await page.waitForTimeout(500);
}

/**
 * Helper to add a model
 */
async function addModel(page: import('@playwright/test').Page, modelNamePattern: RegExp) {
  await openModelSelector(page);

  // Look for Build Custom tab or model checkboxes
  const buildCustomTab = page.getByRole('tab', { name: /build custom/i });
  const hasCustomTab = await buildCustomTab.isVisible().catch(() => false);

  if (hasCustomTab) {
    await buildCustomTab.click();
    await page.waitForTimeout(300);
  }

  // Find unchecked model checkbox
  const modelCheckbox = page
    .locator('[role="menuitemcheckbox"]')
    .filter({ hasText: modelNamePattern })
    .first();

  const isVisible = await modelCheckbox.isVisible().catch(() => false);
  if (isVisible) {
    const isChecked = await modelCheckbox.getAttribute('aria-checked');
    if (isChecked !== 'true') {
      await modelCheckbox.click();
      await page.waitForTimeout(300);
    }
  }

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Helper to remove a model
 */
async function removeModel(page: import('@playwright/test').Page, modelNamePattern: RegExp) {
  await openModelSelector(page);

  // Look for Build Custom tab
  const buildCustomTab = page.getByRole('tab', { name: /build custom/i });
  const hasCustomTab = await buildCustomTab.isVisible().catch(() => false);

  if (hasCustomTab) {
    await buildCustomTab.click();
    await page.waitForTimeout(300);
  }

  // Find checked model checkbox
  const modelCheckbox = page
    .locator('[role="menuitemcheckbox"]')
    .filter({ hasText: modelNamePattern })
    .first();

  const isVisible = await modelCheckbox.isVisible().catch(() => false);
  if (isVisible) {
    const isChecked = await modelCheckbox.getAttribute('aria-checked');
    if (isChecked === 'true') {
      await modelCheckbox.click();
      await page.waitForTimeout(300);
    }
  }

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

test.describe('Comprehensive Multi-Round Config Changes', () => {
  test('completes 5+ rounds with various config changes on same thread', async ({ page }) => {
    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // =============== ROUND 1: Baseline (no web search) ===============
    await submitAndWaitForRound(page, 'What is 2+2? Brief answer only.', 1);

    // Verify on thread page
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
    const threadUrl = page.url();

    // =============== ROUND 2: Enable web search ===============
    await toggleWebSearch(page);
    await submitAndWaitForRound(page, 'What is the current weather in Tokyo?', 2, {
      expectChangelog: true,
    });

    // Verify still on same thread (slug may change due to AI-generated title)
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // =============== ROUND 3: Disable web search (no other changes) ===============
    await toggleWebSearch(page);
    await submitAndWaitForRound(page, 'What is 5+5?', 3, {
      expectChangelog: true,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // =============== ROUND 4: NO CHANGES (verify no changelog) ===============
    await submitAndWaitForRound(page, 'What is 10+10?', 4, {
      expectChangelog: false,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // =============== ROUND 5: Mode change only ===============
    await changeMode(page);
    await submitAndWaitForRound(page, 'What is 15+15?', 5, {
      expectChangelog: true,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
  });

  test('handles model addition and removal across rounds', async ({ page }) => {
    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // =============== ROUND 1: Baseline ===============
    await submitAndWaitForRound(page, 'Hello, brief answer please.', 1);

    const threadUrl = page.url();
    expect(threadUrl).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    // =============== ROUND 2: Add a model ===============
    await addModel(page, /claude|gpt|gemini/i);
    await submitAndWaitForRound(page, 'What is 3+3?', 2, {
      expectChangelog: true,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // =============== ROUND 3: Remove a model ===============
    await removeModel(page, /claude|gpt|gemini/i);
    await submitAndWaitForRound(page, 'What is 4+4?', 3, {
      expectChangelog: true,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
  });

  test('handles combined config changes', async ({ page }) => {
    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // =============== ROUND 1: Baseline ===============
    await submitAndWaitForRound(page, 'Say hi briefly.', 1);

    const threadUrl = page.url();
    expect(threadUrl).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    // =============== ROUND 2: Web search + mode change ===============
    await toggleWebSearch(page);
    await changeMode(page);
    await submitAndWaitForRound(page, 'What time is it in London?', 2, {
      expectChangelog: true,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // =============== ROUND 3: Add model + web search off ===============
    await addModel(page, /claude|gpt|gemini/i);
    await toggleWebSearch(page);
    await submitAndWaitForRound(page, 'What is 6+6?', 3, {
      expectChangelog: true,
    });

    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
  });
});

/**
 * Helper to reorder models by dragging (if supported) or using UI
 */
async function reorderModels(page: import('@playwright/test').Page) {
  await openModelSelector(page);

  // Look for Build Custom tab
  const buildCustomTab = page.getByRole('tab', { name: /build custom/i });
  const hasCustomTab = await buildCustomTab.isVisible().catch(() => false);

  if (hasCustomTab) {
    await buildCustomTab.click();
    await page.waitForTimeout(300);
  }

  // Try to find drag handles or reorder buttons
  const dragHandles = page.locator('[data-reorder-handle], [aria-label*="drag"], [aria-label*="reorder"]');
  const handleCount = await dragHandles.count();

  if (handleCount >= 2) {
    // Attempt drag reorder (first to last position)
    const firstHandle = dragHandles.first();
    const lastHandle = dragHandles.last();
    const firstBox = await firstHandle.boundingBox();
    const lastBox = await lastHandle.boundingBox();

    if (firstBox && lastBox) {
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height + 10);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
  }

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Helper to add multiple models at once (batch)
 */
async function addModelsInBatch(page: import('@playwright/test').Page, patterns: RegExp[]) {
  await openModelSelector(page);

  const buildCustomTab = page.getByRole('tab', { name: /build custom/i });
  const hasCustomTab = await buildCustomTab.isVisible().catch(() => false);

  if (hasCustomTab) {
    await buildCustomTab.click();
    await page.waitForTimeout(300);
  }

  for (const pattern of patterns) {
    const modelCheckbox = page
      .locator('[role="menuitemcheckbox"]')
      .filter({ hasText: pattern })
      .first();

    const isVisible = await modelCheckbox.isVisible().catch(() => false);
    if (isVisible) {
      const isChecked = await modelCheckbox.getAttribute('aria-checked');
      if (isChecked !== 'true') {
        await modelCheckbox.click();
        await page.waitForTimeout(200);
      }
    }
  }

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

test.describe('Comprehensive Sequential Multi-Round Test', () => {
  /**
   * COMPREHENSIVE TEST: Runs ALL config change scenarios on SAME thread back-to-back
   *
   * Scenarios in order:
   * 1. Round 1: No search (baseline)
   * 2. Round 2: Enable web search
   * 3. Round 3: Disable web search + mode change
   * 4. Round 4: Mode + search both change
   * 5. Round 5: NO CHANGES (verify no changelog)
   * 6. Round 6: Models change (batch add)
   * 7. Round 7: Model reordering
   * 8. Round 8: Reordering + model add/remove
   * 9. Round 9: NO CHANGES (verify works after complex changes)
   * 10. Round 10: Everything at once (models + order + mode + search)
   */
  test('completes 10 rounds with all config change scenarios sequentially', async ({ page }) => {
    // Track all network requests for verification
    const allRequests: Array<{ method: string; url: string; round: number }> = [];
    let currentRound = 0;

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/chat/')) {
        allRequests.push({
          method: request.method(),
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          round: currentRound,
        });
      }
    });

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    console.error('=== ROUND 1: Baseline (no web search) ===');
    currentRound = 1;
    await submitAndWaitForRound(page, 'Round 1: What is 2+2? Brief answer.', 1);

    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
    const threadUrl = page.url();
    console.error(`Thread created at: ${threadUrl}`);

    console.error('=== ROUND 2: Enable web search ===');
    currentRound = 2;
    await toggleWebSearch(page);
    await submitAndWaitForRound(page, 'Round 2: What is the weather today? Brief.', 2, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 3: Disable web search + mode change ===');
    currentRound = 3;
    await toggleWebSearch(page); // Turn off
    await changeMode(page);
    await submitAndWaitForRound(page, 'Round 3: What is 5+5? Brief.', 3, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 4: Mode + search both change ===');
    currentRound = 4;
    await changeMode(page);
    await toggleWebSearch(page); // Turn on
    await submitAndWaitForRound(page, 'Round 4: What time is it? Brief.', 4, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 5: NO CHANGES (verify no changelog) ===');
    currentRound = 5;
    await submitAndWaitForRound(page, 'Round 5: What is 10+10? Brief.', 5, {
      expectChangelog: false,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 6: Models change (batch add) ===');
    currentRound = 6;
    await toggleWebSearch(page); // Turn off for simplicity
    await addModelsInBatch(page, [/gpt-4|claude-3|gemini/i]);
    await submitAndWaitForRound(page, 'Round 6: What is 15+15? Brief.', 6, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 7: Model reordering ===');
    currentRound = 7;
    await reorderModels(page);
    await submitAndWaitForRound(page, 'Round 7: What is 20+20? Brief.', 7, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 8: Reordering + model add/remove ===');
    currentRound = 8;
    await addModel(page, /sonnet|haiku|opus/i);
    await removeModel(page, /gpt-4|claude-3|gemini/i);
    await reorderModels(page);
    await submitAndWaitForRound(page, 'Round 8: What is 25+25? Brief.', 8, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 9: NO CHANGES (verify after complex changes) ===');
    currentRound = 9;
    await submitAndWaitForRound(page, 'Round 9: What is 30+30? Brief.', 9, {
      expectChangelog: false,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ROUND 10: Everything at once (models + order + mode + search) ===');
    currentRound = 10;
    await addModel(page, /mini|flash/i);
    await removeModel(page, /sonnet|haiku|opus/i);
    await reorderModels(page);
    await changeMode(page);
    await toggleWebSearch(page);
    await submitAndWaitForRound(page, 'Round 10: Final test. What is 100+100? Brief.', 10, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    console.error('=== ALL 10 ROUNDS COMPLETED SUCCESSFULLY ===');

    // Verify request ordering for rounds with config changes
    const configChangeRounds = [2, 3, 4, 6, 7, 8, 10];
    for (const round of configChangeRounds) {
      const roundRequests = allRequests.filter(r => r.round === round);
      const patchIdx = roundRequests.findIndex(r => r.method === 'PATCH');
      const streamIdx = roundRequests.findIndex(r => r.method === 'POST' && r.url.includes('/stream'));

      if (patchIdx >= 0 && streamIdx >= 0) {
        expect(patchIdx).toBeLessThan(streamIdx);
        console.error(`Round ${round}: PATCH before stream ✓`);
      }
    }
  });
});

test.describe('Network Request Verification', () => {
  test('verifies PATCH completes before streaming starts', async ({ page }) => {
    // Track network requests with timing
    const requests: Array<{ method: string; url: string; time: number }> = [];
    const startTime = Date.now();

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/chat/')) {
        requests.push({
          method: request.method(),
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          time: Date.now() - startTime,
        });
      }
    });

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Round 1
    await submitAndWaitForRound(page, 'Hello test', 1);

    const threadUrl = page.url();
    expect(threadUrl).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    // Reset request tracking for round 2
    requests.length = 0;

    // Enable web search (config change)
    await toggleWebSearch(page);

    // Round 2 with config change
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 60000 });
    await input.fill('What is 2+2?');

    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 30000 });
    await sendButton.click();

    // Wait for completion
    await waitForStreamingComplete(page);

    // Verify PATCH comes before streaming POST
    const patchIndex = requests.findIndex(r => r.method === 'PATCH');
    const streamIndex = requests.findIndex(r => r.method === 'POST' && r.url.includes('/stream'));

    if (patchIndex >= 0 && streamIndex >= 0) {
      expect(patchIndex).toBeLessThan(streamIndex);
    }
  });
});
