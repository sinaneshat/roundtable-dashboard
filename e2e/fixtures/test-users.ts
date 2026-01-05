/**
 * E2E Test User Credentials
 * These users are seeded in seed-local.sql for Playwright testing
 *
 * IMPORTANT: These credentials are ONLY for local E2E testing
 * Never use these in production or commit real credentials
 */

export type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  tier: 'free' | 'pro' | 'admin';
};

/**
 * Free tier test user - basic functionality testing
 * Using @roundtable.now domain to pass email whitelist restrictions
 */
export const TEST_USER_FREE: TestUser = {
  id: 'e2e_user_free_001',
  email: 'e2e-free-test@roundtable.now',
  password: 'E2ETestPass123!',
  name: 'E2E Free Test User',
  tier: 'free',
};

/**
 * Pro tier test user - premium features testing
 * Using @roundtable.now domain to pass email whitelist restrictions
 */
export const TEST_USER_PRO: TestUser = {
  id: 'e2e_user_pro_001',
  email: 'e2e-pro-test@roundtable.now',
  password: 'E2ETestPass123!',
  name: 'E2E Pro Test User',
  tier: 'pro',
};

/**
 * Admin test user - admin functionality testing
 * Using @roundtable.now domain to pass email whitelist restrictions
 */
export const TEST_USER_ADMIN: TestUser = {
  id: 'e2e_user_admin_001',
  email: 'e2e-admin-test@roundtable.now',
  password: 'E2ETestPass123!',
  name: 'E2E Admin Test User',
  tier: 'admin',
};

/**
 * All test users for iteration
 */
export const ALL_TEST_USERS = [TEST_USER_FREE, TEST_USER_PRO, TEST_USER_ADMIN] as const;

/**
 * Get test user by tier
 */
export function getTestUserByTier(tier: TestUser['tier']): TestUser {
  switch (tier) {
    case 'free':
      return TEST_USER_FREE;
    case 'pro':
      return TEST_USER_PRO;
    case 'admin':
      return TEST_USER_ADMIN;
    default:
      return TEST_USER_FREE;
  }
}
