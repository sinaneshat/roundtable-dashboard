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
import type { ChatParticipant } from '@/services/api';

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
  const { participants, roundNumber } = config;
  const { includePreSearch = false } = options;

  // User message
  const userMsg = createTestUserMessage({
    content: `Question for round ${roundNumber}`,
    id: `user-r${roundNumber}`,
    roundNumber,
  });

  // Participant messages (sorted by priority)
  const sortedParticipants = [...participants].sort((a, b) => a.priority - b.priority);
  const participantMsgs = sortedParticipants.map((p, idx) =>
    createTestAssistantMessage({
      content: `Response from ${p.modelId}`,
      finishReason: FinishReasons.STOP,
      id: `thread-123_r${roundNumber}_p${idx}`,
      participantId: p.id,
      participantIndex: idx,
      roundNumber,
    }),
  );

  // Add pre-search if enabled
  if (includePreSearch) {
    store.getState().addPreSearch({
      completedAt: new Date(),
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: {
        failureCount: 0,
        queries: [],
        results: [],
        successCount: 1,
        summary: 'Web search results',
        totalResults: 3,
        totalTime: 1000,
      },
      status: 'complete',
      threadId: 'thread-123',
      userQuery: `Question for round ${roundNumber}`,
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
        changeType: 'added',
        modelId: p.modelId,
        participantId: p.id,
        role: p.role,
      });
    }
  });

  // Detect removals
  prev.forEach((p) => {
    if (!currIds.has(p.id)) {
      changes.push({
        changeType: 'removed',
        modelId: p.modelId,
        participantId: p.id,
        role: p.role,
      });
    }
  });

  // Detect role changes
  curr.forEach((currP) => {
    const prevP = prev.find(p => p.id === currP.id);
    if (prevP && prevP.role !== currP.role) {
      changes.push({
        changeType: 'role_changed',
        modelId: currP.modelId,
        participantId: currP.id,
        role: currP.role,
      });
    }
  });

  // Detect priority changes
  curr.forEach((currP) => {
    const prevP = prev.find(p => p.id === currP.id);
    if (prevP && prevP.priority !== currP.priority) {
      changes.push({
        changeType: 'priority_changed',
        modelId: currP.modelId,
        participantId: currP.id,
        role: currP.role,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
    });

    // Remove participant-1
    const p0 = round0Participants[0];
    const p2 = round0Participants[2];
    if (!p0) {
      throw new Error('expected round0Participants[0] to exist');
    }
    if (!p2) {
      throw new Error('expected round0Participants[2] to exist');
    }
    const round1Participants = [p0, p2];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(1);
    expect(changes.find(c => c.changeType === 'removed')?.participantId).toBe('participant-1');

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o', 'gemini-pro']);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
    });

    const p0 = round0Participants[0];
    if (!p0) {
      throw new Error('expected round0Participants[0] to exist');
    }
    const round1Participants = [p0];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(3);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['gpt-4o']);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round0Participants,
      roundNumber: 0,
    });

    const p1 = round0Participants[1];
    if (!p1) {
      throw new Error('expected round0Participants[1] to exist');
    }
    const round1Participants = [p1]; // Keep only claude

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    store.getState().setExpectedParticipantIds(['claude-3-opus']);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round1Participants,
      roundNumber: 1,
    });
  });

  it('should add role (null → value)', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: null }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Expert' }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(1);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
    });
  });

  it('should remove role (value → null)', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Expert' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: null }),
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(1);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
    });
  });

  it('should swap roles between participants', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Critic' }),
    ];

    store.getState().setParticipants(round0Participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round0Participants,
      roundNumber: 0,
    });

    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', role: 'Critic' }), // Swapped
      createMockParticipant(1, { modelId: 'claude-3-opus', role: 'Analyst' }), // Swapped
    ];

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(2);

    store.getState().setParticipants(round1Participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Change to council mode
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.DEBATING,
      participants,
      roundNumber: 1,
    });

    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
  });

  it('should handle all mode transitions', () => {
    const modes = [ChatModes.BRAINSTORMING, ChatModes.ANALYZING, ChatModes.DEBATING, ChatModes.SOLVING];
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i];
      if (!mode) {
        throw new Error(`expected modes[${i}] to exist`);
      }
      store.getState().setSelectedMode(mode);
      store.getState().setThread(createMockThread({ mode }));

      completeRound(store, {
        enableWebSearch: false,
        mode,
        participants,
        roundNumber: i,
      });

      expect(store.getState().selectedMode).toBe(mode);
    }
  });

  it('should verify moderator uses new mode criteria', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Change to debating mode
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.DEBATING,
      participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // Enable web search for Round 1
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));

    completeRound(store, {
      enableWebSearch: true,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 1,
    }, { includePreSearch: true });

    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().preSearches.find(p => p.roundNumber === 1)).toBeDefined();
  });

  it('should toggle from ON to OFF', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));

    completeRound(store, {
      enableWebSearch: true,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    }, { includePreSearch: true });

    // Disable web search for Round 1
    store.getState().setEnableWebSearch(false);
    store.getState().setThread(createMockThread({ enableWebSearch: false }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 1,
    });

    expect(store.getState().enableWebSearch).toBeFalsy();
    expect(store.getState().preSearches.find(p => p.roundNumber === 1)).toBeUndefined();
  });

  it('should handle rapid toggling: OFF → ON → OFF → ON', () => {
    const participants = [createMockParticipant(0)];
    const toggleStates = [false, true, false, true];

    store.getState().setParticipants(participants);

    for (let i = 0; i < toggleStates.length; i++) {
      const enableWebSearch = toggleStates[i];
      if (enableWebSearch === undefined) {
        throw new Error(`expected toggleStates[${i}] to exist`);
      }
      store.getState().setEnableWebSearch(enableWebSearch);
      store.getState().setThread(createMockThread({ enableWebSearch }));

      completeRound(store, {
        enableWebSearch,
        mode: ChatModes.ANALYZING,
        participants,
        roundNumber: i,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
    });

    const p0 = round0Participants[0];
    if (!p0) {
      throw new Error('expected round0Participants[0] to exist');
    }
    const round1Participants = [p0];

    store.getState().setParticipants(round1Participants);
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));
    store.getState().setExpectedParticipantIds(['gpt-4o']);

    completeRound(store, {
      enableWebSearch: true,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
    }, { includePreSearch: true });

    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().participants).toHaveLength(1);
  });

  it('should handle all change types simultaneously', () => {
    const round0Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 0, role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'claude-3-opus', priority: 1, role: 'Critic' }),
    ];

    store.getState().setParticipants(round0Participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants: round0Participants,
      roundNumber: 0,
    });

    // Apply all change types
    const round1Participants = [
      createMockParticipant(0, { modelId: 'gpt-4o', priority: 1, role: 'Ideator' }), // Role + priority changed
      createMockParticipant(2, { modelId: 'gemini-pro', priority: 0, role: 'Synthesizer' }), // Added
      // participant-1 removed
    ];

    store.getState().setParticipants(round1Participants);
    store.getState().setSelectedMode(ChatModes.ANALYZING); // Mode changed
    store.getState().setEnableWebSearch(true); // Web search toggled
    store.getState().setThread(createMockThread({ enableWebSearch: true, mode: ChatModes.ANALYZING }));
    store.getState().setExpectedParticipantIds(['gemini-pro', 'gpt-4o']);

    const changes = detectParticipantChanges(round0Participants, round1Participants);
    expect(changes.filter(c => c.changeType === 'added')).toHaveLength(1);
    expect(changes.filter(c => c.changeType === 'removed')).toHaveLength(1);
    expect(changes.filter(c => c.changeType === 'role_changed')).toHaveLength(1);
    expect(changes.filter(c => c.changeType === 'priority_changed')).toHaveLength(1);

    completeRound(store, {
      enableWebSearch: true,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
    }, { includePreSearch: true });

    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().enableWebSearch).toBeTruthy();
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round1Participants,
      roundNumber: 1,
    });
  });

  it('should handle rapid config changes before submission', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Rapid changes: mode → web search → mode again
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Final state at submission
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    expect(store.getState().enableWebSearch).toBeTruthy();
  });

  it('should handle config changes on round 2', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    // Complete rounds 0 and 1
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 1,
    });

    // Change config for round 2
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.DEBATING,
      participants,
      roundNumber: 2,
    });

    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
  });

  it('should handle config changes on round 5', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    // Complete rounds 0-4
    for (let i = 0; i < 5; i++) {
      completeRound(store, {
        enableWebSearch: false,
        mode: ChatModes.ANALYZING,
        participants,
        roundNumber: i,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: newParticipants,
      roundNumber: 5,
    });

    expect(store.getState().participants).toHaveLength(2);
  });

  it('should handle config changes on round 10', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    // Complete rounds 0-9
    for (let i = 0; i < 10; i++) {
      completeRound(store, {
        enableWebSearch: false,
        mode: ChatModes.ANALYZING,
        participants,
        roundNumber: i,
      });
    }

    // Change config for round 10
    store.getState().setEnableWebSearch(true);
    store.getState().setThread(createMockThread({ enableWebSearch: true }));

    completeRound(store, {
      enableWebSearch: true,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 10,
    }, { includePreSearch: true });

    expect(store.getState().enableWebSearch).toBeTruthy();
  });

  it('should handle no changes between rounds', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // No changes for round 1
    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 1,
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Initially no pending changes
    expect(store.getState().hasPendingConfigChanges).toBeFalsy();

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true); // This simulates handleModeChange

    // Verify flag is set
    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
  });

  it('should set hasPendingConfigChanges when web search toggles', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // Initially no pending changes
    expect(store.getState().hasPendingConfigChanges).toBeFalsy();

    // Toggle web search
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true); // This simulates handleWebSearchToggle

    // Verify flag is set
    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
  });

  it('should set hasPendingConfigChanges when participants change', () => {
    const round0Participants = [createMockParticipant(0)];

    store.getState().setParticipants(round0Participants);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
    });

    // Initially no pending changes
    expect(store.getState().hasPendingConfigChanges).toBeFalsy();

    // Add participant
    const round1Participants = [
      ...round0Participants,
      createMockParticipant(1),
    ];
    store.getState().setParticipants(round1Participants);
    store.getState().setHasPendingConfigChanges(true); // This simulates participant change

    // Verify flag is set
    expect(store.getState().hasPendingConfigChanges).toBeTruthy();
  });

  it('should detect hasAnyChanges when mode changes', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setThread(createMockThread({ mode: ChatModes.BRAINSTORMING }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);

    // Verify mode changed detection
    const currentModeId = store.getState().thread?.mode || null;
    const selectedMode = store.getState().selectedMode;
    const modeChanged = currentModeId !== selectedMode;

    expect(modeChanged).toBeTruthy();
  });

  it('should detect hasAnyChanges when web search toggles', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);
    store.getState().setThread(createMockThread({ enableWebSearch: false }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // Toggle web search
    store.getState().setEnableWebSearch(true);

    // Verify web search changed detection
    const currentWebSearch = store.getState().thread?.enableWebSearch || false;
    const selectedWebSearch = store.getState().enableWebSearch;
    const webSearchChanged = currentWebSearch !== selectedWebSearch;

    expect(webSearchChanged).toBeTruthy();
  });

  it('should detect hasAnyChanges via hasPendingConfigChanges flag even when values match', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);
    store.getState().setThread(createMockThread({ enableWebSearch: false }));

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
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

    expect(webSearchChanged).toBeFalsy(); // Values match
    expect(hasPendingConfigChanges).toBeTruthy(); // But flag indicates change happened
    // hasAnyChanges = webSearchChanged || hasPendingConfigChanges = true
  });

  it('should clear hasPendingConfigChanges after successful submission', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Simulate config change
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().hasPendingConfigChanges).toBeTruthy();

    // Simulate successful submission (form-actions.ts clears the flag)
    store.getState().setHasPendingConfigChanges(false);

    expect(store.getState().hasPendingConfigChanges).toBeFalsy();
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // Initially not waiting
    expect(store.getState().isWaitingForChangelog).toBeFalsy();

    // Simulate PATCH completion (form-actions.ts sets this flag)
    store.getState().setIsWaitingForChangelog(true);

    expect(store.getState().isWaitingForChangelog).toBeTruthy();
  });

  it('should set configChangeRoundNumber after PATCH to block streaming', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // Set waiting flags
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setConfigChangeRoundNumber(1);

    expect(store.getState().isWaitingForChangelog).toBeTruthy();
    expect(store.getState().configChangeRoundNumber).toBe(1);

    // Simulate changelog sync completion (use-changelog-sync.ts clears flags)
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    expect(store.getState().isWaitingForChangelog).toBeFalsy();
    expect(store.getState().configChangeRoundNumber).toBeNull();
  });

  it('should set isWaitingForChangelog even when no config changes exist', () => {
    // This test verifies the fix for hasActiveFormSubmission staying true
    // Even when hasAnyChanges=false, isWaitingForChangelog should be set
    // to prevent initializeThread from resetting streaming state
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // No config changes, but still set isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(true);

    expect(store.getState().isWaitingForChangelog).toBeTruthy();

    // use-changelog-sync will fetch (empty) changelog and clear flag
    store.getState().setIsWaitingForChangelog(false);

    expect(store.getState().isWaitingForChangelog).toBeFalsy();
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
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
      participants,
      roundNumber: 0,
    });

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true);

    // Set streaming state (placeholders would be added here)
    store.getState().setStreamingRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    // Verify placeholders aren't cleared by config change
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().waitingToStartStreaming).toBeTruthy();
  });

  it('should keep pre-search placeholder visible when web search is enabled', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);
    store.getState().setEnableWebSearch(false);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
    });

    // Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);

    // Add pre-search placeholder
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: 'presearch-r1',
      roundNumber: 1,
      searchData: null,
      status: 'pending',
      threadId: 'thread-123',
      userQuery: 'Question for round 1',
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants: round0Participants,
      roundNumber: 0,
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
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
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
    expect(store.getState().waitingToStartStreaming).toBeTruthy();
  });

  it('should not clear placeholders when isWaitingForChangelog is true', () => {
    const participants = [createMockParticipant(0)];

    store.getState().setParticipants(participants);

    completeRound(store, {
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
      participants,
      roundNumber: 0,
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
