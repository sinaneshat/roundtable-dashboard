/**
 * Timeline & Changelog Regression Tests
 *
 * Tests for bugs reported in the timeline/changelog display:
 * 1. Changelogs appear randomly/inconsistently
 * 2. Timeline sometimes breaks
 * 3. Changelogs don't show in the last round after submitting another round
 * 4. Search streams and first participants don't gradually update UI
 *
 * These tests are based on real production state dumps where issues occur.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessagePartTypes, MessageRoles, MessageStatuses, ModelIds, TimelineItemTypes } from '@/api/core/enums';
import type { ChatThreadChangelog, StoredPreSearch } from '@/api/routes/chat/schema';
import type { DbModeratorMessageMetadata } from '@/db/schemas/chat-metadata';
import { useThreadTimeline } from '@/hooks/utils';
import { createTestAssistantMessage, createTestUserMessage, renderHook } from '@/lib/testing';

// ============================================================================
// TEST HELPERS - Mimic production state structure
// ============================================================================

type TestChangelog = Omit<ChatThreadChangelog, 'createdAt'> & {
  createdAt: Date | string;
};

function createMockChangelog(
  roundNumber: number,
  changes: Array<{
    type: 'added' | 'removed' | 'modified' | 'reordered' | 'mode_change';
    participantId?: string;
    modelId?: string;
    oldRole?: string;
    newRole?: string;
    oldPriority?: number;
    newPriority?: number;
    oldMode?: string;
    newMode?: string;
  }>,
): TestChangelog {
  return {
    id: `changelog-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    changeType: 'participant_change',
    changeData: {
      changes: changes.map(c => ({
        type: c.type,
        participantId: c.participantId,
        modelId: c.modelId,
        oldRole: c.oldRole,
        newRole: c.newRole,
        oldPriority: c.oldPriority,
        newPriority: c.newPriority,
        oldMode: c.oldMode,
        newMode: c.newMode,
      })),
    },
    createdAt: new Date(),
  };
}

function createMockPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses] = MessageStatuses.COMPLETE,
): StoredPreSearch {
  return {
    id: `presearch-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    userQuery: `Query for round ${roundNumber}`,
    status,
    searchData: status === MessageStatuses.COMPLETE
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
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
  } as StoredPreSearch;
}

function createModeratorMessage(
  roundNumber: number,
  text: string,
): UIMessage {
  const metadata: DbModeratorMessageMetadata = {
    role: MessageRoles.ASSISTANT,
    isModerator: true,
    roundNumber,
    model: 'moderator-model',
    hasError: false,
  };
  return {
    id: `moderator-r${roundNumber}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata,
  };
}

// ============================================================================
// BUG #1: Changelog not showing when configuration changes between rounds
// ============================================================================

describe('bug #1: Changelog Display Between Rounds', () => {
  describe('when participants change between rounds', () => {
    it('fAILS: changelog should appear BEFORE round 2 messages when config changed after round 1', () => {
      /**
       * SCENARIO (from production state dump):
       * - Round 0-1: 3 participants (deepseek, grok-4-fast, gemini)
       * - Round 2-3: 1 participant (grok-4.1-fast) - CONFIG CHANGED
       *
       * Expected: Changelog should appear between round 1 and round 2
       * Actual: Changelog appears randomly or not at all
       */
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'u0', content: 'Round 0 question', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a0p0', content: 'P0 response', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a0p1', content: 'P1 response', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        createTestAssistantMessage({ id: 'a0p2', content: 'P2 response', roundNumber: 0, participantId: 'p2', participantIndex: 2 }),
        // Round 1
        createTestUserMessage({ id: 'u1', content: 'Round 1 question', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'a1p0', content: 'P0 response', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a1p1', content: 'P1 response', roundNumber: 1, participantId: 'p1', participantIndex: 1 }),
        // Round 2 - CONFIG CHANGED: Only 1 participant now
        createTestUserMessage({ id: 'u2', content: 'Round 2 question', roundNumber: 2 }),
        createTestAssistantMessage({ id: 'a2p0', content: 'P0 response', roundNumber: 2, participantId: 'new-p0', participantIndex: 0 }),
      ];

      // Changelog for round 2 (config changed before round 2)
      const changelog: TestChangelog[] = [
        createMockChangelog(2, [
          { type: 'removed', participantId: 'p0', modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324 },
          { type: 'removed', participantId: 'p1', modelId: ModelIds.X_AI_GROK_4_FAST },
          { type: 'removed', participantId: 'p2', modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH },
          { type: 'added', participantId: 'new-p0', modelId: ModelIds.X_AI_GROK_4_1_FAST },
        ]),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog,
          preSearches: [],
        }),
      );

      const timeline = result.current;

      // Find round 2 items
      const round2Items = timeline.filter(item => item.roundNumber === 2);

      // BUG: Changelog should be FIRST item in round 2
      expect(round2Items.length).toBeGreaterThan(0);

      const changelogItem = round2Items.find(item => item.type === TimelineItemTypes.CHANGELOG);
      expect(changelogItem).toBeDefined();

      // Changelog should appear BEFORE messages in round 2
      const changelogIndex = timeline.findIndex(
        item => item.type === TimelineItemTypes.CHANGELOG && item.roundNumber === 2,
      );
      const messagesIndex = timeline.findIndex(
        item => item.type === TimelineItemTypes.MESSAGES && item.roundNumber === 2,
      );

      expect(changelogIndex).toBeGreaterThan(-1);
      expect(changelogIndex).toBeLessThan(messagesIndex);
    });

    it('fAILS: changelog should persist after new round is submitted', () => {
      /**
       * SCENARIO:
       * User submits round 3, configuration hasn't changed since round 2
       * The changelog for round 2 should still be visible
       *
       * Bug: Changelog disappears or appears randomly
       */
      const messages: UIMessage[] = [
        // Round 2 with config change
        createTestUserMessage({ id: 'u2', content: 'Round 2', roundNumber: 2 }),
        createTestAssistantMessage({ id: 'a2p0', content: 'Response', roundNumber: 2, participantId: 'p0', participantIndex: 0 }),
        // Round 3 - same config as round 2
        createTestUserMessage({ id: 'u3', content: 'Round 3', roundNumber: 3 }),
        createTestAssistantMessage({ id: 'a3p0', content: 'Response', roundNumber: 3, participantId: 'p0', participantIndex: 0 }),
      ];

      const changelog: TestChangelog[] = [
        createMockChangelog(2, [
          { type: 'added', participantId: 'p0', modelId: 'grok-4.1-fast' },
        ]),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog,
          preSearches: [],
        }),
      );

      // Round 2 changelog should still be visible
      const round2Changelog = result.current.find(
        item => item.type === TimelineItemTypes.CHANGELOG && item.roundNumber === 2,
      );

      expect(round2Changelog).toBeDefined();
    });
  });
});

