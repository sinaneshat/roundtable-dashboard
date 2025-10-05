'use client';

import { motion } from 'motion/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { WavyBackground } from '@/components/ui/wavy-background';

export default function ChatOverviewScreen() {
  const router = useRouter();
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<'brainstorming' | 'analyzing' | 'debating' | 'solving'>('brainstorming');
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>([]);

  // Handler for thread creation from ChatInput
  const handleThreadCreated = async (threadId: string, threadSlug: string, _firstMessage: string) => {
    // Navigate immediately to the thread page
    // The thread page will handle auto-triggering streaming and title updates
    router.push(`/chat/${threadSlug}`);
  };

  // Handler for quick start suggestion click
  const handleSuggestionClick = (
    prompt: string,
    mode: 'brainstorming' | 'analyzing' | 'debating' | 'solving',
    participants: ParticipantConfig[],
  ) => {
    setSelectedPrompt(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
    // Scroll to input
    const inputElement = document.querySelector('[data-chat-input]');
    if (inputElement) {
      inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* Wavy Background - Edge-to-edge, breaking out of parent padding */}
      <div className="absolute inset-0 -mx-4 lg:-mx-6 z-0 overflow-hidden">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Content Layer - Above wavy background, matches chat thread structure */}
      <div className="relative z-10 flex flex-1 flex-col min-h-0">
        {/* Hero Section with Logo - Centered with max-w-4xl like chat messages */}
        <div className="flex-shrink-0 pt-16 pb-12">
          <div className="mx-auto max-w-4xl px-4 lg:px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              {/* Roundtable Logo */}
              <div className="relative h-28 w-28 md:h-36 md:w-36">
                <Image
                  src="/static/logo.png"
                  alt="Roundtable Logo"
                  fill
                  className="object-contain drop-shadow-2xl"
                  priority
                />
              </div>
              {/* Roundtable Text */}
              <p className="text-3xl font-bold text-white drop-shadow-2xl md:text-5xl lg:text-6xl">
                roundtable.now
              </p>
              <p className="text-base font-normal text-white/90 drop-shadow-lg md:text-lg lg:text-xl">
                Where AI models collaborate together
              </p>
            </motion.div>
          </div>
        </div>

        {/* Scrollable Content Area - Matches chat thread ScrollArea pattern */}
        <div className="flex-1 overflow-y-auto">
          {/* Quick Start Cards - Same max-w-4xl container as chat messages */}
          <div className="mx-auto max-w-4xl px-4 lg:px-6 pb-8">
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

        {/* Sticky Chat Input - Same container pattern as thread input */}
        <div className="sticky bottom-0 flex-shrink-0 w-full pb-4 pt-3">
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
