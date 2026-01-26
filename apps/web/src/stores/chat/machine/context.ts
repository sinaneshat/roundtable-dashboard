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
      enabled: p.enabled !== false,
      hasMessage,
      id: p.id,
      index: p.participantIndex ?? idx,
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
    allParticipantsComplete: completedParticipants.length === enabledParticipants.length,
    completedParticipantCount: completedParticipants.length,

    createdThreadId: store.createdThreadId,
    currentParticipantIndex: store.currentParticipantIndex,

    enabledParticipantCount: enabledParticipants.length,
    isAiSdkReady: aiSdk.isReady,

    isAiSdkStreaming: aiSdk.isStreaming,
    lastError: store.error,
    moderator: {
      hasMessage: hasModerator,
      streamId: store.moderatorResumption?.streamId ?? null,
    },
    participantCount: store.participants.length,

    participants: participantInfos,
    preSearch: {
      exists: currentPreSearch !== null,
      status: currentPreSearch?.status as PreSearchInfo['status'] ?? null,
      streamId: currentPreSearch?.id ?? null,
    },

    resumption: {
      isPrefilled: store.streamResumptionPrefilled,
      moderatorStreamId: store.moderatorResumption?.streamId ?? null,
      participantIndex: store.nextParticipantToTrigger?.[1] ?? null,
      phase: store.currentResumptionPhase,
      preSearchStreamId: store.preSearchResumption?.streamId ?? null,
      roundNumber: store.resumptionRoundNumber,
    },

    roundNumber,

    streamingRoundNumber: store.streamingRoundNumber,

    threadId: store.thread?.id ?? null,
    webSearchEnabled: store.enableWebSearch,
  };
}

/**
 * Create empty context for initial state
 */
export function createEmptyContext(): RoundContext {
  return {
    allParticipantsComplete: false,
    completedParticipantCount: 0,
    createdThreadId: null,
    currentParticipantIndex: 0,
    enabledParticipantCount: 0,
    isAiSdkReady: false,
    isAiSdkStreaming: false,
    lastError: null,
    moderator: {
      hasMessage: false,
      streamId: null,
    },
    participantCount: 0,
    participants: [],
    preSearch: {
      exists: false,
      status: null,
      streamId: null,
    },
    resumption: {
      isPrefilled: false,
      moderatorStreamId: null,
      participantIndex: null,
      phase: null,
      preSearchStreamId: null,
      roundNumber: null,
    },
    roundNumber: null,
    streamingRoundNumber: null,
    threadId: null,
    webSearchEnabled: false,
  };
}
