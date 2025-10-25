'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ChatErrorBoundary, { StreamingErrorBoundary } from '@/components/chat/chat-error-boundary';
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
import { chatAnalysisLogger, chatOverviewLogger } from '@/lib/utils/chat-error-logger';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

/**
 * ✅ ONE-WAY DATA FLOW: Chat Overview Screen
 *
 * This is a TEMPORARY screen for new thread creation:
 * 1. User submits prompt → Create thread
 * 2. Initialize context → Stream first round
 * 3. Round completes → Create analysis (client-side)
 * 4. Analysis streams → Display analysis card
 * 5. Analysis completes → Navigate to thread detail page
 *
 * Key principles:
 * - No query invalidations (navigating away immediately)
 * - Analysis created in client cache (one-time flow)
 * - Navigation happens after analysis completes
 * - Thread detail page loads fresh data from server (RSC)
 */
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

  // ✅ Use refs to capture current values for the callback
  const messagesRef = useRef(messages);
  const participantsRef = useRef(contextParticipants);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
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

  // ✅ PRE-THREAD PARTICIPANT SELECTION: Local state for participant selection BEFORE thread creation
  // This is the ONLY place where local participant state is valid
  // Once initializeThread() is called (line 220), participants come from context ONLY
  const {
    selectedParticipants,
    setSelectedParticipants,
    handleRemoveParticipant,
  } = useSelectedParticipants(initialParticipants);

  const [selectedMode, setSelectedMode] = useState<ChatModeId>(() => getDefaultChatMode());
  const [inputValue, setInputValue] = useState('');
  const [showInitialUI, setShowInitialUI] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const hasSentInitialPromptRef = useRef(false);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);

  // ✅ ONE-WAY DATA FLOW: Track initial load for overview screen
  // Overview screen is temporary - after analysis completes, we navigate to thread detail
  // No need for complex client state since we're navigating away
  const [_hasLoadedAnalysis, setHasLoadedAnalysis] = useState(false);

  // ✅ NO QUERY: We don't use the analyses query here - only create pending analysis in cache
  // This prevents the query from fetching empty data and overwriting our pending analysis
  const {
    analyses,
    createPendingAnalysis,
  } = useChatAnalysis({
    threadId: createdThreadId || '', // Need real ID for cache operations
    mode: selectedMode,
    enabled: false, // ✅ ALWAYS DISABLED - never fetch from server on overview screen
  });

  // ✅ Capture createPendingAnalysis in a ref for the callback
  const createPendingAnalysisRef = useRef(createPendingAnalysis);
  useEffect(() => {
    createPendingAnalysisRef.current = createPendingAnalysis;
  }, [createPendingAnalysis]);

  const createThreadMutation = useCreateThreadMutation();

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const prompt = inputValue.trim();

      // ✅ ERROR TRACKING: Log form submission attempt
      chatOverviewLogger.formSubmit({
        hasPrompt: !!prompt,
        participantCount: selectedParticipants.length,
        isCreatingThread,
        isStreaming,
        mode: selectedMode,
      });

      if (!prompt || selectedParticipants.length === 0 || isCreatingThread || isStreaming) {
        // ✅ ERROR TRACKING: Log validation failure
        chatOverviewLogger.warn('Form submit aborted - validation failed', {
          hasPrompt: !!prompt,
          participantCount: selectedParticipants.length,
          isCreatingThread,
          isStreaming,
        });
        return;
      }

      try {
        setIsCreatingThread(true);

        const createThreadRequest = toCreateThreadRequest({
          message: prompt,
          mode: selectedMode,
          participants: selectedParticipants,
        });

        // ✅ ERROR TRACKING: Log API request
        chatOverviewLogger.threadCreated('pending', {
          participantCount: createThreadRequest.participants.length,
          mode: createThreadRequest.mode,
        });

        const response = await createThreadMutation.mutateAsync({
          json: createThreadRequest,
        });

        const { thread, participants, messages: initialMessages } = response.data;

        // ✅ ERROR TRACKING: Log successful thread creation
        chatOverviewLogger.threadCreated(thread.id, {
          participantCount: participants.length,
          messageCount: initialMessages.length,
          mode: thread.mode,
        });

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

        const uiMessages = chatMessagesToUIMessages(initialMessages);

        setShowInitialUI(false);
        setInputValue('');
        setCreatedThreadId(thread.id);

        // ✅ CRITICAL FIX: Set up onComplete BEFORE initializing thread
        // This callback fires when the round completes (after all participants finish streaming)
        setOnComplete(() => {
          // Get current values from refs (not stale closure)
          const currentMessages = messagesRef.current;
          const currentParticipants = participantsRef.current;

          // Validate we have participant responses before triggering analysis
          const assistantMessages = currentMessages.filter(m => m.role === 'assistant');
          const enabledParticipants = currentParticipants.filter(p => p.isEnabled);

          // Only trigger analysis if we actually have responses
          if (assistantMessages.length === 0 || assistantMessages.length < enabledParticipants.length) {
            // ✅ ERROR TRACKING: Log incomplete round
            chatOverviewLogger.warn('Round incomplete - not creating analysis', {
              threadId: thread.id,
              assistantMessageCount: assistantMessages.length,
              enabledParticipantCount: enabledParticipants.length,
            });
            return;
          }

          const lastUserMessage = currentMessages.findLast(m => m.role === 'user');
          const metadata = lastUserMessage?.metadata as Record<string, unknown> | undefined;
          const roundNumber = (metadata?.roundNumber as number) || 1;

          const textPart = lastUserMessage?.parts?.find(p => p.type === 'text');
          const userQuestion = (textPart && 'text' in textPart ? textPart.text : '') || '';

          // ✅ ERROR TRACKING: Log analysis creation
          chatAnalysisLogger.create(roundNumber, {
            threadId: thread.id,
            participantCount: currentParticipants.length,
            messageCount: currentMessages.length,
          });

          // ✅ Create pending analysis when round completes AND we have all responses
          try {
            createPendingAnalysisRef.current(
              roundNumber,
              currentMessages,
              currentParticipants,
              userQuestion,
            );
          } catch (error) {
            // ✅ ERROR TRACKING: Log analysis creation failure
            chatAnalysisLogger.error(roundNumber, error, {
              threadId: thread.id,
            });
          }
        });

        // ✅ ERROR TRACKING: Log thread initialization
        chatOverviewLogger.autoStartRound({
          threadId: threadWithDates.id,
          participantCount: participantsWithDates.length,
          messageCount: uiMessages.length,
        });

        initializeThread(threadWithDates, participantsWithDates, uiMessages);

        // ✅ CRITICAL FIX: Set flag to trigger startRound() when messages appear in state
        // Cannot call startRound() directly because AI SDK's setMessages() is async
        // The effect below will call startRound() when messages.length > 0
        hasSentInitialPromptRef.current = false;
        setInitialPrompt(prompt);
      } catch (error) {
        // ✅ ERROR TRACKING: Log thread creation failure
        chatOverviewLogger.error('THREAD_CREATE_FAILED', error, {
          participantCount: selectedParticipants.length,
          mode: selectedMode,
        });

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
    ],
  );

  const handleSuggestionClick = useCallback((prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, [setSelectedParticipants]);

  // ✅ CRITICAL FIX: Wait for messages to appear in AI SDK state before calling startRound()
  // This effect runs when messages.length changes from 0 → 1 after initializeThread()
  //
  // ISSUE: chat.setMessages() in initializeThread() is async (AI SDK internal behavior)
  // - initializeThread() calls chat.setMessages([userMessage]) at line 253
  // - AI SDK updates messages state asynchronously
  // - This effect must wait for messages.length to transition from 0 → 1
  //
  // SOLUTION: Effect triggers on messages.length changes
  // - initialPrompt flag set after initializeThread() completes (line 261)
  // - When messages populate, effect detects transition and calls startRound()
  // - hasSentInitialPromptRef prevents multiple triggers
  useEffect(() => {
    const hasMessages = messages.length > 0;
    const hasUserMessage = messages.some(m => m.role === 'user');

    // Only trigger if:
    // 1. We have an initialPrompt (thread just created)
    // 2. We have a currentThread
    // 3. Not already streaming
    // 4. Haven't sent initial prompt yet (prevents duplicate calls)
    // 5. Messages have appeared in state (messages.length > 0)
    // 6. At least one user message exists (ensures proper state)
    if (
      initialPrompt
      && currentThread
      && !isStreaming
      && !hasSentInitialPromptRef.current
      && hasMessages
      && hasUserMessage
    ) {
      // ✅ ERROR TRACKING: Log auto-start round trigger
      chatOverviewLogger.autoStartRound({
        threadId: currentThread.id,
        messageCount: messages.length,
        participantCount: contextParticipants.length,
      });

      hasSentInitialPromptRef.current = true;

      try {
        startRound();
      } catch (error) {
        // ✅ ERROR TRACKING: Log startRound failure
        chatOverviewLogger.error('STREAM_FAILED', error, {
          threadId: currentThread.id,
          messageCount: messages.length,
        });

        showApiErrorToast('Error starting conversation', error);
      }
    }
  }, [initialPrompt, currentThread, isStreaming, startRound, messages, contextParticipants]);

  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  useEffect(() => {
    if (selectedParticipants.length === 0 && defaultModelId && initialParticipants.length > 0) {
      setSelectedParticipants(initialParticipants);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelId]);

  useEffect(() => {
    setThreadTitle(null);
    setThreadActions(null);
  }, [setThreadTitle, setThreadActions]);

  useEffect(() => {
    if (showInitialUI && isStreaming) {
      stopStreaming();
    }
  }, [showInitialUI, isStreaming, stopStreaming]);

  // ✅ CLEANUP: Clear onComplete callback on unmount
  useEffect(() => {
    return () => {
      setOnComplete(undefined);
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
    <ChatErrorBoundary>
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
                <StreamingErrorBoundary onRetry={retryRound}>
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
                </StreamingErrorBoundary>

                {createdThreadId && analyses[0] && (
                  <div className="mt-6">
                    <RoundAnalysisCard
                      analysis={analyses[0]}
                      threadId={createdThreadId}
                      isLatest={true}
                      onStreamComplete={async () => {
                        try {
                          setHasLoadedAnalysis(true);

                          // ✅ ERROR TRACKING: Log navigation
                          chatOverviewLogger.navigate(`/chat/${currentThread?.slug}`, {
                            threadId: createdThreadId,
                            analysisStatus: analyses[0]?.status,
                          });

                          // ✅ STATE STABILIZATION: Brief delay for React state updates and cache writes
                          await new Promise(resolve => setTimeout(resolve, 300));

                          router.push(`/chat/${currentThread?.slug}`);
                        } catch (error) {
                        // ✅ ERROR TRACKING: Log navigation failure
                          chatOverviewLogger.error('NETWORK_ERROR', error, {
                            threadId: createdThreadId,
                            destination: `/chat/${currentThread?.slug}`,
                          });

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
                // ✅ Compute isAnalyzing state from analyses array
                  const isAnalyzing = analyses.some(a => a.status === 'pending' || a.status === 'streaming');
                  const showLoader = (isStreaming || isAnalyzing) && selectedParticipants.length > 1;

                  return showLoader && (
                    <StreamingParticipantsLoader
                      className="mt-4"
                      participants={selectedParticipants}
                      currentParticipantIndex={currentParticipantIndex}
                      isAnalyzing={isAnalyzing}
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
    </ChatErrorBoundary>
  );
}
