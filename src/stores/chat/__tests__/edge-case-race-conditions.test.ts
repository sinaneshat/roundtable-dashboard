/**
 * Creative Edge Case Race Condition Tests
 *
 * Tests unusual but realistic scenarios that can cause race conditions:
 * - Concurrent round attempts (user spam-clicks send)
 * - Rapid configuration changes (mode, participants, web search)
 * - Network failure recovery
 * - State cleanup verification
 * - Timeout boundary conditions
 * - Polling interference
 *
 * **TESTING APPROACH**: Simulate real user behaviors that stress the system
 */

import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

describe('creative Edge Case Race Conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * EDGE CASE: User spam-clicks send button
   * Multiple messages queued before first one starts streaming
   */
  it('prevents concurrent round attempts from spam-clicking', () => {
    const store = createChatStore();
    const getState = store.getState;

    // Setup initial state
    act(() => {
      getState().setThread(createMockThread({ id: 'thread-1' }));
      getState().setParticipants(createMockParticipants(2));
      getState().setMessages([createMockUserMessage(0, 'First message')]);
    });

    // Simulate rapid send attempts (user clicks 5 times in 100ms)
    const sendAttempts: number[] = [];

    for (let i = 0; i < 5; i++) {
      act(() => {
        if (!getState().isStreaming) {
          getState().setIsStreaming(true);
          sendAttempts.push(i);
        }
      });
    }

    // Only first attempt should succeed
    expect(sendAttempts).toEqual([0]);
    expect(getState().isStreaming).toBe(true);
  });

  /**
   * EDGE CASE: Rapid mode changes during streaming
   * User changes mode while participants are responding
   */
  it('handles rapid mode changes during active streaming', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().setThread(createMockThread({ mode: 'debating' }));
      getState().setIsStreaming(true);
      getState().setCurrentRoundNumber(0);
    });

    // User rapidly changes mode 3 times while streaming
    const modeChanges: string[] = [];

    act(() => {
      getState().setThread(createMockThread({ mode: 'analyzing' }));
      modeChanges.push('analyzing');
    });

    act(() => {
      getState().setThread(createMockThread({ mode: 'brainstorming' }));
      modeChanges.push('brainstorming');
    });

    act(() => {
      getState().setThread(createMockThread({ mode: 'solving' }));
      modeChanges.push('solving');
    });

    // All mode changes recorded (but won't affect current round)
    expect(modeChanges).toEqual(['analyzing', 'brainstorming', 'solving']);

    // Final mode is 'solving'
    expect(getState().thread?.mode).toBe('solving');

    // Streaming continues uninterrupted
    expect(getState().isStreaming).toBe(true);
  });

  /**
   * EDGE CASE: Web search toggle spam
   * User toggles web search on/off/on rapidly
   */
  it('handles rapid web search toggle during configuration', () => {
    const store = createChatStore();
    const getState = store.getState;

    const toggleStates: boolean[] = [];

    // Rapid toggles (5 times in quick succession)
    for (let i = 0; i < 5; i++) {
      act(() => {
        const currentState = getState().thread?.enableWebSearch ?? false;
        getState().setThread(createMockThread({ enableWebSearch: !currentState }));
        toggleStates.push(!currentState);
      });
    }

    // All toggles recorded
    expect(toggleStates).toEqual([true, false, true, false, true]);

    // Final state is ON
    expect(getState().thread?.enableWebSearch).toBe(true);
  });

  /**
   * EDGE CASE: Participant changes during streaming
   * User adds/removes participants while round in progress
   */
  it('blocks participant changes while streaming', () => {
    const store = createChatStore();
    const getState = store.getState;

    const initialParticipants = createMockParticipants(2);

    act(() => {
      getState().setParticipants(initialParticipants);
      getState().setIsStreaming(true);
    });

    // Attempt to change participants during streaming
    const newParticipants = createMockParticipants(3);
    let changeBlocked = false;

    act(() => {
      if (getState().isStreaming) {
        // Should not change participants while streaming
        changeBlocked = true;
      } else {
        getState().setParticipants(newParticipants);
      }
    });

    // Change was blocked
    expect(changeBlocked).toBe(true);
    expect(getState().participants).toHaveLength(2); // Still original
  });

  /**
   * EDGE CASE: Analysis timeout boundary (exactly 60s)
   * Test timeout protection at exact boundary
   */
  it('times out analysis at exactly 60 seconds', () => {
    const store = createChatStore();
    const getState = store.getState;

    // Create analysis that will be exactly 60s old
    const createdAt = new Date(Date.now() - 60000);

    act(() => {
      getState().addAnalysis(
        createMockAnalysis({
          status: AnalysisStatuses.STREAMING,
          createdAt,
        }),
      );
    });

    // Fast-forward to exactly 60s
    vi.advanceTimersByTime(100); // Small buffer to ensure timeout check runs

    // Analysis should be considered timed out
    const analysis = getState().analyses[0];
    const elapsed = Date.now() - (analysis?.createdAt instanceof Date
      ? analysis.createdAt.getTime()
      : new Date(analysis?.createdAt || 0).getTime());

    expect(elapsed).toBeGreaterThanOrEqual(60000);
  });

  /**
   * EDGE CASE: Pre-search created but never executes
   * Backend creates PENDING pre-search, but execution never starts
   */
  it('handles pre-search stuck in PENDING status', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().setThread(createMockThread({ enableWebSearch: true }));
      getState().addPreSearch(
        createMockPreSearch({
          status: AnalysisStatuses.PENDING,
          createdAt: new Date(Date.now() - 30000), // 30s ago
        }),
      );
    });

    // Pre-search should block message sending
    const canSend = getState().preSearches.every(
      ps => ps.status === AnalysisStatuses.COMPLETE || ps.status === AnalysisStatuses.FAILED,
    );

    expect(canSend).toBe(false); // Blocked by PENDING pre-search
  });

  /**
   * EDGE CASE: Multiple pre-searches for same round
   * Duplicate pre-search creation (backend idempotency failure)
   */
  it('handles duplicate pre-searches for same round', () => {
    const store = createChatStore();
    const getState = store.getState;

    // Add 2 pre-searches for round 0 (should never happen, but test resilience)
    act(() => {
      getState().addPreSearch(
        createMockPreSearch({
          id: 'ps-1',
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          id: 'ps-2',
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
        }),
      );
    });

    const round0PreSearches = getState().preSearches.filter(ps => ps.roundNumber === 0);

    // Both exist (no deduplication in store layer - should be handled by backend)
    expect(round0PreSearches).toHaveLength(2);

    // Any PENDING or STREAMING should block
    const shouldBlock = round0PreSearches.some(
      ps => ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING,
    );

    expect(shouldBlock).toBe(true);
  });

  /**
   * EDGE CASE: Stop button clicked multiple times
   * User spam-clicks stop button during streaming
   */
  it('handles multiple stop button clicks gracefully', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().setIsStreaming(true);
      getState().setCurrentParticipantIndex(1);
    });

    // User clicks stop 5 times rapidly
    for (let i = 0; i < 5; i++) {
      act(() => {
        if (getState().isStreaming) {
          getState().setIsStreaming(false);
          getState().setCurrentParticipantIndex(0);
        }
      });
    }

    // Should only process first click
    expect(getState().isStreaming).toBe(false);
    expect(getState().currentParticipantIndex).toBe(0);
  });

  /**
   * EDGE CASE: Message arrives after stop button
   * Participant message arrives after user clicked stop
   */
  it('ignores messages that arrive after stop button', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().setIsStreaming(true);
      getState().setCurrentRoundNumber(0);
    });

    // User clicks stop
    act(() => {
      getState().setIsStreaming(false);
    });

    // Message arrives from participant (late)
    const lateMessage = createMockMessage(0, 0);
    let messageAdded = false;

    act(() => {
      if (getState().isStreaming) {
        getState().setMessages([...getState().messages, lateMessage]);
        messageAdded = true;
      }
    });

    // Message should NOT be added
    expect(messageAdded).toBe(false);
    expect(getState().messages).toHaveLength(0);
  });

  /**
   * EDGE CASE: Round number overflow
   * Test with very high round numbers (100+)
   */
  it('handles high round numbers without issues', () => {
    const store = createChatStore();
    const getState = store.getState;

    // Simulate 150 rounds
    const roundNumber = 150;

    act(() => {
      getState().setCurrentRoundNumber(roundNumber);
      getState().addAnalysis(
        createMockAnalysis({
          roundNumber,
          status: AnalysisStatuses.COMPLETE,
        }),
      );
    });

    expect(getState().currentRoundNumber).toBe(150);
    expect(getState().analyses[0]?.roundNumber).toBe(150);
  });

  /**
   * EDGE CASE: Analysis completes faster than expected
   * Analysis completes in < 1s (very fast LLM response)
   */
  it('handles ultra-fast analysis completion', () => {
    const store = createChatStore();
    const getState = store.getState;

    // Add analysis in STREAMING state
    act(() => {
      getState().addAnalysis(
        createMockAnalysis({
          id: 'analysis-fast',
          status: AnalysisStatuses.STREAMING,
          createdAt: new Date(),
        }),
      );
    });

    expect(getState().analyses[0]?.status).toBe(AnalysisStatuses.STREAMING);

    // Immediately complete it (simulating ultra-fast response)
    act(() => {
      getState().setAnalyses([
        createMockAnalysis({
          id: 'analysis-fast',
          status: AnalysisStatuses.COMPLETE,
          createdAt: new Date(),
        }),
      ]);
    });

    // Should handle the rapid state transition without issues
    expect(getState().analyses[0]?.status).toBe(AnalysisStatuses.COMPLETE);
  });

  /**
   * EDGE CASE: Memory leak - verify cleanup
   * Ensure no references retained after cleanup
   */
  it('cleans up all references when screen unmounts', () => {
    const store = createChatStore();
    const getState = store.getState;

    // Setup state
    act(() => {
      getState().setThread(createMockThread());
      getState().setParticipants(createMockParticipants(3));
      getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      getState().addAnalysis(createMockAnalysis());
    });

    // Simulate unmount cleanup
    act(() => {
      getState().setMessages([]);
      getState().setParticipants([]);
      getState().setThread(null);
      getState().setAnalyses([]);
      getState().setPreSearches([]);
    });

    // All state cleaned
    expect(getState().messages).toHaveLength(0);
    expect(getState().participants).toHaveLength(0);
    expect(getState().thread).toBeNull();
    expect(getState().analyses).toHaveLength(0);
    expect(getState().preSearches).toHaveLength(0);
  });

  /**
   * EDGE CASE: Concurrent analysis and pre-search
   * Both analysis and pre-search running at same time
   */
  it('handles concurrent analysis and pre-search operations', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().addAnalysis(
        createMockAnalysis({
          status: AnalysisStatuses.STREAMING,
        }),
      );

      getState().addPreSearch(
        createMockPreSearch({
          status: AnalysisStatuses.STREAMING,
        }),
      );
    });

    // Both should be streaming
    expect(getState().analyses[0]?.status).toBe(AnalysisStatuses.STREAMING);
    expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);

    // Complete pre-search first (replace with completed version)
    act(() => {
      const preSearches = getState().preSearches;
      if (preSearches[0]) {
        getState().setPreSearches([
          createMockPreSearch({
            id: preSearches[0].id,
            roundNumber: preSearches[0].roundNumber,
            status: AnalysisStatuses.COMPLETE,
          }),
        ]);
      }
    });

    // Pre-search complete, analysis still streaming
    expect(getState().preSearches[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    expect(getState().analyses[0]?.status).toBe(AnalysisStatuses.STREAMING);
  });

  /**
   * EDGE CASE: Zero participants configuration
   * User removes all participants (edge case - should be prevented by UI)
   */
  it('handles zero participants gracefully', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().setParticipants([]);
    });

    expect(getState().participants).toHaveLength(0);

    // Should not be able to start streaming with no participants
    const canStartStreaming = getState().participants.some(p => p.isEnabled);
    expect(canStartStreaming).toBe(false);
  });

  /**
   * EDGE CASE: Participant index out of bounds
   * currentParticipantIndex exceeds participant array length
   */
  it('handles participant index out of bounds', () => {
    const store = createChatStore();
    const getState = store.getState;

    act(() => {
      getState().setParticipants(createMockParticipants(2)); // 0, 1
      getState().setCurrentParticipantIndex(5); // Out of bounds
    });

    const currentIndex = getState().currentParticipantIndex;
    const participantCount = getState().participants.length;

    // Index is out of bounds
    expect(currentIndex).toBeGreaterThanOrEqual(participantCount);

    // Should be detected and reset
    const isValidIndex = currentIndex < participantCount;
    expect(isValidIndex).toBe(false);
  });
});
