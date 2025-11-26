/**
 * Multi-Round Placeholder Flow Tests
 *
 * Comprehensive tests for:
 * - Multiple rounds back-to-back with placeholder states
 * - Mid-conversation configuration changes (participants, mode, web search)
 * - Proper loading state transitions (PENDING → STREAMING → COMPLETE)
 * - Navigation timing with analysis completion
 *
 * ✅ REVISED UI BEHAVIOR:
 * - Placeholder states (waiting for participants) are ONLY shown for participant cards
 * - Analysis accordions are NOT rendered when participantMessageIds is empty
 * - Accordions appear and immediately begin streaming when participants complete
 *
 * Location: /src/stores/chat/__tests__/multi-round-placeholder-flow.test.ts
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatThread } from '@/api/routes/chat/schema';

import type { ChatParticipant, StoredModeratorAnalysis, StoredPreSearch } from '../store';
import { createChatStore } from '../store';

// =============================================================================
// TEST UTILITIES
// =============================================================================

function createTestThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-1',
    userId: 'user-1',
    projectId: null,
    title: 'Test Thread',
    slug: 'test-thread',
    mode: 'debating',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: true,
    enableWebSearch: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createTestParticipant(index: number, modelId: string): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId: 'thread-1',
    modelId,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatParticipant;
}

function createParticipantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  participantId: string,
  modelId: string,
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: `Response from participant ${participantIndex}` }],
    metadata: {
      role: 'assistant',
      roundNumber,
      participantIndex,
      participantId,
      participantRole: null,
      model: modelId,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  } as UIMessage;
}

function createUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `user-msg-${roundNumber}`,
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: {
      role: 'user',
      roundNumber,
      createdAt: new Date().toISOString(),
    },
  } as UIMessage;
}

function createPlaceholderAnalysis(
  threadId: string,
  roundNumber: number,
  userQuestion: string,
): StoredModeratorAnalysis {
  return {
    id: `placeholder-analysis-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    mode: 'debating',
    userQuestion,
    status: AnalysisStatuses.PENDING,
    analysisData: null,
    participantMessageIds: [], // Empty = placeholder
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: AnalysisStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

// =============================================================================
// MULTI-ROUND FLOW TESTS
// =============================================================================

describe('multi-Round Placeholder Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('round 0: Initial Thread Creation', () => {
    it('should create placeholder analysis immediately on thread creation', () => {
      const thread = createTestThread();
      const participants = [
        createTestParticipant(0, 'gpt-4'),
        createTestParticipant(1, 'claude-3'),
      ];

      // Initialize thread (simulates form-actions.ts handleCreateThread)
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Add placeholder analysis (as form-actions does)
      const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test question');
      store.getState().addAnalysis(placeholder);

      // Verify placeholder exists with empty participantMessageIds
      const analyses = store.getState().analyses;
      expect(analyses).toHaveLength(1);
      expect(analyses[0].status).toBe(AnalysisStatuses.PENDING);
      expect(analyses[0].participantMessageIds).toHaveLength(0);
    });

    it('should identify placeholder analysis (no participantMessageIds) - accordion NOT rendered in this state', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);

      const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test question');
      store.getState().addAnalysis(placeholder);

      const analysis = store.getState().analyses[0];

      // ✅ REVISED: Placeholder analyses are identified by empty participantMessageIds
      // UI behavior: Accordions are NOT rendered for placeholder analyses
      // Only participant cards show placeholder/waiting states
      const isPlaceholderAnalysis = analysis.status === AnalysisStatuses.PENDING
        && (!analysis.participantMessageIds || analysis.participantMessageIds.length === 0);

      expect(isPlaceholderAnalysis).toBe(true);
    });

    it('should update placeholder with participantMessageIds when participants complete', () => {
      const thread = createTestThread();
      const participants = [
        createTestParticipant(0, 'gpt-4'),
        createTestParticipant(1, 'claude-3'),
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Add placeholder
      const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test question');
      store.getState().addAnalysis(placeholder);

      // Simulate participants completing with messages
      const messages: UIMessage[] = [
        createUserMessage(0, 'Test question'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
        createParticipantMessage(thread.id, 0, 1, 'participant-1', 'claude-3'),
      ];
      store.getState().setMessages(messages);

      // Call createPendingAnalysis (simulates handleComplete)
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test question',
        threadId: thread.id,
        mode: 'debating',
      });

      // Verify placeholder was updated (not duplicated)
      const analyses = store.getState().analyses;
      expect(analyses).toHaveLength(1);
      expect(analyses[0].participantMessageIds).toHaveLength(2);
      expect(analyses[0].participantMessageIds).toContain(`${thread.id}_r0_p0`);
      expect(analyses[0].participantMessageIds).toContain(`${thread.id}_r0_p1`);
      // Original ID should be preserved
      expect(analyses[0].id).toBe(placeholder.id);
    });

    it('should transition from placeholder (accordion hidden) to ready for streaming (accordion visible)', () => {
      const thread = createTestThread();
      const participants = [createTestParticipant(0, 'gpt-4')];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Add placeholder
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

      // Before participants complete - accordion NOT shown
      let analysis = store.getState().analyses[0];
      let isPlaceholderAnalysis = analysis.status === AnalysisStatuses.PENDING
        && (!analysis.participantMessageIds || analysis.participantMessageIds.length === 0);
      expect(isPlaceholderAnalysis).toBe(true);
      // ✅ REVISED: At this point, accordion is NOT rendered (only participant placeholders shown)

      // After participants complete - accordion IS shown and starts streaming
      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      analysis = store.getState().analyses[0];
      isPlaceholderAnalysis = analysis.status === AnalysisStatuses.PENDING
        && (!analysis.participantMessageIds || analysis.participantMessageIds.length === 0);
      expect(isPlaceholderAnalysis).toBe(false);
      // ✅ REVISED: At this point, accordion IS rendered and starts analysis
    });
  });

  describe('round 1+: Subsequent Rounds', () => {
    it('should handle multiple rounds with separate placeholder analyses', () => {
      const thread = createTestThread();
      const participants = [createTestParticipant(0, 'gpt-4')];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Round 0
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Question 1'));

      const round0Messages: UIMessage[] = [
        createUserMessage(0, 'Question 1'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(round0Messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Question 1',
        threadId: thread.id,
        mode: 'debating',
      });

      // Complete round 0 analysis
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      // Round 1
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Question 2'));

      const round1Messages: UIMessage[] = [
        ...round0Messages,
        createUserMessage(1, 'Question 2'),
        createParticipantMessage(thread.id, 1, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(round1Messages);
      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages: round1Messages,
        userQuestion: 'Question 2',
        threadId: thread.id,
        mode: 'debating',
      });

      // Verify both analyses exist
      const analyses = store.getState().analyses;
      expect(analyses).toHaveLength(2);
      expect(analyses[0].roundNumber).toBe(0);
      expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(analyses[1].roundNumber).toBe(1);
      expect(analyses[1].participantMessageIds).toHaveLength(1);
    });

    it('should not mix up participant messages between rounds', () => {
      const thread = createTestThread();
      const participants = [
        createTestParticipant(0, 'gpt-4'),
        createTestParticipant(1, 'claude-3'),
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Round 0 messages
      const allMessages: UIMessage[] = [
        createUserMessage(0, 'Q1'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
        createParticipantMessage(thread.id, 0, 1, 'participant-1', 'claude-3'),
      ];

      store.getState().setMessages(allMessages);
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages: allMessages,
        userQuestion: 'Q1',
        threadId: thread.id,
        mode: 'debating',
      });

      // Round 1 messages
      allMessages.push(
        createUserMessage(1, 'Q2'),
        createParticipantMessage(thread.id, 1, 0, 'participant-0', 'gpt-4'),
        createParticipantMessage(thread.id, 1, 1, 'participant-1', 'claude-3'),
      );

      store.getState().setMessages(allMessages);
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));
      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages: allMessages,
        userQuestion: 'Q2',
        threadId: thread.id,
        mode: 'debating',
      });

      const analyses = store.getState().analyses;

      // Round 0 should only have round 0 message IDs
      expect(analyses[0].participantMessageIds).toEqual([
        `${thread.id}_r0_p0`,
        `${thread.id}_r0_p1`,
      ]);

      // Round 1 should only have round 1 message IDs
      expect(analyses[1].participantMessageIds).toEqual([
        `${thread.id}_r1_p0`,
        `${thread.id}_r1_p1`,
      ]);
    });
  });

  describe('mid-Conversation Configuration Changes', () => {
    it('should handle participant addition mid-conversation', () => {
      const thread = createTestThread();
      const initialParticipants = [createTestParticipant(0, 'gpt-4')];

      store.getState().setThread(thread);
      store.getState().setParticipants(initialParticipants);

      // Round 0 with 1 participant
      const round0Messages: UIMessage[] = [
        createUserMessage(0, 'Q1'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(round0Messages);
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Q1',
        threadId: thread.id,
        mode: 'debating',
      });
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      // Add second participant mid-conversation
      const updatedParticipants = [
        ...initialParticipants,
        createTestParticipant(1, 'claude-3'),
      ];
      store.getState().setParticipants(updatedParticipants);

      // Round 1 with 2 participants
      const round1Messages: UIMessage[] = [
        ...round0Messages,
        createUserMessage(1, 'Q2'),
        createParticipantMessage(thread.id, 1, 0, 'participant-0', 'gpt-4'),
        createParticipantMessage(thread.id, 1, 1, 'participant-1', 'claude-3'),
      ];
      store.getState().setMessages(round1Messages);
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));
      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages: round1Messages,
        userQuestion: 'Q2',
        threadId: thread.id,
        mode: 'debating',
      });

      // Verify round 1 has messages from both participants
      const analyses = store.getState().analyses;
      expect(analyses[1].participantMessageIds).toHaveLength(2);
    });

    it('should handle participant removal mid-conversation', () => {
      const thread = createTestThread();
      const initialParticipants = [
        createTestParticipant(0, 'gpt-4'),
        createTestParticipant(1, 'claude-3'),
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(initialParticipants);

      // Round 0 with 2 participants
      const round0Messages: UIMessage[] = [
        createUserMessage(0, 'Q1'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
        createParticipantMessage(thread.id, 0, 1, 'participant-1', 'claude-3'),
      ];
      store.getState().setMessages(round0Messages);
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages: round0Messages,
        userQuestion: 'Q1',
        threadId: thread.id,
        mode: 'debating',
      });
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      // Remove second participant mid-conversation
      const updatedParticipants = [initialParticipants[0]];
      store.getState().setParticipants(updatedParticipants);

      // Round 1 with 1 participant
      const round1Messages: UIMessage[] = [
        ...round0Messages,
        createUserMessage(1, 'Q2'),
        createParticipantMessage(thread.id, 1, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(round1Messages);
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));
      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages: round1Messages,
        userQuestion: 'Q2',
        threadId: thread.id,
        mode: 'debating',
      });

      // Verify round 1 only has 1 participant message
      const analyses = store.getState().analyses;
      expect(analyses[1].participantMessageIds).toHaveLength(1);
    });

    it('should handle web search toggle mid-conversation', () => {
      const thread = createTestThread({ enableWebSearch: false });

      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      // Round 0 without web search - no pre-search
      expect(store.getState().preSearches).toHaveLength(0);

      // Enable web search mid-conversation
      store.getState().setThread({ ...thread, enableWebSearch: true });

      // Round 1 with web search - add pre-search placeholder
      store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 1, 'Q2'));

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].roundNumber).toBe(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should handle mode change mid-conversation', () => {
      const thread = createTestThread({ mode: 'debating' });

      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      // Round 0 in debating mode
      store.getState().addAnalysis({
        ...createPlaceholderAnalysis(thread.id, 0, 'Q1'),
        mode: 'debating',
      });

      // Change mode mid-conversation
      store.getState().setThread({ ...thread, mode: 'analyzing' });

      // Round 1 in analyzing mode
      store.getState().addAnalysis({
        ...createPlaceholderAnalysis(thread.id, 1, 'Q2'),
        mode: 'analyzing',
      });

      const analyses = store.getState().analyses;
      expect(analyses[0].mode).toBe('debating');
      expect(analyses[1].mode).toBe('analyzing');
    });
  });

  describe('loading State Transitions', () => {
    it('should transition through PENDING → STREAMING → COMPLETE states', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      // Step 1: Placeholder created (PENDING, no participantMessageIds)
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));
      let analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.PENDING);
      expect(analysis.participantMessageIds).toHaveLength(0);

      // Step 2: Participants complete (PENDING, has participantMessageIds)
      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });
      analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.PENDING);
      expect(analysis.participantMessageIds).toHaveLength(1);

      // Step 3: Analysis starts streaming (STREAMING)
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.STREAMING);

      // Step 4: Analysis completes (COMPLETE)
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
      analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle FAILED status correctly', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      // Analysis fails
      store.getState().updateAnalysisError(0, 'Schema validation failed');

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toBe('Schema validation failed');
    });

    it('should track pre-search status transitions', () => {
      const thread = createTestThread({ enableWebSearch: true });
      store.getState().setThread(thread);

      // Placeholder pre-search
      store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Test query'));
      let preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.PENDING);

      // Pre-search starts
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.STREAMING);

      // Pre-search completes
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  describe('navigation Timing with Analysis', () => {
    it('should identify analysis ready to stream (has participantMessageIds, PENDING)', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      // Placeholder (not ready to stream)
      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));
      let analysis = store.getState().analyses[0];
      let isReadyToStream = analysis.status === AnalysisStatuses.PENDING
        && analysis.participantMessageIds
        && analysis.participantMessageIds.length > 0;
      expect(isReadyToStream).toBe(false);

      // After participants complete (ready to stream)
      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      analysis = store.getState().analyses[0];
      isReadyToStream = analysis.status === AnalysisStatuses.PENDING
        && analysis.participantMessageIds
        && analysis.participantMessageIds.length > 0;
      expect(isReadyToStream).toBe(true);
    });

    it('should not allow navigation when analysis is ready to stream', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      const analysis = store.getState().analyses[0];

      // Simulate canNavigateWithoutAnalysis logic from flow-controller
      const isReadyToStream = analysis.status === AnalysisStatuses.PENDING
        && analysis.participantMessageIds
        && analysis.participantMessageIds.length > 0;

      // When ready to stream, should NOT allow navigation
      const canNavigateWithoutAnalysis = !isReadyToStream;
      expect(canNavigateWithoutAnalysis).toBe(false);
    });

    it('should allow navigation when analysis completes', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      // Analysis streams and completes
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      const analysis = store.getState().analyses[0];

      // Simulate firstAnalysisCompleted logic from flow-controller
      const firstAnalysisCompleted = analysis.status === AnalysisStatuses.COMPLETE;
      expect(firstAnalysisCompleted).toBe(true);
    });
  });

  describe('edge Cases', () => {
    it('should not duplicate analysis when addAnalysis called multiple times', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);

      const placeholder = createPlaceholderAnalysis(thread.id, 0, 'Test');

      // Add same placeholder multiple times (race condition scenario)
      store.getState().addAnalysis(placeholder);
      store.getState().addAnalysis(placeholder);
      store.getState().addAnalysis(placeholder);

      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should not overwrite real analysis when createPendingAnalysis called again', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      // Create and complete a real analysis
      store.getState().addAnalysis({
        ...createPlaceholderAnalysis(thread.id, 0, 'Test'),
        participantMessageIds: [`${thread.id}_r0_p0`], // Non-empty = real
        status: AnalysisStatuses.COMPLETE,
      });

      const messages: UIMessage[] = [
        createUserMessage(0, 'Test'),
        createParticipantMessage(thread.id, 0, 0, 'participant-0', 'gpt-4'),
      ];
      store.getState().setMessages(messages);

      // Try to create pending analysis again (should be skipped)
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      // Should still have the completed analysis, not overwritten
      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle empty messages array gracefully', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

      // Call with empty messages (shouldn't crash)
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages: [],
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      // Placeholder should remain unchanged (no participantMessageIds found)
      const analysis = store.getState().analyses[0];
      expect(analysis.participantMessageIds).toHaveLength(0);
    });

    it('should handle messages with missing metadata gracefully', () => {
      const thread = createTestThread();
      store.getState().setThread(thread);
      store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

      store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));

      // Message with incomplete metadata
      const messages: UIMessage[] = [
        {
          id: 'incomplete-msg',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Response' }],
          metadata: { role: 'assistant' }, // Missing required fields
        } as UIMessage,
      ];
      store.getState().setMessages(messages);

      // Should not crash
      store.getState().createPendingAnalysis({
        roundNumber: 0,
        messages,
        userQuestion: 'Test',
        threadId: thread.id,
        mode: 'debating',
      });

      // Placeholder should remain unchanged (invalid metadata filtered out)
      const analysis = store.getState().analyses[0];
      expect(analysis.participantMessageIds).toHaveLength(0);
    });
  });
});

describe('pre-Search and Analysis Coordination', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should create both pre-search and analysis placeholders when web search enabled', () => {
    const thread = createTestThread({ enableWebSearch: true });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Create both placeholders (as form-actions does)
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Test'));
    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Test'));

    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
  });

  it('should complete pre-search before participants can start', () => {
    const thread = createTestThread({ enableWebSearch: true });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Test'));

    // Pre-search must complete first
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Simulate pre-search completion
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);

    // Now participants can start (simulated by hasCompletedPreSearch check)
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const hasCompletedPreSearch = preSearch?.status === AnalysisStatuses.COMPLETE;
    expect(hasCompletedPreSearch).toBe(true);
  });

  it('should handle multiple rounds with web search', () => {
    const thread = createTestThread({ enableWebSearch: true });
    store.getState().setThread(thread);
    store.getState().setParticipants([createTestParticipant(0, 'gpt-4')]);

    // Round 0
    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 0, 'Q1'));
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 0, 'Q1'));
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    // Round 1
    store.getState().addPreSearch(createPlaceholderPreSearch(thread.id, 1, 'Q2'));
    store.getState().addAnalysis(createPlaceholderAnalysis(thread.id, 1, 'Q2'));

    expect(store.getState().preSearches).toHaveLength(2);
    expect(store.getState().analyses).toHaveLength(2);
    expect(store.getState().preSearches[0].roundNumber).toBe(0);
    expect(store.getState().preSearches[1].roundNumber).toBe(1);
  });
});
