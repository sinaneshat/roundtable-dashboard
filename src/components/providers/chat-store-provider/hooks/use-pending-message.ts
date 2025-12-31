'use client';

import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import { getCurrentRoundNumber, getEnabledParticipantModelIds, rlog } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';
import { getEffectiveWebSearchEnabled } from '@/stores/chat';

import type { ChatHook } from '../types';

type UsePendingMessageParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  sendMessageRef: MutableRefObject<ChatHook['sendMessage']>;
};

export function usePendingMessage({
  store,
  chat,
  sendMessageRef,
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
  const formEnableWebSearch = useStore(store, s => s.enableWebSearch);
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);

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

        const effectiveThreadId = thread?.id || currentState.createdThreadId || '';
        currentState.addPreSearch({
          id: `placeholder-presearch-${effectiveThreadId}-${newRoundNumber}`,
          threadId: effectiveThreadId,
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
  ]);
}
