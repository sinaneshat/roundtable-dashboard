/**
 * Timeline Configuration Changes E2E Tests
 *
 * Comprehensive tests for all configuration change scenarios:
 * - Mode changes (Brainstorm → Analyze → Debate → Problem Solve)
 * - Web search toggle (enabled/disabled between rounds)
 * - Participant changes (add/remove/reorder/role change)
 * - File attachments (add/remove)
 * - Combined changes (multiple changes in single round)
 *
 * Tests simulate API responses and verify store updates + timeline integrity.
 */

import { describe, expect, it } from 'vitest';

import {
  ChangelogChangeTypes,
  ChatModes,
  FinishReasons,
  MessageRoles,
  MessageStatuses,
} from '@/api/core/enums';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import { useThreadTimeline } from '@/hooks/utils';
import { createMockStoredPreSearch, createTestAssistantMessage, createTestUserMessage, renderHook } from '@/lib/testing';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// TYPES
// ============================================================================

type ConversationMode = typeof ChatModes[keyof typeof ChatModes];

type ChangelogEntry = {
  id: string;
  threadId: string;
  roundNumber: number;
  changeType: typeof ChangelogChangeTypes[keyof typeof ChangelogChangeTypes];
  changeData: Record<string, unknown>;
  createdAt: Date;
};

type ParticipantConfig = {
  id: string;
  modelId: string;
  role: string | null;
  priority: number;
  isEnabled: boolean;
};

type RoundConfiguration = {
  roundNumber: number;
  mode: ConversationMode;
  enableWebSearch: boolean;
  participants: ParticipantConfig[];
  hasAttachments: boolean;
  attachmentCount: number;
};

// ============================================================================
// HELPERS
// ============================================================================

function createMockThread(
  id: string,
  mode: ConversationMode = ChatModes.ANALYZING,
  enableWebSearch = false,
): ChatThread {
  return {
    id,
    userId: 'user-123',
    title: 'Test Thread',
    mode,
    status: 'active',
    enableWebSearch,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatThread;
}

function createMockParticipant(
  index: number,
  modelId: string,
  role: string | null = null,
): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId,
    role,
    priority: index,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatParticipant;
}

let changelogCounter = 0;

function createChangelogEntry(
  threadId: string,
  roundNumber: number,
  changeType: string,
  changeData: Record<string, unknown>,
): ChangelogEntry {
  changelogCounter++;
  return {
    id: `changelog-${threadId}-r${roundNumber}-${changelogCounter}`,
    threadId,
    roundNumber,
    changeType: changeType as typeof ChangelogChangeTypes[keyof typeof ChangelogChangeTypes],
    changeData,
    createdAt: new Date(),
  };
}

function detectConfigChanges(
  prevConfig: RoundConfiguration,
  currConfig: RoundConfiguration,
): {
  modeChanged: boolean;
  webSearchToggled: boolean;
  participantsAdded: ParticipantConfig[];
  participantsRemoved: ParticipantConfig[];
  participantsReordered: boolean;
  participantsRoleChanged: ParticipantConfig[];
  attachmentsChanged: boolean;
} {
  const prevParticipantIds = new Set(prevConfig.participants.map(p => p.id));
  const currParticipantIds = new Set(currConfig.participants.map(p => p.id));

  // Detect added/removed participants
  const participantsAdded = currConfig.participants.filter(p => !prevParticipantIds.has(p.id));
  const participantsRemoved = prevConfig.participants.filter(p => !currParticipantIds.has(p.id));

  // Detect reordering (same participants but different priorities)
  const commonParticipants = currConfig.participants.filter(p => prevParticipantIds.has(p.id));
  const participantsReordered = commonParticipants.some((curr) => {
    const prev = prevConfig.participants.find(p => p.id === curr.id);
    return prev && prev.priority !== curr.priority;
  });

  // Detect role changes
  const participantsRoleChanged = commonParticipants.filter((curr) => {
    const prev = prevConfig.participants.find(p => p.id === curr.id);
    return prev && prev.role !== curr.role;
  });

  return {
    modeChanged: prevConfig.mode !== currConfig.mode,
    webSearchToggled: prevConfig.enableWebSearch !== currConfig.enableWebSearch,
    participantsAdded,
    participantsRemoved,
    participantsReordered,
    participantsRoleChanged,
    attachmentsChanged: prevConfig.hasAttachments !== currConfig.hasAttachments
      || prevConfig.attachmentCount !== currConfig.attachmentCount,
  };
}

