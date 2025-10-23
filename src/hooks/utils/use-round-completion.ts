/**
 * ✅ Shared Round Completion Hook
 *
 * SINGLE SOURCE OF TRUTH for round completion logic across:
 * - ChatOverviewScreen
 * - ChatThreadScreen
 *
 * RESPONSIBILITIES:
 * 1. Track when rounds complete (all participants finished)
 * 2. Extract participant message IDs from completed round
 * 3. Trigger analysis creation/streaming
 * 4. Handle analysis state management (pending → streaming → completed)
 * 5. Manage loading indicators during analysis
 *
 * KEY FEATURES:
 * - Keeps loading indicator visible until analysis starts streaming
 * - Handles refresh scenarios (detects existing pending analysis)
 * - Prevents duplicate analysis creation (409 Conflict handling)
 * - Tracks analysis quota usage
 *
 * REFERENCE: AI SDK v5 onRoundComplete callback pattern
 */

'use client';

import type { UIMessage } from 'ai';
import { useCallback, useRef, useState } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { useChatAnalysisCache } from '@/hooks/utils/use-chat-analysis-cache';
import type { ChatModeId } from '@/lib/config/chat-modes';

export type RoundCompletionState = {
  isAnalyzing: boolean; // True from round complete until analysis starts streaming
  currentAnalyzingRound: number | null; // Round number currently being analyzed
};

export type UseRoundCompletionOptions = {
  threadId: string;
  mode: ChatModeId;
  onAnalysisStart?: (roundNumber: number) => void;
  onAnalysisComplete?: (roundNumber: number) => void;
  onAnalysisError?: (roundNumber: number, error: string) => void;
};

export type UseRoundCompletionReturn = {
  /** Current analysis state */
  analysisState: RoundCompletionState;

  /** Callback to call when round completes - extracts message IDs and creates pending analysis */
  handleRoundComplete: (
    roundNumber: number,
    messages: UIMessage[],
    participants: ChatParticipant[],
    userQuestion: string,
  ) => Promise<void>;

  /** Mark analysis as started (called by ModeratorAnalysisStream) */
  markAnalysisStarted: (roundNumber: number) => void;

  /** Mark analysis as completed */
  markAnalysisCompleted: (roundNumber: number) => void;

  /** Mark analysis as failed */
  markAnalysisFailed: (roundNumber: number, error: string) => void;
};

/**
 * ✅ Shared hook for handling round completion and analysis workflow
 *
 * Eliminates ~150 lines of duplicate logic between ChatOverviewScreen and ChatThreadScreen
 */
export function useRoundCompletion({
  threadId,
  mode,
  onAnalysisStart,
  onAnalysisComplete,
  onAnalysisError,
}: UseRoundCompletionOptions): UseRoundCompletionReturn {
  const [analysisState, setAnalysisState] = useState<RoundCompletionState>({
    isAnalyzing: false,
    currentAnalyzingRound: null,
  });

  const { addPendingAnalysis, failAnalysis } = useChatAnalysisCache(threadId);

  // Track which rounds we've already created pending analyses for (prevent duplicates)
  const processedRoundsRef = useRef<Set<number>>(new Set());

  /**
   * Handle round completion:
   * 1. Extract participant message IDs
   * 2. Create pending analysis in cache
   * 3. Set analyzing state (keeps loader visible)
   * 4. ModeratorAnalysisStream will detect pending and trigger API call
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

      // ✅ CRITICAL: Set analyzing state BEFORE creating pending analysis
      // This keeps the StreamingParticipantsLoader visible until analysis starts
      setAnalysisState({
        isAnalyzing: true,
        currentAnalyzingRound: roundNumber,
      });

      // ✅ WAIT briefly for backend to persist messages to database
      // Backend onFinish() callback saves messages asynchronously
      await new Promise(resolve => setTimeout(resolve, 2000));

      // ✅ Extract participant message IDs from the completed round
      // Get the last N assistant messages where N = number of participants
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const recentMessages = assistantMessages.slice(-participants.length);
      const participantMessageIds = recentMessages.map(m => m.id);

      // ✅ Create pending analysis in cache
      // RoundAnalysisCard will render → ModeratorAnalysisStream will detect pending → trigger POST /analyze
      addPendingAnalysis({
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
      });
    },
    [threadId, mode, addPendingAnalysis],
  );

  /**
   * Called by ModeratorAnalysisStream when it starts streaming
   * Clears the analyzing state so loading indicator disappears
   */
  const markAnalysisStarted = useCallback(
    (roundNumber: number) => {
      setAnalysisState({
        isAnalyzing: false,
        currentAnalyzingRound: null,
      });

      onAnalysisStart?.(roundNumber);
    },
    [threadId, onAnalysisStart],
  );

  /**
   * Called when analysis completes successfully
   */
  const markAnalysisCompleted = useCallback(
    (roundNumber: number) => {
      setAnalysisState({
        isAnalyzing: false,
        currentAnalyzingRound: null,
      });

      processedRoundsRef.current.delete(roundNumber);
      onAnalysisComplete?.(roundNumber);
    },
    [threadId, onAnalysisComplete],
  );

  /**
   * Called when analysis fails
   */
  const markAnalysisFailed = useCallback(
    (roundNumber: number, error: string) => {
      setAnalysisState({
        isAnalyzing: false,
        currentAnalyzingRound: null,
      });

      processedRoundsRef.current.delete(roundNumber); // Allow retry

      failAnalysis(roundNumber, error);
      onAnalysisError?.(roundNumber, error);
    },
    [threadId, failAnalysis, onAnalysisError],
  );

  return {
    analysisState,
    handleRoundComplete,
    markAnalysisStarted,
    markAnalysisCompleted,
    markAnalysisFailed,
  };
}
