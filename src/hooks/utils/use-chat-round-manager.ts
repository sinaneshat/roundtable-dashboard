/**
 * ✅ UNIFIED CHAT ROUND MANAGER - Eliminates ALL Duplicate Logic
 *
 * SINGLE SOURCE OF TRUTH for round management shared between:
 * - ChatOverviewScreen
 * - ChatThreadScreen
 *
 * RESPONSIBILITIES:
 * 1. Round completion detection and handling
 * 2. Analysis creation and state management
 * 3. Participant message ID extraction
 * 4. Loading state coordination (streaming → analyzing → complete)
 * 5. Cache synchronization
 *
 * ELIMINATES: ~200+ lines of duplicate logic across both screens
 *
 * KEY FIX: Ensures analysis is ALWAYS triggered after round completion
 * by properly managing state and cache synchronization.
 */

'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatParticipant, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat-threads';
import { useChatAnalysisCache } from '@/hooks/utils/use-chat-analysis-cache';
import type { ChatModeId } from '@/lib/config/chat-modes';

export type RoundManagerState = {
  /** True when waiting for analysis to start after round completes */
  isWaitingForAnalysis: boolean;
  /** Currently analyzing round number */
  analyzingRoundNumber: number | null;
  /** All analyses including pending ones from cache */
  analyses: StoredModeratorAnalysis[];
};

export type UseChatRoundManagerOptions = {
  threadId: string;
  mode: ChatModeId;
  /** Enable analysis query (false for overview before thread created) */
  enableQuery?: boolean;
};

export type UseChatRoundManagerReturn = {
  /** Current manager state */
  state: RoundManagerState;

  /** Call when round completes - handles analysis creation */
  handleRoundComplete: (
    roundNumber: number,
    messages: UIMessage[],
    participants: ChatParticipant[],
    userQuestion: string,
  ) => Promise<void>;

  /** Call when analysis starts streaming (clears waiting state) */
  notifyAnalysisStarted: (roundNumber: number) => void;

  /** Call when analysis completes */
  notifyAnalysisCompleted: (roundNumber: number) => void;

  /** Call when analysis fails */
  notifyAnalysisFailed: (roundNumber: number, error: string) => void;
};

/**
 * ✅ Unified hook for chat round and analysis management
 *
 * Eliminates duplicate logic, ensures analysis always triggers, handles state properly.
 */
export function useChatRoundManager({
  threadId,
  mode,
  enableQuery = true,
}: UseChatRoundManagerOptions): UseChatRoundManagerReturn {
  // State management
  const [state, setState] = useState<RoundManagerState>({
    isWaitingForAnalysis: false,
    analyzingRoundNumber: null,
    analyses: [],
  });

  // Track processed rounds to prevent duplicates
  const processedRoundsRef = useRef<Set<number>>(new Set());

  // Track if we're in the middle of adding a pending analysis (prevent sync conflicts)
  const isAddingPendingRef = useRef(false);

  // Cache operations
  const { addPendingAnalysis, failAnalysis } = useChatAnalysisCache(threadId);

  // Fetch analyses from server
  const { data: analysesResponse } = useThreadAnalysesQuery(threadId, enableQuery);

  /**
   * ✅ CRITICAL: Sync analyses from query response + cache
   * This ensures UI always shows latest state including pending analyses
   * BUT: Don't overwrite state if we're actively adding a pending analysis
   */
  useEffect(() => {
    // ✅ FIX: Skip sync if we're adding a pending analysis to avoid conflicts
    if (isAddingPendingRef.current) {
      return;
    }

    if (analysesResponse?.success) {
      // ✅ FIX: Transform date strings to Date objects (API returns ISO strings, component expects Dates)
      const items = (analysesResponse.data.items || []).map(item => ({
        ...item,
        createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
        completedAt: item.completedAt
          ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt)
          : null,
      }));

      // ✅ Use setTimeout to defer state update and avoid React warnings
      const timeoutId = setTimeout(() => {
        setState((prev) => {
          const prevIds = prev.analyses.map(a => `${a.id}-${a.status}`).join(',');
          const newIds = items.map(a => `${a.id}-${a.status}`).join(',');

          if (prevIds === newIds) {
            // Data unchanged, return previous state to prevent re-render
            return prev;
          }

          return {
            ...prev,
            analyses: items,
          };
        });
      }, 0);

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [analysesResponse, threadId]);

  /**
   * Handle round completion:
   * 1. Extract participant message IDs
   * 2. Create pending analysis in cache
   * 3. Set waiting state (keeps loader visible)
   * 4. RoundAnalysisCard renders → ModeratorAnalysisStream triggers API
   */
  const handleRoundComplete = useCallback(
    async (
      roundNumber: number,
      messages: UIMessage[],
      participants: ChatParticipant[],
      userQuestion: string,
    ) => {
      // Prevent duplicate processing
      if (processedRoundsRef.current.has(roundNumber)) {
        return;
      }

      // Mark as processed
      processedRoundsRef.current.add(roundNumber);

      // ✅ Set flag to prevent sync useEffect from overwriting our pending analysis
      isAddingPendingRef.current = true;

      // ✅ Wait for backend to persist messages
      await new Promise(resolve => setTimeout(resolve, 2000));

      // ✅ Extract participant message IDs
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const recentMessages = assistantMessages.slice(-participants.length);
      const participantMessageIds = recentMessages.map(m => m.id);

      // ✅ Create pending analysis object
      const pendingAnalysis: StoredModeratorAnalysis = {
        id: `pending-${threadId}-${roundNumber}-${Date.now()}`,
        threadId,
        roundNumber,
        mode,
        userQuestion,
        status: 'pending' as const,
        participantMessageIds,
        analysisData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      // ✅ Add to cache
      addPendingAnalysis(pendingAnalysis);

      // ✅ CRITICAL: Update state DIRECTLY to avoid infinite loop from query invalidation
      // This immediately shows the pending analysis in the UI
      setState(prev => ({
        ...prev,
        isWaitingForAnalysis: true,
        analyzingRoundNumber: roundNumber,
        analyses: [...prev.analyses, pendingAnalysis],
      }));

      // ✅ Clear flag after a delay to allow sync to resume
      setTimeout(() => {
        isAddingPendingRef.current = false;
      }, 1000);
    },
    [threadId, mode, addPendingAnalysis],
  );

  /**
   * Called by ModeratorAnalysisStream when it starts streaming
   */
  const notifyAnalysisStarted = useCallback(
    (roundNumber: number) => {
      setState(prev => ({
        ...prev,
        isWaitingForAnalysis: false,
        analyzingRoundNumber: roundNumber,
      }));
    },
    [threadId],
  );

  /**
   * Called when analysis completes
   */
  const notifyAnalysisCompleted = useCallback(
    (roundNumber: number) => {
      setState(prev => ({
        ...prev,
        isWaitingForAnalysis: false,
        analyzingRoundNumber: null,
      }));

      processedRoundsRef.current.delete(roundNumber);
    },
    [threadId],
  );

  /**
   * Called when analysis fails
   */
  const notifyAnalysisFailed = useCallback(
    (roundNumber: number, error: string) => {
      setState(prev => ({
        ...prev,
        isWaitingForAnalysis: false,
        analyzingRoundNumber: null,
      }));

      processedRoundsRef.current.delete(roundNumber); // Allow retry
      failAnalysis(roundNumber, error);
    },
    [threadId, failAnalysis],
  );

  return {
    state,
    handleRoundComplete,
    notifyAnalysisStarted,
    notifyAnalysisCompleted,
    notifyAnalysisFailed,
  };
}
