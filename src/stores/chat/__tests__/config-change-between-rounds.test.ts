/**
 * Configuration Change Between Rounds - Store State Isolation Test Suite
 *
 * Tests configuration change handling when settings change between rounds:
 * - Participant count changes (add/remove models)
 * - Pre-search toggle (enabled → disabled, disabled → enabled)
 * - Conversation mode changes (panel → council, etc.)
 * - Role reassignments
 *
 * CRITICAL: Old round state must NOT affect new round state
 * Each round must have fresh state based on current configuration
 *
 * Test File: /src/stores/chat/__tests__/config-change-between-rounds.test.ts
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('config Change Between Rounds - Store State Isolation', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('participant Count Changes', () => {
    it('sHOULD clear old participant state when adding participants', () => {
      // Round 1: 2 participants
      const round1Participants = [
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
      ];

      store.getState().setSelectedParticipants(round1Participants);
      store.getState().prepareForNewMessage('Test message 1', []);
      store.getState().setStreamingRoundNumber(0);

      // Simulate round 1 completion
      store.getState().completeStreaming();

      // Round 2: Add a 3rd participant
      const round2Participants = [
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 2 },
      ];

      store.getState().setSelectedParticipants(round2Participants);
      // NEW: setExpectedParticipantIds must be called explicitly (done by form-actions.ts)
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini-pro']);
      store.getState().prepareForNewMessage('Test message 2', []);
      store.getState().setStreamingRoundNumber(1);

      const state = store.getState();

      // ❌ EXPECTED FAILURE: Old participant state should be cleared
      // BUG: expectedParticipantIds might still reference old 2-participant array
      // BUG: Animation tracking might have stale indices for old participant count
      // BUG: Pre-search activity times might have stale round mappings

      expect(state.expectedParticipantIds).toHaveLength(3);
      expect(state.expectedParticipantIds).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);

      // Animation state should be fresh for 3 participants, not 2
      expect(state.pendingAnimations.size).toBe(0);

      // No leftover tracking from previous round
      expect(state.currentParticipantIndex).toBe(0);
    });

    it('sHOULD clear old participant state when removing participants', () => {
      // Round 1: 3 participants
      const round1Participants = [
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 2 },
      ];

      store.getState().setSelectedParticipants(round1Participants);
      store.getState().prepareForNewMessage('Test message 1', []);
      store.getState().setStreamingRoundNumber(0);

      // Simulate round 1 completion
      store.getState().completeStreaming();

      // Round 2: Remove 1 participant (only 2 left)
      const round2Participants = [
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
      ];

      store.getState().setSelectedParticipants(round2Participants);
      // NEW: setExpectedParticipantIds must be called explicitly (done by form-actions.ts)
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3']);
      store.getState().prepareForNewMessage('Test message 2', []);
      store.getState().setStreamingRoundNumber(1);

      const state = store.getState();

      // ❌ EXPECTED FAILURE: expectedParticipantIds should reflect NEW participant count
      expect(state.expectedParticipantIds).toHaveLength(2);
      expect(state.expectedParticipantIds).toEqual(['gpt-4', 'claude-3']);

      // No stale animation tracking for removed 3rd participant
      expect(state.pendingAnimations.has(2)).toBe(false);
    });

    it('sHOULD handle role changes between rounds', () => {
      // Round 1: Participants with roles A and B
      const round1Participants = [
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
      ];

      store.getState().setSelectedParticipants(round1Participants);
      store.getState().prepareForNewMessage('Message 1', []);

      // Round 2: Swap roles
      const round2Participants = [
        { id: 'p1', modelId: 'gpt-4', role: 'analyst', priority: 0 }, // Changed role
        { id: 'p2', modelId: 'claude-3', role: 'specialist', priority: 1 }, // Changed role
      ];

      store.getState().setSelectedParticipants(round2Participants);
      store.getState().prepareForNewMessage('Message 2', []);

      // ❌ EXPECTED FAILURE: New round should reflect updated roles
      // BUG: Roles might not update correctly if participant config isn't re-applied
      expect(store.getState().selectedParticipants[0].role).toBe('analyst');
      expect(store.getState().selectedParticipants[1].role).toBe('specialist');
    });
  });

  describe('pre-Search Configuration Changes', () => {
    it('sHOULD clear pre-search state when disabled between rounds', () => {
      // Round 1: Web search ENABLED
      store.getState().setEnableWebSearch(true);
      store.getState().prepareForNewMessage('Query 1', []);
      store.getState().setStreamingRoundNumber(0);

      // Add placeholder pre-search for round 1
      store.getState().addPreSearch({
        id: 'pre-search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: 'in-progress',
        searchData: null,
        userQuery: 'Query 1',
      });

      // Mark pre-search as triggered
      store.getState().markPreSearchTriggered(0);

      // Complete round 1
      store.getState().completeStreaming();

      // Round 2: Web search DISABLED
      store.getState().setEnableWebSearch(false);
      store.getState().prepareForNewMessage('Query 2', []);
      store.getState().setStreamingRoundNumber(1);

      // ❌ EXPECTED FAILURE: Old pre-search state should NOT affect round 2
      // BUG: triggeredPreSearchRounds might still have round 0
      // BUG: preSearchActivityTimes might have stale entries

      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
      expect(store.getState().preSearchActivityTimes.has(1)).toBe(false);
    });

    it('sHOULD create fresh pre-search state when enabled between rounds', () => {
      // Round 1: Web search DISABLED
      store.getState().setEnableWebSearch(false);
      store.getState().prepareForNewMessage('Query 1', []);
      store.getState().setStreamingRoundNumber(0);

      // Complete round 1 without pre-search
      store.getState().completeStreaming();

      // Round 2: Web search ENABLED
      store.getState().setEnableWebSearch(true);
      store.getState().prepareForNewMessage('Query 2', []);
      store.getState().setStreamingRoundNumber(1);

      // ❌ EXPECTED FAILURE: New round should have clean pre-search state
      // BUG: Previous round's lack of pre-search might cause initialization issues

      // Pre-search should be fresh for round 1 (not triggered yet)
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
      expect(store.getState().preSearches).toHaveLength(0); // No pre-search added yet
    });

    it('sHOULD isolate pre-search tracking per round', () => {
      // Round 1: Pre-search enabled
      store.getState().setEnableWebSearch(true);
      store.getState().prepareForNewMessage('Query 1', []);
      store.getState().setStreamingRoundNumber(0);

      store.getState().addPreSearch({
        id: 'pre-search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: 'in-progress',
        searchData: null,
        userQuery: 'Query 1',
      });

      store.getState().markPreSearchTriggered(0);
      store.getState().updatePreSearchActivity(0);

      // Complete round 1
      store.getState().completeStreaming();

      // Round 2: Pre-search still enabled
      store.getState().setEnableWebSearch(true);
      store.getState().prepareForNewMessage('Query 2', []);
      store.getState().setStreamingRoundNumber(1);

      // ❌ EXPECTED FAILURE: Round 1 pre-search state should NOT affect round 2
      // Each round should have isolated pre-search tracking

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true); // Round 0 WAS triggered
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false); // Round 1 NOT triggered yet

      // Activity times should be independent per round
      const round0Activity = store.getState().getPreSearchActivityTime(0);
      const round1Activity = store.getState().getPreSearchActivityTime(1);

      expect(round0Activity).toBeGreaterThan(0); // Round 0 has activity
      // Round 1 no activity yet - returns undefined or 0
      expect(round1Activity === undefined || round1Activity === 0).toBe(true);
    });
  });

  describe('conversation Mode Changes', () => {
    it('sHOULD handle mode change between rounds', () => {
      // Round 1: Panel mode
      store.getState().setSelectedMode('panel');
      store.getState().prepareForNewMessage('Message 1', []);

      store.getState().completeStreaming();

      // Round 2: Council mode
      store.getState().setSelectedMode('council');
      store.getState().prepareForNewMessage('Message 2', []);

      // ❌ EXPECTED FAILURE: Mode should update correctly
      expect(store.getState().selectedMode).toBe('council');

      // Pending config changes flag should be set
      // (unless we're in a test where PATCH happens synchronously)
    });

    it('sHOULD not carry over moderator state when mode changes', () => {
      // Round 1: With moderator (council mode)
      store.getState().setSelectedMode('council');
      store.getState().prepareForNewMessage('Message 1', []);
      store.getState().setStreamingRoundNumber(0);

      // Mark moderator as created for round 0
      store.getState().markModeratorCreated(0);

      store.getState().completeStreaming();

      // Round 2: Different mode that might not use moderator
      store.getState().setSelectedMode('panel');
      store.getState().prepareForNewMessage('Message 2', []);
      store.getState().setStreamingRoundNumber(1);

      // ❌ EXPECTED FAILURE: Round 1 moderator tracking should NOT affect round 2
      // BUG: createdModeratorRounds might still have round 0, affecting round 1 logic

      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true); // Round 0 had moderator
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(false); // Round 1 fresh state
    });
  });

  describe('message State Isolation Between Rounds', () => {
    it('sHOULD not mix messages from different rounds with different configs', () => {
      // Round 1: 2 participants, no pre-search
      store.getState().setEnableWebSearch(false);
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
      ]);

      const userMessage1: UIMessage = {
        id: 'msg-user-1',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Message 1' }],
        metadata: { roundNumber: 0, role: MessageRoles.USER },
      };

      const assistantMessage1: UIMessage = {
        id: 'msg-asst-1-p1',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response from GPT-4' }],
        metadata: { roundNumber: 0, role: MessageRoles.ASSISTANT, participantIndex: 0 },
      };

      const assistantMessage2: UIMessage = {
        id: 'msg-asst-1-p2',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response from Claude' }],
        metadata: { roundNumber: 0, role: MessageRoles.ASSISTANT, participantIndex: 1 },
      };

      store.getState().setMessages([userMessage1, assistantMessage1, assistantMessage2]);
      store.getState().completeStreaming();

      // Round 2: 3 participants, WITH pre-search
      store.getState().setEnableWebSearch(true);
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 2 },
      ]);

      // NEW: setExpectedParticipantIds must be called explicitly (done by form-actions.ts)
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini-pro']);
      store.getState().prepareForNewMessage('Message 2', []);
      store.getState().setStreamingRoundNumber(1);

      // Add pre-search for round 2
      store.getState().addPreSearch({
        id: 'pre-search-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: 'in-progress',
        searchData: null,
        userQuery: 'Message 2',
      });

      // ❌ EXPECTED FAILURE: Round 2 should expect 3 participant responses + pre-search
      // Round 1 state (2 participants, no pre-search) should NOT affect round 2

      expect(store.getState().expectedParticipantIds).toHaveLength(3);
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().preSearches.find(p => p.roundNumber === 1)).toBeDefined();

      // Old round's pre-search absence shouldn't affect new round
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('sHOULD handle complete config overhaul between rounds', () => {
      // Round 1: 2 participants, panel mode, no web search
      store.getState().setSelectedMode('panel');
      store.getState().setEnableWebSearch(false);
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
      ]);

      store.getState().prepareForNewMessage('Message 1', []);
      store.getState().setStreamingRoundNumber(0);

      // Simulate round 1 completion
      store.getState().completeStreaming();

      // Round 2: COMPLETELY DIFFERENT CONFIG
      // - 4 participants (doubled)
      // - council mode (changed)
      // - web search enabled (toggled)
      // - different roles
      store.getState().setSelectedMode('council');
      store.getState().setEnableWebSearch(true);
      store.getState().setSelectedParticipants([
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 0 },
        { id: 'p4', modelId: 'mistral', role: 'synthesizer', priority: 1 },
        { id: 'p5', modelId: 'llama-70b', role: 'devil-advocate', priority: 2 },
        { id: 'p6', modelId: 'command-r', role: 'validator', priority: 3 },
      ]);

      // NEW: setExpectedParticipantIds must be called explicitly (done by form-actions.ts)
      store.getState().setExpectedParticipantIds(['gemini-pro', 'mistral', 'llama-70b', 'command-r']);
      store.getState().prepareForNewMessage('Message 2', []);
      store.getState().setStreamingRoundNumber(1);

      // ❌ EXPECTED FAILURE: Round 2 should be COMPLETELY isolated from round 1
      // NO state from round 1 should leak into round 2

      // Config should reflect new settings
      expect(store.getState().selectedMode).toBe('council');
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().expectedParticipantIds).toHaveLength(4);
      expect(store.getState().expectedParticipantIds).toEqual(['gemini-pro', 'mistral', 'llama-70b', 'command-r']);

      // Tracking should be fresh
      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().pendingAnimations.size).toBe(0);

      // Moderator tracking should be independent
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(false);

      // Pre-search tracking should be fresh for round 1
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  describe('regeneration with Config Changes', () => {
    it('sHOULD handle config changes during regeneration', () => {
      // Original round 1: 2 participants
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
      ]);

      store.getState().prepareForNewMessage('Message 1', []);
      store.getState().setStreamingRoundNumber(0);
      store.getState().completeStreaming();

      // User changes config BEFORE regenerating
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 2 },
      ]);

      // Start regeneration with NEW config
      store.getState().startRegeneration(0);

      // ❌ EXPECTED FAILURE: Regeneration should use NEW participant config
      // BUG: Regeneration might use old 2-participant config instead of new 3-participant config

      expect(store.getState().expectedParticipantIds).toHaveLength(3);
      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
    });
  });

  describe('tracking State Isolation', () => {
    it('sHOULD isolate tracking sets between rounds', () => {
      // Round 1
      store.getState().prepareForNewMessage('Message 1', []);
      store.getState().setStreamingRoundNumber(0);

      store.getState().markModeratorCreated(0);
      store.getState().markPreSearchTriggered(0);

      store.getState().completeStreaming();

      // Round 2
      store.getState().prepareForNewMessage('Message 2', []);
      store.getState().setStreamingRoundNumber(1);

      // ❌ EXPECTED FAILURE: completeStreaming should NOT clear per-round tracking
      // BUG: Round 0 tracking might be cleared when it should persist

      // Round 0 tracking should persist (historical record)
      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Round 1 tracking should be fresh
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('sHOULD allow atomic check-and-mark for new rounds', () => {
      // Round 1
      store.getState().prepareForNewMessage('Message 1', []);
      store.getState().setStreamingRoundNumber(0);

      const round0Result = store.getState().tryMarkModeratorCreated(0);
      expect(round0Result).toBe(true); // First time marking

      const round0Duplicate = store.getState().tryMarkModeratorCreated(0);
      expect(round0Duplicate).toBe(false); // Already marked

      store.getState().completeStreaming();

      // Round 2
      store.getState().prepareForNewMessage('Message 2', []);
      store.getState().setStreamingRoundNumber(1);

      const round1Result = store.getState().tryMarkModeratorCreated(1);

      // ❌ EXPECTED FAILURE: Round 1 should be fresh, allowing marking
      expect(round1Result).toBe(true); // First time marking round 1

      // But round 0 should still be marked
      const round0Check = store.getState().tryMarkModeratorCreated(0);
      expect(round0Check).toBe(false); // Still marked from before
    });
  });
});
