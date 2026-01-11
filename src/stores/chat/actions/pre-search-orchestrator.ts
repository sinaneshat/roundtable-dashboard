/**
 * Pre-search orchestrator hook
 */

'use client';

import type { ApiResponse } from '@/api/core';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { useThreadPreSearchesQuery } from '@/hooks/queries';
import { transformPreSearches } from '@/lib/utils';

import { getStatusPriority, PRE_SEARCH_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions, OrchestratorReturn } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';

type PreSearchApiResponse = ApiResponse<{ items: StoredPreSearch[] }>;

const preSearchOrchestrator = createOrchestrator<
  StoredPreSearch,
  StoredPreSearch,
  number,
  PreSearchApiResponse
>({
  queryHook: useThreadPreSearchesQuery,
  useStoreHook: useChatStore,
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

export function getPreSearchOrchestrator(options: OrchestratorOptions): OrchestratorReturn {
  return preSearchOrchestrator(options);
}
