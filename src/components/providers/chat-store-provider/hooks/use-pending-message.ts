'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { extractFileContextForSearch, getCurrentRoundNumber, getEnabledParticipantModelIds } from '@/lib/utils';
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
    configChangeRoundNumber,
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
    configChangeRoundNumber: s.configChangeRoundNumber,
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

    // ✅ FIX: Block on BOTH changelog flags to ensure proper ordering:
    // Order: PATCH → changelog → pre-search → streams
    // configChangeRoundNumber is set BEFORE PATCH to block streaming
    // isWaitingForChangelog is set AFTER PATCH to trigger changelog fetch
    // Initial thread creation (handleCreateThread) does NOT set configChangeRoundNumber,
    // only handleUpdateThreadAndSend does. So if configChangeRoundNumber is set, it's NOT initial.
    const isInitialThreadCreation = screenMode === ScreenModes.OVERVIEW && waitingToStart && configChangeRoundNumber === null;
    if ((isWaitingForChangelog || configChangeRoundNumber !== null) && !isInitialThreadCreation) {
      // rlog.presearch('block-changelog', `configChangeRound=${configChangeRoundNumber} isWaitingForChangelog=${isWaitingForChangelog}`);
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
        // rlog.presearch('execute-thread', `r${newRoundNumber} executing PENDING pre-search on THREAD screen`);

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
                // rlog.presearch('execute-fail', `status=${response.status}`);
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
            } catch (_error) {
              // rlog.presearch('execute-error', error instanceof Error ? error.message : String(error));
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
            // rlog.stream('end', `sendMessage failed: ${error.message}`);
          });
        }
      } catch (_error) {
        // rlog.stream('end', `sendMessage threw: ${error instanceof Error ? error.message : String(error)}`);
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
    configChangeRoundNumber,
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

  // ✅ BUG FIX: Execute PENDING pre-searches for non-initial rounds on THREAD screen
  // The main effect above requires pendingMessage to be set, but for non-initial rounds
  // handleUpdateThreadAndSend does NOT call prepareForNewMessage (intentionally).
  // This leaves pre-search in PENDING state forever, blocking streaming.
  //
  // This separate effect handles pre-search execution when:
  // 1. We're on THREAD screen (non-initial round submission)
  // 2. Web search is enabled
  // 3. Pre-search is PENDING
  // 4. waitingToStart is true (submission in progress)
  // 5. pendingMessage is null (non-initial round pattern)
  // 6. ✅ FIX: Changelog has been fetched (both flags cleared)
  useEffect(() => {
    // Only for THREAD screen non-initial rounds
    if (screenMode !== ScreenModes.THREAD) {
      return;
    }

    // Only when waiting to start (submission in progress)
    if (!waitingToStart) {
      return;
    }

    // Only when pendingMessage is NOT set (non-initial round pattern)
    // Initial rounds use the main effect via pendingMessage
    if (pendingMessage) {
      return;
    }

    // ✅ FIX: Block until changelog is fetched
    // Order: PATCH → changelog → pre-search → streams
    if (isWaitingForChangelog || configChangeRoundNumber !== null) {
      // rlog.presearch('block-changelog-non-initial', `configChangeRound=${configChangeRoundNumber} isWaitingForChangelog=${isWaitingForChangelog}`);
      return;
    }

    // Check web search enabled
    const webSearchEnabled = getEffectiveWebSearchEnabled(thread, formEnableWebSearch);
    if (!webSearchEnabled) {
      return;
    }

    // Find pre-search for current round
    const currentRound = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === currentRound)
      : undefined;

    // Only execute PENDING pre-searches
    if (!preSearchForRound || preSearchForRound.status !== MessageStatuses.PENDING) {
      return;
    }

    // Prevent duplicate execution
    if (preSearchExecutionRef.current.has(currentRound)) {
      return;
    }

    const currentState = store.getState();

    // Atomic check-and-mark to prevent duplicate execution
    const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
    if (!didMark) {
      return;
    }

    preSearchExecutionRef.current.add(currentRound);

    const threadIdForSearch = thread?.id || effectiveThreadId;
    // rlog.presearch('execute-non-initial', `r${currentRound} executing PENDING pre-search (non-initial round)`);

    // Extract user query from messages (since pendingMessage is null)
    const userMessageForRound = messages.find((msg) => {
      if (msg.role !== 'user') {
        return false;
      }
      const msgRound = getCurrentRoundNumber([msg]);
      return msgRound === currentRound;
    });
    const userQuery = userMessageForRound
      ? extractTextFromMessage(userMessageForRound)
      : preSearchForRound.userQuery || '';

    if (!userQuery) {
      // rlog.presearch('execute-fail', `r${currentRound} no user query found`);
      return;
    }

    queueMicrotask(() => {
      const executeSearch = async () => {
        try {
          const attachments = store.getState().getAttachments();
          const fileContext = await extractFileContextForSearch(attachments);
          const attachmentIds = store.getState().pendingAttachmentIds || undefined;

          // Update status to STREAMING
          store.getState().updatePreSearchStatus(currentRound, MessageStatuses.STREAMING);

          const response = await executePreSearchStreamService({
            param: { threadId: threadIdForSearch, roundNumber: String(currentRound) },
            json: { userQuery, fileContext: fileContext || undefined, attachmentIds },
          });

          if (!response.ok && response.status !== 409) {
            // rlog.presearch('execute-fail', `status=${response.status}`);
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
        } catch (_error) {
          // rlog.presearch('execute-error', error instanceof Error ? error.message : String(error));
          store.getState().clearPreSearchActivity(currentRound);
          store.getState().clearPreSearchTracking(currentRound);
        }
      };

      executeSearch();
    });
  }, [
    screenMode,
    waitingToStart,
    pendingMessage,
    thread,
    formEnableWebSearch,
    messages,
    preSearches,
    effectiveThreadId,
    store,
    queryClientRef,
    isWaitingForChangelog,
    configChangeRoundNumber,
  ]);
}
