/**
 * Recommended Actions Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Orchestrates store actions with optional UI concerns (scrolling, config tracking).
 *
 * ARCHITECTURE:
 * - Business logic: store.applyRecommendedAction() (in ChatFormSlice)
 * - UI concerns: scrolling, config change marking (in hook)
 * - Following pattern from feedback-actions.ts and form-actions.ts
 *
 * Location: /src/stores/chat/actions/recommended-actions.ts
 * Used by: ChatThreadScreen, ChatOverviewScreen
 */

'use client';

import { useCallback } from 'react';

import type { Recommendation } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useModelsQuery } from '@/hooks/queries/models';
import { useMemoizedReturn } from '@/lib/utils/memo-utils';

export type UseRecommendedActionsOptions = {
  /** Optional ref to input container for scrolling behavior */
  inputContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Whether to enable scroll-to-input behavior (thread screen only) */
  enableScroll?: boolean;
  /** Whether to mark config as changed when applying suggestions */
  markConfigChanged?: boolean;
  /**
   * When true, preserve thread state (stay on thread screen)
   * Used when clicking recommendations from thread screen to update chatbox
   * without navigating back to overview.
   * Default: false
   */
  preserveThreadState?: boolean;
};

export type UseRecommendedActionsReturn = {
  /** Handle recommended action click - delegates to store action + handles UI concerns */
  handleActionClick: (action: Recommendation) => void;
};

/**
 * Hook for managing recommended action clicks with store orchestration
 *
 * Delegates business logic to store.applyRecommendedAction() and handles:
 * - Optional scroll to input (thread screen)
 * - Optional config change marking (thread screen)
 *
 * @example
 * // In thread screen (with scroll + config changes)
 * const recommendedActions = useRecommendedActions({
 *   inputContainerRef,
 *   enableScroll: true,
 *   markConfigChanged: true,
 * })
 *
 * // In overview screen (simple)
 * const recommendedActions = useRecommendedActions({
 *   enableScroll: false,
 *   markConfigChanged: false,
 * })
 *
 * <RoundAnalysisCard onActionClick={recommendedActions.handleActionClick} />
 */
export function useRecommendedActions(
  options: UseRecommendedActionsOptions = {},
): UseRecommendedActionsReturn {
  const {
    inputContainerRef,
    enableScroll = false,
    markConfigChanged = false,
    preserveThreadState = false,
  } = options;

  // Store actions
  const applyRecommendedAction = useChatStore(s => s.applyRecommendedAction);
  const setHasPendingConfigChanges = useChatStore(s => s.setHasPendingConfigChanges);

  // Get tier config and models data for filtering by tier access
  const { data: modelsData } = useModelsQuery();
  const userTierConfig = modelsData?.data?.user_tier_config;
  const allModels = modelsData?.data?.items;

  /**
   * Handle recommended action click
   * Delegates to store action, then handles UI concerns
   */
  const handleActionClick = useCallback((action: Recommendation) => {
    // ✅ BUSINESS LOGIC: Delegate to store action (single source of truth)
    // This handles: full state reset, setting input, applying mode, filtering models by tier, adding participants
    applyRecommendedAction(action, {
      maxModels: userTierConfig?.max_models,
      tierName: userTierConfig?.tier_name,
      userTier: userTierConfig?.tier,
      allModels,
      // ✅ PRESERVE THREAD STATE: When on thread screen, don't reset navigation
      preserveThreadState,
    });

    // ✅ UI CONCERN: Mark config as changed if enabled (thread screen)
    if (markConfigChanged) {
      setHasPendingConfigChanges(true);
    }

    // ✅ UI CONCERN: Scroll to input if enabled (thread screen only)
    if (enableScroll && inputContainerRef?.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inputContainerRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
          // Try to focus the textarea inside
          const textarea = inputContainerRef.current?.querySelector('textarea');
          textarea?.focus();
        });
      });
    }
  }, [
    applyRecommendedAction,
    markConfigChanged,
    setHasPendingConfigChanges,
    enableScroll,
    inputContainerRef,
    userTierConfig,
    allModels,
    preserveThreadState,
  ]);

  // Memoize return object to prevent unnecessary re-renders
  return useMemoizedReturn({
    handleActionClick,
  }, [handleActionClick]);
}
