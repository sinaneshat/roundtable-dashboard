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

import { useCallback, useMemo } from 'react';

import type { RecommendedAction } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useModelsQuery } from '@/hooks/queries/models';
import { toastManager } from '@/lib/toast/toast-manager';

export type UseRecommendedActionsOptions = {
  /** Optional ref to input container for scrolling behavior */
  inputContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Whether to enable scroll-to-input behavior (thread screen only) */
  enableScroll?: boolean;
  /** Whether to mark config as changed when applying suggestions */
  markConfigChanged?: boolean;
};

export type UseRecommendedActionsReturn = {
  /** Handle recommended action click - delegates to store action + handles UI concerns */
  handleActionClick: (action: RecommendedAction) => void;
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
  } = options;

  // Store actions
  const applyRecommendedAction = useChatStore(s => s.applyRecommendedAction);
  const setHasPendingConfigChanges = useChatStore(s => s.setHasPendingConfigChanges);

  // Get tier config for validation
  const { data: modelsData } = useModelsQuery();
  const userTierConfig = modelsData?.data?.user_tier_config;

  /**
   * Handle recommended action click
   * Delegates to store action, then handles UI concerns
   */
  const handleActionClick = useCallback((action: RecommendedAction) => {
    // ✅ BUSINESS LOGIC: Delegate to store action (single source of truth)
    // This handles: setting input, applying mode, deduplicating/adding participants
    const result = applyRecommendedAction(action, {
      maxModels: userTierConfig?.max_models,
      tierName: userTierConfig?.tier_name,
    });

    // ✅ VALIDATION FEEDBACK: Show error if models couldn't be added due to limits
    if (result.error) {
      toastManager.error('Model Limit Reached', result.error);
    } else if (result.modelsAdded && result.modelsAdded > 0) {
      // Optional: Show success message when models are added
      const modelText = result.modelsAdded === 1 ? 'model' : 'models';
      toastManager.success(
        'Recommendation Applied',
        `Added ${result.modelsAdded} ${modelText} to your conversation`,
      );
    }

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
  ]);

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(() => ({
    handleActionClick,
  }), [handleActionClick]);
}
