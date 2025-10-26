'use client';

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
    sendMessage,
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

  const {
    analyses,
    createPendingAnalysis,
  } = useChatAnalysis({
    threadId: createdThreadId || '',
    mode: selectedMode,
    enabled: false,
  });

  const createPendingAnalysisRef = useRef(createPendingAnalysis);
  useEffect(() => {
    createPendingAnalysisRef.current = createPendingAnalysis;
  }, [createPendingAnalysis]);

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

        const { thread, participants, messages: _initialMessages } = response.data;

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

        setShowInitialUI(false);
        setInputValue('');
        setCreatedThreadId(thread.id);

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

          try {
            createPendingAnalysisRef.current(
              roundNumber,
              currentMessages,
              currentParticipants,
              userQuestion || 'No question provided',
            );
          } catch {
          }
        });

        // AI SDK v5 Pattern: Initialize thread WITHOUT messages
        // We'll let sendMessage add the user message naturally to trigger participant streaming
        // The backend already saved the user message, so when sendMessage sends it again,
        // the backend's duplicate prevention will skip saving but still stream the response
        initializeThread(threadWithDates, participantsWithDates, []);

        hasSentInitialPromptRef.current = false;
        setInitialPrompt(prompt);
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
    ],
  );

  const handleSuggestionClick = useCallback((prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, [setSelectedParticipants]);

  useEffect(() => {
    // AI SDK v5 Pattern: After thread creation, send the user message to trigger participant streaming
    // The backend already saved the user message, so we send it again which triggers the streaming flow
    // Backend has duplicate prevention logic to avoid saving the same message twice
    if (
      initialPrompt
      && currentThread
      && !isStreaming
      && !hasSentInitialPromptRef.current
    ) {
      hasSentInitialPromptRef.current = true;

      try {
        // Send the initial prompt to trigger sequential participant responses
        sendMessage(initialPrompt);
      } catch (error) {
        showApiErrorToast('Error starting conversation', error);
      }
    }
  }, [initialPrompt, currentThread, isStreaming, sendMessage]);

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
                          await new Promise(resolve => setTimeout(resolve, 800));

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
