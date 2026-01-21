import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useThreadRoundChangelogQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/data/query-keys';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChangelogItemCache, ChangelogListCache, ChatStoreApi } from '@/stores/chat';
import { validateChangelogListCache } from '@/stores/chat';

type UseChangelogSyncParams = {
  store: ChatStoreApi;
  effectiveThreadId: string;
  queryClientRef: RefObject<QueryClient>;
};

export function useChangelogSync({
  store,
  effectiveThreadId,
  queryClientRef,
}: UseChangelogSyncParams) {
  const { isWaitingForChangelog, configChangeRoundNumber } = useStore(
    store,
    useShallow(s => ({
      isWaitingForChangelog: s.isWaitingForChangelog,
      configChangeRoundNumber: s.configChangeRoundNumber,
    })),
  );

  const lastMergedRoundRef = useRef<number | null>(null);
  const lastThreadIdRef = useRef<string | null>(null);

  if (effectiveThreadId !== lastThreadIdRef.current) {
    lastMergedRoundRef.current = null;
    lastThreadIdRef.current = effectiveThreadId;
  }

  const shouldFetch = isWaitingForChangelog && configChangeRoundNumber !== null && !!effectiveThreadId;

  const { data: roundChangelogData, isSuccess: roundChangelogSuccess, isFetching: roundChangelogFetching } = useThreadRoundChangelogQuery(
    effectiveThreadId,
    configChangeRoundNumber ?? 0,
    shouldFetch,
  );

  useEffect(() => {
    // ✅ EARLY BAIL: Skip entirely when no config change is pending
    // This prevents unnecessary effect runs and logging when configChangeRoundNumber is null
    if (configChangeRoundNumber === null || !isWaitingForChangelog) {
      return;
    }

    rlog.changelog('effect-run', `r${configChangeRoundNumber} fetching=${roundChangelogFetching} success=${roundChangelogSuccess} waiting=${isWaitingForChangelog} shouldFetch=${shouldFetch}`);

    if (roundChangelogFetching) {
      rlog.changelog('skip-fetching', `r${configChangeRoundNumber} still fetching`);
      return;
    }
    if (!roundChangelogSuccess || !roundChangelogData?.success) {
      rlog.changelog('skip-no-data', `r${configChangeRoundNumber} success=${roundChangelogSuccess} dataSuccess=${roundChangelogData?.success}`);
      return;
    }

    if (lastMergedRoundRef.current === configChangeRoundNumber) {
      rlog.changelog('skip-duplicate', `r${configChangeRoundNumber} already merged`);
      const state = store.getState();
      if (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) {
        state.setIsWaitingForChangelog(false);
        state.setConfigChangeRoundNumber(null);
      }
      return;
    }

    // Extract items from successful response
    // Single cast needed: API types are more specific than cache types (e.g., literal union vs string)
    // The data is validated by Zod in the cache merge function anyway
    const newItems: ChangelogItemCache[] = roundChangelogData.success && roundChangelogData.data?.items
      ? (roundChangelogData.data.items as ChangelogItemCache[])
      : [];
    rlog.changelog('items-received', `r${configChangeRoundNumber} count=${newItems.length} ids=[${newItems.map(i => i.id).join(',')}] rounds=[${newItems.map(i => i.roundNumber).join(',')}]`);

    const allItemsForCorrectRound = newItems.length > 0 && newItems.every(item => item.roundNumber === configChangeRoundNumber);
    if (!allItemsForCorrectRound && newItems.length > 0) {
      rlog.changelog('skip-wrong-round', `expected r${configChangeRoundNumber} got rounds=[${newItems.map(i => i.roundNumber).join(',')}]`);
      return;
    }

    const state = store.getState();

    if (newItems.length === 0) {
      rlog.changelog('empty-changelog', `r${configChangeRoundNumber} clearing flags`);
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);
      lastMergedRoundRef.current = configChangeRoundNumber;
      return;
    }

    queryClientRef.current.setQueryData<ChangelogListCache>(
      queryKeys.threads.changelog(effectiveThreadId),
      (old) => {
        const existingCache = validateChangelogListCache(old);

        if (!existingCache || !existingCache.data) {
          rlog.changelog('merge-fresh', `r${configChangeRoundNumber} new=${newItems.length} existing=0`);
          return {
            success: true,
            data: { items: newItems },
          };
        }

        const existingItems = existingCache.data.items;
        const existingIds = new Set(existingItems.map(item => item.id));
        const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));

        rlog.changelog('merge-existing', `r${configChangeRoundNumber} new=${uniqueNewItems.length}/${newItems.length} existing=${existingItems.length}`);

        return {
          ...existingCache,
          data: {
            items: [...uniqueNewItems, ...existingItems],
          },
        };
      },
    );

    rlog.changelog('merge-complete', `r${configChangeRoundNumber} clearing flags`);
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);
    // ✅ FIX: Also clear isPatchInProgress to unblock streaming-trigger
    // Form-actions sets isPatchInProgress=false after PATCH, but due to React batching
    // the streaming-trigger might not see the update before changelog merge completes
    state.setIsPatchInProgress(false);
    lastMergedRoundRef.current = configChangeRoundNumber;
  }, [
    roundChangelogFetching,
    roundChangelogSuccess,
    roundChangelogData,
    configChangeRoundNumber,
    isWaitingForChangelog,
    effectiveThreadId,
    queryClientRef,
    store,
    shouldFetch,
  ]);

  useEffect(() => {
    if (!isWaitingForChangelog)
      return;

    const timeout = setTimeout(() => {
      const state = store.getState();
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);
    }, 30000);

    return () => clearTimeout(timeout);
  }, [isWaitingForChangelog, store]);

  useEffect(() => {
    if (isWaitingForChangelog && configChangeRoundNumber === null) {
      const state = store.getState();
      state.setIsWaitingForChangelog(false);
    }
  }, [isWaitingForChangelog, configChangeRoundNumber, store]);
}
