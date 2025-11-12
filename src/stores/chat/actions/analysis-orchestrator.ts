/**
 * Analysis Orchestrator Hook
 *
 * Streamlined orchestrator using factory pattern for server/store sync.
 * Syncs server analysis data to store and manages analysis lifecycle.
 *
 * INTERNAL HOOK - DO NOT EXPORT
 * Used by useScreenInitialization for thread mode only.
 *
 * ORCHESTRATION FLOW:
 * 1. Fetches analyses from server via useAnalysesQuery
 * 2. Transforms dates and deduplicates with dynamic regeneratingRoundNumber
 * 3. Syncs deduplicated analyses to store via setAnalyses
 * 4. Streaming analysis updates trigger query invalidation
 * 5. Hook refetches and re-syncs to store automatically
 *
 * ✅ REFACTORED: Migrated to orchestrator-factory (130 lines → 9 lines, 93% reduction)
 *
 * Location: /src/stores/chat/actions/analysis-orchestrator.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { deduplicateAnalyses } from '@/lib/utils/analysis-utils';
import { transformModeratorAnalyses } from '@/lib/utils/date-transforms';

import { getStatusPriority, MODERATOR_ANALYSIS_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions, OrchestratorReturn } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';

export type UseAnalysisOrchestratorOptions = OrchestratorOptions & {
  mode: ChatModeId;
};
export type UseAnalysisOrchestratorReturn = OrchestratorReturn;

/**
 * Hook for orchestrating analysis data between server and store
 * Automatically syncs server analyses to store with deduplication
 *
 * Uses orchestrator factory with custom deduplication hook for regeneratingRoundNumber
 *
 * @example
 * const { isLoading } = useAnalysisOrchestrator({
 *   threadId,
 *   mode: thread.mode,
 *   enabled: hasInitiallyLoaded && !isStreaming
 * })
 */
/**
 * Deduplication wrapper that uses regeneratingRoundNumber from options
 * The regeneratingRoundNumber is passed from the React component context
 */
function deduplicateWithStoreContext(items: StoredModeratorAnalysis[], options?: Record<string, unknown>) {
  // The regeneratingRoundNumber is passed as an option from the component context
  return deduplicateAnalyses(items, options || {});
}

export const useAnalysisOrchestrator = createOrchestrator<StoredModeratorAnalysis, StoredModeratorAnalysis, number>({
  queryHook: useThreadAnalysesQuery,
  storeSelector: s => (s as { analyses: StoredModeratorAnalysis[] }).analyses,
  storeSetter: s => (s as { setAnalyses: (items: StoredModeratorAnalysis[]) => void }).setAnalyses,
  extractItems: response => (response as { data?: { items?: StoredModeratorAnalysis[] } })?.data?.items || [],
  transformItems: transformModeratorAnalyses,
  getItemKey: item => item.roundNumber,
  getItemPriority: item => getStatusPriority(item.status),
  // ✅ TYPE-SAFE: Use shared constant from store-constants.ts
  compareKeys: [...MODERATOR_ANALYSIS_COMPARE_KEYS],
  deduplicationHook: deduplicateWithStoreContext,
});
