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
  compareKeys: [...PRE_SEARCH_COMPARE_KEYS],
  extractItems: (response) => {
    if (!response || !response.success || !response.data) {
      return [];
    }
    return response.data.items;
  },
  getItemKey: item => item.roundNumber,
  getItemPriority: item => getStatusPriority(item.status as 'pending' | 'streaming' | 'failed' | 'complete'),
  queryHook: useThreadPreSearchesQuery,
  storeSelector: s => s.preSearches,
  storeSetter: s => s.setPreSearches,
  transformItems: transformPreSearches,
  useStoreHook: useChatStore,
});

export function getPreSearchOrchestrator(options: OrchestratorOptions): OrchestratorReturn {
  return preSearchOrchestrator(options);
}
