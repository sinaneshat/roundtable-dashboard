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

import { AnalysisStatuses, ChatModes, ConfidenceWeightings, MessageRoles, PreSearchStatuses, ThreadStatuses } from '@/api/core/enums';
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
          analysisData: {
            roundConfidence: 78,
            confidenceWeighting: ConfidenceWeightings.BALANCED,
            consensusEvolution: [
              { phase: 'opening', percentage: 32, label: 'Opening' },
              { phase: 'rebuttal', percentage: 58, label: 'Rebuttal' },
              { phase: 'cross_exam', percentage: 65, label: 'Cross-Exam' },
              { phase: 'synthesis', percentage: 72, label: 'Synthesis' },
              { phase: 'final_vote', percentage: 78, label: 'Final Vote' },
            ],
            summary: 'Good discussion overall with solid reasoning',
            recommendations: [
              { title: 'Expand market research', description: 'Consider broader competitive analysis' },
            ],
            contributorPerspectives: [
              {
                participantIndex: 0,
                role: 'Analyst',
                modelId: 'gpt-4',
                modelName: 'GPT-4',
                scorecard: {
                  logic: 85,
                  riskAwareness: 75,
                  creativity: 70,
                  evidence: 80,
                  consensus: 75,
                },
                stance: 'Solid response with good reasoning',
                evidence: ['Good reasoning', 'Strong arguments'],
                vote: 'approve',
              },
            ],
            consensusAnalysis: {
              alignmentSummary: {
                totalClaims: 3,
                majorAlignment: 2,
                contestedClaims: 1,
                contestedClaimsList: [{ claim: 'Contested point', status: 'contested' }],
              },
              agreementHeatmap: [
                {
                  claim: 'Market timing is critical',
                  // ✅ FIX: Changed from record to array for Anthropic compatibility
                  perspectives: [{ modelName: 'GPT-4', status: 'agree' as const }],
                },
              ],
              // ✅ FIX: Changed from record to array for Anthropic compatibility
              argumentStrengthProfile: [
                {
                  modelName: 'Analyst',
                  logic: 85,
                  riskAwareness: 75,
                  creativity: 70,
                  evidence: 80,
                  consensus: 75,
                },
              ],
            },
            evidenceAndReasoning: {
              reasoningThreads: [
                {
                  claim: 'Market timing matters',
                  synthesis: 'Strong agreement on timing importance',
                },
              ],
              evidenceCoverage: [
                { claim: 'Market timing', strength: 'strong', percentage: 85 },
              ],
            },
            alternatives: [
              { scenario: 'Delayed launch', confidence: 65 },
            ],
            roundSummary: {
              participation: {
                approved: 1,
                cautioned: 0,
                rejected: 0,
              },
              keyThemes: 'Good discussion overall',
              unresolvedQuestions: ['Competitive response timing'],
              generated: new Date().toISOString(),
            },
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
 * ✅ INCLUDES: All Multi-AI Deliberation Framework fields
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
    analysisData: {
      roundConfidence: 78,
      confidenceWeighting: ConfidenceWeightings.BALANCED,
      consensusEvolution: [
        { phase: 'opening', percentage: 32, label: 'Opening' },
        { phase: 'rebuttal', percentage: 58, label: 'Rebuttal' },
        { phase: 'cross_exam', percentage: 65, label: 'Cross-Exam' },
        { phase: 'synthesis', percentage: 72, label: 'Synthesis' },
        { phase: 'final_vote', percentage: 78, label: 'Final Vote' },
      ],
      summary: '',
      recommendations: [],
      contributorPerspectives: [],
      consensusAnalysis: {
        alignmentSummary: {
          totalClaims: 0,
          majorAlignment: 0,
          contestedClaims: 0,
          contestedClaimsList: [],
        },
        agreementHeatmap: [],
        // ✅ FIX: Changed from record to array for Anthropic compatibility
        argumentStrengthProfile: [],
      },
      evidenceAndReasoning: {
        reasoningThreads: [],
        evidenceCoverage: [],
      },
      alternatives: [],
      roundSummary: {
        participation: {
          approved: 0,
          cautioned: 0,
          rejected: 0,
        },
        keyThemes: '',
        unresolvedQuestions: [],
        generated: new Date().toISOString(),
      },
    },
    errorMessage: null,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}
