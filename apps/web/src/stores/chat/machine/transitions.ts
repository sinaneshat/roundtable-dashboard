/**
 * FSM Transitions - Pure state machine transition logic
 *
 * This module implements the finite state machine for round orchestration.
 * All transitions are pure functions that take (state, event, context) and return
 * the next state plus any actions to execute.
 *
 * ✅ PATTERN: Pure functions - no side effects, fully testable
 * ✅ EXPLICIT: Every valid transition is defined, invalid transitions are no-ops
 * ✅ DETERMINISTIC: Same inputs always produce same outputs
 *
 * State Machine:
 *
 * IDLE
 *   ├── START_ROUND → [webSearch?] PRE_SEARCH_PENDING : PARTICIPANT_STREAMING
 *   └── RESUME_ROUND → [restore from server phase]
 *
 * PRE_SEARCH_PENDING
 *   ├── PRE_SEARCH_START → PRE_SEARCH_STREAMING
 *   └── PRE_SEARCH_SKIP → PARTICIPANT_STREAMING
 *
 * PRE_SEARCH_STREAMING
 *   ├── PRE_SEARCH_COMPLETE → PARTICIPANT_STREAMING
 *   └── PRE_SEARCH_ERROR → ERROR
 *
 * PARTICIPANT_STREAMING
 *   ├── PARTICIPANT_COMPLETE → [hasNext?] PARTICIPANT_TRANSITION : MODERATOR_PENDING
 *   └── PARTICIPANT_ERROR → ERROR
 *
 * PARTICIPANT_TRANSITION
 *   └── PARTICIPANT_START → PARTICIPANT_STREAMING
 *
 * MODERATOR_PENDING
 *   └── MODERATOR_START → MODERATOR_STREAMING
 *
 * MODERATOR_STREAMING
 *   ├── MODERATOR_COMPLETE → COMPLETE
 *   └── MODERATOR_ERROR → ERROR
 *
 * COMPLETE | ERROR
 *   └── RESET → IDLE
 */

import type { RoundFlowEvent, RoundFlowState } from '@roundtable/shared';
import { RoundFlowStates } from '@roundtable/shared';

import type { TransitionResult } from './actions';
import { actions, noTransition } from './actions';
import type { RoundContext } from './context';
import * as guards from './guards';

// ============================================================================
// EVENT PAYLOAD TYPES
// ============================================================================

export type StartRoundPayload = {
  roundNumber: number;
};

export type ResumeRoundPayload = Record<string, never>;

export type ParticipantCompletePayload = {
  messageId: string;
  participantIndex: number;
};

export type ParticipantStartPayload = {
  participantIndex: number;
};

export type ErrorPayload = {
  error: Error;
};

export type EventPayload
  = | StartRoundPayload
    | ResumeRoundPayload
    | ParticipantCompletePayload
    | ParticipantStartPayload
    | ErrorPayload
    | Record<string, never>; // Empty payload

// ============================================================================
// TRANSITION HANDLERS BY STATE
// ============================================================================

/**
 * Handle transitions from IDLE state
 */
function handleIdleTransitions(event: RoundFlowEvent, ctx: RoundContext, payload?: EventPayload): TransitionResult {
  switch (event) {
    case 'START_ROUND': {
      if (!guards.canStartRound(ctx)) {
        return noTransition(RoundFlowStates.IDLE);
      }

      const roundPayload = payload as StartRoundPayload | undefined;
      const roundNumber = roundPayload?.roundNumber ?? ctx.roundNumber ?? 0;

      // Decide whether to run pre-search
      if (guards.shouldRunPreSearch(ctx)) {
        return {
          nextState: RoundFlowStates.PRE_SEARCH_PENDING,
          actions: [actions.createPreSearch(roundNumber)],
        };
      }

      // Skip pre-search, go directly to participants
      return {
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
        actions: [
          actions.skipPreSearch(),
          actions.startParticipant(0, false),
        ],
      };
    }

    case 'RESUME_ROUND': {
      if (!guards.hasResumptionState(ctx)) {
        return noTransition(RoundFlowStates.IDLE);
      }

      const roundNumber = ctx.resumption.roundNumber ?? 0;

      // Route to appropriate phase based on server state
      if (guards.isResumingFromPreSearch(ctx)) {
        const preSearchStreamId = ctx.resumption.preSearchStreamId;
        if (preSearchStreamId) {
          return {
            nextState: RoundFlowStates.PRE_SEARCH_STREAMING,
            actions: [actions.resumePreSearch(preSearchStreamId, roundNumber)],
          };
        }
        // Pre-search stream expired, create new one
        return {
          nextState: RoundFlowStates.PRE_SEARCH_PENDING,
          actions: [actions.createPreSearch(roundNumber)],
        };
      }

      if (guards.isResumingFromParticipants(ctx)) {
        const participantIndex = ctx.resumption.participantIndex ?? 0;
        return {
          nextState: RoundFlowStates.PARTICIPANT_STREAMING,
          actions: [
            actions.setParticipantIndex(participantIndex),
            actions.startParticipant(participantIndex, true),
          ],
        };
      }

      if (guards.isResumingFromModerator(ctx)) {
        const moderatorStreamId = ctx.resumption.moderatorStreamId;
        if (moderatorStreamId) {
          return {
            nextState: RoundFlowStates.MODERATOR_STREAMING,
            actions: [actions.resumeModerator(moderatorStreamId, roundNumber)],
          };
        }
        // Moderator stream expired, trigger fresh
        return {
          nextState: RoundFlowStates.MODERATOR_PENDING,
          actions: [actions.startModerator(roundNumber)],
        };
      }

      // Round is complete, nothing to resume
      if (guards.isRoundComplete(ctx)) {
        return {
          nextState: RoundFlowStates.COMPLETE,
          actions: [actions.completeRound(roundNumber)],
        };
      }

      return noTransition(RoundFlowStates.IDLE);
    }

    default:
      return noTransition(RoundFlowStates.IDLE);
  }
}

