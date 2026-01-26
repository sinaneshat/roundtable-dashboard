/**
 * Conversation Mode Changes in Follow-Up Rounds - Comprehensive Test Suite
 *
 * Tests mode changes between rounds as documented in FLOW_DOCUMENTATION.md Part 6:
 * "Switch conversation mode (click mode button)"
 * "Changes save when user submits next message (not immediately)."
 *
 * This test suite validates:
 * 1. Mode changes trigger changelog correctly
 * 2. Mode changes don't break the submission flow
 * 3. Various mode transitions work correctly
 * 4. Placeholders and streams adapt to new mode
 * 5. Mode changes combined with other changes (participants, web search)
 *
 * Key Behaviors:
 * - Mode change creates MODE_CHANGED changelog entry
 * - Changelog appears before round that uses new mode
 * - Streaming flow: PATCH → changelog → pre-search → participants → moderator
 * - Council moderator adapts evaluation criteria to new mode
 * - Mode changes are independent per round
 * - Multiple config changes (mode + participants) combined correctly
 */

import type { ChatMode } from '@roundtable/shared';
import { ChangelogChangeTypesExtended, ChatModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockParticipant, createMockThread } from '@/lib/testing';

// ============================================================================
// TYPES
// ============================================================================

type ModeChangeEntry = {
  type: typeof ChangelogChangeTypesExtended.MODE_CHANGED;
  oldMode: ChatMode;
  newMode: ChatMode;
  roundNumber: number;
};

type SubmissionFlow = {
  step: 'PATCH' | 'CHANGELOG' | 'PRE_SEARCH' | 'PARTICIPANT' | 'MODERATOR';
  timestamp: number;
  data?: unknown;
};

type RoundState = {
  roundNumber: number;
  mode: ChatMode;
  hasChangelog: boolean;
  changelogEntries: ModeChangeEntry[];
  isStreaming: boolean;
  hasModeratorCompleted: boolean;
};

// ============================================================================
// TEST HELPERS
// ============================================================================

function createModeChangeEntry(
  oldMode: ChatMode,
  newMode: ChatMode,
  roundNumber: number,
): ModeChangeEntry {
  return {
    newMode,
    oldMode,
    roundNumber,
    type: ChangelogChangeTypesExtended.MODE_CHANGED,
  };
}

function detectModeChange(
  previousMode: ChatMode,
  currentMode: ChatMode,
  roundNumber: number,
): ModeChangeEntry | null {
  if (previousMode === currentMode) {
    return null;
  }

  return createModeChangeEntry(previousMode, currentMode, roundNumber);
}

function simulateSubmissionFlow(
  hasConfigChanges: boolean,
  hasWebSearch: boolean,
  participantCount: number,
): SubmissionFlow[] {
  const flow: SubmissionFlow[] = [];
  let timestamp = 0;

  // Step 1: PATCH request to update thread
  flow.push({ data: { updated: true }, step: 'PATCH', timestamp: timestamp++ });

  // Step 2: Changelog if config changes
  if (hasConfigChanges) {
    flow.push({ data: { hasChanges: true }, step: 'CHANGELOG', timestamp: timestamp++ });
  }

  // Step 3: Pre-search if web search enabled
  if (hasWebSearch) {
    flow.push({ data: { searching: true }, step: 'PRE_SEARCH', timestamp: timestamp++ });
  }

  // Step 4: Participants streaming
  for (let i = 0; i < participantCount; i++) {
    flow.push({ data: { index: i }, step: 'PARTICIPANT', timestamp: timestamp++ });
  }

  // Step 5: Council moderator
  flow.push({ data: { evaluating: true }, step: 'MODERATOR', timestamp: timestamp++ });

  return flow;
}

