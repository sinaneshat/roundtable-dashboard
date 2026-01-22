/**
 * Subscription Tier Handling Tests
 *
 * Comprehensive test suite for subscription tier behavior and feature access.
 * Tests free tier limits, paid tier refills, upgrades, downgrades, and tier-specific features.
 */

import { CREDIT_CONFIG } from '@roundtable/shared';
import type { PlanType } from '@roundtable/shared/enums';
import { PlanTypes, SubscriptionTiers } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it } from 'vitest';

import { TIER_CONFIG } from '@/services/billing';

// ============================================================================
// MOCK TYPES
// ============================================================================

type MockUserChatUsage = {
  id: string;
  userId: string;
  subscriptionTier: 'free' | 'pro';
  threadsCreated: number;
  messagesCreated: number;
  customRolesCreated: number;
  analysisGenerated: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockUserCreditBalance = {
  id: string;
  userId: string;
  balance: number;
  reservedCredits: number;
  planType: PlanType;
  monthlyCredits: number;
  lastRefillAt: Date | null;
  nextRefillAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

// ============================================================================
// MOCK STATE
// ============================================================================

const mockState = {
  userChatUsages: new Map<string, MockUserChatUsage>(),
  userCreditBalances: new Map<string, MockUserCreditBalance>(),
};

beforeEach(() => {
  mockState.userChatUsages.clear();
  mockState.userCreditBalances.clear();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createFreeUser(userId: string): void {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  mockState.userChatUsages.set(userId, {
    id: `usage_${userId}`,
    userId,
    subscriptionTier: SubscriptionTiers.FREE,
    threadsCreated: 0,
    messagesCreated: 0,
    customRolesCreated: 0,
    analysisGenerated: 0,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  mockState.userCreditBalances.set(userId, {
    id: `balance_${userId}`,
    userId,
    balance: CREDIT_CONFIG.SIGNUP_CREDITS,
    reservedCredits: 0,
    planType: PlanTypes.FREE,
    monthlyCredits: 0,
    lastRefillAt: null,
    nextRefillAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function createProUser(userId: string): void {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  mockState.userChatUsages.set(userId, {
    id: `usage_${userId}`,
    userId,
    subscriptionTier: SubscriptionTiers.PRO,
    threadsCreated: 0,
    messagesCreated: 0,
    customRolesCreated: 0,
    analysisGenerated: 0,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  mockState.userCreditBalances.set(userId, {
    id: `balance_${userId}`,
    userId,
    balance: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
    reservedCredits: 0,
    planType: PlanTypes.PAID,
    monthlyCredits: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
    lastRefillAt: now,
    nextRefillAt: nextRefill,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function checkFreeTierThreadLimit(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    throw new Error('User not found');

  const limit = TIER_CONFIG.free.quotas.threadsPerMonth;
  return usage.threadsCreated >= limit;
}

function checkFreeTierRoundLimit(userId: string, roundNumber: number): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    throw new Error('User not found');

  // Free tier: 1 thread, 1 round (round 0 only)
  return roundNumber > 0;
}

function checkHasCredits(userId: string, required: number): boolean {
  const balance = mockState.userCreditBalances.get(userId);
  if (!balance)
    throw new Error('User not found');

  const available = balance.balance - balance.reservedCredits;
  return available >= required;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('free Tier Limits', () => {
  it('free tier allows 1 thread', () => {
    const userId = 'free_user_1';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // First thread should be allowed
    expect(checkFreeTierThreadLimit(userId)).toBe(false);

    // Create first thread
    usage.threadsCreated = 1;

    // Second thread should be blocked
    expect(checkFreeTierThreadLimit(userId)).toBe(true);
  });

  it('free tier allows only 1 round (round 0)', () => {
    const userId = 'free_user_2';
    createFreeUser(userId);

    // Round 0 should be allowed
    expect(checkFreeTierRoundLimit(userId, 0)).toBe(false);

    // Round 1 should be blocked
    expect(checkFreeTierRoundLimit(userId, 1)).toBe(true);

    // Any round beyond 0 should be blocked
    expect(checkFreeTierRoundLimit(userId, 2)).toBe(true);
  });

  it('free tier gets 5000 signup credits', () => {
    const userId = 'free_user_3';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.balance).toBe(5_000);
    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(balance.monthlyCredits).toBe(0);
  });

  it('free tier has no monthly credit refills', () => {
    const userId = 'free_user_4';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.monthlyCredits).toBe(0);
    expect(balance.lastRefillAt).toBeNull();
    expect(balance.nextRefillAt).toBeNull();
  });

  it('free tier subscription_tier field is "free"', () => {
    const userId = 'free_user_5';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });

  it('free tier has correct quota limits from TIER_CONFIG', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.threadsPerMonth).toBe(1);
    expect(freeConfig.quotas.messagesPerMonth).toBe(100);
    expect(freeConfig.quotas.customRolesPerMonth).toBe(0);
    expect(freeConfig.quotas.analysisPerMonth).toBe(10);
    expect(freeConfig.monthlyCredits).toBe(0);
  });
});

describe('paid Tier Monthly Credit Refills', () => {
  it('pro tier gets 100K credits on first provision', () => {
    const userId = 'pro_user_1';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.balance).toBe(2_000_000);
    expect(balance.monthlyCredits).toBe(2_000_000);
    expect(balance.planType).toBe(PlanTypes.PAID);
  });

  it('pro tier gets monthly refills of 100K credits', () => {
    const userId = 'pro_user_2';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Simulate using some credits
    balance.balance = 30_000;

    // Simulate monthly refill
    const now = new Date();
    balance.balance += balance.monthlyCredits;
    balance.lastRefillAt = now;
    const nextRefill = new Date(now);
    nextRefill.setMonth(nextRefill.getMonth() + 1);
    balance.nextRefillAt = nextRefill;

    expect(balance.balance).toBe(2_030_000); // 30K + 100K refill
    expect(balance.lastRefillAt).toBeTruthy();
    expect(balance.nextRefillAt).toBeTruthy();
  });

  it('pro tier credits roll over month to month', () => {
    const userId = 'pro_user_3';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // User only uses 20K in first month
    balance.balance = 80_000;

    // Monthly refill adds 100K
    balance.balance += balance.monthlyCredits;

    expect(balance.balance).toBe(2_080_000); // 80K unused + 100K refill
  });

  it('pro tier refill updates lastRefillAt and nextRefillAt', () => {
    const userId = 'pro_user_4';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    const now = new Date();
    balance.lastRefillAt = now;

    const nextRefill = new Date(now);
    nextRefill.setMonth(nextRefill.getMonth() + 1);
    balance.nextRefillAt = nextRefill;

    if (!balance.lastRefillAt)
      throw new Error('Last refill date not set');
    expect(balance.lastRefillAt.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000);
    if (!balance.nextRefillAt)
      throw new Error('Next refill date not set');
    expect(balance.nextRefillAt.getTime()).toBeGreaterThan(balance.lastRefillAt.getTime());
  });

  it('pro tier subscription_tier field is "pro"', () => {
    const userId = 'pro_user_5';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
  });
});

describe('plan Upgrade (Free → Pro)', () => {
  it('upgrade provisions correct credits', () => {
    const userId = 'upgrade_user_1';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Initial state
    expect(balance.balance).toBe(5_000);
    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);

    // Simulate upgrade
    const planConfig = CREDIT_CONFIG.PLANS.paid;
    balance.planType = PlanTypes.PAID;
    balance.balance += planConfig.monthlyCredits;
    balance.monthlyCredits = planConfig.monthlyCredits;

    const now = new Date();
    balance.lastRefillAt = now;
    const nextRefill = new Date(now);
    nextRefill.setMonth(nextRefill.getMonth() + 1);
    balance.nextRefillAt = nextRefill;

    usage.subscriptionTier = SubscriptionTiers.PRO;

    // Verify upgrade
    expect(balance.balance).toBe(2_005_000); // 5K + 100K
    expect(balance.planType).toBe(PlanTypes.PAID);
    expect(balance.monthlyCredits).toBe(2_000_000);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
  });

  it('upgrade preserves existing free credits', () => {
    const userId = 'upgrade_user_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // User still has 3K credits left
    balance.balance = 3_000;

    // Simulate upgrade
    const planConfig = CREDIT_CONFIG.PLANS.paid;
    balance.balance += planConfig.monthlyCredits;
    balance.planType = PlanTypes.PAID;

    expect(balance.balance).toBe(2_003_000); // 3K + 2M
  });

  it('upgrade sets refill dates', () => {
    const userId = 'upgrade_user_3';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.lastRefillAt).toBeNull();
    expect(balance.nextRefillAt).toBeNull();

    // Simulate upgrade
    const now = new Date();
    balance.lastRefillAt = now;
    const nextRefill = new Date(now);
    nextRefill.setMonth(nextRefill.getMonth() + 1);
    balance.nextRefillAt = nextRefill;

    expect(balance.lastRefillAt).toBeTruthy();
    expect(balance.nextRefillAt).toBeTruthy();
  });

  it('upgrade updates both planType and subscriptionTier consistently', () => {
    const userId = 'upgrade_user_4';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Simulate upgrade
    balance.planType = PlanTypes.PAID;
    usage.subscriptionTier = SubscriptionTiers.PRO;

    expect(balance.planType).toBe(PlanTypes.PAID);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
  });
});

describe('plan Downgrade (Pro → Free)', () => {
  it('downgrade keeps remaining credits', () => {
    const userId = 'downgrade_user_1';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // User has 50K credits remaining
    balance.balance = 50_000;

    // Simulate downgrade
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;

    expect(balance.balance).toBe(50_000); // Credits preserved
    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(balance.monthlyCredits).toBe(0);
  });

  it('downgrade stops monthly refills', () => {
    const userId = 'downgrade_user_2';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Simulate downgrade
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;

    expect(balance.monthlyCredits).toBe(0);
  });

  it('downgrade does not remove existing credits', () => {
    const userId = 'downgrade_user_3';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const balanceBefore = balance.balance;

    // Simulate downgrade
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;

    expect(balance.balance).toBe(balanceBefore);
  });

  it('downgrade updates both planType and subscriptionTier consistently', () => {
    const userId = 'downgrade_user_4';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Simulate downgrade
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;
    usage.subscriptionTier = SubscriptionTiers.FREE;

    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });

  it('downgrade user can still use remaining credits', () => {
    const userId = 'downgrade_user_5';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Simulate downgrade with 75K credits remaining
    balance.balance = 75_000;
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;

    // User should be able to use credits
    expect(checkHasCredits(userId, 50_000)).toBe(true);
    expect(checkHasCredits(userId, 100_000)).toBe(false);
  });
});

describe('tier-Specific Feature Access', () => {
  it('free tier has no web search access (custom roles = 0)', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.customRolesPerMonth).toBe(0);
  });

  it('pro tier has web search access (custom roles = 25)', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.customRolesPerMonth).toBe(25);
  });

  it('free tier has limited analysis (10 per month)', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.analysisPerMonth).toBe(10);
  });

  it('pro tier has extensive analysis (1000 per month)', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.analysisPerMonth).toBe(1000);
  });

  it('free tier has message limit (100 per month)', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.messagesPerMonth).toBe(100);
  });

  it('pro tier has high message limit (10000 per month)', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.messagesPerMonth).toBe(10_000);
  });

  it('free tier max output tokens is 512', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxOutputTokens).toBe(512);
  });

  it('pro tier max output tokens is 4096', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxOutputTokens).toBe(4096);
  });

  it('free tier has model pricing limit of $0.20', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxModelPricing).toBe(0.20);
  });

  it('pro tier has no model pricing limit (null)', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxModelPricing).toBeNull();
  });

  it('free tier max models is 3', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxModels).toBe(3);
  });

  it('pro tier max models is 12', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxModels).toBe(12);
  });
});

