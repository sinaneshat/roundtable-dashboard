/**
 * Summary Orchestrator Hook
 *
 * Streamlined orchestrator using factory pattern for server/store sync.
 * Syncs server summary data to store and manages summary lifecycle.
 *
 * INTERNAL HOOK - DO NOT EXPORT
 * Used by useScreenInitialization for thread mode only.
 *
 * ORCHESTRATION FLOW:
 * 1. Fetches summaries from server via useSummariesQuery
 * 2. Transforms dates and deduplicates with dynamic regeneratingRoundNumber
 * 3. Syncs deduplicated summaries to store via setSummaries
 * 4. Streaming summary updates trigger query invalidation
 * 5. Hook refetches and re-syncs to store automatically
 */

'use client';

import type { StoredRoundSummary, SummariesCacheResponse } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadSummariesQuery } from '@/hooks/queries/chat';
import { transformRoundSummaries } from '@/lib/utils/date-transforms';
import { deduplicateSummaries } from '@/lib/utils/summary-utils';

import { getStatusPriority, ROUND_SUMMARY_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';
import type { SummaryDeduplicationOptions } from './types';

type SummariesApiResponse = SummariesCacheResponse;
type RawSummaryItem = SummariesCacheResponse['data']['items'][number];

export type UseSummaryOrchestratorOptions = OrchestratorOptions<readonly [], SummaryDeduplicationOptions>;

/**
 * Hook for orchestrating summary data between server and store
 * Automatically syncs server summaries to store with deduplication
 *
 * Uses orchestrator factory with custom deduplication hook for regeneratingRoundNumber
 *
 * @example
 * const { isLoading } = useSummaryOrchestrator({
 *   threadId,
 *   mode: thread.mode,
 *   enabled: hasInitiallyLoaded && !isStreaming
 * })
 */
export const useSummaryOrchestrator = createOrchestrator<
  RawSummaryItem,
  StoredRoundSummary,
  number,
  SummariesApiResponse,
  readonly [],
  SummaryDeduplicationOptions
>({
  queryHook: useThreadSummariesQuery,
  useStoreHook: useChatStore,
  storeSelector: s => s.summaries,
  storeSetter: s => s.setSummaries,
  extractItems: (response) => {
    if (!response || !response.success) {
      return [];
    }
    return response.data.items;
  },
  transformItems: transformRoundSummaries,
  getItemKey: item => item.roundNumber,
  getItemPriority: item => getStatusPriority(item.status),
  compareKeys: [...ROUND_SUMMARY_COMPARE_KEYS],
  deduplicationHook: deduplicateSummaries,
});
