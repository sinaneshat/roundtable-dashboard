'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

// Default empty array for preSearches prop to avoid unstable default
const EMPTY_PRESEARCHES: StoredPreSearch[] = [];

/**
 * Animated 3-dot loader that cycles through dot count
 * Creates a pulsing "..." animation like ChatGPT
 */
function AnimatedDots() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount(prev => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-block w-[1.5ch] text-left">
      {'.'.repeat(dotCount)}
    </span>
  );
}

/**
 * Simple thinking text with animated dots
 */
function ThinkingText({ text }: { text: string }) {
  return (
    <span className="font-sans font-medium text-muted-foreground">
      {text}
      <AnimatedDots />
    </span>
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
 * Shows a simple "Thinking..." text with animated dots for all loading states.
 * Clean, minimal design inspired by ChatGPT.
 */
export function UnifiedLoadingIndicator({
  showLoader,
  loadingDetails,
  preSearches = EMPTY_PRESEARCHES,
}: UnifiedLoadingIndicatorProps) {
  // Check for active pre-search
  const hasActivePreSearch = useMemo(() => {
    return preSearches.some(
      ps => ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING,
    );
  }, [preSearches]);

  // Simple text based on current state
  const loadingText = useMemo(() => {
    if (loadingDetails.isCreatingThread) {
      return 'Creating conversation';
    }
    if (loadingDetails.isNavigating) {
      return 'Opening conversation';
    }
    if (hasActivePreSearch) {
      return 'Searching';
    }
    // Default for streaming participants or analysis
    return 'Thinking';
  }, [loadingDetails, hasActivePreSearch]);

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
        className="text-left pointer-events-none"
      >
        <div className="text-base py-2">
          <ThinkingText text={loadingText} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
