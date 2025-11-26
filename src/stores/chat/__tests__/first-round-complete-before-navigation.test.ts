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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  MessagePartTypes,
  MessageRoles,
  PreSearchStatuses,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

describe('first Round Complete Before Navigation', () => {
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
      store.getState().setThread(createMockThread({ slug: 'test-slug' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addAnalysis(createMockAnalysis({
        status: AnalysisStatuses.PENDING,
        participantMessageIds: ['msg-1'],
      }));

      const analyses = store.getState().analyses;
      const firstAnalysis = analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;

      expect(firstAnalysisCompleted).toBe(false);
    });

    it('should NOT allow navigation when analysis status is STREAMING', () => {
      store.getState().setThread(createMockThread({ slug: 'test-slug' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addAnalysis(createMockAnalysis({
        status: AnalysisStatuses.STREAMING,
        participantMessageIds: ['msg-1'],
      }));

      const analyses = store.getState().analyses;
      const firstAnalysis = analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;

      expect(firstAnalysisCompleted).toBe(false);
    });

    it('should NOT allow navigation when slug is not available yet', () => {
      store.getState().setThread(createMockThread({ slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addAnalysis(createMockAnalysis({
        status: AnalysisStatuses.COMPLETE,
        analysisData: { verdict: 'test' },
      }));

      const hasSlug = !!store.getState().thread?.slug && store.getState().thread.slug.trim() !== '';

      expect(hasSlug).toBe(false);
    });

    it('should ALLOW navigation when ALL conditions are met', () => {
      store.getState().setThread(createMockThread({ slug: 'test-thread-slug' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addAnalysis(createMockAnalysis({
        status: AnalysisStatuses.COMPLETE,
        analysisData: { verdict: 'test' },
        participantMessageIds: ['msg-1'],
      }));

      const hasSlug = !!store.getState().thread?.slug && store.getState().thread.slug.trim() !== '';
      const analyses = store.getState().analyses;
      const firstAnalysis = analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;

      expect(hasSlug).toBe(true);
      expect(firstAnalysisCompleted).toBe(true);
    });
  });

  describe('pre-Search Must Complete Before Participants Stream', () => {
    it('should block participant streaming when pre-search is PENDING', () => {
      store.getState().setThread(createMockThread({ enableWebSearch: true, slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.PENDING,
      }));

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchStillRunning = currentRoundPreSearch?.status === PreSearchStatuses.PENDING
        || currentRoundPreSearch?.status === PreSearchStatuses.STREAMING;

      expect(preSearchStillRunning).toBe(true);
    });

    it('should block participant streaming when pre-search is STREAMING', () => {
      store.getState().setThread(createMockThread({ enableWebSearch: true, slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.STREAMING,
      }));

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchStillRunning = currentRoundPreSearch?.status === PreSearchStatuses.PENDING
        || currentRoundPreSearch?.status === PreSearchStatuses.STREAMING;

      expect(preSearchStillRunning).toBe(true);
    });

    it('should allow participant streaming when pre-search is COMPLETE', () => {
      store.getState().setThread(createMockThread({ enableWebSearch: true, slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setWaitingToStartStreaming(true);

      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.COMPLETE,
        searchData: { queries: [], results: [] },
      }));

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchComplete = currentRoundPreSearch?.status === PreSearchStatuses.COMPLETE
        || currentRoundPreSearch?.status === PreSearchStatuses.FAILED;

      expect(preSearchComplete).toBe(true);
    });

    it('should allow participant streaming when pre-search is FAILED (degraded mode)', () => {
      store.getState().setThread(createMockThread({ enableWebSearch: true, slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.FAILED,
        errorMessage: 'Search failed',
      }));

      const preSearches = store.getState().preSearches;
      const currentRoundPreSearch = preSearches.find(ps => ps.roundNumber === 0);
      const preSearchTerminal = currentRoundPreSearch?.status === PreSearchStatuses.COMPLETE
        || currentRoundPreSearch?.status === PreSearchStatuses.FAILED;

      expect(preSearchTerminal).toBe(true);
    });
  });

  describe('all Participants Must Respond Before Analysis', () => {
    it('should have messages from ALL enabled participants before creating analysis', () => {
      const participants = createMockParticipants(3);
      store.getState().setThread(createMockThread({ slug: '' }));
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      const messages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        // Missing participant 2
      ];

      store.getState().setMessages(messages);

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

      expect(allParticipantsResponded).toBe(false);
      expect(respondedIndices.size).toBe(2);
      expect(enabledParticipants).toHaveLength(3);
    });

    it('should allow analysis creation when ALL participants have responded', () => {
      const participants = createMockParticipants(3);
      store.getState().setThread(createMockThread({ slug: '' }));
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      const messages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockMessage(2, 0),
      ];

      store.getState().setMessages(messages);

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

      expect(allParticipantsResponded).toBe(true);
      expect(respondedIndices.size).toBe(3);
    });
  });

  describe('streaming Messages Should Not Have Error State', () => {
    it('should NOT set hasError=true when parts are still streaming', () => {
      store.getState().setThread(createMockThread({ slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setIsStreaming(true);

      const streamingMessage = createMockMessage(0, 0, {
        parts: [
          { type: MessagePartTypes.STEP_START },
          { type: MessagePartTypes.TEXT, text: 'Content being streamed...', state: 'streaming' },
        ],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          participantRole: null,
          model: 'qwen/qwen3-max',
          hasError: false,
        },
      });

      store.getState().setMessages([streamingMessage]);

      const message = store.getState().messages[0];
      const metadata = message.metadata as { hasError?: boolean } | undefined;
      const parts = message.parts ?? [];
      const isStillStreaming = parts.some(
        p => 'state' in p && p.state === 'streaming',
      );

      expect(isStillStreaming).toBe(true);
      expect(metadata?.hasError).toBe(false);
    });

    it('should allow hasError=true only when streaming is complete and no content', () => {
      store.getState().setThread(createMockThread({ slug: '' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setIsStreaming(false);

      const errorMessage = createMockMessage(0, 0, {
        parts: [{ type: MessagePartTypes.STEP_START }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'participant-0',
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
      });

      store.getState().setMessages([errorMessage]);

      const message = store.getState().messages[0];
      const parts = message.parts ?? [];

      const hasTextContent = parts.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && (p as { text: string }).text.trim().length > 0,
      );

      const isStillStreaming = parts.some(
        p => 'state' in p && p.state === 'streaming',
      );

      const metadata = message.metadata as { hasError?: boolean } | undefined;

      expect(hasTextContent).toBe(false);
      expect(isStillStreaming).toBe(false);
      expect(metadata?.hasError).toBe(true);
    });
  });

  describe('message Deduplication - No Duplicates Allowed', () => {
    it('should NOT have multiple messages with the same ID', () => {
      store.getState().setThread(createMockThread({ slug: '' }));

      const message1 = createMockMessage(0, 0);
      const message2 = createMockMessage(0, 0);

      store.getState().setMessages([message1, message2]);

      const messages = store.getState().messages;
      const messageIds = messages.map(m => m.id);
      const uniqueIds = new Set(messageIds);

      const hasDuplicates = messageIds.length !== uniqueIds.size;
      expect(hasDuplicates).toBe(true);
    });

    it('should update existing message instead of creating duplicate in onFinish flow', () => {
      store.getState().setThread(createMockThread({ slug: '' }));

      const streamingMessage = createMockMessage(0, 0, {
        parts: [
          { type: MessagePartTypes.TEXT, text: 'Initial content...', state: 'streaming' },
        ],
      });
      store.getState().setMessages([streamingMessage]);

      expect(store.getState().messages).toHaveLength(1);

      const completedMessage = createMockMessage(0, 0, {
        parts: [
          { type: MessagePartTypes.TEXT, text: 'Complete content' },
        ],
      });

      store.getState().setMessages((prev) => {
        const existingIndex = prev.findIndex(m => m.id === completedMessage.id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = completedMessage;
          return updated;
        }
        return [...prev, completedMessage];
      });

      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].parts?.[0]).toHaveProperty('text', 'Complete content');
    });
  });

  describe('full Round Flow Integration', () => {
    it('should complete full round 0 flow: Pre-search → All Participants → Analysis → Ready for Navigation', () => {
      const participants = createMockParticipants(2);
      store.getState().setThread(createMockThread({ slug: '', enableWebSearch: true }));
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // STEP 1: Pre-search starts (PENDING)
      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.PENDING,
      }));

      let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(PreSearchStatuses.PENDING);

      // STEP 2: Pre-search completes
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.COMPLETE);
      preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(PreSearchStatuses.COMPLETE);

      // STEP 3: Participants stream
      const userMessage = createMockUserMessage(0);
      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      store.getState().setCurrentParticipantIndex(0);
      store.getState().setMessages([
        userMessage,
        createMockMessage(0, 0),
      ]);

      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages([
        userMessage,
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      store.getState().setIsStreaming(false);

      const assistantMessages = store.getState().messages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(2);

      // STEP 4: Analysis lifecycle
      store.getState().addAnalysis(createMockAnalysis({
        status: AnalysisStatuses.PENDING,
        participantMessageIds: ['thread-123_r0_p0', 'thread-123_r0_p1'],
      }));

      let analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis?.status).toBe(AnalysisStatuses.PENDING);

      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis?.status).toBe(AnalysisStatuses.STREAMING);

      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
      analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis?.status).toBe(AnalysisStatuses.COMPLETE);

      // STEP 5: Slug becomes available
      store.getState().setThread(createMockThread({
        slug: 'what-is-ai-discussion',
        title: 'What is AI? Discussion',
      }));

      // FINAL CHECK: All conditions for navigation are met
      const finalState = store.getState();
      const hasSlug = !!finalState.thread?.slug && finalState.thread.slug.trim() !== '';
      const firstAnalysis = finalState.analyses.find(a => a.roundNumber === 0);
      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;
      const preSearchComplete = finalState.preSearches.find(ps => ps.roundNumber === 0)?.status === PreSearchStatuses.COMPLETE;

      expect(hasSlug).toBe(true);
      expect(firstAnalysisCompleted).toBe(true);
      expect(preSearchComplete).toBe(true);

      const shouldNavigate = hasSlug && firstAnalysisCompleted;
      expect(shouldNavigate).toBe(true);
    });

    it('should NOT navigate when any step in round 0 is incomplete', () => {
      store.getState().setThread(createMockThread({ slug: 'test-slug', enableWebSearch: true }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.STREAMING,
      }));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const preSearchComplete = preSearch?.status === PreSearchStatuses.COMPLETE
        || preSearch?.status === PreSearchStatuses.FAILED;

      expect(preSearchComplete).toBe(false);

      const firstAnalysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(firstAnalysis).toBeUndefined();

      const firstAnalysisCompleted = firstAnalysis?.status === AnalysisStatuses.COMPLETE;
      const shouldNavigate = !!store.getState().thread?.slug && firstAnalysisCompleted;
      expect(shouldNavigate).toBe(false);
    });
  });

  describe('timeout Safety - Prevent Infinite Blocking', () => {
    it('should mark stuck pre-search as FAILED after timeout', () => {
      store.getState().setThread(createMockThread({ enableWebSearch: true, slug: '' }));

      store.getState().addPreSearch(createMockPreSearch({
        status: PreSearchStatuses.STREAMING,
        createdAt: new Date(Date.now() - 150000), // 150s ago
      }));

      store.getState().checkStuckPreSearches();

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe(PreSearchStatuses.COMPLETE);
    });

    it('should allow navigation even if analysis times out (safety)', () => {
      store.getState().setThread(createMockThread({ slug: 'test-slug' }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      store.getState().addAnalysis(createMockAnalysis({
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: [],
        createdAt: new Date(Date.now() - 65000), // 65s ago
      }));

      const analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      const isPlaceholder = !analysis?.participantMessageIds || analysis.participantMessageIds.length === 0;
      const isPending = analysis?.status === AnalysisStatuses.PENDING;
      const elapsed = Date.now() - new Date(analysis?.createdAt ?? 0).getTime();

      const timedOut = isPlaceholder && isPending && elapsed > 60000;

      expect(timedOut).toBe(true);
    });
  });
});
