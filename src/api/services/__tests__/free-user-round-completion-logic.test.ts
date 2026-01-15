import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreditActions, CreditTransactionTypes, MessageRoles, PlanTypes } from '@/api/core/enums';
import {
  checkFreeUserHasCompletedRound,
  enforceCredits,
  zeroOutFreeUserCredits,
} from '@/api/services/billing';
import { getDbAsync } from '@/db';

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getDbAsync: vi.fn(),
  };
});

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  query: {
    chatThread: { findFirst: ReturnType<typeof vi.fn> };
    chatParticipant: { findMany: ReturnType<typeof vi.fn> };
    chatMessage: { findFirst: ReturnType<typeof vi.fn> };
    creditTransaction: { findFirst: ReturnType<typeof vi.fn> };
  };
};

let mockDb: MockDb;

function withCache<T>(value: T) {
  const promise = Promise.resolve(value) as Promise<T> & { $withCache: ReturnType<typeof vi.fn> };
  promise.$withCache = vi.fn(() => promise);
  return promise;
}

function setupSelectMock(
  transactionResult: unknown[],
  messageResult: unknown[],
  participantCount: number = 2,
) {
  // Mock db.query.creditTransaction.findFirst for the transaction check
  if (transactionResult.length > 0) {
    mockDb.query.creditTransaction.findFirst.mockResolvedValue(transactionResult[0]);
  } else {
    mockDb.query.creditTransaction.findFirst.mockResolvedValue(null);
  }

  // Create participant array based on count
  const participantArray = Array.from({ length: participantCount }, (_, i) => ({
    id: `p${i + 1}`,
    threadId: 'thread-1',
    isEnabled: true,
  }));

  // Mock db.select() for participant and message count queries
  const fromMock = vi.fn();
  let callCount = 0;

  fromMock.mockImplementation(() => {
    callCount++;
    const whereMock = vi.fn();

    // First select call is for participant count, second is for message count
    if (callCount === 1) {
      // Return array for participant count (function counts length)
      whereMock.mockResolvedValue(participantArray);
    } else {
      // Return for message count
      whereMock.mockResolvedValue(messageResult);
    }

    return {
      where: whereMock,
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
        }),
      }),
    };
  });

  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: fromMock,
  });
}

beforeEach(() => {
  mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: {
      chatThread: { findFirst: vi.fn() },
      chatParticipant: { findMany: vi.fn() },
      chatMessage: { findFirst: vi.fn() },
      creditTransaction: { findFirst: vi.fn() },
    },
  };

  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
      }),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
        }),
      }),
    }),
  });

  (getDbAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('round completion - single participant', () => {
  it('detects completion after participant responds', async () => {
    // Single participant (participantCount = 1) - no moderator check needed
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
      1,
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-1',
      userId: 'user-1',
    });

    const result = await checkFreeUserHasCompletedRound('user-1');

    expect(result).toBe(true);
  });

  it('does not detect completion before participant responds', async () => {
    // Single participant but no messages yet
    setupSelectMock([], [], 1);

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-1',
      userId: 'user-1',
    });

    const result = await checkFreeUserHasCompletedRound('user-1');

    expect(result).toBe(false);
  });
});

describe('round completion - multiple participants', () => {
  it('does not detect completion after 1st of 2 participants', async () => {
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-2',
      userId: 'user-2',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue(undefined);

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(false);
  });

  it('does not detect completion without moderator content', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-2',
      userId: 'user-2',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-2_r0_moderator',
      parts: [],
    });

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(false);
  });

  it('detects completion after all participants and moderator with content', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-2',
      userId: 'user-2',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-2_r0_moderator',
      parts: [{ type: 'text', text: 'Round summary content' }],
    });

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(true);
  });
});

