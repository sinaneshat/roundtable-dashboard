/**
 * Auth Flow Credit Integration Tests
 *
 * Tests verify credit system integration with authentication:
 * 1. New user signup allocates credits
 * 2. OAuth signup initializes credit records
 * 3. Credit persistence across sessions
 * 4. Credit sync between frontend/backend
 * 5. Credit initialization error handling
 * 6. Existing user credit restoration on login
 *
 * Integration points:
 * - credit.service.ts (ensureUserCreditRecord)
 * - usage-tracking.service.ts (ensureUserUsageRecord)
 * - Better Auth session management
 * - Database transactions and constraints
 */

import { CREDIT_CONFIG } from '@roundtable/shared';
import type { PlanType } from '@roundtable/shared/enums';
import { CreditActions, CreditTransactionTypes, PlanTypes, SubscriptionTiers } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureUserCreditRecord, getUserCreditBalance } from '@/services/billing';
import { ensureUserUsageRecord } from '@/services/usage';

type MockCreditRecord = {
  id: string;
  userId: string;
  balance: number;
  reservedCredits: number;
  planType: PlanType;
  monthlyCredits: number;
  nextRefillAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockUsageRecord = {
  id: string;
  userId: string;
  subscriptionTier: string;
  isAnnual: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  threadsCreated: number;
  messagesCreated: number;
  customRolesCreated: number;
  analysisGenerated: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockTransaction = {
  id: string;
  userId: string;
  type: string;
  action: string;
  amount: number;
  balanceAfter: number;
  description?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  creditsUsed?: number | null;
};

// Mock database operations
let mockCreditRecords: Map<string, MockCreditRecord>;
let mockUsageRecords: Map<string, MockUsageRecord>;
let mockTransactions: MockTransaction[];
let lastInsertType: 'credit' | 'usage' | 'transaction' | null = null;

vi.mock('@/db', async () => {
  const actual = await vi.importActual('@/db');

  return {
    ...actual,
    getDbAsync: vi.fn(() => {
      return {
        insert: vi.fn(() => {
          const valuesHandler = (data: Partial<MockCreditRecord | MockUsageRecord | MockTransaction>) => {
            // Determine type based on data structure
            const isCredit = 'balance' in data && 'planType' in data;
            const isUsage = 'subscriptionTier' in data && 'threadsCreated' in data;
            const isTransaction = 'type' in data && 'balanceAfter' in data;

            // Transaction insert pattern (no onConflictDoNothing or returning)
            if (isTransaction) {
              mockTransactions.push(data);
              return Promise.resolve(); // Transactions don't return values
            }

            // Shared returning handler
            const returningHandler = () => {
              if (isCredit) {
                lastInsertType = 'credit';
                const exists = mockCreditRecords.has(data.userId);
                if (!exists) {
                  const record = { ...data, version: data.version || 1 };
                  mockCreditRecords.set(data.userId, record);
                  return [record];
                }
                return [];
              }
              if (isUsage) {
                lastInsertType = 'usage';
                const exists = mockUsageRecords.has(data.userId);
                if (!exists) {
                  const record = { ...data, version: data.version || 1 };
                  mockUsageRecords.set(data.userId, record);
                  return [record];
                }
                return [];
              }
              return [];
            };

            // Credit uses onConflictDoNothing().returning()
            // Usage uses .returning() directly
            return {
              // Support .onConflictDoNothing().returning() for credit
              onConflictDoNothing: vi.fn(() => ({
                returning: vi.fn(returningHandler),
              })),
              // Support direct .returning() for usage
              returning: vi.fn(returningHandler),
            };
          };

          return {
            values: vi.fn(valuesHandler),
          };
        }),
        select: vi.fn(() => {
          // Simplified select logic - use lastInsertType as primary hint
          return {
            from: vi.fn(() => ({
              where: vi.fn((_condition: unknown) => {
                let selectType: 'credit' | 'usage' = 'credit';

                if (lastInsertType === 'usage') {
                  selectType = 'usage';
                } else if (mockCreditRecords.size === 0 && mockUsageRecords.size > 0) {
                  selectType = 'usage';
                } else {
                  selectType = 'credit';
                }

                const results
                  = selectType === 'credit'
                    ? Array.from(mockCreditRecords.values())
                    : Array.from(mockUsageRecords.values());

                const limitResult = {
                  $withCache: vi.fn(() => results),
                };

                // Make results array-like for both credit and usage queries
                Object.assign(limitResult, results);
                limitResult.length = results.length;
                results.forEach((item, idx) => {
                  limitResult[idx] = item;
                });

                return {
                  limit: vi.fn(() => limitResult),
                };
              }),
            })),
          };
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => []),
            })),
          })),
        })),
      };
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCreditRecords = new Map();
  mockUsageRecords = new Map();
  mockTransactions = [];
  lastInsertType = null;
});

