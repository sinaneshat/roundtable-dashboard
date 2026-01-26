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
    createdAt: now,
    enableWebSearch: false,
    id: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: now,
    metadata: {},
    mode: ChatModes.DEBATING,
    previousSlug: null,
    projectId: null,
    slug: 'test-thread-abc123',
    status: ThreadStatuses.ACTIVE,
    title: 'Test Thread',
    updatedAt: now,
    userId: '35981ef3-3267-4af7-9fdb-2e3c47149c2c',
    version: 1,
    ...overrides,
  };
}

export function createBaseMockParticipant(overrides?: Partial<ChatParticipant>): ChatParticipant {
  const now = new Date().toISOString();

  return {
    createdAt: now,
    customRoleId: null,
    id: '01KA1K2GD9KG4KNC9GX1RJH288',
    isEnabled: true,
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    priority: 0,
    role: null,
    settings: null,
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    updatedAt: now,
    ...overrides,
  };
}

export function createMockMessage(overrides?: Partial<ApiMessage>): ApiMessage {
  const now = new Date().toISOString();

  return {
    createdAt: now,
    id: '01KA1K2GDR317P155TYWY6G4C0',
    metadata: {
      role: MessageRoles.USER,
      roundNumber: 0,
    },
    participantId: null,
    parts: [{ text: 'Test message', type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
    roundNumber: 0,
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    toolCalls: null,
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
    createdAt: now,
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason: FinishReasons.STOP,
      hasError: false,
      isPartialResponse: false,
      isTransient: false,
      model: 'gpt-4',
      participantId,
      participantIndex,
      participantRole: null,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: {
        completionTokens: 50,
        promptTokens: 100,
        totalTokens: 150,
      },
    },
    participantId,
    parts: [{ text: `Response from participant ${participantIndex}`, type: MessagePartTypes.TEXT }],
    role: MessageRoles.ASSISTANT,
    roundNumber,
    threadId,
    toolCalls: null,
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
    data: {
      changelog: [],
      messages: [],
      participants,
      thread,
      user: {
        id: '35981ef3-3267-4af7-9fdb-2e3c47149c2c',
        image: null,
        name: 'Test User',
      },
    },
    success: true,
  };
}

export function createMockMessagesListResponse(
  threadId: string,
  roundNumber = 0,
  participantCount = 1,
): MessagesListResponse {
  const messages: ApiMessage[] = [];

  messages.push(
    createMockMessage({
      id: `user_r${roundNumber}`,
      metadata: {
        role: MessageRoles.USER,
        roundNumber,
      },
      parts: [{ text: `User question for round ${roundNumber}`, type: MessagePartTypes.TEXT }],
      roundNumber,
      threadId,
    }),
  );

  for (let i = 0; i < participantCount; i++) {
    messages.push(createMockAssistantMessage(threadId, roundNumber, i));
  }

  return {
    data: {
      count: messages.length,
      items: messages,
    },
    success: true,
  };
}

export function createMockPreSearch(overrides?: Partial<StoredPreSearch>): StoredPreSearch {
  const now = new Date().toISOString();

  return {
    completedAt: now,
    createdAt: now,
    errorMessage: null,
    id: 'presearch_test_123',
    roundNumber: 0,
    searchData: {
      failureCount: 0,
      queries: [
        {
          index: 0,
          query: 'test query',
          rationale: 'Test rationale',
          searchDepth: 'basic' as const,
          total: 1,
        },
      ],
      results: [
        {
          answer: 'Test answer',
          index: 0,
          query: 'test query',
          responseTime: 100,
          results: [
            {
              content: 'Test content',
              score: 0.95,
              title: 'Test Result',
              url: 'https://example.com',
            },
          ],
        },
      ],
      successCount: 1,
      summary: 'Test summary',
      totalResults: 1,
      totalTime: 100,
    },
    status: PreSearchStatuses.COMPLETE,
    threadId: '01KA1K2GD2PP0BJH2VZ9J6QRBA',
    userQuery: 'Test search query',
    ...overrides,
  };
}

export function createMockPreSearchesListResponse(
  threadId: string,
  roundNumber = 0,
  options?: {
    includeFullContent?: boolean;
    includeMetadata?: boolean;
    includeAnswer?: boolean;
  },
): PreSearchListResponse {
  const { includeAnswer = false, includeFullContent = false, includeMetadata = false } = options || {};

  return {
    data: {
      count: 1,
      items: [
        {
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          errorMessage: null,
          id: `presearch_${threadId}_${roundNumber}`,
          roundNumber,
          searchData: {
            failureCount: 0,
            queries: [
              {
                index: 0,
                query: 'test search query',
                rationale: 'Test rationale',
                searchDepth: 'basic' as const,
                total: 1,
              },
            ],
            results: [
              {
                answer: includeAnswer ? 'AI-generated answer based on search results' : 'Test answer',
                index: 0,
                query: 'test search query',
                responseTime: 100,
                results: [
                  {
                    content: 'Test content',
                    domain: 'example.com',
                    excerpt: 'Test content',
                    fullContent: includeFullContent ? 'Full article content with comprehensive information...' : undefined,
                    metadata: includeMetadata
                      ? {
                          author: 'Test Author',
                          description: 'Test article description',
                          faviconUrl: 'https://example.com/favicon.ico',
                          imageUrl: 'https://example.com/image.jpg',
                          readingTime: 5,
                          wordCount: 1000,
                        }
                      : undefined,
                    publishedDate: undefined,
                    score: 0.95,
                    title: 'Test Result',
                    url: 'https://example.com',
                  },
                ],
              },
            ],
            successCount: 1,
            summary: 'Test summary',
            totalResults: 1,
            totalTime: 100,
          },
          status: PreSearchStatuses.COMPLETE,
          threadId,
          userQuery: `Question for round ${roundNumber}`,
        },
      ],
    },
    success: true,
  };
}
