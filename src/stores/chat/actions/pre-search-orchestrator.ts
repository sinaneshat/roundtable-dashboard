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
 * Location: /src/stores/chat/actions/pre-search-orchestrator.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import type { ApiResponse } from '@/api/core';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { useChatStore as UseChatStoreType } from '@/components/providers';
import { useThreadPreSearchesQuery } from '@/hooks/queries';
import { transformPreSearches } from '@/lib/utils';

import { getStatusPriority, PRE_SEARCH_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions, OrchestratorReturn } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';

// Type-safe response type for pre-searches endpoint
type PreSearchApiResponse = ApiResponse<{ items: StoredPreSearch[] }>;

// ✅ CIRCULAR DEPENDENCY FIX: Lazy singleton pattern
// The orchestrator is created on first use, not at module load time.
// This avoids undefined useChatStore when module is loaded due to circular imports.
let cachedOrchestrator: ReturnType<typeof createOrchestrator<
  StoredPreSearch,
  StoredPreSearch,
  number,
  PreSearchApiResponse
>> | null = null;

// Lazy-loaded reference to useChatStore to avoid circular dependency
let lazyUseChatStore: typeof UseChatStoreType | null = null;

function getLazyUseChatStore(): typeof UseChatStoreType {
  if (!lazyUseChatStore) {
    // Dynamic import pattern that defers resolution until runtime
    // eslint-disable-next-line ts/no-require-imports
    lazyUseChatStore = (require('@/components/providers') as { useChatStore: typeof UseChatStoreType }).useChatStore;
  }
  return lazyUseChatStore;
}

function getOrchestrator() {
  if (!cachedOrchestrator) {
    cachedOrchestrator = createOrchestrator<
      StoredPreSearch,
      StoredPreSearch,
      number,
      PreSearchApiResponse
    >({
      queryHook: useThreadPreSearchesQuery,
      useStoreHook: getLazyUseChatStore(),
      storeSelector: s => s.preSearches,
      storeSetter: s => s.setPreSearches,
      extractItems: (response) => {
        if (!response || !response.success) {
          return [];
        }
        return response.data.items;
      },
      transformItems: transformPreSearches,
      getItemKey: item => item.roundNumber,
      getItemPriority: item => getStatusPriority(item.status),
      compareKeys: [...PRE_SEARCH_COMPARE_KEYS],
    });
  }
  return cachedOrchestrator;
}

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
export function usePreSearchOrchestrator(
  options: OrchestratorOptions,
): OrchestratorReturn {
  return getOrchestrator()(options);
}
