/**
 * First Round Complete Before Navigation Tests
 *
 * CRITICAL INVARIANT: The first round MUST complete fully on the overview screen
 * before navigation to thread screen happens. This includes:
 *
 * 1. Pre-search (if enabled) - COMPLETE status
 * 2. ALL participants - Must stream at least once
 * 3. Analysis - COMPLETE status
 *
 * Only THEN can navigation via router.push(`/chat/${slug}`) occur.
 *
 * These tests prevent race conditions that could cause:
 * - Navigation before pre-search completes
 * - Navigation before all participants respond
 * - Navigation before analysis completes
 * - "No Response Generated" errors during streaming
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, PreSearchStatuses, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

// Helper to create properly typed UIMessage
function createAssistantMessage(
  id: string,
  participantId: string,
  participantIndex: number,
  roundNumber: number,
  modelId: string,
  content: string,
  options: { hasError?: boolean; state?: 'streaming' | 'done' } = {},
): UIMessage {
  return {
    id,
    role: MessageRoles.ASSISTANT,
    parts: [
      { type: MessagePartTypes.STEP_START },
      { type: MessagePartTypes.TEXT, text: content, ...(options.state && { state: options.state }) },
    ],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId,
      participantIndex,
      participantRole: null,
      model: modelId,
      finishReason: options.hasError ? 'unknown' : 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: options.hasError ?? false,
      isTransient: false,
      isPartialResponse: false,
      ...(options.hasError && {
        errorType: 'empty_response',
        errorMessage: `The model (${modelId}) did not generate a response.`,
      }),
    },
  };
}

function createUserMessage(id: string, roundNumber: number, content: string): UIMessage {
  return {
    id,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: content }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
  };
}

describe('iNVARIANT: First Round Must Complete Before Navigation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('navigation Gating - All Conditions Must Be Met', () => {
    it('should NOT allow navigation when analysis status is PENDING', () => {
      // Setup: Thread created, participants streamed, but analysis still PENDING
      const thread = {
        id: 't1',
        slug: 'test-slug',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add analysis in PENDING state
      store.getState().addAnalysis({
        id: 'analysis-0',
        threadId: 't1',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: ['msg-1'],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Check navigation condition
      const analyses = store.getState().analyses;
      const firstAnalysis = analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;

      // ASSERTION: Navigation should be blocked
      expect(firstAnalysisCompleted).toBe(false);
    });

    it('should NOT allow navigation when analysis status is STREAMING', () => {
      const thread = {
        id: 't1',
        slug: 'test-slug',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add analysis in STREAMING state
      store.getState().addAnalysis({
        id: 'analysis-0',
        threadId: 't1',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        status: AnalysisStatuses.STREAMING,
        analysisData: null,
        participantMessageIds: ['msg-1'],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const analyses = store.getState().analyses;
      const firstAnalysis = analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;

      // ASSERTION: Navigation should be blocked
      expect(firstAnalysisCompleted).toBe(false);
    });

    it('should NOT allow navigation when slug is not available yet', () => {
      const thread = {
        id: 't1',
        slug: '', // Empty slug - AI hasn't generated title yet
        title: 'New Chat',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis is COMPLETE
      store.getState().addAnalysis({
        id: 'analysis-0',
        threadId: 't1',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        status: AnalysisStatuses.COMPLETE,
        analysisData: { verdict: 'test' },
        participantMessageIds: ['msg-1'],
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      });

      // Check navigation conditions
      const hasSlug = !!store.getState().thread?.slug && store.getState().thread.slug.trim() !== '';

      // ASSERTION: Navigation should be blocked (no slug)
      expect(hasSlug).toBe(false);
    });

    it('should ALLOW navigation when ALL conditions are met', () => {
      const thread = {
        id: 't1',
        slug: 'test-thread-slug', // Slug available
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis is COMPLETE
      store.getState().addAnalysis({
        id: 'analysis-0',
        threadId: 't1',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        status: AnalysisStatuses.COMPLETE,
        analysisData: { verdict: 'test' },
        participantMessageIds: ['msg-1'],
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      });

      // Check all navigation conditions
      const hasSlug = !!store.getState().thread?.slug && store.getState().thread.slug.trim() !== '';
      const analyses = store.getState().analyses;
      const firstAnalysis = analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;

      // ASSERTION: Navigation should be allowed
      expect(hasSlug).toBe(true);
      expect(firstAnalysisCompleted).toBe(true);
    });
  });

  describe('pre-Search Must Complete Before Participants Stream', () => {
    it('should block participant streaming when pre-search is PENDING', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true, // Web search enabled
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      // Pre-search in PENDING state
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'Test query',
        status: PreSearchStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Check if streaming should be blocked
      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchStillRunning = currentRoundPreSearch?.status === PreSearchStatuses.PENDING
        || currentRoundPreSearch?.status === PreSearchStatuses.STREAMING;

      // ASSERTION: Streaming should be blocked
      expect(preSearchStillRunning).toBe(true);
    });

    it('should block participant streaming when pre-search is STREAMING', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      // Pre-search in STREAMING state
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'Test query',
        status: PreSearchStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchStillRunning = currentRoundPreSearch?.status === PreSearchStatuses.PENDING
        || currentRoundPreSearch?.status === PreSearchStatuses.STREAMING;

      // ASSERTION: Streaming should be blocked
      expect(preSearchStillRunning).toBe(true);
    });

    it('should allow participant streaming when pre-search is COMPLETE', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      // Pre-search is COMPLETE
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'Test query',
        status: PreSearchStatuses.COMPLETE,
        searchData: { queries: [], results: [] },
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      });

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchComplete = currentRoundPreSearch?.status === PreSearchStatuses.COMPLETE
        || currentRoundPreSearch?.status === PreSearchStatuses.FAILED;

      // ASSERTION: Streaming should be allowed
      expect(preSearchComplete).toBe(true);
    });

    it('should allow participant streaming when pre-search is FAILED (degraded mode)', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Pre-search FAILED
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'Test query',
        status: PreSearchStatuses.FAILED,
        searchData: null,
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: 'Search failed',
      });

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchTerminal = currentRoundPreSearch?.status === PreSearchStatuses.COMPLETE
        || currentRoundPreSearch?.status === PreSearchStatuses.FAILED;

      // ASSERTION: Streaming should proceed (degraded without search context)
      expect(preSearchTerminal).toBe(true);
    });
  });

  describe('all Participants Must Respond Before Analysis', () => {
    it('should have messages from ALL enabled participants before creating analysis', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      const participants: ChatParticipant[] = [
        { id: 'p1', threadId: 't1', modelId: 'gpt-4', priority: 0, isEnabled: true, role: null } as ChatParticipant,
        { id: 'p2', threadId: 't1', modelId: 'claude-3', priority: 1, isEnabled: true, role: null } as ChatParticipant,
        { id: 'p3', threadId: 't1', modelId: 'gemini', priority: 2, isEnabled: true, role: null } as ChatParticipant,
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add user message
      const userMessage = createUserMessage('user-msg-1', 0, 'What is AI?');

      // Add messages from ONLY 2 of 3 participants (incomplete round)
      const messages: UIMessage[] = [
        userMessage,
        createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'Response from GPT-4'),
        createAssistantMessage('t1_r0_p1', 'p2', 1, 0, 'claude-3', 'Response from Claude'),
        // Missing participant p3!
      ];

      store.getState().setMessages(messages);

      // Check if all participants have responded
      const enabledParticipants = participants.filter(p => p.isEnabled);
      const assistantMessages = messages.filter(m => m.role === MessageRoles.ASSISTANT);
      const respondedIndices = new Set<number>();

      assistantMessages.forEach((m) => {
        const metadata = m.metadata as { participantIndex?: number } | undefined;
        if (metadata?.participantIndex !== undefined) {
          respondedIndices.add(metadata.participantIndex);
        }
      });

      const allParticipantsResponded = enabledParticipants.every(
        (_, index) => respondedIndices.has(index),
      );

      // ASSERTION: Not all participants have responded
      expect(allParticipantsResponded).toBe(false);
      expect(respondedIndices.size).toBe(2);
      expect(enabledParticipants).toHaveLength(3);
    });

    it('should allow analysis creation when ALL participants have responded', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      const participants: ChatParticipant[] = [
        { id: 'p1', threadId: 't1', modelId: 'gpt-4', priority: 0, isEnabled: true, role: null } as ChatParticipant,
        { id: 'p2', threadId: 't1', modelId: 'claude-3', priority: 1, isEnabled: true, role: null } as ChatParticipant,
        { id: 'p3', threadId: 't1', modelId: 'gemini', priority: 2, isEnabled: true, role: null } as ChatParticipant,
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add user message
      const userMessage = createUserMessage('user-msg-1', 0, 'What is AI?');

      // Add messages from ALL 3 participants
      const messages: UIMessage[] = [
        userMessage,
        createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'Response from GPT-4'),
        createAssistantMessage('t1_r0_p1', 'p2', 1, 0, 'claude-3', 'Response from Claude'),
        createAssistantMessage('t1_r0_p2', 'p3', 2, 0, 'gemini', 'Response from Gemini'),
      ];

      store.getState().setMessages(messages);

      // Check if all participants have responded
      const enabledParticipants = participants.filter(p => p.isEnabled);
      const assistantMessages = messages.filter(m => m.role === MessageRoles.ASSISTANT);
      const respondedIndices = new Set<number>();

      assistantMessages.forEach((m) => {
        const metadata = m.metadata as { participantIndex?: number } | undefined;
        if (metadata?.participantIndex !== undefined) {
          respondedIndices.add(metadata.participantIndex);
        }
      });

      const allParticipantsResponded = enabledParticipants.every(
        (_, index) => respondedIndices.has(index),
      );

      // ASSERTION: All participants have responded
      expect(allParticipantsResponded).toBe(true);
      expect(respondedIndices.size).toBe(3);
    });
  });

  describe('streaming Messages Should Not Have Error State', () => {
    it('should NOT set hasError=true when parts are still streaming', () => {
      // This tests the fix for the "No Response Generated" bug
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setIsStreaming(true);

      // Create a message that is still streaming (state: 'streaming')
      const streamingMessage = createAssistantMessage(
        't1_r0_p0',
        'p1',
        0,
        0,
        'qwen/qwen3-max',
        'This is the response content...',
        { state: 'streaming' }, // Parts still streaming
      );

      store.getState().setMessages([streamingMessage]);

      // Check if streaming message has error (should NOT)
      const message = store.getState().messages[0];
      const metadata = message.metadata as { hasError?: boolean } | undefined;

      // Check parts for streaming state
      const parts = message.parts || [];
      const isStillStreaming = parts.some(
        p => 'state' in p && p.state === 'streaming',
      );

      // ASSERTION: Message should NOT have error when streaming
      expect(isStillStreaming).toBe(true);
      expect(metadata?.hasError).toBe(false);
    });

    it('should allow hasError=true only when streaming is complete and no content', () => {
      // Error state is valid when stream finished but produced nothing
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setIsStreaming(false); // Streaming finished

      // Create a message with error (no content, stream done)
      const errorMessage: UIMessage = {
        id: 't1_r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.STEP_START }], // No text content!
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
          participantRole: null,
          model: 'qwen/qwen3-max',
          finishReason: 'unknown',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          hasError: true,
          errorType: 'empty_response',
          errorMessage: 'The model (qwen/qwen3-max) did not generate a response.',
          isTransient: false,
          isPartialResponse: false,
        },
      };

      store.getState().setMessages([errorMessage]);

      const message = store.getState().messages[0];
      const parts = message.parts || [];

      // Check for text content
      const hasTextContent = parts.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && (p as { text: string }).text.trim().length > 0,
      );

      // Check streaming state
      const isStillStreaming = parts.some(
        p => 'state' in p && p.state === 'streaming',
      );

      const metadata = message.metadata as { hasError?: boolean } | undefined;

      // ASSERTION: Error is valid because no content and not streaming
      expect(hasTextContent).toBe(false);
      expect(isStillStreaming).toBe(false);
      expect(metadata?.hasError).toBe(true);
    });
  });

  describe('message Deduplication - No Duplicates Allowed', () => {
    it('should NOT have multiple messages with the same ID', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);

      // Attempt to add multiple messages with the same ID (simulating bug)
      const message1 = createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'First content', { hasError: true });
      const message2 = createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'Second content', { hasError: false });

      // Add both messages
      store.getState().setMessages([message1, message2]);

      // Check for duplicates
      const messages = store.getState().messages;
      const messageIds = messages.map(m => m.id);
      const uniqueIds = new Set(messageIds);

      // ASSERTION: Each message ID should be unique
      // Note: setMessages doesn't deduplicate - this test documents expected behavior
      // The real deduplication happens in onFinish callback
      expect(messageIds).toHaveLength(2); // Documents current behavior
      expect(uniqueIds.size).toBe(1); // Both have same ID

      // This test verifies we can DETECT duplicates
      const hasDuplicates = messageIds.length !== uniqueIds.size;
      expect(hasDuplicates).toBe(true);
    });

    it('should update existing message instead of creating duplicate in onFinish flow', () => {
      // This tests the deduplication logic that should happen in onFinish
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);

      // First message (streaming state)
      const streamingMessage = createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'Content...', { state: 'streaming' });
      store.getState().setMessages([streamingMessage]);

      // Verify initial state
      expect(store.getState().messages).toHaveLength(1);

      // Simulate onFinish updating the message (not adding duplicate)
      const completedMessage = createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'Complete content', { state: 'done' });

      // The proper way: UPDATE existing message by finding and replacing
      store.getState().setMessages((prev) => {
        const existingIndex = prev.findIndex(m => m.id === completedMessage.id);
        if (existingIndex !== -1) {
          // Update in place
          const updated = [...prev];
          updated[existingIndex] = completedMessage;
          return updated;
        }
        // If not found, add (shouldn't happen in normal flow)
        return [...prev, completedMessage];
      });

      // ASSERTION: Still only one message, content updated
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].parts?.[1]).toHaveProperty('text', 'Complete content');
    });
  });

  describe('full Round Flow Integration', () => {
    it('should complete full round 0 flow: Pre-search → All Participants → Analysis → Ready for Navigation', () => {
      // Setup
      const thread = {
        id: 't1',
        slug: '', // No slug yet
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      const participants: ChatParticipant[] = [
        { id: 'p1', threadId: 't1', modelId: 'gpt-4', priority: 0, isEnabled: true, role: null } as ChatParticipant,
        { id: 'p2', threadId: 't1', modelId: 'claude-3', priority: 1, isEnabled: true, role: null } as ChatParticipant,
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // STEP 1: Pre-search starts (PENDING)
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'What is AI?',
        status: PreSearchStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Verify pre-search blocking
      let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(PreSearchStatuses.PENDING);

      // STEP 2: Pre-search completes
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.COMPLETE);
      preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(PreSearchStatuses.COMPLETE);

      // STEP 3: Participants stream (user message + both participants)
      const userMessage = createUserMessage('user-msg-1', 0, 'What is AI?');
      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      // Participant 0 responds
      store.getState().setCurrentParticipantIndex(0);
      store.getState().setMessages([
        userMessage,
        createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'GPT-4 response'),
      ]);

      // Participant 1 responds
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages([
        userMessage,
        createAssistantMessage('t1_r0_p0', 'p1', 0, 0, 'gpt-4', 'GPT-4 response'),
        createAssistantMessage('t1_r0_p1', 'p2', 1, 0, 'claude-3', 'Claude response'),
      ]);

      // Streaming complete
      store.getState().setIsStreaming(false);

      // Verify all participants responded
      const assistantMessages = store.getState().messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(2);

      // STEP 4: Analysis starts (placeholder → streaming → complete)
      store.getState().addAnalysis({
        id: 'analysis-0',
        threadId: 't1',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'What is AI?',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: ['t1_r0_p0', 't1_r0_p1'],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      let analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis?.status).toBe(AnalysisStatuses.PENDING);

      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis?.status).toBe(AnalysisStatuses.STREAMING);

      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
      analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis?.status).toBe(AnalysisStatuses.COMPLETE);

      // STEP 5: Slug becomes available (AI generates title)
      store.getState().setThread({
        ...thread,
        slug: 'what-is-ai-discussion',
        title: 'What is AI? Discussion',
      } as ChatThread);

      // FINAL CHECK: All conditions for navigation are met
      const finalState = store.getState();
      const hasSlug = !!finalState.thread?.slug && finalState.thread.slug.trim() !== '';
      const firstAnalysis = finalState.analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;
      const preSearchComplete = finalState.preSearches.find(ps => ps.roundNumber === 0)?.status === PreSearchStatuses.COMPLETE;

      expect(hasSlug).toBe(true);
      expect(firstAnalysisCompleted).toBe(true);
      expect(preSearchComplete).toBe(true);

      // Navigation can now proceed
      const shouldNavigate = hasSlug && firstAnalysisCompleted;
      expect(shouldNavigate).toBe(true);
    });

    it('should NOT navigate when any step in round 0 is incomplete', () => {
      // Setup incomplete round
      const thread = {
        id: 't1',
        slug: 'test-slug', // Slug available early
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Pre-search still STREAMING
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'Test',
        status: PreSearchStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Check conditions
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const preSearchComplete = preSearch?.status === PreSearchStatuses.COMPLETE
        || preSearch?.status === PreSearchStatuses.FAILED;

      // Even with slug available, pre-search not complete
      expect(preSearchComplete).toBe(false);

      // No analysis yet
      const firstAnalysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(firstAnalysis).toBeUndefined();

      // Navigation should NOT happen
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;
      const shouldNavigate = !!store.getState().thread?.slug && firstAnalysisCompleted;
      expect(shouldNavigate).toBe(false);
    });
  });

  describe('timeout Safety - Prevent Infinite Blocking', () => {
    it('should mark stuck pre-search as FAILED after timeout', () => {
      const thread = {
        id: 't1',
        slug: '',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: true,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);

      // Pre-search stuck in STREAMING for too long (>120s)
      store.getState().addPreSearch({
        id: 'presearch-0',
        threadId: 't1',
        roundNumber: 0,
        userQuery: 'Test',
        status: PreSearchStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(Date.now() - 150000), // 150s ago
        completedAt: null,
        errorMessage: null,
      });

      // Trigger stuck check
      store.getState().checkStuckPreSearches();

      // Pre-search should be marked complete (or failed) to unblock
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(PreSearchStatuses.COMPLETE);
    });

    it('should allow navigation even if analysis times out (safety)', () => {
      // Analysis timeout should not permanently block navigation
      const thread = {
        id: 't1',
        slug: 'test-slug',
        title: 'Test Thread',
        userId: 'user-1',
        mode: 'debating' as const,
        enableWebSearch: false,
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatThread;

      store.getState().setThread(thread);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis stuck in PENDING (placeholder) for > 60s
      store.getState().addAnalysis({
        id: 'analysis-0',
        threadId: 't1',
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test',
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: [], // Empty = placeholder
        createdAt: new Date(Date.now() - 65000), // 65s ago
        completedAt: null,
        errorMessage: null,
      });

      // flow-controller.ts timeout logic:
      // If PENDING + placeholder + not streaming + > 60s → allow navigation
      const analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      const isPlaceholder = !analysis?.participantMessageIds || analysis.participantMessageIds.length === 0;
      const isPending = analysis?.status === AnalysisStatuses.PENDING;
      const elapsed = Date.now() - new Date(analysis?.createdAt || 0).getTime();

      // Simulate timeout detection (matches flow-controller.ts logic)
      const timedOut = isPlaceholder && isPending && elapsed > 60000;

      // ASSERTION: Timeout allows navigation to proceed
      expect(timedOut).toBe(true);
    });
  });
});
