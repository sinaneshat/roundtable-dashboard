/**
 * API Response Mocks for Testing
 *
 * ✅ ZOD-FIRST PATTERN: All mocks follow backend schema structures
 * ✅ TYPE-SAFE: Uses inferred types from route schemas
 * ✅ COMPREHENSIVE: Covers all chat API endpoints
 *
 * These mocks simulate backend responses for testing store actions
 * and ensuring proper data flow from API → Store → UI State
 */

import { AnalysisStatuses, ChatModes, MessageRoles, PreSearchStatuses } from '@/api/core/enums';
import type {
  ChangelogListResponse,
  MessagesListResponse,
  ModeratorAnalysisListResponse,
  ParticipantDetailResponse,
  PreSearchListResponse,
  ThreadDetailResponse,
  ThreadListResponse,
} from '@/api/routes/chat/schema';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation/chat';

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Creates a mock chat thread with realistic data
 * ✅ FOLLOWS: ChatThread schema from database validation
 */
export function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  const now = new Date();

  return {
    id: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    userId: '35981ef3-3267-4af7-9fdb-2e3c47149c2c',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread-abc123',
    mode: ChatModes.DEBATING,
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: false,
    metadata: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    ...overrides,
  };
}

/**
 * Creates a mock chat participant
 * ✅ FOLLOWS: ChatParticipant schema from database validation
 */
export function createMockParticipant(overrides?: Partial<ChatParticipant>): ChatParticipant {
  const now = new Date();

  return {
    id: '01KA1K2GD9KG4KNC9GX1RJH288',
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    customRoleId: null,
    role: null,
    priority: 0,
    isEnabled: true,
    settings: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates a mock chat message
 * ✅ FOLLOWS: ChatMessage schema from database validation
 * ✅ 0-BASED INDEXING: Supports roundNumber: 0
 */
export function createMockMessage(overrides?: Partial<ChatMessage>): ChatMessage {
  const now = new Date();

  return {
    id: '01KA1K2GDR317P155TYWY6G4C0',
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    participantId: null,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: 'Test message' }],
    roundNumber: 0,
    toolCalls: null,
    metadata: {
      role: MessageRoles.USER,
      roundNumber: 0,
    },
    createdAt: now,
    ...overrides,
  };
}

/**
 * Creates a mock assistant message with complete metadata
 * ✅ FOLLOWS: DbAssistantMessageMetadata schema
 */
