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
import * as z from 'zod';

import type { TransitionResult } from './actions';
import { actions, noTransition } from './actions';
import type { RoundContext } from './context';
import * as guards from './guards';

// ============================================================================
// EVENT PAYLOAD SCHEMAS AND TYPE GUARDS
// ============================================================================

/**
 * ✅ ZOD SCHEMAS: Type-safe payload validation
 * Replaces runtime type casts with proper validation
 */
const StartRoundPayloadSchema = z.object({
  roundNumber: z.number().int().nonnegative(),
});

// Note: Schema used only for type inference (RESUME_ROUND uses ctx.resumption, not payload)
const _ResumeRoundPayloadSchema = z.object({}).strict();

const ParticipantCompletePayloadSchema = z.object({
  messageId: z.string(),
  participantIndex: z.number().int().nonnegative(),
});

const ParticipantStartPayloadSchema = z.object({
  participantIndex: z.number().int().nonnegative(),
});

const ErrorPayloadSchema = z.object({
  error: z.instanceof(Error),
});

// ============================================================================
// TYPE GUARDS
// ============================================================================

function isStartRoundPayload(payload: unknown): payload is StartRoundPayload {
  return StartRoundPayloadSchema.safeParse(payload).success;
}

function isParticipantCompletePayload(payload: unknown): payload is ParticipantCompletePayload {
  return ParticipantCompletePayloadSchema.safeParse(payload).success;
}

function isParticipantStartPayload(payload: unknown): payload is ParticipantStartPayload {
  return ParticipantStartPayloadSchema.safeParse(payload).success;
}

function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return ErrorPayloadSchema.safeParse(payload).success;
}

// ============================================================================
// EVENT PAYLOAD TYPES (inferred from schemas)
// ============================================================================

