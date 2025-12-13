'use client';

/**
 * Pending Message Hook
 *
 * Watches for pending message conditions and triggers send.
 * Handles pre-search creation before participant streaming.
 */

import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import { transformPreSearch } from '@/lib/utils/date-transforms';
import { getEnabledParticipantModelIds } from '@/lib/utils/participant';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { extractFileContextForSearch } from '@/lib/utils/web-search-utils';
import type { ChatStoreApi } from '@/stores/chat';

import type { ChatHook, CreatePreSearchMutation } from '../types';

type UsePendingMessageParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  sendMessageRef: MutableRefObject<ChatHook['sendMessage']>;
  preSearchCreationAttemptedRef: MutableRefObject<Set<number>>;
  createPreSearch: CreatePreSearchMutation;
};

/**
 * Handles pending message send with pre-search orchestration
 */
export function usePendingMessage({
  store,
  chat,
  sendMessageRef,
  preSearchCreationAttemptedRef,
  createPreSearch,
}: UsePendingMessageParams) {
  // Subscribe to necessary store state
  const pendingMessage = useStore(store, s => s.pendingMessage);
  const expectedParticipantIds = useStore(store, s => s.expectedParticipantIds);
  const hasSentPendingMessage = useStore(store, s => s.hasSentPendingMessage);
  const isStreaming = useStore(store, s => s.isStreaming);
  const isWaitingForChangelog = useStore(store, s => s.isWaitingForChangelog);
  const screenMode = useStore(store, s => s.screenMode);
  const participants = useStore(store, s => s.participants);
  const preSearches = useStore(store, s => s.preSearches);
  const messages = useStore(store, s => s.messages);
  const thread = useStore(store, s => s.thread);
  const enableWebSearch = useStore(store, s => s.enableWebSearch);
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);

  useEffect(() => {
    const newRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // Guard: Only send on overview/thread screens (not public)
    if (screenMode === ScreenModes.PUBLIC) {
      return;
    }

    // Check if we should send pending message
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      return;
    }

    // Race condition guards
    if (chat.isStreamingRef.current || chat.isTriggeringRef.current) {
      return;
    }

    // Round 0 guard - skip when waitingToStartStreaming is true on overview
    if (waitingToStart && screenMode === ScreenModes.OVERVIEW) {
      return;
    }

    // Guard: Wait for sendMessage to be available
    if (!sendMessageRef.current) {
      return;
    }

    // Compare participant model IDs
    const currentModelIds = getEnabledParticipantModelIds(participants).sort().join(',');
    const expectedModelIds = [...expectedParticipantIds].sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    // Check changelog wait state
    const isInitialThreadCreation = screenMode === ScreenModes.OVERVIEW && waitingToStart;
    if (isWaitingForChangelog && !isInitialThreadCreation) {
      return;
    }

    // newRoundNumber already calculated at top of effect
    const webSearchEnabled = enableWebSearch;
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === newRoundNumber)
      : undefined;

    // Create pre-search if needed
    if (webSearchEnabled && !preSearchForRound) {
      const alreadyAttempted = preSearchCreationAttemptedRef.current.has(newRoundNumber);
      if (!alreadyAttempted) {
        preSearchCreationAttemptedRef.current.add(newRoundNumber);
      }

      const currentState = store.getState();
      if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
        return;
      }

      if (alreadyAttempted) {
        // Fall through to send without pre-search
      } else {
        // ✅ PROGRESSIVE UI FIX: Provider only creates pre-search record, does NOT execute stream
        // PreSearchStream component handles execution with flushSync for progressive updates
        // Previously provider executed stream and used store updates (batched by React 18)
        // which caused users to see only final state, not progressive updates

        const effectiveThreadId = thread?.id || '';
        queueMicrotask(async () => {
          const attachments = store.getState().getAttachments();
          const fileContext = await extractFileContextForSearch(attachments);
          const attachmentIds = store.getState().pendingAttachmentIds || undefined;

          createPreSearch.mutateAsync({
            param: { threadId: effectiveThreadId, roundNumber: newRoundNumber.toString() },
            json: { userQuery: pendingMessage, fileContext: fileContext || undefined, attachmentIds },
          }).then((createResponse) => {
            if (createResponse && createResponse.data) {
              const preSearchWithDates = transformPreSearch(createResponse.data);
              // ✅ PROGRESSIVE UI FIX: Set status to PENDING, not STREAMING
              // PreSearchStream will set STREAMING when it starts execution
              store.getState().addPreSearch({
                ...preSearchWithDates,
                status: AnalysisStatuses.PENDING,
              });
            }
            // ✅ PROGRESSIVE UI FIX: DO NOT execute stream here
            // Let PreSearchStream handle execution with flushSync for immediate UI updates
          }).catch((error) => {
            console.error('[ChatStoreProvider] Failed to create pre-search record:', error);
          });
        });
        return;
      }
    }

    // Handle pre-search execution state
    // ✅ PROGRESSIVE UI FIX: Provider does NOT execute pre-search streams
    // PreSearchStream component handles all execution with flushSync for progressive updates
    // Provider only waits for pre-search to complete before sending participant messages
    if (webSearchEnabled && preSearchForRound) {
      // Still streaming or pending - wait for PreSearchStream to complete it
      if (preSearchForRound.status === AnalysisStatuses.STREAMING
        || preSearchForRound.status === AnalysisStatuses.PENDING) {
        return;
      }
    }

    // Send message
    const { setHasSentPendingMessage, setStreamingRoundNumber, setHasPendingConfigChanges } = store.getState();

    setHasSentPendingMessage(true);
    setStreamingRoundNumber(newRoundNumber);
    setHasPendingConfigChanges(false);

    queueMicrotask(() => {
      if (chat.isStreamingRef.current) {
        store.getState().setHasSentPendingMessage(false);
        return;
      }

      try {
        const result = sendMessageRef.current?.(pendingMessage);

        if (result && typeof result.catch === 'function') {
          result.catch((error: Error) => {
            console.error('[Provider:pendingMessage] sendMessage failed:', error);
          });
        }
      } catch (error) {
        console.error('[Provider:pendingMessage] sendMessage threw error:', error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store,
    pendingMessage,
    expectedParticipantIds,
    hasSentPendingMessage,
    isStreaming,
    isWaitingForChangelog,
    screenMode,
    participants,
    preSearches,
    messages,
    thread,
    enableWebSearch,
    createPreSearch,
    sendMessageRef,
  ]);
}
