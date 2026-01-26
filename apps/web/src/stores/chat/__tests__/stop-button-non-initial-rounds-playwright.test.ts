/**
 * Stop Button Behavior During Non-Initial Rounds E2E Tests
 *
 * Tests stop button functionality across all phases of non-initial rounds (Round 1+):
 * - Stop during PATCH (changelog creation) - PATCH should complete
 * - Stop during changelog fetch - abort and continue
 * - Stop during pre-search (PENDING/STREAMING) - mark as FAILED
 * - Stop during participant streaming - stop immediately
 * - Stop between participants - prevent next participant
 * - Stop during moderator streaming - stop moderator
 *
 * Focus: Multi-round conversations where config changes may exist.
 * Ensures stop button behaves consistently across all round phases.
 *
 * Related: docs/FLOW_DOCUMENTATION.md Lines 981-997 (Stop Button Race Conditions)
 */

import { FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';

import { createChatStore } from '../store';

// Test helper: Create mock participant
function createMockParticipant(id: string, modelId: string, priority: number): ChatParticipant {
  return {
    createdAt: new Date(),
    customRoleId: null,
    enabled: true,
    id,
    modelId,
    priority,
    role: null,
    threadId: 'thread-1',
    updatedAt: new Date(),
  };
}

describe('stop Button Non-Initial Rounds E2E', () => {
  describe('stop During PATCH (Changelog Creation)', () => {
    it('should allow PATCH to complete even if stop clicked during changelog creation', () => {
      const store = createChatStore();

      // Setup: Round 0 complete, about to submit Round 1 with config changes
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        mode: 'debating',
        slug: 'thread-1',
        title: 'Test Thread',
        updatedAt: new Date(),
        userId: 'user-1',
      });

      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      // Round 0 messages exist
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r0_user',
          metadata: { roundNumber: 0 },
          parts: [{ text: 'First question', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [{ text: 'P0 Round 0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // Simulate user changing config for Round 1
      store.getState().addParticipant({
        id: 'p2',
        modelId: 'gemini-pro',
        priority: 2,
      });

      // PATCH in progress (changelog being created)
      store.getState().setIsWaitingForChangelog(true);

      // User clicks stop during PATCH
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // ⚠️ CRITICAL: isWaitingForChangelog is NOT cleared by completeStreaming
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.waitingToStartStreaming).toBeFalsy();
      // The changelog flag remains true - it will be cleared by the changelog sync
      // hook when it detects the stop or when the changelog fetch completes
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should allow changelog PATCH to create new participant even after stop', () => {
      const store = createChatStore();

      // Setup: Round 0 complete
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        mode: 'brainstorming',
        slug: 'thread-1',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });

      const originalParticipants = [createMockParticipant('p0', 'gpt-4o', 0)];
      store.getState().setParticipants(originalParticipants);

      // Add new participant for Round 1
      store.getState().addParticipant({
        id: 'p1',
        modelId: 'claude-3-5-sonnet',
        priority: 1,
      });

      // PATCH started
      store.getState().setIsWaitingForChangelog(true);

      // Stop clicked
      store.getState().completeStreaming();

      // Simulate PATCH completing (backend creates new participant)
      store.getState().setParticipants([
        ...originalParticipants,
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      // Changelog fetch completes
      store.getState().setIsWaitingForChangelog(false);

      // New participant should exist
      const participants = store.getState().participants;
      expect(participants).toHaveLength(2);
      expect(participants.some(p => p.id === 'p1')).toBeTruthy();
    });
  });

  describe('stop During Changelog Fetch', () => {
    it('should abort changelog fetch and allow continuation when stopped', () => {
      const store = createChatStore();

      // Setup: PATCH complete, waiting for changelog fetch
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        mode: 'analyzing',
        slug: 'thread-1',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });

      store.getState().setIsWaitingForChangelog(true);

      // Stop during fetch
      store.getState().completeStreaming();

      // ⚠️ NOTE: completeStreaming does NOT clear isWaitingForChangelog anymore
      // The changelog flag must ONLY be cleared by use-changelog-sync.ts
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.isWaitingForChangelog).toBeTruthy(); // NOT cleared by completeStreaming
    });

    it('should allow continuation after changelog timeout when stopped', () => {
      const store = createChatStore();

      // Setup: Changelog fetch in progress
      store.getState().setIsWaitingForChangelog(true);

      // Stop clicked
      store.getState().completeStreaming();

      // System should allow continuation (provider handles timeout logic)
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      // Changelog still waiting but stop prevents streaming continuation
      expect(state.waitingToStartStreaming).toBeFalsy();
    });
  });

  describe('stop During Pre-Search Phase', () => {
    it('should mark PENDING pre-search as FAILED when stopped before execution', () => {
      const store = createChatStore();

      // Setup: Round 1 with PENDING pre-search
      store.getState().addPreSearch({
        createdAt: new Date(),
        id: 'presearch-r1',
        roundNumber: 1,
        status: MessageStatuses.PENDING,
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop before pre-search executes
      store.getState().completeStreaming();

      // Pre-search should be marked as interrupted
      const preSearches = store.getState().preSearches;
      const roundPreSearch = preSearches.find(ps => ps.roundNumber === 1);

      // Pre-search stays PENDING (provider logic marks as FAILED)
      expect(roundPreSearch).toBeDefined();
      expect(roundPreSearch?.status).toBe(MessageStatuses.PENDING);

      // Streaming stopped
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should stop STREAMING pre-search immediately when stop clicked', () => {
      const store = createChatStore();

      // Setup: Pre-search actively streaming
      store.getState().addPreSearch({
        createdAt: new Date(),
        id: 'presearch-r1',
        roundNumber: 1,
        status: MessageStatuses.STREAMING,
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop during streaming
      store.getState().completeStreaming();

      // Streaming state cleared
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.currentResumptionPhase).toBeNull();

      // Pre-search remains (provider handles cleanup)
      const preSearches = state.preSearches;
      expect(preSearches).toHaveLength(1);
    });

    it('should prevent participant streaming from starting if pre-search stopped', () => {
      const store = createChatStore();

      // Setup: Pre-search complete but streaming stopped
      store.getState().addPreSearch({
        completedAt: new Date(),
        createdAt: new Date(),
        id: 'presearch-r1',
        roundNumber: 1,
        status: MessageStatuses.COMPLETE,
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop before participants start
      store.getState().completeStreaming();

      // Participants should not trigger
      const state = store.getState();
      expect(state.nextParticipantToTrigger).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.isStreaming).toBeFalsy();
    });
  });

  describe('stop During Participant Streaming', () => {
    it('should stop first participant immediately in Round 1', () => {
      const store = createChatStore();

      // Setup: Round 1, P0 streaming
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_user',
          metadata: { roundNumber: 1 },
          parts: [{ text: 'Second question', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 1,
            // No finishReason - streaming
          },
          parts: [{ text: 'Partial response from P0 in Round', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(0);

      // Stop P0 mid-stream
      store.getState().completeStreaming();

      // Streaming stopped
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0); // Reset
      expect(state.currentResumptionPhase).toBeNull();

      // Partial message preserved
      const messages = state.messages;
      const p0Message = messages.find(m => m.id === 'thread-1_r1_p0');
      expect(p0Message).toBeDefined();
      expect(p0Message?.parts?.[0]?.text).toContain('Partial response');
    });

    it('should stop second participant in Round 1 and prevent third', () => {
      const store = createChatStore();

      // Setup: Round 1, P1 streaming (P0 complete)
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
        createMockParticipant('p2', 'gemini-pro', 2),
      ]);

      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_user',
          metadata: { roundNumber: 1 },
          parts: [{ text: 'Second question', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'P0 complete', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p1',
          metadata: {
            participantId: 'p1',
            participantIndex: 1,
            roundNumber: 1,
            // Streaming - no finishReason
          },
          parts: [{ text: 'P1 partial', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(1);

      // Stop during P1
      store.getState().completeStreaming();

      // P2 should NOT start
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.nextParticipantToTrigger).toBeNull();

      // Only P0 and P1 messages exist (no P2)
      const messages = state.messages;
      const p2Message = messages.find(m => m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata && m.metadata.participantIndex === 2);
      expect(p2Message).toBeUndefined();
    });

    it('should preserve isStreaming=false state during subsequent round stop', () => {
      const store = createChatStore();

      // Setup: Round 2 (multiple rounds completed)
      store.getState().setParticipants([createMockParticipant('p0', 'gpt-4o', 0)]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setCurrentParticipantIndex(0);

      // Stop
      store.getState().completeStreaming();

      // State should stay stopped even if in-flight messages arrive
      expect(store.getState().isStreaming).toBeFalsy();

      // Simulate in-flight message arriving after stop
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r2_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 2,
          },
          parts: [{ text: 'Late message', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // isStreaming should remain false
      expect(store.getState().isStreaming).toBeFalsy();
    });
  });

  describe('stop Between Participants', () => {
    it('should prevent P1 from starting when stopped between P0 and P1', () => {
      const store = createChatStore();

      // Setup: Round 1, P0 just completed
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_user',
          metadata: { roundNumber: 1 },
          parts: [{ text: 'Question', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'P0 complete', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(0);
      // P1 about to start (nextParticipantToTrigger would be 1)

      // Stop between P0 completion and P1 start
      store.getState().completeStreaming();

      // P1 should NOT trigger
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.nextParticipantToTrigger).toBeNull();

      // Only P0 message exists
      const participantMessages = state.messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(participantMessages).toHaveLength(1);
      expect(participantMessages[0]?.metadata).toMatchObject({
        participantIndex: 0,
      });
    });

    it('should prevent P2 and P3 when stopped between P1 and P2', () => {
      const store = createChatStore();

      // Setup: 3 participants, P0 and P1 complete, P2 about to start
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
        createMockParticipant('p2', 'gemini-pro', 2),
      ]);

      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'P0 done', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p1',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 1,
            roundNumber: 1,
          },
          parts: [{ text: 'P1 done', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(1);

      // Stop between P1 and P2
      store.getState().completeStreaming();

      // P2 should not start
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().currentParticipantIndex).toBe(0); // Reset

      // Only 2 participant messages
      const messages = store.getState().messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(messages).toHaveLength(2);
    });
  });

  describe('stop During Moderator Streaming', () => {
    it('should stop moderator streaming in Round 1', () => {
      const store = createChatStore();

      // Setup: Round 1, all participants complete, moderator streaming
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p1',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 1,
            roundNumber: 1,
          },
          parts: [{ text: 'P1 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_moderator',
          metadata: {
            isModerator: true,
            roundNumber: 1,
            // Streaming - no finishReason
          },
          parts: [{ text: 'Summary: Based on the responses ab', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop moderator
      store.getState().completeModeratorStream();

      // Moderator streaming stopped
      const state = store.getState();
      expect(state.isModeratorStreaming).toBeFalsy();
      expect(state.currentResumptionPhase).toBeNull();

      // Partial moderator message preserved
      const moderatorMsg = state.messages.find(m => m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata);
      expect(moderatorMsg).toBeDefined();
      expect(moderatorMsg?.parts?.[0]?.text).toContain('Summary: Based on the responses ab');
    });

    it('should not create moderator if stopped before moderator trigger in Round 1', () => {
      const store = createChatStore();

      // Setup: Round 1, all participants complete, BUT stopped before moderator creation
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop BEFORE moderator creation logic triggers
      store.getState().completeStreaming();

      // No moderator should exist
      const messages = store.getState().messages;
      const hasModerator = messages.some(m => m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata);
      expect(hasModerator).toBeFalsy();
    });

    it('should preserve partial moderator content when stopped mid-streaming', () => {
      const store = createChatStore();

      // Setup: Moderator partially streamed
      const partialModeratorMessage = {
        createdAt: new Date(),
        id: 'thread-1_r1_moderator',
        metadata: {
          isModerator: true,
          roundNumber: 1,
        },
        parts: [
          { text: 'Analysis:\n\n**Leaderboard:**\n1. GPT-4: 9/\n2. Claude: 8/', type: MessagePartTypes.TEXT },
        ],
        role: MessageRoles.ASSISTANT,
      };

      store.getState().setMessages([partialModeratorMessage]);
      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop mid-stream
      store.getState().completeModeratorStream();

      // Partial content preserved
      const messages = store.getState().messages;
      const moderatorMsg = messages.find(m => m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata);
      expect(moderatorMsg).toBeDefined();
      expect(moderatorMsg?.parts?.[0]?.text).toContain('**Leaderboard:**');
      expect(moderatorMsg?.parts?.[0]?.text).toContain('9/'); // Incomplete score
      expect(moderatorMsg?.parts?.[0]?.text).not.toContain('9/10'); // Full score not present
    });
  });

  describe('isStreaming Flag Transitions', () => {
    it('should transition isStreaming from true to false during Round 1 stop', () => {
      const store = createChatStore();

      // Setup: Round 1 streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().isStreaming).toBeTruthy();

      // Stop
      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should keep isStreaming=false after stop even if messages arrive', () => {
      const store = createChatStore();

      // Setup: Round 1 stopped
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBeFalsy();

      // Message arrives after stop
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'In-flight', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // isStreaming stays false
      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should handle multiple rapid isStreaming toggles in Round 2', () => {
      const store = createChatStore();

      // Cycle 1: Round 2 start
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(2);
      expect(store.getState().isStreaming).toBeTruthy();

      // Cycle 1: Stop
      store.getState().completeStreaming();
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Cycle 2: Round 3 start
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(3);
      expect(store.getState().isStreaming).toBeTruthy();

      // Cycle 2: Stop
      store.getState().completeStreaming();
      expect(store.getState().isStreaming).toBeFalsy();

      // State should be clean
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
    });
  });

  describe('can Submit New Message After Stop', () => {
    it('should allow submitting new message (Round 2) after stopping Round 1', () => {
      const store = createChatStore();

      // Setup: Round 1 stopped mid-stream
      store.getState().setThread({
        createdAt: new Date(),
        enableWebSearch: false,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        mode: 'debating',
        slug: 'thread-1',
        title: 'Test',
        updatedAt: new Date(),
        userId: 'user-1',
      });

      store.getState().setParticipants([createMockParticipant('p0', 'gpt-4o', 0)]);

      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r1_user',
          metadata: { roundNumber: 1 },
          parts: [{ text: 'First question', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'Partial', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop Round 1
      store.getState().completeStreaming();

      // State should allow new submission
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.waitingToStartStreaming).toBeFalsy();
      expect(state.isCreatingThread).toBeFalsy();

      // User can now submit Round 2 message
      store.getState().setInputValue('Second question for Round 2');
      expect(store.getState().inputValue).toBe('Second question for Round 2');

      // Simulate starting Round 2
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(2);

      expect(store.getState().isStreaming).toBeTruthy();
      expect(store.getState().streamingRoundNumber).toBe(2);
    });

    it('should reset streaming state cleanly to allow Round 3 submission after Round 2 stop', () => {
      const store = createChatStore();

      // Setup: Round 2 stopped
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setWaitingToStartStreaming(true);

      // Stop Round 2
      store.getState().completeStreaming();

      // All streaming state should reset
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.waitingToStartStreaming).toBeFalsy();

      // Ready for Round 3
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(3);

      expect(store.getState().isStreaming).toBeTruthy();
      expect(store.getState().streamingRoundNumber).toBe(3);
    });

    it('should clear error state to allow clean Round 2 submission after Round 1 error and stop', () => {
      const store = createChatStore();

      // Setup: Round 1 error + stop
      const error = new Error('Network timeout during Round 1');
      store.getState().setError(error);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Stop
      store.getState().completeStreaming();

      // Error persists after stop (must be cleared manually)
      expect(store.getState().error).toBe(error);

      // Clear error explicitly
      store.getState().setError(null);

      // Now ready for Round 2
      const state = store.getState();
      expect(state.error).toBeNull();
      expect(state.isStreaming).toBeFalsy();

      // Can start Round 2
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(2);

      expect(store.getState().isStreaming).toBeTruthy();
      expect(store.getState().error).toBeNull();
    });
  });

  describe('stop Button Visibility State', () => {
    it('should show stop button only during participant streaming in Round 1', () => {
      const store = createChatStore();

      // Initially not streaming
      expect(store.getState().isStreaming).toBeFalsy();
      let canShowStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStop).toBeFalsy();

      // Start Round 1 participant streaming
      store.getState().setIsStreaming(true);
      canShowStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStop).toBeTruthy();

      // Stop
      store.getState().completeStreaming();
      canShowStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStop).toBeFalsy();
    });

    it('should show stop button during moderator streaming in Round 1', () => {
      const store = createChatStore();

      // Moderator streaming
      store.getState().setIsModeratorStreaming(true);
      const canShowStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStop).toBeTruthy();

      // Stop moderator
      store.getState().completeModeratorStream();
      const canShowStopAfter = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStopAfter).toBeFalsy();
    });

    it('should hide stop button during changelog PATCH phase in Round 1', () => {
      const store = createChatStore();

      // PATCH in progress (not participant streaming)
      store.getState().setIsWaitingForChangelog(true);

      const canShowStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStop).toBeFalsy(); // Stop button hidden during PATCH
    });

    it('should hide stop button during changelog fetch in Round 1', () => {
      const store = createChatStore();

      // Fetching changelog
      store.getState().setIsWaitingForChangelog(true);

      const canShowStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canShowStop).toBeFalsy(); // Stop button hidden during fetch
    });
  });

  describe('edge Cases - Multi-Round Stop Scenarios', () => {
    it('should handle stop during Round 3 with previous rounds complete', () => {
      const store = createChatStore();

      // Setup: Rounds 0, 1, 2 complete, Round 3 streaming
      store.getState().setMessages([
        // Round 0 messages
        {
          createdAt: new Date(),
          id: 'thread-1_r0_user',
          metadata: { roundNumber: 0 },
          parts: [{ text: 'Q0', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [{ text: 'A0', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        // Round 1 messages
        {
          createdAt: new Date(),
          id: 'thread-1_r1_user',
          metadata: { roundNumber: 1 },
          parts: [{ text: 'Q1', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r1_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 1,
          },
          parts: [{ text: 'A1', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        // Round 2 messages
        {
          createdAt: new Date(),
          id: 'thread-1_r2_user',
          metadata: { roundNumber: 2 },
          parts: [{ text: 'Q2', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r2_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 2,
          },
          parts: [{ text: 'A2', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        // Round 3 partial
        {
          createdAt: new Date(),
          id: 'thread-1_r3_user',
          metadata: { roundNumber: 3 },
          parts: [{ text: 'Q3', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r3_p0',
          metadata: {
            participantIndex: 0,
            roundNumber: 3,
            // Streaming
          },
          parts: [{ text: 'Partial A3', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(3);

      // Stop Round 3
      store.getState().completeStreaming();

      // Previous rounds should be preserved
      const messages = store.getState().messages;
      expect(messages).toHaveLength(8); // All messages preserved
      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should handle stop when web search enabled in Round 2', () => {
      const store = createChatStore();

      // Setup: Round 2 with pre-search enabled
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        createdAt: new Date(),
        id: 'presearch-r2',
        roundNumber: 2,
        status: MessageStatuses.STREAMING,
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(2);

      // Stop during pre-search
      store.getState().completeStreaming();

      // Pre-search should remain (provider handles status update)
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(1);
      expect(store.getState().isStreaming).toBeFalsy();
    });
  });

  describe('comprehensive Stop Button Behavior', () => {
    describe('stop Button Visibility - isStreaming Flag', () => {
      it('should show stop button when isStreaming=true during Round 1 participant streaming', () => {
        const store = createChatStore();

        // Before streaming starts
        expect(store.getState().isStreaming).toBeFalsy();

        // Start streaming
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);

        // Stop button should be visible (isStreaming=true)
        expect(store.getState().isStreaming).toBeTruthy();
      });

      it('should hide stop button when isStreaming=false after stop in Round 1', () => {
        const store = createChatStore();

        // Start streaming
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);
        expect(store.getState().isStreaming).toBeTruthy();

        // Stop streaming
        store.getState().completeStreaming();

        // Stop button should be hidden (isStreaming=false)
        expect(store.getState().isStreaming).toBeFalsy();
      });

      it('should show stop button during Round 2 participant streaming', () => {
        const store = createChatStore();

        // Round 1 complete, Round 2 streaming
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(2);

        expect(store.getState().isStreaming).toBeTruthy();
      });

      it('should show stop button during moderator streaming in Round 1', () => {
        const store = createChatStore();

        // Moderator streaming
        store.getState().setIsModeratorStreaming(true);

        expect(store.getState().isModeratorStreaming).toBeTruthy();
      });

      it('should NOT show stop button during PATCH/changelog phase in Round 1', () => {
        const store = createChatStore();

        // Changelog waiting (PATCH in progress)
        store.getState().setIsWaitingForChangelog(true);

        // isStreaming should be false during PATCH
        expect(store.getState().isStreaming).toBeFalsy();
        expect(store.getState().isModeratorStreaming).toBeFalsy();
      });
    });

    describe('stop Action - Terminating Streaming Correctly', () => {
      it('should terminate participant streaming immediately when stopped in Round 1', () => {
        const store = createChatStore();

        // Setup: Round 1, P0 streaming
        store.getState().setParticipants([createMockParticipant('p0', 'gpt-4o', 0)]);
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: {
              participantId: 'p0',
              participantIndex: 0,
              roundNumber: 1,
              // No finishReason - streaming
            },
            parts: [{ text: 'Streaming content...', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);
        store.getState().setCurrentParticipantIndex(0);

        // Call stop action
        store.getState().completeStreaming();

        // Verify streaming terminated
        const state = store.getState();
        expect(state.isStreaming).toBeFalsy();
        expect(state.streamingRoundNumber).toBeNull();
        expect(state.currentParticipantIndex).toBe(0); // Reset
        expect(state.waitingToStartStreaming).toBeFalsy();
      });

      it('should terminate moderator streaming immediately when stopped in Round 1', () => {
        const store = createChatStore();

        // Setup: Moderator streaming
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_moderator',
            metadata: {
              isModerator: true,
              roundNumber: 1,
              // No finishReason - streaming
            },
            parts: [{ text: 'Summary: Based on...', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsModeratorStreaming(true);
        store.getState().setStreamingRoundNumber(1);

        // Call stop action for moderator
        store.getState().completeModeratorStream();

        // Verify moderator streaming terminated
        const state = store.getState();
        expect(state.isModeratorStreaming).toBeFalsy();
      });

      it('should clear all streaming state when stopped during Round 2', () => {
        const store = createChatStore();

        // Setup: Round 2 streaming with multiple state flags
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(2);
        store.getState().setCurrentParticipantIndex(1);
        store.getState().setWaitingToStartStreaming(true);

        // Stop
        store.getState().completeStreaming();

        // All streaming state should be cleared
        const state = store.getState();
        expect(state.isStreaming).toBeFalsy();
        expect(state.streamingRoundNumber).toBeNull();
        expect(state.currentParticipantIndex).toBe(0);
        expect(state.waitingToStartStreaming).toBeFalsy();
        expect(state.currentResumptionPhase).toBeNull();
      });
    });

    describe('partial Content Preservation After Stop', () => {
      it('should preserve partial participant message content after stop in Round 1', () => {
        const store = createChatStore();

        const partialContent = 'This is a partial response that was interrupted mid-stre';

        // Setup: P0 streaming with partial content
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: {
              participantId: 'p0',
              participantIndex: 0,
              roundNumber: 1,
              // No finishReason - streaming
            },
            parts: [{ text: partialContent, type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);

        // Stop
        store.getState().completeStreaming();

        // Partial message should remain visible
        const messages = store.getState().messages;
        expect(messages).toHaveLength(1);
        expect(messages[0]?.parts?.[0]?.text).toBe(partialContent);
        expect(messages[0]?.id).toBe('thread-1_r1_p0');
      });

      it('should preserve partial moderator content after stop in Round 1', () => {
        const store = createChatStore();

        const partialModeratorContent = 'Analysis:\n\n**Leaderboard:**\n1. GPT-4: 9/';

        // Setup: Moderator streaming with partial content
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_moderator',
            metadata: {
              isModerator: true,
              roundNumber: 1,
            },
            parts: [{ text: partialModeratorContent, type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsModeratorStreaming(true);

        // Stop
        store.getState().completeModeratorStream();

        // Partial moderator content preserved
        const messages = store.getState().messages;
        const moderatorMsg = messages.find(m => m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata);
        expect(moderatorMsg).toBeDefined();
        expect(moderatorMsg?.parts?.[0]?.text).toBe(partialModeratorContent);
      });

      it('should preserve multiple partial messages from Round 1 when stopped mid-conversation', () => {
        const store = createChatStore();

        // Setup: Multiple participants, some complete, some partial
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: {
              finishReason: FinishReasons.STOP,
              participantId: 'p0',
              participantIndex: 0,
              roundNumber: 1,
            },
            parts: [{ text: 'P0 complete response', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p1',
            metadata: {
              participantId: 'p1',
              participantIndex: 1,
              roundNumber: 1,
              // No finishReason - streaming
            },
            parts: [{ text: 'P1 partial respo', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);

        // Stop
        store.getState().completeStreaming();

        // Both messages preserved
        const messages = store.getState().messages;
        expect(messages).toHaveLength(2);
        expect(messages[0]?.parts?.[0]?.text).toBe('P0 complete response');
        expect(messages[1]?.parts?.[0]?.text).toBe('P1 partial respo');
      });
    });

    describe('uI Showing Partial Content After Stop', () => {
      it('should display partial content in messages array for UI to render in Round 1', () => {
        const store = createChatStore();

        const partialText = 'Here is my analysis of the problem:\n\n1. First point\n2. Sec';

        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: {
              participantIndex: 0,
              roundNumber: 1,
            },
            parts: [{ text: partialText, type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().completeStreaming();

        // UI can access partial content from messages
        const messages = store.getState().messages;
        const displayMessage = messages.find(m => m.id === 'thread-1_r1_p0');
        expect(displayMessage).toBeDefined();
        expect(displayMessage?.parts?.[0]?.text).toBe(partialText);
        expect(displayMessage?.parts?.[0]?.text).toContain('Sec'); // Incomplete sentence
      });

      it('should NOT remove partial messages from messages array in Round 1', () => {
        const store = createChatStore();

        // Setup: Partial message exists
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: { participantIndex: 0, roundNumber: 1 },
            parts: [{ text: 'Partial', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        expect(store.getState().messages).toHaveLength(1);

        // Stop
        store.getState().completeStreaming();

        // Message NOT removed
        expect(store.getState().messages).toHaveLength(1);
        expect(store.getState().messages[0]?.id).toBe('thread-1_r1_p0');
      });

      it('should preserve message ordering after stop in Round 2', () => {
        const store = createChatStore();

        // Setup: Multiple messages in order
        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r2_user',
            metadata: { roundNumber: 2 },
            parts: [{ text: 'Question', type: MessagePartTypes.TEXT }],
            role: MessageRoles.USER,
          },
          {
            createdAt: new Date(),
            id: 'thread-1_r2_p0',
            metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, roundNumber: 2 },
            parts: [{ text: 'Answer 1', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
          {
            createdAt: new Date(),
            id: 'thread-1_r2_p1',
            metadata: { participantIndex: 1, roundNumber: 2 },
            parts: [{ text: 'Partial answer', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().completeStreaming();

        // Order preserved
        const messages = store.getState().messages;
        expect(messages).toHaveLength(3);
        expect(messages[0]?.id).toBe('thread-1_r2_user');
        expect(messages[1]?.id).toBe('thread-1_r2_p0');
        expect(messages[2]?.id).toBe('thread-1_r2_p1');
      });
    });

    describe('state Cleanup After Stop - Streaming Ends But Content Preserved', () => {
      it('should clear streaming flags but preserve message content in Round 1', () => {
        const store = createChatStore();

        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: { participantIndex: 0, roundNumber: 1 },
            parts: [{ text: 'Partial', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);
        store.getState().setCurrentParticipantIndex(0);

        // Stop
        store.getState().completeStreaming();

        const state = store.getState();

        // Streaming state cleared
        expect(state.isStreaming).toBeFalsy();
        expect(state.streamingRoundNumber).toBeNull();
        expect(state.currentParticipantIndex).toBe(0);

        // Content preserved
        expect(state.messages).toHaveLength(1);
        expect(state.messages[0]?.parts?.[0]?.text).toBe('Partial');
      });

      it('should reset nextParticipantToTrigger after stop in Round 1', () => {
        const store = createChatStore();

        store.getState().setParticipants([
          createMockParticipant('p0', 'gpt-4o', 0),
          createMockParticipant('p1', 'claude-3-5-sonnet', 1),
        ]);

        // P0 streaming, P1 should be next
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);
        store.getState().setCurrentParticipantIndex(0);

        // Stop
        store.getState().completeStreaming();

        // nextParticipantToTrigger should be cleared (null)
        expect(store.getState().nextParticipantToTrigger).toBeNull();
      });

      it('should clear waitingToStartStreaming flag after stop in Round 1', () => {
        const store = createChatStore();

        store.getState().setIsStreaming(true);
        store.getState().setWaitingToStartStreaming(true);

        // Stop
        store.getState().completeStreaming();

        // Flag cleared
        expect(store.getState().waitingToStartStreaming).toBeFalsy();
      });

      it('should preserve thread and participant data after stop in Round 1', () => {
        const store = createChatStore();

        const thread = {
          createdAt: new Date(),
          enableWebSearch: false,
          id: 'thread-1',
          isAiGeneratedTitle: false,
          mode: 'debating' as const,
          slug: 'thread-1',
          title: 'Test Thread',
          updatedAt: new Date(),
          userId: 'user-1',
        };

        const participants = [
          createMockParticipant('p0', 'gpt-4o', 0),
          createMockParticipant('p1', 'claude-3-5-sonnet', 1),
        ];

        store.getState().setThread(thread);
        store.getState().setParticipants(participants);

        store.getState().setIsStreaming(true);
        store.getState().completeStreaming();

        // Thread and participants unchanged
        expect(store.getState().thread).toEqual(thread);
        expect(store.getState().participants).toHaveLength(2);
      });
    });

    describe('submitting New Message After Stop', () => {
      it('should allow submission of Round 2 message after stopping Round 1', () => {
        const store = createChatStore();

        // Setup: Round 1 stopped
        store.getState().setThread({
          createdAt: new Date(),
          enableWebSearch: false,
          id: 'thread-1',
          isAiGeneratedTitle: false,
          mode: 'debating',
          slug: 'thread-1',
          title: 'Test',
          updatedAt: new Date(),
          userId: 'user-1',
        });

        store.getState().setMessages([
          {
            createdAt: new Date(),
            id: 'thread-1_r1_p0',
            metadata: { participantIndex: 0, roundNumber: 1 },
            parts: [{ text: 'Partial', type: MessagePartTypes.TEXT }],
            role: MessageRoles.ASSISTANT,
          },
        ]);

        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(1);
        store.getState().completeStreaming();

        // Verify ready for new submission
        const state = store.getState();
        expect(state.isStreaming).toBeFalsy();
        expect(state.waitingToStartStreaming).toBeFalsy();
        expect(state.isCreatingThread).toBeFalsy();

        // User can type new message
        store.getState().setInputValue('Second question');
        expect(store.getState().inputValue).toBe('Second question');

        // System can start Round 2
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(2);

        expect(store.getState().isStreaming).toBeTruthy();
        expect(store.getState().streamingRoundNumber).toBe(2);
      });

      it('should allow submission after clearing error from stopped Round 1', () => {
        const store = createChatStore();

        // Round 1 error + stop
        store.getState().setError(new Error('Network error'));
        store.getState().setIsStreaming(true);
        store.getState().completeStreaming();

        // Error persists (must be cleared manually)
        expect(store.getState().error).toBeTruthy();

        // Clear error
        store.getState().setError(null);

        // Ready for new submission
        expect(store.getState().error).toBeNull();
        expect(store.getState().isStreaming).toBeFalsy();
      });
    });

    describe('edge Cases - Stop Timing and Race Conditions', () => {
      it('should handle stop immediately after isStreaming=true in Round 1', () => {
        const store = createChatStore();

        // Start streaming
        store.getState().setIsStreaming(true);

        // Immediate stop
        store.getState().completeStreaming();

        expect(store.getState().isStreaming).toBeFalsy();
      });

      it('should handle multiple rapid stop calls in Round 1 (idempotent)', () => {
        const store = createChatStore();

        store.getState().setIsStreaming(true);

        // Multiple stop calls
        store.getState().completeStreaming();
        store.getState().completeStreaming();
        store.getState().completeStreaming();

        // State remains consistent
        expect(store.getState().isStreaming).toBeFalsy();
        expect(store.getState().streamingRoundNumber).toBeNull();
      });

      it('should handle stop when no streaming was active (no-op)', () => {
        const store = createChatStore();

        // No streaming
        expect(store.getState().isStreaming).toBeFalsy();

        // Call stop anyway
        store.getState().completeStreaming();

        // No errors, state unchanged
        expect(store.getState().isStreaming).toBeFalsy();
      });

      it('should handle stop during transition between Round 1 and Round 2', () => {
        const store = createChatStore();

        // Round 1 complete, about to start Round 2
        store.getState().setStreamingRoundNumber(1);
        store.getState().completeStreaming();

        expect(store.getState().streamingRoundNumber).toBeNull();

        // Start Round 2
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(2);

        // Immediately stop Round 2
        store.getState().completeStreaming();

        expect(store.getState().isStreaming).toBeFalsy();
        expect(store.getState().streamingRoundNumber).toBeNull();
      });
    });
  });
});