// ============================================================================
// BUG #2: Timeline Ordering Broken
// ============================================================================

describe('bug #2: Timeline Element Ordering', () => {
  describe('correct element order per round', () => {
    it('timeline maintains order: messages (with moderator sorted last)', () => {
      /**
       * ✅ UNIFIED: Moderator is now included in messages, not as separate summary
       *
       * Expected order for each round:
       * 1. Changelog (if config changed)
       * 2. Messages (user → participants → moderator, all in one item)
       *
       * Pre-search is rendered INSIDE ChatMessageList, not as separate timeline item
       */
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a0p0', content: 'P0', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a0p1', content: 'P1', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        createModeratorMessage(0, 'Round 0 moderator'),
      ];

      const preSearches: StoredPreSearch[] = [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog: [],
          preSearches,
        }),
      );

      const timeline = result.current;

      // Get order of elements for round 0
      const round0Items = timeline.filter(item => item.roundNumber === 0);

      // ✅ UNIFIED: Only 'messages' item now (moderator is inside messages, sorted last)
      // Pre-search is rendered INSIDE ChatMessageList when messages exist
      expect(round0Items.map(item => item.type)).toEqual([TimelineItemTypes.MESSAGES]);

      // Verify moderator is last in messages
      const messagesItem = round0Items.find(item => item.type === TimelineItemTypes.MESSAGES);
      const roundMessages = messagesItem?.type === TimelineItemTypes.MESSAGES ? messagesItem.data : [];
      const lastMessage = roundMessages[roundMessages.length - 1];
      expect(lastMessage?.metadata).toHaveProperty('isModerator', true);
    });

    it('fAILS: pre-search should render at timeline level ONLY when no messages exist (orphaned round)', () => {
      /**
       * Scenario: Page refresh during web search, before user message is persisted
       * Pre-search exists but no messages for the round yet
       *
       * Bug: Pre-search rendering is inconsistent
       */
      const messages: UIMessage[] = [
        // Round 0 is complete
        createTestUserMessage({ id: 'u0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a0p0', content: 'Response', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        // Round 1 has NO messages yet (orphaned pre-search)
      ];

      const preSearches: StoredPreSearch[] = [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
        createMockPreSearch(1, MessageStatuses.STREAMING), // Round 1 pre-search in progress, no messages
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog: [],
          preSearches,
        }),
      );

      const timeline = result.current;

      // Round 1 should have a pre-search item at timeline level (orphaned)
      const round1PreSearch = timeline.find(
        item => item.type === TimelineItemTypes.PRE_SEARCH && item.roundNumber === 1,
      );

      expect(round1PreSearch).toBeDefined();
      expect(round1PreSearch?.type).toBe(TimelineItemTypes.PRE_SEARCH);
    });
  });

  describe('participant message ordering', () => {
    it('fAILS: assistant messages should always be in participantIndex order', () => {
      /**
       * Bug: Messages sometimes appear out of order
       * Should be: p0, p1, p2 (by participantIndex)
       */
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u0', content: 'Question', roundNumber: 0 }),
        // Intentionally out of order in array (simulating race condition)
        createTestAssistantMessage({ id: 'a0p2', content: 'P2', roundNumber: 0, participantId: 'p2', participantIndex: 2 }),
        createTestAssistantMessage({ id: 'a0p0', content: 'P0', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a0p1', content: 'P1', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog: [],
          preSearches: [],
        }),
      );

      const timeline = result.current;
      const messagesItem = timeline.find(item => item.type === TimelineItemTypes.MESSAGES);

      expect(messagesItem).toBeDefined();
      expect(messagesItem?.type).toBe(TimelineItemTypes.MESSAGES);

      // Type assertion after expect assertion
      const typedMessagesItem = messagesItem as { type: 'messages'; data: Array<{ role: string; metadata?: { participantIndex?: number } }> };
      const assistantMessages = typedMessagesItem.data.filter(m => m.role === MessageRoles.ASSISTANT);

      // Should be sorted by participantIndex
      const indices = assistantMessages.map(m => m.metadata?.participantIndex);

      // This will likely FAIL because useThreadTimeline doesn't sort messages
      expect(indices).toEqual([0, 1, 2]);
    });
  });
});

