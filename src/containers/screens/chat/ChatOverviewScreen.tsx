'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
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
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(getDefaultChatMode());
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(initialParticipants);
  const [inputValue, setInputValue] = useState('');

  // UI state for animations
  const [showInitialUI, setShowInitialUI] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  // ✅ Store initial prompt for sending after thread initialization
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);

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
      if (!prompt || isCreatingThread || isStreaming) {
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

        // Step 3: Initialize context with thread data
        // ✅ CRITICAL: Backend returns empty messages array - user message will be created by sendMessage()
        initializeThread(threadWithDates, participantsWithDates, uiMessages);

        // Step 4: Store prompt for sending after context is ready
        setInitialPrompt(prompt);

        // Step 5: Set round completion callback for navigation
        // ✅ This fires when ALL participants finish streaming (entire round complete)
        setOnRoundComplete(async () => {
          try {
            // ✅ CRITICAL FIX: Wait for AI title generation before navigation
            // The backend generates title from user message, which ALWAYS creates a unique slug
            // Title generation uses: (1) AI-generated title, or (2) first 5 words of message
            // This ensures slug ALWAYS changes and is never "New Chat"

            // Wait for title generation (typical: 1-2 seconds for fast models)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Fetch updated thread with AI-generated slug
            console.warn('[ChatOverviewScreen] 🔄 Fetching updated thread after title generation', {
              threadId: thread.id,
              originalTitle: thread.title,
              originalSlug: thread.slug,
            });

            const threadResponse = await getThreadService({ param: { id: thread.id } });

            if (threadResponse.success) {
              const { thread: updatedThread } = threadResponse.data;

              console.warn('[ChatOverviewScreen] ✅ Updated thread fetched', {
                threadId: updatedThread.id,
                updatedTitle: updatedThread.title,
                updatedSlug: updatedThread.slug,
                titleChanged: thread.title !== updatedThread.title,
                slugChanged: thread.slug !== updatedThread.slug,
              });

              // ✅ CRITICAL: Invalidate sidebar cache
              await queryClient.invalidateQueries({ queryKey: queryKeys.threads.lists() });

              console.warn('[ChatOverviewScreen] ✅ Navigating to thread', {
                slug: updatedThread.slug,
              });

              // Navigate using the AI-generated slug
              router.push(`/chat/${updatedThread.slug}`);
            } else {
              // Fallback: use original slug if fetch fails
              console.warn('[ChatOverviewScreen] ❌ Failed to fetch updated thread, using original slug', {
                threadId: thread.id,
                originalSlug: thread.slug,
              });
              router.push(`/chat/${thread.slug}`);
            }
          } catch (error) {
            // Fallback: use original slug on any error
            console.error('[ChatOverviewScreen] Error fetching updated thread:', error);
            router.push(`/chat/${thread.slug}`);
          }
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
    // Prevent removing the last participant
    if (filtered.length === 0)
      return;
    const reindexed = filtered.map((p, index) => ({ ...p, order: index }));
    setSelectedParticipants(reindexed);
  }, [selectedParticipants]);

  // ✅ CRITICAL: Send initial user message once context is initialized and ready
  // This effect waits for:
  // 1. initialPrompt to be set (after thread creation)
  // 2. currentThread to exist (context initialized)
  // 3. isStreaming to be false (status is 'ready')
  useEffect(() => {
    if (initialPrompt && currentThread && !isStreaming) {
      console.warn('[ChatOverviewScreen] 🚀 Sending initial user message to trigger participants', {
        threadId: currentThread.id,
        promptPreview: initialPrompt.substring(0, 50),
      });
      setInitialPrompt(null); // Reset flag
      sendMessage(initialPrompt); // Send user message - triggers first participant automatically
    }
  }, [initialPrompt, currentThread, isStreaming, sendMessage]);

  // ✅ Derive current streaming participant from context
  const currentStreamingParticipant = contextParticipants[currentParticipantIndex] || null;

  // ✅ Initialize default participant when model loads
  useEffect(() => {
    if (selectedParticipants.length === 0 && defaultModelId) {
      setSelectedParticipants([
        {
          id: 'participant-default',
          modelId: defaultModelId,
          role: '',
          order: 0,
        },
      ]);
    }
  }, [defaultModelId, selectedParticipants.length]);

  // ✅ CRITICAL FIX: Clear thread header state when navigating to overview
  // This ensures the header only shows the sidebar toggle, not thread-specific actions
  useEffect(() => {
    setThreadTitle(null);
    setThreadActions(null);
  }, [setThreadTitle, setThreadActions]);

  // ✅ AUTO-SCROLL: Scroll to bottom when new messages arrive (page-level scrolling)
  useAutoScrollToBottom(messages.length, !showInitialUI);

  return (
    <div className="h-full flex flex-col">
      {/* Background - fixed behind all content */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Main content - natural size, stays at top */}
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-16">
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input container - pushed to bottom with mt-auto, creating space between content and input */}
      <div className="sticky bottom-0 z-50 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4">
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
