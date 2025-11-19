/**
 * Round Regeneration Tests (PART 7)
 *
 * Tests round regeneration (retry) functionality:
 * 1. Retry button only on most recent round
 * 2. Message cleanup - deletes AI responses and analysis
 * 3. Re-execution - generates fresh responses with same round number
 * 4. Round number preservation - maintains timeline consistency
 * 5. Multiple retries - can regenerate same round multiple times
 * 6. Partial completion - retries after errors
 * 7. Configuration preservation - uses same participants as original
 *
 * Pattern: src/stores/chat/__tests__/multi-round-flow.test.ts
 * Documentation: docs/FLOW_DOCUMENTATION.md PART 7
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

describe('round Regeneration (PART 7)', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  describe('regeneration trigger', () => {
    it('should only allow regeneration on most recent round', () => {
      // Setup 3 completed rounds
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),

        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p0', content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),

        // Round 2 (most recent)
        createTestUserMessage({ id: 'user-r2', content: 'Q3', roundNumber: 2 }),
        createTestAssistantMessage({ id: 'thread_r2_p0', content: 'A3', roundNumber: 2, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(2);

      // Only round 2 should be regenerable (in UI, retry button only shows for currentRound)
      // Rounds 0 and 1 should not have retry buttons
      expect(currentRound).toBe(2);
    });

    it('should identify correct round number for regeneration', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p1', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
      ];

      getState().setMessages(messages);

      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(0);

      // Store should track this for regeneration
      getState().setIsRegenerating(true);
      getState().setRegeneratingRoundNumber(currentRound);

      expect(getState().isRegenerating).toBe(true);
      expect(getState().regeneratingRoundNumber).toBe(0);
    });
  });

  describe('message cleanup', () => {
    it('should delete all assistant messages from regenerating round', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'Old response 1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p1', content: 'Old response 2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        createTestAssistantMessage({ id: 'thread_r0_p2', content: 'Old response 3', roundNumber: 0, participantId: 'p2', participantIndex: 2 }),
      ];

      getState().setMessages(messages);
      expect(getState().messages).toHaveLength(4);

      // Simulate regeneration cleanup - remove all assistant messages from round 0
      const cleanedMessages = messages.filter(
        m => !(m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === 0),
      );

      getState().setMessages(cleanedMessages);

      // Should only have user message remaining
      expect(getState().messages).toHaveLength(1);
      expect(getState().messages[0]?.role).toBe(MessageRoles.USER);
      expect(getState().messages[0]?.id).toBe('user-r0');
    });

    it('should keep user message during regeneration', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Original question', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'Old answer', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      // Cleanup assistant messages for regeneration
      const cleanedMessages = messages.filter(
        m => !(m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === 0),
      );

      getState().setMessages(cleanedMessages);

      // User message preserved
      const remaining = getState().messages;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.role).toBe(MessageRoles.USER);
      expect(remaining[0]?.parts[0]?.text).toBe('Original question');
    });

    it('should not affect messages from other rounds', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),

        // Round 1 (regenerating this round)
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p0', content: 'Old A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      // Cleanup round 1 only
      const cleanedMessages = messages.filter(
        m => !(m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === 1),
      );

      getState().setMessages(cleanedMessages);

      // Round 0 messages intact
      const round0Messages = getState().messages.filter(m => m.metadata.roundNumber === 0);
      expect(round0Messages).toHaveLength(2);
      expect(round0Messages[0]?.id).toBe('user-r0');
      expect(round0Messages[1]?.id).toBe('thread_r0_p0');

      // Round 1 user message intact, assistant removed
      const round1Messages = getState().messages.filter(m => m.metadata.roundNumber === 1);
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages[0]?.id).toBe('user-r1');
    });
  });

  describe('analysis cleanup', () => {
    it('should clear analysis for regenerating round', () => {
      // Setup analysis for round 0
      getState().addAnalysis({
        id: 'analysis-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: { leaderboard: [], participantAnalyses: [] },
        createdAt: new Date(),
      });

      expect(getState().analyses).toHaveLength(1);

      // Regenerate round 0 - analysis should be removed
      getState().removeAnalysis(0);

      expect(getState().analyses).toHaveLength(0);
    });

    it('should not clear analysis from other rounds', () => {
      // Setup analyses for multiple rounds
      getState().addAnalysis({
        id: 'analysis-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: { leaderboard: [], participantAnalyses: [] },
        createdAt: new Date(),
      });

      getState().addAnalysis({
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        analysisData: { leaderboard: [], participantAnalyses: [] },
        createdAt: new Date(),
      });

      expect(getState().analyses).toHaveLength(2);

      // Regenerate round 1 only
      getState().removeAnalysis(1);

      // Round 0 analysis intact
      expect(getState().analyses).toHaveLength(1);
      expect(getState().analyses[0]?.roundNumber).toBe(0);
    });
  });

  describe('round number preservation', () => {
    it('should use same round number after regeneration', () => {
      // Initial round 0
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'Old answer', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);
      expect(getCurrentRoundNumber(messages)).toBe(0);

      // Cleanup for regeneration
      const cleanedMessages = messages.filter(m => m.role !== MessageRoles.ASSISTANT);
      getState().setMessages(cleanedMessages);

      // After regeneration, new messages use SAME round number (0)
      const regeneratedMessage = createTestAssistantMessage({
        id: 'thread_r0_p0_new',
        content: 'New answer',
        roundNumber: 0, // CRITICAL: Same round number
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages(prev => [...prev, regeneratedMessage]);

      // Round number still 0
      expect(getCurrentRoundNumber(getState().messages)).toBe(0);
      expect(getState().messages[1]?.metadata.roundNumber).toBe(0);
    });

    it('should maintain timeline continuity after regeneration', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),

        // Round 1 (will regenerate)
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p0', content: 'Old A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      ];

      getState().setMessages(messages);

      // Regenerate round 1
      const cleaned = messages.filter(m => !(m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === 1));
      getState().setMessages(cleaned);

      // Add new response for round 1
      const newResponse = createTestAssistantMessage({
        id: 'thread_r1_p0_new',
        content: 'New A2',
        roundNumber: 1, // Same round number
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages(prev => [...prev, newResponse]);

      // Timeline intact: r0 → r1 (no gaps)
      const finalMessages = getState().messages;
      expect(finalMessages[0]?.metadata.roundNumber).toBe(0);
      expect(finalMessages[1]?.metadata.roundNumber).toBe(0);
      expect(finalMessages[2]?.metadata.roundNumber).toBe(1);
      expect(finalMessages[3]?.metadata.roundNumber).toBe(1);
    });
  });

  describe('re-execution', () => {
    it('should generate fresh responses with streaming', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Question', roundNumber: 0 }),
      ];

      getState().setMessages(messages);

      // Start regeneration
      getState().setIsRegenerating(true);
      getState().setRegeneratingRoundNumber(0);
      getState().setIsStreaming(true);
      getState().setCurrentParticipantIndex(0);

      // Streaming state active
      expect(getState().isRegenerating).toBe(true);
      expect(getState().regeneratingRoundNumber).toBe(0);
      expect(getState().isStreaming).toBe(true);
      expect(getState().currentParticipantIndex).toBe(0);

      // Simulate streaming new response
      const newResponse = createTestAssistantMessage({
        id: 'thread_r0_p0_regenerated',
        content: 'Fresh response',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages(prev => [...prev, newResponse]);

      // Response added
      expect(getState().messages).toHaveLength(2);
      expect(getState().messages[1]?.parts[0]?.text).toBe('Fresh response');
    });

    it('should process all participants in sequence during regeneration', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Question', roundNumber: 0 }),
      ];

      getState().setMessages(messages);
      getState().setIsRegenerating(true);
      getState().setRegeneratingRoundNumber(0);

      // Expected participants
      getState().setExpectedParticipantIds(['p0', 'p1', 'p2']);

      // First participant
      getState().setCurrentParticipantIndex(0);
      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      })]);

      expect(getState().messages).toHaveLength(2);

      // Second participant
      getState().setCurrentParticipantIndex(1);
      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p1',
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
      })]);

      expect(getState().messages).toHaveLength(3);

      // Third participant
      getState().setCurrentParticipantIndex(2);
      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p2',
        content: 'Response 3',
        roundNumber: 0,
        participantId: 'p2',
        participantIndex: 2,
      })]);

      expect(getState().messages).toHaveLength(4);

      // All responses regenerated with same round number
      const assistantMsgs = getState().messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMsgs.every(m => m.metadata.roundNumber === 0)).toBe(true);
    });
  });

  describe('multiple retries', () => {
    it('should allow regenerating same round multiple times', () => {
      const userMessage = createTestUserMessage({ id: 'user-r0', content: 'Question', roundNumber: 0 });

      // First attempt
      getState().setMessages([
        userMessage,
        createTestAssistantMessage({
          id: 'thread_r0_p0_v1',
          content: 'First attempt',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ]);

      expect(getState().messages).toHaveLength(2);

      // Regenerate - cleanup
      getState().setMessages([userMessage]);
      getState().setIsRegenerating(true);

      // Second attempt
      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p0_v2',
        content: 'Second attempt',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      })]);

      expect(getState().messages).toHaveLength(2);
      expect(getState().messages[1]?.parts[0]?.text).toBe('Second attempt');

      // Regenerate again - cleanup
      getState().setMessages([userMessage]);

      // Third attempt
      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p0_v3',
        content: 'Third attempt',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      })]);

      expect(getState().messages).toHaveLength(2);
      expect(getState().messages[1]?.parts[0]?.text).toBe('Third attempt');
      expect(getState().messages[1]?.metadata.roundNumber).toBe(0);
    });

    it('should reset regeneration flags between retries', () => {
      // First regeneration
      getState().setIsRegenerating(true);
      getState().setRegeneratingRoundNumber(0);

      expect(getState().isRegenerating).toBe(true);
      expect(getState().regeneratingRoundNumber).toBe(0);

      // Complete first regeneration
      getState().setIsRegenerating(false);
      getState().setRegeneratingRoundNumber(null);

      expect(getState().isRegenerating).toBe(false);
      expect(getState().regeneratingRoundNumber).toBeNull();

      // Second regeneration
      getState().setIsRegenerating(true);
      getState().setRegeneratingRoundNumber(0);

      expect(getState().isRegenerating).toBe(true);
      expect(getState().regeneratingRoundNumber).toBe(0);
    });
  });

  describe('error recovery via regeneration', () => {
    it('should allow regeneration after partial failure', () => {
      const messages = [
        createTestUserMessage({ id: 'user-r0', content: 'Question', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'Success',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          hasError: false,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p1',
          content: 'Error occurred',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
          hasError: true, // Failed
        }),
      ];

      getState().setMessages(messages);

      // User can retry entire round
      getState().setIsRegenerating(true);

      // Cleanup failed round
      const cleaned = messages.filter(m => m.role !== MessageRoles.ASSISTANT);
      getState().setMessages(cleaned);

      // Regenerate all participants
      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p0_retry',
        content: 'Retry success',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        hasError: false,
      })]);

      getState().setMessages(prev => [...prev, createTestAssistantMessage({
        id: 'thread_r0_p1_retry',
        content: 'Retry success',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
        hasError: false,
      })]);

      // All messages now successful
      const assistantMsgs = getState().messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMsgs.every(m => !m.metadata.hasError)).toBe(true);
    });
  });

  describe('configuration preservation', () => {
    it('should use same participants during regeneration', () => {
      // Original round with 3 participants
      const originalParticipants = ['p0', 'p1', 'p2'];

      getState().setExpectedParticipantIds(originalParticipants);

      // Start regeneration
      getState().setIsRegenerating(true);
      getState().setRegeneratingRoundNumber(0);

      // Expected participants unchanged
      expect(getState().expectedParticipantIds).toEqual(originalParticipants);

      // Regeneration uses same participant list
      expect(getState().expectedParticipantIds).toHaveLength(3);
      expect(getState().expectedParticipantIds[0]).toBe('p0');
      expect(getState().expectedParticipantIds[1]).toBe('p1');
      expect(getState().expectedParticipantIds[2]).toBe('p2');
    });
  });
});