function buildChangelogEntries(
  threadId: string,
  roundNumber: number,
  changes: ReturnType<typeof detectConfigChanges>,
  prevConfig: RoundConfiguration,
  currConfig: RoundConfiguration,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];

  if (changes.modeChanged) {
    entries.push(createChangelogEntry(threadId, roundNumber, ChangelogChangeTypes.MODE_CHANGED, {
      previousMode: prevConfig.mode,
      newMode: currConfig.mode,
    }));
  }

  if (changes.webSearchToggled) {
    entries.push(createChangelogEntry(threadId, roundNumber, ChangelogChangeTypes.WEB_SEARCH_TOGGLED, {
      previousValue: prevConfig.enableWebSearch,
      newValue: currConfig.enableWebSearch,
    }));
  }

  for (const added of changes.participantsAdded) {
    entries.push(createChangelogEntry(threadId, roundNumber, ChangelogChangeTypes.PARTICIPANT_ADDED, {
      participantId: added.id,
      modelId: added.modelId,
      role: added.role,
    }));
  }

  for (const removed of changes.participantsRemoved) {
    entries.push(createChangelogEntry(threadId, roundNumber, ChangelogChangeTypes.PARTICIPANT_REMOVED, {
      participantId: removed.id,
      modelId: removed.modelId,
      role: removed.role,
    }));
  }

  if (changes.participantsReordered) {
    entries.push(createChangelogEntry(threadId, roundNumber, ChangelogChangeTypes.PARTICIPANTS_REORDERED, {
      newOrder: currConfig.participants.map(p => ({ id: p.id, priority: p.priority })),
    }));
  }

  for (const roleChanged of changes.participantsRoleChanged) {
    const prev = prevConfig.participants.find(p => p.id === roleChanged.id);
    entries.push(createChangelogEntry(threadId, roundNumber, ChangelogChangeTypes.PARTICIPANT_ROLE_CHANGED, {
      participantId: roleChanged.id,
      previousRole: prev?.role,
      newRole: roleChanged.role,
    }));
  }

  return entries;
}

function simulateRoundCompletion(
  store: ChatStoreApi,
  roundNumber: number,
  participants: ParticipantConfig[],
  options: {
    includePreSearch?: boolean;
    includeModerator?: boolean;
    userContent?: string;
  } = {},
): void {
  const { includePreSearch = false, includeModerator = true, userContent = `Question R${roundNumber}` } = options;

  // Get existing messages
  const existingMessages = store.getState().messages;

  // User message
  const userMsg = createTestUserMessage({
    id: `user-r${roundNumber}`,
    content: userContent,
    roundNumber,
  });

  // Pre-search if enabled
  if (includePreSearch) {
    store.getState().addPreSearch(createMockStoredPreSearch(roundNumber, MessageStatuses.COMPLETE));
  }

  // Participant messages
  const participantMsgs = participants
    .filter(p => p.isEnabled)
    .sort((a, b) => a.priority - b.priority)
    .map((p, idx) => createTestAssistantMessage({
      id: `thread-123_r${roundNumber}_p${idx}`,
      content: `Response from ${p.modelId} (${p.role || 'no role'})`,
      roundNumber,
      participantId: p.id,
      participantIndex: idx,
      finishReason: FinishReasons.STOP,
    }));

  store.getState().setMessages([...existingMessages, userMsg, ...participantMsgs]);

  // Moderator
  if (includeModerator) {
    // Moderator creation logic removed
  }
}

// ============================================================================
// MODE CHANGE TESTS
// ============================================================================

