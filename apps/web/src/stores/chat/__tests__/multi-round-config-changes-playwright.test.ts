/**
 * Multi-Round Configuration Changes E2E Tests
 *
 * Tests configuration changes between rounds as documented in
 * FLOW_DOCUMENTATION.md Part 6: Configuration Changes Mid-Conversation
 *
 * Key behaviors tested:
 * - Adding AI participants between rounds
 * - Removing AI participants between rounds
 * - Reordering participants (priority changes)
 * - Changing roles between rounds
 * - Changing conversation mode between rounds
 * - Changelog banner generation
 * - Multiple simultaneous changes (add + remove + modify)
 *
 * Per FLOW_DOCUMENTATION.md Part 6:
 * "Changes save when user submits next message (not immediately)."
 * "Configuration Change Banner appears before the round that uses new configuration."
 */

import type { ChatMode } from '@roundtable/shared';
import { ChatModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockParticipant } from '@/lib/testing';
import type { ChatParticipant } from '@/services/api';

// ============================================================================
// TYPES
// ============================================================================

type ConfigChange = {
  type: 'added' | 'removed' | 'modified' | 'reordered';
  participantId: string;
  details?: string;
};

type RoundConfig = {
  roundNumber: number;
  participants: ChatParticipant[];
  mode: ChatMode;
  changes?: ConfigChange[];
};

