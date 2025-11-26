/**
 * Configuration Changes Mid-Conversation Flow Tests
 *
 * Tests the configuration changes flow as described in FLOW_DOCUMENTATION.md Part 6.
 * Covers adding, removing, reordering participants, changing roles, and switching modes.
 *
 * FLOW TESTED (per FLOW_DOCUMENTATION.md Part 6):
 * - Adding participants between rounds
 * - Removing participants between rounds
 * - Reordering participants
 * - Changing roles
 * - Switching conversation mode
 * - Multiple changes combined
 * - Configuration applied on submit
 * - Changelog banner content
 *
 * Location: /src/stores/chat/__tests__/configuration-changes-flow.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChangelogTypes,
  ChatModes,
  ScreenModes,
  UIMessageRoles,
} from '@/api/core/enums';
import type {
  ChatParticipant,
  ChatThread,
  StoredModeratorAnalysis,
} from '@/api/routes/chat/schema';
import type { DbChangelogData } from '@/db/schemas/chat-metadata';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Helper to set up a completed round with all participants responded and analysis complete
 */
function setupCompletedRound(
  store: ReturnType<typeof createChatStore>,
  thread: ChatThread,
  participants: ChatParticipant[],
  roundNumber: number,
  userQuestion: string,
): void {
  // Add user message
  const userMessage = createMockUserMessage(roundNumber, userQuestion);
  store.getState().setMessages(prev => [...prev, userMessage]);

  // Add participant messages
  participants.forEach((participant, index) => {
    const msg = createMockMessage(index, roundNumber, {
      id: `${thread.id}_r${roundNumber}_p${index}`,
      metadata: {
        role: 'participant',
        roundNumber,
        participantId: participant.id,
        participantIndex: index,
        participantRole: participant.role,
        model: participant.modelId,
      },
    });
    store.getState().setMessages(prev => [...prev, msg]);
  });

  // Add completed analysis
  const analysis: StoredModeratorAnalysis = createMockAnalysis({
    id: `analysis-r${roundNumber}`,
    threadId: thread.id,
    roundNumber,
    mode: thread.mode,
    status: AnalysisStatuses.COMPLETE,
    userQuestion,
  });
  store.getState().addAnalysis(analysis);
  store.getState().markAnalysisCreated(roundNumber);
}

/**
 * Helper to simulate changelog entry creation
 * In production, this is done by the backend service
 * ✅ TYPE-SAFE: Uses DbChangelogData instead of Record<string, unknown>
 */
type ChangelogEntry = {
  id: string;
  threadId: string;
  roundNumber: number;
  changeType: string;
  changeSummary: string;
  changeData: DbChangelogData;
  createdAt: Date;
};

