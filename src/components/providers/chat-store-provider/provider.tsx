'use client';

/**
 * Chat Store Provider
 *
 * Official Zustand v5 + Next.js pattern:
 * - Vanilla store factory
 * - React Context for distribution
 * - Per-provider store instance
 *
 * Bridges AI SDK hook (useMultiParticipantChat) with Zustand store.
 */

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useMultiParticipantChat } from '@/hooks/utils';
import { showApiErrorToast } from '@/lib/toast';
import { getMessageMetadata } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

import { ChatStoreContext } from './context';
import {
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

export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const queryClient = useQueryClient();
  const storeRef = useRef<ChatStoreApi | null>(null);
  const prevPathnameRef = useRef<string | null>(null);
  const queryClientRef = useRef(queryClient);
  // Ref for moderator trigger - set later by useModeratorTrigger hook
  const triggerModeratorRef = useRef<((roundNumber: number, participantMessageIds: string[]) => Promise<void>) | null>(null);

  // Initialize store once per provider
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }

  const store = storeRef.current;

  // ✅ ZUSTAND v5: Batch store subscriptions with useShallow to prevent cascading re-renders
  // Instead of 11 separate subscriptions, use a single batched subscription
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

  // Error handling callback
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  // onComplete callback for moderator triggering
  const handleComplete = useCallback(async (sdkMessages: UIMessage[]) => {
    const currentState = store.getState();

    if (currentState.thread || currentState.createdThreadId) {
      const { thread: storeThread, participants: storeParticipants, selectedMode, createdThreadId: storeCreatedThreadId } = currentState;
      const threadId = storeThread?.id || storeCreatedThreadId;
      const mode = storeThread?.mode || selectedMode;

      if (threadId && mode && sdkMessages.length > 0) {
        try {
          const roundNumber = getCurrentRoundNumber(sdkMessages);

          if (currentState.hasModeratorBeenCreated(roundNumber)) {
            return;
          }

          // ✅ RACE FIX: Wait for ALL animations (pre-search, participants) before triggering moderator
          // This prevents moderator from triggering while pre-search is still animating
          await currentState.waitForAllAnimations();

          // ✅ RACE FIX: After waiting for animations, verify pre-search is complete if enabled
          // This handles race where pre-search completes but animation just finished
          const latestState = store.getState();
          const webSearchEnabled = latestState.thread?.enableWebSearch || latestState.enableWebSearch;
          if (webSearchEnabled) {
            const preSearchForRound = latestState.preSearches.find(ps => ps.roundNumber === roundNumber);
            if (preSearchForRound && preSearchForRound.status !== 'complete') {
              // Pre-search still running, don't trigger moderator yet
              // The flow state machine will trigger it when pre-search completes
              return;
            }
          }

          currentState.markModeratorCreated(roundNumber);
          // ✅ FIX: Don't call completeStreaming() here - it resets isModeratorStreaming to false
          // The moderator trigger will manage its own streaming state
          // completeStreaming() will be called by the moderator trigger when it completes

          // Trigger moderator stream programmatically
          // Extract participant message IDs from SDK messages for this round
          const participantMessageIds = sdkMessages
            .filter((m) => {
              const meta = getMessageMetadata(m.metadata);
              if (!meta)
                return false;

              return (
                meta.role === 'assistant'
                && 'roundNumber' in meta
                && meta.roundNumber === roundNumber
                && !('isModerator' in meta)
              );
            })
            .map(m => m.id);

          // Trigger the moderator stream if we have participant messages
          if (participantMessageIds.length > 0) {
            // Set moderator streaming state for input blocking
            currentState.setIsModeratorStreaming(true);
            triggerModeratorRef.current?.(roundNumber, participantMessageIds);
          }

          // Moderator messages are stored as chatMessage with isModerator: true metadata
          // The triggerModerator function handles fetching messages after stream completes
        } catch (error) {
          console.error('[Provider:handleComplete] Moderator creation failed', {
            error,
            threadId,
            mode,
            messageCount: sdkMessages.length,
            participantCount: storeParticipants.length,
            screenMode: currentState.screenMode,
          });
        }
      }
    }
  }, [store]);

  // Initialize AI SDK hook
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
  });

  // Chat method refs
  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);
  const setMessagesRef = useRef(chat.setMessages);

  // Track when thread changes for cleanup
  const prevCreatedThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (createdThreadId !== prevCreatedThreadIdRef.current) {
      prevCreatedThreadIdRef.current = createdThreadId;
    }
  }, [createdThreadId]);

  // State sync (refs, reactive values, callbacks)

  useStateSync({
    store,
    chat,
    storeRef,
    queryClientRef,
    sendMessageRef,
    startRoundRef,
    setMessagesRef,
  });

  // Message sync between AI SDK and store
  const { lastStreamActivityRef } = useMessageSync({ store, chat });

  // Streaming trigger for round 0

  useStreamingTrigger({
    store,
    chat,
    effectiveThreadId,
    queryClientRef,
  });

  // Round resumption for incomplete rounds
  useRoundResumption({ store, chat });

  // Pre-search resumption after page refresh
  usePreSearchResumption({
    store,
    effectiveThreadId,
    queryClientRef,
  });

  // Pending message sender

  usePendingMessage({
    store,
    chat,
    sendMessageRef,
  });

  // Stuck stream detection
  useStuckStreamDetection({
    store,
    lastStreamActivityRef,
  });

  // Navigation cleanup

  useNavigationCleanup({
    store,
    prevPathnameRef,
  });

  // Moderator trigger after participants complete
  const { triggerModerator } = useModeratorTrigger({ store });

  // ✅ CRITICAL FIX: Use useLayoutEffect to sync ref BEFORE other effects run
  // Without this, handleComplete might call triggerModeratorRef.current with null
  // when it runs before this effect has a chance to update the ref
  useLayoutEffect(() => {
    triggerModeratorRef.current = triggerModerator;
  }, [triggerModerator]);

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}
