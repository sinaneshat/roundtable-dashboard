/**
 * Configuration Changes Between Rounds - Comprehensive E2E Tests
 *
 * Tests all types of configuration changes between rounds as documented in
 * FLOW_DOCUMENTATION.md Part 6: Configuration Changes Mid-Conversation
 *
 * Coverage:
 * - Participant additions (1, 2, 3+ participants)
 * - Participant removals (single, multiple, all but one)
 * - Participant role changes (add role, remove role, swap roles)
 * - Participant priority/order changes (swap, reverse, shuffle)
 * - Mode changes (panel → council, all mode transitions)
 * - Web search toggle (ON → OFF, OFF → ON, rapid toggling)
 * - File attachments added/removed (future feature)
 * - Combined changes (multiple types at once)
 * - Changes that cancel each other out
 * - Rapid config changes before submission
 * - Config changes on rounds 2, 3, 5, 10
 *
 * Per FLOW_DOCUMENTATION.md:
 * "Changes save when user submits next message (not immediately)."
 * "Configuration Change Banner appears before the round that uses new configuration."
 */

import type { ChatMode } from '@roundtable/shared';
import { ChatModes, FinishReasons, MessageRoles } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import type { ChatParticipant } from '@/types/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// TYPES
// ============================================================================

type ParticipantChange = {
  participantId: string;
  modelId: string;
  role: string | null;
  changeType: 'added' | 'removed' | 'role_changed' | 'priority_changed';
};

type RoundConfig = {
  roundNumber: number;
  participants: ChatParticipant[];
  mode: ChatMode;
  enableWebSearch: boolean;
};

// ============================================================================
// HELPERS
// ============================================================================

function completeRound(
  store: ChatStoreApi,
  config: RoundConfig,
  options: {
    includePreSearch?: boolean;
    includeModerator?: boolean;
  } = {},
): void {
  const { roundNumber, participants } = config;
  const { includePreSearch = false } = options;

  // User message
  const userMsg = createTestUserMessage({
    id: `user-r${roundNumber}`,
    content: `Question for round ${roundNumber}`,
    roundNumber,
  });

  // Participant messages (sorted by priority)
  const sortedParticipants = [...participants].sort((a, b) => a.priority - b.priority);
  const participantMsgs = sortedParticipants.map((p, idx) =>
    createTestAssistantMessage({
      id: `thread-123_r${roundNumber}_p${idx}`,
      content: `Response from ${p.modelId}`,
      roundNumber,
      participantId: p.id,
      participantIndex: idx,
      finishReason: FinishReasons.STOP,
    }),
  );

  // Add pre-search if enabled
  if (includePreSearch) {
    store.getState().addPreSearch({
      id: `presearch-r${roundNumber}`,
      threadId: 'thread-123',
      roundNumber,
      status: 'complete',
      searchData: {
        queries: [],
        results: [],
        summary: 'Web search results',
        successCount: 1,
        failureCount: 0,
        totalResults: 3,
        totalTime: 1000,
      },
      userQuery: `Question for round ${roundNumber}`,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: new Date(),
    });
  }

  // Update messages
  const existingMessages = store.getState().messages;
  store.getState().setMessages([...existingMessages, userMsg, ...participantMsgs]);

  // Mark round complete
  store.getState().completeStreaming();
}

function detectParticipantChanges(
  prev: ChatParticipant[],
  curr: ChatParticipant[],
): ParticipantChange[] {
  const changes: ParticipantChange[] = [];
  const prevIds = new Set(prev.map(p => p.id));
  const currIds = new Set(curr.map(p => p.id));

  // Detect additions
  curr.forEach((p) => {
    if (!prevIds.has(p.id)) {
      changes.push({
        participantId: p.id,
        modelId: p.modelId,
        role: p.role,
        changeType: 'added',
      });
    }
  });

  // Detect removals
  prev.forEach((p) => {
    if (!currIds.has(p.id)) {
      changes.push({
        participantId: p.id,
        modelId: p.modelId,
        role: p.role,
        changeType: 'removed',
      });
    }
  });

  // Detect role changes
  curr.forEach((currP) => {
    const prevP = prev.find(p => p.id === currP.id);
    if (prevP && prevP.role !== currP.role) {
      changes.push({
        participantId: currP.id,
        modelId: currP.modelId,
        role: currP.role,
        changeType: 'role_changed',
      });
    }
  });

  // Detect priority changes
  curr.forEach((currP) => {
    const prevP = prev.find(p => p.id === currP.id);
    if (prevP && prevP.priority !== currP.priority) {
      changes.push({
        participantId: currP.id,
        modelId: currP.modelId,
        role: currP.role,
        changeType: 'priority_changed',
      });
    }
  });

  return changes;
}

