'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatQuickStart } from '@/components/chat/chat-quick-start';
import { Logo } from '@/components/logo';
import { ScaleIn } from '@/components/ui/motion';
import { TextHoverEffect } from '@/components/ui/text-hover-effect';

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
    <div className="flex flex-col w-full h-full">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-4 pt-8 pb-6">
          {/* Hero Section - Large and Dominant */}
          <div className="flex flex-col items-center gap-8 text-center w-full mb-12">
            {/* Logo - Very Large */}
            <ScaleIn duration={0.5} delay={0}>
              <div className="flex items-center justify-center">
                <Logo size="lg" variant="full" className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48" />
              </div>
            </ScaleIn>

            {/* Animated Text - roundtable.now */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="h-[80px] md:h-[100px] lg:h-[120px] w-full max-w-4xl px-8"
            >
              <TextHoverEffect text="roundtable.now" />
            </motion.div>

            {/* Quick Start Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="w-full max-w-6xl"
            >
              <ChatQuickStart onSuggestionClick={handleSuggestionClick} />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Sticky Chat Input - Within dashboard content area */}
      <div className="sticky bottom-0 w-full">
        <div className="max-w-4xl mx-auto py-3 px-4">
          <ChatInput
            className="w-full"
            onThreadCreated={handleThreadCreated}
            initialMessage={selectedPrompt}
            initialMode={selectedMode}
            initialParticipants={selectedParticipants}
            data-chat-input
          />
        </div>
      </div>
    </div>
  );
}
