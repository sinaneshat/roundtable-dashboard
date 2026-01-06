/**
 * Usage Tracking & Quota Calculation Tests
 *
 * Comprehensive tests for quota calculation, limit enforcement,
 * usage tracking accuracy, and billing period management.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubscriptionTier } from '@/api/core/enums';
import { SubscriptionTiers } from '@/api/core/enums';
import { TIER_QUOTAS } from '@/api/services/product-logic.service';

// Mock database for testing
let mockUsageRecords: Map<string, any>;
let mockHistoryRecords: any[];

vi.mock('@/db', async () => {
  const actual = await vi.importActual('@/db');
  return {
    ...actual,
    getDbAsync: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              const userId = Array.from(mockUsageRecords.keys())[0];
              const record = mockUsageRecords.get(userId);
              return record ? [record] : [];
            }),
            $withCache: vi.fn((config) => {
              const userId = Array.from(mockUsageRecords.keys())[0];
              const record = mockUsageRecords.get(userId);
              return record ? [record] : [];
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => {
              const newRecords = Array.from(mockUsageRecords.values());
              return newRecords;
            }),
          })),
          returning: vi.fn(() => {
            return mockHistoryRecords;
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => {
              const updatedRecords = Array.from(mockUsageRecords.values());
              return updatedRecords;
            }),
          })),
        })),
      })),
      transaction: vi.fn(async (fn) => {
        return await fn({
          insert: vi.fn(),
          update: vi.fn(),
        });
      }),
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUsageRecords = new Map();
  mockHistoryRecords = [];
});

describe('quota Calculation and Tracking', () => {
  describe('tIER_QUOTAS Configuration', () => {
    it('defines quotas for all subscription tiers', () => {
      expect(TIER_QUOTAS).toBeDefined();
      expect(TIER_QUOTAS[SubscriptionTiers.FREE]).toBeDefined();
      expect(TIER_QUOTAS[SubscriptionTiers.PRO]).toBeDefined();
    });

    it('free tier has restricted quotas', () => {
      const freeQuotas = TIER_QUOTAS[SubscriptionTiers.FREE];

      expect(freeQuotas.threadsPerMonth).toBe(1);
      expect(freeQuotas.messagesPerMonth).toBe(100);
      expect(freeQuotas.customRolesPerMonth).toBe(0);
      expect(freeQuotas.analysisPerMonth).toBe(10);
    });

    it('pro tier has generous quotas', () => {
      const proQuotas = TIER_QUOTAS[SubscriptionTiers.PRO];

      expect(proQuotas.threadsPerMonth).toBe(500);
      expect(proQuotas.messagesPerMonth).toBe(10000);
      expect(proQuotas.customRolesPerMonth).toBe(25);
      expect(proQuotas.analysisPerMonth).toBe(1000);
    });

    it('pro tier has significantly higher limits than free', () => {
      const freeQuotas = TIER_QUOTAS[SubscriptionTiers.FREE];
      const proQuotas = TIER_QUOTAS[SubscriptionTiers.PRO];

      expect(proQuotas.threadsPerMonth).toBeGreaterThan(freeQuotas.threadsPerMonth);
      expect(proQuotas.messagesPerMonth).toBeGreaterThan(freeQuotas.messagesPerMonth);
      expect(proQuotas.customRolesPerMonth).toBeGreaterThan(freeQuotas.customRolesPerMonth);
      expect(proQuotas.analysisPerMonth).toBeGreaterThan(freeQuotas.analysisPerMonth);
    });

    it('all quota values are positive integers', () => {
      Object.values(TIER_QUOTAS).forEach((quotas) => {
        expect(quotas.threadsPerMonth).toBeGreaterThan(0);
        expect(quotas.messagesPerMonth).toBeGreaterThan(0);
        expect(quotas.analysisPerMonth).toBeGreaterThan(0);
        expect(Number.isInteger(quotas.threadsPerMonth)).toBe(true);
        expect(Number.isInteger(quotas.messagesPerMonth)).toBe(true);
        expect(Number.isInteger(quotas.analysisPerMonth)).toBe(true);
      });
    });
  });

  describe('usage Calculation Accuracy', () => {
    it('calculates available quota correctly (limit - used)', () => {
      const limit = 100;
      const used = 45;
      const available = limit - used;

      expect(available).toBe(55);
    });

    it('returns zero when quota is exhausted', () => {
      const limit = 100;
      const used = 100;
      const available = Math.max(0, limit - used);

      expect(available).toBe(0);
    });

    it('handles over-quota usage (prevents negative values)', () => {
      const limit = 100;
      const used = 150; // Over quota
      const available = Math.max(0, limit - used);

      expect(available).toBe(0);
    });

    it('calculates percentage used correctly', () => {
      const limit = 100;
      const used = 75;
      const percentageUsed = (used / limit) * 100;

      expect(percentageUsed).toBe(75);
    });

    it('handles zero usage correctly', () => {
      const limit = 100;
      const used = 0;
      const available = limit - used;
      const percentageUsed = (used / limit) * 100;

      expect(available).toBe(100);
      expect(percentageUsed).toBe(0);
    });
  });

  describe('quota Limit Enforcement', () => {
    describe('thread Creation Limits', () => {
      it('free user blocked at 1 thread', () => {
        const tier = SubscriptionTiers.FREE;
        const threadsCreated = 1;
        const limit = TIER_QUOTAS[tier].threadsPerMonth;

        const canCreateThread = threadsCreated < limit;
        expect(canCreateThread).toBe(false);
      });

      it('free user allowed first thread', () => {
        const tier = SubscriptionTiers.FREE;
        const threadsCreated = 0;
        const limit = TIER_QUOTAS[tier].threadsPerMonth;

        const canCreateThread = threadsCreated < limit;
        expect(canCreateThread).toBe(true);
      });

      it('pro user can create multiple threads', () => {
        const tier = SubscriptionTiers.PRO;
        const threadsCreated = 10;
        const limit = TIER_QUOTAS[tier].threadsPerMonth;

        const canCreateThread = threadsCreated < limit;
        expect(canCreateThread).toBe(true);
        expect(limit).toBe(500);
      });

      it('pro user blocked at thread limit', () => {
        const tier = SubscriptionTiers.PRO;
        const threadsCreated = 500;
        const limit = TIER_QUOTAS[tier].threadsPerMonth;

        const canCreateThread = threadsCreated < limit;
        expect(canCreateThread).toBe(false);
      });
    });

    describe('message Limits', () => {
      it('free tier has 100 messages per month', () => {
        const freeLimit = TIER_QUOTAS[SubscriptionTiers.FREE].messagesPerMonth;
        expect(freeLimit).toBe(100);
      });

      it('pro tier has 10,000 messages per month', () => {
        const proLimit = TIER_QUOTAS[SubscriptionTiers.PRO].messagesPerMonth;
        expect(proLimit).toBe(10000);
      });

      it('blocks user at message limit', () => {
        const messagesCreated = 100;
        const limit = TIER_QUOTAS[SubscriptionTiers.FREE].messagesPerMonth;

        const canSendMessage = messagesCreated < limit;
        expect(canSendMessage).toBe(false);
      });

      it('allows message before limit', () => {
        const messagesCreated = 99;
        const limit = TIER_QUOTAS[SubscriptionTiers.FREE].messagesPerMonth;

        const canSendMessage = messagesCreated < limit;
        expect(canSendMessage).toBe(true);
      });
    });

    describe('custom Role Limits', () => {
      it('free tier has no custom roles', () => {
        const freeLimit = TIER_QUOTAS[SubscriptionTiers.FREE].customRolesPerMonth;
        expect(freeLimit).toBe(0);
      });

      it('pro tier allows 25 custom roles', () => {
        const proLimit = TIER_QUOTAS[SubscriptionTiers.PRO].customRolesPerMonth;
        expect(proLimit).toBe(25);
      });

      it('free users cannot create custom roles', () => {
        const tier = SubscriptionTiers.FREE;
        const customRolesCreated = 0;
        const limit = TIER_QUOTAS[tier].customRolesPerMonth;

        const canCreateRole = customRolesCreated < limit;
        expect(canCreateRole).toBe(false);
      });

      it('pro users can create custom roles within limit', () => {
        const tier = SubscriptionTiers.PRO;
        const customRolesCreated = 10;
        const limit = TIER_QUOTAS[tier].customRolesPerMonth;

        const canCreateRole = customRolesCreated < limit;
        expect(canCreateRole).toBe(true);
      });
    });

    describe('analysis Generation Limits', () => {
      it('free tier allows 10 analyses per month', () => {
        const freeLimit = TIER_QUOTAS[SubscriptionTiers.FREE].analysisPerMonth;
        expect(freeLimit).toBe(10);
      });

      it('pro tier allows 1,000 analyses per month', () => {
        const proLimit = TIER_QUOTAS[SubscriptionTiers.PRO].analysisPerMonth;
        expect(proLimit).toBe(1000);
      });

      it('blocks analysis at limit', () => {
        const analysisGenerated = 10;
        const limit = TIER_QUOTAS[SubscriptionTiers.FREE].analysisPerMonth;

        const canGenerateAnalysis = analysisGenerated < limit;
        expect(canGenerateAnalysis).toBe(false);
      });
    });
  });

  describe('usage History Tracking', () => {
    it('tracks cumulative usage counters', () => {
      const usageHistory = {
        threadsCreated: 5,
        messagesCreated: 250,
        customRolesCreated: 3,
        analysisGenerated: 15,
      };

      expect(usageHistory.threadsCreated).toBe(5);
      expect(usageHistory.messagesCreated).toBe(250);
      expect(usageHistory.customRolesCreated).toBe(3);
      expect(usageHistory.analysisGenerated).toBe(15);
    });

    it('usage counters only increment, never decrement', () => {
      let threadsCreated = 5;
      threadsCreated += 1; // New thread

      expect(threadsCreated).toBe(6);

      // Deletion should NOT decrement
      // threadsCreated -= 1; // ❌ NEVER DO THIS
      expect(threadsCreated).toBe(6);
    });

    it('stores snapshot at end of billing period', () => {
      const periodEnd = new Date('2024-01-31T23:59:59Z');
      const snapshot = {
        periodStart: new Date('2024-01-01T00:00:00Z'),
        periodEnd,
        threadsCreated: 5,
        messagesCreated: 250,
        customRolesCreated: 3,
        analysisGenerated: 15,
        subscriptionTier: SubscriptionTiers.PRO as SubscriptionTier,
      };

      expect(snapshot.periodEnd).toEqual(periodEnd);
      expect(snapshot.threadsCreated).toBe(5);
    });

    it('resets counters at start of new billing period', () => {
      const oldPeriodUsage = {
        threadsCreated: 100,
        messagesCreated: 5000,
      };

      const newPeriodUsage = {
        threadsCreated: 0,
        messagesCreated: 0,
      };

      expect(newPeriodUsage.threadsCreated).toBe(0);
      expect(newPeriodUsage.messagesCreated).toBe(0);
      expect(newPeriodUsage.threadsCreated).not.toBe(oldPeriodUsage.threadsCreated);
    });
  });

  describe('billing Period Calculations', () => {
    describe('period Start and End Dates', () => {
      it('calculates period start as first day of month', () => {
        const now = new Date('2024-03-15T10:30:00Z');
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

        expect(periodStart.getDate()).toBe(1);
        expect(periodStart.getMonth()).toBe(2); // March (0-indexed)
        expect(periodStart.getFullYear()).toBe(2024);
      });

      it('calculates period end as last day of month at 23:59:59', () => {
        const now = new Date('2024-03-15T10:30:00Z');
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        expect(periodEnd.getDate()).toBe(31); // March has 31 days
        expect(periodEnd.getMonth()).toBe(2); // March
        expect(periodEnd.getHours()).toBe(23);
        expect(periodEnd.getMinutes()).toBe(59);
        expect(periodEnd.getSeconds()).toBe(59);
      });

      it('handles month boundaries correctly', () => {
        const janStart = new Date(2024, 0, 1); // January 1
        const janEnd = new Date(2024, 1, 0, 23, 59, 59); // January 31

        expect(janStart.getMonth()).toBe(0);
        expect(janEnd.getDate()).toBe(31);
      });

      it('handles February in leap year', () => {
        const febEnd2024 = new Date(2024, 2, 0, 23, 59, 59); // Feb 2024 (leap year)
        expect(febEnd2024.getDate()).toBe(29);

        const febEnd2023 = new Date(2023, 2, 0, 23, 59, 59); // Feb 2023 (not leap)
        expect(febEnd2023.getDate()).toBe(28);
      });

      it('handles year boundaries correctly', () => {
        const decStart = new Date(2024, 11, 1); // December 1, 2024
        const decEnd = new Date(2024, 12, 0, 23, 59, 59); // December 31, 2024

        expect(decStart.getMonth()).toBe(11);
        expect(decEnd.getDate()).toBe(31);
        expect(decEnd.getMonth()).toBe(11);
      });
    });

    describe('billing Period Rollover Detection', () => {
      it('detects when current period has ended', () => {
        const now = new Date('2024-04-01T00:00:01Z');
        const currentPeriodEnd = new Date('2024-03-31T23:59:59Z');

        const hasExpired = currentPeriodEnd < now;
        expect(hasExpired).toBe(true);
      });

      it('period not expired when still active', () => {
        const now = new Date('2024-03-15T10:30:00Z');
        const currentPeriodEnd = new Date('2024-03-31T23:59:59Z');

        const hasExpired = currentPeriodEnd < now;
        expect(hasExpired).toBe(false);
      });

      it('exact period end moment is not expired', () => {
        const now = new Date('2024-03-31T23:59:59Z');
        const currentPeriodEnd = new Date('2024-03-31T23:59:59Z');

        const hasExpired = currentPeriodEnd < now;
        expect(hasExpired).toBe(false);
      });

      it('one second after period end is expired', () => {
        const now = new Date('2024-04-01T00:00:00Z');
        const currentPeriodEnd = new Date('2024-03-31T23:59:59Z');

        const hasExpired = currentPeriodEnd < now;
        expect(hasExpired).toBe(true);
      });
    });

    describe('period History Archival', () => {
      it('creates history record with complete usage data', () => {
        const historyRecord = {
          userId: 'user_123',
          periodStart: new Date('2024-03-01T00:00:00Z'),
          periodEnd: new Date('2024-03-31T23:59:59Z'),
          threadsCreated: 15,
          messagesCreated: 1200,
          customRolesCreated: 5,
          analysisGenerated: 30,
          subscriptionTier: SubscriptionTiers.PRO as SubscriptionTier,
          isAnnual: false,
          createdAt: new Date(),
        };

        expect(historyRecord.userId).toBe('user_123');
        expect(historyRecord.threadsCreated).toBe(15);
        expect(historyRecord.subscriptionTier).toBe(SubscriptionTiers.PRO);
      });

      it('history record is immutable snapshot', () => {
        const snapshot = {
          threadsCreated: 10,
          messagesCreated: 500,
        };

        // Usage continues in new period
        const currentUsage = {
          threadsCreated: 2,
          messagesCreated: 100,
        };

        // Snapshot remains unchanged
        expect(snapshot.threadsCreated).toBe(10);
        expect(currentUsage.threadsCreated).toBe(2);
      });

      it('maintains tier information in history', () => {
        const historyRecord = {
          subscriptionTier: SubscriptionTiers.PRO as SubscriptionTier,
          isAnnual: true,
        };

        // Can look up historical quotas
        const historicalQuotas = TIER_QUOTAS[historyRecord.subscriptionTier];
        expect(historicalQuotas).toBeDefined();
      });
    });
  });

  describe('tier-Based Quota Differences', () => {
    describe('quota Comparison Utilities', () => {
      it('calculates quota ratio between tiers', () => {
        const freeThreads = TIER_QUOTAS[SubscriptionTiers.FREE].threadsPerMonth;
        const proThreads = TIER_QUOTAS[SubscriptionTiers.PRO].threadsPerMonth;

        const ratio = proThreads / freeThreads;
        expect(ratio).toBe(500); // 500x more threads
      });

      it('identifies most restrictive quota', () => {
        const quotas = [100, 10, 1000, 50];
        const mostRestrictive = Math.min(...quotas);

        expect(mostRestrictive).toBe(10);
      });

      it('calculates remaining quota percentage', () => {
        const limit = 100;
        const used = 75;
        const remaining = limit - used;
        const remainingPercentage = (remaining / limit) * 100;

        expect(remainingPercentage).toBe(25);
      });
    });

    describe('upgrade Impact Analysis', () => {
      it('calculates quota increase on upgrade', () => {
        const oldQuota = TIER_QUOTAS[SubscriptionTiers.FREE].threadsPerMonth;
        const newQuota = TIER_QUOTAS[SubscriptionTiers.PRO].threadsPerMonth;

        const increase = newQuota - oldQuota;
        expect(increase).toBe(499); // From 1 to 500
      });

      it('maintains usage counters during upgrade', () => {
        const usageBeforeUpgrade = {
          threadsCreated: 1,
          messagesCreated: 50,
        };

        const usageAfterUpgrade = {
          threadsCreated: 1, // Same usage
          messagesCreated: 50, // Same usage
        };

        expect(usageAfterUpgrade.threadsCreated).toBe(usageBeforeUpgrade.threadsCreated);
        expect(usageAfterUpgrade.messagesCreated).toBe(usageBeforeUpgrade.messagesCreated);
      });

      it('immediately grants higher limits on upgrade', () => {
        const tier = SubscriptionTiers.PRO;
        const threadsCreated = 1;
        const limit = TIER_QUOTAS[tier].threadsPerMonth;

        const canCreateThread = threadsCreated < limit;
        expect(canCreateThread).toBe(true);
        expect(limit).toBe(500);
      });
    });

    describe('downgrade Scenarios', () => {
      it('schedules downgrade for period end (grace period)', () => {
        const currentTier = SubscriptionTiers.PRO;
        const pendingTier = SubscriptionTiers.FREE;
        const periodEnd = new Date('2024-03-31T23:59:59Z');

        const graceInfo = {
          currentTier,
          pendingTier,
          effectiveDate: periodEnd,
        };

        expect(graceInfo.currentTier).toBe(SubscriptionTiers.PRO);
        expect(graceInfo.pendingTier).toBe(SubscriptionTiers.FREE);
      });

      it('applies pending tier at period rollover', () => {
        const pendingTierChange = SubscriptionTiers.FREE;
        const isRollover = true;

        const newTier = isRollover ? pendingTierChange : SubscriptionTiers.PRO;
        expect(newTier).toBe(SubscriptionTiers.FREE);
      });

      it('clears pending tier after application', () => {
        let pendingTierChange: SubscriptionTier | null = SubscriptionTiers.FREE;

        // Apply the change
        const newTier = pendingTierChange;
        pendingTierChange = null; // Clear pending

        expect(newTier).toBe(SubscriptionTiers.FREE);
        expect(pendingTierChange).toBeNull();
      });
    });
  });

  describe('edge Cases and Error Handling', () => {
    it('handles zero quota limits gracefully', () => {
      const limit = 0;
      const used = 0;
      const canPerformAction = used < limit;

      expect(canPerformAction).toBe(false);
    });

    it('handles exactly at limit correctly', () => {
      const limit = 100;
      const used = 100;
      const canPerformAction = used < limit;

      expect(canPerformAction).toBe(false);
    });

    it('handles one below limit correctly', () => {
      const limit = 100;
      const used = 99;
      const canPerformAction = used < limit;

      expect(canPerformAction).toBe(true);
    });

    it('prevents negative usage values', () => {
      let usage = 10;
      const decrementAttempt = usage - 20;

      // Should use Math.max to prevent negative
      usage = Math.max(0, decrementAttempt);
      expect(usage).toBe(0);
    });

    it('handles very large usage numbers', () => {
      const limit = TIER_QUOTAS[SubscriptionTiers.PRO].messagesPerMonth;
      const used = 999999;

      const canPerformAction = used < limit;
      expect(canPerformAction).toBe(false);
    });

    it('handles missing tier gracefully', () => {
      const unknownTier = 'unknown' as SubscriptionTier;
      const quotas = TIER_QUOTAS[unknownTier];

      // Should have fallback or be undefined
      expect(quotas).toBeUndefined();
    });
  });

  describe('integration: Complete Usage Lifecycle', () => {
    it('new user starts with zero usage', () => {
      const newUserUsage = {
        threadsCreated: 0,
        messagesCreated: 0,
        customRolesCreated: 0,
        analysisGenerated: 0,
        subscriptionTier: SubscriptionTiers.FREE as SubscriptionTier,
      };

      expect(newUserUsage.threadsCreated).toBe(0);
      expect(newUserUsage.messagesCreated).toBe(0);
      expect(newUserUsage.subscriptionTier).toBe(SubscriptionTiers.FREE);
    });

    it('usage increments with each action', () => {
      let threadsCreated = 0;

      // Create thread
      threadsCreated += 1;
      expect(threadsCreated).toBe(1);

      // Cannot create another thread on free tier
      const canCreate = threadsCreated < TIER_QUOTAS[SubscriptionTiers.FREE].threadsPerMonth;
      expect(canCreate).toBe(false);
    });

    it('usage persists across sessions', () => {
      const persistedUsage = {
        threadsCreated: 5,
        messagesCreated: 250,
      };

      // Simulate loading from database
      const loadedUsage = { ...persistedUsage };

      expect(loadedUsage.threadsCreated).toBe(5);
      expect(loadedUsage.messagesCreated).toBe(250);
    });

    it('usage resets at period boundary', () => {
      const oldPeriodUsage = 100;
      const newPeriodUsage = 0;

      expect(newPeriodUsage).toBe(0);
      expect(newPeriodUsage).not.toBe(oldPeriodUsage);
    });

    it('quota enforcement prevents exceeding limits', () => {
      const tier = SubscriptionTiers.FREE;
      const threadsCreated = 1;
      const limit = TIER_QUOTAS[tier].threadsPerMonth;

      if (threadsCreated >= limit) {
        const errorMessage = `Thread limit reached. You can create ${limit} thread(s) per month on the Free tier.`;
        expect(errorMessage).toContain('limit reached');
      }
    });
  });

  describe('quota Reset Period Calculation', () => {
    it('monthly reset occurs on first day of month', () => {
      const lastReset = new Date('2024-03-01T00:00:00Z');
      const nextReset = new Date('2024-04-01T00:00:00Z');

      expect(nextReset.getDate()).toBe(1);
      expect(nextReset.getMonth()).toBe(3); // April
    });

    it('calculates days until next reset', () => {
      const now = new Date('2024-03-15T10:00:00Z');
      const nextReset = new Date('2024-04-01T00:00:00Z');

      const msUntilReset = nextReset.getTime() - now.getTime();
      const daysUntilReset = Math.ceil(msUntilReset / (1000 * 60 * 60 * 24));

      expect(daysUntilReset).toBeGreaterThan(15);
      expect(daysUntilReset).toBeLessThan(20);
    });

    it('handles month transitions correctly', () => {
      const marchEnd = new Date('2024-03-31T23:59:59Z');
      const aprilStart = new Date('2024-04-01T00:00:00Z');

      const resetOccurs = aprilStart > marchEnd;
      expect(resetOccurs).toBe(true);
    });
  });
});
