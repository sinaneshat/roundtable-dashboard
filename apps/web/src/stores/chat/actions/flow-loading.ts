/**
 * Flow Loading State Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Unified loading indicator logic based on flow orchestrator
 *
 * SINGLE SOURCE OF TRUTH for what loading indicators to show
 * No more scattered loading state checks
 *
 * Location: /src/stores/chat/actions/flow-loading.ts
 * Used by: ChatView
 */

import type { FlowState, ScreenMode } from '@roundtable/shared';
import { FlowStates } from '@roundtable/shared';
import { useMemo } from 'react';

import { useFlowStateMachine } from './flow-state-machine';

export type UseFlowLoadingOptions = {
  /** Screen mode */
  mode: ScreenMode;
};

export type UseFlowLoadingReturn = {
  /** Whether to show loading indicator */
  showLoader: boolean;
  /** User-facing loading message */
  loadingMessage: string;
  /** Current flow state for debugging */
  flowState: FlowState;
  /** Detailed loading state for specific UI elements */
  loadingDetails: {
    isCreatingThread: boolean;
    isStreamingParticipants: boolean;
    isStreamingModerator: boolean;
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
 * const { showLoader, loadingMessage } = useFlowLoading({ mode: ScreenModes.OVERVIEW })
 */
export function useFlowLoading(options: UseFlowLoadingOptions): UseFlowLoadingReturn {
  const { mode } = options;

  const { flowState, isLoading, loadingMessage } = useFlowStateMachine({ mode });

  const loadingDetails = useMemo(
    () => ({
      isCreatingThread: flowState === FlowStates.CREATING_THREAD,
      isStreamingParticipants: flowState === FlowStates.STREAMING_PARTICIPANTS,
      isStreamingModerator: flowState === FlowStates.STREAMING_MODERATOR,
      isNavigating: flowState === FlowStates.NAVIGATING,
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
