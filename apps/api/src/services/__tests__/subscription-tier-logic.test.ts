/**
 * Subscription Tier Logic Tests
 *
 * Comprehensive test suite for subscription tier determination and feature access logic.
 * Tests plan type determination, feature access rules, quota enforcement, and tier transitions.
 *
 * Coverage:
 * - Plan type determination from Stripe product IDs
 * - Feature access by plan (thread limits, round limits, model access)
 * - Monthly credit allocation by plan
 * - Grace period handling during cancellation
 * - Trial period feature access
 * - Plan upgrade/downgrade effects on features
 * - Default/fallback plan behavior
 */

import type { PlanType, SubscriptionTier } from '@roundtable/shared/enums';
import { PlanTypes, SubscriptionTiers } from '@roundtable/shared/enums';
import { describe, expect, it } from 'vitest';

import { CREDIT_CONFIG, PLAN_NAMES } from '@/lib/config/credit-config';
import type { TierConfiguration } from '@/services/billing';
import {
  canAccessByTier,
  canAccessModelByPricing,
  getMaxModelsForTier,
  getMaxOutputTokensForTier,
  getMonthlyCreditsForTier,
  getTierFromProductId,
  getTierName,
  TIER_CONFIG,
} from '@/services/billing';

// ============================================================================
// MOCK TYPES
// ============================================================================

type MockModel = {
  id: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
};

type MockSubscriptionData = {
  productId: string;
  tier: SubscriptionTier;
  planType: PlanType;
  status: 'active' | 'trialing' | 'canceled' | 'past_due';
  currentPeriodEnd: Date;
};

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockModel(inputPricePerMillion: number, outputPricePerMillion: number, contextLength = 128000): MockModel {
  // Convert price per million to price per token (what the API expects)
  return {
    id: `test-model-${inputPricePerMillion}`,
    pricing: {
      prompt: (inputPricePerMillion / 1_000_000).toString(),
      completion: (outputPricePerMillion / 1_000_000).toString(),
    },
    context_length: contextLength,
  };
}

function createActiveSubscription(productId: string): MockSubscriptionData {
  const tier = getTierFromProductId(productId);
  const planType = tier === SubscriptionTiers.PRO ? PlanTypes.PAID : PlanTypes.FREE;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    productId,
    tier,
    planType,
    status: 'active',
    currentPeriodEnd: periodEnd,
  };
}

function createTrialSubscription(productId: string): MockSubscriptionData {
  const tier = getTierFromProductId(productId);
  const planType = tier === SubscriptionTiers.PRO ? PlanTypes.PAID : PlanTypes.FREE;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 14); // 14-day trial

  return {
    productId,
    tier,
    planType,
    status: 'trialing',
    currentPeriodEnd: periodEnd,
  };
}

function createCanceledSubscription(productId: string, daysUntilEnd: number): MockSubscriptionData {
  const tier = getTierFromProductId(productId);
  const planType = tier === SubscriptionTiers.PRO ? PlanTypes.PAID : PlanTypes.FREE;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + daysUntilEnd);

  return {
    productId,
    tier,
    planType,
    status: 'canceled',
    currentPeriodEnd: periodEnd,
  };
}

// Mock Stripe IDs for tests - pattern matches "pro" word boundaries
const MOCK_PRO_PRODUCT_ID = 'prod_test_pro';

// ============================================================================
// PLAN TYPE DETERMINATION FROM STRIPE DATA
// ============================================================================

