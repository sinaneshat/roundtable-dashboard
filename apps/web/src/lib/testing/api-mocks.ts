/**
 * API Response Mocks for Testing
 *
 * Type-safe mocks following Zod schema patterns from backend routes.
 */

import {
  ChatModes,
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  PreSearchStatuses,
  ThreadStatuses,
} from '@roundtable/shared';

import type { ApiMessage, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

// Response types for API mocks
export type ThreadDetailResponse = {
  success: boolean;
  data: {
    thread: ChatThread;
    participants: ChatParticipant[];
    messages: ApiMessage[];
    changelog: unknown[];
    user: {
      id: string;
      name: string;
      image: string | null;
    };
  };
};

export type MessagesListResponse = {
  success: boolean;
  data: {
    items: ApiMessage[];
    count: number;
  };
};

export type PreSearchListResponse = {
  success: boolean;
  data: {
    items: StoredPreSearch[];
    count: number;
  };
};

export function createBaseMockThread(overrides?: Partial<ChatThread>): ChatThread {
  const now = new Date().toISOString();

  return {
    id: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    userId: '35981ef3-3267-4af7-9fdb-2e3c47149c2c',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread-abc123',
    previousSlug: null,
    mode: ChatModes.DEBATING,
    status: ThreadStatuses.ACTIVE,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: false,
    metadata: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    ...overrides,
  };
}

export function createBaseMockParticipant(overrides?: Partial<ChatParticipant>): ChatParticipant {
  const now = new Date().toISOString();

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

export function createMockMessage(overrides?: Partial<ApiMessage>): ApiMessage {
  const now = new Date().toISOString();

  return {
    id: '01KA1K2GDR317P155TYWY6G4C0',
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    participantId: null,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: 'Test message' }],
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

export function createMockAssistantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  overrides?: Partial<ApiMessage>,
): ApiMessage {
  const now = new Date().toISOString();
  const participantId = `participant_${participantIndex}`;

  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    threadId,
    participantId,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text: `Response from participant ${participantIndex}` }],
    roundNumber,
    toolCalls: null,
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId,
      participantIndex,
      participantRole: null,
      model: 'gpt-4',
      finishReason: FinishReasons.STOP,
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

export function createMockThreadDetailResponse(
  threadOverrides?: Partial<ChatThread>,
  participantsOverrides?: Partial<ChatParticipant>[],
): ThreadDetailResponse {
  const thread = createBaseMockThread(threadOverrides);
  const participants = participantsOverrides
    ? participantsOverrides.map(p => createBaseMockParticipant({ ...p, threadId: thread.id }))
    : [createBaseMockParticipant({ threadId: thread.id })];

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

export function createMockMessagesListResponse(
  threadId: string,
  roundNumber: number = 0,
  participantCount: number = 1,
): MessagesListResponse {
  const messages: ApiMessage[] = [];

  messages.push(
    createMockMessage({
      id: `user_r${roundNumber}`,
      threadId,
      roundNumber,
      parts: [{ type: MessagePartTypes.TEXT, text: `User question for round ${roundNumber}` }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber,
      },
    }),
  );

  for (let i = 0; i < participantCount; i++) {
    messages.push(createMockAssistantMessage(threadId, roundNumber, i));
  }

  return {
    success: true,
    data: {
      items: messages,
      count: messages.length,
    },
  };
}

export function createMockPreSearch(overrides?: Partial<StoredPreSearch>): StoredPreSearch {
  const now = new Date().toISOString();

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
              score: 0.95,
            },
          ],
          responseTime: 100,
          index: 0,
        },
      ],
      summary: 'Test summary',
      totalResults: 1,
      totalTime: 100,
      successCount: 1,
      failureCount: 0,
    },
    errorMessage: null,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}

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
                    score: 0.95,
                    excerpt: 'Test content',
                    fullContent: includeFullContent ? 'Full article content with comprehensive information...' : undefined,
                    publishedDate: undefined,
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
                index: 0,
              },
            ],
            summary: 'Test summary',
            totalResults: 1,
            totalTime: 100,
            successCount: 1,
            failureCount: 0,
          },
          errorMessage: null,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      count: 1,
    },
  };
}
