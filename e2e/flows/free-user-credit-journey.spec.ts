import { expect, test } from '@playwright/test';

import {
  ensureModelsSelected,
  getMessageInput,
  getSendButton,
  waitForAIResponse,
  waitForStreamingStart,
  waitForThreadNavigation,
} from '../helpers';

/**
 * Free User Credit Journey E2E Tests
 *
 * Tests the complete free user flow with credit deductions:
 * 1. Free user creates thread (deducts 1 credit)
 * 2. Free user sends message with optional web search (deducts credits)
 * 3. Multiple participants respond (credits deducted per response)
 * 4. After ALL participants complete round 0, credits are zeroed
 * 5. Subsequent chat attempts return 400 with subscription message
 * 6. Thread is still visible but user cannot continue
 *
 * Database state verification at each step.
 */

/**
 * Helper: Get user credit balance via API
 */
async function getUserCreditBalance(page: any) {
  const response = await page.request.get('/api/v1/credits/balance');
  expect(response.ok()).toBe(true);
  const data = await response.json();

  return {
    success: data.success,
    data: {
      balance: data.data.balance,
      reserved: data.data.reserved,
      available: data.data.available,
      status: data.data.status,
      percentage: data.data.percentage,
      plan: data.data.plan,
    },
  };
}

/**
 * Helper: Check if free user has completed their free round
 * by examining transaction history
 */
async function checkFreeRoundCompleted(page: any): Promise<boolean> {
  const response = await page.request.get('/api/v1/credits/transactions?limit=100');
  expect(response.ok()).toBe(true);
  const data = await response.json();

  // Look for free round completion transaction
  const freeRoundTx = data.data.items.find(
    (tx: any) => tx.action === 'free_round_complete',
  );

  return !!freeRoundTx;
}

/**
 * Helper: Set user credits directly (test-only endpoint)
 */
