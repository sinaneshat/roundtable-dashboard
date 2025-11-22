'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

import { EncryptedText } from '../ui/encrypted-text';

// Default empty array for preSearches prop to avoid unstable default
const EMPTY_PRESEARCHES: StoredPreSearch[] = [];

/**
 * Inner component that cycles through messages
 * Separated to allow React to reset state when messageSet changes via key prop
 */
function CyclingMessage({ messages }: { messages: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentMessage = messages[currentIndex] || 'Processing...';

  // Cycle through messages every 2.5 seconds
  useEffect(() => {
    if (messages.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % messages.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <EncryptedText
      text={currentMessage}
      className="font-medium"
      revealDelayMs={30}
      flipDelayMs={40}
      encryptedClassName="text-muted-foreground/40"
      revealedClassName="text-muted-foreground"
      continuous
    />
  );
}

/**
 * Animated bouncing dots for loading indicator
 */
function LoadingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="size-1.5 bg-muted-foreground/40 rounded-full"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.2,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export type UnifiedLoadingIndicatorProps = {
  /** Whether to show the loading indicator */
  showLoader: boolean;
  /** Loading details from useFlowLoading */
  loadingDetails: {
    isCreatingThread: boolean;
    isStreamingParticipants: boolean;
    isStreamingAnalysis: boolean;
    isNavigating: boolean;
  };
  /** Pre-search items to check for active pre-search loading */
  preSearches?: StoredPreSearch[];
};

/**
 * Unified loading indicator for chat screens
 *
 * Shows a bottom-left aligned matrix text loading indicator for ALL loading states:
 * - Thread creation
 * - Participant streaming
 * - Analysis streaming
 * - Pre-search operations
 * - Navigation
 *
 * Uses EncryptedText with continuous mode for the matrix effect
 */
export function UnifiedLoadingIndicator({
  showLoader,
  loadingDetails,
  preSearches = EMPTY_PRESEARCHES,
}: UnifiedLoadingIndicatorProps) {
  const t = useTranslations('chat.streaming');

  // Check for active pre-search
  const hasActivePreSearch = useMemo(() => {
    return preSearches.some(
      ps => ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING,
    );
  }, [preSearches]);

  // Determine which message set to use based on current state
  const messageSet = useMemo(() => {
    if (loadingDetails.isCreatingThread) {
      return ['Creating conversation...'];
    }
    if (loadingDetails.isNavigating) {
      return ['Opening conversation...'];
    }
    if (hasActivePreSearch) {
      return [
        'Searching the web...',
        'Gathering information...',
        'Analyzing search results...',
        'Extracting relevant content...',
      ];
    }
    if (loadingDetails.isStreamingAnalysis) {
      return t.raw('analyzingMessages') as string[] || [
        'Analyzing responses...',
        'Synthesizing insights...',
        'Preparing analysis...',
      ];
    }
    if (loadingDetails.isStreamingParticipants) {
      return t.raw('thinkingMessages') as string[] || [
        'Thinking...',
        'Processing...',
        'Generating response...',
      ];
    }
    // Default fallback
    return ['Processing...'];
  }, [loadingDetails, hasActivePreSearch, t]);

  // Create a stable key for the message set to detect changes
  const messageSetKey = useMemo(() => messageSet.join('|'), [messageSet]);

  // Determine if we should show the indicator
  const shouldShow = showLoader || hasActivePreSearch;

  if (!shouldShow) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mt-4 text-left"
      >
        <div className="flex items-center gap-3 text-sm">
          <LoadingDots />
          {/* Key ensures component remounts and resets cycling when message set changes */}
          <CyclingMessage key={messageSetKey} messages={messageSet} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
