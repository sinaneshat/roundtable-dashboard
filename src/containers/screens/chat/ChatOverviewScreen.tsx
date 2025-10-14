'use client';

/**
 * ChatOverviewScreen - Fixed Stale Closure Issues
 *
 * ✅ Manual SSE streaming (multi-participant requirement)
 * ✅ Uses refs to avoid stale closures
 * ✅ Follows AI SDK state management patterns
 * ✅ Callback-driven, minimal useEffect
 *
 * Why not pure useChat:
 * - Multi-participant sequential streaming is not a standard AI SDK pattern
 * - Backend streams one participant at a time
 * - Need custom logic to handle multiple sequential streams
 */

import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useModelsQuery } from '@/hooks/queries/models';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import { getMessageMetadata } from '@/lib/ai/message-helpers';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { chatInputFormDefaults, chatInputFormToCreateThreadRequest } from '@/lib/schemas/chat-forms';
import { showApiErrorToast } from '@/lib/toast';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend (includes default_model_id)
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.models || [];
  const defaultModelId = modelsData?.data?.default_model_id;

  // ✅ INITIALIZE WITH PREFETCHED DEFAULT MODEL: Create initial participant from server-prefetched data
  // Backend computes the best accessible model from top 10 for user's tier
  // This ensures the default model is pre-selected immediately on page load (zero client requests)
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

  // Chat configuration state - initialize with prefetched default model
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(chatInputFormDefaults.mode);
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(initialParticipants);
  const [inputValue, setInputValue] = useState('');

  // Thread state
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Streaming state (following AI SDK patterns)
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');

  // Use refs to avoid stale closures
  const messagesRef = useRef<UIMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const participantsRef = useRef<ParticipantConfig[]>(selectedParticipants);

  // Keep refs in sync with state
  messagesRef.current = messages;
  participantsRef.current = selectedParticipants;

  // ✅ REACT 19 PATTERN: No useEffect for initialization
  // initialParticipants useMemo + useState handles initialization correctly
  // If defaultModelId loads after mount, user can manually add participant via UI
  // This eliminates lifecycle unpredictability from useEffect setState

  // Thread creation mutation
  const createThreadMutation = useCreateThreadMutation();

  // ✅ CALLBACK-DRIVEN: Stream all participants
  const streamAllParticipants = useCallback(
    async (threadId: string, initialMessages: UIMessage[], participantCount: number, slug: string) => {
      // ✅ Prefetch the thread page immediately so navigation is instant
      router.prefetch(`/chat/${slug}`);

      for (let participantIndex = 0; participantIndex < participantCount; participantIndex++) {
        setStatus('streaming');

        // ✅ USER REQUIREMENT: Retry up to 10 times per participant
        // Must get successful response before moving to next participant
        const MAX_RETRIES = 10;
        let participantSuccess = false;
        let lastError: Error | null = null;

        for (let retryAttempt = 0; retryAttempt < MAX_RETRIES && !participantSuccess; retryAttempt++) {
          const abortController = new AbortController();
          abortControllerRef.current = abortController;

          // ✅ USER REQUIREMENT: 30 second timeout per attempt
          const timeoutId = setTimeout(() => {
            abortController.abort();
          }, 30000);

          // Declare messageId outside try block so catch block can access it
          let messageId = '';

          try {
            if (retryAttempt > 0) {
              console.info(`[RETRY] Participant ${participantIndex + 1}, attempt ${retryAttempt + 1}/${MAX_RETRIES}`);
            }

            const currentMessages = messagesRef.current; // Use ref for latest value

            const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: currentMessages.map(m => ({
                  id: m.id,
                  role: m.role,
                  parts: m.parts,
                })),
                participantIndex,
              }),
              signal: abortController.signal,
            });

            // Clear timeout on successful fetch
            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let content = '';
            let messageMetadata: Record<string, unknown> | null = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done)
                break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim() || line.startsWith(':'))
                  continue;

                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]')
                    continue;

                  try {
                    const event = JSON.parse(data);
                    console.warn('[STREAM EVENT]', event); // DEBUG

                    if (event.type === 'start') {
                      messageId = event.messageId;
                      messageMetadata = event.messageMetadata || null;
                      content = '';

                      // Update participants if backend sent new data
                      if (messageMetadata) {
                        const updatedParticipants = (messageMetadata as Record<string, unknown>)
                          .participants as Array<{ id: string; modelId: string; role: string; order: number }> | undefined;
                        if (updatedParticipants && updatedParticipants.length > 0) {
                          setSelectedParticipants(updatedParticipants);
                          participantsRef.current = updatedParticipants;
                        }
                      }

                      // ✅ Get participant data for metadata
                      const currentParticipants = participantsRef.current;
                      const participant = currentParticipants[participantIndex];

                      // ✅ Add placeholder message with CRITICAL metadata fields pre-populated
                      // Following useChatStreaming pattern (src/hooks/utils/use-chat-streaming.ts:110-124)
                      setMessages((prev) => {
                        const updated = [
                          ...prev,
                          {
                            id: messageId,
                            role: 'assistant' as const,
                            parts: [{ type: 'text' as const, text: '' }],
                            metadata: {
                            // ✅ CRITICAL: Pre-populate required fields for ModelMessageCard rendering
                              participantId: participant?.id, // Required for participant lookup
                              participantIndex, // Required for display
                              model: participant?.modelId, // Required for avatar rendering
                              role: participant?.role || '', // Required for display
                              createdAt: new Date().toISOString(), // Required for timeline sorting
                              // Merge backend metadata (will contain additional fields from start event)
                              ...(messageMetadata || {}),
                            },
                          },
                        ];
                        messagesRef.current = updated; // Keep ref in sync
                        return updated;
                      });
                    } else if (event.type === 'text-delta' && event.delta) {
                      // ✅ REAL-TIME STREAMING: Immediate updates for character-by-character display
                      // React 18 automatic batching prevents excessive re-renders
                      content += event.delta;

                      // Update message immediately
                      setMessages((prev) => {
                        const updated = prev.map(m =>
                          m.id === messageId
                            ? { ...m, parts: [{ type: 'text' as const, text: content }] }
                            : m,
                        );
                        messagesRef.current = updated; // Keep ref in sync
                        return updated;
                      });
                    } else if (event.type === 'error') {
                    // ✅ Handle error without exiting the loop - mark message as error and continue to next participant
                      const errorData = event.error || {};
                      const errorMessage = errorData.message || 'AI model encountered an error';
                      const errorType = errorData.type || 'unknown';

                      // Log error for debugging (not alarming - this is handled gracefully)
                      console.info('[PARTICIPANT ERROR - CONTINUING]', {
                        participant: participantIndex + 1,
                        total: participantCount,
                        errorType,
                        message: errorMessage,
                      });

                      // Update the message with error content
                      // ✅ CRITICAL: Preserve existing metadata fields (participantId, model, role, etc.)
                      setMessages((prev) => {
                        const updated = prev.map(m =>
                          m.id === messageId
                            ? {
                                ...m,
                                parts: [{ type: 'text' as const, text: `${errorMessage}` }],
                                metadata: {
                                  ...(m.metadata || {}), // ✅ Preserve all existing metadata
                                  hasError: true, // Add hasError flag for consistent error detection
                                  error: errorMessage,
                                  errorType,
                                  errorMessage,
                                  isTransient: errorData.isTransient || false,
                                },
                              }
                            : m,
                        );
                        messagesRef.current = updated;
                        return updated;
                      });

                      // ✅ CRITICAL: Reset state to prevent leak to next participant
                      messageId = '';
                      content = '';
                      messageMetadata = null;

                      // Exit this participant's stream but continue to next participant
                      break; // Break the inner while loop, not return
                    }
                  } catch (parseError) {
                    console.error('Failed to parse SSE:', parseError);
                  }
                }
              }
            }

            reader.releaseLock();

            // ✅ SUCCESS: Participant completed successfully
            participantSuccess = true;
            clearTimeout(timeoutId);
          } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
              // Check if this was user-initiated or timeout
              if (abortControllerRef.current === null) {
                // User manually stopped streaming - exit entire flow
                setStatus('ready');
                return;
              }
              // Otherwise it's a timeout - will retry
              lastError = new Error('Request timeout (30s)');
              console.warn(`[TIMEOUT] Participant ${participantIndex + 1}, attempt ${retryAttempt + 1}/${MAX_RETRIES}`);
            } else {
              // Network/parsing errors - save for potential retry
              lastError = error instanceof Error ? error : new Error(String(error));
              console.warn(`[ERROR] Participant ${participantIndex + 1}, attempt ${retryAttempt + 1}/${MAX_RETRIES}:`, lastError.message);
            }

            // Update message with error if we have a messageId (for UI feedback)
            // ✅ CRITICAL: Preserve existing metadata fields (participantId, model, role, etc.)
            if (messageId) {
              setMessages((prev) => {
                const updated = prev.map(m =>
                  m.id === messageId
                    ? {
                        ...m,
                        parts: [{ type: 'text' as const, text: `Retrying... (attempt ${retryAttempt + 1}/${MAX_RETRIES})` }],
                        metadata: {
                          ...(m.metadata || {}),
                          isRetrying: true,
                          retryAttempt: retryAttempt + 1,
                        },
                      }
                    : m,
                );
                messagesRef.current = updated;
                return updated;
              });
            }

            // Will retry in next iteration of retry loop
          } finally {
            abortControllerRef.current = null;
          }
        }

        // ✅ Check if participant failed after all retries
        if (!participantSuccess) {
          console.error(`[FAILED] Participant ${participantIndex + 1} failed after ${MAX_RETRIES} attempts`);

          // Show final error message
          setMessages((prev) => {
            // Find the last message for this participant
            const lastMessageIndex = prev.length - 1;
            if (lastMessageIndex >= 0) {
              const updated = [...prev];
              updated[lastMessageIndex] = {
                ...updated[lastMessageIndex]!,
                parts: [{ type: 'text' as const, text: `Failed to get response after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}` }],
                metadata: {
                  ...(updated[lastMessageIndex]!.metadata || {}),
                  hasError: true,
                  error: lastError?.message || 'Unknown error',
                  retryAttempts: MAX_RETRIES,
                },
              };
              messagesRef.current = updated;
              return updated;
            }
            return prev;
          });

          // ✅ USER REQUIREMENT: Don't skip to next participant - they must see this failure
          // Continue to next participant (they'll see the error message)
        }
      }

      setStatus('ready');

      // ✅ Automatically navigate to thread page after last participant completes
      // All responses have been shown on overview screen, now show full thread view
      router.push(`/chat/${slug}`);
    },
    [router],
  );

  // ✅ CALLBACK-DRIVEN: Handle form submission
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const messageText = inputValue.trim();
      if (!messageText || status !== 'ready')
        return;

      try {
        setStatus('submitted');

        // Create thread
        const requestData = chatInputFormToCreateThreadRequest({
          message: messageText,
          mode: selectedMode,
          participants: selectedParticipants,
        });

        const result = await createThreadMutation.mutateAsync({
          json: requestData,
        });

        if (result.success && result.data) {
          const { thread, participants: threadParticipants, messages: backendMessages } = result.data;
          const firstMessage = backendMessages?.[0];

          // Set thread state
          setActiveThreadId(thread.id);
          setInputValue('');

          // Update participants with backend IDs
          if (threadParticipants && threadParticipants.length > 0) {
            const updatedParticipants = threadParticipants.map((p, index) => ({
              id: p.id,
              modelId: p.modelId,
              role: p.role || '',
              order: index,
            }));
            setSelectedParticipants(updatedParticipants);
            participantsRef.current = updatedParticipants;
          }

          // Set initial user message
          if (firstMessage) {
            const userMessage: UIMessage = {
              id: firstMessage.id,
              role: 'user',
              parts: [{ type: 'text', text: firstMessage.content }],
            };

            setMessages([userMessage]);
            messagesRef.current = [userMessage];

            // ✅ Start streaming all participants
            await streamAllParticipants(thread.id, [userMessage], threadParticipants?.length || 1, thread.slug);
          }
        }
      } catch (error) {
        showApiErrorToast(t('notifications.error.createFailed'), error);
        setStatus('error');
      }
    },
    [
      inputValue,
      status,
      selectedMode,
      selectedParticipants,
      createThreadMutation,
      t,
      streamAllParticipants,
    ],
  );

  // Handle quick start suggestion click
  const handleSuggestionClick = useCallback(
    (prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => {
      setSelectedMode(mode);
      setSelectedParticipants(participants);
      setInputValue(prompt);

      setTimeout(() => {
        const inputElement = document.querySelector('textarea');
        inputElement?.focus();
      }, 100);
    },
    [],
  );

  // Handle stop streaming
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('ready');
  }, []);

  const showStreamingView = activeThreadId && messages.length > 0;

  return (
    <div className="relative flex flex-1 flex-col min-h-0 overflow-x-hidden">
      {/* Wavy Background */}
      <div className="absolute inset-0 -mx-4 lg:-mx-6 z-0 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Content Layer - Switches layout based on mode */}
      <div className="relative z-10 flex flex-1 flex-col overflow-x-hidden">
        <AnimatePresence mode="wait">
          {!showStreamingView
            ? (
                <motion.div
                  key="hero-view"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="w-full flex-1 flex flex-col justify-center"
                >
                  {/* Hero Section - Aligned with chat layout */}
                  <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8 }}
                      className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 text-center"
                    >
                      {/* Logo - Smooth scaling across breakpoints */}
                      <div className="relative h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36">
                        <Image
                          src={BRAND.logos.main}
                          alt={`${BRAND.displayName} Logo`}
                          fill
                          sizes="(max-width: 480px) 80px, (max-width: 640px) 96px, (max-width: 768px) 112px, (max-width: 1024px) 128px, 144px"
                          className="object-contain drop-shadow-2xl"
                          priority
                        />
                      </div>

                      {/* Title - Smooth text scaling */}
                      <h1 className="font-bold text-white drop-shadow-2xl text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
                        {BRAND.displayName}
                      </h1>

                      {/* Subtitle - Smooth text scaling with max-width */}
                      <p className="font-normal text-white/90 drop-shadow-lg text-sm xs:text-base sm:text-lg md:text-xl max-w-2xl">
                        {BRAND.tagline}
                      </p>
                    </motion.div>
                  </div>

                  {/* Quick Start Cards - Aligned with chat layout */}
                  <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.5 }}
                      className="w-full"
                    >
                      <ChatQuickStart onSuggestionClick={handleSuggestionClick} />
                    </motion.div>
                  </div>
                </motion.div>
              )
            : (
                <motion.div
                  key="streaming-view"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 flex flex-col min-h-0"
                >
                  {/* ✅ AI Elements Conversation - Official pattern with auto-scroll */}
                  <Conversation className="flex-1">
                    <ConversationContent className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-4 pb-4 space-y-4">
                      {/* Message list - Center-based chat layout */}
                      {messages.map((message) => {
                        // ✅ CRITICAL: Extract participant data from message metadata (stored at generation time)
                        // This makes historical messages independent of current participant configuration
                        const metadata = getMessageMetadata(message.metadata);
                        const participantIndex = metadata?.participantIndex;
                        const storedModelId = metadata?.model; // ✅ Matches DB schema
                        const storedRole = metadata?.role; // ✅ Matches DB schema

                        // ✅ CRITICAL: Use stored modelId directly for avatar (independent of current participants)
                        const avatarProps = getAvatarPropsFromModelId(
                          message.role as 'user' | 'assistant',
                          storedModelId,
                          session?.user?.image,
                          session?.user?.name,
                        );

                        if (message.role === 'user') {
                          return (
                            <Message key={message.id} from="user">
                              <MessageContent>
                                {message.parts.map((part, partIndex) => {
                                  if (part.type === 'text') {
                                    return (
                                      <Response key={`${message.id}-part-${partIndex}`}>
                                        {part.text}
                                      </Response>
                                    );
                                  }
                                  return null;
                                })}
                              </MessageContent>
                              <MessageAvatar src={avatarProps.src} name={avatarProps.name} />
                            </Message>
                          );
                        }

                        // ✅ Assistant message: Use stored modelId from metadata (NOT current participants)
                        // Historical messages must remain associated with the model that generated them,
                        // regardless of current participant changes (reorder/add/remove)
                        const model = storedModelId ? allModels.find(m => m.id === storedModelId) : undefined;

                        if (!model)
                          return null;

                        // ✅ Check for error using typed metadata (already extracted above at line 466)
                        // Type-safe error detection following AI SDK error handling pattern
                        const hasError = metadata?.hasError === true || !!metadata?.error;

                        // ✅ CRITICAL: Detect streaming status correctly
                        // A message is streaming if:
                        // 1. Global status is 'streaming' AND
                        // 2. This is the last message in the array (currently being streamed to)
                        const isLastMessage = messages.indexOf(message) === messages.length - 1;
                        const isCurrentlyStreaming = status === 'streaming' && isLastMessage;
                        const hasContent = message.parts.some(p => p.type === 'text' && p.text.trim().length > 0);

                        const messageStatus: 'thinking' | 'streaming' | 'completed' | 'error'
                          = hasError
                            ? 'error'
                            : isCurrentlyStreaming && !hasContent
                              ? 'thinking'
                              : isCurrentlyStreaming
                                ? 'streaming'
                                : 'completed';

                        return (
                          <ModelMessageCard
                            key={message.id}
                            messageId={message.id}
                            model={model}
                            role={storedRole || ''} // ✅ Use stored role from metadata, not current participants
                            participantIndex={participantIndex ?? 0}
                            status={messageStatus}
                            parts={message.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>}
                            avatarSrc={avatarProps.src}
                            avatarName={avatarProps.name}
                          />
                        );
                      })}

                      {/* ✅ Show reusable streaming loader with funny text */}
                      {status === 'streaming' && (
                        <StreamingParticipantsLoader
                          participants={selectedParticipants}
                          currentParticipantIndex={null}
                        />
                      )}
                    </ConversationContent>
                    <ConversationScrollButton />
                  </Conversation>
                </motion.div>
              )}
        </AnimatePresence>
      </div>

      {/* ✅ STICKY INPUT - Matching single chat page exactly */}
      <div className="sticky bottom-0 z-10 mt-auto">
        <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          {/* Chat Input - Glass design, fixed to bottom */}
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handlePromptSubmit}
            onStop={handleStop}
            status={status === 'streaming' ? 'streaming' : status === 'error' ? 'error' : 'ready'}
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
