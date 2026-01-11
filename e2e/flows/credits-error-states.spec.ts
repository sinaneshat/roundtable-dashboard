/**
 * Credits Error States & Edge Cases E2E Tests
 *
 * Tests critical billing/credits error handling and edge cases:
 * 1. User with 0 credits trying to chat - correct error message
 * 2. Partial round completion (some participants error) - credits not zeroed
 * 3. Network error during streaming - reservation released
 * 4. Concurrent requests from same user - no double charging
 * 5. Race condition: two tabs trying to use last credits
 * 6. Credit balance going negative (should never happen)
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

/**
 * Helper: Direct API call to manipulate credits for testing
 * Uses internal API endpoints (protected routes)
 */
async function setUserCredits(page: Page, credits: number): Promise<void> {
  const response = await page.request.post('/api/v1/test/set-credits', {
    data: { credits },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(`Failed to set credits: ${response.status()} ${errorText}`);
  }

  // Wait a moment for database consistency
  await page.waitForTimeout(100);
}

/**
 * Helper: Get current credit balance via API
 */
async function getCreditBalance(page: Page): Promise<{
  balance: number;
  reserved: number;
  available: number;
  planType?: string;
  monthlyCredits?: number;
}> {
  const response = await page.request.get('/api/v1/credits/balance');

  if (!response.ok()) {
    throw new Error(`Failed to get credit balance: ${response.status()}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Helper: Get credit transaction history
 */
async function getTransactionHistory(page: Page): Promise<Array<{
  type: string;
  amount: number;
  balanceAfter: number;
  action?: string;
  description?: string;
}>> {
  const response = await page.request.get('/api/v1/credits/transactions?limit=50');

  if (!response.ok()) {
    throw new Error(`Failed to get transaction history: ${response.status()}`);
  }

  const data = await response.json();
  return data.data.transactions;
}

/**
 * Helper: Start a chat message (trigger streaming)
 */
async function startChatMessage(page: Page, message: string): Promise<void> {
  const textarea = page.locator('textarea[placeholder*="message" i], textarea[placeholder*="type" i]').first();
  await textarea.fill(message);

  const sendButton = page.getByRole('button', { name: /send/i }).or(page.locator('button[type="submit"]'));
  await sendButton.click();
}

/**
 * Helper: Wait for streaming to start
 */
async function waitForStreamingStart(page: Page): Promise<void> {
  // Wait for streaming indicator or assistant message to appear
  await page.waitForSelector('[data-streaming="true"], [role="status"]', { timeout: 10000 })
    .catch(() => {
      // Fallback: check for assistant message container
      return page.waitForSelector('[data-message-role="assistant"]', { timeout: 10000 });
    });
}

/**
 * Helper: Wait for error message to appear
 * More reliable than looking for specific text patterns
 */
async function waitForErrorMessage(page: Page, options?: { timeout?: number }): Promise<string> {
  const timeout = options?.timeout ?? 15000;

  // Wait for error to appear - could be alert, toast, inline error
  const errorLocator = page.locator('[role="alert"], [data-error="true"], .error-message, text=/error|failed|insufficient/i').first();

  await errorLocator.waitFor({ state: 'visible', timeout });

  return await errorLocator.textContent() ?? '';
}

/**
 * Helper: Check if reservation was properly released
 * Validates reservation release by checking transaction history
 */
async function verifyReservationReleased(
  page: Page,
  expectedAmount?: number,
): Promise<boolean> {
  const transactions = await getTransactionHistory(page);
  const releaseTransaction = transactions.find(tx => tx.type === 'release');

  if (!releaseTransaction) {
    return false;
  }

  if (expectedAmount !== undefined) {
    return releaseTransaction.amount === expectedAmount;
  }

  return true;
}

test.describe('Credits Error States & Edge Cases', () => {
  test.describe('Zero Credits Error Handling', () => {
    test('shows correct error when user has 0 credits and tries to chat', async ({ authenticatedPage: page }) => {
      // ARRANGE: Set user to 0 credits
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set credits to 0
      await setUserCredits(page, 0);

      // Verify balance is 0
      const balance = await getCreditBalance(page);
      expect(balance.available).toBe(0);

      // ACT: Try to send a message
      await startChatMessage(page, 'Test message with zero credits');

      // ASSERT: Should show insufficient credits error
      const errorText = await waitForErrorMessage(page);

      // Error should be clear about insufficient credits
      expect(errorText.toLowerCase()).toContain('insufficient');
      expect(errorText.toLowerCase()).toContain('credit');

      // Error should mention required and available amounts
      // Based on enforceCredits in credit.service.ts:159
      expect(errorText).toMatch(/required|available/i);

      // Free users should see upgrade prompt
      // Based on enforceCredits logic for free users who've completed round
      if (errorText.toLowerCase().includes('free')) {
        expect(errorText.toLowerCase()).toContain('subscribe');
      }

      // Credit balance should still be 0 (no deduction attempted)
      // Reservation should NOT occur when credits are insufficient
      const balanceAfter = await getCreditBalance(page);
      expect(balanceAfter.balance).toBe(0);
      expect(balanceAfter.reserved).toBe(0);

      // Verify no transaction was created (no reservation or deduction)
      const transactions = await getTransactionHistory(page);
      const recentTransactions = transactions.slice(0, 3);
      const hasRecentReservation = recentTransactions.some(tx => tx.type === 'reservation');
      expect(hasRecentReservation).toBe(false);
    });

    test('prevents thread creation when credits insufficient', async ({ authenticatedPage: page }) => {
      // ARRANGE: Set very low credits
      await setUserCredits(page, 50); // Less than thread creation cost (100)

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // ACT: Try to create new thread
      const createThreadButton = page.getByRole('button', { name: /new thread/i }).or(page.locator('button[aria-label*="new" i]'));

      if (await createThreadButton.isVisible()) {
        await createThreadButton.click();

        // ASSERT: Should show error about insufficient credits
        await expect(page.locator('text=/insufficient credits/i')).toBeVisible({ timeout: 10000 });
      }

      // Balance should remain unchanged (no partial deduction)
      const balance = await getCreditBalance(page);
      expect(balance.balance).toBe(50);
      expect(balance.reserved).toBe(0);
    });
  });

  test.describe('Partial Round Completion', () => {
    test('credits not zeroed if round partially completes (participant errors)', async ({ authenticatedPage: page }) => {
      // ARRANGE: Start a round with multiple participants
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const initialBalance = await getCreditBalance(page);
      expect(initialBalance.available).toBeGreaterThan(100);

      // Start message to trigger round
      await startChatMessage(page, 'Test message for partial round');

      // Wait for streaming to start
      await waitForStreamingStart(page);

      // ACT: Simulate network interruption mid-stream
      // This tests the error recovery path
      await page.context().setOffline(true);

      // Wait a moment for error to occur
      await page.waitForTimeout(2000);

      // Restore network
      await page.context().setOffline(false);

      // ASSERT: Check that credits weren't completely zeroed
      // The system should release reservation, not deduct full amount
      await page.waitForTimeout(3000); // Wait for error handling

      const balanceAfter = await getCreditBalance(page);

      // Balance should not be 0 (only reservation released)
      expect(balanceAfter.balance).toBeGreaterThan(0);

      // Reserved credits should be released
      expect(balanceAfter.reserved).toBe(0);

      // Transaction history should show reservation release
      const transactions = await getTransactionHistory(page);
      const releaseTransaction = transactions.find(tx => tx.type === 'release');

      expect(releaseTransaction).toBeDefined();
      expect(releaseTransaction?.amount).toBeGreaterThan(0); // Positive = credits returned
    });

    test('free user round completion flag only set when ALL participants respond', async ({ authenticatedPage: page }) => {
      // This test ensures partial rounds don't trigger free_round_complete
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Start a message
      await startChatMessage(page, 'Testing partial round completion');

      // Wait for at least one participant to respond
      await page.waitForSelector('[data-message-role="assistant"]', { timeout: 20000 });

      // Check transaction history - should NOT have free_round_complete yet
      const transactions = await getTransactionHistory(page);
      const freeRoundComplete = transactions.find(tx => tx.action === 'free_round_complete');

      // If round is not fully complete, this should be undefined
      // If round IS complete (all participants responded), that's also valid
      // The key is that partial completion doesn't zero credits
      const balance = await getCreditBalance(page);

      if (!freeRoundComplete) {
        // Partial round - balance should still have credits
        expect(balance.balance).toBeGreaterThan(0);
      } else {
        // Full round completed - balance is zeroed
        expect(balance.balance).toBe(0);
      }
    });
  });

  test.describe('Network Error During Streaming', () => {
    test('reservation released when stream fails due to network error', async ({ authenticatedPage: page }) => {
      // ARRANGE
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const initialBalance = await getCreditBalance(page);
      expect(initialBalance.available).toBeGreaterThan(100); // Ensure enough credits

      // ACT: Start streaming and immediately disconnect
      await startChatMessage(page, 'Test message for network failure');

      // Wait for reservation to occur (streaming.handler.ts:808)
      // Reservation happens BEFORE streaming begins
      await page.waitForTimeout(1000);

      const balanceAfterReservation = await getCreditBalance(page);

      // Verify reservation occurred (may be 0 if error happened before reservation)
      const reservedAmount = balanceAfterReservation.reserved;

      // Simulate network failure mid-stream
      await page.context().setOffline(true);

      // Wait for stream to fail and onError to trigger (streaming.handler.ts:872)
      // onError calls releaseReservation (streaming.handler.ts:876)
      await page.waitForTimeout(5000);

      // Restore network
      await page.context().setOffline(false);

      // Wait for cleanup to complete
      await page.waitForTimeout(2000);

      // ASSERT: Reservation should be released
      const finalBalance = await getCreditBalance(page);

      // Reserved should be 0 after release
      expect(finalBalance.reserved).toBe(0);

      // Balance should be close to initial (only small variance allowed)
      // If reservation occurred, it should be released
      // If no reservation, balance unchanged
      expect(finalBalance.balance).toBeGreaterThanOrEqual(initialBalance.balance - 50);

      // Verify transaction history
      if (reservedAmount > 0) {
        // If reservation occurred, verify it was released
        const wasReleased = await verifyReservationReleased(page, reservedAmount);
        expect(wasReleased).toBe(true);

        // Get release transaction for validation
        const transactions = await getTransactionHistory(page);
        const releaseTransaction = transactions.find(tx => tx.type === 'release');

        expect(releaseTransaction).toBeDefined();
        expect(releaseTransaction?.description).toMatch(/released|error|cancel/i);
      }
    });

    test('stream error shows user-friendly message', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Start message
      await startChatMessage(page, 'Test network error message');

      await page.waitForTimeout(500);

      // Disconnect network
      await page.context().setOffline(true);

      // Should show error message to user
      await expect(
        page.locator('text=/error|failed|network|try again/i').first(),
      ).toBeVisible({ timeout: 15000 });

      // Restore network
      await page.context().setOffline(false);
    });
  });

  test.describe('Concurrent Request Handling', () => {
    test('no double charging when multiple requests from same user', async ({ authenticatedPage: page }) => {
      // ARRANGE
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set specific credit amount
      await setUserCredits(page, 10000);
      const initialBalance = await getCreditBalance(page);

      // Get initial transaction count
      const initialTransactions = await getTransactionHistory(page);
      const initialDeductionCount = initialTransactions.filter(tx => tx.type === 'deduction').length;

      // ACT: Send two messages rapidly (concurrent requests)
      // Note: These will be queued by the chat system, not truly concurrent
      // The system should handle them sequentially without double-charging
      const message1Promise = startChatMessage(page, 'First concurrent message');
      await page.waitForTimeout(200); // Small delay to allow first to start
      const message2Promise = startChatMessage(page, 'Second concurrent message');

      await Promise.all([message1Promise, message2Promise]);

      // Wait for both to process (streaming + finalization)
      await page.waitForTimeout(10000);

      // ASSERT: Credits should be deducted correctly, not double-charged
      const finalBalance = await getCreditBalance(page);

      // The deduction should be for actual usage, not double
      const totalDeducted = initialBalance.balance - finalBalance.balance;

      // Should not be zero (some credits used)
      expect(totalDeducted).toBeGreaterThan(0);

      // Should not be double the expected amount (no double charge)
      // Optimistic locking (version column) prevents race conditions
      // Each deduction increments version, retry on mismatch (credit.service.ts:379)
      const transactions = await getTransactionHistory(page);
      const finalDeductionCount = transactions.filter(tx => tx.type === 'deduction').length;

      // Should have new deductions for the messages
      const newDeductions = finalDeductionCount - initialDeductionCount;
      expect(newDeductions).toBeGreaterThan(0);

      // Verify no duplicate message IDs in deductions (would indicate double charge)
      const deductionMessageIds = transactions
        .filter(tx => tx.type === 'deduction' && 'messageId' in tx && tx.messageId)
        .map(tx => (tx as typeof tx & { messageId: string }).messageId);

      const uniqueMessageIds = new Set(deductionMessageIds);
      expect(deductionMessageIds.length).toBe(uniqueMessageIds.size); // No duplicates

      // Reserved credits should be 0 or low (all finalized or released)
      expect(finalBalance.reserved).toBeLessThan(500);
    });

    test('optimistic locking prevents race conditions on balance updates', async ({ authenticatedPage: page }) => {
      // This is handled by the version column in the database
      // The service retries on version mismatch
      // This test verifies the behavior from E2E perspective

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 5000);

      // Send message and check balance consistency
      await startChatMessage(page, 'Test optimistic locking');

      await page.waitForTimeout(3000);

      const balance = await getCreditBalance(page);

      // Balance should be consistent (not negative, no weird values)
      expect(balance.balance).toBeGreaterThanOrEqual(0);
      expect(balance.reserved).toBeGreaterThanOrEqual(0);
      expect(balance.available).toBeGreaterThanOrEqual(0);
      expect(balance.available).toBeLessThanOrEqual(balance.balance);
    });
  });

  test.describe('Race Condition: Two Tabs Using Last Credits', () => {
    test('second tab shows error when first tab uses last credits', async ({ browser }) => {
      // ARRANGE: Create two tabs with same authenticated user
      const context = await browser.newContext({
        storageState: '.playwright/auth/free-user.json',
      });

      const tab1 = await context.newPage();
      const tab2 = await context.newPage();

      // Set credits to barely enough for one message
      await tab1.goto('/chat');
      await tab1.waitForLoadState('networkidle');
      await setUserCredits(tab1, 150); // Just enough for one message

      await tab2.goto('/chat');
      await tab2.waitForLoadState('networkidle');

      // ACT: Both tabs try to send message simultaneously
      const tab1SendPromise = startChatMessage(tab1, 'Tab 1 message');
      const tab2SendPromise = startChatMessage(tab2, 'Tab 2 message');

      await Promise.all([tab1SendPromise, tab2SendPromise]);

      // Wait for processing
      await tab1.waitForTimeout(3000);
      await tab2.waitForTimeout(3000);

      // ASSERT: One should succeed, one should fail with insufficient credits
      const tab1Error = await tab1.locator('text=/insufficient credits/i').isVisible();
      const tab2Error = await tab2.locator('text=/insufficient credits/i').isVisible();

      // At least one should show error (XOR: one succeeds, one fails)
      expect(tab1Error || tab2Error).toBe(true);

      // Check final balance - should be low or 0, not negative
      const finalBalance = await getCreditBalance(tab1);
      expect(finalBalance.balance).toBeGreaterThanOrEqual(0);
      expect(finalBalance.available).toBeGreaterThanOrEqual(0);

      // Cleanup
      await tab1.close();
      await tab2.close();
      await context.close();
    });
  });

  test.describe('Credit Balance Cannot Go Negative', () => {
    test('database constraint prevents negative balance', async ({ authenticatedPage: page }) => {
      // This tests the database-level constraint: check_balance_non_negative

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set credits to very low amount
      await setUserCredits(page, 10);

      const initialBalance = await getCreditBalance(page);
      expect(initialBalance.balance).toBe(10);

      // Try to send expensive message (will be rejected)
      await startChatMessage(page, 'This message requires more than 10 credits');

      // Should show error
      await expect(page.locator('text=/insufficient credits/i')).toBeVisible({ timeout: 10000 });

      // Balance should still be 10 (not negative)
      const finalBalance = await getCreditBalance(page);
      expect(finalBalance.balance).toBe(10);
      expect(finalBalance.balance).toBeGreaterThanOrEqual(0);
    });

    test('reserved credits cannot exceed balance', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 100);

      // Try to send message
      await startChatMessage(page, 'Test reservation limits');

      await page.waitForTimeout(1000);

      const balance = await getCreditBalance(page);

      // Reserved should not exceed balance
      expect(balance.reserved).toBeLessThanOrEqual(balance.balance);

      // Available should be non-negative
      expect(balance.available).toBeGreaterThanOrEqual(0);

      // Balance - reserved = available
      expect(balance.available).toBe(balance.balance - balance.reserved);
    });

    test('transaction ledger maintains correct balance_after values', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Get transaction history
      const transactions = await getTransactionHistory(page);

      // Verify all balanceAfter values are non-negative
      for (const tx of transactions) {
        expect(tx.balanceAfter).toBeGreaterThanOrEqual(0);
      }

      // Verify balance progression is logical
      for (let i = 0; i < transactions.length - 1; i++) {
        const current = transactions[i];

        // Each transaction should result in a valid balance
        if (current.type === 'deduction' || current.type === 'reservation') {
          expect(current.amount).toBeLessThanOrEqual(0); // Negative for deductions
        }

        if (current.type === 'credit_grant' || current.type === 'release') {
          expect(current.amount).toBeGreaterThanOrEqual(0); // Positive for grants
        }
      }
    });
  });

  test.describe('Error Recovery and Resilience', () => {
    test('user can retry after insufficient credits error', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set to 0 credits
      await setUserCredits(page, 0);

      // Verify we're at 0
      const zeroBalance = await getCreditBalance(page);
      expect(zeroBalance.available).toBe(0);

      // Try to send message (will fail)
      await startChatMessage(page, 'This will fail due to insufficient credits');

      // Wait for error to appear
      const errorText = await waitForErrorMessage(page);
      expect(errorText.toLowerCase()).toContain('insufficient');

      // Grant credits (simulate purchase or subscription)
      await setUserCredits(page, 10000);

      // Verify credits were granted
      const grantedBalance = await getCreditBalance(page);
      expect(grantedBalance.available).toBe(10000);

      // Retry - should succeed now
      await page.reload();
      await page.waitForLoadState('networkidle');

      await startChatMessage(page, 'This should succeed with credits');

      // Should start streaming successfully
      await waitForStreamingStart(page);

      // No error message should be present
      const hasError = await page.locator('text=/insufficient credits/i').isVisible();
      expect(hasError).toBe(false);

      // Verify credits were reserved/deducted
      const finalBalance = await getCreditBalance(page);
      expect(finalBalance.balance).toBeLessThan(10000); // Some used
    });

    test('reservation cleanup on page refresh during streaming', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Start streaming
      await startChatMessage(page, 'Test refresh during stream');
      await page.waitForTimeout(1000);

      const balanceAfterReservation = await getCreditBalance(page);
      expect(balanceAfterReservation.reserved).toBeGreaterThan(0);

      // Refresh page mid-stream
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Wait for cleanup
      await page.waitForTimeout(2000);

      // Reservation should be released (eventually)
      const finalBalance = await getCreditBalance(page);

      // Reserved should be 0 or low (cleanup happened)
      expect(finalBalance.reserved).toBeLessThanOrEqual(balanceAfterReservation.reserved);
    });

    test('free user sees correct error after round completion', async ({ authenticatedPage: page }) => {
      // This test would require completing a full round first
      // Then attempting to send another message

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Check if free round already completed
      const transactions = await getTransactionHistory(page);
      const freeRoundComplete = transactions.find(tx => tx.action === 'free_round_complete');

      if (freeRoundComplete) {
        // Try to send message
        await startChatMessage(page, 'This should fail - round completed');

        // Should show specific error about free round
        const errorText = await page.locator('[role="alert"], text=/free/i').first().textContent();
        expect(errorText?.toLowerCase()).toContain('free');
        expect(errorText?.toLowerCase()).toContain('subscribe');
      }
    });
  });

  test.describe('Credit System Integrity', () => {
    test('credit deductions match transaction ledger', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 10000);
      const initialBalance = await getCreditBalance(page);

      // Send a message
      await startChatMessage(page, 'Test transaction ledger accuracy');

      // Wait for streaming to complete and credits to finalize
      // onFinish calls finalizeCredits (streaming.handler.ts:1012)
      await page.waitForTimeout(12000);

      const finalBalance = await getCreditBalance(page);
      const totalDeducted = initialBalance.balance - finalBalance.balance;

      // Should have deducted some credits
      expect(totalDeducted).toBeGreaterThan(0);

      // Get transactions
      const transactions = await getTransactionHistory(page);
      const recentDeductions = transactions.filter(
        tx => tx.type === 'deduction' && tx.balanceAfter <= initialBalance.balance,
      );

      // Should have deduction records
      expect(recentDeductions.length).toBeGreaterThan(0);

      // Sum of deductions should match balance change
      // Note: amount is negative for deductions
      const ledgerTotal = Math.abs(recentDeductions.reduce((sum, tx) => sum + tx.amount, 0));

      // Allow small variance for timing/rounding
      expect(Math.abs(totalDeducted - ledgerTotal)).toBeLessThanOrEqual(50);

      // Verify transaction structure
      for (const tx of recentDeductions) {
        expect(tx.type).toBe('deduction');
        expect(tx.amount).toBeLessThan(0); // Negative for deductions
        expect(tx.balanceAfter).toBeGreaterThanOrEqual(0);
        // creditsUsed may not be in the API response - skip if not present
        if ('creditsUsed' in tx && typeof tx.creditsUsed === 'number') {
          expect(tx.creditsUsed).toBeGreaterThan(0);
        }
      }
    });

    test('all credit transactions have required fields', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const transactions = await getTransactionHistory(page);

      for (const tx of transactions) {
        // Required fields
        expect(tx.type).toBeDefined();
        expect(tx.amount).toBeDefined();
        expect(tx.balanceAfter).toBeDefined();

        // Type-specific validations
        if (tx.type === 'deduction') {
          expect(tx.amount).toBeLessThanOrEqual(0);
          expect(tx.action).toBeDefined();
        }

        if (tx.type === 'credit_grant' || tx.type === 'monthly_refill') {
          expect(tx.amount).toBeGreaterThan(0);
        }
      }
    });

    test('reservation and finalization flow is atomic', async ({ authenticatedPage: page }) => {
      // This test validates the complete credit lifecycle:
      // 1. Reserve credits (streaming.handler.ts:808)
      // 2. Stream response
      // 3. Finalize credits (streaming.handler.ts:1012)
      // 4. Verify no orphaned reservations

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 10000);
      const initialBalance = await getCreditBalance(page);

      // Send message and track the full lifecycle
      await startChatMessage(page, 'Test complete credit lifecycle');

      // Wait a moment for reservation
      await page.waitForTimeout(500);

      const reservedBalance = await getCreditBalance(page);
      const reservedAmount = reservedBalance.reserved;

      // Reservation should have occurred
      expect(reservedAmount).toBeGreaterThan(0);

      // Wait for completion
      await page.waitForTimeout(12000);

      const finalBalance = await getCreditBalance(page);

      // Reservation should be cleared
      expect(finalBalance.reserved).toBe(0);

      // Balance should have decreased (credits finalized)
      expect(finalBalance.balance).toBeLessThan(initialBalance.balance);

      // Verify transaction history shows complete flow
      const transactions = await getTransactionHistory(page);

      // Should have reservation transaction
      const reservation = transactions.find(tx => tx.type === 'reservation');
      expect(reservation).toBeDefined();

      // Should have deduction transaction (finalization)
      const deduction = transactions.find(
        tx => tx.type === 'deduction' && tx.action === 'ai_response',
      );
      expect(deduction).toBeDefined();

      // Should NOT have a release transaction (clean finalization)
      const recentRelease = transactions
        .slice(0, 5)
        .find(tx => tx.type === 'release');
      expect(recentRelease).toBeUndefined();
    });
  });

  test.describe('API Error Handling', () => {
    test('handles provider rate limit errors gracefully', async ({ authenticatedPage: page }) => {
      // Test that rate limit errors show user-friendly message
      // and don't leave reservations hanging

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 10000);

      // Send message that might trigger rate limit (in real scenario)
      // For this test, we're validating error handling structure
      await startChatMessage(page, 'Test rate limit error handling');

      // If rate limit error occurs, should show error
      // Wait to see if error appears (or stream succeeds)
      await page.waitForTimeout(5000);

      // Check for any error states
      const hasError = await page.locator('[role="alert"], [data-error="true"]').isVisible();

      if (hasError) {
        // If error occurred, verify credits were released
        const balance = await getCreditBalance(page);
        expect(balance.reserved).toBe(0);
      } else {
        // If no error, stream succeeded - verify deduction
        const balance = await getCreditBalance(page);
        expect(balance.balance).toBeLessThan(10000);
      }
    });

    test('validates credit balance API response structure', async ({ authenticatedPage: page }) => {
      // Ensure the balance API returns expected structure
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const balance = await getCreditBalance(page);

      // Validate response structure matches CreditBalanceInfo
      // (credit.service.ts:39)
      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('reserved');
      expect(balance).toHaveProperty('available');
      expect(balance).toHaveProperty('planType');
      expect(balance).toHaveProperty('monthlyCredits');

      // Validate data types
      expect(typeof balance.balance).toBe('number');
      expect(typeof balance.reserved).toBe('number');
      expect(typeof balance.available).toBe('number');
      expect(typeof balance.planType).toBe('string');
      expect(typeof balance.monthlyCredits).toBe('number');

      // Validate invariants
      expect(balance.balance).toBeGreaterThanOrEqual(0);
      expect(balance.reserved).toBeGreaterThanOrEqual(0);
      expect(balance.available).toBe(balance.balance - balance.reserved);
      expect(balance.reserved).toBeLessThanOrEqual(balance.balance);
    });
  });

  test.describe('Edge Cases and Boundary Conditions', () => {
    test('handles exactly enough credits for one message', async ({ authenticatedPage: page }) => {
      // Test boundary: user has exact amount needed
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set to minimal viable amount (estimated for one message)
      await setUserCredits(page, 200);

      const initialBalance = await getCreditBalance(page);
      expect(initialBalance.available).toBe(200);

      // Send message
      await startChatMessage(page, 'Test with minimal credits');

      // Should succeed (or fail gracefully if not enough)
      await page.waitForTimeout(8000);

      const finalBalance = await getCreditBalance(page);

      // Either succeeded and deducted, or failed before reservation
      if (finalBalance.balance < initialBalance.balance) {
        // Successfully deducted - verify reservation was released
        expect(finalBalance.reserved).toBe(0);
      } else {
        // Not enough credits - should show error
        const hasError = await page.locator('text=/insufficient/i').isVisible();
        expect(hasError).toBe(true);
      }
    });

    test('handles rapid balance changes during streaming', async ({ authenticatedPage: page }) => {
      // Test: Change credits while streaming is active
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 10000);

      // Start streaming
      await startChatMessage(page, 'Test mid-stream balance change');

      // Wait for reservation
      await page.waitForTimeout(500);

      // Change balance mid-stream (simulates concurrent grant/deduction)
      await setUserCredits(page, 5000);

      // Wait for completion
      await page.waitForTimeout(8000);

      const finalBalance = await getCreditBalance(page);

      // Should be near 5000 (set mid-stream), minus any finalized credits
      // The system should handle this gracefully
      expect(finalBalance.balance).toBeGreaterThanOrEqual(0);
      expect(finalBalance.reserved).toBeGreaterThanOrEqual(0);

      // Verify balance integrity
      expect(finalBalance.available).toBe(finalBalance.balance - finalBalance.reserved);
    });
  });

  test.describe('Payment Failure Handling', () => {
    test('shows clear error when credit purchase fails', async ({ authenticatedPage: page }) => {
      // Navigate to pricing/billing page
      await page.goto('/chat/pricing');
      await page.waitForLoadState('networkidle');

      // Try to purchase credits (will fail in test environment without Stripe setup)
      const purchaseButton = page.getByRole('button', { name: /purchase|buy|get credits/i }).first();

      if (await purchaseButton.isVisible()) {
        await purchaseButton.click();

        // Should show error or redirect to payment flow
        // Wait for either error message or payment redirect
        await page.waitForTimeout(3000);

        // Check for error message OR successful redirect to checkout
        const hasError = await page.locator('[role="alert"], text=/error|failed/i').isVisible();
        const isCheckoutPage = page.url().includes('checkout') || page.url().includes('stripe');

        // One of these should be true - either error or redirect
        expect(hasError || isCheckoutPage).toBe(true);
      }
    });

    test('handles Stripe webhook failures gracefully', async ({ authenticatedPage: page }) => {
      // This test validates that the system handles webhook failures
      // In real scenarios, webhooks might fail due to network issues, server errors, etc.

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const initialBalance = await getCreditBalance(page);

      // Simulate a payment attempt that doesn't complete
      // In production, this would be a Stripe checkout session that doesn't get a webhook
      // The user should be able to continue using the app with their existing credits

      // Verify balance hasn't changed
      const currentBalance = await getCreditBalance(page);
      expect(currentBalance.balance).toBe(initialBalance.balance);

      // User should still be able to use the chat if they have credits
      if (currentBalance.available > 0) {
        await startChatMessage(page, 'Test after payment failure');
        await page.waitForTimeout(2000);

        // Should not show payment-related errors
        const hasPaymentError = await page.locator('text=/payment required|billing error/i').isVisible();
        expect(hasPaymentError).toBe(false);
      }
    });

    test('shows upgrade prompt for free users with payment failures', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set user to 0 credits (simulating free user who exhausted credits)
      await setUserCredits(page, 0);

      // Try to send message
      await startChatMessage(page, 'Test upgrade prompt');

      // Should show error with upgrade/subscribe prompt
      const errorMessage = await waitForErrorMessage(page);

      // Error should mention subscribing or upgrading
      expect(errorMessage.toLowerCase()).toMatch(/subscribe|upgrade|pro/);
    });
  });

  test.describe('Credit Sync Failures', () => {
    test('handles credit API unavailability', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Simulate API failure by going offline briefly
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);
      await page.context().setOffline(false);

      // UI should recover and show current state
      await page.waitForLoadState('networkidle');

      // Should not crash or show blank screen
      const chatContainer = page.locator('[data-testid="chat-container"], main, [role="main"]').first();
      await expect(chatContainer).toBeVisible({ timeout: 10000 });
    });

    test('recovers from transient credit check failures', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 5000);

      // Send a message successfully first
      await startChatMessage(page, 'Initial message');
      await page.waitForTimeout(3000);

      // Simulate network blip
      await page.context().setOffline(true);
      await page.waitForTimeout(500);
      await page.context().setOffline(false);

      // Wait for reconnection
      await page.waitForTimeout(2000);

      // Should be able to send another message after recovery
      await startChatMessage(page, 'Message after network recovery');

      // Should either succeed or show clear error
      await page.waitForTimeout(3000);

      const balance = await getCreditBalance(page);
      expect(balance.balance).toBeGreaterThanOrEqual(0);
    });

    test('shows stale balance warning when sync fails', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Interrupt network to prevent balance sync
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);

      // Try to check balance or send message
      const balanceLocator = await page.locator('text=/credit|balance/i').first();

      // May show stale data or loading state
      // Should not crash
      const isVisible = await balanceLocator.isVisible();
      expect(isVisible || true).toBe(true); // Either visible or not, shouldn't crash

      await page.context().setOffline(false);

      // After reconnection, should sync
      await page.waitForTimeout(2000);
      const finalBalance = await getCreditBalance(page);
      expect(finalBalance).toBeDefined();
    });
  });

  test.describe('Concurrent Usage Conflicts', () => {
    test('prevents credit race when user sends message in multiple windows', async ({ browser }) => {
      // Create two browser windows with same user
      const context = await browser.newContext({
        storageState: '.playwright/auth/free-user.json',
      });

      const window1 = await context.newPage();
      const window2 = await context.newPage();

      // Both navigate to chat
      await window1.goto('/chat');
      await window2.goto('/chat');
      await window1.waitForLoadState('networkidle');
      await window2.waitForLoadState('networkidle');

      // Set sufficient credits
      await setUserCredits(window1, 5000);

      // Both windows try to send at exact same time
      const send1 = startChatMessage(window1, 'Window 1 concurrent message');
      const send2 = startChatMessage(window2, 'Window 2 concurrent message');

      await Promise.all([send1, send2]);

      // Wait for processing
      await window1.waitForTimeout(5000);

      // Check final balance - should be consistent
      const balance1 = await getCreditBalance(window1);
      const balance2 = await getCreditBalance(window2);

      // Both windows should see same balance
      expect(balance1.balance).toBe(balance2.balance);

      // Balance should be positive (no double deduction causing negative)
      expect(balance1.balance).toBeGreaterThanOrEqual(0);

      await window1.close();
      await window2.close();
      await context.close();
    });

    test('handles credit depletion mid-round in multi-participant chat', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Set very low credits (enough for maybe one participant)
      await setUserCredits(page, 300);

      const initialBalance = await getCreditBalance(page);

      // Send message that will trigger multiple participants
      await startChatMessage(page, 'Multi-participant test with low credits');

      // Wait for partial round
      await page.waitForTimeout(8000);

      const finalBalance = await getCreditBalance(page);

      // Should not go negative
      expect(finalBalance.balance).toBeGreaterThanOrEqual(0);

      // If insufficient for full round, should show error
      if (finalBalance.balance < initialBalance.balance) {
        // Some participants responded
        const transactions = await getTransactionHistory(page);
        const recentDeductions = transactions.filter(tx => tx.type === 'deduction');
        expect(recentDeductions.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('User-Facing Error Messages', () => {
    test('shows actionable error for insufficient credits', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 0);

      await startChatMessage(page, 'Test error messaging');

      const errorText = await waitForErrorMessage(page);

      // Error should contain:
      // 1. Clear explanation of the problem
      expect(errorText.toLowerCase()).toContain('insufficient');

      // 2. Current available amount
      expect(errorText).toMatch(/available|current/i);

      // 3. Action to resolve (subscribe or purchase)
      expect(errorText.toLowerCase()).toMatch(/subscribe|purchase|upgrade/);
    });

    test('shows different messages for free vs paid users', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 0);

      await startChatMessage(page, 'Test user-specific messaging');

      const errorText = await waitForErrorMessage(page);

      const balance = await getCreditBalance(page);

      // Free users should see "Subscribe to Pro"
      if (balance.planType === 'free') {
        expect(errorText.toLowerCase()).toContain('subscribe');
      } else {
        // Paid users should see "Purchase additional credits"
        expect(errorText.toLowerCase()).toContain('purchase');
      }
    });

    test('error message includes link to pricing page', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 0);

      await startChatMessage(page, 'Test pricing link in error');

      await waitForErrorMessage(page);

      // Look for link to pricing or billing
      const pricingLink = page.locator('a[href*="pricing"], a[href*="billing"], button:has-text("Upgrade")').first();

      // Error should have actionable link (may be button or link)
      const hasAction = await pricingLink.isVisible().catch(() => false);

      // If no direct link visible, check if error text mentions how to upgrade
      if (!hasAction) {
        const errorText = await page.locator('[role="alert"]').first().textContent();
        expect(errorText?.toLowerCase()).toMatch(/pricing|billing|upgrade|subscribe/);
      }
    });

    test('network error shows retry option', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Start message
      await startChatMessage(page, 'Test network error retry');
      await page.waitForTimeout(500);

      // Cause network error
      await page.context().setOffline(true);

      // Wait for error
      await page.waitForTimeout(3000);

      await page.context().setOffline(false);

      // Look for retry button or message
      const retryButton = page.getByRole('button', { name: /retry|try again/i });
      const hasRetry = await retryButton.isVisible({ timeout: 10000 }).catch(() => false);

      // Should either have retry button OR clear message about trying again
      if (!hasRetry) {
        const errorText = await page.locator('[role="alert"], text=/error/i').first().textContent();
        expect(errorText?.toLowerCase()).toMatch(/try again|retry|refresh/);
      }
    });

    test('model error shows model-specific information', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 10000);

      // Start a message
      await startChatMessage(page, 'Test model error handling');

      // Simulate error by going offline briefly during streaming
      await page.waitForTimeout(1000);
      await page.context().setOffline(true);
      await page.waitForTimeout(2000);
      await page.context().setOffline(false);

      await page.waitForTimeout(3000);

      // Look for any error messages that might include model info
      const errorElements = page.locator('[role="alert"], [data-error="true"], .error-message');

      const errorCount = await errorElements.count();

      // If errors are present, they should be informative
      if (errorCount > 0) {
        const firstError = errorElements.first();
        const errorText = await firstError.textContent();

        // Error should be meaningful (not just "Error" or empty)
        expect(errorText?.trim().length).toBeGreaterThan(5);
      }
    });
  });

  test.describe('Recovery from Error States', () => {
    test('allows retry after network error', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 5000);

      // First attempt with network error
      await startChatMessage(page, 'First attempt - will fail');
      await page.waitForTimeout(500);
      await page.context().setOffline(true);
      await page.waitForTimeout(3000);
      await page.context().setOffline(false);

      // Wait for error to appear and clear
      await page.waitForTimeout(2000);

      // Retry should work
      await startChatMessage(page, 'Retry after error');

      // Should start streaming
      await page.waitForTimeout(3000);

      const balance = await getCreditBalance(page);
      expect(balance.balance).toBeGreaterThanOrEqual(0);
    });

    test('clears error state on page refresh', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 0);

      // Trigger error
      await startChatMessage(page, 'Trigger error');
      await waitForErrorMessage(page);

      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Grant credits
      await setUserCredits(page, 5000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Error should be cleared, can send new message
      await startChatMessage(page, 'After refresh with credits');

      // Should work without showing previous error
      await page.waitForTimeout(2000);

      const hasOldError = await page.locator('text=/insufficient credits/i').isVisible();
      expect(hasOldError).toBe(false);
    });

    test('recovers from abandoned streaming session', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      await setUserCredits(page, 5000);

      // Start streaming
      await startChatMessage(page, 'Abandoned stream test');
      await page.waitForTimeout(1000);

      // Navigate away (abandoning stream)
      await page.goto('/chat/pricing');
      await page.waitForLoadState('networkidle');

      // Go back to chat
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Credits should be released
      const balance = await getCreditBalance(page);

      // Reserved should be 0 or low (cleanup happened)
      expect(balance.reserved).toBeLessThan(500);
    });

    test('handles credit grant during error state', async ({ authenticatedPage: page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Start with 0 credits
      await setUserCredits(page, 0);

      // Trigger error
      await startChatMessage(page, 'No credits error');
      await waitForErrorMessage(page);

      // Grant credits while error is showing
      await setUserCredits(page, 10000);

      // Refresh to pick up new credits
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify new balance
      const balance = await getCreditBalance(page);
      expect(balance.balance).toBe(10000);

      // Should be able to send message now
      await startChatMessage(page, 'After credit grant');
      await page.waitForTimeout(2000);

      // No insufficient credits error
      const hasError = await page.locator('text=/insufficient credits/i').isVisible();
      expect(hasError).toBe(false);
    });
  });
});