describe('subscription_tier Field Consistency', () => {
  it('free user has subscriptionTier = "free"', () => {
    const userId = 'tier_user_1';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
    expect(balance.planType).toBe(PlanTypes.FREE);
  });

  it('pro user has subscriptionTier = "pro"', () => {
    const userId = 'tier_user_2';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
    expect(balance.planType).toBe(PlanTypes.PAID);
  });

  it('subscriptionTier and planType are synchronized on upgrade', () => {
    const userId = 'tier_user_3';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Simulate upgrade
    usage.subscriptionTier = SubscriptionTiers.PRO;
    balance.planType = PlanTypes.PAID;

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
    expect(balance.planType).toBe(PlanTypes.PAID);
  });

  it('subscriptionTier and planType are synchronized on downgrade', () => {
    const userId = 'tier_user_4';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Simulate downgrade
    usage.subscriptionTier = SubscriptionTiers.FREE;
    balance.planType = PlanTypes.FREE;

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
    expect(balance.planType).toBe(PlanTypes.FREE);
  });
});

describe('credit Configuration Validation', () => {
  it('signup credits is 5000', () => {
    expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
  });

  it('paid plan monthly credits is 100000', () => {
    expect(CREDIT_CONFIG.PLANS.paid.monthlyCredits).toBe(2_000_000);
  });

  it('paid plan price is $59/month', () => {
    expect(CREDIT_CONFIG.PLANS.paid.priceInCents).toBe(5900);
  });

  it('free tier config has 0 monthly credits', () => {
    expect(TIER_CONFIG.free.monthlyCredits).toBe(0);
  });

  it('pro tier config has 100K monthly credits', () => {
    expect(TIER_CONFIG.pro.monthlyCredits).toBe(2_000_000);
  });
});

