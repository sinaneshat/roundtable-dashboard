/**
 * Product Logic Utils
 *
 * Subset of product/billing logic needed by the frontend.
 * Extracted from apps/api/src/services/billing/product-logic.service.ts
 *
 * NOTE: This is a minimal subset. The full product logic lives in the API.
 */

import type { SubscriptionTier } from '@roundtable/shared';
import { CREDIT_CONFIG, SubscriptionTiers } from '@roundtable/shared';

type TierConfiguration = {
  name: string;
  maxModels: number;
  monthlyCredits: number;
};

const TIER_CONFIG: Record<SubscriptionTier, TierConfiguration> = {
  free: {
    name: 'Free',
    maxModels: 3,
    monthlyCredits: 0,
  },
  pro: {
    name: 'Pro',
    maxModels: 12,
    monthlyCredits: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
  },
} as const;

export function getMaxModelsForTier(tier: SubscriptionTier): number {
  return TIER_CONFIG[tier].maxModels;
}

export function getMonthlyCreditsForTier(tier: SubscriptionTier): number {
  return TIER_CONFIG[tier].monthlyCredits;
}

export function getTierFromProductId(productId: string): SubscriptionTier {
  const normalized = productId.toLowerCase();

  if (
    normalized.includes('_pro_')
    || normalized.endsWith('_pro')
    || normalized.includes('-pro-')
    || normalized.endsWith('-pro')
    || /(?:^|[^a-z])pro(?:$|[^a-z])/.test(normalized)
  ) {
    return SubscriptionTiers.PRO;
  }

  return SubscriptionTiers.FREE;
}
