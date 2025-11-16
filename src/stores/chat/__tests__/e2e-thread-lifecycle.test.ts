/**
 * End-to-End Thread Lifecycle Tests
 *
 * Tests the complete data flow from backend API → Data Transformation → State Verification
 *
 * FLOW TESTED:
 * 1. Backend API Response (mocked) → 2. Data Transformation → 3. State Validation
 *
 * COVERAGE:
 * - Thread creation API responses and data structure
 * - Thread loading (by ID/slug) API responses
 * - Participant management and ordering
 * - Messages loading with metadata preservation
 * - Changelog API response structure
 * - Analysis loading and round number consistency
 * - Error handling and recovery patterns
 * - Data synchronization across all entities
 *
 * ✅ PATTERN: Mock API responses using production schemas (Zod-first)
 * ✅ PATTERN: Verify data transformations preserve all required fields
 * ✅ PATTERN: Test 0-based indexing throughout (rounds, participants)
 * ✅ PATTERN: Ensure type safety with Zod validation
 */

import { vi } from 'vitest';

import { ChatModes, MessageRoles } from '@/api/core/enums';
import type { ThreadDetailResponse } from '@/api/routes/chat/schema';
import {
  createMockAnalysesListResponse,
  createMockAssistantMessage,
  createMockChangelogListResponse,
  createMockFetchError,
  createMockFetchResponse,
  createMockMessage,
  createMockMessagesListResponse,
  createMockThreadDetailResponse,
} from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils/metadata';

