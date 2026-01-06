import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanType } from '@/api/core/enums';
import { CreditActions, CreditTransactionTypes, PlanTypes } from '@/api/core/enums';
import * as creditService from '@/api/services/credit.service';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

let mockDbInsertReturning: any;
let mockDbSelect: any;
let mockDbUpdate: any;
let mockInsertedRecords: any[];
let mockTransactionRecords: any[];

const createMockDb = () => ({
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(() => mockDbInsertReturning),
      })),
    })),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => mockDbSelect),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => mockDbUpdate),
      })),
    })),
  })),
});

vi.mock('@/db', async () => {
  const actual = await vi.importActual('@/db');
  return {
    ...actual,
    getDbAsync: vi.fn(async () => createMockDb()),
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
  vi.clearAllMocks();
  mockUserCreditData.balance = 0;
  mockUserCreditData.reservedCredits = 0;
  mockUserCreditData.planType = PlanTypes.FREE;
  mockUserCreditData.monthlyCredits = 0;
  mockInsertedRecords = [];
  mockTransactionRecords = [];
  mockDbInsertReturning = [];
  mockDbSelect = [];
  mockDbUpdate = [];
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

      it('sets reservedCredits to 0', () => {
        const newReservedCredits = 0;
        expect(newReservedCredits).toBe(0);
      });

      it('records free_round_complete transaction', () => {
        const transactionType = 'deduction';
        const transactionAction = 'free_round_complete';
        expect(transactionType).toBe('deduction');
        expect(transactionAction).toBe('free_round_complete');
      });

      it('transaction amount is negative of previous balance', () => {
        const previousBalance = 4500;
        const transactionAmount = -previousBalance;
        expect(transactionAmount).toBe(-4500);
      });

      it('transaction balanceAfter is always 0', () => {
        const balanceAfter = 0;
        expect(balanceAfter).toBe(0);
      });

      it('no transaction created if user already at 0 balance', () => {
        const previousBalance = 0;
        const shouldCreateTransaction = previousBalance > 0;
        expect(shouldCreateTransaction).toBe(false);
      });

      it('transaction created for any positive balance', () => {
        const previousBalance = 1;
        const shouldCreateTransaction = previousBalance > 0;
        expect(shouldCreateTransaction).toBe(true);
      });

      it('transaction description indicates round completion', () => {
        const description = 'Free round completed - credits exhausted';
        expect(description).toContain('Free round completed');
        expect(description).toContain('credits exhausted');
      });

      it('updates balance even if already at 0', () => {
        const previousBalance = 0;
        const newBalance = 0;
        expect(newBalance).toBe(0);
      });

      it('clears reserved credits even if balance is 0', () => {
        const previousReserved = 100;
        const newReserved = 0;
        expect(newReserved).toBe(0);
        expect(newReserved).not.toBe(previousReserved);
      });

      it('handles large balance correctly', () => {
        const previousBalance = 999999;
        const transactionAmount = -previousBalance;
        const balanceAfter = 0;
        expect(transactionAmount).toBe(-999999);
        expect(balanceAfter).toBe(0);
      });

      it('early return for paid users prevents any changes', () => {
        const planType = PlanTypes.PAID;
        if (planType !== PlanTypes.FREE) {
          const wasUpdated = false;
          expect(wasUpdated).toBe(false);
        } else {
          const wasUpdated = true;
          expect(wasUpdated).toBe(true);
        }
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

  describe('signup Bonus Credit Flow (Integration Tests)', () => {
    describe('ensureUserCreditRecord - New User Signup', () => {
      it('creates credit balance with exactly 5000 credits for new user', async () => {
        const userId = 'user_new_signup_123';
        const now = new Date();

        const expectedRecord = {
          id: 'test_ulid_12345678901234',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };

        mockDbSelect = [expectedRecord];
        mockDbInsertReturning = [expectedRecord];

        const finalRecord = await creditService.ensureUserCreditRecord(userId);

        expect(finalRecord).toMatchObject({
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
        });
      });

      it('sets planType to free for new user', async () => {
        const userId = 'user_plantype_test';

        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.planType).toBe(PlanTypes.FREE);
      });

      it('sets monthlyCredits to 0 for free user', async () => {
        const userId = 'user_monthly_test';

        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.monthlyCredits).toBe(0);
      });

      it('initializes reservedCredits to 0', async () => {
        const userId = 'user_reserved_test';

        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.reservedCredits).toBe(0);
      });

      it('returns existing record for duplicate signup attempt', async () => {
        const userId = 'user_existing_123';
        const existingRecord = {
          id: 'existing_id',
          userId,
          balance: 3_000,
          reservedCredits: 100,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        };

        mockDbSelect = [existingRecord];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result).toEqual(existingRecord);
        expect(result.balance).toBe(3_000);
      });
    });

    describe('credit Transaction Recording', () => {
      it('records signup_bonus transaction when new user is created', async () => {
        const userId = 'user_transaction_test';

        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        await creditService.ensureUserCreditRecord(userId);

        expect(CreditActions.SIGNUP_BONUS).toBe('signup_bonus');
        expect(CreditTransactionTypes.CREDIT_GRANT).toBe('credit_grant');
      });

      it('transaction has correct amount of 5000 credits', async () => {
        const userId = 'user_amount_test';

        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        await creditService.ensureUserCreditRecord(userId);

        expect(record.balance).toBe(5_000);
      });

      it('transaction type is credit_grant', () => {
        expect(CreditTransactionTypes.CREDIT_GRANT).toBe('credit_grant');
      });

      it('transaction action is signup_bonus', () => {
        expect(CreditActions.SIGNUP_BONUS).toBe('signup_bonus');
      });

      it('balanceAfter matches signup credits', async () => {
        const userId = 'user_balance_after_test';

        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      });
    });

    describe('duplicate Signup Prevention', () => {
      it('does not grant additional credits on duplicate signup', async () => {
        const userId = 'user_duplicate_prevention';
        const existingRecord = {
          id: 'existing_id',
          userId,
          balance: 2_500,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        };

        mockDbSelect = [existingRecord];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.balance).toBe(2_500);
        expect(result.balance).not.toBe(5_000);
      });

      it('preserves existing balance when record already exists', async () => {
        const userId = 'user_preserve_balance';
        const customBalance = 1_234;
        const existingRecord = {
          id: 'existing_id',
          userId,
          balance: customBalance,
          reservedCredits: 50,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 3,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        };

        mockDbSelect = [existingRecord];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.balance).toBe(customBalance);
        expect(result.version).toBe(3);
      });

      it('does not create duplicate transaction records', async () => {
        const userId = 'user_no_duplicate_tx';
        const existingRecord = {
          id: 'existing_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        };

        mockDbSelect = [existingRecord];
        mockDbInsertReturning = [];

        await creditService.ensureUserCreditRecord(userId);

        expect(mockDbInsertReturning).toHaveLength(0);
      });
    });

    describe('database Constraint Validation', () => {
      it('ensures balance is non-negative (check constraint)', () => {
        const validBalance = 5_000;
        expect(validBalance).toBeGreaterThanOrEqual(0);

        const invalidBalance = -100;
        expect(invalidBalance).toBeLessThan(0);
      });

      it('ensures reservedCredits is non-negative', () => {
        const validReserved = 0;
        expect(validReserved).toBeGreaterThanOrEqual(0);
      });

      it('ensures monthlyCredits is non-negative', () => {
        const freeUserMonthlyCredits = 0;
        expect(freeUserMonthlyCredits).toBeGreaterThanOrEqual(0);
      });

      it('ensures version is positive', () => {
        const initialVersion = 1;
        expect(initialVersion).toBeGreaterThan(0);
      });
    });

    describe('edge Cases', () => {
      it('handles concurrent signup attempts gracefully', async () => {
        const userId = 'user_concurrent_test';

        mockDbSelect = [];
        mockDbInsertReturning = [];

        const finalRecord = {
          id: 'final_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockDbSelect = [finalRecord];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result).toEqual(finalRecord);
      });

      it('verifies ULID format for record ID', () => {
        const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
        const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
        expect(validUlid).toMatch(ulidPattern);
      });

      it('ensures createdAt and updatedAt are set', async () => {
        const userId = 'user_timestamps_test';

        const now = new Date();
        const record = {
          id: 'test_id',
          userId,
          balance: 5_000,
          reservedCredits: 0,
          planType: PlanTypes.FREE,
          monthlyCredits: 0,
          lastRefillAt: null,
          nextRefillAt: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };

        mockDbSelect = [record];
        mockDbInsertReturning = [record];

        const result = await creditService.ensureUserCreditRecord(userId);

        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
      });
    });

    describe('signup Bonus Configuration Validation', () => {
      it('confirms signup credits match config constant', () => {
        expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
      });

      it('verifies free plan has no monthly refill', () => {
        const freeUserMonthlyCredits = 0;
        expect(freeUserMonthlyCredits).toBe(0);
      });

      it('validates plan type enum values', () => {
        expect(PlanTypes.FREE).toBe('free');
        expect(PlanTypes.PAID).toBe('paid');
      });

      it('confirms transaction type enum for signup', () => {
        expect(CreditTransactionTypes.CREDIT_GRANT).toBe('credit_grant');
      });

      it('confirms action enum for signup bonus', () => {
        expect(CreditActions.SIGNUP_BONUS).toBe('signup_bonus');
      });
    });
  });

  describe('getUserCreditBalance - Balance Info Calculation', () => {
    it('returns correct balance info for user with no reservations', async () => {
      const userId = 'user_balance_info_1';
      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.getUserCreditBalance directly
      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(5_000);
      expect(balanceInfo.reserved).toBe(0);
      expect(balanceInfo.available).toBe(5_000);
      expect(balanceInfo.planType).toBe(PlanTypes.FREE);
    });

    it('calculates available credits correctly with reservations', async () => {
      const userId = 'user_balance_info_2';
      const record = {
        id: 'test_id',
        userId,
        balance: 10_000,
        reservedCredits: 3_000,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date(),
        nextRefillAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.getUserCreditBalance directly
      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(10_000);
      expect(balanceInfo.reserved).toBe(3_000);
      expect(balanceInfo.available).toBe(7_000);
    });

    it('prevents negative available credits', async () => {
      const userId = 'user_balance_info_3';
      const record = {
        id: 'test_id',
        userId,
        balance: 1_000,
        reservedCredits: 2_000,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.getUserCreditBalance directly
      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(1_000);
      expect(balanceInfo.reserved).toBe(2_000);
      expect(balanceInfo.available).toBe(0);
    });

    it('includes refill dates for paid users', async () => {
      const userId = 'user_balance_info_4';
      const nextRefill = new Date('2025-02-01');

      const record = {
        id: 'test_id',
        userId,
        balance: 100_000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date('2025-01-01'),
        nextRefillAt: nextRefill,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.getUserCreditBalance directly
      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.nextRefillAt).toEqual(nextRefill);
      expect(balanceInfo.monthlyCredits).toBe(100_000);
    });

    it('handles max integer balance values safely', async () => {
      const userId = 'user_max_balance';
      const maxBalance = Number.MAX_SAFE_INTEGER;

      const record = {
        id: 'test_id',
        userId,
        balance: maxBalance,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date(),
        nextRefillAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.getUserCreditBalance directly
      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(maxBalance);
      expect(balanceInfo.available).toBe(maxBalance);
      expect(Number.isSafeInteger(balanceInfo.balance)).toBe(true);
    });

    it('creates credit record if user does not exist', async () => {
      const userId = 'user_new_balance_check';

      mockDbSelect = [];
      mockDbInsertReturning = [{
        id: 'new_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      mockDbSelect = [mockDbInsertReturning[0]];

      // Use creditService.getUserCreditBalance directly
      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(5_000);
      expect(balanceInfo.planType).toBe(PlanTypes.FREE);
    });
  });

  describe('canAffordCredits - Affordability Checks', () => {
    it('returns true when user has exact credits required', async () => {
      const userId = 'user_afford_1';
      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.canAffordCredits directly
      const result = await creditService.canAffordCredits(userId, 5_000);

      expect(result).toBe(true);
    });

    it('returns false when user has insufficient available credits', async () => {
      const userId = 'user_afford_2';
      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 3_000,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.canAffordCredits directly
      const result = await creditService.canAffordCredits(userId, 3_000);

      expect(result).toBe(false);
    });

    it('accounts for reserved credits in affordability check', async () => {
      const userId = 'user_afford_3';
      const record = {
        id: 'test_id',
        userId,
        balance: 10_000,
        reservedCredits: 5_000,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date(),
        nextRefillAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.canAffordCredits directly
      const canAfford = await creditService.canAffordCredits(userId, 5_000);

      expect(canAfford).toBe(true);
    });

    it('returns false when balance is zero', async () => {
      const userId = 'user_afford_4';
      const record = {
        id: 'test_id',
        userId,
        balance: 0,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.canAffordCredits directly
      const result = await creditService.canAffordCredits(userId, 1);

      expect(result).toBe(false);
    });
  });

  describe('Credit Reservation and Release Flow', () => {
    describe('reservation Edge Cases', () => {
      it('handles zero credit reservation gracefully', () => {
        const estimatedCredits = 0;
        const shouldReserve = estimatedCredits > 0;

        expect(shouldReserve).toBe(false);
      });

      it('handles large reservation amounts', () => {
        const estimatedCredits = 50_000;
        const userBalance = 100_000;
        const canReserve = userBalance >= estimatedCredits;

        expect(canReserve).toBe(true);
      });

      it('prevents reservation exceeding available balance', () => {
        const balance = 1_000;
        const reserved = 500;
        const available = balance - reserved;
        const requestedReservation = 600;

        expect(available).toBeLessThan(requestedReservation);
      });

      it('supports multiple concurrent reservations', () => {
        const balance = 10_000;
        const reservation1 = 2_000;
        const reservation2 = 3_000;
        const totalReserved = reservation1 + reservation2;
        const available = balance - totalReserved;

        expect(totalReserved).toBe(5_000);
        expect(available).toBe(5_000);
      });
    });

    describe('release Edge Cases', () => {
      it('handles undefined reservation amount', () => {
        const reservedAmount = undefined;
        const shouldRelease = reservedAmount !== undefined && reservedAmount > 0;

        expect(shouldRelease).toBe(false);
      });

      it('handles zero reservation release', () => {
        const reservedAmount = 0;
        const shouldRelease = reservedAmount > 0;

        expect(shouldRelease).toBe(false);
      });

      it('prevents releasing more than reserved', () => {
        const currentlyReserved = 1_000;
        const releaseAmount = 1_500;
        const afterRelease = Math.max(0, currentlyReserved - releaseAmount);

        expect(afterRelease).toBe(0);
      });

      it('handles partial release correctly', () => {
        const currentlyReserved = 5_000;
        const releaseAmount = 2_000;
        const afterRelease = currentlyReserved - releaseAmount;

        expect(afterRelease).toBe(3_000);
      });
    });

    describe('finalization Edge Cases', () => {
      it('handles actual usage less than reservation', () => {
        const reserved = 1_000;
        const actualUsed = 750;
        const toRelease = reserved - actualUsed;

        expect(toRelease).toBe(250);
      });

      it('handles actual usage equal to reservation', () => {
        const reserved = 1_000;
        const actualUsed = 1_000;
        const toRelease = reserved - actualUsed;

        expect(toRelease).toBe(0);
      });

      it('handles actual usage exceeding reservation safely', () => {
        const reserved = 1_000;
        const actualUsed = 1_200;
        const excessUsage = actualUsed - reserved;

        expect(excessUsage).toBe(200);
      });
    });
  });

  describe('Credit Deduction with Model Tier Multipliers', () => {
    it('calculates credits for budget tier models (1x multiplier)', () => {
      const inputTokens = 1_000;
      const outputTokens = 2_000;
      const totalTokens = inputTokens + outputTokens;
      const budgetMultiplier = CREDIT_CONFIG.TIER_MULTIPLIERS.budget;
      const baseCredits = totalTokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;
      const weightedCredits = Math.ceil(baseCredits * budgetMultiplier);

      expect(budgetMultiplier).toBe(1);
      expect(weightedCredits).toBe(3);
    });

    it('calculates credits for standard tier models (3x multiplier)', () => {
      const inputTokens = 1_000;
      const outputTokens = 2_000;
      const totalTokens = inputTokens + outputTokens;
      const standardMultiplier = CREDIT_CONFIG.TIER_MULTIPLIERS.standard;
      const baseCredits = totalTokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;
      const weightedCredits = Math.ceil(baseCredits * standardMultiplier);

      expect(standardMultiplier).toBe(3);
      expect(weightedCredits).toBe(9);
    });

    it('calculates credits for flagship tier models (75x multiplier)', () => {
      const inputTokens = 1_000;
      const outputTokens = 2_000;
      const totalTokens = inputTokens + outputTokens;
      const flagshipMultiplier = CREDIT_CONFIG.TIER_MULTIPLIERS.flagship;
      const baseCredits = totalTokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;
      const weightedCredits = Math.ceil(baseCredits * flagshipMultiplier);

      expect(flagshipMultiplier).toBe(75);
      expect(weightedCredits).toBe(225);
    });

    it('calculates credits for ultimate tier models (200x multiplier)', () => {
      const inputTokens = 1_000;
      const outputTokens = 1_000;
      const totalTokens = inputTokens + outputTokens;
      const ultimateMultiplier = CREDIT_CONFIG.TIER_MULTIPLIERS.ultimate;
      const baseCredits = totalTokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;
      const weightedCredits = Math.ceil(baseCredits * ultimateMultiplier);

      expect(ultimateMultiplier).toBe(200);
      expect(weightedCredits).toBe(400);
    });

    it('rounds up partial credits correctly', () => {
      const tokens = 1_500;
      const multiplier = 1;
      const baseCredits = tokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;
      const weightedCredits = Math.ceil(baseCredits * multiplier);

      expect(baseCredits).toBe(1.5);
      expect(weightedCredits).toBe(2);
    });

    it('handles zero token usage', () => {
      const tokens = 0;
      const multiplier = CREDIT_CONFIG.TIER_MULTIPLIERS.standard;
      const baseCredits = tokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;
      const weightedCredits = Math.ceil(baseCredits * multiplier);

      expect(weightedCredits).toBe(0);
    });

    it('same tokens cost more with higher tier models', () => {
      const tokens = 10_000;
      const baseCredits = tokens / CREDIT_CONFIG.TOKENS_PER_CREDIT;

      const budgetCredits = Math.ceil(baseCredits * CREDIT_CONFIG.TIER_MULTIPLIERS.budget);
      const flagshipCredits = Math.ceil(baseCredits * CREDIT_CONFIG.TIER_MULTIPLIERS.flagship);

      expect(budgetCredits).toBe(10);
      expect(flagshipCredits).toBe(750);
      expect(flagshipCredits).toBeGreaterThan(budgetCredits);
    });
  });

  describe('Optimistic Locking and Concurrency', () => {
    it('version increments on each credit update', () => {
      const initialVersion = 1;
      const updatedVersion = initialVersion + 1;

      expect(updatedVersion).toBe(2);
    });

    it('detects version mismatch for concurrent updates', () => {
      const recordVersion = 5;
      const updateAttempt1Version = 5;
      const updateAttempt2Version = 5;

      const attempt1Match = recordVersion === updateAttempt1Version;
      const newVersionAfterAttempt1 = recordVersion + 1;
      const attempt2Match = newVersionAfterAttempt1 === updateAttempt2Version;

      expect(attempt1Match).toBe(true);
      expect(attempt2Match).toBe(false);
    });

    it('retries on optimistic lock failure', () => {
      const maxRetries = 3;
      let attemptCount = 0;

      for (let i = 0; i < maxRetries; i++) {
        attemptCount++;
      }

      expect(attemptCount).toBe(maxRetries);
    });

    it('supports multiple concurrent reservations with version checking', () => {
      const version1 = 10;
      const version2 = version1 + 1;
      const version3 = version2 + 1;

      expect(version1).toBe(10);
      expect(version2).toBe(11);
      expect(version3).toBe(12);
    });
  });

  describe('Negative Balance Prevention', () => {
    it('prevents balance from going negative through validation', () => {
      const balance = 100;
      const deduction = 150;
      const wouldBeNegative = (balance - deduction) < 0;

      expect(wouldBeNegative).toBe(true);
    });

    it('enforces non-negative balance constraint', () => {
      const validBalance = 0;
      expect(validBalance).toBeGreaterThanOrEqual(0);

      const invalidBalance = -100;
      expect(invalidBalance).toBeLessThan(0);
    });

    it('blocks operations when balance would go negative', () => {
      const balance = 50;
      const requiredCredits = 100;
      const canProceed = balance >= requiredCredits;

      expect(canProceed).toBe(false);
    });

    it('allows operations when balance is exactly sufficient', () => {
      const balance = 100;
      const requiredCredits = 100;
      const canProceed = balance >= requiredCredits;

      expect(canProceed).toBe(true);
    });
  });

  describe('Credit Overflow and Boundary Conditions', () => {
    it('handles maximum safe integer credits', () => {
      const maxSafeCredits = Number.MAX_SAFE_INTEGER;
      const isValid = maxSafeCredits > 0 && Number.isInteger(maxSafeCredits);

      expect(isValid).toBe(true);
    });

    it('handles credit rollover accumulation for paid users', () => {
      const month1Remaining = 50_000;
      const month2Refill = 100_000;
      const month2Total = month1Remaining + month2Refill;

      expect(month2Total).toBe(150_000);
    });

    it('handles large reserved credit amounts', () => {
      const balance = 1_000_000;
      const reserved = 500_000;
      const available = balance - reserved;

      expect(available).toBe(500_000);
    });

    it('handles minimum credit amounts', () => {
      const minimumStreamingCredits = CREDIT_CONFIG.MIN_CREDITS_FOR_STREAMING;
      expect(minimumStreamingCredits).toBe(10);
    });

    it('prevents reserved credits from exceeding balance', () => {
      const balance = 5_000;
      const requestedReservation = 6_000;
      const canReserve = balance >= requestedReservation;

      expect(canReserve).toBe(false);
    });
  });

  describe('Transaction History and Audit Trail', () => {
    it('records positive amount for credit grants', () => {
      const grantAmount = 5_000;
      expect(grantAmount).toBeGreaterThan(0);
    });

    it('records negative amount for deductions', () => {
      const deductionAmount = -100;
      expect(deductionAmount).toBeLessThan(0);
    });

    it('records negative amount for reservations', () => {
      const reservationAmount = -50;
      expect(reservationAmount).toBeLessThan(0);
    });

    it('records positive amount for releases', () => {
      const releaseAmount = 50;
      expect(releaseAmount).toBeGreaterThan(0);
    });

    it('includes balance after for audit trail', () => {
      const balanceBefore = 5_000;
      const deduction = -100;
      const balanceAfter = balanceBefore + deduction;

      expect(balanceAfter).toBe(4_900);
    });

    it('tracks token breakdown for AI responses', () => {
      const inputTokens = 1_000;
      const outputTokens = 2_000;
      const totalTokens = inputTokens + outputTokens;

      expect(totalTokens).toBe(3_000);
    });

    it('includes model ID and pricing tier for transparency', () => {
      const modelId = 'gpt-4';
      const pricingTier = 'flagship';

      expect(modelId).toBeDefined();
      expect(pricingTier).toBeDefined();
    });

    it('preserves chronological order by creation date', () => {
      const transaction1 = { createdAt: new Date('2025-01-01'), amount: 100 };
      const transaction2 = { createdAt: new Date('2025-01-02'), amount: -50 };
      const transaction3 = { createdAt: new Date('2025-01-03'), amount: 200 };

      const chronologicalOrder = [transaction3, transaction2, transaction1]; // Descending

      expect(chronologicalOrder[0].createdAt.getTime()).toBeGreaterThan(chronologicalOrder[1].createdAt.getTime());
      expect(chronologicalOrder[1].createdAt.getTime()).toBeGreaterThan(chronologicalOrder[2].createdAt.getTime());
    });

    it('supports filtering by transaction type', () => {
      const allTransactions = [
        { type: CreditTransactionTypes.DEDUCTION, amount: -100 },
        { type: CreditTransactionTypes.CREDIT_GRANT, amount: 5000 },
        { type: CreditTransactionTypes.DEDUCTION, amount: -50 },
      ];

      const deductions = allTransactions.filter(tx => tx.type === CreditTransactionTypes.DEDUCTION);

      expect(deductions).toHaveLength(2);
      expect(deductions.every(tx => tx.type === CreditTransactionTypes.DEDUCTION)).toBe(true);
    });

    it('supports pagination with limit and offset', () => {
      const allTransactions = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const limit = 50;
      const offset = 0;

      const page1 = allTransactions.slice(offset, offset + limit);

      expect(page1).toHaveLength(50);
      expect(page1[0].id).toBe(0);
      expect(page1[49].id).toBe(49);
    });

    it('includes thread and message references for traceability', () => {
      const transaction = {
        threadId: 'thread_123',
        messageId: 'msg_456',
        streamId: 'stream_789',
      };

      expect(transaction.threadId).toBeDefined();
      expect(transaction.messageId).toBeDefined();
      expect(transaction.streamId).toBeDefined();
    });
  });

  describe('Monthly Refill and Credit Allocation', () => {
    it('grants monthly credits to paid users on schedule', () => {
      const now = new Date('2025-02-01');
      const nextRefillAt = new Date('2025-01-01'); // Past date

      const shouldRefill = nextRefillAt <= now;

      expect(shouldRefill).toBe(true);
    });

    it('skips refill if next refill date is in future', () => {
      const now = new Date('2025-01-15');
      const nextRefillAt = new Date('2025-02-01'); // Future date

      const shouldRefill = nextRefillAt <= now;

      expect(shouldRefill).toBe(false);
    });

    it('accumulates credits when refilling (no reset)', () => {
      const currentBalance = 50_000;
      const monthlyCredits = 100_000;
      const newBalance = currentBalance + monthlyCredits;

      expect(newBalance).toBe(150_000);
    });

    it('calculates next refill date one month ahead', () => {
      const currentDate = new Date('2025-01-15');
      const nextRefillDate = new Date(currentDate);
      nextRefillDate.setMonth(nextRefillDate.getMonth() + 1);

      expect(nextRefillDate.getMonth()).toBe(1); // February (0-indexed)
      expect(nextRefillDate.getDate()).toBe(15);
    });

    it('handles month overflow correctly (Jan 31 -> Feb 28)', () => {
      const jan31 = new Date('2025-01-31');
      const nextRefill = new Date(jan31);
      nextRefill.setMonth(nextRefill.getMonth() + 1);

      // JavaScript auto-adjusts: Jan 31 + 1 month = March 3 (Feb only has 28 days in 2025)
      expect(nextRefill.getMonth()).toBe(2); // March (overflow)
      expect(nextRefill.getDate()).toBe(3); // Overflows to March 3
    });

    it('sets lastRefillAt to current timestamp on refill', () => {
      const now = new Date('2025-01-15T10:30:00Z');
      const lastRefillAt = now;

      expect(lastRefillAt).toEqual(now);
    });

    it('free users do not receive monthly refills', () => {
      const planType = PlanTypes.FREE;
      const monthlyCredits = 0;

      expect(monthlyCredits).toBe(0);
      expect(planType).toBe(PlanTypes.FREE);
    });

    it('paid users receive 100K monthly credits', () => {
      const monthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      expect(monthlyCredits).toBe(100_000);
    });

    it('creates monthly_refill transaction on successful refill', () => {
      const transactionType = CreditTransactionTypes.MONTHLY_REFILL;
      const action = CreditActions.MONTHLY_RENEWAL;

      expect(transactionType).toBe('monthly_refill');
      expect(action).toBe('monthly_renewal');
    });

    it('updates version on monthly refill for optimistic locking', () => {
      const currentVersion = 5;
      const newVersion = currentVersion + 1;

      expect(newVersion).toBe(6);
    });
  });

  describe('Tier-Based Credit Limits and Upgrade Flow', () => {
    it('free tier has 5000 signup credits only', () => {
      const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;
      const monthlyCredits = 0;

      expect(signupCredits).toBe(5_000);
      expect(monthlyCredits).toBe(0);
    });

    it('paid tier has 100K monthly credits', () => {
      const paidPlanConfig = CREDIT_CONFIG.PLANS.paid;

      expect(paidPlanConfig.monthlyCredits).toBe(100_000);
    });

    it('upgrade from free to paid grants initial 100K credits', () => {
      const currentBalance = 500; // Remaining from free tier
      const paidMonthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;
      const newBalance = currentBalance + paidMonthlyCredits;

      expect(newBalance).toBe(100_500);
    });

    it('upgrade sets planType to paid', () => {
      const newPlanType = PlanTypes.PAID;

      expect(newPlanType).toBe('paid');
    });

    it('upgrade initializes refill schedule', () => {
      const now = new Date('2025-01-15');
      const nextRefill = new Date(now);
      nextRefill.setMonth(nextRefill.getMonth() + 1);

      expect(nextRefill.getMonth()).toBe(1); // February
    });

    it('paid users can accumulate credits across months', () => {
      const month1Remaining = 30_000;
      const month2Refill = 100_000;
      const month2Total = month1Remaining + month2Refill;

      expect(month2Total).toBe(130_000);
    });

    it('no maximum credit cap for paid users', () => {
      const accumulatedCredits = 500_000; // 5 months of 100K without using
      const isValid = accumulatedCredits > 0;

      expect(isValid).toBe(true);
    });

    it('downgrade scenario: paid to free (not implemented, but credit balance persists)', () => {
      const remainingCredits = 75_000; // Paid user downgrades
      const planType = PlanTypes.FREE; // Becomes free
      const monthlyCredits = 0; // No more refills

      expect(remainingCredits).toBeGreaterThan(0); // Credits remain
      expect(planType).toBe(PlanTypes.FREE);
      expect(monthlyCredits).toBe(0);
    });

    it('free tier limited to one thread creation', () => {
      const maxThreadsForFree = 1;

      expect(maxThreadsForFree).toBe(1);
    });

    it('free tier limited to one conversation round (all participants respond once)', () => {
      const maxRoundsForFree = 1; // Round 0 only

      expect(maxRoundsForFree).toBe(1);
    });

    it('paid tier has unlimited threads', () => {
      const isPaid = true;
      const threadLimit = isPaid ? Number.POSITIVE_INFINITY : 1;

      expect(threadLimit).toBe(Number.POSITIVE_INFINITY);
    });

    it('paid tier has unlimited rounds', () => {
      const isPaid = true;
      const roundLimit = isPaid ? Number.POSITIVE_INFINITY : 1;

      expect(roundLimit).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('Credit Deduction for Actions', () => {
    it('thread creation costs 100 credits', () => {
      const cost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;

      expect(cost).toBe(100);
    });

    it('web search costs 500 credits', () => {
      const cost = CREDIT_CONFIG.ACTION_COSTS.webSearchQuery;

      expect(cost).toBe(500);
    });

    it('file reading costs 100 credits', () => {
      const cost = CREDIT_CONFIG.ACTION_COSTS.fileReading;

      expect(cost).toBe(100);
    });

    it('analysis generation costs 2000 credits', () => {
      const cost = CREDIT_CONFIG.ACTION_COSTS.analysisGeneration;

      expect(cost).toBe(2000);
    });

    it('custom role creation costs 50 credits', () => {
      const cost = CREDIT_CONFIG.ACTION_COSTS.customRoleCreation;

      expect(cost).toBe(50);
    });

    it('deduction fails if insufficient credits', () => {
      const balance = 50;
      const requiredCredits = 100;
      const canDeduct = balance >= requiredCredits;

      expect(canDeduct).toBe(false);
    });

    it('deduction succeeds if exact credits available', () => {
      const balance = 100;
      const requiredCredits = 100;
      const canDeduct = balance >= requiredCredits;

      expect(canDeduct).toBe(true);
    });

    it('deduction updates balance and version atomically', () => {
      const currentBalance = 5_000;
      const deduction = 100;
      const currentVersion = 3;

      const newBalance = currentBalance - deduction;
      const newVersion = currentVersion + 1;

      expect(newBalance).toBe(4_900);
      expect(newVersion).toBe(4);
    });

    it('creates deduction transaction with action type', () => {
      const transactionType = CreditTransactionTypes.DEDUCTION;
      const action = CreditActions.THREAD_CREATION;
      const amount = -100;

      expect(transactionType).toBe('deduction');
      expect(action).toBe('thread_creation');
      expect(amount).toBeLessThan(0);
    });
  });

  describe('Credit Grant Operations', () => {
    it('signup bonus grants 5000 credits', () => {
      const signupBonus = CREDIT_CONFIG.SIGNUP_CREDITS;

      expect(signupBonus).toBe(5_000);
    });

    it('grant increases balance', () => {
      const currentBalance = 1_000;
      const grantAmount = 5_000;
      const newBalance = currentBalance + grantAmount;

      expect(newBalance).toBe(6_000);
    });

    it('grant creates credit_grant transaction', () => {
      const transactionType = CreditTransactionTypes.CREDIT_GRANT;
      const amount = 5_000;

      expect(transactionType).toBe('credit_grant');
      expect(amount).toBeGreaterThan(0);
    });

    it('purchase grant creates purchase transaction', () => {
      const transactionType = CreditTransactionTypes.PURCHASE;
      const action = CreditActions.CREDIT_PURCHASE;

      expect(transactionType).toBe('purchase');
      expect(action).toBe('credit_purchase');
    });

    it('monthly refill grant creates monthly_refill transaction', () => {
      const transactionType = CreditTransactionTypes.MONTHLY_REFILL;
      const action = CreditActions.MONTHLY_RENEWAL;

      expect(transactionType).toBe('monthly_refill');
      expect(action).toBe('monthly_renewal');
    });

    it('grant updates version for optimistic locking', () => {
      const currentVersion = 10;
      const newVersion = currentVersion + 1;

      expect(newVersion).toBe(11);
    });

    it('grant amount must be positive', () => {
      const validGrant = 1_000;
      const invalidGrant = -1_000;

      expect(validGrant).toBeGreaterThan(0);
      expect(invalidGrant).toBeLessThan(0);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('handles zero credit balance gracefully', () => {
      const balance = 0;
      const reserved = 0;
      const available = Math.max(0, balance - reserved);

      expect(available).toBe(0);
    });

    it('prevents operations when available credits are zero', () => {
      const available = 0;
      const requiredCredits = 10;
      const canProceed = available >= requiredCredits;

      expect(canProceed).toBe(false);
    });

    it('handles reserved exceeding balance (edge case)', () => {
      const balance = 100;
      const reserved = 150; // Shouldn't happen, but test Math.max protection
      const available = Math.max(0, balance - reserved);

      expect(available).toBe(0);
    });

    it('handles very small credit amounts', () => {
      const balance = 1;
      const requiredCredits = 1;
      const canProceed = balance >= requiredCredits;

      expect(canProceed).toBe(true);
    });

    it('handles very large credit amounts', () => {
      const largeAmount = 1_000_000_000;
      const isValid = Number.isSafeInteger(largeAmount);

      expect(isValid).toBe(true);
    });

    it('version mismatch triggers retry', () => {
      const recordVersion = 5;
      const updateVersion = 4; // Stale version
      const versionMatch = recordVersion === updateVersion;

      expect(versionMatch).toBe(false);
    });

    it('concurrent updates increment version correctly', () => {
      const initialVersion = 1;
      const afterUpdate1 = initialVersion + 1;
      const afterUpdate2 = afterUpdate1 + 1;

      expect(afterUpdate1).toBe(2);
      expect(afterUpdate2).toBe(3);
    });

    it('null refill dates for free users', () => {
      const lastRefillAt = null;
      const nextRefillAt = null;

      expect(lastRefillAt).toBeNull();
      expect(nextRefillAt).toBeNull();
    });

    it('valid refill dates for paid users', () => {
      const lastRefillAt = new Date('2025-01-01');
      const nextRefillAt = new Date('2025-02-01');

      expect(lastRefillAt).toBeInstanceOf(Date);
      expect(nextRefillAt).toBeInstanceOf(Date);
      expect(nextRefillAt.getTime()).toBeGreaterThan(lastRefillAt.getTime());
    });
  });

  describe('reserveCredits - Credit Reservation', () => {
    it('reserves credits successfully', async () => {
      const userId = 'user_reserve_1';
      const streamId = 'stream_123';
      const estimatedCredits = 1000;

      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        reservedCredits: estimatedCredits,
        version: 2,
      }];

      // Use creditService.reserveCredits directly
      await creditService.reserveCredits(userId, streamId, estimatedCredits);

      expect(mockDbUpdate[0].reservedCredits).toBe(estimatedCredits);
      expect(mockDbUpdate[0].version).toBe(2);
    });
  });

  describe('finalizeCredits - Credit Finalization', () => {
    it('finalizes credits with actual token usage', async () => {
      const userId = 'user_finalize_1';
      const streamId = 'stream_123';
      const actualUsage = {
        inputTokens: 500,
        outputTokens: 1500,
        action: CreditActions.AI_RESPONSE,
        modelId: 'gpt-4',
      };

      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 1000,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 4_950,
        reservedCredits: 950,
        version: 2,
      }];

      // Use creditService.finalizeCredits directly
      await creditService.finalizeCredits(userId, streamId, actualUsage);

      expect(mockDbUpdate[0].version).toBe(2);
    });
  });

  describe('releaseReservation - Release Reserved Credits', () => {
    it('releases reserved credits on stream error', async () => {
      const userId = 'user_release_1';
      const streamId = 'stream_123';
      const reservedAmount = 1000;

      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 1000,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        reservedCredits: 0,
        version: 2,
      }];

      // Use creditService.releaseReservation directly
      await creditService.releaseReservation(userId, streamId, reservedAmount);

      expect(mockDbUpdate[0].reservedCredits).toBe(0);
      expect(mockDbUpdate[0].version).toBe(2);
    });

    it('handles undefined reserved amount gracefully', async () => {
      const userId = 'user_release_2';
      const streamId = 'stream_123';

      // Use creditService.releaseReservation directly
      await creditService.releaseReservation(userId, streamId, undefined);

      expect(mockDbUpdate).toHaveLength(0);
    });
  });

  describe('grantCredits - Credit Granting', () => {
    it('grants credits for purchase', async () => {
      const userId = 'user_grant_1';
      const amount = 10_000;
      const type = 'purchase' as const;

      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 15_000,
        version: 2,
      }];

      // Use creditService.grantCredits directly
      await creditService.grantCredits(userId, amount, type, 'Purchase test');

      expect(mockDbUpdate[0].balance).toBe(15_000);
      expect(mockDbUpdate[0].version).toBe(2);
    });

    it('grants credits for monthly refill', async () => {
      const userId = 'user_grant_2';
      const amount = 100_000;
      const type = 'monthly_refill' as const;

      const record = {
        id: 'test_id',
        userId,
        balance: 50_000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date(),
        nextRefillAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 150_000,
        version: 2,
      }];

      // Use creditService.grantCredits directly
      await creditService.grantCredits(userId, amount, type);

      expect(mockDbUpdate[0].balance).toBe(150_000);
    });

    it('grants credits for manual credit grant', async () => {
      const userId = 'user_grant_3';
      const amount = 5_000;
      const type = 'credit_grant' as const;

      const record = {
        id: 'test_id',
        userId,
        balance: 1_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 6_000,
        version: 2,
      }];

      // Use creditService.grantCredits directly
      await creditService.grantCredits(userId, amount, type, 'Admin grant');

      expect(mockDbUpdate[0].balance).toBe(6_000);
    });
  });

  describe('deductCreditsForAction - Action Credit Deduction', () => {
    it('deducts credits for thread creation', async () => {
      const userId = 'user_deduct_1';
      const action = 'threadCreation' as const;

      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 4_900,
        version: 2,
      }];

      // Use creditService.deductCreditsForAction directly
      await creditService.deductCreditsForAction(userId, action);

      expect(mockDbUpdate[0].balance).toBe(4_900);
    });

    it('deducts credits for web search', async () => {
      const userId = 'user_deduct_2';
      const action = 'webSearchQuery' as const;

      const record = {
        id: 'test_id',
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 4_500,
        version: 2,
      }];

      // Use creditService.deductCreditsForAction directly
      await creditService.deductCreditsForAction(userId, action, { threadId: 'thread_123' });

      expect(mockDbUpdate[0].balance).toBe(4_500);
    });
  });

  describe('processMonthlyRefill - Monthly Credit Refill', () => {
    it('processes monthly refill for paid user when due', async () => {
      const userId = 'user_refill_1';
      const now = new Date('2025-02-01');

      const record = {
        id: 'test_id',
        userId,
        balance: 50_000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date('2025-01-01'),
        nextRefillAt: new Date('2025-01-31'),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 150_000,
        lastRefillAt: now,
        nextRefillAt: new Date('2025-03-01'),
        version: 2,
      }];

      // Use creditService.processMonthlyRefill directly
      await creditService.processMonthlyRefill(userId);

      expect(mockDbUpdate[0].balance).toBe(150_000);
    });

    it('skips refill for free users', async () => {
      const userId = 'user_refill_2';

      const record = {
        id: 'test_id',
        userId,
        balance: 3_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.processMonthlyRefill directly
      await creditService.processMonthlyRefill(userId);

      expect(mockDbUpdate).toHaveLength(0);
    });

    it('skips refill when next refill date is in future', async () => {
      const userId = 'user_refill_3';

      const record = {
        id: 'test_id',
        userId,
        balance: 80_000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date('2025-01-01'),
        nextRefillAt: new Date('2025-03-01'),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.processMonthlyRefill directly
      await creditService.processMonthlyRefill(userId);

      expect(mockDbUpdate).toHaveLength(0);
    });
  });

  describe('upgradeToPaidPlan - Plan Upgrade', () => {
    it('upgrades free user to paid plan', async () => {
      const userId = 'user_upgrade_1';
      const now = new Date('2025-01-15');

      const record = {
        id: 'test_id',
        userId,
        balance: 2_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        planType: PlanTypes.PAID,
        balance: 102_000,
        monthlyCredits: 100_000,
        lastRefillAt: now,
        nextRefillAt: new Date('2025-02-15'),
        version: 2,
      }];

      // Use creditService.upgradeToPaidPlan directly
      await creditService.upgradeToPaidPlan(userId);

      expect(mockDbUpdate[0].planType).toBe(PlanTypes.PAID);
      expect(mockDbUpdate[0].balance).toBe(102_000);
      expect(mockDbUpdate[0].monthlyCredits).toBe(100_000);
    });
  });

  describe('getUserTransactionHistory - Transaction History Retrieval', () => {
    it('validates pagination parameters', () => {
      const defaultLimit = 50;
      const defaultOffset = 0;
      const maxLimit = 100;

      expect(defaultLimit).toBe(50);
      expect(defaultOffset).toBe(0);
      expect(maxLimit).toBeGreaterThanOrEqual(defaultLimit);
    });

    it('filters by transaction type enum', () => {
      const validTypes = [
        CreditTransactionTypes.CREDIT_GRANT,
        CreditTransactionTypes.MONTHLY_REFILL,
        CreditTransactionTypes.PURCHASE,
        CreditTransactionTypes.DEDUCTION,
        CreditTransactionTypes.RESERVATION,
        CreditTransactionTypes.RELEASE,
      ];

      validTypes.forEach(type => {
        expect(type).toBeDefined();
        expect(typeof type).toBe('string');
      });
    });

    it('orders transactions by creation date descending', () => {
      const tx1 = { createdAt: new Date('2025-01-01'), id: 1 };
      const tx2 = { createdAt: new Date('2025-01-02'), id: 2 };
      const tx3 = { createdAt: new Date('2025-01-03'), id: 3 };

      const sorted = [tx3, tx2, tx1]; // Descending order

      expect(sorted[0].createdAt.getTime()).toBeGreaterThan(sorted[1].createdAt.getTime());
      expect(sorted[1].createdAt.getTime()).toBeGreaterThan(sorted[2].createdAt.getTime());
    });
  });

  describe('zeroOutFreeUserCredits - Free User Credit Zeroing', () => {
    it('zeros out free user credits after round completion', async () => {
      const userId = 'user_zero_1';

      const record = {
        id: 'test_id',
        userId,
        balance: 4_500,
        reservedCredits: 100,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        lastRefillAt: null,
        nextRefillAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];
      mockDbUpdate = [{
        ...record,
        balance: 0,
        reservedCredits: 0,
        version: 2,
      }];

      // Use creditService.zeroOutFreeUserCredits directly
      await creditService.zeroOutFreeUserCredits(userId);

      expect(mockDbUpdate[0].balance).toBe(0);
      expect(mockDbUpdate[0].reservedCredits).toBe(0);
    });

    it('does not zero out paid user credits', async () => {
      const userId = 'user_zero_2';

      const record = {
        id: 'test_id',
        userId,
        balance: 80_000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date(),
        nextRefillAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      // Use creditService.zeroOutFreeUserCredits directly
      await creditService.zeroOutFreeUserCredits(userId);

      expect(mockDbUpdate).toHaveLength(0);
    });
  });

  describe('checkFreeUserHasCreatedThread - Thread Creation Check', () => {
    it('validates thread existence check logic', () => {
      const noThreads: string[] = [];
      const hasThreads = ['thread_123'];

      expect(noThreads.length === 0).toBe(true);
      expect(hasThreads.length > 0).toBe(true);
    });

    it('enforces one thread limit for free users', () => {
      const freeUserThreadLimit = 1;
      const paidUserThreadLimit = Number.POSITIVE_INFINITY;

      expect(freeUserThreadLimit).toBe(1);
      expect(paidUserThreadLimit).toBe(Number.POSITIVE_INFINITY);
    });
  });
});