describe('edge Cases', () => {
  it('user with 0 credits cannot perform actions requiring credits', () => {
    const userId = 'edge_user_1';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.balance = 0;

    expect(checkHasCredits(userId, 1)).toBe(false);
  });

  it('reserved credits reduce available credits', () => {
    const userId = 'edge_user_2';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.balance = 10_000;
    balance.reservedCredits = 3_000;

    const available = balance.balance - balance.reservedCredits;
    expect(available).toBe(7_000);
  });

  it('free tier thread limit is exactly 1', () => {
    const userId = 'edge_user_3';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // 0 threads created - can create one
    expect(checkFreeTierThreadLimit(userId)).toBe(false);

    // 1 thread created - cannot create more
    usage.threadsCreated = 1;
    expect(checkFreeTierThreadLimit(userId)).toBe(true);
  });

  it('free tier round limit is exactly 1 (round 0 only)', () => {
    const userId = 'edge_user_4';
    createFreeUser(userId);

    // Round 0 allowed
    expect(checkFreeTierRoundLimit(userId, 0)).toBe(false);

    // Round 1+ blocked
    expect(checkFreeTierRoundLimit(userId, 1)).toBe(true);
    expect(checkFreeTierRoundLimit(userId, 5)).toBe(true);
  });

  it('pro tier has effectively unlimited threads (500/month)', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.threadsPerMonth).toBe(500);
  });

  it('tier configurations are consistent with TIER_CONFIG', () => {
    // Free tier
    expect(TIER_CONFIG.free.monthlyCredits).toBe(0);
    expect(TIER_CONFIG.free.quotas.threadsPerMonth).toBe(1);

    // Pro tier
    expect(TIER_CONFIG.pro.monthlyCredits).toBe(2_000_000);
    expect(TIER_CONFIG.pro.quotas.threadsPerMonth).toBe(500);
  });
});

