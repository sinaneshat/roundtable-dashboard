import { describe, expect, it } from 'vitest';

/**
 * Configuration Change Between Rounds Tests
 *
 * Tests detecting and displaying configuration changes:
 * - Participant additions (new models added)
 * - Participant removals (models removed)
 * - Participant modifications (role changes, reordering)
 * - Mode changes (Brainstorm → Debate, etc.)
 * - Changelog creation and display
 * - Multiple simultaneous changes
 */

// Types matching actual implementation
type ParticipantConfig = {
  id: string;
  modelId: string;
  role: string | null;
  priority: number;
  isEnabled: boolean;
};

type ConversationMode = 'brainstorm' | 'analyze' | 'debate' | 'problem_solve';

type ChangelogEntry = {
  id: string;
  threadId: string;
  roundNumber: number;
  changeType: 'participant_added' | 'participant_removed' | 'participant_modified' | 'mode_changed';
  participantId?: string;
  modelId?: string;
  previousValue?: string | null;
  newValue?: string | null;
  createdAt: Date;
};

type RoundConfig = {
  roundNumber: number;
  participants: ParticipantConfig[];
  mode: ConversationMode;
  enableWebSearch: boolean;
};

type ConfigDiff = {
  added: ParticipantConfig[];
  removed: ParticipantConfig[];
  modified: Array<{
    participant: ParticipantConfig;
    changes: Array<{
      field: string;
      from: unknown;
      to: unknown;
    }>;
  }>;
  modeChanged: boolean;
  previousMode?: ConversationMode;
  newMode?: ConversationMode;
  webSearchToggled: boolean;
};

// Helper functions for configuration comparison
function compareConfigurations(
  previousConfig: RoundConfig,
  currentConfig: RoundConfig,
): ConfigDiff {
  const prevParticipantIds = new Set(previousConfig.participants.map(p => p.id));
  const currParticipantIds = new Set(currentConfig.participants.map(p => p.id));

  // Find added participants
  const added = currentConfig.participants.filter(p => !prevParticipantIds.has(p.id));

  // Find removed participants
  const removed = previousConfig.participants.filter(p => !currParticipantIds.has(p.id));

  // Find modified participants (same ID but different properties)
  const modified: ConfigDiff['modified'] = [];
  for (const currP of currentConfig.participants) {
    const prevP = previousConfig.participants.find(p => p.id === currP.id);
    if (prevP) {
      const changes: ConfigDiff['modified'][0]['changes'] = [];

      if (prevP.role !== currP.role) {
        changes.push({ field: 'role', from: prevP.role, to: currP.role });
      }
      if (prevP.priority !== currP.priority) {
        changes.push({ field: 'priority', from: prevP.priority, to: currP.priority });
      }
      if (prevP.isEnabled !== currP.isEnabled) {
        changes.push({ field: 'isEnabled', from: prevP.isEnabled, to: currP.isEnabled });
      }

      if (changes.length > 0) {
        modified.push({ participant: currP, changes });
      }
    }
  }

  const modeChanged = previousConfig.mode !== currentConfig.mode;
  const webSearchToggled = previousConfig.enableWebSearch !== currentConfig.enableWebSearch;

  return {
    added,
    removed,
    modified,
    modeChanged,
    previousMode: modeChanged ? previousConfig.mode : undefined,
    newMode: modeChanged ? currentConfig.mode : undefined,
    webSearchToggled,
  };
}

function hasConfigurationChanges(diff: ConfigDiff): boolean {
  return (
    diff.added.length > 0
    || diff.removed.length > 0
    || diff.modified.length > 0
    || diff.modeChanged
    || diff.webSearchToggled
  );
}

