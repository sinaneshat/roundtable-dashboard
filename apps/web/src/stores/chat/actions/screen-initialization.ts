/**
 * Unified screen initialization
 */

import type { ChatMode, ScreenMode } from '@roundtable/shared';
import { ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatParticipant, ChatThread, StoredPreSearch, ThreadStreamResumptionState } from '@/services/api';

import { useIncompleteRoundResumption } from './incomplete-round-resumption';
import { getPreSearchOrchestrator } from './pre-search-orchestrator';

export type UseScreenInitializationOptions = {
  mode: ScreenMode;
  thread?: ChatThread | null;
  participants?: ChatParticipant[];
  initialMessages?: UIMessage[];
  chatMode?: ChatMode | null;
  isRegeneration?: boolean;
  regeneratingRoundNumber?: number | null;
  enableOrchestrator?: boolean;
  /** Stream resumption state from server - will be prefilled BEFORE initializeThread */
  streamResumptionState?: ThreadStreamResumptionState | null;
  /** Pre-search data hydrated from server - when provided, V1 orchestrator is disabled */
  initialPreSearches?: StoredPreSearch[];
};

export function useScreenInitialization(options: UseScreenInitializationOptions) {
  const {
    mode,
    thread,
    participants = [],
    initialMessages,
    enableOrchestrator = true,
    streamResumptionState,
    initialPreSearches,
  } = options;

  const actions = useChatStore(useShallow(s => ({
    setScreenMode: s.setScreenMode,
    initializeThread: s.initializeThread,
    prefillStreamResumptionState: s.prefillStreamResumptionState,
    setThread: s.setThread,
    setParticipants: s.setParticipants,
    setMessages: s.setMessages,
    setPreSearches: s.setPreSearches,
  })));

  const storeApi = useChatStoreApi();

  const streamingStateSet = useChatStore(useShallow(s => ({
    pendingMessage: s.pendingMessage,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
    configChangeRoundNumber: s.configChangeRoundNumber,
    isWaitingForChangelog: s.isWaitingForChangelog,
    isPatchInProgress: s.isPatchInProgress,
  })));

  const initializedThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    actions.setScreenMode(mode);
    return () => actions.setScreenMode(null);
  }, [mode, actions]);

  useEffect(() => {
    const threadId = thread?.id;
    const isReady = threadId && participants.length > 0;
    const alreadyInitialized = initializedThreadIdRef.current === threadId;

    // ✅ CRITICAL FIX: Read FRESH state from store to avoid stale closure issues
    // The selector values (streamingStateSet) are from the PREVIOUS render
    // and may not reflect changes made by handleUpdateThreadAndSend
    const freshState = storeApi.getState();
    const freshIsPatchInProgress = freshState.isPatchInProgress;
    const freshConfigChangeRoundNumber = freshState.configChangeRoundNumber;
    const freshIsWaitingForChangelog = freshState.isWaitingForChangelog;
    const freshPendingMessage = freshState.pendingMessage;

    // ✅ CRITICAL FIX: Check if store already has this thread with MORE messages than SSR
    // This prevents re-initialization with stale SSR data after navigation/remount
    // The ref is local to component instance, but store state persists across navigation
    const storeThreadId = freshState.thread?.id || freshState.createdThreadId;
    const storeMessages = freshState.messages || [];
    const ssrMessages = initialMessages || [];
    const storeHasMoreData = storeThreadId === threadId && storeMessages.length > ssrMessages.length;
    const storeAlreadyLoaded = freshState.hasInitiallyLoaded && storeThreadId === threadId;

    rlog.init('effect', `t=${threadId?.slice(-8) ?? '-'} rdy=${isReady ? 1 : 0} initd=${alreadyInitialized ? 1 : 0} parts=${participants.length} msgs=${ssrMessages.length} phase=${streamResumptionState?.currentPhase ?? '-'} patch=${freshIsPatchInProgress ? 1 : 0}`);
    rlog.init('guard', `resum=${freshState.streamResumptionPrefilled ? 1 : 0} same=${storeThreadId === threadId ? 1 : 0} store=${storeMessages.length} db=${ssrMessages.length} resumR=${freshState.resumptionRoundNumber ?? '-'} storeLoaded=${storeAlreadyLoaded ? 1 : 0}`);

    // ✅ RESUMPTION DEBUG: Log server-provided resumption state
    if (streamResumptionState) {
      rlog.resume('prefill-detect', `phase=${streamResumptionState.currentPhase} r=${streamResumptionState.roundNumber ?? '-'} nextP=${streamResumptionState.nextParticipantIndex ?? '-'} complete=${streamResumptionState.roundComplete ? 1 : 0} preSearch=${streamResumptionState.preSearchStatus ?? '-'} mod=${streamResumptionState.moderatorStatus ?? '-'}`);
    }

    // ✅ CRITICAL FIX: Skip if store already has this thread with more/equal data
    // This handles navigation from overview→thread after round started streaming
    if (storeHasMoreData || storeAlreadyLoaded) {
      rlog.init('skip', `storeHasMore=${storeHasMoreData ? 1 : 0} storeLoaded=${storeAlreadyLoaded ? 1 : 0} - skipping re-init`);
      initializedThreadIdRef.current = threadId ?? null;

      // ✅ CRITICAL FIX: Clear pendingMessage if it was already sent
      // Without this, usePendingMessage sees stale pendingMessage and calls sendMessage again
      // causing phantom duplicate rounds after round completion
      if (freshState.hasSentPendingMessage && freshState.pendingMessage !== null) {
        rlog.init('cleanup', `clearing stale pendingMessage after skip`);
        storeApi.getState().setPendingMessage(null);
        storeApi.getState().setExpectedParticipantIds(null);
      }
      return;
    }

    // ✅ CRITICAL FIX: Do NOT prefill resumption state when a form submission is in progress
    // handleUpdateThreadAndSend calls clearStreamResumption() to clear stale state
    // But if SSR returns stream-status data, prefillStreamResumptionState would re-set it
    // This causes the cleared state to be restored, breaking the new submission flow
    const skipPrefillDueToFormSubmission = freshIsPatchInProgress
      || freshConfigChangeRoundNumber !== null
      || freshIsWaitingForChangelog
      || freshPendingMessage !== null;

    // ✅ CRITICAL FIX: Prefill stream resumption state BEFORE initializeThread
    // This was previously done in a separate effect that could fire AFTER initializeThread,
    // causing initializeThread to check streamResumptionPrefilled=false and wipe messages.
    // Now we prefill synchronously BEFORE initializeThread checks the flag.
    if (threadId && streamResumptionState && !alreadyInitialized && !skipPrefillDueToFormSubmission) {
      actions.prefillStreamResumptionState(threadId, streamResumptionState);
    }

    // Re-read the flag after potential prefill (Zustand updates are sync)
    const isResumption = freshState.streamResumptionPrefilled
      || (streamResumptionState && !streamResumptionState.roundComplete && !skipPrefillDueToFormSubmission);
    const hasActiveFormSubmission
      = freshConfigChangeRoundNumber !== null
        || freshIsWaitingForChangelog;

    const isFormActionsSubmission
      = (freshPendingMessage !== null || hasActiveFormSubmission || freshIsPatchInProgress)
        && !isResumption;

    // ✅ SSR CONSISTENCY: Stale data detection moved to server-side (verifyAndFetchFreshMessages)
    // Server retries DB reads until consistent with KV stream-status before SSR completes

    if (isReady && !alreadyInitialized && !isFormActionsSubmission) {
      initializedThreadIdRef.current = threadId;
      actions.initializeThread(thread, participants, initialMessages);

      // ✅ CRITICAL FIX: Set pre-searches into store when hydrated from server
      // Previously only used for conditional logic but never stored
      // Without this, streaming trigger finds no pre-search for current round
      if (initialPreSearches?.length) {
        actions.setPreSearches(initialPreSearches);
        rlog.init('presearch-hydrate', `set ${initialPreSearches.length} pre-searches into store`);
      }
    }

    if (threadId !== initializedThreadIdRef.current && initializedThreadIdRef.current !== null) {
      initializedThreadIdRef.current = null;
    }
  }, [thread, participants, initialMessages, actions, streamingStateSet, streamResumptionState, storeApi, initialPreSearches]);

  // ✅ SSR CONSISTENCY: Stale data handling moved to server-side in page.tsx
  // verifyAndFetchFreshMessages() retries DB reads before SSR completes
  // No client-side fetch-fresh needed - proper SSR paint guaranteed

  // ✅ FIX: Disable V1 pre-search orchestrator when pre-searches are server-hydrated
  // V2 system handles pre-search via SSE streams only when needed
  // When initialPreSearches is provided (from SSR loader), skip V1 orchestrator entirely
  const hasServerHydratedPreSearches = Array.isArray(initialPreSearches);
  const preSearchOrchestratorEnabled = mode === ScreenModes.THREAD
    && Boolean(thread?.id)
    && enableOrchestrator
    && !hasServerHydratedPreSearches;
  getPreSearchOrchestrator({
    threadId: thread?.id || '',
    enabled: preSearchOrchestratorEnabled,
  });

  const { isStreaming } = useChatStore(useShallow(s => ({
    isStreaming: s.isStreaming,
  })));

  useIncompleteRoundResumption({
    threadId: thread?.id || '',
    enabled: mode === ScreenModes.THREAD && Boolean(thread?.id) && !isStreaming && enableOrchestrator,
  });
}
