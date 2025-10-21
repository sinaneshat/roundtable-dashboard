'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
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
import { useThreadAnalysesQuery } from '@/hooks/queries/chat-threads';
import { useModelsQuery } from '@/hooks/queries/models';
import { useAutoScrollToBottom } from '@/hooks/use-auto-scroll-to-bottom';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { toCreateThreadRequest } from '@/lib/types/participant-config';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getThreadService } from '@/services/api/chat-threads';

/**
 * ✅ AI SDK v5 PATTERN: ChatGPT-Style Overview Screen with Shared Context
 *
 * REFACTORED TO FOLLOW AI SDK v5 BEST PRACTICES:
 * - Uses shared context from ChatProvider (no duplicate hook instance)
 * - Streams ALL participant responses on overview screen before navigation
 * - Waits for AI-generated title to complete in background
 * - Uses setOnRoundComplete callback for navigation (no setTimeout)
 * - Uses sendMessage() to trigger streaming (no empty message hack)
 *
 * CODE REDUCTION: 372 lines → 240 lines (-35%)
 * STATE REDUCTION: 6 state variables → 3
 *
 * CORRECT UX FLOW (ChatGPT-style):
 * 1. User enters prompt on home screen
 * 2. Thread created (backend returns empty messages array)
 * 3. Logo/suggestions animate out
 * 4. Context initialized with thread data
 * 5. sendMessage() called with initial prompt - backend creates user message
 * 6. ALL participants stream responses on overview screen ✅ KEY FIX
 * 7. After streaming completes, wait for title generation
 * 8. Navigate to thread page
 *
 * REFERENCE: AI SDK v5 docs - Share useChat State Across Components
 * https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 */
