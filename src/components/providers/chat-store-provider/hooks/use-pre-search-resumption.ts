'use client';

/**
 * Pre-Search Resumption Hook
 *
 * ✅ FIX: Handles resuming streaming pre-searches after page refresh
 *
 * Bug Scenario:
 * 1. User starts a pre-search (status: STREAMING)
 * 2. User refreshes the page during streaming
 * 3. Store hydrates with preSearch.status='streaming' but:
 *    - triggeredPreSearchRounds is EMPTY (Set not persisted)
 *    - waitingToStartStreaming may be false
 * 4. BUG: No hook attempts to resume the stream
 * 5. UI shows "Searching..." stuck indefinitely
 *
 * This hook detects streaming pre-searches that aren't tracked locally
 * and attempts to resume them via the backend (which handles KV buffer
 * resumption or re-execution).
 */

import type { QueryClient } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { MessageRoles, MessageStatuses } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { executePreSearchStreamService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { readPreSearchStreamData } from '@/stores/chat';

type UsePreSearchResumptionParams = {
  store: ChatStoreApi;
  effectiveThreadId: string;
  queryClientRef: MutableRefObject<QueryClient>;
};

/**
 * Handles resuming streaming pre-searches after page refresh
 *
 * This hook runs independently of waitingToStartStreaming and detects
 * when a pre-search is in STREAMING status but hasn't been triggered locally.
 */
export function usePreSearchResumption({
  store,
  effectiveThreadId,
  queryClientRef,
}: UsePreSearchResumptionParams) {
  // Subscribe to store state
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);
  const hasInitiallyLoaded = useStore(store, s => s.hasInitiallyLoaded);
  const isStreaming = useStore(store, s => s.isStreaming);

  // Track which rounds we've attempted resumption for
  const attemptedResumptionRef = useRef<Set<number>>(new Set());

  // Pre-search resumption effect
  useEffect(() => {
    // Wait for initial load to complete
    if (!hasInitiallyLoaded) {
      return;
    }

    // Don't interfere with active participant streaming
    if (isStreaming) {
      return;
    }

    // Need messages to determine current round
    if (storeMessages.length === 0) {
      return;
    }

    // Check if web search is enabled
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    if (!webSearchEnabled) {
      return;
    }

    // Find pre-search for current round
    const currentRound = getCurrentRoundNumber(storeMessages);
    const currentRoundPreSearch = storePreSearches.find(ps => ps.roundNumber === currentRound);

    if (!currentRoundPreSearch) {
      return;
    }

    // Only handle STREAMING status that needs resumption
    if (currentRoundPreSearch.status !== MessageStatuses.STREAMING) {
      return;
    }

    // Prevent duplicate resumption attempts for same round
    if (attemptedResumptionRef.current.has(currentRound)) {
      return;
    }

    // 🚨 ATOMIC CHECK-AND-MARK: Prevents race condition between multiple components
    const currentState = store.getState();
    const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
    if (!didMark) {
      // Already triggered locally, stream should be running
      return;
    }

    // ✅ RESUMPTION: Pre-search is streaming but not tracked locally = page refresh scenario
    // Mark as attempted
    attemptedResumptionRef.current.add(currentRound);

    // Get user query
    const userMessageForRound = storeMessages.find((msg) => {
      if (msg.role !== MessageRoles.USER)
        return false;
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === currentRound;
    });
    const userQuery = (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || currentRoundPreSearch.userQuery || '';

    if (!userQuery) {
      return;
    }

    const threadIdForSearch = storeThread?.id || effectiveThreadId;

    // Execute resumption
    queueMicrotask(() => {
      const resumeSearch = async () => {
        try {
          // Call execute endpoint - backend handles resume from KV buffer or re-execution
          // Backend returns: live stream (buffer exists), 202 (stream active), or re-executes if timed out
          const response = await executePreSearchStreamService({
            param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
            json: { userQuery },
          });

          // 202 means stream is active but buffer unavailable, poll for completion
          // checkStuckPreSearches interval will handle completion detection
          if (response.status === 202) {
            return;
          }

          // 409 means another stream already active
          if (response.status === 409) {
            return;
          }

          if (!response.ok) {
            console.error('[usePreSearchResumption] Pre-search resumption failed:', response.status);
            store.getState().updatePreSearchStatus(currentRound, MessageStatuses.FAILED);
            store.getState().clearPreSearchActivity(currentRound);
            return;
          }

          // Read the resumed/re-executed stream
          const searchData = await readPreSearchStreamData(
            response,
            () => store.getState().updatePreSearchActivity(currentRound),
            partialData => store.getState().updatePartialPreSearchData(currentRound, partialData),
          );

          if (searchData) {
            store.getState().updatePreSearchData(currentRound, searchData);
          } else {
            store.getState().updatePreSearchStatus(currentRound, MessageStatuses.COMPLETE);
          }

          store.getState().clearPreSearchActivity(currentRound);
          queryClientRef.current.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(threadIdForSearch),
          });
        } catch (error) {
          console.error('[usePreSearchResumption] Pre-search resumption error:', error);
          store.getState().clearPreSearchActivity(currentRound);
          store.getState().clearPreSearchTracking(currentRound);
        }
      };

      resumeSearch();
    });
  }, [
    hasInitiallyLoaded,
    isStreaming,
    storeMessages,
    storePreSearches,
    storeThread,
    store,
    effectiveThreadId,
    queryClientRef,
  ]);

  // Reset attempt tracking on thread change
  useEffect(() => {
    attemptedResumptionRef.current = new Set();
  }, [effectiveThreadId]);
}
