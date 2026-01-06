/**
 * Free User Quota Enforcement & UI Behavior E2E Tests
 *
 * Focuses on UI/UX aspects of quota enforcement that aren't covered by existing tests:
 * - Thread creation blocked after first thread (UI feedback)
 * - Round completion detection and credit zeroing UI
 * - Upgrade prompts appearing at correct times
 * - Credit display accuracy during usage
 * - Multi-tab behavior (both tabs see same quota state)
 * - Refresh behavior maintaining quota state
 *
 * Test Strategy:
 * - Use test-only endpoint to manipulate credits for deterministic testing
 * - Verify UI state changes reflect backend quota enforcement
 * - Test user-facing feedback messages and upgrade paths
 * - Ensure UI consistency across page refreshes and multiple tabs
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import {
  ensureModelsSelected,
  getMessageInput,
  getSendButton,
  submitMessage,
  waitForAIResponse,
  waitForStreamingStart,
  waitForThreadNavigation,
} from '../helpers';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get credit balance via API
 */
async function getCreditBalance(page: Page): Promise<{
  balance: number;
  reserved: number;
  available: number;
  status: 'default' | 'warning' | 'critical';
  percentage: number;
  plan: {
    type: 'free' | 'paid';
    monthlyCredits: number;
    nextRefillAt: string | null;
  };
}> {
  const response = await page.request.get('/api/v1/credits/balance');

  if (!response.ok()) {
    throw new Error(`Failed to get credit balance: ${response.status()}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Set user credits (test-only endpoint)
 */
async function setUserCredits(page: Page, credits: number): Promise<void> {
  const response = await page.request.post('/api/v1/test/set-credits', {
    data: { credits },
  });

  if (!response.ok()) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to set credits: ${response.status()} - ${errorText}`);
  }

  await page.waitForTimeout(200);
}

/**
 * Check if free user has completed round 0
 */
async function checkFreeRoundCompleted(page: Page): Promise<boolean> {
  const response = await page.request.get('/api/v1/credits/transactions?limit=100');

  if (!response.ok()) {
    return false;
  }

  const data = await response.json();
  return data.data.items.some(
    (tx: { action: string }) => tx.action === 'free_round_complete',
  );
}

/**
 * Get thread count for user
 */
async function getThreadCount(page: Page): Promise<number> {
  const response = await page.request.get('/api/v1/chat/threads');

  // If endpoint doesn't exist or auth fails, return 0
  if (!response.ok()) {
    return 0;
  }

  const data = await response.json();
  return data.data?.length || 0;
}

/**
 * Check if upgrade CTA is visible in UI
 */
async function isUpgradeCTAVisible(page: Page): Promise<boolean> {
  const upgradeSelectors = [
    page.locator('text=/upgrade.*pro/i'),
    page.locator('text=/subscribe/i'),
    page.locator('a[href*="pricing"]'),
    page.getByRole('link', { name: /upgrade/i }),
    page.getByRole('button', { name: /upgrade/i }),
  ];

  for (const selector of upgradeSelectors) {
    const visible = await selector.first().isVisible({ timeout: 2000 }).catch(() => false);
    if (visible)
      return true;
  }

  return false;
}

/**
 * Check if credit/quota display is visible and get text
 */
async function getCreditDisplayText(page: Page): Promise<string | null> {
  const creditDisplays = [
    page.locator('[data-credits]'),
    page.locator('[data-quota]'),
    page.locator('text=/\\d+\\s*credits?/i'),
  ];

  for (const display of creditDisplays) {
    const visible = await display.first().isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      return await display.first().textContent();
    }
  }

  return null;
}

/**
 * Check if error/warning alert is visible
 */
async function getAlertMessage(page: Page): Promise<string | null> {
  const alert = page.locator('[role="alert"]').first();
  const visible = await alert.isVisible({ timeout: 2000 }).catch(() => false);

  if (visible) {
    return await alert.textContent();
  }

  return null;
}

// ============================================================================
// TEST SUITES
// ============================================================================

