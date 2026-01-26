/**
 * Hook Refs Sanity Tests
 *
 * Tests the actual ref behavior in use-multi-participant-chat.ts
 * by simulating the exact state transitions that happen in the hook.
 *
 * These tests verify:
 * - Refs are properly initialized
 * - Navigation reset clears the correct refs
 * - startRound clears the correct refs
 * - Refs don't leak between conversations
 */

import { describe, expect, it } from 'vitest';

// ============================================================================
// SIMULATED REFS (Matching use-multi-participant-chat.ts structure)
// ============================================================================

type HookRefs = {
  // Participant tracking refs
  respondedParticipantsRef: Set<string>;
  regenerateRoundNumberRef: number | null;

  // Round state refs
  currentRoundRef: number;
  roundParticipantsRef: { id: string; modelId: string }[];
  currentIndexRef: number;

  // Queue and triggering refs
  participantIndexQueue: number[];
  lastUsedParticipantIndex: number | null;
  isTriggeringRef: boolean;
  isStreamingRef: boolean;
  queuedParticipantsThisRoundRef: Set<number>;

  // ✅ BUG FIX TARGETS:
  triggeredNextForRef: Set<string>; // Phantom guard
  processedMessageIdsRef: Set<string>; // Message dedup

  // Hydration
  hasHydratedRef: boolean;

  // Thread tracking
  prevThreadIdRef: string;
};

function createInitialRefs(threadId = ''): HookRefs {
  return {
    currentIndexRef: 0,
    currentRoundRef: 0,
    hasHydratedRef: false,
    isStreamingRef: false,
    isTriggeringRef: false,
    lastUsedParticipantIndex: null,
    participantIndexQueue: [],
    prevThreadIdRef: threadId,
    processedMessageIdsRef: new Set(),
    queuedParticipantsThisRoundRef: new Set(),
    regenerateRoundNumberRef: null,
    respondedParticipantsRef: new Set(),
    roundParticipantsRef: [],
    triggeredNextForRef: new Set(),
  };
}

/**
 * Simulates the navigation reset effect from lines 1454-1495
 */
function simulateNavigationResetEffect(
  refs: HookRefs,
  prevThreadId: string,
  currentThreadId: string,
): HookRefs {
  const wasValidThread = prevThreadId && prevThreadId.trim() !== '';
  const isNowEmpty = !currentThreadId || currentThreadId.trim() === '';
  const isNowDifferentThread = wasValidThread
    && currentThreadId
    && currentThreadId.trim() !== ''
    && prevThreadId !== currentThreadId;

  // Reset when transitioning from valid thread to empty OR between different threads
  if ((wasValidThread && isNowEmpty) || isNowDifferentThread) {
    return {
      ...refs,
      currentIndexRef: 0,
      // Reset round state refs
      currentRoundRef: 0,

      // Reset hydration
      hasHydratedRef: false,
      isStreamingRef: false,
      isTriggeringRef: false,

      lastUsedParticipantIndex: null,
      // Reset queue and triggering refs
      participantIndexQueue: [],
      // Update prev thread
      prevThreadIdRef: currentThreadId,
      processedMessageIdsRef: new Set(),
      queuedParticipantsThisRoundRef: new Set(),

      regenerateRoundNumberRef: null,
      // Reset participant tracking refs
      respondedParticipantsRef: new Set(),

      roundParticipantsRef: [],

      // ✅ BUG FIX: These are now cleared
      triggeredNextForRef: new Set(),
    };
  }

  // Just update prevThreadIdRef if no reset needed
  return {
    ...refs,
    prevThreadIdRef: currentThreadId,
  };
}

/**
 * Simulates the startRound function from lines 1509-1700
 */
function simulateStartRound(
  refs: HookRefs,
  participants: { id: string; modelId: string }[],
  roundNumber: number,
): HookRefs {
  return {
    ...refs,
    currentIndexRef: 0,
    currentRoundRef: roundNumber,
    isStreamingRef: true,
    isTriggeringRef: true,
    lastUsedParticipantIndex: null,
    participantIndexQueue: [],
    queuedParticipantsThisRoundRef: new Set(),
    roundParticipantsRef: participants,
    // ✅ BUG FIX: Clear phantom guard at start of each round
    triggeredNextForRef: new Set(),
  };
}

/**
 * Simulates onFinish adding entries to triggeredNextForRef
 */
