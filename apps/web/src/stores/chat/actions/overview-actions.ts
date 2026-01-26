/**
 * Overview Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for overview screen
 * Handles suggestion clicks
 *
 * Flow control is now handled by the backend (conductor architecture).
 *
 * Location: /src/stores/chat/actions/overview-actions.ts
 * Used by: ChatOverviewScreen
 */

import type { ChatMode } from '@roundtable/shared';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { useMemoizedReturn } from '@/lib/utils';

export type UseOverviewActionsOptions = {
  /** Project ID for project-scoped threads (updates URL to /chat/projects/{projectId}/{slug}) */
  projectId?: string;
};

export type UseOverviewActionsReturn = {
  /** Handle suggestion click - sets input, mode, and participants */
  handleSuggestionClick: (prompt: string, mode: ChatMode, participants: ParticipantConfig[]) => void;
};

/**
 * Hook for managing overview screen actions
 *
 * Consolidates:
 * - Suggestion click handling
 *
 * @example
 * const overviewActions = useOverviewActions()
 *
 * <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
 */
export function useOverviewActions(_options: UseOverviewActionsOptions = {}): UseOverviewActionsReturn {
  // Batch state and action selectors with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setAutoMode: s.setAutoMode,
    setInputValue: s.setInputValue,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
  })));

  /**
   * Handle suggestion click from quick start
   * Sets form state (input, mode, participants) and switches to manual mode
   * since the configuration is already predefined by the suggestion
   */
  const handleSuggestionClick = useCallback((
    prompt: string,
    mode: ChatMode,
    participants: ParticipantConfig[],
  ) => {
    actions.setAutoMode(false); // Switch to manual - suggestion has predefined config
    actions.setInputValue(prompt);
    actions.setSelectedMode(mode);
    actions.setSelectedParticipants(participants);
  }, [actions]);

  return useMemoizedReturn({
    handleSuggestionClick,
  }, [handleSuggestionClick]);
}
