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
 */

'use client';

import type { AnalysesCacheResponse, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import { deduplicateAnalyses } from '@/lib/utils/analysis-utils';
import { transformModeratorAnalyses } from '@/lib/utils/date-transforms';

import { getStatusPriority, MODERATOR_ANALYSIS_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';
import type { AnalysisDeduplicationOptions } from './types';

// ✅ TYPE-SAFE: Use cache data type which matches query return (accepts unknown for analysisData)
// The query merges server data with cache, so response type must accommodate both
type AnalysesApiResponse = AnalysesCacheResponse;

// ✅ TYPE-SAFE: Raw item type from query response (with unknown analysisData)
type RawAnalysisItem = AnalysesCacheResponse['data']['items'][number];

export type UseAnalysisOrchestratorOptions = OrchestratorOptions<readonly [], AnalysisDeduplicationOptions>;

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
 *
 * ✅ TYPE-SAFE: Uses AnalysisDeduplicationOptions instead of Record<string, unknown>
 */
function deduplicateWithStoreContext(items: StoredModeratorAnalysis[], options?: AnalysisDeduplicationOptions) {
  // The regeneratingRoundNumber is passed as an option from the component context
  return deduplicateAnalyses(items, options);
}

export const useAnalysisOrchestrator = createOrchestrator<
  RawAnalysisItem,
  StoredModeratorAnalysis,
  number,
  AnalysesApiResponse,
  readonly [],
  AnalysisDeduplicationOptions
>({
  queryHook: useThreadAnalysesQuery,
  useStoreHook: useChatStore,
  storeSelector: s => s.analyses,
  storeSetter: s => s.setAnalyses,
  extractItems: (response) => {
    if (!response || !response.success) {
      return [];
    }
    return response.data.items;
  },
  transformItems: transformModeratorAnalyses,
  getItemKey: item => item.roundNumber,
  getItemPriority: item => getStatusPriority(item.status),
  // ✅ TYPE-SAFE: Use shared constant from store-constants.ts
  compareKeys: [...MODERATOR_ANALYSIS_COMPARE_KEYS],
  deduplicationHook: deduplicateWithStoreContext,
});
