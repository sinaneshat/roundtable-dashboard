/**
 * Thread Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for thread screen
 * Consolidates thread-specific logic (participant sync, config changes)
 *
 * SIMPLIFIED ARCHITECTURE: Backend is the conductor.
 * - No setTimeout-based logic
 * - No flow orchestration
 * - Simple store updates only
 *
 * Location: /src/stores/chat/actions/thread-actions.ts
 * Used by: ChatThreadScreen
 */

import type { ChatMode } from '@roundtable/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import type { ParticipantConfig } from '@/lib/schemas';
import { getEnabledSortedParticipants, useMemoizedReturn } from '@/lib/utils';

export type UseThreadActionsOptions = {
  /** Thread slug for query invalidation */
  slug: string;
  /** Whether round is currently in progress (streaming or creating moderator) */
  isRoundInProgress: boolean;
};

/**
 * Return type for useThreadActions hook
 * Simplified interface - backend handles flow orchestration
 */
export type UseThreadActionsReturn = {
  /** Handle mode changes (council, debate, etc.) */
  handleModeChange: (mode: ChatMode) => void;
  /** Handle participant list changes */
  handleParticipantsChange: (participants: ParticipantConfig[]) => void;
  /** Handle web search toggle */
  handleWebSearchToggle: (enabled: boolean) => void;
};

/**
 * Hook for managing thread screen actions
 *
 * Consolidates:
 * - Participant sync from context to form state
 * - Mode/participant change handlers
 * - Web search toggle
 *
 * SIMPLIFIED: No flow orchestration - backend is the conductor
 *
 * @example
 * const threadActions = useThreadActions({
 *   slug,
 *   isRoundInProgress,
 * })
 *
 * <ChatModeSelector onModeChange={threadActions.handleModeChange} />
 */
export function useThreadActions(options: UseThreadActionsOptions): UseThreadActionsReturn {
  const { isRoundInProgress } = options;

  // Context state
  const contextParticipants = useChatStore(s => s.participants);

  // Actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setEnableWebSearch: s.setEnableWebSearch,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
  })));

  // Use local ref for tracking synced participants
  const lastSyncedContextRef = useRef<string>('');

  /**
   * Handle mode change
   * Simply updates the store - backend handles actual mode application
   */
  const handleModeChange = useCallback((mode: ChatMode) => {
    actions.setSelectedMode(mode);
  }, [actions]);

  /**
   * Handle participants change
   * Simply updates the store - backend handles actual participant application
   */
  const handleParticipantsChange = useCallback((participants: ParticipantConfig[]) => {
    actions.setSelectedParticipants(participants);
  }, [actions]);

  /**
   * Handle web search toggle
   * Simply updates the store - backend handles actual setting application
   */
  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    actions.setEnableWebSearch(enabled);
  }, [actions]);

  /**
   * Sync local participants with context when round is not in progress
   * Allows users to modify participants and have changes staged until next message
   */
  useEffect(() => {
    if (contextParticipants.length === 0) {
      return;
    }
    if (isRoundInProgress) {
      return;
    }

    // Detect new participants by checking if id === modelId (not persisted yet)
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
  }, [contextParticipants, isRoundInProgress, actions]);

  return useMemoizedReturn({
    handleModeChange,
    handleParticipantsChange,
    handleWebSearchToggle,
  }, [handleModeChange, handleParticipantsChange, handleWebSearchToggle]);
}
