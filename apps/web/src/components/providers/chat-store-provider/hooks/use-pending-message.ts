import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

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
        store.getState().setHasSentPendingMessage(false);
        return;
      }

      try {
        const result = sendMessageRef.current?.(pendingMessage);

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
      return;
    }

    const webSearchEnabled = getEffectiveWebSearchEnabled(thread, formEnableWebSearch);
    if (!webSearchEnabled) {
      return;
    }

    const currentRound = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;
    const preSearchForRound = Array.isArray(preSearches)
      ? preSearches.find(ps => ps.roundNumber === currentRound)
      : undefined;

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