/**
 * Handle transitions from PRE_SEARCH_PENDING state
 */
function handlePreSearchPendingTransitions(event: RoundFlowEvent, _ctx: RoundContext): TransitionResult {
  switch (event) {
    case 'PRE_SEARCH_START':
      return {
        nextState: RoundFlowStates.PRE_SEARCH_STREAMING,
        actions: [],
      };

    case 'PRE_SEARCH_SKIP':
      return {
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
        actions: [
          actions.skipPreSearch(),
          actions.startParticipant(0, false),
        ],
      };

    case 'ABORT':
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.PRE_SEARCH_PENDING);
  }
}

/**
 * Handle transitions from PRE_SEARCH_STREAMING state
 */
function handlePreSearchStreamingTransitions(event: RoundFlowEvent, _ctx: RoundContext, payload?: EventPayload): TransitionResult {
  switch (event) {
    case 'PRE_SEARCH_COMPLETE':
      return {
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
        actions: [actions.startParticipant(0, false)],
      };

    case 'PRE_SEARCH_ERROR': {
      const errorPayload = payload as ErrorPayload | undefined;
      return {
        nextState: RoundFlowStates.ERROR,
        actions: [actions.setError(errorPayload?.error ?? new Error('Pre-search failed'), 'pre_search')],
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.PRE_SEARCH_STREAMING);
  }
}

/**
 * Handle transitions from PARTICIPANT_STREAMING state
 */
function handleParticipantStreamingTransitions(event: RoundFlowEvent, ctx: RoundContext, payload?: EventPayload): TransitionResult {
  switch (event) {
    case 'PARTICIPANT_COMPLETE': {
      const completePayload = payload as ParticipantCompletePayload | undefined;
      const currentIndex = completePayload?.participantIndex ?? ctx.currentParticipantIndex;
      const roundNumber = ctx.roundNumber ?? 0;

      // Check if there are more participants
      if (guards.hasNextParticipant(ctx)) {
        return {
          nextState: RoundFlowStates.PARTICIPANT_TRANSITION,
          actions: [actions.advanceToNextParticipant(currentIndex)],
        };
      }

      // All participants done, move to moderator
      return {
        nextState: RoundFlowStates.MODERATOR_PENDING,
        actions: [actions.startModerator(roundNumber)],
      };
    }

    case 'PARTICIPANT_ERROR': {
      const errorPayload = payload as ErrorPayload | undefined;
      return {
        nextState: RoundFlowStates.ERROR,
        actions: [actions.setError(errorPayload?.error ?? new Error('Participant streaming failed'), 'participant')],
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.PARTICIPANT_STREAMING);
  }
}

/**
 * Handle transitions from PARTICIPANT_TRANSITION state (brief P0→P1 handoff)
 */
function handleParticipantTransitionTransitions(event: RoundFlowEvent, ctx: RoundContext, payload?: EventPayload): TransitionResult {
  switch (event) {
    case 'PARTICIPANT_START': {
      const startPayload = payload as ParticipantStartPayload | undefined;
      const nextIndex = startPayload?.participantIndex ?? ctx.currentParticipantIndex + 1;

      if (!guards.isValidParticipantIndex(ctx, nextIndex)) {
        // Invalid index, go to moderator
        return {
          nextState: RoundFlowStates.MODERATOR_PENDING,
          actions: [actions.startModerator(ctx.roundNumber ?? 0)],
        };
      }

      return {
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
        actions: [
          actions.setParticipantIndex(nextIndex),
          actions.startParticipant(nextIndex, false),
        ],
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.PARTICIPANT_TRANSITION);
  }
}

/**
 * Handle transitions from MODERATOR_PENDING state
 */
function handleModeratorPendingTransitions(event: RoundFlowEvent, _ctx: RoundContext): TransitionResult {
  switch (event) {
    case 'MODERATOR_START':
      return {
        nextState: RoundFlowStates.MODERATOR_STREAMING,
        actions: [],
      };

    case 'ABORT':
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.MODERATOR_PENDING);
  }
}

/**
 * Handle transitions from MODERATOR_STREAMING state
 */
function handleModeratorStreamingTransitions(event: RoundFlowEvent, ctx: RoundContext, payload?: EventPayload): TransitionResult {
  switch (event) {
    case 'MODERATOR_COMPLETE': {
      const roundNumber = ctx.roundNumber ?? 0;
      return {
        nextState: RoundFlowStates.COMPLETE,
        actions: [
          actions.completeRound(roundNumber),
          actions.notifyCompletion(roundNumber),
        ],
      };
    }

    case 'MODERATOR_ERROR': {
      const errorPayload = payload as ErrorPayload | undefined;
      return {
        nextState: RoundFlowStates.ERROR,
        actions: [actions.setError(errorPayload?.error ?? new Error('Moderator streaming failed'), 'moderator')],
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.MODERATOR_STREAMING);
  }
}

/**
 * Handle transitions from COMPLETE state
 */
function handleCompleteTransitions(event: RoundFlowEvent): TransitionResult {
  switch (event) {
    case 'RESET':
    case 'START_ROUND':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.COMPLETE);
  }
}

/**
 * Handle transitions from ERROR state
 */
function handleErrorTransitions(event: RoundFlowEvent): TransitionResult {
  switch (event) {
    case 'RESET':
      return {
        nextState: RoundFlowStates.IDLE,
        actions: [actions.resetFlow()],
      };

    default:
      return noTransition(RoundFlowStates.ERROR);
  }
}

// ============================================================================
// MAIN TRANSITION FUNCTION
// ============================================================================

/**
 * Pure FSM transition function
 *
 * @param state - Current FSM state
 * @param event - Event to process
 * @param ctx - Immutable context snapshot
 * @param payload - Optional event payload
 * @returns TransitionResult with next state and actions to execute
 */
export function transition(
  state: RoundFlowState,
  event: RoundFlowEvent,
  ctx: RoundContext,
  payload?: EventPayload,
): TransitionResult {
  switch (state) {
    case RoundFlowStates.IDLE:
      return handleIdleTransitions(event, ctx, payload);

    case RoundFlowStates.PRE_SEARCH_PENDING:
      return handlePreSearchPendingTransitions(event, ctx);

    case RoundFlowStates.PRE_SEARCH_STREAMING:
      return handlePreSearchStreamingTransitions(event, ctx, payload);

    case RoundFlowStates.PARTICIPANT_STREAMING:
      return handleParticipantStreamingTransitions(event, ctx, payload);

    case RoundFlowStates.PARTICIPANT_TRANSITION:
      return handleParticipantTransitionTransitions(event, ctx, payload);

    case RoundFlowStates.MODERATOR_PENDING:
      return handleModeratorPendingTransitions(event, ctx);

    case RoundFlowStates.MODERATOR_STREAMING:
      return handleModeratorStreamingTransitions(event, ctx, payload);

    case RoundFlowStates.COMPLETE:
      return handleCompleteTransitions(event);

    case RoundFlowStates.ERROR:
      return handleErrorTransitions(event);

    default:
      return noTransition(state);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if state is a streaming state
 */
export function isStreamingState(state: RoundFlowState): boolean {
  return (
    state === RoundFlowStates.PRE_SEARCH_STREAMING
    || state === RoundFlowStates.PARTICIPANT_STREAMING
    || state === RoundFlowStates.MODERATOR_STREAMING
  );
}

/**
 * Check if state is a terminal state (COMPLETE or ERROR)
 */
export function isTerminalState(state: RoundFlowState): boolean {
  return state === RoundFlowStates.COMPLETE || state === RoundFlowStates.ERROR;
}

/**
 * Check if state is in pre-search phase
 */
export function isPreSearchPhase(state: RoundFlowState): boolean {
  return (
    state === RoundFlowStates.PRE_SEARCH_PENDING
    || state === RoundFlowStates.PRE_SEARCH_STREAMING
  );
}

/**
 * Check if state is in participant phase
 */
export function isParticipantPhase(state: RoundFlowState): boolean {
  return (
    state === RoundFlowStates.PARTICIPANT_STREAMING
    || state === RoundFlowStates.PARTICIPANT_TRANSITION
  );
}

/**
 * Check if state is in moderator phase
 */
export function isModeratorPhase(state: RoundFlowState): boolean {
  return (
    state === RoundFlowStates.MODERATOR_PENDING
    || state === RoundFlowStates.MODERATOR_STREAMING
  );
}

/**
 * Get the round phase from FSM state
 */
export function getPhaseFromState(state: RoundFlowState): 'idle' | 'pre_search' | 'participants' | 'moderator' | 'complete' {
  if (state === RoundFlowStates.IDLE)
    return 'idle';
  if (isPreSearchPhase(state))
    return 'pre_search';
  if (isParticipantPhase(state))
    return 'participants';
  if (isModeratorPhase(state))
    return 'moderator';
  if (state === RoundFlowStates.COMPLETE)
    return 'complete';
  return 'idle'; // ERROR state maps to idle for phase purposes
}
