import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { extractFileContextForSearch, getCurrentRoundNumber, getRoundNumber, shouldPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
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
  const navigate = useNavigate();

  // ✅ STALE SELECTOR FIX: These selectors are kept for effect dependency tracking,
  // but the effect reads fresh state from store.getState() to avoid stale values.
  const {
    waitingToStart,
    chatIsStreaming,
  } = useStore(store, useShallow(s => ({
    waitingToStart: s.waitingToStartStreaming,
    chatIsStreaming: s.isStreaming,
  })));

  const startRoundCalledForRoundRef = useRef<number | null>(null);
  const waitingStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // ✅ STALE SELECTOR FIX: Read fresh state from store instead of relying on selectors
    // React selectors can have stale values due to batching. Reading fresh state ensures
    // we always work with the latest values, preventing "EXIT: not waiting" when store
    // actually has waitingToStartStreaming=true.
    const freshState = store.getState();
    const freshWaitingToStart = freshState.waitingToStartStreaming;
    const freshScreenMode = freshState.screenMode;
    const freshCreatedThreadId = freshState.createdThreadId;
    const freshParticipants = freshState.participants;
    const freshMessages = freshState.messages;
    const freshThread = freshState.thread;
    const freshPreSearches = freshState.preSearches;
    const freshConfigChangeRoundNumber = freshState.configChangeRoundNumber;
    const freshIsWaitingForChangelog = freshState.isWaitingForChangelog;
    const freshIsPatchInProgress = freshState.isPatchInProgress;
    const freshEnableWebSearch = freshState.enableWebSearch;

    rlog.trigger('streaming-trigger', `effect-run wait=${freshWaitingToStart ? 1 : 0} screen=${freshScreenMode} created=${freshCreatedThreadId?.slice(-8) ?? '-'} parts=${freshParticipants.length} msgs=${freshMessages.length}`);

    if (!freshWaitingToStart) {
      startRoundCalledForRoundRef.current = null;
      rlog.trigger('streaming-trigger', 'EXIT: not waiting');
      return;
    }

    const currentScreenMode = freshScreenMode;

    // ✅ FIX: Allow streaming in THREAD mode for:
    // 1. Newly created threads (createdThreadId is set during handleCreateThread)
    // 2. Existing threads with ongoing rounds (freshThread exists)
    // The guard only blocks when:
    // - Not in OVERVIEW mode (initial message submission)
    // - AND not a newly created thread
    // - AND no active thread (shouldn't trigger on random navigation)
    const isNewlyCreatedThread = Boolean(freshCreatedThreadId) && freshWaitingToStart;
    const hasActiveThread = Boolean(freshThread?.id);
    const canStreamInThreadMode = isNewlyCreatedThread || hasActiveThread;
    rlog.trigger('streaming-trigger', `isNewlyCreatedThread=${isNewlyCreatedThread ? 1 : 0} hasThread=${hasActiveThread ? 1 : 0} mode=${currentScreenMode}`);
    if (currentScreenMode !== ScreenModes.OVERVIEW && !canStreamInThreadMode) {
      rlog.trigger('streaming-trigger', 'EXIT: wrong screen mode and no active thread');
      return;
    }

    if (!chat.startRound || freshParticipants.length === 0 || freshMessages.length === 0) {
      rlog.trigger('streaming-trigger', `EXIT: missing data startRound=${!!chat.startRound} parts=${freshParticipants.length} msgs=${freshMessages.length}`);
      return;
    }

    const currentRound = getCurrentRoundNumber(freshMessages);
    // ✅ FIX: Include newly created threads navigating to thread page
    const isInitialThreadCreation = currentRound === 0 && (currentScreenMode === ScreenModes.OVERVIEW || isNewlyCreatedThread) && freshWaitingToStart && freshConfigChangeRoundNumber === null;
    rlog.trigger('streaming-trigger', `r${currentRound} isInitial=${isInitialThreadCreation ? 1 : 0} changelog=${freshIsWaitingForChangelog ? 1 : 0} patch=${freshIsPatchInProgress ? 1 : 0} configChange=${freshConfigChangeRoundNumber}`);
    if ((freshConfigChangeRoundNumber !== null || freshIsWaitingForChangelog || freshIsPatchInProgress) && !isInitialThreadCreation) {
      rlog.trigger('streaming-trigger', 'EXIT: config changes in progress');
      return;
    }

    const webSearchEnabled = freshEnableWebSearch;
    rlog.trigger('streaming-trigger', `webSearch=${webSearchEnabled ? 1 : 0} preSearches=${freshPreSearches.length}`);

    if (webSearchEnabled) {
      const currentRoundPreSearch = freshPreSearches.find(ps => ps.roundNumber === currentRound);

      if (!currentRoundPreSearch) {
        rlog.trigger('streaming-trigger', `EXIT: webSearch enabled but no preSearch for r${currentRound}`);
        return;
      }

      if (currentRoundPreSearch.status === MessageStatuses.STREAMING) {
        const currentState = store.getState();

        const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
        if (!didMark) {
          return;
        }

        const pendingMsg = currentState.pendingMessage;
        const userMessageForRound = freshMessages.find((msg) => {
          if (msg.role !== MessageRoles.USER)
            return false;
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === currentRound;
        });
        const userQuery = pendingMsg || (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || currentRoundPreSearch.userQuery || '';

        if (!userQuery) {
          return;
        }

        const threadIdForSearch = freshThread?.id || effectiveThreadId;

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
        const userMessageForRound = freshMessages.find((msg) => {
          if (msg.role !== MessageRoles.USER)
            return false;
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === currentRound;
        });
        const userQuery = pendingMsg || (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || '';

        if (!userQuery) {
          return;
        }

        const threadIdForSearch = freshThread?.id || effectiveThreadId;

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

      const freshPendingAnimations = freshState.pendingAnimations;
      const isPreSearchAnimating = freshPendingAnimations.has(AnimationIndices.PRE_SEARCH);
      if (isPreSearchAnimating) {
        return;
      }
    }

    rlog.trigger('streaming-trigger', `pre-startRound checks: calledFor=${startRoundCalledForRoundRef.current} triggering=${chat.isTriggeringRef.current ? 1 : 0} streaming=${chat.isStreamingRef.current ? 1 : 0} isReady=${chat.isReady ? 1 : 0}`);

    if (startRoundCalledForRoundRef.current === currentRound) {
      rlog.trigger('streaming-trigger', `EXIT: already called for r${currentRound}`);
      return;
    }

    if (chat.isTriggeringRef.current || chat.isStreamingRef.current) {
      rlog.trigger('streaming-trigger', 'EXIT: already triggering or streaming');
      return;
    }

    // ✅ FIX: For newly created threads, bypass isReady check
    // When thread is created, the provider's initialMessages is empty (captured at mount).
    // The AI SDK hasn't been hydrated, so isReady is false (msgs=0).
    // But we have store messages to pass to startRound, which will hydrate the AI SDK.
    // So we skip the isReady check when: (1) isReady is false, (2) we have store messages, (3) this is a new thread
    const canBypassReadyCheck = !chat.isReady && freshMessages.length > 0 && isNewlyCreatedThread;
    if (!chat.isReady && !canBypassReadyCheck) {
      rlog.trigger('streaming-trigger', `EXIT: chat not ready - msgs.length=${chat.messages?.length ?? 0}`);
      return;
    }
    startRoundCalledForRoundRef.current = currentRound;

    rlog.trigger('streaming-trigger', `CALLING startRound r${currentRound} parts=${freshParticipants.length} msgs=${freshMessages.length} bypassReady=${canBypassReadyCheck ? 1 : 0}`);
    queueMicrotask(() => {
      chat.startRound(freshParticipants, freshMessages);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- uses fresh state from store.getState(), selectors just for triggering
  }, [waitingToStart, chat.startRound, chat.isReady, chat.isTriggeringRef, chat.isStreamingRef, store, effectiveThreadId, queryClientRef]);

  // ✅ STALE SELECTOR FIX: Read fresh state to avoid clearing based on stale selectors
  useEffect(() => {
    const freshState = store.getState();
    if (freshState.waitingToStartStreaming && freshState.isStreaming) {
      // ✅ PREFILLED RESUMPTION FIX: Don't clear flags if this is a prefilled resumption
      // During prefilled resumption (phase=participants), AI SDK may resume a different
      // participant's stream than what we need to trigger. We shouldn't clear the flags
      // because our target participant (nextParticipantToTrigger) hasn't been triggered yet.
      if (freshState.streamResumptionPrefilled && freshState.currentResumptionPhase === 'participants') {
        return;
      }

      freshState.setWaitingToStartStreaming(false);
      freshState.setHasSentPendingMessage(true);
      // ✅ FIX: Also clear nextParticipantToTrigger to prevent re-trigger after stream ends
      // Without this, use-round-resumption sees the old nextP value and triggers again
      if (freshState.nextParticipantToTrigger !== null) {
        freshState.setNextParticipantToTrigger(null);
      }
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
              // completedAt is always a string or null (ISO format from JSON serialization)
              const completedTime = preSearchForRound.completedAt
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
      navigate({ to: '/chat' });
      showApiErrorToast('Failed to start conversation', new Error('Streaming failed to start. Please try again.'));
      clearInterval(checkInterval);
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [waitingToStart, store, navigate]);

  useEffect(() => {
    const checkStuckPreSearches = () => {
      store.getState().checkStuckPreSearches();
    };

    checkStuckPreSearches();

    const interval = setInterval(checkStuckPreSearches, 5000);
    return () => clearInterval(interval);
  }, [store]);

  // ✅ STUCK STATE RECOVERY: Detect and recover from stuck resumption states
  // When navigation occurs mid-resumption, state can become stuck:
  // - waitingToStartStreaming: true (from previous thread)
  // - streamResumptionPrefilled: false or mismatched thread
  // - AI SDK not streaming
  // - Store not streaming
  // This interval detects this stuck state and clears it to allow new resumption
  useEffect(() => {
    const interval = setInterval(() => {
      const s = store.getState();

      // Only check if we think we're waiting to start streaming
      if (!s.waitingToStartStreaming) return;

      // Check if resumption state is valid for current thread
      const validResumption = s.streamResumptionPrefilled
        && s.prefilledForThreadId === s.thread?.id;

      // Check if AI SDK is actively streaming (use ref for synchronous check)
      const aiSdkActive = chat.isStreamingRef.current;

      // If no valid resumption AND AI SDK not active AND store not streaming
      // This is a stuck state - reset it
      if (!validResumption && !aiSdkActive && !s.isStreaming) {
        rlog.trigger('stuck-recovery', `clearing stuck state: prefilled=${s.streamResumptionPrefilled ? 1 : 0} prefilledThread=${s.prefilledForThreadId?.slice(-8) ?? '-'} currentThread=${s.thread?.id?.slice(-8) ?? '-'}`);
        s.setWaitingToStartStreaming(false);
        s.setNextParticipantToTrigger(null);
        s.clearStreamResumption();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [store, chat.isStreamingRef]);
}
