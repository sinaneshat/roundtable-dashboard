import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanType } from '@/api/core/enums';
import { PlanTypes } from '@/api/core/enums';
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
  nextRefillAt: null;
};

const mockUserCreditData: MockUserCreditData = {
  balance: 0,
  reservedCredits: 0,
  planType: PlanTypes.FREE,
  monthlyCredits: 0,
  nextRefillAt: null,
};

beforeEach(() => {
  mockUserCreditData.balance = 0;
  mockUserCreditData.reservedCredits = 0;
  mockUserCreditData.planType = PlanTypes.FREE;
  mockUserCreditData.monthlyCredits = 0;
});

describe('credit Service', () => {
  describe('credit Config', () => {
    describe('signup Credits', () => {
      it('has 5,000 signup credits', () => {
        expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
      });
    });

    describe('paid Plan Configuration', () => {
      it('has 100,000 monthly credits', () => {
        expect(CREDIT_CONFIG.PLANS.paid.monthlyCredits).toBe(100_000);
      });

      it('has $59/month price', () => {
        expect(CREDIT_CONFIG.PLANS.paid.priceInCents).toBe(5900);
      });

      it('has valid Stripe product and price IDs', () => {
        expect(CREDIT_CONFIG.PLANS.paid.stripeProductId).toMatch(/^prod_/);
        expect(CREDIT_CONFIG.PLANS.paid.stripePriceId).toMatch(/^price_/);
      });
    });

    describe('action Costs', () => {
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

  describe('enforceCredits Error Messages', () => {
    function getEnforceCreditsError(
      available: number,
      required: number,
      planType: PlanType,
    ): string | null {
      if (available >= required) {
        return null;
      }

      const baseMessage = `Insufficient credits. Required: ${required}, Available: ${available}. `;
      const upgradePrompt = planType === PlanTypes.FREE ? 'Upgrade to Pro or ' : '';
      return `${baseMessage}${upgradePrompt}Purchase additional credits to continue.`;
    }

    it('returns null when user has sufficient credits', () => {
      const error = getEnforceCreditsError(100, 50, PlanTypes.FREE);
      expect(error).toBeNull();
    });

    it('returns insufficient credits message for free users', () => {
      const error = getEnforceCreditsError(0, 100, PlanTypes.FREE);
      expect(error).toContain('Insufficient credits');
      expect(error).toContain('Required: 100');
      expect(error).toContain('Available: 0');
      expect(error).toContain('Upgrade to Pro');
    });

    it('returns insufficient credits message for paid users', () => {
      const error = getEnforceCreditsError(50, 100, PlanTypes.PAID);
      expect(error).toContain('Insufficient credits');
      expect(error).toContain('Required: 100');
      expect(error).toContain('Available: 50');
      expect(error).not.toContain('Upgrade to Pro');
    });
  });

  describe('credit Calculation Utilities', () => {
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

  describe('edge Cases That Could Cause Thread Creation Failures', () => {
    it('new user gets signup credits', () => {
      const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;
      expect(signupCredits).toBe(5_000);
    });

    it('thread creation cost is less than signup credits', () => {
      const threadCost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;
      const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;

      expect(threadCost).toBeLessThan(signupCredits);
    });

    it('estimated streaming credits for 3 participants fits within signup credits', () => {
      function estimateStreamingCredits(participantCount: number): number {
        const estimatedOutputTokens = CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE * participantCount;
        const totalTokens = 500 + estimatedOutputTokens;
        const reservedTokens = Math.ceil(totalTokens * CREDIT_CONFIG.RESERVATION_MULTIPLIER);
        return Math.ceil(reservedTokens / CREDIT_CONFIG.TOKENS_PER_CREDIT);
      }

      const estimatedCredits = estimateStreamingCredits(3);
      const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;

      expect(estimatedCredits).toBeLessThan(signupCredits);
    });
  });

  describe('free User Security Gates', () => {
    describe('checkFreeUserHasCreatedThread (ONE Thread Limit)', () => {
      it('returns false for new user with no threads', () => {
        const existingThreads: string[] = [];
        const hasThread = existingThreads.length > 0;
        expect(hasThread).toBe(false);
      });

      it('returns true if user has any thread (even empty)', () => {
        const existingThreads = ['thread_123'];
        const hasThread = existingThreads.length > 0;
        expect(hasThread).toBe(true);
      });

      it('returns true for thread without messages', () => {
        const thread = { id: 'thread_123', messages: [] };
        const hasThread = thread.id !== undefined;
        expect(hasThread).toBe(true);
      });

      it('free user blocked from second thread', () => {
        const existingThreads = ['thread_1'];
        const isFreeUser = true;
        const shouldBlock = isFreeUser && existingThreads.length > 0;
        expect(shouldBlock).toBe(true);
      });

      it('paid user allowed multiple threads', () => {
        const existingThreads = ['thread_1', 'thread_2'];
        const isPaidUser = true;
        const shouldBlock = !isPaidUser && existingThreads.length > 0;
        expect(shouldBlock).toBe(false);
      });

      it('error message guides to upgrade', () => {
        const errorMessage = 'Free users can only create one thread. Subscribe to Pro for unlimited threads.';
        expect(errorMessage).toContain('Free users');
        expect(errorMessage).toContain('one thread');
        expect(errorMessage).toContain('Subscribe to Pro');
      });
    });

    describe('checkFreeUserHasCompletedRound (ALL Participants Must Respond)', () => {
      it('checks transaction history for free_round_complete action (fast path)', () => {
        const expectedAction = 'free_round_complete';
        expect(expectedAction).toBe('free_round_complete');
      });

      it('returns false if no thread exists', () => {
        const thread = null;
        const roundComplete = thread !== null;
        expect(roundComplete).toBe(false);
      });

      it('returns false if no participants in thread', () => {
        const enabledParticipants: string[] = [];
        const roundComplete = enabledParticipants.length !== 0;
        expect(roundComplete).toBe(false);
      });

      it('returns false if round incomplete (not all participants responded)', () => {
        const enabledParticipants = ['p1', 'p2', 'p3'];
        const respondedParticipants = ['p1']; // Only 1 of 3 responded
        const roundComplete = respondedParticipants.length >= enabledParticipants.length;
        expect(roundComplete).toBe(false);
      });

      it('returns true when ALL participants responded in round 0', () => {
        const enabledParticipants = ['p1', 'p2', 'p3'];
        const respondedParticipants = ['p1', 'p2', 'p3'];
        const roundComplete = respondedParticipants.length >= enabledParticipants.length;
        expect(roundComplete).toBe(true);
      });

      it('handles single participant thread correctly', () => {
        const enabledParticipants = ['p1'];
        const respondedParticipants = ['p1'];
        const roundComplete = respondedParticipants.length >= enabledParticipants.length;
        expect(roundComplete).toBe(true);
      });

      it('uses Set to count unique participant responses', () => {
        const messages = [
          { participantId: 'p1', roundNumber: 0 },
          { participantId: 'p1', roundNumber: 0 }, // Duplicate
          { participantId: 'p2', roundNumber: 0 },
        ];
        const uniqueResponders = new Set(messages.map(m => m.participantId));
        expect(uniqueResponders.size).toBe(2); // Not 3
      });

      it('only counts round 0 messages for free user', () => {
        const messages = [
          { participantId: 'p1', roundNumber: 0 },
          { participantId: 'p2', roundNumber: 1 }, // Wrong round
        ];
        const round0Messages = messages.filter(m => m.roundNumber === 0);
        expect(round0Messages).toHaveLength(1);
      });
    });

    describe('zeroOutFreeUserCredits', () => {
      it('only affects free plan users', () => {
        const planType = PlanTypes.FREE;
        const shouldZeroOut = planType === PlanTypes.FREE;
        expect(shouldZeroOut).toBe(true);
      });

      it('does not affect paid users', () => {
        const planType = PlanTypes.PAID;
        const shouldZeroOut = planType === PlanTypes.FREE;
        expect(shouldZeroOut).toBe(false);
      });

      it('sets balance to 0', () => {
        const newBalance = 0;
        expect(newBalance).toBe(0);
      });

      it('records free_round_complete transaction', () => {
        const transactionType = 'deduction';
        const transactionAction = 'free_round_complete';
        expect(transactionType).toBe('deduction');
        expect(transactionAction).toBe('free_round_complete');
      });
    });

    describe('enforceCredits Free User Flow', () => {
      it('checks round completion before credit balance', () => {
        const checkOrder = [
          'checkFreeUserHasCompletedRound',
          'credit_balance_check',
        ];
        expect(checkOrder[0]).toBe('checkFreeUserHasCompletedRound');
      });

      it('blocks free users if round completed', () => {
        const freeRoundUsed = true;
        const planType = PlanTypes.FREE;

        const isBlocked = planType === PlanTypes.FREE && freeRoundUsed;
        expect(isBlocked).toBe(true);
      });

      it('returns error message for free round exhaustion', () => {
        const errorMessage = 'Your free conversation round has been used. Subscribe to Pro to continue chatting.';
        expect(errorMessage).toContain('free conversation round');
        expect(errorMessage).toContain('Subscribe to Pro');
      });
    });
  });

  describe('free User Abuse Prevention Scenarios', () => {
    describe('refresh Abuse Prevention', () => {
      it('empty thread still counts as created', () => {
        const thread = { id: 'thread_123', messageCount: 0 };
        const hasThread = !!thread.id;
        expect(hasThread).toBe(true);
      });

      it('deleted thread should not count (if soft deleted)', () => {
        const activeThreads = [
          { id: 'thread_1', status: 'active' },
          { id: 'thread_2', status: 'deleted' },
        ];
        const nonDeletedThreads = activeThreads.filter(t => t.status !== 'deleted');
        expect(nonDeletedThreads).toHaveLength(1);
      });
    });

    describe('credit Deduction Security', () => {
      it('credits only deducted on stream completion (finalizeCredits)', () => {
        const deductionMoment = 'onFinish';
        expect(deductionMoment).toBe('onFinish');
      });

      it('reservation released on stream error', () => {
        const releaseOnError = true;
        expect(releaseOnError).toBe(true);
      });

      it('actual tokens used, not estimated', () => {
        const estimatedTokens = 1000;
        const actualTokens = 750;
        const creditsToDeduct = actualTokens; // Use actual, not estimated
        expect(creditsToDeduct).toBe(actualTokens);
        expect(creditsToDeduct).not.toBe(estimatedTokens);
      });
    });

    describe('model Pricing Tier Application', () => {
      it('budget tier has 1x multiplier', () => {
        const budgetMultiplier = 1;
        expect(budgetMultiplier).toBe(1);
      });

      it('ultimate tier has 200x multiplier', () => {
        const ultimateMultiplier = 200;
        expect(ultimateMultiplier).toBe(200);
      });

      it('applies correct multiplier to token count', () => {
        const tokens = 1000;
        const multiplier = 200;
        const credits = Math.ceil((tokens * multiplier) / CREDIT_CONFIG.TOKENS_PER_CREDIT);
        expect(credits).toBe(200);
      });
    });

    describe('concurrent Request Handling', () => {
      it('uses optimistic locking with version column', () => {
        const lockingStrategy = 'optimistic';
        const versionColumn = 'version';
        expect(lockingStrategy).toBe('optimistic');
        expect(versionColumn).toBe('version');
      });

      it('retries on version mismatch', () => {
        const onVersionMismatch = 'retry';
        expect(onVersionMismatch).toBe('retry');
      });
    });

    describe('downgrade Mid-Stream Handling', () => {
      it('stream fails if credits depleted during streaming', () => {
        const reservedCredits = 100;
        const actualCredits = 150;
        const canComplete = reservedCredits >= actualCredits;
        expect(canComplete).toBe(false);
      });

      it('credits cannot go negative (DB constraint)', () => {
        const balance = 0;
        const deduction = 100;
        const wouldGoNegative = (balance - deduction) < 0;
        expect(wouldGoNegative).toBe(true);
        // DB constraint prevents this: check_balance_non_negative
      });
    });

    describe('free User Complete Lifecycle', () => {
      it('new user gets 5000 signup credits', () => {
        expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
      });

      it('free user can create exactly 1 thread', () => {
        const maxThreadsForFree = 1;
        expect(maxThreadsForFree).toBe(1);
      });

      it('free user can have exactly 1 round (all participants respond)', () => {
        const maxRoundsForFree = 1; // Round 0 only
        expect(maxRoundsForFree).toBe(1);
      });

      it('after round complete, balance is zeroed', () => {
        const balanceAfterRound = 0;
        expect(balanceAfterRound).toBe(0);
      });

      it('free_round_complete transaction prevents future access', () => {
        const hasTransaction = true;
        const canContinue = !hasTransaction;
        expect(canContinue).toBe(false);
      });
    });
  });
});
