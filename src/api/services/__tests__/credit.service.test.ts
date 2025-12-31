import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanType } from '@/api/core/enums';
import { SubscriptionTiers } from '@/api/core/enums';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

vi.mock('@/db', async () => {
  return {
    getDbAsync: vi.fn(),
    userCreditBalance: { userId: 'userId', balance: 'balance', version: 'version' },
    creditTransaction: { userId: 'userId', action: 'action', id: 'id' },
  };
});

type MockUserCreditData = {
  balance: number;
  reservedCredits: number;
  planType: PlanType;
  monthlyCredits: number;
  payAsYouGoEnabled: boolean;
  nextRefillAt: null;
  hasCardConnectionTransaction: boolean;
};

const mockUserCreditData: MockUserCreditData = {
  balance: 0,
  reservedCredits: 0,
  planType: SubscriptionTiers.FREE,
  monthlyCredits: 0,
  payAsYouGoEnabled: false,
  nextRefillAt: null,
  hasCardConnectionTransaction: false,
};

beforeEach(() => {
  mockUserCreditData.balance = 0;
  mockUserCreditData.reservedCredits = 0;
  mockUserCreditData.planType = SubscriptionTiers.FREE;
  mockUserCreditData.monthlyCredits = 0;
  mockUserCreditData.hasCardConnectionTransaction = false;
});

