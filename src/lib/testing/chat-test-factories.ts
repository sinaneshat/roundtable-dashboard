/**
 * Chat Store Test Factories
 *
 * Shared mock factories for chat store testing with test-friendly defaults.
 */

import type { MessageStatus, StreamStatus } from '@/api/core/enums';
import { ChatModes, MessageStatuses, StreamStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

import {
  createMockParticipant as createApiMockParticipant,
  createMockThread as createApiMockThread,
} from './api-mocks';

export function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return createApiMockThread({
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    mode: ChatModes.DEBATING,
    status: 'active',
    enableWebSearch: false,
    ...overrides,
  });
}

export function createMockParticipant(index: number, overrides?: Partial<ChatParticipant>): ChatParticipant {
  const models = ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'mistral-large'] as const;
  return createApiMockParticipant({
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: models[index % models.length],
    role: `Role ${index}`,
    priority: index,
    ...overrides,
  });
}

export function createMockParticipants(count: number, threadId = 'thread-123'): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => createMockParticipant(i, { threadId }));
}

export function createParticipantConfig(index: number, overrides?: Partial<ParticipantConfig>): ParticipantConfig {
  return {
    id: `participant-${index}`,
    modelId: `model-${index}`,
    role: `Role ${index}`,
    priority: index,
    ...overrides,
  };
}

export function createParticipantConfigs(count: number): ParticipantConfig[] {
  return Array.from({ length: count }, (_, i) => createParticipantConfig(i));
}

export function createMockStoredPreSearch(
  roundNumber: number,
  status: MessageStatus = MessageStatuses.COMPLETE,
  overrides?: Partial<StoredPreSearch>,
): StoredPreSearch {
  const isComplete = status === MessageStatuses.COMPLETE;

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
    errorMessage: null,
    createdAt: new Date(),
    completedAt: isComplete ? new Date() : null,
    ...overrides,
  } as StoredPreSearch;
}

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

export function generateStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

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

export type TestStoreState = {
  isStreaming: boolean;
  waitingToStartStreaming: boolean;
  streamingRoundNumber: number | null;
  currentParticipantIndex: number;
  currentRoundNumber: number | null;
  isModeratorStreaming: boolean;
  isWaitingForChangelog: boolean;
  hasSentPendingMessage: boolean;
  error: Error | null;
  preSearches: StoredPreSearch[];
  triggeredPreSearchRounds: Set<number>;
  createdModeratorRounds: Set<number>;
  triggeredModeratorRounds: Set<number>;
  triggeredModeratorIds: Set<string>;
};

export function createInitialStoreState(overrides?: Partial<TestStoreState>): TestStoreState {
  return {
    isStreaming: false,
    waitingToStartStreaming: false,
    streamingRoundNumber: null,
    currentParticipantIndex: 0,
    currentRoundNumber: null,
    isModeratorStreaming: false,
    isWaitingForChangelog: false,
    hasSentPendingMessage: false,
    error: null,
    preSearches: [],
    triggeredPreSearchRounds: new Set(),
    createdModeratorRounds: new Set(),
    triggeredModeratorRounds: new Set(),
    triggeredModeratorIds: new Set(),
    ...overrides,
  };
}

export type BaseTestMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
};

export type OptimisticTestMessage = BaseTestMessage & {
  isOptimistic: true;
  tempId: string;
  status: 'pending' | 'sending' | 'failed';
};

export type ConfirmedTestMessage = BaseTestMessage & {
  isOptimistic: false;
  serverId: string;
  threadId: string;
  roundNumber: number;
};

export type TestUIMessage = OptimisticTestMessage | ConfirmedTestMessage;

export function createOptimisticTestMessage(content: string, tempId: string): OptimisticTestMessage {
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

export type TestStreamState = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  currentParticipantIndex: number;
  completedParticipants: string[];
  pendingParticipants: string[];
  preSearchComplete: boolean;
  moderatorComplete: boolean;
  messages: Array<{
    id: string;
    participantId: string;
    content: string;
    status: 'streaming' | 'complete' | 'error';
  }>;
  lastEventId: string;
  timestamp: number;
};

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

export function createTestStreamState(overrides?: Partial<TestStreamState>): TestStreamState {
  return {
    streamId: 'stream-123',
    threadId: 'thread-123',
    roundNumber: 0,
    currentParticipantIndex: 0,
    completedParticipants: [],
    pendingParticipants: ['participant-0', 'participant-1'],
    preSearchComplete: false,
    moderatorComplete: false,
    messages: [],
    lastEventId: '',
    timestamp: Date.now(),
    ...overrides,
  };
}

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

export type TestModeratorMetrics = {
  engagement: number;
  insight: number;
  balance: number;
  clarity: number;
};

export type TestModeratorPayload = {
  summary: string;
  metrics: TestModeratorMetrics;
};

export function createMockModeratorMetrics(overrides?: Partial<TestModeratorMetrics>): TestModeratorMetrics {
  return {
    engagement: 85,
    insight: 78,
    balance: 82,
    clarity: 90,
    ...overrides,
  };
}

export function createMockModeratorPayload(overrides?: Partial<TestModeratorPayload>): TestModeratorPayload {
  return {
    summary: 'The participants provided diverse perspectives on the topic, reaching consensus on key factors.',
    metrics: createMockModeratorMetrics(),
    ...overrides,
  };
}

export function createPartialModeratorPayload(overrides?: Partial<TestModeratorPayload>): Partial<TestModeratorPayload> {
  return {
    ...overrides,
  };
}