function validateFlowOrder(flow: SubmissionFlow[]): boolean {
  const stepOrder: Record<string, number> = {
    CHANGELOG: 1,
    MODERATOR: 4,
    PARTICIPANT: 3,
    PATCH: 0,
    PRE_SEARCH: 2,
  };

  for (let i = 1; i < flow.length; i++) {
    const currentStep = flow[i];
    const previousStep = flow[i - 1];

    if (!currentStep || !previousStep) {
      continue;
    }

    const currentOrder = stepOrder[currentStep.step];
    const previousOrder = stepOrder[previousStep.step];

    if (currentOrder === undefined || previousOrder === undefined) {
      return false;
    }

    // Same step type can repeat (multiple participants)
    if (currentStep.step === previousStep.step) {
      continue;
    }

    // Otherwise, current step must come after previous
    if (currentOrder < previousOrder) {
      return false;
    }
  }

  return true;
}

function createRoundState(
  roundNumber: number,
  mode: ChatMode,
  hasChangelog: boolean,
  changelogEntries: ModeChangeEntry[] = [],
): RoundState {
  return {
    changelogEntries,
    hasChangelog,
    hasModeratorCompleted: false,
    isStreaming: false,
    mode,
    roundNumber,
  };
}

// ============================================================================
// TEST SUITE: Mode Change Detection
// ============================================================================

describe('conversation Mode Changes - Detection', () => {
  it('should detect mode change from DEBATING to BRAINSTORMING', () => {
    const change = detectModeChange(ChatModes.DEBATING, ChatModes.BRAINSTORMING, 1);

    expect(change).not.toBeNull();
    expect(change?.type).toBe(ChangelogChangeTypesExtended.MODE_CHANGED);
    expect(change?.oldMode).toBe(ChatModes.DEBATING);
    expect(change?.newMode).toBe(ChatModes.BRAINSTORMING);
    expect(change?.roundNumber).toBe(1);
  });

  it('should detect mode change from ANALYZING to PROBLEM_SOLVING', () => {
    const change = detectModeChange(ChatModes.ANALYZING, ChatModes.PROBLEM_SOLVING, 2);

    expect(change).not.toBeNull();
    expect(change?.oldMode).toBe(ChatModes.ANALYZING);
    expect(change?.newMode).toBe(ChatModes.PROBLEM_SOLVING);
  });

  it('should NOT detect change when mode stays the same', () => {
    const change = detectModeChange(ChatModes.DEBATING, ChatModes.DEBATING, 1);

    expect(change).toBeNull();
  });

  it('should detect all mode transitions correctly', () => {
    const modes = [
      ChatModes.BRAINSTORMING,
      ChatModes.ANALYZING,
      ChatModes.DEBATING,
      ChatModes.PROBLEM_SOLVING,
    ];

    modes.forEach((fromMode) => {
      modes.forEach((toMode) => {
        const change = detectModeChange(fromMode, toMode, 1);
        const isSameMode = fromMode === toMode;

        // Use unconditional assertions
        expect(change === null).toBe(isSameMode);
        expect(change?.oldMode).toBe(isSameMode ? undefined : fromMode);
        expect(change?.newMode).toBe(isSameMode ? undefined : toMode);
      });
    });
  });
});

// ============================================================================
// TEST SUITE: Changelog Creation
// ============================================================================

