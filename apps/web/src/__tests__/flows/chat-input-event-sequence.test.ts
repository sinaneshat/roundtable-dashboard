/**
 * Chat Input Event Sequence Tests
 *
 * Tests the EXACT sequence of events when user submits a message,
 * verifying that the sequence is IDENTICAL between initial and follow-up rounds.
 *
 * Event Sequence (documented in FLOW_DOCUMENTATION.md):
 * 1. User clicks submit OR presses Enter
 * 2. Input clears immediately (form logic)
 * 3. Submit button shows loading spinner (waitingToStartStreaming = true)
 * 4. Input textarea is disabled
 * 5. Thread creation API call (Round 1) OR thread update (Round 2+)
 * 6. Pre-search execution (if web search enabled)
 * 7. First participant starts streaming → spinner stops, button disabled
 * 8. Subsequent participants stream sequentially
 * 9. Moderator streams
 * 10. Round completes → input re-enables
 *
 * Test Coverage:
 * - State transitions at each step
 * - Flag synchronization timing
 * - Input/button state at each checkpoint
 * - Identical behavior verification across rounds
 */

import { MessageStatuses, RoundPhases } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createChatStore } from '@/stores/chat';

// ============================================================================
// EVENT SEQUENCE HELPERS
// ============================================================================

type EventCheckpoint = {
  name: string;
  isInputBlocked: boolean;
  showLoadingSpinner: boolean;
  flags: {
    waitingToStartStreaming: boolean;
    isCreatingThread: boolean;
    isStreaming: boolean;
    isModeratorStreaming: boolean;
    streamingRoundNumber: number | null;
  };
};

function captureCheckpoint(
  store: ReturnType<typeof createChatStore>,
  name: string,
): EventCheckpoint {
  const state = store.getState();

  const isInputBlocked = (
    state.isStreaming
    || state.isCreatingThread
    || state.waitingToStartStreaming
    || Boolean(state.showLoader)
    || state.isModeratorStreaming
    || Boolean(state.pendingMessage)
    || Boolean(state.isModelsLoading)
    || (state.preSearchResumption?.status === MessageStatuses.STREAMING || state.preSearchResumption?.status === MessageStatuses.PENDING)
    || (state.moderatorResumption?.status === MessageStatuses.STREAMING || state.moderatorResumption?.status === MessageStatuses.PENDING)
    || (state.streamingRoundNumber !== null && state.streamingRoundNumber !== undefined)
  );

  const showLoadingSpinner = state.waitingToStartStreaming;

  return {
    name,
    isInputBlocked,
    showLoadingSpinner,
    flags: {
      waitingToStartStreaming: state.waitingToStartStreaming,
      isCreatingThread: state.isCreatingThread,
      isStreaming: state.isStreaming,
      isModeratorStreaming: state.isModeratorStreaming,
      streamingRoundNumber: state.streamingRoundNumber,
    },
  };
}

function simulateRoundSequence(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  options: { webSearchEnabled?: boolean } = {},
): EventCheckpoint[] {
  const checkpoints: EventCheckpoint[] = [];

  // Step 1: User clicks submit
  store.getState().setWaitingToStartStreaming(true);
  checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Submit clicked`));

  // Step 2: Thread creation/update starts (Round 1 only)
  if (roundNumber === 1) {
    store.getState().setIsCreatingThread(true);
    checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Thread creation started`));

    store.getState().setIsCreatingThread(false);
    checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Thread creation complete`));
  }

  // Step 3: Pre-search (if enabled)
  if (options.webSearchEnabled) {
    store.getState().setStreamingRoundNumber(roundNumber);
    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.STREAMING,
        streamId: `presearch_${roundNumber}`,
        preSearchId: `presearch_${roundNumber}`,
      },
    });
    checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Pre-search streaming`));

    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.COMPLETE,
        streamId: `presearch_${roundNumber}`,
        preSearchId: `presearch_${roundNumber}`,
      },
    });
    checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Pre-search complete`));
  }

  // Step 4: First participant starts streaming
  store.getState().setIsStreaming(true);
  store.getState().setStreamingRoundNumber(roundNumber);
  store.getState().setWaitingToStartStreaming(false); // Spinner stops here
  checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: First participant streaming`));

  // Step 5: Participants complete
  store.getState().setIsStreaming(false);
  checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Participants complete`));

  // Step 6: Moderator starts
  store.getState().setIsModeratorStreaming(true);
  checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Moderator streaming`));

  // Step 7: Round completes
  store.getState().setIsModeratorStreaming(false);
  store.getState().setStreamingRoundNumber(null);
  checkpoints.push(captureCheckpoint(store, `Round ${roundNumber}: Round complete`));

  return checkpoints;
}