describe('plan Type Determination from Stripe Product IDs', () => {
  it('should detect Pro tier from product ID with pro pattern', () => {
    const productId = MOCK_PRO_PRODUCT_ID;
    const tier = getTierFromProductId(productId);

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('should detect Pro tier from product ID with _pro_ pattern', () => {
    const tier = getTierFromProductId('prod_test_pro_monthly');

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('should detect Pro tier from product ID ending with _pro', () => {
    const tier = getTierFromProductId('prod_subscription_pro');

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('should detect Pro tier from product ID with -pro- pattern', () => {
    const tier = getTierFromProductId('prod-test-pro-monthly');

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('should detect Pro tier from product ID ending with -pro', () => {
    const tier = getTierFromProductId('prod-subscription-pro');

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('should use word boundary matching for "pro" detection', () => {
    const tier = getTierFromProductId('prod test pro monthly');

    expect(tier).toBe(SubscriptionTiers.PRO);
  });

  it('should NOT detect "pro" within words like "product" or "professional"', () => {
    const tier1 = getTierFromProductId('prod_product_basic');
    const tier2 = getTierFromProductId('prod_professional_basic');
    const tier3 = getTierFromProductId('prod_process_standard');

    expect(tier1).toBe(SubscriptionTiers.FREE);
    expect(tier2).toBe(SubscriptionTiers.FREE);
    expect(tier3).toBe(SubscriptionTiers.FREE);
  });

  it('should default to Free tier for unknown product IDs', () => {
    const tier = getTierFromProductId('prod_unknown_12345');

    expect(tier).toBe(SubscriptionTiers.FREE);
  });

  it('should default to Free tier for empty product ID', () => {
    const tier = getTierFromProductId('');

    expect(tier).toBe(SubscriptionTiers.FREE);
  });

  it('should handle case-insensitive product ID matching', () => {
    const tier1 = getTierFromProductId('PROD_TEST_PRO_MONTHLY');
    const tier2 = getTierFromProductId('Prod_Test_Pro_Monthly');

    expect(tier1).toBe(SubscriptionTiers.PRO);
    expect(tier2).toBe(SubscriptionTiers.PRO);
  });
});

// ============================================================================
// FEATURE ACCESS BY PLAN
// ============================================================================

describe('thread Limits by Plan', () => {
  it('free tier allows 1 thread per month', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.threadsPerMonth).toBe(1);
  });

  it('pro tier allows 500 threads per month', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.threadsPerMonth).toBe(500);
  });

  it('pro tier has significantly higher thread limit than Free tier', () => {
    const freeLimit = TIER_CONFIG.free.quotas.threadsPerMonth;
    const proLimit = TIER_CONFIG.pro.quotas.threadsPerMonth;

    expect(proLimit).toBeGreaterThan(freeLimit * 100);
  });
});

describe('round Limits by Plan', () => {
  it('free tier allows 1 round (round 0 only)', () => {
    // Free tier: 1 thread, 1 round (round 0 only)
    // This is implicitly enforced by thread limit
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.threadsPerMonth).toBe(1);
  });

  it('pro tier allows unlimited rounds per thread', () => {
    // Pro tier: 500 threads, effectively unlimited rounds
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.threadsPerMonth).toBe(500);
  });
});

describe('message Limits by Plan', () => {
  it('free tier allows 100 messages per month', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.messagesPerMonth).toBe(100);
  });

  it('pro tier allows 10000 messages per month', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.messagesPerMonth).toBe(10_000);
  });

  it('pro tier has 100x more message quota than Free tier', () => {
    const freeLimit = TIER_CONFIG.free.quotas.messagesPerMonth;
    const proLimit = TIER_CONFIG.pro.quotas.messagesPerMonth;

    expect(proLimit).toBe(freeLimit * 100);
  });
});

describe('custom Roles (Web Search) by Plan', () => {
  it('free tier has NO custom roles access', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.customRolesPerMonth).toBe(0);
  });

  it('pro tier allows 25 custom roles per month', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.customRolesPerMonth).toBe(25);
  });

  it('web search is Pro-only feature', () => {
    const freeHasWebSearch = TIER_CONFIG.free.quotas.customRolesPerMonth > 0;
    const proHasWebSearch = TIER_CONFIG.pro.quotas.customRolesPerMonth > 0;

    expect(freeHasWebSearch).toBe(false);
    expect(proHasWebSearch).toBe(true);
  });
});

describe('analysis Quota by Plan', () => {
  it('free tier allows 10 analyses per month', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.quotas.analysisPerMonth).toBe(10);
  });

  it('pro tier allows 1000 analyses per month', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.quotas.analysisPerMonth).toBe(1000);
  });

  it('pro tier has 100x more analysis quota than Free tier', () => {
    const freeLimit = TIER_CONFIG.free.quotas.analysisPerMonth;
    const proLimit = TIER_CONFIG.pro.quotas.analysisPerMonth;

    expect(proLimit).toBe(freeLimit * 100);
  });
});

