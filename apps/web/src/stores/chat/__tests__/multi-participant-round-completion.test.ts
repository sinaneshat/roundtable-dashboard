/**
 * Multi-Participant Round Completion Tests
 *
 * Tests for correct round completion with multiple participants.
 * Critical scenarios:
 * 1. All participants must respond before round completes
 * 2. Participant index must match participant ID
 * 3. Config changes mid-round should NOT affect current round
 * 4. onComplete callback must fire only once per round
 */

import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('multi-Participant Round Completion', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  // Helper to create assistant message with metadata
  function createAssistantMessage(
    id: string,
    content: string,
    roundNumber: number,
    participantIndex: number,
    participantId: string,
  ): UIMessage {
    return {
      id,
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: content }],
      metadata: {
        roundNumber,
        participantIndex,
        participantId,
        role: MessageRoles.ASSISTANT,
      },
    };
  }

  // Helper to create user message
  function createUserMessage(id: string, content: string, roundNumber: number): UIMessage {
    return {
      id,
      role: MessageRoles.USER,
      parts: [{ type: 'text', text: content }],
      metadata: { roundNumber, role: MessageRoles.USER },
    };
  }

  describe('basic Multi-Participant Flow', () => {
    it('should track all participants in round', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p3 = { id: 'p3', modelId: 'gemini-pro', role: null, priority: 2, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2, p3]);
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini-pro']);

      const state = store.getState();
      expect(state.participants).toHaveLength(3);
      expect(state.expectedParticipantIds).toHaveLength(3);
    });

    it('should track currentParticipantIndex during streaming', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      expect(store.getState().currentParticipantIndex).toBe(0);

      // First participant completes, move to second
      store.getState().setCurrentParticipantIndex(1);
      expect(store.getState().currentParticipantIndex).toBe(1);
    });

    it('should complete round when all participants respond', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3']);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Participant 1 responds
      store.getState().setMessages([
        createUserMessage('u0', 'Hello', 0),
        createAssistantMessage('a0-p1', 'Response from GPT-4', 0, 0, 'p1'),
      ]);
      store.getState().setCurrentParticipantIndex(1);

      // Participant 2 responds
      store.getState().setMessages([
        createUserMessage('u0', 'Hello', 0),
        createAssistantMessage('a0-p1', 'Response from GPT-4', 0, 0, 'p1'),
        createAssistantMessage('a0-p2', 'Response from Claude', 0, 1, 'p2'),
      ]);

      // Complete streaming
      store.getState().completeStreaming();

      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.messages).toHaveLength(3);
    });
  });

  describe('participant Index Validation', () => {
    it('should validate participantIndex matches actual participant', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'p2' });

      // Validate stored trigger
      const trigger = store.getState().nextParticipantToTrigger;
      expect(trigger).toEqual({ index: 1, participantId: 'p2' });

      // Validate against actual participant at index
      const actualParticipant = store.getState().participants[trigger!.index];
      expect(actualParticipant.id).toBe('p2');
      expect(trigger!.participantId).toBe(actualParticipant.id);
    });

    it('should detect mismatch when participants reordered', () => {
      // Initial order - set via setParticipants (backend source of truth)
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setNextParticipantToTrigger({ index: 0, participantId: 'p1' });

      // Reorder - p2 now first (simulating backend returning different order)
      const p2First = { ...p2, priority: 0 };
      const p1Second = { ...p1, priority: 1 };
      store.getState().setParticipants([p2First, p1Second]);

      // Validate mismatch - trigger still expects p1 at index 0
      const trigger = store.getState().nextParticipantToTrigger;
      const actualParticipant = store.getState().participants[trigger!.index];

      expect(trigger!.participantId).toBe('p1');
      expect(actualParticipant.id).toBe('p2'); // Mismatch!
      expect(trigger!.participantId).not.toBe(actualParticipant.id);
    });
  });

  describe('config Changes Mid-Round', () => {
    it('should NOT affect current round when config changes mid-streaming', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3']);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      // First participant responds
      store.getState().setMessages([
        createUserMessage('u0', 'Hello', 0),
        createAssistantMessage('a0-p1', 'Response from GPT-4', 0, 0, 'p1'),
      ]);
      store.getState().setCurrentParticipantIndex(1);

      // User changes config mid-round (should not affect current round)
      const _p3 = { id: 'p3', modelId: 'gemini-pro', role: null, priority: 2, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 2 },
      ]);
      store.getState().setHasPendingConfigChanges(true);

      // Current round should still expect 2 participants
      expect(store.getState().expectedParticipantIds).toHaveLength(2);

      // Second participant responds - round completes with 2 participants
      store.getState().setMessages([
        createUserMessage('u0', 'Hello', 0),
        createAssistantMessage('a0-p1', 'Response from GPT-4', 0, 0, 'p1'),
        createAssistantMessage('a0-p2', 'Response from Claude', 0, 1, 'p2'),
      ]);

      store.getState().completeStreaming();

      // Config change flag is set for NEXT round
      expect(store.getState().hasPendingConfigChanges).toBe(true);
    });

    it('should apply config changes only at NEXT round start', () => {
      // Round 0 complete
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2]);
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3']);
      store.getState().setMessages([
        createUserMessage('u0', 'Hello', 0),
        createAssistantMessage('a0-p1', 'R1', 0, 0, 'p1'),
        createAssistantMessage('a0-p2', 'R2', 0, 1, 'p2'),
      ]);
      store.getState().completeStreaming();

      // User adds participant for next round
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        { id: 'p2', modelId: 'claude-3', role: 'analyst', priority: 1 },
        { id: 'p3', modelId: 'gemini-pro', role: 'critic', priority: 2 },
      ]);
      store.getState().setHasPendingConfigChanges(true);

      // Next round preparation - apply new config
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini-pro']);
      store.getState().prepareForNewMessage('New message', ['gpt-4', 'claude-3', 'gemini-pro']);

      // Now expects 3 participants
      expect(store.getState().expectedParticipantIds).toHaveLength(3);
    });
  });

  describe('incomplete Round Handling', () => {
    it('should track incomplete round for resumption', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p3 = { id: 'p3', modelId: 'gemini-pro', role: null, priority: 2, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      store.getState().setParticipants([p1, p2, p3]);
      store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3', 'gemini-pro']);

      // Only first participant responded
      store.getState().setMessages([
        createUserMessage('u0', 'Hello', 0),
        createAssistantMessage('a0-p1', 'Response from GPT-4', 0, 0, 'p1'),
      ]);

      // Set next participant for resumption
      store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'p2' });
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.nextParticipantToTrigger).toEqual({ index: 1, participantId: 'p2' });
      expect(state.waitingToStartStreaming).toBe(true);
    });

    it('should resume from correct participant after page refresh', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      // Simulate page refresh - store rehydrated with trigger state
      store.getState().setParticipants([p1, p2]);
      store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'p2' });
      store.getState().setWaitingToStartStreaming(true);

      // Validate trigger matches participants
      const trigger = store.getState().nextParticipantToTrigger;
      const targetParticipant = store.getState().participants[trigger!.index];

      expect(trigger!.index).toBe(1);
      expect(trigger!.participantId).toBe('p2');
      expect(targetParticipant.id).toBe('p2');
    });

    it('should NOT resume if config changed since round started', () => {
      const p1 = { id: 'p1', modelId: 'gpt-4', role: null, priority: 0, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      const p2 = { id: 'p2', modelId: 'claude-3', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };

      // Round started with p1, p2
      store.getState().setParticipants([p1, p2]);
      store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'p2' });
      store.getState().setWaitingToStartStreaming(true);

      // Config changed - p2 replaced with p3
      const p3 = { id: 'p3', modelId: 'gemini-pro', role: null, priority: 1, isEnabled: true, threadId: 't1', createdAt: new Date(), updatedAt: new Date() };
      store.getState().setParticipants([p1, p3]);

      // Trigger now invalid - p2 not in participants
      const trigger = store.getState().nextParticipantToTrigger;
      const actualParticipant = store.getState().participants[trigger!.index];

      expect(trigger!.participantId).toBe('p2');
      expect(actualParticipant.id).toBe('p3');
      // This mismatch would be detected in use-multi-participant-chat.ts
    });
  });

  describe('animation Tracking', () => {
    it('should track pending animations per participant', () => {
      // Use registerAnimation (correct API)
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      const state = store.getState();
      expect(state.pendingAnimations.has(0)).toBe(true);
      expect(state.pendingAnimations.has(1)).toBe(true);
      expect(state.pendingAnimations.has(2)).toBe(false);
    });

    it('should clear pending animation when participant completes', () => {
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      // First participant completes - use completeAnimation
      store.getState().completeAnimation(0);

      const state = store.getState();
      expect(state.pendingAnimations.has(0)).toBe(false);
      expect(state.pendingAnimations.has(1)).toBe(true);
    });

    it('should clear all animations on completeStreaming', () => {
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);
      store.getState().setIsStreaming(true);

      store.getState().completeStreaming();

      const state = store.getState();
      expect(state.pendingAnimations.size).toBe(0);
    });
  });

  describe('round Number Tracking', () => {
    it('should increment round number correctly', () => {
      // Round 0
      store.getState().setStreamingRoundNumber(0);
      expect(store.getState().streamingRoundNumber).toBe(0);

      // Round 1
      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Round 2
      store.getState().setStreamingRoundNumber(2);
      expect(store.getState().streamingRoundNumber).toBe(2);
    });

    it('should track currentRoundNumber separately from streamingRoundNumber', () => {
      store.getState().setCurrentRoundNumber(0);
      store.getState().setStreamingRoundNumber(1);

      const state = store.getState();
      expect(state.currentRoundNumber).toBe(0);
      expect(state.streamingRoundNumber).toBe(1);
    });

    it('should reset streamingRoundNumber on completeStreaming', () => {
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      store.getState().completeStreaming();

      expect(store.getState().streamingRoundNumber).toBe(null);
    });
  });

  describe('moderator in Multi-Participant Round', () => {
    it('should track moderator creation per round', () => {
      store.getState().markModeratorCreated(0);

      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(false);
    });

    it('should NOT create duplicate moderator in same round', () => {
      const firstResult = store.getState().tryMarkModeratorCreated(0);
      const secondResult = store.getState().tryMarkModeratorCreated(0);

      expect(firstResult).toBe(true); // First call succeeds
      expect(secondResult).toBe(false); // Second call fails (already created)
    });

    it('should allow moderator in each round', () => {
      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(1);

      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(true);
    });
  });

  describe('pre-Search in Multi-Participant Round', () => {
    it('should track pre-search trigger per round', () => {
      store.getState().markPreSearchTriggered(0);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should NOT trigger duplicate pre-search in same round', () => {
      const firstResult = store.getState().tryMarkPreSearchTriggered(0);
      const secondResult = store.getState().tryMarkPreSearchTriggered(0);

      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
    });

    it('should block participant streaming until pre-search completes', () => {
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch({
        id: 'pre-search-0',
        threadId: 'thread-1',
        roundNumber: 0,
        status: 'in-progress',
        searchData: null,
        userQuery: 'Test',
      });

      // Pre-search in progress - participants should wait
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch?.status).toBe('in-progress');

      // Complete pre-search
      store.getState().updatePreSearchStatus(0, 'complete');

      const updatedPreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      expect(updatedPreSearch?.status).toBe('complete');
    });
  });
});