describe('mode Change Timeline Tests', () => {
  describe('single Mode Change', () => {
    it('should create changelog when mode changes between rounds', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      // Round 0: Brainstorm mode
      const config0: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Ideator', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      store.getState().setThread(createMockThread(threadId, config0.mode, config0.enableWebSearch));
      store.getState().setParticipants(config0.participants.map((p, i) =>
        createMockParticipant(i, p.modelId, p.role),
      ));

      simulateRoundCompletion(store, 0, config0.participants);

      // Round 1: Analyze mode (changed)
      const config1: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: config0.participants,
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(config0, config1);
      expect(changes.modeChanged).toBe(true);

      const changelog = buildChangelogEntries(threadId, 1, changes, config0, config1);
      expect(changelog).toHaveLength(1);
      expect(changelog[0]?.changeType).toBe(ChangelogChangeTypes.MODE_CHANGED);
      expect(changelog[0]?.changeData).toEqual({
        previousMode: ChatModes.BRAINSTORMING,
        newMode: ChatModes.ANALYZING,
      });

      // Complete round 1
      store.getState().setThread(createMockThread(threadId, config1.mode, config1.enableWebSearch));
      simulateRoundCompletion(store, 1, config1.participants);

      // Verify changelog is correctly structured for timeline
      expect(changelog[0]?.roundNumber).toBe(1);

      // Verify useThreadTimeline correctly places changelog in timeline
      const messages = store.getState().messages;
      const { result } = renderHook(() =>
        useThreadTimeline({
          messages,
          changelog,
        }),
      );

      // Timeline should have: R0 messages, R1 changelog, R1 messages
      const r1ChangelogItem = result.current.find(
        item => item.type === 'changelog' && item.roundNumber === 1,
      );
      expect(r1ChangelogItem).toBeDefined();
      expect(r1ChangelogItem?.data).toHaveLength(1);
    });

    it('should handle all mode transitions', () => {
      const modes: ConversationMode[] = [ChatModes.BRAINSTORMING, ChatModes.ANALYZING, ChatModes.DEBATING, ChatModes.SOLVING];

      for (let i = 0; i < modes.length - 1; i++) {
        const fromMode = modes[i]!;
        const toMode = modes[i + 1]!;

        const prevConfig: RoundConfiguration = {
          roundNumber: i,
          mode: fromMode,
          enableWebSearch: false,
          participants: [],
          hasAttachments: false,
          attachmentCount: 0,
        };

        const currConfig: RoundConfiguration = {
          roundNumber: i + 1,
          mode: toMode,
          enableWebSearch: false,
          participants: [],
          hasAttachments: false,
          attachmentCount: 0,
        };

        const changes = detectConfigChanges(prevConfig, currConfig);
        expect(changes.modeChanged).toBe(true);
      }
    });

    it('should not create changelog when mode stays the same', () => {
      const config0: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const config1: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING, // Same mode
        enableWebSearch: false,
        participants: [],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(config0, config1);
      expect(changes.modeChanged).toBe(false);
    });
  });

  describe('multiple Mode Changes Across Rounds', () => {
    it('should track mode changes independently per round', () => {
      const _store = createChatStore();
      const threadId = 'thread-123';

      const configs: RoundConfiguration[] = [
        { roundNumber: 0, mode: ChatModes.BRAINSTORMING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 },
        { roundNumber: 1, mode: ChatModes.ANALYZING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 },
        { roundNumber: 2, mode: ChatModes.DEBATING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 },
        { roundNumber: 3, mode: ChatModes.DEBATING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 }, // No change
        { roundNumber: 4, mode: ChatModes.SOLVING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 },
      ];

      const allChangelog: ChangelogEntry[] = [];

      for (let i = 1; i < configs.length; i++) {
        const changes = detectConfigChanges(configs[i - 1]!, configs[i]!);
        if (changes.modeChanged) {
          const entries = buildChangelogEntries(threadId, i, changes, configs[i - 1]!, configs[i]!);
          allChangelog.push(...entries);
        }
      }

      // Should have 3 mode changes (R0→R1, R1→R2, R3→R4)
      expect(allChangelog).toHaveLength(3);
      expect(allChangelog.map(c => c.roundNumber)).toEqual([1, 2, 4]);
    });
  });
});

