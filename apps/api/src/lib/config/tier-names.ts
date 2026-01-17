/**
 * Subscription Tier Names Configuration
 *
 * ✅ CLIENT-SAFE: No server-only dependencies
 * ✅ SINGLE SOURCE OF TRUTH: Display names for subscription tiers
 *
 * Used by UI components to display tier labels.
 */

import type { SubscriptionTier } from '@roundtable/shared/enums';
import { SubscriptionTiers } from '@roundtable/shared/enums';

/**
 * Human-readable names for subscription tiers
 * Used in UI for tier badges, upgrade prompts, etc.
 */
export const SUBSCRIPTION_TIER_NAMES: Record<SubscriptionTier, string> = {
  [SubscriptionTiers.FREE]: 'Free',
  [SubscriptionTiers.PRO]: 'Pro',
} as const;

/**
 * Get display name for a subscription tier
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  return SUBSCRIPTION_TIER_NAMES[tier];
}
