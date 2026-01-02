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
 */
export const TEST_USER_FREE: TestUser = {
  id: 'e2e_user_free_001',
  email: 'e2e-free@roundtable.now',
  password: 'TestPass123',
  name: 'E2E Free User',
  tier: 'free',
};

/**
 * Pro tier test user - premium features testing
 */
export const TEST_USER_PRO: TestUser = {
  id: 'e2e_user_pro_001',
  email: 'e2e-pro@roundtable.now',
  password: 'TestPass123',
  name: 'E2E Pro User',
  tier: 'pro',
};

/**
 * Admin test user - admin functionality testing
 */
export const TEST_USER_ADMIN: TestUser = {
  id: 'e2e_user_admin_001',
  email: 'e2e-admin@roundtable.now',
  password: 'TestPass123',
  name: 'E2E Admin User',
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