function createChangelogEntries(
  threadId: string,
  roundNumber: number,
  diff: ConfigDiff,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const now = new Date();
  let entryIndex = 0;

  // Added participants
  for (const added of diff.added) {
    entries.push({
      id: `changelog-${threadId}-r${roundNumber}-${entryIndex++}`,
      threadId,
      roundNumber,
      changeType: 'participant_added',
      participantId: added.id,
      modelId: added.modelId,
      newValue: added.role,
      createdAt: now,
    });
  }

  // Removed participants
  for (const removed of diff.removed) {
    entries.push({
      id: `changelog-${threadId}-r${roundNumber}-${entryIndex++}`,
      threadId,
      roundNumber,
      changeType: 'participant_removed',
      participantId: removed.id,
      modelId: removed.modelId,
      previousValue: removed.role,
      createdAt: now,
    });
  }

  // Modified participants
  for (const mod of diff.modified) {
    for (const change of mod.changes) {
      entries.push({
        id: `changelog-${threadId}-r${roundNumber}-${entryIndex++}`,
        threadId,
        roundNumber,
        changeType: 'participant_modified',
        participantId: mod.participant.id,
        modelId: mod.participant.modelId,
        previousValue: String(change.from),
        newValue: String(change.to),
        createdAt: now,
      });
    }
  }

  // Mode change
  if (diff.modeChanged) {
    entries.push({
      id: `changelog-${threadId}-r${roundNumber}-${entryIndex++}`,
      threadId,
      roundNumber,
      changeType: 'mode_changed',
      previousValue: diff.previousMode,
      newValue: diff.newMode,
      createdAt: now,
    });
  }

  return entries;
}

function generateChangelogSummary(diff: ConfigDiff): string {
  const parts: string[] = [];

  if (diff.added.length > 0) {
    parts.push(`${diff.added.length} added`);
  }
  if (diff.removed.length > 0) {
    parts.push(`${diff.removed.length} removed`);
  }
  if (diff.modified.length > 0) {
    parts.push(`${diff.modified.length} modified`);
  }
  if (diff.modeChanged) {
    parts.push('mode changed');
  }
  if (diff.webSearchToggled) {
    parts.push('web search toggled');
  }

  return parts.join(', ');
}

