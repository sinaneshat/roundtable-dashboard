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

import { AnalysisStatuses, ChatModes, MessageRoles, PreSearchStatuses, ResolutionTypes, StanceTypes, ThreadStatuses } from '@/api/core/enums';
import type {
  ChangelogListResponse,
  MessagesListResponse,
  ModeratorAnalysisListResponse,
  ModeratorAnalysisPayload,
  ParticipantDetailResponse,
  PreSearchListResponse,
  StoredPreSearch,
  ThreadDetailResponse,
  ThreadListResponse,
} from '@/api/routes/chat/schema';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/db/validation/chat';

// ============================================================================
// TYPE-SAFE MOCK ANALYSIS DATA
// ============================================================================

/**
 * ✅ TYPE-SAFE: Mock analysis data validated against ModeratorAnalysisPayload
 * If schema changes, this will cause a compile error - preventing silent drift
 */
function createTypeSafeAnalysisData(overrides?: Partial<Omit<ModeratorAnalysisPayload, 'roundNumber' | 'mode' | 'userQuestion'>>): Omit<ModeratorAnalysisPayload, 'roundNumber' | 'mode' | 'userQuestion'> {
  return {
    article: {
      headline: 'Consensus reached on market timing strategy',
      narrative: 'Good discussion overall with solid reasoning. The panel reached agreement on key market timing factors while acknowledging some areas of uncertainty.',
      keyTakeaway: 'Proceed with market analysis before final decision',
    },
    modelVoices: [
      {
        modelName: 'GPT-4',
        modelId: 'gpt-4',
        participantIndex: 0,
        role: 'Analyst',
        position: 'Solid response with good reasoning',
        keyContribution: 'Provided market analysis framework',
        notableQuote: 'Market timing is critical for success',
      },
    ],
    consensusTable: [
      {
        topic: 'Market timing is favorable',
        positions: [
          { modelName: 'GPT-4', stance: StanceTypes.AGREE, brief: 'Window closing by Q3' },
        ],
        resolution: ResolutionTypes.CONSENSUS,
      },
    ],
    minorityViews: [],
    convergenceDivergence: {
      convergedOn: ['Market timing importance', 'Competitive analysis needed'],
      divergedOn: ['Competitive response timing'],
      evolved: [],
    },
    recommendations: [
      { title: 'Expand market research', description: 'Consider broader competitive analysis' },
    ],
    confidence: {
      overall: 78,
      reasoning: 'Strong agreement on core strategy with minor open questions',
    },
    ...overrides,
  };
}

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
    previousSlug: null, // ✅ BACKWARDS COMPATIBLE SLUGS
    mode: ChatModes.DEBATING,
    status: ThreadStatuses.ACTIVE,
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
      messages: [],
      changelog: [],
      user: {
        id: '35981ef3-3267-4af7-9fdb-2e3c47149c2c',
        name: 'Test User',
        image: null,
      },
    },
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
        count: threads.length,
      },
    },
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
      count: messages.length,
    },
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
    data: {
      participant: createMockParticipant(participantOverrides),
    },
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
      items: [],
      count: 0,
    },
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
      items: [
        {
          id: `analysis_${threadId}_${roundNumber}`,
          threadId,
          roundNumber,
          mode: ChatModes.DEBATING,
          userQuestion: `Question for round ${roundNumber}`,
          status: AnalysisStatuses.COMPLETE,
          participantMessageIds: [`${threadId}_r${roundNumber}_p0`],
          // ✅ TYPE-SAFE: Uses createTypeSafeAnalysisData helper
          analysisData: createTypeSafeAnalysisData(),
          errorMessage: null,
          createdAt: new Date(),
          completedAt: new Date(),
        },
      ],
      count: 1,
    },
  };
}

/**
 * Creates a single mock StoredPreSearch for testing
 * ✅ FOLLOWS: StoredPreSearchSchema
 */
