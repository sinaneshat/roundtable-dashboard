/**
 * Round Polling Hook - V2
 *
 * Polls for round completion when page loads mid-round.
 * Replaces complex resumption logic with simple polling.
 *
 * KEY INSIGHT:
 * - Backend queue system completes rounds independently
 * - No need for client-side streaming resumption
 * - Just poll until backend finishes, then sync from backend
 *
 * DETECTION:
 * - Round has user message but no moderator message
 * - Flow state is round_complete but round is incomplete
 *
 * BEHAVIOR:
 * - Poll GET /threads/:id/rounds/:round/status every 2s
 * - When complete, sync full thread state from backend (syncFromBackend)
 * - Stop polling on navigation or timeout
 *
 * SYNC BEHAVIOR:
 * - Uses syncFromBackend to ensure store = DB truth
 * - Replaces simple setMessages with full state reconciliation
 */

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';

import { getThreadBySlugService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat-v2';

type UseRoundPollingParams = {
  store: ChatStoreApi;
  /** Thread slug for fetching complete thread state */
  slug?: string;
  /** Polling interval in ms (default 2000) */
  pollInterval?: number;
  /** Maximum poll duration before giving up (default 60000 = 1 minute) */
  maxPollDuration?: number;
  /** Callback when sync completes */
  onSyncComplete?: () => void;
};

type RoundStatusResponse = {
  success: boolean;
  data?: {
    isComplete: boolean;
    participantsComplete: number;
    totalParticipants: number;
    hasModeratorMessage: boolean;
  };
};

/**
 * Check if a round is incomplete in the current messages
 */
function isRoundIncomplete(messages: UIMessage[], round: number): boolean {
  const roundMessages = messages.filter((m) => {
    const meta = m.metadata as Record<string, unknown> | undefined;
    return meta?.roundNumber === round;
  });

  // Round is incomplete if it has user message but no moderator message
  const hasUserMessage = roundMessages.some((m) => {
    const meta = m.metadata as Record<string, unknown> | undefined;
    return meta?.role === 'user';
  });

  const hasModeratorMessage = roundMessages.some((m) => {
    const meta = m.metadata as Record<string, unknown> | undefined;
    return meta?.isModerator === true;
  });

  return hasUserMessage && !hasModeratorMessage;
}

/**
 * Round polling hook - polls backend until round is complete, then syncs
 */
export function useRoundPolling({
  store,
  slug,
  pollInterval = 2000,
  maxPollDuration = 60000,
  onSyncComplete,
}: UseRoundPollingParams): void {
  const pollingRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Fetch round status from backend
   */
  const checkRoundStatus = useCallback(async (
    threadId: string,
    round: number,
  ): Promise<boolean> => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const response = await fetch(
        `/api/v1/chat/${threadId}/rounds/${round}/status`,
        { signal: abortRef.current.signal },
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as RoundStatusResponse;
      return data.success && data.data?.isComplete === true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return false;
      }
      // Silently fail for status checks - polling will retry
      return false;
    }
  }, []);

  /**
   * Sync store from backend - full state reconciliation
   */
  const syncFromBackend = useCallback(async (threadSlug: string): Promise<boolean> => {
    try {
      const response = await getThreadBySlugService({
        param: { slug: threadSlug },
      });

      if (response.success && response.data) {
        store.getState().syncFromBackend(response.data);
        return true;
      }
      return false;
    } catch {
      // Silently fail for sync - will be retried on next poll or user refresh
      return false;
    }
  }, [store]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    startTimeRef.current = null;
  }, []);

  /**
   * Main polling effect
   */
  useEffect(() => {
    const unsubscribe = store.subscribe((state) => {
      const { flow, messages, thread } = state;

      // Only poll in round_complete state (page refresh scenario)
      if (flow.type !== 'round_complete' || !thread) {
        stopPolling();
        return;
      }

      const currentRound = flow.round;
      const threadId = flow.threadId;

      // Check if the current round is actually incomplete
      if (!isRoundIncomplete(messages, currentRound)) {
        // Round is complete, no need to poll
        stopPolling();
        return;
      }

      // Start polling if not already polling
      if (pollingRef.current !== null) {
        return; // Already polling
      }

      startTimeRef.current = Date.now();

      const poll = async () => {
        // Check timeout
        if (startTimeRef.current && Date.now() - startTimeRef.current > maxPollDuration) {
          // Polling timeout reached - stop silently
          stopPolling();
          return;
        }

        const isComplete = await checkRoundStatus(threadId, currentRound);

        if (isComplete) {
          // Sync full state from backend
          if (slug) {
            const synced = await syncFromBackend(slug);
            if (synced) {
              onSyncComplete?.();
            }
          }
          stopPolling();
          return;
        }

        // Schedule next poll
        // Timeout is stored in pollingRef and cleared by stopPolling() in useEffect cleanup (line 217)
        // eslint-disable-next-line react-web-api/no-leaked-timeout
        pollingRef.current = window.setTimeout(() => {
          void poll();
        }, pollInterval);
      };

      // Start first poll via immediate invocation
      void poll();
    });

    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [store, slug, pollInterval, maxPollDuration, checkRoundStatus, syncFromBackend, stopPolling, onSyncComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);
}

export type UseRoundPollingReturn = void;