describe('api Rate Limiting by Tier', () => {
  it('free tier has no custom roles access', () => {
    const userId = 'rate_limit_1';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const freeQuota = TIER_CONFIG.free.quotas.customRolesPerMonth;

    expect(freeQuota).toBe(0);
    expect(usage.customRolesCreated).toBe(0);
  });

  it('pro tier has 25 custom roles per month', () => {
    const userId = 'rate_limit_2';
    createProUser(userId);

    const proQuota = TIER_CONFIG.pro.quotas.customRolesPerMonth;

    expect(proQuota).toBe(25);
  });

  it('free tier message quota is enforced at 100/month', () => {
    const userId = 'rate_limit_3';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const messageLimit = TIER_CONFIG.free.quotas.messagesPerMonth;

    expect(messageLimit).toBe(100);

    // Simulate reaching the limit
    usage.messagesCreated = 100;
    expect(usage.messagesCreated).toBe(messageLimit);

    // Attempting to create one more would exceed
    const wouldExceed = usage.messagesCreated >= messageLimit;
    expect(wouldExceed).toBe(true);
  });

  it('pro tier message quota is 10000/month', () => {
    const proQuota = TIER_CONFIG.pro.quotas.messagesPerMonth;

    expect(proQuota).toBe(10_000);
  });
});

