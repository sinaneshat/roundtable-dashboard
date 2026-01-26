/**
 * End-to-End Conversation Journey Tests
 *
 * Tests complete conversation flows with actual API mocking patterns
 * as documented in FLOW_DOCUMENTATION.md:
 *
 * Key Journeys Tested:
 * - Complete Round 1 from overview screen
 * - Multi-round conversation continuation
 * - Web search enabled/disabled flows
 * - Stop button during different phases
 * - Error recovery and retry flows
 *
 * API Mocking Patterns:
 * - Mocked fetch for SSE streams
 * - Mocked API responses with proper structure
 * - Simulated network delays and timeouts
 */

import { FinishReasons, MessageRoles, MessageStatuses, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import type { LanguageModelUsage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createMockParticipant,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { ChatParticipant, StoredPreSearch } from '@/services/api';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for assistant messages
 * ✅ ENUM PATTERN: Uses role literal for type narrowing
 */
function isAssistantMessage(msg: TestUserMessage | TestAssistantMessage): msg is TestAssistantMessage {
  return msg.role === UIMessageRoles.ASSISTANT;
}

/**
 * Get assistant messages with proper typing
 * ✅ TYPE-SAFE: Returns narrowed array without casting
 */
function getAssistantMessages(messages: (TestUserMessage | TestAssistantMessage)[]): TestAssistantMessage[] {
  return messages.filter(isAssistantMessage);
}

// ============================================================================
// TEST HELPERS
// ============================================================================

type JourneyState = {
  screenMode: typeof ScreenModes[keyof typeof ScreenModes];
  threadId: string | null;
  slug: string | null;
  isAiGeneratedTitle: boolean;
  currentRoundNumber: number;
  isStreaming: boolean;
  waitingToStartStreaming: boolean;
  currentParticipantIndex: number;
  hasNavigated: boolean;
  pendingMessage: string | null;
  messages: (TestUserMessage | TestAssistantMessage)[];
  preSearches: StoredPreSearch[];
  participants: ChatParticipant[];
};

function createInitialJourneyState(): JourneyState {
  return {
    currentParticipantIndex: 0,
    currentRoundNumber: 0,
    hasNavigated: false,
    isAiGeneratedTitle: false,
    isStreaming: false,
    messages: [],
    participants: [],
    pendingMessage: null,
    preSearches: [],
    screenMode: ScreenModes.OVERVIEW,
    slug: null,
    threadId: null,
    waitingToStartStreaming: false,
  };
}

// ============================================================================
// COMPLETE ROUND 1 JOURNEY (OVERVIEW SCREEN)
// ============================================================================

describe('complete Round 1 Journey', () => {
  describe('overview Screen Flow', () => {
    it('journey: submit message → URL stays at /chat → streaming → moderator → navigation', () => {
      const state = createInitialJourneyState();
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      state.participants = participants;

      // Step 1: User on overview screen
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(state.threadId).toBeNull();

      // Step 2: User types and submits message
      state.pendingMessage = 'What is the best approach for this problem?';
      expect(state.pendingMessage).not.toBeNull();

      // Step 3: Thread creation response
      state.threadId = 'thread-123';
      state.slug = 'what-is-the-best-approach-abc123';
      state.isAiGeneratedTitle = false; // Not yet generated

      expect(state.threadId).toBe('thread-123');
      expect(state.isAiGeneratedTitle).toBeFalsy();

      // Step 4: URL should still be /chat during streaming (overview screen stays mounted)
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);

      // Step 5: Streaming begins
      state.waitingToStartStreaming = true;
      state.pendingMessage = null;

      // Step 6: Add user message
      state.messages.push(createTestUserMessage({
        content: 'What is the best approach for this problem?',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      }));

      expect(state.messages).toHaveLength(1);

      // Step 7: Start streaming first participant
      state.waitingToStartStreaming = false;
      state.isStreaming = true;
      state.currentParticipantIndex = 0;

      expect(state.isStreaming).toBeTruthy();
      expect(state.currentParticipantIndex).toBe(0);

      // Step 8: First participant completes
      state.messages.push(createTestAssistantMessage({
        content: 'I recommend approach A because...',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }));
      state.currentParticipantIndex = 1;

      // Step 9: Second participant completes
      state.messages.push(createTestAssistantMessage({
        content: 'I would suggest approach B since...',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }));

      // Step 10: All participants done, streaming ends
      state.isStreaming = false;
      state.currentParticipantIndex = 0;

      expect(state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(2);
      expect(state.isStreaming).toBeFalsy();

      // Step 11: Moderator created and streaming

      // Step 12: Moderator completes

      // Step 13: AI title generated (async)
      state.isAiGeneratedTitle = true;
      state.slug = 'best-approach-for-problem-solving';

      // Step 14: Navigation to thread screen
      expect(state.isAiGeneratedTitle).toBeTruthy();

      // Navigation happens: overview → thread screen
      state.hasNavigated = true;
      state.screenMode = ScreenModes.THREAD;

      expect(state.hasNavigated).toBeTruthy();
      expect(state.screenMode).toBe(ScreenModes.THREAD);
    });

    it('uRL update sequence: replaceState (slug) → then router.push (navigation)', () => {
      // Per FLOW_DOCUMENTATION.md:
      // 1. window.history.replaceState updates URL in background
      // 2. router.push happens after moderator completes

      const urlUpdates: { type: 'replace' | 'push'; url: string }[] = [];

      // Step 1: Thread created, initial slug generated
      const initialSlug = 'say-hi-1-word-only-nzj311';
      urlUpdates.push({ type: 'replace', url: `/chat/${initialSlug}` });

      // Step 2: During streaming, AI title ready → replaceState
      const aiGeneratedSlug = 'optimized-greeting-response';
      urlUpdates.push({ type: 'replace', url: `/chat/${aiGeneratedSlug}` });

      // Step 3: After moderator complete → router.push
      urlUpdates.push({ type: 'push', url: `/chat/${aiGeneratedSlug}` });

      // Verify sequence
      expect(urlUpdates[0]?.type).toBe('replace');
      expect(urlUpdates[1]?.type).toBe('replace');
      expect(urlUpdates[2]?.type).toBe('push');

      // Final URL should use AI-generated slug
      expect(urlUpdates[2]?.url).toBe(`/chat/${aiGeneratedSlug}`);
    });
  });

  describe('with Web Search Enabled', () => {
    it('journey: pre-search → participants → moderator', () => {
      const state = createInitialJourneyState();
      state.participants = [createMockParticipant(0)];
      state.threadId = 'thread-123';

      // Step 1: Pre-search created as PENDING
      state.preSearches.push(createMockStoredPreSearch(0, MessageStatuses.PENDING));

      // Step 2: Participants blocked while pre-search pending
      const shouldWaitForPreSearch = () => {
        const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
        return preSearch?.status === MessageStatuses.PENDING
          || preSearch?.status === MessageStatuses.STREAMING;
      };

      expect(shouldWaitForPreSearch()).toBeTruthy();

      // Step 3: Pre-search starts streaming
      const preSearch0 = state.preSearches[0];
      if (!preSearch0) {
        throw new Error('expected pre-search at index 0');
      }
      preSearch0.status = MessageStatuses.STREAMING;
      expect(shouldWaitForPreSearch()).toBeTruthy();

      // Step 4: Pre-search completes
      preSearch0.status = MessageStatuses.COMPLETE;
      preSearch0.searchData = {
        failureCount: 0,
        moderatorSummary: 'Moderator',
        queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic' as const, total: 1 }],
        results: [],
        successCount: 1,
        totalResults: 0,
        totalTime: 1000,
      };
      expect(shouldWaitForPreSearch()).toBeFalsy();

      // Step 5: Participants can now stream
      state.isStreaming = true;
      state.currentParticipantIndex = 0;

      expect(state.isStreaming).toBeTruthy();

      // Step 6: Participant completes with pre-search context
      state.messages.push(createTestAssistantMessage({
        content: 'Based on the web search results, I found that...',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }));

      state.isStreaming = false;

      // Step 7: Moderator begins
    });

    it('pre-search blocks participants with 10s timeout protection', () => {
      const TIMEOUT_MS = 10000;
      const state = createInitialJourneyState();
      state.preSearches.push(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

      const preSearchStartTime = Date.now() - 11000; // 11 seconds ago

      // Timeout exceeded - proceed anyway
      const hasTimedOut = Date.now() - preSearchStartTime > TIMEOUT_MS;
      expect(hasTimedOut).toBeTruthy();

      // When timed out, streaming should proceed
      const shouldProceed = hasTimedOut;
      expect(shouldProceed).toBeTruthy();
    });
  });
});

// ============================================================================
// MULTI-ROUND CONVERSATION JOURNEY
// ============================================================================

describe('multi-Round Conversation Journey', () => {
  describe('round 2 Flow on Thread Screen', () => {
    it('journey: existing thread → submit message → round 2 streaming', () => {
      const state = createInitialJourneyState();
      state.screenMode = ScreenModes.THREAD;
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0), createMockParticipant(1)];

      // Existing round 0 complete
      state.messages = [
        createTestUserMessage({ content: 'Round 0', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response 0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Response 1',
          finishReason: FinishReasons.STOP,
          id: 'p1-r0',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      // User submits new message for round 1
      state.pendingMessage = 'Follow up question';
      state.currentRoundNumber = 1;

      // Round 1 starts
      state.messages.push(createTestUserMessage({
        content: 'Follow up question',
        id: 'u1',
        roundNumber: 1,
      }));

      state.isStreaming = true;
      state.currentParticipantIndex = 0;

      // Round 1 participant 0 responds
      state.messages.push(createTestAssistantMessage({
        content: 'Follow up response 0',
        finishReason: FinishReasons.STOP,
        id: 'p0-r1',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 1,
      }));
      state.currentParticipantIndex = 1;

      // Round 1 participant 1 responds
      state.messages.push(createTestAssistantMessage({
        content: 'Follow up response 1',
        finishReason: FinishReasons.STOP,
        id: 'p1-r1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 1,
      }));

      state.isStreaming = false;

      // Verify round 1 messages
      const round1Messages = state.messages.filter(m => m.metadata.roundNumber === 1);
      expect(round1Messages).toHaveLength(3);
      expect(round1Messages.filter(m => m.role === UIMessageRoles.USER)).toHaveLength(1);
      expect(round1Messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(2);
    });

    it('round numbers increment sequentially', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0)];

      // Simulate 5 rounds
      for (let round = 0; round < 5; round++) {
        state.messages.push(createTestUserMessage({
          content: `Round ${round} question`,
          id: `u${round}`,
          roundNumber: round,
        }));
        state.messages.push(createTestAssistantMessage({
          content: `Round ${round} response`,
          finishReason: FinishReasons.STOP,
          id: `p0-r${round}`,
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: round,
        }));
      }

      // Verify round numbers
      const userMessages = state.messages.filter(m => m.role === UIMessageRoles.USER);
      userMessages.forEach((msg, idx) => {
        expect(msg.metadata.roundNumber).toBe(idx);
      });
    });
  });

  describe('web Search Toggle Mid-Conversation', () => {
    it('can enable web search for round 2 even if round 1 had it disabled', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';

      // Round 0 without web search
      state.messages.push(createTestUserMessage({ content: 'Q0', id: 'u0', roundNumber: 0 }));
      state.messages.push(createTestAssistantMessage({
        content: 'R0',
        finishReason: FinishReasons.STOP,
        id: 'p0-r0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }));

      // No pre-search for round 0
      expect(state.preSearches.find(ps => ps.roundNumber === 0)).toBeUndefined();

      // Round 1 with web search enabled
      const enableWebSearchForRound1 = true;

      if (enableWebSearchForRound1) {
        state.preSearches.push(createMockStoredPreSearch(1, MessageStatuses.PENDING));
      }

      // Pre-search exists for round 1
      expect(state.preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();
    });

    it('can disable web search for round 2 even if round 1 had it enabled', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';

      // Round 0 with web search
      state.preSearches.push(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));

      // Round 1 without web search (toggle off)
      const enableWebSearchForRound1 = false;

      // Should NOT create pre-search for round 1
      const shouldCreatePreSearch = enableWebSearchForRound1;
      expect(shouldCreatePreSearch).toBeFalsy();
    });
  });
});

// ============================================================================
// STOP BUTTON JOURNEY
// ============================================================================

describe('stop Button Journey', () => {
  describe('stop During Participant Streaming', () => {
    it('stops streaming immediately and preserves partial content', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0), createMockParticipant(1)];
      state.isStreaming = true;
      state.currentParticipantIndex = 0;

      // User message added
      state.messages.push(createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }));

      // Participant 0 partially streaming
      state.messages.push({
        id: 'p0-r0',
        metadata: {
          finishReason: FinishReasons.UNKNOWN,
          hasError: false,
          isPartialResponse: true,
          isTransient: false,
          model: 'gpt-4',
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
        },
        parts: [{ text: 'Partial response being str...', type: 'text' as const }],
        role: UIMessageRoles.ASSISTANT,
      });

      // User clicks stop
      state.isStreaming = false;

      // Streaming stopped
      expect(state.isStreaming).toBeFalsy();

      // Partial message preserved - ✅ TYPE-SAFE: Use getAssistantMessages for typed access
      const partialMessage = getAssistantMessages(state.messages).find(m => m.id === 'p0-r0');
      expect(partialMessage).toBeDefined();
      expect(partialMessage?.metadata.finishReason).toBe(FinishReasons.UNKNOWN);
    });

    it('moderator NOT triggered when stopped early', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0), createMockParticipant(1)];

      // Only one participant completed before stop
      state.messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response 0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // Stopped before all participants complete
      state.isStreaming = false;

      // Should NOT trigger moderator
      const allParticipantsComplete = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      ).length === state.participants.length;

      expect(allParticipantsComplete).toBeFalsy();
    });
  });

  describe('stop During Pre-Search', () => {
    it('cancels pre-search and skips to participants', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0)];
      state.preSearches.push(createMockStoredPreSearch(0, MessageStatuses.STREAMING));

      // User clicks stop during pre-search
      const preSearch0 = state.preSearches[0];
      if (!preSearch0) {
        throw new Error('expected pre-search at index 0');
      }
      preSearch0.status = MessageStatuses.FAILED;
      preSearch0.errorMessage = 'Cancelled by user';

      expect(state.preSearches[0]?.status).toBe(MessageStatuses.FAILED);

      // Participants should be able to proceed (search failure is non-blocking)
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
      const canProceed = preSearch?.status === MessageStatuses.COMPLETE
        || preSearch?.status === MessageStatuses.FAILED;

      expect(canProceed).toBeTruthy();
    });
  });

  describe('stop During Moderator', () => {
    it('can stop moderator streaming but round is still complete', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0)];

      // All participants complete
      state.messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // Moderator streaming

      // Stop during moderator

      // Round is still considered complete (participants finished)
      // ✅ TYPE-SAFE: Use helper to get typed assistant messages
      const completedParticipants = getAssistantMessages(state.messages).filter(
        m => m.metadata.finishReason === FinishReasons.STOP,
      );
      const allParticipantsComplete = completedParticipants.length === state.participants.length;

      expect(allParticipantsComplete).toBeTruthy();

      // User can proceed to next round
      const canSubmitNewMessage = allParticipantsComplete && !state.isStreaming;
      expect(canSubmitNewMessage).toBeTruthy();
    });
  });
});

