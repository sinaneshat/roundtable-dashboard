'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useModelsQuery } from '@/hooks/queries/models';
import { useMultiParticipantChat } from '@/hooks/use-multi-participant-chat';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { toCreateThreadRequest } from '@/lib/types/participant-config';

/**
 * ✅ ENHANCED OVERVIEW SCREEN (ChatGPT Pattern v2)
 *
 * NEW UX FLOW:
 * 1. User enters prompt on home screen
 * 2. Logo/suggestions animate out
 * 3. First round of streaming happens RIGHT HERE on overview
 * 4. All participants respond sequentially (reusing ChatMessageList)
 * 5. Once ALL participants finish, navigate to thread page
 *
 * This creates immediate feedback and reduces perceived latency!
 */
export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();
  const sessionUser = session?.user;

  const { data: modelsData } = useModelsQuery();
  const defaultModelId = modelsData?.data?.default_model_id;

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

  // Form state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(getDefaultChatMode());
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(initialParticipants);
  const [inputValue, setInputValue] = useState('');

  // Streaming state
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [createdThread, setCreatedThread] = useState<Thread | null>(null);
  const [threadParticipants, setThreadParticipants] = useState<Participant[]>([]);
  const [showInitialUI, setShowInitialUI] = useState(true);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const createThreadMutation = useCreateThreadMutation();
  const hasNavigatedRef = useRef(false);
  const hasStartedStreamingRef = useRef(false);

  // ✅ AI SDK v5 PATTERN: Use multi-participant chat hook for streaming
  const {
    messages,
    sendMessage: sendMessageToParticipants,
    isStreaming,
    currentParticipantIndex,
    error: streamError,
  } = useMultiParticipantChat({
    threadId: createdThread?.id || '',
    participants: threadParticipants,
    initialMessages: [],
    onComplete: () => {
      // ✅ SIMPLIFIED: Navigate directly - backend handles analysis automatically
      if (createdThread?.slug && !hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        router.push(`/chat/${createdThread.slug}`);
      }
    },
  });

  /**
   * ✅ FIXED UX PATTERN: Stream on Overview Screen
   *
   * 1. Create thread in background
   * 2. Animate logo/suggestions out
   * 3. Set pendingPrompt to trigger streaming via useEffect
   * 4. Navigate when complete
   *
   * The streaming is triggered by useEffect (not directly here) to ensure
   * threadParticipants state has updated before calling sendMessage.
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

        // ✅ STEP 1: Create thread with initial user message
        const createThreadRequest = toCreateThreadRequest({
          message: prompt,
          mode: selectedMode,
          participants: selectedParticipants,
        });

        const response = await createThreadMutation.mutateAsync({
          json: createThreadRequest,
        });

        const thread = response.data.thread;
        const participants = response.data.participants;

        // ✅ STEP 2: Hide logo/suggestions (trigger animation)
        setShowInitialUI(false);

        // Clear input
        setInputValue('');

        // ✅ STEP 3: Store thread data and prompt
        // This will trigger the useEffect to start streaming
        setCreatedThread(thread);
        setThreadParticipants(participants);
        setPendingPrompt(prompt); // ← Triggers useEffect to start streaming

        // Navigation happens in onComplete callback after streaming finishes
      } catch (err) {
        console.error('Error creating thread:', err);
        showApiErrorToast('Error', err);
        setShowInitialUI(true); // Show initial UI again on error
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
    ],
  );

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
  }, []);

  // ✅ Compute current streaming participant for display
  const currentStreamingParticipant = threadParticipants[currentParticipantIndex] || null;

  // ✅ FIX: Trigger streaming after state updates (not synchronously)
  // This ensures threadParticipants is populated before calling sendMessage
  useEffect(() => {
    if (
      createdThread
      && threadParticipants.length > 0
      && pendingPrompt
      && !hasStartedStreamingRef.current
    ) {
      hasStartedStreamingRef.current = true;

      // Start streaming with all participants
      sendMessageToParticipants(pendingPrompt).catch((error) => {
        console.error('Failed to start streaming:', error);
        showApiErrorToast('Streaming Error', error);
        // Reset state on error
        setShowInitialUI(true);
        setPendingPrompt(null);
        hasStartedStreamingRef.current = false;
      });
    }
  }, [createdThread, threadParticipants, pendingPrompt, sendMessageToParticipants]);

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
    <div className="relative flex flex-1 flex-col min-h-0 overflow-x-hidden">
      {/* Background */}
      <div className="absolute inset-0 -mx-4 lg:-mx-6 z-0 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col overflow-x-hidden">
        {/* ✅ ANIMATED: Initial UI (logo, suggestions) - fades out when streaming starts */}
        <AnimatePresence mode="wait">
          {showInitialUI && (
            <motion.div
              key="initial-ui"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full flex-1 flex flex-col justify-center"
            >
              <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
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
                    className="w-full max-w-4xl mt-4 sm:mt-6 md:mt-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <ChatQuickStart onSuggestionClick={handleSuggestionClick} />
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ✅ ANIMATED: Streaming Messages - fades in when streaming starts */}
        <AnimatePresence mode="wait">
          {!showInitialUI && createdThread && (
            <motion.div
              key="streaming-ui"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 overflow-y-auto"
            >
              <div className="mx-auto max-w-3xl px-4 py-6">
                {/* ✅ REUSABLE: Same ChatMessageList as thread screen */}
                <ChatMessageList
                  messages={messages}
                  user={{
                    name: sessionUser?.name || 'You',
                    image: sessionUser?.image || null,
                  }}
                  participants={threadParticipants}
                  isStreaming={isStreaming}
                  currentParticipantIndex={currentParticipantIndex}
                  currentStreamingParticipant={currentStreamingParticipant}
                />

                {/* Error display */}
                {streamError && (
                  <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400 mt-4">
                    {streamError.message}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area - Always visible */}
      <div className="sticky bottom-0 z-10 mt-auto">
        <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handlePromptSubmit}
            status={isCreatingThread || isStreaming ? 'submitted' : 'ready'}
            placeholder={t('chat.input.placeholder')}
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
