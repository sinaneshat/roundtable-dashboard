/**
 * Changelog Sync Hook - V2
 *
 * Fetches changelog when flow is in awaiting_changelog state.
 * Dispatches CHANGELOG_RECEIVED event when complete.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { useThreadRoundChangelogQuery } from '@/hooks/queries/chat/changelog';
import type { ChatStoreApi, FlowState } from '@/stores/chat-v2';

type UseChangelogSyncParams = {
  store: ChatStoreApi;
  effectiveThreadId: string;
};

/**
 * Sync changelog when awaiting_changelog state is entered
 */
export function useChangelogSync({
  store,
  effectiveThreadId,
}: UseChangelogSyncParams): void {
  // Subscribe to flow state reactively
  const flow = useSyncExternalStore(
    store.subscribe,
    () => store.getState().flow,
    () => ({ type: 'idle' }) as FlowState,
  );

  const shouldFetch = flow.type === 'awaiting_changelog';
  const round = flow.type === 'awaiting_changelog' ? flow.round : 0;

  const { data, isSuccess } = useThreadRoundChangelogQuery(
    effectiveThreadId,
    round,
    shouldFetch,
  );

  useEffect(() => {
    if (isSuccess && data?.success && flow.type === 'awaiting_changelog') {
      // Set changelog in store
      store.getState().setChangelog(data.data?.items ?? []);
      // Dispatch event to proceed with flow
      store.getState().dispatch({ type: 'CHANGELOG_RECEIVED' });
    }
  }, [isSuccess, data, flow, store]);
}
