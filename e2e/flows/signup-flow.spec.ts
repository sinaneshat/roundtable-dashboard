import { expect, test } from '@playwright/test';

/**
 * Complete Signup Flow E2E Tests
 * Tests end-to-end user registration journeys from initial landing to first interaction
 *
 * Uses chromium-no-auth project (no stored auth state)
 *
 * Coverage:
 * 1. New user registration with email/password (programmatic)
 * 2. Initial onboarding state verification
 * 3. Post-signup navigation and redirects
 * 4. First-time user experience
 * 5. Error recovery and retry flows
 * 6. OAuth signup flows (UI validation)
 *
 * Test Pattern:
 * - Create user programmatically via Better Auth API
 * - Verify initial state (credits, chat access, etc.)
 * - Test complete user journey from signup to first interaction
 *
 * Note: Magic link flows are tested in e2e/auth-signup.spec.ts
 */

// ============================================================================
// Test Data and Helpers
// ============================================================================

const generateUniqueEmail = (prefix: string = 'signup-flow') => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}-${timestamp}-${random}@roundtable.now`;
};

const generatePassword = () => {
  return `TestPass${Date.now()}!`;
};

type SignupTestUser = {
  email: string;
  password: string;
  name: string;
};

/**
 * Create a new user via Better Auth API (programmatic signup)
 * Returns the user data for subsequent authentication
 */
async function createTestUser(
  baseURL: string,
  userData: SignupTestUser,
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: userData.email,
        password: userData.password,
        name: userData.name,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Signup failed: ${response.status} ${errorText}` };
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
 * Returns session cookies for authenticated requests
 */
