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
import { useCallback, useRef, useState } from 'react';

import { Loader } from '@/components/ai-elements/loader';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { toast } from '@/components/ui/use-toast';
import { WavyBackground } from '@/components/ui/wavy-background';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import { AllowedModelId, getModelById } from '@/lib/ai/models-config';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { chatInputFormDefaults, chatInputFormToCreateThreadRequest } from '@/lib/schemas/chat-forms';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();

  // Chat configuration state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(chatInputFormDefaults.mode);
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>([
    // Default to cheapest model: Gemini 2.5 Flash ($0.075/M in, $0.30/M out)
    { id: 'temp-1', modelId: AllowedModelId.GEMINI_2_5_FLASH, role: '', order: 0 },
  ]);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
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

  // Thread creation mutation
  const createThreadMutation = useCreateThreadMutation();

  // ✅ CALLBACK-DRIVEN: Stream all participants
  const streamAllParticipants = useCallback(
    async (threadId: string, initialMessages: UIMessage[], participantCount: number, threadSlug: string) => {
      // ✅ Prefetch the thread page immediately so navigation is instant
      router.prefetch(`/chat/${threadSlug}`);

      for (let participantIndex = 0; participantIndex < participantCount; participantIndex++) {
        setStatus('streaming');

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // Declare messageId outside try block so catch block can access it
        let messageId = '';

        try {
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
                  console.log('[STREAM EVENT]', event); // DEBUG

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

                    // ✅ Add placeholder message
                    setMessages((prev) => {
                      const updated = [
                        ...prev,
                        {
                          id: messageId,
                          role: 'assistant' as const,
                          parts: [{ type: 'text' as const, text: '' }],
                          metadata: messageMetadata || undefined,
                        },
                      ];
                      messagesRef.current = updated; // Keep ref in sync
                      return updated;
                    });
                  } else if (event.type === 'text-delta' && event.delta) {
                    content += event.delta;
                    console.log('[TEXT DELTA]', { messageId, content }); // DEBUG

                    // ✅ Update message with streamed content
                    setMessages((prev) => {
                      const updated = prev.map(m =>
                        m.id === messageId
                          ? { ...m, parts: [{ type: 'text' as const, text: content }] }
                          : m,
                      );
                      messagesRef.current = updated; // Keep ref in sync
                      console.log('[MESSAGES UPDATED]', updated.length); // DEBUG
                      return updated;
                    });
                  } else if (event.type === 'error') {
                    // ✅ Handle error without exiting the loop - mark message as error
                    const errorMessage = event.error?.message || 'Unknown error occurred';
                    console.error('[STREAM ERROR]', errorMessage);

                    // Update the message with error content
                    setMessages((prev) => {
                      const updated = prev.map(m =>
                        m.id === messageId
                          ? {
                              ...m,
                              parts: [{ type: 'text' as const, text: `⚠️ ${errorMessage}` }],
                              metadata: {
                                ...(m.metadata || {}),
                                error: errorMessage,
                              },
                            }
                          : m,
                      );
                      messagesRef.current = updated;
                      return updated;
                    });

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
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            // User manually stopped streaming - exit entire flow
            setStatus('ready');
            return;
          }

          // ✅ Network/parsing errors - show error in current message, continue to next participant
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error('[NETWORK ERROR]', errorMessage, error);

          // Update message with error if we have a messageId
          if (messageId) {
            setMessages((prev) => {
              const updated = prev.map(m =>
                m.id === messageId
                  ? {
                      ...m,
                      parts: [{ type: 'text' as const, text: `⚠️ ${errorMessage}` }],
                      metadata: {
                        ...(m.metadata || {}),
                        error: errorMessage,
                      },
                    }
                  : m,
              );
              messagesRef.current = updated;
              return updated;
            });
          }

          // Don't exit the participant loop - continue to next participant
          // (Fall through to finally block and then continue loop)
        } finally {
          abortControllerRef.current = null;
        }
      }

      setStatus('ready');

      // ✅ Navigate immediately to thread page after all participants complete
      // Data is already prefetched, so navigation will be instant
      router.push(`/chat/${threadSlug}`);
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
          memoryIds: selectedMemoryIds,
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
        const errorMessage = getApiErrorMessage(error, t('chat.threadCreationFailed'));
        toast({
          variant: 'destructive',
          title: t('notifications.error.createFailed'),
          description: errorMessage,
        });
        setStatus('error');
      }
    },
    [
      inputValue,
      status,
      selectedMode,
      selectedParticipants,
      selectedMemoryIds,
      createThreadMutation,
      t,
      toast,
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
                  <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8 }}
                      className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 text-center"
                    >
                      {/* Logo - Smooth scaling across breakpoints */}
                      <div className="relative h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36">
                        <Image
                          src="/static/logo.png"
                          alt="Roundtable Logo"
                          fill
                          sizes="(max-width: 480px) 80px, (max-width: 640px) 96px, (max-width: 768px) 112px, (max-width: 1024px) 128px, 144px"
                          className="object-contain drop-shadow-2xl"
                          priority
                        />
                      </div>

                      {/* Title - Smooth text scaling */}
                      <h1 className="font-bold text-white drop-shadow-2xl text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
                        roundtable.now
                      </h1>

                      {/* Subtitle - Smooth text scaling with max-width */}
                      <p className="font-normal text-white/90 drop-shadow-lg text-sm xs:text-base sm:text-lg md:text-xl max-w-2xl">
                        Where AI models collaborate together
                      </p>
                    </motion.div>
                  </div>

                  {/* Quick Start Cards - Aligned with chat layout */}
                  <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4">
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
                  className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 pt-4 space-y-4"
                >
                  {/* Message list - Center-based chat layout */}
                  {messages.map((message) => {
                    // ✅ CRITICAL: Extract participant data from message metadata (stored at generation time)
                    // This makes historical messages independent of current participant configuration
                    const metadata = message.metadata as Record<string, unknown> | undefined;
                    const participantIndex = metadata?.participantIndex as number | undefined;
                    const storedModelId = metadata?.model as string | undefined; // ✅ Matches DB schema
                    const storedRole = metadata?.role as string | undefined; // ✅ Matches DB schema

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
                    const model = storedModelId ? getModelById(storedModelId) : undefined;

                    if (!model)
                      return null;

                    const hasError
                      = message.metadata && typeof message.metadata === 'object' && 'error' in message.metadata;
                    const messageStatus: 'completed' | 'streaming' | 'error'
                      = hasError
                        ? 'error'
                        : status === 'streaming' && message.parts[0]?.type === 'text' && message.parts[0].text === ''
                          ? 'streaming'
                          : 'completed';

                    return (
                      <ModelMessageCard
                        key={message.id}
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

                  {/* Show loader during streaming */}
                  {status === 'streaming' && <Loader />}
                </motion.div>
              )}
        </AnimatePresence>
      </div>

      {/* ✅ STICKY INPUT - Stays at bottom, no background wrapper */}
      <div className="sticky bottom-0 left-0 right-0 z-50 mt-auto">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          {/* Participants Preview - shows status during streaming */}
          {selectedParticipants.length > 0 && (
            <ParticipantsPreview
              participants={selectedParticipants}
              isStreaming={status === 'streaming'}
              currentParticipantIndex={undefined}
              chatMessages={messages as unknown as Array<{ participantId?: string | null; [key: string]: unknown }>}
              className="mb-4"
            />
          )}

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
                <ChatMemoriesList
                  selectedMemoryIds={selectedMemoryIds}
                  onMemoryIdsChange={setSelectedMemoryIds}
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
