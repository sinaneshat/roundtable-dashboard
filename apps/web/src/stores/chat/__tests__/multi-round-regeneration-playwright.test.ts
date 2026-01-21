/**
 * Multi-Round Regeneration E2E Tests
 *
 * Tests round regeneration (retry) behavior as documented in
 * FLOW_DOCUMENTATION.md Part 7: Regenerating a Round
 *
 * Key behaviors tested:
 * - Only most recent round can be regenerated
 * - All AI responses deleted for that round
 * - Moderator deleted for that round
 * - User's question preserved
 * - Round number stays the same after regeneration
 * - Multiple regeneration attempts allowed
 * - Regeneration with configuration changes
 * - Regeneration with web search
 *
 * Per FLOW_DOCUMENTATION.md Part 7:
 * "Only on the MOST RECENT round - circular arrow button appears"
 * "Round numbers never change (even during regeneration)"
 * "Button remains available after regeneration completes"
 */

import { FinishReasons, MessageStatuses, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import {
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { StoredPreSearch } from '@/services/api';

// ============================================================================
// TYPES
// ============================================================================

type RegenerationState = {
  canRegenerate: boolean;
  targetRound: number | null;
};

type ConversationState = {
  threadId: string;
  messages: Array<TestUserMessage | TestAssistantMessage>;
  preSearches: StoredPreSearch[];
  currentRoundNumber: number;
};

type RegenerationAction = {
  roundNumber: number;
  deletedMessages: number;
  deletedModerator: boolean;
  deletedPreSearch: boolean;
  preservedUserMessage: boolean;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createConversation(threadId: string): ConversationState {
  return {
    threadId,
    messages: [],
    preSearches: [],
    currentRoundNumber: 0,
  };
}

function addCompleteRound(
  state: ConversationState,
  roundNumber: number,
  userQuestion: string,
  participantResponses: string[],
  includeModerator = true,
  preSearch?: StoredPreSearch,
): ConversationState {
  const messages = [...state.messages];

  // Add user message
  messages.push(createTestUserMessage({
    id: `${state.threadId}_r${roundNumber}_user`,
    content: userQuestion,
    roundNumber,
  }));

  // Add participant messages
  participantResponses.forEach((response, index) => {
    messages.push(createTestAssistantMessage({
      id: `${state.threadId}_r${roundNumber}_p${index}`,
      content: response,
      roundNumber,
      participantId: `participant-${index}`,
      participantIndex: index,
      finishReason: FinishReasons.STOP,
    }));
  });

  // Add moderator
  if (includeModerator) {
    messages.push(createTestModeratorMessage({
      id: `${state.threadId}_r${roundNumber}_moderator`,
      content: `Moderator for round ${roundNumber}`,
      roundNumber,
    }));
  }

  // Add pre-search if provided
  const preSearches = preSearch ? [...state.preSearches, preSearch] : state.preSearches;

  return {
    ...state,
    messages,
    preSearches,
    currentRoundNumber: Math.max(state.currentRoundNumber, roundNumber),
  };
}

function canRegenerateRound(
  state: ConversationState,
  roundNumber: number,
): RegenerationState {
  // Can only regenerate most recent round
  const canRegenerate = roundNumber === state.currentRoundNumber;

  return {
    canRegenerate,
    targetRound: canRegenerate ? roundNumber : null,
  };
}

function regenerateRound(
  state: ConversationState,
  roundNumber: number,
): RegenerationAction {
  const action: RegenerationAction = {
    roundNumber,
    deletedMessages: 0,
    deletedModerator: false,
    deletedPreSearch: false,
    preservedUserMessage: false,
  };

  // Check if user message exists
  const userMessage = state.messages.find(
    m => m.role === UIMessageRoles.USER && m.metadata.roundNumber === roundNumber,
  );
  action.preservedUserMessage = !!userMessage;

  // Delete all assistant messages (non-moderator) for this round
  const assistantMessages = state.messages.filter(
    m => m.role === UIMessageRoles.ASSISTANT
      && m.metadata.roundNumber === roundNumber
      && !('isModerator' in m.metadata && m.metadata.isModerator),
  );
  action.deletedMessages = assistantMessages.length;

  // Delete moderator for this round
  const moderatorMessage = state.messages.find(
    m => m.role === UIMessageRoles.ASSISTANT
      && m.metadata.roundNumber === roundNumber
      && 'isModerator' in m.metadata
      && m.metadata.isModerator,
  );
  action.deletedModerator = !!moderatorMessage;

  // Delete pre-search for this round
  const preSearchIndex = state.preSearches.findIndex(ps => ps.roundNumber === roundNumber);
  action.deletedPreSearch = preSearchIndex !== -1;

  // Actually perform deletions
  state.messages = state.messages.filter(
    m => !(m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === roundNumber),
  );
  state.preSearches = state.preSearches.filter(ps => ps.roundNumber !== roundNumber);

  return action;
}

function addRegeneratedResponses(
  state: ConversationState,
  roundNumber: number,
  newResponses: string[],
  includeModerator = true,
): ConversationState {
  const messages = [...state.messages];

  // Add new participant messages
  newResponses.forEach((response, index) => {
    messages.push(createTestAssistantMessage({
      id: `${state.threadId}_r${roundNumber}_p${index}_retry`,
      content: response,
      roundNumber,
      participantId: `participant-${index}`,
      participantIndex: index,
      finishReason: FinishReasons.STOP,
    }));
  });

  // Add new moderator
  if (includeModerator) {
    messages.push(createTestModeratorMessage({
      id: `${state.threadId}_r${roundNumber}_moderator_retry`,
      content: `Regenerated moderator for round ${roundNumber}`,
      roundNumber,
    }));
  }

  return {
    ...state,
    messages,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('multi-Round Regeneration E2E', () => {
  describe('regenerating Most Recent Round', () => {
    it('should regenerate Round 1 after completing Round 0 and Round 1', () => {
      let state = createConversation('thread-123');

      // Complete Round 0
      state = addCompleteRound(state, 0, 'Q0', ['R0P0', 'R0P1']);

      // Complete Round 1
      state = addCompleteRound(state, 1, 'Q1', ['R1P0 original', 'R1P1 original']);

      expect(state.currentRoundNumber).toBe(1);

      // Verify can regenerate Round 1 (most recent)
      const canRegen = canRegenerateRound(state, 1);
      expect(canRegen.canRegenerate).toBe(true);
      expect(canRegen.targetRound).toBe(1);

      // Regenerate Round 1
      const action = regenerateRound(state, 1);
      expect(action.deletedMessages).toBe(2);
      expect(action.deletedModerator).toBe(true);
      expect(action.preservedUserMessage).toBe(true);

      // Verify Round 0 unchanged
      const round0Messages = state.messages.filter(m => m.metadata.roundNumber === 0);
      expect(round0Messages).toHaveLength(4); // 1 user + 2 assistant + 1 moderator
    });

    it('should delete all Round 1 participant messages', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1P0', 'R1P1', 'R1P2']);

      // Before regeneration
      const beforeAssistant = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 1,
      );
      expect(beforeAssistant).toHaveLength(4); // 3 participants + 1 moderator

      // Regenerate
      regenerateRound(state, 1);

      // After regeneration
      const afterAssistant = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 1,
      );
      expect(afterAssistant).toHaveLength(0);
    });

    it('should delete Round 1 moderator', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1'], true); // includeModerator=true

      // Before regeneration - moderator exists
      const beforeModerator = state.messages.find(
        m => m.role === UIMessageRoles.ASSISTANT
          && m.metadata.roundNumber === 1
          && 'isModerator' in m.metadata
          && m.metadata.isModerator,
      );
      expect(beforeModerator).toBeDefined();

      // Regenerate
      regenerateRound(state, 1);

      // After regeneration - moderator deleted
      const afterModerator = state.messages.find(
        m => m.role === UIMessageRoles.ASSISTANT
          && m.metadata.roundNumber === 1
          && 'isModerator' in m.metadata
          && m.metadata.isModerator,
      );
      expect(afterModerator).toBeUndefined();
    });

    it('should preserve Round 1 user message', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Original question Round 1', ['R1']);

      // Regenerate
      const action = regenerateRound(state, 1);
      expect(action.preservedUserMessage).toBe(true);

      // Verify user message still exists
      const userMessage = state.messages.find(
        m => m.role === UIMessageRoles.USER && m.metadata.roundNumber === 1,
      );
      expect(userMessage).toBeDefined();
      expect(userMessage?.parts[0]?.text).toBe('Original question Round 1');
    });

    it('should preserve Round 0 completely', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0P0', 'R0P1']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']);

      // Capture Round 0 state before regeneration
      const round0Before = state.messages.filter(m => m.metadata.roundNumber === 0);
      const round0BeforeCount = round0Before.length;

      // Regenerate Round 1
      regenerateRound(state, 1);

      // Verify Round 0 unchanged
      const round0After = state.messages.filter(m => m.metadata.roundNumber === 0);
      expect(round0After).toHaveLength(round0BeforeCount);
      expect(round0After.map(m => m.id)).toEqual(round0Before.map(m => m.id));
    });

    it('should maintain round number (stays Round 1)', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']);

      // Regenerate Round 1
      regenerateRound(state, 1);

      // Add new responses for Round 1
      state = addRegeneratedResponses(state, 1, ['R1P0 regenerated']);

      // Verify round number still 1
      const newMessages = state.messages.filter(m => m.metadata.roundNumber === 1);
      expect(newMessages.every(m => m.metadata.roundNumber === 1)).toBe(true);

      // Current round number unchanged
      expect(state.currentRoundNumber).toBe(1);
    });
  });

  describe('multiple Regeneration Attempts', () => {
    it('should allow regenerating same round 3 times in a row', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);

      for (let attempt = 1; attempt <= 3; attempt++) {
        // Add Round 1 responses
        state = addCompleteRound(state, 1, 'Q1', [`Attempt ${attempt}`]);

        // Verify can regenerate
        const canRegen = canRegenerateRound(state, 1);
        expect(canRegen.canRegenerate).toBe(true);

        // Regenerate
        if (attempt < 3) {
          // Only regenerate for attempts 1 and 2
          regenerateRound(state, 1);
        }
      }

      // Final state should have Round 1 with attempt 3
      const round1Messages = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 1,
      );
      expect(round1Messages.length).toBeGreaterThan(0);
    });

    it('should verify each regeneration creates fresh responses', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);

      // First attempt
      state = addCompleteRound(state, 1, 'Q1', ['First attempt response']);
      let round1Content = state.messages.find(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 1 && m.metadata.participantIndex === 0,
      )?.parts[0]?.text;
      expect(round1Content).toBe('First attempt response');

      // Regenerate
      regenerateRound(state, 1);
      state = addRegeneratedResponses(state, 1, ['Second attempt response']);

      round1Content = state.messages.find(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 1 && m.metadata.participantIndex === 0,
      )?.parts[0]?.text;
      expect(round1Content).toBe('Second attempt response');

      // Regenerate again
      regenerateRound(state, 1);
      state = addRegeneratedResponses(state, 1, ['Third attempt response']);

      round1Content = state.messages.find(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 1 && m.metadata.participantIndex === 0,
      )?.parts[0]?.text;
      expect(round1Content).toBe('Third attempt response');
    });
  });

  describe('regeneration with Configuration Changes', () => {
    it('should regenerate Round 1 after adding participant', () => {
      let state = createConversation('thread-123');

      // Round 0 with 2 participants
      state = addCompleteRound(state, 0, 'Q0', ['R0P0', 'R0P1']);

      // Round 1 with 2 participants
      state = addCompleteRound(state, 1, 'Q1', ['R1P0', 'R1P1']);

      // Regenerate with 3 participants
      regenerateRound(state, 1);
      state = addRegeneratedResponses(state, 1, ['R1P0 new', 'R1P1 new', 'R1P2 new']);

      const round1Participants = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT
          && m.metadata.roundNumber === 1
          && !('isModerator' in m.metadata && m.metadata.isModerator),
      );
      expect(round1Participants).toHaveLength(3);
    });

    it('should regenerate Round 1 with new conversation mode (placeholder)', () => {
      // In real implementation, mode would affect moderator criteria
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']);

      // Regenerate - mode change would be reflected in new moderator
      regenerateRound(state, 1);
      state = addRegeneratedResponses(state, 1, ['R1 regenerated'], true);

      // New moderator would use different criteria based on mode
      const newModerator = state.messages.find(
        m => m.metadata.roundNumber === 1
          && 'isModerator' in m.metadata
          && m.metadata.isModerator,
      );
      expect(newModerator).toBeDefined();
      expect(newModerator?.parts[0]?.text).toContain('Regenerated moderator');
    });
  });

  describe('regeneration NOT Allowed', () => {
    it('should NOT show regenerate button on Round 0 when Round 1 exists', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']);

      // Cannot regenerate Round 0 (not most recent)
      const canRegen = canRegenerateRound(state, 0);
      expect(canRegen.canRegenerate).toBe(false);
      expect(canRegen.targetRound).toBeNull();
    });

    it('should only show regenerate on most recent round', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']);
      state = addCompleteRound(state, 2, 'Q2', ['R2']);

      // Round 0 - cannot regenerate
      expect(canRegenerateRound(state, 0).canRegenerate).toBe(false);

      // Round 1 - cannot regenerate
      expect(canRegenerateRound(state, 1).canRegenerate).toBe(false);

      // Round 2 - can regenerate (most recent)
      expect(canRegenerateRound(state, 2).canRegenerate).toBe(true);
    });

    it('should update regenerate availability when adding new round', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']);

      // Round 1 can be regenerated
      expect(canRegenerateRound(state, 1).canRegenerate).toBe(true);

      // Add Round 2
      state = addCompleteRound(state, 2, 'Q2', ['R2']);

      // Round 1 can NO LONGER be regenerated
      expect(canRegenerateRound(state, 1).canRegenerate).toBe(false);

      // Round 2 can now be regenerated
      expect(canRegenerateRound(state, 2).canRegenerate).toBe(true);
    });
  });

  describe('regeneration with Web Search', () => {
    it('should regenerate round with pre-search re-execution', () => {
      let state = createConversation('thread-123');

      // Round 0 without pre-search
      state = addCompleteRound(state, 0, 'Q0', ['R0']);

      // Round 1 with pre-search
      const preSearch = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      state = addCompleteRound(state, 1, 'Q1', ['R1'], true, preSearch);

      expect(state.preSearches).toHaveLength(1);

      // Regenerate Round 1
      const action = regenerateRound(state, 1);
      expect(action.deletedPreSearch).toBe(true);

      // Pre-search deleted
      expect(state.preSearches).toHaveLength(0);

      // Re-add pre-search for regenerated round
      const newPreSearch = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      state.preSearches.push(newPreSearch);
      state = addRegeneratedResponses(state, 1, ['R1 regenerated with new search']);

      expect(state.preSearches).toHaveLength(1);
    });

    it('should generate new search query on regeneration (placeholder)', () => {
      // In real implementation, backend would generate new optimized query
      let state = createConversation('thread-123');

      // Round 0 with pre-search
      const originalPreSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
        searchData: {
          queries: [{ query: 'original query', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
          results: [],
          moderatorSummary: 'Summary',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 1000,
        },
      });
      state = addCompleteRound(state, 0, 'Q0', ['R0'], true, originalPreSearch);

      const originalQuery = originalPreSearch.searchData?.queries[0]?.query;
      expect(originalQuery).toBe('original query');

      // Regenerate
      regenerateRound(state, 0);

      // New pre-search with potentially different query
      const newPreSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
        searchData: {
          queries: [{ query: 'new query', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
          results: [],
          moderatorSummary: 'Summary',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 1000,
        },
      });
      state.preSearches.push(newPreSearch);

      // Both queries could be different (AI generates optimized query each time)
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.searchData?.queries[0]?.query).toBe('new query');
    });

    it('should handle regeneration when web search disabled (no pre-search)', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0']);
      state = addCompleteRound(state, 1, 'Q1', ['R1']); // No pre-search

      expect(state.preSearches).toHaveLength(0);

      // Regenerate - no pre-search to delete
      const action = regenerateRound(state, 1);
      expect(action.deletedPreSearch).toBe(false);

      // Re-add without pre-search
      state = addRegeneratedResponses(state, 1, ['R1 regenerated']);

      expect(state.preSearches).toHaveLength(0);
    });

    it('should handle switching web search ON during regeneration', () => {
      let state = createConversation('thread-123');

      // Round 0 without web search
      state = addCompleteRound(state, 0, 'Q0', ['R0']);

      // Regenerate with web search enabled
      regenerateRound(state, 0);

      const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      state.preSearches.push(preSearch);
      state = addRegeneratedResponses(state, 0, ['R0 with search results']);

      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.roundNumber).toBe(0);
    });
  });

  describe('edge Cases', () => {
    it('should handle regenerating single-participant round', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['Single participant response']);

      regenerateRound(state, 0);
      state = addRegeneratedResponses(state, 0, ['Regenerated single participant']);

      const round0Messages = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      );
      expect(round0Messages).toHaveLength(2); // 1 participant + 1 moderator
    });

    it('should handle regenerating round with 10 participants', () => {
      let state = createConversation('thread-123');

      const originalResponses = Array.from({ length: 10 }, (_, i) => `Original P${i}`);
      state = addCompleteRound(state, 0, 'Q0', originalResponses);

      // Before regeneration
      const beforeCount = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      ).length;
      expect(beforeCount).toBe(11); // 10 participants + 1 moderator

      // Regenerate
      regenerateRound(state, 0);

      const newResponses = Array.from({ length: 10 }, (_, i) => `Regenerated P${i}`);
      state = addRegeneratedResponses(state, 0, newResponses);

      // After regeneration
      const afterCount = state.messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      ).length;
      expect(afterCount).toBe(11); // 10 participants + 1 moderator (regenerated)
    });

    it('should maintain message ordering after regeneration', () => {
      let state = createConversation('thread-123');

      state = addCompleteRound(state, 0, 'Q0', ['R0P0', 'R0P1']);

      regenerateRound(state, 0);
      state = addRegeneratedResponses(state, 0, ['R0P0 regen', 'R0P1 regen']);

      // Verify messages are in correct order: user → participants → moderator
      const round0Messages = state.messages.filter(m => m.metadata.roundNumber === 0);

      expect(round0Messages[0]?.role).toBe(UIMessageRoles.USER);
      expect(round0Messages[1]?.role).toBe(UIMessageRoles.ASSISTANT);
      expect(round0Messages[2]?.role).toBe(UIMessageRoles.ASSISTANT);
      expect(round0Messages[3]?.role).toBe(UIMessageRoles.ASSISTANT);
    });
  });
});
