/**
 * Overview Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for overview screen
 * Consolidates overview-specific logic (slug polling, suggestion handling, streaming trigger)
 *
 * Location: /src/stores/chat/actions/overview-actions.ts
 * Used by: ChatOverviewScreen
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadSlugStatusQuery } from '@/hooks/queries/chat/threads';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';

export type UseOverviewActionsReturn = {
  /** Handle suggestion click - sets input, mode, and participants */
  handleSuggestionClick: (prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => void;
};

/**
 * Hook for managing overview screen actions
 *
 * Consolidates:
 * - Suggestion click handling
 * - Slug polling for URL updates
 * - Streaming trigger after thread creation
 *
 * @example
 * const overviewActions = useOverviewActions()
 *
 * <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
 */
export function useOverviewActions(): UseOverviewActionsReturn {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ✅ PERFORMANCE: Batch state selectors with useShallow to prevent unnecessary re-renders
  // Groups related state for efficient subscription management
  const streamingState = useChatStore(useShallow(s => ({
    showInitialUI: s.showInitialUI,
    waitingToStartStreaming: s.waitingToStartStreaming,
    isStreaming: s.isStreaming,
  })));

  const threadState = useChatStore(useShallow(s => ({
    currentThread: s.thread,
    messages: s.messages,
    contextParticipants: s.participants,
    createdThreadId: s.createdThreadId,
    analyses: s.analyses,
  })));

  // Store actions - kept separate for clarity and stable references
  const setInputValue = useChatStore(s => s.setInputValue);
  const setSelectedMode = useChatStore(s => s.setSelectedMode);
  const setSelectedParticipants = useChatStore(s => s.setSelectedParticipants);
  const setWaitingToStartStreaming = useChatStore(s => s.setWaitingToStartStreaming);
  const startRound = useChatStore(s => s.startRound);

  // Refs for tracking
  const hasTriggeredStreamingRef = useRef(false);

  /**
   * Handle suggestion click from quick start
   * Sets form state (input, mode, participants)
   */
  const handleSuggestionClick = useCallback((
    prompt: string,
    mode: ChatModeId,
    participants: ParticipantConfig[],
  ) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, [setInputValue, setSelectedMode, setSelectedParticipants]);

  /**
   * Trigger streaming when thread is ready after creation
   * AI SDK v5 Pattern: Wait for chat to be ready before starting streaming
   */
  useEffect(() => {
    if (
      streamingState.waitingToStartStreaming
      && !hasTriggeredStreamingRef.current
      && threadState.currentThread
      && threadState.messages.length > 0
      && !streamingState.isStreaming
      && threadState.contextParticipants.length > 0
    ) {
      const hasUserMessage = threadState.messages.some(m => m.role === 'user');

      if (hasUserMessage) {
        hasTriggeredStreamingRef.current = true;
        setWaitingToStartStreaming(false);

        requestAnimationFrame(() => {
          try {
            startRound?.();
          } catch (error) {
            showApiErrorToast('Error starting conversation', error);
            setWaitingToStartStreaming(false);
          }
        });
      }
    }
  }, [
    streamingState.waitingToStartStreaming,
    streamingState.isStreaming,
    threadState.currentThread,
    threadState.messages,
    threadState.contextParticipants,
    startRound,
    setWaitingToStartStreaming,
  ]);

  /**
   * Reset streaming trigger when returning to initial UI
   */
  useEffect(() => {
    if (streamingState.showInitialUI) {
      hasTriggeredStreamingRef.current = false;
      setWaitingToStartStreaming(false);
    }
  }, [streamingState.showInitialUI, setWaitingToStartStreaming]);

  /**
   * Title/Slug polling for AI-generated title updates
   * Enables URL replacement and proper navigation after AI title generation
   *
   * ✅ FIX: Track isAiGeneratedTitle database field (reliable detection)
   * ✅ FIX: Replace URL immediately when AI title ready (no full refresh)
   * ✅ FIX: Only navigate after entire round completes (streaming + analysis done)
   * ✅ PERFORMANCE: State for query control, refs for deduplication in effects
   */
  const [hasReplacedUrl, setHasReplacedUrl] = useState(false);
  const hasNavigatedRef = useRef(false);
  const aiGeneratedSlugRef = useRef<string | null>(null);

  // Reset flags when returning to initial UI
  useEffect(() => {
    if (streamingState.showInitialUI) {
      // Reset state to allow query to run again (reactive dependency for query enabled)
      // Wrapped in startTransition to avoid cascading render warning
      startTransition(() => {
        setHasReplacedUrl(false);
      });
      hasNavigatedRef.current = false;
      aiGeneratedSlugRef.current = null;
    }
  }, [streamingState.showInitialUI]);

  // Start polling for slug status updates
  // Stop polling after URL replaced OR if AI title already generated
  const slugStatusQuery = useThreadSlugStatusQuery(
    threadState.createdThreadId,
    Boolean(
      threadState.createdThreadId
      && threadState.currentThread
      && !streamingState.showInitialUI
      && !hasReplacedUrl // State controls query (reactive dependency)
      && !threadState.currentThread.isAiGeneratedTitle, // Never poll if AI title already exists
    ),
  );

  // ✅ STEP 1: Monitor query result and replace URL when AI title is ready
  useEffect(() => {
    const slugData = slugStatusQuery.data;

    if (slugData && slugData.isAiGeneratedTitle && !hasReplacedUrl) {
      aiGeneratedSlugRef.current = slugData.slug;

      // Replace URL in browser history without navigation or refresh
      window.history.replaceState(null, '', `/chat/${slugData.slug}`);

      // Invalidate thread list to update sidebar with new AI-generated title
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.lists(),
      });

      // Update state to stop query (reactive dependency)
      // Wrapped in startTransition to mark as non-urgent update
      startTransition(() => {
        setHasReplacedUrl(true);
      });
    }
  }, [slugStatusQuery.data, hasReplacedUrl, queryClient]);

  // ✅ STEP 2: Navigate only after entire round completes (separate from polling)
  // Monitors completion state after URL has been replaced
  useEffect(() => {
    // Only run if URL has been replaced but haven't navigated yet
    // Use state for reactive check, ref for deduplication
    if (hasReplacedUrl && !hasNavigatedRef.current && aiGeneratedSlugRef.current) {
      // Check if streaming is done
      if (!streamingState.isStreaming) {
        const firstAnalysis = threadState.analyses[0];
        const isAnalysisComplete = firstAnalysis?.status === 'completed';

        // Navigate when EVERYTHING is done
        if (isAnalysisComplete) {
          hasNavigatedRef.current = true;
          router.push(`/chat/${aiGeneratedSlugRef.current}`);
        }
      }
    }
  }, [hasReplacedUrl, streamingState.isStreaming, threadState.analyses, router]);

  return useMemo(() => ({
    handleSuggestionClick,
  }), [handleSuggestionClick]);
}
