/**
 * Overview Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for overview screen
 * Handles suggestion clicks and delegates flow control
 *
 * Navigation logic moved to flow-controller.ts (centralized)
 * Streaming trigger moved to store subscription (store.ts)
 *
 * Location: /src/stores/chat/actions/overview-actions.ts
 * Used by: ChatOverviewScreen
 */

'use client';

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { useChatStore } from '@/components/providers';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { useMemoizedReturn } from '@/lib/utils';

import { useFlowController } from './flow-controller';

export type UseOverviewActionsReturn = {
  /** Handle suggestion click - sets input, mode, and participants */
  handleSuggestionClick: (prompt: string, mode: ChatMode, participants: ParticipantConfig[]) => void;
};

/**
 * Hook for managing overview screen actions
 *
 * Consolidates:
 * - Suggestion click handling
 * - Flow control delegation (via useFlowController)
 *
 * @example
 * const overviewActions = useOverviewActions()
 *
 * <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
 */
export function useOverviewActions(): UseOverviewActionsReturn {
  // Batch state and action selectors with useShallow for stable reference
  const { showInitialUI, ...actions } = useChatStore(useShallow(s => ({
    showInitialUI: s.showInitialUI,
    setInputValue: s.setInputValue,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
  })));

  // Delegate flow control to centralized controller
  useFlowController({ enabled: !showInitialUI });

  /**
   * Handle suggestion click from quick start
   * Sets form state (input, mode, participants)
   */
  const handleSuggestionClick = useCallback((
    prompt: string,
    mode: ChatMode,
    participants: ParticipantConfig[],
  ) => {
    actions.setInputValue(prompt);
    actions.setSelectedMode(mode);
    actions.setSelectedParticipants(participants);
  }, [actions]);

  return useMemoizedReturn({
    handleSuggestionClick,
  }, [handleSuggestionClick]);
}
