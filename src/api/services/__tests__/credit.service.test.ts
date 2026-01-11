import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreditActions, PlanTypes } from '@/api/core/enums';
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
        returning: vi.fn(() => mockDbInsertReturning),
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
    id: 'credit_123',
    userId: 'user_123',
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
  it('returns balance for existing user', async () => {
    const record = createMockCreditRecord({
      balance: 5_000,
      reservedCredits: 0,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_123');

    expect(balance.balance).toBe(5_000);
    expect(balance.reserved).toBe(0);
    expect(balance.available).toBe(5_000);
  });

  it('calculates available credits with reservations', async () => {
    const record = createMockCreditRecord({
      balance: 10_000,
      reservedCredits: 3_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_123');

    expect(balance.available).toBe(7_000);
  });

  it('prevents negative available credits', async () => {
    const record = createMockCreditRecord({
      balance: 1_000,
      reservedCredits: 2_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const balance = await creditService.getUserCreditBalance('user_123');

    expect(balance.available).toBe(0);
  });

  it('creates record for new user with signup bonus', async () => {
    const newRecord = createMockCreditRecord({
      balance: CREDIT_CONFIG.SIGNUP_CREDITS,
    });

    mockDbSelect = [];
    mockDbInsertReturning = [newRecord];
    mockDbSelect = [newRecord];

    const balance = await creditService.getUserCreditBalance('user_new');

    expect(balance.balance).toBe(CREDIT_CONFIG.SIGNUP_CREDITS);
  });
});

describe('canAffordCredits', () => {
  it('returns true when sufficient credits available', async () => {
    const record = createMockCreditRecord({
      balance: 5_000,
      reservedCredits: 0,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const canAfford = await creditService.canAffordCredits('user_123', 5_000);

    expect(canAfford).toBe(true);
  });

  it('returns false when insufficient credits', async () => {
    const record = createMockCreditRecord({
      balance: 5_000,
      reservedCredits: 3_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const canAfford = await creditService.canAffordCredits('user_123', 3_000);

    expect(canAfford).toBe(false);
  });

  it('accounts for reserved credits', async () => {
    const record = createMockCreditRecord({
      balance: 10_000,
      reservedCredits: 5_000,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const canAfford = await creditService.canAffordCredits('user_123', 5_000);

    expect(canAfford).toBe(true);
  });
});

describe('finalizeCredits', () => {
  it('finalizes with actual token usage', async () => {
    const recordBefore = createMockCreditRecord({
      balance: 5_000,
      reservedCredits: 1_000,
      version: 1,
    });

    const recordAfter = createMockCreditRecord({
      balance: 4_950,
      reservedCredits: 950,
      version: 2,
    });

    mockDbSelect = [recordBefore];
    mockDbInsertReturning = [recordBefore];
    mockDbUpdate = [recordAfter];

    await creditService.finalizeCredits('user_123', 'stream_123', {
      inputTokens: 500,
      outputTokens: 1_500,
      action: CreditActions.AI_RESPONSE,
      modelId: 'gpt-4',
    });

    expect(mockDbUpdate[0]?.version).toBe(2);
  });
});

describe('zeroOutFreeUserCredits', () => {
  it('zeros balance for free user', async () => {
    const record = createMockCreditRecord({
      balance: 4_900,
      reservedCredits: 100,
      planType: PlanTypes.FREE,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const updateMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const mockDb = createMockDb();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: updateMock,
    });

    vi.mocked(await import('@/db')).getDbAsync.mockResolvedValue(mockDb);

    await creditService.zeroOutFreeUserCredits('user_123');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: 0,
        reservedCredits: 0,
      }),
    );
  });

  it('does not zero credits for paid user', async () => {
    const record = createMockCreditRecord({
      balance: 50_000,
      planType: PlanTypes.PAID,
    });

    mockDbSelect = [record];
    mockDbInsertReturning = [record];

    const updateMock = vi.fn();
    const mockDb = createMockDb();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: updateMock,
    });

    vi.mocked(await import('@/db')).getDbAsync.mockResolvedValue(mockDb);

    await creditService.zeroOutFreeUserCredits('user_paid');

    expect(updateMock).not.toHaveBeenCalled();
  });
});