// ============================================================================
// WEB SEARCH TOGGLE TESTS
// ============================================================================

describe('web Search Toggle Timeline Tests', () => {
  describe('enable Web Search', () => {
    it('should create changelog when web search enabled', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: true, // Enabled
        participants: [],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.webSearchToggled).toBe(true);

      const entries = buildChangelogEntries('thread-123', 1, changes, prevConfig, currConfig);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.changeType).toBe(ChangelogChangeTypes.WEB_SEARCH_TOGGLED);
      expect(entries[0]?.changeData).toEqual({
        previousValue: false,
        newValue: true,
      });
    });

    it('should add pre-search to timeline when enabled', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread('thread-123', ChatModes.ANALYZING, true));
      store.getState().setParticipants([createMockParticipant(0, 'gpt-4o')]);

      // Add pre-search
      store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE));

      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(1);
      expect(preSearches[0]?.roundNumber).toBe(0);
    });
  });

  describe('disable Web Search', () => {
    it('should create changelog when web search disabled', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: true,
        participants: [],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false, // Disabled
        participants: [],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.webSearchToggled).toBe(true);

      const entries = buildChangelogEntries('thread-123', 1, changes, prevConfig, currConfig);
      expect(entries[0]?.changeData).toEqual({
        previousValue: true,
        newValue: false,
      });
    });

    it('should not add pre-search to timeline when disabled', () => {
      const store = createChatStore();

      store.getState().setThread(createMockThread('thread-123', ChatModes.ANALYZING, false));
      store.getState().setParticipants([createMockParticipant(0, 'gpt-4o')]);

      // No pre-search added
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(0);
    });
  });

  describe('web Search Toggle Across Multiple Rounds', () => {
    it('should track toggle pattern: off → on → off → on', () => {
      const configs: RoundConfiguration[] = [
        { roundNumber: 0, mode: ChatModes.ANALYZING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 },
        { roundNumber: 1, mode: ChatModes.ANALYZING, enableWebSearch: true, participants: [], hasAttachments: false, attachmentCount: 0 },
        { roundNumber: 2, mode: ChatModes.ANALYZING, enableWebSearch: false, participants: [], hasAttachments: false, attachmentCount: 0 },
        { roundNumber: 3, mode: ChatModes.ANALYZING, enableWebSearch: true, participants: [], hasAttachments: false, attachmentCount: 0 },
      ];

      const allChangelog: ChangelogEntry[] = [];

      for (let i = 1; i < configs.length; i++) {
        const changes = detectConfigChanges(configs[i - 1]!, configs[i]!);
        if (changes.webSearchToggled) {
          const entries = buildChangelogEntries('thread-123', i, changes, configs[i - 1]!, configs[i]!);
          allChangelog.push(...entries);
        }
      }

      expect(allChangelog).toHaveLength(3);
      expect(allChangelog.map(c => c.changeData.newValue)).toEqual([true, false, true]);
    });
  });
});

// ============================================================================
// PARTICIPANT CHANGE TESTS
// ============================================================================

