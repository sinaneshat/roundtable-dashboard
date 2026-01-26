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
  participants: {
    id: string;
    threadId: string;
    modelId: string;
    role: string;
    priority: number;
    isEnabled?: boolean;
  }[];
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
    configChangeRoundNumber: null,
    currentParticipantIndex: 0,
    currentResumptionPhase: null,
    enableWebSearch: false,
    isModeratorStreaming: false,
    // PATCH/Config state
    isPatchInProgress: false,

    isStreaming: false,
    isWaitingForChangelog: false,
    messages: [],

    nextParticipantToTrigger: null,
    // Data
    participants: [],
    preSearches: [],

    resumptionRoundNumber: null,
    screenMode: ScreenModes.OVERVIEW,
    setConfigChangeRoundNumber: (value: number | null) =>
      set({ configChangeRoundNumber: value }),
    setIsPatchInProgress: (value: boolean) =>
      set({ isPatchInProgress: value }),
    setIsStreaming: (value: boolean) =>
      set({ isStreaming: value }),
    setIsWaitingForChangelog: (value: boolean) =>
      set({ isWaitingForChangelog: value }),

    setNextParticipantToTrigger: (value: { index: number; participantId: string } | number | null) =>
      set({ nextParticipantToTrigger: value }),
    // Actions
    setWaitingToStartStreaming: (value: boolean) =>
      set({ waitingToStartStreaming: value }),
    streamingRoundNumber: null,
    // Resumption state
    streamResumptionPrefilled: false,
    thread: null,
    // Streaming state
    waitingToStartStreaming: false,

    ...initialState,
  }));
}

// ============================================================================
// Mock Chat Hook Factory
// ============================================================================

