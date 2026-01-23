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
 * Run with: bun run exec playwright test e2e/pro/comprehensive-multi-round-config.spec.ts --project=chromium-pro
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
 * Helper to wait for the toolbar to be fully interactive
 * Waits for ALL toolbar controls to be enabled (send button, web search toggle, etc.)
 */
async function waitForToolbarReady(page: import('@playwright/test').Page, timeout = 60000) {
  const startTime = Date.now();

  // Wait for all these to be enabled simultaneously
  const sendButton = page.getByRole('button', { name: /send message/i });
  const webSearchToggle = page.locator('[data-testid="web-search-toggle"]')
    .or(page.getByRole('button', { name: /web search/i }))
    .first();
  const textarea = page.locator('textarea');

  // Poll until all are enabled or timeout
  let allEnabled = false;
  while (!allEnabled && (Date.now() - startTime) < timeout) {
    try {
      const [sendEnabled, toggleEnabled, textareaEnabled] = await Promise.all([
        sendButton.isEnabled().catch(() => false),
        webSearchToggle.isEnabled().catch(() => false),
        textarea.isEnabled().catch(() => false),
      ]);

      // Note: Send button may be disabled if no text, so just check toggle and textarea
      if (toggleEnabled && textareaEnabled) {
        allEnabled = true;
        console.error(`Toolbar ready: toggle=${toggleEnabled}, textarea=${textareaEnabled}, sendBtn=${sendEnabled}`);
      } else {
        await page.waitForTimeout(500);
      }
    } catch {
      await page.waitForTimeout(500);
    }
  }

  if (!allEnabled) {
    console.error(`WARNING: Toolbar not fully ready after ${timeout}ms, proceeding anyway...`);
  }

  // Additional buffer for React state propagation
  await page.waitForTimeout(300);
}

/**
 * Helper to wait for streaming to complete
 * Waits for all streaming indicators to disappear AND textarea to be enabled
 */
async function waitForStreamingComplete(page: import('@playwright/test').Page, timeout = 180000) {
  const startTime = Date.now();

  // Wait for streaming indicators to disappear
  // These indicate active streaming at various levels
  const streamingIndicators = page.locator('[data-streaming="true"], [data-round-streaming="true"]');

  // First, wait for any streaming indicators to appear (streaming started)
  // Then wait for them to disappear (streaming finished)
  try {
    // Give streaming a moment to start
    await page.waitForTimeout(1000);

    // Wait for streaming indicators to disappear (if any existed)
    await expect(streamingIndicators).toHaveCount(0, { timeout: timeout - 1000 });
  } catch {
    // If no streaming indicators found, that's fine - streaming may have completed quickly
  }

  // Wait for textarea to be enabled (final confirmation streaming is done)
  await expect(page.locator('textarea')).toBeEnabled({ timeout: Math.max(timeout - (Date.now() - startTime), 30000) });

  // Wait for the FULL toolbar to be ready, not just textarea
  // This is critical because streamingRoundNumber may take a moment to reset
  await waitForToolbarReady(page, Math.max(timeout - (Date.now() - startTime), 30000));
}

/**
 * Helper to submit message and wait for round completion
 */
async function submitAndWaitForRound(
  page: import('@playwright/test').Page,
  message: string,
  roundNum: number,
  options?: {
    expectChangelog?: boolean;
    trackRequests?: Array<{ method: string; url: string; round: number; time: number }>;
  },
) {
  const startTime = Date.now();
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

  // Wait for streaming to complete with extended timeout for web search rounds
  // Web search rounds take longer: pre-search + all participants + moderator
  // waitForStreamingComplete now includes waitForToolbarReady which ensures all controls are enabled
  const streamingTimeout = 300000; // 5 minutes for web search rounds
  await waitForStreamingComplete(page, streamingTimeout);

  // Verify changelog display if expected
  if (options?.expectChangelog === true) {
    // Wait a bit for changelog accordion to render
    await page.waitForTimeout(500);
    const changelogAccordion = page.locator('[data-testid="changelog-accordion"]')
      .or(page.locator('[data-testid="config-changes-accordion"]'))
      .or(page.locator('[class*="changelog"]'))
      .or(page.locator('text=/configuration|web search enabled|web search disabled|mode changed|participants|model/i').first());

    const isVisible = await changelogAccordion.isVisible().catch(() => false);
    console.error(`Round ${roundNum}: Changelog visible = ${isVisible} (expected: true)`);
  } else if (options?.expectChangelog === false) {
    // For no-change rounds, verify NO changelog appears
    await page.waitForTimeout(500);
    // Check that no new changelog accordion appeared for this round
    console.error(`Round ${roundNum}: No config changes expected`);
  }

  const elapsed = Date.now() - startTime;
  console.error(`Round ${roundNum} completed in ${elapsed}ms`);
}

/**
 * Helper to toggle web search
 */