describe('credit zeroing', () => {
  it('zeros balance and reserved credits', async () => {
    const userBalance = {
      id: 'balance-1',
      userId: 'user-zero',
      balance: 4900,
      reservedCredits: 100,
      planType: PlanTypes.FREE,
      version: 1,
    };

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([userBalance]))),
        }),
      }),
    });

    const updateMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: updateMock,
    });

    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await zeroOutFreeUserCredits('user-zero');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: 0,
        reservedCredits: 0,
      }),
    );
  });

  it('creates FREE_ROUND_COMPLETE transaction', async () => {
    const userBalance = {
      id: 'balance-tx',
      userId: 'user-tx',
      balance: 3000,
      reservedCredits: 0,
      planType: PlanTypes.FREE,
      version: 1,
    };

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([userBalance]))),
        }),
      }),
    });

    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const insertValuesMock = vi.fn().mockResolvedValue(undefined);
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: insertValuesMock,
    });

    await zeroOutFreeUserCredits('user-tx');

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-tx',
        type: CreditTransactionTypes.DEDUCTION,
        action: CreditActions.FREE_ROUND_COMPLETE,
        amount: -3000,
        balanceAfter: 0,
      }),
    );
  });

  it('only affects FREE plan users', async () => {
    const paidUserBalance = {
      id: 'balance-paid',
      userId: 'user-paid',
      balance: 50000,
      reservedCredits: 0,
      planType: PlanTypes.PAID,
      version: 1,
    };

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([paidUserBalance]))),
        }),
      }),
    });

    const updateMock = vi.fn();
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: updateMock,
    });

    await zeroOutFreeUserCredits('user-paid');

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('is idempotent when balance already zero', async () => {
    const zeroBalance = {
      id: 'balance-zero',
      userId: 'user-already-zero',
      balance: 0,
      reservedCredits: 0,
      planType: PlanTypes.FREE,
      version: 1,
    };

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([zeroBalance]))),
        }),
      }),
    });

    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const insertValuesMock = vi.fn().mockResolvedValue(undefined);
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: insertValuesMock,
    });

    await zeroOutFreeUserCredits('user-already-zero');

    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe('subsequent operations blocked', () => {
  it('blocks free users after round completion', async () => {
    // Mock db.select() for credit balance check - return FREE plan user with credits
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'balance-1',
              userId: 'user-blocked',
              balance: 1000,
              reservedCredits: 0,
              planType: PlanTypes.FREE,
              monthlyCredits: 0,
              nextRefillAt: null,
            },
          ]),
        }),
      }),
    });

    // Mock db.query.creditTransaction.findFirst to return a transaction (round completed)
    mockDb.query.creditTransaction.findFirst.mockResolvedValue({
      id: 'tx-complete',
      userId: 'user-blocked',
      action: CreditActions.FREE_ROUND_COMPLETE,
    });

    mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

    await expect(
      enforceCredits('user-blocked', 100),
    ).rejects.toThrow('Your free conversation round has been used');
  });

  it('provides upgrade message in error', async () => {
    // Mock db.select() for credit balance check - return FREE plan user with credits
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'balance-2',
              userId: 'user-upgrade',
              balance: 1000,
              reservedCredits: 0,
              planType: PlanTypes.FREE,
              monthlyCredits: 0,
              nextRefillAt: null,
            },
          ]),
        }),
      }),
    });

    // Mock db.query.creditTransaction.findFirst to return a transaction (round completed)
    mockDb.query.creditTransaction.findFirst.mockResolvedValue({
      id: 'tx-complete',
      userId: 'user-upgrade',
      action: CreditActions.FREE_ROUND_COMPLETE,
    });

    mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

    await expect(
      enforceCredits('user-upgrade', 100),
    ).rejects.toThrow('Subscribe to Pro to continue chatting');
  });
});

describe('transaction marker', () => {
  it('returns true when transaction exists', async () => {
    // Mock db.query.creditTransaction.findFirst to return a transaction
    mockDb.query.creditTransaction.findFirst.mockResolvedValue({
      id: 'tx-complete',
      userId: 'user-tx',
      action: CreditActions.FREE_ROUND_COMPLETE,
    });

    const result = await checkFreeUserHasCompletedRound('user-tx');

    expect(result).toBe(true);
    expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
  });

  it('prevents redundant queries after completion', async () => {
    // Mock db.query.creditTransaction.findFirst to return a transaction
    mockDb.query.creditTransaction.findFirst.mockResolvedValue({
      id: 'tx-complete',
      userId: 'user-redundant',
      action: CreditActions.FREE_ROUND_COMPLETE,
    });

    await checkFreeUserHasCompletedRound('user-redundant');
    await checkFreeUserHasCompletedRound('user-redundant');
    await checkFreeUserHasCompletedRound('user-redundant');

    expect(mockDb.query.chatThread.findFirst).not.toHaveBeenCalled();
  });
});

describe('edge cases', () => {
  it('handles no thread', async () => {
    setupSelectMock([], []);

    mockDb.query.chatThread.findFirst.mockResolvedValue(undefined);

    const result = await checkFreeUserHasCompletedRound('user-no-thread');

    expect(result).toBe(false);
  });

  it('handles no participants', async () => {
    setupSelectMock([], []);

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-no-parts',
      userId: 'user-no-parts',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([]);

    const result = await checkFreeUserHasCompletedRound('user-no-parts');

    expect(result).toBe(false);
  });

  it('handles moderator with empty text parts', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-empty',
      userId: 'user-empty',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-empty_r0_moderator',
      parts: [{ type: 'text', text: '   ' }],
    });

    const result = await checkFreeUserHasCompletedRound('user-empty');

    expect(result).toBe(false);
  });

  it('handles moderator with non-text parts', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-non-text',
      userId: 'user-non-text',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', modelId: 'model-1', isEnabled: true },
      { id: 'p2', modelId: 'model-2', isEnabled: true },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-non-text_r0_moderator',
      parts: [{ type: 'image', url: 'https://example.com/image.png' }],
    });

    const result = await checkFreeUserHasCompletedRound('user-non-text');

    expect(result).toBe(false);
  });
});