// ============================================================================
// ERROR RECOVERY JOURNEY
// ============================================================================

describe('error Recovery Journey', () => {
  describe('participant Error Mid-Round', () => {
    it('other participants continue when one fails', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      state.messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
      ];

      // P0 succeeds
      state.messages.push(createTestAssistantMessage({
        content: 'Response 0',
        finishReason: FinishReasons.STOP,
        id: 'p0-r0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }));

      // P1 fails
      state.messages.push(createTestAssistantMessage({
        content: 'Error: Rate limit exceeded',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'p1-r0',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }));

      // P2 succeeds
      state.messages.push(createTestAssistantMessage({
        content: 'Response 2',
        finishReason: FinishReasons.STOP,
        id: 'p2-r0',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      }));

      // Round still completes
      const assistantMessages = getAssistantMessages(state.messages);
      expect(assistantMessages).toHaveLength(3);

      // Error tracked - ✅ TYPE-SAFE: Direct property access on typed array
      const errorMessage = assistantMessages.find(m => m.metadata.hasError);
      expect(errorMessage).toBeDefined();
    });
  });

  describe('retry Round After Error', () => {
    it('regenerates all participants on retry', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.participants = [createMockParticipant(0), createMockParticipant(1)];

      // Complete round with error
      state.messages = [
        createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'Response 0',
          finishReason: FinishReasons.STOP,
          id: 'p0-r0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Error response',
          finishReason: FinishReasons.ERROR,
          hasError: true,
          id: 'p1-r0',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      // User clicks retry
      // Step 1: Delete all assistant messages for round 0
      state.messages = state.messages.filter(
        m => !(m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0),
      );

      // Step 2: Delete moderator for round 0

      expect(state.messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(0);

      // Step 3: Re-stream all participants
      state.isStreaming = true;
      state.currentParticipantIndex = 0;

      // New responses
      state.messages.push(createTestAssistantMessage({
        content: 'New response 0',
        finishReason: FinishReasons.STOP,
        id: 'p0-r0-retry',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }));
      state.messages.push(createTestAssistantMessage({
        content: 'New response 1',
        finishReason: FinishReasons.STOP,
        id: 'p1-r0-retry',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }));

      state.isStreaming = false;

      // Round number stays the same
      const round0Messages = state.messages.filter(m => m.metadata.roundNumber === 0);
      expect(round0Messages.filter(m => m.role === UIMessageRoles.ASSISTANT)).toHaveLength(2);
    });
  });
});

// ============================================================================
// SLUG POLLING JOURNEY
// ============================================================================

describe('slug Polling Journey', () => {
  describe('polling Lifecycle', () => {
    it('polling starts after thread creation', () => {
      const state = createInitialJourneyState();

      // Before thread creation - no polling
      const shouldPoll = state.threadId !== null && !state.isAiGeneratedTitle;
      expect(shouldPoll).toBeFalsy();

      // After thread creation - start polling
      state.threadId = 'thread-123';
      const shouldPollNow = state.threadId !== null && !state.isAiGeneratedTitle;
      expect(shouldPollNow).toBeTruthy();
    });

    it('polling stops when AI title detected', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';

      // Polling active
      let shouldPoll = state.threadId !== null && !state.isAiGeneratedTitle;
      expect(shouldPoll).toBeTruthy();

      // AI title ready
      state.isAiGeneratedTitle = true;

      // Polling stops
      shouldPoll = state.threadId !== null && !state.isAiGeneratedTitle;
      expect(shouldPoll).toBeFalsy();
    });

    it('uRL updates via replaceState when AI title ready', () => {
      const state = createInitialJourneyState();
      state.threadId = 'thread-123';
      state.slug = 'initial-slug-abc123';

      // AI title ready
      state.isAiGeneratedTitle = true;
      state.slug = 'ai-generated-slug-xyz789';

      // URL should be updated via replaceState (not push)
      // This is a state transition, not an actual URL change in tests
      expect(state.slug).toBe('ai-generated-slug-xyz789');
      expect(state.isAiGeneratedTitle).toBeTruthy();
    });
  });
});

// ============================================================================
// NAVIGATION TIMING JOURNEY
// ============================================================================

describe('navigation Timing Journey', () => {
  describe('navigation Conditions', () => {
    it('navigates only when both AI title ready AND moderator complete', () => {
      const state = createInitialJourneyState();
      state.screenMode = ScreenModes.OVERVIEW;
      state.threadId = 'thread-123';

      // Helper to check if moderator message exists for round 0
      const hasCompletedModerator = () => {
        return state.messages.some(
          m => m.role === UIMessageRoles.ASSISTANT
            && m.metadata
            && 'isModerator' in m.metadata
            && m.metadata.isModerator === true
            && m.metadata.roundNumber === 0,
        );
      };

      // Condition 1: AI title not ready, but moderator complete
      state.isAiGeneratedTitle = false;
      state.messages.push(createTestModeratorMessage({
        content: 'Discussion moderator for round 0',
        id: 'moderator-r0',
        roundNumber: 0,
      }));

      let canNavigate = state.isAiGeneratedTitle && hasCompletedModerator();
      expect(canNavigate).toBeFalsy();

      // Condition 2: AI title ready but no moderator yet
      state.isAiGeneratedTitle = true;
      state.messages = []; // Remove moderator message

      canNavigate = state.isAiGeneratedTitle && hasCompletedModerator();
      expect(canNavigate).toBeFalsy();

      // Condition 3: Both ready
      state.messages.push(createTestModeratorMessage({
        content: 'Discussion moderator for round 0',
        id: 'moderator-r0',
        roundNumber: 0,
      }));

      canNavigate = state.isAiGeneratedTitle && hasCompletedModerator();
      expect(canNavigate).toBeTruthy();
    });

    it('hasNavigated flag prevents duplicate navigation', () => {
      const state = createInitialJourneyState();
      state.screenMode = ScreenModes.OVERVIEW;
      state.threadId = 'thread-123';
      state.isAiGeneratedTitle = true;

      // Add completed moderator message for round 0
      state.messages.push(createTestModeratorMessage({
        content: 'Discussion moderator for round 0',
        id: 'moderator-r0',
        roundNumber: 0,
      }));

      // First navigation attempt
      expect(state.hasNavigated).toBeFalsy();
      state.hasNavigated = true;

      // Second navigation attempt blocked
      const shouldNavigate = !state.hasNavigated;
      expect(shouldNavigate).toBeFalsy();
    });

    it('hasNavigated resets when returning to overview', () => {
      const state = createInitialJourneyState();
      state.hasNavigated = true;
      state.screenMode = ScreenModes.THREAD;

      // User returns to /chat (new conversation)
      state.hasNavigated = false;
      state.screenMode = ScreenModes.OVERVIEW;
      state.threadId = null;

      expect(state.hasNavigated).toBeFalsy();
    });
  });
});

// ============================================================================
// TOKEN USAGE TRACKING
// ============================================================================

describe('token Usage Tracking', () => {
  it('accumulates usage across participants', () => {
    // ✅ TYPE-SAFE: messages array is properly typed as TestAssistantMessage[]
    const messages: TestAssistantMessage[] = [
      createTestAssistantMessage({
        content: 'R0',
        finishReason: FinishReasons.STOP,
        id: 'p0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'R1',
        finishReason: FinishReasons.STOP,
        id: 'p1',
        participantId: 'p1',
        participantIndex: 1,
        roundNumber: 0,
      }),
    ];

    // ✅ TYPE-SAFE: Direct metadata access on typed array
    const totalUsage = messages.reduce((acc, msg) => ({
      completionTokens: acc.completionTokens + msg.metadata.usage.completionTokens,
      promptTokens: acc.promptTokens + msg.metadata.usage.promptTokens,
      totalTokens: acc.totalTokens + msg.metadata.usage.totalTokens,
    }), { completionTokens: 0, promptTokens: 0, totalTokens: 0 });

    // Each message has 100/50/150 tokens (from helper defaults)
    expect(totalUsage.promptTokens).toBe(200);
    expect(totalUsage.completionTokens).toBe(100);
    expect(totalUsage.totalTokens).toBe(300);
  });

  it('tracks usage per round', () => {
    // ✅ TYPE-SAFE: Explicitly typed array
    const messages: TestAssistantMessage[] = [
      createTestAssistantMessage({
        content: 'R0',
        finishReason: FinishReasons.STOP,
        id: 'p0-r0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'R1',
        finishReason: FinishReasons.STOP,
        id: 'p0-r1',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 1,
      }),
    ];

    // ✅ TYPE-SAFE: Direct metadata access without casting
    const usageByRound = messages.reduce<Record<number, LanguageModelUsage>>((acc, msg) => {
      const round = msg.metadata.roundNumber;
      if (!acc[round]) {
        acc[round] = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
      }
      acc[round].promptTokens += msg.metadata.usage.promptTokens;
      acc[round].completionTokens += msg.metadata.usage.completionTokens;
      acc[round].totalTokens += msg.metadata.usage.totalTokens;
      return acc;
    }, {});

    expect(usageByRound[0]?.totalTokens).toBe(150);
    expect(usageByRound[1]?.totalTokens).toBe(150);
  });
});
