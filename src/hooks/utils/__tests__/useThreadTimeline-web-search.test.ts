/**
 * Thread Timeline Web Search Integration Test
 *
 * Tests the timeline grouping behavior when web search is enabled mid-conversation.
 * Verifies that optimistic user messages are properly included in the timeline.
 *
 * BUG: When enabling web search on round 2+, user message doesn't render
 * ROOT CAUSE: Need to verify timeline grouping with optimistic messages
 *
 * Location: /src/hooks/utils/__tests__/useThreadTimeline-web-search.test.ts
 */

import { renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessagePartTypes, MessageRoles } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useThreadTimeline } from '@/hooks/utils/useThreadTimeline';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createUserMessage(roundNumber: number, text: string, options?: { isOptimistic?: boolean }): UIMessage {
  return {
    id: `user-r${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      ...(options?.isOptimistic ? { isOptimistic: true } : {}),
    },
  } as UIMessage;
}

function createAssistantMessage(roundNumber: number, participantIndex: number, text: string): UIMessage {
  return {
    id: `assistant-r${roundNumber}-p${participantIndex}-${Date.now()}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      model: 'test-model',
      participantRole: 'test-role',
      finishReason: 'stop',
    },
  } as UIMessage;
}

function createAnalysis(roundNumber: number): StoredModeratorAnalysis {
  return {
    id: `analysis-${roundNumber}`,
    threadId: 'test-thread',
    roundNumber,
    status: 'complete',
    summary: 'Test summary',
    keyInsights: [],
    recommendations: [],
    participantMessageIds: ['msg-1'],
    createdAt: new Date(),
    completedAt: new Date(),
    errorMessage: null,
    chatMode: 'analyzing',
    userQuestion: 'Test question',
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('useThreadTimeline with Web Search', () => {
  describe('optimistic user message in timeline', () => {
    it('should include optimistic user message for round 2 in timeline', () => {
      // SETUP: Rounds 0 and 1 complete
      const round0Messages: UIMessage[] = [
        createUserMessage(0, 'Round 0 question'),
        createAssistantMessage(0, 0, 'Round 0 response'),
      ];

      const round1Messages: UIMessage[] = [
        createUserMessage(1, 'Round 1 question'),
        createAssistantMessage(1, 0, 'Round 1 response'),
      ];

      // USER ACTION: Add optimistic message for round 2
      const round2OptimisticMessage = createUserMessage(2, 'Round 2 question with web search', { isOptimistic: true });

      const allMessages = [...round0Messages, ...round1Messages, round2OptimisticMessage];

      const analyses: StoredModeratorAnalysis[] = [
        createAnalysis(0),
        createAnalysis(1),
      ];

      // Render hook
      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: allMessages,
          analyses,
          changelog: [],
        }),
      );

      const timeline = result.current;

      // Should have timeline items for rounds 0, 1, and 2
      // Each round with messages gets a 'messages' item
      // Rounds with analyses get an 'analysis' item
      const messageItems = timeline.filter(item => item.type === 'messages');
      const analysisItems = timeline.filter(item => item.type === 'analysis');

      // 3 rounds of messages
      expect(messageItems).toHaveLength(3);
      expect(analysisItems).toHaveLength(2); // Analyses for rounds 0 and 1

      // Verify round 2 messages are included
      const round2Item = messageItems.find(item => item.roundNumber === 2);
      expect(round2Item).toBeDefined();
      expect(round2Item?.type).toBe('messages');
      expect(round2Item?.data).toHaveLength(1);

      // Verify the optimistic message is in round 2
      const round2Messages = round2Item?.data || [];
      expect(round2Messages[0].metadata?.isOptimistic).toBe(true);
      expect(round2Messages[0].metadata?.roundNumber).toBe(2);
    });

    it('should maintain timeline order with optimistic message as last item', () => {
      // SETUP: Complete conversation with rounds 0-2, then add optimistic message for round 3
      const messages: UIMessage[] = [
        createUserMessage(0, 'R0'),
        createAssistantMessage(0, 0, 'R0 response'),
        createUserMessage(1, 'R1'),
        createAssistantMessage(1, 0, 'R1 response'),
        createUserMessage(2, 'R2'),
        createAssistantMessage(2, 0, 'R2 response'),
        createUserMessage(3, 'R3 with web search', { isOptimistic: true }),
      ];

      const analyses = [createAnalysis(0), createAnalysis(1), createAnalysis(2)];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses,
          changelog: [],
        }),
      );

      const timeline = result.current;

      // Timeline order should be: r0-msgs, r0-analysis, r1-msgs, r1-analysis, r2-msgs, r2-analysis, r3-msgs
      expect(timeline).toHaveLength(7); // 4 rounds of messages + 3 analyses

      // Last item should be round 3 messages (optimistic)
      const lastItem = timeline[timeline.length - 1];
      expect(lastItem.type).toBe('messages');
      expect(lastItem.roundNumber).toBe(3);
    });

    it('should handle optimistic message metadata structure correctly', () => {
      // This tests the exact metadata structure created by prepareForNewMessage
      const optimisticMessage: UIMessage = {
        id: `optimistic-user-${Date.now()}-r2`,
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Test message' }],
        metadata: {
          role: MessageRoles.USER, // This is the key field for DbUserMessageMetadataSchema
          roundNumber: 2,
          isOptimistic: true,
        },
      } as UIMessage;

      const messages: UIMessage[] = [
        createUserMessage(0, 'R0'),
        createAssistantMessage(0, 0, 'R0 response'),
        createUserMessage(1, 'R1'),
        createAssistantMessage(1, 0, 'R1 response'),
        optimisticMessage,
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses: [createAnalysis(0), createAnalysis(1)],
          changelog: [],
        }),
      );

      const timeline = result.current;
      const messageItems = timeline.filter(item => item.type === 'messages');

      // Should have 3 rounds of messages
      expect(messageItems).toHaveLength(3);

      // Round 2 should exist with the optimistic message
      const round2Item = messageItems.find(item => item.roundNumber === 2);
      expect(round2Item).toBeDefined();
      expect(round2Item?.data).toHaveLength(1);
      expect(round2Item?.data[0].id).toContain('optimistic-user');
    });
  });

  describe('getRoundNumber integration', () => {
    it('should correctly extract round number from optimistic message metadata', () => {
      // Test that getRoundNumber works with the isOptimistic extra field
      const messages: UIMessage[] = [
        {
          id: 'user-1',
          role: MessageRoles.USER,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 0,
            isOptimistic: true, // Extra field that shouldn't break getRoundNumber
          },
        } as UIMessage,
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses: [],
          changelog: [],
        }),
      );

      const timeline = result.current;
      expect(timeline).toHaveLength(1);
      expect(timeline[0].type).toBe('messages');
      expect(timeline[0].roundNumber).toBe(0);
    });
  });

  describe('web search toggle scenarios', () => {
    it('should handle mid-conversation web search enable correctly', () => {
      // Simulate: Thread had rounds 0,1 without web search, user enables for round 2
      const messages: UIMessage[] = [
        // Round 0 - no web search
        createUserMessage(0, 'Initial question'),
        createAssistantMessage(0, 0, 'Model 1 response'),
        createAssistantMessage(0, 1, 'Model 2 response'),

        // Round 1 - no web search
        createUserMessage(1, 'Follow-up'),
        createAssistantMessage(1, 0, 'Model 1 follow-up'),
        createAssistantMessage(1, 1, 'Model 2 follow-up'),

        // Round 2 - web search enabled (optimistic message)
        createUserMessage(2, 'Question with web search', { isOptimistic: true }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses: [createAnalysis(0), createAnalysis(1)],
          changelog: [],
        }),
      );

      const timeline = result.current;

      // Verify all rounds are present
      const roundNumbers = timeline
        .filter(item => item.type === 'messages')
        .map(item => item.roundNumber);

      expect(roundNumbers).toEqual([0, 1, 2]);

      // Round 2 should have only the user message (optimistic)
      const round2 = timeline.find(item => item.type === 'messages' && item.roundNumber === 2);
      expect(round2?.data).toHaveLength(1);
      expect(round2?.data[0].role).toBe('user');
    });

    it('should preserve timeline integrity when changelog items exist', () => {
      const messages: UIMessage[] = [
        createUserMessage(0, 'R0'),
        createAssistantMessage(0, 0, 'R0 response'),
        createUserMessage(1, 'R1 with web search', { isOptimistic: true }),
      ];

      const changelog = [
        {
          id: 'change-1',
          threadId: 'test-thread',
          roundNumber: 1,
          changeType: 'web_search_enabled' as const,
          changeData: { enableWebSearch: true },
          createdAt: new Date().toISOString(),
        },
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses: [createAnalysis(0)],
          changelog,
        }),
      );

      const timeline = result.current;

      // Timeline should include: r0-msgs, r0-analysis, r1-changelog, r1-msgs
      expect(timeline).toHaveLength(4);

      // Changelog should come before messages for round 1
      const round1Items = timeline.filter(item => item.roundNumber === 1);
      expect(round1Items).toHaveLength(2);
      expect(round1Items[0].type).toBe('changelog');
      expect(round1Items[1].type).toBe('messages');
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      const { result } = renderHook(() =>
        useThreadTimeline({
          messages: [],
          analyses: [],
          changelog: [],
        }),
      );

      expect(result.current).toEqual([]);
    });

    it('should handle only optimistic message (no previous messages)', () => {
      // This shouldn't happen in normal flow, but test anyway
      const messages: UIMessage[] = [
        createUserMessage(0, 'First message', { isOptimistic: true }),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses: [],
          changelog: [],
        }),
      );

      const timeline = result.current;
      expect(timeline).toHaveLength(1);
      expect(timeline[0].type).toBe('messages');
      expect(timeline[0].roundNumber).toBe(0);
      expect(timeline[0].data[0].metadata?.isOptimistic).toBe(true);
    });

    it('should handle multiple consecutive user messages in same round', () => {
      // Edge case: User sends multiple messages quickly
      const messages: UIMessage[] = [
        createUserMessage(0, 'First user message'),
        createUserMessage(0, 'Second user message'), // Same round
        createAssistantMessage(0, 0, 'Response'),
      ];

      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          analyses: [],
          changelog: [],
        }),
      );

      const timeline = result.current;
      const round0 = timeline.find(item => item.roundNumber === 0 && item.type === 'messages');

      // Both user messages should be in round 0
      expect(round0?.data).toHaveLength(3);
    });
  });
});
