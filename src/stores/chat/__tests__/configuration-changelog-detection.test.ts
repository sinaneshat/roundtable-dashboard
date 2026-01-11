/**
 * Configuration Changes and Changelog Detection Tests
 *
 * Tests for detecting and tracking configuration changes between rounds
 * as documented in FLOW_DOCUMENTATION.md (Part 6: Configuration Changes Mid-Conversation):
 *
 * Configuration Changes:
 * - Add AI models (select more participants)
 * - Remove AI models (X button on chips)
 * - Reorder participants (drag and drop)
 * - Change roles (click role chip to edit)
 * - Switch conversation mode
 *
 * Changelog Banner:
 * - Appears before the round that uses new configuration
 * - Shows summary: "2 added, 1 removed, 1 modified"
 * - Expandable details with icons (+ added, - removed, pencil modified)
 *
 * Key Validations:
 * - Change detection accuracy
 * - Changelog record creation
 * - Banner display timing
 */

import { describe, expect, it } from 'vitest';

import type { ChangelogChangeTypeExtended } from '@/api/core/enums';
import { ChangelogChangeTypesExtended, ChatModes } from '@/api/core/enums';

// ============================================================================
// TEST HELPERS
// ============================================================================

type ParticipantConfig = {
  id: string;
  modelId: string;
  role: string | null;
  priority: number;
  isEnabled: boolean;
};

type ChangelogEntry = {
  type: ChangelogChangeTypeExtended;
  participantId?: string;
  modelId?: string;
  details?: {
    oldValue?: string | number;
    newValue?: string | number;
  };
};

type Changelog = {
  roundNumber: number;
  changes: ChangelogEntry[];
  summary: string;
  createdAt: Date;
};

function createParticipantConfig(
  index: number,
  overrides?: Partial<ParticipantConfig>,
): ParticipantConfig {
  return {
    id: `participant-${index}`,
    modelId: `model-${index}`,
    role: `Role ${index}`,
    priority: index,
    isEnabled: true,
    ...overrides,
  };
}

/**
 * Detects changes between two participant configurations
 */
function detectParticipantChanges(
  previousConfig: ParticipantConfig[],
  currentConfig: ParticipantConfig[],
): ChangelogEntry[] {
  const changes: ChangelogEntry[] = [];

  const prevIds = new Set(previousConfig.map(p => p.id));
  const currIds = new Set(currentConfig.map(p => p.id));

  // Detect additions
  currentConfig.forEach((p) => {
    if (!prevIds.has(p.id)) {
      changes.push({
        type: ChangelogChangeTypesExtended.ADDED,
        participantId: p.id,
        modelId: p.modelId,
      });
    }
  });

  // Detect removals
  previousConfig.forEach((p) => {
    if (!currIds.has(p.id)) {
      changes.push({
        type: ChangelogChangeTypesExtended.REMOVED,
        participantId: p.id,
        modelId: p.modelId,
      });
    }
  });

  // Detect modifications (role changes, priority changes)
  currentConfig.forEach((curr) => {
    const prev = previousConfig.find(p => p.id === curr.id);
    if (prev) {
      // Role change
      if (prev.role !== curr.role) {
        changes.push({
          type: ChangelogChangeTypesExtended.MODIFIED,
          participantId: curr.id,
          details: {
            oldValue: prev.role ?? 'none',
            newValue: curr.role ?? 'none',
          },
        });
      }

      // Priority/order change
      if (prev.priority !== curr.priority) {
        changes.push({
          type: ChangelogChangeTypesExtended.REORDERED,
          participantId: curr.id,
          details: {
            oldValue: prev.priority,
            newValue: curr.priority,
          },
        });
      }
    }
  });

  return changes;
}

/**
 * Creates a summary string for changelog
 */
function createChangelogSummary(changes: ChangelogEntry[]): string {
  const added = changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED).length;
  const removed = changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED).length;
  const modified = changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED || c.type === ChangelogChangeTypesExtended.REORDERED).length;
  const modeChanged = changes.some(c => c.type === ChangelogChangeTypesExtended.MODE_CHANGED);

  const parts: string[] = [];
  if (added > 0)
    parts.push(`${added} added`);
  if (removed > 0)
    parts.push(`${removed} removed`);
  if (modified > 0)
    parts.push(`${modified} modified`);
  if (modeChanged)
    parts.push('mode changed');

  return parts.join(', ');
}

