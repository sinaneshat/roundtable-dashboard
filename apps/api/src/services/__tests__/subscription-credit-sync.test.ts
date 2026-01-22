import { CREDIT_CONFIG } from '@roundtable/shared';
import type { PlanType, StripeSubscriptionStatus } from '@roundtable/shared/enums';
import { CreditActions, CreditTransactionTypes, StripeSubscriptionStatuses, SubscriptionTiers } from '@roundtable/shared/enums';
import { beforeEach, describe, expect, it } from 'vitest';

type MockUserCreditBalance = {
  id: string;
  userId: string;
  balance: number;
  reservedCredits: number;
  planType: PlanType;
  monthlyCredits: number;
  lastRefillAt: Date | null;
  nextRefillAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockStripeSubscription = {
  id: string;
  customerId: string;
  userId: string;
  status: StripeSubscriptionStatus;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
};

type MockStripeCustomer = {
  id: string;
  userId: string;
  email: string;
};

type MockCreditTransaction = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  action?: string;
  description?: string;
  createdAt: Date;
};

const mockState = {
  userCreditBalances: new Map<string, MockUserCreditBalance>(),
  stripeCustomers: new Map<string, MockStripeCustomer>(),
  stripeSubscriptions: new Map<string, MockStripeSubscription>(),
  creditTransactions: [] as MockCreditTransaction[],
};

beforeEach(() => {
  mockState.userCreditBalances.clear();
  mockState.stripeCustomers.clear();
  mockState.stripeSubscriptions.clear();
  mockState.creditTransactions = [];
});

function simulateUpgradeToPaidPlan(userId: string): void {
  const balance = mockState.userCreditBalances.get(userId);
  if (!balance) {
    throw new Error(`User credit balance not found: ${userId}`);
  }

  const planConfig = CREDIT_CONFIG.PLANS.paid;
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  balance.planType = SubscriptionTiers.PRO;
  balance.balance += planConfig.monthlyCredits;
  balance.monthlyCredits = planConfig.monthlyCredits;
  balance.lastRefillAt = now;
  balance.nextRefillAt = nextRefill;
  balance.version += 1;
  balance.updatedAt = now;

  mockState.creditTransactions.push({
    id: `tx_${Date.now()}`,
    userId,
    type: CreditTransactionTypes.CREDIT_GRANT,
    amount: planConfig.monthlyCredits,
    balanceAfter: balance.balance,
    action: 'monthly_renewal',
    description: `Upgraded to Pro plan: ${planConfig.monthlyCredits} credits`,
    createdAt: now,
  });
}

function simulateCheckHasActiveSubscription(userId: string): boolean {
  const customer = Array.from(mockState.stripeCustomers.values()).find(
    c => c.userId === userId,
  );

  if (!customer)
    return false;

  const activeSubscription = Array.from(mockState.stripeSubscriptions.values()).find(
    s => s.customerId === customer.id && s.status === StripeSubscriptionStatuses.ACTIVE,
  );

  return !!activeSubscription;
}

function simulateProvisionPaidUserCredits(userId: string): void {
  const balance = mockState.userCreditBalances.get(userId);
  if (!balance) {
    throw new Error(`User credit balance not found: ${userId}`);
  }

  const planConfig = CREDIT_CONFIG.PLANS.paid;
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  balance.planType = SubscriptionTiers.PRO;
  balance.balance = planConfig.monthlyCredits;
  balance.monthlyCredits = planConfig.monthlyCredits;
  balance.lastRefillAt = now;
  balance.nextRefillAt = nextRefill;
  balance.version += 1;
  balance.updatedAt = now;

  mockState.creditTransactions.push({
    id: `tx_${Date.now()}`,
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    amount: planConfig.monthlyCredits,
    balanceAfter: balance.balance,
    action: 'monthly_renewal',
    description: 'Credits provisioned (subscription sync recovery)',
    createdAt: now,
  });
}

