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

import type { ChatMode } from '@roundtable/shared';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { useMemoizedReturn } from '@/lib/utils';

import { useFlowController } from './flow-controller';

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
 * - Flow control delegation (via useFlowController)
 *
 * @example
 * const overviewActions = useOverviewActions()
 *
 * <ChatQuickStart onSuggestionClick={overviewActions.handleSuggestionClick} />
 */
export function useOverviewActions(options: UseOverviewActionsOptions = {}): UseOverviewActionsReturn {
  const { projectId } = options;
  // Batch state and action selectors with useShallow for stable reference
  const { showInitialUI, ...actions } = useChatStore(useShallow(s => ({
    setAutoMode: s.setAutoMode,
    setInputValue: s.setInputValue,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
    showInitialUI: s.showInitialUI,
  })));

  // Delegate flow control to centralized controller
  useFlowController({ enabled: !showInitialUI, projectId });

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
