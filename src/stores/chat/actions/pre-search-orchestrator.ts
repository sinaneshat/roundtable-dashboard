/**
 * Pre-Search Orchestrator Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Syncs server pre-search data to store and manages pre-search lifecycle.
 *
 * INTERNAL HOOK - DO NOT EXPORT
 * Used by useScreenInitialization for thread mode only.
 *
 * ORCHESTRATION FLOW:
 * 1. Fetches pre-searches from server via useThreadPreSearchesQuery
 * 2. Syncs pre-searches to store via setPreSearches
 * 3. Streaming pre-search updates trigger query invalidation
 * 4. Hook refetches and re-syncs to store automatically
 *
 * ✅ MIGRATED: Uses createOrchestrator factory (Wave 2)
 * Location: /src/stores/chat/actions/pre-search-orchestrator.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { useThreadPreSearchesQuery } from '@/hooks/queries/chat/pre-search';
import { transformPreSearches } from '@/lib/utils/date-transforms';

import { getStatusPriority, PRE_SEARCH_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions, OrchestratorReturn } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';

export type UsePreSearchOrchestratorOptions = OrchestratorOptions;
export type UsePreSearchOrchestratorReturn = OrchestratorReturn;

/**
 * Hook for orchestrating pre-search data between server and store
 *
 * Automatically syncs server pre-searches to store.
 * Eliminates the need for manual pre-search state management.
 *
 * @example
 * const { isLoading } = usePreSearchOrchestrator({
 *   threadId,
 *   enabled: hasInitiallyLoaded && !isStreaming && thread.enableWebSearch
 * })
 */
export const usePreSearchOrchestrator = createOrchestrator<StoredPreSearch, StoredPreSearch, number>({
  queryHook: useThreadPreSearchesQuery,
  storeSelector: s => (s as { preSearches: StoredPreSearch[] }).preSearches,
  storeSetter: s => (s as { setPreSearches: (items: StoredPreSearch[]) => void }).setPreSearches,
  extractItems: response => (response as { data?: { items?: StoredPreSearch[] } })?.data?.items || [],
  transformItems: transformPreSearches,
  getItemKey: item => item.roundNumber,
  getItemPriority: item => getStatusPriority(item.status),
  // ✅ TYPE-SAFE: Use shared constant from store-constants.ts
  // Ensures consistency across orchestrator and prevents drift from component dependencies
  compareKeys: [...PRE_SEARCH_COMPARE_KEYS],
});
