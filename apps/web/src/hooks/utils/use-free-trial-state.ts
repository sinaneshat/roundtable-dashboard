import { BorderVariants, PlanTypes, TrialStates } from '@roundtable/shared';
import { useMemo } from 'react';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { useSidebarThreadsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { validateUsageStatsCache } from '@/stores/chat/actions/types';

/**
 * Hook to determine free trial state for a user.
 *
 * Free users get ONE thread + ONE round upon signup.
 * Once they create a thread, they've used their quota.
 */
export function useFreeTrialState() {
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { data: threadsData } = useSidebarThreadsQuery();
  const messages = useChatStore(state => state.messages);

  const validated = useMemo(() => validateUsageStatsCache(statsData), [statsData]);

  const isFreeUser = useMemo(() => {
    if (!validated) {
      return false;
    }
    return validated.plan.type !== PlanTypes.PAID;
  }, [validated]);

  const freeRoundUsedFromApi = validated?.plan.freeRoundUsed ?? false;

  const hasExistingThread = useMemo(() => {
    if (!threadsData?.pages?.[0]?.success) {
      return false;
    }
    const threads = threadsData.pages[0].data?.items ?? [];
    return threads.length > 0;
  }, [threadsData]);

  const hasLocalMessages = messages.length > 0;
  const hasUsedTrial = freeRoundUsedFromApi || hasExistingThread || hasLocalMessages;
  const isWarningState = hasUsedTrial;

  const borderVariant = useMemo(() => {
    if (!isFreeUser) {
      return BorderVariants.DEFAULT;
    }
    return hasUsedTrial ? BorderVariants.WARNING : BorderVariants.SUCCESS;
  }, [isFreeUser, hasUsedTrial]);

  const trialState = hasUsedTrial ? TrialStates.USED : TrialStates.AVAILABLE;

  return {
    borderVariant,
    hasUsedTrial,
    isFreeUser,
    isLoadingStats,
    isWarningState,
    trialState,
  };
}