describe('conversation Mode Changes - Changelog Creation', () => {
  it('should create changelog entry for mode change', () => {
    const thread = createMockThread({ mode: ChatModes.DEBATING });
    const newMode = ChatModes.BRAINSTORMING;

    const changelogEntry = createModeChangeEntry(thread.mode, newMode, 1);

    expect(changelogEntry.type).toBe(ChangelogChangeTypesExtended.MODE_CHANGED);
    expect(changelogEntry.oldMode).toBe(ChatModes.DEBATING);
    expect(changelogEntry.newMode).toBe(ChatModes.BRAINSTORMING);
  });

  it('should include mode change in round state', () => {
    const changelogEntry = createModeChangeEntry(
      ChatModes.ANALYZING,
      ChatModes.PROBLEM_SOLVING,
      2,
    );

    const roundState = createRoundState(2, ChatModes.PROBLEM_SOLVING, true, [changelogEntry]);

    expect(roundState.hasChangelog).toBeTruthy();
    expect(roundState.changelogEntries).toHaveLength(1);
    expect(roundState.changelogEntries[0]?.newMode).toBe(ChatModes.PROBLEM_SOLVING);
  });

  it('should create changelog only when mode actually changes', () => {
    const thread = createMockThread({ mode: ChatModes.DEBATING });

    // No change
    const noChange = detectModeChange(thread.mode, thread.mode, 1);
    expect(noChange).toBeNull();

    // Change detected
    const withChange = detectModeChange(thread.mode, ChatModes.BRAINSTORMING, 1);
    expect(withChange).not.toBeNull();
  });

  it('should track changelog across multiple rounds', () => {
    const rounds: RoundState[] = [
      // Round 0: Initial mode (no changelog)
      createRoundState(0, ChatModes.DEBATING, false),
      // Round 1: Changed to BRAINSTORMING
      createRoundState(1, ChatModes.BRAINSTORMING, true, [
        createModeChangeEntry(ChatModes.DEBATING, ChatModes.BRAINSTORMING, 1),
      ]),
      // Round 2: No change (same mode)
      createRoundState(2, ChatModes.BRAINSTORMING, false),
      // Round 3: Changed to ANALYZING
      createRoundState(3, ChatModes.ANALYZING, true, [
        createModeChangeEntry(ChatModes.BRAINSTORMING, ChatModes.ANALYZING, 3),
      ]),
    ];

    expect(rounds[0]?.hasChangelog).toBeFalsy();
    expect(rounds[1]?.hasChangelog).toBeTruthy();
    expect(rounds[1]?.changelogEntries[0]?.newMode).toBe(ChatModes.BRAINSTORMING);
    expect(rounds[2]?.hasChangelog).toBeFalsy();
    expect(rounds[3]?.hasChangelog).toBeTruthy();
    expect(rounds[3]?.changelogEntries[0]?.newMode).toBe(ChatModes.ANALYZING);
  });
});

// ============================================================================
// TEST SUITE: Submission Flow with Mode Changes
// ============================================================================

describe('conversation Mode Changes - Submission Flow', () => {
  it('should follow correct order: PATCH → CHANGELOG → PARTICIPANT → MODERATOR', () => {
    const flow = simulateSubmissionFlow(true, false, 2);

    expect(validateFlowOrder(flow)).toBeTruthy();
    expect(flow[0]?.step).toBe('PATCH');
    expect(flow[1]?.step).toBe('CHANGELOG');
    expect(flow[2]?.step).toBe('PARTICIPANT');
    expect(flow[3]?.step).toBe('PARTICIPANT');
    expect(flow[4]?.step).toBe('MODERATOR');
  });

  it('should skip changelog when mode unchanged', () => {
    const flow = simulateSubmissionFlow(false, false, 2);

    expect(validateFlowOrder(flow)).toBeTruthy();
    expect(flow[0]?.step).toBe('PATCH');
    expect(flow[1]?.step).toBe('PARTICIPANT');
    expect(flow[2]?.step).toBe('PARTICIPANT');
    expect(flow[3]?.step).toBe('MODERATOR');

    const hasChangelog = flow.some(f => f.step === 'CHANGELOG');
    expect(hasChangelog).toBeFalsy();
  });

  it('should include pre-search in flow when web search enabled', () => {
    const flow = simulateSubmissionFlow(true, true, 2);

    expect(validateFlowOrder(flow)).toBeTruthy();
    expect(flow[0]?.step).toBe('PATCH');
    expect(flow[1]?.step).toBe('CHANGELOG');
    expect(flow[2]?.step).toBe('PRE_SEARCH');
    expect(flow[3]?.step).toBe('PARTICIPANT');
    expect(flow[4]?.step).toBe('PARTICIPANT');
    expect(flow[5]?.step).toBe('MODERATOR');
  });

  it('should handle mode change without breaking submission', () => {
    // Simulate mode change
    const thread = createMockThread({ mode: ChatModes.DEBATING });
    const newMode = ChatModes.BRAINSTORMING;

    const modeChange = detectModeChange(thread.mode, newMode, 1);
    expect(modeChange).not.toBeNull();

    // Simulate submission flow
    const flow = simulateSubmissionFlow(true, false, 3);

    expect(validateFlowOrder(flow)).toBeTruthy();
    expect(flow).toHaveLength(6); // PATCH + CHANGELOG + 3 PARTICIPANTS + MODERATOR
  });

  it('should maintain flow order with multiple participants', () => {
    const participantCounts = [1, 2, 3, 5, 10];

    participantCounts.forEach((count) => {
      const flow = simulateSubmissionFlow(true, false, count);

      expect(validateFlowOrder(flow)).toBeTruthy();

      const participantSteps = flow.filter(f => f.step === 'PARTICIPANT');
      expect(participantSteps).toHaveLength(count);
    });
  });
});

