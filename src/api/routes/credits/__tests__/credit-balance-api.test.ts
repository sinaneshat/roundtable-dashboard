import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanTypes } from '@/api/core/enums';
import * as creditService from '@/api/services/billing';
import type { UserCreditBalance } from '@/db/validation';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

type MockDbResult<T> = T[];

let mockDbInsertReturning: MockDbResult<Partial<UserCreditBalance>> = [];
let mockDbSelect: MockDbResult<Partial<UserCreditBalance>> = [];
let mockDbUpdate: MockDbResult<Partial<UserCreditBalance>> = [];

function createMockDb() {
  const withCache = <T>(result: T) => ({
    ...result,
    $withCache: vi.fn(() => result),
  });

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
          limit: vi.fn(() => withCache(mockDbSelect)),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => withCache(mockDbSelect)),
            offset: vi.fn(() => mockDbSelect),
          })),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => withCache(mockDbSelect)),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => withCache(mockDbSelect)),
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

function createMockCreditRecord(overrides?: Partial<UserCreditBalance>): Partial<UserCreditBalance> {
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

describe('getUserCreditBalance', () => {
  it('returns balance for free user', async () => {
    const record = createMockCreditRecord({
      userId: 'user_free',
      balance: 5_000,
      reservedCredits: 0,
      planType: PlanTypes.FREE,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_free');

    expect(balance.balance).toBe(5_000);
    expect(balance.reserved).toBe(0);
    expect(balance.available).toBe(5_000);
    expect(balance.planType).toBe(PlanTypes.FREE);
  });

  it('returns balance for paid user', async () => {
    const nextRefill = new Date('2025-02-01');
    const proMonthlyCredits = CREDIT_CONFIG.PLANS.paid.monthlyCredits;
    const record = createMockCreditRecord({
      userId: 'user_paid',
      balance: 75_000,
      planType: PlanTypes.PAID,
      monthlyCredits: proMonthlyCredits,
      nextRefillAt: nextRefill,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_paid');

    expect(balance.balance).toBe(75_000);
    expect(balance.planType).toBe(PlanTypes.PAID);
    expect(balance.monthlyCredits).toBe(proMonthlyCredits);
    expect(balance.nextRefillAt).toEqual(nextRefill);
  });

  it('calculates available credits with reservations', async () => {
    const record = createMockCreditRecord({
      userId: 'user_reserved',
      balance: 10_000,
      reservedCredits: 3_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_reserved');

    expect(balance.balance).toBe(10_000);
    expect(balance.reserved).toBe(3_000);
    expect(balance.available).toBe(7_000);
  });

  it('prevents negative available credits', async () => {
    const record = createMockCreditRecord({
      balance: 1_000,
      reservedCredits: 2_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_test');

    expect(balance.available).toBe(0);
  });

  it('handles zero balance', async () => {
    const record = createMockCreditRecord({
      balance: 0,
      reservedCredits: 0,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_zero');

    expect(balance.balance).toBe(0);
    expect(balance.available).toBe(0);
  });

  it('creates record for new user with signup bonus', async () => {
    const newRecord = createMockCreditRecord({
      userId: 'user_new',
      balance: CREDIT_CONFIG.SIGNUP_CREDITS,
    });

    mockDbSelect = [];
    mockDbInsertReturning = [newRecord];
    mockDbSelect = [newRecord];

    const balance = await creditService.getUserCreditBalance('user_new');

    expect(balance.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
    expect(balance.planType).toBe(PlanTypes.FREE);
  });

  it('handles non-existent user', async () => {
    mockDbSelect = [];
    mockDbInsertReturning = [];

    await expect(creditService.getUserCreditBalance('user_nonexistent')).rejects.toBeDefined();
  });
});

describe('canAffordCredits', () => {
  it('returns true when user has sufficient credits', async () => {
    const record = createMockCreditRecord({
      balance: 5_000,
      reservedCredits: 0,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const canAfford = await creditService.canAffordCredits('user_test', 5_000);

    expect(canAfford).toBe(true);
  });

  it('returns false when user has insufficient credits', async () => {
    const record = createMockCreditRecord({
      balance: 5_000,
      reservedCredits: 3_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const canAfford = await creditService.canAffordCredits('user_test', 3_000);

    expect(canAfford).toBe(false);
  });

  it('returns false when balance is zero', async () => {
    const record = createMockCreditRecord({
      balance: 0,
      reservedCredits: 0,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const canAfford = await creditService.canAffordCredits('user_test', 1);

    expect(canAfford).toBe(false);
  });
});
