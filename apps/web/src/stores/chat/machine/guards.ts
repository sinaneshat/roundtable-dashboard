/**
 * FSM Guards - Predicate functions for transition validation
 *
 * Guards are pure functions that determine if a transition is allowed.
 * They receive the current context and return boolean.
 *
 * ✅ PATTERN: Pure predicates - no side effects
 * ✅ TESTABLE: Easy to unit test in isolation
 * ✅ COMPOSABLE: Guards can be combined with && and ||
 */

import { RoundPhases } from '@roundtable/shared';

import type { RoundContext } from './context';

// ============================================================================
// PRE-SEARCH GUARDS
// ============================================================================

/**
 * Check if pre-search should run for this round
 */
export function shouldRunPreSearch(ctx: RoundContext): boolean {
  return ctx.webSearchEnabled;
}

/**
 * Check if pre-search is in progress (streaming or pending)
 */
export function isPreSearchInProgress(ctx: RoundContext): boolean {
  return ctx.preSearch.exists && (ctx.preSearch.status === 'streaming' || ctx.preSearch.status === 'pending');
}

/**
 * Check if pre-search completed successfully
 */
export function isPreSearchComplete(ctx: RoundContext): boolean {
  return ctx.preSearch.exists && ctx.preSearch.status === 'complete';
}

/**
 * Check if pre-search failed
 */
export function isPreSearchFailed(ctx: RoundContext): boolean {
  return ctx.preSearch.exists && ctx.preSearch.status === 'failed';
}

/**
 * Check if pre-search can be resumed (has stream ID)
 */
export function canResumePreSearch(ctx: RoundContext): boolean {
  return ctx.resumption.preSearchStreamId !== null;
}

// ============================================================================
// PARTICIPANT GUARDS
// ============================================================================

/**
 * Check if there are more participants to stream
 */
export function hasNextParticipant(ctx: RoundContext): boolean {
  return ctx.currentParticipantIndex + 1 < ctx.enabledParticipantCount;
}

/**
 * Check if the given participant index is valid
 */
export function isValidParticipantIndex(ctx: RoundContext, index: number): boolean {
  return index >= 0 && index < ctx.enabledParticipantCount;
}

/**
 * Check if all participants have completed
 */
export function allParticipantsComplete(ctx: RoundContext): boolean {
  return ctx.allParticipantsComplete;
}

/**
 * Check if we're resuming from a specific participant
 */
export function hasResumptionParticipant(ctx: RoundContext): boolean {
  return ctx.resumption.participantIndex !== null;
}

/**
 * Check if participant at index has a message
 */
export function participantHasMessage(ctx: RoundContext, index: number): boolean {
  const participant = ctx.participants.find(p => p.index === index);
  return participant?.hasMessage ?? false;
}

/**
 * Check if current participant is streaming (AI SDK active)
 */
export function isParticipantStreaming(ctx: RoundContext): boolean {
  return ctx.isAiSdkStreaming;
}

// ============================================================================
// MODERATOR GUARDS
// ============================================================================

/**
 * Check if moderator can be triggered (all participants done, no moderator yet)
 */
export function canTriggerModerator(ctx: RoundContext): boolean {
  return ctx.allParticipantsComplete && !ctx.moderator.hasMessage;
}

/**
 * Check if moderator message already exists
 */
export function hasModeratorMessage(ctx: RoundContext): boolean {
  return ctx.moderator.hasMessage;
}

/**
 * Check if moderator can be resumed (has stream ID)
 */
export function canResumeModerator(ctx: RoundContext): boolean {
  return ctx.resumption.moderatorStreamId !== null;
}

// ============================================================================
// RESUMPTION GUARDS
// ============================================================================

/**
 * Check if resumption state exists (server prefilled)
 */
export function hasResumptionState(ctx: RoundContext): boolean {
  return ctx.resumption.isPrefilled && ctx.resumption.phase !== null;
}

/**
 * Check if resuming from pre-search phase
 */
