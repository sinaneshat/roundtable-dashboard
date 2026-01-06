'use client';

/**
 * Streaming Trigger Hook
 *
 * Handles round 0 streaming trigger for initial thread creation.
 * Also manages timeout protection and pre-search waiting logic.
 */

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
import { extractFileContextForSearch, getCurrentRoundNumber, getRoundNumber, rlog, shouldPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils';
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
}: UseStreamingTriggerParams) {
  const router = useRouter();

  // ✅ PERF: Batch selectors with useShallow to prevent unnecessary re-renders
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
    // Form state enableWebSearch = user's current intent (source of truth DURING submission)
    formEnableWebSearch: s.enableWebSearch,
    // Wait for changelog fetch when config changes
    isWaitingForChangelog: s.isWaitingForChangelog,
    // configChangeRoundNumber signals pending config changes (set before PATCH)
    configChangeRoundNumber: s.configChangeRoundNumber,
    // ✅ PATCH BLOCKING: Wait for PATCH to complete before streaming
    isPatchInProgress: s.isPatchInProgress,
  })));

  // Race condition guard
  const startRoundCalledForRoundRef = useRef<number | null>(null);
  const waitingStartTimeRef = useRef<number | null>(null);

  // Main round 0 trigger effect
  useEffect(() => {
    const effectRound = getCurrentRoundNumber(storeMessages);

    rlog.trigger('effect-run', `waitingToStart=${waitingToStart} round=${effectRound} isReady=${chat.isReady} configChangeRound=${configChangeRoundNumber} isWaitingForChangelog=${isWaitingForChangelog}`);

    if (!waitingToStart) {
      startRoundCalledForRoundRef.current = null;
      return;
    }

    const currentScreenMode = storeScreenMode;

    // Only handle overview screen - thread screen uses continueFromParticipant
    if (currentScreenMode !== ScreenModes.OVERVIEW) {
      rlog.trigger('block-screenmode', `screenMode=${currentScreenMode}, expected=OVERVIEW`);
      return;
    }

    // Wait for required conditions
    if (!chat.startRound || storeParticipants.length === 0 || storeMessages.length === 0) {
      rlog.trigger('block-conditions', `startRound=${!!chat.startRound} participants=${storeParticipants.length} messages=${storeMessages.length}`);
      return;
    }

    // ✅ CHANGELOG: Wait for changelog to be fetched before streaming when config changed
    // configChangeRoundNumber is set BEFORE PATCH (signals pending changes)
    // isWaitingForChangelog is set AFTER PATCH (triggers changelog fetch)
    // ✅ FIX: Bypass for initial thread creation (round 0)
    // handleCreateThread does NOT set configChangeRoundNumber - only handleUpdateThreadAndSend does
    // So if configChangeRoundNumber is null AND we're on OVERVIEW screen = initial thread
    const isInitialThreadCreation = currentScreenMode === ScreenModes.OVERVIEW && waitingToStart && configChangeRoundNumber === null;
    if ((configChangeRoundNumber !== null || isWaitingForChangelog || isPatchInProgress) && !isInitialThreadCreation) {
      rlog.trigger('block-changelog', `configChangeRoundNumber=${configChangeRoundNumber} isWaitingForChangelog=${isWaitingForChangelog} isPatchInProgress=${isPatchInProgress}`);
      return;
    }

    // Wait for pre-search completion before streaming participants
    // ✅ BUG FIX: Use form state (user's current intent) instead of thread.enableWebSearch
    // During submission, thread.enableWebSearch is stale (not yet updated via PATCH)
    // Form state is the source of truth for what the user wants NOW
    const webSearchEnabled = formEnableWebSearch;
    const currentRound = getCurrentRoundNumber(storeMessages);

    if (webSearchEnabled) {
      const currentRoundPreSearch = storePreSearches.find(ps => ps.roundNumber === currentRound);

      if (!currentRoundPreSearch) {
        rlog.trigger('block-presearch-missing', `round=${currentRound} webSearch=true noPreSearch`);
        return;
      }

      // ✅ FIX: Handle both STREAMING and PENDING pre-searches that need resumption
      // After page refresh, triggeredPreSearchRounds is empty (Set not persisted)
      // If pre-search has STREAMING status but not tracked locally = refreshed during stream
      if (currentRoundPreSearch.status === MessageStatuses.STREAMING) {
        const currentState = store.getState();

        // 🚨 ATOMIC CHECK-AND-MARK: Prevents race condition between multiple components
        const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
        if (!didMark) {
          // Already triggered locally, wait for it to complete
          return;
        }

        // ✅ RESUMPTION: Pre-search is streaming but not tracked locally = page refresh
        // Need to attempt resumption by re-executing (backend handles resume logic via KV buffer)

        const pendingMsg = currentState.pendingMessage;
        const userMessageForRound = storeMessages.find((msg) => {
          if (msg.role !== MessageRoles.USER)
            return false;
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === currentRound;
        });
        // Fall back to pre-search's stored userQuery if no message available
        const userQuery = pendingMsg || (userMessageForRound ? extractTextFromMessage(userMessageForRound) : '') || currentRoundPreSearch.userQuery || '';

        if (!userQuery) {
          return;
        }

        const threadIdForSearch = storeThread?.id || effectiveThreadId;

        queueMicrotask(() => {
          const resumeSearch = async () => {
            try {
              // Call execute endpoint - backend handles resume from KV buffer or re-execution
              // Backend returns: live stream (buffer exists), 202 (stream active), or re-executes
              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
                json: { userQuery },
              });

              // 202 means stream is active but buffer unavailable, poll for completion
              if (response.status === 202) {
                // checkStuckPreSearches interval will handle completion detection
                return;
              }

              // 409 means another stream already active
              if (response.status === 409) {
                return;
              }

              if (!response.ok) {
                rlog.presearch('resume-fail', `status=${response.status}`);
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
              rlog.presearch('resume-error', error instanceof Error ? error.message : String(error));
              store.getState().clearPreSearchActivity(currentRound);
              store.getState().clearPreSearchTracking(currentRound);
            }
          };

          resumeSearch();
        });

        return;
      }

      // Execute pending pre-search
      if (currentRoundPreSearch.status === MessageStatuses.PENDING) {
        const currentState = store.getState();

        // 🚨 ATOMIC CHECK-AND-MARK: Prevents race condition between multiple components
        const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
        if (!didMark) {
          // Another component already claimed this pre-search
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

              // Update status to STREAMING - execute endpoint auto-creates DB record
              store.getState().updatePreSearchStatus(currentRound, MessageStatuses.STREAMING);

              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
                json: { userQuery, fileContext: fileContext || undefined, attachmentIds },
              });

              if (!response.ok && response.status !== 409) {
                rlog.presearch('execute-fail', `status=${response.status}`);
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
            } catch (error) {
              rlog.presearch('execute-error', error instanceof Error ? error.message : String(error));
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
        rlog.trigger('block-presearch-animating', `round=${currentRound} animating=true`);
        return;
      }

      // ✅ FIX: Remove blocking timing guard - animation check is sufficient protection
      // The 50ms timing guard was blocking indefinitely because:
      // 1. Pre-search completes → completedAt set
      // 2. Effect runs within <50ms → returns early
      // 3. Animation completes → effect runs again, still <50ms → returns early
      // 4. No more state changes → effect never triggers participant!
      //
      // The animation check (lines 306-311) already provides protection against
      // too-rapid processing. Additionally, the duplicate round check (lines 328-332)
      // and the isTriggeringRef check (lines 334-337) prevent redundant startRound calls.
      //
      // Log timing for debugging but don't block:
      if (currentRoundPreSearch.status === MessageStatuses.COMPLETE && currentRoundPreSearch.completedAt) {
        const completedTime = currentRoundPreSearch.completedAt instanceof Date
          ? currentRoundPreSearch.completedAt.getTime()
          : new Date(currentRoundPreSearch.completedAt).getTime();
        const timeSinceComplete = Date.now() - completedTime;
        rlog.trigger('presearch-timing', `round=${currentRound} timeSinceComplete=${timeSinceComplete}ms`);
      }
    }

    // Prevent duplicate startRound calls
    if (startRoundCalledForRoundRef.current === currentRound) {
      rlog.trigger('block-duplicate', `round=${currentRound} alreadyCalled=true`);
      return;
    }

    if (chat.isTriggeringRef.current || chat.isStreamingRef.current) {
      rlog.trigger('block-refs', `round=${currentRound} triggering=${chat.isTriggeringRef.current} streaming=${chat.isStreamingRef.current}`);
      return;
    }

    // ✅ FIX: Check chat.isReady before setting ref and calling startRound
    // Without this, startRound may silently return early (if AI SDK status !== 'ready')
    // but the ref would be set, blocking all future attempts for this round.
    // Bug: Pre-search completes → effect runs → ref set → startRound returns early
    // → status becomes ready → effect re-runs → ref already set → blocked forever
    if (!chat.isReady) {
      rlog.trigger('block-notready', `round=${currentRound} chat.isReady=false (AI SDK not ready)`);
      return;
    }

    rlog.trigger('proceed', `round=${currentRound} calling startRound with ${storeParticipants.length} participants`);
    startRoundCalledForRoundRef.current = currentRound;

    // ✅ RACE CONDITION FIX: Moderator placeholder is now added in useModeratorTrigger
    // AFTER all participants complete streaming. Adding it here caused the moderator
    // to appear BEFORE participants in the UI, leading to incorrect timeline ordering.
    // The old pattern: User → Moderator → Participants (wrong)
    // The new pattern: User → Participants → Moderator (correct)

    // ✅ FIX: Use queueMicrotask to run startRound outside React's lifecycle
    // startRound uses flushSync internally which cannot be called during render/effects
    // ✅ STALE CLOSURE FIX: Pass storeMessages directly to avoid capturing old closure
    // Messages are now persisted via PATCH before streaming, so store state is fresh
    queueMicrotask(() => {
      chat.startRound(storeParticipants, storeMessages);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingToStart, chat.startRound, chat.isReady, storeParticipants, storeMessages, storePreSearches, storeThread, storeScreenMode, storePendingAnimations, store, effectiveThreadId, formEnableWebSearch, configChangeRoundNumber, isWaitingForChangelog, isPatchInProgress]);

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
      // Thread state is source of truth; form state only for new chats
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

  // Auto-complete stuck pre-searches
  // ✅ RESUMPTION FIX: Run immediately on mount, then every 5 seconds
  // This ensures stale STREAMING pre-searches from before page refresh
  // are marked complete quickly, unblocking participant resumption
  useEffect(() => {
    const checkStuckPreSearches = () => {
      store.getState().checkStuckPreSearches();
    };

    // ✅ RESUMPTION FIX: Check immediately on mount to catch stale pre-searches
    // Without this, resumption would wait up to 5 seconds for the interval
    checkStuckPreSearches();

    const interval = setInterval(checkStuckPreSearches, 5000);
    return () => clearInterval(interval);
  }, [store]);
}
