import { describe, expect, it } from 'vitest';

import { SUBSCRIPTION_TIERS, SubscriptionTiers } from '@/api/core/enums';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

import {
  getMaxModelsForTier,
  getMonthlyCreditsForTier,
  getTierFromProductId,
  getTierUpgradeMessage,
  MAX_MODEL_PRICING_BY_TIER,
  MAX_MODELS_BY_TIER,
  MAX_OUTPUT_TOKENS_BY_TIER,
  SUBSCRIPTION_TIER_NAMES,
  TIER_CONFIG,
  TIER_QUOTAS,
} from '../product-logic.service';

describe('product Logic Service', () => {
  describe('getTierFromProductId', () => {
    describe('direct Product ID Matching', () => {
      it('returns "pro" for the Paid plan product ID', () => {
        const paidProductId = CREDIT_CONFIG.PLANS.paid.stripeProductId;
        expect(getTierFromProductId(paidProductId)).toBe(SubscriptionTiers.PRO);
      });

      it('returns "free" for unknown product IDs (users without subscription)', () => {
        expect(getTierFromProductId('unknown_product_123')).toBe(SubscriptionTiers.FREE);
      });
    });

    describe('pattern-Based Fallback Matching', () => {
      it('returns "pro" for product IDs with "pro" pattern', () => {
        expect(getTierFromProductId('prod_pro_monthly')).toBe(SubscriptionTiers.PRO);
        expect(getTierFromProductId('my_pro')).toBe(SubscriptionTiers.PRO);
        expect(getTierFromProductId('tier-pro-annual')).toBe(SubscriptionTiers.PRO);
      });

      it('does NOT match "pro" in "prod_" prefix', () => {
        // This should fall through to "free" since it doesn't match any pattern
        expect(getTierFromProductId('prod_xyz')).toBe(SubscriptionTiers.FREE);
      });

      it('returns "free" for unknown product IDs', () => {
        expect(getTierFromProductId('unknown_product_123')).toBe(SubscriptionTiers.FREE);
        expect(getTierFromProductId('')).toBe(SubscriptionTiers.FREE);
        expect(getTierFromProductId('random_string')).toBe(SubscriptionTiers.FREE);
      });
    });
  });

  describe('getMaxModelsForTier', () => {
    it('returns correct max models for each tier', () => {
      expect(getMaxModelsForTier(SubscriptionTiers.FREE)).toBe(MAX_MODELS_BY_TIER.free);
      expect(getMaxModelsForTier(SubscriptionTiers.PRO)).toBe(MAX_MODELS_BY_TIER.pro);
    });

    it('returns 3 for free tier', () => {
      expect(getMaxModelsForTier(SubscriptionTiers.FREE)).toBe(3);
    });

    it('returns 12 for pro tier', () => {
      expect(getMaxModelsForTier(SubscriptionTiers.PRO)).toBe(12);
    });
  });

  describe('getMonthlyCreditsForTier', () => {
    it('returns 0 for free tier (no monthly credits)', () => {
      expect(getMonthlyCreditsForTier(SubscriptionTiers.FREE)).toBe(0);
    });

    it('returns 100,000 for pro tier', () => {
      expect(getMonthlyCreditsForTier(SubscriptionTiers.PRO)).toBe(100_000);
      expect(getMonthlyCreditsForTier(SubscriptionTiers.PRO)).toBe(CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });
  });

  describe('subscription Tier Names', () => {
    it('has correct names for all tiers', () => {
      expect(SUBSCRIPTION_TIER_NAMES.free).toBe('Free');
      expect(SUBSCRIPTION_TIER_NAMES.pro).toBe('Pro');
    });
  });

  describe('plan Comparison Integration', () => {
    it('compares Free vs Pro plan differences', () => {
      const freeTier = SubscriptionTiers.FREE;
      const proProductId = CREDIT_CONFIG.PLANS.paid.stripeProductId;
      const proTier = getTierFromProductId(proProductId);

      expect(proTier).toBe(SubscriptionTiers.PRO);

      const freeModels = getMaxModelsForTier(freeTier);
      const proModels = getMaxModelsForTier(proTier);
      expect(proModels).toBeGreaterThan(freeModels);
      expect(freeModels).toBe(3);
      expect(proModels).toBe(12);

      const freeCredits = getMonthlyCreditsForTier(freeTier);
      const proCredits = getMonthlyCreditsForTier(proTier);
      expect(proCredits).toBeGreaterThan(freeCredits);
      expect(freeCredits).toBe(0);
      expect(proCredits).toBe(100_000);

      expect(SUBSCRIPTION_TIER_NAMES[freeTier]).toBe('Free');
      expect(SUBSCRIPTION_TIER_NAMES[proTier]).toBe('Pro');
    });

    it('provides consistent data for subscription change display', () => {
      const oldTier = SubscriptionTiers.FREE;
      const newProductId = CREDIT_CONFIG.PLANS.paid.stripeProductId;
      const newTier = getTierFromProductId(newProductId);

      const comparison = {
        oldPlan: {
          tier: oldTier,
          name: SUBSCRIPTION_TIER_NAMES[oldTier],
          maxModels: getMaxModelsForTier(oldTier),
          monthlyCredits: getMonthlyCreditsForTier(oldTier),
        },
        newPlan: {
          tier: newTier,
          name: SUBSCRIPTION_TIER_NAMES[newTier],
          maxModels: getMaxModelsForTier(newTier),
          monthlyCredits: getMonthlyCreditsForTier(newTier),
        },
      };

      expect(comparison.oldPlan).toEqual({
        tier: SubscriptionTiers.FREE,
        name: 'Free',
        maxModels: 3,
        monthlyCredits: 0,
      });

      expect(comparison.newPlan).toEqual({
        tier: SubscriptionTiers.PRO,
        name: 'Pro',
        maxModels: 12,
        monthlyCredits: 100_000,
      });
    });
  });

  describe('tIER_CONFIG', () => {
    it('has configuration for every tier in SUBSCRIPTION_TIERS', () => {
      for (const tier of SUBSCRIPTION_TIERS) {
        expect(TIER_CONFIG[tier]).toBeDefined();
        expect(TIER_CONFIG[tier].name).toBeTruthy();
        expect(TIER_CONFIG[tier].maxOutputTokens).toBeGreaterThan(0);
        expect(TIER_CONFIG[tier].maxModels).toBeGreaterThan(0);
        expect(TIER_CONFIG[tier].quotas).toBeDefined();
        expect(TIER_CONFIG[tier].upgradeMessage).toBeTruthy();
        expect(TIER_CONFIG[tier].monthlyCredits).toBeGreaterThanOrEqual(0);
      }
    });

    it('derived exports match TIER_CONFIG values', () => {
      for (const tier of SUBSCRIPTION_TIERS) {
        expect(SUBSCRIPTION_TIER_NAMES[tier]).toBe(TIER_CONFIG[tier].name);
        expect(MAX_OUTPUT_TOKENS_BY_TIER[tier]).toBe(TIER_CONFIG[tier].maxOutputTokens);
        expect(MAX_MODEL_PRICING_BY_TIER[tier]).toBe(TIER_CONFIG[tier].maxModelPricing);
        expect(MAX_MODELS_BY_TIER[tier]).toBe(TIER_CONFIG[tier].maxModels);
        expect(TIER_QUOTAS[tier]).toEqual(TIER_CONFIG[tier].quotas);
      }
    });

    it('getTierUpgradeMessage returns message from TIER_CONFIG', () => {
      for (const tier of SUBSCRIPTION_TIERS) {
        expect(getTierUpgradeMessage(tier)).toBe(TIER_CONFIG[tier].upgradeMessage);
      }
    });

    it('has exactly 2 tiers', () => {
      expect(SUBSCRIPTION_TIERS).toHaveLength(2);
      expect(SUBSCRIPTION_TIERS).toContain(SubscriptionTiers.FREE);
      expect(SUBSCRIPTION_TIERS).toContain(SubscriptionTiers.PRO);
    });

    it('pro tier has unlimited model access', () => {
      expect(TIER_CONFIG.pro.maxModelPricing).toBeNull();
      expect(MAX_MODEL_PRICING_BY_TIER.pro).toBeNull();
    });

    it('free tier has limited model access', () => {
      expect(TIER_CONFIG.free.maxModelPricing).toBe(0.10);
      expect(MAX_MODEL_PRICING_BY_TIER.free).toBe(0.10);
    });
  });
});
