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

import { MessagePartTypes, MessageRoles, MessageStatuses, ModelIds, TimelineItemTypes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { useThreadTimeline } from '@/hooks/utils';
import { createTestAssistantMessage, createTestUserMessage, renderHook } from '@/lib/testing';
import type { ChatThreadChangelog, DbModeratorMessageMetadata, StoredPreSearch } from '@/services/api';

// ============================================================================
// TEST HELPERS - Mimic production state structure
// ============================================================================

/**
 * TestChangelog - changelog with flexible createdAt type
 */
type TestChangelog = Omit<ChatThreadChangelog, 'createdAt'> & {
  createdAt: Date | string;
};

function createMockChangelog(
  roundNumber: number,
  changes: {
    type: 'added' | 'removed' | 'modified' | 'reordered' | 'mode_change';
    participantId?: string;
    modelId?: string;
    oldRole?: string;
    newRole?: string;
    oldPriority?: number;
    newPriority?: number;
    oldMode?: string;
    newMode?: string;
  }[],
): TestChangelog {
  return {
    changeData: {
      changes: changes.map(c => ({
        modelId: c.modelId,
        newMode: c.newMode,
        newPriority: c.newPriority,
        newRole: c.newRole,
        oldMode: c.oldMode,
        oldPriority: c.oldPriority,
        oldRole: c.oldRole,
        participantId: c.participantId,
        type: c.type,
      })),
    },
    changeType: 'participant_change',
    createdAt: new Date(),
    id: `changelog-r${roundNumber}`,
    previousRoundNumber: roundNumber > 0 ? roundNumber - 1 : null,
    roundNumber,
    threadId: 'thread-123',
  };
}

function createMockPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses] = MessageStatuses.COMPLETE,
): StoredPreSearch {
  return {
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-r${roundNumber}`,
    roundNumber,
    searchData: status === MessageStatuses.COMPLETE
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
    userQuery: `Query for round ${roundNumber}`,
  } as StoredPreSearch;
}

function createModeratorMessage(
  roundNumber: number,
  text: string,
): UIMessage {
  const metadata: DbModeratorMessageMetadata = {
    hasError: false,
    isModerator: true,
    model: 'moderator-model',
    role: MessageRoles.ASSISTANT,
    roundNumber,
  };
  return {
    id: `moderator-r${roundNumber}`,
    metadata,
    parts: [{ text, type: MessagePartTypes.TEXT }],
    role: MessageRoles.ASSISTANT,
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
        createTestUserMessage({ content: 'Round 0 question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P0 response', id: 'a0p0', participantId: 'p0', participantIndex: 0, roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P1 response', id: 'a0p1', participantId: 'p1', participantIndex: 1, roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P2 response', id: 'a0p2', participantId: 'p2', participantIndex: 2, roundNumber: 0 }),
        // Round 1
        createTestUserMessage({ content: 'Round 1 question', id: 'u1', roundNumber: 1 }),
        createTestAssistantMessage({ content: 'P0 response', id: 'a1p0', participantId: 'p0', participantIndex: 0, roundNumber: 1 }),
        createTestAssistantMessage({ content: 'P1 response', id: 'a1p1', participantId: 'p1', participantIndex: 1, roundNumber: 1 }),
        // Round 2 - CONFIG CHANGED: Only 1 participant now
        createTestUserMessage({ content: 'Round 2 question', id: 'u2', roundNumber: 2 }),
        createTestAssistantMessage({ content: 'P0 response', id: 'a2p0', participantId: 'new-p0', participantIndex: 0, roundNumber: 2 }),
      ];

      // Changelog for round 2 (config changed before round 2)
      const changelog: TestChangelog[] = [
        createMockChangelog(2, [
          { modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, participantId: 'p0', type: 'removed' },
          { modelId: ModelIds.X_AI_GROK_4_FAST, participantId: 'p1', type: 'removed' },
          { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, participantId: 'p2', type: 'removed' },
          { modelId: ModelIds.X_AI_GROK_4_1_FAST, participantId: 'new-p0', type: 'added' },
        ]),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog,
          messages,
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
        createTestUserMessage({ content: 'Round 2', id: 'u2', roundNumber: 2 }),
        createTestAssistantMessage({ content: 'Response', id: 'a2p0', participantId: 'p0', participantIndex: 0, roundNumber: 2 }),
        // Round 3 - same config as round 2
        createTestUserMessage({ content: 'Round 3', id: 'u3', roundNumber: 3 }),
        createTestAssistantMessage({ content: 'Response', id: 'a3p0', participantId: 'p0', participantIndex: 0, roundNumber: 3 }),
      ];

      const changelog: TestChangelog[] = [
        createMockChangelog(2, [
          { modelId: 'grok-4.1-fast', participantId: 'p0', type: 'added' },
        ]),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog,
          messages,
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
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P0', id: 'a0p0', participantId: 'p0', participantIndex: 0, roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P1', id: 'a0p1', participantId: 'p1', participantIndex: 1, roundNumber: 0 }),
        createModeratorMessage(0, 'Round 0 moderator'),
      ];

      const preSearches: StoredPreSearch[] = [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
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
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        createTestAssistantMessage({ content: 'Response', id: 'a0p0', participantId: 'p0', participantIndex: 0, roundNumber: 0 }),
        // Round 1 has NO messages yet (orphaned pre-search)
      ];

      const preSearches: StoredPreSearch[] = [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
        createMockPreSearch(1, MessageStatuses.STREAMING), // Round 1 pre-search in progress, no messages
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
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
        createTestUserMessage({ content: 'Question', id: 'u0', roundNumber: 0 }),
        // Intentionally out of order in array (simulating race condition)
        createTestAssistantMessage({ content: 'P2', id: 'a0p2', participantId: 'p2', participantIndex: 2, roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P0', id: 'a0p0', participantId: 'p0', participantIndex: 0, roundNumber: 0 }),
        createTestAssistantMessage({ content: 'P1', id: 'a0p1', participantId: 'p1', participantIndex: 1, roundNumber: 0 }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          changelog: [],
          messages,
          preSearches: [],
        }),
      );

      const timeline = result.current;
      const messagesItem = timeline.find(item => item.type === TimelineItemTypes.MESSAGES);

      expect(messagesItem).toBeDefined();
      expect(messagesItem?.type).toBe(TimelineItemTypes.MESSAGES);

      // Type assertion after expect assertion
      const typedMessagesItem = messagesItem as { type: 'messages'; data: { role: string; metadata?: { participantIndex?: number } }[] };
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
      createTestUserMessage({ content: 'Round 1', id: 'u1', roundNumber: 1 }),
      createTestAssistantMessage({ content: 'R1', id: 'a1p0', participantId: 'p0', participantIndex: 0, roundNumber: 1 }),
      // Config change happens here
      createTestUserMessage({ content: 'Round 2', id: 'u2', roundNumber: 2 }),
      createTestAssistantMessage({ content: 'R2', id: 'a2p0', participantId: 'new-p0', participantIndex: 0, roundNumber: 2 }),
      // Round 3 submitted
      createTestUserMessage({ content: 'Round 3', id: 'u3', roundNumber: 3 }),
      createTestAssistantMessage({ content: 'R3', id: 'a3p0', participantId: 'new-p0', participantIndex: 0, roundNumber: 3 }),
    ];

    const changelog: TestChangelog[] = [
      createMockChangelog(2, [
        { participantId: 'p0', type: 'removed' },
        { modelId: ModelIds.X_AI_GROK_4_1_FAST, participantId: 'new-p0', type: 'added' },
      ]),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog,
        messages,
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
        metadata: {
          isPartialResponse: true,
          participantId: 'p0',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'Partial...', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      };

      // Message should have isPartialResponse flag during streaming
      expect((streamingMessage.metadata as { isPartialResponse?: boolean })?.isPartialResponse).toBeTruthy();

      // After streaming completes, flag should be false
      const completedMessage: UIMessage = {
        ...streamingMessage,
        metadata: {
          finishReason: 'stop',
          isPartialResponse: false,
          participantId: streamingMessage.metadata?.participantId as string,
          participantIndex: streamingMessage.metadata?.participantIndex as number,
          role: MessageRoles.ASSISTANT,
          roundNumber: streamingMessage.metadata?.roundNumber ?? 0,
        },
        parts: [{ text: 'Complete response with all content', type: 'text' }],
      };

      expect((completedMessage.metadata as { isPartialResponse?: boolean })?.isPartialResponse).toBeFalsy();
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
      createTestUserMessage({ content: 'say hi, 1 word only', id: '01KCC1FR1PJ8CAP14C6M5HS0TC', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'Hi',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r0_p0',
        participantId: '01KCC1FR15M9S8Y1CRHJ6ADZNG',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'Hi',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r0_p1',
        participantId: '01KCC1FR15MYRT64K4Q70SNA2Z',
        participantIndex: 1,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'Hi',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r0_p2',
        participantId: '01KCC1FR16W3SF4NFJAJ84RCMF',
        participantIndex: 2,
        roundNumber: 0,
      }),

      // Round 1: 2 participants
      createTestUserMessage({ content: 'How would you explain quantum computing?', id: 'vBtyMUmOMFSqpzBx', roundNumber: 1 }),
      createTestAssistantMessage({
        content: 'Quantum computing explanation...',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r1_p0',
        participantId: '01KCC1H3AW39S7DVJYNTDYRRDM',
        participantIndex: 0,
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        content: 'More quantum explanation...',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r1_p1',
        participantId: '01KCC1H3AXVF144Q29CME0ZFJZ',
        participantIndex: 1,
        roundNumber: 1,
      }),

      // Round 2: CONFIG CHANGED - Only 1 participant now
      createTestUserMessage({ content: 'Add practical perspective', id: 'EYZNFCbPbRQ9MKOu', roundNumber: 2 }),
      createTestAssistantMessage({
        content: 'Practical perspective...',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r2_p0',
        participantId: '01KCC1S6D47KTNBC46N7337WTB',
        participantIndex: 0,
        roundNumber: 2,
      }),

      // Round 3: Same config as round 2
      createTestUserMessage({ content: 'Add practical perspective', id: 'XtLPXyhT5uYJZJNo', roundNumber: 3 }),
      createTestAssistantMessage({
        content: 'More practical perspective...',
        id: '01KCC1FR0V0ZS0X63M794KFE6X_r3_p0',
        participantId: '01KCC1S6D47KTNBC46N7337WTB',
        participantIndex: 0,
        roundNumber: 3,
      }),
    ];

    // Changelogs (config changed before round 2)
    const changelog: TestChangelog[] = [
      createMockChangelog(2, [
        { modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, participantId: '01KCC1FR15M9S8Y1CRHJ6ADZNG', type: 'removed' },
        { modelId: ModelIds.X_AI_GROK_4_FAST, participantId: '01KCC1FR15MYRT64K4Q70SNA2Z', type: 'removed' },
        { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, participantId: '01KCC1FR16W3SF4NFJAJ84RCMF', type: 'removed' },
        { modelId: ModelIds.X_AI_GROK_4_1_FAST, participantId: '01KCC1S6D47KTNBC46N7337WTB', type: 'added' },
      ]),
    ];

    const preSearches: StoredPreSearch[] = [
      createMockPreSearch(0, MessageStatuses.COMPLETE),
      createMockPreSearch(1, MessageStatuses.COMPLETE),
      createMockPreSearch(2, MessageStatuses.COMPLETE),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog,
        messages,
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
