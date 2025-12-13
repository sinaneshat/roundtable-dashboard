/**
 * Chat Store Test Factories
 *
 * Shared mock factories for chat store testing.
 * Consolidates duplicated patterns across test files.
 *
 * NOTE: For API response mocks, use ./api-mocks.ts instead
 * This file focuses on store-specific test utilities.
 *
 * @module lib/testing/chat-test-factories
 */

import type { AnalysisStatus, StreamStatus } from '@/api/core/enums';
import { AnalysisStatuses, ChatModes, StreamStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

import {
  createMockAnalysis as _createMockAnalysis,
  createMockParticipant as _createMockParticipant,
  createMockThread as _createMockThread,
} from './api-mocks';

// Re-export commonly used factories from api-mocks for convenience
// NOTE: createMockParticipant, createMockThread, createMockAnalysis are NOT re-exported
// - use the indexed/test-friendly versions below
export { createMockMessage } from './api-mocks';

// ============================================================================
// THREAD FACTORIES
// ============================================================================

/**
 * Creates a mock ChatThread for testing with test-friendly defaults
 * Uses 'thread-123' as default ID to match test conventions
 */
export function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return _createMockThread({
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    mode: ChatModes.DEBATING,
    status: 'active',
    enableWebSearch: false,
    ...overrides,
  });
}

// ============================================================================
// PARTICIPANT FACTORIES
// ============================================================================

/**
 * Creates a mock ChatParticipant for testing with index-based defaults
 * This is the preferred version for tests that work with participant arrays
 *
 * @param index - Participant index (used for id, modelId, role, priority)
 * @param overrides - Optional overrides
 */
export function createMockParticipant(
  index: number,
  overrides?: Partial<ChatParticipant>,
): ChatParticipant {
  const models = ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'mistral-large'];
  return _createMockParticipant({
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: models[index % models.length] as string,
    role: `Role ${index}`,
    priority: index,
    ...overrides,
  });
}

/**
 * Creates multiple mock ChatParticipants for testing
 * Convenience wrapper around createMockParticipant
 */
export function createMockParticipants(
  count: number,
  threadId = 'thread-123',
): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) =>
    createMockParticipant(i, { threadId }));
}

// ============================================================================
// ANALYSIS FACTORIES
// ============================================================================

/**
 * Creates a mock StoredModeratorAnalysis for testing with roundNumber and status
 * This is the preferred version for tests that specify round/status directly
 */
