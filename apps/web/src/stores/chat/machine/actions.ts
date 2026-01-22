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
 */
export type UpdateStoreAction = {
  type: 'UPDATE_STORE';
  updates: Record<string, unknown>;
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
  createPreSearch: (roundNumber: number): CreatePreSearchAction => ({
    type: 'CREATE_PRE_SEARCH',
    roundNumber,
  }),

  resumePreSearch: (streamId: string, roundNumber: number): ResumePreSearchAction => ({
    type: 'RESUME_PRE_SEARCH',
    streamId,
    roundNumber,
  }),

  skipPreSearch: (): SkipPreSearchAction => ({
    type: 'SKIP_PRE_SEARCH',
  }),

  startParticipant: (index: number, isResumption = false): StartParticipantAction => ({
    type: 'START_PARTICIPANT',
    index,
    isResumption,
  }),

  setParticipantIndex: (index: number): SetParticipantIndexAction => ({
    type: 'SET_PARTICIPANT_INDEX',
    index,
  }),

  advanceToNextParticipant: (currentIndex: number): AdvanceToNextParticipantAction => ({
    type: 'ADVANCE_TO_NEXT_PARTICIPANT',
    currentIndex,
  }),

  startModerator: (roundNumber: number): StartModeratorAction => ({
    type: 'START_MODERATOR',
    roundNumber,
  }),

  resumeModerator: (streamId: string, roundNumber: number): ResumeModeratorAction => ({
    type: 'RESUME_MODERATOR',
    streamId,
    roundNumber,
  }),

  completeRound: (roundNumber: number): CompleteRoundAction => ({
    type: 'COMPLETE_ROUND',
    roundNumber,
  }),

  setError: (error: Error, phase: 'pre_search' | 'participant' | 'moderator'): SetErrorAction => ({
    type: 'SET_ERROR',
    error,
    phase,
  }),

  resetFlow: (): ResetFlowAction => ({
    type: 'RESET_FLOW',
  }),

  updateStore: (updates: Record<string, unknown>): UpdateStoreAction => ({
    type: 'UPDATE_STORE',
    updates,
  }),

  clearTracking: (trackingType: 'pre_search' | 'moderator' | 'all'): ClearTrackingAction => ({
    type: 'CLEAR_TRACKING',
    trackingType,
  }),

  notifyCompletion: (roundNumber: number): NotifyCompletionAction => ({
    type: 'NOTIFY_COMPLETION',
    roundNumber,
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
  return { nextState: currentState, actions: [] };
}