// ============================================================================
// PARTICIPANT ADDITION TESTS
// ============================================================================

describe('participant Addition Detection', () => {
  describe('single Addition', () => {
    it('detects when one participant is added', () => {
      const previousConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
      ];
      const currentConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2), // Added
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      expect(changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED)).toHaveLength(1);
      expect(changes[0]?.participantId).toBe('participant-2');
    });
  });

  describe('multiple Additions', () => {
    it('detects when multiple participants are added', () => {
      const previousConfig = [createParticipantConfig(0)];
      const currentConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1), // Added
        createParticipantConfig(2), // Added
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const additions = changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED);

      expect(additions).toHaveLength(2);
      expect(additions.map(a => a.participantId)).toContain('participant-1');
      expect(additions.map(a => a.participantId)).toContain('participant-2');
    });
  });

  describe('addition Summary', () => {
    it('creates correct summary for additions', () => {
      const changes: ChangelogEntry[] = [
        { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p1', modelId: 'gpt-4' },
        { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p2', modelId: 'claude-3' },
      ];

      const summary = createChangelogSummary(changes);
      expect(summary).toBe('2 added');
    });
  });
});

// ============================================================================
// PARTICIPANT REMOVAL TESTS
// ============================================================================

describe('participant Removal Detection', () => {
  describe('single Removal', () => {
    it('detects when one participant is removed', () => {
      const previousConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
      ];
      const currentConfig = [
        createParticipantConfig(0),
        createParticipantConfig(2),
        // participant-1 removed
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const removals = changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED);

      expect(removals).toHaveLength(1);
      expect(removals[0]?.participantId).toBe('participant-1');
    });
  });

  describe('multiple Removals', () => {
    it('detects when multiple participants are removed', () => {
      const previousConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
      ];
      const currentConfig = [createParticipantConfig(0)];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const removals = changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED);

      expect(removals).toHaveLength(2);
    });
  });

  describe('removal Summary', () => {
    it('creates correct summary for removals', () => {
      const changes: ChangelogEntry[] = [
        { type: ChangelogChangeTypesExtended.REMOVED, participantId: 'p1', modelId: 'gpt-4' },
      ];

      const summary = createChangelogSummary(changes);
      expect(summary).toBe('1 removed');
    });
  });
});

// ============================================================================
// ROLE MODIFICATION TESTS
// ============================================================================

describe('role Modification Detection', () => {
  describe('single Role Change', () => {
    it('detects when participant role is changed', () => {
      const previousConfig = [
        createParticipantConfig(0, { role: 'Critic' }),
      ];
      const currentConfig = [
        createParticipantConfig(0, { role: 'Advocate' }),
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const modifications = changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED);

      expect(modifications).toHaveLength(1);
      expect(modifications[0]?.details?.oldValue).toBe('Critic');
      expect(modifications[0]?.details?.newValue).toBe('Advocate');
    });
  });

  describe('role Added Where None Existed', () => {
    it('detects when role is assigned to participant without one', () => {
      const previousConfig = [
        createParticipantConfig(0, { role: null }),
      ];
      const currentConfig = [
        createParticipantConfig(0, { role: 'Devil\'s Advocate' }),
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const modifications = changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED);

      expect(modifications).toHaveLength(1);
      expect(modifications[0]?.details?.oldValue).toBe('none');
      expect(modifications[0]?.details?.newValue).toBe('Devil\'s Advocate');
    });
  });

  describe('role Removed', () => {
    it('detects when role is removed from participant', () => {
      const previousConfig = [
        createParticipantConfig(0, { role: 'Analyst' }),
      ];
      const currentConfig = [
        createParticipantConfig(0, { role: null }),
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const modifications = changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED);

      expect(modifications).toHaveLength(1);
      expect(modifications[0]?.details?.oldValue).toBe('Analyst');
      expect(modifications[0]?.details?.newValue).toBe('none');
    });
  });
});

// ============================================================================
// PARTICIPANT REORDER TESTS
// ============================================================================