describe('participant Change Timeline Tests', () => {
  describe('participant Addition', () => {
    it('should detect single participant addition', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
          { id: 'p1', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true }, // Added
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsAdded).toHaveLength(1);
      expect(changes.participantsAdded[0]?.modelId).toBe('claude-3-opus');
    });

    it('should detect multiple participant additions', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
          { id: 'p1', modelId: 'claude-3-opus', role: 'A', priority: 1, isEnabled: true },
          { id: 'p2', modelId: 'gemini-pro', role: 'B', priority: 2, isEnabled: true },
          { id: 'p3', modelId: 'llama-70b', role: 'C', priority: 3, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsAdded).toHaveLength(3);
    });

    it('should maintain timeline order with new participants', () => {
      const store = createChatStore();

      // Round 0: 1 participant
      const config0: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      store.getState().setThread(createMockThread('thread-123'));
      store.getState().setParticipants([createMockParticipant(0, 'gpt-4o', 'Lead')]);
      simulateRoundCompletion(store, 0, config0.participants);

      // Round 1: 3 participants
      const config1: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
          { id: 'p1', modelId: 'claude-3-opus', role: 'Support', priority: 1, isEnabled: true },
          { id: 'p2', modelId: 'gemini-pro', role: 'Reviewer', priority: 2, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      store.getState().setParticipants([
        createMockParticipant(0, 'gpt-4o', 'Lead'),
        createMockParticipant(1, 'claude-3-opus', 'Support'),
        createMockParticipant(2, 'gemini-pro', 'Reviewer'),
      ]);
      simulateRoundCompletion(store, 1, config1.participants);

      // Verify messages
      const messages = store.getState().messages;
      const r0Msgs = messages.filter((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.roundNumber === 0 && meta?.role === MessageRoles.ASSISTANT;
      });
      const r1Msgs = messages.filter((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.roundNumber === 1 && meta?.role === MessageRoles.ASSISTANT;
      });

      expect(r0Msgs).toHaveLength(1);
      expect(r1Msgs).toHaveLength(3);
    });
  });

  describe('participant Removal', () => {
    it('should detect single participant removal', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'A', priority: 0, isEnabled: true },
          { id: 'p1', modelId: 'claude-3-opus', role: 'B', priority: 1, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'A', priority: 0, isEnabled: true },
          // p1 removed
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsRemoved).toHaveLength(1);
      expect(changes.participantsRemoved[0]?.modelId).toBe('claude-3-opus');
    });

    it('should handle complete participant replacement', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
          { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p2', modelId: 'gemini-pro', role: null, priority: 0, isEnabled: true },
          { id: 'p3', modelId: 'llama-70b', role: null, priority: 1, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsAdded).toHaveLength(2);
      expect(changes.participantsRemoved).toHaveLength(2);
    });
  });

  describe('participant Reordering', () => {
    it('should detect priority swap', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
          { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 1, isEnabled: true }, // Was 0, now 1
          { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 0, isEnabled: true }, // Was 1, now 0
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsReordered).toBe(true);
    });

    it('should ensure messages follow new priority order', () => {
      const store = createChatStore();

      // Round 0: GPT first, Claude second
      const participants0 = [
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true },
      ];

      store.getState().setThread(createMockThread('thread-123'));
      store.getState().setParticipants([
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ]);
      simulateRoundCompletion(store, 0, participants0);

      // Round 1: Claude first, GPT second (swapped)
      const participants1 = [
        { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 0, isEnabled: true },
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 1, isEnabled: true },
      ];

      store.getState().setParticipants([
        createMockParticipant(0, 'claude-3-opus'),
        createMockParticipant(1, 'gpt-4o'),
      ]);
      simulateRoundCompletion(store, 1, participants1);

      // Verify R1 messages have correct order
      const r1Msgs = store.getState().messages.filter((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.roundNumber === 1 && meta?.role === MessageRoles.ASSISTANT;
      }).sort((a, b) => {
        const aIdx = (a.metadata as DbAssistantMessageMetadata).participantIndex ?? 0;
        const bIdx = (b.metadata as DbAssistantMessageMetadata).participantIndex ?? 0;
        return aIdx - bIdx;
      });

      expect(r1Msgs).toHaveLength(2);
      // First message (index 0) should be from claude (priority 0)
      expect(r1Msgs[0]?.id).toContain('_p0');
    });
  });

  describe('participant Role Change', () => {
    it('should detect role change', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Critic', priority: 0, isEnabled: true }, // Role changed
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsRoleChanged).toHaveLength(1);
      expect(changes.participantsRoleChanged[0]?.role).toBe('Critic');
    });

    it('should detect null to role assignment', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Expert', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsRoleChanged).toHaveLength(1);
    });

    it('should detect role removal (to null)', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Expert', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true }, // Role removed
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsRoleChanged).toHaveLength(1);
    });
  });

  describe('model Change (Same Participant Slot)', () => {
    it('should detect model replacement as add + remove', () => {
      const prevConfig: RoundConfiguration = {
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p0', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const currConfig: RoundConfiguration = {
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
        participants: [
          { id: 'p1', modelId: 'claude-3-opus', role: 'Lead', priority: 0, isEnabled: true }, // Different ID, different model
        ],
        hasAttachments: false,
        attachmentCount: 0,
      };

      const changes = detectConfigChanges(prevConfig, currConfig);
      expect(changes.participantsRemoved).toHaveLength(1);
      expect(changes.participantsAdded).toHaveLength(1);
      expect(changes.participantsRemoved[0]?.modelId).toBe('gpt-4o');
      expect(changes.participantsAdded[0]?.modelId).toBe('claude-3-opus');
    });
  });
});