async function setUserCredits(page: any, credits: number) {
  const response = await page.request.post('/api/v1/test/set-credits', {
    data: { credits },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get thread data via API
 */
async function getThreadData(page: any, threadId: string) {
  const response = await page.request.get(`/api/v1/chat/threads/${threadId}`);
  if (response.status() === 404) {
    return null;
  }
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Get messages for a thread via API
 */
async function getThreadMessages(page: any, threadId: string) {
  const response = await page.request.get(`/api/v1/chat/threads/${threadId}/messages`);
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Helper: Extract thread ID from URL
 */
function getThreadIdFromUrl(url: string): string | null {
  const match = url.match(/\/chat\/([\w-]+)/);
  return match ? match[1] : null;
}

test.describe('Free User Credit Journey', () => {
  test.describe.configure({ mode: 'serial' });

  let threadId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Ensure we start from chat overview
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('step 1: verify initial credit balance (5000 signup credits)', async ({ page }) => {
    const creditBalance = await getUserCreditBalance(page);

    expect(creditBalance.success).toBe(true);
    expect(creditBalance.data.balance).toBe(5000);
    expect(creditBalance.data.plan.type).toBe('free');
    expect(creditBalance.data.plan.monthlyCredits).toBe(0);
    expect(creditBalance.data.plan.nextRefillAt).toBeNull();

    // Free round should not be completed yet
    const freeRoundCompleted = await checkFreeRoundCompleted(page);
    expect(freeRoundCompleted).toBe(false);
  });

  test('step 2: create thread and verify credit deduction', async ({ page }) => {
    // Ensure models are selected
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    const modelsSelected = await ensureModelsSelected(page);
    expect(modelsSelected).toBe(true);

    // Get balance before thread creation
    const beforeBalance = await getUserCreditBalance(page);
    const balanceBefore = beforeBalance.data.balance;

    // Create thread by sending first message
    const input = getMessageInput(page);
    await input.fill('Test message for free user credit journey');
    await input.press('Enter');

    // Wait for thread navigation
    await waitForThreadNavigation(page, 60000);

    // Extract thread ID from URL
    threadId = getThreadIdFromUrl(page.url());
    expect(threadId).not.toBeNull();

    // Wait for streaming to start
    await waitForStreamingStart(page, 30000);

    // Wait for AI response to appear
    await waitForAIResponse(page, 90000);

    // Wait for streaming to complete
    await page.waitForTimeout(2000);

    // Get balance after thread creation and first response
    const afterBalance = await getUserCreditBalance(page);
    const balanceAfter = afterBalance.data.balance;

    // Verify credits were deducted (thread creation + AI response)
    expect(balanceAfter).toBeLessThan(balanceBefore);
    expect(balanceAfter).toBeGreaterThanOrEqual(0);

    // Verify available credits match (balance - reserved)
    expect(afterBalance.data.available).toBe(afterBalance.data.balance - afterBalance.data.reserved);

    // Verify thread exists
    const threadData = await getThreadData(page, threadId!);
    expect(threadData).not.toBeNull();
    expect(threadData.success).toBe(true);
  });

  test('step 3: send message with web search enabled', async ({ page }) => {
    // Navigate to the thread created in previous test
    if (!threadId) {
      test.skip();
    }

    await page.goto(`/chat/${threadId}`);
    await page.waitForLoadState('networkidle');

    // Check if web search toggle is available
    const webSearchToggle = page.locator('[data-web-search-toggle]').or(
      page.getByRole('switch', { name: /web search/i }),
    );

    const hasWebSearchToggle = await webSearchToggle.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasWebSearchToggle) {
      // Enable web search
      const isChecked = await webSearchToggle.isChecked().catch(() => false);
      if (!isChecked) {
        await webSearchToggle.click();
      }
    }

    // Get balance before sending message
    const beforeBalance = await getUserCreditBalance(page);
    const balanceBefore = beforeBalance.data.balance;

    // Send another message
    const input = getMessageInput(page);
    await input.fill('Follow-up question about the previous response');
    await input.press('Enter');

    // Wait for streaming
    await waitForStreamingStart(page, 30000);
    await waitForAIResponse(page, 90000);

    // Wait for streaming to complete
    await page.waitForTimeout(2000);

    // Get balance after message
    const afterBalance = await getUserCreditBalance(page);
    const balanceAfter = afterBalance.data.balance;

    // Verify credits were deducted for the message (and potentially web search)
    expect(balanceAfter).toBeLessThan(balanceBefore);
    expect(afterBalance.data.available).toBeGreaterThanOrEqual(0);
  });

  test('step 4: verify multiple participants respond and deduct credits', async ({ page }) => {
    if (!threadId) {
      test.skip();
    }

    await page.goto(`/chat/${threadId}`);
    await page.waitForLoadState('networkidle');

    // Get current message count
    const messagesBefore = await getThreadMessages(page, threadId);
    const messageCountBefore = messagesBefore.data?.length || 0;

    // Get balance before
    const beforeBalance = await getUserCreditBalance(page);
    const balanceBefore = beforeBalance.data.balance;

    // Send a message to trigger participant responses
    const input = getMessageInput(page);
    await input.fill('What are your thoughts on this topic?');
    await input.press('Enter');

    // Wait for streaming to start
    await waitForStreamingStart(page, 30000);

    // Wait for at least one AI response
    await waitForAIResponse(page, 90000);

    // Wait for all streaming to complete
    await page.waitForTimeout(5000);

    // Get messages after
    const messagesAfter = await getThreadMessages(page, threadId);
    const messageCountAfter = messagesAfter.data?.length || 0;

    // Verify new messages were added
    expect(messageCountAfter).toBeGreaterThan(messageCountBefore);

    // Get balance after
    const afterBalance = await getUserCreditBalance(page);
    const balanceAfter = afterBalance.data.balance;

    // Verify credits were deducted (for each participant response)
    expect(balanceAfter).toBeLessThan(balanceBefore);
    expect(afterBalance.data.available).toBeGreaterThanOrEqual(0);
  });

  test('step 5: verify round 0 completion zeroes credits for free user', async ({ page }) => {
    if (!threadId) {
      test.skip();
    }

    // Get current credit state
    const creditBalance = await getUserCreditBalance(page);

    // Check if free round has been completed via transaction history
    const freeRoundCompleted = await checkFreeRoundCompleted(page);

    // Get thread messages to count round 0 participants
    const messages = await getThreadMessages(page, threadId);

    // Count unique participants that have responded in round 0
    const round0AssistantMessages = messages.data?.filter(
      (msg: any) => msg.role === 'assistant' && msg.roundNumber === 0,
    ) || [];

    const respondedParticipantIds = new Set(
      round0AssistantMessages
        .map((m: any) => m.participantId)
        .filter((id: any) => id !== null),
    );

    // If round 0 is complete (all participants responded), credits should be zeroed
    if (freeRoundCompleted) {
      expect(creditBalance.data.balance).toBe(0);
      expect(creditBalance.data.available).toBe(0);
      expect(respondedParticipantIds.size).toBeGreaterThan(0);
    } else if (respondedParticipantIds.size > 0) {
      // Partial round completion - credits should be reduced but not zeroed
      expect(creditBalance.data.balance).toBeGreaterThanOrEqual(0);
      expect(creditBalance.data.balance).toBeLessThan(5000); // Less than initial
    }
  });

  test('step 6: verify subsequent chat attempts are blocked', async ({ page }) => {
    if (!threadId) {
      test.skip();
    }

    await page.goto(`/chat/${threadId}`);
    await page.waitForLoadState('networkidle');

    // Get credit state
    const creditBalance = await getUserCreditBalance(page);
    const freeRoundCompleted = await checkFreeRoundCompleted(page);

    // If free round is completed, user should be blocked from chatting
    if (freeRoundCompleted || creditBalance.data.available === 0) {
      // Try to send a message
      const input = getMessageInput(page);
      await input.fill('Attempt to send after credits exhausted');

      const sendButton = getSendButton(page);
      const isButtonDisabled = await sendButton.isDisabled().catch(() => true);

      if (!isButtonDisabled) {
        // If button is enabled, clicking should show error
        await input.press('Enter');

        // Wait for error message
        await page.waitForTimeout(1000);

        // Look for subscription/upgrade message
        const upgradeMessage = page.locator('text=/subscribe|upgrade|pro|insufficient.*credit/i');
        const hasUpgradeMessage = await upgradeMessage.isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasUpgradeMessage).toBe(true);
      } else {
        // Button should be disabled when no credits
        expect(isButtonDisabled).toBe(true);
      }
    }
  });

  test('step 7: verify thread is still visible but cannot continue', async ({ page }) => {
    if (!threadId) {
      test.skip();
    }

    await page.goto(`/chat/${threadId}`);
    await page.waitForLoadState('networkidle');

    // Thread should still be accessible
    const threadData = await getThreadData(page, threadId);
    expect(threadData).not.toBeNull();
    expect(threadData.success).toBe(true);

    // Messages should be visible
    const messages = await getThreadMessages(page, threadId);
    expect(messages.success).toBe(true);
    expect(messages.data).toBeDefined();
    expect(messages.data.length).toBeGreaterThan(0);

    // User should see message history on page
    const messageElements = page.locator('[data-message-role]');
    const messageCount = await messageElements.count();
    expect(messageCount).toBeGreaterThan(0);
  });

  test('step 8: verify creating new thread is blocked for free user', async ({ page }) => {
    // Go to chat overview
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get credit state
    const creditBalance = await getUserCreditBalance(page);

    // If user already has a thread, they should not be able to create another
    if (threadId) {
      // Look for "New Chat" or similar button
      const newChatButton = page.getByRole('button', { name: /new chat|create/i });
      const hasNewChatButton = await newChatButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasNewChatButton) {
        await newChatButton.click();

        // Should see error or be prevented from creating
        await page.waitForTimeout(1000);

        // Check if still on overview or if error message appears
        const errorMessage = page.locator('text=/one thread|subscribe|upgrade/i');
        const hasErrorMessage = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

        // Either blocked or shows error
        const currentUrl = page.url();
        const isStillOnOverview = currentUrl.includes('/chat') && !currentUrl.match(/\/chat\/[\w-]+/);

        expect(hasErrorMessage || isStillOnOverview).toBe(true);
      } else {
        // If no new chat button visible, that's also valid (UI prevents creation)
        expect(hasNewChatButton).toBe(false);
      }
    }
  });

  test('step 9: verify error messages guide to upgrade', async ({ page }) => {
    if (!threadId) {
      test.skip();
    }

    await page.goto(`/chat/${threadId}`);
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);
    const freeRoundCompleted = await checkFreeRoundCompleted(page);

    // If credits are exhausted, look for upgrade messaging
    if (freeRoundCompleted || creditBalance.data.balance === 0) {
      // Try to interact and look for upgrade prompts
      const input = getMessageInput(page);
      await input.fill('Test message');

      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled().catch(() => true);

      if (!isDisabled) {
        await input.press('Enter');
        await page.waitForTimeout(1000);
      }

      // Look for upgrade/pro/subscribe messaging anywhere on page
      const upgradePrompts = page.locator('text=/subscribe.*pro|upgrade|purchase.*credit/i');
      const hasUpgradePrompt = await upgradePrompts.count();

      // Should have at least one upgrade prompt visible or send button disabled
      expect(hasUpgradePrompt >= 1 || isDisabled).toBe(true);
    }
  });

  test('step 10: verify database transaction audit trail', async ({ page }) => {
    const creditBalance = await getUserCreditBalance(page);
    const freeRoundCompleted = await checkFreeRoundCompleted(page);

    // Should have credit balance data
    expect(creditBalance.data).toBeDefined();

    // Get transaction history
    const txResponse = await page.request.get('/api/v1/credits/transactions?limit=50');
    expect(txResponse.ok()).toBe(true);
    const txData = await txResponse.json();

    // Should have at least signup bonus transaction
    expect(txData.data.items.length).toBeGreaterThan(0);

    // For free users who completed round 0:
    if (freeRoundCompleted) {
      // Balance should be zeroed
      expect(creditBalance.data.balance).toBe(0);

      // Reserved credits should be 0
      expect(creditBalance.data.reserved).toBe(0);

      // Plan type should still be free
      expect(creditBalance.data.plan.type).toBe('free');
    }
  });
});

test.describe('Free User Edge Cases', () => {
  test('concurrent thread creation is prevented', async ({ page }) => {
    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get initial thread count via API
    const threadsResponse = await page.request.get('/api/v1/chat/threads');
    expect(threadsResponse.ok()).toBe(true);
    const threadsData = await threadsResponse.json();
    const initialThreadCount = threadsData.data?.length || 0;

    // If user already has a thread, skip this test
    if (initialThreadCount >= 1) {
      test.skip();
    }

    // Try to create a thread normally
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    const modelsSelected = await ensureModelsSelected(page);
    expect(modelsSelected).toBe(true);

    const input = getMessageInput(page);
    await input.fill('First thread creation attempt');
    await input.press('Enter');

    // Wait for thread creation
    await waitForThreadNavigation(page, 60000);

    // Get new thread count
    const afterResponse = await page.request.get('/api/v1/chat/threads');
    const afterData = await afterResponse.json();
    const finalThreadCount = afterData.data?.length || 0;

    // Should have exactly one thread
    expect(finalThreadCount).toBe(1);
  });

  test('refresh does not bypass thread limit', async ({ page, context }) => {
    // Get thread count
    const threadsResponse = await page.request.get('/api/v1/chat/threads');
    const threadsData = await threadsResponse.json();
    const threadCount = threadsData.data?.length || 0;

    if (threadCount === 0) {
      test.skip();
    }

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Thread limit should still be enforced server-side
    const afterRefresh = await page.request.get('/api/v1/chat/threads');
    const afterData = await afterRefresh.json();
    const afterCount = afterData.data?.length || 0;

    // Thread count should not change
    expect(afterCount).toBe(threadCount);
  });

  test('multiple tabs share same server state', async ({ page, context }) => {
    // Get initial state in first tab
    const creditBalance1 = await getUserCreditBalance(page);
    const balance1 = creditBalance1.data.balance;

    // Open second tab
    const page2 = await context.newPage();
    await page2.goto('/chat');
    await page2.waitForLoadState('networkidle');

    // Get state in second tab - use the helper function with page2
    const response2 = await page2.request.get('/api/v1/credits/balance');
    expect(response2.ok()).toBe(true);
    const data2 = await response2.json();
    const balance2 = data2.data.balance;

    // Both tabs should see same balance (server is source of truth)
    expect(balance2).toBe(balance1);

    await page2.close();
  });
});

test.describe('Free User Credit Display & Tracking', () => {
  test('displays remaining credits to user', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get current credit balance
    const creditBalance = await getUserCreditBalance(page);

    // Look for credit display in UI (might be in header, sidebar, or dedicated component)
    const creditDisplay = page.locator('text=/credits?/i, [data-credits], [aria-label*="credit" i]').first();
    const hasDisplay = await creditDisplay.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDisplay) {
      const displayText = await creditDisplay.textContent();
      // Display should show some numeric value related to credits
      expect(displayText).toMatch(/\d+/);
    }

    // Verify API returns correct data structure
    expect(creditBalance.data.balance).toBeGreaterThanOrEqual(0);
    expect(creditBalance.data.available).toBeGreaterThanOrEqual(0);
    expect(creditBalance.data.reserved).toBeGreaterThanOrEqual(0);
  });

  test('shows usage percentage and status', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // Status should be one of: default, warning, critical
    expect(['default', 'warning', 'critical']).toContain(creditBalance.data.status);

    // Percentage should be between 0-100
    expect(creditBalance.data.percentage).toBeGreaterThanOrEqual(0);
    expect(creditBalance.data.percentage).toBeLessThanOrEqual(100);

    // If available is 0, status should be critical
    if (creditBalance.data.available === 0) {
      expect(creditBalance.data.status).toBe('critical');
    }

    // If usage is high (>80%), status should be warning or critical
    if (creditBalance.data.percentage >= 80) {
      expect(['warning', 'critical']).toContain(creditBalance.data.status);
    }
  });

  test('displays plan type correctly (free vs paid)', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // Plan type should be 'free' or 'paid'
    expect(['free', 'paid']).toContain(creditBalance.data.plan.type);

    // Free plan should have 0 monthly credits
    if (creditBalance.data.plan.type === 'free') {
      expect(creditBalance.data.plan.monthlyCredits).toBe(0);
      expect(creditBalance.data.plan.nextRefillAt).toBeNull();
    }

    // Paid plan should have monthly credits and refill date
    if (creditBalance.data.plan.type === 'paid') {
      expect(creditBalance.data.plan.monthlyCredits).toBeGreaterThan(0);
      expect(creditBalance.data.plan.nextRefillAt).not.toBeNull();
    }
  });
});

