/**
 * ✅ UNIFIED Chat Screen Hook - Shared Logic Between Overview & Thread Screens
 *
 * ELIMINATES DUPLICATION between:
 * - /src/containers/screens/chat/ChatOverviewScreen.tsx
 * - /src/containers/screens/chat/ChatThreadScreen.tsx
 *
 * SINGLE SOURCE OF TRUTH for:
 * - Analysis state management
 * - Participant configuration
 * - Round completion handling
 * - Message grouping and rendering
 *
 * CODE REDUCTION: ~400 lines of duplicate logic → Single reusable hook
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat-threads';
import { useChatAnalysisCache } from '@/hooks/utils/use-chat-analysis-cache';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { getMaxRoundNumber, groupMessagesByRound } from '@/lib/utils/round-utils';

type UseChatScreenOptions = {
  threadId: string;
  mode: ChatModeId;
  messages: UIMessage[];
  participants: ChatParticipant[];
  isStreaming: boolean;
  currentParticipantIndex: number;
  onRoundComplete?: () => void;
};

type UseChatScreenReturn = {
  // Analysis state
  analyses: ReturnType<typeof useThreadAnalysesQuery>['data'];
  analysesLoading: boolean;
  hasAnalysisStreaming: boolean;

  // Message grouping
  messageGroups: ReturnType<typeof groupMessagesByRound>;
  maxRoundNumber: number;

  // UI state
  shouldShowLoader: boolean;

  // Callbacks
  handleAnalysisComplete: (roundNumber: number, data: unknown) => void;
};

/**
 * ✅ UNIFIED hook for chat screen logic
 *
 * Replaces duplicate code in:
 * - ChatOverviewScreen: 572 lines
 * - ChatThreadScreen: 1288 lines
 *
 * Shared concerns:
 * - Analysis lifecycle (pending → streaming → completed)
 * - Message grouping by rounds
 * - Participant loader visibility
 * - Cache management
 */
export function useChatScreen({
  threadId,
  mode: _mode,
  messages,
  participants: _participants,
  isStreaming,
  currentParticipantIndex: _currentParticipantIndex,
  onRoundComplete,
}: UseChatScreenOptions): UseChatScreenReturn {
  const queryClient = useQueryClient();

  // ============================================================================
  // ANALYSIS STATE - Single source of truth
  // ============================================================================

  // Fetch analyses from backend (includes pending created by backend)
  const { data: analysesResponse, isLoading: analysesLoading } = useThreadAnalysesQuery(
    threadId,
    !!threadId,
  );

  // Cache utilities for updates
  const { completeAnalysis } = useChatAnalysisCache(threadId);

  // Transform analyses with proper typing
  const analyses = useMemo(() => {
    if (!analysesResponse?.success)
      return [];

    return analysesResponse.data.items.map(item => ({
      ...item,
      createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
      completedAt: item.completedAt
        ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt)
        : null,
    }));
  }, [analysesResponse]);

  // ============================================================================
  // MESSAGE GROUPING - Reusable calculation
  // ============================================================================

  const maxRoundNumber = useMemo(() => getMaxRoundNumber(messages), [messages]);

  const messageGroups = useMemo(
    () => groupMessagesByRound(messages),
    [messages],
  );

  // ============================================================================
  // ANALYSIS STREAMING STATE - Determines loader visibility
  // ============================================================================

  // Check if there's an analysis streaming for the latest round
  const hasAnalysisStreaming = useMemo(() => {
    const lastRoundAnalysis = analyses.find(a => a.roundNumber === maxRoundNumber);
    return lastRoundAnalysis?.status === 'pending' || lastRoundAnalysis?.status === 'streaming';
  }, [analyses, maxRoundNumber]);

  // ============================================================================
  // LOADER VISIBILITY - Unified logic
  // ============================================================================

  // Show loader when:
  // 1. Participants are streaming, OR
  // 2. Analysis is pending/streaming for current round
  const shouldShowLoader = isStreaming || hasAnalysisStreaming;

  // ============================================================================
  // ROUND COMPLETION HANDLER - No manual cache manipulation
  // ============================================================================

  // ✅ CRITICAL FIX: Remove ALL frontend pending analysis creation
  // Backend automatically creates pending analysis when round completes
  // Frontend just needs to invalidate queries to pick up the new analysis
  useEffect(() => {
    // Only run when streaming STOPS (round just completed)
    if (!isStreaming && onRoundComplete) {
      const timeoutId = setTimeout(async () => {
        // ✅ Invalidate analyses query to fetch backend-created pending analysis
        // This triggers RoundAnalysisCard to render and ModeratorAnalysisStream to start
        await queryClient.invalidateQueries({
          queryKey: queryKeys.threads.analyses(threadId),
        });

        onRoundComplete();
      }, 500); // Small delay to ensure backend has created the analysis

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [isStreaming, threadId, maxRoundNumber, queryClient, onRoundComplete]);

  // ============================================================================
  // ANALYSIS COMPLETION HANDLER - Update cache
  // ============================================================================

  const handleAnalysisComplete = useCallback(
    (roundNumber: number, data: unknown) => {
      // Update cache with completed analysis
      // Type assertion: data is validated by ModeratorAnalysisStream before calling this
      if (data) {
        completeAnalysis(roundNumber, data as import('@/api/routes/chat/schema').ModeratorAnalysisPayload);
      }

      // Invalidate to fetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.analyses(threadId),
      });
    },
    [threadId, completeAnalysis, queryClient],
  );

  return {
    // Analysis state
    analyses: analysesResponse,
    analysesLoading,
    hasAnalysisStreaming,

    // Message grouping
    messageGroups,
    maxRoundNumber,

    // UI state
    shouldShowLoader,

    // Callbacks
    handleAnalysisComplete,
  };
}
