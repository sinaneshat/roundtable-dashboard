'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { extractFileContextForSearch, getCurrentRoundNumber, getEnabledParticipantModelIds, rlog } from '@/lib/utils';
import { executePreSearchStreamService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { getEffectiveWebSearchEnabled, readPreSearchStreamData } from '@/stores/chat';

import type { ChatHook } from '../types';

type UsePendingMessageParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  sendMessageRef: RefObject<ChatHook['sendMessage']>;
  queryClientRef: RefObject<QueryClient>;
  effectiveThreadId: string;
};

export function usePendingMessage({
  store,
  chat,
  sendMessageRef,
  queryClientRef,
  effectiveThreadId,
}: UsePendingMessageParams) {
  // ✅ PERF: Batch selectors with useShallow to prevent unnecessary re-renders
  const {
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
    formEnableWebSearch,
    waitingToStart,
  } = useStore(store, useShallow(s => ({
    pendingMessage: s.pendingMessage,
    expectedParticipantIds: s.expectedParticipantIds,
    hasSentPendingMessage: s.hasSentPendingMessage,
    isStreaming: s.isStreaming,
    isWaitingForChangelog: s.isWaitingForChangelog,
    screenMode: s.screenMode,
    participants: s.participants,
    preSearches: s.preSearches,
    messages: s.messages,
    thread: s.thread,
    formEnableWebSearch: s.enableWebSearch,
    waitingToStart: s.waitingToStartStreaming,
  })));

  // Track which rounds we've attempted pre-search execution for
  const preSearchExecutionRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const newRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    if (screenMode === ScreenModes.PUBLIC) {
      return;
    }

    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      return;
    }

    if (chat.isStreamingRef.current || chat.isTriggeringRef.current) {
      return;
    }

    if (!chat.isReady) {
      return;
    }

    if (waitingToStart && screenMode === ScreenModes.OVERVIEW) {
      return;
    }

    if (!sendMessageRef.current) {
      return;
    }

    const currentModelIds = getEnabledParticipantModelIds(participants).sort().join(',');
    const expectedModelIds = [...expectedParticipantIds].sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    const isInitialThreadCreation = screenMode === ScreenModes.OVERVIEW && waitingToStart;
    if (isWaitingForChangelog && !isInitialThreadCreation) {
      return;
    }

    const webSearchEnabled = getEffectiveWebSearchEnabled(thread, formEnableWebSearch);
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === newRoundNumber)
      : undefined;

    if (webSearchEnabled) {
      if (!preSearchForRound) {
        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
          return;
        }

        const threadIdForPreSearch = thread?.id || currentState.createdThreadId || '';
        currentState.addPreSearch({
          id: `placeholder-presearch-${threadIdForPreSearch}-${newRoundNumber}`,
          threadId: threadIdForPreSearch,
          roundNumber: newRoundNumber,
          userQuery: pendingMessage,
          status: MessageStatuses.PENDING,
          searchData: null,
          createdAt: new Date(),
          completedAt: null,
          errorMessage: null,
        });
        return;
      }

      // ✅ BUG FIX: Execute PENDING pre-searches on THREAD screen
      // Previously, only useStreamingTrigger handled pre-search execution (OVERVIEW screen only)
      // When web search is enabled mid-conversation on THREAD screen:
      // 1. handleUpdateThreadAndSend creates PENDING pre-search
      // 2. This hook sees PENDING status and was returning early without executing
      // 3. Nobody executed the pre-search → stuck forever
      // Fix: Execute PENDING pre-searches here for THREAD screen
      if (preSearchForRound.status === MessageStatuses.PENDING
        && screenMode === ScreenModes.THREAD) {
        const currentState = store.getState();

        // Atomic check-and-mark to prevent duplicate execution
        const didMark = currentState.tryMarkPreSearchTriggered(newRoundNumber);
        if (!didMark) {
          // Already being executed by another component
          return;
        }

        // Prevent duplicate execution attempts
        if (preSearchExecutionRef.current.has(newRoundNumber)) {
          return;
        }
        preSearchExecutionRef.current.add(newRoundNumber);

        const threadIdForSearch = thread?.id || effectiveThreadId;
        rlog.presearch('execute-thread', `r${newRoundNumber} executing PENDING pre-search on THREAD screen`);

        queueMicrotask(() => {
          const executeSearch = async () => {
            try {
              const attachments = store.getState().getAttachments();
              const fileContext = await extractFileContextForSearch(attachments);
              const attachmentIds = store.getState().pendingAttachmentIds || undefined;

              // Update status to STREAMING
              store.getState().updatePreSearchStatus(newRoundNumber, MessageStatuses.STREAMING);

              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(newRoundNumber) },
                json: { userQuery: pendingMessage, fileContext: fileContext || undefined, attachmentIds },
              });

              if (!response.ok && response.status !== 409) {
                rlog.presearch('execute-fail', `status=${response.status}`);
                store.getState().updatePreSearchStatus(newRoundNumber, MessageStatuses.FAILED);
                store.getState().clearPreSearchActivity(newRoundNumber);
                return;
              }

              const searchData = await readPreSearchStreamData(
                response,
                () => store.getState().updatePreSearchActivity(newRoundNumber),
                partialData => store.getState().updatePartialPreSearchData(newRoundNumber, partialData),
              );

              if (searchData) {
                store.getState().updatePreSearchData(newRoundNumber, searchData);
              } else {
                store.getState().updatePreSearchStatus(newRoundNumber, MessageStatuses.COMPLETE);
              }

              store.getState().clearPreSearchActivity(newRoundNumber);
              queryClientRef.current.invalidateQueries({
                queryKey: queryKeys.threads.preSearches(threadIdForSearch),
              });
            } catch (error) {
              rlog.presearch('execute-error', error instanceof Error ? error.message : String(error));
              store.getState().clearPreSearchActivity(newRoundNumber);
              store.getState().clearPreSearchTracking(newRoundNumber);
            }
          };

          executeSearch();
        });

        return;
      }

      // Wait for STREAMING or PENDING pre-search (OVERVIEW screen or already executing)
      if (preSearchForRound.status === MessageStatuses.STREAMING
        || preSearchForRound.status === MessageStatuses.PENDING) {
        return;
      }
    }

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
            rlog.stream('end', `sendMessage failed: ${error.message}`);
          });
        }
      } catch (error) {
        rlog.stream('end', `sendMessage threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }, [
    store,
    chat.isReady,
    chat.isStreamingRef,
    chat.isTriggeringRef,
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
    formEnableWebSearch,
    waitingToStart,
    sendMessageRef,
    queryClientRef,
    effectiveThreadId,
  ]);

  // Reset execution tracking on thread change
  useEffect(() => {
    preSearchExecutionRef.current = new Set();
  }, [effectiveThreadId]);
}
