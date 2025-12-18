/**
 * Submit Blocking States Tests
 *
 * Tests for the submit button blocking logic across different chat states.
 * Ensures the submit button is properly disabled during:
 * - Stream resumptions
 * - Active streaming
 * - Thread creation
 * - API submissions (mutations pending)
 * - Pre-search phases
 * - Summarizer phases
 *
 * Key Validations:
 * - Submit button disabled during all blocking states
 * - Input remains enabled for typing during streaming
 * - Loading spinner shown during API submission
 * - All edge cases properly handled
 */

import { describe, expect, it } from 'vitest';

import { createChatStore } from '../store';

// ============================================================================
// HELPER: Calculate isInputBlocked (mirrors ChatView logic)
// ============================================================================

type BlockingCheckState = {
  isStreaming: boolean;
  isCreatingThread: boolean;
  waitingToStartStreaming: boolean;
  isCreatingSummary: boolean;
  pendingMessage: string | null;
  currentResumptionPhase: 'idle' | 'pre_search' | 'participants' | 'summarizer' | 'complete' | null;
  preSearchResumption: { status: 'pending' | 'streaming' | 'complete' | 'failed' | null } | null;
  summarizerResumption: { status: 'pending' | 'streaming' | 'complete' | 'failed' | null } | null;
  isSubmitting?: boolean;
};

function calculateIsInputBlocked(state: BlockingCheckState): boolean {
  // ✅ Only check actual resumption status states, not the phase
  // Phase can be stale after round completes - only status is reliable
  const isResumptionActive = (
    state.preSearchResumption?.status === 'streaming'
    || state.preSearchResumption?.status === 'pending'
    || state.summarizerResumption?.status === 'streaming'
    || state.summarizerResumption?.status === 'pending'
  );

  return (
    state.isStreaming
    || state.isCreatingThread
    || state.waitingToStartStreaming
    || state.isCreatingSummary
    || Boolean(state.pendingMessage)
    || isResumptionActive
    || Boolean(state.isSubmitting)
  );
}

// ============================================================================
// STREAMING STATE BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Streaming States', () => {
  it('blocks submit when isStreaming is true', () => {
    const store = createChatStore();
    store.getState().setIsStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingSummary: state.isCreatingSummary,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      summarizerResumption: state.summarizerResumption,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when waitingToStartStreaming is true', () => {
    const store = createChatStore();
    store.getState().setWaitingToStartStreaming(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingSummary: state.isCreatingSummary,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      summarizerResumption: state.summarizerResumption,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when isCreatingSummary is true', () => {
    const store = createChatStore();
    store.getState().setIsCreatingSummary(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingSummary: state.isCreatingSummary,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      summarizerResumption: state.summarizerResumption,
    });

    expect(isBlocked).toBe(true);
  });
});

// ============================================================================
// THREAD CREATION BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Thread Creation', () => {
  it('blocks submit when isCreatingThread is true', () => {
    const store = createChatStore();
    store.getState().setIsCreatingThread(true);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingSummary: state.isCreatingSummary,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      summarizerResumption: state.summarizerResumption,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when pendingMessage exists', () => {
    const store = createChatStore();
    store.getState().prepareForNewMessage('Test message', ['model-1']);

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingSummary: state.isCreatingSummary,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      summarizerResumption: state.summarizerResumption,
    });

    expect(state.pendingMessage).toBe('Test message');
    expect(isBlocked).toBe(true);
  });
});

// ============================================================================
// RESUMPTION PHASE BLOCKING TESTS
// ============================================================================

describe('submit Blocking - Stream Resumption Status', () => {
  it('blocks submit when preSearchResumption status is streaming', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: { status: 'streaming' },
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when preSearchResumption status is pending', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: { status: 'pending' },
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when summarizerResumption status is streaming', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: { status: 'streaming' },
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks submit when summarizerResumption status is pending', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: { status: 'pending' },
    });

    expect(isBlocked).toBe(true);
  });

  it('does NOT block when only phase is set but status is null (stale phase)', () => {
    // This is the bug fix - phase can be stale after round completes
    // Only actual status should block, not stale phase
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'participants', // Stale phase
      preSearchResumption: null, // No active resumption
      summarizerResumption: null, // No active resumption
    });

    expect(isBlocked).toBe(false); // Should NOT block with stale phase
  });

  it('does NOT block when phase is pre_search but preSearchResumption is null', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'pre_search', // Stale phase
      preSearchResumption: null, // No active resumption
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does NOT block when phase is summarizer but summarizerResumption is null', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'summarizer', // Stale phase
      preSearchResumption: null,
      summarizerResumption: null, // No active resumption
    });

    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// API SUBMISSION (isSubmitting) BLOCKING TESTS
// ============================================================================

describe('submit Blocking - API Submission State', () => {
  it('blocks submit when isSubmitting is true', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: null,
      isSubmitting: true,
    });

    expect(isBlocked).toBe(true);
  });

  it('does not block when isSubmitting is false and no other blocking states', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: null,
      isSubmitting: false,
    });

    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// NON-BLOCKING STATES TESTS
