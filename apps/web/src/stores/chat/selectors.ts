/**
 * Chat Store Selectors - Derived State from FSM
 *
 * These selectors replace explicit boolean flags with derived state from the FSM.
 * This ensures a single source of truth (the flowState) and prevents flag inconsistencies.
 *
 * ✅ PATTERN: Derive don't duplicate - compute state from FSM, don't store separately
 * ✅ PERFORMANCE: Selectors are memoizable and compute-efficient
 * ✅ TYPE-SAFE: Full TypeScript inference from store types
 *
 * @example
 * ```ts
 * import { selectors } from '@/stores/chat/selectors';
 *
 * // In a component with useShallow
 * const { isStreaming, isModeratorStreaming } = useChatStore(
 *   useShallow((s) => ({
 *     isStreaming: selectors.isStreaming(s),
 *     isModeratorStreaming: selectors.isModeratorStreaming(s),
 *   }))
 * );
 * ```
 */

import { RoundFlowStates } from '@roundtable/shared';

import type { ChatStore } from './store-schemas';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Minimal store state needed for selectors */
type StoreState = Pick<ChatStore, 'flowState' | 'flowParticipantIndex' | 'flowParticipantCount' | 'flowRoundNumber'>;

// ============================================================================
// STREAMING STATE SELECTORS
// ============================================================================

/**
 * Check if any streaming is active (pre-search, participant, or moderator)
 */
export function isStreaming(state: StoreState): boolean {
  return (
    state.flowState === RoundFlowStates.PRE_SEARCH_STREAMING
    || state.flowState === RoundFlowStates.PARTICIPANT_STREAMING
    || state.flowState === RoundFlowStates.MODERATOR_STREAMING
  );
}

/**
 * Check if moderator is currently streaming
 */
export function isModeratorStreaming(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.MODERATOR_STREAMING;
}

/**
 * Check if pre-search is currently streaming
 */
export function isPreSearchStreaming(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.PRE_SEARCH_STREAMING;
}

/**
 * Check if participant is currently streaming
 */
export function isParticipantStreaming(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.PARTICIPANT_STREAMING;
}

// ============================================================================
// WAITING STATE SELECTORS
// ============================================================================

/**
 * Check if waiting for any streaming to start
 * Replaces: waitingToStartStreaming flag
 */
export function isWaitingToStart(state: StoreState): boolean {
  return (
    state.flowState === RoundFlowStates.PRE_SEARCH_PENDING
    || state.flowState === RoundFlowStates.MODERATOR_PENDING
    || state.flowState === RoundFlowStates.PARTICIPANT_TRANSITION
  );
}

/**
 * Check if round is in progress (not idle and not complete)
 */
export function isRoundInProgress(state: StoreState): boolean {
  return (
    state.flowState !== RoundFlowStates.IDLE
    && state.flowState !== RoundFlowStates.COMPLETE
    && state.flowState !== RoundFlowStates.ERROR
  );
}

// ============================================================================
// PHASE SELECTORS
// ============================================================================

/**
 * Check if in pre-search phase (pending or streaming)
 */
export function isInPreSearchPhase(state: StoreState): boolean {
  return (
    state.flowState === RoundFlowStates.PRE_SEARCH_PENDING
    || state.flowState === RoundFlowStates.PRE_SEARCH_STREAMING
  );
}

/**
 * Check if in participant phase (streaming or transition)
 */
export function isInParticipantPhase(state: StoreState): boolean {
  return (
    state.flowState === RoundFlowStates.PARTICIPANT_STREAMING
    || state.flowState === RoundFlowStates.PARTICIPANT_TRANSITION
  );
}

/**
 * Check if in moderator phase (pending or streaming)
 */
export function isInModeratorPhase(state: StoreState): boolean {
  return (
    state.flowState === RoundFlowStates.MODERATOR_PENDING
    || state.flowState === RoundFlowStates.MODERATOR_STREAMING
  );
}

// ============================================================================
// COMPLETION SELECTORS
// ============================================================================

/**
 * Check if round completed successfully
 */
export function isRoundComplete(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.COMPLETE;
}

/**
 * Check if round is in error state
 */
export function isRoundError(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.ERROR;
}

/**
 * Check if round is in a terminal state (complete or error)
 */
export function isTerminal(state: StoreState): boolean {
  return (
    state.flowState === RoundFlowStates.COMPLETE
    || state.flowState === RoundFlowStates.ERROR
  );
}

// ============================================================================
// IDLE SELECTORS
// ============================================================================

/**
 * Check if FSM is idle (no round in progress)
 */
export function isIdle(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.IDLE;
}

/**
 * Check if can start a new round (idle state)
 */
export function canStartNewRound(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.IDLE;
}

// ============================================================================
// PARTICIPANT PROGRESS SELECTORS
// ============================================================================

/**
 * Get current participant index (0-based)
 */