// ============================================================================
// BUG #3: Changelog Not Showing in Last Round After New Submission
// ============================================================================

describe('bug #3: Changelog Visibility After New Round Submission', () => {
  it('fAILS: changelog for previous round should remain visible after submitting new round', () => {
    /**
     * Scenario from user report:
     * 1. Config changes before round 2
     * 2. User submits round 2, changelog shows
     * 3. User submits round 3
     * 4. BUG: Changelog for round 2 disappears
     */
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'u1', content: 'Round 1', roundNumber: 1 }),
      createTestAssistantMessage({ id: 'a1p0', content: 'R1', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      // Config change happens here
      createTestUserMessage({ id: 'u2', content: 'Round 2', roundNumber: 2 }),
      createTestAssistantMessage({ id: 'a2p0', content: 'R2', roundNumber: 2, participantId: 'new-p0', participantIndex: 0 }),
      // Round 3 submitted
      createTestUserMessage({ id: 'u3', content: 'Round 3', roundNumber: 3 }),
      createTestAssistantMessage({ id: 'a3p0', content: 'R3', roundNumber: 3, participantId: 'new-p0', participantIndex: 0 }),
    ];

    const changelog: TestChangelog[] = [
      createMockChangelog(2, [
        { type: 'removed', participantId: 'p0' },
        { type: 'added', participantId: 'new-p0', modelId: ModelIds.X_AI_GROK_4_1_FAST },
      ]),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog,
        preSearches: [],
      }),
    );

    const timeline = result.current;

    // Changelog for round 2 should still exist
    const round2Changelog = timeline.find(
      item => item.type === TimelineItemTypes.CHANGELOG && item.roundNumber === 2,
    );

    expect(round2Changelog).toBeDefined();

    // Verify timeline order
    const round2Start = timeline.findIndex(item => item.roundNumber === 2);
    expect(timeline[round2Start]?.type).toBe(TimelineItemTypes.CHANGELOG);
  });
});

