/**
 * Incomplete Round Resumption Hook
 *
 * SIMPLIFIED VERSION: Backend is source of truth for round execution state.
 * Frontend READS state from backend prefill, does NOT calculate or trigger anything.
 *
 * **ARCHITECTURE**:
 * - Backend's round_execution table tracks: status, participantsCompleted, etc.
 * - Server prefills this state via ThreadStreamResumptionState
 * - Frontend subscribes and displays - NO orchestration
 *
 * This hook previously contained ~1600 lines of orchestration logic that:
 * - Calculated next participant index
 * - Decided when to trigger moderator
 * - Detected stale state and cleaned up
 *
 * All that logic is now in:
 * - apps/api/src/services/streaming/background-stream-execution.service.ts
 * - apps/api/src/workers/round-orchestration-queue.ts
 */

import type { RoundPhase } from '@roundtable/shared';
import { use } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { ChatStoreContext } from '@/components/providers/chat-store-provider';

export type UseIncompleteRoundResumptionOptions = {
  /**
   * Thread ID to check for incomplete rounds
   */
  threadId: string;

  /**
   * Enable/disable the hook (no-op now since backend handles everything)
   */
  enabled?: boolean;
};

export type UseIncompleteRoundResumptionReturn = {
  /** Whether round is incomplete - from backend prefill */
  isIncomplete: boolean;
  /** Next participant index - from backend prefill (null = backend decides) */
  nextParticipantIndex: number | null;
  /** Round number being resumed - from backend prefill */
  resumingRoundNumber: number | null;
  /** Current phase - from backend prefill */
  currentResumptionPhase: RoundPhase | null;
};

/**
 * Hook to read round resumption state from backend prefill.
 *
 * **NO ORCHESTRATION**: This hook does NOT:
 * - Calculate which participant is next (backend does this)
 * - Trigger participant/moderator streams (backend queue does this)
 * - Detect stale state (backend cron/recovery does this)
 *
 * It ONLY reads prefilled state from the store (which comes from server).
 */
export function useIncompleteRoundResumption(
  options: UseIncompleteRoundResumptionOptions,
): UseIncompleteRoundResumptionReturn {
  const { enabled = true, threadId } = options;

  // Get store for reading prefilled state
  const store = use(ChatStoreContext);

  if (!store) {
    throw new Error('useIncompleteRoundResumption must be used within ChatStoreProvider');
  }

  // Read ONLY the prefilled state from backend - no calculation
  const {
    currentResumptionPhase,
    nextParticipantToTrigger,
    resumptionRoundNumber,
    streamResumptionPrefilled,
  } = useStore(store, useShallow(s => ({
    currentResumptionPhase: s.currentResumptionPhase,
    nextParticipantToTrigger: s.nextParticipantToTrigger,
    resumptionRoundNumber: s.resumptionRoundNumber,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
  })));

  // If disabled or no thread, return empty state
  if (!enabled || !threadId) {
    return {
      currentResumptionPhase: null,
      isIncomplete: false,
      nextParticipantIndex: null,
      resumingRoundNumber: null,
    };
  }

  // Return state from backend prefill - NO calculation, NO triggering
  // Backend determines if round is incomplete via round_execution table
  const isIncomplete = streamResumptionPrefilled && resumptionRoundNumber !== null;

  // Extract participant index from nextParticipantToTrigger (can be number or object with index)
  const getParticipantIndex = (): number | null => {
    if (!streamResumptionPrefilled || nextParticipantToTrigger === null) {
      return null;
    }
    if (typeof nextParticipantToTrigger === 'number') {
      return nextParticipantToTrigger;
    }
    return nextParticipantToTrigger.index;
  };

  return {
    currentResumptionPhase: streamResumptionPrefilled ? currentResumptionPhase : null,
    isIncomplete,
    nextParticipantIndex: getParticipantIndex(),
    resumingRoundNumber: isIncomplete ? resumptionRoundNumber : null,
  };
}
