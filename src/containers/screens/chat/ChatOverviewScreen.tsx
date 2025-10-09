'use client';

import { CopyIcon, Square } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Action, Actions } from '@/components/ai-elements/actions';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import { Message, MessageContent } from '@/components/ai-elements/message';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Response } from '@/components/ai-elements/response';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { WavyBackground } from '@/components/ui/wavy-background';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { streamParticipant } from '@/lib/ai/stream-participant';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getChatModeOptions } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { chatInputFormDefaults, chatInputFormToCreateThreadRequest } from '@/lib/schemas/chat-forms';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const t = useTranslations();
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(chatInputFormDefaults.mode);
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(chatInputFormDefaults.participants);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>(chatInputFormDefaults.memoryIds);
  const [inputValue, setInputValue] = useState('');

  // Thread state
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadSlug, setActiveThreadSlug] = useState<string | null>(null);
  const [totalParticipants, setTotalParticipants] = useState(0);

  // Thread creation mutation
  const createThreadMutation = useCreateThreadMutation();

  // Messages state following AI SDK pattern
  const [messages, setMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: string; text: string }>;
    metadata?: Record<string, unknown> | null;
    participantId?: string;
  }>>([]);

  // Sequential streaming state
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [isStreamingParticipant, setIsStreamingParticipant] = useState(false);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');

  // Refs for cleanup
  const titlePollingIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const chatModeOptions = getChatModeOptions();

  // Handle PromptInput submission
  const handlePromptSubmit = useCallback(
    async (promptMessage: PromptInputMessage) => {
      const hasText = Boolean(promptMessage.text);
      const hasAttachments = Boolean(promptMessage.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      const messageText = promptMessage.text || 'Sent with attachments';

      try {
        setStatus('submitted');

        // Create thread with configuration
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
          const thread = result.data.thread;
          const threadParticipants = result.data.participants;
          const backendMessages = result.data.messages;
          const firstMessage = backendMessages?.[0];

          // Reset state for new thread
          setActiveThreadId(thread.id);
          setActiveThreadSlug(thread.slug);
          setTotalParticipants(threadParticipants?.length || 1);
          setCurrentParticipantIndex(0);
          setIsStreamingParticipant(false);
          setStatus('ready');

          // Clear input after successful submit (official AI SDK pattern)
          setInputValue('');

          // Update selectedParticipants with actual backend IDs
          if (threadParticipants && threadParticipants.length > 0) {
            setSelectedParticipants(
              threadParticipants.map(p => ({
                id: p.id,
                modelId: p.modelId,
                role: p.role || '',
                order: p.priority,
              })),
            );
          }

          // Use the actual user message created by backend
          if (firstMessage) {
            setMessages([
              {
                id: firstMessage.id,
                role: 'user',
                parts: [{ type: 'text', text: firstMessage.content }],
              },
            ]);
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
    [selectedMode, selectedParticipants, selectedMemoryIds, createThreadMutation, t],
  );

  // Sequential participant streaming effect
  useEffect(() => {
    if (!activeThreadId || isStreamingParticipant || messages.length === 0) {
      return;
    }

    const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;

    if (assistantMessageCount < totalParticipants && assistantMessageCount === currentParticipantIndex) {
      setIsStreamingParticipant(true);
      setStatus('streaming');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      (async () => {
        try {
          const currentParticipant = selectedParticipants[currentParticipantIndex];

          await streamParticipant({
            threadId: activeThreadId,
            messages: messages.map(m => ({
              id: m.id,
              role: m.role,
              parts: m.parts.map(p => ({
                type: p.type,
                text: p.type === 'text' ? p.text : '',
              })),
            })),
            participantIndex: currentParticipantIndex,
            onConfigUpdate: (config) => {
              if (config.participants) {
                setSelectedParticipants(config.participants);
              }
            },
            onUpdate: (updater) => {
              if (typeof updater === 'function') {
                setMessages((prev) => {
                  const updated = updater(prev);
                  return updated.map((msg) => {
                    if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                      const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                      return {
                        ...msg,
                        participantId: currentParticipant.id,
                        metadata: {
                          ...existingMetadata,
                          model: currentParticipant.modelId,
                          role: currentParticipant.role || undefined,
                        },
                      };
                    }
                    return msg;
                  });
                });
              } else {
                setMessages(updater.map((msg) => {
                  if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                    const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                    return {
                      ...msg,
                      participantId: currentParticipant.id,
                      metadata: {
                        ...existingMetadata,
                        model: currentParticipant.modelId,
                        role: currentParticipant.role || undefined,
                      },
                    };
                  }
                  return msg;
                }));
              }
            },
            signal: abortController.signal,
          });

          setCurrentParticipantIndex(prev => prev + 1);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
        } finally {
          setIsStreamingParticipant(false);
          setStatus('ready');
          abortControllerRef.current = null;
        }
      })();
    }
  }, [activeThreadId, messages, currentParticipantIndex, totalParticipants, isStreamingParticipant, selectedParticipants]);

  // Navigate after first round completes
  useEffect(() => {
    if (!activeThreadId || !activeThreadSlug) {
      return;
    }

    const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;
    const allParticipantsComplete = assistantMessageCount >= totalParticipants && totalParticipants > 0;

    if (allParticipantsComplete && !isStreamingParticipant) {
      titlePollingIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/v1/chat/threads/${activeThreadId}`);
          if (response.ok) {
            const data = (await response.json()) as { data: { thread: { title: string } } };
            const title = data.data.thread.title;

            if (title && title !== 'New Chat') {
              if (titlePollingIntervalRef.current) {
                clearInterval(titlePollingIntervalRef.current);
              }
              router.prefetch(`/chat/${activeThreadSlug}`);
              router.push(`/chat/${activeThreadSlug}`);
            }
          }
        } catch (error) {
          console.error('Error polling for title:', error);
        }
      }, 500);

      return () => {
        if (titlePollingIntervalRef.current) {
          clearInterval(titlePollingIntervalRef.current);
        }
      };
    }
    return undefined;
  }, [activeThreadId, activeThreadSlug, messages, totalParticipants, isStreamingParticipant, router]);

  // Handler for quick start suggestion click
  const handleSuggestionClick = (
    prompt: string,
    mode: ChatModeId,
    participants: ParticipantConfig[],
  ) => {
    setSelectedMode(mode);
    setSelectedParticipants(participants);

    setTimeout(() => {
      const inputElement = document.querySelector('textarea');
      if (inputElement) {
        inputElement.value = prompt;
        inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputElement.focus();

        // Trigger change event
        const event = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(event);
      }
    }, 100);
  };

  // Stop streaming handler
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreamingParticipant(false);
    setStatus('ready');
  }, []);

  // Message actions
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const showStreamingView = activeThreadId && messages.length > 0;

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* Wavy Background */}
      <div className="absolute inset-0 -mx-4 lg:-mx-6 z-0 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 flex flex-1 flex-col min-h-0">
        <AnimatePresence mode="wait">
          {!showStreamingView
            ? (
                <motion.div
                  key="hero-view"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-1 flex-col min-h-0"
                >
                  {/* Hero Section */}
                  <div className="flex-shrink-0 pt-16 pb-12">
                    <div className="mx-auto max-w-4xl px-4 lg:px-6">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="flex flex-col items-center gap-6 text-center"
                      >
                        <div className="relative h-28 w-28 md:h-36 md:w-36">
                          <Image
                            src="/static/logo.png"
                            alt="Roundtable Logo"
                            fill
                            sizes="(max-width: 768px) 112px, 144px"
                            className="object-contain drop-shadow-2xl"
                            priority
                          />
                        </div>
                        <p className="text-3xl font-bold text-white drop-shadow-2xl md:text-5xl lg:text-6xl">
                          roundtable.now
                        </p>
                        <p className="text-base font-normal text-white/90 drop-shadow-lg md:text-lg lg:text-xl">
                          Where AI models collaborate together
                        </p>
                      </motion.div>
                    </div>
                  </div>

                  {/* Quick Start Cards */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-4xl px-4 lg:px-6 pb-1.5 lg:pb-6">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                        className="w-full"
                      >
                        <ChatQuickStart onSuggestionClick={handleSuggestionClick} />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )
            : (
                <motion.div
                  key="streaming-view"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 overflow-hidden"
                >
                  <div className="mx-auto max-w-4xl h-full">
                    <Conversation className="h-full">
                      <ConversationContent>
                        {messages.map(message => (
                          <div key={message.id}>
                            <Message from={message.role}>
                              <MessageContent>
                                {message.parts.map((part, i) => {
                                  if (part.type === 'text') {
                                    return (
                                      <Response key={`${message.id}-${i}`}>
                                        {part.text}
                                      </Response>
                                    );
                                  }
                                  return null;
                                })}
                              </MessageContent>
                            </Message>
                            {message.role === 'assistant' && (
                              <Actions className="mt-2">
                                <Action
                                  onClick={() => {
                                    const textPart = message.parts.find(p => p.type === 'text');
                                    if (textPart && 'text' in textPart) {
                                      handleCopyMessage(textPart.text);
                                    }
                                  }}
                                  label="Copy"
                                >
                                  <CopyIcon className="size-3" />
                                </Action>
                              </Actions>
                            )}
                          </div>
                        ))}
                        {status === 'submitted' && <Loader />}
                      </ConversationContent>
                      <ConversationScrollButton />
                    </Conversation>
                  </div>
                </motion.div>
              )}
        </AnimatePresence>

        {/* AI Elements Prompt Input - Sticky */}
        <div className="sticky bottom-0 flex-shrink-0 w-full pb-4 pt-1 lg:pt-3">
          <div className="mx-auto max-w-4xl px-4 lg:px-6">
            <div className="space-y-3">
              {/* Participants Preview */}
              {selectedParticipants.length > 0 && (
                <ParticipantsPreview
                  participants={selectedParticipants}
                  isStreaming={isStreamingParticipant}
                  currentParticipantIndex={currentParticipantIndex}
                  chatMessages={messages}
                  className="mb-2"
                />
              )}

              <div className="space-y-2">
                <PromptInput onSubmit={handlePromptSubmit} className={chatGlass.inputBox}>
                  <PromptInputBody>
                    <PromptInputTextarea
                      placeholder={t('chat.input.placeholder')}
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional UX for chat input on overview page
                      autoFocus
                    />
                  </PromptInputBody>
                  <PromptInputToolbar>
                    <PromptInputTools>
                      <ChatParticipantsList
                        participants={selectedParticipants}
                        onParticipantsChange={setSelectedParticipants}
                        isStreaming={isStreamingParticipant}
                      />

                      <ChatMemoriesList
                        selectedMemoryIds={selectedMemoryIds}
                        onMemoryIdsChange={setSelectedMemoryIds}
                        isStreaming={isStreamingParticipant}
                      />

                      <Select value={selectedMode} onValueChange={value => setSelectedMode(value as ChatModeId)}>
                        <SelectTrigger
                          size="sm"
                          className="h-8 sm:h-9 w-fit gap-1.5 sm:gap-2 rounded-lg border px-3 sm:px-4 text-xs"
                        >
                          <SelectValue>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              {(() => {
                                const ModeIcon = chatModeOptions.find(m => m.value === selectedMode)?.icon;
                                return ModeIcon ? <ModeIcon className="size-3 sm:size-3.5" /> : null;
                              })()}
                              <span className="text-xs font-medium hidden xs:inline sm:inline">
                                {chatModeOptions.find(m => m.value === selectedMode)?.label}
                              </span>
                            </div>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {chatModeOptions.map((chatMode) => {
                            const ModeIcon = chatMode.icon;
                            return (
                              <SelectItem key={chatMode.value} value={chatMode.value}>
                                <div className="flex items-center gap-2">
                                  <ModeIcon className="size-4" />
                                  <span className="text-sm">{chatMode.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </PromptInputTools>

                    {isStreamingParticipant
                      ? (
                          <button
                            type="button"
                            onClick={handleStop}
                            className={cn(
                              'rounded-lg size-9 sm:size-10 bg-destructive text-destructive-foreground',
                              'hover:bg-destructive/90 active:scale-95 transition-transform',
                              'flex items-center justify-center',
                            )}
                          >
                            <Square className="size-4 sm:size-4.5" />
                          </button>
                        )
                      : (
                          <PromptInputSubmit
                            disabled={!inputValue.trim() || selectedParticipants.length === 0 || status === 'submitted'}
                            status={status}
                            className="rounded-lg"
                          />
                        )}
                  </PromptInputToolbar>
                </PromptInput>
                <p className="text-xs text-center text-muted-foreground">
                  {t('chat.input.helpText', { defaultValue: 'Press Enter to send, Shift + Enter for new line' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
