/**
 * Resumption Test Helpers
 *
 * Mock factories and utilities for testing use-round-resumption hook.
 */

import type { RoundPhase } from '@roundtable/shared';
import { FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses, RoundPhases, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { StoredPreSearch, ThreadStreamResumptionState } from '@/services/api';

// ============================================================================
// Type Definitions
// ============================================================================

export type MockChatStoreState = {
  // Streaming state
  waitingToStartStreaming: boolean;
  isStreaming: boolean;
  isModeratorStreaming: boolean;
  streamingRoundNumber: number | null;
  currentParticipantIndex: number;
  nextParticipantToTrigger: { index: number; participantId: string } | number | null;

  // PATCH/Config state
  isPatchInProgress: boolean;
  configChangeRoundNumber: number | null;
  isWaitingForChangelog: boolean;

  // Resumption state
  streamResumptionPrefilled: boolean;
  currentResumptionPhase: RoundPhase | null;
  resumptionRoundNumber: number | null;

  // Data
  participants: Array<{
    id: string;
    threadId: string;
    modelId: string;
    role: string;
    priority: number;
    isEnabled?: boolean;
  }>;
  messages: UIMessage[];
  preSearches: StoredPreSearch[];
  thread: {
    id: string;
    enableWebSearch: boolean;
  } | null;
  screenMode: string | null;
  enableWebSearch: boolean;

  // Actions
  setWaitingToStartStreaming: (value: boolean) => void;
  setNextParticipantToTrigger: (value: { index: number; participantId: string } | number | null) => void;
  setIsStreaming: (value: boolean) => void;
  setIsPatchInProgress: (value: boolean) => void;
  setConfigChangeRoundNumber: (value: number | null) => void;
  setIsWaitingForChangelog: (value: boolean) => void;
};

export type MockChatHook = {
  isReady: boolean;
  continueFromParticipant: ReturnType<typeof vi.fn>;
  startRound: ReturnType<typeof vi.fn>;
  messages: UIMessage[];
  setMessages: ReturnType<typeof vi.fn>;
  isTriggeringRef: { current: boolean };
  isStreamingRef: { current: boolean };
};

// ============================================================================
// Mock Store Factory
// ============================================================================

export function createMockChatStore(
  initialState?: Partial<MockChatStoreState>,
): StoreApi<MockChatStoreState> {
  return createStore<MockChatStoreState>(set => ({
    // Streaming state
    waitingToStartStreaming: false,
    isStreaming: false,
    isModeratorStreaming: false,
    streamingRoundNumber: null,
    currentParticipantIndex: 0,
    nextParticipantToTrigger: null,

    // PATCH/Config state
    isPatchInProgress: false,
    configChangeRoundNumber: null,
    isWaitingForChangelog: false,

    // Resumption state
    streamResumptionPrefilled: false,
    currentResumptionPhase: null,
    resumptionRoundNumber: null,

    // Data
    participants: [],
    messages: [],
    preSearches: [],
    thread: null,
    screenMode: ScreenModes.OVERVIEW,
    enableWebSearch: false,

    // Actions
    setWaitingToStartStreaming: (value: boolean) =>
      set({ waitingToStartStreaming: value }),
    setNextParticipantToTrigger: (value: { index: number; participantId: string } | number | null) =>
      set({ nextParticipantToTrigger: value }),
    setIsStreaming: (value: boolean) =>
      set({ isStreaming: value }),
    setIsPatchInProgress: (value: boolean) =>
      set({ isPatchInProgress: value }),
    setConfigChangeRoundNumber: (value: number | null) =>
      set({ configChangeRoundNumber: value }),
    setIsWaitingForChangelog: (value: boolean) =>
      set({ isWaitingForChangelog: value }),

    ...initialState,
  }));
}

// ============================================================================
// Mock Chat Hook Factory
// ============================================================================

export function createMockChatHook(overrides?: Partial<MockChatHook>): MockChatHook {
  return {
    isReady: false,
    continueFromParticipant: vi.fn(),
    startRound: vi.fn(),
    messages: [],
    setMessages: vi.fn(),
    isTriggeringRef: { current: false },
    isStreamingRef: { current: false },
    ...overrides,
  };
}

// ============================================================================
// Stream Resumption State Factory
// ============================================================================

export function createMockStreamResumptionState(
  overrides?: Partial<ThreadStreamResumptionState>,
): ThreadStreamResumptionState {
  return {
    roundNumber: 0,
    currentPhase: RoundPhases.PARTICIPANTS,
    preSearch: null,
    participants: {
      hasActiveStream: false,
      streamId: null,
      totalParticipants: 2,
      currentParticipantIndex: 0,
      participantStatuses: null,
      nextParticipantToTrigger: 0,
      allComplete: false,
    },
    moderator: null,
    roundComplete: false,
    hasActiveStream: false,
    streamId: null,
    totalParticipants: 2,
    participantStatuses: null,
    nextParticipantToTrigger: 0,
    ...overrides,
  };
}

// ============================================================================
// Participant Factory
// ============================================================================

export function createMockResumptionParticipant(
  index: number,
  overrides?: Partial<MockChatStoreState['participants'][0]>,
) {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    role: `Role ${index}`,
    priority: index,
    isEnabled: true,
    ...overrides,
  };
}

