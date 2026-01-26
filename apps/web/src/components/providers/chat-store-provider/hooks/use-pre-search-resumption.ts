import { MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { getCurrentRoundNumber, getRoundNumber } from '@/lib/utils';
import { executePreSearchStreamService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { readPreSearchStreamData } from '@/stores/chat';

type UsePreSearchResumptionParams = {
  store: ChatStoreApi;
  effectiveThreadId: string;
  queryClientRef: RefObject<QueryClient>;
};

export function usePreSearchResumption({
  effectiveThreadId,
  queryClientRef,
  store,
}: UsePreSearchResumptionParams) {
  const {
    enableWebSearch,
    hasInitiallyLoaded,
    isStreaming,
    messages,
    preSearches,
    thread,
  } = useStore(store, useShallow(s => ({
    enableWebSearch: s.enableWebSearch,
    hasInitiallyLoaded: s.hasInitiallyLoaded,
    isStreaming: s.isStreaming,
    messages: s.messages,
    preSearches: s.preSearches,
    thread: s.thread,
  })));

  const attemptedResumptionRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!hasInitiallyLoaded) {
      return;
    }

    if (isStreaming) {
      return;
    }

    if (messages.length === 0) {
      return;
    }

    if (!enableWebSearch) {
      return;
    }

    const currentRound = getCurrentRoundNumber(messages);
    const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === currentRound);

    if (!currentRoundPreSearch) {
      return;
    }

    if (currentRoundPreSearch.status !== MessageStatuses.STREAMING) {
      return;
    }

    if (attemptedResumptionRef.current.has(currentRound)) {
      return;
    }

    const currentState = store.getState();
    const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
    if (!didMark) {
      return;
    }

    attemptedResumptionRef.current.add(currentRound);

    const userMessageForRound = messages.find((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === currentRound;
    });
    const userQuery = (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || currentRoundPreSearch.userQuery || '';

    if (!userQuery) {
      return;
    }

    const threadIdForSearch = thread?.id || effectiveThreadId;

    queueMicrotask(() => {
      const resumeSearch = async () => {
        try {
          const response = await executePreSearchStreamService({
            json: { userQuery },
            param: { roundNumber: String(currentRound), threadId: threadIdForSearch },
          });

          if (response.status === 202 || response.status === 409) {
            return;
          }

          if (!response.ok) {
            store.getState().updatePreSearchStatus(currentRound, MessageStatuses.FAILED);
            store.getState().clearPreSearchActivity(currentRound);
            return;
          }

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
        } catch {
          store.getState().clearPreSearchActivity(currentRound);
          store.getState().clearPreSearchTracking(currentRound);
        }
      };

      resumeSearch();
    });
  }, [
    hasInitiallyLoaded,
    isStreaming,
    messages,
    preSearches,
    thread,
    enableWebSearch,
    store,
    effectiveThreadId,
    queryClientRef,
  ]);

  useEffect(() => {
    attemptedResumptionRef.current = new Set();
  }, [effectiveThreadId]);
}