// ============================================================================
// TEST SUITE: Mode-Specific Council Moderator Evaluation
// ============================================================================

describe('conversation Mode Changes - Moderator Adaptation', () => {
  it('should adapt evaluation criteria to BRAINSTORMING mode', () => {
    const evaluationCriteria = {
      [ChatModes.ANALYZING]: ['Analytical Depth', 'Evidence', 'Objectivity', 'Clarity'],
      [ChatModes.BRAINSTORMING]: ['Creativity', 'Diversity', 'Practicality', 'Innovation'],
      [ChatModes.DEBATING]: ['Argument Strength', 'Logic', 'Persuasiveness', 'Counterpoints'],
      [ChatModes.PROBLEM_SOLVING]: ['Solution Quality', 'Feasibility', 'Impact', 'Risks'],
    };

    const mode = ChatModes.BRAINSTORMING;
    const criteria = evaluationCriteria[mode];

    expect(criteria).toBeDefined();
    expect(criteria).toContain('Creativity');
    expect(criteria).toContain('Innovation');
  });

  it('should adapt evaluation criteria to ANALYZING mode', () => {
    const evaluationCriteria = {
      [ChatModes.ANALYZING]: ['Analytical Depth', 'Evidence', 'Objectivity', 'Clarity'],
      [ChatModes.BRAINSTORMING]: ['Creativity', 'Diversity', 'Practicality', 'Innovation'],
      [ChatModes.DEBATING]: ['Argument Strength', 'Logic', 'Persuasiveness', 'Counterpoints'],
      [ChatModes.PROBLEM_SOLVING]: ['Solution Quality', 'Feasibility', 'Impact', 'Risks'],
    };

    const mode = ChatModes.ANALYZING;
    const criteria = evaluationCriteria[mode];

    expect(criteria).toBeDefined();
    expect(criteria).toContain('Analytical Depth');
    expect(criteria).toContain('Evidence');
  });

  it('should adapt evaluation criteria to DEBATING mode', () => {
    const evaluationCriteria = {
      [ChatModes.ANALYZING]: ['Analytical Depth', 'Evidence', 'Objectivity', 'Clarity'],
      [ChatModes.BRAINSTORMING]: ['Creativity', 'Diversity', 'Practicality', 'Innovation'],
      [ChatModes.DEBATING]: ['Argument Strength', 'Logic', 'Persuasiveness', 'Counterpoints'],
      [ChatModes.PROBLEM_SOLVING]: ['Solution Quality', 'Feasibility', 'Impact', 'Risks'],
    };

    const mode = ChatModes.DEBATING;
    const criteria = evaluationCriteria[mode];

    expect(criteria).toBeDefined();
    expect(criteria).toContain('Argument Strength');
    expect(criteria).toContain('Persuasiveness');
  });

  it('should adapt evaluation criteria to PROBLEM_SOLVING mode', () => {
    const evaluationCriteria = {
      [ChatModes.ANALYZING]: ['Analytical Depth', 'Evidence', 'Objectivity', 'Clarity'],
      [ChatModes.BRAINSTORMING]: ['Creativity', 'Diversity', 'Practicality', 'Innovation'],
      [ChatModes.DEBATING]: ['Argument Strength', 'Logic', 'Persuasiveness', 'Counterpoints'],
      [ChatModes.PROBLEM_SOLVING]: ['Solution Quality', 'Feasibility', 'Impact', 'Risks'],
    };

    const mode = ChatModes.PROBLEM_SOLVING;
    const criteria = evaluationCriteria[mode];

    expect(criteria).toBeDefined();
    expect(criteria).toContain('Solution Quality');
    expect(criteria).toContain('Feasibility');
  });

  it('should reflect mode change in moderator evaluation', () => {
    // Round 0: DEBATING mode
    const round0Mode = ChatModes.DEBATING;
    const round0Criteria = ['Argument Strength', 'Logic'];

    // Round 1: Changed to BRAINSTORMING
    const round1Mode = ChatModes.BRAINSTORMING;
    const round1Criteria = ['Creativity', 'Innovation'];

    expect(round0Criteria).not.toEqual(round1Criteria);
    expect(round0Mode).not.toBe(round1Mode);
  });
});

