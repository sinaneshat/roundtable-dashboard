'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import {
  useChatScroll,
  useModelLookup,
  useStreamingLoaderState,
} from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import { waitForIdleOrRender } from '@/lib/utils/browser-timing';
import {
  useChatFormActions,
  useScreenInitialization,
} from '@/stores/chat';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  // Consolidated model lookup hook
  const { defaultModelId } = useModelLookup();

  // ============================================================================
  // STORE STATE (Grouped with useShallow for Performance)
  // ============================================================================

  // AI SDK state
  const { messages, isStreaming, currentParticipantIndex, error: streamError } = useChatStore(
    useShallow(s => ({
      messages: s.messages,
      isStreaming: s.isStreaming,
      currentParticipantIndex: s.currentParticipantIndex,
      error: s.error,
    })),
  );

  // Thread state
  const { thread: currentThread, participants: contextParticipants } = useChatStore(
    useShallow(s => ({
      thread: s.thread,
      participants: s.participants,
    })),
  );

  // UI state
  const { showInitialUI, isCreatingThread, waitingToStartStreaming, createdThreadId } = useChatStore(
    useShallow(s => ({
      showInitialUI: s.showInitialUI,
      isCreatingThread: s.isCreatingThread,
      waitingToStartStreaming: s.waitingToStartStreaming,
      createdThreadId: s.createdThreadId,
    })),
  );

  // Form state
  const { inputValue, selectedMode, selectedParticipants } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
    })),
  );

  // Analysis state
  const analyses = useChatStore(s => s.analyses);

  // ============================================================================
  // STORE ACTIONS (Grouped with useShallow for Performance)
  // ============================================================================

  // AI SDK actions
  const { startRound, retry: retryRound, stop: stopStreaming } = useChatStore(
    useShallow(s => ({
      startRound: s.startRound,
      retry: s.retry,
      stop: s.stop,
    })),
  );

  // Form actions
  const { setInputValue, setSelectedMode, setSelectedParticipants, removeParticipant, resetForm } = useChatStore(
    useShallow(s => ({
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      removeParticipant: s.removeParticipant,
      resetForm: s.resetForm,
    })),
  );

  // UI actions
  const { setWaitingToStartStreaming } = useChatStore(
    useShallow(s => ({
      setWaitingToStartStreaming: s.setWaitingToStartStreaming,
    })),
  );

  // Refs for tracking
  const hasSentInitialPromptRef = useRef(false);
  const hasTriggeredStreamingRef = useRef(false);

  const { setThreadTitle, setThreadActions } = useThreadHeader();

  // Initialize default participants if needed
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

  // Form actions hook
  const formActions = useChatFormActions();

  // Unified screen initialization
  useScreenInitialization({
    mode: 'overview',
    thread: currentThread,
    participants: contextParticipants,
    chatMode: selectedMode,
  });

  // Handle form submission
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!inputValue.trim() || selectedParticipants.length === 0 || isCreatingThread || isStreaming) {
        return;
      }

      try {
        await formActions.handleCreateThread();
        hasSentInitialPromptRef.current = true;
      } catch (error) {
        showApiErrorToast('Error creating thread', error);
      }
    },
    [inputValue, selectedParticipants, isCreatingThread, isStreaming, formActions],
  );

  const handleSuggestionClick = useCallback((prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, [setInputValue, setSelectedMode, setSelectedParticipants]);

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

        setWaitingToStartStreaming(false);

        // AI SDK v5 Pattern: Use requestAnimationFrame to ensure React has painted
        // This gives useChat time to fully initialize after threadId change
        requestAnimationFrame(() => {
          try {
            // startRound will check if status is 'ready' internally
            // If not ready yet, it will silently return - we rely on the retry mechanism
            startRound?.();
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
    setWaitingToStartStreaming,
  ]);

  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  // React 19 Pattern: Initialize thread header on mount
  useEffect(() => {
    setThreadTitle(null);
    setThreadActions(null);
  }, [setThreadTitle, setThreadActions]);

  // Consolidated: Reset to defaults on mount (atomically)
  // Runs on mount to reset form state when navigating from thread → overview
  useEffect(() => {
    // Reset form to clear any thread-specific state
    resetForm();

    // Immediately set defaults if available
    if (defaultModelId && initialParticipants.length > 0) {
      setSelectedParticipants(initialParticipants);
      setSelectedMode(getDefaultChatMode());
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: Initialize defaults when defaultModelId becomes available (first load)
  // This handles the case where defaultModelId isn't ready on initial mount
  useEffect(() => {
    if (
      selectedParticipants.length === 0
      && defaultModelId
      && initialParticipants.length > 0
    ) {
      setSelectedParticipants(initialParticipants);
      if (!selectedMode) {
        setSelectedMode(getDefaultChatMode());
      }
    }
  }, [defaultModelId, initialParticipants, selectedParticipants.length, selectedMode, setSelectedParticipants, setSelectedMode]);

  // React 19 Pattern: Handle streaming stop when returning to initial UI using queueMicrotask
  // This avoids reactive useEffect and provides more predictable behavior
  const prevShowInitialUIRef = useRef(showInitialUI);
  if (prevShowInitialUIRef.current !== showInitialUI) {
    prevShowInitialUIRef.current = showInitialUI;
    if (showInitialUI) {
      // Reset streaming trigger flags when returning to initial UI
      hasTriggeredStreamingRef.current = false;
      setWaitingToStartStreaming(false);

      if (isStreaming) {
        queueMicrotask(() => {
          stopStreaming?.();
        });
      }
    }
  }

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
                          // Wait for backend persistence before navigation
                          await waitForIdleOrRender();
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
              onRemoveParticipant={isStreaming ? undefined : removeParticipant}
              toolbar={(
                <>
                  <ChatParticipantsList
                    participants={selectedParticipants}
                    onParticipantsChange={isStreaming ? undefined : setSelectedParticipants}
                  />
                  <ChatModeSelector
                    selectedMode={selectedMode || getDefaultChatMode()}
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
