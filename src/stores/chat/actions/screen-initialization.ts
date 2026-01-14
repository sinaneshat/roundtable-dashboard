/**
 * Unified screen initialization
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, ThreadStreamResumptionState } from '@/api/routes/chat/schema';
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { queryKeys } from '@/lib/data/query-keys';
import { chatMessageToUIMessage } from '@/lib/utils';
import { getThreadMessagesService } from '@/services/api';

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

  const queryClient = useQueryClient();

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
  const staleFetchAttemptedRef = useRef<string | null>(null);
  const [isFetchingFreshMessages, setIsFetchingFreshMessages] = useState(false);

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

    console.error(`[screenInit] thread=${threadId?.slice(-8) ?? 'null'} ready=${isReady} initd=${alreadyInitialized} parts=${participants.length} msgs=${initialMessages?.length ?? 0} phase=${streamResumptionState?.currentPhase ?? 'none'} nextP=${streamResumptionState?.participants?.nextParticipantToTrigger ?? 'null'} patch=${freshIsPatchInProgress}`);

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

    // ✅ DB CONSISTENCY CHECK: Detect when server says round is further than SSR data shows
    // Race condition: stream-status queries FRESH data, SSR queries STALE data
    // Example: Server says participants complete (3 msgs), but SSR returns only user msg (1)
    // In this case, SSR data is stale - do NOT initialize with incomplete data
    const serverSaysParticipantsComplete = streamResumptionState?.participants?.allComplete === true;
    const serverTotalParticipants = streamResumptionState?.participants?.totalParticipants ?? 0;
    const ssrAssistantMsgCount = initialMessages?.filter(m => m.role === 'assistant').length ?? 0;
    const ssrHasIncompleteData = serverSaysParticipantsComplete
      && serverTotalParticipants > 0
      && ssrAssistantMsgCount < serverTotalParticipants;

    // ✅ FIX: When SSR has stale data, initialize with SSR data then fetch fresh from API
    if (ssrHasIncompleteData && isResumption && threadId) {
      console.error(`[screenInit] SSR stale (${ssrAssistantMsgCount} vs ${serverTotalParticipants}) - will fetch fresh`);
    }

    if (isReady && !alreadyInitialized && !isFormActionsSubmission) {
      initializedThreadIdRef.current = threadId;
      actions.initializeThread(thread, participants, initialMessages);
    }

    if (threadId !== initializedThreadIdRef.current && initializedThreadIdRef.current !== null) {
      initializedThreadIdRef.current = null;
    }
  }, [thread, participants, initialMessages, actions, streamingStateSet, streamResumptionState, storeApi]);

  // ✅ SSR STALE DATA FIX: Fetch fresh messages from API when SSR is stale
  // This handles the race condition where:
  // 1. Stream-status (KV) says participants are complete
  // 2. But SSR (DB) returns stale data (messages not committed yet)
  // Solution: Fetch fresh messages from API after client loads
  useEffect(() => {
    const threadId = thread?.id;
    if (!threadId)
      return;

    // Check if SSR data is stale
    const serverSaysComplete = streamResumptionState?.participants?.allComplete === true;
    const serverTotal = streamResumptionState?.participants?.totalParticipants ?? 0;
    const ssrAssistantCount = initialMessages?.filter(m => m.role === 'assistant').length ?? 0;
    const isStale = serverSaysComplete && serverTotal > 0 && ssrAssistantCount < serverTotal;

    if (!isStale)
      return;
    if (staleFetchAttemptedRef.current === threadId)
      return;
    if (isFetchingFreshMessages)
      return;

    staleFetchAttemptedRef.current = threadId;
    setIsFetchingFreshMessages(true);

    console.error(`[screenInit] Fetching fresh messages for stale SSR data`);

    queryClient.fetchQuery({
      queryKey: queryKeys.threads.messages(threadId),
      queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
      staleTime: 0,
    })
      .then((response) => {
        if (response.success && response.data && Array.isArray(response.data)) {
          // Convert DB messages to UIMessage format - filter tool messages
          const freshMessages: UIMessage[] = response.data
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(chatMessageToUIMessage);
          console.error(`[screenInit] Fetched ${freshMessages.length} fresh messages`);
          actions.setMessages(freshMessages);
        }
      })
      .catch((err) => {
        console.error(`[screenInit] Failed to fetch fresh messages:`, err);
      })
      .finally(() => {
        setIsFetchingFreshMessages(false);
      });
  }, [thread?.id, streamResumptionState, initialMessages, actions, isFetchingFreshMessages, queryClient]);

  const preSearchOrchestratorEnabled = mode === ScreenModes.THREAD && Boolean(thread?.id) && enableOrchestrator;
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