// ============================================================================
// INITIAL ROUND (Round 1) EVENT SEQUENCE
// ============================================================================

describe('chat Input Event Sequence - Initial Round (Round 1)', () => {
  it('should follow documented event sequence without web search', () => {
    const store = createChatStore();
    const checkpoints = simulateRoundSequence(store, 1, { webSearchEnabled: false });

    // Verify key checkpoints
    const submitClick = checkpoints.find(c => c.name.includes('Submit clicked'));
    expect(submitClick?.isInputBlocked).toBe(true);
    expect(submitClick?.showLoadingSpinner).toBe(true);

    const threadCreation = checkpoints.find(c => c.name.includes('Thread creation started'));
    expect(threadCreation?.isInputBlocked).toBe(true);

    const firstParticipant = checkpoints.find(c => c.name.includes('First participant streaming'));
    expect(firstParticipant?.isInputBlocked).toBe(true);
    expect(firstParticipant?.showLoadingSpinner).toBe(false); // Spinner stops

    const participantsComplete = checkpoints.find(c => c.name.includes('Participants complete'));
    expect(participantsComplete?.isInputBlocked).toBe(true); // Still blocked by streamingRoundNumber

    const moderatorStreaming = checkpoints.find(c => c.name.includes('Moderator streaming'));
    expect(moderatorStreaming?.isInputBlocked).toBe(true);

    const roundComplete = checkpoints.find(c => c.name.includes('Round complete'));
    expect(roundComplete?.isInputBlocked).toBe(false); // Re-enabled
  });

  it('should follow documented event sequence WITH web search', () => {
    const store = createChatStore();
    const checkpoints = simulateRoundSequence(store, 1, { webSearchEnabled: true });

    const preSearchStreaming = checkpoints.find(c => c.name.includes('Pre-search streaming'));
    expect(preSearchStreaming?.isInputBlocked).toBe(true);

    const preSearchComplete = checkpoints.find(c => c.name.includes('Pre-search complete'));
    expect(preSearchComplete?.isInputBlocked).toBe(true); // Still blocked by streamingRoundNumber

    const firstParticipant = checkpoints.find(c => c.name.includes('First participant streaming'));
    expect(firstParticipant?.isInputBlocked).toBe(true);
    expect(firstParticipant?.showLoadingSpinner).toBe(false);

    const roundComplete = checkpoints.find(c => c.name.includes('Round complete'));
    expect(roundComplete?.isInputBlocked).toBe(false);
  });

  it('should transition flags in correct order', () => {
    const store = createChatStore();
    const checkpoints = simulateRoundSequence(store, 1, { webSearchEnabled: false });

    // Submit → waitingToStartStreaming=true
    expect(checkpoints[0]?.flags.waitingToStartStreaming).toBe(true);

    // Thread creation → isCreatingThread=true
    expect(checkpoints[1]?.flags.isCreatingThread).toBe(true);

    // First participant → isStreaming=true, waitingToStartStreaming=false
    const firstParticipantIdx = checkpoints.findIndex(c => c.name.includes('First participant'));
    expect(checkpoints[firstParticipantIdx]?.flags.isStreaming).toBe(true);
    expect(checkpoints[firstParticipantIdx]?.flags.waitingToStartStreaming).toBe(false);

    // Moderator → isModeratorStreaming=true
    const moderatorIdx = checkpoints.findIndex(c => c.name.includes('Moderator streaming'));
    expect(checkpoints[moderatorIdx]?.flags.isModeratorStreaming).toBe(true);

    // Complete → all flags cleared
    const completeIdx = checkpoints.findIndex(c => c.name.includes('Round complete'));
    expect(checkpoints[completeIdx]?.flags.isStreaming).toBe(false);
    expect(checkpoints[completeIdx]?.flags.isModeratorStreaming).toBe(false);
    expect(checkpoints[completeIdx]?.flags.streamingRoundNumber).toBe(null);
  });
});

