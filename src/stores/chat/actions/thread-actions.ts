/**
 * Thread Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for thread screen
 * Consolidates thread-specific logic (participant sync, changelog management)
 * Uses TanStack Query for data fetching - no setTimeout/timing patterns
 *
 * Location: /src/stores/chat/actions/thread-actions.ts
 * Used by: ChatThreadScreen
 */

'use client';

import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers';
import { getEnabledSortedParticipants, useMemoizedReturn } from '@/lib/utils';

import type { UseConfigChangeHandlersReturn } from '../hooks';
import { useConfigChangeHandlers } from '../hooks';

export type UseThreadActionsOptions = {
  /** Thread slug for query invalidation */
  slug: string;
  /** Whether round is currently in progress (streaming or creating moderator) */
  isRoundInProgress: boolean;
  /** Whether changelog is currently being fetched */
  isChangelogFetching: boolean;
};

/**
 * Hook for managing thread screen actions
 *
 * Consolidates:
 * - Participant sync from context to form state
 * - Changelog wait flag management (clears when fetch completes)
 * - Mode/participant change handlers with config tracking (via useConfigChangeHandlers)
 *
 * Uses TanStack Query for data fetching - no setTimeout/timing patterns
 *
 * @example
 * const threadActions = useThreadActions({
 *   slug,
 *   isRoundInProgress,
 *   isChangelogFetching,
 * })
 *
 * <ChatModeSelector onModeChange={threadActions.handleModeChange} />
 */
export function useThreadActions(options: UseThreadActionsOptions): UseConfigChangeHandlersReturn {
  const { slug, isRoundInProgress, isChangelogFetching } = options;

  // ✅ REFACTORED: Use shared hook for config change handlers
  const configHandlers = useConfigChangeHandlers({ slug, isRoundInProgress });

  // Batch related state selectors with useShallow for performance
  const contextParticipants = useChatStore(s => s.participants);

  // Flags - batch with useShallow
  const { hasPendingConfigChanges, isWaitingForChangelog } = useChatStore(useShallow(s => ({
    hasPendingConfigChanges: s.hasPendingConfigChanges,
    isWaitingForChangelog: s.isWaitingForChangelog,
  })));

  // Actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setSelectedParticipants: s.setSelectedParticipants,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
  })));

  // Use local ref for tracking synced participants
  const lastSyncedContextRef = useRef<string>('');

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

  /**
   * Clear changelog waiting flag when changelog fetch completes
   * Uses TanStack Query status for proper async coordination
   */
  useEffect(() => {
    // Clear immediately if not fetching
    if (isWaitingForChangelog && !isChangelogFetching) {
      actions.setIsWaitingForChangelog(false);
      return undefined;
    }

    // Safety timeout for edge cases
    if (isWaitingForChangelog) {
      const timeout = setTimeout(() => actions.setIsWaitingForChangelog(false), 30000);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [isWaitingForChangelog, isChangelogFetching, actions]);

  return useMemoizedReturn(configHandlers, [configHandlers]);
}