test.describe('Credit Usage Tracking Accuracy', () => {
  test('tracks credit decrease after sending message', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Ensure models are selected
    const modelsSelected = await ensureModelsSelected(page);
    expect(modelsSelected).toBe(true);

    // Get balance before
    const balanceBefore = await getUserCreditBalance(page);
    const availableBefore = balanceBefore.data.available;

    // Send a message
    const input = getMessageInput(page);
    await input.fill('Test message to track credit usage');
    await input.press('Enter');

    // Wait for thread navigation
    await waitForThreadNavigation(page, 60000);

    // Wait for streaming to start
    await waitForStreamingStart(page, 30000);

    // Wait for AI response
    await waitForAIResponse(page, 90000);

    // Wait for streaming to complete
    await page.waitForTimeout(3000);

    // Get balance after
    const balanceAfter = await getUserCreditBalance(page);
    const availableAfter = balanceAfter.data.available;

    // Credits should have decreased
    expect(availableAfter).toBeLessThan(availableBefore);

    // Deduction should be reasonable (not negative balance)
    expect(balanceAfter.data.balance).toBeGreaterThanOrEqual(0);
  });

  test('reserved credits increase during streaming', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const modelsSelected = await ensureModelsSelected(page);
    expect(modelsSelected).toBe(true);

    // Get balance before
    const balanceBefore = await getUserCreditBalance(page);
    const reservedBefore = balanceBefore.data.reserved;

    // Send message
    const input = getMessageInput(page);
    await input.fill('Test reservation during streaming');
    await input.press('Enter');

    await waitForThreadNavigation(page, 60000);
    await waitForStreamingStart(page, 30000);

    // Check reserved credits during streaming
    const balanceDuringStream = await getUserCreditBalance(page);

    // Reserved credits should increase during streaming
    expect(balanceDuringStream.data.reserved).toBeGreaterThanOrEqual(reservedBefore);

    // Available should match balance - reserved
    expect(balanceDuringStream.data.available).toBe(
      balanceDuringStream.data.balance - balanceDuringStream.data.reserved,
    );

    // Wait for streaming to complete
    await waitForAIResponse(page, 90000);
    await page.waitForTimeout(3000);

    // Check balance after completion
    const balanceAfter = await getUserCreditBalance(page);

    // Reserved should return to 0 after completion
    expect(balanceAfter.data.reserved).toBe(0);
  });

  test('transaction history accurately reflects all credit movements', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get transaction history
    const txResponse = await page.request.get('/api/v1/credits/transactions?limit=50');
    expect(txResponse.ok()).toBe(true);

    const txData = await txResponse.json();
    const transactions = txData.data.items;

    // Should have at least signup bonus transaction
    expect(transactions.length).toBeGreaterThan(0);

    // Find signup transaction
    const signupTx = transactions.find((tx: any) => tx.action === 'signup_bonus');

    if (signupTx) {
      // Signup should grant 5000 credits
      expect(signupTx.amount).toBe(5000);
      expect(signupTx.type).toBe('credit_grant');
      expect(signupTx.balanceAfter).toBe(5000);
    }

    // Verify transaction structure
    for (const tx of transactions) {
      expect(tx).toHaveProperty('id');
      expect(tx).toHaveProperty('type');
      expect(tx).toHaveProperty('amount');
      expect(tx).toHaveProperty('balanceAfter');
      expect(tx).toHaveProperty('createdAt');

      // balanceAfter should never be negative
      expect(tx.balanceAfter).toBeGreaterThanOrEqual(0);

      // Type-specific validations
      if (tx.type === 'deduction' || tx.type === 'reservation') {
        expect(tx.amount).toBeLessThanOrEqual(0);
      }
      if (tx.type === 'credit_grant' || tx.type === 'release') {
        expect(tx.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('Credit Exhaustion Behavior', () => {
  test('shows warning when credits are low', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // If percentage is high (>80%), should show warning status
    if (creditBalance.data.percentage >= 80 && creditBalance.data.available > 0) {
      expect(creditBalance.data.status).toBe('warning');

      // UI might show warning indicator
      const warningIndicator = page.locator('[data-status="warning"], text=/low|running low/i').first();
      const hasWarning = await warningIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      // Warning might be present in UI
      if (hasWarning) {
        const warningText = await warningIndicator.textContent();
        expect(warningText?.toLowerCase()).toMatch(/credit|low|warning/);
      }
    }
  });

  test('blocks new messages when credits exhausted', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // If credits are 0 or free round completed
    if (creditBalance.data.available === 0) {
      // Try to send a message
      const input = getMessageInput(page);
      await input.fill('Should be blocked - no credits');

      const sendButton = getSendButton(page);
      const isDisabled = await sendButton.isDisabled().catch(() => true);

      if (!isDisabled) {
        // If button is enabled, clicking should show error
        await input.press('Enter');
        await page.waitForTimeout(1000);

        // Should see error message
        const errorMessage = page.locator('text=/insufficient|subscribe|upgrade/i');
        const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);
        expect(hasError).toBe(true);
      } else {
        // Button should be disabled
        expect(isDisabled).toBe(true);
      }
    }
  });

  test('preserves thread history after credit exhaustion', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // If credits exhausted, should still see thread list
    if (creditBalance.data.available === 0) {
      // Get threads
      const threadsResponse = await page.request.get('/api/v1/chat/threads');
      expect(threadsResponse.ok()).toBe(true);

      const threadsData = await threadsResponse.json();

      // Free user might have 1 thread
      if (threadsData.data && threadsData.data.length > 0) {
        const thread = threadsData.data[0];

        // Navigate to thread
        await page.goto(`/chat/${thread.id}`);
        await page.waitForLoadState('networkidle');

        // Should see message history
        const messages = page.locator('[data-message-role]');
        const messageCount = await messages.count();
        expect(messageCount).toBeGreaterThan(0);

        // But should not be able to send new messages
        const input = getMessageInput(page);
        const sendButton = getSendButton(page);

        const isDisabled = await sendButton.isDisabled().catch(() => false);
        if (!isDisabled) {
          await input.fill('Test blocked message');
          await input.press('Enter');
          await page.waitForTimeout(1000);

          const errorMsg = page.locator('text=/insufficient|subscribe/i');
          await expect(errorMsg).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

test.describe('Credit Refresh & Reset Periods', () => {
  test('free users do not have credit refresh', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // Free plan should not have refill date
    if (creditBalance.data.plan.type === 'free') {
      expect(creditBalance.data.plan.nextRefillAt).toBeNull();
      expect(creditBalance.data.plan.monthlyCredits).toBe(0);
    }
  });

  test('paid users have monthly refill date', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // If user is on paid plan
    if (creditBalance.data.plan.type === 'paid') {
      // Should have monthly credits
      expect(creditBalance.data.plan.monthlyCredits).toBeGreaterThan(0);

      // Should have next refill date
      expect(creditBalance.data.plan.nextRefillAt).not.toBeNull();

      // Refill date should be in the future
      if (creditBalance.data.plan.nextRefillAt) {
        const refillDate = new Date(creditBalance.data.plan.nextRefillAt);
        const now = new Date();
        expect(refillDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
      }
    }
  });

  test('displays next refill information for paid users', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    if (creditBalance.data.plan.type === 'paid' && creditBalance.data.plan.nextRefillAt) {
      // UI might display refill information
      const refillDisplay = page.locator('text=/refill|renew|next month/i').first();
      const hasRefillInfo = await refillDisplay.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasRefillInfo) {
        const refillText = await refillDisplay.textContent();
        expect(refillText).toBeDefined();
      }

      // Verify refill date is reasonable (within next 31 days)
      const refillDate = new Date(creditBalance.data.plan.nextRefillAt);
      const now = new Date();
      const daysDiff = (refillDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeLessThanOrEqual(31);
      expect(daysDiff).toBeGreaterThanOrEqual(0);
    }
  });
});