// ============================================================================
// BUG #4: Streaming UI Updates Batched Instead of Progressive
// ============================================================================

describe('bug #4: Progressive UI Updates During Streaming', () => {
  describe('message content should update progressively', () => {
    it('documents the expected behavior: streaming messages should have parts that update', () => {
      /**
       * This test documents expected behavior.
       * The actual bug is in how the store/hooks update:
       * - setMessages does full array replacement
       * - UI should update as each chunk arrives
       * - Instead, UI updates all at once when stream completes
       *
       * The fix needs to be in:
       * 1. Store: setMessages should support partial updates
       * 2. AI SDK integration: chunks should trigger immediate re-renders
       */

      // Initial streaming message (partial content)
      const streamingMessage: UIMessage = {
        id: 'streaming-msg',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Partial...' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          isPartialResponse: true,
        },
      };

      // Message should have isPartialResponse flag during streaming
      expect((streamingMessage.metadata as { isPartialResponse?: boolean })?.isPartialResponse).toBe(true);

      // After streaming completes, flag should be false
      const completedMessage: UIMessage = {
        ...streamingMessage,
        parts: [{ type: 'text', text: 'Complete response with all content' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: streamingMessage.metadata?.roundNumber ?? 0,
          participantId: streamingMessage.metadata?.participantId as string,
          participantIndex: streamingMessage.metadata?.participantIndex as number,
          isPartialResponse: false,
          finishReason: 'stop',
        },
      };

      expect((completedMessage.metadata as { isPartialResponse?: boolean })?.isPartialResponse).toBe(false);
    });
  });

  describe('pre-search should update progressively', () => {
    it('documents expected streaming pre-search behavior', () => {
      /**
       * Pre-search has status: pending -> streaming -> complete
       * UI should show progress as queries execute
       *
       * Bug: All results appear at once instead of progressively
       */

      // Streaming state
      const streamingPreSearch = createMockPreSearch(0, MessageStatuses.STREAMING);
      expect(streamingPreSearch.status).toBe(MessageStatuses.STREAMING);
      expect(streamingPreSearch.searchData).toBeUndefined();

      // Complete state
      const completePreSearch = createMockPreSearch(0, MessageStatuses.COMPLETE);
      expect(completePreSearch.status).toBe(MessageStatuses.COMPLETE);
      expect(completePreSearch.searchData).toBeDefined();
    });
  });
});

// ============================================================================
// INTEGRATION: Real Production State Reproduction
// ============================================================================

