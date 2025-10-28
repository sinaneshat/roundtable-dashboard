/**
 * Feedback Actions Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Bridges feedback state with mutations and manages round feedback.
 *
 * Location: /src/stores/chat/actions/feedback-actions.ts
 * Used by: ChatThreadScreen
 */

'use client';

import { useCallback, useMemo } from 'react';

import type { FeedbackType } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useSetRoundFeedbackMutation } from '@/hooks/mutations/chat-mutations';

export type UseFeedbackActionsOptions = {
  threadId: string;
};

export type UseFeedbackActionsReturn = {
  /** Get feedback handler for a specific round */
  getFeedbackHandler: (roundNumber: number) => (feedbackType: FeedbackType | null) => void;
  /** Load feedback from server (called once on mount) */
  loadFeedback: (data: Array<{ roundNumber: number; feedbackType: FeedbackType | null }>) => void;
  /** Clear feedback for a round (used during regeneration) */
  clearRoundFeedback: (roundNumber: number) => void;
};

/**
 * Hook for managing round feedback with store + mutations
 *
 * Orchestrates feedback state and server synchronization.
 * Eliminates the need for local Map state and complex useEffect chains.
 *
 * @example
 * const feedbackActions = useFeedbackActions({ threadId })
 *
 * // Load initial feedback from server
 * feedbackActions.loadFeedback(serverData)
 *
 * // Get handler for a specific round
 * const handleFeedback = feedbackActions.getFeedbackHandler(roundNumber)
 * handleFeedback('like')
 */
export function useFeedbackActions(options: UseFeedbackActionsOptions): UseFeedbackActionsReturn {
  const { threadId } = options;

  // Store selectors
  const setFeedback = useChatStore(s => s.setFeedback);
  const setPendingFeedback = useChatStore(s => s.setPendingFeedback);
  const clearFeedback = useChatStore(s => s.clearFeedback);
  const loadFeedbackFromServer = useChatStore(s => s.loadFeedbackFromServer);

  // Mutation
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();

  /**
   * Get feedback handler for a specific round
   * Returns a stable callback that updates store and triggers mutation
   */
  const getFeedbackHandler = useCallback((roundNumber: number) => {
    return (feedbackType: 'like' | 'dislike' | null) => {
      // Update store immediately (optimistic)
      setFeedback(roundNumber, feedbackType);

      if (feedbackType) {
        setPendingFeedback({ roundNumber, type: feedbackType });
      }

      // Trigger mutation to persist to server
      setRoundFeedbackMutation.mutate(
        {
          param: {
            threadId,
            roundNumber: String(roundNumber),
          },
          json: { feedbackType },
        },
        {
          onSettled: () => {
            setPendingFeedback(null);
          },
        },
      );
    };
  }, [threadId, setFeedback, setPendingFeedback, setRoundFeedbackMutation]);

  /**
   * Load feedback from server
   * Called once on mount with server data
   */
  const loadFeedback = useCallback((data: Array<{ roundNumber: number; feedbackType: 'like' | 'dislike' | null }>) => {
    loadFeedbackFromServer(data);
  }, [loadFeedbackFromServer]);

  /**
   * Clear feedback for a round
   * Used during regeneration to reset feedback state
   */
  const clearRoundFeedback = useCallback((roundNumber: number) => {
    clearFeedback(roundNumber);
  }, [clearFeedback]);

  // Memoize return object to prevent unnecessary re-renders
  // Even though individual functions are memoized, object literal creates new reference
  return useMemo(() => ({
    getFeedbackHandler,
    loadFeedback,
    clearRoundFeedback,
  }), [getFeedbackHandler, loadFeedback, clearRoundFeedback]);
}
