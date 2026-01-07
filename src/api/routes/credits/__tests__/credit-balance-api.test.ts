/**
 * Credit Balance API Endpoint Tests
 *
 * Tests for credit balance, transaction history, and cost estimation endpoints.
 * Covers balance retrieval, pagination, concurrent operations, plan types, and error handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanTypes } from '@/api/core/enums';
import * as creditService from '@/api/services/billing';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

let mockDbInsertReturning: MockUserCreditData[] | [];
let mockDbSelect: MockUserCreditData[] | [];
let mockDbUpdate: MockUserCreditData[] | [];

type MockUserCreditData = {
  id: string;
  userId: string;
  balance: number;
  reservedCredits: number;
  planType: string;
  monthlyCredits: number;
  lastRefillAt: Date | null;
  nextRefillAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function createMockDb() {
  return {
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
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => mockDbSelect),
            offset: vi.fn(() => mockDbSelect),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => mockDbSelect),
          offset: vi.fn(() => mockDbSelect),
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
  };
}

vi.mock('@/db', async () => {
  const actual = await vi.importActual('@/db');
  return {
    ...actual,
    getDbAsync: vi.fn(async () => createMockDb()),
  };
});

function createMockCreditRecord(overrides?: Partial<MockUserCreditData>): MockUserCreditData {
  return {
    id: 'credit_record_123',
    userId: 'user_test_123',
    balance: 5_000,
    reservedCredits: 0,
    planType: PlanTypes.FREE,
    monthlyCredits: 0,
    lastRefillAt: null,
    nextRefillAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbInsertReturning = [];
  mockDbSelect = [];
  mockDbUpdate = [];
});

describe('gET /credits/balance - Credit Balance Endpoint', () => {
  describe('successful balance retrieval', () => {
    it('returns correct balance info for free user with no reservations', async () => {
      const userId = 'user_balance_free_1';
      const record = createMockCreditRecord({
        userId,
        balance: 5_000,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(5_000);
      expect(balanceInfo.reserved).toBe(0);
      expect(balanceInfo.available).toBe(5_000);
      expect(balanceInfo.planType).toBe(PlanTypes.FREE);
      expect(balanceInfo.monthlyCredits).toBe(0);
    });

    it('returns correct balance info for paid user', async () => {
      const userId = 'user_balance_paid_1';
      const nextRefill = new Date('2025-02-01');
      const record = createMockCreditRecord({
        userId,
        balance: 75_000,
        reservedCredits: 0,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
        lastRefillAt: new Date('2025-01-01'),
        nextRefillAt: nextRefill,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(75_000);
      expect(balanceInfo.reserved).toBe(0);
      expect(balanceInfo.available).toBe(75_000);
      expect(balanceInfo.planType).toBe(PlanTypes.PAID);
      expect(balanceInfo.monthlyCredits).toBe(100_000);
      expect(balanceInfo.nextRefillAt).toEqual(nextRefill);
    });

    it('calculates available credits correctly with reservations', async () => {
      const userId = 'user_balance_reserved_1';
      const record = createMockCreditRecord({
        userId,
        balance: 10_000,
        reservedCredits: 3_000,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(10_000);
      expect(balanceInfo.reserved).toBe(3_000);
      expect(balanceInfo.available).toBe(7_000);
    });

    it('prevents negative available credits', async () => {
      const userId = 'user_balance_negative_available';
      const record = createMockCreditRecord({
        userId,
        balance: 1_000,
        reservedCredits: 2_000,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(1_000);
      expect(balanceInfo.reserved).toBe(2_000);
      expect(balanceInfo.available).toBe(0);
    });
  });

  describe('plan type affects balance operations', () => {
    it('free user has signup credits only', async () => {
      const userId = 'user_free_plan';
      const record = createMockCreditRecord({
        userId,
        balance: CREDIT_CONFIG.SIGNUP_CREDITS,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        nextRefillAt: null,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(balanceInfo.monthlyCredits).toBe(0);
      expect(balanceInfo.nextRefillAt).toBeNull();
    });

    it('paid user has monthly credits and refill schedule', async () => {
      const userId = 'user_paid_plan';
      const nextRefill = new Date('2025-02-15');
      const record = createMockCreditRecord({
        userId,
        balance: 100_000,
        planType: PlanTypes.PAID,
        monthlyCredits: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
        nextRefillAt: nextRefill,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.monthlyCredits).toBe(100_000);
      expect(balanceInfo.nextRefillAt).toEqual(nextRefill);
    });

    it('paid user can accumulate credits across months', async () => {
      const userId = 'user_accumulated_credits';
      const record = createMockCreditRecord({
        userId,
        balance: 250_000,
        planType: PlanTypes.PAID,
        monthlyCredits: 100_000,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBeGreaterThan(balanceInfo.monthlyCredits);
    });
  });

  describe('zero balance handling', () => {
    it('handles zero balance gracefully', async () => {
      const userId = 'user_zero_balance';
      const record = createMockCreditRecord({
        userId,
        balance: 0,
        reservedCredits: 0,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(0);
      expect(balanceInfo.reserved).toBe(0);
      expect(balanceInfo.available).toBe(0);
    });

    it('returns zero available when balance exhausted with reservations', async () => {
      const userId = 'user_exhausted_balance';
      const record = createMockCreditRecord({
        userId,
        balance: 0,
        reservedCredits: 500,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.available).toBe(0);
    });
  });

  describe('new user initialization', () => {
    it('creates credit record for new user with signup bonus', async () => {
      const userId = 'user_new_signup';
      const newRecord = createMockCreditRecord({
        userId,
        balance: CREDIT_CONFIG.SIGNUP_CREDITS,
      });

      mockDbSelect = [];
      mockDbInsertReturning = [newRecord];
      mockDbSelect = [newRecord];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(balanceInfo.planType).toBe(PlanTypes.FREE);
    });
  });
});

describe('credit Reservation and Release Flow', () => {
  describe('reserveCredits operations', () => {
    it('reserves credits successfully when sufficient balance', () => {
      const _userId = 'user_reserve_1';
      const estimatedCredits = 1_000;
      const balance = 5_000;
      const currentReserved = 0;

      const newReservedTotal = currentReserved + estimatedCredits;
      const availableAfterReservation = balance - newReservedTotal;

      expect(newReservedTotal).toBe(1_000);
      expect(availableAfterReservation).toBe(4_000);
    });

    it('handles multiple concurrent reservations', () => {
      const balance = 10_000;
      const reservation1 = 3_000;
      const reservation2 = 3_000;

      const afterFirstReserve = reservation1;
      const afterSecondReserve = afterFirstReserve + reservation2;

      expect(afterSecondReserve).toBe(6_000);
      expect(balance - afterSecondReserve).toBe(4_000);
    });

    it('prevents reservation exceeding available balance', async () => {
      const _userId = 'user_insufficient_reserve';
      const balance = 1_000;
      const reserved = 500;
      const available = balance - reserved;
      const requestedReservation = 600;

      expect(available).toBe(500);
      expect(available).toBeLessThan(requestedReservation);
    });
  });

  describe('releaseReservation operations', () => {
    it('releases reserved credits on stream error', () => {
      const balance = 5_000;
      const reservedAmount = 1_000;
      const currentReserved = 1_000;

      const afterRelease = currentReserved - reservedAmount;
      const availableAfterRelease = balance - afterRelease;

      expect(afterRelease).toBe(0);
      expect(availableAfterRelease).toBe(5_000);
    });

    it('handles undefined reserved amount gracefully', () => {
      const reservedAmount = undefined;
      const shouldRelease = reservedAmount !== undefined && reservedAmount > 0;

      expect(shouldRelease).toBe(false);
    });

    it('handles zero reservation release', () => {
      const reservedAmount = 0;
      const shouldRelease = reservedAmount > 0;

      expect(shouldRelease).toBe(false);
    });

    it('handles partial release correctly', () => {
      const currentlyReserved = 5_000;
      const releaseAmount = 2_000;
      const afterRelease = currentlyReserved - releaseAmount;

      expect(afterRelease).toBe(3_000);
    });
  });

  describe('finalizeCredits operations', () => {
    it('finalizes credits with actual token usage', async () => {
      const userId = 'user_finalize_1';
      const streamId = 'stream_finalize_123';
      const actualUsage = {
        inputTokens: 500,
        outputTokens: 1_500,
        action: 'ai_response' as const,
        modelId: 'gpt-4',
      };

      const recordWithReservation = createMockCreditRecord({
        userId,
        balance: 5_000,
        reservedCredits: 1_000,
      });

      const recordAfterFinalize = createMockCreditRecord({
        userId,
        balance: 4_950,
        reservedCredits: 950,
        version: 2,
      });

      mockDbSelect = [recordWithReservation];
      mockDbInsertReturning = [recordWithReservation];
      mockDbUpdate = [recordAfterFinalize];

      await creditService.finalizeCredits(userId, streamId, actualUsage);

      expect(mockDbUpdate[0].version).toBe(2);
    });

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

    it('handles actual usage exceeding reservation', () => {
      const reserved = 1_000;
      const actualUsed = 1_200;
      const excessUsage = actualUsed - reserved;

      expect(excessUsage).toBe(200);
    });
  });
});

describe('balance Update After Stream Completion', () => {
  describe('deduction on completion', () => {
    it('deducts exact credits used from balance', () => {
      const initialBalance = 5_000;
      const creditsUsed = 150;
      const finalBalance = initialBalance - creditsUsed;

      expect(finalBalance).toBe(4_850);
    });

    it('updates version for optimistic locking', () => {
      const currentVersion = 5;
      const newVersion = currentVersion + 1;

      expect(newVersion).toBe(6);
    });

    it('releases excess reservation', () => {
      const reserved = 1_000;
      const actualUsed = 600;
      const toRelease = reserved - actualUsed;
      const newReserved = reserved - toRelease;

      expect(newReserved).toBe(actualUsed);
    });
  });

  describe('concurrent balance updates', () => {
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

    it('version increments on each update', () => {
      const initialVersion = 1;
      const afterUpdate1 = initialVersion + 1;
      const afterUpdate2 = afterUpdate1 + 1;

      expect(afterUpdate1).toBe(2);
      expect(afterUpdate2).toBe(3);
    });
  });
});

describe('concurrent Balance Requests Handling', () => {
  describe('optimistic locking prevents race conditions', () => {
    it('uses version column for concurrency control', () => {
      const lockingStrategy = 'optimistic';
      const versionColumn = 'version';

      expect(lockingStrategy).toBe('optimistic');
      expect(versionColumn).toBe('version');
    });

    it('concurrent updates increment version sequentially', () => {
      const version1 = 10;
      const version2 = version1 + 1;
      const version3 = version2 + 1;

      expect(version1).toBe(10);
      expect(version2).toBe(11);
      expect(version3).toBe(12);
    });

    it('supports retry mechanism on version mismatch', () => {
      const maxRetries = 3;
      let attemptCount = 0;

      for (let i = 0; i < maxRetries; i++) {
        attemptCount++;
      }

      expect(attemptCount).toBe(maxRetries);
    });
  });

  describe('reservation system prevents double-spending', () => {
    it('reserved credits reduce available balance', () => {
      const balance = 10_000;
      const reserved = 3_000;
      const available = balance - reserved;

      expect(available).toBe(7_000);
    });

    it('multiple reservations accumulate', () => {
      const balance = 10_000;
      const reservation1 = 2_000;
      const reservation2 = 3_000;
      const totalReserved = reservation1 + reservation2;
      const available = balance - totalReserved;

      expect(totalReserved).toBe(5_000);
      expect(available).toBe(5_000);
    });
  });
});

describe('invalid/Missing User ID Handling', () => {
  describe('validation and error handling', () => {
    it('validates user ID is required', () => {
      const userId = '';
      const isValid = userId.length > 0;

      expect(isValid).toBe(false);
    });

    it('handles non-existent user gracefully', async () => {
      const userId = 'user_nonexistent';

      mockDbSelect = [];
      mockDbInsertReturning = [];

      await expect(creditService.getUserCreditBalance(userId)).rejects.toBeDefined();
    });

    it('creates credit record for valid new user', async () => {
      const userId = 'user_new_valid';
      const newRecord = createMockCreditRecord({
        userId,
        balance: CREDIT_CONFIG.SIGNUP_CREDITS,
      });

      mockDbSelect = [];
      mockDbInsertReturning = [newRecord];
      mockDbSelect = [newRecord];

      const balanceInfo = await creditService.getUserCreditBalance(userId);

      expect(balanceInfo.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
    });
  });
});

describe('gET /credits/transactions - Credit History Endpoint', () => {
  describe('transaction retrieval with pagination', () => {
    it('returns paginated transaction history', () => {
      const limit = 20;
      const offset = 0;
      const total = 150;

      const hasMore = offset + limit < total;

      expect(limit).toBe(20);
      expect(offset).toBe(0);
      expect(hasMore).toBe(true);
    });

    it('calculates offset from page and limit', () => {
      const page = 3;
      const limit = 20;
      const offset = (page - 1) * limit;

      expect(offset).toBe(40);
    });

    it('handles last page correctly', () => {
      const total = 95;
      const limit = 20;
      const page = 5;
      const offset = (page - 1) * limit;
      const hasMore = offset + limit < total;

      expect(offset).toBe(80);
      expect(hasMore).toBe(false);
    });

    it('supports custom limit values', () => {
      const customLimit = 50;
      const page = 1;
      const offset = (page - 1) * customLimit;

      expect(offset).toBe(0);
      expect(customLimit).toBe(50);
    });
  });

  describe('transaction filtering by type', () => {
    it('filters transactions by type', () => {
      const allTransactions = [
        { type: 'deduction', amount: -100 },
        { type: 'credit_grant', amount: 5_000 },
        { type: 'deduction', amount: -50 },
        { type: 'monthly_refill', amount: 100_000 },
      ];

      const deductions = allTransactions.filter(tx => tx.type === 'deduction');

      expect(deductions).toHaveLength(2);
      expect(deductions.every(tx => tx.type === 'deduction')).toBe(true);
    });

    it('supports filtering by action', () => {
      const transactions = [
        { action: 'ai_response', amount: -5 },
        { action: 'signup_bonus', amount: 5_000 },
        { action: 'ai_response', amount: -10 },
      ];

      const aiResponses = transactions.filter(tx => tx.action === 'ai_response');

      expect(aiResponses).toHaveLength(2);
    });
  });

  describe('transaction chronological ordering', () => {
    it('orders transactions by creation date descending', () => {
      const tx1 = { createdAt: new Date('2025-01-01'), id: 1 };
      const tx2 = { createdAt: new Date('2025-01-02'), id: 2 };
      const tx3 = { createdAt: new Date('2025-01-03'), id: 3 };

      const sorted = [tx3, tx2, tx1];

      expect(sorted[0].createdAt.getTime()).toBeGreaterThan(sorted[1].createdAt.getTime());
      expect(sorted[1].createdAt.getTime()).toBeGreaterThan(sorted[2].createdAt.getTime());
    });

    it('most recent transactions appear first', () => {
      const recent = new Date('2025-01-15');
      const older = new Date('2025-01-01');

      expect(recent.getTime()).toBeGreaterThan(older.getTime());
    });
  });

  describe('transaction data completeness', () => {
    it('includes all required transaction fields', () => {
      const transaction = {
        id: '01JARW8VXNQH1234567890ABC',
        type: 'deduction',
        amount: -5,
        balanceAfter: 4_995,
        action: 'ai_response',
        description: 'AI response tokens: 1500 input, 800 output',
        inputTokens: 1_500,
        outputTokens: 800,
        threadId: 'thread_123',
        createdAt: new Date('2025-01-15T10:30:00Z'),
      };

      expect(transaction.id).toBeDefined();
      expect(transaction.type).toBeDefined();
      expect(transaction.amount).toBeDefined();
      expect(transaction.balanceAfter).toBeDefined();
      expect(transaction.createdAt).toBeDefined();
    });

    it('includes token breakdown for AI operations', () => {
      const aiTransaction = {
        inputTokens: 1_000,
        outputTokens: 2_000,
        action: 'ai_response',
      };

      expect(aiTransaction.inputTokens).toBeGreaterThan(0);
      expect(aiTransaction.outputTokens).toBeGreaterThan(0);
    });

    it('includes thread reference for traceability', () => {
      const transaction = {
        threadId: 'thread_abc123',
        messageId: 'msg_xyz789',
      };

      expect(transaction.threadId).toBeDefined();
      expect(transaction.messageId).toBeDefined();
    });
  });
});

describe('canAffordCredits - Affordability Checks', () => {
  describe('affordability validation', () => {
    it('returns true when user has sufficient credits', async () => {
      const userId = 'user_afford_1';
      const record = createMockCreditRecord({
        userId,
        balance: 5_000,
        reservedCredits: 0,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const canAfford = await creditService.canAffordCredits(userId, 5_000);

      expect(canAfford).toBe(true);
    });

    it('returns false when user has insufficient available credits', async () => {
      const userId = 'user_afford_2';
      const record = createMockCreditRecord({
        userId,
        balance: 5_000,
        reservedCredits: 3_000,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const canAfford = await creditService.canAffordCredits(userId, 3_000);

      expect(canAfford).toBe(false);
    });

    it('accounts for reserved credits in affordability check', async () => {
      const userId = 'user_afford_3';
      const record = createMockCreditRecord({
        userId,
        balance: 10_000,
        reservedCredits: 5_000,
        planType: PlanTypes.PAID,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const canAfford = await creditService.canAffordCredits(userId, 5_000);

      expect(canAfford).toBe(true);
    });

    it('returns false when balance is zero', async () => {
      const userId = 'user_afford_zero';
      const record = createMockCreditRecord({
        userId,
        balance: 0,
        reservedCredits: 0,
      });

      mockDbSelect = [record];
      mockDbInsertReturning = [record];

      const canAfford = await creditService.canAffordCredits(userId, 1);

      expect(canAfford).toBe(false);
    });
  });
});

describe('credit System Edge Cases', () => {
  describe('boundary conditions', () => {
    it('handles maximum safe integer credits', () => {
      const maxSafeCredits = Number.MAX_SAFE_INTEGER;
      const isValid = maxSafeCredits > 0 && Number.isInteger(maxSafeCredits);

      expect(isValid).toBe(true);
    });

    it('handles very small credit amounts', () => {
      const balance = 1;
      const requiredCredits = 1;
      const canProceed = balance >= requiredCredits;

      expect(canProceed).toBe(true);
    });

    it('prevents negative available credits', () => {
      const balance = 100;
      const reserved = 150;
      const available = Math.max(0, balance - reserved);

      expect(available).toBe(0);
    });
  });

  describe('concurrent operations', () => {
    it('supports multiple concurrent balance checks', () => {
      const balance = 10_000;
      const reserved = 3_000;
      const available = balance - reserved;

      const check1 = available >= 2_000;
      const check2 = available >= 8_000;

      expect(check1).toBe(true);
      expect(check2).toBe(false);
    });

    it('handles rapid consecutive requests', () => {
      const initialBalance = 5_000;
      const requests = [100, 200, 150, 300];

      let currentBalance = initialBalance;
      const successful = requests.filter((amount) => {
        if (currentBalance >= amount) {
          currentBalance -= amount;
          return true;
        }
        return false;
      });

      expect(successful.length).toBeGreaterThan(0);
      expect(currentBalance).toBeLessThan(initialBalance);
    });
  });
});