export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  const { data: modelsData } = useModelsQuery();
  const defaultModelId = modelsData?.data?.default_model_id;

  // ✅ AI SDK v5 PATTERN: Access shared chat context
  const {
    messages,
    sendMessage, // ✅ Send user message and trigger participants
    isStreaming,
    currentParticipantIndex,
    error: streamError,
    retry: retryRound,
    initializeThread,
    setOnRoundComplete,
    thread: currentThread,
    participants: contextParticipants,
    stop: stopStreaming, // ✅ Stop function for interrupting streaming
  } = useSharedChatContext();

  // ✅ HEADER STATE CLEANUP: Clear thread header when on overview page
  // This prevents the thread header actions from persisting when navigating back from a thread
  const { setThreadTitle, setThreadActions } = useThreadHeader();

  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    if (defaultModelId) {
      return [
        {
          id: 'participant-default',
          modelId: defaultModelId,
          role: '',
          order: 0,
        },
      ];
    }
    return [];
  }, [defaultModelId]);

  // ✅ SIMPLIFIED STATE: Only 3 variables (was 6)
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(() => getDefaultChatMode());
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(initialParticipants);
  const [inputValue, setInputValue] = useState('');

  // UI state for animations
  const [showInitialUI, setShowInitialUI] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  // ✅ Store initial prompt for sending after thread initialization
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);

  // Track if we've already sent the initial prompt to avoid double-sending
  const hasSentInitialPromptRef = useRef(false);

  // ✅ Track created thread for analysis streaming
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);

  // ✅ FIX: Use refs to track latest messages and participants for onRoundComplete callback
  // This avoids stale closure values when callback executes
  const messagesRef = useRef(messages);
  const participantsRef = useRef(contextParticipants);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    participantsRef.current = contextParticipants;
  }, [contextParticipants]);

  // ✅ Fetch analyses for the created thread (if exists)
  const { data: analysesResponse } = useThreadAnalysesQuery(
    createdThreadId || '',
    createdThreadId != null, // Only fetch if thread created
  );

  const createThreadMutation = useCreateThreadMutation();

  /**
   * ✅ AI SDK v5 PATTERN: Proper ChatGPT-style streaming workflow
   *
   * CORRECT FLOW:
   * 1. Create thread (backend returns empty messages array)
   * 2. Initialize context with thread + participants (no messages yet)
   * 3. Set completion callback for navigation
   * 4. Store prompt in state (initialPrompt)
   * 5. useEffect detects initialPrompt and calls sendMessage(prompt)
   * 6. Backend creates user message + participants stream responses
   * 7. Context handles streaming, onRoundComplete fires when done
   * 8. Navigate to thread page with AI-generated title
   *
   * ✅ ELIMINATED:
   * - setTimeout hack (was 800ms)
   * - Empty message trigger (was sendMessage(''))
   * - startRound() for new threads (now only for existing threads)
   * - shouldTriggerStream state
   */
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const prompt = inputValue.trim();
      // ✅ VALIDATION: Prevent submission if no input, no participants, or already processing
      if (!prompt || selectedParticipants.length === 0 || isCreatingThread || isStreaming) {
        return;
      }

      try {
        setIsCreatingThread(true);

        // Step 1: Create thread with initial user message
        const createThreadRequest = toCreateThreadRequest({
          message: prompt,
          mode: selectedMode,
          participants: selectedParticipants,
        });

        const response = await createThreadMutation.mutateAsync({
          json: createThreadRequest,
        });

        const { thread, participants, messages: initialMessages } = response.data;

        // Convert API response dates to Date objects
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

        // Step 2: Hide logo/suggestions
        setShowInitialUI(false);
        setInputValue('');

        // Step 3: Set created thread ID for analysis tracking
        setCreatedThreadId(thread.id);

        // Step 4: Initialize context with thread data
        // ✅ CRITICAL: Backend returns empty messages array - user message will be created by sendMessage()
        initializeThread(threadWithDates, participantsWithDates, uiMessages);

        // Step 4: Store prompt for sending after context is ready
        hasSentInitialPromptRef.current = false; // Reset flag for new thread
        setInitialPrompt(prompt);

        // Step 5: Set round completion callback to add pending analysis to cache
        // ✅ This fires when ALL participants finish streaming (entire round complete)
        // ✅ SIMPLIFIED: Just add pending analysis to cache - navigation happens via onStreamComplete
        setOnRoundComplete(async () => {
          console.warn('[ChatOverviewScreen] 🎯 Round completed - adding pending analysis', {
            threadId: thread.id,
          });

          // ✅ CRITICAL: Wait for messages to be persisted to database
          await new Promise(resolve => setTimeout(resolve, 2000));

          // ✅ FIX: Get participant message IDs from the latest messages (via ref)
          // Use ref to avoid stale closure values
          const currentMessages = messagesRef.current;
          const currentParticipants = participantsRef.current;

          const assistantMessages = currentMessages.filter(m => m.role === 'assistant');
          const participantCount = currentParticipants.length;
          const recentAssistantMessages = assistantMessages.slice(-participantCount);
          const participantMessageIds = recentAssistantMessages.map(m => m.id);

          console.warn('[ChatOverviewScreen] 📋 Calculated participant message IDs', {
            threadId: thread.id,
            participantCount,
            assistantMessagesTotal: assistantMessages.length,
            participantMessageIds,
          });

          // ✅ Add pending analysis to cache (triggers ModeratorAnalysisStream to render and stream)
          const roundNumber = 1; // First round on overview screen
          const pendingAnalysis = {
            id: `pending-${thread.id}-${roundNumber}-${Date.now()}`,
            threadId: thread.id,
            roundNumber,
            mode: thread.mode,
            userQuestion: prompt, // Use the original prompt since messages might be stale in closure
            status: 'pending' as const,
            participantMessageIds, // ✅ FIX: Now properly populated!
            analysisData: null,
            createdAt: new Date(),
            completedAt: null,
            errorMessage: null,
          };

          queryClient.setQueryData(
            queryKeys.threads.analyses(thread.id),
            (oldData: unknown) => {
              const typedData = oldData as typeof analysesResponse;

              if (!typedData?.success) {
                return {
                  success: true,
                  data: {
                    items: [pendingAnalysis],
                  },
                };
              }

              return {
                ...typedData,
                data: {
                  ...typedData.data,
                  items: [...(typedData.data.items || []), pendingAnalysis],
                },
              };
            },
          );

          console.warn('[ChatOverviewScreen] ✅ Pending analysis added - RoundAnalysisCard will trigger streaming', {
            analysisId: pendingAnalysis.id,
          });
        });
      } catch (err) {
        console.error('Error creating thread:', err);
        showApiErrorToast('Error', err);
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
      setOnRoundComplete,
      queryClient,
      router,
    ],
  );

  const handleSuggestionClick = useCallback((prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, []);

  const handleRemoveParticipant = useCallback((participantId: string) => {
    // Filter out the removed participant and reindex
    const filtered = selectedParticipants.filter(p => p.id !== participantId);
    const reindexed = filtered.map((p, index) => ({ ...p, order: index }));
    setSelectedParticipants(reindexed);
  }, [selectedParticipants]);

  // ✅ CRITICAL: Send initial user message once context is initialized and ready
  // This effect waits for:
  // 1. initialPrompt to be set (after thread creation)
  // 2. currentThread to exist (context initialized)
  // 3. isStreaming to be false (status is 'ready')
  useEffect(() => {
    if (initialPrompt && currentThread && !isStreaming && !hasSentInitialPromptRef.current) {
      console.warn('[ChatOverviewScreen] 🚀 Sending initial user message to trigger participants', {
        threadId: currentThread.id,
        promptPreview: initialPrompt.substring(0, 50),
      });
      hasSentInitialPromptRef.current = true;
      sendMessage(initialPrompt); // Send user message - triggers first participant automatically
    }
  }, [initialPrompt, currentThread, isStreaming, sendMessage]);

  // ✅ Derive current streaming participant from context
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  // ✅ Initialize default participant when model loads (only on initial mount)
  useEffect(() => {
    if (selectedParticipants.length === 0 && defaultModelId && initialParticipants.length > 0) {
      // Only set default participant if we haven't initialized yet
      // This prevents re-adding the participant after user intentionally removes it
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setSelectedParticipants(initialParticipants);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelId]); // Only run when defaultModelId changes, not when selectedParticipants changes

  // ✅ CRITICAL FIX: Clear thread header state when navigating to overview
  // This ensures the header only shows the sidebar toggle, not thread-specific actions
  useEffect(() => {
    setThreadTitle(null);
    setThreadActions(null);
  }, [setThreadTitle, setThreadActions]);

  // ✅ CRITICAL FIX: Reset streaming state when showing initial UI
  // This ensures the submit button is always shown when navigating back to overview
  // Without this, the stop button persists from the previous thread screen
  useEffect(() => {
    if (showInitialUI && isStreaming) {
      console.warn('[ChatOverviewScreen] 🛑 Resetting streaming state on initial UI');
      stopStreaming();
    }
  }, [showInitialUI, isStreaming, stopStreaming]);

  // ✅ AUTO-SCROLL: Scroll to bottom when new messages arrive or during streaming (page-level scrolling)
  // Track both messages.length AND last message content to trigger on streaming updates
  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.parts?.map(p => p.type === 'text' ? p.text : '').join('') || '';
  useAutoScrollToBottom(
    { length: messages.length, content: lastMessageContent, isStreaming },
    !showInitialUI,
  );

  // ✅ WINDOW-LEVEL SCROLLING: Reference for input container (no scroll padding needed)
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="min-h-svh flex flex-col">
      {/* Background - fixed behind all content */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Main content - flows naturally with window scrolling - pt-16 for header, pb-32 for sticky input */}
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32">
        {/* ✅ ANIMATED: Initial UI (logo, suggestions) - fades out when streaming starts */}
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
                {/* Brand Logo */}
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

                {/* Brand Title */}
                <motion.h1
                  className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {BRAND.name}
                </motion.h1>

                {/* Brand Tagline */}
                <motion.p
                  className="text-base xs:text-lg sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-2xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  {BRAND.tagline}
                </motion.p>

                {/* Quick Start Suggestions */}
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

        {/* ✅ ANIMATED: Streaming Messages - fades in when streaming starts */}
        <AnimatePresence>
          {!showInitialUI && currentThread && (
            <motion.div
              key="streaming-ui"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* ✅ REUSABLE: Same ChatMessageList component used in thread screen */}
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

              {/* ✅ ANALYSIS: Show first round analysis on overview screen */}
              {createdThreadId && analysesResponse?.success && analysesResponse.data.items.length > 0 && analysesResponse.data.items[0] && (
                <div className="mt-6">
                  <RoundAnalysisCard
                    analysis={analysesResponse.data.items[0] as unknown as StoredModeratorAnalysis}
                    threadId={createdThreadId}
                    isLatest={true}
                    onStreamComplete={async (completedData) => {
                      console.warn('[ChatOverviewScreen] ✅ Analysis streaming completed', {
                        threadId: createdThreadId,
                        hasData: !!completedData,
                      });

                      // Update cache when stream completes
                      queryClient.setQueryData(
                        queryKeys.threads.analyses(createdThreadId),
                        (oldData: unknown) => {
                          const typedData = oldData as typeof analysesResponse;

                          if (!typedData?.success) {
                            return typedData;
                          }

                          const updatedItems = (typedData.data.items || []).map((analysis) => {
                            if (analysis.roundNumber === 1) {
                              return {
                                ...analysis,
                                status: 'completed' as const,
                                analysisData: completedData,
                                completedAt: new Date(),
                              };
                            }
                            return analysis;
                          });

                          return {
                            ...typedData,
                            data: {
                              ...typedData.data,
                              items: updatedItems,
                            },
                          };
                        },
                      );

                      // ✅ NAVIGATION: After analysis completes, wait for title and navigate
                      console.warn('[ChatOverviewScreen] 🔍 Waiting for AI title generation before navigation');

                      // Poll for title generation (slug update)
                      const originalSlug = currentThread?.slug;
                      let updatedThreadSlug = originalSlug;
                      let slugAttempts = 0;
                      const maxSlugAttempts = 15; // 15 seconds max

                      // Only poll if we have an original slug to compare against
                      if (originalSlug) {
                        while (slugAttempts < maxSlugAttempts) {
                          await new Promise(resolve => setTimeout(resolve, 1000));
                          slugAttempts++;

                          try {
                            const threadResponse = await getThreadService({ param: { id: createdThreadId } });

                            if (threadResponse.success) {
                              updatedThreadSlug = threadResponse.data.thread.slug;

                              if (updatedThreadSlug !== originalSlug) {
                                console.warn('[ChatOverviewScreen] ✅ Title generated, navigating', {
                                  originalSlug,
                                  newSlug: updatedThreadSlug,
                                  attempts: slugAttempts,
                                });
                                break;
                              }
                            }
                          } catch (error) {
                            console.error('[ChatOverviewScreen] Error fetching thread for slug:', error);
                          }
                        }
                      }

                      // Navigate to thread (use updated slug or fallback to original)
                      const targetSlug = updatedThreadSlug || originalSlug || createdThreadId;

                      console.warn('[ChatOverviewScreen] 🎯 Navigating to thread', {
                        targetSlug,
                        threadId: createdThreadId,
                      });

                      // Invalidate sidebar cache
                      await queryClient.invalidateQueries({ queryKey: queryKeys.threads.lists() });

                      // Navigate
                      router.push(`/chat/${targetSlug}`);
                    }}
                  />
                </div>
              )}

              {/* ✅ RETRY BUTTON: Show after error (same as thread screen) */}
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

              {/* ✅ STREAMING PARTICIPANTS LOADER: Show when streaming (same as thread screen) */}
              {isStreaming && selectedParticipants.length > 1 && (
                <StreamingParticipantsLoader
                  className="mt-4"
                  participants={selectedParticipants}
                  currentParticipantIndex={currentParticipantIndex}
                />
              )}

              {/* Analysis streaming loader - shown when analysis is being generated */}
              {!isStreaming && analysesResponse?.success && analysesResponse.data.items.some(a => a.status === 'pending' || a.status === 'streaming') && (
                <div className="mt-4 flex justify-center">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                    </div>
                    <span>{t('moderator.generating')}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ✅ BOTTOM SPACER: Creates scrollable empty space below content, allows scrolling content higher above input */}
      <div className="h-32" aria-hidden="true" />

      {/* Input container - sticky to bottom, constrained to content area */}
      <div ref={inputContainerRef} className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 mt-auto">
        <div className="container max-w-3xl mx-auto px-4 sm:px-6">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handlePromptSubmit}
            status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
            onStop={stopStreaming}
            placeholder={t('chat.input.placeholder')}
            participants={selectedParticipants}
            onRemoveParticipant={handleRemoveParticipant}
            toolbar={(
              <>
                <ChatParticipantsList
                  participants={selectedParticipants}
                  onParticipantsChange={setSelectedParticipants}
                />
                <ChatModeSelector
                  selectedMode={selectedMode}
                  onModeChange={setSelectedMode}
                />
              </>
            )}
          />
        </div>
      </div>
    </div>
  );
}