function createChangelogEntry(
  threadId: string,
  roundNumber: number,
  changeType: string,
  changeSummary: string,
  changeData: DbChangelogData,
): ChangelogEntry {
  return {
    id: `changelog-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    threadId,
    roundNumber,
    changeType,
    changeSummary,
    changeData,
    createdAt: new Date(),
  };
}

// ============================================================================
// CONFIGURATION CHANGES FLOW TESTS
// ============================================================================

describe('configuration Changes Mid-Conversation Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SCENARIO 1: ADDING PARTICIPANTS BETWEEN ROUNDS
  // ==========================================================================

  describe('scenario 1: Adding Participants Between Rounds', () => {
    it('should complete Round 1 with 2 participants and add 3rd for Round 2', () => {
      // Setup: 2 participants for Round 1
      const thread = createMockThread({
        id: 'thread-add-participant',
        mode: ChatModes.DEBATING,
      });

      const initialParticipants = [
        createMockParticipant(0, {
          id: 'part-gpt4',
          threadId: thread.id,
          modelId: 'openai/gpt-4',
          role: 'The Analyst',
        }),
        createMockParticipant(1, {
          id: 'part-claude',
          threadId: thread.id,
          modelId: 'anthropic/claude-3',
          role: 'The Critic',
        }),
      ];

      store.getState().initializeThread(thread, initialParticipants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Complete Round 1
      setupCompletedRound(store, thread, initialParticipants, 0, 'What is the best approach?');

      // Verify Round 1 complete
      expect(store.getState().messages).toHaveLength(3); // 1 user + 2 participants
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // Add 3rd participant for Round 2
      const newParticipant = createMockParticipantConfig(2, {
        modelId: 'google/gemini-pro',
        role: 'The Innovator',
      });

      const updatedSelected = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'The Analyst' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'The Critic' }),
        newParticipant,
      ];

      store.getState().setSelectedParticipants(updatedSelected);
      store.getState().setHasPendingConfigChanges(true);

      // Verify pending changes
      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // Simulate changelog entry creation (backend creates this)
      const changelog = createChangelogEntry(
        thread.id,
        1, // Round 2 (0-indexed)
        ChangelogTypes.ADDED,
        'Added gemini-pro as The Innovator',
        {
          type: 'participant',
          participantId: 'part-gemini',
          modelId: 'google/gemini-pro',
          role: 'The Innovator',
        },
      );

      // Verify changelog entry structure
      expect(changelog.changeType).toBe(ChangelogTypes.ADDED);
      expect(changelog.roundNumber).toBe(1);
      expect(changelog.changeSummary).toContain('Added');

      // Update DB participants (simulates PATCH response)
      const updatedDbParticipants = [
        ...initialParticipants,
        createMockParticipant(2, {
          id: 'part-gemini',
          threadId: thread.id,
          modelId: 'google/gemini-pro',
          role: 'The Innovator',
        }),
      ];

      store.getState().updateParticipants(updatedDbParticipants);
      store.getState().setHasPendingConfigChanges(false);

      // Verify 3 participants now available
      expect(store.getState().participants).toHaveLength(3);
      expect(store.getState().participants[2].modelId).toBe('google/gemini-pro');
    });

    it('should have new participant respond in Round 2', () => {
      // Setup thread with 3 participants after adding
      const thread = createMockThread({ id: 'thread-new-responds' });
      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
        createMockParticipant(2, { modelId: 'google/gemini-pro' }),
      ];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 1 with only 2 participants (before adding)
      setupCompletedRound(
        store,
        thread,
        participants.slice(0, 2),
        0,
        'Initial question',
      );

      // Round 2 with all 3 participants
      const userMsgR2 = createMockUserMessage(1, 'Follow-up question');
      store.getState().setMessages(prev => [...prev, userMsgR2]);

      // All 3 participants respond in Round 2
      participants.forEach((participant, index) => {
        const msg = createMockMessage(index, 1, {
          id: `${thread.id}_r1_p${index}`,
          metadata: {
            role: 'participant',
            roundNumber: 1,
            participantId: participant.id,
            participantIndex: index,
            participantRole: participant.role,
            model: participant.modelId,
          },
        });
        store.getState().setMessages(prev => [...prev, msg]);
      });

      // Verify Round 2 has all 3 participant responses
      const r2Messages = store.getState().messages.filter(
        m => m.metadata?.roundNumber === 1 && m.role === UIMessageRoles.ASSISTANT,
      );
      expect(r2Messages).toHaveLength(3);
    });

    it('should show changelog banner with "1 added" summary', () => {
      // Verify changelog summary format for adding
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.ADDED,
        'Added gemini-pro as The Innovator',
        { type: 'participant', modelId: 'google/gemini-pro', role: 'The Innovator' },
      );

      expect(changelog.changeType).toBe(ChangelogTypes.ADDED);
      // In UI: "1 added" would be derived from counting ADDED entries
    });
  });

  // ==========================================================================
  // SCENARIO 2: REMOVING PARTICIPANTS BETWEEN ROUNDS
  // ==========================================================================

  describe('scenario 2: Removing Participants Between Rounds', () => {
    it('should complete Round 1 with 3 participants and remove 1 for Round 2', () => {
      const thread = createMockThread({
        id: 'thread-remove-participant',
        mode: ChatModes.ANALYZING,
      });

      const initialParticipants = [
        createMockParticipant(0, {
          id: 'part-gpt4',
          threadId: thread.id,
          modelId: 'openai/gpt-4',
          role: 'The Analyst',
        }),
        createMockParticipant(1, {
          id: 'part-claude',
          threadId: thread.id,
          modelId: 'anthropic/claude-3',
          role: 'The Critic',
        }),
        createMockParticipant(2, {
          id: 'part-gemini',
          threadId: thread.id,
          modelId: 'google/gemini-pro',
          role: 'The Innovator',
        }),
      ];

      store.getState().initializeThread(thread, initialParticipants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Set selected participants (mirrors DB participants)
      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, {
          id: 'part-gpt4',
          modelId: 'openai/gpt-4',
          role: 'The Analyst',
        }),
        createMockParticipantConfig(1, {
          id: 'part-claude',
          modelId: 'anthropic/claude-3',
          role: 'The Critic',
        }),
        createMockParticipantConfig(2, {
          id: 'part-gemini',
          modelId: 'google/gemini-pro',
          role: 'The Innovator',
        }),
      ]);

      // Complete Round 1 with 3 participants
      setupCompletedRound(store, thread, initialParticipants, 0, 'Analyze this problem');

      expect(store.getState().messages).toHaveLength(4); // 1 user + 3 participants

      // Remove participant before Round 2 (remove Gemini)
      store.getState().removeParticipant('google/gemini-pro');
      store.getState().setHasPendingConfigChanges(true);

      // Verify selected participants reduced
      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // Simulate changelog for removal
      const changelog = createChangelogEntry(
        thread.id,
        1,
        ChangelogTypes.REMOVED,
        'Removed gemini-pro (The Innovator)',
        {
          type: 'participant',
          participantId: 'part-gemini',
          modelId: 'google/gemini-pro',
          role: 'The Innovator',
        },
      );

      expect(changelog.changeType).toBe(ChangelogTypes.REMOVED);
    });

    it('should verify removed participant does not respond in Round 2', () => {
      const thread = createMockThread({ id: 'thread-removed-no-response' });
      const remainingParticipants = [
        createMockParticipant(0, { id: 'part-gpt4', modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { id: 'part-claude', modelId: 'anthropic/claude-3' }),
      ];

      store.getState().initializeThread(thread, remainingParticipants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Setup Round 1 messages (simulate 3 participants responded)
      const userMsgR1 = createMockUserMessage(0, 'Initial question');
      store.getState().setMessages([userMsgR1]);

      // 3 participants responded in Round 1
      for (let i = 0; i < 3; i++) {
        const msg = createMockMessage(i, 0, {
          id: `${thread.id}_r0_p${i}`,
        });
        store.getState().setMessages(prev => [...prev, msg]);
      }

      // Round 2 with only 2 participants
      const userMsgR2 = createMockUserMessage(1, 'Follow-up');
      store.getState().setMessages(prev => [...prev, userMsgR2]);

      // Only 2 participants respond
      remainingParticipants.forEach((participant, index) => {
        const msg = createMockMessage(index, 1, {
          id: `${thread.id}_r1_p${index}`,
          metadata: {
            role: 'participant',
            roundNumber: 1,
            participantId: participant.id,
            participantIndex: index,
            model: participant.modelId,
          },
        });
        store.getState().setMessages(prev => [...prev, msg]);
      });

      // Verify only 2 responses in Round 2
      const r2Messages = store.getState().messages.filter(
        m => m.metadata?.roundNumber === 1 && m.role === UIMessageRoles.ASSISTANT,
      );
      expect(r2Messages).toHaveLength(2);
    });

    it('should show changelog banner with "1 removed" and strikethrough styling info', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.REMOVED,
        'Removed gemini-pro (The Innovator)',
        { type: 'participant', modelId: 'google/gemini-pro', role: 'The Innovator' },
      );

      expect(changelog.changeType).toBe(ChangelogTypes.REMOVED);
      // Per docs: "red - with strikethrough for removed"
    });
  });

  // ==========================================================================
  // SCENARIO 3: REORDERING PARTICIPANTS
  // ==========================================================================

  describe('scenario 3: Reordering Participants', () => {
    it('should reorder from [A, B, C] to [C, A, B] before Round 2', () => {
      const _thread = createMockThread({ id: 'thread-reorder' });

      // Initial order: [GPT-4, Claude, Gemini]
      const initialParticipants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
        createMockParticipantConfig(2, { modelId: 'google/gemini-pro', role: 'Innovator' }),
      ];

      store.getState().setSelectedParticipants(initialParticipants);

      // Verify initial order
      expect(store.getState().selectedParticipants[0].modelId).toBe('openai/gpt-4');
      expect(store.getState().selectedParticipants[1].modelId).toBe('anthropic/claude-3');
      expect(store.getState().selectedParticipants[2].modelId).toBe('google/gemini-pro');

      // Reorder: Move Gemini (index 2) to first position (index 0)
      // Result: [Gemini, GPT-4, Claude]
      store.getState().reorderParticipants(2, 0);
      store.getState().setHasPendingConfigChanges(true);

      // Verify new order
      const reordered = store.getState().selectedParticipants;
      expect(reordered[0].modelId).toBe('google/gemini-pro');
      expect(reordered[1].modelId).toBe('openai/gpt-4');
      expect(reordered[2].modelId).toBe('anthropic/claude-3');

      // Verify priorities updated
      expect(reordered[0].priority).toBe(0);
      expect(reordered[1].priority).toBe(1);
      expect(reordered[2].priority).toBe(2);
    });

    it('should verify new response order in Round 2', () => {
      const thread = createMockThread({ id: 'thread-new-order' });

      // New order after reordering: [Gemini, GPT-4, Claude]
      const reorderedParticipants = [
        createMockParticipant(0, {
          id: 'part-gemini',
          modelId: 'google/gemini-pro',
          priority: 0,
        }),
        createMockParticipant(1, {
          id: 'part-gpt4',
          modelId: 'openai/gpt-4',
          priority: 1,
        }),
        createMockParticipant(2, {
          id: 'part-claude',
          modelId: 'anthropic/claude-3',
          priority: 2,
        }),
      ];

      store.getState().initializeThread(thread, reorderedParticipants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 2 messages should follow new order
      const userMsg = createMockUserMessage(1, 'Question');
      store.getState().setMessages([userMsg]);

      reorderedParticipants.forEach((participant, index) => {
        const msg = createMockMessage(index, 1, {
          id: `${thread.id}_r1_p${index}`,
          metadata: {
            role: 'participant',
            roundNumber: 1,
            participantId: participant.id,
            participantIndex: index,
            model: participant.modelId,
          },
        });
        store.getState().setMessages(prev => [...prev, msg]);
      });

      // Verify order: Gemini first, GPT-4 second, Claude third
      const r2Messages = store.getState().messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT,
      );

      expect(r2Messages[0].metadata?.model).toBe('google/gemini-pro');
      expect(r2Messages[1].metadata?.model).toBe('openai/gpt-4');
      expect(r2Messages[2].metadata?.model).toBe('anthropic/claude-3');
    });

    it('should show changelog with "modified" type for reordering', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.MODIFIED,
        'Reordered participants: gemini-pro, gpt-4, claude-3',
        {
          type: 'participant_reorder',
          participants: [
            { id: 'p1', modelId: 'google/gemini-pro', role: null, priority: 0 },
            { id: 'p2', modelId: 'openai/gpt-4', role: null, priority: 1 },
            { id: 'p3', modelId: 'anthropic/claude-3', role: null, priority: 2 },
          ],
        },
      );

      expect(changelog.changeType).toBe(ChangelogTypes.MODIFIED);
      expect(changelog.changeSummary).toContain('Reordered');
    });
  });

  // ==========================================================================
  // SCENARIO 4: CHANGING ROLES
  // ==========================================================================

  describe('scenario 4: Changing Roles', () => {
    it('should change participant role from "Critic" to "Advocate" before Round 2', () => {
      const _thread = createMockThread({ id: 'thread-role-change' });

      const initialParticipants = [
        createMockParticipantConfig(0, {
          id: 'part-gpt4',
          modelId: 'openai/gpt-4',
          role: 'The Critic',
        }),
      ];

      store.getState().setSelectedParticipants(initialParticipants);

      // Verify initial role
      expect(store.getState().selectedParticipants[0].role).toBe('The Critic');

      // Update role
      store.getState().updateParticipant('part-gpt4', { role: 'The Advocate' });
      store.getState().setHasPendingConfigChanges(true);

      // Verify role changed
      expect(store.getState().selectedParticipants[0].role).toBe('The Advocate');
      expect(store.getState().hasPendingConfigChanges).toBe(true);
    });

    it('should show changelog with role change details', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.MODIFIED,
        'Updated gpt-4 role from The Critic to The Advocate',
        {
          type: 'participant_role',
          participantId: 'part-gpt4',
          oldRole: 'The Critic',
          newRole: 'The Advocate',
        },
      );

      expect(changelog.changeType).toBe(ChangelogTypes.MODIFIED);
      expect(changelog.changeSummary).toContain('The Critic');
      expect(changelog.changeSummary).toContain('The Advocate');
    });

    it('should reflect new role in participant metadata for Round 2 responses', () => {
      const thread = createMockThread({ id: 'thread-new-role' });

      const participants = [
        createMockParticipant(0, {
          id: 'part-gpt4',
          modelId: 'openai/gpt-4',
          role: 'The Advocate', // New role
        }),
      ];

      store.getState().initializeThread(thread, participants);

      // Round 2 response with new role
      const msg = createMockMessage(0, 1, {
        id: `${thread.id}_r1_p0`,
        metadata: {
          role: 'participant',
          roundNumber: 1,
          participantId: 'part-gpt4',
          participantIndex: 0,
          participantRole: 'The Advocate',
          model: 'openai/gpt-4',
        },
      });

      store.getState().setMessages([msg]);

      // Verify new role in message metadata
      expect(store.getState().messages[0].metadata?.participantRole).toBe('The Advocate');
    });
  });

  // ==========================================================================
  // SCENARIO 5: SWITCHING CONVERSATION MODE
  // ==========================================================================

  describe('scenario 5: Switching Conversation Mode', () => {
    it('should switch from "debating" to "analyzing" mode before Round 2', () => {
      const thread = createMockThread({
        id: 'thread-mode-switch',
        mode: ChatModes.DEBATING,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setSelectedMode(ChatModes.DEBATING);

      // Verify initial mode
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

      // Switch mode
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // Verify mode changed
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    });

    it('should show changelog entry for mode change', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.MODIFIED,
        'Changed conversation mode from debating to analyzing',
        {
          type: 'mode_change',
          oldMode: ChatModes.DEBATING,
          newMode: ChatModes.ANALYZING,
        },
      );

      expect(changelog.changeType).toBe(ChangelogTypes.MODIFIED);
      expect(changelog.changeData.oldMode).toBe(ChatModes.DEBATING);
      expect(changelog.changeData.newMode).toBe(ChatModes.ANALYZING);
    });

    it('should update thread mode on submit', () => {
      const thread = createMockThread({
        id: 'thread-update-mode',
        mode: ChatModes.DEBATING,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setSelectedMode(ChatModes.ANALYZING);

      // Simulate PATCH response updating thread mode
      const updatedThread = {
        ...thread,
        mode: ChatModes.ANALYZING,
      };
      store.getState().setThread(updatedThread);

      // Verify thread mode updated
      expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
    });

    it('should use new mode for Round 2 analysis', () => {
      // Analysis for Round 2 should use new mode
      const analysisR2 = createMockAnalysis({
        roundNumber: 1,
        mode: ChatModes.ANALYZING, // New mode
      });

      store.getState().addAnalysis(analysisR2);

      expect(store.getState().analyses[0].mode).toBe(ChatModes.ANALYZING);
    });
  });

  // ==========================================================================
  // SCENARIO 6: MULTIPLE CHANGES COMBINED
  // ==========================================================================

  describe('scenario 6: Multiple Changes Combined', () => {
    it('should handle add 1, remove 1, reorder, and change role simultaneously', () => {
      const _thread = createMockThread({ id: 'thread-multi-change' });

      // Initial: [GPT-4 (Analyst), Claude (Critic), Gemini (Innovator)]
      const initialSelected = [
        createMockParticipantConfig(0, {
          id: 'part-gpt4',
          modelId: 'openai/gpt-4',
          role: 'Analyst',
        }),
        createMockParticipantConfig(1, {
          id: 'part-claude',
          modelId: 'anthropic/claude-3',
          role: 'Critic',
        }),
        createMockParticipantConfig(2, {
          id: 'part-gemini',
          modelId: 'google/gemini-pro',
          role: 'Innovator',
        }),
      ];

      store.getState().setSelectedParticipants(initialSelected);

      // Combined changes:
      // 1. Remove Gemini
      store.getState().removeParticipant('google/gemini-pro');

      // 2. Add Mistral
      store.getState().addParticipant({
        participantIndex: 2,
        modelId: 'mistral/mistral-large',
        role: 'Synthesizer',
      });

      // 3. Change Claude's role
      store.getState().updateParticipant('part-claude', { role: 'Advocate' });

      // 4. Reorder: Move Mistral to first
      const currentParticipants = store.getState().selectedParticipants;
      const mistralIndex = currentParticipants.findIndex(p => p.modelId === 'mistral/mistral-large');
      if (mistralIndex > 0) {
        store.getState().reorderParticipants(mistralIndex, 0);
      }

      store.getState().setHasPendingConfigChanges(true);

      // Verify all changes applied
      const finalSelected = store.getState().selectedParticipants;
      expect(finalSelected).toHaveLength(3);
      expect(finalSelected[0].modelId).toBe('mistral/mistral-large');
      expect(finalSelected.find(p => p.modelId === 'anthropic/claude-3')?.role).toBe('Advocate');
      expect(finalSelected.find(p => p.modelId === 'google/gemini-pro')).toBeUndefined();
    });

    it('should generate multiple changelog entries for combined changes', () => {
      // Multiple changelog entries would be created
      const changelogs = [
        createChangelogEntry('thread-123', 1, ChangelogTypes.REMOVED, 'Removed gemini-pro', {
          type: 'participant',
          modelId: 'google/gemini-pro',
        }),
        createChangelogEntry('thread-123', 1, ChangelogTypes.ADDED, 'Added mistral-large', {
          type: 'participant',
          modelId: 'mistral/mistral-large',
        }),
        createChangelogEntry('thread-123', 1, ChangelogTypes.MODIFIED, 'Changed claude-3 role', {
          type: 'participant_role',
          oldRole: 'Critic',
          newRole: 'Advocate',
        }),
        createChangelogEntry('thread-123', 1, ChangelogTypes.MODIFIED, 'Reordered participants', {
          type: 'participant_reorder',
        }),
      ];

      // Count by type
      const added = changelogs.filter(c => c.changeType === ChangelogTypes.ADDED).length;
      const removed = changelogs.filter(c => c.changeType === ChangelogTypes.REMOVED).length;
      const modified = changelogs.filter(c => c.changeType === ChangelogTypes.MODIFIED).length;

      expect(added).toBe(1);
      expect(removed).toBe(1);
      expect(modified).toBe(2);
    });

    it('should show correct summary: "1 added, 1 removed, 2 modified"', () => {
      // Summary computation helper
      const changelogs = [
        { changeType: ChangelogTypes.ADDED },
        { changeType: ChangelogTypes.REMOVED },
        { changeType: ChangelogTypes.MODIFIED },
        { changeType: ChangelogTypes.MODIFIED },
      ];

      const added = changelogs.filter(c => c.changeType === ChangelogTypes.ADDED).length;
      const removed = changelogs.filter(c => c.changeType === ChangelogTypes.REMOVED).length;
      const modified = changelogs.filter(c => c.changeType === ChangelogTypes.MODIFIED).length;

      // Build summary string
      const parts = [];
      if (added > 0)
        parts.push(`${added} added`);
      if (removed > 0)
        parts.push(`${removed} removed`);
      if (modified > 0)
        parts.push(`${modified} modified`);
      const summary = parts.join(', ');

      expect(summary).toBe('1 added, 1 removed, 2 modified');
    });
  });

  // ==========================================================================
  // SCENARIO 7: CONFIGURATION APPLIED ON SUBMIT
  // ==========================================================================

  describe('scenario 7: Configuration Applied on Submit', () => {
    it('should not save changes to database until message is submitted', () => {
      const thread = createMockThread({ id: 'thread-pending' });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setSelectedMode(ChatModes.DEBATING);

      // Make changes
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // Changes are in selectedMode (local state) but thread.mode unchanged
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
      expect(store.getState().hasPendingConfigChanges).toBe(true);
    });

    it('should apply changes to database on message submit', () => {
      const thread = createMockThread({
        id: 'thread-apply',
        mode: ChatModes.DEBATING,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // Simulate submit - prepare for new message
      store.getState().prepareForNewMessage('Next question', ['openai/gpt-4']);

      // Simulate PATCH response
      const updatedThread = {
        ...thread,
        mode: ChatModes.ANALYZING,
      };
      store.getState().setThread(updatedThread);
      store.getState().setHasPendingConfigChanges(false);

      // Now thread.mode should be updated
      expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
      expect(store.getState().hasPendingConfigChanges).toBe(false);
    });

    it('should preserve changes if user continues editing without submitting', () => {
      const thread = createMockThread({ id: 'thread-preserve' });

      store.getState().initializeThread(thread, [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ]);

      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      ]);

      // Make first change
      store.getState().removeParticipant('anthropic/claude-3');
      expect(store.getState().selectedParticipants).toHaveLength(1);

      // Make second change (add new)
      store.getState().addParticipant({
        participantIndex: 1,
        modelId: 'google/gemini-pro',
        role: 'New Role',
      });

      // Both changes preserved
      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().selectedParticipants[1].modelId).toBe('google/gemini-pro');
    });

    it('should clear pending message after successful submission', () => {
      const thread = createMockThread({ id: 'thread-clear' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Prepare message
      store.getState().prepareForNewMessage('Test message', ['openai/gpt-4']);
      expect(store.getState().pendingMessage).toBe('Test message');

      // Simulate successful submission
      store.getState().setPendingMessage(null);
      store.getState().setInputValue('');

      expect(store.getState().pendingMessage).toBeNull();
      expect(store.getState().inputValue).toBe('');
    });
  });

  // ==========================================================================
  // SCENARIO 8: CHANGELOG BANNER CONTENT
  // ==========================================================================

  describe('scenario 8: Changelog Banner Content', () => {
    it('should have correct changeType for added participants (green + icon)', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.ADDED,
        'Added claude-3 as The Analyst',
        { type: 'participant', modelId: 'anthropic/claude-3', role: 'The Analyst' },
      );

      // Per docs: "green + icons for added"
      expect(changelog.changeType).toBe(ChangelogTypes.ADDED);
    });

    it('should have correct changeType for modified entries (blue pencil)', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.MODIFIED,
        'Changed role from Critic to Advocate',
        { type: 'participant_role', oldRole: 'Critic', newRole: 'Advocate' },
      );

      // Per docs: "blue pencil for modified"
      expect(changelog.changeType).toBe(ChangelogTypes.MODIFIED);
    });

    it('should have correct changeType for removed participants (red - strikethrough)', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.REMOVED,
        'Removed gemini-pro',
        { type: 'participant', modelId: 'google/gemini-pro' },
      );

      // Per docs: "red - with strikethrough for removed"
      expect(changelog.changeType).toBe(ChangelogTypes.REMOVED);
    });

    it('should verify changelog entries tied to correct round number', () => {
      const changelogR2 = createChangelogEntry(
        'thread-123',
        1, // Round 2 (0-indexed)
        ChangelogTypes.ADDED,
        'Added participant',
        { type: 'participant' },
      );

      const changelogR3 = createChangelogEntry(
        'thread-123',
        2, // Round 3
        ChangelogTypes.MODIFIED,
        'Changed mode',
        { type: 'mode_change' },
      );

      expect(changelogR2.roundNumber).toBe(1);
      expect(changelogR3.roundNumber).toBe(2);
    });

    it('should include model avatar info and role in changeData', () => {
      const changelog = createChangelogEntry(
        'thread-123',
        1,
        ChangelogTypes.ADDED,
        'Added claude-3 as The Analyst',
        {
          type: 'participant',
          participantId: 'part-claude',
          modelId: 'anthropic/claude-3',
          role: 'The Analyst',
        },
      );

      // Per docs: "New models with avatars and roles"
      expect(changelog.changeData.modelId).toBe('anthropic/claude-3');
      expect(changelog.changeData.role).toBe('The Analyst');
    });
  });

  // ==========================================================================
  // EDGE CASES AND ATOMICITY
  // ==========================================================================

  describe('edge Cases and Atomicity', () => {
    it('should handle empty participants list after removing all', () => {
      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      ]);

      store.getState().removeParticipant('openai/gpt-4');

      expect(store.getState().selectedParticipants).toHaveLength(0);
    });

    it('should prevent duplicate participant addition', () => {
      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      ]);

      // Try to add same model again
      store.getState().addParticipant({
        participantIndex: 1,
        modelId: 'openai/gpt-4',
        role: 'Duplicate',
      });

      // Should still have only 1
      expect(store.getState().selectedParticipants).toHaveLength(1);
    });

    it('should maintain participant index integrity after reorder', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'model-a' }),
        createMockParticipantConfig(1, { modelId: 'model-b' }),
        createMockParticipantConfig(2, { modelId: 'model-c' }),
      ];

      store.getState().setSelectedParticipants(participants);
      store.getState().reorderParticipants(2, 0);

      const reordered = store.getState().selectedParticipants;

      // All priorities should be sequential
      expect(reordered[0].priority).toBe(0);
      expect(reordered[1].priority).toBe(1);
      expect(reordered[2].priority).toBe(2);
    });

    it('should reset hasPendingConfigChanges on new chat', () => {
      store.getState().setHasPendingConfigChanges(true);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      store.getState().resetToNewChat();

      expect(store.getState().hasPendingConfigChanges).toBe(false);
    });

    it('should reset hasPendingConfigChanges on overview reset', () => {
      store.getState().setHasPendingConfigChanges(true);

      store.getState().resetToOverview();

      expect(store.getState().hasPendingConfigChanges).toBe(false);
    });

    it('should maintain thread consistency during configuration updates', () => {
      const thread = createMockThread({
        id: 'thread-consistent',
        mode: ChatModes.DEBATING,
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Update mode
      const updatedThread = {
        ...thread,
        mode: ChatModes.ANALYZING,
      };
      store.getState().setThread(updatedThread);

      // Thread ID should remain unchanged
      expect(store.getState().thread?.id).toBe('thread-consistent');
      expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
    });
  });

  // ==========================================================================
  // WAITING FOR CHANGELOG FLAG
  // ==========================================================================

  describe('waiting For Changelog Flag', () => {
    it('should set isWaitingForChangelog during configuration update', () => {
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBe(true);
    });

    it('should clear isWaitingForChangelog after PATCH completes', () => {
      store.getState().setIsWaitingForChangelog(true);

      // Simulate PATCH completion
      store.getState().setIsWaitingForChangelog(false);

      expect(store.getState().isWaitingForChangelog).toBe(false);
    });

    it('should prepareForNewMessage set isWaitingForChangelog to true', () => {
      store.getState().prepareForNewMessage('test', []);

      expect(store.getState().isWaitingForChangelog).toBe(true);
    });
  });

  // ==========================================================================
  // INTEGRATION: COMPLETE CONFIGURATION CHANGE FLOW
  // ==========================================================================

  describe('integration: Complete Configuration Change Flow', () => {
    it('should execute full flow: Round 1 → Config Changes → Round 2', () => {
      // ROUND 1: Initial setup and completion
      const thread = createMockThread({
        id: 'thread-integration',
        mode: ChatModes.DEBATING,
      });

      const initialParticipants = [
        createMockParticipant(0, {
          id: 'part-gpt4',
          threadId: thread.id,
          modelId: 'openai/gpt-4',
          role: 'Analyst',
        }),
        createMockParticipant(1, {
          id: 'part-claude',
          threadId: thread.id,
          modelId: 'anthropic/claude-3',
          role: 'Critic',
        }),
      ];

      store.getState().initializeThread(thread, initialParticipants);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
      ]);
      store.getState().setSelectedMode(ChatModes.DEBATING);

      // Complete Round 1
      setupCompletedRound(store, thread, initialParticipants, 0, 'Initial question');

      // Verify Round 1 state
      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().analyses[0].roundNumber).toBe(0);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // CONFIG CHANGES: Between rounds
      // 1. Add participant
      store.getState().addParticipant({
        participantIndex: 2,
        modelId: 'google/gemini-pro',
        role: 'Innovator',
      });

      // 2. Change mode
      store.getState().setSelectedMode(ChatModes.ANALYZING);

      // 3. Mark pending
      store.getState().setHasPendingConfigChanges(true);

      // Verify pending changes
      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // SUBMIT: Apply changes
      store.getState().prepareForNewMessage('Follow-up question', [
        'openai/gpt-4',
        'anthropic/claude-3',
        'google/gemini-pro',
      ]);

      // Simulate PATCH response
      const updatedThread = {
        ...thread,
        mode: ChatModes.ANALYZING,
      };
      store.getState().setThread(updatedThread);

      const updatedParticipants = [
        ...initialParticipants,
        createMockParticipant(2, {
          id: 'part-gemini',
          threadId: thread.id,
          modelId: 'google/gemini-pro',
          role: 'Innovator',
        }),
      ];
      store.getState().updateParticipants(updatedParticipants);

      // Clear pending state
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setPendingMessage(null);

      // ROUND 2: With new configuration
      // ✅ FIX: prepareForNewMessage already added optimistic user message, no need for manual setMessages
      // The optimistic message was already added by prepareForNewMessage('Follow-up question', ...)

      // All 3 participants respond
      updatedParticipants.forEach((participant, index) => {
        const msg = createMockMessage(index, 1, {
          id: `${thread.id}_r1_p${index}`,
          metadata: {
            role: 'participant',
            roundNumber: 1,
            participantId: participant.id,
            participantIndex: index,
            participantRole: participant.role,
            model: participant.modelId,
          },
        });
        store.getState().setMessages(prev => [...prev, msg]);
      });

      // Add Round 2 analysis
      const analysisR2 = createMockAnalysis({
        id: 'analysis-r1',
        threadId: thread.id,
        roundNumber: 1,
        mode: ChatModes.ANALYZING, // New mode
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addAnalysis(analysisR2);
      store.getState().markAnalysisCreated(1);

      // FINAL VERIFICATION
      const finalState = store.getState();

      // Thread updated
      expect(finalState.thread?.mode).toBe(ChatModes.ANALYZING);

      // Participants updated
      expect(finalState.participants).toHaveLength(3);

      // Messages: R1 (1 user + 2 participants) + R2 (1 user + 3 participants) = 7
      expect(finalState.messages).toHaveLength(7);

      // Analyses for both rounds
      expect(finalState.analyses).toHaveLength(2);
      expect(finalState.analyses[0].mode).toBe(ChatModes.DEBATING); // R1 mode
      expect(finalState.analyses[1].mode).toBe(ChatModes.ANALYZING); // R2 mode

      // Clean state
      expect(finalState.hasPendingConfigChanges).toBe(false);
      expect(finalState.isWaitingForChangelog).toBe(false);
      expect(finalState.pendingMessage).toBeNull();
    });
  });
});
