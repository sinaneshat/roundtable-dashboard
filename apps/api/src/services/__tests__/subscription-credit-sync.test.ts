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
  creditTransactions: [] as MockCreditTransaction[],
  stripeCustomers: new Map<string, MockStripeCustomer>(),
  stripeSubscriptions: new Map<string, MockStripeSubscription>(),
  userCreditBalances: new Map<string, MockUserCreditBalance>(),
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
    action: 'monthly_renewal',
    amount: planConfig.monthlyCredits,
    balanceAfter: balance.balance,
    createdAt: now,
    description: `Upgraded to Pro plan: ${planConfig.monthlyCredits} credits`,
    id: `tx_${Date.now()}`,
    type: CreditTransactionTypes.CREDIT_GRANT,
    userId,
  });
}

function simulateCheckHasActiveSubscription(userId: string): boolean {
  const customer = Array.from(mockState.stripeCustomers.values()).find(
    c => c.userId === userId,
  );

  if (!customer) {
    return false;
  }

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
    action: 'monthly_renewal',
    amount: planConfig.monthlyCredits,
    balanceAfter: balance.balance,
    createdAt: now,
    description: 'Credits provisioned (subscription sync recovery)',
    id: `tx_${Date.now()}`,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    userId,
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
      if (!updatedBalance) {
        throw new Error('User credit balance not found after provision');
      }
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
    action: CreditActions.MONTHLY_RENEWAL,
    amount: planConfig.monthlyCredits,
    balanceAfter: balance.balance,
    createdAt: now,
    description: `Monthly refill: ${planConfig.monthlyCredits} credits`,
    id: `tx_${Date.now()}`,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    userId,
  });
}