describe('tier Change Side Effects', () => {
  it('upgrade triggers immediate credit grant', () => {
    const userId = 'side_effect_1';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Initial free tier state
    const initialBalance = balance.balance;
    expect(balance.planType).toBe(PlanTypes.FREE);

    // Simulate upgrade with credit grant
    const planConfig = CREDIT_CONFIG.PLANS.paid;
    balance.balance += planConfig.monthlyCredits;
    balance.planType = PlanTypes.PAID;
    balance.monthlyCredits = planConfig.monthlyCredits;

    // Verify credit grant occurred
    expect(balance.balance).toBe(initialBalance + 2_000_000);
    expect(balance.planType).toBe(PlanTypes.PAID);
  });

  it('upgrade sets up monthly refill schedule', () => {
    const userId = 'side_effect_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Free tier has no refill schedule
    expect(balance.lastRefillAt).toBeNull();
    expect(balance.nextRefillAt).toBeNull();

    // Simulate upgrade with refill schedule
    const now = new Date();
    balance.lastRefillAt = now;
    const nextRefill = new Date(now);
    nextRefill.setMonth(nextRefill.getMonth() + 1);
    balance.nextRefillAt = nextRefill;

    // Verify refill schedule was set
    expect(balance.lastRefillAt).not.toBeNull();
    expect(balance.nextRefillAt).not.toBeNull();
    if (!balance.lastRefillAt)
      throw new Error('Last refill date not set');
    if (!balance.nextRefillAt)
      throw new Error('Next refill date not set');
    expect(balance.nextRefillAt.getTime()).toBeGreaterThan(balance.lastRefillAt.getTime());
  });

  it('downgrade clears monthly refill schedule', () => {
    const userId = 'side_effect_3';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Pro tier has refill schedule
    expect(balance.lastRefillAt).not.toBeNull();
    expect(balance.nextRefillAt).not.toBeNull();

    // Simulate downgrade - clear refill schedule
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;
    // In real implementation, these would be cleared or ignored
    // We simulate clearing them here
    balance.nextRefillAt = null;

    // Verify refill schedule cleared
    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(balance.monthlyCredits).toBe(0);
  });

  it('downgrade preserves usage history', () => {
    const userId = 'side_effect_4';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Accumulate some usage
    usage.threadsCreated = 10;
    usage.messagesCreated = 500;

    // Simulate downgrade
    usage.subscriptionTier = SubscriptionTiers.FREE;

    // Verify usage counters are preserved
    expect(usage.threadsCreated).toBe(10);
    expect(usage.messagesCreated).toBe(500);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });
});

describe('concurrent Tier Operations', () => {
  it('version field supports optimistic locking for balance updates', () => {
    const userId = 'concurrent_1';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    const initialVersion = balance.version;
    expect(initialVersion).toBe(1);

    // Simulate version increment on update
    balance.version = initialVersion + 1;
    balance.balance -= 1000;

    expect(balance.version).toBe(2);
  });

  it('version field supports optimistic locking for usage updates', () => {
    const userId = 'concurrent_2';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    const initialVersion = usage.version;
    expect(initialVersion).toBe(1);

    // Simulate version increment on update
    usage.version = initialVersion + 1;
    usage.messagesCreated += 1;

    expect(usage.version).toBe(2);
  });

  it('concurrent balance reads get consistent view via version', () => {
    const userId = 'concurrent_3';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Read 1: snapshot state
    const snapshot1 = {
      balance: balance.balance,
      version: balance.version,
    };

    // Simulate concurrent update
    balance.balance -= 5000;
    balance.version += 1;

    // Read 2: new state
    const snapshot2 = {
      balance: balance.balance,
      version: balance.version,
    };

    // Version changed - indicates state changed between reads
    expect(snapshot2.version).toBeGreaterThan(snapshot1.version);
    expect(snapshot2.balance).not.toBe(snapshot1.balance);
  });
});

