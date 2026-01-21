/**
 * Pre-search orchestrator hook
 */

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { useThreadPreSearchesQuery } from '@/hooks/queries';
import { transformPreSearches } from '@/lib/utils';
import type { GetThreadPreSearchesResponse, StoredPreSearch } from '@/services/api';

import { getStatusPriority, PRE_SEARCH_COMPARE_KEYS } from '../store-constants';
import type { OrchestratorOptions, OrchestratorReturn } from './orchestrator-factory';
import { createOrchestrator } from './orchestrator-factory';

const preSearchOrchestrator = createOrchestrator<
  StoredPreSearch,
  StoredPreSearch,
  number,
  GetThreadPreSearchesResponse
>({
  queryHook: useThreadPreSearchesQuery,
  useStoreHook: useChatStore,
  storeSelector: s => s.preSearches,
  storeSetter: s => s.setPreSearches,
  extractItems: (response) => {
    if (!response || !response.success || !response.data) {
      return [];
    }
    return response.data.items;
  },
  transformItems: transformPreSearches,
  getItemKey: item => item.roundNumber,
  getItemPriority: item => getStatusPriority(item.status as 'pending' | 'streaming' | 'failed' | 'complete'),
  compareKeys: [...PRE_SEARCH_COMPARE_KEYS],
});

export function getPreSearchOrchestrator(options: OrchestratorOptions): OrchestratorReturn {
  return preSearchOrchestrator(options);
}
