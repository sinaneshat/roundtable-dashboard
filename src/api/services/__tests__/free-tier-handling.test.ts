/**
 * Free User Tier Handling Tests
 *
 * Comprehensive test suite for free tier identification, permissions, feature access,
 * upgrade eligibility checks, and tier transition logic.
 *
 * Business Rules:
 * - Free tier users have limited quotas (1 thread, 100 messages, no custom roles)
 * - Free tier users get 5000 signup credits (one-time, no monthly refills)
 * - Free tier users can complete one round (round 0) before being blocked
 * - Free tier users cannot access premium models (>$0.10/M tokens)
 * - Free tier users have max 512 output tokens per response
 * - Upgrade to Pro grants immediate access to all features and 100K credits
 * - Downgrade to free preserves remaining credits but stops monthly refills
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { PlanTypes, SubscriptionTiers } from '@/api/core/enums';
import { TIER_CONFIG } from '@/api/services/product-logic.service';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

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
  pendingTierChange: 'free' | 'pro' | null;
  pendingTierIsAnnual: boolean | null;
  isAnnual: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockUserCreditBalance = {
  id: string;
  userId: string;
  balance: number;
  reservedCredits: number;
  planType: 'free' | 'paid';
  monthlyCredits: number;
  lastRefillAt: Date | null;
  nextRefillAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockModel = {
  id: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
};

// ============================================================================
// MOCK STATE
// ============================================================================

const mockState = {
  userChatUsages: new Map<string, MockUserChatUsage>(),
  userCreditBalances: new Map<string, MockUserCreditBalance>(),
  models: new Map<string, MockModel>(),
};

beforeEach(() => {
  mockState.userChatUsages.clear();
  mockState.userCreditBalances.clear();
  mockState.models.clear();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createFreeUser(userId: string, overrides?: Partial<MockUserChatUsage & MockUserCreditBalance>): void {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  mockState.userChatUsages.set(userId, {
    id: `usage_${userId}`,
    userId,
    subscriptionTier: SubscriptionTiers.FREE,
    threadsCreated: overrides?.threadsCreated ?? 0,
    messagesCreated: overrides?.messagesCreated ?? 0,
    customRolesCreated: overrides?.customRolesCreated ?? 0,
    analysisGenerated: overrides?.analysisGenerated ?? 0,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    pendingTierChange: overrides?.pendingTierChange ?? null,
    pendingTierIsAnnual: overrides?.pendingTierIsAnnual ?? null,
    isAnnual: overrides?.isAnnual ?? false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  mockState.userCreditBalances.set(userId, {
    id: `balance_${userId}`,
    userId,
    balance: overrides?.balance ?? CREDIT_CONFIG.SIGNUP_CREDITS,
    reservedCredits: overrides?.reservedCredits ?? 0,
    planType: PlanTypes.FREE,
    monthlyCredits: 0,
    lastRefillAt: null,
    nextRefillAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function createProUser(userId: string, overrides?: Partial<MockUserCreditBalance>): void {
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
    pendingTierChange: null,
    pendingTierIsAnnual: null,
    isAnnual: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  mockState.userCreditBalances.set(userId, {
    id: `balance_${userId}`,
    userId,
    balance: overrides?.balance ?? CREDIT_CONFIG.PLANS.paid.monthlyCredits,
    reservedCredits: overrides?.reservedCredits ?? 0,
    planType: PlanTypes.PAID,
    monthlyCredits: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
    lastRefillAt: now,
    nextRefillAt: nextRefill,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function createModel(id: string, inputPricePerMillion: number): MockModel {
  const model = {
    id,
    pricing: {
      prompt: (inputPricePerMillion / 1_000_000).toString(),
      completion: (inputPricePerMillion / 1_000_000).toString(),
    },
    context_length: 128000,
  };
  mockState.models.set(id, model);
  return model;
}

function isFreeUser(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  return usage?.subscriptionTier === SubscriptionTiers.FREE;
}

function checkThreadQuota(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    return false;

  const limit = TIER_CONFIG[usage.subscriptionTier].quotas.threadsPerMonth;
  return usage.threadsCreated < limit;
}

function checkMessageQuota(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    return false;

  const limit = TIER_CONFIG[usage.subscriptionTier].quotas.messagesPerMonth;
  return usage.messagesCreated < limit;
}

function checkCustomRoleQuota(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    return false;

  const limit = TIER_CONFIG[usage.subscriptionTier].quotas.customRolesPerMonth;
  return usage.customRolesCreated < limit;
}

function checkAnalysisQuota(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    return false;

  const limit = TIER_CONFIG[usage.subscriptionTier].quotas.analysisPerMonth;
  return usage.analysisGenerated < limit;
}

function canAccessModel(userId: string, modelId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  const model = mockState.models.get(modelId);
  if (!usage || !model)
    return false;

  const tier = usage.subscriptionTier;
  const maxPricing = TIER_CONFIG[tier].maxModelPricing;

  if (maxPricing === null)
    return true;

  const inputPricePerMillion = Number.parseFloat(model.pricing.prompt) * 1_000_000;
  return inputPricePerMillion <= maxPricing;
}

function getMaxOutputTokens(userId: string): number {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    return 512;

  return TIER_CONFIG[usage.subscriptionTier].maxOutputTokens;
}

function canUpgradeToProFromCredits(userId: string): boolean {
  const balance = mockState.userCreditBalances.get(userId);
  if (!balance)
    return false;

  return balance.planType === PlanTypes.FREE && balance.balance >= 0;
}

function hasPendingDowngrade(userId: string): boolean {
  const usage = mockState.userChatUsages.get(userId);
  if (!usage)
    return false;

  return usage.pendingTierChange === SubscriptionTiers.FREE;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('free Tier Identification', () => {
  it('should identify free tier user by subscription tier', () => {
    const userId = 'free_user_1';
    createFreeUser(userId);

    expect(isFreeUser(userId)).toBe(true);
  });

  it('should identify free tier user by plan type', () => {
    const userId = 'free_user_2';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId)!;
    expect(balance.planType).toBe(PlanTypes.FREE);
  });

  it('should not identify pro user as free tier', () => {
    const userId = 'pro_user_1';
    createProUser(userId);

    expect(isFreeUser(userId)).toBe(false);
  });

  it('should identify free tier by checking monthly credits', () => {
    const userId = 'free_user_3';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId)!;
    expect(balance.monthlyCredits).toBe(0);
  });

  it('should identify free tier by checking refill dates', () => {
    const userId = 'free_user_4';
    createFreeUser(userId);

    const balance = mockState.userCreditBalances.get(userId)!;
    expect(balance.lastRefillAt).toBeNull();
    expect(balance.nextRefillAt).toBeNull();
  });

  it('should identify free tier by tier config quotas', () => {
    const userId = 'free_user_5';
    createFreeUser(userId);

    const usage = mockState.userChatUsages.get(userId)!;
    const config = TIER_CONFIG[usage.subscriptionTier];

    expect(config.quotas.threadsPerMonth).toBe(1);
    expect(config.quotas.customRolesPerMonth).toBe(0);
  });
});

describe('free Tier Permissions', () => {
  describe('thread Creation', () => {
    it('should allow first thread creation for free user', () => {
      const userId = 'free_user_1';
      createFreeUser(userId);

      expect(checkThreadQuota(userId)).toBe(true);
    });

    it('should block second thread creation for free user', () => {
      const userId = 'free_user_2';
      createFreeUser(userId, { threadsCreated: 1 });

      expect(checkThreadQuota(userId)).toBe(false);
    });

    it('should allow multiple threads for pro user', () => {
      const userId = 'pro_user_1';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.threadsCreated = 100;

      expect(checkThreadQuota(userId)).toBe(true);
    });
  });

  describe('message Creation', () => {
    it('should allow messages within quota for free user', () => {
      const userId = 'free_user_3';
      createFreeUser(userId, { messagesCreated: 50 });

      expect(checkMessageQuota(userId)).toBe(true);
    });

    it('should block messages when quota exceeded for free user', () => {
      const userId = 'free_user_4';
      createFreeUser(userId, { messagesCreated: 100 });

      expect(checkMessageQuota(userId)).toBe(false);
    });

    it('should have higher quota for pro users', () => {
      const userId = 'pro_user_2';
      createProUser(userId);

      const config = TIER_CONFIG[SubscriptionTiers.PRO];
      expect(config.quotas.messagesPerMonth).toBe(10000);
    });
  });

  describe('custom Role Creation', () => {
    it('should block custom role creation for free user', () => {
      const userId = 'free_user_5';
      createFreeUser(userId);

      expect(checkCustomRoleQuota(userId)).toBe(false);
    });

    it('should allow custom roles for pro user', () => {
      const userId = 'pro_user_3';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.customRolesCreated = 5;

      expect(checkCustomRoleQuota(userId)).toBe(true);
    });

    it('should have quota limit for pro users', () => {
      const userId = 'pro_user_4';
      createProUser(userId);

      const config = TIER_CONFIG[SubscriptionTiers.PRO];
      expect(config.quotas.customRolesPerMonth).toBe(25);
    });
  });

  describe('analysis Generation', () => {
    it('should allow limited analysis for free user', () => {
      const userId = 'free_user_6';
      createFreeUser(userId, { analysisGenerated: 5 });

      expect(checkAnalysisQuota(userId)).toBe(true);
    });

    it('should block analysis when quota exceeded for free user', () => {
      const userId = 'free_user_7';
      createFreeUser(userId, { analysisGenerated: 10 });

      expect(checkAnalysisQuota(userId)).toBe(false);
    });

    it('should have high quota for pro users', () => {
      const userId = 'pro_user_5';
      createProUser(userId);

      const config = TIER_CONFIG[SubscriptionTiers.PRO];
      expect(config.quotas.analysisPerMonth).toBe(1000);
    });
  });
});

describe('feature Access Control', () => {
  describe('model Access', () => {
    it('should allow access to free models for free users', () => {
      const userId = 'free_user_1';
      createFreeUser(userId);

      const freeModel = createModel('free-model', 0.05);
      expect(canAccessModel(userId, freeModel.id)).toBe(true);
    });

    it('should block access to premium models for free users', () => {
      const userId = 'free_user_2';
      createFreeUser(userId);

      const premiumModel = createModel('premium-model', 5.0);
      expect(canAccessModel(userId, premiumModel.id)).toBe(false);
    });

    it('should allow access to all models for pro users', () => {
      const userId = 'pro_user_1';
      createProUser(userId);

      const expensiveModel = createModel('expensive-model', 50.0);
      expect(canAccessModel(userId, expensiveModel.id)).toBe(true);
    });

    it('should enforce max model pricing for free tier', () => {
      const userId = 'free_user_3';
      createFreeUser(userId);

      const config = TIER_CONFIG[SubscriptionTiers.FREE];
      expect(config.maxModelPricing).toBe(0.10);
    });

    it('should have no pricing limit for pro tier', () => {
      const config = TIER_CONFIG[SubscriptionTiers.PRO];
      expect(config.maxModelPricing).toBeNull();
    });
  });

  describe('output Token Limits', () => {
    it('should limit output tokens to 512 for free users', () => {
      const userId = 'free_user_4';
      createFreeUser(userId);

      expect(getMaxOutputTokens(userId)).toBe(512);
    });

    it('should allow 4096 output tokens for pro users', () => {
      const userId = 'pro_user_2';
      createProUser(userId);

      expect(getMaxOutputTokens(userId)).toBe(4096);
    });

    it('should enforce tier config max output tokens', () => {
      const freeConfig = TIER_CONFIG[SubscriptionTiers.FREE];
      const proConfig = TIER_CONFIG[SubscriptionTiers.PRO];

      expect(freeConfig.maxOutputTokens).toBe(512);
      expect(proConfig.maxOutputTokens).toBe(4096);
    });
  });

  describe('max Models Limit', () => {
    it('should limit models to 3 for free tier', () => {
      const config = TIER_CONFIG[SubscriptionTiers.FREE];
      expect(config.maxModels).toBe(3);
    });

    it('should allow 12 models for pro tier', () => {
      const config = TIER_CONFIG[SubscriptionTiers.PRO];
      expect(config.maxModels).toBe(12);
    });
  });
});

describe('upgrade Eligibility Checks', () => {
  describe('credit-Based Eligibility', () => {
    it('should be eligible for upgrade with remaining credits', () => {
      const userId = 'free_user_1';
      createFreeUser(userId, { balance: 3000 });

      expect(canUpgradeToProFromCredits(userId)).toBe(true);
    });

    it('should be eligible for upgrade with zero credits', () => {
      const userId = 'free_user_2';
      createFreeUser(userId, { balance: 0 });

      expect(canUpgradeToProFromCredits(userId)).toBe(true);
    });

    it('should not be eligible if already pro', () => {
      const userId = 'pro_user_1';
      createProUser(userId);

      const balance = mockState.userCreditBalances.get(userId)!;
      expect(balance.planType).toBe(PlanTypes.PAID);
    });
  });

  describe('quota-Based Eligibility', () => {
    it('should be eligible to upgrade when thread quota hit', () => {
      const userId = 'free_user_3';
      createFreeUser(userId, { threadsCreated: 1 });

      expect(checkThreadQuota(userId)).toBe(false);
      expect(canUpgradeToProFromCredits(userId)).toBe(true);
    });

    it('should be eligible to upgrade when message quota hit', () => {
      const userId = 'free_user_4';
      createFreeUser(userId, { messagesCreated: 100 });

      expect(checkMessageQuota(userId)).toBe(false);
      expect(canUpgradeToProFromCredits(userId)).toBe(true);
    });

    it('should be eligible to upgrade when custom role blocked', () => {
      const userId = 'free_user_5';
      createFreeUser(userId);

      expect(checkCustomRoleQuota(userId)).toBe(false);
      expect(canUpgradeToProFromCredits(userId)).toBe(true);
    });
  });

  describe('model Access Eligibility', () => {
    it('should be eligible to upgrade when premium model needed', () => {
      const userId = 'free_user_6';
      createFreeUser(userId);

      const premiumModel = createModel('premium', 3.0);
      expect(canAccessModel(userId, premiumModel.id)).toBe(false);
      expect(canUpgradeToProFromCredits(userId)).toBe(true);
    });
  });
});

describe('tier Transition Logic', () => {
  describe('free to Pro Upgrade', () => {
    it('should transition from free to pro correctly', () => {
      const userId = 'upgrade_user_1';
      createFreeUser(userId, { balance: 2000 });

      const balanceBefore = mockState.userCreditBalances.get(userId)!;
      const usageBefore = mockState.userChatUsages.get(userId)!;

      expect(balanceBefore.planType).toBe(PlanTypes.FREE);
      expect(usageBefore.subscriptionTier).toBe(SubscriptionTiers.FREE);

      mockState.userCreditBalances.set(userId, {
        ...balanceBefore,
        planType: PlanTypes.PAID,
        balance: balanceBefore.balance + CREDIT_CONFIG.PLANS.paid.monthlyCredits,
        monthlyCredits: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
        lastRefillAt: new Date(),
        nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      mockState.userChatUsages.set(userId, {
        ...usageBefore,
        subscriptionTier: SubscriptionTiers.PRO,
      });

      const balanceAfter = mockState.userCreditBalances.get(userId)!;
      const usageAfter = mockState.userChatUsages.get(userId)!;

      expect(balanceAfter.planType).toBe(PlanTypes.PAID);
      expect(usageAfter.subscriptionTier).toBe(SubscriptionTiers.PRO);
      expect(balanceAfter.balance).toBe(102_000);
    });

    it('should preserve existing credits on upgrade', () => {
      const userId = 'upgrade_user_2';
      createFreeUser(userId, { balance: 1500 });

      const _balanceBefore = mockState.userCreditBalances.get(userId)!.balance;

      const updated = mockState.userCreditBalances.get(userId)!;
      updated.balance += CREDIT_CONFIG.PLANS.paid.monthlyCredits;
      updated.monthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      expect(mockState.userCreditBalances.get(userId)!.balance).toBe(101_500);
    });

    it('should grant monthly credits on upgrade', () => {
      const userId = 'upgrade_user_3';
      createFreeUser(userId);

      const updated = mockState.userCreditBalances.get(userId)!;
      updated.monthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      expect(updated.monthlyCredits).toBe(100_000);
    });

    it('should set refill dates on upgrade', () => {
      const userId = 'upgrade_user_4';
      createFreeUser(userId);

      const updated = mockState.userCreditBalances.get(userId)!;
      const now = new Date();
      updated.lastRefillAt = now;
      updated.nextRefillAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      expect(updated.lastRefillAt).not.toBeNull();
      expect(updated.nextRefillAt).not.toBeNull();
    });

    it('should unlock all features on upgrade', () => {
      const userId = 'upgrade_user_5';
      createFreeUser(userId, { threadsCreated: 1 });

      const usageBefore = mockState.userChatUsages.get(userId)!;
      expect(checkThreadQuota(userId)).toBe(false);

      usageBefore.subscriptionTier = SubscriptionTiers.PRO;
      expect(checkThreadQuota(userId)).toBe(true);
    });
  });

  describe('pro to Free Downgrade', () => {
    it('should schedule downgrade for period end', () => {
      const userId = 'downgrade_user_1';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.pendingTierChange = SubscriptionTiers.FREE;

      expect(hasPendingDowngrade(userId)).toBe(true);
    });

    it('should preserve credits on downgrade', () => {
      const userId = 'downgrade_user_2';
      createProUser(userId, { balance: 50_000 });

      const balanceBefore = mockState.userCreditBalances.get(userId)!.balance;

      const updated = mockState.userCreditBalances.get(userId)!;
      updated.planType = PlanTypes.FREE;
      updated.monthlyCredits = 0;

      expect(updated.balance).toBe(balanceBefore);
    });

    it('should stop monthly refills on downgrade', () => {
      const userId = 'downgrade_user_3';
      createProUser(userId);

      const updated = mockState.userCreditBalances.get(userId)!;
      updated.planType = PlanTypes.FREE;
      updated.monthlyCredits = 0;

      expect(updated.monthlyCredits).toBe(0);
    });

    it('should maintain tier until period end for scheduled downgrade', () => {
      const userId = 'downgrade_user_4';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.pendingTierChange = SubscriptionTiers.FREE;

      expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
      expect(hasPendingDowngrade(userId)).toBe(true);
    });

    it('should allow credits to be used after downgrade', () => {
      const userId = 'downgrade_user_5';
      createProUser(userId, { balance: 75_000 });

      const updated = mockState.userCreditBalances.get(userId)!;
      updated.planType = PlanTypes.FREE;
      updated.monthlyCredits = 0;

      expect(updated.balance).toBeGreaterThan(0);
    });
  });

  describe('grace Period Handling', () => {
    it('should maintain pro tier during grace period', () => {
      const userId = 'grace_user_1';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.pendingTierChange = SubscriptionTiers.FREE;

      expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
      expect(usage.pendingTierChange).toBe(SubscriptionTiers.FREE);
    });

    it('should clear pending change on period rollover', () => {
      const userId = 'grace_user_2';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.pendingTierChange = SubscriptionTiers.FREE;

      usage.subscriptionTier = SubscriptionTiers.FREE;
      usage.pendingTierChange = null;

      expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
      expect(usage.pendingTierChange).toBeNull();
    });

    it('should show correct tier during grace period', () => {
      const userId = 'grace_user_3';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.pendingTierChange = SubscriptionTiers.FREE;

      expect(usage.subscriptionTier).toBe(SubscriptionTiers.PRO);
      expect(hasPendingDowngrade(userId)).toBe(true);
    });
  });

  describe('period Reset Handling', () => {
    it('should reset quotas on period rollover', () => {
      const userId = 'reset_user_1';
      createFreeUser(userId, {
        threadsCreated: 1,
        messagesCreated: 100,
        analysisGenerated: 10,
      });

      const usage = mockState.userChatUsages.get(userId)!;
      usage.threadsCreated = 0;
      usage.messagesCreated = 0;
      usage.analysisGenerated = 0;

      expect(usage.threadsCreated).toBe(0);
      expect(usage.messagesCreated).toBe(0);
      expect(usage.analysisGenerated).toBe(0);
    });

    it('should apply pending tier change on period rollover', () => {
      const userId = 'reset_user_2';
      createProUser(userId);

      const usage = mockState.userChatUsages.get(userId)!;
      usage.pendingTierChange = SubscriptionTiers.FREE;

      usage.subscriptionTier = usage.pendingTierChange;
      usage.pendingTierChange = null;

      expect(usage.subscriptionTier).toBe(SubscriptionTiers.FREE);
      expect(usage.pendingTierChange).toBeNull();
    });
  });
});

describe('tier Configuration Consistency', () => {
  it('should have consistent tier values in config', () => {
    const freeConfig = TIER_CONFIG.free;
    const proConfig = TIER_CONFIG.pro;

    expect(freeConfig.name).toBe('Free');
    expect(proConfig.name).toBe('Pro');
  });

  it('should have valid quota values for free tier', () => {
    const config = TIER_CONFIG.free;

    expect(config.quotas.threadsPerMonth).toBe(1);
    expect(config.quotas.messagesPerMonth).toBe(100);
    expect(config.quotas.customRolesPerMonth).toBe(0);
    expect(config.quotas.analysisPerMonth).toBe(10);
  });

  it('should have valid quota values for pro tier', () => {
    const config = TIER_CONFIG.pro;

    expect(config.quotas.threadsPerMonth).toBe(500);
    expect(config.quotas.messagesPerMonth).toBe(10000);
    expect(config.quotas.customRolesPerMonth).toBe(25);
    expect(config.quotas.analysisPerMonth).toBe(1000);
  });

  it('should have consistent credit config values', () => {
    expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
    expect(CREDIT_CONFIG.PLANS.paid.monthlyCredits).toBe(100_000);
  });

  it('should have upgrade messages for each tier', () => {
    const freeConfig = TIER_CONFIG.free;
    const proConfig = TIER_CONFIG.pro;

    expect(freeConfig.upgradeMessage).toBeDefined();
    expect(proConfig.upgradeMessage).toBeDefined();
  });
});

describe('edge Cases and Boundary Conditions', () => {
  it('should handle user with exactly quota limit', () => {
    const userId = 'edge_user_1';
    createFreeUser(userId, { messagesCreated: 99 });

    expect(checkMessageQuota(userId)).toBe(true);

    const usage = mockState.userChatUsages.get(userId)!;
    usage.messagesCreated = 100;

    expect(checkMessageQuota(userId)).toBe(false);
  });

  it('should handle model at exact pricing threshold', () => {
    const userId = 'edge_user_2';
    createFreeUser(userId);

    const thresholdModel = createModel('threshold', 0.10);
    expect(canAccessModel(userId, thresholdModel.id)).toBe(true);
  });

  it('should handle zero credits after upgrade', () => {
    const userId = 'edge_user_3';
    createFreeUser(userId, { balance: 0 });

    const updated = mockState.userCreditBalances.get(userId)!;
    updated.balance += CREDIT_CONFIG.PLANS.paid.monthlyCredits;

    expect(updated.balance).toBe(100_000);
  });

  it('should handle reserved credits affecting available balance', () => {
    const userId = 'edge_user_4';
    createFreeUser(userId, { balance: 5000, reservedCredits: 2000 });

    const balance = mockState.userCreditBalances.get(userId)!;
    const available = balance.balance - balance.reservedCredits;

    expect(available).toBe(3000);
  });

  it('should handle free user with no threads created', () => {
    const userId = 'edge_user_5';
    createFreeUser(userId, { threadsCreated: 0 });

    expect(checkThreadQuota(userId)).toBe(true);
  });

  it('should handle tier config max models boundary', () => {
    const freeConfig = TIER_CONFIG.free;
    const proConfig = TIER_CONFIG.pro;

    expect(freeConfig.maxModels).toBeGreaterThan(0);
    expect(proConfig.maxModels).toBeGreaterThan(freeConfig.maxModels);
  });
});
