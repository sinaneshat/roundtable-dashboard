/**
 * FSM Actions - Effects triggered by state transitions
 *
 * Actions are side-effect descriptors returned by transitions.
 * The orchestrator hook executes these actions after state updates.
 *
 * ✅ PATTERN: Pure FSM - transitions return action descriptors, not execute them
 * ✅ SEPARATION: Business logic (actions) separate from state transitions
 */

// ============================================================================
// ACTION TYPES (Discriminated Union)
// ============================================================================

/**
 * Pre-search actions
 */
// ============================================================================
// TRANSITION RESULT TYPE
// ============================================================================

import type { RoundFlowState } from '@roundtable/shared';

export type CreatePreSearchAction = {
  type: 'CREATE_PRE_SEARCH';
  roundNumber: number;
};

export type ResumePreSearchAction = {
  type: 'RESUME_PRE_SEARCH';
  streamId: string;
  roundNumber: number;
};

export type SkipPreSearchAction = {
  type: 'SKIP_PRE_SEARCH';
};

/**
 * Participant streaming actions
 */
export type StartParticipantAction = {
  type: 'START_PARTICIPANT';
  index: number;
  isResumption: boolean;
};

export type SetParticipantIndexAction = {
  type: 'SET_PARTICIPANT_INDEX';
  index: number;
};

export type AdvanceToNextParticipantAction = {
  type: 'ADVANCE_TO_NEXT_PARTICIPANT';
  currentIndex: number;
};

/**
 * Moderator actions
 */
export type StartModeratorAction = {
  type: 'START_MODERATOR';
  roundNumber: number;
};

export type ResumeModeratorAction = {
  type: 'RESUME_MODERATOR';
  streamId: string;
  roundNumber: number;
};

/**
 * Round lifecycle actions
 */
export type CompleteRoundAction = {
  type: 'COMPLETE_ROUND';
  roundNumber: number;
};

export type SetErrorAction = {
  type: 'SET_ERROR';
  error: Error;
  phase: 'pre_search' | 'participant' | 'moderator';
};

export type ResetFlowAction = {
  type: 'RESET_FLOW';
};

/**
 * Store update actions
 * NOTE: Currently unused placeholder. Uses Record<string, never> to indicate
 * no updates are currently supported. Add specific update types if needed.
 */
export type UpdateStoreAction = {
  type: 'UPDATE_STORE';
  updates: Record<string, never>;
};

export type ClearTrackingAction = {
  type: 'CLEAR_TRACKING';
  trackingType: 'pre_search' | 'moderator' | 'all';
};

/**
 * Callback actions
 */
export type NotifyCompletionAction = {
  type: 'NOTIFY_COMPLETION';
  roundNumber: number;
};

// ============================================================================
// ACTION UNION TYPE
// ============================================================================

export type RoundFlowAction
  = | CreatePreSearchAction
    | ResumePreSearchAction
    | SkipPreSearchAction
    | StartParticipantAction
    | SetParticipantIndexAction
    | AdvanceToNextParticipantAction
    | StartModeratorAction
    | ResumeModeratorAction
    | CompleteRoundAction
    | SetErrorAction
    | ResetFlowAction
    | UpdateStoreAction
    | ClearTrackingAction
    | NotifyCompletionAction;

// ============================================================================
// ACTION CREATORS (Pure functions)
// ============================================================================

export const actions = {
  advanceToNextParticipant: (currentIndex: number): AdvanceToNextParticipantAction => ({
    currentIndex,
    type: 'ADVANCE_TO_NEXT_PARTICIPANT',
  }),

  clearTracking: (trackingType: 'pre_search' | 'moderator' | 'all'): ClearTrackingAction => ({
    trackingType,
    type: 'CLEAR_TRACKING',
  }),

  completeRound: (roundNumber: number): CompleteRoundAction => ({
    roundNumber,
    type: 'COMPLETE_ROUND',
  }),

  createPreSearch: (roundNumber: number): CreatePreSearchAction => ({
    roundNumber,
    type: 'CREATE_PRE_SEARCH',
  }),

  notifyCompletion: (roundNumber: number): NotifyCompletionAction => ({
    roundNumber,
    type: 'NOTIFY_COMPLETION',
  }),

  resetFlow: (): ResetFlowAction => ({
    type: 'RESET_FLOW',
  }),

  resumeModerator: (streamId: string, roundNumber: number): ResumeModeratorAction => ({
    roundNumber,
    streamId,
    type: 'RESUME_MODERATOR',
  }),

  resumePreSearch: (streamId: string, roundNumber: number): ResumePreSearchAction => ({
    roundNumber,
    streamId,
    type: 'RESUME_PRE_SEARCH',
  }),

  setError: (error: Error, phase: 'pre_search' | 'participant' | 'moderator'): SetErrorAction => ({
    error,
    phase,
    type: 'SET_ERROR',
  }),

  setParticipantIndex: (index: number): SetParticipantIndexAction => ({
    index,
    type: 'SET_PARTICIPANT_INDEX',
  }),

  skipPreSearch: (): SkipPreSearchAction => ({
    type: 'SKIP_PRE_SEARCH',
  }),

  startModerator: (roundNumber: number): StartModeratorAction => ({
    roundNumber,
    type: 'START_MODERATOR',
  }),

  startParticipant: (index: number, isResumption = false): StartParticipantAction => ({
    index,
    isResumption,
    type: 'START_PARTICIPANT',
  }),

  updateStore: (updates: Record<string, never>): UpdateStoreAction => ({
    type: 'UPDATE_STORE',
    updates,
  }),
} as const;

/**
 * Result of an FSM transition - new state + actions to execute
 */
export type TransitionResult = {
  nextState: RoundFlowState;
  actions: RoundFlowAction[];
};

/**
 * No-op transition result - state unchanged, no actions
 */
export function noTransition(currentState: RoundFlowState): TransitionResult {
  return { actions: [], nextState: currentState };
}