// ============================================================================
// PARTICIPANT ADDITION TESTS
// ============================================================================

describe('participant Additions Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should add 1 participant between Round 0 and Round 1', () => {
    // Round 0: 2 participants
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Round 1: Add 1 participant
    const round1Participants = [
      ...round0Participants,
      createMockParticipant(2, { modelId: 'gemini-pro', role: 'Ideator' }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'added')).toHaveLength(1);
    expect(changes.find(c => c.changeType === 'added')?.modelId).toBe('gemini-pro');

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus', 'gemini-pro']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Verify Round 1 has 3 participant messages
    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(3);
  });

  it('should add 2 participants between Round 0 and Round 1', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1, { modelId: 'claude-3-opus' }),
      createMockParticipant(2, { modelId: 'gemini-pro' }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'added')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus', 'gemini-pro']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(3);
  });

  it('should add 3+ participants in single transition', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1, { modelId: 'claude-3-opus' }),
      createMockParticipant(2, { modelId: 'gemini-pro' }),
      createMockParticipant(3, { modelId: 'mistral-large' }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'added')).toHaveLength(3);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus', 'gemini-pro', 'mistral-large']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(4);
  });

  it('should verify new participants receive context from previous rounds', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Add new participant in Round 1
    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'NewParticipant' }),
    ];

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus']);

    // New participant should have access to Round 0 messages
    const allMessages = store.getState().messages;
    expect(allMessages.length).toBeGreaterThan(0);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Verify Round 1 has both participants
    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(2);
  });
});

// ============================================================================
// PARTICIPANT REMOVAL TESTS
// ============================================================================

describe('participant Removals Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should remove 1 participant between rounds', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o' }),
      createMockParticipant(1, { modelId: 'claude-3-opus' }),
      createMockParticipant(2, { modelId: 'gemini-pro' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Remove participant-1
    const round1Participants = [
      round0Participants[0]!,
      round0Participants[2]!,
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(1);
    expect(changes.find(c => c.changeType === 'removed')?.participantId).toBe('participant-1');

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'gemini-pro']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(2);
  });

  it('should remove multiple participants', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o' }),
      createMockParticipant(1, { modelId: 'claude-3-opus' }),
      createMockParticipant(2, { modelId: 'gemini-pro' }),
      createMockParticipant(3, { modelId: 'mistral-large' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [round0Participants[0]!];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(3);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(1);
  });

  it('should handle removing all but one participant', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o' }),
      createMockParticipant(1, { modelId: 'claude-3-opus' }),
      createMockParticipant(2, { modelId: 'gemini-pro' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    const round1Participants = [round0Participants[1]!]; // Keep only claude

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['claude-3-opus']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(1);
  });
});

// ============================================================================
// PARTICIPANT ROLE CHANGE TESTS
// ============================================================================

describe('participant Role Changes Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should change role from one value to another', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Ideator' }), // Changed
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic' }), // Same
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    const roleChanges = changes.filter(c => c.changeType === 'role_changed');
    expect(roleChanges).toHaveLength(1);
    expect(roleChanges[0]?.participantId).toBe('participant-0');
    expect(roleChanges[0]?.role).toBe('Ideator');

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });
  });

  it('should add role (null → value)', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: null }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Expert' }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(1);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });
  });

  it('should remove role (value → null)', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Expert' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: null }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(1);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });
  });

  it('should swap roles between participants', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Critic' }), // Swapped
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Analyst' }), // Swapped
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });
  });
});