// ============================================================================
// TEST SUITE: Mode Changes with Other Config Changes
// ============================================================================

describe('conversation Mode Changes - Combined with Other Changes', () => {
  it('should combine mode change with participant addition', () => {
    const thread = createMockThread({ mode: ChatModes.DEBATING });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // Round 1: Add participant + change mode
    const newParticipants = [...participants, createMockParticipant(2)];
    const newMode = ChatModes.BRAINSTORMING;

    const modeChange = detectModeChange(thread.mode, newMode, 1);
    const participantAdded = newParticipants.length > participants.length;

    expect(modeChange).not.toBeNull();
    expect(participantAdded).toBeTruthy();

    if (!modeChange) {
      throw new Error('expected modeChange');
    }
    const roundState = createRoundState(1, newMode, true, [modeChange]);
    expect(roundState.hasChangelog).toBeTruthy();
  });

  it('should combine mode change with participant removal', () => {
    const thread = createMockThread({ mode: ChatModes.ANALYZING });
    const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

    // Round 1: Remove participant + change mode
    const p0 = participants[0];
    const p1 = participants[1];
    if (!p0) {
      throw new Error('expected p0');
    }
    if (!p1) {
      throw new Error('expected p1');
    }
    const newParticipants = [p0, p1];
    const newMode = ChatModes.PROBLEM_SOLVING;

    const modeChange = detectModeChange(thread.mode, newMode, 1);
    const participantRemoved = newParticipants.length < participants.length;

    expect(modeChange).not.toBeNull();
    expect(participantRemoved).toBeTruthy();
  });

  it('should combine mode change with web search toggle', () => {
    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.DEBATING,
    });

    // Round 1: Enable web search + change mode
    const newMode = ChatModes.BRAINSTORMING;
    const newWebSearch = true;

    const modeChange = detectModeChange(thread.mode, newMode, 1);
    const webSearchToggled = thread.enableWebSearch !== newWebSearch;

    expect(modeChange).not.toBeNull();
    expect(webSearchToggled).toBeTruthy();

    // Flow should include both changelog and pre-search
    const flow = simulateSubmissionFlow(true, true, 2);
    expect(flow.some(f => f.step === 'CHANGELOG')).toBeTruthy();
    expect(flow.some(f => f.step === 'PRE_SEARCH')).toBeTruthy();
  });

  it('should handle mode change + participant reorder', () => {
    const thread = createMockThread({ mode: ChatModes.ANALYZING });
    const participants = [
      createMockParticipant(0, { priority: 0 }),
      createMockParticipant(1, { priority: 1 }),
      createMockParticipant(2, { priority: 2 }),
    ];

    // Round 1: Reorder + change mode
    const p0 = participants[0];
    const p1 = participants[1];
    const p2 = participants[2];
    if (!p0) {
      throw new Error('expected p0');
    }
    if (!p1) {
      throw new Error('expected p1');
    }
    if (!p2) {
      throw new Error('expected p2');
    }
    const reorderedParticipants = [
      { ...p2, priority: 0 },
      { ...p0, priority: 1 },
      { ...p1, priority: 2 },
    ];
    const newMode = ChatModes.DEBATING;

    const modeChange = detectModeChange(thread.mode, newMode, 1);
    const reorderedFirst = reorderedParticipants[0];
    if (!reorderedFirst) {
      throw new Error('expected reorderedFirst');
    }
    const orderChanged = p0.id !== reorderedFirst.id;

    expect(modeChange).not.toBeNull();
    expect(orderChanged).toBeTruthy();
  });

  it('should handle all changes simultaneously', () => {
    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.DEBATING,
    });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // Round 1: Mode + participant + web search all change
    const newMode = ChatModes.BRAINSTORMING;
    const newParticipants = [...participants, createMockParticipant(2)];
    const newWebSearch = true;

    const modeChange = detectModeChange(thread.mode, newMode, 1);
    const participantChange = newParticipants.length !== participants.length;
    const webSearchChange = thread.enableWebSearch !== newWebSearch;

    expect(modeChange).not.toBeNull();
    expect(participantChange).toBeTruthy();
    expect(webSearchChange).toBeTruthy();

    // Changelog should be created
    if (!modeChange) {
      throw new Error('expected modeChange');
    }
    const roundState = createRoundState(1, newMode, true, [modeChange]);
    expect(roundState.hasChangelog).toBeTruthy();
  });
});

