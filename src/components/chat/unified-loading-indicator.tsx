'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';

import { MessageStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { TextShimmer } from '@/components/ai-elements/shimmer';

// Default empty array for preSearches prop to avoid unstable default
const EMPTY_PRESEARCHES: StoredPreSearch[] = [];

export type UnifiedLoadingIndicatorProps = {
  /** Whether to show the loading indicator */
  showLoader: boolean;
  /** Loading details from useFlowLoading */
  loadingDetails: {
    isCreatingThread: boolean;
    isStreamingParticipants: boolean;
    isStreamingSummary: boolean;
    isNavigating: boolean;
  };
  /** Pre-search items to check for active pre-search loading */
  preSearches?: StoredPreSearch[];
};

/**
 * Unified loading indicator for chat screens
 *
 * Shows loading text with TextShimmer animation for all loading states.
 * Uses the same shimmer effect as all other loading indicators in the app.
 */
export function UnifiedLoadingIndicator({
  showLoader,
  loadingDetails,
  preSearches = EMPTY_PRESEARCHES,
}: UnifiedLoadingIndicatorProps) {
  // Check for active pre-search
  const hasActivePreSearch = useMemo(() => {
    return preSearches.some(
      ps => ps.status === MessageStatuses.PENDING || ps.status === MessageStatuses.STREAMING,
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
    // Default for streaming participants or summary
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
        <div className="text-base py-2 text-muted-foreground">
          <TextShimmer>{`${loadingText}...`}</TextShimmer>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