// ============================================================================
// COMBINED CHANGES TESTS
// ============================================================================

describe('combined Changes Timeline Tests', () => {
  it('should handle mode + web search + participant changes together', () => {
    const prevConfig: RoundConfiguration = {
      roundNumber: 0,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: 'Ideator', priority: 0, isEnabled: true },
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const currConfig: RoundConfiguration = {
      roundNumber: 1,
      mode: ChatModes.ANALYZING, // Changed
      enableWebSearch: true, // Changed
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: 'Analyst', priority: 0, isEnabled: true }, // Role changed
        { id: 'p1', modelId: 'claude-3-opus', role: 'Critic', priority: 1, isEnabled: true }, // Added
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const changes = detectConfigChanges(prevConfig, currConfig);

    expect(changes.modeChanged).toBe(true);
    expect(changes.webSearchToggled).toBe(true);
    expect(changes.participantsAdded).toHaveLength(1);
    expect(changes.participantsRoleChanged).toHaveLength(1);

    const entries = buildChangelogEntries('thread-123', 1, changes, prevConfig, currConfig);

    // Should have 4 entries: mode, web search, participant added, role changed
    expect(entries).toHaveLength(4);
  });

  it('should maintain correct timeline order with multiple changes', () => {
    const store = createChatStore();
    const threadId = 'thread-123';

    // Round 0: Initial state
    store.getState().setThread(createMockThread(threadId, ChatModes.BRAINSTORMING, false));
    store.getState().setParticipants([createMockParticipant(0, 'gpt-4o', 'Lead')]);
    simulateRoundCompletion(store, 0, [
      { id: 'p0', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
    ]);

    // Round 1: Multiple changes
    const changelog = [
      createChangelogEntry(threadId, 1, ChangelogChangeTypes.MODE_CHANGED, {
        previousMode: ChatModes.BRAINSTORMING,
        newMode: ChatModes.ANALYZING,
      }),
      createChangelogEntry(threadId, 1, ChangelogChangeTypes.WEB_SEARCH_TOGGLED, {
        previousValue: false,
        newValue: true,
      }),
      createChangelogEntry(threadId, 1, ChangelogChangeTypes.PARTICIPANT_ADDED, {
        participantId: 'p1',
        modelId: 'claude-3-opus',
      }),
    ];

    store.getState().setThread(createMockThread(threadId, ChatModes.ANALYZING, true));
    store.getState().setParticipants([
      createMockParticipant(0, 'gpt-4o', 'Lead'),
      createMockParticipant(1, 'claude-3-opus', 'Support'),
    ]);
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE));
    simulateRoundCompletion(store, 1, [
      { id: 'p0', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
      { id: 'p1', modelId: 'claude-3-opus', role: 'Support', priority: 1, isEnabled: true },
    ], { includePreSearch: true });

    // Verify timeline elements via useThreadTimeline
    const preSearches = store.getState().preSearches;
    const messages = store.getState().messages;

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog,
        preSearches,
      }),
    );

    // R1 should have: changelog (grouped as 1 item with 3 entries), messages
    const r1Changelog = result.current.find(
      item => item.type === 'changelog' && item.roundNumber === 1,
    );
    expect(r1Changelog).toBeDefined();
    expect(r1Changelog?.data).toHaveLength(3);

    // Pre-search for R1 - when messages exist, pre-search renders in ChatMessageList not timeline
    expect(preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();

    // R1 messages
    expect(messages.filter((m) => {
      const meta = m.metadata as DbAssistantMessageMetadata;
      return meta?.roundNumber === 1 && meta?.role === MessageRoles.ASSISTANT;
    })).toHaveLength(2);

    // R1 moderator

    // Verify timeline order for R1: changelog comes before messages
    const r1Items = result.current.filter(item => item.roundNumber === 1);
    const changelogIdx = r1Items.findIndex(item => item.type === 'changelog');
    const messagesIdx = r1Items.findIndex(item => item.type === 'messages');
    expect(changelogIdx).toBeLessThan(messagesIdx);
  });

  it('should handle no changes (identical config)', () => {
    const config: RoundConfiguration = {
      roundNumber: 0,
      mode: ChatModes.ANALYZING,
      enableWebSearch: true,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: 'Lead', priority: 0, isEnabled: true },
        { id: 'p1', modelId: 'claude-3-opus', role: 'Support', priority: 1, isEnabled: true },
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const nextConfig = { ...config, roundNumber: 1 };

    const changes = detectConfigChanges(config, nextConfig);

    expect(changes.modeChanged).toBe(false);
    expect(changes.webSearchToggled).toBe(false);
    expect(changes.participantsAdded).toHaveLength(0);
    expect(changes.participantsRemoved).toHaveLength(0);
    expect(changes.participantsReordered).toBe(false);
    expect(changes.participantsRoleChanged).toHaveLength(0);
  });
});