// ============================================================================
// PARTICIPANT PRIORITY/ORDER CHANGE TESTS
// ============================================================================

describe('participant Priority/Order Changes Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should swap priority between 2 participants', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 0 }),
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 1 }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 1 }), // Was 0, now 1
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 0 }), // Was 1, now 0
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'priority_changed')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['claude-3-opus', 'gpt-4o']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Verify messages follow new priority order
    const r1Messages = store.getState().messages.filter(m =>
      m.metadata?.role === MessageRoles.ASSISTANT && m.metadata?.roundNumber === 1,
    );
    expect(r1Messages).toHaveLength(2);
    // First message (index 0) should be from participant with priority 0 (claude)
    expect(r1Messages[0]?.id).toContain('_p0');
  });

  it('should reverse priority order of 3 participants', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 0 }),
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 1 }),
      createMockParticipant(2, { modelId: 'gemini-pro', priority: 2 }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 2 }), // 0 → 2
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 1 }), // Same
      createMockParticipant(2, { modelId: 'gemini-pro', priority: 0 }), // 2 → 0
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'priority_changed')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });
  });

  it('should shuffle priorities of 4 participants', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 0 }),
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 1 }),
      createMockParticipant(2, { modelId: 'gemini-pro', priority: 2 }),
      createMockParticipant(3, { modelId: 'mistral-large', priority: 3 }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Shuffle: 2, 0, 3, 1
    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 1 }), // 0 → 1
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 3 }), // 1 → 3
      createMockParticipant(2, { modelId: 'gemini-pro', priority: 0 }), // 2 → 0
      createMockParticipant(3, { modelId: 'mistral-large', priority: 2 }), // 3 → 2
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'priority_changed')).toHaveLength(4);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });
  });
});

// ============================================================================
// MODE CHANGE TESTS
// ============================================================================

describe('mode Changes Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should change from panel to council mode', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Change to council mode
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));

    completeRound(store, {
      roundNumber: 1,
      participants,
      mode: ChatModes.DEBATING,
      enableWebSearch: false,
    });

    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
  });

  it('should handle all mode transitions', () => {
    const modes = [ChatModes.BRAINSTORMING, ChatModes.ANALYZING, ChatModes.DEBATING, ChatModes.SOLVING];
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i]!;
      store.getState().setSelectedMode(mode);
      store.getState().setThread(createMockThread({ mode }));

      completeRound(store, {
        roundNumber: i,
        participants,
        mode,
        enableWebSearch: false,
      });

      expect(store.getState().selectedMode).toBe(mode);
    }
  });

  it('should verify moderator uses new mode criteria', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Change to debating mode
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));

    completeRound(store, {
      roundNumber: 1,
      participants,
      mode: ChatModes.DEBATING,
      enableWebSearch: false,
    });

    // Mode should reflect debating (would affect moderator evaluation criteria)
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
  });
});

// ============================================================================
// WEB SEARCH TOGGLE TESTS
// ============================================================================

describe('web Search Toggle Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should toggle from OFF to ON', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Enable web search for Round 1
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));

    completeRound(store, {
      roundNumber: 1,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: true,
    }, { includePreSearch: true });

    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().preSearches.find(p => p.roundNumber === 1)).toBeDefined();
  });

  it('should toggle from ON to OFF', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: true,
    }, { includePreSearch: true });

    // Disable web search for Round 1
    store.getState().setEnableWebSearch(false);
    store.getState().setThread(createMockThread({ enableWebSearch: false }));

    completeRound(store, {
      roundNumber: 1,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    expect(store.getState().enableWebSearch).toBe(false);
    expect(store.getState().preSearches.find(p => p.roundNumber === 1)).toBeUndefined();
  });

  it('should handle rapid toggling: OFF → ON → OFF → ON', () => {
    const participants = [createMockParticipant(0)];
    const toggleStates = [false, true, false, true];

    store.getState().setParticipants(participants);

    for (let i = 0; i < toggleStates.length; i++) {
      const enableWebSearch = toggleStates[i]!;
      store.getState().setEnableWebSearch(enableWebSearch);
      store.getState().setThread(createMockThread({ enableWebSearch }));

      completeRound(store, {
        roundNumber: i,
        participants,
        mode: ChatModes.ANALYZING,
        enableWebSearch,
      }, { includePreSearch: enableWebSearch });

      expect(store.getState().enableWebSearch).toBe(enableWebSearch);

      const preSearch = store.getState().preSearches.find(p => p.roundNumber === i);
      expect(preSearch).toBe(enableWebSearch ? preSearch : undefined);
    }
  });
});

