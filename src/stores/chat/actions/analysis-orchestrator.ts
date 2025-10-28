/**
 * Analysis Orchestrator Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Syncs server analysis data to store and manages analysis lifecycle.
 *
 * Location: /src/stores/chat/actions/analysis-orchestrator.ts
 * Used by: ChatThreadScreen, ChatOverviewScreen
 */

'use client';

import { useEffect, useMemo } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import type { ChatModeId } from '@/lib/config/chat-modes';

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
    // Transform server dates (ISO strings from API) to Date objects for client state
    // Server serializes DB timestamps as ISO strings, client expects Date objects
    return items.map((item) => {
      const createdAt = typeof item.createdAt === 'string'
        ? new Date(item.createdAt)
        : item.createdAt as Date;

      const completedAt = item.completedAt
        ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt as Date)
        : null;

      // Spread rest of properties with date overrides
      return {
        ...item,
        createdAt,
        completedAt,
      } as StoredModeratorAnalysis;
    });
  }, [response]);

  // Deduplicate analyses with regeneration filtering
  const deduplicatedAnalyses = useAnalysisDeduplication(rawAnalyses, {
    regeneratingRoundNumber,
  });

  // Sync server analyses to store when they change
  // CRITICAL: Merge client-side pending/streaming analyses with server analyses
  // to prevent losing analyses that haven't been saved to DB yet
  useEffect(() => {
    // Preserve client-side analyses that are still pending/streaming
    const clientPendingAnalyses = analyses.filter(
      a => a.status === 'pending' || a.status === 'streaming',
    );

    // Merge server analyses with client pending analyses
    const merged = [...deduplicatedAnalyses, ...clientPendingAnalyses];

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
  }, [deduplicatedAnalyses, analyses, setAnalyses]);

  return {
    isLoading,
  };
}