export function createMockResumptionParticipants(count: number, threadId = 'thread-123') {
  return Array.from({ length: count }, (_, i) =>
    createMockResumptionParticipant(i, { threadId }));
}

// ============================================================================
// Message Factories
// ============================================================================

export function createMockUserMessage(
  roundNumber: number,
  id?: string,
): UIMessage {
  return {
    id: id ?? `msg-user-r${roundNumber}`,
    role: UIMessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: `User message round ${roundNumber}` }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
  };
}

export function createMockAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  participantId?: string,
  id?: string,
): UIMessage {
  return {
    id: id ?? `msg-p${participantIndex}-r${roundNumber}`,
    role: UIMessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text: `Assistant message p${participantIndex} r${roundNumber}` }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: participantId ?? `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: 'gpt-4',
      finishReason: FinishReasons.STOP,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  };
}

export function createMockModeratorMessage(
  roundNumber: number,
  id?: string,
): UIMessage {
  return {
    id: id ?? `msg-mod-r${roundNumber}`,
    role: UIMessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text: `Moderator summary round ${roundNumber}` }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      isModerator: true,
      roundNumber,
      model: 'gemini-flash',
      finishReason: FinishReasons.STOP,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
    },
  };
}

// ============================================================================
// Pre-Search Factory
// ============================================================================

export function createMockResumptionPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses],
): StoredPreSearch {
  const isComplete = status === MessageStatuses.COMPLETE;
  const isFailed = status === MessageStatuses.FAILED;

  return {
    id: `presearch-${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    userQuery: 'Test query',
    searchData: isComplete
      ? {
          queries: [],
          results: [],
          summary: 'Summary',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        }
      : undefined,
    errorMessage: isFailed ? 'Pre-search failed' : null,
    createdAt: new Date().toISOString(),
    completedAt: isComplete ? new Date().toISOString() : null,
  } as StoredPreSearch;
}

// ============================================================================
// Complete Round Scenarios
// ============================================================================

/**
 * Create messages for a complete round (user + all participants + moderator)
 */
export function createCompleteRoundMessages(
  roundNumber: number,
  participantCount: number,
): UIMessage[] {
  const messages: UIMessage[] = [createMockUserMessage(roundNumber)];

  for (let i = 0; i < participantCount; i++) {
    messages.push(createMockAssistantMessage(roundNumber, i));
  }

  messages.push(createMockModeratorMessage(roundNumber));
  return messages;
}

/**
 * Create messages for an incomplete round (user + some participants)
 */
export function createIncompleteRoundMessages(
  roundNumber: number,
  completedParticipantCount: number,
): UIMessage[] {
  const messages: UIMessage[] = [createMockUserMessage(roundNumber)];

  for (let i = 0; i < completedParticipantCount; i++) {
    messages.push(createMockAssistantMessage(roundNumber, i));
  }

  return messages;
}

// ============================================================================
// Resumption Scenario Builders
// ============================================================================

/**
 * Build store state for "after PATCH" resumption scenario
 */
export function buildAfterPatchScenario(
  patchInProgress: boolean,
  nextParticipant: number,
) {
  return createMockChatStore({
    isPatchInProgress: patchInProgress,
    configChangeRoundNumber: patchInProgress ? 1 : null,
    isWaitingForChangelog: patchInProgress,
    nextParticipantToTrigger: nextParticipant,
    waitingToStartStreaming: true,
    isStreaming: false,
    screenMode: ScreenModes.THREAD,
    participants: createMockResumptionParticipants(3),
    messages: [createMockUserMessage(1)],
    thread: { id: 'thread-123', enableWebSearch: false },
    enableWebSearch: false,
  });
}

/**
 * Build store state for "after changelog" resumption scenario
 */
