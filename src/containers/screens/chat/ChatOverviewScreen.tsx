'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { WavyBackground } from '@/components/ui/wavy-background';
import { streamParticipant } from '@/lib/ai/stream-participant';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { chatInputFormDefaults } from '@/lib/schemas/chat-forms';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(chatInputFormDefaults.mode);
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(chatInputFormDefaults.participants);

  // Thread state
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadSlug, setActiveThreadSlug] = useState<string | null>(null);
  const [totalParticipants, setTotalParticipants] = useState(0);

  // Messages state (manual management like AI SDK's useChat)
  const [messages, setMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: string; text: string }>;
    metadata?: Record<string, unknown> | null;
  }>>([]);

  // Sequential streaming state
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [isStreamingParticipant, setIsStreamingParticipant] = useState(false);

  // Refs for cleanup
  const titlePollingIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Start streaming first participant after thread creation
  const handleThreadCreated = useCallback(
    async (
      threadId: string,
      threadSlug: string,
      firstMessage: string,
      participantCount: number,
      createdMessage: { id: string; content: string },
    ) => {
      // Reset state for new thread
      setActiveThreadId(threadId);
      setActiveThreadSlug(threadSlug);
      setTotalParticipants(participantCount);
      setCurrentParticipantIndex(0);
      setIsStreamingParticipant(false);

      // Use the actual user message created by backend (prevents duplicates)
      setMessages([
        {
          id: createdMessage.id,
          role: 'user',
          parts: [{ type: 'text', text: createdMessage.content }],
        },
      ]);
    },
    [],
  );

  // Sequential participant streaming effect
  useEffect(() => {
    // Don't start if no active thread, already streaming, or no messages
    if (!activeThreadId || isStreamingParticipant || messages.length === 0) {
      return;
    }

    // Count how many participants have responded
    const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;

    // Check if we need to stream the next participant
    // Only stream if: we haven't reached total participants AND current index matches assistant count
    if (assistantMessageCount < totalParticipants && assistantMessageCount === currentParticipantIndex) {
      setIsStreamingParticipant(true);

      (async () => {
        try {
          // Stream this participant with full conversation history
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
            onUpdate: setMessages,
          });

          // Move to next participant
          setCurrentParticipantIndex(prev => prev + 1);
        } catch (error) {
          console.error(`Failed to stream participant ${currentParticipantIndex}:`, error);
        } finally {
          setIsStreamingParticipant(false);
        }
      })();
    }
  }, [activeThreadId, messages, currentParticipantIndex, totalParticipants, isStreamingParticipant]);

  // Navigate after first round completes
  useEffect(() => {
    if (!activeThreadId || !activeThreadSlug) {
      return;
    }

    const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;
    const allParticipantsComplete = assistantMessageCount >= totalParticipants && totalParticipants > 0;

    if (allParticipantsComplete && !isStreamingParticipant) {
      // Start polling for title, then navigate
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
    setSelectedPrompt(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
    const inputElement = document.querySelector('[data-chat-input]');
    if (inputElement) {
      inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Show streaming view when we have messages
  const showStreamingView = activeThreadId && messages.length > 0;

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* Wavy Background - Edge-to-edge, breaking out of parent padding */}
      <div className="absolute inset-0 -mx-4 lg:-mx-6 z-0 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Content Layer - Above wavy background */}
      <div className="relative z-10 flex flex-1 flex-col min-h-0">
        <AnimatePresence mode="wait">
          {!showStreamingView
            ? (
              // Hero + Quick Start View
                <motion.div
                  key="hero-view"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-1 flex-col min-h-0"
                >
                  {/* Hero Section with Logo */}
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
              // Streaming Messages View
                <motion.div
                  key="streaming-view"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 overflow-y-auto pt-6"
                >
                  <div className="mx-auto max-w-4xl px-4 lg:px-6">
                    <ChatMessageList
                      messages={messages.map(m => ({
                        id: m.id,
                        role: m.role,
                        content: m.parts.find(p => p.type === 'text')?.text || '',
                        parts: m.parts,
                        participantId: null,
                        metadata: m.metadata || null,
                        createdAt: new Date().toISOString(),
                        isStreaming: isStreamingParticipant && messages.indexOf(m) === messages.length - 1,
                      }))}
                      showModeSeparators={false}
                    />
                  </div>
                </motion.div>
              )}
        </AnimatePresence>

        {/* Sticky Chat Input - Always visible */}
        <div className="sticky bottom-0 flex-shrink-0 w-full pb-4 pt-1 lg:pt-3">
          <div className="mx-auto max-w-4xl px-4 lg:px-6">
            <ChatInput
              onThreadCreated={handleThreadCreated}
              initialMessage={selectedPrompt}
              initialMode={selectedMode}
              initialParticipants={selectedParticipants}
              data-chat-input
            />
          </div>
        </div>
      </div>
    </div>
  );
}