export function getCurrentParticipantIndex(state: StoreState): number {
  return state.flowParticipantIndex;
}

/**
 * Get total participant count for current round
 */
export function getParticipantCount(state: StoreState): number {
  return state.flowParticipantCount;
}

/**
 * Check if there are more participants to stream
 */
export function hasMoreParticipants(state: StoreState): boolean {
  return state.flowParticipantIndex + 1 < state.flowParticipantCount;
}

/**
 * Get participant progress as fraction (0-1)
 */
export function getParticipantProgress(state: StoreState): number {
  if (state.flowParticipantCount === 0) {
    return 0;
  }
  return (state.flowParticipantIndex + 1) / state.flowParticipantCount;
}

// ============================================================================
// ROUND SELECTORS
// ============================================================================

/**
 * Get current round number (null if no round active)
 */
export function getCurrentRoundNumber(state: StoreState): number | null {
  return state.flowRoundNumber;
}

/**
 * Check if a specific round is active
 */
export function isRoundActive(state: StoreState, roundNumber: number): boolean {
  return state.flowRoundNumber === roundNumber && isRoundInProgress(state);
}

// ============================================================================
// TRANSITION SELECTORS
// ============================================================================

/**
 * Check if in participant transition state (P0→P1 handoff)
 * Replaces: participantHandoffInProgress flag
 */
export function isInParticipantTransition(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.PARTICIPANT_TRANSITION;
}

/**
 * Check if waiting for pre-search to start
 */
export function isWaitingForPreSearch(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.PRE_SEARCH_PENDING;
}

/**
 * Check if waiting for moderator to start
 */
export function isWaitingForModerator(state: StoreState): boolean {
  return state.flowState === RoundFlowStates.MODERATOR_PENDING;
}

// ============================================================================
// COMPOSITE SELECTORS
// ============================================================================

/**
 * Get human-readable flow state description
 */
export function getFlowStateDescription(state: StoreState): string {
  switch (state.flowState) {
    case RoundFlowStates.IDLE:
      return 'Ready';
    case RoundFlowStates.PRE_SEARCH_PENDING:
      return 'Preparing web search...';
    case RoundFlowStates.PRE_SEARCH_STREAMING:
      return 'Searching the web...';
    case RoundFlowStates.PARTICIPANT_STREAMING:
      return `Participant ${state.flowParticipantIndex + 1} of ${state.flowParticipantCount} responding...`;
    case RoundFlowStates.PARTICIPANT_TRANSITION:
      return 'Switching to next participant...';
    case RoundFlowStates.MODERATOR_PENDING:
      return 'Preparing summary...';
    case RoundFlowStates.MODERATOR_STREAMING:
      return 'Generating summary...';
    case RoundFlowStates.COMPLETE:
      return 'Round complete';
    case RoundFlowStates.ERROR:
      return 'Error occurred';
    default:
      return 'Unknown state';
  }
}

/**
 * Get overall round phase for UI display
 */
export function getRoundPhase(state: StoreState): 'idle' | 'pre_search' | 'participants' | 'moderator' | 'complete' | 'error' {
  switch (state.flowState) {
    case RoundFlowStates.IDLE:
      return 'idle';
    case RoundFlowStates.PRE_SEARCH_PENDING:
    case RoundFlowStates.PRE_SEARCH_STREAMING:
      return 'pre_search';
    case RoundFlowStates.PARTICIPANT_STREAMING:
    case RoundFlowStates.PARTICIPANT_TRANSITION:
      return 'participants';
    case RoundFlowStates.MODERATOR_PENDING:
    case RoundFlowStates.MODERATOR_STREAMING:
      return 'moderator';
    case RoundFlowStates.COMPLETE:
      return 'complete';
    case RoundFlowStates.ERROR:
      return 'error';
    default:
      return 'idle';
  }
}

// ============================================================================
// NAMESPACE EXPORT
// ============================================================================

/**
 * All selectors exported as a namespace for convenient access
 */
export const selectors = {
  canStartNewRound,
  // Participant progress
  getCurrentParticipantIndex,
  // Round
  getCurrentRoundNumber,
  // Composite
  getFlowStateDescription,

  getParticipantCount,
  getParticipantProgress,

  getRoundPhase,
  hasMoreParticipants,
  // Idle
  isIdle,

  isInModeratorPhase,
  isInParticipantPhase,
  // Transitions
  isInParticipantTransition,

  // Phases
  isInPreSearchPhase,
  isModeratorStreaming,

  isParticipantStreaming,
  isPreSearchStreaming,
  isRoundActive,
  // Completion
  isRoundComplete,

  isRoundError,
  isRoundInProgress,

  // Streaming
  isStreaming,
  isTerminal,
  isWaitingForModerator,

  isWaitingForPreSearch,
  // Waiting
  isWaitingToStart,
} as const;