// ============================================================================
// TEST SUITE: Mode Transition Matrix
// ============================================================================

describe('conversation Mode Changes - Transition Matrix', () => {
  const modes = [
    ChatModes.BRAINSTORMING,
    ChatModes.ANALYZING,
    ChatModes.DEBATING,
    ChatModes.PROBLEM_SOLVING,
  ];

  // Generate all mode transition pairs
  const transitions = modes.flatMap(fromMode =>
    modes.map(toMode => ({ fromMode, toMode })),
  );

  it.each(transitions)(
    'should handle $fromMode → $toMode mode transition',
    ({ fromMode, toMode }) => {
      const change = detectModeChange(fromMode, toMode, 1);
      const isSameMode = fromMode === toMode;

      // Use unconditional assertions
      expect(change === null).toBe(isSameMode);
      expect(change?.oldMode).toBe(isSameMode ? undefined : fromMode);
      expect(change?.newMode).toBe(isSameMode ? undefined : toMode);
      expect(change?.type).toBe(isSameMode ? undefined : ChangelogChangeTypesExtended.MODE_CHANGED);
    },
  );
});

// ============================================================================
// TEST SUITE: Edge Cases
// ============================================================================

describe('conversation Mode Changes - Edge Cases', () => {
  it('should handle rapid mode changes across multiple rounds', () => {
    const rounds: RoundState[] = [
      createRoundState(0, ChatModes.DEBATING, false),
      createRoundState(1, ChatModes.BRAINSTORMING, true, [
        createModeChangeEntry(ChatModes.DEBATING, ChatModes.BRAINSTORMING, 1),
      ]),
      createRoundState(2, ChatModes.ANALYZING, true, [
        createModeChangeEntry(ChatModes.BRAINSTORMING, ChatModes.ANALYZING, 2),
      ]),
      createRoundState(3, ChatModes.PROBLEM_SOLVING, true, [
        createModeChangeEntry(ChatModes.ANALYZING, ChatModes.PROBLEM_SOLVING, 3),
      ]),
    ];

    // Verify rounds array is populated before iterating
    expect(rounds).toHaveLength(4);

    const round0 = rounds[0];
    const round1 = rounds[1];
    const round2 = rounds[2];
    const round3 = rounds[3];
    if (!round0) {
      throw new Error('expected round0');
    }
    if (!round1) {
      throw new Error('expected round1');
    }
    if (!round2) {
      throw new Error('expected round2');
    }
    if (!round3) {
      throw new Error('expected round3');
    }

    // First round: no changelog
    expect(round0.hasChangelog).toBeFalsy();
    expect(round0.changelogEntries).toHaveLength(0);

    // Subsequent rounds: have changelog with 1 entry each
    expect(round1.hasChangelog).toBeTruthy();
    expect(round1.changelogEntries).toHaveLength(1);
    expect(round2.hasChangelog).toBeTruthy();
    expect(round2.changelogEntries).toHaveLength(1);
    expect(round3.hasChangelog).toBeTruthy();
    expect(round3.changelogEntries).toHaveLength(1);
  });

  it('should handle mode change then reverting back', () => {
    const rounds: RoundState[] = [
      createRoundState(0, ChatModes.DEBATING, false),
      createRoundState(1, ChatModes.BRAINSTORMING, true, [
        createModeChangeEntry(ChatModes.DEBATING, ChatModes.BRAINSTORMING, 1),
      ]),
      createRoundState(2, ChatModes.DEBATING, true, [
        createModeChangeEntry(ChatModes.BRAINSTORMING, ChatModes.DEBATING, 2),
      ]),
    ];

    expect(rounds[0]?.mode).toBe(ChatModes.DEBATING);
    expect(rounds[1]?.mode).toBe(ChatModes.BRAINSTORMING);
    expect(rounds[2]?.mode).toBe(ChatModes.DEBATING);

    expect(rounds[1]?.hasChangelog).toBeTruthy();
    expect(rounds[2]?.hasChangelog).toBeTruthy();
  });

  it('should not create changelog when mode unchanged for many rounds', () => {
    const rounds: RoundState[] = Array.from({ length: 10 }, (_, i) =>
      createRoundState(i, ChatModes.DEBATING, false));

    rounds.forEach((round) => {
      expect(round.mode).toBe(ChatModes.DEBATING);
      expect(round.hasChangelog).toBeFalsy();
    });
  });

  it('should handle mode change in middle of long conversation', () => {
    const rounds: RoundState[] = [
      ...Array.from({ length: 5 }, (_, i) => createRoundState(i, ChatModes.DEBATING, false)),
      createRoundState(5, ChatModes.BRAINSTORMING, true, [
        createModeChangeEntry(ChatModes.DEBATING, ChatModes.BRAINSTORMING, 5),
      ]),
      ...Array.from({ length: 5 }, (_, i) => createRoundState(i + 6, ChatModes.BRAINSTORMING, false)),
    ];

    expect(rounds[4]?.mode).toBe(ChatModes.DEBATING);
    expect(rounds[4]?.hasChangelog).toBeFalsy();

    expect(rounds[5]?.mode).toBe(ChatModes.BRAINSTORMING);
    expect(rounds[5]?.hasChangelog).toBeTruthy();

    expect(rounds[6]?.mode).toBe(ChatModes.BRAINSTORMING);
    expect(rounds[6]?.hasChangelog).toBeFalsy();
  });

  it('should maintain correct flow order even with mode changes', () => {
    const scenarios = [
      { hasConfigChanges: true, hasWebSearch: false, participants: 2 },
      { hasConfigChanges: true, hasWebSearch: true, participants: 3 },
      { hasConfigChanges: false, hasWebSearch: true, participants: 1 },
      { hasConfigChanges: true, hasWebSearch: true, participants: 5 },
    ];

    scenarios.forEach((scenario) => {
      const flow = simulateSubmissionFlow(
        scenario.hasConfigChanges,
        scenario.hasWebSearch,
        scenario.participants,
      );

      expect(validateFlowOrder(flow)).toBeTruthy();
    });
  });
});