describe('configuration Change Between Rounds', () => {
  describe('participant Addition Detection', () => {
    it('should detect single participant addition', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].id).toBe('p2');
      expect(diff.added[0].modelId).toBe('claude-3-opus');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('should detect multiple participant additions', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Analyst', priority: 1, isEnabled: true },
          { id: 'p3', modelId: 'gemini-pro', role: 'Critic', priority: 2, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.added).toHaveLength(2);
      expect(diff.added.map(p => p.id)).toEqual(['p2', 'p3']);
    });
  });

  describe('participant Removal Detection', () => {
    it('should detect single participant removal', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].id).toBe('p2');
      expect(diff.removed[0].modelId).toBe('claude-3-opus');
      expect(diff.added).toHaveLength(0);
    });

    it('should detect all participants removed', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Support', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p3', modelId: 'gemini-pro', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.removed).toHaveLength(2);
      expect(diff.added).toHaveLength(1);
    });
  });

  describe('participant Modification Detection', () => {
    it('should detect role change', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Critic', priority: 0, isEnabled: true }, // Role changed
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].participant.id).toBe('p1');
      expect(diff.modified[0].changes).toHaveLength(1);
      expect(diff.modified[0].changes[0]).toEqual({
        field: 'role',
        from: 'Analyst',
        to: 'Critic',
      });
    });

    it('should detect priority change (reordering)', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'First', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Second', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'First', priority: 1, isEnabled: true }, // Now second
          { id: 'p2', modelId: 'claude-3-opus', role: 'Second', priority: 0, isEnabled: true }, // Now first
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.modified).toHaveLength(2);
      expect(diff.modified.find(m => m.participant.id === 'p1')?.changes).toContainEqual({
        field: 'priority',
        from: 0,
        to: 1,
      });
      expect(diff.modified.find(m => m.participant.id === 'p2')?.changes).toContainEqual({
        field: 'priority',
        from: 1,
        to: 0,
      });
    });

    it('should detect enabled/disabled toggle', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: false }, // Disabled
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].changes).toContainEqual({
        field: 'isEnabled',
        from: true,
        to: false,
      });
    });

    it('should detect multiple changes on same participant', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Critic', priority: 1, isEnabled: false },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].changes).toHaveLength(3);
    });
  });

  describe('mode Change Detection', () => {
    it('should detect mode change from brainstorm to debate', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'debate',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.modeChanged).toBe(true);
      expect(diff.previousMode).toBe('brainstorm');
      expect(diff.newMode).toBe('debate');
    });

    it('should not flag mode change when same', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'analyze',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'analyze',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.modeChanged).toBe(false);
      expect(diff.previousMode).toBeUndefined();
      expect(diff.newMode).toBeUndefined();
    });
  });

  describe('web Search Toggle Detection', () => {
    it('should detect web search enabled', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: true,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.webSearchToggled).toBe(true);
    });

    it('should detect web search disabled', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [],
        mode: 'brainstorm',
        enableWebSearch: true,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.webSearchToggled).toBe(true);
    });
  });

  describe('combined Changes Detection', () => {
    it('should detect additions, removals, and modifications together', () => {
      const previousConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const currentConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Ideator', priority: 0, isEnabled: true }, // Modified role
          { id: 'p3', modelId: 'gemini-pro', role: 'New Role', priority: 1, isEnabled: true }, // Added
          // p2 removed
        ],
        mode: 'debate', // Mode changed
        enableWebSearch: true, // Web search toggled
      };

      const diff = compareConfigurations(previousConfig, currentConfig);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].id).toBe('p3');
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].id).toBe('p2');
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].participant.id).toBe('p1');
      expect(diff.modeChanged).toBe(true);
      expect(diff.webSearchToggled).toBe(true);
    });
  });

  describe('hasConfigurationChanges', () => {
    it('should return true when there are additions', () => {
      const diff: ConfigDiff = {
        added: [{ id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true }],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      expect(hasConfigurationChanges(diff)).toBe(true);
    });

    it('should return true when there are removals', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [{ id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true }],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      expect(hasConfigurationChanges(diff)).toBe(true);
    });

    it('should return true when there are modifications', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [{
          participant: { id: 'p1', modelId: 'gpt-4o', role: 'New', priority: 0, isEnabled: true },
          changes: [{ field: 'role', from: 'Old', to: 'New' }],
        }],
        modeChanged: false,
        webSearchToggled: false,
      };

      expect(hasConfigurationChanges(diff)).toBe(true);
    });

    it('should return true when mode changed', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [],
        modeChanged: true,
        previousMode: 'brainstorm',
        newMode: 'debate',
        webSearchToggled: false,
      };

      expect(hasConfigurationChanges(diff)).toBe(true);
    });

    it('should return true when web search toggled', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: true,
      };

      expect(hasConfigurationChanges(diff)).toBe(true);
    });

    it('should return false when no changes', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      expect(hasConfigurationChanges(diff)).toBe(false);
    });
  });

  describe('changelog Entry Creation', () => {
    it('should create entries for added participants', () => {
      const diff: ConfigDiff = {
        added: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true },
        ],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      const entries = createChangelogEntries('thread-123', 1, diff);

      expect(entries).toHaveLength(2);
      expect(entries[0].changeType).toBe('participant_added');
      expect(entries[0].modelId).toBe('gpt-4o');
      expect(entries[0].newValue).toBe('Analyst');
      expect(entries[1].changeType).toBe('participant_added');
      expect(entries[1].modelId).toBe('claude-3-opus');
    });

    it('should create entries for removed participants', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Former Role', priority: 0, isEnabled: true },
        ],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      const entries = createChangelogEntries('thread-123', 2, diff);

      expect(entries).toHaveLength(1);
      expect(entries[0].changeType).toBe('participant_removed');
      expect(entries[0].modelId).toBe('gpt-4o');
      expect(entries[0].previousValue).toBe('Former Role');
    });

    it('should create entries for modified participants', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [{
          participant: { id: 'p1', modelId: 'gpt-4o', role: 'New Role', priority: 1, isEnabled: true },
          changes: [
            { field: 'role', from: 'Old Role', to: 'New Role' },
            { field: 'priority', from: 0, to: 1 },
          ],
        }],
        modeChanged: false,
        webSearchToggled: false,
      };

      const entries = createChangelogEntries('thread-123', 1, diff);

      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.changeType === 'participant_modified')).toBe(true);
    });

    it('should create entry for mode change', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [],
        modeChanged: true,
        previousMode: 'brainstorm',
        newMode: 'debate',
        webSearchToggled: false,
      };

      const entries = createChangelogEntries('thread-123', 1, diff);

      expect(entries).toHaveLength(1);
      expect(entries[0].changeType).toBe('mode_changed');
      expect(entries[0].previousValue).toBe('brainstorm');
      expect(entries[0].newValue).toBe('debate');
    });

    it('should assign correct round number to all entries', () => {
      const diff: ConfigDiff = {
        added: [{ id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true }],
        removed: [{ id: 'p2', modelId: 'claude-3-opus', role: null, priority: 0, isEnabled: true }],
        modified: [],
        modeChanged: true,
        previousMode: 'brainstorm',
        newMode: 'analyze',
        webSearchToggled: false,
      };

      const entries = createChangelogEntries('thread-123', 5, diff);

      expect(entries.every(e => e.roundNumber === 5)).toBe(true);
    });

    it('should generate unique entry IDs', () => {
      const diff: ConfigDiff = {
        added: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true },
          { id: 'p3', modelId: 'gemini-pro', role: null, priority: 2, isEnabled: true },
        ],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      const entries = createChangelogEntries('thread-123', 1, diff);
      const ids = entries.map(e => e.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('changelog Summary Generation', () => {
    it('should generate summary for additions only', () => {
      const diff: ConfigDiff = {
        added: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true },
        ],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: false,
      };

      const summary = generateChangelogSummary(diff);

      expect(summary).toBe('2 added');
    });

    it('should generate summary for multiple change types', () => {
      const diff: ConfigDiff = {
        added: [{ id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true }],
        removed: [{ id: 'p2', modelId: 'claude-3-opus', role: null, priority: 0, isEnabled: true }],
        modified: [{
          participant: { id: 'p3', modelId: 'gemini-pro', role: 'New', priority: 0, isEnabled: true },
          changes: [{ field: 'role', from: 'Old', to: 'New' }],
        }],
        modeChanged: false,
        webSearchToggled: false,
      };

      const summary = generateChangelogSummary(diff);

      expect(summary).toBe('1 added, 1 removed, 1 modified');
    });

    it('should generate summary including mode change', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [],
        modeChanged: true,
        previousMode: 'brainstorm',
        newMode: 'debate',
        webSearchToggled: false,
      };

      const summary = generateChangelogSummary(diff);

      expect(summary).toBe('mode changed');
    });

    it('should generate summary including web search toggle', () => {
      const diff: ConfigDiff = {
        added: [],
        removed: [],
        modified: [],
        modeChanged: false,
        webSearchToggled: true,
      };

      const summary = generateChangelogSummary(diff);

      expect(summary).toBe('web search toggled');
    });

    it('should generate full summary with all change types', () => {
      const diff: ConfigDiff = {
        added: [{ id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true }],
        removed: [{ id: 'p2', modelId: 'claude-3-opus', role: null, priority: 0, isEnabled: true }],
        modified: [{
          participant: { id: 'p3', modelId: 'gemini-pro', role: 'New', priority: 0, isEnabled: true },
          changes: [{ field: 'role', from: 'Old', to: 'New' }],
        }],
        modeChanged: true,
        previousMode: 'brainstorm',
        newMode: 'debate',
        webSearchToggled: true,
      };

      const summary = generateChangelogSummary(diff);

      expect(summary).toBe('1 added, 1 removed, 1 modified, mode changed, web search toggled');
    });
  });

  describe('edge Cases', () => {
    it('should handle empty configurations', () => {
      const emptyConfig: RoundConfig = {
        roundNumber: 0,
        participants: [],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(emptyConfig, emptyConfig);

      expect(hasConfigurationChanges(diff)).toBe(false);
    });

    it('should handle transition from empty to populated', () => {
      const emptyConfig: RoundConfig = {
        roundNumber: 0,
        participants: [],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const populatedConfig: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(emptyConfig, populatedConfig);

      expect(diff.added).toHaveLength(1);
      expect(diff.removed).toHaveLength(0);
    });

    it('should handle transition from populated to empty', () => {
      const populatedConfig: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const emptyConfig: RoundConfig = {
        roundNumber: 1,
        participants: [],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(populatedConfig, emptyConfig);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(1);
    });

    it('should handle complete participant replacement', () => {
      const config1: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'A', priority: 0, isEnabled: true },
          { id: 'p2', modelId: 'claude-3-opus', role: 'B', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const config2: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p3', modelId: 'gemini-pro', role: 'C', priority: 0, isEnabled: true },
          { id: 'p4', modelId: 'llama-70b', role: 'D', priority: 1, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(config1, config2);

      expect(diff.added).toHaveLength(2);
      expect(diff.removed).toHaveLength(2);
      expect(diff.modified).toHaveLength(0);
    });

    it('should handle null role comparisons', () => {
      const config1: RoundConfig = {
        roundNumber: 0,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const config2: RoundConfig = {
        roundNumber: 1,
        participants: [
          { id: 'p1', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        mode: 'brainstorm',
        enableWebSearch: false,
      };

      const diff = compareConfigurations(config1, config2);

      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].changes[0]).toEqual({
        field: 'role',
        from: null,
        to: 'Analyst',
      });
    });
  });
});
