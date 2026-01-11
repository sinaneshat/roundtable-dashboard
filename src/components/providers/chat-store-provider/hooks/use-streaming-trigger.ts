'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { MessageRoles, MessageStatuses, ScreenModes } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { extractFileContextForSearch, getCurrentRoundNumber, getRoundNumber, shouldPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils';
import { executePreSearchStreamService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { AnimationIndices, getEffectiveWebSearchEnabled, readPreSearchStreamData } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseStreamingTriggerParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  effectiveThreadId: string;
  queryClientRef: RefObject<QueryClient>;
};

export function useStreamingTrigger({
  store,
  chat,
  effectiveThreadId,
  queryClientRef,
}: UseStreamingTriggerParams) {
  const router = useRouter();

  const {
    waitingToStart,
    storeParticipants,
    storeMessages,
    storePreSearches,
    storeThread,
    storeScreenMode,
    storePendingAnimations,
    chatIsStreaming,
    formEnableWebSearch,
    isWaitingForChangelog,
    configChangeRoundNumber,
    isPatchInProgress,
  } = useStore(store, useShallow(s => ({
    waitingToStart: s.waitingToStartStreaming,
    storeParticipants: s.participants,
    storeMessages: s.messages,
    storePreSearches: s.preSearches,
    storeThread: s.thread,
    storeScreenMode: s.screenMode,
    storePendingAnimations: s.pendingAnimations,
    chatIsStreaming: s.isStreaming,
    formEnableWebSearch: s.enableWebSearch,
    isWaitingForChangelog: s.isWaitingForChangelog,
    configChangeRoundNumber: s.configChangeRoundNumber,
    isPatchInProgress: s.isPatchInProgress,
  })));

  const startRoundCalledForRoundRef = useRef<number | null>(null);
  const waitingStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!waitingToStart) {
      startRoundCalledForRoundRef.current = null;
      return;
    }

    const currentScreenMode = storeScreenMode;

    if (currentScreenMode !== ScreenModes.OVERVIEW) {
      return;
    }

    if (!chat.startRound || storeParticipants.length === 0 || storeMessages.length === 0) {
      return;
    }

    const currentRound = getCurrentRoundNumber(storeMessages);
    const isInitialThreadCreation = currentRound === 0 && currentScreenMode === ScreenModes.OVERVIEW && waitingToStart && configChangeRoundNumber === null;
    if ((configChangeRoundNumber !== null || isWaitingForChangelog || isPatchInProgress) && !isInitialThreadCreation) {
      return;
    }

    const webSearchEnabled = formEnableWebSearch;

    if (webSearchEnabled) {
      const currentRoundPreSearch = storePreSearches.find(ps => ps.roundNumber === currentRound);

      if (!currentRoundPreSearch) {
        return;
      }

      if (currentRoundPreSearch.status === MessageStatuses.STREAMING) {
        const currentState = store.getState();

        const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
        if (!didMark) {
          return;
        }

        const pendingMsg = currentState.pendingMessage;
        const userMessageForRound = storeMessages.find((msg) => {
          if (msg.role !== MessageRoles.USER)
            return false;
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === currentRound;
        });
        const userQuery = pendingMsg || (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || currentRoundPreSearch.userQuery || '';

        if (!userQuery) {
          return;
        }

        const threadIdForSearch = storeThread?.id || effectiveThreadId;

        queueMicrotask(() => {
          const resumeSearch = async () => {
            try {
              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
                json: { userQuery },
              });

              if (response.status === 202) {
                return;
              }

              if (response.status === 409) {
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

        return;
      }

      if (currentRoundPreSearch.status === MessageStatuses.PENDING) {
        const currentState = store.getState();

        const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
        if (!didMark) {
          return;
        }

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

        queueMicrotask(() => {
          const executeSearch = async () => {
            try {
              const attachments = store.getState().getAttachments();
              const fileContext = await extractFileContextForSearch(attachments);
              const attachmentIds = store.getState().pendingAttachmentIds || undefined;

              store.getState().updatePreSearchStatus(currentRound, MessageStatuses.STREAMING);

              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
                json: { userQuery, fileContext: fileContext || undefined, attachmentIds },
              });

              if (!response.ok && response.status !== 409) {
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

          executeSearch();
        });

        return;
      }

      const isPreSearchAnimating = storePendingAnimations.has(AnimationIndices.PRE_SEARCH);
      if (isPreSearchAnimating) {
        return;
      }
    }

    if (startRoundCalledForRoundRef.current === currentRound) {
      return;
    }

    if (chat.isTriggeringRef.current || chat.isStreamingRef.current) {
      return;
    }

    if (!chat.isReady) {
      return;
    }
    startRoundCalledForRoundRef.current = currentRound;

    queueMicrotask(() => {
      chat.startRound(storeParticipants, storeMessages);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- individual chat properties listed, not whole object
  }, [waitingToStart, chat.startRound, chat.isReady, chat.isTriggeringRef, chat.isStreamingRef, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, storePendingAnimations, store, effectiveThreadId, formEnableWebSearch, configChangeRoundNumber, isWaitingForChangelog, isPatchInProgress, queryClientRef]);

  useEffect(() => {
    if (waitingToStart && chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setHasSentPendingMessage(true);
    }
  }, [waitingToStart, chatIsStreaming, store]);

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
      const latestWebSearchEnabled = getEffectiveWebSearchEnabled(latestState.thread, latestState.enableWebSearch);

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
            const isStillRunning = preSearchForRound.status === MessageStatuses.PENDING
              || preSearchForRound.status === MessageStatuses.STREAMING;

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

  useEffect(() => {
    const checkStuckPreSearches = () => {
      store.getState().checkStuckPreSearches();
    };

    checkStuckPreSearches();

    const interval = setInterval(checkStuckPreSearches, 5000);
    return () => clearInterval(interval);
  }, [store]);
}