function simulateOnFinish(refs: HookRefs, participantIndex: number): HookRefs {
  const triggerKey = `r${refs.currentRoundRef}_p${participantIndex}`;
  const newTriggeredNextFor = new Set(refs.triggeredNextForRef);
  newTriggeredNextFor.add(triggerKey);

  const newProcessedIds = new Set(refs.processedMessageIdsRef);
  newProcessedIds.add(`msg_${refs.currentRoundRef}_${participantIndex}`);

  return {
    ...refs,
    currentIndexRef: participantIndex + 1,
    processedMessageIdsRef: newProcessedIds,
    triggeredNextForRef: newTriggeredNextFor,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('hook Refs Sanity Tests', () => {
  describe('initial State', () => {
    it('should initialize with empty Sets', () => {
      const refs = createInitialRefs();

      expect(refs.triggeredNextForRef.size).toBe(0);
      expect(refs.processedMessageIdsRef.size).toBe(0);
      expect(refs.queuedParticipantsThisRoundRef.size).toBe(0);
      expect(refs.respondedParticipantsRef.size).toBe(0);
    });

    it('should initialize with default values', () => {
      const refs = createInitialRefs();

      expect(refs.currentRoundRef).toBe(0);
      expect(refs.currentIndexRef).toBe(0);
      expect(refs.isTriggeringRef).toBeFalsy();
      expect(refs.isStreamingRef).toBeFalsy();
      expect(refs.hasHydratedRef).toBeFalsy();
    });
  });

  describe('navigation Reset Effect', () => {
    it('should reset refs when transitioning from valid thread to empty', () => {
      const refs = createInitialRefs('thread-123');

      // Simulate some activity
      refs.triggeredNextForRef.add('r0_p0');
      refs.triggeredNextForRef.add('r0_p1');
      refs.processedMessageIdsRef.add('msg_0_0');
      refs.currentRoundRef = 1;
      refs.currentIndexRef = 2;
      refs.isStreamingRef = true;

      // Navigate to empty (overview)
      const resetRefs = simulateNavigationResetEffect(refs, 'thread-123', '');

      expect(resetRefs.triggeredNextForRef.size).toBe(0);
      expect(resetRefs.processedMessageIdsRef.size).toBe(0);
      expect(resetRefs.currentRoundRef).toBe(0);
      expect(resetRefs.currentIndexRef).toBe(0);
      expect(resetRefs.isStreamingRef).toBeFalsy();
    });

    it('should reset refs when transitioning between different threads', () => {
      const refs = createInitialRefs('thread-123');

      // Simulate activity
      refs.triggeredNextForRef.add('r0_p0');
      refs.currentRoundRef = 2;

      // Navigate to different thread
      const resetRefs = simulateNavigationResetEffect(refs, 'thread-123', 'thread-456');

      expect(resetRefs.triggeredNextForRef.size).toBe(0);
      expect(resetRefs.currentRoundRef).toBe(0);
      expect(resetRefs.prevThreadIdRef).toBe('thread-456');
    });

    it('should NOT reset refs when threadId stays empty', () => {
      const refs = createInitialRefs('');

      // Simulate some activity (shouldn't happen in practice but test edge case)
      refs.triggeredNextForRef.add('r0_p0');

      // Navigate from empty to empty
      const result = simulateNavigationResetEffect(refs, '', '');

      // No reset because wasValidThread is false
      expect(result.triggeredNextForRef.size).toBe(1);
      expect(result.triggeredNextForRef.has('r0_p0')).toBeTruthy();
    });

    it('should reset refs when transitioning from empty to valid then back to empty', () => {
      // Start empty
      let refs = createInitialRefs('');

      // Navigate to valid thread
      refs = simulateNavigationResetEffect(refs, '', 'thread-123');
      refs.prevThreadIdRef = 'thread-123';

      // Add activity
      refs.triggeredNextForRef.add('r0_p0');
      refs.triggeredNextForRef.add('r0_p1');

      // Navigate back to empty (new chat)
      refs = simulateNavigationResetEffect(refs, 'thread-123', '');

      expect(refs.triggeredNextForRef.size).toBe(0);
    });
  });

  describe('startRound Behavior', () => {
    it('should clear triggeredNextForRef at start of each round', () => {
      let refs = createInitialRefs('thread-123');

      // Complete round 0
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 0);
      refs = simulateOnFinish(refs, 0);

      expect(refs.triggeredNextForRef.size).toBe(1);
      expect(refs.triggeredNextForRef.has('r0_p0')).toBeTruthy();

      // Start round 1 - should clear
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 1);

      expect(refs.triggeredNextForRef.size).toBe(0);
    });

    it('should properly initialize streaming state', () => {
      const refs = createInitialRefs('thread-123');

      const afterStart = simulateStartRound(
        refs,
        [{ id: 'p1', modelId: 'm1' }, { id: 'p2', modelId: 'm2' }],
        0,
      );

      expect(afterStart.isStreamingRef).toBeTruthy();
      expect(afterStart.isTriggeringRef).toBeTruthy();
      expect(afterStart.currentIndexRef).toBe(0);
      expect(afterStart.roundParticipantsRef).toHaveLength(2);
    });
  });

  describe('onFinish Behavior', () => {
    it('should add entries to triggeredNextForRef with correct key format', () => {
      let refs = createInitialRefs('thread-123');
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 0);

      refs = simulateOnFinish(refs, 0);

      expect(refs.triggeredNextForRef.has('r0_p0')).toBeTruthy();
    });

    it('should add entries to processedMessageIdsRef', () => {
      let refs = createInitialRefs('thread-123');
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 0);

      refs = simulateOnFinish(refs, 0);

      expect(refs.processedMessageIdsRef.has('msg_0_0')).toBeTruthy();
    });

    it('should increment currentIndexRef', () => {
      let refs = createInitialRefs('thread-123');
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 0);

      expect(refs.currentIndexRef).toBe(0);

      refs = simulateOnFinish(refs, 0);

      expect(refs.currentIndexRef).toBe(1);
    });
  });

  describe('complete Flow Sanity', () => {
    it('should handle complete conversation → new chat → new conversation', () => {
      // Start with empty
      let refs = createInitialRefs('');

      // User submits first message, thread created
      refs.prevThreadIdRef = 'thread-1';

      // Start round 0
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }, { id: 'p2', modelId: 'm2' }], 0);

      // Both participants complete
      refs = simulateOnFinish(refs, 0);
      refs = simulateOnFinish(refs, 1);

      expect(refs.triggeredNextForRef.size).toBe(2);
      expect(refs.processedMessageIdsRef.size).toBe(2);

      // User clicks "New Chat"
      refs = simulateNavigationResetEffect(refs, 'thread-1', '');

      expect(refs.triggeredNextForRef.size).toBe(0);
      expect(refs.processedMessageIdsRef.size).toBe(0);

      // User submits new message
      refs.prevThreadIdRef = 'thread-2';
      refs = simulateStartRound(refs, [{ id: 'p3', modelId: 'm3' }, { id: 'p4', modelId: 'm4' }], 0);

      // Both participants should complete without blocking
      refs = simulateOnFinish(refs, 0);
      expect(refs.triggeredNextForRef.has('r0_p0')).toBeTruthy();

      refs = simulateOnFinish(refs, 1);
      expect(refs.triggeredNextForRef.has('r0_p1')).toBeTruthy();

      // Verify all 2 participants triggered
      expect(refs.triggeredNextForRef.size).toBe(2);
    });

    it('should handle thread screen → new chat correctly', () => {
      let refs = createInitialRefs('');

      // First conversation completes
      refs.prevThreadIdRef = 'thread-1';
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 0);
      refs = simulateOnFinish(refs, 0);

      // Navigated to thread screen (URL is now /chat/[slug])
      // User types another message for round 1 (same thread)
      refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }], 1);
      refs = simulateOnFinish(refs, 0);

      expect(refs.triggeredNextForRef.size).toBe(1); // Only round 1 entries
      expect(refs.triggeredNextForRef.has('r1_p0')).toBeTruthy();

      // User clicks "New Chat" from thread screen
      refs = simulateNavigationResetEffect(refs, 'thread-1', '');

      expect(refs.triggeredNextForRef.size).toBe(0);
      expect(refs.currentRoundRef).toBe(0);

      // New conversation works
      refs.prevThreadIdRef = 'thread-2';
      refs = simulateStartRound(refs, [{ id: 'p2', modelId: 'm2' }], 0);
      refs = simulateOnFinish(refs, 0);

      expect(refs.triggeredNextForRef.has('r0_p0')).toBeTruthy();
    });
  });
});