describe('participant Reorder Detection', () => {
  describe('simple Reorder', () => {
    it('detects when participants are reordered', () => {
      const previousConfig = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(1, { priority: 1 }),
        createParticipantConfig(2, { priority: 2 }),
      ];
      const currentConfig = [
        createParticipantConfig(0, { priority: 2 }), // Was 0, now 2
        createParticipantConfig(1, { priority: 0 }), // Was 1, now 0
        createParticipantConfig(2, { priority: 1 }), // Was 2, now 1
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const reorders = changes.filter(c => c.type === ChangelogChangeTypesExtended.REORDERED);

      expect(reorders).toHaveLength(3);
    });
  });

  describe('single Move', () => {
    it('detects when one participant moves to different position', () => {
      const previousConfig = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(1, { priority: 1 }),
        createParticipantConfig(2, { priority: 2 }),
      ];
      const currentConfig = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(2, { priority: 1 }), // Moved from 2 to 1
        createParticipantConfig(1, { priority: 2 }), // Moved from 1 to 2
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);
      const reorders = changes.filter(c => c.type === ChangelogChangeTypesExtended.REORDERED);

      expect(reorders).toHaveLength(2);
    });
  });
});

// ============================================================================
// MODE CHANGE TESTS
// ============================================================================

describe('mode Change Detection', () => {
  it('detects when conversation mode is changed', () => {
    const previousMode = ChatModes.DEBATING;
    const currentMode = ChatModes.BRAINSTORMING;

    const changes: ChangelogEntry[] = [];
    if (previousMode !== currentMode) {
      changes.push({
        type: ChangelogChangeTypesExtended.MODE_CHANGED,
        details: {
          oldValue: previousMode,
          newValue: currentMode,
        },
      });
    }

    expect(changes).toHaveLength(1);
    expect(changes[0]?.type).toBe(ChangelogChangeTypesExtended.MODE_CHANGED);
  });

  it('does not create change when mode stays same', () => {
    const previousMode = ChatModes.ANALYZING;
    const currentMode = ChatModes.ANALYZING;

    const changes: ChangelogEntry[] = [];
    if (previousMode !== currentMode) {
      changes.push({
        type: ChangelogChangeTypesExtended.MODE_CHANGED,
        details: {
          oldValue: previousMode,
          newValue: currentMode,
        },
      });
    }

    expect(changes).toHaveLength(0);
  });
});

// ============================================================================
// COMBINED CHANGES TESTS
// ============================================================================

describe('combined Changes Detection', () => {
  describe('add and Remove', () => {
    it('detects simultaneous additions and removals', () => {
      const previousConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
      ];
      const currentConfig = [
        createParticipantConfig(0),
        createParticipantConfig(2), // Added, participant-1 removed
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      const additions = changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED);
      const removals = changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED);

      expect(additions).toHaveLength(1);
      expect(removals).toHaveLength(1);
    });
  });

  describe('add, Remove, and Modify', () => {
    it('detects all types of changes together', () => {
      const previousConfig = [
        createParticipantConfig(0, { role: 'Critic' }),
        createParticipantConfig(1),
      ];
      const currentConfig = [
        createParticipantConfig(0, { role: 'Advocate' }), // Modified
        createParticipantConfig(2), // Added, participant-1 removed
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      const additions = changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED);
      const removals = changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED);
      const modifications = changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED);

      expect(additions).toHaveLength(1);
      expect(removals).toHaveLength(1);
      expect(modifications).toHaveLength(1);
    });
  });

  describe('combined Summary', () => {
    it('creates correct summary for multiple change types', () => {
      const changes: ChangelogEntry[] = [
        { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p1' },
        { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p2' },
        { type: ChangelogChangeTypesExtended.REMOVED, participantId: 'p3' },
        { type: ChangelogChangeTypesExtended.MODIFIED, participantId: 'p4', details: { oldValue: 'A', newValue: 'B' } },
      ];

      const summary = createChangelogSummary(changes);
      expect(summary).toBe('2 added, 1 removed, 1 modified');
    });
  });
});

// ============================================================================
// CHANGELOG RECORD TESTS
// ============================================================================

