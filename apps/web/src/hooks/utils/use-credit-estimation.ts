/**
 * Credit Estimation Hook
 *
 * Real-time credit estimation for chat rounds before submission.
 * Uses model pricing tiers to calculate accurate costs per participant.
 *
 * Features:
 * - Per-participant cost based on model tier (1x-200x multiplier)
 * - Includes auto mode analysis cost (500 tokens)
 * - Includes web search cost (500 tokens)
 * - Applies reservation multiplier (1.5x) for safety margin
 * - Three-tier status: sufficient, low (<20% remaining), insufficient
 */

import type { ModelPricingTier } from '@roundtable/shared';
import {
  MODEL_PRICING_TIERS,
  MODEL_TIER_CREDIT_MULTIPLIERS,
  MODEL_TIER_THRESHOLDS,
  ModelPricingTiers,
} from '@roundtable/shared';
import { useMemo } from 'react';

import { useUsageStatsQuery } from '@/hooks/queries';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';
import type { CreditEstimationStatus } from '@/lib/enums/billing-ui';
import { CreditEstimationStatuses } from '@/lib/enums/billing-ui';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

import { useModelLookup } from './use-model-lookup';

// ============================================================================
// TYPES
// ============================================================================

export type CreditEstimationResult = {
  /** Estimated credits needed for this round */
  estimatedCredits: number;
  /** Current available credits */
  availableCredits: number;
  /** Credits remaining after this round */
  creditsAfterSubmit: number;
  /** Whether user can afford this round */
  canAfford: boolean;
  /** Status: sufficient, low (<20% remaining), or insufficient */
  status: CreditEstimationStatus;
  /** Whether data is still loading */
  isLoading: boolean;
};

export type UseCreditEstimationOptions = {
  participants: ParticipantConfig[];
  autoMode?: boolean;
  enableWebSearch?: boolean;
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Derive pricing tier from model's input price per token
 * Price thresholds are per million tokens
 * Note: Model pricing.prompt is a string like "0.0000025"
 */
function getModelTierFromPrice(pricePerTokenStr: string | undefined): ModelPricingTier {
  if (!pricePerTokenStr) {
    return ModelPricingTiers.STANDARD;
  }

  const pricePerToken = Number.parseFloat(pricePerTokenStr);
  if (Number.isNaN(pricePerToken)) {
    return ModelPricingTiers.STANDARD;
  }

  const pricePerMillion = pricePerToken * 1_000_000;

  // Check each tier's threshold range
  for (const tier of MODEL_PRICING_TIERS) {
    const threshold = MODEL_TIER_THRESHOLDS[tier];
    if (pricePerMillion >= threshold.min && pricePerMillion < threshold.max) {
      return tier;
    }
  }

  return ModelPricingTiers.STANDARD;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Calculate estimated credit cost for a chat round before submission
 *
 * @param options - Participants, auto mode, and web search flags
 * @returns Credit estimation with status and affordability
 *
 * @example
 * ```tsx
 * const { canAfford, status, estimatedCredits } = useCreditEstimation({
 *   participants,
 *   autoMode: true,
 *   enableWebSearch: true,
 * });
 *
 * if (!canAfford) {
 *   // Block submit, show error
 * }
 * ```
 */
export function useCreditEstimation(options: UseCreditEstimationOptions): CreditEstimationResult {
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { findModel, isLoading: isLoadingModels } = useModelLookup();

  const isLoading = isLoadingStats || isLoadingModels;
  const availableCredits = (statsData?.success && statsData.data.credits?.available) ? statsData.data.credits.available : 0;

  const estimatedCredits = useMemo(() => {
    const {
      TOKENS_PER_CREDIT,
      DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE,
      DEFAULT_ESTIMATED_INPUT_TOKENS,
      RESERVATION_MULTIPLIER,
      ACTION_COSTS,
    } = CREDIT_CONFIG;

    let total = 0;
    const baseTokens = DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE + DEFAULT_ESTIMATED_INPUT_TOKENS;

    // Sum per-participant costs
    for (const participant of options.participants) {
      const model = findModel(participant.modelId);
      const tier = getModelTierFromPrice(model?.pricing?.prompt);
      const multiplier = MODEL_TIER_CREDIT_MULTIPLIERS[tier];
      const baseCredits = Math.ceil(baseTokens / TOKENS_PER_CREDIT);
      total += baseCredits * multiplier;
    }

    // Add auto mode analysis cost (500 tokens)
    if (options.autoMode) {
      total += Math.ceil(ACTION_COSTS.autoModeAnalysis / TOKENS_PER_CREDIT);
    }

    // Add web search cost (500 tokens)
    if (options.enableWebSearch) {
      total += Math.ceil(ACTION_COSTS.webSearchQuery / TOKENS_PER_CREDIT);
    }

    // Apply reservation multiplier for safety margin
    return Math.ceil(total * RESERVATION_MULTIPLIER);
  }, [options.participants, options.autoMode, options.enableWebSearch, findModel]);

  const creditsAfterSubmit = availableCredits - estimatedCredits;
  const canAfford = availableCredits >= estimatedCredits;

  // Status: insufficient if can't afford, low if <20% remaining, else sufficient
  const status: CreditEstimationStatus = useMemo(() => {
    if (!canAfford) {
      return CreditEstimationStatuses.INSUFFICIENT;
    }
    // Low if remaining credits after submit is less than 20% of current
    if (creditsAfterSubmit < availableCredits * 0.2) {
      return CreditEstimationStatuses.LOW;
    }
    return CreditEstimationStatuses.SUFFICIENT;
  }, [canAfford, creditsAfterSubmit, availableCredits]);

  return {
    estimatedCredits,
    availableCredits,
    creditsAfterSubmit,
    canAfford,
    status,
    isLoading,
  };
}