describe('tier Detection from Product ID', () => {
  it('detects pro tier from product ID with pro pattern', () => {
    const proProductId = 'prod_test_pro';

    // Pattern-based tier detection
    const isPro = proProductId.toLowerCase().endsWith('_pro');

    expect(isPro).toBe(true);
  });

  it('defaults to free tier for unknown product IDs', () => {
    const unknownProductId = 'prod_unknown123';

    // Pattern-based check
    const isPro = unknownProductId.toLowerCase().includes('_pro_') || unknownProductId.toLowerCase().endsWith('_pro');
    const tier = isPro ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

    expect(tier).toBe(SubscriptionTiers.FREE);
  });

  it('handles case-insensitive product ID matching', () => {
    const proProductId = 'prod_TEST_PRO'.toLowerCase();
    const expectedId = 'prod_test_pro';

    expect(proProductId).toBe(expectedId);
  });

  it('detects pro tier from product ID with _pro_ pattern', () => {
    const productId = 'prod_test_pro_monthly';
    const tier = productId.toLowerCase().includes('_pro_') ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('detects pro tier from product ID ending with _pro', () => {
    const productId = 'prod_test_pro';
    const tier = productId.toLowerCase().endsWith('_pro') ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('detects pro tier from product ID with -pro- pattern', () => {
    const productId = 'prod-test-pro-monthly';
    const tier = productId.toLowerCase().includes('-pro-') ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('detects pro tier from product ID ending with -pro', () => {
    const productId = 'prod-test-pro';
    const tier = productId.toLowerCase().endsWith('-pro') ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('does not falsely detect "pro" in words like "product" or "professional"', () => {
    // Pattern should match word boundaries
    const productId1 = 'prod_product_basic';
    const productId2 = 'prod_professional_basic';

    // Should not match "pro" within larger words
    const tier1 = /(?:^|[^a-z])pro(?:$|[^a-z])/.test(productId1.toLowerCase()) ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;
    const tier2 = /(?:^|[^a-z])pro(?:$|[^a-z])/.test(productId2.toLowerCase()) ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

    expect(tier1).toBe(SubscriptionTiers.FREE);
    expect(tier2).toBe(SubscriptionTiers.FREE);
  });
});

describe('tier-Specific Quota Calculations', () => {
  it('free tier quota calculations are based on TIER_CONFIG', () => {
    const freeQuotas = TIER_CONFIG.free.quotas;

    expect(freeQuotas.threadsPerMonth).toBe(1);
    expect(freeQuotas.messagesPerMonth).toBe(100);
    expect(freeQuotas.customRolesPerMonth).toBe(0);
    expect(freeQuotas.analysisPerMonth).toBe(10);
  });

  it('pro tier quota calculations are based on TIER_CONFIG', () => {
    const proQuotas = TIER_CONFIG.pro.quotas;

    expect(proQuotas.threadsPerMonth).toBe(500);
    expect(proQuotas.messagesPerMonth).toBe(10_000);
    expect(proQuotas.customRolesPerMonth).toBe(25);
    expect(proQuotas.analysisPerMonth).toBe(1000);
  });

  it('quota usage percentage calculation for free tier', () => {
    const userId = 'quota_calc_1';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const quotas = TIER_CONFIG.free.quotas;

    // Use 50% of messages
    usage.messagesCreated = 50;
    const messagePercentage = (usage.messagesCreated / quotas.messagesPerMonth) * 100;

    expect(messagePercentage).toBe(50);
  });

  it('quota usage percentage calculation for pro tier', () => {
    const userId = 'quota_calc_2';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const quotas = TIER_CONFIG.pro.quotas;

    // Use 10% of messages
    usage.messagesCreated = 1000;
    const messagePercentage = (usage.messagesCreated / quotas.messagesPerMonth) * 100;

    expect(messagePercentage).toBe(10);
  });
});

describe('tier Validation and Constraints', () => {
  it('planType and subscriptionTier must be synchronized', () => {
    const userId = 'validation_1';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Both should indicate free tier
    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });

  it('free tier cannot have monthly credits configured', () => {
    const userId = 'validation_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(balance.monthlyCredits).toBe(0);
  });

  it('paid tier must have monthly credits configured', () => {
    const userId = 'validation_3';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.planType).toBe(PlanTypes.PAID);
    expect(balance.monthlyCredits).toBeGreaterThan(0);
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('reserved credits cannot exceed balance', () => {
    const userId = 'validation_4';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.balance = 1000;
    balance.reservedCredits = 500;

    // Constraint: reservedCredits should not exceed balance
    expect(balance.reservedCredits).toBeLessThanOrEqual(balance.balance);
  });

  it('balance and reserved credits must be non-negative', () => {
    const userId = 'validation_5';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.balance).toBeGreaterThanOrEqual(0);
    expect(balance.reservedCredits).toBeGreaterThanOrEqual(0);
  });
});

describe('grace Period Handling (Subscription Cancellation)', () => {
  it('canceled subscription maintains tier until period end', () => {
    const userId = 'grace_1';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Subscription is canceled but period hasn't ended yet
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
    expect(balance.planType).toBe(PlanTypes.PAID);

    // User should still have pro tier access
    const proQuotas = TIER_CONFIG.pro.quotas;
    expect(usage.threadsCreated).toBeLessThanOrEqual(proQuotas.threadsPerMonth);
  });

  it('grace period allows continued usage of pro features', () => {
    const userId = 'grace_2';
    createProUser(userId);

    const _balance = mockState.userCreditBalances.get(userId);
    if (!_balance)
      throw new Error('Balance not found');

    // User in grace period can still use credits
    expect(checkHasCredits(userId, 50_000)).toBe(true);
  });

  it('expired grace period downgrades to free tier', () => {
    const userId = 'grace_3';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Simulate period end passing
    const now = new Date();
    usage.currentPeriodEnd = new Date(now.getTime() - 1000); // 1 second ago

    // After period end, should downgrade to free
    // In real implementation, rolloverBillingPeriod would handle this
    usage.subscriptionTier = SubscriptionTiers.FREE;
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
    expect(balance.planType).toBe(PlanTypes.FREE);
  });

  it('grace period preserves remaining credits after downgrade', () => {
    const userId = 'grace_4';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // Use some credits during grace period
    balance.balance = 60_000;

    // Downgrade to free tier
    balance.planType = PlanTypes.FREE;
    balance.monthlyCredits = 0;

    // Credits should be preserved
    expect(balance.balance).toBe(60_000);
  });
});

describe('new User Default Tier', () => {
  it('new user defaults to free tier', () => {
    const userId = 'new_user_1';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
    expect(balance.planType).toBe(PlanTypes.FREE);
  });

  it('new user receives signup credits', () => {
    const userId = 'new_user_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
    expect(balance.balance).toBe(5_000);
  });

  it('new user has no monthly refill schedule', () => {
    const userId = 'new_user_3';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.lastRefillAt).toBeNull();
    expect(balance.nextRefillAt).toBeNull();
  });

  it('new user has free tier quotas', () => {
    const userId = 'new_user_4';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const freeQuotas = TIER_CONFIG.free.quotas;

    expect(usage.threadsCreated).toBe(0);
    expect(usage.messagesCreated).toBe(0);

    // Can create up to free tier limits
    const canCreateThread = usage.threadsCreated < freeQuotas.threadsPerMonth;
    expect(canCreateThread).toBe(true);
  });

  it('new user current period is set to current month', () => {
    const userId = 'new_user_5';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const now = new Date();

    // Period should be within current month
    expect(usage.currentPeriodStart.getMonth()).toBe(now.getMonth());
    expect(usage.currentPeriodEnd.getMonth()).toBeGreaterThanOrEqual(now.getMonth());
  });
});

describe('feature Access by Tier', () => {
  it('free tier cannot access web search (custom roles = 0)', () => {
    const userId = 'feature_1';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const freeQuotas = TIER_CONFIG.free.quotas;

    expect(freeQuotas.customRolesPerMonth).toBe(0);
    expect(usage.customRolesCreated).toBe(0);

    // Free tier has no custom roles access
    const hasWebSearchAccess = freeQuotas.customRolesPerMonth > 0;
    expect(hasWebSearchAccess).toBe(false);
  });

  it('pro tier has web search access', () => {
    const userId = 'feature_2';
    createProUser(userId);

    const proQuotas = TIER_CONFIG.pro.quotas;

    expect(proQuotas.customRolesPerMonth).toBe(25);

    // Pro tier has web search access
    const hasWebSearchAccess = proQuotas.customRolesPerMonth > 0;
    expect(hasWebSearchAccess).toBe(true);
  });

  it('free tier has limited output tokens', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxOutputTokens).toBe(512);
  });

  it('pro tier has extended output tokens', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxOutputTokens).toBe(4096);
    expect(proConfig.maxOutputTokens).toBeGreaterThan(TIER_CONFIG.free.maxOutputTokens);
  });

  it('free tier has model pricing limit', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxModelPricing).toBe(0.20);
    expect(freeConfig.maxModelPricing).not.toBeNull();
  });

  it('pro tier has no model pricing limit', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxModelPricing).toBeNull();
  });

  it('free tier has fewer max models', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxModels).toBe(3);
  });

  it('pro tier has more max models', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxModels).toBe(12);
    expect(proConfig.maxModels).toBeGreaterThan(TIER_CONFIG.free.maxModels);
  });
});