export function createMockChatHook(overrides?: Partial<MockChatHook>): MockChatHook {
  return {
    continueFromParticipant: vi.fn(),
    isReady: false,
    isStreamingRef: { current: false },
    isTriggeringRef: { current: false },
    messages: [],
    setMessages: vi.fn(),
    startRound: vi.fn(),
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
    currentPhase: RoundPhases.PARTICIPANTS,
    hasActiveStream: false,
    moderator: null,
    nextParticipantToTrigger: 0,
    participants: {
      allComplete: false,
      currentParticipantIndex: 0,
      hasActiveStream: false,
      nextParticipantToTrigger: 0,
      participantStatuses: null,
      streamId: null,
      totalParticipants: 2,
    },
    participantStatuses: null,
    preSearch: null,
    roundComplete: false,
    roundNumber: 0,
    streamId: null,
    totalParticipants: 2,
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
    isEnabled: true,
    modelId: `model-${index}`,
    priority: index,
    role: `Role ${index}`,
    threadId: 'thread-123',
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
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text: `User message round ${roundNumber}`, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.USER,
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
    metadata: {
      finishReason: FinishReasons.STOP,
      hasError: false,
      isPartialResponse: false,
      isTransient: false,
      model: 'gpt-4',
      participantId: participantId ?? `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
    },
    parts: [{ text: `Assistant message p${participantIndex} r${roundNumber}`, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.ASSISTANT,
  };
}

export function createMockModeratorMessage(
  roundNumber: number,
  id?: string,
): UIMessage {
  return {
    id: id ?? `msg-mod-r${roundNumber}`,
    metadata: {
      finishReason: FinishReasons.STOP,
      hasError: false,
      isModerator: true,
      model: 'gemini-flash',
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
    },
    parts: [{ text: `Moderator summary round ${roundNumber}`, type: MessagePartTypes.TEXT }],
    role: UIMessageRoles.ASSISTANT,
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
    completedAt: isComplete ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    errorMessage: isFailed ? 'Pre-search failed' : null,
    id: `presearch-${roundNumber}`,
    roundNumber,
    searchData: isComplete
      ? {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 1,
          summary: 'Summary',
          totalResults: 3,
          totalTime: 1000,
        }
      : undefined,
    status,
    threadId: 'thread-123',
    userQuery: 'Test query',
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
    configChangeRoundNumber: patchInProgress ? 1 : null,
    enableWebSearch: false,
    isPatchInProgress: patchInProgress,
    isStreaming: false,
    isWaitingForChangelog: patchInProgress,
    messages: [createMockUserMessage(1)],
    nextParticipantToTrigger: nextParticipant,
    participants: createMockResumptionParticipants(3),
    screenMode: ScreenModes.THREAD,
    thread: { enableWebSearch: false, id: 'thread-123' },
    waitingToStartStreaming: true,
  });
}

/**
 * Build store state for "after changelog" resumption scenario
 */
export function buildAfterChangelogScenario(
  waitingForChangelog: boolean,
) {
  return createMockChatStore({
    configChangeRoundNumber: null,
    enableWebSearch: false,
    isPatchInProgress: false,
    isStreaming: false,
    isWaitingForChangelog: waitingForChangelog,
    messages: [createMockUserMessage(1)],
    nextParticipantToTrigger: 0,
    participants: createMockResumptionParticipants(3),
    screenMode: ScreenModes.THREAD,
    thread: { enableWebSearch: false, id: 'thread-123' },
    waitingToStartStreaming: true,
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
    configChangeRoundNumber: null,
    enableWebSearch: true,
    isPatchInProgress: false,
    isStreaming: false,
    isWaitingForChangelog: false,
    messages: [createMockUserMessage(roundNumber)],
    nextParticipantToTrigger: 0,
    participants: createMockResumptionParticipants(2),
    preSearches: [createMockResumptionPreSearch(roundNumber, preSearchStatus)],
    screenMode: ScreenModes.THREAD,
    thread: { enableWebSearch: true, id: 'thread-123' },
    waitingToStartStreaming: true,
  });
}

/**
 * Build store state for "cache mismatch" scenario
 * Server says nextParticipant=2 but messages only have p0
 */
export function buildCacheMismatchScenario() {
  const roundNumber = 1;
  return createMockChatStore({
    configChangeRoundNumber: null,
    enableWebSearch: false,
    isPatchInProgress: false,
    isStreaming: false,
    isWaitingForChangelog: false,
    // But cache only has p0 message (mismatch)
    messages: [
      createMockUserMessage(roundNumber),
      createMockAssistantMessage(roundNumber, 0),
    ],
    // Server says next is p2 (p0 and p1 complete)
    nextParticipantToTrigger: 2,
    participants: createMockResumptionParticipants(3),
    screenMode: ScreenModes.THREAD,
    thread: { enableWebSearch: false, id: 'thread-123' },
    waitingToStartStreaming: true,
  });
}

/**
 * Build store state for "during moderator" scenario
 */
export function buildDuringModeratorScenario() {
  const roundNumber = 1;
  return createMockChatStore({
    configChangeRoundNumber: null,
    enableWebSearch: false,
    isModeratorStreaming: true,
    isPatchInProgress: false,
    isStreaming: false,
    isWaitingForChangelog: false,
    messages: [
      createMockUserMessage(roundNumber),
      createMockAssistantMessage(roundNumber, 0),
      createMockAssistantMessage(roundNumber, 1),
    ],
    nextParticipantToTrigger: null,
    participants: createMockResumptionParticipants(2),
    screenMode: ScreenModes.THREAD,
    streamingRoundNumber: roundNumber,
    thread: { enableWebSearch: false, id: 'thread-123' },
    waitingToStartStreaming: false,
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
    configChangeRoundNumber: null,
    enableWebSearch: true,
    isPatchInProgress: false,
    isStreaming: false,
    isWaitingForChangelog: false,
    messages: [createMockUserMessage(roundNumber)],
    participants: createMockResumptionParticipants(2),
    preSearches: [createMockResumptionPreSearch(roundNumber, preSearchStatus)],
    screenMode: ScreenModes.THREAD,
    thread: { enableWebSearch: true, id: 'thread-123' },
    waitingToStartStreaming: true,
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