export function isResumingFromPreSearch(ctx: RoundContext): boolean {
  return ctx.resumption.phase === RoundPhases.PRE_SEARCH;
}

/**
 * Check if resuming from participants phase
 */
export function isResumingFromParticipants(ctx: RoundContext): boolean {
  return ctx.resumption.phase === RoundPhases.PARTICIPANTS;
}

/**
 * Check if resuming from moderator phase
 */
export function isResumingFromModerator(ctx: RoundContext): boolean {
  return ctx.resumption.phase === RoundPhases.MODERATOR;
}

/**
 * Check if round is already complete (no resumption needed)
 */
export function isRoundComplete(ctx: RoundContext): boolean {
  return ctx.resumption.phase === RoundPhases.COMPLETE || (ctx.allParticipantsComplete && ctx.moderator.hasMessage);
}

// ============================================================================
// AI SDK GUARDS
// ============================================================================

/**
 * Check if AI SDK is ready for operations
 */
export function isAiSdkReady(ctx: RoundContext): boolean {
  return ctx.isAiSdkReady;
}

/**
 * Check if AI SDK is currently streaming
 */
export function isAiSdkStreaming(ctx: RoundContext): boolean {
  return ctx.isAiSdkStreaming;
}

// ============================================================================
// THREAD GUARDS
// ============================================================================

/**
 * Check if thread exists (either loaded or newly created)
 */
export function hasThread(ctx: RoundContext): boolean {
  return ctx.threadId !== null || ctx.createdThreadId !== null;
}

/**
 * Check if this is a newly created thread
 */
export function isNewThread(ctx: RoundContext): boolean {
  return ctx.createdThreadId !== null && ctx.threadId === null;
}

/**
 * Get effective thread ID
 */
export function getEffectiveThreadId(ctx: RoundContext): string | null {
  return ctx.createdThreadId ?? ctx.threadId;
}

// ============================================================================
// ERROR GUARDS
// ============================================================================

/**
 * Check if there's an active error
 */
export function hasError(ctx: RoundContext): boolean {
  return ctx.lastError !== null;
}

// ============================================================================
// COMPOSITE GUARDS
// ============================================================================

/**
 * Check if round can start (has thread, AI SDK ready, not already streaming)
 */
export function canStartRound(ctx: RoundContext): boolean {
  return hasThread(ctx) && isAiSdkReady(ctx) && !isAiSdkStreaming(ctx);
}

/**
 * Check if should proceed to participants after pre-search
 */
export function shouldProceedToParticipants(ctx: RoundContext): boolean {
  return !shouldRunPreSearch(ctx) || isPreSearchComplete(ctx) || isPreSearchFailed(ctx);
}

/**
 * Check if round is fully complete (participants + moderator done)
 */
export function isRoundFullyComplete(ctx: RoundContext): boolean {
  return ctx.allParticipantsComplete && ctx.moderator.hasMessage;
}

/**
 * All guards exported as a namespace for convenient access
 */
export const guards = {
  // Pre-search
  shouldRunPreSearch,
  isPreSearchInProgress,
  isPreSearchComplete,
  isPreSearchFailed,
  canResumePreSearch,

  // Participants
  hasNextParticipant,
  isValidParticipantIndex,
  allParticipantsComplete,
  hasResumptionParticipant,
  participantHasMessage,
  isParticipantStreaming,

  // Moderator
  canTriggerModerator,
  hasModeratorMessage,
  canResumeModerator,

  // Resumption
  hasResumptionState,
  isResumingFromPreSearch,
  isResumingFromParticipants,
  isResumingFromModerator,
  isRoundComplete,

  // AI SDK
  isAiSdkReady,
  isAiSdkStreaming,

  // Thread
  hasThread,
  isNewThread,
  getEffectiveThreadId,

  // Error
  hasError,

  // Composite
  canStartRound,
  shouldProceedToParticipants,
  isRoundFullyComplete,
} as const;
