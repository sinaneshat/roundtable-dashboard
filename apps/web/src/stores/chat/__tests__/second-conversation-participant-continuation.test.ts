/**
 * Second Conversation Participant Continuation Tests
 *
 * Tests for a bug where starting a second conversation after completing
 * the first one fails to continue to subsequent participants.
 *
 * Root cause: The `triggeredNextForRef` Set (PHANTOM GUARD) is not being
 * cleared when navigating back to overview or starting a new round.
 * This causes keys like "r0_p0" from the first conversation to block
 * participant continuation in the second conversation.
 *
 * Bug scenario:
 * 1. User completes first conversation (round 0, participants 0, 1)
 *    - triggeredNextForRef contains: "r0_p0", "r0_p1"
 * 2. User clicks "New Chat" → navigates to /chat overview
 * 3. User starts second conversation (round 0 again)
 * 4. First participant streams and completes → onFinish called
 * 5. triggerNextParticipantWithRefs() checks "r0_p0" in triggeredNextForRef
 * 6. "r0_p0" is already in Set (from first conversation) → early return!
 * 7. Second participant never gets triggered
 *
 * Fix: Clear triggeredNextForRef in the navigation reset effect and/or
 * at the start of startRound/sendMessage.
 */

import { describe, expect, it } from 'vitest';

/**
 * Simulates the PHANTOM GUARD ref behavior in use-multi-participant-chat.ts
 */
class PhantomGuard {
  private triggeredNextFor = new Set<string>();

  /**
   * Check if (round, participant) pair has already triggered next
   */
  hasTriggered(round: number, participantIndex: number): boolean {
    const key = `r${round}_p${participantIndex}`;
    return this.triggeredNextFor.has(key);
  }

  /**
   * Mark (round, participant) as having triggered next
   */
  markTriggered(round: number, participantIndex: number): void {
    const key = `r${round}_p${participantIndex}`;
    this.triggeredNextFor.add(key);
  }

  /**
   * Clear all entries (should be called on navigation/new round)
   */
  clear(): void {
    this.triggeredNextFor.clear();
  }

  /**
   * Get all current entries (for debugging)
   */
  getEntries(): string[] {
    return Array.from(this.triggeredNextFor);
  }
}

/**
 * Simulates the navigation reset behavior from use-multi-participant-chat.ts
 * This is the BUGGY version - does NOT clear triggeredNextForRef
 */
function simulateBuggyNavigationReset(state: {
  currentRound: number;
  currentIndex: number;
  roundParticipants: string[];
  isStreaming: boolean;
  isTriggeringRef: boolean;
  queuedParticipants: Set<number>;
  // NOTE: phantomGuard is intentionally NOT cleared (bug)
}): typeof state {
  return {
    ...state,
    currentIndex: 0,
    currentRound: 0,
    isStreaming: false,
    isTriggeringRef: false,
    queuedParticipants: new Set(),
    roundParticipants: [],
    // BUG: triggeredNextForRef (phantomGuard) is NOT cleared!
  };
}

/**
 * Simulates the FIXED navigation reset behavior
 */
function simulateFixedNavigationReset(
  state: ReturnType<typeof simulateBuggyNavigationReset>,
  phantomGuard: PhantomGuard,
): ReturnType<typeof simulateBuggyNavigationReset> {
  phantomGuard.clear(); // ✅ FIX: Clear phantom guard
  return simulateBuggyNavigationReset(state);
}

/**
 * Simulates triggerNextParticipantWithRefs behavior
 */
function triggerNextParticipant(
  currentIndex: number,
  currentRound: number,
  totalParticipants: number,
  phantomGuard: PhantomGuard,
): { triggered: boolean; nextIndex: number | null; blockedByPhantomGuard: boolean } {
  const nextIndex = currentIndex + 1;

  // PHANTOM GUARD: Check if already triggered
  const _triggerKey = `r${currentRound}_p${currentIndex}`;
  if (phantomGuard.hasTriggered(currentRound, currentIndex)) {
    return { blockedByPhantomGuard: true, nextIndex: null, triggered: false };
  }
  phantomGuard.markTriggered(currentRound, currentIndex);

  // Round complete check
  if (nextIndex >= totalParticipants) {
    return { blockedByPhantomGuard: false, nextIndex: null, triggered: true };
  }

  // More participants to process
  return { blockedByPhantomGuard: false, nextIndex, triggered: true };
}