export type StartRoundPayload = z.infer<typeof StartRoundPayloadSchema>;
export type ResumeRoundPayload = z.infer<typeof _ResumeRoundPayloadSchema>;
export type ParticipantCompletePayload = z.infer<typeof ParticipantCompletePayloadSchema>;
export type ParticipantStartPayload = z.infer<typeof ParticipantStartPayloadSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

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

      // ✅ ZOD VALIDATION: Use type guard instead of cast
      const roundNumber = isStartRoundPayload(payload) ? payload.roundNumber : (ctx.roundNumber ?? 0);

      // Decide whether to run pre-search
      if (guards.shouldRunPreSearch(ctx)) {
        return {
          actions: [actions.createPreSearch(roundNumber)],
          nextState: RoundFlowStates.PRE_SEARCH_PENDING,
        };
      }

      // Skip pre-search, go directly to participants
      return {
        actions: [
          actions.skipPreSearch(),
          actions.startParticipant(0, false),
        ],
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
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
            actions: [actions.resumePreSearch(preSearchStreamId, roundNumber)],
            nextState: RoundFlowStates.PRE_SEARCH_STREAMING,
          };
        }
        // Pre-search stream expired, create new one
        return {
          actions: [actions.createPreSearch(roundNumber)],
          nextState: RoundFlowStates.PRE_SEARCH_PENDING,
        };
      }

      if (guards.isResumingFromParticipants(ctx)) {
        const participantIndex = ctx.resumption.participantIndex ?? 0;
        return {
          actions: [
            actions.setParticipantIndex(participantIndex),
            actions.startParticipant(participantIndex, true),
          ],
          nextState: RoundFlowStates.PARTICIPANT_STREAMING,
        };
      }

      if (guards.isResumingFromModerator(ctx)) {
        const moderatorStreamId = ctx.resumption.moderatorStreamId;
        if (moderatorStreamId) {
          return {
            actions: [actions.resumeModerator(moderatorStreamId, roundNumber)],
            nextState: RoundFlowStates.MODERATOR_STREAMING,
          };
        }
        // Moderator stream expired, trigger fresh
        return {
          actions: [actions.startModerator(roundNumber)],
          nextState: RoundFlowStates.MODERATOR_PENDING,
        };
      }

      // Round is complete, nothing to resume
      if (guards.isRoundComplete(ctx)) {
        return {
          actions: [actions.completeRound(roundNumber)],
          nextState: RoundFlowStates.COMPLETE,
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
        actions: [],
        nextState: RoundFlowStates.PRE_SEARCH_STREAMING,
      };

    case 'PRE_SEARCH_SKIP':
      return {
        actions: [
          actions.skipPreSearch(),
          actions.startParticipant(0, false),
        ],
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
      };

    case 'ABORT':
    case 'RESET':
      return {
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
        actions: [actions.startParticipant(0, false)],
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
      };

    case 'PRE_SEARCH_ERROR': {
      // ✅ ZOD VALIDATION: Use type guard instead of cast
      const error = isErrorPayload(payload) ? payload.error : new Error('Pre-search failed');
      return {
        actions: [actions.setError(error, 'pre_search')],
        nextState: RoundFlowStates.ERROR,
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
      // ✅ ZOD VALIDATION: Use type guard instead of cast
      const currentIndex = isParticipantCompletePayload(payload) ? payload.participantIndex : ctx.currentParticipantIndex;
      const roundNumber = ctx.roundNumber ?? 0;

      // Check if there are more participants
      if (guards.hasNextParticipant(ctx)) {
        return {
          actions: [actions.advanceToNextParticipant(currentIndex)],
          nextState: RoundFlowStates.PARTICIPANT_TRANSITION,
        };
      }

      // All participants done, move to moderator
      return {
        actions: [actions.startModerator(roundNumber)],
        nextState: RoundFlowStates.MODERATOR_PENDING,
      };
    }

    case 'PARTICIPANT_ERROR': {
      // ✅ ZOD VALIDATION: Use type guard instead of cast
      const error = isErrorPayload(payload) ? payload.error : new Error('Participant streaming failed');
      return {
        actions: [actions.setError(error, 'participant')],
        nextState: RoundFlowStates.ERROR,
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
      // ✅ ZOD VALIDATION: Use type guard instead of cast
      const nextIndex = isParticipantStartPayload(payload) ? payload.participantIndex : (ctx.currentParticipantIndex + 1);

      if (!guards.isValidParticipantIndex(ctx, nextIndex)) {
        // Invalid index, go to moderator
        return {
          actions: [actions.startModerator(ctx.roundNumber ?? 0)],
          nextState: RoundFlowStates.MODERATOR_PENDING,
        };
      }

      return {
        actions: [
          actions.setParticipantIndex(nextIndex),
          actions.startParticipant(nextIndex, false),
        ],
        nextState: RoundFlowStates.PARTICIPANT_STREAMING,
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
        actions: [],
        nextState: RoundFlowStates.MODERATOR_STREAMING,
      };

    case 'ABORT':
    case 'RESET':
      return {
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
        actions: [
          actions.completeRound(roundNumber),
          actions.notifyCompletion(roundNumber),
        ],
        nextState: RoundFlowStates.COMPLETE,
      };
    }

    case 'MODERATOR_ERROR': {
      // ✅ ZOD VALIDATION: Use type guard instead of cast
      const error = isErrorPayload(payload) ? payload.error : new Error('Moderator streaming failed');
      return {
        actions: [actions.setError(error, 'moderator')],
        nextState: RoundFlowStates.ERROR,
      };
    }

    case 'ABORT':
    case 'RESET':
      return {
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
        actions: [actions.resetFlow()],
        nextState: RoundFlowStates.IDLE,
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
  if (state === RoundFlowStates.IDLE) {
    return 'idle';
  }
  if (isPreSearchPhase(state)) {
    return 'pre_search';
  }
  if (isParticipantPhase(state)) {
    return 'participants';
  }
  if (isModeratorPhase(state)) {
    return 'moderator';
  }
  if (state === RoundFlowStates.COMPLETE) {
    return 'complete';
  }
  return 'idle'; // ERROR state maps to idle for phase purposes
}
