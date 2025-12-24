import { describe, expect, it } from 'vitest';

import {
  CREDIT_CONFIG,
  getMaxModelsForTier,
  getMonthlyCreditsForTier,
  getTierFromProductId,
  MAX_MODELS_BY_TIER,
  SUBSCRIPTION_TIER_NAMES,
} from '../product-logic.service';

describe('product-logic.service', () => {
  describe('getTierFromProductId', () => {
    describe('direct product ID matching', () => {
      it('returns "free" for the Free plan product ID', () => {
        const freeProductId = CREDIT_CONFIG.PLANS.free.stripeProductId;
        expect(getTierFromProductId(freeProductId)).toBe('free');
      });

      it('returns "pro" for the Paid plan product ID', () => {
        const paidProductId = CREDIT_CONFIG.PLANS.paid.stripeProductId;
        expect(getTierFromProductId(paidProductId)).toBe('pro');
      });
    });

    describe('pattern-based fallback matching', () => {
      it('returns "starter" for product IDs containing "starter"', () => {
        expect(getTierFromProductId('prod_starter_monthly')).toBe('starter');
        expect(getTierFromProductId('prod_STARTER_annual')).toBe('starter');
      });

      it('returns "power" for product IDs containing "power"', () => {
        expect(getTierFromProductId('prod_power_monthly')).toBe('power');
        expect(getTierFromProductId('prod_POWER_tier')).toBe('power');
      });

      it('returns "pro" for product IDs with "pro" pattern', () => {
        expect(getTierFromProductId('prod_pro_monthly')).toBe('pro');
        expect(getTierFromProductId('my_pro')).toBe('pro');
        expect(getTierFromProductId('tier-pro-annual')).toBe('pro');
      });

      it('does NOT match "pro" in "prod_" prefix', () => {
        // This should fall through to "free" since it doesn't match any pattern
        expect(getTierFromProductId('prod_xyz')).toBe('free');
      });

      it('returns "free" for unknown product IDs', () => {
        expect(getTierFromProductId('unknown_product_123')).toBe('free');
        expect(getTierFromProductId('')).toBe('free');
        expect(getTierFromProductId('random_string')).toBe('free');
      });
    });

    describe('priority order', () => {
      it('checks "power" before "pro" to avoid false matches', () => {
        // If a product has both, "power" should win
        expect(getTierFromProductId('prod_power_pro')).toBe('power');
      });

      it('checks "starter" first as most specific', () => {
        expect(getTierFromProductId('prod_starter_power')).toBe('starter');
      });
    });
  });

  describe('getMaxModelsForTier', () => {
    it('returns correct max models for each tier', () => {
      expect(getMaxModelsForTier('free')).toBe(MAX_MODELS_BY_TIER.free);
      expect(getMaxModelsForTier('starter')).toBe(MAX_MODELS_BY_TIER.starter);
      expect(getMaxModelsForTier('pro')).toBe(MAX_MODELS_BY_TIER.pro);
      expect(getMaxModelsForTier('power')).toBe(MAX_MODELS_BY_TIER.power);
    });

    it('returns 3 for free tier', () => {
      expect(getMaxModelsForTier('free')).toBe(3);
    });

    it('returns 8 for pro tier', () => {
      expect(getMaxModelsForTier('pro')).toBe(8);
    });
  });

  describe('getMonthlyCreditsForTier', () => {
    it('returns 0 for free tier (no monthly credits)', () => {
      expect(getMonthlyCreditsForTier('free')).toBe(0);
      expect(getMonthlyCreditsForTier('free')).toBe(CREDIT_CONFIG.PLANS.free.monthlyCredits);
    });

    it('returns 1,000,000 for pro tier', () => {
      expect(getMonthlyCreditsForTier('pro')).toBe(1_000_000);
      expect(getMonthlyCreditsForTier('pro')).toBe(CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });

    it('returns paid plan credits for all paid tiers', () => {
      const paidCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;
      expect(getMonthlyCreditsForTier('starter')).toBe(paidCredits);
      expect(getMonthlyCreditsForTier('pro')).toBe(paidCredits);
      expect(getMonthlyCreditsForTier('power')).toBe(paidCredits);
    });
  });

  describe('subscription tier names', () => {
    it('has correct names for all tiers', () => {
      expect(SUBSCRIPTION_TIER_NAMES.free).toBe('Free');
      expect(SUBSCRIPTION_TIER_NAMES.starter).toBe('Starter');
      expect(SUBSCRIPTION_TIER_NAMES.pro).toBe('Pro');
      expect(SUBSCRIPTION_TIER_NAMES.power).toBe('Power');
    });
  });

  describe('plan comparison integration', () => {
    it('correctly compares Free vs Pro plan differences', () => {
      const freeProductId = CREDIT_CONFIG.PLANS.free.stripeProductId;
      const proProductId = CREDIT_CONFIG.PLANS.paid.stripeProductId;

      const freeTier = getTierFromProductId(freeProductId);
      const proTier = getTierFromProductId(proProductId);

      expect(freeTier).toBe('free');
      expect(proTier).toBe('pro');

      // Models comparison
      const freeModels = getMaxModelsForTier(freeTier);
      const proModels = getMaxModelsForTier(proTier);
      expect(proModels).toBeGreaterThan(freeModels);
      expect(freeModels).toBe(3);
      expect(proModels).toBe(8);

      // Monthly credits comparison
      const freeCredits = getMonthlyCreditsForTier(freeTier);
      const proCredits = getMonthlyCreditsForTier(proTier);
      expect(proCredits).toBeGreaterThan(freeCredits);
      expect(freeCredits).toBe(0);
      expect(proCredits).toBe(1_000_000);

      // Tier names
      expect(SUBSCRIPTION_TIER_NAMES[freeTier]).toBe('Free');
      expect(SUBSCRIPTION_TIER_NAMES[proTier]).toBe('Pro');
    });

    it('provides consistent data for subscription change display', () => {
      // Simulates the SubscriptionChangedClient data flow
      const oldProductId = CREDIT_CONFIG.PLANS.free.stripeProductId;
      const newProductId = CREDIT_CONFIG.PLANS.paid.stripeProductId;

      const oldTier = getTierFromProductId(oldProductId);
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
        tier: 'free',
        name: 'Free',
        maxModels: 3,
        monthlyCredits: 0,
      });

      expect(comparison.newPlan).toEqual({
        tier: 'pro',
        name: 'Pro',
        maxModels: 8,
        monthlyCredits: 1_000_000,
      });
    });
  });
});
