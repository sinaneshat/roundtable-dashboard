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
import type { ChatParticipant, ChatThread, ThreadStreamResumptionState } from '@/services/api';

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
};

export function useScreenInitialization(options: UseScreenInitializationOptions) {
  const {
    mode,
    thread,
    participants = [],
    initialMessages,
    enableOrchestrator = true,
    streamResumptionState,
  } = options;

  const actions = useChatStore(useShallow(s => ({
    setScreenMode: s.setScreenMode,
    initializeThread: s.initializeThread,
    prefillStreamResumptionState: s.prefillStreamResumptionState,
    setThread: s.setThread,
    setParticipants: s.setParticipants,
    setMessages: s.setMessages,
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

    rlog.init('effect', `t=${threadId?.slice(-8) ?? '-'} rdy=${isReady ? 1 : 0} initd=${alreadyInitialized ? 1 : 0} parts=${participants.length} msgs=${initialMessages?.length ?? 0} phase=${streamResumptionState?.currentPhase ?? '-'} patch=${freshIsPatchInProgress ? 1 : 0}`);

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
    }

    if (threadId !== initializedThreadIdRef.current && initializedThreadIdRef.current !== null) {
      initializedThreadIdRef.current = null;
    }
  }, [thread, participants, initialMessages, actions, streamingStateSet, streamResumptionState, storeApi]);

  // ✅ SSR CONSISTENCY: Stale data handling moved to server-side in page.tsx
  // verifyAndFetchFreshMessages() retries DB reads before SSR completes
  // No client-side fetch-fresh needed - proper SSR paint guaranteed

  // ✅ PERF: Get streaming state to skip pre-search orchestrator during initial creation
  const { streamingRoundNumber, createdThreadId, messages: storeMessages } = useChatStore(useShallow(s => ({
    streamingRoundNumber: s.streamingRoundNumber,
    createdThreadId: s.createdThreadId,
    messages: s.messages,
  })));

  // ✅ PERF: Skip pre-search query during initial creation flow or when no completed rounds
  // Pre-searches are created during streaming - no point fetching on first round
  // Also skip when navigating to existing thread mid-first-round (no data exists yet)
  const isInitialCreationFlow = Boolean(createdThreadId) && streamingRoundNumber === 0;

  // ✅ FIX: Check if any rounds have completed by looking for moderator finish messages
  // Pre-search data only exists after a round completes
  const hasCompletedRounds = storeMessages.some((msg) => {
    const metadata = msg.metadata as Record<string, unknown> | undefined;
    return metadata?.role === 'moderator' && metadata?.finishReason;
  });

  const preSearchOrchestratorEnabled = mode === ScreenModes.THREAD
    && Boolean(thread?.id)
    && enableOrchestrator
    && !isInitialCreationFlow
    && hasCompletedRounds;

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
