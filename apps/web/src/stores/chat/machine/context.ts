/**
 * FSM Context - Immutable snapshot of round state for transition decisions
 *
 * Context is built from store state at dispatch time.
 * Transitions use context to make decisions, guards use it for validation.
 *
 * ✅ PATTERN: Immutable snapshot prevents stale closure issues
 * ✅ SEPARATION: Context building separate from transition logic
 */

import type { RoundPhase } from '@roundtable/shared';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Participant info for FSM decisions
 */
export type ParticipantInfo = {
  id: string;
  index: number;
  enabled: boolean;
  hasMessage: boolean;
};

/**
 * Pre-search state for FSM decisions
 */
export type PreSearchInfo = {
  exists: boolean;
  status: 'pending' | 'streaming' | 'complete' | 'failed' | null;
  streamId: string | null;
};

/**
 * Moderator state for FSM decisions
 */
export type ModeratorInfo = {
  hasMessage: boolean;
  streamId: string | null;
};

/**
 * Resumption state from server prefill
 */
export type ResumptionInfo = {
  phase: RoundPhase | null;
  participantIndex: number | null;
  roundNumber: number | null;
  preSearchStreamId: string | null;
  moderatorStreamId: string | null;
  isPrefilled: boolean;
};

/**
 * Immutable context for FSM transition decisions
 */
export type RoundContext = {
  // Thread identity
  threadId: string | null;
  createdThreadId: string | null;

  // Round tracking
  roundNumber: number | null;
  streamingRoundNumber: number | null;

  // Web search
  webSearchEnabled: boolean;
  preSearch: PreSearchInfo;

  // Participants
  participants: ParticipantInfo[];
  participantCount: number;
  enabledParticipantCount: number;
  currentParticipantIndex: number;

  // Completion tracking
  allParticipantsComplete: boolean;
  completedParticipantCount: number;

  // Moderator
  moderator: ModeratorInfo;

  // Resumption (from server prefill)
  resumption: ResumptionInfo;

  // Error state
  lastError: Error | null;

  // AI SDK state
  isAiSdkStreaming: boolean;
  isAiSdkReady: boolean;
};

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Store slice interfaces for context building
 * These match the Zustand store structure
 */
export type StoreSnapshot = {
  // Thread state
  thread: { id: string } | null;
  createdThreadId: string | null;

  // Round state
  currentRoundNumber: number | null;
  streamingRoundNumber: number | null;

  // Form state
  enableWebSearch: boolean;

  // Participants
  participants: Array<{
    id: string;
    participantIndex: number;
    enabled?: boolean;
  }>;
  currentParticipantIndex: number;

  // Messages (for completion detection)
  messages: Array<{
    id: string;
    role: string;
    metadata?: {
      roundNumber?: number;
      participantIndex?: number;
      isModerator?: boolean;
    };
  }>;

  // Pre-search state
  preSearches: Array<{
    roundNumber: number;
    status: string;
    id?: string;
  }>;

  // Stream resumption state
  streamResumptionPrefilled: boolean;
  currentResumptionPhase: RoundPhase | null;
  resumptionRoundNumber: number | null;
  nextParticipantToTrigger: [number, number] | null;
  preSearchResumption: { streamId: string } | null;
  moderatorResumption: { streamId: string } | null;

  // Error
  error: Error | null;
};

/**
 * AI SDK state snapshot
 */
export type AiSdkSnapshot = {
  isStreaming: boolean;
  isReady: boolean;
};

/**
 * Build immutable context from store and AI SDK state
 */
export function buildContext(store: StoreSnapshot, aiSdk: AiSdkSnapshot): RoundContext {
  const roundNumber = store.streamingRoundNumber ?? store.currentRoundNumber;

  // Find pre-search for current round
  const currentPreSearch = roundNumber !== null
    ? store.preSearches.find(ps => ps.roundNumber === roundNumber)
    : null;

  // Build participant info with completion status
  const participantInfos: ParticipantInfo[] = store.participants.map((p, idx) => {
    const hasMessage = store.messages.some(
      m =>
        m.role === 'assistant'
        && m.metadata?.roundNumber === roundNumber
        && m.metadata?.participantIndex === idx
        && !m.metadata?.isModerator,
    );

    return {
      id: p.id,
      index: p.participantIndex ?? idx,
      enabled: p.enabled !== false,
      hasMessage,
    };
  });

  const enabledParticipants = participantInfos.filter(p => p.enabled);
  const completedParticipants = enabledParticipants.filter(p => p.hasMessage);

  // Check if moderator message exists for current round
  const hasModerator = store.messages.some(
    m =>
      m.role === 'assistant'
      && m.metadata?.roundNumber === roundNumber
      && m.metadata?.isModerator,
  );

  return {
    threadId: store.thread?.id ?? null,
    createdThreadId: store.createdThreadId,

    roundNumber,
    streamingRoundNumber: store.streamingRoundNumber,

    webSearchEnabled: store.enableWebSearch,
    preSearch: {
      exists: currentPreSearch !== null,
      status: currentPreSearch?.status as PreSearchInfo['status'] ?? null,
      streamId: currentPreSearch?.id ?? null,
    },

    participants: participantInfos,
    participantCount: store.participants.length,
    enabledParticipantCount: enabledParticipants.length,
    currentParticipantIndex: store.currentParticipantIndex,

    allParticipantsComplete: completedParticipants.length === enabledParticipants.length,
    completedParticipantCount: completedParticipants.length,

    moderator: {
      hasMessage: hasModerator,
      streamId: store.moderatorResumption?.streamId ?? null,
    },

    resumption: {
      phase: store.currentResumptionPhase,
      participantIndex: store.nextParticipantToTrigger?.[1] ?? null,
      roundNumber: store.resumptionRoundNumber,
      preSearchStreamId: store.preSearchResumption?.streamId ?? null,
      moderatorStreamId: store.moderatorResumption?.streamId ?? null,
      isPrefilled: store.streamResumptionPrefilled,
    },

    lastError: store.error,

    isAiSdkStreaming: aiSdk.isStreaming,
    isAiSdkReady: aiSdk.isReady,
  };
}

/**
 * Create empty context for initial state
 */
export function createEmptyContext(): RoundContext {
  return {
    threadId: null,
    createdThreadId: null,
    roundNumber: null,
    streamingRoundNumber: null,
    webSearchEnabled: false,
    preSearch: {
      exists: false,
      status: null,
      streamId: null,
    },
    participants: [],
    participantCount: 0,
    enabledParticipantCount: 0,
    currentParticipantIndex: 0,
    allParticipantsComplete: false,
    completedParticipantCount: 0,
    moderator: {
      hasMessage: false,
      streamId: null,
    },
    resumption: {
      phase: null,
      participantIndex: null,
      roundNumber: null,
      preSearchStreamId: null,
      moderatorStreamId: null,
      isPrefilled: false,
    },
    lastError: null,
    isAiSdkStreaming: false,
    isAiSdkReady: false,
  };
}
