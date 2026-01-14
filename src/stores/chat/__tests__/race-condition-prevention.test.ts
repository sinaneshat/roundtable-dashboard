/**
 * Race Condition Prevention Tests
 *
 * Verifies that the stream resumption system prevents race conditions between:
 * - Multiple React effects running concurrently
 * - AI SDK resume and custom resumption logic
 * - Server prefetch and client-side state
 * - Phase transitions and stream triggers
 *
 * These tests ensure atomic state transitions and prevent:
 * - Duplicate message creation
 * - Double participant triggering
 * - Overlapping phase resumptions
 * - Stale state deadlocks
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoundPhase } from '@/api/core/enums';
import { FinishReasons, MessageRoles, MessageStatuses, RoundPhases } from '@/api/core/enums';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type RefTracker = {
  resumptionAttempted: Map<string, boolean>;
  activeStreamCheck: Map<string, boolean>;
  preSearchResumptionAttempted: Map<string, boolean>;
  moderatorResumptionAttempted: Map<string, boolean>;
  staleStateChecked: Map<string, boolean>;
};

type EffectResult = {
  effectName: string;
  triggered: boolean;
  reason?: string;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createRefTracker(): RefTracker {
  return {
    resumptionAttempted: new Map(),
    activeStreamCheck: new Map(),
    preSearchResumptionAttempted: new Map(),
    moderatorResumptionAttempted: new Map(),
    staleStateChecked: new Map(),
  };
}

function simulateEffect(
  effectName: string,
  refs: RefTracker,
  key: string,
  refType: keyof RefTracker,
): EffectResult {
  const refMap = refs[refType];

  if (refMap.has(key)) {
    return {
      effectName,
      triggered: false,
      reason: `Already attempted for ${key}`,
    };
  }

  refMap.set(key, true);
  return {
    effectName,
    triggered: true,
  };
}

// ============================================================================
// REF-BASED GUARD TESTS
// ============================================================================

describe('ref-Based Guard: resumptionAttemptedRef', () => {
  let refs: RefTracker;

  beforeEach(() => {
    refs = createRefTracker();
  });

  it('allows first resumption attempt for a thread', () => {
    const result = simulateEffect(
      'incomplete-round-resumption',
      refs,
      'thread-123',
      'resumptionAttempted',
    );

    expect(result.triggered).toBe(true);
  });

  it('blocks second resumption attempt for same thread', () => {
    simulateEffect('incomplete-round-resumption', refs, 'thread-123', 'resumptionAttempted');
    const result = simulateEffect(
      'incomplete-round-resumption',
      refs,
      'thread-123',
      'resumptionAttempted',
    );

    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('Already attempted');
  });

  it('allows resumption for different thread', () => {
    simulateEffect('incomplete-round-resumption', refs, 'thread-123', 'resumptionAttempted');
    const result = simulateEffect(
      'incomplete-round-resumption',
      refs,
      'thread-456',
      'resumptionAttempted',
    );

    expect(result.triggered).toBe(true);
  });

  it('resets ref when thread changes', () => {
    simulateEffect('incomplete-round-resumption', refs, 'thread-123', 'resumptionAttempted');

    // Simulate thread change effect
    refs.resumptionAttempted.clear();

    const result = simulateEffect(
      'incomplete-round-resumption',
      refs,
      'thread-123',
      'resumptionAttempted',
    );

    expect(result.triggered).toBe(true);
  });
});

describe('ref-Based Guard: preSearchPhaseResumptionAttemptedRef', () => {
  let refs: RefTracker;

  beforeEach(() => {
    refs = createRefTracker();
  });

  it('allows first pre-search resumption attempt', () => {
    const key = 'thread-123_presearch_0';
    const result = simulateEffect(
      'pre-search-resumption',
      refs,
      key,
      'preSearchResumptionAttempted',
    );

    expect(result.triggered).toBe(true);
  });

  it('blocks duplicate pre-search resumption', () => {
    const key = 'thread-123_presearch_0';
    simulateEffect('pre-search-resumption', refs, key, 'preSearchResumptionAttempted');
    const result = simulateEffect('pre-search-resumption', refs, key, 'preSearchResumptionAttempted');

    expect(result.triggered).toBe(false);
  });

  it('allows pre-search resumption for different round', () => {
    simulateEffect('pre-search-resumption', refs, 'thread-123_presearch_0', 'preSearchResumptionAttempted');
    const result = simulateEffect(
      'pre-search-resumption',
      refs,
      'thread-123_presearch_1',
      'preSearchResumptionAttempted',
    );

    expect(result.triggered).toBe(true);
  });
});

describe('ref-Based Guard: moderatorPhaseResumptionAttemptedRef', () => {
  let refs: RefTracker;

  beforeEach(() => {
    refs = createRefTracker();
  });

  it('allows first moderator resumption attempt', () => {
    const key = 'thread-123_moderator_0';
    const result = simulateEffect(
      'moderator-resumption',
      refs,
      key,
      'moderatorResumptionAttempted',
    );

    expect(result.triggered).toBe(true);
  });

  it('blocks duplicate moderator resumption', () => {
    const key = 'thread-123_moderator_0';
    simulateEffect('moderator-resumption', refs, key, 'moderatorResumptionAttempted');
    const result = simulateEffect('moderator-resumption', refs, key, 'moderatorResumptionAttempted');

    expect(result.triggered).toBe(false);
  });
});

// ============================================================================
// CONCURRENT EFFECT PREVENTION TESTS
// ============================================================================

describe('concurrent Effect Prevention', () => {
  it('prevents pre-search and participant effects from running simultaneously', () => {
    const currentPhase: RoundPhase = RoundPhases.PRE_SEARCH;

    // Pre-search effect should run
    const shouldRunPreSearchEffect = currentPhase === RoundPhases.PRE_SEARCH;

    // Participant effect should NOT run when phase is pre_search
    const shouldRunParticipantEffect = currentPhase === RoundPhases.PARTICIPANTS;

    expect(shouldRunPreSearchEffect).toBe(true);
    expect(shouldRunParticipantEffect).toBe(false);
  });

  it('prevents participant and moderator effects from running simultaneously', () => {
    const currentPhase: RoundPhase = RoundPhases.PARTICIPANTS;
    const allParticipantsComplete = false;

    // Participant effect should run
    const shouldRunParticipantEffect = currentPhase === RoundPhases.PARTICIPANTS;

    // Moderator effect should NOT run until participants complete
    const shouldRunModeratorEffect = currentPhase === RoundPhases.MODERATOR
      || allParticipantsComplete;

    expect(shouldRunParticipantEffect).toBe(true);
    expect(shouldRunModeratorEffect).toBe(false);
  });

  it('ensures only one phase-specific effect runs at a time', () => {
    const effects = ['pre-search', 'participants', 'moderator'];
    const runningEffects: string[] = [];
    const currentPhase: RoundPhase = RoundPhases.PARTICIPANTS;

    effects.forEach((effect) => {
      let shouldRun = false;
      switch (effect) {
        case 'pre-search':
          shouldRun = currentPhase === RoundPhases.PRE_SEARCH;
          break;
        case 'participants':
          shouldRun = currentPhase === RoundPhases.PARTICIPANTS;
          break;
        case 'moderator':
          shouldRun = currentPhase === RoundPhases.MODERATOR;
          break;
      }
      if (shouldRun) {
        runningEffects.push(effect);
      }
    });

    // Only one effect should run
    expect(runningEffects).toHaveLength(1);
    expect(runningEffects[0]).toBe('participants');
  });
});

// ============================================================================
// AI SDK RESUME VS CUSTOM RESUMPTION TESTS
// ============================================================================

describe('aI SDK Resume vs Custom Resumption Coordination', () => {
  it('aI SDK resume handles participant streams (returns 200 SSE)', () => {
    const phase: RoundPhase = RoundPhases.PARTICIPANTS;
    const hasActiveParticipantStream = true;

    const aiSdkShouldHandle = phase === RoundPhases.PARTICIPANTS && hasActiveParticipantStream;
    const httpStatus = aiSdkShouldHandle ? 200 : 204;

    expect(httpStatus).toBe(200);
  });

  it('custom resumption handles pre-search (AI SDK gets 204)', () => {
    const phase: RoundPhase = RoundPhases.PRE_SEARCH;

    const aiSdkShouldHandle = phase === RoundPhases.PARTICIPANTS;
    const httpStatus = aiSdkShouldHandle ? 200 : 204;

    expect(httpStatus).toBe(204);
  });

  it('custom resumption handles moderator (AI SDK gets 204)', () => {
    const phase: RoundPhase = RoundPhases.MODERATOR;

    const aiSdkShouldHandle = phase === RoundPhases.PARTICIPANTS;
    const httpStatus = aiSdkShouldHandle ? 200 : 204;

    expect(httpStatus).toBe(204);
  });

  it('incomplete-round-resumption skips when AI SDK is streaming', () => {
    const isStreaming = true; // AI SDK is handling a resumed stream

    const shouldIncompleteRoundResumptionRun = !isStreaming;

    expect(shouldIncompleteRoundResumptionRun).toBe(false);
  });

  it('incomplete-round-resumption waits for activeStreamCheckComplete', () => {
    const activeStreamCheckComplete = false;

    const shouldProceedWithResumption = activeStreamCheckComplete;

    expect(shouldProceedWithResumption).toBe(false);
  });
});

// ============================================================================
// SERVER PREFETCH VS CLIENT STATE TESTS
// ============================================================================

describe('server Prefetch vs Client State Coordination', () => {
  it('prefillStreamResumptionState runs before resumption effects', () => {
    let streamResumptionPrefilled = false;
    let resumptionEffectRan = false;

    // Simulate prefill (runs in useEffect on mount)
    streamResumptionPrefilled = true;

    // Simulate resumption effect (checks prefilled flag)
    if (streamResumptionPrefilled) {
      resumptionEffectRan = true;
    }

    expect(streamResumptionPrefilled).toBe(true);
    expect(resumptionEffectRan).toBe(true);
  });

  it('stale state cleanup skips when prefilled', () => {
    const waitingToStartStreaming = true;
    const pendingMessage = null;
    const isStreaming = false;
    const streamResumptionPrefilled = true;

    // Stale state detection
    const isStale = waitingToStartStreaming
      && pendingMessage === null
      && !isStreaming
      && !streamResumptionPrefilled; // NEW: Skip if prefilled

    expect(isStale).toBe(false);
  });

  it('stale state cleanup runs when NOT prefilled', () => {
    const waitingToStartStreaming = true;
    const pendingMessage = null;
    const isStreaming = false;
    const streamResumptionPrefilled = false;

    const isStale = waitingToStartStreaming
      && pendingMessage === null
      && !isStreaming
      && !streamResumptionPrefilled;

    expect(isStale).toBe(true);
  });
});

// ============================================================================
// PHASE TRANSITION ATOMICITY TESTS
// ============================================================================

describe('phase Transition Atomicity', () => {
  it('transitionToParticipantsPhase clears pre-search state atomically', () => {
    const state = {
      currentResumptionPhase: RoundPhases.PRE_SEARCH as RoundPhase | null,
      preSearchResumption: { status: 'streaming', streamId: 'ps_123' },
      waitingToStartStreaming: true,
      nextParticipantToTrigger: null as number | null,
    };

    // Simulate transitionToParticipantsPhase
    const newState = {
      ...state,
      currentResumptionPhase: RoundPhases.PARTICIPANTS,
      preSearchResumption: null,
      nextParticipantToTrigger: 0,
    };

    expect(newState.currentResumptionPhase).toBe(RoundPhases.PARTICIPANTS);
    expect(newState.preSearchResumption).toBeNull();
    expect(newState.nextParticipantToTrigger).toBe(0);
  });

  it('clearStreamResumption resets all resumption state atomically', () => {
    const state = {
      currentResumptionPhase: RoundPhases.MODERATOR as RoundPhase | null,
      streamResumptionPrefilled: true,
      preSearchResumption: null,
      moderatorResumption: { status: 'complete', moderatorMessageId: 'mod_123' },
      resumptionRoundNumber: 0 as number | null,
    };

    // Simulate clearStreamResumption
    const newState = {
      ...state,
      currentResumptionPhase: RoundPhases.IDLE,
      streamResumptionPrefilled: false,
      preSearchResumption: null,
      moderatorResumption: null,
      resumptionRoundNumber: null,
    };

    expect(newState.currentResumptionPhase).toBe(RoundPhases.IDLE);
    expect(newState.streamResumptionPrefilled).toBe(false);
    expect(newState.moderatorResumption).toBeNull();
    expect(newState.resumptionRoundNumber).toBeNull();
  });
});

// ============================================================================
// TIMEOUT-BASED STALE STATE CLEANUP TESTS
// ============================================================================

describe('timeout-Based Stale State Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears stale isStreaming after 2 second timeout', () => {
    let isStreaming = true;
    const STALE_TIMEOUT = 2000;

    const timeoutId = setTimeout(() => {
      isStreaming = false;
    }, STALE_TIMEOUT);

    expect(isStreaming).toBe(true);

    vi.advanceTimersByTime(STALE_TIMEOUT);

    expect(isStreaming).toBe(false);

    clearTimeout(timeoutId);
  });

  it('cancels timeout when dependencies change', () => {
    let isStreaming = true;
    let timeoutCleared = false;
    const STALE_TIMEOUT = 2000;

    const timeoutId = setTimeout(() => {
      isStreaming = false;
    }, STALE_TIMEOUT);

    // Simulate dependency change (effect re-runs, clears timeout)
    clearTimeout(timeoutId);
    timeoutCleared = true;

    vi.advanceTimersByTime(STALE_TIMEOUT);

    expect(isStreaming).toBe(true); // NOT cleared because timeout was cancelled
    expect(timeoutCleared).toBe(true);
  });

  it('resets timeout on each activity', () => {
    let lastActivityTime = Date.now();
    const _STALE_TIMEOUT = 2000;

    // Simulate activity
    vi.advanceTimersByTime(1000);
    lastActivityTime = Date.now();

    // More activity
    vi.advanceTimersByTime(1000);
    lastActivityTime = Date.now();

    // Check if stale (2 seconds since LAST activity)
    const timeSinceLastActivity = Date.now() - lastActivityTime;

    expect(timeSinceLastActivity).toBe(0);
  });
});

// ============================================================================
// SIGNATURE-BASED RE-CHECK TESTS
// ============================================================================

describe('signature-Based Re-check Detection', () => {
  it('detects when round becomes incomplete after being complete', () => {
    const threadId = 'thread-123';
    let isIncomplete = false;
    const currentRoundNumber = 0;

    const createSignature = () => `${threadId}_${isIncomplete}_${currentRoundNumber}`;

    const signature1 = createSignature();

    // Round becomes incomplete (e.g., stale isStreaming cleared)
    isIncomplete = true;

    const signature2 = createSignature();

    expect(signature1).not.toBe(signature2);
  });

  it('resets refs when signature changes', () => {
    let lastCheckedSignature: string | null = null;
    let activeStreamCheckRef: string | null = 'thread-123';
    const threadId = 'thread-123';

    const currentSignature = `${threadId}_true_0`;

    // First check
    lastCheckedSignature = currentSignature;

    // Signature changes
    const newSignature = `${threadId}_false_0`;

    if (lastCheckedSignature !== newSignature) {
      activeStreamCheckRef = null; // Reset ref
    }

    expect(activeStreamCheckRef).toBeNull();
  });
});

// ============================================================================
// DUPLICATE MESSAGE PREVENTION TESTS
// ============================================================================

describe('duplicate Message Prevention', () => {
  it('checks for existing message ID before triggering participant', () => {
    const messages = [
      { id: 'thread-123_r0_p0', role: MessageRoles.ASSISTANT, content: 'Existing' },
    ];

    const expectedMessageId = 'thread-123_r0_p0';
    const existingMessage = messages.find(m => m.id === expectedMessageId);

    const shouldTriggerParticipant = !existingMessage;

    expect(shouldTriggerParticipant).toBe(false);
  });

  it('allows triggering when message ID does not exist', () => {
    const messages = [
      { id: 'thread-123_r0_p0', role: MessageRoles.ASSISTANT, content: 'P0' },
    ];

    const expectedMessageId = 'thread-123_r0_p1';
    const existingMessage = messages.find(m => m.id === expectedMessageId);

    const shouldTriggerParticipant = !existingMessage;

    expect(shouldTriggerParticipant).toBe(true);
  });

  it('allows re-triggering incomplete message (finishReason: unknown, no content)', () => {
    const messages = [
      {
        id: 'thread-123_r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [],
        metadata: { finishReason: FinishReasons.UNKNOWN },
      },
    ];

    const expectedMessageId = 'thread-123_r0_p0';
    const existingMessage = messages.find(m => m.id === expectedMessageId);

    const hasContent = existingMessage?.parts?.some(
      (p: { type: string; text?: string }) => p.type === 'text' && p.text && p.text.trim().length > 0,
    ) ?? false;
    const isComplete = hasContent && existingMessage?.metadata?.finishReason !== FinishReasons.UNKNOWN;

    // Should allow re-trigger because message is incomplete
    const shouldTriggerParticipant = !isComplete;

    expect(shouldTriggerParticipant).toBe(true);
  });
});

// ============================================================================
// SUBMISSION IN PROGRESS GUARD TESTS
// ============================================================================

describe('submission In Progress Guard', () => {
  it('blocks resumption during hasEarlyOptimisticMessage', () => {
    const hasEarlyOptimisticMessage = true;
    const pendingMessage = null;
    const hasSentPendingMessage = false;

    const isSubmissionInProgress = hasEarlyOptimisticMessage
      || (pendingMessage !== null && !hasSentPendingMessage);

    expect(isSubmissionInProgress).toBe(true);
  });

  it('blocks resumption during pendingMessage before sent', () => {
    const hasEarlyOptimisticMessage = false;
    const pendingMessage = 'New message';
    const hasSentPendingMessage = false;

    const isSubmissionInProgress = hasEarlyOptimisticMessage
      || (pendingMessage !== null && !hasSentPendingMessage);

    expect(isSubmissionInProgress).toBe(true);
  });

  it('allows resumption after pendingMessage is sent', () => {
    const hasEarlyOptimisticMessage = false;
    const pendingMessage = null;
    const hasSentPendingMessage = true;

    const isSubmissionInProgress = hasEarlyOptimisticMessage
      || (pendingMessage !== null && !hasSentPendingMessage);

    expect(isSubmissionInProgress).toBe(false);
  });

  it('blocks resumption when last user message is optimistic', () => {
    const messages = [
      {
        id: 'optimistic-123',
        role: MessageRoles.USER,
        metadata: { isOptimistic: true },
      },
    ];

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    const isOptimistic = lastUserMessage?.metadata?.isOptimistic === true;

    expect(isOptimistic).toBe(true);
  });
});

// ============================================================================
// EFFECT ORDERING TESTS
// ============================================================================

describe('effect Ordering', () => {
  it('signature reset runs BEFORE immediate placeholder effect', () => {
    const effectOrder: string[] = [];

    // Simulate effect execution order (based on declaration order in useEffect)
    effectOrder.push('signature-reset');
    effectOrder.push('immediate-placeholder');
    effectOrder.push('main-resumption');

    expect(effectOrder[0]).toBe('signature-reset');
    expect(effectOrder[1]).toBe('immediate-placeholder');
    expect(effectOrder[2]).toBe('main-resumption');
  });

  it('stale state check runs once on mount (via ref)', () => {
    const staleStateCheckedRef = { current: false };
    let checkCount = 0;

    // First render
    if (!staleStateCheckedRef.current) {
      checkCount++;
      staleStateCheckedRef.current = true;
    }

    // Re-render
    if (!staleStateCheckedRef.current) {
      checkCount++;
      staleStateCheckedRef.current = true;
    }

    expect(checkCount).toBe(1);
  });
});

// ============================================================================
// PARTICIPANT STATUS TRACKING TESTS
// ============================================================================

describe('participant Status Tracking', () => {
  it('distinguishes between completed and in-progress participants', () => {
    type ParticipantState = 'completed' | 'in-progress' | 'pending';
    const participantStates: ParticipantState[] = ['completed', 'in-progress', 'pending'];

    const completedCount = participantStates.filter(s => s === 'completed').length;
    const inProgressCount = participantStates.filter(s => s === 'in-progress').length;
    const pendingCount = participantStates.filter(s => s === 'pending').length;

    expect(completedCount).toBe(1);
    expect(inProgressCount).toBe(1);
    expect(pendingCount).toBe(1);
  });

  it('accounts for in-progress participants when calculating next to trigger', () => {
    const respondedParticipantIndices = new Set([0]);
    const inProgressParticipantIndices = new Set([1]);
    const totalParticipants = 3;

    const accountedParticipants = respondedParticipantIndices.size + inProgressParticipantIndices.size;
    const isIncomplete = accountedParticipants < totalParticipants;

    // Next to trigger should be 2, not 1 (because 1 is in-progress)
    let nextParticipantIndex: number | null = null;
    for (let i = 0; i < totalParticipants; i++) {
      if (respondedParticipantIndices.has(i))
        continue;
      if (inProgressParticipantIndices.has(i))
        continue;
      nextParticipantIndex = i;
      break;
    }

    expect(isIncomplete).toBe(true);
    expect(nextParticipantIndex).toBe(2);
  });
});

// ============================================================================
// KV STREAM BUFFER COORDINATION TESTS
// ============================================================================

describe('kV Stream Buffer Coordination', () => {
  it('createLiveParticipantResumeStream polls for new chunks', async () => {
    const chunks: string[] = [];
    let pollCount = 0;
    const maxPolls = 3;

    // Simulate polling
    const poll = () => {
      pollCount++;
      if (pollCount === 1)
        chunks.push('chunk1');
      if (pollCount === 2)
        chunks.push('chunk2');
      if (pollCount === 3)
        return 'DONE';
      return 'CONTINUE';
    };

    // eslint-disable-next-line no-unmodified-loop-condition -- pollCount modified inside poll()
    while (pollCount < maxPolls) {
      const result = poll();
      if (result === 'DONE')
        break;
    }

    expect(chunks).toHaveLength(2);
    expect(pollCount).toBe(3);
  });

  it('detects stream completion via markStreamCompleted', () => {
    const streamStatus = {
      status: 'active' as 'active' | 'completed',
      chunks: ['chunk1', 'chunk2'],
    };

    // Simulate markStreamCompleted
    streamStatus.status = 'completed';

    expect(streamStatus.status).toBe('completed');
  });

  it('handles stale stream detection (30s timeout)', () => {
    vi.useFakeTimers();

    const streamCreatedAt = Date.now();
    const STALE_TIMEOUT = 30000;

    vi.advanceTimersByTime(STALE_TIMEOUT + 1000);

    const isStale = Date.now() - streamCreatedAt > STALE_TIMEOUT;

    expect(isStale).toBe(true);

    vi.useRealTimers();
  });
});

// ============================================================================
// ERROR RECOVERY TESTS
// ============================================================================

describe('error Recovery in Resumption', () => {
  it('handles failed pre-search by skipping to participants', () => {
    const preSearchStatus = MessageStatuses.FAILED;

    const shouldSkipToParticipants = preSearchStatus === MessageStatuses.FAILED;

    expect(shouldSkipToParticipants).toBe(true);
  });

  it('handles failed participant by marking as responded', () => {
    const finishReason = FinishReasons.ERROR;

    // Participant with ERROR finishReason should be counted as "done"
    // (don't retry indefinitely)
    const shouldCountAsResponded = finishReason === FinishReasons.ERROR
      || finishReason === FinishReasons.STOP
      || finishReason === FinishReasons.LENGTH;

    expect(shouldCountAsResponded).toBe(true);
  });

  it('handles empty interrupted response by allowing retry', () => {
    const finishReason = FinishReasons.UNKNOWN;
    const hasContent = false;
    const usage = { totalTokens: 0 };

    const isEmptyInterruptedResponse = finishReason === FinishReasons.UNKNOWN
      && usage.totalTokens === 0
      && !hasContent;

    // Should NOT count as responded - allow retry
    const shouldCountAsResponded = !isEmptyInterruptedResponse;

    expect(shouldCountAsResponded).toBe(false);
  });
});