describe('production State Reproduction', () => {
  it('fAILS: reproduces exact state dump from bug report', () => {
    /**
     * This test uses the exact state structure from the user's bug report
     * to verify all issues are caught
     */
    const messages: UIMessage[] = [
      // Round 0: 3 participants
      createTestUserMessage({ id: '01KCC1FR1PJ8CAP14C6M5HS0TC', content: 'say hi, 1 word only', roundNumber: 0 }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r0_p0',
        content: 'Hi',
        roundNumber: 0,
        participantId: '01KCC1FR15M9S8Y1CRHJ6ADZNG',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r0_p1',
        content: 'Hi',
        roundNumber: 0,
        participantId: '01KCC1FR15MYRT64K4Q70SNA2Z',
        participantIndex: 1,
      }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r0_p2',
        content: 'Hi',
        roundNumber: 0,
        participantId: '01KCC1FR16W3SF4NFJAJ84RCMF',
        participantIndex: 2,
      }),

      // Round 1: 2 participants
      createTestUserMessage({ id: 'vBtyMUmOMFSqpzBx', content: 'How would you explain quantum computing?', roundNumber: 1 }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r1_p0',
        content: 'Quantum computing explanation...',
        roundNumber: 1,
        participantId: '01KCC1H3AW39S7DVJYNTDYRRDM',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r1_p1',
        content: 'More quantum explanation...',
        roundNumber: 1,
        participantId: '01KCC1H3AXVF144Q29CME0ZFJZ',
        participantIndex: 1,
      }),

      // Round 2: CONFIG CHANGED - Only 1 participant now
      createTestUserMessage({ id: 'EYZNFCbPbRQ9MKOu', content: 'Add practical perspective', roundNumber: 2 }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r2_p0',
        content: 'Practical perspective...',
        roundNumber: 2,
        participantId: '01KCC1S6D47KTNBC46N7337WTB',
        participantIndex: 0,
      }),

      // Round 3: Same config as round 2
      createTestUserMessage({ id: 'XtLPXyhT5uYJZJNo', content: 'Add practical perspective', roundNumber: 3 }),
      createTestAssistantMessage({
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r3_p0',
        content: 'More practical perspective...',
        roundNumber: 3,
        participantId: '01KCC1S6D47KTNBC46N7337WTB',
        participantIndex: 0,
      }),
    ];

    // Changelogs (config changed before round 2)
    const changelog: TestChangelog[] = [
      createMockChangelog(2, [
        { type: 'removed', participantId: '01KCC1FR15M9S8Y1CRHJ6ADZNG', modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324 },
        { type: 'removed', participantId: '01KCC1FR15MYRT64K4Q70SNA2Z', modelId: ModelIds.X_AI_GROK_4_FAST },
        { type: 'removed', participantId: '01KCC1FR16W3SF4NFJAJ84RCMF', modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH },
        { type: 'added', participantId: '01KCC1S6D47KTNBC46N7337WTB', modelId: ModelIds.X_AI_GROK_4_1_FAST },
      ]),
    ];

    const preSearches: StoredPreSearch[] = [
      createMockPreSearch(0, MessageStatuses.COMPLETE),
      createMockPreSearch(1, MessageStatuses.COMPLETE),
      createMockPreSearch(2, MessageStatuses.COMPLETE),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog,
        preSearches,
      }),
    );

    const timeline = result.current;

    // =========== ASSERTIONS ===========

    // 1. Changelog should exist for round 2
    const round2Changelog = timeline.find(
      item => item.type === TimelineItemTypes.CHANGELOG && item.roundNumber === 2,
    );
    expect(round2Changelog).toBeDefined();

    // 2. Changelog should be FIRST item in round 2
    const round2Items = timeline.filter(item => item.roundNumber === 2);
    expect(round2Items[0]?.type).toBe(TimelineItemTypes.CHANGELOG);

    // 3. All rounds should have their messages
    [0, 1, 2, 3].forEach((roundNum) => {
      const roundMessages = timeline.find(
        item => item.type === TimelineItemTypes.MESSAGES && item.roundNumber === roundNum,
      );
      expect(roundMessages).toBeDefined();
    });

    // 4. Timeline should be in chronological order
    const roundNumbers = timeline
      .filter(item => item.type === TimelineItemTypes.MESSAGES)
      .map(item => item.roundNumber);
    expect(roundNumbers).toEqual([0, 1, 2, 3]);

    // 5. Pre-searches should NOT be at timeline level when messages exist
    // (they're rendered inside ChatMessageList)
    const timelinePreSearches = timeline.filter(item => item.type === TimelineItemTypes.PRE_SEARCH);
    expect(timelinePreSearches).toHaveLength(0);
  });
});