export function createMockPreSearch(overrides?: Partial<StoredPreSearch>): StoredPreSearch {
  const now = new Date();

  return {
    id: 'presearch_test_123',
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    roundNumber: 0,
    userQuery: 'Test search query',
    status: PreSearchStatuses.COMPLETE,
    searchData: {
      queries: [
        {
          query: 'test query',
          rationale: 'Test rationale',
          searchDepth: 'basic' as const,
          index: 0,
          total: 1,
        },
      ],
      results: [
        {
          query: 'test query',
          answer: 'Test answer',
          results: [
            {
              title: 'Test Result',
              url: 'https://example.com',
              content: 'Test content',
              score: 0.9,
            },
          ],
          responseTime: 100,
        },
      ],
      analysis: 'Test analysis summary',
      successCount: 1,
      failureCount: 0,
      totalResults: 1,
      totalTime: 100,
    },
    errorMessage: null,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}

/**
 * Mock response for GET /chat/threads/:id/pre-searches
 * ✅ FOLLOWS: PreSearchListResponseSchema
 * ✅ ENHANCED: Supports Tavily-like features (fullContent, metadata, etc.)
 */
export function createMockPreSearchesListResponse(
  threadId: string,
  roundNumber: number = 0,
  options?: {
    includeFullContent?: boolean;
    includeMetadata?: boolean;
    includeAnswer?: boolean;
  },
): PreSearchListResponse {
  const { includeFullContent = false, includeMetadata = false, includeAnswer = false } = options || {};

  return {
    success: true,
    data: {
      items: [
        {
          id: `presearch_${threadId}_${roundNumber}`,
          threadId,
          roundNumber,
          userQuery: `Question for round ${roundNumber}`,
          status: PreSearchStatuses.COMPLETE,
          searchData: {
            queries: [
              {
                query: 'test search query',
                rationale: 'Test rationale',
                searchDepth: 'basic' as const,
                index: 0,
                total: 1,
              },
            ],
            results: [
              {
                query: 'test search query',
                answer: includeAnswer ? 'AI-generated answer based on search results' : 'Test answer',
                results: [
                  {
                    title: 'Test Result',
                    url: 'https://example.com',
                    content: 'Test content',
                    excerpt: 'Test content',
                    fullContent: includeFullContent ? 'Full article content with comprehensive information...' : undefined,
                    score: 0.9,
                    publishedDate: null,
                    domain: 'example.com',
                    metadata: includeMetadata
                      ? {
                          author: 'Test Author',
                          readingTime: 5,
                          wordCount: 1000,
                          description: 'Test article description',
                          imageUrl: 'https://example.com/image.jpg',
                          faviconUrl: 'https://example.com/favicon.ico',
                        }
                      : undefined,
                  },
                ],
                responseTime: 100,
              },
            ],
            analysis: 'Test analysis',
            successCount: 1,
            failureCount: 0,
            totalResults: 1,
            totalTime: 100,
          },
          errorMessage: null,
          createdAt: new Date(),
          completedAt: new Date(),
        },
      ],
      count: 1,
    },
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

/**
 * Create a mock StoredModeratorAnalysis for testing
 * ✅ FOLLOWS: StoredModeratorAnalysis schema
 * ✅ TYPE-SAFE: Uses createTypeSafeAnalysisData helper - schema drift causes compile error
 */
export function createMockAnalysis(overrides?: Partial<import('@/api/routes/chat/schema').StoredModeratorAnalysis>): import('@/api/routes/chat/schema').StoredModeratorAnalysis {
  const now = new Date();

  return {
    id: 'analysis_test_123',
    threadId: 'thread_123',
    roundNumber: 0,
    mode: ChatModes.DEBATING,
    userQuestion: 'Test question',
    status: AnalysisStatuses.COMPLETE,
    participantMessageIds: [],
    // ✅ TYPE-SAFE: Uses createTypeSafeAnalysisData helper
    analysisData: createTypeSafeAnalysisData({
      article: {
        headline: 'Test analysis headline',
        narrative: 'Test analysis narrative with comprehensive discussion summary.',
        keyTakeaway: 'Test key takeaway for quick scanning',
      },
      modelVoices: [
        {
          modelName: 'GPT-4',
          modelId: 'gpt-4',
          participantIndex: 0,
          role: 'Analyst',
          position: 'Test position statement',
          keyContribution: 'Test key contribution',
          notableQuote: 'Test notable quote',
        },
      ],
      confidence: {
        overall: 78,
        reasoning: 'Test confidence reasoning',
      },
    }),
    errorMessage: null,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}