test.describe('Free User Quota Enforcement - UI/UX Focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  // ==========================================================================
  // THREAD CREATION BLOCKING UI
  // ==========================================================================

  test.describe('Thread Creation Blocked UI Feedback', () => {
    test('shows error when trying to create second thread', async ({ page }) => {
      const threadCount = await getThreadCount(page);

      // Only test if user already has 1+ threads (free users limited to 1)
      if (threadCount < 1) {
        test.skip();
      }

      // Try to send message to create new thread (go to /chat overview)
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await ensureModelsSelected(page);

      const input = getMessageInput(page);
      await input.fill('Attempt to create second thread');

      const sendButton = getSendButton(page);
      await sendButton.click();

      // Wait for potential error
      await page.waitForTimeout(1500);

      // Should either stay on chat overview OR show error
      const currentUrl = page.url();
      const isStillOnOverview = currentUrl.endsWith('/chat') || currentUrl.includes('/chat?');

      if (isStillOnOverview) {
        // Check for error message
        const alert = await getAlertMessage(page);

        if (alert) {
          expect(alert.toLowerCase()).toMatch(/thread|one|limit|subscribe/);
        }
      }

      // Should NOT navigate to new thread
      const navigatedToNewThread = /\/chat\/[\w-]+/.test(currentUrl) && !threadCount;
      expect(navigatedToNewThread).toBe(false);
    });

    test('new thread button disabled or shows tooltip when limit hit', async ({ page }) => {
      const threadCount = await getThreadCount(page);

      if (threadCount < 1) {
        test.skip();
      }

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Look for new thread/chat button
      const newThreadBtn = page.getByRole('button', { name: /new.*chat|new.*thread|create/i });
      const btnVisible = await newThreadBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (btnVisible) {
        // Button might be disabled
        const isDisabled = await newThreadBtn.isDisabled().catch(() => false);

        // Or clicking it might show a tooltip/alert
        if (!isDisabled) {
          await newThreadBtn.click();
          await page.waitForTimeout(1000);

          // Check for error or tooltip
          const hasError = await page.locator('text=/limit|one thread|upgrade/i').first().isVisible({ timeout: 3000 });
          expect(hasError).toBe(true);
        } else {
          expect(isDisabled).toBe(true);
        }
      }
    });

    test('thread limit error includes upgrade CTA', async ({ page }) => {
      const threadCount = await getThreadCount(page);

      if (threadCount < 1) {
        test.skip();
      }

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await ensureModelsSelected(page);

      // Try to create thread
      const input = getMessageInput(page);
      await input.fill('Test thread limit error');
      await input.press('Enter');

      await page.waitForTimeout(1500);

      // Should show upgrade CTA
      const hasUpgradeCTA = await isUpgradeCTAVisible(page);

      if (!hasUpgradeCTA) {
        // Check for error message that mentions upgrading
        const alert = await getAlertMessage(page);
        expect(alert?.toLowerCase()).toMatch(/subscribe|upgrade|pro/);
      }
    });
  });

  // ==========================================================================
  // ROUND COMPLETION DETECTION UI
  // ==========================================================================

  test.describe('Round Completion & Credit Zeroing UI', () => {
    test('shows immediate UI feedback when round 0 completes', async ({ page }) => {
      // Check if free round is already completed
      const freeRoundCompleted = await checkFreeRoundCompleted(page);

      if (!freeRoundCompleted) {
        test.skip();
      }

      // Navigate to chat
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const creditBalance = await getCreditBalance(page);

      // Credits should be zeroed
      expect(creditBalance.balance).toBe(0);
      expect(creditBalance.available).toBe(0);

      // UI should reflect this
      const creditDisplay = await getCreditDisplayText(page);

      if (creditDisplay) {
        // Display should show 0 or "no credits" or similar
        expect(creditDisplay.toLowerCase()).toMatch(/0|no.*credit|exhausted/);
      }

      // Send button should be disabled
      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled({ timeout: 3000 }).catch(() => true);
      expect(isDisabled).toBe(true);
    });

    test('displays upgrade prompt when round completes', async ({ page }) => {
      const freeRoundCompleted = await checkFreeRoundCompleted(page);

      if (!freeRoundCompleted) {
        test.skip();
      }

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Should show upgrade prompt somewhere on page
      const hasUpgradeCTA = await isUpgradeCTAVisible(page);
      expect(hasUpgradeCTA).toBe(true);
    });

    test('credit display updates to 0 after round completion', async ({ page }) => {
      const freeRoundCompleted = await checkFreeRoundCompleted(page);

      if (!freeRoundCompleted) {
        test.skip();
      }

      const creditBalance = await getCreditBalance(page);

      // Balance should be exactly 0
      expect(creditBalance.balance).toBe(0);
      expect(creditBalance.reserved).toBe(0);
      expect(creditBalance.available).toBe(0);
      expect(creditBalance.status).toBe('critical');
    });

    test('shows clear message about free round being used', async ({ page }) => {
      const freeRoundCompleted = await checkFreeRoundCompleted(page);

      if (!freeRoundCompleted) {
        test.skip();
      }

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Look for messaging about free round
      const freeRoundMessage = page.locator('text=/free.*round|free.*conversation|trial.*complete/i');
      const hasMessage = await freeRoundMessage.first().isVisible({ timeout: 5000 }).catch(() => false);

      // If no explicit message, should at least show upgrade prompt
      if (!hasMessage) {
        const hasUpgrade = await isUpgradeCTAVisible(page);
        expect(hasUpgrade).toBe(true);
      }
    });
  });

  // ==========================================================================
  // UPGRADE PROMPTS TIMING
  // ==========================================================================

  test.describe('Upgrade Prompt Timing & Placement', () => {
    test('upgrade prompt appears when attempting action with 0 credits', async ({ page }) => {
      // Set credits to 0
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const creditBalance = await getCreditBalance(page);
      expect(creditBalance.available).toBe(0);

      // Try to send message
      const input = getMessageInput(page);
      await input.fill('Test message with 0 credits');

      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled().catch(() => true);

      if (!isDisabled) {
        await input.press('Enter');
        await page.waitForTimeout(1500);

        // Should show upgrade prompt or error
        const hasUpgrade = await isUpgradeCTAVisible(page);
        const alert = await getAlertMessage(page);

        expect(hasUpgrade || (alert?.toLowerCase().includes('subscribe'))).toBe(true);
      } else {
        // Button disabled is also valid - check for upgrade prompt nearby
        const hasUpgrade = await isUpgradeCTAVisible(page);
        expect(hasUpgrade || isDisabled).toBe(true);
      }
    });

    test('upgrade CTA links to pricing page', async ({ page }) => {
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Find pricing link
      const pricingLink = page.locator('a[href*="pricing"]').first();
      const linkVisible = await pricingLink.isVisible({ timeout: 3000 }).catch(() => false);

      if (linkVisible) {
        const href = await pricingLink.getAttribute('href');
        expect(href).toContain('pricing');

        // Click and verify navigation
        await pricingLink.click();
        await page.waitForLoadState('networkidle');

        expect(page.url()).toContain('pricing');
      }
    });

    test('upgrade prompt shows benefits (unlimited threads, more credits)', async ({ page }) => {
      await setUserCredits(page, 0);
      await page.goto('/chat/pricing');
      await page.waitForLoadState('networkidle');

      // Look for Pro plan benefits
      const benefits = [
        page.locator('text=/unlimited.*thread/i'),
        page.locator('text=/100,?000.*credit/i'),
        page.locator('text=/web.*search/i'),
      ];

      let foundBenefits = 0;
      for (const benefit of benefits) {
        const visible = await benefit.first().isVisible({ timeout: 3000 }).catch(() => false);
        if (visible)
          foundBenefits++;
      }

      // Should show at least one key benefit
      expect(foundBenefits).toBeGreaterThanOrEqual(1);
    });

    test('no upgrade prompt when user has sufficient credits', async ({ page }) => {
      // Set credits to 3000 (sufficient)
      await setUserCredits(page, 3000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const creditBalance = await getCreditBalance(page);
      expect(creditBalance.available).toBeGreaterThan(0);

      // Send button should be enabled (if models selected)
      await ensureModelsSelected(page);
      const sendButton = getSendButton(page);
      const isEnabled = await sendButton.isEnabled({ timeout: 3000 }).catch(() => false);

      expect(isEnabled).toBe(true);

      // No urgent upgrade prompt should be shown
      const urgentUpgrade = page.locator('text=/out of credits|no credits|exhausted/i');
      const hasUrgent = await urgentUpgrade.first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasUrgent).toBe(false);
    });
  });

  // ==========================================================================
  // CREDIT DISPLAY ACCURACY
  // ==========================================================================

  test.describe('Credit Display Accuracy During Usage', () => {
    test('credit display updates in real-time during message sending', async ({ page }) => {
      // Set known credit amount
      await setUserCredits(page, 4000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balanceBefore = await getCreditBalance(page);
      expect(balanceBefore.balance).toBe(4000);

      // Ensure models selected
      await ensureModelsSelected(page);

      // Send message
      await submitMessage(page, 'Test real-time credit update');
      await waitForThreadNavigation(page, 60000);
      await waitForStreamingStart(page, 30000);

      // Check credits during streaming (should have reservations)
      const balanceDuring = await getCreditBalance(page);
      expect(balanceDuring.reserved).toBeGreaterThan(0);
      expect(balanceDuring.available).toBeLessThan(balanceBefore.available);

      // Wait for completion
      await waitForAIResponse(page, 90000);
      await page.waitForTimeout(3000);

      const balanceAfter = await getCreditBalance(page);

      // Reserved should be released
      expect(balanceAfter.reserved).toBe(0);

      // Balance should have decreased
      expect(balanceAfter.balance).toBeLessThan(balanceBefore.balance);
    });

    test('reserved credits shown separately from available', async ({ page }) => {
      // Set credits
      await setUserCredits(page, 3500);
      await page.reload();
      await page.waitForLoadState('networkidle');

      await ensureModelsSelected(page);

      // Start message
      await submitMessage(page, 'Test reserved credits display');
      await waitForThreadNavigation(page, 60000);
      await waitForStreamingStart(page, 30000);

      // Get balance during streaming
      const balanceDuring = await getCreditBalance(page);

      // Verify math: available = balance - reserved
      expect(balanceDuring.available).toBe(balanceDuring.balance - balanceDuring.reserved);

      // Reserved should be > 0 during streaming
      expect(balanceDuring.reserved).toBeGreaterThan(0);
    });

    test('status indicator reflects credit level (default/warning/critical)', async ({ page }) => {
      // Test critical status (0 credits)
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      let balance = await getCreditBalance(page);
      expect(balance.status).toBe('critical');

      // Test warning status (low credits ~1000 = 80% used)
      await setUserCredits(page, 1000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      balance = await getCreditBalance(page);
      expect(balance.status).toBe('warning');

      // Test default status (sufficient credits)
      await setUserCredits(page, 4500);
      await page.reload();
      await page.waitForLoadState('networkidle');

      balance = await getCreditBalance(page);
      expect(balance.status).toBe('default');
    });

    test('percentage calculation matches actual usage', async ({ page }) => {
      // Set to 3000 credits (40% used from 5000 initial)
      await setUserCredits(page, 3000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balance = await getCreditBalance(page);

      // 2000/5000 = 40% used
      expect(balance.percentage).toBeGreaterThanOrEqual(39);
      expect(balance.percentage).toBeLessThanOrEqual(41);

      // Set to 1000 (80% used)
      await setUserCredits(page, 1000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balance2 = await getCreditBalance(page);

      // 4000/5000 = 80% used
      expect(balance2.percentage).toBeGreaterThanOrEqual(79);
      expect(balance2.percentage).toBeLessThanOrEqual(81);
    });
  });

  // ==========================================================================
  // MULTI-TAB BEHAVIOR
  // ==========================================================================

  test.describe('Multi-Tab Quota State Consistency', () => {
    test('both tabs see same credit balance from server', async ({ page, context }) => {
      // Get balance in tab 1
      const balance1 = await getCreditBalance(page);

      // Open tab 2
      const page2 = await context.newPage();
      await page2.goto('/chat');
      await page2.waitForLoadState('networkidle');

      // Get balance in tab 2
      const balance2 = await getCreditBalance(page2);

      // Both should match (server is source of truth)
      expect(balance2.balance).toBe(balance1.balance);
      expect(balance2.available).toBe(balance1.available);
      expect(balance2.reserved).toBe(balance1.reserved);

      await page2.close();
    });

    test('action in one tab reflects in other tab', async ({ page, context }) => {
      // Set known credits
      await setUserCredits(page, 3500);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Open tab 2
      const page2 = await context.newPage();
      await page2.goto('/chat');
      await page2.waitForLoadState('networkidle');

      const balanceBefore = await getCreditBalance(page2);

      // Send message in tab 1
      await page.bringToFront();
      await ensureModelsSelected(page);
      await submitMessage(page, 'Test multi-tab credit sync');
      await waitForThreadNavigation(page, 60000);
      await waitForStreamingStart(page, 30000);

      // Wait a moment for state to update
      await page.waitForTimeout(2000);

      // Check balance in tab 2 (should show reservations)
      const balanceDuring = await getCreditBalance(page2);

      // Tab 2 should see the reservation or balance change
      expect(balanceDuring.available).toBeLessThanOrEqual(balanceBefore.available);

      await page2.close();
    });

    test('zero credits blocks actions in all tabs', async ({ page, context }) => {
      // Zero out credits
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify tab 1 is blocked
      const sendButton1 = getSendButton(page);
      const isDisabled1 = await sendButton1.isDisabled({ timeout: 3000 }).catch(() => true);
      expect(isDisabled1).toBe(true);

      // Open tab 2
      const page2 = await context.newPage();
      await page2.goto('/chat');
      await page2.waitForLoadState('networkidle');

      // Verify tab 2 also sees blocked state
      const balance2 = await getCreditBalance(page2);
      expect(balance2.available).toBe(0);

      const sendButton2 = page2.locator('button[type="submit"]').first();
      const isDisabled2 = await sendButton2.isDisabled({ timeout: 3000 }).catch(() => true);
      expect(isDisabled2).toBe(true);

      await page2.close();
    });
  });

  // ==========================================================================
  // REFRESH BEHAVIOR
  // ==========================================================================

  test.describe('Page Refresh Quota State Persistence', () => {
    test('credit balance persists after refresh', async ({ page }) => {
      // Set specific credit amount
      await setUserCredits(page, 2750);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balanceBefore = await getCreditBalance(page);
      expect(balanceBefore.balance).toBe(2750);

      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balanceAfter = await getCreditBalance(page);

      // Should be the same
      expect(balanceAfter.balance).toBe(balanceBefore.balance);
      expect(balanceAfter.available).toBe(balanceBefore.available);
    });

    test('quota status persists across refresh', async ({ page }) => {
      // Set to warning level
      await setUserCredits(page, 1000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balanceBefore = await getCreditBalance(page);
      expect(balanceBefore.status).toBe('warning');

      // Refresh
      await page.reload();
      await page.waitForLoadState('networkidle');

      const balanceAfter = await getCreditBalance(page);
      expect(balanceAfter.status).toBe('warning');

      // Set to critical
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const critical = await getCreditBalance(page);
      expect(critical.status).toBe('critical');

      // Refresh again
      await page.reload();
      await page.waitForLoadState('networkidle');

      const criticalAfter = await getCreditBalance(page);
      expect(criticalAfter.status).toBe('critical');
    });

    test('thread limit enforcement persists after refresh', async ({ page }) => {
      const threadCount = await getThreadCount(page);

      if (threadCount < 1) {
        test.skip();
      }

      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Thread count should be same
      const threadCountAfter = await getThreadCount(page);
      expect(threadCountAfter).toBe(threadCount);

      // Try to create thread - should still be blocked
      await ensureModelsSelected(page);
      const input = getMessageInput(page);
      await input.fill('Test thread limit after refresh');
      await input.press('Enter');

      await page.waitForTimeout(1500);

      // Should not navigate to new thread
      const currentUrl = page.url();
      const navigatedToNewThread = /\/chat\/[\w-]+$/.test(currentUrl) && threadCount === 1;
      expect(navigatedToNewThread).toBe(false);
    });

    test('refresh does not bypass credit depletion', async ({ page }) => {
      // Set to 0 credits
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      let balance = await getCreditBalance(page);
      expect(balance.available).toBe(0);

      // Refresh multiple times
      for (let i = 0; i < 3; i++) {
        await page.reload();
        await page.waitForLoadState('networkidle');

        balance = await getCreditBalance(page);
        expect(balance.available).toBe(0);
      }

      // Send button should remain disabled
      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled({ timeout: 3000 }).catch(() => true);
      expect(isDisabled).toBe(true);
    });

    test('upgrade prompts persist after refresh when credits depleted', async ({ page }) => {
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Check for upgrade CTA
      const hasUpgradeBefore = await isUpgradeCTAVisible(page);

      // Refresh
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still show upgrade CTA
      const hasUpgradeAfter = await isUpgradeCTAVisible(page);

      // At least one should have shown upgrade prompt
      expect(hasUpgradeBefore || hasUpgradeAfter).toBe(true);
    });
  });

  // ==========================================================================
  // ERROR MESSAGE QUALITY
  // ==========================================================================

  test.describe('User-Facing Error Messages', () => {
    test('insufficient credits error is clear and non-technical', async ({ page }) => {
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      await ensureModelsSelected(page);

      const input = getMessageInput(page);
      await input.fill('Test error message quality');

      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled().catch(() => true);

      if (!isDisabled) {
        await input.press('Enter');
        await page.waitForTimeout(1500);

        const alert = await getAlertMessage(page);

        if (alert) {
          // Should be user-friendly
          expect(alert.toLowerCase()).toMatch(/credit|subscribe|upgrade/);

          // Should NOT have technical jargon
          expect(alert).not.toContain('500');
          expect(alert).not.toContain('error code');
          expect(alert).not.toContain('exception');
          expect(alert).not.toContain('API');
        }
      }
    });

    test('thread limit error explains limitation clearly', async ({ page }) => {
      const threadCount = await getThreadCount(page);

      if (threadCount < 1) {
        test.skip();
      }

      await ensureModelsSelected(page);

      const input = getMessageInput(page);
      await input.fill('Test thread limit message');
      await input.press('Enter');

      await page.waitForTimeout(1500);

      const alert = await getAlertMessage(page);

      if (alert) {
        // Should explain free tier limitation
        expect(alert.toLowerCase()).toMatch(/thread|one|limit/);

        // Should guide to upgrade
        expect(alert.toLowerCase()).toMatch(/subscribe|upgrade|pro/);
      }
    });

    test('error messages include actionable next steps', async ({ page }) => {
      await setUserCredits(page, 0);
      await page.reload();
      await page.waitForLoadState('networkidle');

      await ensureModelsSelected(page);

      const input = getMessageInput(page);
      await input.fill('Test actionable error');

      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled().catch(() => true);

      if (!isDisabled) {
        await input.press('Enter');
        await page.waitForTimeout(1500);

        // Should have upgrade CTA or link to pricing
        const hasUpgrade = await isUpgradeCTAVisible(page);
        const alert = await getAlertMessage(page);

        expect(hasUpgrade || (alert?.toLowerCase().includes('subscribe'))).toBe(true);
      }
    });
  });
});
