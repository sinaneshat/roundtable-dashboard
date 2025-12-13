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

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { FeedbackType } from '@/api/core/enums';
import type { RoundFeedbackData } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useSetRoundFeedbackMutation } from '@/hooks/mutations/chat-mutations';
import { useMemoizedReturn } from '@/lib/utils/memo-utils';

export type UseFeedbackActionsOptions = {
  threadId: string;
};

export type UseFeedbackActionsReturn = {
  /** Get feedback handler for a specific round */
  getFeedbackHandler: (roundNumber: number) => (feedbackType: FeedbackType | null) => void;
  /** Load feedback from server (called once on mount) */
  loadFeedback: (data: RoundFeedbackData[]) => void;
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

  // Store actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setFeedback: s.setFeedback,
    setPendingFeedback: s.setPendingFeedback,
    loadFeedbackFromServer: s.loadFeedbackFromServer,
  })));

  // Mutation
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();

  /**
   * Get feedback handler for a specific round
   * Returns a stable callback that updates store and triggers mutation
   */
  const getFeedbackHandler = useCallback((roundNumber: number) => {
    return (feedbackType: FeedbackType | null) => {
      // Update store immediately (optimistic)
      actions.setFeedback(roundNumber, feedbackType);

      if (feedbackType) {
        actions.setPendingFeedback({ roundNumber, type: feedbackType });
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
            actions.setPendingFeedback(null);
          },
        },
      );
    };
  }, [threadId, actions, setRoundFeedbackMutation]);

  /**
   * Load feedback from server
   * Called once on mount with server data
   */
  const loadFeedback = useCallback((data: RoundFeedbackData[]) => {
    actions.loadFeedbackFromServer(data);
  }, [actions]);

  return useMemoizedReturn({
    getFeedbackHandler,
    loadFeedback,
  }, [getFeedbackHandler, loadFeedback]);
}
