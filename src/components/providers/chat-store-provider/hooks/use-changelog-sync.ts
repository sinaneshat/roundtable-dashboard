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
import type { ChatStoreApi } from '@/stores/chat';
import type { ChangelogListCache } from '@/stores/chat/actions/types';
import { validateChangelogListCache } from '@/stores/chat/actions/types';

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

  // Fetch round-specific changelog when waiting
  const shouldFetch = isWaitingForChangelog && configChangeRoundNumber !== null && !!effectiveThreadId;
  const { data: roundChangelogData, isSuccess: roundChangelogSuccess } = useThreadRoundChangelogQuery(
    effectiveThreadId,
    configChangeRoundNumber ?? 0,
    shouldFetch,
  );

  // Merge changelog data into cache when fetched
  useEffect(() => {
    if (!roundChangelogSuccess || !roundChangelogData?.success)
      return;
    if (configChangeRoundNumber === null)
      return;
    // Prevent duplicate merges for the same round
    if (lastMergedRoundRef.current === configChangeRoundNumber)
      return;

    const newItems = roundChangelogData.data.items || [];
    const state = store.getState();

    if (newItems.length === 0) {
      // No new changelog entries, but still clear the waiting flag
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
    state.setIsWaitingForChangelog(false);
    state.setConfigChangeRoundNumber(null);
    lastMergedRoundRef.current = configChangeRoundNumber;
  }, [
    roundChangelogSuccess,
    roundChangelogData,
    configChangeRoundNumber,
    effectiveThreadId,
    queryClientRef,
    store,
  ]);

  // Safety timeout for edge cases where changelog fetch fails or takes too long
  useEffect(() => {
    if (!isWaitingForChangelog)
      return undefined;

    const timeout = setTimeout(() => {
      const state = store.getState();
      state.setIsWaitingForChangelog(false);
      state.setConfigChangeRoundNumber(null);
    }, 30000); // 30 second timeout

    return () => clearTimeout(timeout);
  }, [isWaitingForChangelog, store]);
}