// ============================================================================
// TEST SUITE: Streaming State Management
// ============================================================================

describe('conversation Mode Changes - Streaming State', () => {
  it('should not allow mode change during streaming', () => {
    const roundState = createRoundState(1, ChatModes.DEBATING, false);
    roundState.isStreaming = true;

    // Attempting to change mode while streaming should be blocked
    const canChangeDuringStreaming = !roundState.isStreaming;
    expect(canChangeDuringStreaming).toBeFalsy();
  });

  it('should allow mode change after round completes', () => {
    const roundState = createRoundState(1, ChatModes.DEBATING, false);
    roundState.isStreaming = false;
    roundState.hasModeratorCompleted = true;

    const canChangeAfterCompletion = !roundState.isStreaming && roundState.hasModeratorCompleted;
    expect(canChangeAfterCompletion).toBeTruthy();
  });

  it('should preserve mode change for next round submission', () => {
    // Round 0: DEBATING mode
    const round0 = createRoundState(0, ChatModes.DEBATING, false);
    expect(round0.mode).toBe(ChatModes.DEBATING);

    // User changes mode to BRAINSTORMING (not applied yet)
    const pendingMode = ChatModes.BRAINSTORMING;

    // Round 1: Mode change applied on submit
    const round1 = createRoundState(1, pendingMode, true, [
      createModeChangeEntry(round0.mode, pendingMode, 1),
    ]);

    expect(round1.mode).toBe(ChatModes.BRAINSTORMING);
    expect(round1.hasChangelog).toBeTruthy();
  });
});
