/**
 * Analysis Orchestrator Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Syncs server analysis data to store and manages analysis lifecycle.
 *
 * INTERNAL HOOK - DO NOT EXPORT
 * Used by useScreenInitialization for thread mode only.
 *
 * ORCHESTRATION FLOW:
 * 1. Fetches analyses from server via useAnalysesQuery
 * 2. Deduplicates analyses (one per round, highest status priority)
 * 3. Syncs deduplicated analyses to store via setAnalyses
 * 4. Streaming analysis updates trigger query invalidation
 * 5. Hook refetches and re-syncs to store automatically
 *
 * Location: /src/stores/chat/actions/analysis-orchestrator.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import { useEffect, useMemo } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { transformModeratorAnalyses } from '@/lib/utils/date-transforms';

import { useAnalysisDeduplication } from './analysis-deduplication';

export type UseAnalysisOrchestratorOptions = {
  threadId: string;
  mode: ChatModeId;
  enabled?: boolean;
};

export type UseAnalysisOrchestratorReturn = {
  /** Whether analyses are loading from server */
  isLoading: boolean;
};

/**
 * Hook for orchestrating analysis data between server and store
 *
 * Automatically syncs server analyses to store and handles deduplication.
 * Eliminates the need for manual analysis state management.
 *
 * @example
 * const { isLoading } = useAnalysisOrchestrator({
 *   threadId,
 *   mode: thread.mode,
 *   enabled: hasInitiallyLoaded && !isStreaming
 * })
 */
export function useAnalysisOrchestrator(
  options: UseAnalysisOrchestratorOptions,
): UseAnalysisOrchestratorReturn {
  const { threadId, enabled = true } = options;

  // Store selectors
  const analyses = useChatStore(s => s.analyses);
  const setAnalyses = useChatStore(s => s.setAnalyses);
  const regeneratingRoundNumber = useChatStore(s => s.regeneratingRoundNumber);

  // Query server analyses (returns response object with data.items)
  const { data: response, isLoading } = useThreadAnalysesQuery(threadId, enabled);

  // Extract analyses array from response and transform dates
  const rawAnalyses = useMemo((): StoredModeratorAnalysis[] => {
    const items = response?.data?.items || [];
    // ✅ SINGLE SOURCE OF TRUTH: Use date transform utility with Zod validation
    // Transform server dates (ISO strings from API) to Date objects for client state
    return transformModeratorAnalyses(items);
  }, [response]);

  // Deduplicate analyses with regeneration filtering
  const deduplicatedAnalyses = useAnalysisDeduplication(rawAnalyses, {
    regeneratingRoundNumber,
  });

  // Sync server analyses to store when they change
  // CRITICAL: Merge client-side pending/streaming analyses with server analyses
  // to prevent losing analyses that haven't been saved to DB yet
  useEffect(() => {
    // ✅ CRITICAL FIX: Don't sync when orchestrator is disabled
    // When disabled, query doesn't fetch new data, so syncing would use stale data
    // This prevents completed analyses from being cleared when orchestrator is
    // temporarily disabled during streaming/analysis creation
    if (!enabled) {
      return;
    }

    // ✅ CRITICAL FIX: Preserve ALL client analyses that aren't on server yet
    // Not just pending/streaming - completed analyses might not be persisted yet!
    // When analysis completes, client marks it 'completed' but server might still be saving.
    // If we only preserve pending/streaming, the completed analysis gets removed before
    // server has it, causing the component to unmount and aborting the stream.
    const serverRoundNumbers = new Set(deduplicatedAnalyses.map(a => a.roundNumber));
    const clientOnlyAnalyses = analyses.filter(
      a => !serverRoundNumbers.has(a.roundNumber),
    );

    // Merge server analyses with client-only analyses
    const merged = [...deduplicatedAnalyses, ...clientOnlyAnalyses];

    // Deduplicate by round number (prefer completed server analysis over client pending)
    const byRound = new Map<number, StoredModeratorAnalysis>();
    merged.forEach((analysis) => {
      const existing = byRound.get(analysis.roundNumber);
      if (!existing) {
        byRound.set(analysis.roundNumber, analysis);
      } else {
        // Prefer completed over streaming over pending
        const priority = { completed: 3, streaming: 2, pending: 1, failed: 0 };
        const existingPriority = priority[existing.status] || 0;
        const analysisPriority = priority[analysis.status] || 0;
        if (analysisPriority > existingPriority) {
          byRound.set(analysis.roundNumber, analysis);
        }
      }
    });

    const finalAnalyses = Array.from(byRound.values()).sort(
      (a, b) => a.roundNumber - b.roundNumber,
    );

    // Only update if analyses actually changed
    const analysesChanged = JSON.stringify(analyses) !== JSON.stringify(finalAnalyses);
    if (analysesChanged) {
      setAnalyses(finalAnalyses);
    }
  }, [enabled, deduplicatedAnalyses, analyses, setAnalyses]);

  return {
    isLoading,
  };
}
