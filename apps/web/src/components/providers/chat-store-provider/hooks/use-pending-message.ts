import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { extractFileContextForSearch, getCurrentRoundNumber, getEnabledParticipantModelIds } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
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

  const preSearchExecutionRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const newRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // ✅ DEBUG: Track pending message effect conditions
    rlog.msg('pending-effect', `r=${newRoundNumber} pending=${pendingMessage ? 1 : 0} sent=${hasSentPendingMessage ? 1 : 0} streaming=${isStreaming ? 1 : 0} screen=${screenMode}`);

    if (screenMode === ScreenModes.PUBLIC) {
      return;
    }

    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessage || isStreaming) {
      rlog.msg('pending-exit', `pending=${!!pendingMessage} expected=${!!expectedParticipantIds} sent=${hasSentPendingMessage} streaming=${isStreaming}`);
      return;
    }

    if (chat.isStreamingRef.current || chat.isTriggeringRef.current) {
      return;
    }

    // ✅ FIX: Check if round already has assistant messages (message was sent via startRound)
    // startRound sends the message directly without going through usePendingMessage,
    // so hasSentPendingMessage is never set. Check if round already started instead.
    const assistantMsgsInRound = messages.filter((m) => {
      if (m.role !== MessageRoles.ASSISTANT)
        return false;
      const md = m.metadata;
      if (!md || typeof md !== 'object')
        return false;
      if ('isModerator' in md && md.isModerator === true)
        return false;
      const msgRound = 'roundNumber' in md ? md.roundNumber : null;
      return msgRound === newRoundNumber;
    });
    if (assistantMsgsInRound.length > 0) {
      rlog.msg('pending-exit', `round ${newRoundNumber} already has ${assistantMsgsInRound.length} assistant msgs - skip`);
      // ✅ PERF FIX: Clear stale state in single batch update to prevent multiple re-renders
      const currentState = store.getState();
      if (currentState.pendingMessage !== null || currentState.expectedParticipantIds !== null) {
        rlog.msg('pending-clear', `clearing stale pendingMessage`);
        currentState.batchUpdatePendingState(null, null);
      }
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

    const isInitialThreadCreation = screenMode === ScreenModes.OVERVIEW && waitingToStart && configChangeRoundNumber === null;
    if ((isWaitingForChangelog || configChangeRoundNumber !== null) && !isInitialThreadCreation) {
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
          createdAt: new Date().toISOString(),
          completedAt: null,
          errorMessage: null,
        });
        return;
      }

      if (preSearchForRound.status === MessageStatuses.PENDING
        && screenMode === ScreenModes.THREAD) {
        const currentState = store.getState();

        const didMark = currentState.tryMarkPreSearchTriggered(newRoundNumber);
        if (!didMark) {
          return;
        }

        if (preSearchExecutionRef.current.has(newRoundNumber)) {
          return;
        }
        preSearchExecutionRef.current.add(newRoundNumber);

        const threadIdForSearch = thread?.id || effectiveThreadId;

        queueMicrotask(() => {
          const executeSearch = async () => {
            try {
              const attachments = store.getState().getAttachments();
              const fileContext = await extractFileContextForSearch(attachments);
              const attachmentIds = store.getState().pendingAttachmentIds || undefined;

              store.getState().updatePreSearchStatus(newRoundNumber, MessageStatuses.STREAMING);

              const response = await executePreSearchStreamService({
                param: { threadId: threadIdForSearch, roundNumber: String(newRoundNumber) },
                json: { userQuery: pendingMessage, fileContext: fileContext || undefined, attachmentIds },
              });

              if (!response.ok && response.status !== 409) {
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
            } catch {
              store.getState().clearPreSearchActivity(newRoundNumber);
              store.getState().clearPreSearchTracking(newRoundNumber);
            }
          };

          executeSearch();
        });

        return;
      }

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
        // ✅ FIX: Don't reset hasSentPendingMessage if streaming is in progress
        // The message was already sent by a concurrent call - just skip this one
        rlog.msg('pending-skip', `streaming already in progress, skipping send`);
        return;
      }

      try {
        const result = sendMessageRef.current?.(pendingMessage);

        // ✅ FIX: Clear pendingMessage immediately after successful send
        // This prevents phantom re-sends when isStreaming changes later
        store.getState().setPendingMessage(null);
        store.getState().setExpectedParticipantIds(null);
        rlog.msg('pending-sent', `cleared pendingMessage after send`);

        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch {}
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

  useEffect(() => {
    preSearchExecutionRef.current = new Set();
  }, [effectiveThreadId]);

  useEffect(() => {
    // ✅ DEBUG: Track pre-search trigger conditions for round 1+ (pendingMessage is null)
    const webSearchEnabled = getEffectiveWebSearchEnabled(thread, formEnableWebSearch);
    const currentRound = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === currentRound)
      : undefined;

    rlog.msg('presearch-trigger', `r${currentRound} screen=${screenMode} wait=${waitingToStart ? 1 : 0} pending=${pendingMessage ? 1 : 0} changelog=${isWaitingForChangelog ? 1 : 0} configR=${configChangeRoundNumber ?? '-'} web=${webSearchEnabled ? 1 : 0} preSearch=${preSearchForRound?.status ?? 'none'}`);

    if (screenMode !== ScreenModes.THREAD) {
      return;
    }

    if (!waitingToStart) {
      return;
    }

    if (pendingMessage) {
      return;
    }

    if (isWaitingForChangelog || configChangeRoundNumber !== null) {
      rlog.msg('presearch-trigger', `r${currentRound} EXIT: changelog blocking`);
      return;
    }

    if (!webSearchEnabled) {
      return;
    }

    if (!preSearchForRound || preSearchForRound.status !== MessageStatuses.PENDING) {
      return;
    }

    if (preSearchExecutionRef.current.has(currentRound)) {
      return;
    }

    const currentState = store.getState();

    const didMark = currentState.tryMarkPreSearchTriggered(currentRound);
    if (!didMark) {
      return;
    }

    preSearchExecutionRef.current.add(currentRound);

    const threadIdForSearch = thread?.id || effectiveThreadId;

    const userMessageForRound = messages.find((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      const msgRound = getCurrentRoundNumber([msg]);
      return msgRound === currentRound;
    });
    const userQuery = userMessageForRound
      ? extractTextFromMessage(userMessageForRound)
      : preSearchForRound.userQuery || '';

    if (!userQuery) {
      return;
    }

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
