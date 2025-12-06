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

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
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
  const { slug, isRoundInProgress } = options;

  const queryClient = useQueryClient();

  // Store actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
    setEnableWebSearch: s.setEnableWebSearch,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
  })));

  /**
   * Generic factory for creating config change handlers
   * Exposed for custom handlers beyond the built-in ones
   */
  const createConfigChangeHandler = useCallback(<TValue>(
    setter: (value: TValue) => void,
  ) => {
    return (value: TValue) => {
      if (isRoundInProgress)
        return;
      setter(value);
      actions.setHasPendingConfigChanges(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.bySlug(slug) });
    };
  }, [isRoundInProgress, actions, queryClient, slug]);

  /** Handle mode change */
  const handleModeChange = useMemo(
    () => createConfigChangeHandler(actions.setSelectedMode),
    [createConfigChangeHandler, actions],
  );

  /** Handle participants change */
  const handleParticipantsChange = useMemo(
    () => createConfigChangeHandler(actions.setSelectedParticipants),
    [createConfigChangeHandler, actions],
  );

  /** Handle web search toggle */
  const handleWebSearchToggle = useMemo(
    () => createConfigChangeHandler(actions.setEnableWebSearch),
    [createConfigChangeHandler, actions],
  );

  // Memoize return object
  return useMemo(() => ({
    handleModeChange,
    handleParticipantsChange,
    handleWebSearchToggle,
    createConfigChangeHandler,
  }), [
    handleModeChange,
    handleParticipantsChange,
    handleWebSearchToggle,
    createConfigChangeHandler,
  ]);
}