// ============================================================================
// FOLLOW-UP ROUND (Round 2+) EVENT SEQUENCE
// ============================================================================

describe('chat Input Event Sequence - Follow-up Round (Round 2+)', () => {
  it('should follow IDENTICAL event sequence to Round 1 without web search', () => {
    const round1Store = createChatStore();
    const round2Store = createChatStore();

    const round1Checkpoints = simulateRoundSequence(round1Store, 1, { webSearchEnabled: false });
    const round2Checkpoints = simulateRoundSequence(round2Store, 2, { webSearchEnabled: false });

    // Round 2 has one less checkpoint (no thread creation)
    // But the sequence after that should be IDENTICAL

    const r1Submit = round1Checkpoints.find(c => c.name.includes('Submit clicked'));
    const r2Submit = round2Checkpoints.find(c => c.name.includes('Submit clicked'));
    if (!r1Submit)
      throw new Error('expected r1Submit');
    if (!r2Submit)
      throw new Error('expected r2Submit');
    expect(r1Submit.isInputBlocked).toBe(r2Submit.isInputBlocked);
    expect(r1Submit.showLoadingSpinner).toBe(r2Submit.showLoadingSpinner);

    const r1FirstParticipant = round1Checkpoints.find(c => c.name.includes('First participant'));
    const r2FirstParticipant = round2Checkpoints.find(c => c.name.includes('First participant'));
    if (!r1FirstParticipant)
      throw new Error('expected r1FirstParticipant');
    if (!r2FirstParticipant)
      throw new Error('expected r2FirstParticipant');
    expect(r1FirstParticipant.isInputBlocked).toBe(r2FirstParticipant.isInputBlocked);
    expect(r1FirstParticipant.showLoadingSpinner).toBe(r2FirstParticipant.showLoadingSpinner);

    const r1Moderator = round1Checkpoints.find(c => c.name.includes('Moderator streaming'));
    const r2Moderator = round2Checkpoints.find(c => c.name.includes('Moderator streaming'));
    if (!r1Moderator)
      throw new Error('expected r1Moderator');
    if (!r2Moderator)
      throw new Error('expected r2Moderator');
    expect(r1Moderator.isInputBlocked).toBe(r2Moderator.isInputBlocked);

    const r1Complete = round1Checkpoints.find(c => c.name.includes('Round complete'));
    const r2Complete = round2Checkpoints.find(c => c.name.includes('Round complete'));
    if (!r1Complete)
      throw new Error('expected r1Complete');
    if (!r2Complete)
      throw new Error('expected r2Complete');
    expect(r1Complete.isInputBlocked).toBe(r2Complete.isInputBlocked);
  });

  it('should follow IDENTICAL event sequence to Round 1 WITH web search', () => {
    const round1Store = createChatStore();
    const round2Store = createChatStore();

    const round1Checkpoints = simulateRoundSequence(round1Store, 1, { webSearchEnabled: true });
    const round2Checkpoints = simulateRoundSequence(round2Store, 2, { webSearchEnabled: true });

    const r1PreSearch = round1Checkpoints.find(c => c.name.includes('Pre-search streaming'));
    const r2PreSearch = round2Checkpoints.find(c => c.name.includes('Pre-search streaming'));
    if (!r1PreSearch)
      throw new Error('expected r1PreSearch');
    if (!r2PreSearch)
      throw new Error('expected r2PreSearch');
    expect(r1PreSearch.isInputBlocked).toBe(r2PreSearch.isInputBlocked);

    const r1PreSearchComplete = round1Checkpoints.find(c => c.name.includes('Pre-search complete'));
    const r2PreSearchComplete = round2Checkpoints.find(c => c.name.includes('Pre-search complete'));
    if (!r1PreSearchComplete)
      throw new Error('expected r1PreSearchComplete');
    if (!r2PreSearchComplete)
      throw new Error('expected r2PreSearchComplete');
    expect(r1PreSearchComplete.isInputBlocked).toBe(r2PreSearchComplete.isInputBlocked);

    const r1FirstParticipant = round1Checkpoints.find(c => c.name.includes('First participant'));
    const r2FirstParticipant = round2Checkpoints.find(c => c.name.includes('First participant'));
    if (!r1FirstParticipant)
      throw new Error('expected r1FirstParticipant');
    if (!r2FirstParticipant)
      throw new Error('expected r2FirstParticipant');
    expect(r1FirstParticipant.showLoadingSpinner).toBe(r2FirstParticipant.showLoadingSpinner);

    const r1Complete = round1Checkpoints.find(c => c.name.includes('Round complete'));
    const r2Complete = round2Checkpoints.find(c => c.name.includes('Round complete'));
    if (!r1Complete)
      throw new Error('expected r1Complete');
    if (!r2Complete)
      throw new Error('expected r2Complete');
    expect(r1Complete.isInputBlocked).toBe(r2Complete.isInputBlocked);
  });

  it('should NOT include thread creation checkpoint in Round 2+', () => {
    const store = createChatStore();
    const checkpoints = simulateRoundSequence(store, 2, { webSearchEnabled: false });

    const hasThreadCreation = checkpoints.some(c => c.name.includes('Thread creation'));
    expect(hasThreadCreation).toBe(false);
  });
});