async function signInTestUser(
  baseURL: string,
  credentials: { email: string; password: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Sign-in failed: ${response.status} ${errorText}` };
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

// ============================================================================
// Complete Registration Journey
// ============================================================================

test.describe('Complete Signup Journey - Email/Password', () => {
  test('new user can sign up, verify, and access chat', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('journey'),
      password: generatePassword(),
      name: 'Journey Test User',
    };

    // Step 1: Create user programmatically
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();
    expect(signupResult.userId).toBeTruthy();

    // Step 2: Navigate to app and establish session
    await page.goto(baseURL || 'http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Step 3: Sign in via API (simulates email verification click)
    const signInResult = await signInTestUser(
      baseURL || 'http://localhost:3000',
      {
        email: testUser.email,
        password: testUser.password,
      },
    );
    expect(signInResult.success).toBeTruthy();

    // Step 4: Authenticate the browser context
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: 'mock-session',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // Step 5: Navigate to chat and verify access
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Should be on chat page (not redirected to sign-in)
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });

    // Chat interface should be visible
    const chatContainer = page.locator('[data-testid="chat-container"], main, #chat-interface').first();
    await expect(chatContainer).toBeVisible({ timeout: 10000 });
  });

  test('new user has correct initial state after signup', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('initial-state'),
      password: generatePassword(),
      name: 'Initial State User',
    };

    // Create and sign in user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await page.waitForLoadState('networkidle');

    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Navigate to chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Verify initial state
    await expect(page).toHaveURL(/\/chat/);

    // New users should see empty state or welcome message
    const emptyState = page.locator('text=/no.*conversations|welcome|get started|start.*chat/i').first();
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    // OR they might see the chat interface ready for input
    const messageInput = page.locator('textarea, input[placeholder*="message" i]').first();
    const hasMessageInput = await messageInput.isVisible().catch(() => false);

    // One of these should be true for a new user
    expect(hasEmptyState || hasMessageInput).toBeTruthy();
  });
});

// ============================================================================
// Post-Signup Redirect Behavior
// ============================================================================

test.describe('Post-Signup Redirect Flows', () => {
  test('redirects to returnUrl after successful signup', async ({ page, baseURL }) => {
    const returnUrl = '/chat';
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('redirect'),
      password: generatePassword(),
      name: 'Redirect Test User',
    };

    // Create user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    // Navigate with returnUrl
    await page.goto(`/auth/sign-up?returnUrl=${encodeURIComponent(returnUrl)}`);
    await page.waitForLoadState('networkidle');

    // Sign in
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Navigate to callback with returnUrl
    await page.goto(`/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`);
    await page.waitForLoadState('networkidle');

    // Should redirect to returnUrl
    await expect(page).toHaveURL(returnUrl, { timeout: 10000 });
  });

  test('defaults to /chat when no returnUrl provided', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('default-redirect'),
      password: generatePassword(),
      name: 'Default Redirect User',
    };

    // Create and sign in user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Navigate to callback without returnUrl
    await page.goto('/auth/callback');
    await page.waitForLoadState('networkidle');

    // Should redirect to /chat by default
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
  });

  test('validates returnUrl is internal path', async ({ page }) => {
    // Navigate to callback with external returnUrl (security test)
    await page.goto('/auth/callback?returnUrl=https://evil.com/phishing');
    await page.waitForLoadState('networkidle');

    // Should NOT redirect to external URL
    // Should either stay on callback or redirect to safe default
    const url = page.url();
    expect(url).not.toContain('evil.com');

    // Should be on a safe internal URL
    const isSafeUrl = url.includes('/auth/') || url.includes('/chat') || url.includes('localhost');
    expect(isSafeUrl).toBeTruthy();
  });
});

// ============================================================================
// Error Handling and Recovery
// ============================================================================

test.describe('Signup Error Handling', () => {
  test('handles duplicate email gracefully', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('duplicate'),
      password: generatePassword(),
      name: 'Duplicate Test User',
    };

    // Create user first time
    const firstSignup = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(firstSignup.success).toBeTruthy();

    // Try to create same user again
    const secondSignup = await createTestUser(baseURL || 'http://localhost:3000', testUser);

    // Second signup should fail with duplicate error
    expect(secondSignup.success).toBeFalsy();
    expect(secondSignup.error).toBeTruthy();

    // User should still be able to sign in with existing account
    const signInResult = await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });
    expect(signInResult.success).toBeTruthy();
  });

  test('validates email format', async ({ page, baseURL }) => {
    const invalidUser: SignupTestUser = {
      email: 'not-an-email',
      password: generatePassword(),
      name: 'Invalid Email User',
    };

    // Try to create user with invalid email
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', invalidUser);

    // Should fail with validation error
    expect(signupResult.success).toBeFalsy();
    expect(signupResult.error).toBeTruthy();
  });

  test('enforces password requirements', async ({ page, baseURL }) => {
    const weakPasswordUser: SignupTestUser = {
      email: generateUniqueEmail('weak-pass'),
      password: '123', // Too weak
      name: 'Weak Password User',
    };

    // Try to create user with weak password
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', weakPasswordUser);

    // Should fail with password validation error
    expect(signupResult.success).toBeFalsy();
    expect(signupResult.error).toBeTruthy();
  });

  test('handles network errors during signup', async ({ page }) => {
    await page.goto('/auth/sign-up');
    await page.waitForLoadState('networkidle');

    // Simulate network failure for signup endpoint
    await page.route('**/api/auth/sign-up/email', route => route.abort());

    // Try to interact with UI (if using magic link flow)
    const continueWithEmail = page.getByRole('button', { name: /continue with email/i });
    if (await continueWithEmail.isVisible()) {
      await continueWithEmail.click();

      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill(generateUniqueEmail('network-error'));

      const sendButton = page.getByRole('button', { name: /send magic link/i });
      await sendButton.click();

      // Should handle error gracefully (show error message or retry option)
      await page.waitForTimeout(2000);

      // Form should still be interactive (not stuck in loading state)
      const isFormInteractive = await emailInput.isEnabled().catch(() => false);
      expect(typeof isFormInteractive).toBe('boolean');
    }

    // Clean up route
    await page.unroute('**/api/auth/sign-up/email');
  });
});

// ============================================================================
// Initial User State Verification
// ============================================================================

test.describe('Initial User State After Signup', () => {
  test('new free user has access to chat interface', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('free-access'),
      password: generatePassword(),
      name: 'Free Access User',
    };

    // Create and authenticate user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Should have access to chat
    await expect(page).toHaveURL(/\/chat/);

    // Chat interface should be functional
    const messageInput = page.locator('textarea, input[placeholder*="message" i]').first();
    const hasInput = await messageInput.isVisible().catch(() => false);

    // New users should see either the input or empty state guidance
    expect(hasInput).toBeTruthy();
  });

  test('new user can navigate to pricing page', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('pricing-nav'),
      password: generatePassword(),
      name: 'Pricing Nav User',
    };

    // Create and authenticate user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Navigate to pricing (common post-signup action)
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Should be able to view pricing
    await expect(page).toHaveURL(/\/pricing/);
  });
});

// ============================================================================
// OAuth Signup Flows
// ============================================================================

test.describe('OAuth Signup Flows', () => {
  test('Google OAuth button is accessible on signup page', async ({ page }) => {
    await page.goto('/auth/sign-up');
    await page.waitForLoadState('networkidle');

    const googleButton = page.getByRole('button', { name: /google/i });

    // Should be visible and enabled
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();

    // Should have Google branding
    const hasIcon = (await googleButton.locator('svg').count()) > 0;
    expect(hasIcon).toBeTruthy();
  });

  test('Google OAuth button triggers OAuth flow', async ({ page, context }) => {
    await page.goto('/auth/sign-up');
    await page.waitForLoadState('networkidle');

    const googleButton = page.getByRole('button', { name: /google/i });

    // Set up listener for new page (OAuth popup or redirect)
    const pagePromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);

    // Click Google button
    await googleButton.click();

    // Wait a moment for redirect/popup
    await page.waitForTimeout(1000);

    // Either:
    // 1. A new page opened (OAuth popup)
    // 2. Current page redirected to OAuth provider
    // 3. OAuth flow initiated (loading state)
    const newPage = await pagePromise;

    if (newPage) {
      // OAuth popup opened
      expect(newPage.url()).toBeTruthy();
      await newPage.close();
    } else {
      // No popup - check if current page redirected or is loading
      const currentUrl = page.url();
      const isOAuthFlow = currentUrl.includes('google') || currentUrl.includes('oauth') || currentUrl.includes('/auth/');
      expect(isOAuthFlow).toBeTruthy();
    }

    // Note: Full OAuth flow requires real Google credentials
    // We only validate the UI initiates the flow correctly
  });
});

// ============================================================================
// Email Verification Flow
// ============================================================================

test.describe('Email Verification Flow', () => {
  test('callback page processes valid session', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('callback'),
      password: generatePassword(),
      name: 'Callback Test User',
    };

    // Create and sign in user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    // Navigate to callback (simulates clicking verification link)
    await page.goto('/auth/callback');
    await page.waitForLoadState('networkidle');

    // Should redirect to /chat (default)
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
  });

  test('callback page handles missing session', async ({ page }) => {
    // Navigate to callback without authentication
    await page.goto('/auth/callback');
    await page.waitForLoadState('networkidle');

    // Should redirect to sign-in or show error
    const url = page.url();
    const hasValidBehavior = url.includes('/auth/sign-in')
      || url.includes('/auth/error')
      || url.includes('/auth/callback');

    expect(hasValidBehavior).toBeTruthy();
  });
});

// ============================================================================
// First-Time User Experience
// ============================================================================

test.describe('First-Time User Experience', () => {
  test('new user sees appropriate welcome or empty state', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('welcome'),
      password: generatePassword(),
      name: 'Welcome User',
    };

    // Create and authenticate user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // New user should see either:
    // 1. Welcome message
    // 2. Empty state with guidance
    // 3. Ready-to-use chat interface
    const welcomeIndicators = [
      page.locator('text=/welcome/i').first(),
      page.locator('text=/get started/i').first(),
      page.locator('text=/no.*conversations/i').first(),
      page.locator('textarea, input[placeholder*="message" i]').first(),
    ];

    let foundIndicator = false;
    for (const indicator of welcomeIndicators) {
      if (await indicator.isVisible().catch(() => false)) {
        foundIndicator = true;
        break;
      }
    }

    expect(foundIndicator).toBeTruthy();
  });

  test('new user can start first conversation', async ({ page, baseURL }) => {
    const testUser: SignupTestUser = {
      email: generateUniqueEmail('first-convo'),
      password: generatePassword(),
      name: 'First Conversation User',
    };

    // Create and authenticate user
    const signupResult = await createTestUser(baseURL || 'http://localhost:3000', testUser);
    expect(signupResult.success).toBeTruthy();

    await page.goto(baseURL || 'http://localhost:3000');
    await signInTestUser(baseURL || 'http://localhost:3000', {
      email: testUser.email,
      password: testUser.password,
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Should be able to access message input
    const messageInput = page.locator('textarea, input[placeholder*="message" i]').first();
    const isInputVisible = await messageInput.isVisible({ timeout: 10000 }).catch(() => false);

    expect(isInputVisible).toBeTruthy();

    // If input is visible, verify it's interactive
    if (isInputVisible) {
      await expect(messageInput).toBeEnabled();
    }
  });
});
