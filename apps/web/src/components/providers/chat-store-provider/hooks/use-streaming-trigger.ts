import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { extractFileContextForSearch, getCurrentRoundNumber, getRoundNumber } from '@/lib/utils';
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
  // ✅ STALE SELECTOR FIX: These selectors are kept for effect dependency tracking,
  // but the effect reads fresh state from store.getState() to avoid stale values.
  const {
    waitingToStart,
    chatIsStreaming,
    hasSentPending,
  } = useStore(store, useShallow(s => ({
    waitingToStart: s.waitingToStartStreaming,
    chatIsStreaming: s.isStreaming,
    hasSentPending: s.hasSentPendingMessage,
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

    rlog.flow('trigger', `EFFECT-RUN wait=${freshWaitingToStart ? 1 : 0} screen=${freshScreenMode} created=${freshCreatedThreadId?.slice(-8) ?? '-'} parts=${freshParticipants.length} msgs=${freshMessages.length} thread=${freshThread?.id?.slice(-8) ?? '-'} hasSent=${freshState.hasSentPendingMessage ? 1 : 0}`);
    rlog.trigger('streaming-trigger', `effect-run wait=${freshWaitingToStart ? 1 : 0} screen=${freshScreenMode} created=${freshCreatedThreadId?.slice(-8) ?? '-'} parts=${freshParticipants.length} msgs=${freshMessages.length}`);

    if (!freshWaitingToStart) {
      startRoundCalledForRoundRef.current = null;
      rlog.flow('trigger', 'EXIT-EARLY: waitingToStartStreaming=false');
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

    // ✅ RACE CONDITION FIX: Split checks with recovery for parts=0 but msgs>0
    if (!chat.startRound || freshMessages.length === 0) {
      rlog.trigger('streaming-trigger', `EXIT: startRound=${!!chat.startRound} msgs=${freshMessages.length}`);
      return;
    }

    if (freshParticipants.length === 0) {
      rlog.trigger('streaming-trigger', `RECOVERY-NEEDED: parts=0 but msgs=${freshMessages.length}`);
      // Clear flags to prevent infinite loop, let screen-init handle recovery
      freshState.setWaitingToStartStreaming(false);
      freshState.setStreamingRoundNumber(null);
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
        rlog.trigger('clear-guard', 'skip: prefilled resumption');
        return;
      }

      // ✅ STREAMING BUG FIX: Don't clear until message actually sent to AI SDK
      // startRound() sets isStreaming=true sync via flushSync, but actual send is in queueMicrotask
      // hasSentPendingMessage is set by startRound AFTER aiSendMessage() returns (not before)
      // Without this guard, we clear waitingToStartStreaming before the API call happens
      if (!freshState.hasSentPendingMessage) {
        rlog.trigger('clear-guard', `skip: msg not sent (pending=${freshState.pendingMessage?.slice(0, 20) ?? '-'})`);
        return;
      }

      // ✅ RACE CONDITION FIX (Issue 1): Don't clear if pre-search still streaming
      // When web search is enabled, pre-search streams before participant streaming.
      // If we clear waitingToStartStreaming while pre-search is still active, navigation
      // or other effects could leave the round in a stuck state. The pre-search must
      // complete or abort before we clear the waiting flag.
      const webSearchEnabled = getEffectiveWebSearchEnabled(freshState.thread, freshState.enableWebSearch);
      if (webSearchEnabled) {
        const currentRound = getCurrentRoundNumber(freshState.messages);
        const preSearchForRound = freshState.preSearches.find(ps => ps.roundNumber === currentRound);
        if (preSearchForRound && preSearchForRound.status === MessageStatuses.STREAMING) {
          rlog.trigger('clear-guard', `skip: preSearch still streaming for r${currentRound}`);
          return;
        }
      }

      rlog.trigger('clear-flags', `clearing waitingToStart (sent=${freshState.hasSentPendingMessage})`);
      freshState.setWaitingToStartStreaming(false);
      // ✅ REMOVED: Don't set hasSentPendingMessage here - startRound sets it after aiSendMessage

      // ✅ HANDOFF FIX: Set handoff flag BEFORE clearing nextParticipantToTrigger
      // This prevents stale-streaming-cleanup from firing during P0→P1 transition
      // The handoff flag acts as a guard that persists until the next participant actually starts
      if (freshState.nextParticipantToTrigger !== null) {
        freshState.setParticipantHandoffInProgress(true);
        // ✅ V8 FIX: Don't clear nextParticipantToTrigger here
        // Let incomplete-round-resumption clear it after triggering P1
      }

      // ✅ FIX 4: Clear handoff flag when next participant is actively streaming
      // When: handoff=true, isStreaming=true, and nextP already cleared (P1 was triggered)
      // This prevents handoff flag from persisting indefinitely and blocking cleanup
      if (freshState.participantHandoffInProgress && freshState.isStreaming && freshState.nextParticipantToTrigger === null) {
        rlog.trigger('clear-handoff', 'P1 streaming, handoff complete');
        freshState.setParticipantHandoffInProgress(false);
      }
    }
  }, [waitingToStart, chatIsStreaming, hasSentPending, store]);

  // ✅ REMOVED: Timeout-based auto-navigation to overview
  // Previously: 5s interval checking for 60s timeout, then auto-navigate to /chat
  // Problem: This caused premature navigation when moderator started after participants finished
  // Solution: Never auto-navigate based on timeouts - rely on event-driven completion signals
  // (streamFinishAcknowledged, isModeratorStreaming, explicit API errors)
  useEffect(() => {
    if (!waitingToStart) {
      waitingStartTimeRef.current = null;
      return;
    }

    if (waitingStartTimeRef.current === null) {
      waitingStartTimeRef.current = Date.now();
    }
    // No interval - just track start time for debugging
  }, [waitingToStart]);

  // ✅ REMOVED: Interval-based stuck pre-search detection
  // Previously: 5s interval calling checkStuckPreSearches()
  // Problem: Timeout-based detection caused premature state changes
  // Solution: Pre-search completion is now event-driven via API response callbacks

  // ✅ REMOVED: Interval-based stuck resumption state recovery
  // Previously: 3s interval that cleared waitingToStartStreaming if state seemed stuck
  // Problem: This caused clearing during legitimate phase transitions (participants→moderator)
  // Solution: State transitions are now event-driven via streamFinishAcknowledged and phase guards
}