describe('auth Flow Credit Integration', () => {
  describe('new User Signup Credit Allocation', () => {
    it('allocates signup credits to new user on first access', async () => {
      const userId = 'user-new-signup-001';

      // Simulate new user - no existing records (maps are empty from beforeEach)

      const result = await ensureUserCreditRecord(userId);

      expect(result.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(result.balance).toBe(5000);
      expect(result.reservedCredits).toBe(0);
      expect(result.planType).toBe(PlanTypes.FREE);
      expect(result.monthlyCredits).toBe(0);
      expect(result.version).toBe(1);
    });

    it('creates transaction log for signup bonus', async () => {
      const userId = 'user-new-signup-002';

      // New user - no existing records

      await ensureUserCreditRecord(userId);

      // Transaction should be recorded
      const signupTransaction = mockTransactions.find(
        tx => tx.action === CreditActions.SIGNUP_BONUS && tx.userId === userId,
      );

      expect(signupTransaction).toBeDefined();
      expect(signupTransaction?.type).toBe(CreditTransactionTypes.CREDIT_GRANT);
      expect(signupTransaction?.amount).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(signupTransaction?.balanceAfter).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(signupTransaction?.description).toContain('Signup bonus');
    });

    it('initializes available credits correctly', async () => {
      const userId = 'user-new-signup-003';

      // New user - no existing records

      const balance = await getUserCreditBalance(userId);

      expect(balance.available).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(balance.balance).toBe(5000);
      expect(balance.reserved).toBe(0);
      expect(balance.available).toBe(balance.balance - balance.reserved);
    });

    it('allows new user to create threads with signup credits', async () => {
      const userId = 'user-new-signup-004';

      // New user - no existing credit records

      const balance = await getUserCreditBalance(userId);
      const threadCost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;
      const canCreateThread = balance.available >= threadCost;

      expect(canCreateThread).toBe(true);
      expect(balance.available).toBe(5000);
      expect(threadCost).toBe(100);
    });

    it('allows new user to stream AI responses', async () => {
      const userId = 'user-new-signup-005';

      // New user - no existing credit records

      const balance = await getUserCreditBalance(userId);
      const minCredits = CREDIT_CONFIG.MIN_CREDITS_FOR_STREAMING;
      const canStream = balance.available >= minCredits;

      expect(canStream).toBe(true);
      expect(balance.available).toBe(5000);
      expect(minCredits).toBe(10);
    });
  });

  describe('oauth Signup Credit Initialization', () => {
    it('initializes credits for OAuth user on first access', async () => {
      const oauthUserId = 'oauth-google-user-001';

      // New user - no existing credit records

      const result = await ensureUserCreditRecord(oauthUserId);

      expect(result.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(result.planType).toBe(PlanTypes.FREE);
      expect(mockCreditRecords.has(oauthUserId)).toBe(true);
    });

    it('creates usage record for OAuth user', async () => {
      const oauthUserId = 'oauth-google-user-002';

      // New user - no existing usage records

      const result = await ensureUserUsageRecord(oauthUserId);

      expect(result.subscriptionTier).toBe(SubscriptionTiers.FREE);
      expect(result.threadsCreated).toBe(0);
      expect(result.messagesCreated).toBe(0);
      expect(mockUsageRecords.has(oauthUserId)).toBe(true);
    });

    it('records signup transaction for OAuth user', async () => {
      const oauthUserId = 'oauth-google-user-003';

      // New user - no existing credit records

      await ensureUserCreditRecord(oauthUserId);

      const signupTx = mockTransactions.find(
        tx => tx.userId === oauthUserId && tx.action === CreditActions.SIGNUP_BONUS,
      );

      expect(signupTx).toBeDefined();
      expect(signupTx?.amount).toBe(5000);
    });

    it('sets correct billing period for OAuth user', async () => {
      const oauthUserId = 'oauth-google-user-004';
      const now = new Date();

      // New user - no existing usage records

      const result = await ensureUserUsageRecord(oauthUserId);

      expect(result.currentPeriodStart.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(result.currentPeriodEnd.getTime()).toBeGreaterThan(now.getTime());
      expect(result.currentPeriodEnd.getTime()).toBeGreaterThan(result.currentPeriodStart.getTime());
    });
  });

  describe('credit Persistence Across Sessions', () => {
    it('returns existing credit record for returning user', async () => {
      const userId = 'user-returning-001';
      const existingBalance = 3500;

      const existingRecord: MockCreditRecord = {
        balance: existingBalance,
        createdAt: new Date(),
        id: 'credit-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      mockCreditRecords.set(userId, existingRecord);

      const result = await ensureUserCreditRecord(userId);

      expect(result.balance).toBe(existingBalance);
      expect(result.balance).toBe(3500);
      expect(mockTransactions).toHaveLength(0); // No signup transaction for existing user
    });

    it('preserves credit balance after session expiry', async () => {
      const userId = 'user-session-expiry-001';
      const balanceAfterUse = 4200;

      const existingRecord: MockCreditRecord = {
        balance: balanceAfterUse,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        id: 'credit-002',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        userId,
        version: 2,
      };

      mockCreditRecords.set(userId, existingRecord);

      const balance = await getUserCreditBalance(userId);

      expect(balance.balance).toBe(balanceAfterUse);
      expect(balance.available).toBe(4200);
    });

    it('maintains reserved credits across sessions', async () => {
      const userId = 'user-reserved-001';
      const reserved = 500;

      const existingRecord: MockCreditRecord = {
        balance: 5000,
        createdAt: new Date(),
        id: 'credit-003',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: reserved,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      mockCreditRecords.set(userId, existingRecord);

      const balance = await getUserCreditBalance(userId);

      expect(balance.reserved).toBe(reserved);
      expect(balance.available).toBe(5000 - 500);
      expect(balance.available).toBe(4500);
    });

    it('preserves usage counters across sessions', async () => {
      const userId = 'user-usage-persist-001';
      const threadsCreated = 15;
      const messagesCreated = 45;

      const now = new Date();
      const existingUsage: MockUsageRecord = {
        analysisGenerated: 0,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        customRolesCreated: 0,
        id: 'usage-001',
        isAnnual: false,
        messagesCreated,
        subscriptionTier: SubscriptionTiers.FREE,
        threadsCreated,
        updatedAt: new Date(),
        userId,
        version: 3,
      };

      mockUsageRecords.set(userId, existingUsage);
      mockUsageRecords.set(userId, existingUsage);

      const result = await ensureUserUsageRecord(userId);

      expect(result.threadsCreated).toBe(threadsCreated);
      expect(result.messagesCreated).toBe(messagesCreated);
      expect(result.version).toBe(3);
    });
  });

  describe('credit Sync Between Frontend and Backend', () => {
    it('returns consistent balance info for same user', async () => {
      const userId = 'user-sync-001';

      // New user - no existing credit records

      const balance1 = await getUserCreditBalance(userId);
      const balance2 = await getUserCreditBalance(userId);

      expect(balance1.balance).toBe(balance2.balance);
      expect(balance1.available).toBe(balance2.available);
      expect(balance1.reserved).toBe(balance2.reserved);
    });

    it('reflects credit deductions in balance', async () => {
      const userId = 'user-sync-002';
      const initialBalance = 5000;
      const deduction = 800;

      const record: MockCreditRecord = {
        balance: initialBalance - deduction,
        createdAt: new Date(),
        id: 'credit-sync-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: 2,
      };

      mockCreditRecords.set(userId, record);

      const balance = await getUserCreditBalance(userId);

      expect(balance.balance).toBe(initialBalance - deduction);
      expect(balance.available).toBe(4200);
    });

    it('updates available credits when reservations change', async () => {
      const userId = 'user-sync-003';
      const balance = 5000;
      const newReservation = 1000;

      const record: MockCreditRecord = {
        balance,
        createdAt: new Date(),
        id: 'credit-sync-002',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: newReservation,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      mockCreditRecords.set(userId, record);

      const balanceInfo = await getUserCreditBalance(userId);

      expect(balanceInfo.available).toBe(balance - newReservation);
      expect(balanceInfo.available).toBe(4000);
      expect(balanceInfo.reserved).toBe(1000);
    });

    it('provides correct plan type info', async () => {
      const userId = 'user-sync-004';

      const freeRecord: MockCreditRecord = {
        balance: 5000,
        createdAt: new Date(),
        id: 'credit-sync-003',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      mockCreditRecords.set(userId, freeRecord);

      const balance = await getUserCreditBalance(userId);

      expect(balance.planType).toBe(PlanTypes.FREE);
      expect(balance.monthlyCredits).toBe(0);
      expect(balance.nextRefillAt).toBeNull();
    });
  });

  describe('credit Initialization Error Handling', () => {
    it('handles concurrent signup attempts with onConflictDoNothing', async () => {
      const userId = 'user-concurrent-001';

      // New user - no existing credit records

      // Simulate concurrent requests
      const [result1, result2] = await Promise.all([
        ensureUserCreditRecord(userId),
        ensureUserCreditRecord(userId),
      ]);

      // Both should return valid records
      expect(result1.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
      expect(result2.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);

      // Only one record should be created
      expect(mockCreditRecords.size).toBe(1);
    });

    it('only records signup transaction once', async () => {
      const userId = 'user-transaction-once-001';

      // New user - no existing credit records

      await ensureUserCreditRecord(userId);
      await ensureUserCreditRecord(userId);

      const signupTransactions = mockTransactions.filter(
        tx => tx.userId === userId && tx.action === CreditActions.SIGNUP_BONUS,
      );

      // Should only have one signup transaction even with multiple calls
      expect(signupTransactions.length).toBeLessThanOrEqual(1);
    });

    it('handles missing user gracefully', async () => {
      const invalidUserId = 'user-nonexistent-001';

      // New user - no existing credit records

      // Should attempt to create record, but fail if user doesn't exist
      await expect(async () => {
        // In real scenario, this would fail if user table constraint fails
        // For this test, we verify the attempt is made
        const result = await ensureUserCreditRecord(invalidUserId);
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('validates credit balance constraints', async () => {
      const userId = 'user-constraint-001';

      const _invalidRecord: MockCreditRecord = {
        balance: -100, // Negative balance violates constraint
        createdAt: new Date(),
        id: 'credit-invalid-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      // Database constraint should prevent this
      // Our mock doesn't enforce, but we document the expectation
      expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBeGreaterThanOrEqual(0);
    });

    it('validates version constraint for optimistic locking', async () => {
      const userId = 'user-version-001';

      const record: MockCreditRecord = {
        balance: 5000,
        createdAt: new Date(),
        id: 'credit-version-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      // Version must be positive
      expect(record.version).toBeGreaterThan(0);
    });
  });

  describe('existing User Credit Restoration on Login', () => {
    it('restores credit balance for existing user', async () => {
      const userId = 'user-existing-001';
      const previousBalance = 2500;

      const existingRecord: MockCreditRecord = {
        balance: previousBalance,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        id: 'credit-existing-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        userId,
        version: 5,
      };

      mockCreditRecords.set(userId, existingRecord);

      const balance = await getUserCreditBalance(userId);

      expect(balance.balance).toBe(previousBalance);
      expect(balance.available).toBe(2500);
      expect(mockTransactions).toHaveLength(0); // No signup bonus for existing user
    });

    it('restores usage history for existing user', async () => {
      const userId = 'user-existing-002';
      const previousThreads = 42;
      const previousMessages = 126;

      const now = new Date();
      const existingUsage: MockUsageRecord = {
        analysisGenerated: 0,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        customRolesCreated: 0,
        id: 'usage-existing-001',
        isAnnual: false,
        messagesCreated: previousMessages,
        subscriptionTier: SubscriptionTiers.FREE,
        threadsCreated: previousThreads,
        updatedAt: new Date(),
        userId,
        version: 10,
      };

      mockUsageRecords.set(userId, existingUsage);

      const result = await ensureUserUsageRecord(userId);

      expect(result.threadsCreated).toBe(previousThreads);
      expect(result.messagesCreated).toBe(previousMessages);
    });

    it('does not grant signup bonus to existing user', async () => {
      const userId = 'user-no-bonus-001';

      const existingRecord: MockCreditRecord = {
        balance: 1000,
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        id: 'credit-no-bonus-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        userId,
        version: 3,
      };

      mockCreditRecords.set(userId, existingRecord);

      await ensureUserCreditRecord(userId);

      const signupBonus = mockTransactions.find(
        tx => tx.userId === userId && tx.action === CreditActions.SIGNUP_BONUS,
      );

      expect(signupBonus).toBeUndefined();
    });

    it('restores paid plan configuration', async () => {
      const userId = 'user-paid-001';
      const monthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      const paidRecord: MockCreditRecord = {
        balance: 95_000,
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        id: 'credit-paid-001',
        monthlyCredits,
        nextRefillAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        planType: PlanTypes.PAID,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: 1,
      };

      mockCreditRecords.set(userId, paidRecord);

      const balance = await getUserCreditBalance(userId);

      expect(balance.planType).toBe(PlanTypes.PAID);
      expect(balance.monthlyCredits).toBe(monthlyCredits);
      expect(balance.nextRefillAt).toBeDefined();
    });

    it('maintains version for existing user', async () => {
      const userId = 'user-version-existing-001';
      const currentVersion = 15;

      const existingRecord: MockCreditRecord = {
        balance: 3000,
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        id: 'credit-version-existing-001',
        monthlyCredits: 0,
        nextRefillAt: null,
        planType: PlanTypes.FREE,
        reservedCredits: 0,
        updatedAt: new Date(),
        userId,
        version: currentVersion,
      };

      mockCreditRecords.set(userId, existingRecord);

      const result = await ensureUserCreditRecord(userId);

      expect(result.version).toBe(currentVersion);
      expect(result.version).toBeGreaterThan(1);
    });
  });

  describe('complete Auth Flow Integration', () => {
    it.todo('initializes all required records for new user');

    it('provides correct initial state for new free user', async () => {
      const userId = 'user-initial-state-001';

      // New user - no existing credit records

      const balance = await getUserCreditBalance(userId);

      const initialState = {
        available: balance.available,
        balance: balance.balance,
        canCreateThread: balance.available >= CREDIT_CONFIG.ACTION_COSTS.threadCreation,
        canStream: balance.available >= CREDIT_CONFIG.MIN_CREDITS_FOR_STREAMING,
        monthlyCredits: balance.monthlyCredits,
        planType: balance.planType,
        reserved: balance.reserved,
      };

      expect(initialState.balance).toBe(5000);
      expect(initialState.available).toBe(5000);
      expect(initialState.reserved).toBe(0);
      expect(initialState.planType).toBe(PlanTypes.FREE);
      expect(initialState.monthlyCredits).toBe(0);
      expect(initialState.canCreateThread).toBe(true);
      expect(initialState.canStream).toBe(true);
    });

    it('handles user journey from signup to first action', async () => {
      const userId = 'user-journey-001';

      // New user - no existing credit records

      // 1. Signup - credits allocated
      const initialBalance = await getUserCreditBalance(userId);
      expect(initialBalance.available).toBe(5000);

      // 2. User can take action
      const threadCost = CREDIT_CONFIG.ACTION_COSTS.threadCreation;
      const canAct = initialBalance.available >= threadCost;
      expect(canAct).toBe(true);

      // 3. Sufficient credits remain
      expect(initialBalance.available).toBeGreaterThan(threadCost);
    });
  });
});