describe('credit.service', () => {
  describe('credit config', () => {
    describe('free plan configuration', () => {
      it('has 0 signup credits (users must connect card first)', () => {
        expect(CREDIT_CONFIG.PLANS.free.signupCredits).toBe(0);
      });

      it('has 10,000 card connection credits', () => {
        expect(CREDIT_CONFIG.PLANS.free.cardConnectionCredits).toBe(10_000);
      });

      it('has 0 monthly credits (no auto-renewal for free)', () => {
        expect(CREDIT_CONFIG.PLANS.free.monthlyCredits).toBe(0);
      });

      it('has pay-as-you-go disabled for free tier', () => {
        expect(CREDIT_CONFIG.PLANS.free.payAsYouGoEnabled).toBe(false);
      });

      it('has valid Stripe product and price IDs', () => {
        expect(CREDIT_CONFIG.PLANS.free.stripeProductId).toMatch(/^prod_/);
        expect(CREDIT_CONFIG.PLANS.free.stripePriceId).toMatch(/^price_/);
      });
    });

    describe('paid plan configuration', () => {
      it('has 1,000,000 monthly credits', () => {
        expect(CREDIT_CONFIG.PLANS.paid.monthlyCredits).toBe(1_000_000);
      });

      it('has pay-as-you-go enabled for paid tier', () => {
        expect(CREDIT_CONFIG.PLANS.paid.payAsYouGoEnabled).toBe(true);
      });

      it('has $100/month price', () => {
        expect(CREDIT_CONFIG.PLANS.paid.priceInCents).toBe(10000);
      });

      it('has valid Stripe product and price IDs', () => {
        expect(CREDIT_CONFIG.PLANS.paid.stripeProductId).toMatch(/^prod_/);
        expect(CREDIT_CONFIG.PLANS.paid.stripePriceId).toMatch(/^price_/);
      });
    });

    describe('custom credits packages', () => {
      it('has valid credit packages defined', () => {
        const packages = CREDIT_CONFIG.CUSTOM_CREDITS.packages;
        expect(Object.keys(packages).length).toBeGreaterThan(0);
      });

      it('all package price IDs start with price_', () => {
        const packages = CREDIT_CONFIG.CUSTOM_CREDITS.packages;
        Object.keys(packages).forEach((priceId) => {
          expect(priceId).toMatch(/^price_/);
        });
      });

      it('all packages have positive credit amounts', () => {
        const packages = CREDIT_CONFIG.CUSTOM_CREDITS.packages;
        Object.values(packages).forEach((credits) => {
          expect(credits).toBeGreaterThan(0);
        });
      });

      it('has creditsPerDollar conversion rate', () => {
        expect(CREDIT_CONFIG.CUSTOM_CREDITS.creditsPerDollar).toBe(1000);
      });
    });

    describe('action costs', () => {
      it('has all required action costs defined', () => {
        expect(CREDIT_CONFIG.ACTION_COSTS.threadCreation).toBeDefined();
        expect(CREDIT_CONFIG.ACTION_COSTS.webSearchQuery).toBeDefined();
        expect(CREDIT_CONFIG.ACTION_COSTS.fileReading).toBeDefined();
        expect(CREDIT_CONFIG.ACTION_COSTS.analysisGeneration).toBeDefined();
      });

      it('thread creation costs 100 tokens', () => {
        expect(CREDIT_CONFIG.ACTION_COSTS.threadCreation).toBe(100);
      });

      it('web search costs 500 tokens', () => {
        expect(CREDIT_CONFIG.ACTION_COSTS.webSearchQuery).toBe(500);
      });
    });
  });

  describe('needsCardConnection logic (unit tests)', () => {
    function simulateNeedsCardConnection(userData: MockUserCreditData): boolean {
      // Simulate the needsCardConnection logic
      if (userData.planType !== SubscriptionTiers.FREE || userData.balance > 0) {
        return false;
      }
      return !userData.hasCardConnectionTransaction;
    }

    it('returns false for paid plan users', () => {
      mockUserCreditData.planType = SubscriptionTiers.PRO;
      mockUserCreditData.balance = 0;
      mockUserCreditData.hasCardConnectionTransaction = false;

      expect(simulateNeedsCardConnection(mockUserCreditData)).toBe(false);
    });

    it('returns false for free users with positive balance', () => {
      mockUserCreditData.planType = SubscriptionTiers.FREE;
      mockUserCreditData.balance = 5000;
      mockUserCreditData.hasCardConnectionTransaction = false;

      expect(simulateNeedsCardConnection(mockUserCreditData)).toBe(false);
    });

    it('returns false for free users who already connected card', () => {
      mockUserCreditData.planType = SubscriptionTiers.FREE;
      mockUserCreditData.balance = 0;
      mockUserCreditData.hasCardConnectionTransaction = true;

      expect(simulateNeedsCardConnection(mockUserCreditData)).toBe(false);
    });

    it('returns true for new free users with 0 balance and no card connection', () => {
      mockUserCreditData.planType = SubscriptionTiers.FREE;
      mockUserCreditData.balance = 0;
      mockUserCreditData.hasCardConnectionTransaction = false;

      expect(simulateNeedsCardConnection(mockUserCreditData)).toBe(true);
    });
  });

  describe('enforceCredits error messages (unit tests)', () => {
    function getEnforceCreditsError(
      available: number,
      required: number,
      planType: PlanType,
      needsCard: boolean,
    ): string | null {
      if (available >= required) {
        return null; // No error
      }

      if (needsCard) {
        return 'Connect a payment method to receive your free 10,000 credits and start chatting. '
          + 'No charges until you exceed your free credits.';
      }

      return `Insufficient credits. Required: ${required}, Available: ${available}. `
        + `${planType === SubscriptionTiers.FREE ? 'Upgrade to Pro or ' : ''}Purchase additional credits to continue.`;
    }

    it('returns null when user has sufficient credits', () => {
      const error = getEnforceCreditsError(100, 50, SubscriptionTiers.FREE, false);
      expect(error).toBeNull();
    });

    it('returns card connection message for new users', () => {
      const error = getEnforceCreditsError(0, 1, SubscriptionTiers.FREE, true);
      expect(error).toContain('Connect a payment method');
      expect(error).toContain('10,000 credits');
      expect(error).toContain('No charges until you exceed');
    });

    it('returns insufficient credits message for free users who exhausted credits', () => {
      const error = getEnforceCreditsError(0, 100, SubscriptionTiers.FREE, false);
      expect(error).toContain('Insufficient credits');
      expect(error).toContain('Required: 100');
      expect(error).toContain('Available: 0');
      expect(error).toContain('Upgrade to Pro');
    });

    it('returns insufficient credits message for paid users without upgrade suggestion', () => {
      const error = getEnforceCreditsError(50, 100, SubscriptionTiers.PRO, false);
      expect(error).toContain('Insufficient credits');
      expect(error).toContain('Required: 100');
      expect(error).toContain('Available: 50');
      expect(error).not.toContain('Upgrade to Pro');
    });
  });

  describe('grantCardConnectionCredits logic (unit tests)', () => {
    function simulateGrantCardConnectionCredits(
      hasExistingTransaction: boolean,
      cardConnectionCredits: number,
    ): { granted: boolean; amount: number } {
      if (hasExistingTransaction) {
        return { granted: false, amount: 0 };
      }

      if (cardConnectionCredits <= 0) {
        return { granted: false, amount: 0 };
      }

      return { granted: true, amount: cardConnectionCredits };
    }

    it('returns false if user already has card connection transaction', () => {
      const result = simulateGrantCardConnectionCredits(true, 10_000);
      expect(result.granted).toBe(false);
      expect(result.amount).toBe(0);
    });

    it('returns false if cardConnectionCredits is 0', () => {
      const result = simulateGrantCardConnectionCredits(false, 0);
      expect(result.granted).toBe(false);
      expect(result.amount).toBe(0);
    });

    it('returns true with correct amount for new users', () => {
      const result = simulateGrantCardConnectionCredits(false, 10_000);
      expect(result.granted).toBe(true);
      expect(result.amount).toBe(10_000);
    });
  });

  describe('credit calculation utilities', () => {
    it('tokens per credit is 1000', () => {
      expect(CREDIT_CONFIG.TOKENS_PER_CREDIT).toBe(1000);
    });

    it('reservation multiplier is 1.5', () => {
      expect(CREDIT_CONFIG.RESERVATION_MULTIPLIER).toBe(1.5);
    });

    it('min credits for streaming is 10', () => {
      expect(CREDIT_CONFIG.MIN_CREDITS_FOR_STREAMING).toBe(10);
    });

    it('default estimated tokens per response is 2000', () => {
      expect(CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE).toBe(2000);
    });

    function tokensToCredits(tokens: number): number {
      return Math.ceil(tokens / CREDIT_CONFIG.TOKENS_PER_CREDIT);
    }

    it('converts 1000 tokens to 1 credit', () => {
      expect(tokensToCredits(1000)).toBe(1);
    });

    it('rounds up partial credits (1001 tokens = 2 credits)', () => {
      expect(tokensToCredits(1001)).toBe(2);
    });

    it('rounds up small amounts (1 token = 1 credit)', () => {
      expect(tokensToCredits(1)).toBe(1);
    });

    function estimateStreamingCredits(
      participantCount: number,
      estimatedInputTokens: number = 500,
    ): number {
      const estimatedOutputTokens = CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE * participantCount;
      const totalTokens = estimatedInputTokens + estimatedOutputTokens;
      const reservedTokens = Math.ceil(totalTokens * CREDIT_CONFIG.RESERVATION_MULTIPLIER);
      return tokensToCredits(reservedTokens);
    }

    it('estimates credits for single participant', () => {
      // 500 input + 2000 output = 2500 tokens * 1.5 = 3750 tokens = 4 credits
      expect(estimateStreamingCredits(1)).toBe(4);
    });

    it('estimates credits for 3 participants', () => {
      expect(estimateStreamingCredits(3)).toBe(10);
    });

    it('estimates credits with custom input tokens', () => {
      expect(estimateStreamingCredits(1, 1000)).toBe(5);
    });
  });

  describe('edge cases that could cause thread creation failures', () => {
    it('new user with 0 signup credits gets clear card connection message', () => {
      const signupCredits = CREDIT_CONFIG.PLANS.free.signupCredits;
      expect(signupCredits).toBe(0);

      const cardConnectionCredits = CREDIT_CONFIG.PLANS.free.cardConnectionCredits;
      expect(cardConnectionCredits).toBe(10_000);

      const needsCard = signupCredits === 0 && cardConnectionCredits > 0;
      expect(needsCard).toBe(true);
    });

    it('thread creation cost is less than card connection credits', () => {
      const threadCost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;
      const cardConnectionCredits = CREDIT_CONFIG.PLANS.free.cardConnectionCredits;

      expect(threadCost).toBeLessThan(cardConnectionCredits);
    });

    it('estimated streaming credits for 3 participants fits within card connection credits', () => {
      function estimateStreamingCredits(participantCount: number): number {
        const estimatedOutputTokens = CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE * participantCount;
        const totalTokens = 500 + estimatedOutputTokens;
        const reservedTokens = Math.ceil(totalTokens * CREDIT_CONFIG.RESERVATION_MULTIPLIER);
        return Math.ceil(reservedTokens / CREDIT_CONFIG.TOKENS_PER_CREDIT);
      }

      const estimatedCredits = estimateStreamingCredits(3);
      const cardConnectionCredits = CREDIT_CONFIG.PLANS.free.cardConnectionCredits;

      expect(estimatedCredits).toBeLessThan(cardConnectionCredits);
    });
  });
});