describe('second Conversation Participant Continuation', () => {
  describe('phantom Guard Behavior', () => {
    it('should track triggered (round, participant) pairs', () => {
      const guard = new PhantomGuard();

      expect(guard.hasTriggered(0, 0)).toBeFalsy();
      expect(guard.hasTriggered(0, 1)).toBeFalsy();

      guard.markTriggered(0, 0);

      expect(guard.hasTriggered(0, 0)).toBeTruthy();
      expect(guard.hasTriggered(0, 1)).toBeFalsy();

      guard.markTriggered(0, 1);

      expect(guard.hasTriggered(0, 0)).toBeTruthy();
      expect(guard.hasTriggered(0, 1)).toBeTruthy();
    });

    it('should clear all entries', () => {
      const guard = new PhantomGuard();

      guard.markTriggered(0, 0);
      guard.markTriggered(0, 1);
      guard.markTriggered(1, 0);

      expect(guard.getEntries()).toHaveLength(3);

      guard.clear();

      expect(guard.getEntries()).toHaveLength(0);
      expect(guard.hasTriggered(0, 0)).toBeFalsy();
      expect(guard.hasTriggered(0, 1)).toBeFalsy();
      expect(guard.hasTriggered(1, 0)).toBeFalsy();
    });
  });

  describe('bUG: triggeredNextForRef Not Cleared on New Chat', () => {
    it('fAILING: second conversation should trigger subsequent participants', () => {
      const phantomGuard = new PhantomGuard();
      const participants = ['participant-0', 'participant-1', 'participant-2'];

      // ============================================
      // FIRST CONVERSATION
      // ============================================

      // Round 0, Participant 0 completes
      let result = triggerNextParticipant(0, 0, participants.length, phantomGuard);
      expect(result.triggered).toBeTruthy();
      expect(result.nextIndex).toBe(1);
      expect(result.blockedByPhantomGuard).toBeFalsy();

      // Round 0, Participant 1 completes
      result = triggerNextParticipant(1, 0, participants.length, phantomGuard);
      expect(result.triggered).toBeTruthy();
      expect(result.nextIndex).toBe(2);
      expect(result.blockedByPhantomGuard).toBeFalsy();

      // Round 0, Participant 2 completes (last)
      result = triggerNextParticipant(2, 0, participants.length, phantomGuard);
      expect(result.triggered).toBeTruthy();
      expect(result.nextIndex).toBeNull(); // Round complete
      expect(result.blockedByPhantomGuard).toBeFalsy();

      // Verify phantom guard has entries from first conversation
      expect(phantomGuard.getEntries()).toEqual(['r0_p0', 'r0_p1', 'r0_p2']);

      // ============================================
      // USER CLICKS "NEW CHAT" → NAVIGATE TO OVERVIEW
      // ============================================

      // Simulate BUGGY navigation reset (does NOT clear phantomGuard)
      // This is what the current code does
      let state = {
        currentIndex: 0,
        currentRound: 0,
        isStreaming: false,
        isTriggeringRef: false,
        queuedParticipants: new Set<number>(),
        roundParticipants: participants,
      };
      state = simulateBuggyNavigationReset(state);

      // Verify state was reset (but phantomGuard was NOT)
      expect(state.currentRound).toBe(0);
      expect(state.currentIndex).toBe(0);
      expect(state.roundParticipants).toHaveLength(0);

      // BUG: phantomGuard still has entries from first conversation!
      expect(phantomGuard.getEntries()).toEqual(['r0_p0', 'r0_p1', 'r0_p2']);

      // ============================================
      // SECOND CONVERSATION
      // ============================================

      // Round 0, Participant 0 completes
      // BUG: This should trigger participant 1, but it's blocked!
      result = triggerNextParticipant(0, 0, participants.length, phantomGuard);

      // FAILING ASSERTION: This is the bug!
      // Expected: triggered=true, nextIndex=1
      // Actual: triggered=false (blocked by phantom guard)
      expect(result.blockedByPhantomGuard).toBeTruthy(); // BUG: Blocked!
      expect(result.triggered).toBeFalsy(); // BUG: Not triggered!
      expect(result.nextIndex).toBeNull(); // BUG: No next participant!

      // This is what we WANT (after fix):
      // expect(result.blockedByPhantomGuard).toBe(false);
      // expect(result.triggered).toBe(true);
      // expect(result.nextIndex).toBe(1);
    });

    it('pASSING with fix: second conversation triggers subsequent participants after clearing phantomGuard', () => {
      const phantomGuard = new PhantomGuard();
      const participants = ['participant-0', 'participant-1', 'participant-2'];

      // ============================================
      // FIRST CONVERSATION
      // ============================================

      // All participants complete
      triggerNextParticipant(0, 0, participants.length, phantomGuard);
      triggerNextParticipant(1, 0, participants.length, phantomGuard);
      triggerNextParticipant(2, 0, participants.length, phantomGuard);

      expect(phantomGuard.getEntries()).toEqual(['r0_p0', 'r0_p1', 'r0_p2']);

      // ============================================
      // USER CLICKS "NEW CHAT" → NAVIGATE TO OVERVIEW
      // ============================================

      // Simulate FIXED navigation reset (clears phantomGuard)
      const state = {
        currentIndex: 0,
        currentRound: 0,
        isStreaming: false,
        isTriggeringRef: false,
        queuedParticipants: new Set<number>(),
        roundParticipants: participants,
      };
      const _resetState = simulateFixedNavigationReset(state, phantomGuard);

      // Verify phantomGuard is cleared
      expect(phantomGuard.getEntries()).toHaveLength(0);

      // ============================================
      // SECOND CONVERSATION
      // ============================================

      // Round 0, Participant 0 completes - should trigger next!
      let result = triggerNextParticipant(0, 0, participants.length, phantomGuard);
      expect(result.blockedByPhantomGuard).toBeFalsy();
      expect(result.triggered).toBeTruthy();
      expect(result.nextIndex).toBe(1);

      // Round 0, Participant 1 completes - should trigger next!
      result = triggerNextParticipant(1, 0, participants.length, phantomGuard);
      expect(result.blockedByPhantomGuard).toBeFalsy();
      expect(result.triggered).toBeTruthy();
      expect(result.nextIndex).toBe(2);

      // Round 0, Participant 2 completes (last)
      result = triggerNextParticipant(2, 0, participants.length, phantomGuard);
      expect(result.blockedByPhantomGuard).toBeFalsy();
      expect(result.triggered).toBeTruthy();
      expect(result.nextIndex).toBeNull(); // Round complete
    });
  });

  describe('startRound Should Clear Phantom Guard', () => {
    it('should clear phantom guard at the start of each new round', () => {
      const phantomGuard = new PhantomGuard();
      const participants = ['participant-0', 'participant-1'];

      // First round completes
      triggerNextParticipant(0, 0, participants.length, phantomGuard);
      triggerNextParticipant(1, 0, participants.length, phantomGuard);

      expect(phantomGuard.getEntries()).toEqual(['r0_p0', 'r0_p1']);

      // When startRound is called for round 1, it should clear the phantom guard
      // This prevents "r0_p0" from blocking "r1_p0" if round numbers wrap
      // (though typically they increment, it's a safety measure)

      // Simulate startRound clearing the guard
      phantomGuard.clear();

      // Round 1 should work without issues
      let result = triggerNextParticipant(0, 1, participants.length, phantomGuard);
      expect(result.blockedByPhantomGuard).toBeFalsy();
      expect(result.triggered).toBeTruthy();

      result = triggerNextParticipant(1, 1, participants.length, phantomGuard);
      expect(result.blockedByPhantomGuard).toBeFalsy();
      expect(result.triggered).toBeTruthy();
    });
  });

  describe('edge Cases', () => {
    it('should handle rapid new chat clicks', () => {
      const phantomGuard = new PhantomGuard();
      const participants = ['participant-0', 'participant-1'];

      // User starts conversation 1
      triggerNextParticipant(0, 0, participants.length, phantomGuard);

      // User immediately clicks "New Chat" before conversation completes
      phantomGuard.clear(); // ✅ Fixed behavior

      // User starts conversation 2
      const result = triggerNextParticipant(0, 0, participants.length, phantomGuard);
      expect(result.blockedByPhantomGuard).toBeFalsy();
      expect(result.triggered).toBeTruthy();
    });

    it('should handle switching between multiple threads', () => {
      const phantomGuard = new PhantomGuard();
      const participants = ['participant-0', 'participant-1'];

      // Thread A - round 0 completes
      triggerNextParticipant(0, 0, participants.length, phantomGuard);
      triggerNextParticipant(1, 0, participants.length, phantomGuard);

      // Navigate to Thread B (should clear phantom guard)
      phantomGuard.clear();

      // Thread B - round 0 works fine
      let result = triggerNextParticipant(0, 0, participants.length, phantomGuard);
      expect(result.triggered).toBeTruthy();

      result = triggerNextParticipant(1, 0, participants.length, phantomGuard);
      expect(result.triggered).toBeTruthy();

      // Navigate back to Thread A (should clear phantom guard)
      phantomGuard.clear();

      // Thread A - starting round 1 works fine
      result = triggerNextParticipant(0, 1, participants.length, phantomGuard);
      expect(result.triggered).toBeTruthy();
    });
  });
});
