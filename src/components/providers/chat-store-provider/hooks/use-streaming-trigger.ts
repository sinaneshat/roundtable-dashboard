'use client';

/**
 * Streaming Trigger Hook
 *
 * Handles round 0 streaming trigger for initial thread creation.
 * Also manages timeout protection and pre-search waiting logic.
 */

import type { QueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { AnalysisStatuses, MessageRoles, ScreenModes } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { transformPreSearch } from '@/lib/utils/date-transforms';
import { getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { extractFileContextForSearch, shouldPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils/web-search-utils';
import { executePreSearchStreamService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { AnimationIndices, readPreSearchStreamData } from '@/stores/chat';

import type { ChatHook, CreatePreSearchMutation } from '../types';

type UseStreamingTriggerParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  effectiveThreadId: string;
  queryClientRef: MutableRefObject<QueryClient>;
  createPreSearch: CreatePreSearchMutation;
};

/**
 * Round 0 streaming trigger effect
 *
 * This effect ONLY handles round 0 when handleCreateThread sets waitingToStartStreaming=true.
 * All subsequent rounds (1+) use the pendingMessage effect via handleUpdateThreadAndSend.
 */
export function useStreamingTrigger({
  store,
  chat,
  effectiveThreadId,
  queryClientRef,
  createPreSearch,
}: UseStreamingTriggerParams) {
  const router = useRouter();

  // Subscribe to necessary store state
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);
  const storeParticipants = useStore(store, s => s.participants);
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);
  const storeScreenMode = useStore(store, s => s.screenMode);
  const storePendingAnimations = useStore(store, s => s.pendingAnimations);
  const chatIsStreaming = useStore(store, s => s.isStreaming);

  // Race condition guard
  const startRoundCalledForRoundRef = useRef<number | null>(null);
  const waitingStartTimeRef = useRef<number | null>(null);

  // Main round 0 trigger effect
  useEffect(() => {
    if (!waitingToStart) {
      startRoundCalledForRoundRef.current = null;
      return;
    }

    const currentScreenMode = storeScreenMode;

    // Only handle overview screen - thread screen uses continueFromParticipant
    if (currentScreenMode !== null && currentScreenMode !== ScreenModes.OVERVIEW) {
      return;
    }

    if (currentScreenMode === null) {
      return;
    }

    // Wait for required conditions
    if (!chat.startRound || storeParticipants.length === 0 || storeMessages.length === 0) {
      return;
    }

    // Wait for pre-search completion before streaming participants
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    if (webSearchEnabled) {
      const currentRound = getCurrentRoundNumber(storeMessages);
      const currentRoundPreSearch = storePreSearches.find(ps => ps.roundNumber === currentRound);

      if (!currentRoundPreSearch) {
        return;
      }

      if (currentRoundPreSearch.status === AnalysisStatuses.STREAMING) {
        return;
      }

      // Execute pending pre-search
      if (currentRoundPreSearch.status === AnalysisStatuses.PENDING) {
        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(currentRound)) {
          return;
        }

        currentState.markPreSearchTriggered(currentRound);

        const pendingMsg = currentState.pendingMessage;
        const userMessageForRound = storeMessages.find((msg) => {
          if (msg.role !== MessageRoles.USER)
            return false;
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === currentRound;
        });
        const userQuery = pendingMsg || (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || '';

        if (!userQuery) {
          return;
        }

        const threadIdForSearch = storeThread?.id || effectiveThreadId;
        const isPlaceholder = currentRoundPreSearch.id.startsWith('placeholder-');

        queueMicrotask(() => {
          const executeSearch = async () => {
            try {
              const attachments = store.getState().getAttachments();
              const fileContext = await extractFileContextForSearch(attachments);
              const attachmentIds = store.getState().pendingAttachmentIds || undefined;

              if (isPlaceholder) {
                const createResponse = await createPreSearch.mutateAsync({
                  param: { threadId: threadIdForSearch, roundNumber: currentRound.toString() },
                  json: { userQuery, fileContext: fileContext || undefined, attachmentIds },
                });

                if (createResponse?.data) {
                  const preSearchWithDates = transformPreSearch(createResponse.data);
                  store.getState().addPreSearch({
                    ...preSearchWithDates,
                    status: AnalysisStatuses.STREAMING,
                  });
                }
              } else {
                store.getState().updatePreSearchStatus(currentRound, AnalysisStatuses.STREAMING);
              }

              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
                json: { userQuery, fileContext: fileContext || undefined, attachmentIds },
              });

              if (!response.ok && response.status !== 409) {
                console.error('[startRound] Pre-search execution failed:', response.status);
                store.getState().updatePreSearchStatus(currentRound, AnalysisStatuses.FAILED);
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
                store.getState().updatePreSearchStatus(currentRound, AnalysisStatuses.COMPLETE);
              }

              store.getState().clearPreSearchActivity(currentRound);
              queryClientRef.current.invalidateQueries({
                queryKey: queryKeys.threads.preSearches(threadIdForSearch),
              });
            } catch (error) {
              console.error('[startRound] Pre-search failed:', error);
              store.getState().clearPreSearchActivity(currentRound);
              store.getState().clearPreSearchTracking(currentRound);
            }
          };

          executeSearch();
        });

        return;
      }

      // Check animation status
      const isPreSearchAnimating = storePendingAnimations.has(AnimationIndices.PRE_SEARCH);
      if (isPreSearchAnimating) {
        return;
      }

      // Defensive timing guard
      if (currentRoundPreSearch.status === AnalysisStatuses.COMPLETE && currentRoundPreSearch.completedAt) {
        const completedTime = currentRoundPreSearch.completedAt instanceof Date
          ? currentRoundPreSearch.completedAt.getTime()
          : new Date(currentRoundPreSearch.completedAt).getTime();
        const timeSinceComplete = Date.now() - completedTime;

        if (timeSinceComplete < 50) {
          return;
        }
      }
    }

    // Prevent duplicate startRound calls
    const currentRound = getCurrentRoundNumber(storeMessages);
    if (startRoundCalledForRoundRef.current === currentRound) {
      return;
    }

    if (chat.isTriggeringRef.current || chat.isStreamingRef.current) {
      return;
    }

    startRoundCalledForRoundRef.current = currentRound;
    chat.startRound(storeParticipants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingToStart, chat.startRound, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, storePendingAnimations, store, effectiveThreadId]);

  // Clear waitingToStartStreaming when streaming begins
  useEffect(() => {
    if (waitingToStart && chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setHasSentPendingMessage(true);
    }
  }, [waitingToStart, chatIsStreaming, store]);

  // Timeout protection for stuck streams
  useEffect(() => {
    if (!waitingToStart) {
      waitingStartTimeRef.current = null;
      return;
    }

    if (waitingStartTimeRef.current === null) {
      waitingStartTimeRef.current = Date.now();
    }

    const checkInterval = setInterval(() => {
      const latestState = store.getState();

      if (!latestState.waitingToStartStreaming || latestState.isStreaming) {
        return;
      }

      const now = Date.now();
      const waitingStartTime = waitingStartTimeRef.current ?? now;
      const elapsedWaitingTime = now - waitingStartTime;
      const latestWebSearchEnabled = latestState.thread?.enableWebSearch ?? latestState.enableWebSearch;

      if (!latestState.createdThreadId && elapsedWaitingTime < 60_000) {
        return;
      }

      if (latestWebSearchEnabled) {
        if (latestState.messages.length === 0) {
          if (elapsedWaitingTime < 60_000)
            return;
        } else {
          const currentRound = getCurrentRoundNumber(latestState.messages);
          const preSearchForRound = Array.isArray(latestState.preSearches)
            ? latestState.preSearches.find(ps => ps.roundNumber === currentRound)
            : undefined;

          if (!preSearchForRound) {
            if (elapsedWaitingTime < 60_000)
              return;
          } else {
            const isStillRunning = preSearchForRound.status === AnalysisStatuses.PENDING
              || preSearchForRound.status === AnalysisStatuses.STREAMING;

            if (isStillRunning) {
              const lastActivityTime = latestState.getPreSearchActivityTime(currentRound);
              if (!shouldPreSearchTimeout(preSearchForRound, lastActivityTime, now)) {
                return;
              }
              return;
            } else {
              const PARTICIPANT_START_GRACE_PERIOD_MS = 15_000;
              const completedTime = preSearchForRound.completedAt instanceof Date
                ? preSearchForRound.completedAt.getTime()
                : preSearchForRound.completedAt
                  ? new Date(preSearchForRound.completedAt).getTime()
                  : now;
              const timeSinceComplete = now - completedTime;

              if (timeSinceComplete < PARTICIPANT_START_GRACE_PERIOD_MS) {
                return;
              }
              return;
            }
          }
        }
      } else {
        if (elapsedWaitingTime < TIMEOUT_CONFIG.DEFAULT_MS) {
          return;
        }
      }

      latestState.setWaitingToStartStreaming(false);
      latestState.setIsStreaming(false);
      latestState.setIsCreatingThread(false);
      latestState.resetToOverview();
      router.push('/chat');
      showApiErrorToast('Failed to start conversation', new Error('Streaming failed to start. Please try again.'));
      clearInterval(checkInterval);
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [waitingToStart, store, router]);

  // Auto-complete stuck pre-searches
  useEffect(() => {
    const checkStuckPreSearches = () => {
      store.getState().checkStuckPreSearches();
    };

    const interval = setInterval(checkStuckPreSearches, 5000);
    return () => clearInterval(interval);
  }, [store]);
}
