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

import { useChatStore } from '@/components/providers/chat-store-provider';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { useMemoizedReturn } from '@/lib/utils/memo-utils';

import { useFlowController } from './flow-controller';

export type UseOverviewActionsReturn = {
  /** Handle suggestion click - sets input, mode, and participants */
  handleSuggestionClick: (prompt: string, mode: ChatModeId, participants: ParticipantConfig[]) => void;
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
  // Store actions
  const showInitialUI = useChatStore(s => s.showInitialUI);
  const setInputValue = useChatStore(s => s.setInputValue);
  const setSelectedMode = useChatStore(s => s.setSelectedMode);
  const setSelectedParticipants = useChatStore(s => s.setSelectedParticipants);

  // Delegate flow control to centralized controller
  useFlowController({ enabled: !showInitialUI });

  /**
   * Handle suggestion click from quick start
   * Sets form state (input, mode, participants)
   */
  const handleSuggestionClick = useCallback((
    prompt: string,
    mode: ChatModeId,
    participants: ParticipantConfig[],
  ) => {
    setInputValue(prompt);
    setSelectedMode(mode);
    setSelectedParticipants(participants);
  }, [setInputValue, setSelectedMode, setSelectedParticipants]);

  return useMemoizedReturn({
    handleSuggestionClick,
  }, [handleSuggestionClick]);
}
