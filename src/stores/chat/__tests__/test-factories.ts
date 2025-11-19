/**
 * Test Mock Factories - Type-Safe Test Data Generation
 *
 * Following type-inference-patterns.md: All types inferred from schemas
 * NO `any`, NO `unknown`, NO loose `Partial<>` usage
 *
 * **Pattern**:
 * 1. Import actual types from schemas
 * 2. Create factories with ALL required fields
 * 3. Allow overrides via Partial<> parameter
 * 4. Use enum constants for all status fields
 *
 * Location: /src/stores/chat/__tests__/test-factories.ts
 */

import type { UIMessage } from 'ai';

import {
  AnalysisStatuses,
  ChatModes,
  PreSearchStatuses,
  ThreadStatuses,
} from '@/api/core/enums';
import type {
  ChatParticipant,
  ChatThread,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

// ============================================================================
// Chat Thread Factories
// ============================================================================

/**
 * Create mock ChatThread with all required fields
 */
export function createMockThread(
  overrides?: Partial<ChatThread>,
): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-456',
    title: 'Test Thread',
    slug: 'test-thread-slug',
    isAiGeneratedTitle: false,
    mode: ChatModes.DEBATING,
    enableWebSearch: false,
    status: ThreadStatuses.ACTIVE,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Analysis Factories
// ============================================================================

/**
 * Create mock StoredModeratorAnalysis with all required fields
 * Uses AnalysisStatuses enum for type-safe status
 */
export function createMockAnalysis(
  overrides?: Partial<StoredModeratorAnalysis>,
): StoredModeratorAnalysis {
  return {
    id: 'analysis-1',
    threadId: 'thread-123',
    roundNumber: 0,
    mode: ChatModes.DEBATING,
    userQuestion: 'What is the best approach?',
    status: AnalysisStatuses.COMPLETE,
    analysisData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock analysis in PENDING status
 */
export function createPendingAnalysis(
  roundNumber = 0,
): StoredModeratorAnalysis {
  return createMockAnalysis({
    roundNumber,
    status: AnalysisStatuses.PENDING,
    analysisData: null,
  });
}

/**
 * Create mock analysis in STREAMING status
 */
export function createStreamingAnalysis(
  roundNumber = 0,
): StoredModeratorAnalysis {
  return createMockAnalysis({
    roundNumber,
    status: AnalysisStatuses.STREAMING,
    analysisData: null,
    createdAt: new Date(Date.now() - 5000), // 5 seconds ago
  });
}

/**
 * Create mock analysis that has timed out (>60s streaming)
 */
export function createTimedOutAnalysis(
  roundNumber = 0,
): StoredModeratorAnalysis {
  return createMockAnalysis({
    roundNumber,
    status: AnalysisStatuses.STREAMING,
    createdAt: new Date(Date.now() - 61000), // 61 seconds ago
  });
}

// ============================================================================
// Pre-Search Factories
// ============================================================================

/**
 * Create mock StoredPreSearch with all required fields
 * Uses PreSearchStatuses enum for type-safe status
 */
export function createMockPreSearch(
  overrides?: Partial<StoredPreSearch>,
): StoredPreSearch {
  return {
    id: 'pre-search-1',
    threadId: 'thread-123',
    roundNumber: 0,
    userQuery: 'What is the weather?',
    status: PreSearchStatuses.COMPLETE,
    searchData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock pre-search in PENDING status
 */
export function createPendingPreSearch(
  roundNumber = 0,
): StoredPreSearch {
  return createMockPreSearch({
    roundNumber,
    status: PreSearchStatuses.IDLE,
  });
}

/**
 * Create mock pre-search in STREAMING status
 */
export function createStreamingPreSearch(
  roundNumber = 0,
): StoredPreSearch {
  return createMockPreSearch({
    roundNumber,
    status: PreSearchStatuses.STREAMING,
  });
}

// ============================================================================
// Participant Factories
// ============================================================================

/**
 * Create mock ChatParticipant with all required fields
 */
export function createMockParticipant(
  participantIndex: number,
  overrides?: Partial<ChatParticipant>,
): ChatParticipant {
  return {
    id: `participant-${participantIndex}`,
    threadId: 'thread-123',
    modelId: 'openai/gpt-4',
    role: null,
    priority: participantIndex,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock ParticipantConfig (frontend representation)
 */
export function createMockParticipantConfig(
  participantIndex: number,
  overrides?: Partial<ParticipantConfig>,
): ParticipantConfig {
  return {
    participantIndex,
    modelId: 'openai/gpt-4',
    role: null,
    ...overrides,
  };
}

// ============================================================================
// Message Factories
// ============================================================================

/**
 * Create mock UIMessage (AI SDK type)
 */
export function createMockMessage(
  participantIndex: number,
  roundNumber: number,
  overrides?: Partial<UIMessage>,
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: `Response from participant ${participantIndex}`,
      },
    ],
    metadata: {
      role: 'participant',
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: 'openai/gpt-4',
    },
    ...overrides,
  };
}

/**
 * Create mock user message
 */
export function createMockUserMessage(
  roundNumber: number,
  text = 'Test question',
): UIMessage {
  return {
    id: `user-msg-${roundNumber}`,
    role: 'user',
    parts: [
      {
        type: 'text',
        text,
      },
    ],
    metadata: {
      role: 'user',
      roundNumber,
    },
  };
}

// ============================================================================
// Utility Factories
// ============================================================================

/**
 * Create multiple participants
 */
export function createMockParticipants(count: number): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => createMockParticipant(i));
}

/**
 * Create multiple participant configs
 */
export function createMockParticipantConfigs(count: number): ParticipantConfig[] {
  return Array.from({ length: count }, (_, i) => createMockParticipantConfig(i));
}

/**
 * Create complete round of messages (user + all participants)
 */
export function createMockRoundMessages(
  roundNumber: number,
  participantCount: number,
): UIMessage[] {
  return [
    createMockUserMessage(roundNumber),
    ...Array.from({ length: participantCount }, (_, i) =>
      createMockMessage(i, roundNumber)),
  ];
}