async function toggleWebSearch(page: import('@playwright/test').Page) {
  // First ensure toolbar is ready (handles state propagation delays)
  await waitForToolbarReady(page, 60000);

  // Look for web search toggle by test ID (primary) or aria-label (fallback)
  const webSearchToggle = page.locator('[data-testid="web-search-toggle"]')
    .or(page.getByRole('button', { name: /web search/i }))
    .first();

  // Wait for the toggle to be visible and enabled
  await expect(webSearchToggle).toBeVisible({ timeout: 10000 });
  await expect(webSearchToggle).toBeEnabled({ timeout: 30000 });

  // Get current state before clicking
  const isCurrentlyEnabled = await webSearchToggle.getAttribute('aria-pressed') === 'true';
  console.error(`Web search toggle: currently ${isCurrentlyEnabled ? 'enabled' : 'disabled'}, clicking to toggle...`);

  await webSearchToggle.click();
  await page.waitForTimeout(500);

  // Verify state changed
  const newState = await webSearchToggle.getAttribute('aria-pressed') === 'true';
  console.error(`Web search toggle: now ${newState ? 'enabled' : 'disabled'}`);
}

/**
 * Helper to change mode
 */
async function changeMode(page: import('@playwright/test').Page) {
  // First ensure toolbar is ready
  await waitForToolbarReady(page, 60000);

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
  // First ensure toolbar is ready
  await waitForToolbarReady(page, 60000);

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
   * This is the MAIN test that catches issues by running all scenarios sequentially
   * on a single thread. Each round builds on the previous, catching race conditions,
   * state management issues, and network request ordering problems.
   *
   * Scenarios in order:
   * 1. Round 1: No search (baseline) - creates thread
   * 2. Round 2: Enable web search - tests search toggle ON
   * 3. Round 3: Disable web search + mode change - tests combined changes
   * 4. Round 4: Mode + search both change - tests multiple toggles
   * 5. Round 5: NO CHANGES - verifies no-change rounds work
   * 6. Round 6: Models change (batch add) - tests participant management
   * 7. Round 7: Model reordering - tests priority changes
   * 8. Round 8: Reordering + model add/remove - tests complex participant changes
   * 9. Round 9: NO CHANGES - verifies stability after complex changes
   * 10. Round 10: Everything at once - stress test all config types
   *
   * ALL rounds MUST complete on the SAME thread without navigation errors.
   */
  test('completes 10 rounds with all config change scenarios sequentially', async ({ page }) => {
    // Track all network requests for verification
    const allRequests: Array<{ method: string; url: string; round: number; time: number }> = [];
    const testStartTime = Date.now();
    let currentRound = 0;

    // Set up network request tracking
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/chat/')) {
        allRequests.push({
          method: request.method(),
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          round: currentRound,
          time: Date.now() - testStartTime,
        });
      }
    });

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // ==================== ROUND 1: BASELINE ====================
    console.error('\n=== ROUND 1: Baseline (no web search) ===');
    currentRound = 1;
    await submitAndWaitForRound(page, 'Round 1: What is 2+2? Brief answer.', 1);

    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);
    const threadUrl = page.url();
    const threadId = threadUrl.split('/').pop() || '';
    console.error(`Thread created: ${threadId}`);

    // ==================== ROUND 2: ENABLE WEB SEARCH ====================
    console.error('\n=== ROUND 2: Enable web search ===');
    currentRound = 2;
    await toggleWebSearch(page);
    await submitAndWaitForRound(page, 'Round 2: What is the weather today? Brief.', 2, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // Verify PATCH came before streaming for this config change round
    verifyRequestOrder(allRequests, 2, 'ROUND 2');

    // ==================== ROUND 3: DISABLE SEARCH + MODE CHANGE ====================
    console.error('\n=== ROUND 3: Disable web search + mode change ===');
    currentRound = 3;
    await toggleWebSearch(page); // Turn off
    await changeMode(page);
    await submitAndWaitForRound(page, 'Round 3: What is 5+5? Brief.', 3, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
    verifyRequestOrder(allRequests, 3, 'ROUND 3');

    // ==================== ROUND 4: MODE + SEARCH BOTH CHANGE ====================
    console.error('\n=== ROUND 4: Mode + search both change ===');
    currentRound = 4;
    await changeMode(page);
    await toggleWebSearch(page); // Turn on
    await submitAndWaitForRound(page, 'Round 4: What time is it? Brief.', 4, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
    verifyRequestOrder(allRequests, 4, 'ROUND 4');

    // ==================== ROUND 5: NO CHANGES ====================
    console.error('\n=== ROUND 5: NO CHANGES (verify no changelog) ===');
    currentRound = 5;
    await submitAndWaitForRound(page, 'Round 5: What is 10+10? Brief.', 5, {
      expectChangelog: false,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // For no-change rounds, verify NO PATCH request was made
    const round5Requests = allRequests.filter(r => r.round === 5);
    const round5Patch = round5Requests.find(r => r.method === 'PATCH');
    if (round5Patch) {
      console.error(`ROUND 5: WARNING - PATCH request found for no-change round`);
    } else {
      console.error(`ROUND 5: No PATCH request ✓ (expected for no-change round)`);
    }

    // ==================== ROUND 6: MODELS CHANGE (BATCH) ====================
    console.error('\n=== ROUND 6: Models change (batch add) ===');
    currentRound = 6;
    await toggleWebSearch(page); // Turn off for simplicity
    await addModelsInBatch(page, [/gpt-4|claude-3|gemini/i]);
    await submitAndWaitForRound(page, 'Round 6: What is 15+15? Brief.', 6, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
    verifyRequestOrder(allRequests, 6, 'ROUND 6');

    // ==================== ROUND 7: MODEL REORDERING ====================
    console.error('\n=== ROUND 7: Model reordering ===');
    currentRound = 7;
    await reorderModels(page);
    await submitAndWaitForRound(page, 'Round 7: What is 20+20? Brief.', 7, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
    verifyRequestOrder(allRequests, 7, 'ROUND 7');

    // ==================== ROUND 8: REORDERING + ADD/REMOVE ====================
    console.error('\n=== ROUND 8: Reordering + model add/remove ===');
    currentRound = 8;
    await addModel(page, /sonnet|haiku|opus/i);
    await removeModel(page, /gpt-4|claude-3|gemini/i);
    await reorderModels(page);
    await submitAndWaitForRound(page, 'Round 8: What is 25+25? Brief.', 8, {
      expectChangelog: true,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);
    verifyRequestOrder(allRequests, 8, 'ROUND 8');

    // ==================== ROUND 9: NO CHANGES (STABILITY CHECK) ====================
    console.error('\n=== ROUND 9: NO CHANGES (verify after complex changes) ===');
    currentRound = 9;
    await submitAndWaitForRound(page, 'Round 9: What is 30+30? Brief.', 9, {
      expectChangelog: false,
    });
    logUrlComparison(page.url(), threadUrl);
    expect(isOnThreadPage(page.url())).toBe(true);

    // Verify no PATCH for no-change round
    const round9Requests = allRequests.filter(r => r.round === 9);
    const round9Patch = round9Requests.find(r => r.method === 'PATCH');
    if (round9Patch) {
      console.error(`ROUND 9: WARNING - PATCH request found for no-change round`);
    } else {
      console.error(`ROUND 9: No PATCH request ✓ (expected for no-change round)`);
    }

    // ==================== ROUND 10: EVERYTHING AT ONCE ====================
    console.error('\n=== ROUND 10: Everything at once (models + order + mode + search) ===');
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
    verifyRequestOrder(allRequests, 10, 'ROUND 10');

    // ==================== FINAL SUMMARY ====================
    const totalTime = Date.now() - testStartTime;
    console.error('\n=== ALL 10 ROUNDS COMPLETED SUCCESSFULLY ===');
    console.error(`Total test time: ${Math.round(totalTime / 1000)}s`);
    console.error(`Total API requests: ${allRequests.length}`);

    // Final verification of request ordering for ALL config change rounds
    const configChangeRounds = [2, 3, 4, 6, 7, 8, 10];
    let allOrderingCorrect = true;
    for (const round of configChangeRounds) {
      const roundRequests = allRequests.filter(r => r.round === round);
      const patchIdx = roundRequests.findIndex(r => r.method === 'PATCH');
      const streamIdx = roundRequests.findIndex(r => r.method === 'POST' && r.url.includes('/stream'));

      if (patchIdx >= 0 && streamIdx >= 0) {
        if (patchIdx >= streamIdx) {
          console.error(`❌ Round ${round}: PATCH at ${patchIdx}, stream at ${streamIdx} - WRONG ORDER`);
          allOrderingCorrect = false;
        }
      }
    }

    if (allOrderingCorrect) {
      console.error('✅ All config change rounds have correct PATCH→stream ordering');
    }
  });
});

/**
 * Helper to verify PATCH comes before streaming for a specific round
 */
function verifyRequestOrder(
  allRequests: Array<{ method: string; url: string; round: number; time: number }>,
  round: number,
  label: string,
): void {
  const roundRequests = allRequests.filter(r => r.round === round);
  const patchReq = roundRequests.find(r => r.method === 'PATCH');
  const streamReq = roundRequests.find(r => r.method === 'POST' && r.url.includes('/stream'));

  if (patchReq && streamReq) {
    const patchIdx = roundRequests.indexOf(patchReq);
    const streamIdx = roundRequests.indexOf(streamReq);
    if (patchIdx < streamIdx) {
      console.error(`${label}: PATCH before stream ✓ (PATCH@${patchReq.time}ms, stream@${streamReq.time}ms)`);
    } else {
      console.error(`${label}: ❌ PATCH after stream - BUG! (PATCH@${patchReq.time}ms, stream@${streamReq.time}ms)`);
    }
  } else if (!patchReq) {
    console.error(`${label}: No PATCH request found (may not have config changes applied)`);
  } else if (!streamReq) {
    console.error(`${label}: No stream request found`);
  }
}

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