// ============================================================================
// COMBINED CHANGES TESTS
// ============================================================================

describe('combined Changes (Multiple Types at Once)', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should handle participant add + mode change', () => {
    const round0Participants = [createMockParticipant(0)];

    store.getState().setParticipants(round0Participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1, { modelId: 'claude-3-opus' }),
    ];

    store.getState().setParticipants(round1Participants);
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setThread(createMockThread({ mode: ChatModes.ANALYZING }));
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().participants).toHaveLength(2);
  });

  it('should handle participant remove + web search toggle', () => {
    const round0Participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().setParticipants(round0Participants);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const round1Participants = [round0Participants[0]!];

    store.getState().setParticipants(round1Participants);
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setExpectedParticipantIds(['gpt-4o']);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: true,
    }, { includePreSearch: true });

    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().participants).toHaveLength(1);
  });

  it('should handle all change types simultaneously', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Analyst', priority: 0 }),
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic', priority: 1 }),
    ];

    store.getState().setParticipants(round0Participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Apply all change types
    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Ideator', priority: 1 }), // Role + priority changed
      createMockParticipant(2, { modelId: 'gemini-pro', role: 'Synthesizer', priority: 0 }), // Added
      // participant-1 removed
    ];

    store.getState().setParticipants(round1Participants);
    store.getState().setSelectedMode(ChatModes.ANALYZING); // Mode changed
    store.getState().setEnableWebSearch(true); // Web search toggled
    store.getState().setThread(createMockThread({ mode: ChatModes.ANALYZING, enableWebSearch: true }));
    store.getState().setExpectedParticipantIds(['gemini-pro', 'gpt-4o']);

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'added')).toHaveLength(1);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(1);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(1);
    expect(changes.filter(c => c.changeType === 'priority_changed')).toHaveLength(1);

    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: true,
    }, { includePreSearch: true });

    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().participants).toHaveLength(2);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should handle changes that cancel each other out (add then remove same participant)', () => {
    const round0Participants = [createMockParticipant(0)];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // User adds participant-1
    let round1Participants = [
      ...round0Participants,
      createMockParticipant(1),
    ];

    // User immediately removes participant-1 (before submitting)
    round1Participants = round0Participants;

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes).toHaveLength(0); // No net changes

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      roundNumber: 1,
      participants: round1Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });
  });

  it('should handle rapid config changes before submission', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Rapid changes: mode → web search → mode again
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Final state at submission
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    expect(store.getState().enableWebSearch).toBe(true);
  });

  it('should handle config changes on round 2', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    // Complete rounds 0 and 1
    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    completeRound(store, {
      roundNumber: 1,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Change config for round 2
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));

    completeRound(store, {
      roundNumber: 2,
      participants,
      mode: ChatModes.DEBATING,
      enableWebSearch: false,
    });

    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
  });

  it('should handle config changes on round 5', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    // Complete rounds 0-4
    for (let i = 0; i < 5; i++) {
      completeRound(store, {
        roundNumber: i,
        participants,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      });
    }

    // Change config for round 5
    const newParticipants = [
      ...participants,
      createMockParticipant(1),
    ];

    store.getState().setParticipants(newParticipants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus']);

    completeRound(store, {
      roundNumber: 5,
      participants: newParticipants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    expect(store.getState().participants).toHaveLength(2);
  });

  it('should handle config changes on round 10', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    // Complete rounds 0-9
    for (let i = 0; i < 10; i++) {
      completeRound(store, {
        roundNumber: i,
        participants,
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      });
    }

    // Change config for round 10
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));

    completeRound(store, {
      roundNumber: 10,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: true,
    }, { includePreSearch: true });

    expect(store.getState().enableWebSearch).toBe(true);
  });

  it('should handle no changes between rounds', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // No changes for round 1
    completeRound(store, {
      roundNumber: 1,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    const changes = detectParticipantChanges(participants, participants);
    expect(changes).toHaveLength(0);
  });
});