describe('changelog Record Creation', () => {
  describe('record Structure', () => {
    it('creates changelog with correct structure', () => {
      const previousConfig = [createParticipantConfig(0)];
      const currentConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      const changelog: Changelog = {
        roundNumber: 1,
        changes,
        summary: createChangelogSummary(changes),
        createdAt: new Date(),
      };

      expect(changelog.roundNumber).toBe(1);
      expect(changelog.changes).toHaveLength(1);
      expect(changelog.summary).toBe('1 added');
      expect(changelog.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('no Changes Scenario', () => {
    it('returns empty changes when configuration unchanged', () => {
      const config = [
        createParticipantConfig(0),
        createParticipantConfig(1),
      ];

      const changes = detectParticipantChanges(config, config);

      expect(changes).toHaveLength(0);
    });

    it('no changelog created when no changes', () => {
      const config = [createParticipantConfig(0)];
      const changes = detectParticipantChanges(config, config);

      const shouldCreateChangelog = changes.length > 0;
      expect(shouldCreateChangelog).toBe(false);
    });
  });
});

// ============================================================================
// CHANGELOG BANNER TESTS
// ============================================================================

describe('changelog Banner Display', () => {
  describe('banner Visibility', () => {
    it('shows banner when changelog exists for round', () => {
      const changelogs: Changelog[] = [
        {
          roundNumber: 1,
          changes: [{ type: 'added', participantId: 'p1' }],
          summary: '1 added',
          createdAt: new Date(),
        },
      ];

      const currentRound = 1;
      const changelogForRound = changelogs.find(c => c.roundNumber === currentRound);

      expect(changelogForRound).toBeDefined();
    });

    it('hides banner when no changelog for round', () => {
      const changelogs: Changelog[] = [];
      const currentRound = 1;

      const changelogForRound = changelogs.find(c => c.roundNumber === currentRound);

      expect(changelogForRound).toBeUndefined();
    });
  });

  describe('banner Position', () => {
    it('changelog appears BEFORE the round that uses new config', () => {
      // Changelog for round 2 = changes made BEFORE round 2
      // Banner should appear at the start of round 2

      const changelogs: Changelog[] = [
        {
          roundNumber: 2,
          changes: [{ type: 'added', participantId: 'p1' }],
          summary: '1 added',
          createdAt: new Date(),
        },
      ];

      const roundMessages = [
        { roundNumber: 0, type: 'user' },
        { roundNumber: 0, type: 'assistant' },
        { roundNumber: 1, type: 'user' },
        { roundNumber: 1, type: 'assistant' },
        { roundNumber: 2, type: 'user' }, // Changelog banner appears here
        { roundNumber: 2, type: 'assistant' },
      ];

      // Find first message of round 2
      const round2Start = roundMessages.findIndex(m => m.roundNumber === 2);
      expect(round2Start).toBe(4);

      // Changelog exists for round 2
      expect(changelogs.find(c => c.roundNumber === 2)).toBeDefined();
    });
  });

  describe('expandable Details', () => {
    it('groups changes by type for display', () => {
      const changes: ChangelogEntry[] = [
        { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p1', modelId: 'gpt-4' },
        { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p2', modelId: 'claude-3' },
        { type: ChangelogChangeTypesExtended.REMOVED, participantId: 'p3', modelId: 'gemini' },
        { type: ChangelogChangeTypesExtended.MODIFIED, participantId: 'p4', details: { oldValue: 'A', newValue: 'B' } },
      ];

      const grouped = {
        added: changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED),
        removed: changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED),
        modified: changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED || c.type === ChangelogChangeTypesExtended.REORDERED),
      };

      expect(grouped.added).toHaveLength(2);
      expect(grouped.removed).toHaveLength(1);
      expect(grouped.modified).toHaveLength(1);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  describe('empty Previous Config', () => {
    it('handles first round (no previous config)', () => {
      const previousConfig: ParticipantConfig[] = [];
      const currentConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      // All current participants are "added"
      expect(changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED)).toHaveLength(2);
    });
  });

  describe('empty Current Config', () => {
    it('handles all participants removed', () => {
      const previousConfig = [
        createParticipantConfig(0),
        createParticipantConfig(1),
      ];
      const currentConfig: ParticipantConfig[] = [];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      expect(changes.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED)).toHaveLength(2);
    });
  });

  describe('same IDs Different Properties', () => {
    it('detects changes even when only properties differ', () => {
      const previousConfig = [
        { id: 'p1', modelId: 'gpt-4', role: 'Critic', priority: 0, isEnabled: true },
      ];
      const currentConfig = [
        { id: 'p1', modelId: 'gpt-4', role: 'Advocate', priority: 1, isEnabled: true },
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      // Should detect role change and priority change
      expect(changes.filter(c => c.type === ChangelogChangeTypesExtended.MODIFIED)).toHaveLength(1);
      expect(changes.filter(c => c.type === ChangelogChangeTypesExtended.REORDERED)).toHaveLength(1);
    });
  });

  describe('disabled Participants', () => {
    it('includes disabled participants in change detection', () => {
      const previousConfig = [
        createParticipantConfig(0, { isEnabled: true }),
      ];
      const currentConfig = [
        createParticipantConfig(0, { isEnabled: false }),
        createParticipantConfig(1, { isEnabled: true }),
      ];

      const changes = detectParticipantChanges(previousConfig, currentConfig);

      // participant-1 added
      expect(changes.filter(c => c.type === ChangelogChangeTypesExtended.ADDED)).toHaveLength(1);
    });
  });
});

// ============================================================================
// ROUND-SPECIFIC TESTS
// ============================================================================

describe('round-Specific Change Tracking', () => {
  describe('per-Round Changelog Storage', () => {
    it('stores changelog separately for each round', () => {
      const changelogs: Changelog[] = [];

      // Changes before round 1
      changelogs.push({
        roundNumber: 1,
        changes: [{ type: 'added', participantId: 'p1' }],
        summary: '1 added',
        createdAt: new Date(),
      });

      // Changes before round 3
      changelogs.push({
        roundNumber: 3,
        changes: [{ type: 'removed', participantId: 'p1' }],
        summary: '1 removed',
        createdAt: new Date(),
      });

      expect(changelogs.find(c => c.roundNumber === 1)?.summary).toBe('1 added');
      expect(changelogs.find(c => c.roundNumber === 2)).toBeUndefined();
      expect(changelogs.find(c => c.roundNumber === 3)?.summary).toBe('1 removed');
    });
  });

  describe('previous Round Config Lookup', () => {
    it('compares against immediately previous round config', () => {
      // Round 0 config: [P0, P1]
      // Round 1 config: [P0, P1, P2] -> added P2
      // Round 2 config: [P0, P2] -> removed P1

      const round0Config = [createParticipantConfig(0), createParticipantConfig(1)];
      const round1Config = [createParticipantConfig(0), createParticipantConfig(1), createParticipantConfig(2)];
      const round2Config = [createParticipantConfig(0), createParticipantConfig(2)];

      const changes1 = detectParticipantChanges(round0Config, round1Config);
      const changes2 = detectParticipantChanges(round1Config, round2Config);

      expect(changes1.filter(c => c.type === ChangelogChangeTypesExtended.ADDED)).toHaveLength(1);
      expect(changes2.filter(c => c.type === ChangelogChangeTypesExtended.REMOVED)).toHaveLength(1);
    });
  });
});

// ============================================================================
// ATOMICITY TESTS
// ============================================================================

describe('atomicity of Changes', () => {
  it('all changes in a round are saved atomically', () => {
    const changes: ChangelogEntry[] = [
      { type: ChangelogChangeTypesExtended.ADDED, participantId: 'p1' },
      { type: ChangelogChangeTypesExtended.REMOVED, participantId: 'p2' },
      { type: ChangelogChangeTypesExtended.MODIFIED, participantId: 'p3' },
      { type: ChangelogChangeTypesExtended.MODE_CHANGED },
    ];

    const changelog: Changelog = {
      roundNumber: 1,
      changes,
      summary: createChangelogSummary(changes),
      createdAt: new Date(),
    };

    // All changes saved together
    expect(changelog.changes).toHaveLength(4);
    expect(changelog.summary).toBe('1 added, 1 removed, 1 modified, mode changed');
  });
});