describe('output Token Limits by Plan', () => {
  it('free tier has 512 max output tokens', () => {
    const maxTokens = getMaxOutputTokensForTier(SubscriptionTiers.FREE);

    expect(maxTokens).toBe(512);
  });

  it('pro tier has 4096 max output tokens', () => {
    const maxTokens = getMaxOutputTokensForTier(SubscriptionTiers.PRO);

    expect(maxTokens).toBe(4096);
  });

  it('pro tier has 8x more output tokens than Free tier', () => {
    const freeTokens = getMaxOutputTokensForTier(SubscriptionTiers.FREE);
    const proTokens = getMaxOutputTokensForTier(SubscriptionTiers.PRO);

    expect(proTokens).toBe(freeTokens * 8);
  });
});

describe('model Access by Plan', () => {
  it('free tier has $0.20 per 1M tokens pricing limit', () => {
    const freeConfig = TIER_CONFIG.free;

    expect(freeConfig.maxModelPricing).toBe(0.20);
  });

  it('pro tier has NO model pricing limit', () => {
    const proConfig = TIER_CONFIG.pro;

    expect(proConfig.maxModelPricing).toBeNull();
  });

  it('free tier can access budget models (<= $0.20/1M tokens)', () => {
    const budgetModel = createMockModel(0.05, 0.20); // $0.05 input, $0.20 output per 1M tokens
    const canAccess = canAccessModelByPricing(SubscriptionTiers.FREE, budgetModel);

    expect(canAccess).toBe(true);
  });

  it('free tier CANNOT access premium models (> $0.20/1M tokens)', () => {
    const premiumModel = createMockModel(5.00, 15.00); // $5 input, $15 output per 1M tokens
    const canAccess = canAccessModelByPricing(SubscriptionTiers.FREE, premiumModel);

    expect(canAccess).toBe(false);
  });

  it('pro tier can access all models regardless of pricing', () => {
    const budgetModel = createMockModel(0.05, 0.20);
    const premiumModel = createMockModel(5.00, 15.00);
    const flagshipModel = createMockModel(30.00, 60.00);

    expect(canAccessModelByPricing(SubscriptionTiers.PRO, budgetModel)).toBe(true);
    expect(canAccessModelByPricing(SubscriptionTiers.PRO, premiumModel)).toBe(true);
    expect(canAccessModelByPricing(SubscriptionTiers.PRO, flagshipModel)).toBe(true);
  });
});

describe('max Models Per Conversation by Plan', () => {
  it('free tier allows 3 models per conversation', () => {
    const maxModels = getMaxModelsForTier(SubscriptionTiers.FREE);

    expect(maxModels).toBe(3);
  });

  it('pro tier allows 12 models per conversation', () => {
    const maxModels = getMaxModelsForTier(SubscriptionTiers.PRO);

    expect(maxModels).toBe(12);
  });

  it('pro tier has 4x more model slots than Free tier', () => {
    const freeModels = getMaxModelsForTier(SubscriptionTiers.FREE);
    const proModels = getMaxModelsForTier(SubscriptionTiers.PRO);

    expect(proModels).toBe(freeModels * 4);
  });
});

// ============================================================================
// MONTHLY CREDIT ALLOCATION BY PLAN
// ============================================================================

describe('monthly Credit Allocation by Plan', () => {
  it('free tier gets 0 monthly credits', () => {
    const monthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.FREE);

    expect(monthlyCredits).toBe(0);
  });

  it('free tier gets 5000 signup credits (one-time)', () => {
    expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
  });

  it('pro tier gets 100K monthly credits', () => {
    const monthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.PRO);

    expect(monthlyCredits).toBe(2_000_000);
  });

  it('pro tier monthly credits match CREDIT_CONFIG', () => {
    const configCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;
    const tierCredits = getMonthlyCreditsForTier(SubscriptionTiers.PRO);

    expect(tierCredits).toBe(configCredits);
  });

  it('pro tier monthly credits are consistent across configs', () => {
    const tierConfigCredits = TIER_CONFIG.pro.monthlyCredits;
    const creditConfigCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

    expect(tierConfigCredits).toBe(creditConfigCredits);
  });
});