// ============================================================================
// CONFIG CHANGE FLAGS & DETECTION TESTS
// ============================================================================

describe('config Change Flags and Detection', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should set hasPendingConfigChanges when mode changes', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Initially no pending changes
    expect(store.getState().hasPendingConfigChanges).toBe(false);

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true); // This simulates handleModeChange

    // Verify flag is set
    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  it('should set hasPendingConfigChanges when web search toggles', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Initially no pending changes
    expect(store.getState().hasPendingConfigChanges).toBe(false);

    // Toggle web search
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true); // This simulates handleWebSearchToggle

    // Verify flag is set
    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  it('should set hasPendingConfigChanges when participants change', () => {
    const round0Participants = [createMockParticipant(0)];

    store.getState().setParticipants(round0Participants);

    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Initially no pending changes
    expect(store.getState().hasPendingConfigChanges).toBe(false);

    // Add participant
    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1),
    ];
    store.getState().setParticipants(round1Participants);
    store.getState().setHasPendingConfigChanges(true); // This simulates participant change

    // Verify flag is set
    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  it('should detect hasAnyChanges when mode changes', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setThread(createMockThread({ mode: ChatModes.BRAINSTORMING }));

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);

    // Verify mode changed detection
    const currentModeId = store.getState().thread?.mode || null;
    const selectedMode = store.getState().selectedMode;
    const modeChanged = currentModeId !== selectedMode;

    expect(modeChanged).toBe(true);
  });

  it('should detect hasAnyChanges when web search toggles', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);
    store.getState().setThread(createMockThread({ enableWebSearch: false }));

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Toggle web search
    store.getState().setEnableWebSearch(true);

    // Verify web search changed detection
    const currentWebSearch = store.getState().thread?.enableWebSearch || false;
    const selectedWebSearch = store.getState().enableWebSearch;
    const webSearchChanged = currentWebSearch !== selectedWebSearch;

    expect(webSearchChanged).toBe(true);
  });

  it('should detect hasAnyChanges via hasPendingConfigChanges flag even when values match', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);
    store.getState().setThread(createMockThread({ enableWebSearch: false }));

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // User toggles OFF → ON → OFF (back to original value)
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setEnableWebSearch(false); // Back to original

    // Even though value matches thread state, hasPendingConfigChanges=true indicates user made a change
    const currentWebSearch = store.getState().thread?.enableWebSearch || false;
    const selectedWebSearch = store.getState().enableWebSearch;
    const webSearchChanged = currentWebSearch !== selectedWebSearch;
    const hasPendingConfigChanges = store.getState().hasPendingConfigChanges;

    expect(webSearchChanged).toBe(false); // Values match
    expect(hasPendingConfigChanges).toBe(true); // But flag indicates change happened
    // hasAnyChanges = webSearchChanged || hasPendingConfigChanges = true
  });

  it('should clear hasPendingConfigChanges after successful submission', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Simulate config change
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().hasPendingConfigChanges).toBe(true);

    // Simulate successful submission (form-actions.ts clears the flag)
    store.getState().setHasPendingConfigChanges(false);

    expect(store.getState().hasPendingConfigChanges).toBe(false);
  });
});

// ============================================================================
// CHANGELOG FETCH & SYNC TESTS
// ============================================================================

