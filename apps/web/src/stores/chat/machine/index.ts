/**
 * FSM Machine - Round Flow Orchestration
 *
 * Finite State Machine infrastructure for managing chat round lifecycle.
 * Replaces reactive effect chains with explicit state transitions.
 *
 * ✅ EXPLICIT: Every state and transition is clearly defined
 * ✅ TESTABLE: Pure functions are easy to unit test
 * ✅ PREDICTABLE: No race conditions - state determines behavior
 *
 * @example
 * ```ts
 * import { transition, buildContext, guards, RoundFlowStates } from '@/stores/chat/machine';
 *
 * // Build context from current state
 * const ctx = buildContext(storeSnapshot, aiSdkSnapshot);
 *
 * // Check guards before transition
 * if (guards.canStartRound(ctx)) {
 *   const result = transition(currentState, 'START_ROUND', ctx);
 *   // Apply result.nextState and execute result.actions
 * }
 * ```
 */

// Actions
export {
  actions,
  type AdvanceToNextParticipantAction,
  type ClearTrackingAction,
  type CompleteRoundAction,
  // Individual action types for type narrowing
  type CreatePreSearchAction,
  type NotifyCompletionAction,
  noTransition,
  type ResetFlowAction,
  type ResumeModeratorAction,
  type ResumePreSearchAction,
  type RoundFlowAction,
  type SetErrorAction,
  type SetParticipantIndexAction,
  type SkipPreSearchAction,
  type StartModeratorAction,
  type StartParticipantAction,
  type TransitionResult,
  type UpdateStoreAction,
} from './actions';

// Context
export {
  type AiSdkSnapshot,
  buildContext,
  createEmptyContext,
  type ModeratorInfo,
  type ParticipantInfo,
  type PreSearchInfo,
  type ResumptionInfo,
  type RoundContext,
  type StoreSnapshot,
} from './context';

// Guards
export {
  allParticipantsComplete,
  canResumeModerator,
  canResumePreSearch,
  canStartRound,
  canTriggerModerator,
  getEffectiveThreadId,
  guards,
  hasError,
  hasModeratorMessage,
  hasNextParticipant,
  hasResumptionParticipant,
  hasResumptionState,
  hasThread,
  isAiSdkReady,
  isAiSdkStreaming,
  isNewThread,
  isParticipantStreaming,
  isPreSearchComplete,
  isPreSearchFailed,
  isPreSearchInProgress,
  isResumingFromModerator,
  isResumingFromParticipants,
  isResumingFromPreSearch,
  isRoundComplete,
  isRoundFullyComplete,
  isValidParticipantIndex,
  participantHasMessage,
  shouldProceedToParticipants,
  // Individual guard functions
  shouldRunPreSearch,
} from './guards';

// Transitions
export {
  type ErrorPayload,
  type EventPayload,
  getPhaseFromState,
  isModeratorPhase,
  isParticipantPhase,
  isPreSearchPhase,
  isStreamingState,
  isTerminalState,
  type ParticipantCompletePayload,
  type ParticipantStartPayload,
  type ResumeRoundPayload,
  type StartRoundPayload,
  transition,
} from './transitions';
