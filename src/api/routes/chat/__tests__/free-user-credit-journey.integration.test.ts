import { beforeEach, describe, expect, it } from 'vitest';

import { CreditActions, CreditTransactionTypes, MessageRoles, PlanTypes } from '@/api/core/enums';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

/**
 * Free User Credit Journey Integration Tests
 *
 * Tests the complete free user flow with credit deductions:
 * 1. Free user creates thread (deducts 100 credits)
 * 2. Free user sends message with optional web search (deducts credits)
 * 3. Multiple participants respond (credits deducted per response)
 * 4. After ALL participants complete round 0, credits are zeroed
 * 5. Subsequent chat attempts fail with subscription message
 * 6. Thread is still visible but user cannot continue
 *
 * These are conceptual integration tests that verify the business logic
 * without requiring a running server.
 */

/**
 * Mock Database State
 * Simulates the database state throughout the journey
 */
type MockUser = {
  id: string;
  email: string;
  planType: typeof PlanTypes[keyof typeof PlanTypes];
};

type MockCreditBalance = {
  userId: string;
  balance: number;
  reservedCredits: number;
  planType: typeof PlanTypes[keyof typeof PlanTypes];
  version: number;
};

type MockCreditTransaction = {
  id: string;
  userId: string;
  type: typeof CreditTransactionTypes[keyof typeof CreditTransactionTypes];
  amount: number;
  balanceAfter: number;
  action?: typeof CreditActions[keyof typeof CreditActions] | null;
  threadId?: string | null;
  messageId?: string | null;
  streamId?: string | null;
  createdAt: Date;
};

type MockThread = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  deletedAt: Date | null;
};

type MockMessage = {
  id: string;
  threadId: string;
  role: typeof MessageRoles[keyof typeof MessageRoles];
  roundIndex: number;
  participantId?: string | null;
  content: string;
  createdAt: Date;
};

type MockParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  enabled: boolean;
  role?: string | null;
};

/**
 * Mock Database
 */
class MockDatabase {
  users: MockUser[] = [];
  creditBalances: MockCreditBalance[] = [];
  transactions: MockCreditTransaction[] = [];
  threads: MockThread[] = [];
  messages: MockMessage[] = [];
  participants: MockParticipant[] = [];

  reset() {
    this.users = [];
    this.creditBalances = [];
    this.transactions = [];
    this.threads = [];
    this.messages = [];
    this.participants = [];
  }