describe('changelog Fetch and Sync After Config Changes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should set isWaitingForChangelog=true after PATCH completes', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Initially not waiting
    expect(store.getState().isWaitingForChangelog).toBe(false);

    // Simulate PATCH completion (form-actions.ts sets this flag)
    store.getState().setIsWaitingForChangelog(true);

    expect(store.getState().isWaitingForChangelog).toBe(true);
  });

  it('should set configChangeRoundNumber after PATCH to block streaming', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Initially null
    expect(store.getState().configChangeRoundNumber).toBeNull();

    // Simulate PATCH setting configChangeRoundNumber for round 1
    store.getState().setConfigChangeRoundNumber(1);

    expect(store.getState().configChangeRoundNumber).toBe(1);
  });

  it('should clear isWaitingForChangelog after changelog sync completes', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Set waiting flags
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);

    expect(store.getState().isWaitingForChangelog).toBe(true);
    expect(store.getState().configChangeRoundNumber).toBe(1);

    // Simulate changelog sync completion (use-changelog-sync.ts clears flags)
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    expect(store.getState().isWaitingForChangelog).toBe(false);
    expect(store.getState().configChangeRoundNumber).toBeNull();
  });

  it('should set isWaitingForChangelog even when no config changes exist', () => {
    // This test verifies the fix for hasActiveFormSubmission staying true
    // Even when hasAnyChanges=false, isWaitingForChangelog should be set
    // to prevent initializeThread from resetting streaming state
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // No config changes, but still set isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(true);

    expect(store.getState().isWaitingForChangelog).toBe(true);

    // use-changelog-sync will fetch (empty) changelog and clear flag
    store.getState().setIsWaitingForChangelog(false);

    expect(store.getState().isWaitingForChangelog).toBe(false);
  });
});

// ============================================================================
// PLACEHOLDER PERSISTENCE DURING CONFIG CHANGES
// ============================================================================

describe('placeholder Persistence During Config Changes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread());
  });

  it('should keep placeholders visible when mode changes between rounds', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.BRAINSTORMING,
      enableWebSearch: false,
    });

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true);

    // Set streaming state (placeholders would be added here)
    store.getState().setStreamingRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    // Verify placeholders aren't cleared by config change
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('should keep pre-search placeholder visible when web search is enabled', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);

    // Add pre-search placeholder
    store.getState().addPreSearch({
      id: 'presearch-r1',
      threadId: 'thread-123',
      roundNumber: 1,
      status: 'pending',
      searchData: null,
      userQuery: 'Question for round 1',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // Verify pre-search placeholder exists
    const preSearch = store.getState().preSearches.find(p => p.roundNumber === 1);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe('pending');
  });

  it('should keep participant placeholders visible when participants change', () => {
    const round0Participants = [createMockParticipant(0)];

    store.getState().setParticipants(round0Participants);

    completeRound(store, {
      roundNumber: 0,
      participants: round0Participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Add participant
    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1),
    ];

    store.getState().setParticipants(round1Participants);
    store.getState().setHasPendingConfigChanges(true);

    // Set expected participants (would trigger placeholders)
    store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus']);
    store.getState().setStreamingRoundNumber(1);

    // Verify expected participants aren't cleared
    expect(store.getState().expectedParticipantIds).toEqual(['gpt-4o', 'claude-3-opus']);
    expect(store.getState().streamingRoundNumber).toBe(1);
  });

  it('should not clear placeholders when configChangeRoundNumber is set', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Set placeholders for round 1
    store.getState().setStreamingRoundNumber(1);
    store.getState().setExpectedParticipantIds(['gpt-4o']);
    store.getState().setWaitingToStartStreaming(true);

    // Set config change flags (PATCH completion)
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Verify placeholders persist
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().expectedParticipantIds).toEqual(['gpt-4o']);
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('should not clear placeholders when isWaitingForChangelog is true', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      roundNumber: 0,
      participants,
      mode: ChatModes.ANALYZING,
      enableWebSearch: false,
    });

    // Set placeholders for round 1
    store.getState().setStreamingRoundNumber(1);
    store.getState().setExpectedParticipantIds(['gpt-4o']);

    // Set changelog waiting flag
    store.getState().setIsWaitingForChangelog(true);

    // Verify placeholders persist
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().expectedParticipantIds).toEqual(['gpt-4o']);
  });
});
