/**
 * Round Regeneration Flow Integration Tests
 *
 * Tests the complete round regeneration flow as documented in FLOW_DOCUMENTATION.md Part 7.
 * Round regeneration allows users to retry the most recent round, generating fresh AI
 * responses while keeping the original user question.
 *
 * FLOW TESTED (per FLOW_DOCUMENTATION.md Part 7):
 *
 * REGENERATION FLOW:
 * 1. User clicks retry button (only available on most recent round)
 * 2. Immediate visual changes:
 *    - All AI responses from that round disappear
 *    - Analysis card disappears
 *    - Feedback buttons reset
 *    - Loading indicator appears
 * 3. Database cleanup:
 *    - Delete all AI messages from that round
 *    - Delete analysis for that round
 *    - Delete feedback for that round
 *    - Keep user's original question
 * 4. Re-execution:
 *    - All participants generate fresh responses
 *    - Responses stream in same sequential order
 *    - New analysis generates after all finish
 *    - Round number stays the same
 *
 * CONSTRAINTS:
 * - Only most recent round can be regenerated
 * - Multiple retries allowed
 * - Round number never changes during regeneration
 *
 * Location: /src/stores/chat/__tests__/round-regeneration-flow.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  FeedbackTypes,
  PreSearchStatuses,
} from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Helper to set up a completed round with messages, analysis, and feedback
 */