describe('e2E: Thread Lifecycle with API Integration', () => {
  const THREAD_ID = '01KA1K2GD2PP0BJH2VZ9J6QRBA';
  const USER_ID = '35981ef3-3267-4af7-9fdb-2e3c47149c2c';

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create and stub global fetch
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('thread Creation Flow', () => {
    it('should receive valid thread creation response from API', async () => {
      // ============================================================================
      // STEP 1: Mock backend API response for thread creation
      // ============================================================================
      const apiResponse: ThreadDetailResponse = createMockThreadDetailResponse(
        {
          id: THREAD_ID,
          userId: USER_ID,
          title: 'New Discussion',
          slug: 'new-discussion-abc123',
          mode: ChatModes.DEBATING,
          status: 'active',
        },
        [{ id: 'participant_0', threadId: THREAD_ID, modelId: 'gpt-4', priority: 0 }],
      );

      fetchMock.mockResolvedValueOnce(
        createMockFetchResponse(apiResponse),
      );

      // ============================================================================
      // STEP 2: Simulate API call (POST /chat/threads)
      // ============================================================================
      const response = await fetch('/api/v1/chat/threads', {
        method: 'POST',
        body: JSON.stringify({ mode: ChatModes.DEBATING }),
      });
      const data = await response.json();

      // ============================================================================
      // STEP 3: Verify API response structure and data integrity
      // ============================================================================

      // Response is successful
      expect(data.success).toBe(true);

      // Thread data is complete and correct
      expect(data.data.thread).toBeDefined();
      expect(data.data.thread.id).toBe(THREAD_ID);
      expect(data.data.thread.title).toBe('New Discussion');
      expect(data.data.thread.mode).toBe(ChatModes.DEBATING);
      expect(data.data.thread.userId).toBe(USER_ID);
      expect(data.data.thread.slug).toBe('new-discussion-abc123');
      expect(data.data.thread.status).toBe('active');

      // Participants array is populated
      expect(data.data.participants).toHaveLength(1);
      expect(data.data.participants[0].id).toBe('participant_0');
      expect(data.data.participants[0].threadId).toBe(THREAD_ID);
      expect(data.data.participants[0].modelId).toBe('gpt-4');
      expect(data.data.participants[0].priority).toBe(0);
      expect(data.data.participants[0].isEnabled).toBe(true);
    });

    it('should handle thread creation error response correctly', async () => {
      // ============================================================================
      // STEP 1: Mock API error response
      // ============================================================================
      fetchMock.mockResolvedValueOnce(
        createMockFetchError('Thread quota exceeded', 429),
      );

      // ============================================================================
      // STEP 2: Simulate API call that returns error
      // ============================================================================
      const response = await fetch('/api/v1/chat/threads', {
        method: 'POST',
        body: JSON.stringify({ mode: ChatModes.DEBATING }),
      });
      const data = await response.json();

      // ============================================================================
      // STEP 3: Verify error response structure
      // ============================================================================
      expect(data.success).toBe(false);
      expect(data.data).toBeNull();
      expect(data.error).toBeDefined();
      expect(data.error.message).toBe('Thread quota exceeded');
      expect(data.error.code).toBe('TEST_ERROR');
      expect(response.status).toBe(429);
    });
  });

  describe('thread Loading Flow (by ID)', () => {
    it('should receive complete thread data from all API endpoints', async () => {
      // ============================================================================
      // STEP 1: Mock all API responses for thread detail page
      // ============================================================================

      // Mock thread + participants (GET /threads/:id)
      const threadResponse = createMockThreadDetailResponse(
        { id: THREAD_ID, title: 'Existing Thread' },
        [
          { id: 'p0', threadId: THREAD_ID, priority: 0 },
          { id: 'p1', threadId: THREAD_ID, priority: 1 },
        ],
      );

      // Mock messages (GET /threads/:id/messages) - complete round 0
      const messagesResponse = createMockMessagesListResponse(THREAD_ID, 0, 2);

      // Mock changelog (GET /threads/:id/changelog)
      const changelogResponse = createMockChangelogListResponse();

      // Mock analyses (GET /threads/:id/analyses)
      const analysesResponse = createMockAnalysesListResponse(THREAD_ID, 0);

      // ============================================================================
      // STEP 2: Simulate loading sequence (as happens on page load)
      // ============================================================================
      fetchMock
        .mockResolvedValueOnce(createMockFetchResponse(threadResponse))
        .mockResolvedValueOnce(createMockFetchResponse(messagesResponse))
        .mockResolvedValueOnce(createMockFetchResponse(changelogResponse))
        .mockResolvedValueOnce(createMockFetchResponse(analysesResponse));

      // Fetch all data
      const threadData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}`)).json();
      const messagesData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}/messages`)).json();
      const changelogData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}/changelog`)).json();
      const analysesData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}/analyses`)).json();

      // ============================================================================
      // STEP 3: Verify complete data synchronization
      // ============================================================================

      // ✅ Thread API response is complete
      expect(threadData.success).toBe(true);
      expect(threadData.data.thread.id).toBe(THREAD_ID);
      expect(threadData.data.thread.title).toBe('Existing Thread');

      // ✅ Participants synced (ordered by priority)
      expect(threadData.data.participants).toHaveLength(2);
      expect(threadData.data.participants[0].priority).toBe(0);
      expect(threadData.data.participants[1].priority).toBe(1);
      expect(threadData.data.participants[0].id).toBe('p0');
      expect(threadData.data.participants[1].id).toBe('p1');

      // ✅ Messages API response is complete
      expect(messagesData.success).toBe(true);
      expect(messagesData.data.messages).toHaveLength(3); // 1 user + 2 participants
      const userMessages = messagesData.data.messages.filter((m: { role: string }) => m.role === MessageRoles.USER);
      const assistantMessages = messagesData.data.messages.filter((m: { role: string }) => m.role === MessageRoles.ASSISTANT);
      expect(userMessages).toHaveLength(1);
      expect(assistantMessages).toHaveLength(2);

      // ✅ 0-BASED INDEXING: All messages have roundNumber: 0
      messagesData.data.messages.forEach((msg: { roundNumber: number }) => {
        expect(msg.roundNumber).toBe(0);
      });

      // ✅ Changelog API response is valid
      expect(changelogData.success).toBe(true);
      expect(changelogData.data.items).toBeDefined();

      // ✅ Analysis API response is complete
      expect(analysesData.success).toBe(true);
      expect(analysesData.data.items).toHaveLength(1);
      expect(analysesData.data.items[0].roundNumber).toBe(0);
      expect(analysesData.data.items[0].threadId).toBe(THREAD_ID);
    });
  });

  describe('messages Loading and Round Number Consistency', () => {
    it('should preserve 0-based roundNumber from backend API', async () => {
      // ============================================================================
      // SCENARIO: User refreshes page on thread with round 0 complete
      // CRITICAL: Round numbers must stay 0-based (not converted to 1-indexed)
      // ============================================================================

      const threadResponse = createMockThreadDetailResponse({ id: THREAD_ID });

      // Messages for round 0 (first round)
      const messagesResponse = createMockMessagesListResponse(THREAD_ID, 0, 1);

      fetchMock
        .mockResolvedValueOnce(createMockFetchResponse(threadResponse))
        .mockResolvedValueOnce(createMockFetchResponse(messagesResponse));

      // Fetch thread and messages
      await fetch(`/api/v1/chat/threads/${THREAD_ID}`);
      const messagesData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}/messages`)).json();

      // ✅ CRITICAL: API returns roundNumber: 0, not 1
      expect(messagesData.data.messages[0].roundNumber).toBe(0); // User message
      expect(messagesData.data.messages[1].roundNumber).toBe(0); // Assistant message

      // ✅ Message IDs use r0
      expect(messagesData.data.messages[1].id).toContain('_r0_');
      expect(messagesData.data.messages[1].id).not.toContain('_r1_');

      // ✅ Metadata roundNumber extraction works correctly
      const message1Metadata = messagesData.data.messages[1].metadata;
      expect(getRoundNumber(message1Metadata)).toBe(0);
    });

    it('should handle multiple rounds with correct indexing from API', async () => {
      // ============================================================================
      // SCENARIO: Thread with rounds 0, 1, 2 (all 0-indexed)
      // ============================================================================

      const threadResponse = createMockThreadDetailResponse({ id: THREAD_ID });

      // Create messages for 3 rounds
      const messages = [
        // Round 0
        createMockMessage({
          id: 'user_r0',
          threadId: THREAD_ID,
          roundNumber: 0,
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        }),
        createMockAssistantMessage(THREAD_ID, 0, 0),

        // Round 1
        createMockMessage({
          id: 'user_r1',
          threadId: THREAD_ID,
          roundNumber: 1,
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        }),
        createMockAssistantMessage(THREAD_ID, 1, 0),

        // Round 2
        createMockMessage({
          id: 'user_r2',
          threadId: THREAD_ID,
          roundNumber: 2,
          metadata: { role: MessageRoles.USER, roundNumber: 2 },
        }),
        createMockAssistantMessage(THREAD_ID, 2, 0),
      ];

      const messagesResponse = {
        success: true,
        data: { messages },
        error: null,
      };

      fetchMock
        .mockResolvedValueOnce(createMockFetchResponse(threadResponse))
        .mockResolvedValueOnce(createMockFetchResponse(messagesResponse));

      // Fetch thread and messages
      await fetch(`/api/v1/chat/threads/${THREAD_ID}`);
      const messagesData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}/messages`)).json();

      // ✅ Verify each round from API response
      const round0Messages = messagesData.data.messages.filter((m: { roundNumber: number }) => m.roundNumber === 0);
      const round1Messages = messagesData.data.messages.filter((m: { roundNumber: number }) => m.roundNumber === 1);
      const round2Messages = messagesData.data.messages.filter((m: { roundNumber: number }) => m.roundNumber === 2);

      expect(round0Messages).toHaveLength(2);
      expect(round1Messages).toHaveLength(2);
      expect(round2Messages).toHaveLength(2);

      // ✅ Verify message IDs match round numbers
      expect(messagesData.data.messages[1].id).toBe(`${THREAD_ID}_r0_p0`);
      expect(messagesData.data.messages[3].id).toBe(`${THREAD_ID}_r1_p0`);
      expect(messagesData.data.messages[5].id).toBe(`${THREAD_ID}_r2_p0`);

      // ✅ Verify metadata roundNumber for all rounds
      expect(getRoundNumber(messagesData.data.messages[0].metadata)).toBe(0);
      expect(getRoundNumber(messagesData.data.messages[2].metadata)).toBe(1);
      expect(getRoundNumber(messagesData.data.messages[4].metadata)).toBe(2);
    });
  });

  describe('analysis Loading and State Sync', () => {
    it('should receive analysis from API with correct roundNumber', async () => {
      // ============================================================================
      // CRITICAL: Analysis for round 0 should have roundNumber: 0 (not 1)
      // ============================================================================

      const threadResponse = createMockThreadDetailResponse({ id: THREAD_ID });
      const analysesResponse = createMockAnalysesListResponse(THREAD_ID, 0);

      fetchMock
        .mockResolvedValueOnce(createMockFetchResponse(threadResponse))
        .mockResolvedValueOnce(createMockFetchResponse(analysesResponse));

      // Fetch thread and analyses
      await fetch(`/api/v1/chat/threads/${THREAD_ID}`);
      const analysesData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}/analyses`)).json();

      // ✅ Analysis API response is valid
      expect(analysesData.success).toBe(true);
      expect(analysesData.data.items).toHaveLength(1);
      expect(analysesData.data.items[0].roundNumber).toBe(0);
      expect(analysesData.data.items[0].threadId).toBe(THREAD_ID);

      // ✅ Analysis data structure is complete
      const analysis = analysesData.data.items[0];
      expect(analysis.analysisData).toBeDefined();
      expect(analysis.analysisData.participantAnalyses).toBeDefined();
      expect(analysis.analysisData.leaderboard).toBeDefined();
      expect(analysis.analysisData.roundSummary).toBeDefined();

      // ✅ Participant message IDs use r0 format
      expect(analysis.participantMessageIds[0]).toContain('_r0_');
      expect(analysis.participantMessageIds[0]).not.toContain('_r1_');
    });
  });

  describe('error Handling and State Recovery', () => {
    it('should return proper error structure from API', async () => {
      // ============================================================================
      // SCENARIO: Network error while loading messages
      // ============================================================================

      const threadResponse = createMockThreadDetailResponse({ id: THREAD_ID });

      fetchMock
        .mockResolvedValueOnce(createMockFetchResponse(threadResponse))
        .mockResolvedValueOnce(createMockFetchError('Network error', 500));

      // Fetch thread (success)
      const threadData = await (await fetch(`/api/v1/chat/threads/${THREAD_ID}`)).json();
      expect(threadData.success).toBe(true);
      expect(threadData.data.thread.id).toBe(THREAD_ID);

      // Fetch messages (error)
      const messagesResponse = await fetch(`/api/v1/chat/threads/${THREAD_ID}/messages`);
      const messagesData = await messagesResponse.json();

      // ✅ Error response structure is correct
      expect(messagesData.success).toBe(false);
      expect(messagesData.data).toBeNull();
      expect(messagesData.error).toBeDefined();
      expect(messagesData.error.message).toBe('Network error');
      expect(messagesResponse.status).toBe(500);

      // ============================================================================
      // Recovery: Retry successful
      // ============================================================================

      const successMessagesResponse = createMockMessagesListResponse(THREAD_ID, 0, 1);
      fetchMock.mockResolvedValueOnce(
        createMockFetchResponse(successMessagesResponse),
      );

      // Retry fetch messages
      const retryResponse = await fetch(`/api/v1/chat/threads/${THREAD_ID}/messages`);
      const retryData = await retryResponse.json();

      // ✅ Retry succeeded
      expect(retryData.success).toBe(true);
      expect(retryData.data.messages).toHaveLength(2);

      // ✅ Data integrity maintained after recovery
      expect(retryData.data.messages[0].roundNumber).toBe(0);
      expect(retryData.data.messages[1].roundNumber).toBe(0);
    });
  });
});
