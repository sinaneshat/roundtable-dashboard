/**
 * Chat Store Test Factories
 *
 * Shared mock factories for chat store testing with test-friendly defaults.
 */

import type { MessageStatus, StreamStatus } from '@roundtable/shared';
import { ChatModes, MessageStatuses, StreamStatuses, ThreadStatuses, UIMessageRoles } from '@roundtable/shared';

import type { ParticipantConfig } from '@/lib/schemas';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

import { createBaseMockParticipant, createBaseMockThread } from './api-mocks';

export function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return createBaseMockThread({
    enableWebSearch: false,
    id: 'thread-123',
    mode: ChatModes.DEBATING,
    status: ThreadStatuses.ACTIVE,
    title: 'Test Thread',
    userId: 'user-123',
    ...overrides,
  });
}

export function createMockParticipant(index: number, overrides?: Partial<ChatParticipant>): ChatParticipant {
  const models = ['gpt-4o', 'claude-3-opus', 'gemini-pro', 'mistral-large'] as const;
  return createBaseMockParticipant({
    id: `participant-${index}`,
    modelId: models[index % models.length],
    priority: index,
    role: `Role ${index}`,
    threadId: 'thread-123',
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
    priority: index,
    role: `Role ${index}`,
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
    completedAt: isComplete ? new Date() : null,
    createdAt: new Date(),
    errorMessage: null,
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
    ...overrides,
  } as StoredPreSearch;
}

export function generateStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

export function createStreamKVEntry(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  status: StreamStatus = StreamStatuses.ACTIVE,
  overrides?: {
    messageId?: string;
    createdAt?: string;
    completedAt?: string;
    errorMessage?: string;
  },
) {
  const streamId = generateStreamId(threadId, roundNumber, participantIndex);
  return {
    createdAt: new Date().toISOString(),
    participantIndex,
    roundNumber,
    status,
    streamId,
    threadId,
    ...overrides,
  };
}

export function createInitialStoreState(overrides?: {
  isStreaming?: boolean;
  waitingToStartStreaming?: boolean;
  streamingRoundNumber?: number | null;
  currentParticipantIndex?: number;
  currentRoundNumber?: number | null;
  isModeratorStreaming?: boolean;
  isWaitingForChangelog?: boolean;
  hasSentPendingMessage?: boolean;
  error?: Error | null;
  preSearches?: StoredPreSearch[];
  triggeredPreSearchRounds?: Set<number>;
  createdModeratorRounds?: Set<number>;
  triggeredModeratorRounds?: Set<number>;
  triggeredModeratorIds?: Set<string>;
}) {
  return {
    createdModeratorRounds: new Set(),
    currentParticipantIndex: 0,
    currentRoundNumber: null,
    error: null,
    hasSentPendingMessage: false,
    isModeratorStreaming: false,
    isStreaming: false,
    isWaitingForChangelog: false,
    preSearches: [],
    streamingRoundNumber: null,
    triggeredModeratorIds: new Set(),
    triggeredModeratorRounds: new Set(),
    triggeredPreSearchRounds: new Set(),
    waitingToStartStreaming: false,
    ...overrides,
  };
}

export function createOptimisticTestMessage(content: string, tempId: string) {
  return {
    content,
    createdAt: new Date(),
    id: tempId,
    isOptimistic: true as const,
    role: UIMessageRoles.USER,
    status: MessageStatuses.PENDING,
    tempId,
  };
}

export function createConfirmedTestMessage(
  content: string,
  serverId: string,
  threadId: string,
  roundNumber: number,
) {
  return {
    content,
    createdAt: new Date(),
    id: serverId,
    isOptimistic: false as const,
    role: UIMessageRoles.USER,
    roundNumber,
    serverId,
    threadId,
  };
}

export function createTestStreamState(overrides?: {
  streamId?: string;
  threadId?: string;
  roundNumber?: number;
  currentParticipantIndex?: number;
  completedParticipants?: string[];
  pendingParticipants?: string[];
  preSearchComplete?: boolean;
  moderatorComplete?: boolean;
  messages?: {
    id: string;
    participantId: string;
    content: string;
    status: 'streaming' | 'complete' | 'error';
  }[];
  lastEventId?: string;
  timestamp?: number;
}) {
  return {
    completedParticipants: [],
    currentParticipantIndex: 0,
    lastEventId: '',
    messages: [],
    moderatorComplete: false,
    pendingParticipants: ['participant-0', 'participant-1'],
    preSearchComplete: false,
    roundNumber: 0,
    streamId: 'stream-123',
    threadId: 'thread-123',
    timestamp: Date.now(),
    ...overrides,
  };
}

export function createTestKVStreamData(
  state?: Parameters<typeof createTestStreamState>[0],
  overrides?: {
    events?: {
      id: string;
      type: string;
      data: unknown;
      timestamp: number;
    }[];
    metadata?: {
      version: string;
      createdAt: number;
      updatedAt: number;
    };
  },
) {
  const now = Date.now();
  return {
    events: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      version: '1.0',
    },
    state: createTestStreamState(state),
    ...overrides,
  };
}

export function createMockModeratorMetrics(overrides?: {
  engagement?: number;
  insight?: number;
  balance?: number;
  clarity?: number;
}) {
  return {
    balance: 82,
    clarity: 90,
    engagement: 85,
    insight: 78,
    ...overrides,
  };
}

export function createMockModeratorPayload(overrides?: {
  summary?: string;
  metrics?: ReturnType<typeof createMockModeratorMetrics>;
}) {
  return {
    metrics: createMockModeratorMetrics(),
    summary: 'The participants provided diverse perspectives on the topic, reaching consensus on key factors.',
    ...overrides,
  };
}

export type TestModeratorMetrics = ReturnType<typeof createMockModeratorMetrics>;

export function createPartialModeratorPayload(overrides?: {
  summary?: string;
  metrics?: Partial<TestModeratorMetrics>;
}) {
  return {
    ...overrides,
  };
}