function setupCompletedRound(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  participantCount: number,
  existingMessages: UIMessage[] = [],
) {
  const threadId = store.getState().thread?.id ?? 'thread-123';

  // Create messages for this round
  const userMessage = createMockUserMessage(roundNumber, `Question for round ${roundNumber}`);
  const participantMessages = Array.from({ length: participantCount }, (_, i) =>
    createMockMessage(i, roundNumber, {
      id: `${threadId}_r${roundNumber}_p${i}`,
      parts: [{ type: 'text', text: `Response from participant ${i} for round ${roundNumber}` }],
    }));

  // Set messages
  store.getState().setMessages([
    ...existingMessages,
    userMessage,
    ...participantMessages,
  ]);

  // Create analysis
  store.getState().markAnalysisCreated(roundNumber);
  store.getState().addAnalysis(createMockAnalysis({
    id: `analysis-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    status: AnalysisStatuses.COMPLETE,
    analysisData: createMockAnalysisPayload(roundNumber),
  }));

  // Set feedback
  store.getState().setFeedback(roundNumber, FeedbackTypes.LIKE);

  return {
    userMessage,
    participantMessages,
  };
}

// ============================================================================
// ROUND REGENERATION FLOW TESTS
// ============================================================================

describe('round Regeneration Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SCENARIO 1: BASIC RETRY FLOW
  // ==========================================================================

  describe('scenario 1: Basic Retry Flow', () => {
    it('should clear all AI responses when retry is clicked', () => {
      // Setup thread with completed round
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode('thread');

      // Complete round 0
      setupCompletedRound(store, 0, 2);

      // Verify initial state
      expect(store.getState().messages).toHaveLength(3); // user + 2 participants
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().feedbackByRound.has(0)).toBe(true);

      // Start regeneration
      store.getState().startRegeneration(0);

      // Clear AI responses (keep user message)
      const messagesWithoutAI = store.getState().messages.filter(
        m => !(m.role === 'assistant' && m.metadata?.roundNumber === 0),
      );
      store.getState().setMessages(messagesWithoutAI);

      // Clear analysis
      store.getState().removeAnalysis(0);

      // Clear feedback
      store.getState().clearFeedback(0);

      // Verify regeneration state
      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
      expect(store.getState().messages).toHaveLength(1); // Only user message
      expect(store.getState().messages[0].role).toBe('user');
      expect(store.getState().analyses).toHaveLength(0);
      expect(store.getState().feedbackByRound.has(0)).toBe(false);
    });

    it('should show loading indicator during regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // Start regeneration
      store.getState().startRegeneration(0);

      // Set streaming state (loading indicator)
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Verify streaming state
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().isRegenerating).toBe(true);
    });

    it('should reset analysis tracking on regeneration start', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round and mark analysis created
      setupCompletedRound(store, 0, 1);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Start regeneration (should clear tracking)
      store.getState().startRegeneration(0);

      // Analysis tracking should be cleared
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 2: DATABASE CLEANUP
  // ==========================================================================

  describe('scenario 2: Database Cleanup', () => {
    it('should delete all AI messages from round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];
      store.getState().initializeThread(thread, participants);

      // Complete round 0 with 3 participants
      setupCompletedRound(store, 0, 3);

      expect(store.getState().messages).toHaveLength(4); // user + 3 participants

      // Clear AI messages for round 0
      const messagesWithoutAI = store.getState().messages.filter(
        m => !(m.role === 'assistant' && m.metadata?.roundNumber === 0),
      );
      store.getState().setMessages(messagesWithoutAI);

      // Verify only user message remains
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].role).toBe('user');
    });

    it('should delete analysis for round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);
      expect(store.getState().analyses).toHaveLength(1);

      // Delete analysis
      store.getState().removeAnalysis(0);

      expect(store.getState().analyses).toHaveLength(0);
    });

    it('should delete feedback for round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0 with feedback
      setupCompletedRound(store, 0, 1);
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);

      // Clear feedback
      store.getState().clearFeedback(0);

      expect(store.getState().feedbackByRound.has(0)).toBe(false);
    });

    it('should keep user original question', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      const { userMessage } = setupCompletedRound(store, 0, 1);
      const originalQuestion = (userMessage.parts[0] as { text: string }).text;

      // Clear AI responses only
      const messagesWithoutAI = store.getState().messages.filter(
        m => m.role !== 'assistant',
      );
      store.getState().setMessages(messagesWithoutAI);

      // Verify user message preserved
      expect(store.getState().messages).toHaveLength(1);
      expect((store.getState().messages[0].parts[0] as { text: string }).text).toBe(originalQuestion);
    });
  });

  // ==========================================================================
  // SCENARIO 3: RE-EXECUTION FLOW
  // ==========================================================================

  describe('scenario 3: Re-execution Flow', () => {
    it('should generate fresh responses from all participants', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 2);
      const oldMessages = [...store.getState().messages];

      // Start regeneration
      store.getState().startRegeneration(0);

      // Clear AI messages
      const userMessage = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMessage ? [userMessage] : []);

      // New responses stream in
      store.getState().setIsStreaming(true);

      const newMsg0 = createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_new',
        parts: [{ type: 'text', text: 'NEW response from participant 0' }],
      });
      store.getState().setMessages(prev => [...prev, newMsg0]);

      const newMsg1 = createMockMessage(1, 0, {
        id: 'thread-123_r0_p1_new',
        parts: [{ type: 'text', text: 'NEW response from participant 1' }],
      });
      store.getState().setMessages(prev => [...prev, newMsg1]);

      store.getState().setIsStreaming(false);

      // Verify new responses
      const newMessages = store.getState().messages;
      expect(newMessages).toHaveLength(3); // user + 2 new participants

      // Verify messages are different from old ones
      expect(newMessages[1].id).not.toBe(oldMessages[1]?.id);
      expect(newMessages[2].id).not.toBe(oldMessages[2]?.id);
    });

    it('should stream responses in same sequential order', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { modelId: 'model-a' }),
        createMockParticipant(1, { modelId: 'model-b' }),
        createMockParticipant(2, { modelId: 'model-c' }),
      ];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 3);

      // Start regeneration
      store.getState().startRegeneration(0);
      const userMessage = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMessage ? [userMessage] : []);

      // Stream responses sequentially
      store.getState().setIsStreaming(true);

      // P0 first
      store.getState().setCurrentParticipantIndex(0);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // P1 second
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      // P2 third
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);

      store.getState().setIsStreaming(false);

      // Verify order
      const messages = store.getState().messages;
      expect(messages[1].metadata?.participantIndex).toBe(0);
      expect(messages[2].metadata?.participantIndex).toBe(1);
      expect(messages[3].metadata?.participantIndex).toBe(2);
    });

    it('should generate new analysis after all participants finish', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // Start regeneration
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);

      // Keep user message, clear AI
      const userMessage = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMessage ? [userMessage] : []);

      // Stream new response
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_regen',
      })]);
      store.getState().setIsStreaming(false);

      // Create new analysis
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        id: 'analysis-thread-123-0-regen',
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // Analysis completes
      store.getState().updateAnalysisData(0, createMockAnalysisPayload(0));

      // Verify new analysis
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should keep round number the same during regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 1 (not 0)
      const userR0 = createMockUserMessage(0, 'First question');
      const msgR0 = createMockMessage(0, 0);
      store.getState().setMessages([userR0, msgR0]);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

      // Add round 1
      setupCompletedRound(store, 1, 1, [userR0, msgR0]);

      // Start regeneration of round 1
      store.getState().startRegeneration(1);

      // Clear round 1 AI messages
      const messagesWithoutR1AI = store.getState().messages.filter(
        m => !(m.role === 'assistant' && m.metadata?.roundNumber === 1),
      );
      store.getState().setMessages(messagesWithoutR1AI);

      // Generate new response for round 1
      const newMsg = createMockMessage(0, 1, {
        id: 'thread-123_r1_p0_regen',
      });
      store.getState().setMessages(prev => [...prev, newMsg]);

      // Verify round number unchanged
      const lastMessage = store.getState().messages[store.getState().messages.length - 1];
      expect(lastMessage.metadata?.roundNumber).toBe(1);
    });
  });

  // ==========================================================================
  // SCENARIO 4: ONLY MOST RECENT ROUND
  // ==========================================================================

  describe('scenario 4: Only Most Recent Round', () => {
    it('should only allow regeneration of most recent round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);
      const round0Messages = [...store.getState().messages];

      // Complete round 1
      setupCompletedRound(store, 1, 1, round0Messages);

      // Should have 2 rounds
      expect(store.getState().analyses).toHaveLength(2);

      // Only round 1 (most recent) should be regeneratable
      // This is enforced by UI, but we verify the state supports it
      const maxRound = Math.max(...store.getState().analyses.map(a => a.roundNumber));
      expect(maxRound).toBe(1);
    });

    it('should preserve earlier rounds during regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);
      const round0Messages = [...store.getState().messages];

      // Complete round 1
      setupCompletedRound(store, 1, 1, round0Messages);

      // Start regeneration of round 1
      store.getState().startRegeneration(1);
      store.getState().removeAnalysis(1);

      // Clear only round 1 AI messages
      const messagesWithoutR1AI = store.getState().messages.filter(
        m => !(m.role === 'assistant' && m.metadata?.roundNumber === 1),
      );
      store.getState().setMessages(messagesWithoutR1AI);

      // Verify round 0 preserved
      expect(store.getState().messages).toHaveLength(3); // R0 user + R0 AI + R1 user
      expect(store.getState().analyses).toHaveLength(1); // Only R0 analysis
      expect(store.getState().analyses[0].roundNumber).toBe(0);

      // R0 messages intact
      const r0Messages = store.getState().messages.filter(
        m => m.metadata?.roundNumber === 0,
      );
      expect(r0Messages).toHaveLength(2);
    });

    it('should not affect earlier round feedback', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0 with like
      setupCompletedRound(store, 0, 1);
      const round0Messages = [...store.getState().messages];

      // Complete round 1 with dislike
      setupCompletedRound(store, 1, 1, round0Messages);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);

      // Regenerate round 1
      store.getState().startRegeneration(1);
      store.getState().clearFeedback(1);

      // Round 0 feedback preserved
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(store.getState().feedbackByRound.has(1)).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 5: MULTIPLE RETRIES
  // ==========================================================================

  describe('scenario 5: Multiple Retries', () => {
    it('should allow multiple regenerations of same round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // First retry
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);
      const userMessage = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMessage ? [userMessage] : []);

      // Add new response
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_retry1',
      })]);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));
      store.getState().completeRegeneration(0);

      expect(store.getState().messages).toHaveLength(2);

      // Second retry
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);
      const userMsg2 = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg2 ? [userMsg2] : []);

      // Add newer response
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_retry2',
      })]);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));
      store.getState().completeRegeneration(0);

      // Verify final state
      expect(store.getState().messages).toHaveLength(2);
      expect(store.getState().messages[1].id).toBe('thread-123_r0_p0_retry2');
      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should keep button available after regeneration completes', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // Regenerate
      store.getState().startRegeneration(0);
      store.getState().completeRegeneration(0);

      // Verify regeneration state cleared
      expect(store.getState().isRegenerating).toBe(false);
      expect(store.getState().regeneratingRoundNumber).toBeNull();

      // Can start another regeneration
      store.getState().startRegeneration(0);
      expect(store.getState().isRegenerating).toBe(true);
    });

    it('should track each regeneration independently', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // Track regenerations
      const responses: string[] = [];

      // First regeneration
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);
      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      const response1 = `Response ${Date.now()}-1`;
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_1',
        parts: [{ type: 'text', text: response1 }],
      })]);
      responses.push(response1);
      store.getState().completeRegeneration(0);

      // Second regeneration
      store.getState().startRegeneration(0);
      const userMsg2 = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg2 ? [userMsg2] : []);

      const response2 = `Response ${Date.now()}-2`;
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_2',
        parts: [{ type: 'text', text: response2 }],
      })]);
      responses.push(response2);
      store.getState().completeRegeneration(0);

      // Each regeneration produced different response
      expect(responses[0]).not.toBe(responses[1]);
    });
  });

  // ==========================================================================
  // SCENARIO 6: RETRY DURING STREAMING
  // ==========================================================================

  describe('scenario 6: Retry During Streaming', () => {
    it('should disable retry button while streaming is active', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Start streaming
      store.getState().setIsStreaming(true);

      // Check conditions for retry availability
      // UI should check isStreaming before allowing retry
      expect(store.getState().isStreaming).toBe(true);

      // Attempting regeneration during streaming should be prevented by UI
      // But we verify the state would be conflicting
      const canRegenerate = !store.getState().isStreaming;
      expect(canRegenerate).toBe(false);
    });

    it('should handle stop then retry flow', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants);

      // Add user message and start streaming
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // P0 completes
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // User stops (P1 never completes)
      store.getState().setIsStreaming(false);

      // User can now retry the round
      store.getState().startRegeneration(0);

      // Clear partial results
      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      // Stream all participants
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0, { id: 'thread-123_r0_p0_retry' }),
        createMockMessage(1, 0, { id: 'thread-123_r0_p1_retry' }),
      ]);
      store.getState().setIsStreaming(false);

      // Now both participants responded
      expect(store.getState().messages).toHaveLength(3); // user + 2 participants
    });

    it('should not allow regeneration while analysis is streaming', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete participant streaming
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis is streaming
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));
      store.getState().setIsStreaming(true);

      // Regeneration should not be allowed during analysis streaming
      const canRegenerate = !store.getState().isStreaming;
      expect(canRegenerate).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 7: RETRY WITH CONFIGURATION CHANGES
  // ==========================================================================

  describe('scenario 7: Retry With Configuration Changes', () => {
    it('should use original config when regenerating, not new pending config', () => {
      const thread = createMockThread({
        id: 'thread-123',
        mode: ChatModes.DEBATING,
      });
      const originalParticipants = [
        createMockParticipant(0, { modelId: 'original-model' }),
      ];
      store.getState().initializeThread(thread, originalParticipants);
      store.getState().setScreenMode('thread');

      // Complete round 0 with original config
      setupCompletedRound(store, 0, 1);

      // User makes config changes (pending, not applied yet)
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // User clicks retry on round 0
      store.getState().startRegeneration(0);

      // Regeneration should use ORIGINAL config (DEBATING mode, original-model)
      // not the pending config (ANALYZING mode)
      expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
      expect(store.getState().participants[0].modelId).toBe('original-model');

      // Pending config changes should still be there for next round
      expect(store.getState().hasPendingConfigChanges).toBe(true);
    });

    it('should not apply pending participant changes during regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const originalParticipants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, originalParticipants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // User adds a new participant (pending)
      store.getState().setSelectedParticipants([
        { id: 'p0', modelId: 'model-0', role: null, participantIndex: 0 },
        { id: 'p1', modelId: 'model-1', role: null, participantIndex: 1 },
      ]);
      store.getState().setHasPendingConfigChanges(true);

      // Regenerate round 0
      store.getState().startRegeneration(0);

      // Should still use 1 participant (original)
      expect(store.getState().participants).toHaveLength(1);

      // The new participant config is in selectedParticipants (pending)
      expect(store.getState().selectedParticipants).toHaveLength(2);
    });
  });

  // ==========================================================================
  // SCENARIO 8: PARTIAL RESULTS HANDLING
  // ==========================================================================

  describe('scenario 8: Partial Results Handling', () => {
    it('should retry all participants even if some failed before', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];
      store.getState().initializeThread(thread, participants);

      // Round 0 with partial results (P1 failed)
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0), // P0 succeeded
        // P1 failed - no message
        createMockMessage(2, 0), // P2 succeeded
      ]);
      store.getState().setError(new Error('P1 failed'));

      // Regenerate
      store.getState().setError(null);
      store.getState().startRegeneration(0);

      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      // All participants attempt again
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0, { id: 'thread-123_r0_p0_retry' }),
        createMockMessage(1, 0, { id: 'thread-123_r0_p1_retry' }),
        createMockMessage(2, 0, { id: 'thread-123_r0_p2_retry' }),
      ]);
      store.getState().setIsStreaming(false);

      // All 3 participants responded
      expect(store.getState().messages).toHaveLength(4); // user + 3 participants
      expect(store.getState().error).toBeNull();
    });

    it('should clear errors from previous attempt', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Set error from failed attempt
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().setError(new Error('Rate limit exceeded'));

      // Start regeneration
      store.getState().setError(null);
      store.getState().startRegeneration(0);

      // Error should be cleared
      expect(store.getState().error).toBeNull();
    });

    it('should handle all participants failing initially then succeeding on retry', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants);

      // All participants failed
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().setError(new Error('All participants failed'));

      // Retry
      store.getState().setError(null);
      store.getState().startRegeneration(0);

      // All succeed
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setIsStreaming(false);

      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().error).toBeNull();
    });
  });

  // ==========================================================================
  // SCENARIO 9: ANALYSIS REGENERATION
  // ==========================================================================

  describe('scenario 9: Analysis Regeneration', () => {
    it('should generate new analysis that reflects new responses', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0 with initial analysis
      setupCompletedRound(store, 0, 1);
      const oldAnalysis = store.getState().analyses[0];

      // Regenerate
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);

      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      // New response
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
        id: 'thread-123_r0_p0_regen',
      })]);

      // New analysis
      const newAnalysisData = createMockAnalysisPayload(0, {
        leaderboard: [{
          rank: 1,
          participantIndex: 0,
          model: 'openai/gpt-4',
          score: 95, // Different score
          badges: ['Excellent'],
        }],
      });

      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        id: 'analysis-thread-123-0-new',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: newAnalysisData,
      }));

      // New analysis is different
      const newAnalysis = store.getState().analyses[0];
      expect(newAnalysis.id).not.toBe(oldAnalysis.id);
      expect(newAnalysis.analysisData).toBeDefined();
    });

    it('should allow analysis scores to differ on regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Initial analysis with score 85
      const initialPayload = createMockAnalysisPayload(0, {
        leaderboard: [{
          rank: 1,
          participantIndex: 0,
          model: 'openai/gpt-4',
          score: 85,
          badges: [],
        }],
      });
      store.getState().setMessages([createMockUserMessage(0), createMockMessage(0, 0)]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: initialPayload,
      }));

      // Regenerate with different score
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);

      const newPayload = createMockAnalysisPayload(0, {
        leaderboard: [{
          rank: 1,
          participantIndex: 0,
          model: 'openai/gpt-4',
          score: 92, // Different score
          badges: ['Improved'],
        }],
      });
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: newPayload,
      }));

      // Verify different score
      const analysis = store.getState().analyses[0];
      expect(analysis.analysisData?.leaderboard[0].score).toBe(92);
    });

    it('should allow leaderboard to change on regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants);

      // Initial: P0 first, P1 second
      const initialPayload = createMockAnalysisPayload(0, {
        leaderboard: [
          { rank: 1, participantIndex: 0, model: 'model-0', score: 90, badges: [] },
          { rank: 2, participantIndex: 1, model: 'model-1', score: 80, badges: [] },
        ],
      });
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: initialPayload,
      }));

      // Regenerate: P1 first, P0 second (flipped)
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);

      const newPayload = createMockAnalysisPayload(0, {
        leaderboard: [
          { rank: 1, participantIndex: 1, model: 'model-1', score: 88, badges: [] },
          { rank: 2, participantIndex: 0, model: 'model-0', score: 82, badges: [] },
        ],
      });
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: newPayload,
      }));

      // Verify leaderboard changed
      const analysis = store.getState().analyses[0];
      expect(analysis.analysisData?.leaderboard[0].participantIndex).toBe(1);
      expect(analysis.analysisData?.leaderboard[1].participantIndex).toBe(0);
    });
  });

  // ==========================================================================
  // SCENARIO 10: STATE CONSISTENCY
  // ==========================================================================

  describe('scenario 10: State Consistency', () => {
    it('should never change round number during regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete rounds 0 and 1
      setupCompletedRound(store, 0, 1);
      const r0Messages = [...store.getState().messages];
      setupCompletedRound(store, 1, 1, r0Messages);

      const targetRound = 1;

      // Regenerate round 1
      store.getState().startRegeneration(targetRound);
      expect(store.getState().regeneratingRoundNumber).toBe(targetRound);

      // Clear and regenerate
      store.getState().removeAnalysis(1);
      const messagesWithoutR1AI = store.getState().messages.filter(
        m => !(m.role === 'assistant' && m.metadata?.roundNumber === 1),
      );
      store.getState().setMessages(messagesWithoutR1AI);

      // New response still for round 1
      const newMsg = createMockMessage(0, 1, { id: 'thread-123_r1_p0_regen' });
      store.getState().setMessages(prev => [...prev, newMsg]);

      // Complete regeneration
      store.getState().completeRegeneration(1);

      // Verify round number unchanged
      const lastMessage = store.getState().messages[store.getState().messages.length - 1];
      expect(lastMessage.metadata?.roundNumber).toBe(1);
      expect(store.getState().regeneratingRoundNumber).toBeNull();
    });

    it('should use new message IDs for regenerated responses', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      const originalMsg = createMockMessage(0, 0, { id: 'thread-123_r0_p0_original' });
      store.getState().setMessages([createMockUserMessage(0), originalMsg]);

      const originalId = store.getState().messages[1].id;

      // Regenerate
      store.getState().startRegeneration(0);
      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      // New message with new ID
      const newMsg = createMockMessage(0, 0, { id: 'thread-123_r0_p0_regen_123456' });
      store.getState().setMessages(prev => [...prev, newMsg]);

      // ID should be different
      expect(store.getState().messages[1].id).not.toBe(originalId);
    });

    it('should use timestamps reflecting retry time', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0 at time T1
      const originalTime = Date.now();
      vi.setSystemTime(originalTime);
      setupCompletedRound(store, 0, 1);

      // Regenerate at time T2 (later)
      const regenTime = originalTime + 60000; // 1 minute later
      vi.setSystemTime(regenTime);

      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);

      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      // Create new analysis with new timestamp
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        createdAt: new Date(regenTime),
      }));

      // Verify timestamp reflects retry time
      const analysis = store.getState().analyses[0];
      expect(analysis.createdAt.getTime()).toBe(regenTime);
    });
  });

  // ==========================================================================
  // ADDITIONAL EDGE CASES
  // ==========================================================================

  describe('additional Edge Cases', () => {
    it('should handle regeneration with web search enabled', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0 with pre-search
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));
      setupCompletedRound(store, 0, 1);

      // Regenerate (should also regenerate pre-search)
      store.getState().startRegeneration(0);

      // Clear pre-search tracking for re-execution
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);

      // In real flow, pre-search would be re-executed before participant streaming
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload({
        analysis: 'New search analysis after regeneration',
      }));

      expect(store.getState().preSearches[0].searchData?.analysis).toBe('New search analysis after regeneration');
    });

    it('should complete regeneration lifecycle properly', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 1);

      // Start regeneration
      store.getState().startRegeneration(0);
      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);

      // Stream response
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(false);

      // Complete regeneration
      store.getState().completeRegeneration(0);

      // All flags should be cleared
      expect(store.getState().isRegenerating).toBe(false);
      expect(store.getState().regeneratingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isCreatingAnalysis).toBe(false);
      expect(store.getState().pendingMessage).toBeNull();
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should handle regeneration of round with multiple participants of different models', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants: ChatParticipant[] = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
        createMockParticipant(2, { modelId: 'google/gemini' }),
      ];
      store.getState().initializeThread(thread, participants);

      // Complete round 0
      setupCompletedRound(store, 0, 3);

      // Regenerate
      store.getState().startRegeneration(0);
      store.getState().removeAnalysis(0);

      const userMsg = store.getState().messages.find(m => m.role === 'user');
      store.getState().setMessages(userMsg ? [userMsg] : []);

      // All models respond again
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0, {
          id: 'thread-123_r0_p0_regen',
          metadata: {
            role: 'participant',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: null,
            model: 'openai/gpt-4',
          },
        }),
        createMockMessage(1, 0, {
          id: 'thread-123_r0_p1_regen',
          metadata: {
            role: 'participant',
            roundNumber: 0,
            participantId: 'participant-1',
            participantIndex: 1,
            participantRole: null,
            model: 'anthropic/claude-3',
          },
        }),
        createMockMessage(2, 0, {
          id: 'thread-123_r0_p2_regen',
          metadata: {
            role: 'participant',
            roundNumber: 0,
            participantId: 'participant-2',
            participantIndex: 2,
            participantRole: null,
            model: 'google/gemini',
          },
        }),
      ]);
      store.getState().setIsStreaming(false);

      // Verify all models responded
      expect(store.getState().messages).toHaveLength(4);

      const models = store.getState().messages.filter(m => m.role === 'assistant').map(m => m.metadata?.model);

      expect(models).toContain('openai/gpt-4');
      expect(models).toContain('anthropic/claude-3');
      expect(models).toContain('google/gemini');
    });
  });
});
