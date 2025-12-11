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
import { useShallow } from 'zustand/react/shallow';

import type { ArticleRecommendation } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { afterPaint } from '@/lib/ui/browser-timing';
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
  handleActionClick: (action: ArticleRecommendation) => void;
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

  // Store actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    applyRecommendedAction: s.applyRecommendedAction,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
  })));

  /**
   * Handle recommended action click
   * ✅ ARTICLE-STYLE: Simplified - just sets input value from recommendation title
   */
  const handleActionClick = useCallback((action: ArticleRecommendation) => {
    // ✅ BUSINESS LOGIC: Delegate to store action (single source of truth)
    // This handles: setting input value from recommendation title
    actions.applyRecommendedAction(action, {
      // ✅ PRESERVE THREAD STATE: When on thread screen, don't reset navigation
      preserveThreadState,
    });

    // ✅ UI CONCERN: Mark config as changed if enabled (thread screen)
    if (markConfigChanged) {
      actions.setHasPendingConfigChanges(true);
    }

    // ✅ AUTO-SCROLL DISABLED: No forced scrolling - user controls scroll position
    // Focus textarea without scrolling (user can use scroll-to-bottom button if needed)
    if (enableScroll && inputContainerRef?.current) {
      afterPaint(() => {
        const textarea = inputContainerRef.current?.querySelector('textarea');
        textarea?.focus({ preventScroll: true });
      });
    }
  }, [
    actions,
    markConfigChanged,
    enableScroll,
    inputContainerRef,
    preserveThreadState,
  ]);

  // Memoize return object to prevent unnecessary re-renders
  return useMemoizedReturn({
    handleActionClick,
  }, [handleActionClick]);
}
