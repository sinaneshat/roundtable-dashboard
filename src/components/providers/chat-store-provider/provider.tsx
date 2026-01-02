'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { MessageRoles, MessageStatuses, TextPartStates } from '@/api/core/enums';
import { useMultiParticipantChat } from '@/hooks/utils';
import { showApiErrorToast } from '@/lib/toast';
import { getCurrentRoundNumber, getMessageMetadata, getRoundNumber } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

import { ChatStoreContext } from './context';
import {
  useChangelogSync,
  useMessageSync,
  useModeratorTrigger,
  useNavigationCleanup,
  usePendingMessage,
  usePreSearchResumption,
  useRoundResumption,
  useStateSync,
  useStreamingTrigger,
  useStuckStreamDetection,
} from './hooks';
import type { ChatStoreProviderProps } from './types';

type TriggerModeratorFn = (roundNumber: number, participantMessageIds: string[]) => Promise<void>;

export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const queryClient = useQueryClient();
  const storeRef = useRef<ChatStoreApi | null>(null);
  const prevPathnameRef = useRef<string | null>(null);
  const queryClientRef = useRef<QueryClient>(queryClient);
  const triggerModeratorRef = useRef<TriggerModeratorFn | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }

  const store = storeRef.current;

  const {
    thread,
    participants,
    messages,
    enableWebSearch,
    createdThreadId,
    hasEarlyOptimisticMessage,
    streamResumptionPrefilled,
    pendingAttachmentIds,
    pendingFileParts,
    clearAnimations,
    completeAnimation,
  } = useStore(store, useShallow(s => ({
    thread: s.thread,
    participants: s.participants,
    messages: s.messages,
    enableWebSearch: s.enableWebSearch,
    createdThreadId: s.createdThreadId,
    hasEarlyOptimisticMessage: s.hasEarlyOptimisticMessage,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
    pendingAttachmentIds: s.pendingAttachmentIds,
    pendingFileParts: s.pendingFileParts,
    clearAnimations: s.clearAnimations,
    completeAnimation: s.completeAnimation,
  })));

  const effectiveThreadId = thread?.id || createdThreadId || '';

  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  const waitForStoreSync = useCallback(async (
    sdkMessages: readonly UIMessage[],
    roundNumber: number,
    maxWaitMs = 2000,
  ): Promise<boolean> => {
    const startTime = Date.now();
    const checkInterval = 50;

    const participantMessagesFromSdk = sdkMessages.filter((m) => {
      const meta = getMessageMetadata(m.metadata);
      return (
        m.role === MessageRoles.ASSISTANT
        && meta
        && 'roundNumber' in meta
        && meta.roundNumber === roundNumber
        && !('isModerator' in meta)
      );
    });

    if (participantMessagesFromSdk.length > 0) {
      const currentStoreMessages = store.getState().messages;
      const updatedMessages = currentStoreMessages.map((storeMsg) => {
        const sdkMatch = participantMessagesFromSdk.find(sdk => sdk.id === storeMsg.id);
        if (sdkMatch) {
          return {
            ...storeMsg,
            parts: sdkMatch.parts,
            metadata: sdkMatch.metadata,
          };
        }
        return storeMsg;
      });

      const storeMsgIds = new Set(currentStoreMessages.map(m => m.id));
      const missingFromStore = participantMessagesFromSdk.filter(m => !storeMsgIds.has(m.id));
      if (missingFromStore.length > 0) {
        updatedMessages.push(...missingFromStore);
      }

      store.getState().setMessages(updatedMessages);
    }

    while (Date.now() - startTime < maxWaitMs) {
      const storeMessages = store.getState().messages;

      const participantMessages = storeMessages.filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        const meta = getMessageMetadata(m.metadata);
        if (!meta)
          return false;
        const msgRound = getRoundNumber(m.metadata);
        const isModerator = 'isModerator' in meta && meta.isModerator === true;
        return msgRound === roundNumber && !isModerator;
      });

      const allComplete = participantMessages.every((msg) => {
        const hasStreamingParts = msg.parts?.some(
          p => 'state' in p && p.state === TextPartStates.STREAMING,
        );
        return !hasStreamingParts;
      });

      if (allComplete && participantMessages.length > 0) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.error('[handleComplete] Store sync timed out, proceeding anyway');
    return false;
  }, [store]);

  const handleComplete = useCallback(async (sdkMessages: readonly UIMessage[]) => {
    const currentState = store.getState();

    if (currentState.thread || currentState.createdThreadId) {
      const { thread: storeThread, selectedMode, createdThreadId: storeCreatedThreadId } = currentState;
      const threadId = storeThread?.id || storeCreatedThreadId;
      const mode = storeThread?.mode || selectedMode;

      if (threadId && mode && sdkMessages.length > 0) {
        try {
          const roundNumber = getCurrentRoundNumber(sdkMessages);

          if (currentState.hasModeratorBeenCreated(roundNumber)) {
            return;
          }

          if (currentState.waitingToStartStreaming || currentState.nextParticipantToTrigger !== null) {
            return;
          }

          await waitForStoreSync(sdkMessages, roundNumber);
          await currentState.waitForAllAnimations();

          const latestState = store.getState();

          if (latestState.waitingToStartStreaming || latestState.nextParticipantToTrigger !== null) {
            return;
          }

          const storeIsStreaming = latestState.isStreaming;
          const hasAnyStreamingParts = sdkMessages.some((m) => {
            const meta = getMessageMetadata(m.metadata);
            if (!meta || meta.role !== MessageRoles.ASSISTANT || 'isModerator' in meta) {
              return false;
            }
            return m.parts?.some(p => 'state' in p && p.state === TextPartStates.STREAMING) ?? false;
          });

          if (hasAnyStreamingParts && storeIsStreaming) {
            return;
          }

          const webSearchEnabled = latestState.thread?.enableWebSearch || latestState.enableWebSearch;
          if (webSearchEnabled) {
            const preSearchForRound = latestState.preSearches.find(ps => ps.roundNumber === roundNumber);
            if (preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE) {
              return;
            }
          }

          currentState.markModeratorCreated(roundNumber);

          const participantMessageIds = sdkMessages
            .filter((m) => {
              const meta = getMessageMetadata(m.metadata);
              if (!meta)
                return false;

              return (
                meta.role === MessageRoles.ASSISTANT
                && 'roundNumber' in meta
                && meta.roundNumber === roundNumber
                && !('isModerator' in meta)
              );
            })
            .map(m => m.id);

          if (participantMessageIds.length > 0) {
            currentState.setIsModeratorStreaming(true);
            triggerModeratorRef.current?.(roundNumber, participantMessageIds);
          }
        } catch {
        }
      }
    }
  }, [store, waitForStoreSync]);

  const chat = useMultiParticipantChat({
    threadId: effectiveThreadId,
    participants,
    messages,
    mode: thread?.mode,
    enableWebSearch,
    pendingAttachmentIds,
    pendingFileParts,
    onError: handleError,
    onComplete: handleComplete,
    clearAnimations,
    completeAnimation,
    hasEarlyOptimisticMessage,
    streamResumptionPrefilled,
    onResumedStreamComplete: (roundNumber, participantIndex) => {
      store.getState().handleResumedStreamComplete(roundNumber, participantIndex);
    },
    // ✅ PERF FIX: Disable resume for newly created threads - nothing to resume
    isNewlyCreatedThread: Boolean(createdThreadId),
  });

  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);
  const setMessagesRef = useRef(chat.setMessages);

  useStateSync({
    store,
    chat,
    storeRef,
    queryClientRef,
    sendMessageRef,
    startRoundRef,
    setMessagesRef,
  });

  const { lastStreamActivityRef } = useMessageSync({ store, chat });

  useStreamingTrigger({
    store,
    chat,
    effectiveThreadId,
    queryClientRef,
  });

  useRoundResumption({ store, chat });

  usePreSearchResumption({
    store,
    effectiveThreadId,
    queryClientRef,
  });

  usePendingMessage({
    store,
    chat,
    sendMessageRef,
  });

  useStuckStreamDetection({
    store,
    lastStreamActivityRef,
  });

  useNavigationCleanup({
    store,
    prevPathnameRef,
  });

  // ✅ CHANGELOG: Fetch and merge changelog when config changes between rounds
  useChangelogSync({
    store,
    effectiveThreadId,
    queryClientRef,
  });

  const { triggerModerator } = useModeratorTrigger({ store });

  useLayoutEffect(() => {
    triggerModeratorRef.current = triggerModerator;
  }, [triggerModerator]);

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}