// ============================================================================

describe('submit Blocking - Non-Blocking States', () => {
  it('does not block when all states are idle/false', () => {
    const store = createChatStore();

    const state = store.getState();
    const isBlocked = calculateIsInputBlocked({
      isStreaming: state.isStreaming,
      isCreatingThread: state.isCreatingThread,
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingSummary: state.isCreatingSummary,
      pendingMessage: state.pendingMessage,
      currentResumptionPhase: state.currentResumptionPhase,
      preSearchResumption: state.preSearchResumption,
      summarizerResumption: state.summarizerResumption,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when resumption phase is idle', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'idle',
      preSearchResumption: null,
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when resumption phase is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'complete',
      preSearchResumption: null,
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when preSearchResumption status is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: { status: 'complete' },
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(false);
  });

  it('does not block when summarizerResumption status is complete', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: { status: 'complete' },
    });

    expect(isBlocked).toBe(false);
  });
});

// ============================================================================
// COMBINED STATES TESTS
// ============================================================================

describe('submit Blocking - Combined States', () => {
  it('blocks when multiple blocking states are true', () => {
    const isBlocked = calculateIsInputBlocked({
      isStreaming: true,
      isCreatingThread: true,
      waitingToStartStreaming: true,
      isCreatingSummary: true,
      pendingMessage: 'test',
      currentResumptionPhase: 'participants',
      preSearchResumption: { status: 'streaming' },
      summarizerResumption: { status: 'pending' },
      isSubmitting: true,
    });

    expect(isBlocked).toBe(true);
  });

  it('blocks even if only one state is blocking', () => {
    // Test each blocking state individually
    // Note: currentResumptionPhase alone does NOT block (can be stale)
    // Only actual status states block
    const blockingStates = [
      { isStreaming: true },
      { isCreatingThread: true },
      { waitingToStartStreaming: true },
      { isCreatingSummary: true },
      { pendingMessage: 'test' },
      { preSearchResumption: { status: 'streaming' as const } },
      { preSearchResumption: { status: 'pending' as const } },
      { summarizerResumption: { status: 'streaming' as const } },
      { summarizerResumption: { status: 'pending' as const } },
      { isSubmitting: true },
    ];

    const baseState: BlockingCheckState = {
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: null,
      isSubmitting: false,
    };

    for (const blockingState of blockingStates) {
      const isBlocked = calculateIsInputBlocked({ ...baseState, ...blockingState });
      expect(isBlocked).toBe(true);
    }
  });
});

// ============================================================================
// REAL SCENARIO TESTS
// ============================================================================

describe('submit Blocking - Real Scenarios', () => {
  it('scenario: user refreshes during pre-search streaming', () => {
    // User submitted message with web search enabled
    // Page refreshed during pre-search streaming
    // Pre-search resumption with streaming status should block submit

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false, // Not streaming yet (pre-search phase)
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'pre_search',
      preSearchResumption: { status: 'streaming' }, // Active resumption
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: user refreshes during participant streaming - isStreaming blocks', () => {
    // User submitted message
    // Page refreshed during participant streaming
    // isStreaming flag should block submit (participant streaming sets isStreaming)

    const isBlocked = calculateIsInputBlocked({
      isStreaming: true, // Participant streaming sets this
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'participants',
      preSearchResumption: null,
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: round complete with stale phase - should NOT block', () => {
    // Round completed normally
    // Phase is stale (still 'participants') but no active resumption
    // Should NOT block - user should be able to send next message

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'participants', // Stale - not reset after round
      preSearchResumption: null, // No active resumption
      summarizerResumption: null, // No active resumption
    });

    expect(isBlocked).toBe(false); // Bug fix: stale phase should not block
  });

  it('scenario: user clicks submit and API call is in progress', () => {
    // User clicked submit button
    // API call (createThread or updateThread) is in progress
    // isSubmitting should block submit immediately

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false, // Not set yet - mutation just started
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: null,
      isSubmitting: true, // From mutation.isPending
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: normal streaming in progress', () => {
    // Normal streaming scenario - AI is responding

    const isBlocked = calculateIsInputBlocked({
      isStreaming: true,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: summary generation in progress', () => {
    // All participants finished, summary is being generated

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: true,
      pendingMessage: null,
      currentResumptionPhase: null,
      preSearchResumption: null,
      summarizerResumption: null,
    });

    expect(isBlocked).toBe(true);
  });

  it('scenario: ready for new message after round completes', () => {
    // Round completed - all states should be reset

    const isBlocked = calculateIsInputBlocked({
      isStreaming: false,
      isCreatingThread: false,
      waitingToStartStreaming: false,
      isCreatingSummary: false,
      pendingMessage: null,
      currentResumptionPhase: 'complete',
      preSearchResumption: { status: 'complete' },
      summarizerResumption: { status: 'complete' },
      isSubmitting: false,
    });

    expect(isBlocked).toBe(false);
  });
});
