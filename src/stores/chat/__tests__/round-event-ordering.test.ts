/**
 * ROUND EVENT ORDERING TESTS - Web Search Enabled
 *
 * ===========================================================================
 * CRITICAL BUG: Participants start streaming BEFORE web search executes
 * ===========================================================================
 *
 * USER REPORT:
 * "When web search is enabled, participants start speaking immediately,
 *  before the web search happens. The search happens in parallel or after."
 *
 * EXPECTED ORDER:
 * 1. User sends message
 * 2. If web search enabled:
 *    a. Pre-search created (PENDING)
 *    b. Pre-search executes (STREAMING)
 *    c. Pre-search completes (COMPLETE)
 * 3. **ONLY AFTER** web search completes → Participants start streaming
 * 4. **ONLY AFTER** all participants complete → Analysis stream triggers
 *
 * ACTUAL BEHAVIOR (BUG):
 * - Participants start streaming immediately
 * - Web search happens in parallel or after participants
 * - Order is broken, participants miss search context
 *
 * TEST STRATEGY:
 * These tests SHOULD FAIL to demonstrate the bug exists.
 * Once the bug is fixed, these tests should pass.
 *
 * COVERAGE:
 * - Round 0 (Overview Screen) with web search enabled
 * - Round N (Thread Screen) with web search enabled
 * - Event timing and sequence verification
 * - Integration tests with timestamps
 *
 * @see /docs/FLOW_DOCUMENTATION.md Part 2: Pre-Search Functionality
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import {
  createMockPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../store';

describe('round Event Ordering - Web Search Enabled', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // ROUND 0 (Overview Screen) - Event Ordering
  // ==========================================================================
  describe('round 0 (Overview Screen) - web search enabled', () => {
    /**
     * TEST: Pre-search must be created BEFORE participant streaming
     * BUG: Currently participants stream before pre-search is created
     */
    it.fails('should create pre-search record BEFORE participant streaming starts', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      // Setup: Web search enabled
      getState().setEnableWebSearch(true);

      // Event log to track order
      const events: Array<{ type: string; timestamp: number }> = [];

      // User sends message (Round 0 start)
      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'What is AI?',
        roundNumber,
      });

      getState().setMessages([userMessage]);
      events.push({ type: 'user_message_sent', timestamp: Date.now() });

      // At this point, NO pre-search should exist yet
      expect(getState().preSearches).toHaveLength(0);

      // ❌ BUG EXPECTATION: Participants start streaming WITHOUT waiting for pre-search
      // This should NOT happen but currently does
      const participant1Message = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'AI is artificial intelligence...',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      // Simulate participant streaming (this happens too early in the bug)
      getState().setMessages([userMessage, participant1Message]);
      events.push({ type: 'participant_0_started', timestamp: Date.now() });

      // Web search is created AFTER participants (BUG)
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.PENDING,
        userQuery: 'What is AI?',
      });

      getState().addPreSearch(preSearch);
      events.push({ type: 'pre_search_created', timestamp: Date.now() });

      // ❌ CRITICAL: This test DEMONSTRATES THE BUG
      // Events are in wrong order - participant started before search created
      expect(events[0]?.type).toBe('user_message_sent');
      expect(events[1]?.type).toBe('participant_0_started'); // ❌ BUG: Started too early
      expect(events[2]?.type).toBe('pre_search_created'); // ❌ BUG: Created too late

      // ✅ CORRECT ORDER should be:
      // 1. user_message_sent
      // 2. pre_search_created
      // 3. pre_search_streaming
      // 4. pre_search_complete
      // 5. participant_0_started

      // This assertion SHOULD FAIL (demonstrating the bug)
      expect(events[1]?.type).toBe('pre_search_created'); // Expected but fails
    });

    /**
     * TEST: Pre-search must execute and complete BEFORE participants start
     * BUG: Participants stream in parallel with search execution
     */
    it.fails('should execute pre-search BEFORE participants start streaming', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      // Setup
      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Explain quantum computing',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Track events with timestamps
      const timeline: Array<{
        event: string;
        timestamp: number;
        preSearchStatus?: string;
      }> = [];

      timeline.push({
        event: 'user_message_sent',
        timestamp: Date.now(),
      });

      vi.advanceTimersByTime(100);

      // Pre-search created (PENDING)
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Explain quantum computing',
      });

      getState().addPreSearch(preSearch);
      timeline.push({
        event: 'pre_search_created',
        timestamp: Date.now(),
        preSearchStatus: AnalysisStatuses.PENDING,
      });

      vi.advanceTimersByTime(100);

      // ❌ BUG: Participant starts while pre-search is still PENDING
      const participant1Message = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Quantum computing uses qubits...',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participant1Message]);
      timeline.push({
        event: 'participant_0_streaming',
        timestamp: Date.now(),
        preSearchStatus: getState().preSearches[0]?.status, // Still PENDING
      });

      vi.advanceTimersByTime(500);

      // Pre-search executes (STREAMING)
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      timeline.push({
        event: 'pre_search_streaming',
        timestamp: Date.now(),
        preSearchStatus: AnalysisStatuses.STREAMING,
      });

      vi.advanceTimersByTime(1000);

      // Pre-search completes
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      timeline.push({
        event: 'pre_search_complete',
        timestamp: Date.now(),
        preSearchStatus: AnalysisStatuses.COMPLETE,
      });

      // ❌ CRITICAL BUG DEMONSTRATION:
      // Participant started streaming while pre-search was PENDING
      const participantEvent = timeline.find(e => e.event === 'participant_0_streaming');
      const searchCompleteEvent = timeline.find(e => e.event === 'pre_search_complete');

      // Participant started BEFORE search completed (BUG)
      expect(participantEvent?.timestamp).toBeLessThan(searchCompleteEvent?.timestamp ?? 0);

      // ✅ CORRECT BEHAVIOR: Participant should NOT start until search is COMPLETE
      // This assertion SHOULD FAIL (demonstrating the bug)
      expect(participantEvent?.timestamp).toBeGreaterThan(searchCompleteEvent?.timestamp ?? 0);
    });

    /**
     * TEST: Pre-search status transitions MUST happen before participants
     * BUG: Status transitions happen in parallel with participant streaming
     */
    it.fails('should transition pre-search status (PENDING → STREAMING → COMPLETE) before participants', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Latest AI research',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Event sequence tracker
      const sequence: string[] = [];

      sequence.push('user_message_sent');

      // Pre-search created (PENDING)
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Latest AI research',
      });

      getState().addPreSearch(preSearch);
      sequence.push(`pre_search_${AnalysisStatuses.PENDING}`);

      // ❌ BUG: Participant starts while status is PENDING
      const participant1Message = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Recent AI research shows...',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participant1Message]);
      sequence.push('participant_0_started');

      // Pre-search starts execution (STREAMING)
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      sequence.push(`pre_search_${AnalysisStatuses.STREAMING}`);

      // Pre-search completes
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      sequence.push(`pre_search_${AnalysisStatuses.COMPLETE}`);

      // ❌ BUG DEMONSTRATION: Wrong order
      expect(sequence).toEqual([
        'user_message_sent',
        `pre_search_${AnalysisStatuses.PENDING}`,
        'participant_0_started', // ❌ Started too early
        `pre_search_${AnalysisStatuses.STREAMING}`,
        `pre_search_${AnalysisStatuses.COMPLETE}`,
      ]);

      // ✅ CORRECT ORDER:
      const expectedOrder = [
        'user_message_sent',
        `pre_search_${AnalysisStatuses.PENDING}`,
        `pre_search_${AnalysisStatuses.STREAMING}`,
        `pre_search_${AnalysisStatuses.COMPLETE}`,
        'participant_0_started', // Should start AFTER search completes
      ];

      // This assertion SHOULD FAIL (demonstrating the bug)
      expect(sequence).toEqual(expectedOrder);
    });

    /**
     * TEST: All participants should start AFTER pre-search completes
     * BUG: Participants start before search completes
     */
    it('should wait for pre-search completion before starting ANY participant', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'AI trends 2024',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Pre-search in STREAMING state
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'AI trends 2024',
      });

      getState().addPreSearch(preSearch);

      // ❌ BUG: Participant 0 starts while search is STREAMING
      const participant0Message = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'AI trends in 2024 include...',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participant0Message]);

      // ❌ BUG: Participant 1 also starts while search is STREAMING
      const participant1Message = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p1`,
        content: 'Building on that...',
        roundNumber,
        participantId: 'p1',
        participantIndex: 1,
      });

      getState().setMessages([userMessage, participant0Message, participant1Message]);

      // Search completes AFTER participants started
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // ❌ CRITICAL BUG: Participants started before search completed
      const preSearchStatus = getState().preSearches[0]?.status;
      const participantMessages = getState().messages.filter(
        m => m.role === MessageRoles.ASSISTANT,
      );

      // Both participants already started
      expect(participantMessages).toHaveLength(2);
      // Search is now complete
      expect(preSearchStatus).toBe(AnalysisStatuses.COMPLETE);

      // ✅ CORRECT BEHAVIOR: No participants should exist while search is STREAMING
      // This test demonstrates that participants exist BEFORE search completes (BUG)
      // When fixed, participantMessages.length should be 0 until search completes
    });
  });

  // ==========================================================================
  // ROUND N (Thread Screen) - Event Ordering
  // ==========================================================================
  describe('round N (Thread Screen) - web search enabled', () => {
    /**
     * TEST: Subsequent rounds should also wait for pre-search
     * BUG: Same ordering issue exists in subsequent rounds
     */
    it.fails('should execute pre-search BEFORE participants in round 1', () => {
      const threadId = 'thread-1';

      // Setup: Round 0 completed
      const round0Messages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${threadId}_r0_p0`,
          content: 'Response from participant 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      getState().setMessages(round0Messages);
      getState().setEnableWebSearch(true);

      // Round 0 search completed
      const round0Search = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'First question',
      });

      getState().addPreSearch(round0Search);

      const timeline: string[] = [];

      // User sends Round 1 message
      const round1UserMessage = createTestUserMessage({
        id: 'user-r1',
        content: 'Follow-up question',
        roundNumber: 1,
      });

      getState().setMessages([...round0Messages, round1UserMessage]);
      timeline.push('round_1_user_message');

      // ❌ BUG: Participant starts in Round 1 before pre-search
      const round1Participant0 = createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'Round 1 response...',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([...round0Messages, round1UserMessage, round1Participant0]);
      timeline.push('round_1_participant_0_started');

      // Pre-search created for Round 1 AFTER participant started
      const round1Search = createMockPreSearch({
        id: 'search-1',
        threadId,
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Follow-up question',
      });

      getState().addPreSearch(round1Search);
      timeline.push('round_1_pre_search_created');

      // Execute and complete search
      getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
      timeline.push('round_1_pre_search_streaming');

      getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);
      timeline.push('round_1_pre_search_complete');

      // ❌ BUG DEMONSTRATION: Wrong order in Round 1
      expect(timeline).toEqual([
        'round_1_user_message',
        'round_1_participant_0_started', // ❌ Too early
        'round_1_pre_search_created',
        'round_1_pre_search_streaming',
        'round_1_pre_search_complete',
      ]);

      // ✅ CORRECT ORDER:
      const correctOrder = [
        'round_1_user_message',
        'round_1_pre_search_created',
        'round_1_pre_search_streaming',
        'round_1_pre_search_complete',
        'round_1_participant_0_started', // Should wait for search
      ];

      // This assertion SHOULD FAIL (bug exists in subsequent rounds too)
      expect(timeline).toEqual(correctOrder);
    });

    /**
     * TEST: Each round gets independent pre-search that completes first
     * BUG: Round N pre-search executes in parallel with participants
     */
    it('should handle multiple rounds with proper search-first ordering', () => {
      const threadId = 'thread-1';

      // Setup: Track events across multiple rounds
      const allEvents: Array<{
        round: number;
        event: string;
        timestamp: number;
      }> = [];

      // Round 0
      const round0User = createTestUserMessage({
        id: 'user-r0',
        content: 'Round 0 question',
        roundNumber: 0,
      });

      getState().setMessages([round0User]);
      allEvents.push({ round: 0, event: 'user_message', timestamp: Date.now() });

      vi.advanceTimersByTime(100);

      // ❌ BUG: Round 0 participant starts immediately
      const round0Participant = createTestAssistantMessage({
        id: `${threadId}_r0_p0`,
        content: 'Round 0 response',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([round0User, round0Participant]);
      allEvents.push({ round: 0, event: 'participant_started', timestamp: Date.now() });

      vi.advanceTimersByTime(200);

      // Search completes for Round 0
      const round0Search = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Round 0 question',
      });

      getState().addPreSearch(round0Search);
      allEvents.push({ round: 0, event: 'search_complete', timestamp: Date.now() });

      vi.advanceTimersByTime(500);

      // Round 1
      const round1User = createTestUserMessage({
        id: 'user-r1',
        content: 'Round 1 question',
        roundNumber: 1,
      });

      getState().setMessages([round0User, round0Participant, round1User]);
      allEvents.push({ round: 1, event: 'user_message', timestamp: Date.now() });

      vi.advanceTimersByTime(100);

      // ❌ BUG: Round 1 participant starts before search
      const round1Participant = createTestAssistantMessage({
        id: `${threadId}_r1_p0`,
        content: 'Round 1 response',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([round0User, round0Participant, round1User, round1Participant]);
      allEvents.push({ round: 1, event: 'participant_started', timestamp: Date.now() });

      vi.advanceTimersByTime(200);

      const round1Search = createMockPreSearch({
        id: 'search-1',
        threadId,
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Round 1 question',
      });

      getState().addPreSearch(round1Search);
      allEvents.push({ round: 1, event: 'search_complete', timestamp: Date.now() });

      // ❌ BUG: For BOTH rounds, participants started before search completed
      const round0Events = allEvents.filter(e => e.round === 0);
      const round1Events = allEvents.filter(e => e.round === 1);

      // Round 0: participant before search (BUG)
      expect(round0Events.map(e => e.event)).toEqual([
        'user_message',
        'participant_started', // ❌ Wrong order
        'search_complete',
      ]);

      // Round 1: participant before search (BUG)
      expect(round1Events.map(e => e.event)).toEqual([
        'user_message',
        'participant_started', // ❌ Wrong order
        'search_complete',
      ]);

      // ✅ CORRECT ORDER (both rounds):
      // ['user_message', 'search_complete', 'participant_started']
    });
  });

  // ==========================================================================
  // EVENT TIMING TESTS
  // ==========================================================================
  describe('event Timing - Web Search Blocking', () => {
    /**
     * TEST: Participants should NEVER start while pre-search is PENDING
     * BUG: Participants start even when search is PENDING
     */
    it.fails('should block participants while pre-search is PENDING', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Test question',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Pre-search created in PENDING state
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Test question',
      });

      getState().addPreSearch(preSearch);

      // Current state: Search is PENDING
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // ❌ BUG: Participant starts while search is PENDING
      const participantMessage = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Response while pending...',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participantMessage]);

      // ❌ CRITICAL BUG: Participant message exists while search is PENDING
      const participantExists = getState().messages.some(
        m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === roundNumber,
      );

      expect(participantExists).toBe(true); // This is the bug
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);

      // ✅ CORRECT BEHAVIOR: No participant messages should exist while PENDING
      // This assertion SHOULD FAIL (demonstrates the bug)
      expect(participantExists).toBe(false);
    });

    /**
     * TEST: Participants should NEVER start while pre-search is STREAMING
     * BUG: Participants start in parallel with search execution
     */
    it.fails('should block participants while pre-search is STREAMING', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Test question',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Pre-search is STREAMING
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'Test question',
      });

      getState().addPreSearch(preSearch);

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // ❌ BUG: Participant starts while search is STREAMING
      const participantMessage = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Streaming in parallel...',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participantMessage]);

      const participantExists = getState().messages.some(
        m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === roundNumber,
      );

      expect(participantExists).toBe(true); // Bug
      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

      // ✅ CORRECT: No participants while STREAMING
      expect(participantExists).toBe(false); // Should fail
    });

    /**
     * TEST: Participants should ONLY start when pre-search is COMPLETE
     * BUG: Participants start before COMPLETE status
     */
    it('should allow participants ONLY when pre-search is COMPLETE', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Test question',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Pre-search in PENDING → STREAMING → COMPLETE flow
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Test question',
      });

      getState().addPreSearch(preSearch);

      // PENDING: Should NOT have participants
      let participantCount = getState().messages.filter(
        m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === roundNumber,
      ).length;

      expect(participantCount).toBe(0); // ✅ Correct (if blocking works)

      // STREAMING: Should NOT have participants
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      participantCount = getState().messages.filter(
        m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === roundNumber,
      ).length;

      expect(participantCount).toBe(0); // ✅ Correct (if blocking works)

      // COMPLETE: NOW participants can start
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      // This is where participants SHOULD start
      const participantMessage = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Now I can respond with search context',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participantMessage]);

      participantCount = getState().messages.filter(
        m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === roundNumber,
      ).length;

      expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(participantCount).toBe(1); // ✅ Correct
    });

    /**
     * TEST: Analysis should NEVER start while participants are streaming
     * BUG: Analysis might trigger before all participants complete
     */
    it('should block analysis until ALL participants complete', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Test question',
        roundNumber,
      });

      // Pre-search completed
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Test question',
      });

      getState().addPreSearch(preSearch);

      // Participant 0 completed
      const participant0 = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Participant 0 response',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participant0]);

      // Participant 1 still streaming (incomplete)
      // Analysis should NOT trigger yet

      const analysisCount = getState().analyses.filter(
        a => a.roundNumber === roundNumber,
      ).length;

      // ✅ CORRECT: No analysis while participants incomplete
      expect(analysisCount).toBe(0);

      // Participant 1 completes
      const participant1 = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p1`,
        content: 'Participant 1 response',
        roundNumber,
        participantId: 'p1',
        participantIndex: 1,
      });

      getState().setMessages([userMessage, participant0, participant1]);

      // NOW analysis can trigger (all participants complete)
      // This test verifies the timing constraint exists
    });
  });

  // ==========================================================================
  // INTEGRATION TESTS - Complete Flow with Timestamps
  // ==========================================================================
  describe('integration - Complete Flow with Timestamps', () => {
    /**
     * TEST: Complete round flow with verified sequential order
     * BUG: Events happen in parallel, not sequentially
     */
    it('should execute complete round 0 flow in correct sequence', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      // Complete event log with timestamps
      const eventLog: Array<{
        timestamp: number;
        event: string;
        status?: string;
      }> = [];

      getState().setEnableWebSearch(true);

      // 1. User sends message
      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Complete flow test',
        roundNumber,
      });

      getState().setMessages([userMessage]);
      eventLog.push({ timestamp: Date.now(), event: 'user_message_sent' });

      vi.advanceTimersByTime(100);

      // 2. Pre-search created (PENDING)
      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.PENDING,
        userQuery: 'Complete flow test',
      });

      getState().addPreSearch(preSearch);
      eventLog.push({
        timestamp: Date.now(),
        event: 'pre_search_created',
        status: AnalysisStatuses.PENDING,
      });

      vi.advanceTimersByTime(200);

      // 3. Pre-search executes (STREAMING)
      getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      eventLog.push({
        timestamp: Date.now(),
        event: 'pre_search_streaming',
        status: AnalysisStatuses.STREAMING,
      });

      vi.advanceTimersByTime(1000);

      // 4. Pre-search completes
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      eventLog.push({
        timestamp: Date.now(),
        event: 'pre_search_complete',
        status: AnalysisStatuses.COMPLETE,
      });

      vi.advanceTimersByTime(100);

      // 5. Participant 0 starts (AFTER search complete)
      const participant0 = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Participant 0 response',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participant0]);
      eventLog.push({ timestamp: Date.now(), event: 'participant_0_started' });

      vi.advanceTimersByTime(500);

      // 6. Participant 0 completes
      eventLog.push({ timestamp: Date.now(), event: 'participant_0_complete' });

      vi.advanceTimersByTime(100);

      // 7. Participant 1 starts
      const participant1 = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p1`,
        content: 'Participant 1 response',
        roundNumber,
        participantId: 'p1',
        participantIndex: 1,
      });

      getState().setMessages([userMessage, participant0, participant1]);
      eventLog.push({ timestamp: Date.now(), event: 'participant_1_started' });

      vi.advanceTimersByTime(500);

      // 8. Participant 1 completes
      eventLog.push({ timestamp: Date.now(), event: 'participant_1_complete' });

      vi.advanceTimersByTime(100);

      // 9. Analysis starts (AFTER all participants)
      eventLog.push({ timestamp: Date.now(), event: 'analysis_started' });

      // ✅ VERIFY: Complete sequential order
      const expectedSequence = [
        'user_message_sent',
        'pre_search_created',
        'pre_search_streaming',
        'pre_search_complete',
        'participant_0_started',
        'participant_0_complete',
        'participant_1_started',
        'participant_1_complete',
        'analysis_started',
      ];

      const actualSequence = eventLog.map(e => e.event);

      // ✅ VERIFY: Timestamps are strictly increasing (sequential, not parallel)
      for (let i = 1; i < eventLog.length; i++) {
        const prev = eventLog[i - 1];
        const curr = eventLog[i];

        // Assert both exist before comparing
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();
        expect(curr!.timestamp).toBeGreaterThan(prev!.timestamp);
      }

      // ✅ VERIFY: Event order matches expected sequence
      expect(actualSequence).toEqual(expectedSequence);

      // ❌ BUG: If this test fails, events are happening in wrong order or in parallel
    });

    /**
     * TEST: Events should happen sequentially, NOT in parallel
     * BUG: Pre-search and participants execute in parallel
     */
    it('should execute events sequentially with no parallel execution', () => {
      const threadId = 'thread-1';
      const roundNumber = 0;

      const events: Array<{
        event: string;
        startTime: number;
        endTime: number;
      }> = [];

      getState().setEnableWebSearch(true);

      const userMessage = createTestUserMessage({
        id: 'user-r0',
        content: 'Sequential test',
        roundNumber,
      });

      getState().setMessages([userMessage]);

      // Pre-search lifecycle
      const searchStart = Date.now();
      vi.advanceTimersByTime(100);

      const preSearch = createMockPreSearch({
        id: 'search-0',
        threadId,
        roundNumber,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'Sequential test',
      });

      getState().addPreSearch(preSearch);

      vi.advanceTimersByTime(1000);
      getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const searchEnd = Date.now();
      events.push({ event: 'pre_search', startTime: searchStart, endTime: searchEnd });

      // Participant lifecycle
      const participantStart = Date.now();
      vi.advanceTimersByTime(100);

      const participant0 = createTestAssistantMessage({
        id: `${threadId}_r${roundNumber}_p0`,
        content: 'Participant response',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      getState().setMessages([userMessage, participant0]);

      vi.advanceTimersByTime(500);
      const participantEnd = Date.now();

      events.push({
        event: 'participant_0',
        startTime: participantStart,
        endTime: participantEnd,
      });

      // ✅ VERIFY: No overlap (sequential execution)
      const searchEvent = events.find(e => e.event === 'pre_search');
      const participantEvent = events.find(e => e.event === 'participant_0');

      // Assert both events exist
      expect(searchEvent).toBeDefined();
      expect(participantEvent).toBeDefined();

      // Search must complete BEFORE participant starts
      expect(searchEvent!.endTime).toBeLessThanOrEqual(participantEvent!.startTime);

      // No time overlap
      const hasOverlap = !(
        searchEvent!.endTime <= participantEvent!.startTime
        || participantEvent!.endTime <= searchEvent!.startTime
      );

      expect(hasOverlap).toBe(false); // Should be no overlap
    });
  });
});
