/**
 * Thread Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for thread screen
 * Consolidates thread-specific logic (participant sync, changelog management)
 * Uses TanStack Query for data fetching - no setTimeout/timing patterns
 *
 * ✅ INCREMENTAL CHANGELOG: Uses round-specific changelog fetch for efficiency
 * When config changes mid-conversation, only fetches that round's changelog
 * and merges into the existing cache instead of full refetch.
 *
 * Location: /src/stores/chat/actions/thread-actions.ts
 * Used by: ChatThreadScreen
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers';
import { useThreadRoundChangelogQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/data/query-keys';
import { getEnabledSortedParticipants, useMemoizedReturn } from '@/lib/utils';

import type { UseConfigChangeHandlersReturn } from '../hooks';
import { useConfigChangeHandlers } from '../hooks';
import type { ChangelogListCache } from './types';
import { validateChangelogListCache } from './types';

export type UseThreadActionsOptions = {
  /** Thread slug for query invalidation */
  slug: string;
  /** Thread ID for changelog queries */
  threadId: string;
  /** Whether round is currently in progress (streaming or creating moderator) */
  isRoundInProgress: boolean;
};

/**
 * Hook for managing thread screen actions
 *
 * Consolidates:
 * - Participant sync from context to form state
 * - Incremental changelog fetch on config changes (round-specific)
 * - Mode/participant change handlers with config tracking (via useConfigChangeHandlers)
 *
 * ✅ INCREMENTAL CHANGELOG: When config changes mid-conversation:
 * 1. Store sets isWaitingForChangelog=true and configChangeRoundNumber=N
 * 2. This hook uses useThreadRoundChangelogQuery to fetch ONLY that round's entries
 * 3. On success, merges data into the main changelog cache
 * 4. Clears flags after merge
 *
 * This is MUCH more efficient than invalidating the full changelog.
 *
 * @example
 * const threadActions = useThreadActions({
 *   slug,
 *   threadId,
 *   isRoundInProgress,
 * })
 *
 * <ChatModeSelector onModeChange={threadActions.handleModeChange} />
 */
export function useThreadActions(options: UseThreadActionsOptions): UseConfigChangeHandlersReturn {
  const { slug, threadId, isRoundInProgress } = options;
  const queryClient = useQueryClient();

  // ✅ REFACTORED: Use shared hook for config change handlers
  const configHandlers = useConfigChangeHandlers({ slug, isRoundInProgress });

  // Flags - batch with useShallow (includes contextParticipants and configChangeRoundNumber for incremental changelog)
  const { contextParticipants, hasPendingConfigChanges, isWaitingForChangelog, configChangeRoundNumber } = useChatStore(useShallow(s => ({
    contextParticipants: s.participants,
    hasPendingConfigChanges: s.hasPendingConfigChanges,
    isWaitingForChangelog: s.isWaitingForChangelog,
    configChangeRoundNumber: s.configChangeRoundNumber,
  })));

  // Actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setSelectedParticipants: s.setSelectedParticipants,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setConfigChangeRoundNumber: s.setConfigChangeRoundNumber,
  })));

  // Use local ref for tracking synced participants
  const lastSyncedContextRef = useRef<string>('');
  const lastMergedRoundRef = useRef<number | null>(null);

  /**
   * Sync local participants with context when no pending changes
   * Allows users to modify participants and have changes staged until next message
   */
  useEffect(() => {
    if (contextParticipants.length === 0)
      return;
    if (isRoundInProgress || hasPendingConfigChanges)
      return;

    // ✅ FIX: Detect new participants by checking if id === modelId (not persisted yet)
    const hasNewParticipants = contextParticipants.some(p => p.id === p.modelId);
    if (hasNewParticipants)
      return;

    // Use participant comparison utility (with ID for context tracking)
    const enabledParticipants = getEnabledSortedParticipants(contextParticipants);
    const contextKey = enabledParticipants.map(p => `${p.id}:${p.modelId}:${p.priority}`).join('|');

    if (contextKey === lastSyncedContextRef.current)
      return;

    lastSyncedContextRef.current = contextKey;
    actions.setSelectedParticipants(enabledParticipants.map((p, index) => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      customRoleId: p.customRoleId || undefined,
      priority: index,
    })));
  }, [contextParticipants, isRoundInProgress, hasPendingConfigChanges, actions]);

  // ✅ INCREMENTAL CHANGELOG: Fetch round-specific changelog when config changes
  const shouldFetchRoundChangelog = isWaitingForChangelog && configChangeRoundNumber !== null && !!threadId;
  const { data: roundChangelogData, isSuccess: roundChangelogSuccess } = useThreadRoundChangelogQuery(
    threadId,
    configChangeRoundNumber ?? 0,
    shouldFetchRoundChangelog,
  );

  /**
   * Merge round-specific changelog into main changelog cache
   * This is more efficient than invalidating and refetching the entire changelog
   */
  useEffect(() => {
    if (!roundChangelogSuccess || !roundChangelogData?.success)
      return;
    if (configChangeRoundNumber === null)
      return;
    // Prevent duplicate merges for the same round
    if (lastMergedRoundRef.current === configChangeRoundNumber)
      return;

    const newItems = roundChangelogData.data.items || [];
    if (newItems.length === 0) {
      // No new changelog entries, but still clear the waiting flag
      actions.setIsWaitingForChangelog(false);
      actions.setConfigChangeRoundNumber(null);
      lastMergedRoundRef.current = configChangeRoundNumber;
      return;
    }

    // Merge new entries into existing changelog cache
    queryClient.setQueryData<ChangelogListCache>(
      queryKeys.threads.changelog(threadId),
      (old) => {
        // ✅ TYPE-SAFE: Use validation instead of force typecasting
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
    actions.setIsWaitingForChangelog(false);
    actions.setConfigChangeRoundNumber(null);
    lastMergedRoundRef.current = configChangeRoundNumber;
  }, [
    roundChangelogSuccess,
    roundChangelogData,
    configChangeRoundNumber,
    threadId,
    queryClient,
    actions,
  ]);

  /**
   * Safety timeout for edge cases where round changelog fetch fails or takes too long
   */
  useEffect(() => {
    if (!isWaitingForChangelog)
      return undefined;

    const timeout = setTimeout(() => {
      actions.setIsWaitingForChangelog(false);
      actions.setConfigChangeRoundNumber(null);
    }, 30000);

    return () => clearTimeout(timeout);
  }, [isWaitingForChangelog, actions]);

  return useMemoizedReturn(configHandlers, [configHandlers]);
}