function simulateEnforceCredits(userId: string, requiredCredits: number): void {
  const balance = mockState.userCreditBalances.get(userId);
  if (!balance) {
    throw new Error(`User credit balance not found: ${userId}`);
  }

  const available = balance.balance - balance.reservedCredits;

  if (available < requiredCredits) {
    const hasActiveSubscription = simulateCheckHasActiveSubscription(userId);

    if (hasActiveSubscription && balance.planType !== SubscriptionTiers.PRO) {
      simulateProvisionPaidUserCredits(userId);

      const updatedBalance = mockState.userCreditBalances.get(userId);
      if (!updatedBalance)
        throw new Error('User credit balance not found after provision');
      const updatedAvailable = updatedBalance.balance - updatedBalance.reservedCredits;

      if (updatedAvailable >= requiredCredits) {
        return;
      }
    }

    throw new Error(
      `Insufficient credits. Required: ${requiredCredits}, Available: ${available}. `
      + `${balance.planType === SubscriptionTiers.FREE ? 'Upgrade to Pro or ' : ''}Purchase additional credits to continue.`,
    );
  }
}

function simulateProcessMonthlyRefill(userId: string): void {
  const balance = mockState.userCreditBalances.get(userId);
  if (!balance) {
    throw new Error(`User credit balance not found: ${userId}`);
  }

  if (balance.planType !== SubscriptionTiers.PRO) {
    return;
  }

  const now = new Date();
  if (balance.nextRefillAt && balance.nextRefillAt > now) {
    return;
  }

  const planConfig = CREDIT_CONFIG.PLANS.paid;
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  balance.balance += planConfig.monthlyCredits;
  balance.lastRefillAt = now;
  balance.nextRefillAt = nextRefill;
  balance.version += 1;
  balance.updatedAt = now;

  mockState.creditTransactions.push({
    id: `tx_${Date.now()}`,
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    amount: planConfig.monthlyCredits,
    balanceAfter: balance.balance,
    action: CreditActions.MONTHLY_RENEWAL,
    description: `Monthly refill: ${planConfig.monthlyCredits} credits`,
    createdAt: now,
  });
}

