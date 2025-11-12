/**
 * Flow Loading State Hook
 *
 * REPLACES: useStreamingLoaderState
 * Unified loading indicator logic based on flow orchestrator
 *
 * SINGLE SOURCE OF TRUTH for what loading indicators to show
 * No more scattered loading state checks
 *
 * Location: /src/hooks/utils/use-flow-loading.ts
 */

'use client';

import { useMemo } from 'react';

import { useFlowStateMachine } from '@/stores/chat/actions/flow-state-machine';

export type UseFlowLoadingOptions = {
  /** Screen mode */
  mode: 'overview' | 'thread' | 'public';
};

export type UseFlowLoadingReturn = {
  /** Whether to show loading indicator */
  showLoader: boolean;
  /** User-facing loading message */
  loadingMessage: string;
  /** Current flow state for debugging */
  flowState: string;
  /** Detailed loading state for specific UI elements */
  loadingDetails: {
    isCreatingThread: boolean;
    isStreamingParticipants: boolean;
    isStreamingAnalysis: boolean;
    isNavigating: boolean;
  };
};

/**
 * Unified loading state hook
 *
 * Determines what loading indicators to show based on flow state
 * Replaces scattered loading logic across components
 *
 * @example
 * const { showLoader, loadingMessage } = useFlowLoading({ mode: 'overview' })
 */
export function useFlowLoading(options: UseFlowLoadingOptions): UseFlowLoadingReturn {
  const { mode } = options;

  const { flowState, isLoading, loadingMessage } = useFlowStateMachine({ mode });

  const loadingDetails = useMemo(
    () => ({
      isCreatingThread: flowState === 'creating_thread',
      isStreamingParticipants: flowState === 'streaming_participants',
      isStreamingAnalysis: flowState === 'streaming_analysis',
      isNavigating: flowState === 'navigating',
    }),
    [flowState],
  );

  return {
    showLoader: isLoading,
    loadingMessage,
    flowState,
    loadingDetails,
  };
}