export function createMockAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  overrides?: Partial<ChatMessage>,
): ChatMessage {
  const now = new Date();
  const participantId = `participant_${participantIndex}`;

  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    threadId,
    participantId,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}` }],
    roundNumber,
    toolCalls: null,
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId,
      participantIndex,
      participantRole: null,
      model: 'gpt-4',
      finishReason: 'stop',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
    createdAt: now,
    ...overrides,
  };
}

// ============================================================================
// API Response Mocks
// ============================================================================

/**
 * Mock response for GET /chat/threads/:id
 * ✅ FOLLOWS: ThreadDetailResponseSchema
 */
export function createMockThreadDetailResponse(
  threadOverrides?: Partial<ChatThread>,
  participantsOverrides?: Partial<ChatParticipant>[],
): ThreadDetailResponse {
  const thread = createMockThread(threadOverrides);
  const participants = participantsOverrides
    ? participantsOverrides.map(p => createMockParticipant({ ...p, threadId: thread.id }))
    : [createMockParticipant({ threadId: thread.id })];

  return {
    success: true,
    data: {
      thread,
      participants,
    },
    error: null,
  };
}

/**
 * Mock response for GET /chat/threads
 * ✅ FOLLOWS: ThreadListResponseSchema with cursor pagination
 */
export function createMockThreadListResponse(
  threadsCount: number = 3,
): ThreadListResponse {
  const threads: ChatThread[] = [];
  for (let i = 0; i < threadsCount; i++) {
    threads.push(
      createMockThread({
        id: `thread_${i}`,
        title: `Thread ${i + 1}`,
        slug: `thread-${i + 1}-abc`,
        createdAt: new Date(Date.now() - i * 1000 * 60 * 60),
      }),
    );
  }

  return {
    success: true,
    data: {
      items: threads,
      pagination: {
        nextCursor: null,
        hasMore: false,
      },
    },
    error: null,
  };
}

/**
 * Mock response for GET /chat/threads/:id/messages
 * ✅ FOLLOWS: MessagesListResponseSchema
 * ✅ INCLUDES: Complete round (user + assistant messages)
 */
export function createMockMessagesListResponse(
  threadId: string,
  roundNumber: number = 0,
  participantCount: number = 1,
): MessagesListResponse {
  const messages: ChatMessage[] = [];

  // User message
  messages.push(
    createMockMessage({
      id: `user_r${roundNumber}`,
      threadId,
      roundNumber,
      parts: [{ type: 'text', text: `User question for round ${roundNumber}` }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber,
      },
    }),
  );

  // Participant responses
  for (let i = 0; i < participantCount; i++) {
    messages.push(createMockAssistantMessage(threadId, roundNumber, i));
  }

  return {
    success: true,
    data: {
      messages,
    },
    error: null,
  };
}

/**
 * Mock response for GET /chat/threads/:id/participants (single participant)
 * ✅ FOLLOWS: ParticipantDetailResponseSchema
 */
export function createMockParticipantDetailResponse(
  participantOverrides?: Partial<ChatParticipant>,
): ParticipantDetailResponse {
  return {
    success: true,
    data: createMockParticipant(participantOverrides),
    error: null,
  };
}

/**
 * Mock response for GET /chat/threads/:id/changelog
 * ✅ FOLLOWS: ChangelogListResponseSchema
 */
export function createMockChangelogListResponse(): ChangelogListResponse {
  return {
    success: true,
    data: {
      changes: [],
    },
    error: null,
  };
}

/**
 * Mock response for GET /chat/threads/:id/analyses
 * ✅ FOLLOWS: ModeratorAnalysisListResponseSchema
 * ✅ 0-BASED INDEXING: Analysis for round 0
 */
export function createMockAnalysesListResponse(
  threadId: string,
  roundNumber: number = 0,
): ModeratorAnalysisListResponse {
  return {
    success: true,
    data: {
      analyses: [
        {
          id: `analysis_${threadId}_${roundNumber}`,
          threadId,
          roundNumber,
          mode: ChatModes.DEBATING,
          userQuestion: `Question for round ${roundNumber}`,
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [`${threadId}_r${roundNumber}_p0`],
          analysisData: {
            roundNumber,
            mode: ChatModes.DEBATING,
            userQuestion: `Question for round ${roundNumber}`,
            participantAnalyses: [
              {
                participantIndex: 0,
                participantRole: null,
                modelId: 'gpt-4',
                modelName: 'GPT-4',
                overallRating: 8,
                skillsMatrix: [
                  { skillName: 'Argument Strength', rating: 8 },
                  { skillName: 'Counter-Arguments', rating: 7 },
                ],
                pros: ['Good reasoning'],
                cons: ['Could be more detailed'],
                summary: 'Solid response',
              },
            ],
            leaderboard: [
              {
                rank: 1,
                participantIndex: 0,
                participantRole: null,
                modelId: 'gpt-4',
                modelName: 'GPT-4',
                overallRating: 8,
                badge: 'Best Argument',
              },
            ],
            roundSummary: {
              keyInsights: ['Insight 1'],
              consensusPoints: ['Agreement on X'],
              divergentApproaches: [],
              comparativeAnalysis: {
                strengthsByCategory: [{ category: 'Logic', participants: ['GPT-4'] }],
                tradeoffs: ['Trade-off 1'],
              },
              decisionFramework: {
                criteriaToConsider: ['Criterion 1'],
                scenarioRecommendations: [
                  { scenario: 'Scenario A', recommendation: 'Use approach X' },
                ],
              },
              overallSummary: 'Good discussion overall',
              conclusion: 'Concluded successfully',
              recommendedActions: [],
            },
          },
          errorMessage: null,
          createdAt: new Date(),
          completedAt: new Date(),
        },
      ],
    },
    error: null,
  };
}

/**
 * Mock response for GET /chat/threads/:id/pre-searches
 * ✅ FOLLOWS: PreSearchListResponseSchema
 */
export function createMockPreSearchesListResponse(
  threadId: string,
  roundNumber: number = 0,
): PreSearchListResponse {
  return {
    success: true,
    data: {
      preSearches: [
        {
          id: `presearch_${threadId}_${roundNumber}`,
          threadId,
          roundNumber,
          userQuestion: `Question for round ${roundNumber}`,
          status: PreSearchStatuses.COMPLETE,
          searchData: {
            searchQuery: 'test search query',
            results: [
              {
                title: 'Test Result',
                url: 'https://example.com',
                snippet: 'Test snippet',
              },
            ],
          },
          errorMessage: null,
          createdAt: new Date(),
          completedAt: new Date(),
        },
      ],
    },
    error: null,
  };
}

// ============================================================================
// Mock Fetch Helpers
// ============================================================================

/**
 * Creates a mock fetch response for successful API calls
 * ✅ PATTERN: Mimics backend API response format
 */
export function createMockFetchResponse<T>(data: T, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  } as Response;
}

/**
 * Creates a mock fetch error response
 * ✅ PATTERN: Mimics backend error response format
 */
export function createMockFetchError(
  message: string,
  status: number = 400,
): Response {
  return createMockFetchResponse(
    {
      success: false,
      data: null,
      error: {
        message,
        code: 'TEST_ERROR',
      },
    },
    status,
  );
}
