'use client';

/**
 * Pending Message Hook
 *
 * Watches for pending message conditions and triggers send.
 * Handles pre-search creation before participant streaming.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { transformPreSearch } from '@/lib/utils/date-transforms';
import { getEnabledParticipantModelIds } from '@/lib/utils/participant';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { extractFileContextForSearch } from '@/lib/utils/web-search-utils';
import { executePreSearchStreamService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { readPreSearchStreamData } from '@/stores/chat';

import type { ChatHook, CreatePreSearchMutation } from '../types';

type UsePendingMessageParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  sendMessageRef: MutableRefObject<ChatHook['sendMessage']>;
  queryClientRef: MutableRefObject<QueryClient>;
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
  queryClientRef,
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

    const newRoundNumber = getCurrentRoundNumber(messages);
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
        currentState.markPreSearchTriggered(newRoundNumber);

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
              store.getState().addPreSearch({
                ...preSearchWithDates,
                status: AnalysisStatuses.STREAMING,
              });
            }

            return executePreSearchStreamService({
              param: { threadId: effectiveThreadId, roundNumber: String(newRoundNumber) },
              json: { userQuery: pendingMessage, fileContext: fileContext || undefined, attachmentIds },
            });
          }).then(async (response) => {
            if (!response.ok && response.status !== 409) {
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
            }

            const searchData = await readPreSearchStreamData(
              response,
              () => store.getState().updatePreSearchActivity(newRoundNumber),
              partialData => store.getState().updatePartialPreSearchData(newRoundNumber, partialData),
            );

            if (searchData) {
              store.getState().updatePreSearchData(newRoundNumber, searchData);
            } else {
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            store.getState().clearPreSearchActivity(newRoundNumber);
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          }).catch((error) => {
            console.error('[ChatStoreProvider] Failed to create/execute pre-search:', error);
            store.getState().clearPreSearchActivity(newRoundNumber);
            store.getState().clearPreSearchTracking(newRoundNumber);
          });
        });
        return;
      }
    }

    // Handle pre-search execution state
    if (webSearchEnabled && preSearchForRound) {
      if (preSearchForRound.status === AnalysisStatuses.STREAMING) {
        return;
      }

      if (preSearchForRound.status === AnalysisStatuses.PENDING) {
        if (preSearchCreationAttemptedRef.current.has(newRoundNumber)) {
          return;
        }
        preSearchCreationAttemptedRef.current.add(newRoundNumber);

        const currentState = store.getState();
        if (currentState.hasPreSearchBeenTriggered(newRoundNumber)) {
          return;
        }

        currentState.markPreSearchTriggered(newRoundNumber);

        const effectiveThreadId = thread?.id || '';
        const isPlaceholder = preSearchForRound.id.startsWith('placeholder-');

        queueMicrotask(async () => {
          const attachments = store.getState().getAttachments();
          const fileContext = await extractFileContextForSearch(attachments);
          const attachmentIds = store.getState().pendingAttachmentIds || undefined;

          const executePreSearch = () => executePreSearchStreamService({
            param: { threadId: effectiveThreadId, roundNumber: String(newRoundNumber) },
            json: { userQuery: pendingMessage, fileContext: fileContext || undefined, attachmentIds },
          });

          const handleResponse = async (response: Response) => {
            if (!response.ok && response.status !== 409) {
              console.error('[ChatStoreProvider] Pre-search execution failed:', response.status);
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.FAILED);
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
              store.getState().updatePreSearchStatus(newRoundNumber, AnalysisStatuses.COMPLETE);
            }

            store.getState().clearPreSearchActivity(newRoundNumber);
            queryClientRef.current.invalidateQueries({
              queryKey: queryKeys.threads.preSearches(effectiveThreadId),
            });
          };

          if (isPlaceholder) {
            createPreSearch.mutateAsync({
              param: { threadId: effectiveThreadId, roundNumber: newRoundNumber.toString() },
              json: { userQuery: pendingMessage, fileContext: fileContext || undefined, attachmentIds },
            }).then((createResponse) => {
              if (createResponse && createResponse.data) {
                const preSearchWithDates = transformPreSearch(createResponse.data);
                store.getState().addPreSearch({
                  ...preSearchWithDates,
                  status: AnalysisStatuses.STREAMING,
                });
              }
              return executePreSearch();
            }).then(handleResponse).catch((error) => {
              console.error('[ChatStoreProvider] Failed to create/execute placeholder pre-search:', error);
              store.getState().clearPreSearchActivity(newRoundNumber);
              store.getState().clearPreSearchTracking(newRoundNumber);
            });
          } else {
            executePreSearch().then(handleResponse).catch((error) => {
              console.error('[ChatStoreProvider] Failed to execute stuck pre-search:', error);
              store.getState().clearPreSearchActivity(newRoundNumber);
              store.getState().clearPreSearchTracking(newRoundNumber);
            });
          }
        });
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
