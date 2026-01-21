/**
 * Chat Flow State Machine
 *
 * Pure state machine for managing chat round lifecycle.
 * Replaces scattered boolean flags and race condition fixes with explicit transitions.
 *
 * DESIGN PRINCIPLES:
 * 1. Pure function - no side effects, O(1) transitions
 * 2. Explicit states - no implicit state combinations
 * 3. Single source of truth - phase enum replaces 5+ booleans
 * 4. No mid-stream resumption - page refresh = reload from last completed state
 *
 * STATE FLOW:
 * idle → creating_thread → pre_search? → streaming → awaiting_moderator → moderator_streaming → round_complete
 *                               ↓                                                                    ↓
 *                          (if web search)                                              (new message → loop back to pre_search/streaming)
 */

import type { UIMessage } from 'ai';

import type { ChatMode, ParticipantConfig, PreSearchResult, Thread } from './store-schemas';

// ============================================================================
// Flow State Types
// ============================================================================

/**
 * Flow state discriminated union - explicit phases, no boolean combinations
 */
export type FlowState
  = | { type: 'idle' }
    | { type: 'creating_thread'; message: string; mode: ChatMode; participants: ParticipantConfig[] }
    | { type: 'updating_thread'; threadId: string; round: number; message: string; hasConfigChanges: boolean }
    | { type: 'awaiting_changelog'; threadId: string; round: number }
    | { type: 'pre_search'; threadId: string; round: number }
    | { type: 'streaming'; threadId: string; round: number; participantIndex: number; totalParticipants: number }
    | { type: 'awaiting_moderator'; threadId: string; round: number }
    | { type: 'moderator_streaming'; threadId: string; round: number }
    | { type: 'round_complete'; threadId: string; round: number }
    | { type: 'error'; threadId?: string; round?: number; error: string };

/**
 * Flow events that trigger state transitions
 */
export type FlowEvent
  = | { type: 'SUBMIT_MESSAGE'; message: string; mode: ChatMode; participants: ParticipantConfig[]; enableWebSearch: boolean; hasConfigChanges?: boolean }
    | { type: 'THREAD_CREATED'; threadId: string; slug: string }
    | { type: 'UPDATE_THREAD_COMPLETE' }
    | { type: 'CHANGELOG_RECEIVED' }
    | { type: 'PRE_SEARCH_STARTED'; round: number }
    | { type: 'PRE_SEARCH_COMPLETE'; round: number }
    | { type: 'PARTICIPANT_STARTED'; participantIndex: number }
    | { type: 'PARTICIPANT_COMPLETE'; participantIndex: number }
    | { type: 'ALL_PARTICIPANTS_COMPLETE'; round: number }
    | { type: 'MODERATOR_STARTED' }
    | { type: 'MODERATOR_COMPLETE'; round: number }
    | { type: 'STOP' }
    | { type: 'RETRY'; round: number }
    | { type: 'ERROR'; error: string }
    | { type: 'RESET' }
    | { type: 'LOAD_THREAD'; thread: Thread; messages: UIMessage[]; preSearches?: PreSearchResult[] };

/**
 * Context needed for transition decisions
 * Passed to transition function but NOT stored in flow state
 */
export type FlowContext = {
  enableWebSearch: boolean;
  participantCount: number;
  hasPreSearchForRound: (round: number) => boolean;
  isPreSearchComplete: (round: number) => boolean;
};

// ============================================================================
// State Queries (Pure Functions)
// ============================================================================

/**
 * Check if flow is in any active state (not idle, error, or complete)
 */
export function isFlowActive(state: FlowState): boolean {
  return (
    state.type === 'creating_thread'
    || state.type === 'updating_thread'
    || state.type === 'awaiting_changelog'
    || state.type === 'pre_search'
    || state.type === 'streaming'
    || state.type === 'awaiting_moderator'
    || state.type === 'moderator_streaming'
  );
}

/**
 * Check if flow can accept new messages
 */
export function canSubmitMessage(state: FlowState): boolean {
  return state.type === 'idle' || state.type === 'round_complete';
}