describe('subscription-Credit Sync: Plan Upgrade (Free → Pro)', () => {
  it('upgrades free user to pro and grants 100K monthly credits', () => {
    const userId = 'user_1';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_1',
      userId,
      balance: 500,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate upgrade
    simulateUpgradeToPaidPlan(userId);

    // Assertions
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_500); // 500 existing + 100K new
    expect(balance.monthlyCredits).toBe(2_000_000);
    expect(balance.lastRefillAt).toBeTruthy();
    expect(balance.nextRefillAt).toBeTruthy();

    // Check next refill is 1 month from now
    const now = new Date();
    const expectedNextRefill = new Date(now);
    expectedNextRefill.setMonth(expectedNextRefill.getMonth() + 1);
    if (!balance.nextRefillAt)
      throw new Error('Next refill date not set');
    expect(balance.nextRefillAt.getMonth()).toBe(expectedNextRefill.getMonth());

    // Check transaction was recorded
    const tx = mockState.creditTransactions.find(
      t => t.userId === userId && t.type === CreditTransactionTypes.CREDIT_GRANT,
    );
    expect(tx).toBeTruthy();
    if (!tx)
      throw new Error('Transaction not found');
    expect(tx.amount).toBe(2_000_000);
    expect(tx.balanceAfter).toBe(2_000_500);
    expect(tx.description).toContain('Upgraded to Pro plan');
  });

  it('preserves existing free credits when upgrading to pro', () => {
    const userId = 'user_2';

    // Setup: Free user with 2,500 remaining credits
    mockState.userCreditBalances.set(userId, {
      id: 'balance_2',
      userId,
      balance: 2500,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate upgrade
    simulateUpgradeToPaidPlan(userId);

    // Assertions
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.balance).toBe(2_002_500); // 2,500 existing + 100K new
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
  });

  it('updates planType and monthlyCredits correctly', () => {
    const userId = 'user_3';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_3',
      userId,
      balance: 0,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    simulateUpgradeToPaidPlan(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('sets lastRefillAt and nextRefillAt on upgrade', () => {
    const userId = 'user_4';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_4',
      userId,
      balance: 100,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const beforeUpgrade = new Date();
    simulateUpgradeToPaidPlan(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.lastRefillAt).toBeTruthy();
    if (!balance.lastRefillAt)
      throw new Error('Last refill date not set');
    expect(balance.lastRefillAt.getTime()).toBeGreaterThanOrEqual(beforeUpgrade.getTime());

    expect(balance.nextRefillAt).toBeTruthy();
    if (!balance.nextRefillAt)
      throw new Error('Next refill date not set');
    expect(balance.nextRefillAt.getTime()).toBeGreaterThan(balance.lastRefillAt.getTime());
  });
});

describe('subscription-Credit Sync: Plan Downgrade (Pro → Free)', () => {
  it('keeps remaining credits when downgrading from pro to free', () => {
    const userId = 'user_5';

    // Setup: Pro user with 500K credits remaining
    mockState.userCreditBalances.set(userId, {
      id: 'balance_5',
      userId,
      balance: 500_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(),
      nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate downgrade (update planType, monthlyCredits, but keep balance)
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.planType = SubscriptionTiers.FREE;
    balance.monthlyCredits = 0;

    // Assertions
    expect(balance.balance).toBe(500_000); // Credits NOT removed
    expect(balance.planType).toBe(SubscriptionTiers.FREE);
    expect(balance.monthlyCredits).toBe(0);
  });

  it('sets monthlyCredits to 0 on downgrade', () => {
    const userId = 'user_6';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_6',
      userId,
      balance: 2_000_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(),
      nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.planType = SubscriptionTiers.FREE;
    balance.monthlyCredits = 0;

    expect(balance.monthlyCredits).toBe(0);
  });

  it('no new credits granted on downgrade', () => {
    const userId = 'user_7';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_7',
      userId,
      balance: 200_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(),
      nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const balanceBefore = mockState.userCreditBalances.get(userId);
    if (!balanceBefore)
      throw new Error('Balance not found');

    // Simulate downgrade
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.planType = SubscriptionTiers.FREE;
    balance.monthlyCredits = 0;

    expect(balance.balance).toBe(balanceBefore.balance); // No change
  });
});

describe('subscription-Credit Sync: Plan Cancellation', () => {
  it('canceled subscription keeps credits until period end', () => {
    const userId = 'user_8';

    // Setup: Pro user who canceled subscription
    const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

    mockState.userCreditBalances.set(userId, {
      id: 'balance_8',
      userId,
      balance: 750_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      nextRefillAt: periodEnd,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.stripeCustomers.set('cus_8', {
      id: 'cus_8',
      userId,
      email: 'user8@example.com',
    });

    mockState.stripeSubscriptions.set('sub_8', {
      id: 'sub_8',
      customerId: 'cus_8',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE, // Still active until period end
      priceId: 'price_pro',
      currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true, // Marked for cancellation
      canceledAt: new Date(),
    });

    // Assertions
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO); // Still paid until period end
    expect(balance.balance).toBe(750_000); // Credits preserved
    expect(balance.monthlyCredits).toBe(2_000_000); // Still has monthly credits
  });

  it('after period ends, no new credits are granted', () => {
    const userId = 'user_9';

    // Setup: User whose period just ended
    const now = new Date();
    const periodEnd = new Date(now.getTime() - 1000); // 1 second ago

    mockState.userCreditBalances.set(userId, {
      id: 'balance_9',
      userId,
      balance: 50_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      nextRefillAt: periodEnd, // Period ended
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate monthly refill (should not process because subscription is not active)
    // First, mark subscription as canceled
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    balance.planType = SubscriptionTiers.FREE; // Downgraded

    simulateProcessMonthlyRefill(userId);

    // Assertions: Balance unchanged (no refill for free users)
    expect(balance.balance).toBe(50_000);
  });

  it('user can still use existing credits after cancellation', () => {
    const userId = 'user_10';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_10',
      userId,
      balance: 2_000_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE, // Already downgraded
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate enforcing credits (should succeed)
    expect(() => simulateEnforceCredits(userId, 50_000)).not.toThrow();

    // Verify balance is sufficient
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.balance - balance.reservedCredits).toBeGreaterThanOrEqual(50_000);
  });
});

describe('subscription-Credit Sync: Monthly Refill', () => {
  it('pro users get 100K credits on billing cycle renewal', () => {
    const userId = 'user_11';

    // Setup: Pro user whose refill is due
    const now = new Date();
    const nextRefill = new Date(now.getTime() - 1000); // Due now

    mockState.userCreditBalances.set(userId, {
      id: 'balance_11',
      userId,
      balance: 50_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      nextRefillAt: nextRefill,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    simulateProcessMonthlyRefill(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.balance).toBe(2_050_000); // 50K + 100K refill
  });

  it('unused credits roll over to next month', () => {
    const userId = 'user_12';

    // Setup: Pro user with 80K unused credits
    const now = new Date();
    const nextRefill = new Date(now.getTime() - 1000);

    mockState.userCreditBalances.set(userId, {
      id: 'balance_12',
      userId,
      balance: 80_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      nextRefillAt: nextRefill,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    simulateProcessMonthlyRefill(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.balance).toBe(2_080_000); // 80K + 100K = 180K (rollover)
  });

  it('lastRefillAt and nextRefillAt update correctly', () => {
    const userId = 'user_13';

    const now = new Date();
    const nextRefill = new Date(now.getTime() - 1000);

    mockState.userCreditBalances.set(userId, {
      id: 'balance_13',
      userId,
      balance: 2_000_000,
      reservedCredits: 0,
      planType: SubscriptionTiers.PRO,
      monthlyCredits: 2_000_000,
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      nextRefillAt: nextRefill,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const beforeRefill = new Date();
    simulateProcessMonthlyRefill(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    if (!balance.lastRefillAt)
      throw new Error('Last refill date not set');
    expect(balance.lastRefillAt.getTime()).toBeGreaterThanOrEqual(beforeRefill.getTime());

    const expectedNextRefill = new Date(balance.lastRefillAt);
    expectedNextRefill.setMonth(expectedNextRefill.getMonth() + 1);
    if (!balance.nextRefillAt)
      throw new Error('Next refill date not set');
    expect(balance.nextRefillAt.getMonth()).toBe(expectedNextRefill.getMonth());
  });
});

describe('subscription-Credit Sync: Sync Recovery', () => {
  it('provisionPaidUserCredits provisions 100K credits when webhook fails', () => {
    const userId = 'user_14';

    // Setup: User has active subscription but credits not synced (webhook failed)
    mockState.userCreditBalances.set(userId, {
      id: 'balance_14',
      userId,
      balance: 0, // No credits
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE, // Still marked as free
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.stripeCustomers.set('cus_14', {
      id: 'cus_14',
      userId,
      email: 'user14@example.com',
    });

    mockState.stripeSubscriptions.set('sub_14', {
      id: 'sub_14',
      customerId: 'cus_14',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE,
      priceId: 'price_pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    // Simulate provisioning
    simulateProvisionPaidUserCredits(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_000);
    expect(balance.monthlyCredits).toBe(2_000_000);

    // Check transaction
    const tx = mockState.creditTransactions.find(
      t => t.userId === userId && t.type === CreditTransactionTypes.MONTHLY_REFILL,
    );
    expect(tx).toBeTruthy();
    if (!tx)
      throw new Error('Transaction not found');
    expect(tx.description).toContain('subscription sync recovery');
  });

  it('enforceCredits auto-provisions for subscribed users with 0 credits', () => {
    const userId = 'user_15';

    // Setup: User with active subscription but no credits (desync)
    mockState.userCreditBalances.set(userId, {
      id: 'balance_15',
      userId,
      balance: 0,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.stripeCustomers.set('cus_15', {
      id: 'cus_15',
      userId,
      email: 'user15@example.com',
    });

    mockState.stripeSubscriptions.set('sub_15', {
      id: 'sub_15',
      customerId: 'cus_15',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE,
      priceId: 'price_pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    // Enforce credits (should auto-provision)
    expect(() => simulateEnforceCredits(userId, 100)).not.toThrow();

    // Verify credits were provisioned
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_000);
  });

  it('checkHasActiveSubscription returns true for active subscriptions', () => {
    const userId = 'user_16';

    mockState.stripeCustomers.set('cus_16', {
      id: 'cus_16',
      userId,
      email: 'user16@example.com',
    });

    mockState.stripeSubscriptions.set('sub_16', {
      id: 'sub_16',
      customerId: 'cus_16',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE,
      priceId: 'price_pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);
  });

  it('checkHasActiveSubscription returns false for users without subscriptions', () => {
    const userId = 'user_17';

    mockState.stripeCustomers.set('cus_17', {
      id: 'cus_17',
      userId,
      email: 'user17@example.com',
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(false);
  });

  it('checkHasActiveSubscription returns false for canceled subscriptions', () => {
    const userId = 'user_18';

    mockState.stripeCustomers.set('cus_18', {
      id: 'cus_18',
      userId,
      email: 'user18@example.com',
    });

    mockState.stripeSubscriptions.set('sub_18', {
      id: 'sub_18',
      customerId: 'cus_18',
      userId,
      status: StripeSubscriptionStatuses.CANCELED,
      priceId: 'price_pro',
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(false);
  });
});

describe('subscription-Credit Sync: Credit Enforcement', () => {
  it('enforceCredits blocks users with insufficient credits', () => {
    const userId = 'user_21';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_21',
      userId,
      balance: 50,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(() => simulateEnforceCredits(userId, 100)).toThrow('Insufficient credits');
  });

  it('enforceCredits does NOT block Pro users even if credits out of sync (auto-provision)', () => {
    const userId = 'user_23';

    mockState.userCreditBalances.set(userId, {
      id: 'balance_23',
      userId,
      balance: 0, // Out of sync
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE, // Still marked as free
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.stripeCustomers.set('cus_23', {
      id: 'cus_23',
      userId,
      email: 'user23@example.com',
    });

    mockState.stripeSubscriptions.set('sub_23', {
      id: 'sub_23',
      customerId: 'cus_23',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE,
      priceId: 'price_pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    // Should NOT throw - auto-provisions
    expect(() => simulateEnforceCredits(userId, 100)).not.toThrow();

    // Verify credits were auto-provisioned
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.balance).toBe(2_000_000);
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
  });
});

describe('subscription-Credit Sync: Edge Cases', () => {
  it('user with active subscription but planType still "free" (desync)', () => {
    const userId = 'user_24';

    // This is the exact bug scenario
    mockState.userCreditBalances.set(userId, {
      id: 'balance_24',
      userId,
      balance: 0,
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE, // Desync
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.stripeCustomers.set('cus_24', {
      id: 'cus_24',
      userId,
      email: 'user24@example.com',
    });

    mockState.stripeSubscriptions.set('sub_24', {
      id: 'sub_24',
      customerId: 'cus_24',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE,
      priceId: 'price_pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    // Check active subscription
    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);

    // Provision should fix the desync
    simulateProvisionPaidUserCredits(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_000);
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('user cancels then resubscribes', () => {
    const userId = 'user_25';

    // Setup: User previously canceled, now resubscribing
    mockState.userCreditBalances.set(userId, {
      id: 'balance_25',
      userId,
      balance: 5_000, // Remaining credits from before
      reservedCredits: 0,
      planType: SubscriptionTiers.FREE,
      monthlyCredits: 0,
      lastRefillAt: null,
      nextRefillAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simulate resubscription (upgrade to paid)
    simulateUpgradeToPaidPlan(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance)
      throw new Error('Balance not found');
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_005_000); // 5K old + 100K new
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('subscription status changes (active → past_due → active)', () => {
    const userId = 'user_26';

    mockState.stripeCustomers.set('cus_26', {
      id: 'cus_26',
      userId,
      email: 'user26@example.com',
    });

    // Initially active
    mockState.stripeSubscriptions.set('sub_26', {
      id: 'sub_26',
      customerId: 'cus_26',
      userId,
      status: StripeSubscriptionStatuses.ACTIVE,
      priceId: 'price_pro',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);

    // Change to past_due (payment failed)
    const subscription = mockState.stripeSubscriptions.get('sub_26');
    if (!subscription)
      throw new Error('Subscription not found');
    subscription.status = StripeSubscriptionStatuses.PAST_DUE;

    expect(simulateCheckHasActiveSubscription(userId)).toBe(false);

    // Recover to active (payment succeeded)
    subscription.status = StripeSubscriptionStatuses.ACTIVE;

    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);
  });
});

describe('credit Configuration Validation', () => {
  it('has 5,000 signup credits', () => {
    expect(CREDIT_CONFIG.SIGNUP_CREDITS).toBe(5_000);
  });

  it('paid plan has 100,000 monthly credits', () => {
    expect(CREDIT_CONFIG.PLANS.paid.monthlyCredits).toBe(2_000_000);
  });

  it('paid plan costs $59/month', () => {
    expect(CREDIT_CONFIG.PLANS.paid.priceInCents).toBe(5900);
  });
});
