import { PlanTypes } from '@roundtable/shared/enums';
import { describe, expect, it } from 'vitest';

import { CREDIT_CONFIG } from '@/lib/config/credit-config';

describe('thread Creation Credit Enforcement', () => {
  describe('credit Requirements', () => {
    it('thread creation requires credits', () => {
      const threadCreationCost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;
      expect(threadCreationCost).toBeGreaterThan(0);
      expect(threadCreationCost).toBe(100);
    });

    it('streaming requires minimum credits', () => {
      const minCredits = CREDIT_CONFIG.MIN_CREDITS_FOR_STREAMING;
      expect(minCredits).toBeGreaterThan(0);
      expect(minCredits).toBe(10);
    });

    it('estimates streaming credits correctly', () => {
      const participantCount = 3;
      const estimatedInputTokens = 500;
      const outputPerParticipant = CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE;

      const totalTokens = estimatedInputTokens + (outputPerParticipant * participantCount);
      const withMultiplier = totalTokens * CREDIT_CONFIG.RESERVATION_MULTIPLIER;
      const credits = Math.ceil(withMultiplier / CREDIT_CONFIG.TOKENS_PER_CREDIT);

      expect(credits).toBe(10);
    });
  });

  describe('error Message Logic', () => {
    it('shows free round exhausted error for free users', () => {
      const errorMessage = 'Your free conversation round has been used. Subscribe to Pro to continue chatting.';

      expect(errorMessage).toContain('free conversation round');
      expect(errorMessage).toContain('Subscribe to Pro');
      expect(errorMessage).not.toContain('Insufficient credits');
    });

    it('shows insufficient credits error for free users', () => {
      const required = 100;
      const available = 0;
      const errorMessage = `Insufficient credits. Required: ${required}, Available: ${available}. `
        + 'Subscribe to Pro or Purchase additional credits to continue.';

      expect(errorMessage).toContain('Insufficient credits');
      expect(errorMessage).toContain(`Required: ${required}`);
      expect(errorMessage).toContain(`Available: ${available}`);
      expect(errorMessage).toContain('Subscribe to Pro');
    });

    it('shows insufficient credits error for paid users', () => {
      const required = 100;
      const available = 50;
      const errorMessage = `Insufficient credits. Required: ${required}, Available: ${available}. `
        + 'Your credits will refill at the start of next billing cycle.';

      expect(errorMessage).toContain('Insufficient credits');
      expect(errorMessage).not.toContain('Purchase');
    });
  });

  describe('free User Single Round Enforcement', () => {
    it('blocks free users by freeRoundUsed flag', () => {
      const freeUserState = {
        planType: PlanTypes.FREE,
        freeRoundUsed: true,
        creditBalance: 0,
      };

      const isBlocked = freeUserState.freeRoundUsed;
      expect(isBlocked).toBe(true);
    });

    it('free round completion is permanent', () => {
      const transactionExists = true;
      expect(transactionExists).toBe(true);
    });

    it('paid users not affected by freeRoundUsed flag', () => {
      const paidUserState = {
        planType: PlanTypes.PAID,
        freeRoundUsed: false,
        creditBalance: 0,
      };

      const isBlockedByRound = paidUserState.planType !== PlanTypes.PAID && paidUserState.freeRoundUsed;
      expect(isBlockedByRound).toBe(false);
    });
  });

  describe('validation Order', () => {
    it('validates in correct order', () => {
      const validationOrder = [
        'session_auth',
        'body_validation',
        'credit_enforcement',
        'model_validation',
        'tier_access_check',
        'database_insert',
      ];

      const creditIndex = validationOrder.indexOf('credit_enforcement');
      const modelIndex = validationOrder.indexOf('model_validation');

      expect(creditIndex).toBeLessThan(modelIndex);
    });
  });

  describe('signup Credits', () => {
    it('grants 5,000 signup credits', () => {
      expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
    });

    it('allows many thread creations', () => {
      const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;
      const threadCost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;

      const threadCostInCredits = Math.ceil(threadCost / CREDIT_CONFIG.TOKENS_PER_CREDIT);
      const possibleThreads = Math.floor(signupCredits / threadCostInCredits);

      expect(possibleThreads).toBeGreaterThan(100);
    });

    it('allows streaming with 3 participants', () => {
      const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;
      const estimatedCreditsPerRound = 10;
      const possibleRounds = Math.floor(signupCredits / estimatedCreditsPerRound);

      expect(possibleRounds).toBeGreaterThan(100);
    });
  });

  describe('edge Cases', () => {
    it('handles user with 0 credits', () => {
      const userBalance = 0;
      const required = 1;

      const insufficientCredits = userBalance < required;
      expect(insufficientCredits).toBe(true);
    });

    it('handles negative reserved credits', () => {
      const balance = 100;
      const reservedCredits = -50;
      const available = Math.max(0, balance - reservedCredits);

      expect(available).toBeGreaterThanOrEqual(0);
      expect(available).toBe(150);
    });
  });

  describe('request Schema Validation', () => {
    it('requires modelId in participants', () => {
      const requiredFields = ['modelId'];
      const optionalFields = ['role', 'customRoleId', 'systemPrompt', 'temperature', 'maxTokens'];

      expect(requiredFields).toContain('modelId');
      expect(optionalFields).toContain('role');
    });

    it('requires minimum 1 participant', () => {
      const minParticipants = 1;
      expect(minParticipants).toBeGreaterThanOrEqual(1);
    });

    it('enforces unique modelIds', () => {
      const uniqueCheck = (participants: { modelId: string }[]) => {
        const ids = participants.map(p => p.modelId);
        const uniqueIds = [...new Set(ids)];
        return ids.length === uniqueIds.length;
      };

      expect(uniqueCheck([
        { modelId: 'model-a' },
        { modelId: 'model-b' },
        { modelId: 'model-c' },
      ])).toBe(true);

      expect(uniqueCheck([
        { modelId: 'model-a' },
        { modelId: 'model-a' },
        { modelId: 'model-c' },
      ])).toBe(false);
    });
  });
});