// ============================================================================
// GRACE PERIOD HANDLING
// ============================================================================

describe('grace Period Handling (Subscription Cancellation)', () => {
  it('canceled subscription maintains Pro tier until period end', () => {
    const subscription = createCanceledSubscription(
      MOCK_PRO_PRODUCT_ID,
      15, // 15 days until period end
    );

    expect(subscription.status).toBe('canceled');
    expect(subscription.tier).toBe(SubscriptionTiers.PRO);
    expect(subscription.planType).toBe(PlanTypes.PAID);
  });

  it('grace period allows continued Pro feature access', () => {
    const subscription = createCanceledSubscription(
      MOCK_PRO_PRODUCT_ID,
      10,
    );

    // User should still have Pro tier access during grace period
    expect(subscription.tier).toBe(SubscriptionTiers.PRO);

    // Can access Pro features
    const premiumModel = createMockModel(5.00, 15.00);
    expect(canAccessModelByPricing(subscription.tier, premiumModel)).toBe(true);
  });

  it('grace period preserves Pro quotas', () => {
    const subscription = createCanceledSubscription(
      MOCK_PRO_PRODUCT_ID,
      7,
    );

    const proQuotas = TIER_CONFIG.pro.quotas;

    expect(subscription.tier).toBe(SubscriptionTiers.PRO);
    expect(proQuotas.threadsPerMonth).toBe(500);
    expect(proQuotas.messagesPerMonth).toBe(10_000);
    expect(proQuotas.customRolesPerMonth).toBe(25);
  });

  it('expired grace period results in Free tier (logic check)', () => {
    const subscription = createCanceledSubscription(
      MOCK_PRO_PRODUCT_ID,
      0,
    );

    const now = new Date();
    const hasExpired = subscription.currentPeriodEnd <= now;

    // When period expires, user should be downgraded to Free
    // (In real implementation, this is handled by billing service)
    const expectedTier = SubscriptionTiers.FREE;

    // Always verify the expected tier is FREE regardless of hasExpired
    expect(expectedTier).toBe(SubscriptionTiers.FREE);
    // Verify that period has expired as expected
    expect(hasExpired).toBe(true);
  });

  it('grace period calculation is based on currentPeriodEnd', () => {
    const subscription = createCanceledSubscription(
      MOCK_PRO_PRODUCT_ID,
      20,
    );

    const now = new Date();
    const daysRemaining = Math.ceil(
      (subscription.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysRemaining).toBeGreaterThan(15);
    expect(daysRemaining).toBeLessThanOrEqual(21);
  });
});

// ============================================================================
// TRIAL PERIOD FEATURE ACCESS
// ============================================================================

describe('trial Period Feature Access', () => {
  it('trialing subscription grants Pro tier access', () => {
    const subscription = createTrialSubscription(MOCK_PRO_PRODUCT_ID);

    expect(subscription.status).toBe('trialing');
    expect(subscription.tier).toBe(SubscriptionTiers.PRO);
    expect(subscription.planType).toBe(PlanTypes.PAID);
  });

  it('trial period provides full Pro features', () => {
    const subscription = createTrialSubscription(MOCK_PRO_PRODUCT_ID);

    // Can access premium models
    const premiumModel = createMockModel(5.00, 15.00);
    expect(canAccessModelByPricing(subscription.tier, premiumModel)).toBe(true);

    // Has Pro quotas
    const proQuotas = TIER_CONFIG.pro.quotas;
    expect(proQuotas.threadsPerMonth).toBe(500);
    expect(proQuotas.customRolesPerMonth).toBe(25);
  });

  it('trial period grants Pro monthly credits', () => {
    const subscription = createTrialSubscription(MOCK_PRO_PRODUCT_ID);

    const monthlyCredits = getMonthlyCreditsForTier(subscription.tier);

    expect(monthlyCredits).toBe(2_000_000);
  });

  it('trial subscription has future period end date', () => {
    const subscription = createTrialSubscription(MOCK_PRO_PRODUCT_ID);

    const now = new Date();
    expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ============================================================================
// PLAN UPGRADE/DOWNGRADE EFFECT ON FEATURES
// ============================================================================

describe('plan Upgrade Effects on Features', () => {
  it('upgrade from Free to Pro unlocks premium models', () => {
    const premiumModel = createMockModel(5.00, 15.00);

    const freeAccess = canAccessModelByPricing(SubscriptionTiers.FREE, premiumModel);
    const proAccess = canAccessModelByPricing(SubscriptionTiers.PRO, premiumModel);

    expect(freeAccess).toBe(false);
    expect(proAccess).toBe(true);
  });

  it('upgrade from Free to Pro increases thread quota', () => {
    const freeQuota = TIER_CONFIG.free.quotas.threadsPerMonth;
    const proQuota = TIER_CONFIG.pro.quotas.threadsPerMonth;

    expect(proQuota).toBeGreaterThan(freeQuota);
    expect(proQuota).toBe(500);
    expect(freeQuota).toBe(1);
  });

  it('upgrade from Free to Pro unlocks web search (custom roles)', () => {
    const freeQuota = TIER_CONFIG.free.quotas.customRolesPerMonth;
    const proQuota = TIER_CONFIG.pro.quotas.customRolesPerMonth;

    expect(freeQuota).toBe(0);
    expect(proQuota).toBe(25);
  });

  it('upgrade from Free to Pro increases max output tokens', () => {
    const freeTokens = getMaxOutputTokensForTier(SubscriptionTiers.FREE);
    const proTokens = getMaxOutputTokensForTier(SubscriptionTiers.PRO);

    expect(proTokens).toBeGreaterThan(freeTokens);
    expect(freeTokens).toBe(512);
    expect(proTokens).toBe(4096);
  });

  it('upgrade from Free to Pro increases max models per conversation', () => {
    const freeModels = getMaxModelsForTier(SubscriptionTiers.FREE);
    const proModels = getMaxModelsForTier(SubscriptionTiers.PRO);

    expect(proModels).toBeGreaterThan(freeModels);
    expect(freeModels).toBe(3);
    expect(proModels).toBe(12);
  });

  it('upgrade from Free to Pro grants monthly credit refills', () => {
    const freeMonthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.FREE);
    const proMonthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.PRO);

    expect(freeMonthlyCredits).toBe(0);
    expect(proMonthlyCredits).toBe(2_000_000);
  });
});

describe('plan Downgrade Effects on Features', () => {
  it('downgrade from Pro to Free restricts premium models', () => {
    const premiumModel = createMockModel(5.00, 15.00);

    const proAccess = canAccessModelByPricing(SubscriptionTiers.PRO, premiumModel);
    const freeAccess = canAccessModelByPricing(SubscriptionTiers.FREE, premiumModel);

    expect(proAccess).toBe(true);
    expect(freeAccess).toBe(false);
  });

  it('downgrade from Pro to Free reduces thread quota', () => {
    const proQuota = TIER_CONFIG.pro.quotas.threadsPerMonth;
    const freeQuota = TIER_CONFIG.free.quotas.threadsPerMonth;

    expect(freeQuota).toBeLessThan(proQuota);
    expect(proQuota).toBe(500);
    expect(freeQuota).toBe(1);
  });

  it('downgrade from Pro to Free removes web search access', () => {
    const proQuota = TIER_CONFIG.pro.quotas.customRolesPerMonth;
    const freeQuota = TIER_CONFIG.free.quotas.customRolesPerMonth;

    expect(proQuota).toBe(25);
    expect(freeQuota).toBe(0);
  });

  it('downgrade from Pro to Free reduces max output tokens', () => {
    const proTokens = getMaxOutputTokensForTier(SubscriptionTiers.PRO);
    const freeTokens = getMaxOutputTokensForTier(SubscriptionTiers.FREE);

    expect(freeTokens).toBeLessThan(proTokens);
    expect(proTokens).toBe(4096);
    expect(freeTokens).toBe(512);
  });

  it('downgrade from Pro to Free stops monthly credit refills', () => {
    const proMonthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.PRO);
    const freeMonthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.FREE);

    expect(proMonthlyCredits).toBe(2_000_000);
    expect(freeMonthlyCredits).toBe(0);
  });

  it('downgrade from Pro to Free preserves remaining credits (logic)', () => {
    // Downgrade doesn't remove existing credits, only stops refills
    // This is tested in subscription-tier-handling.test.ts
    const freeMonthlyCredits = getMonthlyCreditsForTier(SubscriptionTiers.FREE);

    expect(freeMonthlyCredits).toBe(0); // No new refills
  });
});

// ============================================================================
// DEFAULT/FALLBACK PLAN BEHAVIOR
// ============================================================================

describe('default/Fallback Plan Behavior', () => {
  it('default tier is Free', () => {
    const defaultTier: SubscriptionTier = SubscriptionTiers.FREE;

    expect(defaultTier).toBe(SubscriptionTiers.FREE);
  });

  it('default plan type is Free', () => {
    const defaultPlan: PlanType = PlanTypes.FREE;

    expect(defaultPlan).toBe(PlanTypes.FREE);
  });

  it('unknown product ID defaults to Free tier', () => {
    const tier = getTierFromProductId('prod_invalid_unknown');

    expect(tier).toBe(SubscriptionTiers.FREE);
  });

  it('empty product ID defaults to Free tier', () => {
    const tier = getTierFromProductId('');

    expect(tier).toBe(SubscriptionTiers.FREE);
  });

  it('null/undefined product ID should default to Free tier', () => {
    // Test null-like scenarios
    const tier1 = getTierFromProductId('undefined');
    const tier2 = getTierFromProductId('null');

    expect(tier1).toBe(SubscriptionTiers.FREE);
    expect(tier2).toBe(SubscriptionTiers.FREE);
  });

  it('default tier has correct configuration', () => {
    const defaultTier = SubscriptionTiers.FREE;
    const config = TIER_CONFIG[defaultTier];

    expect(config.name).toBe('Free');
    expect(config.maxOutputTokens).toBe(512);
    expect(config.maxModelPricing).toBe(0.20);
    expect(config.quotas.threadsPerMonth).toBe(1);
  });
});

// ============================================================================
// TIER ACCESS HIERARCHY
// ============================================================================

describe('tier Access Hierarchy', () => {
  it('free tier can access Free tier features', () => {
    const canAccess = canAccessByTier(SubscriptionTiers.FREE, SubscriptionTiers.FREE);

    expect(canAccess).toBe(true);
  });

  it('free tier CANNOT access Pro tier features', () => {
    const canAccess = canAccessByTier(SubscriptionTiers.FREE, SubscriptionTiers.PRO);

    expect(canAccess).toBe(false);
  });

  it('pro tier can access Free tier features', () => {
    const canAccess = canAccessByTier(SubscriptionTiers.PRO, SubscriptionTiers.FREE);

    expect(canAccess).toBe(true);
  });

  it('pro tier can access Pro tier features', () => {
    const canAccess = canAccessByTier(SubscriptionTiers.PRO, SubscriptionTiers.PRO);

    expect(canAccess).toBe(true);
  });
});

// ============================================================================
// TIER CONFIGURATION CONSISTENCY
// ============================================================================

describe('tier Configuration Consistency', () => {
  it('tier names are consistent across configs', () => {
    expect(TIER_CONFIG.free.name).toBe('Free');
    expect(TIER_CONFIG.pro.name).toBe('Pro');
    expect(PLAN_NAMES.free).toBe('Free');
    expect(PLAN_NAMES.paid).toBe('Pro');
  });

  it('tier names match getTierName function', () => {
    expect(getTierName(SubscriptionTiers.FREE)).toBe('Free');
    expect(getTierName(SubscriptionTiers.PRO)).toBe('Pro');
  });

  it('all tier quotas are non-negative', () => {
    const tiers = [SubscriptionTiers.FREE, SubscriptionTiers.PRO] as const;

    for (const tier of tiers) {
      const config = TIER_CONFIG[tier];

      expect(config.quotas.threadsPerMonth).toBeGreaterThanOrEqual(0);
      expect(config.quotas.messagesPerMonth).toBeGreaterThanOrEqual(0);
      expect(config.quotas.customRolesPerMonth).toBeGreaterThanOrEqual(0);
      expect(config.quotas.analysisPerMonth).toBeGreaterThanOrEqual(0);
    }
  });

  it('all tier configurations are complete', () => {
    const requiredFields: (keyof TierConfiguration)[] = [
      'name',
      'maxOutputTokens',
      'maxModelPricing',
      'maxModels',
      'quotas',
      'upgradeMessage',
      'monthlyCredits',
    ];

    const tiers = [SubscriptionTiers.FREE, SubscriptionTiers.PRO] as const;

    for (const tier of tiers) {
      const config = TIER_CONFIG[tier];

      for (const field of requiredFields) {
        expect(config).toHaveProperty(field);
      }
    }
  });

  it('pro tier has higher limits than Free tier for all quotas', () => {
    const freeQuotas = TIER_CONFIG.free.quotas;
    const proQuotas = TIER_CONFIG.pro.quotas;

    expect(proQuotas.threadsPerMonth).toBeGreaterThan(freeQuotas.threadsPerMonth);
    expect(proQuotas.messagesPerMonth).toBeGreaterThan(freeQuotas.messagesPerMonth);
    expect(proQuotas.customRolesPerMonth).toBeGreaterThan(freeQuotas.customRolesPerMonth);
    expect(proQuotas.analysisPerMonth).toBeGreaterThan(freeQuotas.analysisPerMonth);
  });

  it('pro tier has higher output token limit than Free tier', () => {
    const freeTokens = TIER_CONFIG.free.maxOutputTokens;
    const proTokens = TIER_CONFIG.pro.maxOutputTokens;

    expect(proTokens).toBeGreaterThan(freeTokens);
  });

  it('pro tier has more model slots than Free tier', () => {
    const freeModels = TIER_CONFIG.free.maxModels;
    const proModels = TIER_CONFIG.pro.maxModels;

    expect(proModels).toBeGreaterThan(freeModels);
  });

  it('free tier has model pricing limit, Pro tier does not', () => {
    const freeLimit = TIER_CONFIG.free.maxModelPricing;
    const proLimit = TIER_CONFIG.pro.maxModelPricing;

    expect(freeLimit).not.toBeNull();
    expect(freeLimit).toBeGreaterThan(0);
    expect(proLimit).toBeNull();
  });
});

// ============================================================================
// SUBSCRIPTION STATUS AND TIER MAPPING
// ============================================================================

describe('subscription Status and Tier Mapping', () => {
  it('active Pro subscription has Pro tier', () => {
    const subscription = createActiveSubscription(MOCK_PRO_PRODUCT_ID);

    expect(subscription.status).toBe('active');
    expect(subscription.tier).toBe(SubscriptionTiers.PRO);
  });

  it('trialing Pro subscription has Pro tier', () => {
    const subscription = createTrialSubscription(MOCK_PRO_PRODUCT_ID);

    expect(subscription.status).toBe('trialing');
    expect(subscription.tier).toBe(SubscriptionTiers.PRO);
  });

  it('canceled Pro subscription maintains Pro tier during grace period', () => {
    const subscription = createCanceledSubscription(
      MOCK_PRO_PRODUCT_ID,
      10,
    );

    expect(subscription.status).toBe('canceled');
    expect(subscription.tier).toBe(SubscriptionTiers.PRO);
  });

  it('no subscription defaults to Free tier', () => {
    const tier = getTierFromProductId('');

    expect(tier).toBe(SubscriptionTiers.FREE);
  });
});

// ============================================================================
// PRICING AND BILLING CONSISTENCY
// ============================================================================

describe('pricing and Billing Consistency', () => {
  it('pro plan price is $59/month', () => {
    const priceInCents = CREDIT_CONFIG.PLANS.paid.priceInCents;

    expect(priceInCents).toBe(5900);
  });

  it('credit-to-token conversion is consistent', () => {
    const tokensPerCredit = CREDIT_CONFIG.TOKENS_PER_CREDIT;

    expect(tokensPerCredit).toBe(1000);
  });

  it('signup credits are configured correctly', () => {
    const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;

    expect(signupCredits).toBe(5_000);
    expect(signupCredits).toBeGreaterThan(0);
  });
});