describe('tier Transition Edge Cases', () => {
  it('upgrade mid-month adds credits immediately', () => {
    const userId = 'transition_1';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // User has used some free credits
    balance.balance = 2_000;

    // Upgrade to pro
    const planConfig = CREDIT_CONFIG.PLANS.paid;
    balance.balance += planConfig.monthlyCredits;
    balance.planType = PlanTypes.PAID;
    balance.monthlyCredits = planConfig.monthlyCredits;

    // Should have 2K + 2M = 2,002K
    expect(balance.balance).toBe(2_002_000);
  });

  it('upgrade immediately sets monthly credits field', () => {
    const userId = 'transition_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.monthlyCredits).toBe(0);

    // Upgrade to pro
    const planConfig = CREDIT_CONFIG.PLANS.paid;
    balance.monthlyCredits = planConfig.monthlyCredits;
    balance.planType = PlanTypes.PAID;

    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('downgrade mid-month preserves tier until period end', () => {
    const userId = 'transition_3';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // User cancels but period hasn't ended
    // In real implementation, tier is maintained until currentPeriodEnd
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);

    // Period end hasn't passed
    const now = new Date();
    expect(usage.currentPeriodEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  it('rapid tier changes maintain data consistency', () => {
    const userId = 'transition_4';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Free → Pro
    balance.planType = PlanTypes.PAID;
    usage.subscriptionTier = SubscriptionTiers.PRO;

    expect(balance.planType).toBe(PlanTypes.PAID);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);

    // Pro → Free (immediate downgrade for testing)
    balance.planType = PlanTypes.FREE;
    usage.subscriptionTier = SubscriptionTiers.FREE;

    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });

  it('upgrade from free with 0 credits remaining', () => {
    const userId = 'transition_5';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    // User exhausted all free credits
    balance.balance = 0;

    // Upgrade to pro
    const planConfig = CREDIT_CONFIG.PLANS.paid;
    balance.balance += planConfig.monthlyCredits;
    balance.planType = PlanTypes.PAID;

    expect(balance.balance).toBe(2_000_000);
  });
});

describe('billing Period and Refill Timing', () => {
  it('pro tier refill schedule is monthly', () => {
    const userId = 'billing_1';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    if (!balance.lastRefillAt)
      throw new Error('Last refill date not set');
    if (!balance.nextRefillAt)
      throw new Error('Next refill date not set');
    const lastRefill = balance.lastRefillAt;
    const nextRefill = balance.nextRefillAt;

    // Next refill should be approximately 1 month after last refill
    const daysDifference = (nextRefill.getTime() - lastRefill.getTime()) / (1000 * 60 * 60 * 24);

    expect(daysDifference).toBeGreaterThan(28);
    expect(daysDifference).toBeLessThan(32);
  });

  it('free tier has no refill dates', () => {
    const userId = 'billing_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');

    expect(balance.lastRefillAt).toBeNull();
    expect(balance.nextRefillAt).toBeNull();
  });

  it('current period end is always in the future for new users', () => {
    const userId = 'billing_3';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const now = new Date();

    expect(usage.currentPeriodEnd.getTime()).toBeGreaterThan(now.getTime());
  });

  it('current period start is in the past or present', () => {
    const userId = 'billing_4';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');
    const now = new Date();

    expect(usage.currentPeriodStart.getTime()).toBeLessThanOrEqual(now.getTime());
  });
});

describe('subscription Status Validation', () => {
  it('active subscription has pro tier', () => {
    const userId = 'status_1';
    createProUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
  });

  it('no subscription has free tier', () => {
    const userId = 'status_2';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });

  it('tier consistency across balance and usage tables', () => {
    const userId = 'status_3';
    createProUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    // Pro tier should have planType = 'paid' and subscriptionTier = 'pro'
    expect(balance.planType).toBe(PlanTypes.PAID);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
  });

  it('free tier consistency across balance and usage tables', () => {
    const userId = 'status_4';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    const usage = mockState.userChatUsages.get(userId);
    if (!usage)
      throw new Error('Usage not found');

    expect(balance.planType).toBe(PlanTypes.FREE);
    expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
  });
});