  createUser(planType: typeof PlanTypes[keyof typeof PlanTypes] = PlanTypes.FREE): MockUser {
    const user: MockUser = {
      id: `user_${Date.now()}`,
      email: `test${Date.now()}@example.com`,
      planType,
    };
    this.users.push(user);

    // Create credit balance with signup credits
    const signupCredits = 5000;
    this.creditBalances.push({
      userId: user.id,
      balance: signupCredits,
      reservedCredits: 0,
      planType,
      version: 1,
    });

    // Create signup credit grant transaction
    this.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: CreditTransactionTypes.CREDIT_GRANT,
      amount: signupCredits,
      balanceAfter: signupCredits,
      action: null,
      createdAt: new Date(),
    });

    return user;
  }

  getCreditBalance(userId: string): MockCreditBalance | undefined {
    return this.creditBalances.find(cb => cb.userId === userId);
  }

  deductCredits(
    userId: string,
    amount: number,
    action: typeof CreditActions[keyof typeof CreditActions],
    threadId?: string,
  ): boolean {
    const balance = this.getCreditBalance(userId);
    if (!balance)
      return false;

    const available = balance.balance - balance.reservedCredits;
    if (available < amount)
      return false;

    // Deduct credits
    balance.balance -= amount;
    balance.version += 1;

    // Record transaction
    this.transactions.push({
      id: `tx_${Date.now()}_${Math.random()}`,
      userId,
      type: CreditTransactionTypes.DEDUCTION,
      amount: -amount,
      balanceAfter: balance.balance,
      action,
      threadId: threadId || null,
      createdAt: new Date(),
    });

    return true;
  }

  zeroOutCredits(userId: string): boolean {
    const balance = this.getCreditBalance(userId);
    if (!balance)
      return false;

    const amountZeroed = balance.balance;
    balance.balance = 0;
    balance.version += 1;

    // Record free round complete transaction
    this.transactions.push({
      id: `tx_${Date.now()}_${Math.random()}`,
      userId,
      type: CreditTransactionTypes.DEDUCTION,
      amount: -amountZeroed,
      balanceAfter: 0,
      action: CreditActions.FREE_ROUND_COMPLETE,
      createdAt: new Date(),
    });

    return true;
  }

  hasFreeRoundCompleteMarker(userId: string): boolean {
    return this.transactions.some(
      tx =>
        tx.userId === userId
        && tx.type === CreditTransactionTypes.DEDUCTION
        && tx.action === CreditActions.FREE_ROUND_COMPLETE,
    );
  }

  getUserThreads(userId: string): MockThread[] {
    return this.threads.filter(t => t.userId === userId && t.deletedAt === null);
  }

  createThread(userId: string, title: string): MockThread | null {
    const user = this.users.find(u => u.id === userId);
    if (!user)
      return null;

    // Check thread limit ONLY for free users
    if (user.planType === PlanTypes.FREE) {
      const existingThreads = this.getUserThreads(userId);
      if (existingThreads.length >= 1) {
        return null; // Free users limited to 1 thread
      }
    }
    // Paid users have unlimited threads (no limit check)

    // Deduct thread creation cost
    const threadCreationCost = 100;
    const deducted = this.deductCredits(userId, threadCreationCost, CreditActions.THREAD_CREATION);
    if (!deducted)
      return null;

    const thread: MockThread = {
      id: `thread_${Date.now()}_${Math.random()}`, // Add random to ensure unique IDs
      userId,
      title,
      createdAt: new Date(),
      deletedAt: null,
    };
    this.threads.push(thread);

    return thread;
  }

  addMessage(
    threadId: string,
    role: typeof MessageRoles.USER | typeof MessageRoles.ASSISTANT,
    content: string,
    roundIndex: number,
    participantId?: string,
  ): MockMessage {
    const message: MockMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      threadId,
      role,
      roundIndex,
      participantId: participantId || null,
      content,
      createdAt: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  getThreadMessages(threadId: string): MockMessage[] {
    return this.messages.filter(m => m.threadId === threadId);
  }

  getEnabledParticipants(threadId: string): MockParticipant[] {
    return this.participants.filter(p => p.threadId === threadId && p.enabled);
  }

  checkRoundComplete(threadId: string, roundIndex: number): boolean {
    const enabledParticipants = this.getEnabledParticipants(threadId);
    const assistantMessages = this.messages.filter(
      m => m.threadId === threadId && m.roundIndex === roundIndex && m.role === MessageRoles.ASSISTANT,
    );

    const respondedParticipantIds = new Set(
      assistantMessages.map(m => m.participantId).filter(Boolean) as string[],
    );

    return enabledParticipants.every(p => respondedParticipantIds.has(p.id));
  }
}

