/**
 * FSM Context - Immutable snapshot of round state for transition decisions
 *
 * Context is built from store state at dispatch time.
 * Transitions use context to make decisions, guards use it for validation.
 *
 * ✅ PATTERN: Immutable snapshot prevents stale closure issues
 * ✅ SEPARATION: Context building separate from transition logic
 * ✅ ZOD-INFERRED: Types imported from store-schemas.ts (single source of truth)
 */

import type {
  AiSdkSnapshot,
  ParticipantInfo,
  PreSearchInfo,
  RoundContext,
  StoreSnapshot,
} from '../store-schemas';

// Re-export types from store-schemas for consumers
export type {
  AiSdkSnapshot,
  ModeratorInfo,
  ParticipantInfo,
  PreSearchInfo,
  ResumptionInfo,
  RoundContext,
  StoreSnapshot,
} from '../store-schemas';

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
