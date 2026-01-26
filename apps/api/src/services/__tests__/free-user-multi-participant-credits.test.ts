import { CreditActions, MessageRoles, PlanTypes } from '@roundtable/shared/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbAsync } from '@/db';
import { checkFreeUserHasCompletedRound, zeroOutFreeUserCredits } from '@/services/billing';

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
  const promise = Promise.resolve(value) as Promise<T> & { $withCache: () => Promise<T> };
  // Assign the $withCache method directly - it returns the same promise to simulate caching
  promise.$withCache = () => promise;
  return promise;
}

function setupMockDb() {
  mockDb = {
    insert: vi.fn(),
    query: {
      chatMessage: { findFirst: vi.fn() },
      chatParticipant: { findMany: vi.fn() },
      chatThread: { findFirst: vi.fn() },
      creditTransaction: { findFirst: vi.fn() },
    },
    select: vi.fn(),
    update: vi.fn(),
  };

  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
        }),
      }),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([]))),
      }),
    }),
  });

  (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  });

  (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  (getDbAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
}

function setupSelectMock(
  transactionResult: unknown[],
  messageResult: unknown[],
  participantCount = 2,
) {
  // Create participant array based on count
  const participantArray = Array.from({ length: participantCount }, (_, i) => ({
    id: `p${i + 1}`,
    isEnabled: true,
    threadId: 'thread-1',
  }));

  // Mock db.select() - handles 4 sequential calls:
  // 1. Transaction check: .from().where().limit().$withCache()
  // 2. Thread check: .from().where().limit().$withCache()
  // 3. Participant query: .from().where() (no limit)
  // 4. Message query: .from().where() (no limit)
  const fromMock = vi.fn();
  let callCount = 0;

  fromMock.mockImplementation(() => {
    callCount++;

    if (callCount === 1) {
      // Transaction check - needs .where().limit().$withCache()
      return {
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve(transactionResult))),
        }),
      };
    } else if (callCount === 2) {
      // Thread check - needs .where().limit().$withCache()
      return {
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() =>
            withCache(Promise.resolve([{ id: 'thread-1', userId: 'user-1' }])),
          ),
        }),
      };
    } else if (callCount === 3) {
      // Participant query - just .where() (no limit)
      return {
        where: vi.fn().mockResolvedValue(participantArray),
      };
    } else {
      // Message query - just .where() (no limit)
      return {
        where: vi.fn().mockResolvedValue(messageResult),
      };
    }
  });

  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: fromMock,
  });
}

beforeEach(() => {
  setupMockDb();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('1 Participant Round', () => {
  it('completes after participant responds', async () => {
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

  it('zeros credits after completion', async () => {
    const userCreditBalance = {
      balance: 5000,
      createdAt: new Date(),
      id: 'balance-1',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: PlanTypes.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId: 'user-1',
      version: 1,
    };

    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([userCreditBalance]))),
        }),
      }),
    });

    const updateMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });

    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: updateMock,
    });

    await zeroOutFreeUserCredits('user-1');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: 0,
        reservedCredits: 0,
      }),
    );
  });
});

describe('2 Participants Round', () => {
  it('not complete after 1st participant', async () => {
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-2',
      userId: 'user-2',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(false);
  });

  it('complete after both participants and moderator', async () => {
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
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-2_r0_moderator',
      parts: [{ text: 'Moderator summary', type: 'text' }],
      role: MessageRoles.ASSISTANT,
      roundNumber: 0,
      threadId: 'thread-2',
    });

    const result = await checkFreeUserHasCompletedRound('user-2');

    expect(result).toBe(true);
  });
});

describe('3 Participants Round', () => {
  it('not complete after 1st participant', async () => {
    setupSelectMock(
      [],
      [{ id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 }],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-3',
      userId: 'user-3',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
      { id: 'p3', isEnabled: true, modelId: 'model-3' },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-3');

    expect(result).toBe(false);
  });

  it('not complete after 2nd participant', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-3',
      userId: 'user-3',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
      { id: 'p3', isEnabled: true, modelId: 'model-3' },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-3');

    expect(result).toBe(false);
  });

  it('complete after all participants and moderator', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-3',
      userId: 'user-3',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
      { id: 'p3', isEnabled: true, modelId: 'model-3' },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-3_r0_moderator',
      parts: [{ text: 'Moderator summary', type: 'text' }],
      role: MessageRoles.ASSISTANT,
      roundNumber: 0,
      threadId: 'thread-3',
    });

    const result = await checkFreeUserHasCompletedRound('user-3');

    expect(result).toBe(true);
  });
});

describe('4 Participants Round', () => {
  it('not complete after 3 of 4 participants', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-4',
      userId: 'user-4',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
      { id: 'p3', isEnabled: true, modelId: 'model-3' },
      { id: 'p4', isEnabled: true, modelId: 'model-4' },
    ]);

    const result = await checkFreeUserHasCompletedRound('user-4');

    expect(result).toBe(false);
  });

  it('complete after all 4 participants and moderator', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-3', participantId: 'p3', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-4', participantId: 'p4', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-4',
      userId: 'user-4',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
      { id: 'p3', isEnabled: true, modelId: 'model-3' },
      { id: 'p4', isEnabled: true, modelId: 'model-4' },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-4_r0_moderator',
      parts: [{ text: 'Moderator summary', type: 'text' }],
      role: MessageRoles.ASSISTANT,
      roundNumber: 0,
      threadId: 'thread-4',
    });

    const result = await checkFreeUserHasCompletedRound('user-4');

    expect(result).toBe(true);
  });
});

describe('transaction marker', () => {
  it('returns true immediately when transaction exists', async () => {
    const freeRoundTransaction = {
      action: CreditActions.FREE_ROUND_COMPLETE,
      id: 'tx-complete',
      userId: 'user-tx',
    };

    // Mock db.select() for transaction check - returns existing transaction
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => withCache(Promise.resolve([freeRoundTransaction]))),
        }),
      }),
    });

    const result = await checkFreeUserHasCompletedRound('user-tx');

    expect(result).toBe(true);
    // Should only query once (transaction check) since transaction exists
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe('disabled participants', () => {
  it('ignores disabled participants', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-d',
      userId: 'user-d',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-d_r0_moderator',
      parts: [{ text: 'Summary', type: 'text' }],
    });

    const result = await checkFreeUserHasCompletedRound('user-d');

    expect(result).toBe(true);
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

  it('handles duplicate messages from same participant', async () => {
    setupSelectMock(
      [],
      [
        { id: 'msg-1a', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-1b', participantId: 'p1', role: MessageRoles.ASSISTANT, roundNumber: 0 },
        { id: 'msg-2', participantId: 'p2', role: MessageRoles.ASSISTANT, roundNumber: 0 },
      ],
    );

    mockDb.query.chatThread.findFirst.mockResolvedValue({
      id: 'thread-dup',
      userId: 'user-dup',
    });

    mockDb.query.chatParticipant.findMany.mockResolvedValue([
      { id: 'p1', isEnabled: true, modelId: 'model-1' },
      { id: 'p2', isEnabled: true, modelId: 'model-2' },
    ]);

    mockDb.query.chatMessage.findFirst.mockResolvedValue({
      id: 'thread-dup_r0_moderator',
      parts: [{ text: 'Summary', type: 'text' }],
    });

    const result = await checkFreeUserHasCompletedRound('user-dup');

    expect(result).toBe(true);
  });
});