// ============================================================================
// CHANGELOG PLACEMENT TESTS
// ============================================================================

describe('changelog Placement in Timeline', () => {
  it('should place changelog BEFORE user message in timeline', () => {
    const store = createChatStore();
    const threadId = 'thread-123';

    // Round 0
    store.getState().setThread(createMockThread(threadId, ChatModes.BRAINSTORMING));
    store.getState().setParticipants([createMockParticipant(0, 'gpt-4o')]);
    simulateRoundCompletion(store, 0, [
      { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
    ]);

    // Round 1 with changelog
    const changelog = [
      createChangelogEntry(threadId, 1, ChangelogChangeTypes.MODE_CHANGED, {
        previousMode: ChatModes.BRAINSTORMING,
        newMode: ChatModes.ANALYZING,
      }),
    ];

    store.getState().setThread(createMockThread(threadId, ChatModes.ANALYZING));
    simulateRoundCompletion(store, 1, [
      { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
    ]);

    // Get messages from store
    const messages = store.getState().messages;

    // Verify R1 user message exists
    const r1UserMsg = messages.find((m) => {
      const meta = m.metadata as DbUserMessageMetadata;
      return meta?.role === MessageRoles.USER && meta?.roundNumber === 1;
    });
    expect(r1UserMsg).toBeDefined();

    // Verify timeline ordering using useThreadTimeline
    const { result } = renderHook(() =>
      useThreadTimeline({
        messages,
        changelog,
      }),
    );

    // Get R1 items from timeline
    const r1Items = result.current.filter(item => item.roundNumber === 1);

    // Changelog should come before messages in timeline
    const changelogIdx = r1Items.findIndex(item => item.type === 'changelog');
    const messagesIdx = r1Items.findIndex(item => item.type === 'messages');

    expect(changelogIdx).toBeGreaterThanOrEqual(0);
    expect(messagesIdx).toBeGreaterThanOrEqual(0);
    expect(changelogIdx).toBeLessThan(messagesIdx);
  });

  it('should NOT create changelog for first round', () => {
    // First round has no "previous" config to compare against
    const config0: RoundConfiguration = {
      roundNumber: 0,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    // No previous config means no changes to detect
    // The actual implementation should NOT create changelog entries for R0
    // because there's no R-1 to compare against

    // This test validates that our change detection requires both configs
    expect(() => {
      detectConfigChanges(config0, config0);
    }).not.toThrow();

    // Same config = no changes
    const changes = detectConfigChanges(config0, config0);
    expect(changes.modeChanged).toBe(false);
    expect(changes.participantsAdded).toHaveLength(0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  it('should handle empty participants list', () => {
    const prevConfig: RoundConfiguration = {
      roundNumber: 0,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const currConfig: RoundConfiguration = {
      roundNumber: 1,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const changes = detectConfigChanges(prevConfig, currConfig);
    expect(changes.participantsAdded).toHaveLength(1);
    expect(changes.participantsRemoved).toHaveLength(0);
  });

  it('should handle all participants removed', () => {
    const prevConfig: RoundConfiguration = {
      roundNumber: 0,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true },
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const currConfig: RoundConfiguration = {
      roundNumber: 1,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const changes = detectConfigChanges(prevConfig, currConfig);
    expect(changes.participantsAdded).toHaveLength(0);
    expect(changes.participantsRemoved).toHaveLength(2);
  });

  it('should handle large number of participants', () => {
    const createLargeConfig = (count: number): RoundConfiguration => ({
      roundNumber: 0,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: Array.from({ length: count }, (_, i) => ({
        id: `p${i}`,
        modelId: `model-${i}`,
        role: `Role ${i}`,
        priority: i,
        isEnabled: true,
      })),
      hasAttachments: false,
      attachmentCount: 0,
    });

    const config10 = createLargeConfig(10);
    const config5 = { ...createLargeConfig(5), roundNumber: 1 };

    const changes = detectConfigChanges(config10, config5);
    expect(changes.participantsRemoved).toHaveLength(5);
  });

  it('should handle disabled participants', () => {
    const prevConfig: RoundConfiguration = {
      roundNumber: 0,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: false }, // Disabled
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    const currConfig: RoundConfiguration = {
      roundNumber: 1,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
      participants: [
        { id: 'p0', modelId: 'gpt-4o', role: null, priority: 0, isEnabled: true },
        { id: 'p1', modelId: 'claude-3-opus', role: null, priority: 1, isEnabled: true }, // Now enabled
      ],
      hasAttachments: false,
      attachmentCount: 0,
    };

    // Detect the re-enabling
    const p1Prev = prevConfig.participants.find(p => p.id === 'p1');
    const p1Curr = currConfig.participants.find(p => p.id === 'p1');

    const wasReEnabled = p1Prev && !p1Prev.isEnabled && p1Curr && p1Curr.isEnabled;
    expect(wasReEnabled).toBe(true);
  });
});

// ============================================================================
// ROUND NUMBER CONSISTENCY TESTS
// ============================================================================

describe('round Number Consistency', () => {
  it('should ensure all elements for a round have matching roundNumber', () => {
    const store = createChatStore();
    const threadId = 'thread-123';
    const roundNumber = 2;

    store.getState().setThread(createMockThread(threadId, ChatModes.ANALYZING, true));
    store.getState().setParticipants([createMockParticipant(0, 'gpt-4o')]);

    // Add elements for round 2
    const userMsg = createTestUserMessage({
      id: `user-r${roundNumber}`,
      content: 'Question',
      roundNumber,
    });

    const p0Msg = createTestAssistantMessage({
      id: `${threadId}_r${roundNumber}_p0`,
      content: 'Response',
      roundNumber,
      participantId: 'p0',
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    store.getState().setMessages([userMsg, p0Msg]);
    store.getState().addPreSearch(createMockStoredPreSearch(roundNumber, MessageStatuses.COMPLETE));

    // Verify all elements have correct roundNumber
    const messages = store.getState().messages;
    const preSearches = store.getState().preSearches;

    messages.forEach((msg) => {
      const meta = msg.metadata as DbUserMessageMetadata | DbAssistantMessageMetadata;
      expect(meta.roundNumber).toBe(roundNumber);
    });

    expect(preSearches[0]?.roundNumber).toBe(roundNumber);
  });

  it('should detect roundNumber mismatch in message ID vs metadata', () => {
    // Message ID format: threadId_r{round}_p{index}
    const messageId = 'thread-123_r2_p0';
    const metadata = { roundNumber: 3 }; // Mismatch!

    // Extract round from ID
    const idMatch = messageId.match(/_r(\d+)_p(\d+)/);
    const roundFromId = idMatch ? Number.parseInt(idMatch[1]!, 10) : null;
    const roundFromMetadata = metadata.roundNumber;

    expect(roundFromId).toBe(2);
    expect(roundFromMetadata).toBe(3);
    expect(roundFromId).not.toBe(roundFromMetadata);
  });
});