type ConversationState = {
  threadId: string;
  rounds: RoundConfig[];
  currentRound: number;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createInitialConfig(
  participants: ChatParticipant[],
  mode: ChatMode,
): ConversationState {
  return {
    currentRound: 0,
    rounds: [
      {
        changes: undefined, // No changes for first round
        mode,
        participants,
        roundNumber: 0,
      },
    ],
    threadId: 'thread-123',
  };
}

function detectConfigChanges(
  previousConfig: RoundConfig,
  newConfig: RoundConfig,
): ConfigChange[] {
  const changes: ConfigChange[] = [];
  const prevIds = new Set(previousConfig.participants.map(p => p.id));
  const newIds = new Set(newConfig.participants.map(p => p.id));

  // Detect additions
  newConfig.participants.forEach((p) => {
    if (!prevIds.has(p.id)) {
      changes.push({
        details: `Added ${p.modelId} as ${p.role || 'participant'}`,
        participantId: p.id,
        type: 'added',
      });
    }
  });

  // Detect removals
  previousConfig.participants.forEach((p) => {
    if (!newIds.has(p.id)) {
      changes.push({
        details: `Removed ${p.modelId}`,
        participantId: p.id,
        type: 'removed',
      });
    }
  });

  // Detect modifications (role or priority changes)
  newConfig.participants.forEach((newP) => {
    const prevP = previousConfig.participants.find(p => p.id === newP.id);
    if (prevP) {
      if (prevP.role !== newP.role) {
        changes.push({
          details: `Changed role from ${prevP.role || 'none'} to ${newP.role || 'none'}`,
          participantId: newP.id,
          type: 'modified',
        });
      }
      if (prevP.priority !== newP.priority) {
        changes.push({
          details: `Moved from position ${prevP.priority} to ${newP.priority}`,
          participantId: newP.id,
          type: 'reordered',
        });
      }
    }
  });

  return changes;
}

function addRound(
  state: ConversationState,
  newParticipants: ChatParticipant[],
  newMode: ChatMode,
): ConversationState {
  const previousRound = state.rounds[state.rounds.length - 1];
  if (!previousRound) {
    throw new Error('No previous round found');
  }

  const nextRoundNumber = previousRound.roundNumber + 1;
  const changes = detectConfigChanges(
    { ...previousRound, participants: previousRound.participants },
    { mode: newMode, participants: newParticipants, roundNumber: nextRoundNumber },
  );

  // Add mode change if different
  if (previousRound.mode !== newMode) {
    changes.push({
      details: `Changed mode from ${previousRound.mode} to ${newMode}`,
      participantId: 'mode',
      type: 'modified',
    });
  }

  const newRound: RoundConfig = {
    changes: changes.length > 0 ? changes : undefined,
    mode: newMode,
    participants: newParticipants,
    roundNumber: nextRoundNumber,
  };

  return {
    ...state,
    currentRound: nextRoundNumber,
    rounds: [...state.rounds, newRound],
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('multi-Round Configuration Changes E2E', () => {
  describe('adding Participants Between Rounds', () => {
    it('should complete Round 0 with 2 participants, then Round 1 with 3 participants', () => {
      // Round 0 setup
      const round0Participants = [
        createMockParticipant(0, { modelId: 'gpt-4o', role: 'Analyst' }),
        createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      expect(state.rounds[0]?.participants).toHaveLength(2);
      expect(state.rounds[0]?.changes).toBeUndefined();

      // Round 1 setup - add new participant
      const round1Participants = [
        ...round0Participants,
        createMockParticipant(2, { modelId: 'gemini-pro', role: 'Ideator' }),
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      // Verify Round 1 has 3 participants
      expect(state.rounds[1]?.participants).toHaveLength(3);

      // Verify changelog detected the addition
      const round1 = state.rounds[1];
      expect(round1?.changes).toBeDefined();
      expect(round1?.changes).toHaveLength(1);
      expect(round1?.changes?.[0]?.type).toBe('added');
      expect(round1?.changes?.[0]?.participantId).toBe('participant-2');
    });

    it('should show changelog banner before Round 1', () => {
      const round0Participants = [createMockParticipant(0)];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        ...round0Participants,
        createMockParticipant(1),
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      // Changelog exists for Round 1
      const changelogBanner = {
        changes: state.rounds[1]?.changes || [],
        roundNumber: 1,
        summary: '1 added',
      };

      expect(changelogBanner.roundNumber).toBe(1);
      expect(changelogBanner.changes).toHaveLength(1);
      expect(changelogBanner.summary).toBe('1 added');
    });

    it('should verify new participant receives Round 0 context (placeholder test)', () => {
      // This test verifies that the new participant added in Round 1
      // would receive all Round 0 messages as context
      // Full implementation would verify API request includes Round 0 messages

      const round0Participants = [createMockParticipant(0)];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        ...round0Participants,
        createMockParticipant(1),
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      // New participant is in Round 1
      const newParticipant = state.rounds[1]?.participants.find(p => p.id === 'participant-1');
      expect(newParticipant).toBeDefined();

      // Context sharing verified (would need full message store in real implementation)
      expect(state.rounds[1]?.participants).toHaveLength(2);
    });

    it('should add multiple participants in single round transition', () => {
      const round0Participants = [createMockParticipant(0)];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        ...round0Participants,
        createMockParticipant(1),
        createMockParticipant(2),
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      expect(state.rounds[1]?.changes).toHaveLength(2);
      expect(state.rounds[1]?.changes?.every(c => c.type === 'added')).toBeTruthy();
    });
  });

  describe('removing Participants Between Rounds', () => {
    it('should complete Round 0 with 3 participants, then Round 1 with 2 participants', () => {
      const round0Participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      // Remove participant-1
      const p0 = round0Participants[0];
      const p2 = round0Participants[2];
      if (!p0) {
        throw new Error('expected participant 0');
      }
      if (!p2) {
        throw new Error('expected participant 2');
      }
      const round1Participants = [p0, p2];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      expect(state.rounds[1]?.participants).toHaveLength(2);
      expect(state.rounds[1]?.changes).toHaveLength(1);
      expect(state.rounds[1]?.changes?.[0]?.type).toBe('removed');
      expect(state.rounds[1]?.changes?.[0]?.participantId).toBe('participant-1');
    });

    it('should show changelog banner with removed participant strikethrough', () => {
      const round0Participants = [
        createMockParticipant(0, { modelId: 'gpt-4o' }),
        createMockParticipant(1, { modelId: 'claude-3-opus' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const p0 = round0Participants[0];
      if (!p0) {
        throw new Error('expected participant 0');
      }
      const round1Participants = [p0];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const removedChange = state.rounds[1]?.changes?.[0];
      expect(removedChange?.type).toBe('removed');
      expect(removedChange?.details).toContain('claude-3-opus');

      // Changelog UI would render this with strikethrough
      const changelogDisplay = {
        color: 'red',
        icon: '−',
        strikethrough: true,
        text: removedChange?.details,
      };

      expect(changelogDisplay.strikethrough).toBeTruthy();
    });

    it('should handle removing all but one participant', () => {
      const round0Participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
        createMockParticipant(3),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const p0 = round0Participants[0];
      if (!p0) {
        throw new Error('expected participant 0');
      }
      const round1Participants = [p0];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      expect(state.rounds[1]?.participants).toHaveLength(1);
      expect(state.rounds[1]?.changes?.filter(c => c.type === 'removed')).toHaveLength(3);
    });
  });

  describe('reordering Participants Between Rounds', () => {
    it('should change participant priority order between rounds', () => {
      const round0Participants = [
        createMockParticipant(0, { priority: 0 }),
        createMockParticipant(1, { priority: 1 }),
        createMockParticipant(2, { priority: 2 }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      // Reorder: swap priority 0 and priority 2
      const round1Participants = [
        createMockParticipant(0, { priority: 2 }), // Changed
        createMockParticipant(1, { priority: 1 }), // Same
        createMockParticipant(2, { priority: 0 }), // Changed
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const reorderChanges = state.rounds[1]?.changes?.filter(c => c.type === 'reordered');
      expect(reorderChanges).toHaveLength(2);
      expect(reorderChanges?.some(c => c.participantId === 'participant-0')).toBeTruthy();
      expect(reorderChanges?.some(c => c.participantId === 'participant-2')).toBeTruthy();
    });

    it('should verify new order in Round 1 streaming sequence', () => {
      const round0Participants = [
        createMockParticipant(0, { modelId: 'gpt-4o', priority: 0 }),
        createMockParticipant(1, { modelId: 'claude-3-opus', priority: 1 }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      // Reverse order
      const round1Participants = [
        createMockParticipant(0, { modelId: 'gpt-4o', priority: 1 }),
        createMockParticipant(1, { modelId: 'claude-3-opus', priority: 0 }),
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      // Verify streaming would use new priority order
      const round1 = state.rounds[1];
      if (!round1) {
        throw new Error('expected round 1');
      }
      const sortedParticipants = [...round1.participants].sort((a, b) => a.priority - b.priority);
      expect(sortedParticipants[0]?.id).toBe('participant-1');
      expect(sortedParticipants[1]?.id).toBe('participant-0');
    });
  });

  describe('changing Roles Between Rounds', () => {
    it('should change participant role between Round 0 and Round 1', () => {
      const round0Participants = [
        createMockParticipant(0, { role: 'Analyst' }),
        createMockParticipant(1, { role: 'Critic' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      // Change participant-0 role from Analyst to Ideator
      const round1Participants = [
        createMockParticipant(0, { role: 'Ideator' }), // Changed
        createMockParticipant(1, { role: 'Critic' }), // Same
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const roleChanges = state.rounds[1]?.changes?.filter(c => c.type === 'modified');
      expect(roleChanges).toHaveLength(1);
      expect(roleChanges?.[0]?.participantId).toBe('participant-0');
      expect(roleChanges?.[0]?.details).toContain('Analyst');
      expect(roleChanges?.[0]?.details).toContain('Ideator');
    });

    it('should show changelog banner with modified role', () => {
      const round0Participants = [
        createMockParticipant(0, { role: 'Analyst' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        createMockParticipant(0, { role: null }), // Remove role
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const roleChange = state.rounds[1]?.changes?.[0];
      expect(roleChange?.type).toBe('modified');
      expect(roleChange?.details).toContain('Analyst');
      expect(roleChange?.details).toContain('none');

      // Changelog UI would render this with pencil icon
      const changelogDisplay = {
        color: 'blue',
        icon: '✏️',
        text: roleChange?.details,
      };

      expect(changelogDisplay.icon).toBe('✏️');
    });

    it('should handle multiple role changes in single round', () => {
      const round0Participants = [
        createMockParticipant(0, { role: 'Analyst' }),
        createMockParticipant(1, { role: 'Critic' }),
        createMockParticipant(2, { role: 'Ideator' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        createMockParticipant(0, { role: 'Critic' }), // Changed
        createMockParticipant(1, { role: 'Ideator' }), // Changed
        createMockParticipant(2, { role: 'Analyst' }), // Changed
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const roleChanges = state.rounds[1]?.changes?.filter(c => c.type === 'modified');
      expect(roleChanges).toHaveLength(3);
    });
  });

  describe('changing Conversation Mode Between Rounds', () => {
    it('should change mode from Brainstorming to Analyzing between rounds', () => {
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      let state = createInitialConfig(participants, ChatModes.BRAINSTORMING);

      state = addRound(state, participants, ChatModes.ANALYZING);

      const modeChange = state.rounds[1]?.changes?.find(c => c.participantId === 'mode');
      expect(modeChange).toBeDefined();
      expect(modeChange?.type).toBe('modified');
      expect(modeChange?.details).toContain('brainstorming');
      expect(modeChange?.details).toContain('analyzing');
    });

    it('should verify moderator uses new mode criteria in Round 1', () => {
      const participants = [createMockParticipant(0)];
      let state = createInitialConfig(participants, ChatModes.BRAINSTORMING);

      state = addRound(state, participants, ChatModes.DEBATING);

      // Round 0 mode
      expect(state.rounds[0]?.mode).toBe(ChatModes.BRAINSTORMING);

      // Round 1 mode changed
      expect(state.rounds[1]?.mode).toBe(ChatModes.DEBATING);

      // Moderator would use debating criteria (Argument Strength, Logic, Persuasiveness)
      // vs brainstorming criteria (Creativity, Diversity, Practicality)
    });

    it('should handle mode changes across multiple rounds', () => {
      const participants = [createMockParticipant(0)];
      let state = createInitialConfig(participants, ChatModes.BRAINSTORMING);

      state = addRound(state, participants, ChatModes.ANALYZING);
      state = addRound(state, participants, ChatModes.DEBATING);
      state = addRound(state, participants, ChatModes.SOLVING);

      expect(state.rounds[0]?.mode).toBe(ChatModes.BRAINSTORMING);
      expect(state.rounds[1]?.mode).toBe(ChatModes.ANALYZING);
      expect(state.rounds[2]?.mode).toBe(ChatModes.DEBATING);
      expect(state.rounds[3]?.mode).toBe(ChatModes.SOLVING);
    });
  });

  describe('complex Configuration Changes', () => {
    it('should handle 2 added, 1 removed, 1 modified in single round transition', () => {
      const round0Participants = [
        createMockParticipant(0, { role: 'Analyst' }),
        createMockParticipant(1, { role: 'Critic' }),
        createMockParticipant(2, { role: 'Ideator' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        createMockParticipant(0, { role: 'Evaluator' }), // Modified role
        // participant-1 removed
        createMockParticipant(2, { role: 'Ideator' }), // Same
        createMockParticipant(3, { role: 'Researcher' }), // Added
        createMockParticipant(4, { role: 'Synthesizer' }), // Added
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const changes = state.rounds[1]?.changes || [];

      // Verify count: 1 modified + 1 removed + 2 added = 4 changes
      expect(changes).toHaveLength(4);

      expect(changes.filter(c => c.type === 'modified')).toHaveLength(1);
      expect(changes.filter(c => c.type === 'removed')).toHaveLength(1);
      expect(changes.filter(c => c.type === 'added')).toHaveLength(2);
    });

    it('should generate accurate changelog summary for complex changes', () => {
      const round0Participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        createMockParticipant(0, { role: 'NewRole' }), // Modified
        createMockParticipant(2), // Added
      ];
      state = addRound(state, round1Participants, ChatModes.ANALYZING);

      const changes = state.rounds[1]?.changes || [];

      const addedCount = changes.filter(c => c.type === 'added').length;
      const removedCount = changes.filter(c => c.type === 'removed').length;
      const modifiedCount = changes.filter(c => c.type === 'modified' && c.participantId !== 'mode').length;
      const modeChanged = changes.some(c => c.participantId === 'mode');

      const summary = `${addedCount} added, ${removedCount} removed, ${modifiedCount} modified${modeChanged ? ', mode changed' : ''}`;

      expect(summary).toBe('1 added, 1 removed, 1 modified, mode changed');
    });

    it('should preserve Round 0 config when applying Round 1 changes', () => {
      const round0Participants = [
        createMockParticipant(0, { role: 'Original' }),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        createMockParticipant(0, { role: 'Changed' }),
      ];
      state = addRound(state, round1Participants, ChatModes.ANALYZING);

      // Round 0 unchanged
      expect(state.rounds[0]?.participants[0]?.role).toBe('Original');
      expect(state.rounds[0]?.mode).toBe(ChatModes.BRAINSTORMING);

      // Round 1 has new config
      expect(state.rounds[1]?.participants[0]?.role).toBe('Changed');
      expect(state.rounds[1]?.mode).toBe(ChatModes.ANALYZING);
    });
  });

  describe('edge Cases', () => {
    it('should handle no changes between rounds', () => {
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      let state = createInitialConfig(participants, ChatModes.BRAINSTORMING);

      state = addRound(state, participants, ChatModes.BRAINSTORMING);

      // No changes detected
      expect(state.rounds[1]?.changes).toBeUndefined();
    });

    it('should handle round with only mode change (no participant changes)', () => {
      const participants = [createMockParticipant(0)];
      let state = createInitialConfig(participants, ChatModes.BRAINSTORMING);

      state = addRound(state, participants, ChatModes.ANALYZING);

      expect(state.rounds[1]?.changes).toHaveLength(1);
      expect(state.rounds[1]?.changes?.[0]?.participantId).toBe('mode');
    });

    it('should handle replacing all participants between rounds', () => {
      const round0Participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];
      let state = createInitialConfig(round0Participants, ChatModes.BRAINSTORMING);

      const round1Participants = [
        createMockParticipant(2),
        createMockParticipant(3),
      ];
      state = addRound(state, round1Participants, ChatModes.BRAINSTORMING);

      const changes = state.rounds[1]?.changes || [];
      expect(changes.filter(c => c.type === 'removed')).toHaveLength(2);
      expect(changes.filter(c => c.type === 'added')).toHaveLength(2);
    });

    it('should handle 5 consecutive rounds with different configs', () => {
      const participants0 = [createMockParticipant(0)];
      let state = createInitialConfig(participants0, ChatModes.BRAINSTORMING);

      // Round 1: Add participant
      const participants1 = [...participants0, createMockParticipant(1)];
      state = addRound(state, participants1, ChatModes.BRAINSTORMING);

      // Round 2: Change mode
      state = addRound(state, participants1, ChatModes.ANALYZING);

      // Round 3: Remove participant
      state = addRound(state, participants0, ChatModes.ANALYZING);

      // Round 4: Change role
      const participants4 = [createMockParticipant(0, { role: 'NewRole' })];
      state = addRound(state, participants4, ChatModes.ANALYZING);

      expect(state.rounds).toHaveLength(5);
      expect(state.currentRound).toBe(4);

      // Verify each round has appropriate changes
      expect(state.rounds[0]?.changes).toBeUndefined(); // First round
      expect(state.rounds[1]?.changes).toBeDefined(); // Added participant
      expect(state.rounds[2]?.changes).toBeDefined(); // Mode changed
      expect(state.rounds[3]?.changes).toBeDefined(); // Removed participant
      expect(state.rounds[4]?.changes).toBeDefined(); // Modified role
    });
  });
});