/**
 * Check if flow can be stopped
 */
export function canStop(state: FlowState): boolean {
  return (
    state.type === 'pre_search'
    || state.type === 'streaming'
    || state.type === 'moderator_streaming'
  );
}

/**
 * Get current round number if in a round-aware state
 */
export function getCurrentRound(state: FlowState): number | null {
  if ('round' in state && state.round !== undefined) {
    return state.round;
  }
  return null;
}

/**
 * Get thread ID if in a thread-aware state
 */
export function getThreadId(state: FlowState): string | null {
  if ('threadId' in state && state.threadId !== undefined) {
    return state.threadId;
  }
  return null;
}

// ============================================================================
// State Transition Function (Pure)
// ============================================================================

/**
 * Pure state transition function
 *
 * Given current state and event, returns new state.
 * No side effects - orchestrator handles API calls, navigation, etc.
 *
 * @param state - Current flow state
 * @param event - Event triggering transition
 * @param context - Additional context for transition decisions
 * @returns New flow state
 */
export function transition(
  state: FlowState,
  event: FlowEvent,
  context: FlowContext,
): FlowState {
  // Global events that work from any state
  if (event.type === 'RESET') {
    return { type: 'idle' };
  }

  if (event.type === 'ERROR') {
    const threadId = getThreadId(state);
    const round = getCurrentRound(state);
    return {
      type: 'error',
      ...(threadId && { threadId }),
      ...(round !== null && { round }),
      error: event.error,
    };
  }

  if (event.type === 'STOP') {
    if (!canStop(state)) {
      return state; // Ignore STOP in non-stoppable states
    }
    const threadId = getThreadId(state);
    const round = getCurrentRound(state);
    if (threadId && round !== null) {
      return { type: 'round_complete', threadId, round };
    }
    return { type: 'idle' };
  }

  // State-specific transitions
  switch (state.type) {
    case 'idle': {
      if (event.type === 'SUBMIT_MESSAGE') {
        return {
          type: 'creating_thread',
          message: event.message,
          mode: event.mode,
          participants: event.participants,
        };
      }
      if (event.type === 'LOAD_THREAD') {
        // Determine state from loaded messages
        const round = determineRoundFromMessages(event.messages);
        const isComplete = isRoundComplete(event.messages, round, context.participantCount);

        if (isComplete) {
          return { type: 'round_complete', threadId: event.thread.id, round };
        }
        // If not complete, go to round_complete anyway - no mid-stream resumption
        // Backend queue will complete the round; we just show what's done
        return { type: 'round_complete', threadId: event.thread.id, round: Math.max(0, round - 1) };
      }
      return state;
    }

    case 'creating_thread': {
      if (event.type === 'THREAD_CREATED') {
        // Check if we need pre-search
        if (context.enableWebSearch) {
          return { type: 'pre_search', threadId: event.threadId, round: 0 };
        }
        return {
          type: 'streaming',
          threadId: event.threadId,
          round: 0,
          participantIndex: 0,
          totalParticipants: context.participantCount,
        };
      }
      return state;
    }

    case 'pre_search': {
      if (event.type === 'PRE_SEARCH_COMPLETE' && event.round === state.round) {
        return {
          type: 'streaming',
          threadId: state.threadId,
          round: state.round,
          participantIndex: 0,
          totalParticipants: context.participantCount,
        };
      }
      return state;
    }

    case 'streaming': {
      if (event.type === 'PARTICIPANT_COMPLETE') {
        const nextIndex = event.participantIndex + 1;
        if (nextIndex < state.totalParticipants) {
          return {
            ...state,
            participantIndex: nextIndex,
          };
        }
        // All participants done
        return {
          type: 'awaiting_moderator',
          threadId: state.threadId,
          round: state.round,
        };
      }
      if (event.type === 'ALL_PARTICIPANTS_COMPLETE') {
        return {
          type: 'awaiting_moderator',
          threadId: state.threadId,
          round: state.round,
        };
      }
      return state;
    }

    case 'awaiting_moderator': {
      if (event.type === 'MODERATOR_STARTED') {
        return {
          type: 'moderator_streaming',
          threadId: state.threadId,
          round: state.round,
        };
      }
      // Skip directly to complete if no moderator needed
      if (event.type === 'MODERATOR_COMPLETE') {
        return {
          type: 'round_complete',
          threadId: state.threadId,
          round: state.round,
        };
      }
      return state;
    }

    case 'moderator_streaming': {
      if (event.type === 'MODERATOR_COMPLETE') {
        return {
          type: 'round_complete',
          threadId: state.threadId,
          round: state.round,
        };
      }
      return state;
    }

    case 'round_complete': {
      if (event.type === 'SUBMIT_MESSAGE') {
        const nextRound = state.round + 1;
        // For follow-up rounds, go through updating_thread state
        return {
          type: 'updating_thread',
          threadId: state.threadId,
          round: nextRound,
          message: event.message,
          hasConfigChanges: event.hasConfigChanges ?? false,
        };
      }
      if (event.type === 'RETRY') {
        // Retry current round
        if (context.enableWebSearch) {
          return { type: 'pre_search', threadId: state.threadId, round: event.round };
        }
        return {
          type: 'streaming',
          threadId: state.threadId,
          round: event.round,
          participantIndex: 0,
          totalParticipants: context.participantCount,
        };
      }
      return state;
    }

    case 'updating_thread': {
      if (event.type === 'UPDATE_THREAD_COMPLETE') {
        // If config changes, wait for changelog before proceeding
        if (state.hasConfigChanges) {
          return {
            type: 'awaiting_changelog',
            threadId: state.threadId,
            round: state.round,
          };
        }
        // No config changes, proceed directly to pre_search or streaming
        if (context.enableWebSearch) {
          return { type: 'pre_search', threadId: state.threadId, round: state.round };
        }
        return {
          type: 'streaming',
          threadId: state.threadId,
          round: state.round,
          participantIndex: 0,
          totalParticipants: context.participantCount,
        };
      }
      return state;
    }

    case 'awaiting_changelog': {
      if (event.type === 'CHANGELOG_RECEIVED') {
        // After changelog received, proceed to pre_search or streaming
        if (context.enableWebSearch) {
          return { type: 'pre_search', threadId: state.threadId, round: state.round };
        }
        return {
          type: 'streaming',
          threadId: state.threadId,
          round: state.round,
          participantIndex: 0,
          totalParticipants: context.participantCount,
        };
      }
      return state;
    }

    case 'error': {
      if (event.type === 'RETRY' && state.threadId && state.round !== undefined) {
        if (context.enableWebSearch) {
          return { type: 'pre_search', threadId: state.threadId, round: state.round };
        }
        return {
          type: 'streaming',
          threadId: state.threadId,
          round: state.round,
          participantIndex: 0,
          totalParticipants: context.participantCount,
        };
      }
      return state;
    }

    default:
      return state;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine current round number from messages
 */
function determineRoundFromMessages(messages: UIMessage[]): number {
  let maxRound = 0;
  for (const msg of messages) {
    const metadata = msg.metadata;
    if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata) {
      const roundNumber = metadata.roundNumber;
      if (typeof roundNumber === 'number') {
        maxRound = Math.max(maxRound, roundNumber);
      }
    }
  }
  return maxRound;
}

/**
 * Check if a round is complete (has moderator message)
 */
function isRoundComplete(
  messages: UIMessage[],
  round: number,
  _participantCount: number,
): boolean {
  // Round is complete if it has a moderator message
  return messages.some((msg) => {
    const metadata = msg.metadata;
    if (!metadata || typeof metadata !== 'object')
      return false;

    return (
      'roundNumber' in metadata
      && metadata.roundNumber === round
      && 'isModerator' in metadata
      && metadata.isModerator === true
    );
  });
}

// ============================================================================
// Initial State
// ============================================================================

export const INITIAL_FLOW_STATE: FlowState = { type: 'idle' };