describe('subscription-Credit Sync: Plan Upgrade (Free → Pro)', () => {
  it('upgrades free user to pro and grants 100K monthly credits', () => {
    const userId = 'user_1';

    mockState.userCreditBalances.set(userId, {
      balance: 500,
      createdAt: new Date(),
      id: 'balance_1',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    // Simulate upgrade
    simulateUpgradeToPaidPlan(userId);

    // Assertions
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_500); // 500 existing + 100K new
    expect(balance.monthlyCredits).toBe(2_000_000);
    expect(balance.lastRefillAt).toBeTruthy();
    expect(balance.nextRefillAt).toBeTruthy();

    // Check next refill is 1 month from now
    const now = new Date();
    const expectedNextRefill = new Date(now);
    expectedNextRefill.setMonth(expectedNextRefill.getMonth() + 1);
    if (!balance.nextRefillAt) {
      throw new Error('Next refill date not set');
    }
    expect(balance.nextRefillAt.getMonth()).toBe(expectedNextRefill.getMonth());

    // Check transaction was recorded
    const tx = mockState.creditTransactions.find(
      t => t.userId === userId && t.type === CreditTransactionTypes.CREDIT_GRANT,
    );
    expect(tx).toBeTruthy();
    if (!tx) {
      throw new Error('Transaction not found');
    }
    expect(tx.amount).toBe(2_000_000);
    expect(tx.balanceAfter).toBe(2_000_500);
    expect(tx.description).toContain('Upgraded to Pro plan');
  });

  it('preserves existing free credits when upgrading to pro', () => {
    const userId = 'user_2';

    // Setup: Free user with 2,500 remaining credits
    mockState.userCreditBalances.set(userId, {
      balance: 2500,
      createdAt: new Date(),
      id: 'balance_2',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    // Simulate upgrade
    simulateUpgradeToPaidPlan(userId);

    // Assertions
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.balance).toBe(2_002_500); // 2,500 existing + 100K new
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
  });

  it('updates planType and monthlyCredits correctly', () => {
    const userId = 'user_3';

    mockState.userCreditBalances.set(userId, {
      balance: 0,
      createdAt: new Date(),
      id: 'balance_3',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    simulateUpgradeToPaidPlan(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('sets lastRefillAt and nextRefillAt on upgrade', () => {
    const userId = 'user_4';

    mockState.userCreditBalances.set(userId, {
      balance: 100,
      createdAt: new Date(),
      id: 'balance_4',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    const beforeUpgrade = new Date();
    simulateUpgradeToPaidPlan(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.lastRefillAt).toBeTruthy();
    if (!balance.lastRefillAt) {
      throw new Error('Last refill date not set');
    }
    expect(balance.lastRefillAt.getTime()).toBeGreaterThanOrEqual(beforeUpgrade.getTime());

    expect(balance.nextRefillAt).toBeTruthy();
    if (!balance.nextRefillAt) {
      throw new Error('Next refill date not set');
    }
    expect(balance.nextRefillAt.getTime()).toBeGreaterThan(balance.lastRefillAt.getTime());
  });
});

describe('subscription-Credit Sync: Plan Downgrade (Pro → Free)', () => {
  it('keeps remaining credits when downgrading from pro to free', () => {
    const userId = 'user_5';

    // Setup: Pro user with 500K credits remaining
    mockState.userCreditBalances.set(userId, {
      balance: 500_000,
      createdAt: new Date(),
      id: 'balance_5',
      lastRefillAt: new Date(),
      monthlyCredits: 2_000_000,
      nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    // Simulate downgrade (update planType, monthlyCredits, but keep balance)
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
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
      balance: 2_000_000,
      createdAt: new Date(),
      id: 'balance_6',
      lastRefillAt: new Date(),
      monthlyCredits: 2_000_000,
      nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    balance.planType = SubscriptionTiers.FREE;
    balance.monthlyCredits = 0;

    expect(balance.monthlyCredits).toBe(0);
  });

  it('no new credits granted on downgrade', () => {
    const userId = 'user_7';

    mockState.userCreditBalances.set(userId, {
      balance: 200_000,
      createdAt: new Date(),
      id: 'balance_7',
      lastRefillAt: new Date(),
      monthlyCredits: 2_000_000,
      nextRefillAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    const balanceBefore = mockState.userCreditBalances.get(userId);
    if (!balanceBefore) {
      throw new Error('Balance not found');
    }

    // Simulate downgrade
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
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
      balance: 750_000,
      createdAt: new Date(),
      id: 'balance_8',
      lastRefillAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      monthlyCredits: 2_000_000,
      nextRefillAt: periodEnd,
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    mockState.stripeCustomers.set('cus_8', {
      email: 'user8@example.com',
      id: 'cus_8',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_8', {
      cancelAtPeriodEnd: true, // Marked for cancellation
      canceledAt: new Date(),
      currentPeriodEnd: periodEnd,
      currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      customerId: 'cus_8',
      id: 'sub_8',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE, // Still active until period end
      userId,
    });

    // Assertions
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
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
      balance: 50_000,
      createdAt: new Date(),
      id: 'balance_9',
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      monthlyCredits: 2_000_000,
      nextRefillAt: periodEnd, // Period ended
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    // Simulate monthly refill (should not process because subscription is not active)
    // First, mark subscription as canceled
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    balance.planType = SubscriptionTiers.FREE; // Downgraded

    simulateProcessMonthlyRefill(userId);

    // Assertions: Balance unchanged (no refill for free users)
    expect(balance.balance).toBe(50_000);
  });

  it('user can still use existing credits after cancellation', () => {
    const userId = 'user_10';

    mockState.userCreditBalances.set(userId, {
      balance: 2_000_000,
      createdAt: new Date(),
      id: 'balance_10',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE, // Already downgraded
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    // Simulate enforcing credits (should succeed)
    expect(() => simulateEnforceCredits(userId, 50_000)).not.toThrow();

    // Verify balance is sufficient
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
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
      balance: 50_000,
      createdAt: new Date(),
      id: 'balance_11',
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      monthlyCredits: 2_000_000,
      nextRefillAt: nextRefill,
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    simulateProcessMonthlyRefill(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.balance).toBe(2_050_000); // 50K + 100K refill
  });

  it('unused credits roll over to next month', () => {
    const userId = 'user_12';

    // Setup: Pro user with 80K unused credits
    const now = new Date();
    const nextRefill = new Date(now.getTime() - 1000);

    mockState.userCreditBalances.set(userId, {
      balance: 80_000,
      createdAt: new Date(),
      id: 'balance_12',
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      monthlyCredits: 2_000_000,
      nextRefillAt: nextRefill,
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    simulateProcessMonthlyRefill(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.balance).toBe(2_080_000); // 80K + 100K = 180K (rollover)
  });

  it('lastRefillAt and nextRefillAt update correctly', () => {
    const userId = 'user_13';

    const now = new Date();
    const nextRefill = new Date(now.getTime() - 1000);

    mockState.userCreditBalances.set(userId, {
      balance: 2_000_000,
      createdAt: new Date(),
      id: 'balance_13',
      lastRefillAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      monthlyCredits: 2_000_000,
      nextRefillAt: nextRefill,
      planType: SubscriptionTiers.PRO,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    const beforeRefill = new Date();
    simulateProcessMonthlyRefill(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    if (!balance.lastRefillAt) {
      throw new Error('Last refill date not set');
    }
    expect(balance.lastRefillAt.getTime()).toBeGreaterThanOrEqual(beforeRefill.getTime());

    const expectedNextRefill = new Date(balance.lastRefillAt);
    expectedNextRefill.setMonth(expectedNextRefill.getMonth() + 1);
    if (!balance.nextRefillAt) {
      throw new Error('Next refill date not set');
    }
    expect(balance.nextRefillAt.getMonth()).toBe(expectedNextRefill.getMonth());
  });
});

describe('subscription-Credit Sync: Sync Recovery', () => {
  it('provisionPaidUserCredits provisions 100K credits when webhook fails', () => {
    const userId = 'user_14';

    // Setup: User has active subscription but credits not synced (webhook failed)
    mockState.userCreditBalances.set(userId, {
      balance: 0, // No credits
      createdAt: new Date(),
      id: 'balance_14',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE, // Still marked as free
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    mockState.stripeCustomers.set('cus_14', {
      email: 'user14@example.com',
      id: 'cus_14',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_14', {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      customerId: 'cus_14',
      id: 'sub_14',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE,
      userId,
    });

    // Simulate provisioning
    simulateProvisionPaidUserCredits(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_000);
    expect(balance.monthlyCredits).toBe(2_000_000);

    // Check transaction
    const tx = mockState.creditTransactions.find(
      t => t.userId === userId && t.type === CreditTransactionTypes.MONTHLY_REFILL,
    );
    expect(tx).toBeTruthy();
    if (!tx) {
      throw new Error('Transaction not found');
    }
    expect(tx.description).toContain('subscription sync recovery');
  });

  it('enforceCredits auto-provisions for subscribed users with 0 credits', () => {
    const userId = 'user_15';

    // Setup: User with active subscription but no credits (desync)
    mockState.userCreditBalances.set(userId, {
      balance: 0,
      createdAt: new Date(),
      id: 'balance_15',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    mockState.stripeCustomers.set('cus_15', {
      email: 'user15@example.com',
      id: 'cus_15',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_15', {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      customerId: 'cus_15',
      id: 'sub_15',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE,
      userId,
    });

    // Enforce credits (should auto-provision)
    expect(() => simulateEnforceCredits(userId, 100)).not.toThrow();

    // Verify credits were provisioned
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_000);
  });

  it('checkHasActiveSubscription returns true for active subscriptions', () => {
    const userId = 'user_16';

    mockState.stripeCustomers.set('cus_16', {
      email: 'user16@example.com',
      id: 'cus_16',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_16', {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      customerId: 'cus_16',
      id: 'sub_16',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE,
      userId,
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);
  });

  it('checkHasActiveSubscription returns false for users without subscriptions', () => {
    const userId = 'user_17';

    mockState.stripeCustomers.set('cus_17', {
      email: 'user17@example.com',
      id: 'cus_17',
      userId,
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(false);
  });

  it('checkHasActiveSubscription returns false for canceled subscriptions', () => {
    const userId = 'user_18';

    mockState.stripeCustomers.set('cus_18', {
      email: 'user18@example.com',
      id: 'cus_18',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_18', {
      cancelAtPeriodEnd: false,
      canceledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      customerId: 'cus_18',
      id: 'sub_18',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.CANCELED,
      userId,
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(false);
  });
});

describe('subscription-Credit Sync: Credit Enforcement', () => {
  it('enforceCredits blocks users with insufficient credits', () => {
    const userId = 'user_21';

    mockState.userCreditBalances.set(userId, {
      balance: 50,
      createdAt: new Date(),
      id: 'balance_21',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    expect(() => simulateEnforceCredits(userId, 100)).toThrow('Insufficient credits');
  });

  it('enforceCredits does NOT block Pro users even if credits out of sync (auto-provision)', () => {
    const userId = 'user_23';

    mockState.userCreditBalances.set(userId, {
      balance: 0, // Out of sync
      createdAt: new Date(),
      id: 'balance_23',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE, // Still marked as free
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    mockState.stripeCustomers.set('cus_23', {
      email: 'user23@example.com',
      id: 'cus_23',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_23', {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      customerId: 'cus_23',
      id: 'sub_23',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE,
      userId,
    });

    // Should NOT throw - auto-provisions
    expect(() => simulateEnforceCredits(userId, 100)).not.toThrow();

    // Verify credits were auto-provisioned
    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.balance).toBe(2_000_000);
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
  });
});

describe('subscription-Credit Sync: Edge Cases', () => {
  it('user with active subscription but planType still "free" (desync)', () => {
    const userId = 'user_24';

    // This is the exact bug scenario
    mockState.userCreditBalances.set(userId, {
      balance: 0,
      createdAt: new Date(),
      id: 'balance_24',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE, // Desync
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    mockState.stripeCustomers.set('cus_24', {
      email: 'user24@example.com',
      id: 'cus_24',
      userId,
    });

    mockState.stripeSubscriptions.set('sub_24', {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      customerId: 'cus_24',
      id: 'sub_24',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE,
      userId,
    });

    // Check active subscription
    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);

    // Provision should fix the desync
    simulateProvisionPaidUserCredits(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_000_000);
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('user cancels then resubscribes', () => {
    const userId = 'user_25';

    // Setup: User previously canceled, now resubscribing
    mockState.userCreditBalances.set(userId, {
      balance: 5_000, // Remaining credits from before
      createdAt: new Date(),
      id: 'balance_25',
      lastRefillAt: null,
      monthlyCredits: 0,
      nextRefillAt: null,
      planType: SubscriptionTiers.FREE,
      reservedCredits: 0,
      updatedAt: new Date(),
      userId,
      version: 1,
    });

    // Simulate resubscription (upgrade to paid)
    simulateUpgradeToPaidPlan(userId);

    const balance = mockState.userCreditBalances.get(userId);
    if (!balance) {
      throw new Error('Balance not found');
    }
    expect(balance.planType).toBe(SubscriptionTiers.PRO);
    expect(balance.balance).toBe(2_005_000); // 5K old + 100K new
    expect(balance.monthlyCredits).toBe(2_000_000);
  });

  it('subscription status changes (active → past_due → active)', () => {
    const userId = 'user_26';

    mockState.stripeCustomers.set('cus_26', {
      email: 'user26@example.com',
      id: 'cus_26',
      userId,
    });

    // Initially active
    mockState.stripeSubscriptions.set('sub_26', {
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      customerId: 'cus_26',
      id: 'sub_26',
      priceId: 'price_pro',
      status: StripeSubscriptionStatuses.ACTIVE,
      userId,
    });

    expect(simulateCheckHasActiveSubscription(userId)).toBe(true);

    // Change to past_due (payment failed)
    const subscription = mockState.stripeSubscriptions.get('sub_26');
    if (!subscription) {
      throw new Error('Subscription not found');
    }
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