export function buildAfterChangelogScenario(
  waitingForChangelog: boolean,
) {
  return createMockChatStore({
    isPatchInProgress: false,
    configChangeRoundNumber: null,
    isWaitingForChangelog: waitingForChangelog,
    nextParticipantToTrigger: 0,
    waitingToStartStreaming: true,
    isStreaming: false,
    screenMode: ScreenModes.THREAD,
    participants: createMockResumptionParticipants(3),
    messages: [createMockUserMessage(1)],
    thread: { id: 'thread-123', enableWebSearch: false },
    enableWebSearch: false,
  });
}

/**
 * Build store state for "after pre-search" resumption scenario
 */
export function buildAfterPreSearchScenario(
  preSearchStatus: typeof MessageStatuses[keyof typeof MessageStatuses],
) {
  const roundNumber = 1;
  return createMockChatStore({
    isPatchInProgress: false,
    configChangeRoundNumber: null,
    isWaitingForChangelog: false,
    nextParticipantToTrigger: 0,
    waitingToStartStreaming: true,
    isStreaming: false,
    screenMode: ScreenModes.THREAD,
    participants: createMockResumptionParticipants(2),
    messages: [createMockUserMessage(roundNumber)],
    preSearches: [createMockResumptionPreSearch(roundNumber, preSearchStatus)],
    thread: { id: 'thread-123', enableWebSearch: true },
    enableWebSearch: true,
  });
}

/**
 * Build store state for "cache mismatch" scenario
 * Server says nextParticipant=2 but messages only have p0
 */
export function buildCacheMismatchScenario() {
  const roundNumber = 1;
  return createMockChatStore({
    isPatchInProgress: false,
    configChangeRoundNumber: null,
    isWaitingForChangelog: false,
    // Server says next is p2 (p0 and p1 complete)
    nextParticipantToTrigger: 2,
    waitingToStartStreaming: true,
    isStreaming: false,
    screenMode: ScreenModes.THREAD,
    participants: createMockResumptionParticipants(3),
    // But cache only has p0 message (mismatch)
    messages: [
      createMockUserMessage(roundNumber),
      createMockAssistantMessage(roundNumber, 0),
    ],
    thread: { id: 'thread-123', enableWebSearch: false },
    enableWebSearch: false,
  });
}

/**
 * Build store state for "during moderator" scenario
 */
export function buildDuringModeratorScenario() {
  const roundNumber = 1;
  return createMockChatStore({
    isPatchInProgress: false,
    configChangeRoundNumber: null,
    isWaitingForChangelog: false,
    nextParticipantToTrigger: null,
    waitingToStartStreaming: false,
    isStreaming: false,
    isModeratorStreaming: true,
    streamingRoundNumber: roundNumber,
    screenMode: ScreenModes.THREAD,
    participants: createMockResumptionParticipants(2),
    messages: [
      createMockUserMessage(roundNumber),
      createMockAssistantMessage(roundNumber, 0),
      createMockAssistantMessage(roundNumber, 1),
    ],
    thread: { id: 'thread-123', enableWebSearch: false },
    enableWebSearch: false,
  });
}

// ============================================================================
// SSR Hydration Scenario Builders
// ============================================================================

/**
 * Build store state for SSR hydrated scenario where preSearches come from server.
 * This simulates the state AFTER useSyncHydrateStore or useScreenInitialization
 * has called setPreSearches with initialPreSearches from the loader.
 */
export function buildSSRHydratedScenario(
  preSearchStatus: typeof MessageStatuses[keyof typeof MessageStatuses],
) {
  const roundNumber = 0;
  return createMockChatStore({
    screenMode: ScreenModes.THREAD,
    waitingToStartStreaming: true,
    isStreaming: false,
    isPatchInProgress: false,
    configChangeRoundNumber: null,
    isWaitingForChangelog: false,
    enableWebSearch: true,
    participants: createMockResumptionParticipants(2),
    messages: [createMockUserMessage(roundNumber)],
    thread: { id: 'thread-123', enableWebSearch: true },
    preSearches: [createMockResumptionPreSearch(roundNumber, preSearchStatus)],
  });
}

/**
 * Verify pre-search is hydrated in store for given round number.
 * Returns the pre-search if found, undefined otherwise.
 */
export function assertPreSearchHydrated(
  store: StoreApi<MockChatStoreState>,
  roundNumber: number,
): StoredPreSearch | undefined {
  const state = store.getState();
  return state.preSearches.find(ps => ps.roundNumber === roundNumber);
}