export function createMockAnalysis(
  roundNumber: number,
  status: AnalysisStatus = AnalysisStatuses.COMPLETE,
  overrides?: Partial<StoredModeratorAnalysis>,
): StoredModeratorAnalysis {
  return _createMockAnalysis({
    id: `analysis-${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    ...overrides,
  });
}

// ============================================================================
// PARTICIPANT CONFIG FACTORIES (Form State)
// ============================================================================

/**
 * Creates a ParticipantConfig for form state testing
 * Different from createMockParticipant - this is for the form slice, not DB entities
 */
export function createParticipantConfig(
  index: number,
  overrides?: Partial<ParticipantConfig>,
): ParticipantConfig {
  return {
    id: `participant-${index}`,
    modelId: `model-${index}`,
    role: `Role ${index}`,
    priority: index,
    ...overrides,
  };
}

/**
 * Creates multiple ParticipantConfigs for form state testing
 */
export function createParticipantConfigs(count: number): ParticipantConfig[] {
  return Array.from({ length: count }, (_, i) => createParticipantConfig(i));
}

// ============================================================================
// PRE-SEARCH FACTORIES (Stored/Simplified)
// ============================================================================

/**
 * Creates a simplified mock StoredPreSearch for store testing
 * Use createMockPreSearchesListResponse for API response testing
 */
export function createMockStoredPreSearch(
  roundNumber: number,
  status: AnalysisStatus = AnalysisStatuses.COMPLETE,
  overrides?: Partial<StoredPreSearch>,
): StoredPreSearch {
  const isComplete = status === AnalysisStatuses.COMPLETE;

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
          analysis: 'Analysis',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        }
      : undefined,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: isComplete ? new Date() : null,
    ...overrides,
  } as StoredPreSearch;
}

// ============================================================================
// STREAM / KV FACTORIES
// ============================================================================

/**
 * Stream KV entry for testing stream status tracking
 */
export type StreamKVEntry = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  status: StreamStatus;
  messageId?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
};

/**
 * Generates stream ID following the documented pattern
 * Pattern: {threadId}_r{roundNumber}_p{participantIndex}
 */
export function generateStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

/**
 * Creates a mock StreamKVEntry for testing
 */
export function createStreamKVEntry(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  status: StreamStatus = StreamStatuses.ACTIVE,
  overrides?: Partial<StreamKVEntry>,
): StreamKVEntry {
  const streamId = generateStreamId(threadId, roundNumber, participantIndex);
  return {
    streamId,
    threadId,
    roundNumber,
    participantIndex,
    status,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// STORE STATE FACTORIES
// ============================================================================

/**
 * Initial store state shape for testing state transitions
 */
export type TestStoreState = {
  isStreaming: boolean;
  waitingToStartStreaming: boolean;
  streamingRoundNumber: number | null;
  currentParticipantIndex: number;
  currentRoundNumber: number | null;
  isCreatingAnalysis: boolean;
  isWaitingForChangelog: boolean;
  hasSentPendingMessage: boolean;
  error: Error | null;
  preSearches: StoredPreSearch[];
  analyses: StoredModeratorAnalysis[];
  triggeredPreSearchRounds: Set<number>;
  triggeredAnalysisRounds: Set<number>;
  triggeredAnalysisIds: Set<string>;
  createdAnalysisRounds: Set<number>;
};

/**
 * Creates initial store state for testing
 */
export function createInitialStoreState(
  overrides?: Partial<TestStoreState>,
): TestStoreState {
  return {
    isStreaming: false,
    waitingToStartStreaming: false,
    streamingRoundNumber: null,
    currentParticipantIndex: 0,
    currentRoundNumber: null,
    isCreatingAnalysis: false,
    isWaitingForChangelog: false,
    hasSentPendingMessage: false,
    error: null,
    preSearches: [],
    analyses: [],
    triggeredPreSearchRounds: new Set(),
    triggeredAnalysisRounds: new Set(),
    triggeredAnalysisIds: new Set(),
    createdAnalysisRounds: new Set(),
    ...overrides,
  };
}

// ============================================================================
// OPTIMISTIC MESSAGE FACTORIES
// ============================================================================

/**
 * Base message type for optimistic update testing
 */
export type BaseTestMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
};

/**
 * Optimistic message type for testing
 */
export type OptimisticTestMessage = BaseTestMessage & {
  isOptimistic: true;
  tempId: string;
  status: 'pending' | 'sending' | 'failed';
};

/**
 * Confirmed message type for testing
 */
export type ConfirmedTestMessage = BaseTestMessage & {
  isOptimistic: false;
  serverId: string;
  threadId: string;
  roundNumber: number;
};

/**
 * Union type for UI messages in tests
 */
export type TestUIMessage = OptimisticTestMessage | ConfirmedTestMessage;

/**
 * Creates an optimistic message for testing
 */
export function createOptimisticTestMessage(
  content: string,
  tempId: string,
): OptimisticTestMessage {
  return {
    id: tempId,
    tempId,
    role: 'user',
    content,
    createdAt: new Date(),
    isOptimistic: true,
    status: 'pending',
  };
}

/**
 * Creates a confirmed message for testing
 */
export function createConfirmedTestMessage(
  content: string,
  serverId: string,
  threadId: string,
  roundNumber: number,
): ConfirmedTestMessage {
  return {
    id: serverId,
    serverId,
    role: 'user',
    content,
    createdAt: new Date(),
    isOptimistic: false,
    threadId,
    roundNumber,
  };
}

// ============================================================================
// STREAM STATE FACTORIES (Complex Resumption)
// ============================================================================

/**
 * Stream state for resumption testing
 */
export type TestStreamState = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  currentParticipantIndex: number;
  completedParticipants: string[];
  pendingParticipants: string[];
  preSearchComplete: boolean;
  analysisComplete: boolean;
  messages: Array<{
    id: string;
    participantId: string;
    content: string;
    status: 'streaming' | 'complete' | 'error';
  }>;
  lastEventId: string;
  timestamp: number;
};

/**
 * KV stream data for resumption testing
 */
export type TestKVStreamData = {
  state: TestStreamState;
  events: Array<{
    id: string;
    type: string;
    data: unknown;
    timestamp: number;
  }>;
  metadata: {
    version: string;
    createdAt: number;
    updatedAt: number;
  };
};

/**
 * Creates test stream state for resumption testing
 */
export function createTestStreamState(
  overrides?: Partial<TestStreamState>,
): TestStreamState {
  return {
    streamId: 'stream-123',
    threadId: 'thread-123',
    roundNumber: 0,
    currentParticipantIndex: 0,
    completedParticipants: [],
    pendingParticipants: ['participant-0', 'participant-1'],
    preSearchComplete: false,
    analysisComplete: false,
    messages: [],
    lastEventId: '',
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Creates test KV stream data for resumption testing
 */
export function createTestKVStreamData(
  state?: Partial<TestStreamState>,
  overrides?: Partial<Omit<TestKVStreamData, 'state'>>,
): TestKVStreamData {
  const now = Date.now();
  return {
    state: createTestStreamState(state),
    events: [],
    metadata: {
      version: '1.0',
      createdAt: now,
      updatedAt: now,
    },
    ...overrides,
  };
}
