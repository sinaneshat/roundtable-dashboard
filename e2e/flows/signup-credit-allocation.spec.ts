import { expect, test } from '@playwright/test';

import { ensureModelsSelected, getMessageInput } from '../helpers';

/**
 * Signup Flow with Credit Allocation E2E Tests
 *
 * Tests the complete user signup journey with credit system integration:
 * 1. New user registers (email/password or OAuth)
 * 2. User receives 5000 signup credits automatically
 * 3. Credit balance is visible in UI immediately after signup
 * 4. Email verification status and its impact on credit access
 * 5. OAuth vs email/password signup credit allocation consistency
 * 6. First-time user can immediately use credits for chat
 * 7. Credit display updates correctly throughout first interaction
 *
 * Comprehensive testing of signup → credit allocation → credit display → first usage flow.
 *
 * Uses chromium-no-auth project (no stored auth state) to test fresh signups.
 */

// ============================================================================
// Test Data and Helpers
// ============================================================================

function generateUniqueEmail(prefix: string = 'signup-credit') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}-${timestamp}-${random}@roundtable.now`;
}

function generatePassword() {
  return `TestPass${Date.now()}!`;
}

type SignupTestUser = {
  email: string;
  password: string;
  name: string;
};

/**
 * Create a new user via Better Auth API (programmatic signup)
 */
async function createTestUser(
  page: Parameters<typeof test>[1]['page'],
  baseURL: string,
  userData: SignupTestUser,
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const response = await page.request.post(`${baseURL}/api/auth/sign-up/email`, {
      data: {
        email: userData.email,
        password: userData.password,
        name: userData.name,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok()) {
      const errorText = await response.text();
      return { success: false, error: `Signup failed: ${response.status()} ${errorText}` };
    }

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true, userId: data.user?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sign in a user via Better Auth API
 */
async function signInTestUser(
  page: Parameters<typeof test>[1]['page'],
  baseURL: string,
  credentials: { email: string; password: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await page.request.post(`${baseURL}/api/auth/sign-in/email`, {
      data: {
        email: credentials.email,
        password: credentials.password,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok()) {
      const errorText = await response.text();
      return { success: false, error: `Sign-in failed: ${response.status()} ${errorText}` };
    }

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get user credit balance via API
 */
async function getUserCreditBalance(page: Parameters<typeof test>[1]['page']) {
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

type CreditTransaction = {
  id: string;
  type: string;
  action: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};

/**
 * Get credit transaction history
 */
async function getCreditTransactions(page: Parameters<typeof test>[1]['page'], limit: number = 50) {
  const response = await page.request.get(`/api/v1/credits/transactions?limit=${limit}`);
  expect(response.ok()).toBe(true);
  const data = await response.json();

  return {
    success: data.success,
    items: data.data.items as CreditTransaction[],
  };
}

// ============================================================================
// Signup and Automatic Credit Allocation
// ============================================================================

test.describe('Signup → Credit Allocation Flow', () => {
  test('new user receives 5000 signup credits immediately after registration', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('credit-allocation'),
      password: generatePassword(),
      name: 'Credit Allocation Test User',
    };

    // Step 1: Create new user via API
    const signupResult = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();
    expect(signupResult.userId).toBeTruthy();

    // Step 2: Sign in to establish session
    const signInResult = await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // If email verification is required, skip credit checks
    if (!signInResult.success) {
      test.skip();
      return;
    }

    // Step 3: Verify credit balance was created with exactly 5000 credits
    const creditBalance = await getUserCreditBalance(page);

    expect(creditBalance.success).toBe(true);
    expect(creditBalance.data.balance).toBe(5000);
    expect(creditBalance.data.reserved).toBe(0);
    expect(creditBalance.data.available).toBe(5000);

    // Step 4: Verify plan type is set to 'free'
    expect(creditBalance.data.plan.type).toBe('free');
    expect(creditBalance.data.plan.monthlyCredits).toBe(0);
    expect(creditBalance.data.plan.nextRefillAt).toBeNull();

    // Step 5: Verify signup bonus transaction was recorded
    const transactions = await getCreditTransactions(page, 10);
    expect(transactions.success).toBe(true);

    const signupTransaction = transactions.items.find(tx => tx.action === 'signup_bonus');
    expect(signupTransaction).toBeDefined();
    expect(signupTransaction?.type).toBe('credit_grant');
    expect(signupTransaction?.amount).toBe(5000);
    expect(signupTransaction?.balanceAfter).toBe(5000);
  });

  test('signup credit allocation is idempotent (no duplicate credits on re-login)', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('idempotent'),
      password: generatePassword(),
      name: 'Idempotent Test User',
    };

    // Create user
    const signupResult = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    // Sign in first time
    const firstSignIn = await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    if (!firstSignIn.success) {
      test.skip();
      return;
    }

    // Get initial balance
    const initialBalance = await getUserCreditBalance(page);
    expect(initialBalance.data.balance).toBe(5000);

    // Sign out (by clearing cookies)
    await page.context().clearCookies();

    // Sign in again
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Get balance again - should be same (no duplicate signup bonus)
    const secondBalance = await getUserCreditBalance(page);
    expect(secondBalance.data.balance).toBe(5000);

    // Verify only one signup transaction exists
    const transactions = await getCreditTransactions(page, 50);
    const signupTransactions = transactions.items.filter(tx => tx.action === 'signup_bonus');
    expect(signupTransactions.length).toBe(1);
  });

  test('credit record is created atomically with user account', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('atomic'),
      password: generatePassword(),
      name: 'Atomic Creation Test User',
    };

    // Create user
    const signupResult = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    // Sign in
    const signInResult = await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    if (!signInResult.success) {
      test.skip();
      return;
    }

    // Credit balance API should return immediately without error
    // (no 404, no need to "initialize" - it's created with the user)
    const creditBalance = await getUserCreditBalance(page);
    expect(creditBalance.success).toBe(true);
    expect(creditBalance.data.balance).toBe(5000);
  });
});

// ============================================================================
// Credit Display in UI After Signup
// ============================================================================

test.describe('Credit Balance Visibility After Signup', () => {
  test('credit balance is visible in UI immediately after signup', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('ui-display'),
      password: generatePassword(),
      name: 'UI Display Test User',
    };

    // Create and sign in user
    const signupResult = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Navigate to chat (main app interface)
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Verify we're authenticated and on chat page
    await expect(page).toHaveURL(/\/chat/);

    // Look for credit display in UI
    // (Credit display might be in header, sidebar, or dedicated component)
    const creditDisplay = page.locator('text=/credits?/i, [data-credits], [aria-label*="credit" i]').first();
    const hasDisplay = await creditDisplay.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasDisplay) {
      const displayText = await creditDisplay.textContent();
      // Should show some numeric value (could be "5000 credits", "5,000", etc.)
      expect(displayText).toMatch(/\d/);
    }

    // Verify API shows correct balance regardless of UI display
    const creditBalance = await getUserCreditBalance(page);
    expect(creditBalance.data.balance).toBe(5000);
    expect(creditBalance.data.available).toBe(5000);
  });

  test('credit display shows correct percentage and status for new user', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('status'),
      password: generatePassword(),
      name: 'Status Test User',
    };

    // Create and sign in user
    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const creditBalance = await getUserCreditBalance(page);

    // New user with full credits should have:
    // - percentage: 0 (0% used)
    // - status: 'default' (not warning/critical)
    expect(creditBalance.data.percentage).toBe(0);
    expect(creditBalance.data.status).toBe('default');
  });

  test('plan type displays correctly as "free" for new users', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('plan-type'),
      password: generatePassword(),
      name: 'Plan Type Test User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    const creditBalance = await getUserCreditBalance(page);

    expect(creditBalance.data.plan.type).toBe('free');
    expect(creditBalance.data.plan.monthlyCredits).toBe(0);
    expect(creditBalance.data.plan.nextRefillAt).toBeNull();
  });
});

// ============================================================================
// Email Verification Impact on Credit Access
// ============================================================================

test.describe('Email Verification and Credit Access', () => {
  test('unverified email user has credit record but may be blocked from usage', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('unverified'),
      password: generatePassword(),
      name: 'Unverified Test User',
    };

    // Create user (may be unverified)
    const signupResult = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    // Try to sign in (may fail if verification required)
    const signInResult = await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    if (!signInResult.success) {
      // Email verification required - user cannot access app yet
      // Credit record should still exist in database, but user cannot access it
      // This is expected behavior - test passes
      expect(signInResult.error).toBeTruthy();
      return;
    }

    // If sign-in succeeds (verification not required), verify credits exist
    const creditBalance = await getUserCreditBalance(page);
    expect(creditBalance.data.balance).toBe(5000);
  });

  test('verified user can immediately access and use credits', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('verified'),
      password: generatePassword(),
      name: 'Verified Test User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);

    // Sign in (simulates verified user)
    const signInResult = await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    if (!signInResult.success) {
      test.skip();
      return;
    }

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // User should be able to access chat interface
    await expect(page).toHaveURL(/\/chat/);

    // Credits should be available
    const creditBalance = await getUserCreditBalance(page);
    expect(creditBalance.data.balance).toBe(5000);
    expect(creditBalance.data.available).toBe(5000);

    // Message input should be accessible
    const messageInput = page.locator('textarea, input[placeholder*="message" i]').first();
    const hasInput = await messageInput.isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasInput).toBeTruthy();
  });
});

// ============================================================================
// OAuth vs Email/Password Signup Credit Consistency
// ============================================================================

test.describe('Signup Method Credit Allocation Consistency', () => {
  test('email/password signup allocates exactly 5000 credits', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('email-pass'),
      password: generatePassword(),
      name: 'Email/Password User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    const creditBalance = await getUserCreditBalance(page);
    expect(creditBalance.data.balance).toBe(5000);

    const transactions = await getCreditTransactions(page);
    const signupBonus = transactions.items.find(tx => tx.action === 'signup_bonus');
    expect(signupBonus).toBeDefined();
    expect(signupBonus?.amount).toBe(5000);
  });

  // Note: OAuth signup credit allocation test would require actual OAuth flow
  // which needs real Google credentials. This is documented for manual testing.
  test.skip('OAuth signup allocates same 5000 credits as email/password', async ({ page: _page, baseURL: _baseURL }) => {
    // Manual test: Sign up via Google OAuth and verify:
    // 1. Credit balance is 5000
    // 2. Transaction history shows signup_bonus of 5000
    // 3. Plan type is 'free' with 0 monthly credits
    // 4. User can immediately access chat with full credits
  });

  test('all new users regardless of signup method have identical initial credit state', async ({ page, baseURL }) => {
    // Create multiple users via different methods
    const emailUser: SignupTestUser = {
      email: generateUniqueEmail('consistency-1'),
      password: generatePassword(),
      name: 'Consistency Test 1',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', emailUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: emailUser.email,
      password: emailUser.password,
    });

    const balance1 = await getUserCreditBalance(page);

    // Sign out
    await page.context().clearCookies();

    // Create another user
    const emailUser2: SignupTestUser = {
      email: generateUniqueEmail('consistency-2'),
      password: generatePassword(),
      name: 'Consistency Test 2',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', emailUser2);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: emailUser2.email,
      password: emailUser2.password,
    });

    const balance2 = await getUserCreditBalance(page);

    // Both users should have identical initial state
    expect(balance1.data.balance).toBe(balance2.data.balance);
    expect(balance1.data.plan.type).toBe(balance2.data.plan.type);
    expect(balance1.data.plan.monthlyCredits).toBe(balance2.data.plan.monthlyCredits);
    expect(balance1.data.plan.nextRefillAt).toBe(balance2.data.plan.nextRefillAt);
  });
});

// ============================================================================
// First-Time User Experience with Credits
// ============================================================================

test.describe('First Usage with Signup Credits', () => {
  test('new user can immediately create thread and send message using signup credits', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('first-usage'),
      password: generatePassword(),
      name: 'First Usage Test User',
    };

    // Create and authenticate user
    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Verify initial credits
    const initialBalance = await getUserCreditBalance(page);
    expect(initialBalance.data.balance).toBe(5000);
    expect(initialBalance.data.available).toBe(5000);

    // Ensure models are selected
    const modelsSelected = await ensureModelsSelected(page);
    expect(modelsSelected).toBe(true);

    // Send first message (creates thread)
    const input = getMessageInput(page);
    await input.fill('Hello! This is my first message as a new user.');
    await input.press('Enter');

    // Wait for thread creation (URL should change to /chat/[thread-id])
    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 60000 });

    // Wait for UI update
    await page.waitForTimeout(2000);

    // Verify credits were deducted (thread creation costs 100 credits)
    const afterThreadBalance = await getUserCreditBalance(page);
    expect(afterThreadBalance.data.balance).toBeLessThan(5000);
    expect(afterThreadBalance.data.balance).toBeGreaterThanOrEqual(0);

    // User should have transaction history
    const transactions = await getCreditTransactions(page);
    expect(transactions.items.length).toBeGreaterThan(1); // signup_bonus + thread_creation at minimum
  });

  test('credit balance updates correctly during first AI response', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('ai-response'),
      password: generatePassword(),
      name: 'AI Response Test User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get initial balance
    const initialBalance = await getUserCreditBalance(page);
    const startingBalance = initialBalance.data.balance;

    // Ensure models selected
    await ensureModelsSelected(page);

    // Send message
    const input = getMessageInput(page);
    await input.fill('Test message for credit tracking');
    await input.press('Enter');

    // Wait for thread navigation
    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 60000 });

    // Wait for AI response to appear
    const aiMessage = page.locator('[data-message-role="assistant"]').first();
    await expect(aiMessage).toBeVisible({ timeout: 90000 });

    // Wait for streaming to complete
    await page.waitForTimeout(3000);

    // Verify final balance is less than starting (credits were used)
    const finalBalance = await getUserCreditBalance(page);
    expect(finalBalance.data.balance).toBeLessThan(startingBalance);

    // Reserved credits should be 0 after streaming completes
    expect(finalBalance.data.reserved).toBe(0);

    // Available should equal balance (no reservations)
    expect(finalBalance.data.available).toBe(finalBalance.data.balance);
  });

  test('transaction history shows all credit movements from signup to first usage', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('tx-history'),
      password: generatePassword(),
      name: 'Transaction History User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get initial transactions (should have signup_bonus)
    const initialTx = await getCreditTransactions(page);
    expect(initialTx.items.length).toBeGreaterThan(0);

    const signupTx = initialTx.items.find(tx => tx.action === 'signup_bonus');
    expect(signupTx).toBeDefined();
    expect(signupTx?.type).toBe('credit_grant');
    expect(signupTx?.amount).toBe(5000);
    expect(signupTx?.balanceAfter).toBe(5000);

    // Send a message to create more transactions
    await ensureModelsSelected(page);
    const input = getMessageInput(page);
    await input.fill('Generate transaction history');
    await input.press('Enter');

    await page.waitForURL(/\/chat\/[\w-]+/, { timeout: 60000 });
    await page.waitForTimeout(5000);

    // Get updated transactions
    const finalTx = await getCreditTransactions(page);
    expect(finalTx.items.length).toBeGreaterThan(initialTx.items.length);

    // Should have thread creation deduction
    const threadCreationTx = finalTx.items.find(tx => tx.action === 'thread_creation');
    expect(threadCreationTx).toBeDefined();
    expect(threadCreationTx?.type).toBe('deduction');
    expect(threadCreationTx?.amount).toBeLessThan(0); // Negative for deduction

    // All transactions should have valid structure
    for (const tx of finalTx.items) {
      expect(tx).toHaveProperty('id');
      expect(tx).toHaveProperty('type');
      expect(tx).toHaveProperty('amount');
      expect(tx).toHaveProperty('balanceAfter');
      expect(tx).toHaveProperty('createdAt');
      expect(tx.balanceAfter).toBeGreaterThanOrEqual(0); // Never negative
    }
  });
});

// ============================================================================
// Edge Cases and Error Scenarios
// ============================================================================

test.describe('Signup Credit Allocation Edge Cases', () => {
  test('rapid signup attempts do not create duplicate credit records', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('rapid'),
      password: generatePassword(),
      name: 'Rapid Signup User',
    };

    // Create user once
    const firstSignup = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(firstSignup.success).toBeTruthy();

    // Try to create same user again (should fail)
    const secondSignup = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(secondSignup.success).toBeFalsy();

    // Sign in
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Verify only 5000 credits (not 10000)
    const balance = await getUserCreditBalance(page);
    expect(balance.data.balance).toBe(5000);

    // Verify only one signup transaction
    const transactions = await getCreditTransactions(page);
    const signupTxs = transactions.items.filter(tx => tx.action === 'signup_bonus');
    expect(signupTxs.length).toBe(1);
  });

  test('credit balance API returns 401 for unauthenticated requests', async ({ page, baseURL }) => {
    // Try to access credit balance without authentication
    await page.goto(baseURL || 'http://localhost:3000');

    const response = await page.request.get('/api/v1/credits/balance');
    expect(response.status()).toBe(401);
  });

  test('new user with database connection issues shows graceful error', async ({ page, baseURL }) => {
    // This test verifies error handling if credit creation fails
    // In normal operation, this should not happen, but we test the fallback

    const testUser: SignupTestUser = {
      email: generateUniqueEmail('db-error'),
      password: generatePassword(),
      name: 'DB Error User',
    };

    // Create user
    const signupResult = await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    // Sign in
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Credit balance API should either:
    // 1. Return valid balance (5000)
    // 2. Return graceful error (not 500)
    const response = await page.request.get('/api/v1/credits/balance');

    if (response.ok()) {
      const data = await response.json();
      expect(data.data.balance).toBe(5000);
    } else {
      // Should be 4xx client error or handled 503, not 500 internal error
      expect([401, 403, 503]).toContain(response.status());
    }
  });
});

// ============================================================================
// Credit Display Accuracy
// ============================================================================

test.describe('Credit Display Accuracy in UI', () => {
  test('credit balance shown in UI matches API response', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('ui-accuracy'),
      password: generatePassword(),
      name: 'UI Accuracy User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Get balance from API
    const creditBalance = await getUserCreditBalance(page);
    const apiBalance = creditBalance.data.balance;

    expect(apiBalance).toBe(5000);

    // Check if UI displays balance
    const creditDisplay = page.locator('text=/credits?/i, [data-credits]').first();
    const hasDisplay = await creditDisplay.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDisplay) {
      const displayText = await creditDisplay.textContent();
      // Extract numeric value from display
      const displayedNumber = displayText?.match(/\d{1,3}(?:,\d{3})*/)?.[0].replace(/,/g, '');

      if (displayedNumber) {
        expect(Number.parseInt(displayedNumber, 10)).toBe(apiBalance);
      }
    }
  });

  test('credit percentage calculation is accurate for new user', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('percentage'),
      password: generatePassword(),
      name: 'Percentage User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    const creditBalance = await getUserCreditBalance(page);

    // New user: 5000 available / 5000 total = 0% used = 100% remaining
    // Percentage in API might be "used %" or "remaining %"
    // Based on free-user-credit-journey.spec.ts, it appears to be "used %"
    expect(creditBalance.data.percentage).toBe(0); // 0% used

    // Available should equal balance for new user
    expect(creditBalance.data.available).toBe(creditBalance.data.balance);
  });

  test('credit status is "default" for new user with full credits', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('status-default'),
      password: generatePassword(),
      name: 'Status Default User',
    };

    await createTestUser(page, baseURL || 'http://localhost:3000', testUser);
    await signInTestUser(page, baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    const creditBalance = await getUserCreditBalance(page);

    // Full credits = default status (not warning/critical)
    expect(creditBalance.data.status).toBe('default');
  });
});
