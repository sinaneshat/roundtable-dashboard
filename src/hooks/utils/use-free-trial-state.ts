'use client';

import { useMemo } from 'react';

import type { BorderVariant, TrialState } from '@/api/core/enums';
import { BorderVariants, PlanTypes, TrialStates } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { useSidebarThreadsQuery, useUsageStatsQuery } from '@/hooks/queries';

export type FreeTrialStateReturn = {
  isFreeUser: boolean;
  hasUsedTrial: boolean;
  isWarningState: boolean;
  isLoadingStats: boolean;
  borderVariant: BorderVariant;
  trialState: TrialState;
};

/**
 * Hook to determine free trial state for a user.
 *
 * Free users get ONE thread + ONE round upon signup.
 * Once they create a thread, they've used their quota.
 *
 * Returns:
 * - isFreeUser: User is on free tier (not paid)
 * - hasUsedTrial: User has created a thread or completed a round
 * - isWarningState: Same as hasUsedTrial (amber warning state)
 * - isLoadingStats: Usage stats are still loading
 * - borderVariant: Border styling variant for chat input
 * - trialState: Trial state enum value for component logic
 */
export function useFreeTrialState(): FreeTrialStateReturn {
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { data: threadsData } = useSidebarThreadsQuery();
  const messages = useChatStore(state => state.messages);

  const freeRoundUsedFromApi = useMemo(() => {
    if (!statsData?.success || !statsData.data)
      return false;
    return statsData.data.plan?.freeRoundUsed ?? false;
  }, [statsData]);

  const hasExistingThread = useMemo(() => {
    if (!threadsData?.pages?.[0]?.success)
      return false;
    const threads = threadsData.pages[0].data?.items ?? [];
    return threads.length > 0;
  }, [threadsData]);

  const hasLocalMessages = messages.length > 0;
  const hasUsedTrial = freeRoundUsedFromApi || hasExistingThread || hasLocalMessages;

  const isFreeUser = useMemo(() => {
    if (!statsData?.success || !statsData.data)
      return false;
    return statsData.data.plan?.type !== PlanTypes.PAID;
  }, [statsData]);

  const isWarningState = hasUsedTrial;

  // Compute border variant: only free users get colored borders
  const borderVariant: BorderVariant = useMemo(() => {
    if (!isFreeUser)
      return BorderVariants.DEFAULT;
    return hasUsedTrial ? BorderVariants.WARNING : BorderVariants.SUCCESS;
  }, [isFreeUser, hasUsedTrial]);

  // Compute trial state enum
  const trialState: TrialState = hasUsedTrial ? TrialStates.USED : TrialStates.AVAILABLE;

  return {
    isFreeUser,
    hasUsedTrial,
    isWarningState,
    isLoadingStats,
    borderVariant,
    trialState,
  };
}