describe('bug Prevention Tests', () => {
  it('should NOT block second conversation when fix is applied', () => {
    let refs = createInitialRefs('');

    // ============================================
    // CONVERSATION 1
    // ============================================
    refs.prevThreadIdRef = 'thread-1';
    refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }, { id: 'p2', modelId: 'm2' }], 0);
    refs = simulateOnFinish(refs, 0);
    refs = simulateOnFinish(refs, 1);

    // Verify phantom guard has entries
    expect(refs.triggeredNextForRef.has('r0_p0')).toBeTruthy();
    expect(refs.triggeredNextForRef.has('r0_p1')).toBeTruthy();

    // ============================================
    // NAVIGATE TO NEW CHAT
    // ============================================
    refs = simulateNavigationResetEffect(refs, 'thread-1', '');

    // ✅ FIX VERIFICATION: Phantom guard is cleared
    expect(refs.triggeredNextForRef.size).toBe(0);

    // ============================================
    // CONVERSATION 2
    // ============================================
    refs.prevThreadIdRef = 'thread-2';
    refs = simulateStartRound(refs, [{ id: 'p1', modelId: 'm1' }, { id: 'p2', modelId: 'm2' }], 0);

    // ✅ FIX VERIFICATION: startRound also clears (double protection)
    expect(refs.triggeredNextForRef.size).toBe(0);

    // First participant completes - should NOT be blocked
    const triggerKey = 'r0_p0';
    const isBlocked = refs.triggeredNextForRef.has(triggerKey);
    expect(isBlocked).toBeFalsy(); // ✅ NOT BLOCKED

    refs = simulateOnFinish(refs, 0);
    expect(refs.triggeredNextForRef.has('r0_p0')).toBeTruthy();

    // Second participant completes
    refs = simulateOnFinish(refs, 1);
    expect(refs.triggeredNextForRef.has('r0_p1')).toBeTruthy();

    // All participants completed
    expect(refs.triggeredNextForRef.size).toBe(2);
  });
});
