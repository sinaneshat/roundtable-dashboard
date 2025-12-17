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
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { useMultiParticipantChat } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { getThreadMessagesService, getThreadSummariesService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

import { ChatStoreContext } from './context';
import {
  useMessageSync,
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

  // Initialize store once per provider
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }

  const store = storeRef.current;

  // Subscribe to store state for AI SDK hook initialization
  const thread = useStore(store, s => s.thread);
  const participants = useStore(store, s => s.participants);
  const messages = useStore(store, s => s.messages);
  const enableWebSearch = useStore(store, s => s.enableWebSearch);
  const createdThreadId = useStore(store, s => s.createdThreadId);
  const hasEarlyOptimisticMessage = useStore(store, s => s.hasEarlyOptimisticMessage);
  const streamResumptionPrefilled = useStore(store, s => s.streamResumptionPrefilled);
  const pendingAttachmentIds = useStore(store, s => s.pendingAttachmentIds);
  const pendingFileParts = useStore(store, s => s.pendingFileParts);

  const effectiveThreadId = thread?.id || createdThreadId || '';

  // Animation tracking
  const clearAnimations = useStore(store, s => s.clearAnimations);
  const completeAnimation = useStore(store, s => s.completeAnimation);

  // Error handling callback
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  // onComplete callback for summary triggering
  const handleComplete = useCallback(async (sdkMessages: UIMessage[]) => {
    const currentState = store.getState();

    if (currentState.thread || currentState.createdThreadId) {
      const { thread: storeThread, participants: storeParticipants, selectedMode, createdThreadId: storeCreatedThreadId } = currentState;
      const threadId = storeThread?.id || storeCreatedThreadId;
      const mode = storeThread?.mode || selectedMode;

      if (threadId && mode && sdkMessages.length > 0) {
        try {
          const roundNumber = getCurrentRoundNumber(sdkMessages);

          if (currentState.hasSummaryBeenCreated(roundNumber)) {
            return;
          }

          const userMessage = sdkMessages.findLast(m => m.role === MessageRoles.USER);
          const userQuestion = userMessage?.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p)?.text || '';

          await currentState.waitForAllAnimations();

          currentState.markSummaryCreated(roundNumber);

          currentState.createPendingSummary({
            roundNumber,
            messages: sdkMessages,
            userQuestion,
            threadId,
            mode,
          });

          currentState.completeStreaming();

          // ✅ RATE LIMIT FIX: Use staleTime to prevent redundant fetches during rapid re-renders
          // These fetches happen after participant streaming completes but before summary streaming starts.
          // Without staleTime, rapid component updates can trigger multiple fetches causing 429 errors.
          const FETCH_STALE_TIME = 5 * 1000; // 5 seconds - prevents redundant fetches during transition

          // Fetch fresh messages for attachment URLs
          try {
            const result = await queryClientRef.current.fetchQuery({
              queryKey: queryKeys.threads.messages(threadId),
              queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
              staleTime: FETCH_STALE_TIME,
            });
            if (result.success && result.data?.messages) {
              const uiMessages = chatMessagesToUIMessages(result.data.messages, storeParticipants);
              currentState.setMessages(uiMessages);
            }
          } catch {
            // Non-blocking
          }

          // ✅ AI SDK v5 FIX: Fetch summaries from backend to ensure frontend has latest data
          // This is critical because frontend's createPendingSummary might have failed
          // (e.g., due to metadata validation issues) but backend creates the summary
          // Fetching ensures the pending summary from backend is loaded and can trigger streaming
          try {
            const summariesResult = await queryClientRef.current.fetchQuery({
              queryKey: queryKeys.threads.summaries(threadId),
              queryFn: () => getThreadSummariesService({ param: { id: threadId } }),
              staleTime: FETCH_STALE_TIME,
            });
            if (summariesResult.success && summariesResult.data?.items) {
              // Get current frontend summaries
              const currentSummaries = currentState.summaries;
              // Check if backend has summaries that frontend doesn't have
              const backendSummaries = summariesResult.data.items;
              const currentSummaryIds = new Set(currentSummaries.map((a: { id: string }) => a.id));

              // Find new summaries from backend
              const newSummaries = backendSummaries.filter((ba: { id: string }) => !currentSummaryIds.has(ba.id));

              if (newSummaries.length > 0) {
                // Merge backend summaries with frontend summaries, preferring backend data
                const mergedSummaries = [
                  ...currentSummaries.filter((ca: { roundNumber: number }) => !backendSummaries.some((ba: { roundNumber: number }) => ba.roundNumber === ca.roundNumber)),
                  ...backendSummaries.map(ba => ({
                    ...ba,
                    // Convert dates from strings if needed
                    createdAt: typeof ba.createdAt === 'string' ? new Date(ba.createdAt) : ba.createdAt,
                    completedAt: ba.completedAt
                      ? typeof ba.completedAt === 'string' ? new Date(ba.completedAt) : ba.completedAt
                      : null,
                  })),
                ];
                currentState.setSummaries(mergedSummaries as typeof currentSummaries);
              }
            }
          } catch {
            // Non-blocking - frontend will use whatever summaries it has
          }
        } catch (error) {
          console.error('[Provider:handleComplete] Summary creation failed', {
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

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}
