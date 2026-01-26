/**
 * Thread Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for thread screen
 * Consolidates thread-specific logic (participant sync)
 *
 * ✅ NOTE: Changelog sync is handled by useChangelogSync in ChatStoreProvider
 * Do NOT add changelog logic here - it would cause duplicate processing
 *
 * Location: /src/stores/chat/actions/thread-actions.ts
 * Used by: ChatThreadScreen
 */

import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { getEnabledSortedParticipants, useMemoizedReturn } from '@/lib/utils';

import type { UseConfigChangeHandlersReturn } from '../hooks';
import { useConfigChangeHandlers } from '../hooks';

export type UseThreadActionsOptions = {
  /** Thread slug for query invalidation */
  slug: string;
  /** Whether round is currently in progress (streaming or creating moderator) */
  isRoundInProgress: boolean;
};

/**
 * Hook for managing thread screen actions
 *
 * Consolidates:
 * - Participant sync from context to form state
 * - Mode/participant change handlers with config tracking (via useConfigChangeHandlers)
 *
 * ✅ IMPORTANT: Changelog sync is handled ONLY by useChangelogSync in ChatStoreProvider
 * Do NOT add changelog logic here - it would cause duplicate processing and race conditions
 *
 * @example
 * const threadActions = useThreadActions({
 *   slug,
 *   isRoundInProgress,
 * })
 *
 * <ChatModeSelector onModeChange={threadActions.handleModeChange} />
 */
export function useThreadActions(options: UseThreadActionsOptions): UseConfigChangeHandlersReturn {
  const { isRoundInProgress, slug } = options;

  // ✅ REFACTORED: Use shared hook for config change handlers
  const configHandlers = useConfigChangeHandlers({ isRoundInProgress, slug });

  // Flags - batch with useShallow
  const { contextParticipants, hasPendingConfigChanges } = useChatStore(useShallow(s => ({
    contextParticipants: s.participants,
    hasPendingConfigChanges: s.hasPendingConfigChanges,
  })));

  // Actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setSelectedParticipants: s.setSelectedParticipants,
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
    if (isRoundInProgress || hasPendingConfigChanges) {
      return;
    }

    // ✅ FIX: Detect new participants by checking if id === modelId (not persisted yet)
    const hasNewParticipants = contextParticipants.some(p => p.id === p.modelId);
    if (hasNewParticipants) {
      return;
    }

    // Use participant comparison utility (with ID for context tracking)
    const enabledParticipants = getEnabledSortedParticipants(contextParticipants);
    const contextKey = enabledParticipants.map(p => `${p.id}:${p.modelId}:${p.priority}`).join('|');

    if (contextKey === lastSyncedContextRef.current) {
      return;
    }

    lastSyncedContextRef.current = contextKey;
    actions.setSelectedParticipants(enabledParticipants.map((p, index) => ({
      customRoleId: p.customRoleId || undefined,
      id: p.id,
      modelId: p.modelId,
      priority: index,
      role: p.role,
    })));
  }, [contextParticipants, isRoundInProgress, hasPendingConfigChanges, actions]);

  return useMemoizedReturn(configHandlers, [configHandlers]);
}
