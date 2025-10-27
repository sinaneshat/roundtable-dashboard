'use client';

import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
import { useAutoScrollToBottom, useChatAnalysis, useSelectedParticipants } from '@/hooks/utils';
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

  const messagesRef = useRef(messages);
  const participantsRef = useRef(contextParticipants);

  // React 19.2 Pattern: Use useLayoutEffect for synchronous ref updates
  // Ensures refs are current BEFORE browser paint, preventing stale closure issues
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useLayoutEffect(() => {
    participantsRef.current = contextParticipants;
  }, [contextParticipants]);

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

  // AI SDK v5 Pattern: Deduplicate analyses to prevent double rendering/triggering
  // Similar pattern to ChatThreadScreen deduplication logic
  const analyses = useMemo(() => {
    // Step 1: Deduplicate by ID
    const seenIds = new Set<string>();
    const uniqueById = rawAnalyses.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });

    // Step 2: Filter out failed analyses
    const validAnalyses = uniqueById.filter((item) => item.status !== 'failed');

    // Step 3: Deduplicate by round number (keep highest priority status)
    const deduplicatedByRound = validAnalyses.reduce((acc, item) => {
      const existing = acc.get(item.roundNumber);
      if (!existing) {
        acc.set(item.roundNumber, item);
        return acc;
      }

      // Priority: completed > streaming > pending
      const getStatusPriority = (status: string) => {
        switch (status) {
          case 'completed': return 3;
          case 'streaming': return 2;
          case 'pending': return 1;
          default: return 0;
        }
      };

      const itemPriority = getStatusPriority(item.status);
      const existingPriority = getStatusPriority(existing.status);

      if (itemPriority > existingPriority) {
        acc.set(item.roundNumber, item);
        return acc;
      }

      // If same priority, keep the most recent one
      if (itemPriority === existingPriority) {
        const itemTime = item.createdAt instanceof Date ? item.createdAt.getTime() : new Date(item.createdAt).getTime();
        const existingTime = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
        if (itemTime > existingTime) {
          acc.set(item.roundNumber, item);
        }
      }

      return acc;
    }, new Map<number, typeof rawAnalyses[number]>());

    return Array.from(deduplicatedByRound.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [rawAnalyses]);

  const createPendingAnalysisRef = useRef(createPendingAnalysis);
  // React 19.2 Pattern: Use useLayoutEffect for synchronous ref updates
  useLayoutEffect(() => {
    createPendingAnalysisRef.current = createPendingAnalysis;
  }, [createPendingAnalysis]);

  // AI SDK v5 Pattern: Track which rounds have analysis created to prevent duplicates
  // Module-level Map would persist across component instances, so use ref
  const createdAnalysisRoundsRef = useRef(new Set<number>());

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

        // AI SDK v5 Pattern: Last Participant Callback Flow
        // When the LAST participant completes its response:
        // 1. useMultiParticipantChat triggers onComplete callback
        // 2. This callback creates a pending analysis (once per round via tracking)
        // 3. ModeratorAnalysisStream detects the pending analysis and invokes the stream
        // This ensures the analysis stream is ONLY triggered after ALL participants complete
        setOnComplete(() => {
          const allMessages = messagesRef.current;
          const currentMessages = allMessages.filter((m) => {
            if (m.role !== 'user') {
              return true;
            }
            const metadata = m.metadata as Record<string, unknown> | undefined;
            const isParticipantTrigger = metadata?.isParticipantTrigger === true;
            return !isParticipantTrigger;
          });

          const currentParticipants = participantsRef.current;

          const assistantMessages = currentMessages.filter(m => m.role === 'assistant');
          const enabledParticipants = currentParticipants.filter(p => p.isEnabled);

          if (assistantMessages.length === 0 || assistantMessages.length < enabledParticipants.length) {
            return;
          }

          const lastUserMessage = currentMessages.findLast(m => m.role === 'user');
          const metadata = lastUserMessage?.metadata as Record<string, unknown> | undefined;
          const roundNumber = (metadata?.roundNumber as number) || 1;

          // AI SDK v5 Pattern: Prevent duplicate analysis creation
          // Check if we've already created an analysis for this round
          if (createdAnalysisRoundsRef.current.has(roundNumber)) {
            return;
          }

          let userQuestion = '';
          if (lastUserMessage?.parts) {
            const textPart = lastUserMessage.parts.find(p => p.type === 'text');
            if (textPart && typeof textPart === 'object' && 'text' in textPart) {
              userQuestion = String(textPart.text || '');
            }
          }

          if (!lastUserMessage) {
            return;
          }

          // ✅ CRITICAL FIX: Don't create analysis if all participants failed
          // Check if there are any successful assistant messages in this round
          const allParticipantsFailed = assistantMessages.every((m) => {
            const metadata = m.metadata as Record<string, unknown> | undefined;
            const errorCategory = metadata?.errorCategory;
            return errorCategory !== undefined && errorCategory !== null;
          });

          if (allParticipantsFailed && assistantMessages.length > 0) {
            // All participants failed - don't create analysis
            return;
          }

          try {
            // Mark this round as having analysis created BEFORE calling createPendingAnalysis
            // This prevents duplicate calls if onComplete is triggered multiple times
            createdAnalysisRoundsRef.current.add(roundNumber);

            createPendingAnalysisRef.current(
              roundNumber,
              currentMessages,
              currentParticipants,
              userQuestion || 'No question provided',
            );
          } catch {
            // If creation fails, remove from tracked set so it can be retried
            createdAnalysisRoundsRef.current.delete(roundNumber);
          }
        });

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
      startRound,
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

  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.parts?.map(p => (p.type === 'text' || p.type === 'reasoning') ? p.text : '').join('') || '';
  useAutoScrollToBottom(
    { length: messages.length, content: lastMessageContent, isStreaming },
    !showInitialUI,
  );

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

                {(() => {
                  const isAnalyzing = analyses.some(a => a.status === 'pending' || a.status === 'streaming');
                  const hasMessages = messages.length > 0;
                  const hasCompletedAnalysis = analyses.some(a => a.status === 'completed' || a.status === 'failed');
                  const isTransitioning = hasMessages && !hasCompletedAnalysis && !isStreaming && !isAnalyzing;

                  const showLoader = ((isStreaming || isAnalyzing || isTransitioning) && selectedParticipants.length > 1);

                  return showLoader && (
                    <StreamingParticipantsLoader
                      className="mt-4"
                      participants={selectedParticipants}
                      currentParticipantIndex={currentParticipantIndex}
                      isAnalyzing={isAnalyzing || isTransitioning}
                    />
                  );
                })()}
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
