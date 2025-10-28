import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';

type UseStreamingLoaderStateParams = {
  analyses: StoredModeratorAnalysis[];
  isStreaming: boolean;
  messages: UIMessage[];
  selectedParticipants: ParticipantConfig[];
};

type UseStreamingLoaderStateResult = {
  showLoader: boolean;
  isAnalyzing: boolean;
  isTransitioning: boolean;
};

/**
 * Hook to determine when to show the streaming participant loader
 *
 * Consolidates loader display logic used in both ChatOverviewScreen and ChatThreadScreen
 *
 * @param params - Configuration for loader state calculation
 * @param params.analyses - Array of moderator analyses for the thread
 * @param params.isStreaming - Whether participant streaming is in progress
 * @param params.messages - Array of UI messages
 * @param params.selectedParticipants - Array of selected participants
 * @returns Object containing loader state booleans
 *
 * @example
 * ```tsx
 * const { showLoader, isAnalyzing } = useStreamingLoaderState({
 *   analyses,
 *   isStreaming,
 *   messages,
 *   selectedParticipants,
 * });
 *
 * {showLoader && (
 *   <StreamingParticipantsLoader
 *     participants={selectedParticipants}
 *     currentParticipantIndex={currentParticipantIndex}
 *     isAnalyzing={isAnalyzing}
 *   />
 * )}
 * ```
 */
export function useStreamingLoaderState({
  analyses,
  isStreaming,
  messages,
  selectedParticipants,
}: UseStreamingLoaderStateParams): UseStreamingLoaderStateResult {
  return useMemo(() => {
    // Check if analysis is in progress (pending or streaming)
    const isAnalyzing = analyses.some(a => a.status === 'pending' || a.status === 'streaming');

    // Check if we have messages
    const hasMessages = messages.length > 0;

    // Check if there are completed or failed analyses
    const hasCompletedAnalysis = analyses.some(a => a.status === 'completed' || a.status === 'failed');

    // Transition state: Between streaming completion and analysis start
    // This occurs when streaming completes but analysis hasn't started yet
    const isTransitioning = hasMessages && !hasCompletedAnalysis && !isStreaming && !isAnalyzing;

    // Show loader if:
    // 1. Currently streaming OR analyzing OR transitioning
    // 2. AND there are participants configured
    const showLoader = (isStreaming || isAnalyzing || isTransitioning) && selectedParticipants.length > 0;

    return {
      showLoader,
      isAnalyzing: isAnalyzing || isTransitioning,
      isTransitioning,
    };
  }, [analyses, isStreaming, messages.length, selectedParticipants.length]);
}
