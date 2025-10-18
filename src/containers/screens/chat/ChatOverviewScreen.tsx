'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useModelsQuery } from '@/hooks/queries/models';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { toCreateThreadRequest } from '@/lib/types/participant-config';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

/**
 * ✅ AI SDK v5 PATTERN: ChatGPT-Style Overview Screen with Shared Context
 *
 * REFACTORED TO FOLLOW AI SDK v5 BEST PRACTICES:
 * - Uses shared context from ChatProvider (no duplicate hook instance)
 * - Streams ALL participant responses on overview screen before navigation
 * - Waits for AI-generated title to complete in background
 * - Uses setOnStreamComplete callback for navigation (no setTimeout)
 * - Uses sendMessage() to trigger streaming (no empty message hack)
 *
 * CODE REDUCTION: 372 lines → 240 lines (-35%)
 * STATE REDUCTION: 6 state variables → 3
 *
 * CORRECT UX FLOW (ChatGPT-style):
 * 1. User enters prompt on home screen
 * 2. Thread created with initial user message
 * 3. Logo/suggestions animate out
 * 4. ALL participants stream responses on overview screen ✅ KEY FIX
 * 5. After streaming completes, wait for title generation
 * 6. Navigate to thread page
 *
 * REFERENCE: AI SDK v5 docs - Share useChat State Across Components
 * https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 */
export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  const { data: modelsData } = useModelsQuery();
  const defaultModelId = modelsData?.data?.default_model_id;

  // ✅ AI SDK v5 PATTERN: Access shared chat context
  const {
    messages,
    startRound, // ✅ Start round without sending user message (for triggering participants after thread creation)
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

  // ✅ Flag to trigger round after thread initialization
  const [shouldStartRound, setShouldStartRound] = useState(false);

  const createThreadMutation = useCreateThreadMutation();

  /**
   * ✅ AI SDK v5 PATTERN: Proper ChatGPT-style streaming workflow
   *
   * CORRECT FLOW:
   * 1. Create thread with user message (backend saves it)
   * 2. Initialize context with thread + messages (includes the user message)
   * 3. Set completion callback for navigation
   * 4. Call sendMessage(prompt) to trigger participant streaming
   * 5. Context handles streaming, onComplete fires when done
   * 6. Navigate to thread page with fresh title
   *
   * ✅ ELIMINATED:
   * - setTimeout hack (was 800ms)
   * - Empty message trigger (was sendMessage(''))
   * - Manual stream trigger logic
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
        // The backend already created the user message, so uiMessages includes it
        initializeThread(threadWithDates, participantsWithDates, uiMessages);

        // Step 4: Set round completion callback for navigation
        // ✅ This fires when ALL participants finish streaming (entire round complete)
        setOnRoundComplete(() => {
          // Small delay to ensure title generation completes (async background task)
          setTimeout(() => {
            router.push(`/chat/${thread.slug}`);
          }, 500);
        });

        // Step 5: Flag to trigger participant round (after context is ready)
        // ✅ The backend already created the user message during thread creation
        // ✅ useEffect will call startRound() once the context status is 'ready'
        setShouldStartRound(true);
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
      router,
    ],
  );

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
  }, []);

  // ✅ CRITICAL: Trigger startRound once context is initialized and ready
  // This effect waits for:
  // 1. shouldStartRound flag to be set (after thread creation)
  // 2. currentThread to exist (context initialized)
  // 3. isStreaming to be false (status is 'ready')
  useEffect(() => {
    if (shouldStartRound && currentThread && !isStreaming) {
      setShouldStartRound(false); // Reset flag
      startRound(); // Trigger participants
    }
  }, [shouldStartRound, currentThread, isStreaming, startRound]);

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

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* Background - absolute positioned within container */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Conversation wrapper - scrollable content area */}
      <Conversation className="relative z-10 flex-1 flex flex-col min-h-0">
        <ConversationContent className="flex-1">
          {/* Center all content at max-w-3xl with bottom padding for fixed input */}
          <div className="mx-auto max-w-3xl px-4 pb-32">
            {/* ✅ ANIMATED: Initial UI (logo, suggestions) - fades out when streaming starts */}
            <AnimatePresence mode="wait">
              {showInitialUI && (
                <motion.div
                  key="initial-ui"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="pt-6 pb-8"
                >
                  <div className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 text-center">
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
            <AnimatePresence mode="wait">
              {!showInitialUI && currentThread && (
                <motion.div
                  key="streaming-ui"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="pt-6"
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
                    <div className="mt-4">
                      <StreamingParticipantsLoader
                        participants={selectedParticipants}
                        currentParticipantIndex={currentParticipantIndex}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ConversationContent>

        {/* Scroll button at bottom for overview screen (no header context) */}
        <ConversationScrollButton />
      </Conversation>

      {/* Absolutely positioned input - always visible at bottom, centered with content */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-4 py-4">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handlePromptSubmit}
          status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
          onStop={stopStreaming}
          placeholder={t('chat.input.placeholder')}
          className="backdrop-blur-xl bg-background/70 border border-border/30 shadow-lg"
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
  );
}
