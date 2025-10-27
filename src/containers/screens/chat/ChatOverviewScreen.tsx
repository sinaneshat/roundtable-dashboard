'use client';

import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useModelsQuery } from '@/hooks/queries/models';
import {
  useAnalysisCreation,
  useAnalysisDeduplication,
  useChatAnalysis,
  useChatScroll,
  useSelectedParticipants,
  useStreamingLoaderState,
  useSyncedMessageRefs,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  const { data: modelsData } = useModelsQuery();
  const defaultModelId = modelsData?.data?.default_model_id;

  const {
    messages,
    startRound,
    isStreaming,
    currentParticipantIndex,
    error: streamError,
    retry: retryRound,
    initializeThread,
    setOnComplete,
    thread: currentThread,
    participants: contextParticipants,
    stop: stopStreaming,
  } = useSharedChatContext();

  // Track if we're waiting to start streaming after thread creation
  const [waitingToStartStreaming, setWaitingToStartStreaming] = useState(false);

  const { setThreadTitle, setThreadActions } = useThreadHeader();

  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    if (defaultModelId) {
      return [
        {
          id: 'participant-default',
          modelId: defaultModelId,
          role: '',
          priority: 0,
        },
      ];
    }
    return [];
  }, [defaultModelId]);

  const {
    selectedParticipants,
    setSelectedParticipants,
    handleRemoveParticipant,
  } = useSelectedParticipants(initialParticipants);

  const [selectedMode, setSelectedMode] = useState<ChatModeId>(() => getDefaultChatMode());
  const [inputValue, setInputValue] = useState('');
  const [showInitialUI, setShowInitialUI] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const hasSentInitialPromptRef = useRef(false);
  const hasTriggeredStreamingRef = useRef(false);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);

  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
  } = useChatAnalysis({
    threadId: createdThreadId || '',
    mode: selectedMode,
    enabled: false,
  });

  // Deduplicate analyses using shared hook
  const analyses = useAnalysisDeduplication(rawAnalyses);

  // Use synced refs to prevent stale closures in callbacks
  const { messagesRef, participantsRef } = useSyncedMessageRefs({
    messages,
    participants: contextParticipants,
    createPendingAnalysis,
  });

  // Use consolidated analysis creation hook
  const { handleComplete: analysisCompleteCallback, createdAnalysisRoundsRef } = useAnalysisCreation({
    createPendingAnalysis,
    messages,
    participants: contextParticipants,
    messagesRef,
    participantsRef,
  });

  const createThreadMutation = useCreateThreadMutation();

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const prompt = inputValue.trim();

      if (!prompt || selectedParticipants.length === 0 || isCreatingThread || isStreaming) {
        return;
      }

      try {
        setIsCreatingThread(true);

        const createThreadRequest = toCreateThreadRequest({
          message: prompt,
          mode: selectedMode,
          participants: selectedParticipants,
        });

        const response = await createThreadMutation.mutateAsync({
          json: createThreadRequest,
        });

        const { thread, participants, messages: initialMessages } = response.data;

        // Backend already provides clean, deduplicated data
        const threadWithDates = {
          ...thread,
          createdAt: new Date(thread.createdAt),
          updatedAt: new Date(thread.updatedAt),
          lastMessageAt: thread.lastMessageAt ? new Date(thread.lastMessageAt) : null,
        };

        const participantsWithDates = participants.map(p => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }));

        // Convert initial messages to UI messages with dates
        const messagesWithDates = initialMessages.map(m => ({
          ...m,
          createdAt: new Date(m.createdAt),
        }));

        setShowInitialUI(false);
        setInputValue('');
        setCreatedThreadId(thread.id);

        // Set analysis creation callback
        setOnComplete(analysisCompleteCallback);

        // AI SDK v5 Pattern: Initialize thread WITH backend messages
        // Backend already saved the user message and returns it in the response
        // We pass it to initializeThread, which sets it as initialMessages for useChat
        // useChat will automatically trigger streaming because there's a user message without responses
        // This follows the crash course pattern (Exercise 01.07, 04.02, 04.03)
        const uiMessages = messagesWithDates.map((m): UIMessage => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: m.parts as unknown as UIMessage['parts'],
          metadata: m.metadata,
        }));

        initializeThread(threadWithDates, participantsWithDates, uiMessages);

        // AI SDK v5 Pattern: Set flag to trigger streaming once chat is ready
        // The useEffect below will watch for the thread to be initialized and chat to be ready
        // before calling startRound() - this ensures useChat has finished re-initializing
        setWaitingToStartStreaming(true);
        hasSentInitialPromptRef.current = true;
      } catch (error) {
        showApiErrorToast('Error creating thread', error);
        setShowInitialUI(true);
      } finally {
        setIsCreatingThread(false);
      }
    },
    [
      inputValue,
      isCreatingThread,
      isStreaming,
      selectedMode,
      selectedParticipants,
      createThreadMutation,
      initializeThread,
      setOnComplete,
      analysisCompleteCallback,
    ],
  );

  const handleSuggestionClick = useCallback((prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, [setSelectedParticipants]);

  // AI SDK v5 Pattern: Wait for chat to be ready before starting streaming
  // When initializeThread is called with a new thread, the threadId changes
  // which causes useChat to re-initialize. We need to wait for that process
  // to complete (status becomes 'ready') before calling startRound().
  useEffect(() => {
    if (
      waitingToStartStreaming
      && !hasTriggeredStreamingRef.current
      && currentThread
      && messages.length > 0
      && !isStreaming
      && contextParticipants.length > 0
    ) {
      // Check if there's a user message (the thread should have been created with one)
      const hasUserMessage = messages.some(m => m.role === 'user');

      if (hasUserMessage) {
        hasTriggeredStreamingRef.current = true;
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional state update to trigger streaming once chat is ready
        setWaitingToStartStreaming(false);

        // AI SDK v5 Pattern: Use requestAnimationFrame to ensure React has painted
        // This gives useChat time to fully initialize after threadId change
        requestAnimationFrame(() => {
          try {
            // startRound will check if status is 'ready' internally
            // If not ready yet, it will silently return - we rely on the retry mechanism
            startRound();
          } catch (error) {
            showApiErrorToast('Error starting conversation', error);
            setWaitingToStartStreaming(false);
          }
        });
      }
    }
  }, [
    waitingToStartStreaming,
    currentThread,
    messages,
    isStreaming,
    contextParticipants,
    startRound,
  ]);

  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  // React 19 Pattern: Initialize default participants using queueMicrotask
  // Schedule this work to happen after render, avoiding useEffect dependency issues
  const hasInitializedParticipantsRef = useRef(false);
  if (
    !hasInitializedParticipantsRef.current
    && selectedParticipants.length === 0
    && defaultModelId
    && initialParticipants.length > 0
  ) {
    hasInitializedParticipantsRef.current = true;
    queueMicrotask(() => {
      setSelectedParticipants(initialParticipants);
    });
  }

  // React 19 Pattern: Initialize thread header on mount (acceptable use of useEffect for initialization)
  useEffect(() => {
    setThreadTitle(null);
    setThreadActions(null);
  }, [setThreadTitle, setThreadActions]);

  // React 19 Pattern: Handle streaming stop when returning to initial UI using queueMicrotask
  // This avoids reactive useEffect and provides more predictable behavior
  const prevShowInitialUIRef = useRef(showInitialUI);
  if (prevShowInitialUIRef.current !== showInitialUI) {
    prevShowInitialUIRef.current = showInitialUI;
    if (showInitialUI) {
      // Reset streaming trigger flags when returning to initial UI
      hasTriggeredStreamingRef.current = false;
      setWaitingToStartStreaming(false);

      // AI SDK v5 Pattern: Clear analysis tracking when resetting UI
      createdAnalysisRoundsRef.current.clear();

      if (isStreaming) {
        queueMicrotask(() => {
          stopStreaming();
        });
      }
    }
  }

  useEffect(() => {
    return () => {
      setOnComplete(undefined);
      // Reset streaming trigger flags on unmount
      hasTriggeredStreamingRef.current = false;
      setWaitingToStartStreaming(false);
      // AI SDK v5 Pattern: Clear analysis tracking on unmount
      createdAnalysisRoundsRef.current.clear();
    };
  }, [setOnComplete]);

  // Scroll management - auto-scroll during streaming (if user is near bottom)
  // Always scroll when analysis appears (regardless of position)
  useChatScroll({
    messages,
    analyses,
    isStreaming,
    scrollContainerId: 'chat-scroll-container',
    enableNearBottomDetection: !showInitialUI, // Only enable detection when chat is visible
  });

  // Streaming loader state calculation
  const { showLoader, isAnalyzing } = useStreamingLoaderState({
    analyses,
    isStreaming,
    messages,
    selectedParticipants,
  });

  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <UnifiedErrorBoundary context="chat">
      <div className="min-h-screen flex flex-col">
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <WavyBackground containerClassName="h-full w-full" />
        </div>

        <div id="chat-scroll-container" className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
          <AnimatePresence>
            {showInitialUI && (
              <motion.div
                key="initial-ui"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="pb-8"
              >
                <div className="flex flex-col items-center gap-4 sm:gap-6 text-center">
                  <motion.div
                    className="relative h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <Image
                      src={BRAND.logos.main}
                      alt={BRAND.name}
                      fill
                      className="object-contain"
                      priority
                    />
                  </motion.div>

                  <motion.h1
                    className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {BRAND.name}
                  </motion.h1>

                  <motion.p
                    className="text-base xs:text-lg sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-2xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {BRAND.tagline}
                  </motion.p>

                  <motion.div
                    className="w-full mt-4 sm:mt-6 md:mt-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <ChatQuickStart onSuggestionClick={handleSuggestionClick} />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!showInitialUI && currentThread && (
              <motion.div
                key="streaming-ui"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <UnifiedErrorBoundary context="message-list" onReset={retryRound}>
                  <ChatMessageList
                    messages={messages}
                    user={{
                      name: sessionUser?.name || 'You',
                      image: sessionUser?.image || null,
                    }}
                    participants={contextParticipants}
                    isStreaming={isStreaming}
                    currentParticipantIndex={currentParticipantIndex}
                    currentStreamingParticipant={currentStreamingParticipant}
                  />
                </UnifiedErrorBoundary>

                {createdThreadId && analyses[0] && (
                  <div className="mt-6">
                    <RoundAnalysisCard
                      analysis={analyses[0]}
                      threadId={createdThreadId}
                      isLatest={true}
                      onStreamComplete={async () => {
                        try {
                          // ✅ CRITICAL: Wait for backend message persistence before navigation
                          // FLOW_DOCUMENTATION.md Part 1: URL updates after moderator analysis completes
                          // Race condition: Backend saves messages asynchronously after streaming
                          // If we navigate too quickly, thread page SSR fetch won't get all messages
                          // See: src/api/services/message-persistence.service.ts:287-418
                          //
                          // AI SDK v5 Pattern: Use requestIdleCallback with timeout for smart waiting
                          // This allows navigation during browser idle time, with 2s max fallback
                          // Reference: AI SDK v5 best practices for async state synchronization
                          await new Promise<void>((resolve) => {
                            if (typeof requestIdleCallback !== 'undefined') {
                              requestIdleCallback(() => resolve(), { timeout: 2000 });
                            } else {
                              // Fallback: Double rAF ensures full render cycle + paint before navigation
                              // More reliable than setTimeout for browser rendering synchronization
                              requestAnimationFrame(() => {
                                requestAnimationFrame(() => resolve());
                              });
                            }
                          });

                          router.push(`/chat/${currentThread?.slug}`);
                        } catch (error) {
                          showApiErrorToast('Error navigating to thread', error);
                        }
                      }}
                    />
                  </div>
                )}

                {streamError && !isStreaming && (
                  <div className="flex justify-center mt-4">
                    <button
                      type="button"
                      onClick={retryRound}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                    >
                      {t('chat.errors.retry')}
                    </button>
                  </div>
                )}

                {showLoader && (
                  <StreamingParticipantsLoader
                    className="mt-4"
                    participants={selectedParticipants}
                    currentParticipantIndex={currentParticipantIndex}
                    isAnalyzing={isAnalyzing}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          ref={inputContainerRef}
          className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 mt-auto"
        >
          <div className="container max-w-3xl mx-auto px-4 sm:px-6">
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handlePromptSubmit}
              status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
              onStop={stopStreaming}
              placeholder={t('chat.input.placeholder')}
              participants={selectedParticipants}
              currentParticipantIndex={currentParticipantIndex}
              onRemoveParticipant={isStreaming ? undefined : handleRemoveParticipant}
              toolbar={(
                <>
                  <ChatParticipantsList
                    participants={selectedParticipants}
                    onParticipantsChange={isStreaming ? undefined : setSelectedParticipants}
                  />
                  <ChatModeSelector
                    selectedMode={selectedMode}
                    onModeChange={isStreaming ? undefined : setSelectedMode}
                  />
                </>
              )}
            />
          </div>
        </div>
      </div>
    </UnifiedErrorBoundary>
  );
}