// ============================================================================
// LOADING SPINNER TIMING TESTS
// ============================================================================

describe('chat Input Event Sequence - Loading Spinner Timing', () => {
  it('should show spinner from submit until first stream chunk (Round 1)', () => {
    const store = createChatStore();

    // Submit
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Thread creation (spinner still showing)
    store.getState().setIsCreatingThread(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    store.getState().setIsCreatingThread(false);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // First stream chunk arrives → spinner stops
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });

  it('should show spinner from submit until first stream chunk (Round 2)', () => {
    const store = createChatStore();

    // Submit (no thread creation in Round 2)
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // First stream chunk arrives → spinner stops
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });

  it('should show spinner during pre-search, stop when participant streams (Round 1)', () => {
    const store = createChatStore();

    // Submit
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Pre-search streaming (spinner still showing)
    store.getState().setStreamingRoundNumber(1);
    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber: 1,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.STREAMING,
        streamId: 'presearch_1',
        preSearchId: 'presearch_1',
      },
    });
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Pre-search complete (spinner still showing - waiting for participants)
    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber: 1,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.COMPLETE,
        streamId: 'presearch_1',
        preSearchId: 'presearch_1',
      },
    });
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // First participant streams → spinner stops
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });

  it('should show spinner during pre-search, stop when participant streams (Round 2)', () => {
    const store = createChatStore();

    // Submit
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Pre-search streaming
    store.getState().setStreamingRoundNumber(2);
    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber: 2,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.STREAMING,
        streamId: 'presearch_2',
        preSearchId: 'presearch_2',
      },
    });
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // First participant streams → spinner stops
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// INPUT BLOCKING TIMING TESTS
// ============================================================================

