/**
 * Product Logic Service - Quota & Tier Configuration Tests
 *
 * Tests for tier-based quotas, model pricing, credit calculations,
 * and tier access logic.
 */

import { describe, expect, it } from 'vitest';

import type { SubscriptionTier } from '@/api/core/enums';
import { SubscriptionTiers } from '@/api/core/enums';
import {
  calculateBaseCredits,
  calculateWeightedCredits,
  canAccessByTier,
  canAccessModelByPricing,
  costPerMillion,
  creditsToTokens,
  estimateStreamingCredits,
  estimateWeightedCredits,
  getActionCreditCost,
  getMaxModelsForTier,
  getMaxOutputTokensForTier,
  getModelCostCategory,
  getModelPricingDisplay,
  getMonthlyCreditsForTier,
  getPlanConfig,
  getRequiredTierForModel,
  getSafeMaxOutputTokens,
  getTierName,
  getTiersInOrder,
  isModelFree,
  MAX_MODELS_BY_TIER,
  MAX_OUTPUT_TOKENS_BY_TIER,
  parsePrice,
  SUBSCRIPTION_TIER_NAMES,
  TIER_CONFIG,
  TIER_QUOTAS,
  tokensToCredits,
} from '@/api/services/billing';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

describe('product Logic - Quota and Tier Configuration', () => {
  describe('tIER_CONFIG Structure', () => {
    it('defines configuration for all tiers', () => {
      expect(TIER_CONFIG).toBeDefined();
      expect(TIER_CONFIG[SubscriptionTiers.FREE]).toBeDefined();
      expect(TIER_CONFIG[SubscriptionTiers.PRO]).toBeDefined();
    });

    it('each tier has complete configuration', () => {
      Object.values(TIER_CONFIG).forEach((config) => {
        expect(config.name).toBeDefined();
        expect(config.maxOutputTokens).toBeDefined();
        expect(config.maxModels).toBeDefined();
        expect(config.quotas).toBeDefined();
        expect(config.upgradeMessage).toBeDefined();
        expect(config.monthlyCredits).toBeDefined();
      });
    });

    it('tier names are human-readable', () => {
      expect(TIER_CONFIG[SubscriptionTiers.FREE].name).toBe('Free');
      expect(TIER_CONFIG[SubscriptionTiers.PRO].name).toBe('Pro');
    });

    it('quotas contain all usage types', () => {
      Object.values(TIER_CONFIG).forEach((config) => {
        expect(config.quotas.threadsPerMonth).toBeDefined();
        expect(config.quotas.messagesPerMonth).toBeDefined();
        expect(config.quotas.customRolesPerMonth).toBeDefined();
        expect(config.quotas.analysisPerMonth).toBeDefined();
      });
    });
  });

  describe('tIER_QUOTAS Derivation', () => {
    it('derives quotas from TIER_CONFIG', () => {
      expect(TIER_QUOTAS[SubscriptionTiers.FREE]).toEqual(
        TIER_CONFIG[SubscriptionTiers.FREE].quotas,
      );
      expect(TIER_QUOTAS[SubscriptionTiers.PRO]).toEqual(
        TIER_CONFIG[SubscriptionTiers.PRO].quotas,
      );
    });

    it('quotas are consistent with config source', () => {
      const freeTier = SubscriptionTiers.FREE;
      expect(TIER_QUOTAS[freeTier].threadsPerMonth).toBe(
        TIER_CONFIG[freeTier].quotas.threadsPerMonth,
      );
    });
  });

  describe('tier Output Token Limits', () => {
    it('free tier has 512 max output tokens', () => {
      expect(MAX_OUTPUT_TOKENS_BY_TIER[SubscriptionTiers.FREE]).toBe(512);
    });

    it('pro tier has 4096 max output tokens', () => {
      expect(MAX_OUTPUT_TOKENS_BY_TIER[SubscriptionTiers.PRO]).toBe(4096);
    });

    it('getMaxOutputTokensForTier returns correct value', () => {
      expect(getMaxOutputTokensForTier(SubscriptionTiers.FREE)).toBe(512);
      expect(getMaxOutputTokensForTier(SubscriptionTiers.PRO)).toBe(4096);
    });

    it('pro tier has 8x more output tokens than free', () => {
      const freeTokens = MAX_OUTPUT_TOKENS_BY_TIER[SubscriptionTiers.FREE];
      const proTokens = MAX_OUTPUT_TOKENS_BY_TIER[SubscriptionTiers.PRO];

      expect(proTokens / freeTokens).toBe(8);
    });
  });

  describe('tier Model Count Limits', () => {
    it('free tier allows 3 models', () => {
      expect(MAX_MODELS_BY_TIER[SubscriptionTiers.FREE]).toBe(3);
    });

    it('pro tier allows 12 models', () => {
      expect(MAX_MODELS_BY_TIER[SubscriptionTiers.PRO]).toBe(12);
    });

    it('getMaxModelsForTier returns correct value', () => {
      expect(getMaxModelsForTier(SubscriptionTiers.FREE)).toBe(3);
      expect(getMaxModelsForTier(SubscriptionTiers.PRO)).toBe(12);
    });

    it('pro tier allows 4x more models than free', () => {
      const freeModels = MAX_MODELS_BY_TIER[SubscriptionTiers.FREE];
      const proModels = MAX_MODELS_BY_TIER[SubscriptionTiers.PRO];

      expect(proModels / freeModels).toBe(4);
    });
  });

  describe('monthly Credits by Tier', () => {
    it('free tier has 0 monthly credits (one-time signup bonus)', () => {
      expect(getMonthlyCreditsForTier(SubscriptionTiers.FREE)).toBe(0);
    });

    it('pro tier has 100,000 monthly credits', () => {
      expect(getMonthlyCreditsForTier(SubscriptionTiers.PRO)).toBe(100_000);
    });

    it('monthly credits match CREDIT_CONFIG', () => {
      const proCredits = getMonthlyCreditsForTier(SubscriptionTiers.PRO);
      expect(proCredits).toBe(CREDIT_CONFIG.PLANS.paid.monthlyCredits);
    });
  });

  describe('tier Names and Metadata', () => {
    it('sUBSCRIPTION_TIER_NAMES maps all tiers', () => {
      expect(SUBSCRIPTION_TIER_NAMES[SubscriptionTiers.FREE]).toBe('Free');
      expect(SUBSCRIPTION_TIER_NAMES[SubscriptionTiers.PRO]).toBe('Pro');
    });

    it('getTierName returns correct name', () => {
      expect(getTierName(SubscriptionTiers.FREE)).toBe('Free');
      expect(getTierName(SubscriptionTiers.PRO)).toBe('Pro');
    });

    it('getTiersInOrder returns tiers in correct order', () => {
      const tiers = getTiersInOrder();
      expect(tiers).toEqual([SubscriptionTiers.FREE, SubscriptionTiers.PRO]);
    });
  });

  describe('credit Calculation Utilities', () => {
    describe('tokensToCredits', () => {
      it('converts 1000 tokens to 1 credit', () => {
        expect(tokensToCredits(1000)).toBe(1);
      });

      it('rounds up partial credits', () => {
        expect(tokensToCredits(1001)).toBe(2);
        expect(tokensToCredits(1500)).toBe(2);
        expect(tokensToCredits(1999)).toBe(2);
      });

      it('handles small token amounts', () => {
        expect(tokensToCredits(1)).toBe(1);
        expect(tokensToCredits(500)).toBe(1);
      });

      it('handles large token amounts', () => {
        expect(tokensToCredits(100000)).toBe(100);
        expect(tokensToCredits(1000000)).toBe(1000);
      });
    });

    describe('creditsToTokens', () => {
      it('converts 1 credit to 1000 tokens', () => {
        expect(creditsToTokens(1)).toBe(1000);
      });

      it('converts multiple credits', () => {
        expect(creditsToTokens(5)).toBe(5000);
        expect(creditsToTokens(100)).toBe(100000);
      });

      it('handles zero credits', () => {
        expect(creditsToTokens(0)).toBe(0);
      });
    });

    describe('roundtrip conversion', () => {
      it('tokens -> credits -> tokens preserves approximate value', () => {
        const originalTokens = 5000;
        const credits = tokensToCredits(originalTokens);
        const backToTokens = creditsToTokens(credits);

        // Should be equal or slightly higher due to rounding up
        expect(backToTokens).toBeGreaterThanOrEqual(originalTokens);
      });
    });

    describe('calculateBaseCredits', () => {
      it('calculates credits from input and output tokens', () => {
        const inputTokens = 500;
        const outputTokens = 1500;
        const credits = calculateBaseCredits(inputTokens, outputTokens);

        expect(credits).toBe(2); // 2000 tokens / 1000 = 2
      });

      it('rounds up partial credits', () => {
        const credits = calculateBaseCredits(500, 600);
        expect(credits).toBe(2); // 1100 tokens / 1000 = 1.1, rounded to 2
      });

      it('handles zero tokens', () => {
        expect(calculateBaseCredits(0, 0)).toBe(0);
      });
    });
  });

  describe('action Credit Costs', () => {
    it('getActionCreditCost returns credit cost for actions', () => {
      const threadCost = getActionCreditCost('threadCreation');
      expect(threadCost).toBeGreaterThan(0);
    });

    it('thread creation costs minimal credits', () => {
      const cost = getActionCreditCost('threadCreation');
      // 100 tokens / 1000 = 0.1, rounded up to 1
      expect(cost).toBe(1);
    });

    it('web search costs 500 tokens (1 credit rounded)', () => {
      const threadCost = getActionCreditCost('threadCreation');
      const searchCost = getActionCreditCost('webSearchQuery');

      // Both round to 1 credit due to Math.ceil(tokens / 1000)
      // 100 tokens -> 1 credit, 500 tokens -> 1 credit
      expect(searchCost).toBeGreaterThanOrEqual(threadCost);
    });

    it('analysis generation has highest action cost', () => {
      const analysisCost = getActionCreditCost('analysisGeneration');
      const threadCost = getActionCreditCost('threadCreation');
      const searchCost = getActionCreditCost('webSearchQuery');

      expect(analysisCost).toBeGreaterThan(threadCost);
      expect(analysisCost).toBeGreaterThan(searchCost);
    });
  });

  describe('streaming Credit Estimation', () => {
    it('estimates credits for single participant', () => {
      const credits = estimateStreamingCredits(1);
      expect(credits).toBeGreaterThan(0);
    });

    it('estimates more credits for more participants', () => {
      const oneParticipant = estimateStreamingCredits(1);
      const threeParticipants = estimateStreamingCredits(3);

      expect(threeParticipants).toBeGreaterThan(oneParticipant);
    });

    it('includes reservation multiplier', () => {
      const participantCount = 1;
      const estimatedInput = 500;
      const estimatedOutput = CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE * participantCount;
      const totalTokens = estimatedInput + estimatedOutput;
      const reservedTokens = Math.ceil(totalTokens * CREDIT_CONFIG.RESERVATION_MULTIPLIER);
      const expectedCredits = tokensToCredits(reservedTokens);

      const actualCredits = estimateStreamingCredits(participantCount, estimatedInput);
      expect(actualCredits).toBe(expectedCredits);
    });

    it('accepts custom estimated input tokens', () => {
      const withDefault = estimateStreamingCredits(1);
      const withCustom = estimateStreamingCredits(1, 2000);

      expect(withCustom).toBeGreaterThan(withDefault);
    });
  });

  describe('model Pricing and Tier Access', () => {
    // Free tier max pricing is $0.10/1M tokens
    const mockFreeModel = {
      id: 'free-model',
      pricing: { prompt: '0.00000005', completion: '0.0000001' }, // $0.05/1M input
      pricing_display: { input: '$0.05', output: '$0.10' },
      context_length: 4096,
    };

    const mockProModel = {
      id: 'pro-model',
      pricing: { prompt: '0.00015', completion: '0.0003' }, // $150/1M input
      pricing_display: { input: '$150.00', output: '$300.00' },
      context_length: 128000,
    };

    describe('parsePrice', () => {
      it('parses string prices with dollar sign', () => {
        expect(parsePrice('$15.50')).toBe(15.5);
      });

      it('parses string prices without dollar sign', () => {
        expect(parsePrice('10.99')).toBe(10.99);
      });

      it('handles numeric prices', () => {
        expect(parsePrice(25.5)).toBe(25.5);
      });

      it('handles null and undefined', () => {
        expect(parsePrice(null)).toBe(0);
        expect(parsePrice(undefined)).toBe(0);
      });
    });

    describe('costPerMillion', () => {
      it('converts per-token price to per-million', () => {
        const perToken = 0.00001;
        const perMillion = costPerMillion(perToken);

        expect(perMillion).toBe(10);
      });

      it('handles string prices', () => {
        expect(costPerMillion('0.00001')).toBe(10);
      });
    });

    describe('isModelFree', () => {
      it('identifies free models under pricing threshold', () => {
        expect(isModelFree(mockFreeModel)).toBe(true);
      });

      it('identifies paid models above threshold', () => {
        expect(isModelFree(mockProModel)).toBe(false);
      });
    });

    describe('getModelCostCategory', () => {
      it('categorizes free models', () => {
        expect(getModelCostCategory(mockFreeModel)).toBe('free');
      });

      it('categorizes low-cost models ($0.10-$1.00)', () => {
        const lowCostModel = {
          ...mockFreeModel,
          pricing: { prompt: '0.00000025', completion: '0.0000005' }, // $0.25/1M
          pricing_display: { input: '$0.25', output: '$0.50' },
        };
        expect(getModelCostCategory(lowCostModel)).toBe('low');
      });

      it('categorizes medium-cost models ($1.00-$10.00)', () => {
        const mediumCostModel = {
          ...mockFreeModel,
          pricing: { prompt: '0.000005', completion: '0.00001' }, // $5/1M
          pricing_display: { input: '$5.00', output: '$10.00' },
        };
        expect(getModelCostCategory(mediumCostModel)).toBe('medium');
      });

      it('categorizes high-cost models', () => {
        expect(getModelCostCategory(mockProModel)).toBe('high');
      });
    });

    describe('getModelPricingDisplay', () => {
      it('displays "Free" for free models', () => {
        expect(getModelPricingDisplay(mockFreeModel)).toBe('Free');
      });

      it('displays pricing for paid models', () => {
        const display = getModelPricingDisplay(mockProModel);
        expect(display).toContain('$150.00');
        expect(display).toContain('$300.00');
        expect(display).toContain('per 1M tokens');
      });
    });

    describe('getRequiredTierForModel', () => {
      it('returns free tier for free models', () => {
        expect(getRequiredTierForModel(mockFreeModel)).toBe(SubscriptionTiers.FREE);
      });

      it('returns pro tier for premium models', () => {
        expect(getRequiredTierForModel(mockProModel)).toBe(SubscriptionTiers.PRO);
      });
    });

    describe('canAccessModelByPricing', () => {
      it('free user can access free models', () => {
        expect(canAccessModelByPricing(SubscriptionTiers.FREE, mockFreeModel)).toBe(true);
      });

      it('free user cannot access premium models', () => {
        expect(canAccessModelByPricing(SubscriptionTiers.FREE, mockProModel)).toBe(false);
      });

      it('pro user can access all models', () => {
        expect(canAccessModelByPricing(SubscriptionTiers.PRO, mockFreeModel)).toBe(true);
        expect(canAccessModelByPricing(SubscriptionTiers.PRO, mockProModel)).toBe(true);
      });
    });
  });

  describe('tier Access Logic', () => {
    it('canAccessByTier allows same tier access', () => {
      expect(canAccessByTier(SubscriptionTiers.FREE, SubscriptionTiers.FREE)).toBe(true);
      expect(canAccessByTier(SubscriptionTiers.PRO, SubscriptionTiers.PRO)).toBe(true);
    });

    it('canAccessByTier allows higher tier to access lower', () => {
      expect(canAccessByTier(SubscriptionTiers.PRO, SubscriptionTiers.FREE)).toBe(true);
    });

    it('canAccessByTier blocks lower tier from higher', () => {
      expect(canAccessByTier(SubscriptionTiers.FREE, SubscriptionTiers.PRO)).toBe(false);
    });
  });

  describe('safe Output Token Calculation', () => {
    it('respects tier max output tokens', () => {
      const modelContext = 128000;
      const estimatedInput = 1000;
      const tier = SubscriptionTiers.FREE;

      const safeMax = getSafeMaxOutputTokens(modelContext, estimatedInput, tier);

      expect(safeMax).toBeLessThanOrEqual(MAX_OUTPUT_TOKENS_BY_TIER[tier]);
    });

    it('respects model context length', () => {
      const modelContext = 4096;
      const estimatedInput = 1000;
      const tier = SubscriptionTiers.PRO;

      const safeMax = getSafeMaxOutputTokens(modelContext, estimatedInput, tier);

      expect(safeMax).toBeLessThan(modelContext - estimatedInput);
    });

    it('includes safety buffer', () => {
      const modelContext = 10000;
      const estimatedInput = 1000;
      const tier = SubscriptionTiers.PRO;

      const safeMax = getSafeMaxOutputTokens(modelContext, estimatedInput, tier);

      // Should leave 20% safety buffer
      const maxWithoutBuffer = modelContext - estimatedInput;
      expect(safeMax).toBeLessThan(maxWithoutBuffer);
    });

    it('minimum output is 512 tokens', () => {
      const modelContext = 1000;
      const estimatedInput = 900;
      const tier = SubscriptionTiers.FREE;

      const safeMax = getSafeMaxOutputTokens(modelContext, estimatedInput, tier);

      expect(safeMax).toBeGreaterThanOrEqual(512);
    });
  });

  describe('weighted Credit Calculations', () => {
    const mockModelLookup = (id: string) => {
      if (id === 'budget-model') {
        return {
          id: 'budget-model',
          pricing: { prompt: '0.00000005', completion: '0.0000001' }, // $0.05/1M - Budget tier
          pricing_display: { input: '$0.05', output: '$0.10' },
          context_length: 4096,
        };
      }
      if (id === 'premium-model') {
        return {
          id: 'premium-model',
          pricing: { prompt: '0.00015', completion: '0.0003' }, // $150/1M - Ultimate tier
          pricing_display: { input: '$150.00', output: '$300.00' },
          context_length: 128000,
        };
      }
      return undefined;
    };

    it('calculateWeightedCredits applies model tier multiplier', () => {
      const inputTokens = 1000;
      const outputTokens = 1000;
      const modelId = 'premium-model';

      const weighted = calculateWeightedCredits(inputTokens, outputTokens, modelId, mockModelLookup);

      // Base credits = 2, multiplied by model tier
      expect(weighted).toBeGreaterThan(2);
    });

    it('budget model uses 1x multiplier (lowest tier)', () => {
      const inputTokens = 1000;
      const outputTokens = 1000;
      const modelId = 'budget-model';

      const weighted = calculateWeightedCredits(inputTokens, outputTokens, modelId, mockModelLookup);
      const base = calculateBaseCredits(inputTokens, outputTokens);

      // Budget tier should be 1x or close to base
      expect(weighted).toBeGreaterThanOrEqual(base);
    });

    it('estimateWeightedCredits includes model multiplier', () => {
      const participantCount = 1;
      const modelId = 'premium-model';

      const weighted = estimateWeightedCredits(participantCount, modelId, mockModelLookup);
      const base = estimateStreamingCredits(participantCount);

      expect(weighted).toBeGreaterThan(base);
    });
  });

  describe('plan Configuration', () => {
    it('getPlanConfig returns paid plan configuration', () => {
      const config = getPlanConfig('paid');

      expect(config.monthlyCredits).toBe(100_000);
      expect(config.priceInCents).toBe(5900);
    });
  });

  describe('quota Edge Cases', () => {
    it('handles zero quotas', () => {
      const freeCustomRoles = TIER_QUOTAS[SubscriptionTiers.FREE].customRolesPerMonth;
      expect(freeCustomRoles).toBe(0);
    });

    it('all quotas are non-negative', () => {
      Object.values(TIER_QUOTAS).forEach((quotas) => {
        expect(quotas.threadsPerMonth).toBeGreaterThanOrEqual(0);
        expect(quotas.messagesPerMonth).toBeGreaterThanOrEqual(0);
        expect(quotas.customRolesPerMonth).toBeGreaterThanOrEqual(0);
        expect(quotas.analysisPerMonth).toBeGreaterThanOrEqual(0);
      });
    });

    it('pro tier quotas are multiples of 5 or 10', () => {
      const proQuotas = TIER_QUOTAS[SubscriptionTiers.PRO];

      // Common pattern for round numbers
      expect(proQuotas.customRolesPerMonth % 5).toBe(0);
    });
  });

  describe('configuration Consistency', () => {
    it('tier names match enum values', () => {
      const freeName = getTierName(SubscriptionTiers.FREE);
      const proName = getTierName(SubscriptionTiers.PRO);

      expect(freeName.toLowerCase()).toContain('free');
      expect(proName.toLowerCase()).toContain('pro');
    });

    it('all tiers have upgrade messages', () => {
      Object.values(TIER_CONFIG).forEach((config) => {
        expect(config.upgradeMessage).toBeTruthy();
        expect(config.upgradeMessage.length).toBeGreaterThan(0);
      });
    });

    it('max output tokens increase with tier', () => {
      const tiers = getTiersInOrder();
      for (let i = 1; i < tiers.length; i++) {
        const lowerTier = tiers[i - 1];
        const higherTier = tiers[i];

        expect(MAX_OUTPUT_TOKENS_BY_TIER[higherTier]).toBeGreaterThanOrEqual(
          MAX_OUTPUT_TOKENS_BY_TIER[lowerTier],
        );
      }
    });

    it('max models increase with tier', () => {
      const tiers = getTiersInOrder();
      for (let i = 1; i < tiers.length; i++) {
        const lowerTier = tiers[i - 1] as SubscriptionTier;
        const higherTier = tiers[i] as SubscriptionTier;

        expect(MAX_MODELS_BY_TIER[higherTier]).toBeGreaterThan(
          MAX_MODELS_BY_TIER[lowerTier],
        );
      }
    });
  });
});
