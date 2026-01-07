'use client';

/**
 * Changelog Sync Hook
 *
 * Handles fetching and merging changelog entries when config changes occur between rounds.
 * Works for both overview and thread screens.
 *
 * Flow:
 * 1. User makes config changes (participants, mode, web search)
 * 2. handleUpdateThreadAndSend sets isWaitingForChangelog=true, configChangeRoundNumber=N
 * 3. This hook detects the change and fetches round-specific changelog
 * 4. On success, merges into changelog cache and clears waiting flags
 * 5. Streaming trigger can then proceed (it waits for isWaitingForChangelog=false)
 */

import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { useThreadRoundChangelogQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/data/query-keys';
import type { ChangelogListCache, ChatStoreApi } from '@/stores/chat';
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
  // Subscribe to changelog-related state
  const isWaitingForChangelog = useStore(store, s => s.isWaitingForChangelog);
  const configChangeRoundNumber = useStore(store, s => s.configChangeRoundNumber);

  // Track last merged round to prevent duplicate merges
  const lastMergedRoundRef = useRef<number | null>(null);
  // Track last thread ID to reset ref when thread changes
  const lastThreadIdRef = useRef<string | null>(null);

  // Reset lastMergedRoundRef when thread changes to avoid stale state
  if (effectiveThreadId !== lastThreadIdRef.current) {
    lastMergedRoundRef.current = null;
    lastThreadIdRef.current = effectiveThreadId;
  }

  // Fetch round-specific changelog when waiting
  const shouldFetch = isWaitingForChangelog && configChangeRoundNumber !== null && !!effectiveThreadId;

  // Log only when fetching
  if (shouldFetch) {
    rlog.trigger('changelog-fetch', `r${configChangeRoundNumber}`);
  }

  const { data: roundChangelogData, isSuccess: roundChangelogSuccess, isFetching: roundChangelogFetching } = useThreadRoundChangelogQuery(
    effectiveThreadId,
    configChangeRoundNumber ?? 0,
    shouldFetch,
  );

  // Merge changelog data into cache when fetched
  // ✅ BUG FIX: Must wait for BOTH flags - configChangeRoundNumber is set BEFORE PATCH,
  // isWaitingForChangelog is set AFTER PATCH. Without this check, the query can complete
  // and clear flags before post-patch sets isWaitingForChangelog, causing a race condition.
  useEffect(() => {
    // ✅ ROOT CAUSE FIX: Don't process while fetching - prevents stale data race conditions
    // When configChangeRoundNumber changes (e.g., 1→2), React may run this effect BEFORE
    // TanStack Query has updated its state. isFetching=true means new data is being loaded.
    if (roundChangelogFetching) {
      return;
    }
    if (!roundChangelogSuccess || !roundChangelogData?.success) {
      return;
    }
    if (configChangeRoundNumber === null || !isWaitingForChangelog)
      return;
    // Prevent duplicate merges for the same round
    if (lastMergedRoundRef.current === configChangeRoundNumber) {
      const state = store.getState();
      if (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) {
        state.setIsWaitingForChangelog(false);
        state.setConfigChangeRoundNumber(null);
      }
      return;
    }

    const newItems = roundChangelogData.data.items || [];

    // ✅ BUG FIX: Ensure data is for the correct round before merging
    // When configChangeRoundNumber changes (e.g., from 1 to 2), the effect runs immediately
    // but roundChangelogData may still contain STALE data from the previous round
    // because TanStack Query hasn't completed the new fetch yet.
    // Guard: Only merge when ALL items are for the requested round.
    const allItemsForCorrectRound = newItems.length > 0 && newItems.every(item => item.roundNumber === configChangeRoundNumber);
    if (!allItemsForCorrectRound && newItems.length > 0) {
      // Data is stale from previous round, wait for correct data
      rlog.trigger('changelog-stale', `r${configChangeRoundNumber} got r${newItems[0]?.roundNumber} data, waiting...`);
      return;
    }

    const state = store.getState();

    if (newItems.length === 0) {
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);
      lastMergedRoundRef.current = configChangeRoundNumber;
      return;
    }

    // Merge new entries into existing changelog cache
    queryClientRef.current.setQueryData<ChangelogListCache>(
      queryKeys.threads.changelog(effectiveThreadId),
      (old) => {
        const existingCache = validateChangelogListCache(old);

        // If no existing cache, create new response with the items
        if (!existingCache || !existingCache.data) {
          return {
            success: true,
            data: { items: newItems },
          };
        }

        const existingItems = existingCache.data.items;
        const existingIds = new Set(existingItems.map(item => item.id));

        // Only add items that don't already exist (prevent duplicates)
        const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));

        // 🔍 LOG: Track actual merge
        rlog.trigger('changelog-merge', `r${configChangeRoundNumber} new=${uniqueNewItems.length}/${newItems.length} existing=${existingItems.length}`);

        return {
          ...existingCache,
          data: {
            // Add new items at the beginning (newest first) - changelog is ordered by createdAt DESC
            items: [...uniqueNewItems, ...existingItems],
          },
        };
      },
    );

    // Clear flags after successful merge
    rlog.trigger('changelog-done', `r${configChangeRoundNumber} ${newItems.length} items`);
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);
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

  // Safety timeout for edge cases where changelog fetch fails or takes too long
  useEffect(() => {
    if (!isWaitingForChangelog)
      return undefined;

    const timeout = setTimeout(() => {
      const state = store.getState();
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);
    }, 30000);

    return () => clearTimeout(timeout);
  }, [isWaitingForChangelog, store]);

  // ✅ BUG FIX: Handle inconsistent state where isWaitingForChangelog=true but configChangeRoundNumber=null
  // This can happen due to race conditions between multiple hooks or initializeThread calls.
  // When this occurs, the changelog fetch condition (shouldFetch) will never be true,
  // so isWaitingForChangelog will never be cleared, blocking streaming forever.
  // This effect detects the inconsistency and clears isWaitingForChangelog immediately.
  useEffect(() => {
    if (isWaitingForChangelog && configChangeRoundNumber === null) {
      const state = store.getState();
      state.setIsWaitingForChangelog(false);
    }
  }, [isWaitingForChangelog, configChangeRoundNumber, store]);
}