describe('chat Input Event Sequence - Input Blocking Timing', () => {
  it('should block input continuously from submit to round complete (Round 1)', () => {
    const store = createChatStore();
    const checkpoints = simulateRoundSequence(store, 1, { webSearchEnabled: false });

    // All checkpoints except the last should have blocked input
    const completeIdx = checkpoints.findIndex(c => c.name.includes('Round complete'));

    for (let i = 0; i < completeIdx; i++) {
      expect(checkpoints[i]?.isInputBlocked).toBe(true);
    }

    // Last checkpoint should have unblocked input
    expect(checkpoints[completeIdx]?.isInputBlocked).toBe(false);
  });

  it('should block input continuously from submit to round complete (Round 2)', () => {
    const store = createChatStore();
    const checkpoints = simulateRoundSequence(store, 2, { webSearchEnabled: false });

    const completeIdx = checkpoints.findIndex(c => c.name.includes('Round complete'));

    for (let i = 0; i < completeIdx; i++) {
      expect(checkpoints[i]?.isInputBlocked).toBe(true);
    }

    expect(checkpoints[completeIdx]?.isInputBlocked).toBe(false);
  });

  it('should keep input blocked between phases (Round 1 with web search)', () => {
    const store = createChatStore();

    // Submit
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setStreamingRoundNumber(1);

    // Pre-search complete, participants not started yet
    store.getState().setWaitingToStartStreaming(false);
    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber: 1,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.COMPLETE,
        streamId: 'presearch_1',
        preSearchId: 'presearch_1',
      },
    });
    store.getState().setIsStreaming(false);

    // streamingRoundNumber is still set → input blocked
    const state = store.getState();
    const isBlocked = state.streamingRoundNumber !== null;
    expect(isBlocked).toBe(true);
  });

  it('should keep input blocked between phases (Round 2 with web search)', () => {
    const store = createChatStore();

    // Submit
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setStreamingRoundNumber(2);

    // Pre-search complete, participants not started yet
    store.getState().setWaitingToStartStreaming(false);
    store.getState().prefillStreamResumptionState('thread_1', {
      roundNumber: 2,
      currentPhase: RoundPhases.PRE_SEARCH,
      preSearch: {
        enabled: true,
        status: MessageStatuses.COMPLETE,
        streamId: 'presearch_2',
        preSearchId: 'presearch_2',
      },
    });
    store.getState().setIsStreaming(false);

    // streamingRoundNumber is still set → input blocked
    const state = store.getState();
    const isBlocked = state.streamingRoundNumber !== null;
    expect(isBlocked).toBe(true);
  });

  it('should keep input blocked between participants and moderator (Round 1)', () => {
    const store = createChatStore();

    // Participants complete
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(false);

    // streamingRoundNumber is still set → input blocked
    const state = store.getState();
    const isBlocked = state.streamingRoundNumber !== null;
    expect(isBlocked).toBe(true);
  });

  it('should keep input blocked between participants and moderator (Round 2)', () => {
    const store = createChatStore();

    // Participants complete
    store.getState().setStreamingRoundNumber(2);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(false);

    // streamingRoundNumber is still set → input blocked
    const state = store.getState();
    const isBlocked = state.streamingRoundNumber !== null;
    expect(isBlocked).toBe(true);
  });
});

// ============================================================================
// STOP BUTTON BEHAVIOR
// ============================================================================

