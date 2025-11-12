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

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { useMemoizedReturn } from '@/lib/utils/memo-utils';

export type UseThreadActionsOptions = {
  /** Thread slug for query invalidation */
  slug: string;
  /** Whether round is currently in progress (streaming or creating analysis) */
  isRoundInProgress: boolean;
  /** Whether changelog is currently being fetched */
  isChangelogFetching: boolean;
};

export type UseThreadActionsReturn = {
  /** Handle mode change with config change tracking */
  handleModeChange: (mode: ChatModeId) => void;
  /** Handle participants change with config change tracking */
  handleParticipantsChange: (participants: ParticipantConfig[]) => void;
  /** Handle web search toggle with config change tracking */
  handleWebSearchToggle: (enabled: boolean) => void;
};

/**
 * Hook for managing thread screen actions
 *
 * Consolidates:
 * - Participant sync from context to form state
 * - Changelog wait flag management (clears when fetch completes)
 * - Mode/participant change handlers with config tracking
 * - Query invalidation for proper data updates
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
export function useThreadActions(options: UseThreadActionsOptions): UseThreadActionsReturn {
  const { slug, isRoundInProgress, isChangelogFetching } = options;

  // Query client for invalidation
  const queryClient = useQueryClient();

  // Batch related state selectors with useShallow for performance
  const contextParticipants = useChatStore(s => s.participants);

  // Flags - batch with useShallow
  const flags = useChatStore(useShallow(s => ({
    hasPendingConfigChanges: s.hasPendingConfigChanges,
    isWaitingForChangelog: s.isWaitingForChangelog,
  })));

  // Actions - batch with useShallow
  const actions = useChatStore(useShallow(s => ({
    setSelectedParticipants: s.setSelectedParticipants,
    setSelectedMode: s.setSelectedMode,
    setEnableWebSearch: s.setEnableWebSearch,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
  })));

  // Use local ref for tracking synced participants
  const lastSyncedContextRef = useRef<string>('');

  /**
   * Sync local participants with context when no pending changes
   * Allows users to modify participants and have changes staged until next message
   */
  useEffect(() => {
    if (contextParticipants.length === 0) {
      return;
    }

    if (isRoundInProgress || flags.hasPendingConfigChanges) {
      return;
    }

    const hasTemporaryIds = contextParticipants.some(p => p.id.startsWith('participant-'));
    if (hasTemporaryIds) {
      return;
    }

    // Use participant comparison utility (with ID for context tracking)
    const contextKey = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map(p => `${p.id}:${p.modelId}:${p.priority}`)
      .join('|');

    if (contextKey === lastSyncedContextRef.current) {
      return;
    }

    const syncedParticipants: ParticipantConfig[] = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        priority: index,
      }));

    lastSyncedContextRef.current = contextKey;
    actions.setSelectedParticipants(syncedParticipants);
  }, [contextParticipants, isRoundInProgress, flags.hasPendingConfigChanges, actions]);

  /**
   * Clear changelog waiting flag when changelog fetch completes
   * Uses TanStack Query status for proper async coordination
   *
   * ✅ SAFETY NET: Auto-timeout after 30s to prevent permanent blocking
   * Primary path relies on React Query completion, timeout is last resort
   * If timeout triggers frequently, indicates changelog query issues
   */
  useEffect(() => {
    // PRIMARY PATH: Clear waiting flag when changelog fetch completes
    if (flags.isWaitingForChangelog && !isChangelogFetching) {
      actions.setIsWaitingForChangelog(false);
      return undefined;
    }

    // SAFETY NET: Auto-release after 30s if changelog query hangs
    // This should rarely trigger - React Query has its own timeout handling
    // If this triggers frequently, indicates changelog query or network issues
    if (flags.isWaitingForChangelog) {
      const SAFETY_TIMEOUT_MS = 30000; // 30 seconds (increased from 10s)
      const timeout = setTimeout(() => {
        console.warn('[Changelog] Waiting flag stuck for >30s, auto-releasing. This indicates a query hang.');
        actions.setIsWaitingForChangelog(false);
      }, SAFETY_TIMEOUT_MS);

      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [flags.isWaitingForChangelog, isChangelogFetching, actions]);

  /**
   * Factory for creating config change handlers with consistent behavior
   * All handlers: guard check → state update → mark pending → invalidate queries
   */
  const createConfigChangeHandler = useCallback(<TValue>(
    stateSetter: (value: TValue) => void,
  ) => {
    return (value: TValue) => {
      if (isRoundInProgress)
        return;
      stateSetter(value);
      actions.setHasPendingConfigChanges(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
    };
  }, [isRoundInProgress, actions, queryClient, slug]);

  /** Handle mode change with config change tracking */
  const handleModeChange = useCallback(
    createConfigChangeHandler(actions.setSelectedMode),
    [createConfigChangeHandler, actions.setSelectedMode],
  );

  /** Handle participants change with config change tracking */
  const handleParticipantsChange = useCallback(
    createConfigChangeHandler(actions.setSelectedParticipants),
    [createConfigChangeHandler, actions.setSelectedParticipants],
  );

  /** Handle web search toggle with config change tracking */
  const handleWebSearchToggle = useCallback(
    createConfigChangeHandler(actions.setEnableWebSearch),
    [createConfigChangeHandler, actions.setEnableWebSearch],
  );

  return useMemoizedReturn({
    handleModeChange,
    handleParticipantsChange,
    handleWebSearchToggle,
  }, [handleModeChange, handleParticipantsChange, handleWebSearchToggle]);
}