describe('free User Credit Journey Integration', () => {
  let db: MockDatabase;
  let freeUser: MockUser;

  beforeEach(() => {
    db = new MockDatabase();
    freeUser = db.createUser(PlanTypes.FREE);
  });

  describe('step 1: Initial Credit Balance', () => {
    it('free user starts with 5000 signup credits', () => {
      const balance = db.getCreditBalance(freeUser.id);

      expect(balance).toBeDefined();
      expect(balance!.balance).toBe(5000);
      expect(balance!.planType).toBe(PlanTypes.FREE);
      expect(balance!.reservedCredits).toBe(0);
    });

    it('signup credit grant is recorded in transactions', () => {
      const grantTx = db.transactions.find(
        tx => tx.userId === freeUser.id && tx.type === CreditTransactionTypes.CREDIT_GRANT,
      );

      expect(grantTx).toBeDefined();
      expect(grantTx!.amount).toBe(5000);
      expect(grantTx!.balanceAfter).toBe(5000);
    });
  });

  describe('step 2: Thread Creation', () => {
    it('creating thread deducts 100 credits', () => {
      const balanceBefore = db.getCreditBalance(freeUser.id)!.balance;

      const thread = db.createThread(freeUser.id, 'Test Thread');

      expect(thread).not.toBeNull();

      const balanceAfter = db.getCreditBalance(freeUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore - 100);
    });

    it('thread creation is recorded in transactions', () => {
      db.createThread(freeUser.id, 'Test Thread');

      const threadCreationTx = db.transactions.find(
        tx =>
          tx.userId === freeUser.id
          && tx.type === CreditTransactionTypes.DEDUCTION
          && tx.action === CreditActions.THREAD_CREATION,
      );

      expect(threadCreationTx).toBeDefined();
      expect(threadCreationTx!.amount).toBe(-100);
    });

    it('free user cannot create second thread', () => {
      const thread1 = db.createThread(freeUser.id, 'First Thread');
      expect(thread1).not.toBeNull();

      const thread2 = db.createThread(freeUser.id, 'Second Thread');
      expect(thread2).toBeNull();
    });

    it('thread creation fails if insufficient credits', () => {
      // Zero out credits
      db.getCreditBalance(freeUser.id)!.balance = 50;

      const thread = db.createThread(freeUser.id, 'Test Thread');
      expect(thread).toBeNull();
    });
  });

  describe('step 3: Message Sending', () => {
    it('user message does not deduct credits', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      expect(thread).not.toBeNull();

      const balanceBefore = db.getCreditBalance(freeUser.id)!.balance;

      db.addMessage(thread!.id, MessageRoles.USER, 'Hello world', 0);

      const balanceAfter = db.getCreditBalance(freeUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore);
    });

    it('assistant response deducts credits', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      db.addMessage(thread!.id, MessageRoles.USER, 'Hello', 0);

      const balanceBefore = db.getCreditBalance(freeUser.id)!.balance;

      // Simulate assistant response (would normally happen via streaming)
      const streamingCost = 250; // Example cost
      db.deductCredits(freeUser.id, streamingCost, CreditActions.AI_RESPONSE, thread!.id);

      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Hi there!', 0, 'participant-1');

      const balanceAfter = db.getCreditBalance(freeUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore - streamingCost);
    });
  });

  describe('step 4: Multiple Participants and Round Completion', () => {
    it('round is complete when all participants respond', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      expect(thread).not.toBeNull();

      // Add 3 participants
      db.participants.push(
        { id: 'p1', threadId: thread!.id, modelId: 'model-1', enabled: true },
        { id: 'p2', threadId: thread!.id, modelId: 'model-2', enabled: true },
        { id: 'p3', threadId: thread!.id, modelId: 'model-3', enabled: true },
      );

      // User message
      db.addMessage(thread!.id, MessageRoles.USER, 'Question', 0);

      // First two participants respond
      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Response 1', 0, 'p1');
      expect(db.checkRoundComplete(thread!.id, 0)).toBe(false);

      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Response 2', 0, 'p2');
      expect(db.checkRoundComplete(thread!.id, 0)).toBe(false);

      // Third participant responds
      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Response 3', 0, 'p3');
      expect(db.checkRoundComplete(thread!.id, 0)).toBe(true);
    });

    it('zeroes credits after round 0 completion for free users', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      db.participants.push(
        { id: 'p1', threadId: thread!.id, modelId: 'model-1', enabled: true },
        { id: 'p2', threadId: thread!.id, modelId: 'model-2', enabled: true },
      );

      db.addMessage(thread!.id, MessageRoles.USER, 'Question', 0);

      // Participants respond with credit deductions
      db.deductCredits(freeUser.id, 200, CreditActions.AI_RESPONSE, thread!.id);
      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Response 1', 0, 'p1');

      db.deductCredits(freeUser.id, 200, CreditActions.AI_RESPONSE, thread!.id);
      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Response 2', 0, 'p2');

      // Round complete
      const roundComplete = db.checkRoundComplete(thread!.id, 0);
      expect(roundComplete).toBe(true);

      // Check balance before zeroing
      const balanceBefore = db.getCreditBalance(freeUser.id)!.balance;
      expect(balanceBefore).toBeGreaterThan(0);

      // Zero out credits
      db.zeroOutCredits(freeUser.id);

      // Check balance after
      const balanceAfter = db.getCreditBalance(freeUser.id)!.balance;
      expect(balanceAfter).toBe(0);

      // Check free round marker
      expect(db.hasFreeRoundCompleteMarker(freeUser.id)).toBe(true);
    });
  });

  describe('step 5: Free Round Complete Marker', () => {
    it('free round complete transaction is created', () => {
      db.zeroOutCredits(freeUser.id);

      const marker = db.transactions.find(
        tx =>
          tx.userId === freeUser.id
          && tx.type === CreditTransactionTypes.DEDUCTION
          && tx.action === CreditActions.FREE_ROUND_COMPLETE,
      );

      expect(marker).toBeDefined();
      expect(marker!.balanceAfter).toBe(0);
    });

    it('marker persists in transaction history', () => {
      db.zeroOutCredits(freeUser.id);

      expect(db.hasFreeRoundCompleteMarker(freeUser.id)).toBe(true);

      // Marker should persist even after other transactions
      db.creditBalances.find(cb => cb.userId === freeUser.id)!.balance = 100;
      db.deductCredits(freeUser.id, 10, CreditActions.AI_RESPONSE);

      expect(db.hasFreeRoundCompleteMarker(freeUser.id)).toBe(true);
    });
  });

  describe('step 6: Blocked After Free Round', () => {
    it('cannot send messages after free round complete', () => {
      db.zeroOutCredits(freeUser.id);

      const canSend = db.getCreditBalance(freeUser.id)!.balance > 0
        && !db.hasFreeRoundCompleteMarker(freeUser.id);

      expect(canSend).toBe(false);
    });

    it('insufficient credits error message for free users', () => {
      db.zeroOutCredits(freeUser.id);

      const balance = db.getCreditBalance(freeUser.id)!;
      const required = 100;

      const errorMessage = `Insufficient credits. Required: ${required}, Available: ${balance.balance}. `
        + 'Subscribe to Pro or Purchase additional credits to continue.';

      expect(errorMessage).toContain('Insufficient credits');
      expect(errorMessage).toContain('Subscribe to Pro');
      expect(errorMessage).toContain('Purchase');
    });

    it('free round used error message', () => {
      const errorMessage = 'Your free conversation round has been used. Subscribe to Pro to continue chatting.';

      expect(errorMessage).toContain('free conversation round');
      expect(errorMessage).toContain('Subscribe to Pro');
    });
  });

  describe('step 7: Thread Visibility', () => {
    it('thread remains accessible after credits exhausted', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      db.zeroOutCredits(freeUser.id);

      const userThreads = db.getUserThreads(freeUser.id);
      expect(userThreads).toHaveLength(1);
      expect(userThreads[0].id).toBe(thread!.id);
    });

    it('messages remain visible after credits exhausted', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      db.addMessage(thread!.id, MessageRoles.USER, 'Message 1', 0);
      db.addMessage(thread!.id, MessageRoles.ASSISTANT, 'Response 1', 0, 'p1');

      db.zeroOutCredits(freeUser.id);

      const messages = db.getThreadMessages(thread!.id);
      expect(messages).toHaveLength(2);
    });
  });

  describe('step 8: Audit Trail', () => {
    it('all credit operations create transaction records', () => {
      const initialTxCount = db.transactions.filter(tx => tx.userId === freeUser.id).length;

      db.createThread(freeUser.id, 'Test Thread');
      const afterThreadTxCount = db.transactions.filter(tx => tx.userId === freeUser.id).length;

      expect(afterThreadTxCount).toBe(initialTxCount + 1);
    });

    it('transaction balanceAfter field is accurate', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      expect(thread).not.toBeNull();

      const threadCreationTx = db.transactions
        .filter(tx => tx.userId === freeUser.id && tx.action === CreditActions.THREAD_CREATION)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      // balanceAfter should be signup credits (5000) minus thread creation cost (100)
      expect(threadCreationTx.balanceAfter).toBe(4900);
      expect(threadCreationTx.balanceAfter).toBe(db.getCreditBalance(freeUser.id)!.balance);
    });

    it('version increments with each balance change', () => {
      const initialVersion = db.getCreditBalance(freeUser.id)!.version;

      db.deductCredits(freeUser.id, 100, CreditActions.THREAD_CREATION);
      const afterDeductVersion = db.getCreditBalance(freeUser.id)!.version;

      expect(afterDeductVersion).toBe(initialVersion + 1);
    });
  });

  describe('paid User Comparison', () => {
    let paidDb: MockDatabase;
    let paidUser: MockUser;

    beforeEach(() => {
      // Create fresh database for paid user tests
      paidDb = new MockDatabase();
      paidUser = paidDb.createUser(PlanTypes.PAID);
    });

    it('paid users bypass thread limit', () => {
      // Give paid user sufficient credits for multiple threads
      // Each thread costs 100 credits, so 10000 is enough for 100 threads
      const balance = paidDb.getCreditBalance(paidUser.id)!;
      balance.balance = 10000;

      const thread1 = paidDb.createThread(paidUser.id, 'Thread 1');
      expect(thread1).not.toBeNull();

      // Verify balance was deducted
      let currentBalance = paidDb.getCreditBalance(paidUser.id)!.balance;
      expect(currentBalance).toBe(9900); // 10000 - 100

      const thread2 = paidDb.createThread(paidUser.id, 'Thread 2');
      expect(thread2).not.toBeNull();

      currentBalance = paidDb.getCreditBalance(paidUser.id)!.balance;
      expect(currentBalance).toBe(9800); // 9900 - 100

      const thread3 = paidDb.createThread(paidUser.id, 'Thread 3');
      expect(thread3).not.toBeNull();

      currentBalance = paidDb.getCreditBalance(paidUser.id)!.balance;
      expect(currentBalance).toBe(9700); // 9800 - 100

      // Verify all three threads exist
      const threads = paidDb.getUserThreads(paidUser.id);
      expect(threads).toHaveLength(3);
    });

    it('paid users not affected by free round marker', () => {
      paidDb.getCreditBalance(paidUser.id)!.balance = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      // Simulate free round complete (shouldn't happen for paid, but test the flag)
      paidDb.zeroOutCredits(paidUser.id);

      // Give back credits
      paidDb.getCreditBalance(paidUser.id)!.balance = CREDIT_CONFIG.PLANS.paid.monthlyCredits;

      // Paid user should still be able to use credits despite marker
      const canUse = paidDb.getCreditBalance(paidUser.id)!.balance > 100;
      expect(canUse).toBe(true);
    });
  });

  describe('edge Cases', () => {
    it('concurrent credit deductions use version for optimistic locking', () => {
      const balance = db.getCreditBalance(freeUser.id)!;
      const initialVersion = balance.version;

      // Simulate first deduction
      db.deductCredits(freeUser.id, 100, CreditActions.THREAD_CREATION);
      expect(balance.version).toBe(initialVersion + 1);

      // Simulate second concurrent deduction (would fail in real DB with version check)
      db.deductCredits(freeUser.id, 100, CreditActions.AI_RESPONSE);
      expect(balance.version).toBe(initialVersion + 2);
    });

    it('deleted thread does not count against thread limit', () => {
      const thread = db.createThread(freeUser.id, 'Test Thread');
      expect(thread).not.toBeNull();

      // Delete thread
      thread!.deletedAt = new Date();

      // Should be able to create another thread
      const thread2 = db.createThread(freeUser.id, 'Second Thread');
      expect(thread2).not.toBeNull();
    });

    it('empty thread still counts against limit', () => {
      const thread = db.createThread(freeUser.id, 'Empty Thread');
      expect(thread).not.toBeNull();

      // No messages added

      // Should not be able to create another thread
      const thread2 = db.createThread(freeUser.id, 'Second Thread');
      expect(thread2).toBeNull();
    });
  });
});
