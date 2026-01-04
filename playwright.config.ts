import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * Following Next.js official patterns for App Router testing
 *
 * Project Structure:
 * - setup: Global auth setup (runs once before all tests)
 * - chromium: Authenticated tests with stored auth state
 * - chromium-no-auth: Unauthenticated tests (auth flows, public pages)
 *
 * @see https://nextjs.org/docs/app/guides/testing/playwright
 * @see https://playwright.dev/docs/auth
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Global setup - authenticates test users before running tests
  globalSetup: './e2e/global-setup.ts',

  // Global teardown - cleans up E2E test data after tests complete
  globalTeardown: './e2e/global-teardown.ts',

  // Reporter configuration
  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report' }], ['github'], ['list']]
    : [['html', { outputFolder: 'playwright-report' }], ['list']],

  // Shared settings for all projects
  use: {
    // Base URL
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on retry
    video: 'on-first-retry',

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Timeout for actions
    actionTimeout: 10000,

    // Timeout for navigation
    navigationTimeout: 30000,
  },

  // Configure projects for different test scenarios
  projects: [
    // ====== AUTHENTICATED TESTS ======
    // Tests that require logged-in user (chat flows, dashboard, etc.)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use stored auth state from free user by default
        storageState: '.playwright/auth/free-user.json',
      },
      // Match tests in flows subdirectory requiring authentication
      testMatch: /.*\/flows\/.*\.spec\.ts$/,
    },

    // ====== UNAUTHENTICATED TESTS ======
    // Tests for auth pages, public pages, smoke tests
    {
      name: 'chromium-no-auth',
      use: {
        ...devices['Desktop Chrome'],
      },
      // Match auth, smoke, and navigation tests at root level
      testMatch: /.*\/(auth|smoke|navigation)\.spec\.ts$/,
    },

    // ====== PRO USER TESTS ======
    // Tests requiring pro tier features (create e2e/pro/ directory when needed)
    {
      name: 'chromium-pro',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/auth/pro-user.json',
      },
      testMatch: /.*\/pro\/.*\.spec\.ts$/,
    },

    // ====== ADMIN TESTS ======
    // Tests requiring admin access (create e2e/admin/ directory when needed)
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/auth/admin-user.json',
      },
      testMatch: /.*\/admin\/.*\.spec\.ts$/,
    },

    // Uncomment to add mobile viewport tests
    // {
    //   name: 'mobile-chrome',
    //   use: {
    //     ...devices['Pixel 5'],
    //     storageState: '.playwright/auth/free-user.json',
    //   },
    //   testMatch: /.*\/mobile\/.*\.spec\.ts$/,
    // },
  ],

  // Run local dev server before starting tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 min timeout for dev server startup
    stdout: 'pipe',
    stderr: 'pipe',
  },

  // Output folder for test artifacts
  outputDir: 'test-results',

  // Global timeout for each test
  timeout: 60 * 1000, // 60s for complex chat flows

  // Expect timeout
  expect: {
    timeout: 10 * 1000,
  },
});