describe('chat Input Event Sequence - Stop Button', () => {
  it('should show stop button (not submit) during streaming (Round 1)', () => {
    const store = createChatStore();

    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(1);

    // Stop button shown when isStreaming=true
    expect(store.getState().isStreaming).toBe(true);

    // Input blocked, spinner not shown
    const checkpoint = captureCheckpoint(store, 'During streaming');
    expect(checkpoint.isInputBlocked).toBe(true);
    expect(checkpoint.showLoadingSpinner).toBe(false);
  });

  it('should show stop button (not submit) during streaming (Round 2)', () => {
    const store = createChatStore();

    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(2);

    expect(store.getState().isStreaming).toBe(true);

    const checkpoint = captureCheckpoint(store, 'During streaming');
    expect(checkpoint.isInputBlocked).toBe(true);
    expect(checkpoint.showLoadingSpinner).toBe(false);
  });

  it('should show stop button during moderator streaming (Round 1)', () => {
    const store = createChatStore();

    store.getState().setIsModeratorStreaming(true);
    store.getState().setStreamingRoundNumber(1);

    expect(store.getState().isModeratorStreaming).toBe(true);

    const checkpoint = captureCheckpoint(store, 'During moderator');
    expect(checkpoint.isInputBlocked).toBe(true);
  });

  it('should show stop button during moderator streaming (Round 2)', () => {
    const store = createChatStore();

    store.getState().setIsModeratorStreaming(true);
    store.getState().setStreamingRoundNumber(2);

    expect(store.getState().isModeratorStreaming).toBe(true);

    const checkpoint = captureCheckpoint(store, 'During moderator');
    expect(checkpoint.isInputBlocked).toBe(true);
  });
});

// ============================================================================
// COMPREHENSIVE ROUND COMPARISON
// ============================================================================

describe('chat Input Event Sequence - Comprehensive Round Comparison', () => {
  it('should have matching checkpoints at equivalent positions (no web search)', () => {
    const round1Store = createChatStore();
    const round2Store = createChatStore();

    const round1Checkpoints = simulateRoundSequence(round1Store, 1, { webSearchEnabled: false });
    const round2Checkpoints = simulateRoundSequence(round2Store, 2, { webSearchEnabled: false });

    // Compare equivalent checkpoints
    const equivalentPairs = [
      ['Submit clicked', 'Submit clicked'],
      ['First participant streaming', 'First participant streaming'],
      ['Participants complete', 'Participants complete'],
      ['Moderator streaming', 'Moderator streaming'],
      ['Round complete', 'Round complete'],
    ];

    for (const [r1Name, r2Name] of equivalentPairs) {
      const r1Checkpoint = round1Checkpoints.find(c => c.name.includes(r1Name));
      const r2Checkpoint = round2Checkpoints.find(c => c.name.includes(r2Name));

      expect(r1Checkpoint?.isInputBlocked).toBe(r2Checkpoint?.isInputBlocked);
      expect(r1Checkpoint?.showLoadingSpinner).toBe(r2Checkpoint?.showLoadingSpinner);
    }
  });

  it('should have matching checkpoints at equivalent positions (with web search)', () => {
    const round1Store = createChatStore();
    const round2Store = createChatStore();

    const round1Checkpoints = simulateRoundSequence(round1Store, 1, { webSearchEnabled: true });
    const round2Checkpoints = simulateRoundSequence(round2Store, 2, { webSearchEnabled: true });

    const equivalentPairs = [
      ['Submit clicked', 'Submit clicked'],
      ['Pre-search streaming', 'Pre-search streaming'],
      ['Pre-search complete', 'Pre-search complete'],
      ['First participant streaming', 'First participant streaming'],
      ['Participants complete', 'Participants complete'],
      ['Moderator streaming', 'Moderator streaming'],
      ['Round complete', 'Round complete'],
    ];

    for (const [r1Name, r2Name] of equivalentPairs) {
      const r1Checkpoint = round1Checkpoints.find(c => c.name.includes(r1Name));
      const r2Checkpoint = round2Checkpoints.find(c => c.name.includes(r2Name));

      expect(r1Checkpoint?.isInputBlocked).toBe(r2Checkpoint?.isInputBlocked);
      expect(r1Checkpoint?.showLoadingSpinner).toBe(r2Checkpoint?.showLoadingSpinner);
    }
  });
});
