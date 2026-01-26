/**
 * useConfigChangeHandlers - Factory hook for config change handling
 *
 * Extracts the common pattern from thread-actions.ts where config changes
 * need to: guard check → set state → mark pending → invalidate queries.
 *
 * PATTERN: Factory for creating consistent config change handlers
 * USE CASES:
 * - Mode changes on thread screen
 * - Participant changes on thread screen
 * - Web search toggle on thread screen
 *
 * @example
 * // Before (verbose):
 * const handleModeChange = useCallback((mode) => {
 *   if (isRoundInProgress) return;
 *   setSelectedMode(mode);
 *   setHasPendingConfigChanges(true);
 *   queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
 * }, [isRoundInProgress, ...deps]);
 *
 * // After (concise):
 * const { handleModeChange } = useConfigChangeHandlers({
 *   slug,
 *   isRoundInProgress,
 * });
 *
 * Location: /src/stores/chat/hooks/use-config-change-handlers.ts
 */

import type { ChatMode } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { queryKeys } from '@/lib/data/query-keys';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

export type UseConfigChangeHandlersOptions = {
  /** Thread slug for query invalidation */
  slug: string;
  /** Whether a round is currently in progress (blocks changes) */
  isRoundInProgress: boolean;
};

export type UseConfigChangeHandlersReturn = {
  /** Handle chat mode change */
  handleModeChange: (mode: ChatMode) => void;
  /** Handle participants change */
  handleParticipantsChange: (participants: ParticipantConfig[]) => void;
  /** Handle web search toggle */
  handleWebSearchToggle: (enabled: boolean) => void;
  /** Generic factory for creating additional config change handlers */
  createConfigChangeHandler: <TValue>(setter: (value: TValue) => void) => (value: TValue) => void;
};

/**
 * Hook providing config change handlers with consistent behavior
 *
 * All handlers follow the pattern:
 * 1. Guard check (skip if round in progress)
 * 2. Update store state
 * 3. Mark config as changed
 * 4. Invalidate relevant queries
 *
 * @param options - Configuration for the handlers
 * @returns Object with config change handlers
 *
 * @example
 * const { handleModeChange, handleParticipantsChange, handleWebSearchToggle } =
 *   useConfigChangeHandlers({ slug, isRoundInProgress });
 *
 * // Use in components
 * <ChatModeSelector onModeChange={handleModeChange} />
 */
export function useConfigChangeHandlers(
  options: UseConfigChangeHandlersOptions,
): UseConfigChangeHandlersReturn {
  const { isRoundInProgress, slug } = options;

  const queryClient = useQueryClient();

  // Store actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setEnableWebSearch: s.setEnableWebSearch,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
  })));

  // ✅ REACT 19: Simplified memoization - each handler uses useCallback directly
  // Previous pattern had 5 layers of memoization (useCallback → useMemo × 3 → useMemo)
  // Now: 4 useCallbacks with same dependencies, plain object return

  /** Handle mode change */
  const handleModeChange = useCallback((mode: ChatMode) => {
    if (isRoundInProgress) {
      return;
    }
    actions.setSelectedMode(mode);
    actions.setHasPendingConfigChanges(true);
    queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
  }, [isRoundInProgress, actions, queryClient, slug]);

  /** Handle participants change */
  const handleParticipantsChange = useCallback((participants: ParticipantConfig[]) => {
    if (isRoundInProgress) {
      return;
    }
    actions.setSelectedParticipants(participants);
    actions.setHasPendingConfigChanges(true);
    queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
  }, [isRoundInProgress, actions, queryClient, slug]);

  /** Handle web search toggle */
  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    if (isRoundInProgress) {
      return;
    }
    actions.setEnableWebSearch(enabled);
    actions.setHasPendingConfigChanges(true);
    queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
  }, [isRoundInProgress, actions, queryClient, slug]);

  /**
   * Generic factory for creating additional config change handlers
   * Exposed for custom handlers beyond the built-in ones
   */
  const createConfigChangeHandler = useCallback(<TValue>(
    setter: (value: TValue) => void,
  ) => {
    return (value: TValue) => {
      if (isRoundInProgress) {
        return;
      }
      setter(value);
      actions.setHasPendingConfigChanges(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
    };
  }, [isRoundInProgress, actions, queryClient, slug]);

  // ✅ REACT 19: Plain object return - handlers are already memoized via useCallback
  return {
    createConfigChangeHandler,
    handleModeChange,
    handleParticipantsChange,
    handleWebSearchToggle,
  };
}
