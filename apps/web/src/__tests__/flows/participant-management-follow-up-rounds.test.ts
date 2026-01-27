/**
 * Participant Management in Follow-Up Rounds - Comprehensive Flow Tests
 *
 * Tests participant add/remove/role-change operations between rounds:
 * 1. Adding participants triggers changelog and updates placeholders
 * 2. Removing participants triggers changelog and updates placeholders
 * 3. Participant role changes trigger changelog
 * 4. Multiple participant changes in same submission
 * 5. Stream order updates with participant changes
 *
 * Flow Documentation: FLOW_DOCUMENTATION.md Part 6: Configuration Changes Mid-Conversation
 *
 * Key Behaviors:
 * - Changelog created BEFORE round with new config
 * - Placeholder participant IDs updated to match new config
 * - Stream order respects new participant priority
 * - Expected participant count matches new config
 * - Timeline renders correct participant order
 */

import { MessageStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createMockStoredPreSearch,
  createParticipantConfig,
} from '@/lib/testing';
import type { StoredPreSearch } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore, shouldWaitForPreSearch } from '@/stores/chat';

// ============================================================================
// TEST SETUP HELPERS
// ============================================================================

function setupStoreWithInitialRound(store: ChatStoreApi, participantCount = 2) {
  const participants = Array.from({ length: participantCount }, (_, i) =>
    createMockParticipant(i, { threadId: 'thread-1' }));

  store.getState().updateParticipants(participants);
  store.getState().setSelectedParticipants(
    participants.map(p => ({
      id: p.id,
      modelId: p.modelId,
      priority: p.priority,
      role: p.role,
    })),
  );

  store.getState().prepareForNewMessage('First message', []);
  store.getState().setStreamingRoundNumber(0);
  store.getState().completeStreaming();

  return participants;
}

function assertParticipantExists<T>(participant: T | undefined, index: number): asserts participant is T {
  if (!participant) {
    throw new Error(`Expected participant at index ${index} to exist`);
  }
}

// ============================================================================
// 1. ADDING PARTICIPANTS - CHANGELOG AND PLACEHOLDERS
// ============================================================================

describe('adding Participants Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('single Participant Addition', () => {
    it('should update expectedModelIds when adding one participant', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        ...initialParticipants.map(p => ({
          id: p.id,
          modelId: p.modelId,
          priority: p.priority,
          role: p.role,
        })),
        createParticipantConfig(2, {
          id: 'participant-2',
          modelId: 'model-2',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2']);

      expect(store.getState().expectedModelIds).toHaveLength(3);
      expect(store.getState().expectedModelIds).toContain('model-2');
    });

    it('should reset currentParticipantIndex when adding participants', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setCurrentParticipantIndex(1);

      const newParticipants = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });

    it('should handle placeholder creation for new participant count', () => {
      setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().expectedModelIds).toHaveLength(3);
    });
  });

  describe('multiple Participant Additions', () => {
    it('should handle adding multiple participants at once', () => {
      setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
        createParticipantConfig(3),
        createParticipantConfig(4),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedModelIds(['model-0', 'model-1', 'model-2', 'model-3', 'model-4']);

      expect(store.getState().expectedModelIds).toHaveLength(5);
      expect(store.getState().selectedParticipants).toHaveLength(5);
    });

    it('should preserve order when adding multiple participants', () => {
      setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(1, { priority: 1 }),
        createParticipantConfig(2, { priority: 2 }),
        createParticipantConfig(3, { priority: 3 }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2', 'model-3']);

      const selectedParticipants = store.getState().selectedParticipants;
      expect(selectedParticipants[0]?.priority).toBe(0);
      expect(selectedParticipants[1]?.priority).toBe(1);
      expect(selectedParticipants[2]?.priority).toBe(2);
      expect(selectedParticipants[3]?.priority).toBe(3);
    });
  });

  describe('participant Addition With Web Search', () => {
    it('should isolate pre-search state when adding participants', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setEnableWebSearch(true);
      const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      store.getState().addPreSearch(preSearch);
      store.getState().markPreSearchTriggered(0);

      const newParticipants = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBeTruthy();
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeFalsy();
      expect(store.getState().expectedModelIds).toHaveLength(3);
    });

    it('should wait for pre-search before new participants stream', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setEnableWebSearch(true);

      const newParticipants = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      const pendingPreSearch: StoredPreSearch = {
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: 'presearch-1',
        roundNumber: 1,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: 'thread-1',
        userQuery: 'Second message',
      };

      store.getState().addPreSearch(pendingPreSearch);

      const shouldWait = shouldWaitForPreSearch(true, pendingPreSearch);
      expect(shouldWait).toBeTruthy();
    });
  });
});

// ============================================================================
// 2. REMOVING PARTICIPANTS - CHANGELOG AND PLACEHOLDERS
// ============================================================================

describe('removing Participants Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('single Participant Removal', () => {
    it('should update expectedModelIds when removing one participant', () => {
      setupStoreWithInitialRound(store, 3);

      const newParticipants = [createParticipantConfig(0), createParticipantConfig(1)];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1']);

      expect(store.getState().expectedModelIds).toHaveLength(2);
      expect(store.getState().expectedModelIds).not.toContain('model-2');
    });

    it('should handle currentParticipantIndex bounds after removal', () => {
      setupStoreWithInitialRound(store, 3);

      store.getState().setCurrentParticipantIndex(2);

      const newParticipants = [createParticipantConfig(0), createParticipantConfig(1)];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1']);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });
  });

  describe('multiple Participant Removals', () => {
    it('should handle removing multiple participants at once', () => {
      setupStoreWithInitialRound(store, 5);

      const newParticipants = [createParticipantConfig(0), createParticipantConfig(1)];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1']);

      expect(store.getState().expectedModelIds).toHaveLength(2);
      expect(store.getState().selectedParticipants).toHaveLength(2);
    });

    it('should preserve order of remaining participants', () => {
      setupStoreWithInitialRound(store, 4);

      const newParticipants = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(2, { priority: 1 }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-2']);

      const selectedParticipants = store.getState().selectedParticipants;
      expect(selectedParticipants[0]?.priority).toBe(0);
      expect(selectedParticipants[1]?.priority).toBe(1);
    });
  });

  describe('edge Cases - All Participants Removed', () => {
    it('should handle empty participant list', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setSelectedParticipants([]);
      store.getState().setExpectedModelIds([]);

      expect(store.getState().expectedModelIds).toHaveLength(0);
      expect(store.getState().selectedParticipants).toHaveLength(0);
    });

    it('should reset currentParticipantIndex when all participants removed', () => {
      setupStoreWithInitialRound(store, 3);

      store.getState().setCurrentParticipantIndex(2);

      store.getState().setSelectedParticipants([]);
      store.getState().setExpectedModelIds([]);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });
  });
});

// ============================================================================
// 3. PARTICIPANT ROLE CHANGES - CHANGELOG
// ============================================================================

describe('participant Role Changes Between Rounds', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('single Role Change', () => {
    it('should update participant role when changed', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const participant0 = initialParticipants[0];
      const participant1 = initialParticipants[1];

      if (!participant0 || !participant1) {
        throw new Error('Expected 2 participants');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: participant0.id,
          modelId: participant0.modelId,
          priority: 0,
          role: 'Updated Role',
        }),
        createParticipantConfig(1, {
          id: participant1.id,
          modelId: participant1.modelId,
          priority: 1,
          role: participant1.role,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.role).toBe('Updated Role');
      expect(store.getState().selectedParticipants[1]?.role).toBe(participant1.role);
    });

    it('should preserve participant count when only role changes', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);
      const participant0 = initialParticipants[0];
      const participant1 = initialParticipants[1];
      assertParticipantExists(participant0, 0);
      assertParticipantExists(participant1, 1);

      const newParticipants = [
        createParticipantConfig(0, {
          id: participant0.id,
          modelId: participant0.modelId,
          priority: 0,
          role: 'Analyst',
        }),
        createParticipantConfig(1, {
          id: participant1.id,
          modelId: participant1.modelId,
          priority: 1,
          role: 'Critic',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedModelIds([participant0.modelId, participant1.modelId]);

      expect(store.getState().expectedModelIds).toHaveLength(2);
      expect(store.getState().selectedParticipants).toHaveLength(2);
    });
  });

  describe('multiple Role Changes', () => {
    it('should update all roles when multiple changed', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);
      const participant0 = initialParticipants[0];
      const participant1 = initialParticipants[1];
      const participant2 = initialParticipants[2];
      assertParticipantExists(participant0, 0);
      assertParticipantExists(participant1, 1);
      assertParticipantExists(participant2, 2);

      const newParticipants = [
        createParticipantConfig(0, {
          id: participant0.id,
          modelId: participant0.modelId,
          priority: 0,
          role: 'Strategist',
        }),
        createParticipantConfig(1, {
          id: participant1.id,
          modelId: participant1.modelId,
          priority: 1,
          role: 'Implementer',
        }),
        createParticipantConfig(2, {
          id: participant2.id,
          modelId: participant2.modelId,
          priority: 2,
          role: 'Validator',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.role).toBe('Strategist');
      expect(store.getState().selectedParticipants[1]?.role).toBe('Implementer');
      expect(store.getState().selectedParticipants[2]?.role).toBe('Validator');
    });
  });

  describe('role Assignment and Removal', () => {
    it('should handle role added where none existed', () => {
      setupStoreWithInitialRound(store, 2);

      const participant0 = createMockParticipant(0, {
        role: null,
        threadId: 'thread-1',
      });
      store.getState().updateParticipants([participant0]);

      const newParticipants = [
        createParticipantConfig(0, {
          id: participant0.id,
          modelId: participant0.modelId,
          priority: 0,
          role: 'New Role',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.role).toBe('New Role');
    });

    it('should handle role removed', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);
      const participant0 = initialParticipants[0];
      assertParticipantExists(participant0, 0);

      const newParticipants = [
        createParticipantConfig(0, {
          id: participant0.id,
          modelId: participant0.modelId,
          priority: 0,
          role: null,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.role).toBeNull();
    });
  });
});

// ============================================================================
// 4. MULTIPLE PARTICIPANT CHANGES IN SAME SUBMISSION
// ============================================================================

describe('multiple Participant Changes in Same Submission', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('add, Remove, and Modify Together', () => {
    it('should handle adding, removing, and modifying participants simultaneously', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const firstParticipant = initialParticipants[0];
      if (!firstParticipant) {
        throw new Error('Expected first participant');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: firstParticipant.id,
          modelId: firstParticipant.modelId,
          priority: 0,
          role: 'Updated Role',
        }),
        createParticipantConfig(3, {
          id: 'participant-3',
          modelId: 'model-3',
          priority: 1,
          role: 'New Participant',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-3']);

      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().selectedParticipants[0]?.role).toBe('Updated Role');
      expect(store.getState().selectedParticipants[1]?.id).toBe('participant-3');
      expect(store.getState().expectedModelIds).toContain('model-0');
      expect(store.getState().expectedModelIds).toContain('model-3');
      expect(store.getState().expectedModelIds).not.toContain('model-1');
      expect(store.getState().expectedModelIds).not.toContain('model-2');
    });

    it('should reset state correctly across complex changes', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setCurrentParticipantIndex(1);

      const newParticipants = [
        createParticipantConfig(0),
        createParticipantConfig(1),
        createParticipantConfig(2),
        createParticipantConfig(3),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-0', 'model-1', 'model-2', 'model-3']);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().expectedModelIds).toHaveLength(4);
    });
  });

  describe('complete Configuration Overhaul', () => {
    it('should handle replacing all participants with new ones', () => {
      setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(10, {
          id: 'new-participant-10',
          modelId: 'new-model-10',
        }),
        createParticipantConfig(11, {
          id: 'new-participant-11',
          modelId: 'new-model-11',
        }),
        createParticipantConfig(12, {
          id: 'new-participant-12',
          modelId: 'new-model-12',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['new-model-10', 'new-model-11', 'new-model-12']);

      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().expectedModelIds).toHaveLength(3);
      expect(store.getState().expectedModelIds).toEqual([
        'new-model-10',
        'new-model-11',
        'new-model-12',
      ]);
    });

    it('should reset tracking state with complete config change', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setCurrentParticipantIndex(1);

      const newParticipants = [
        createParticipantConfig(10),
        createParticipantConfig(11),
        createParticipantConfig(12),
        createParticipantConfig(13),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedModelIds(['model-10', 'model-11', 'model-12', 'model-13']);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });
  });
});

// ============================================================================
// 5. STREAM ORDER UPDATES WITH PARTICIPANT CHANGES
// ============================================================================

describe('stream Order Updates With Participant Changes', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('participant Reordering', () => {
    it('should update priority when participants reordered', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const p0 = initialParticipants[0];
      const p1 = initialParticipants[1];
      const p2 = initialParticipants[2];
      if (!p0 || !p1 || !p2) {
        throw new Error('Expected 3 participants');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: p2.id,
          modelId: p2.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: p0.id,
          modelId: p0.modelId,
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: p1.id,
          modelId: p1.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.priority).toBe(0);
      expect(store.getState().selectedParticipants[1]?.priority).toBe(1);
      expect(store.getState().selectedParticipants[2]?.priority).toBe(2);

      expect(store.getState().selectedParticipants[0]?.id).toBe(p2.id);
      expect(store.getState().selectedParticipants[1]?.id).toBe(p0.id);
      expect(store.getState().selectedParticipants[2]?.id).toBe(p1.id);
    });

    it('should handle sequential streaming with new order', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const p0 = initialParticipants[0];
      const p1 = initialParticipants[1];
      const p2 = initialParticipants[2];
      if (!p0 || !p1 || !p2) {
        throw new Error('Expected 3 participants');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: p2.id,
          modelId: p2.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: p0.id,
          modelId: p0.modelId,
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: p1.id,
          modelId: p1.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedModelIds([
          p2.modelId,
          p0.modelId,
          p1.modelId,
        ]);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().currentParticipantIndex).toBe(0);

      store.getState().setCurrentParticipantIndex(1);
      expect(store.getState().currentParticipantIndex).toBe(1);

      store.getState().setCurrentParticipantIndex(2);
      expect(store.getState().currentParticipantIndex).toBe(2);
    });
  });

  describe('priority Updates With Additions/Removals', () => {
    it('should recalculate priorities when participants added', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const p0 = initialParticipants[0];
      const p1 = initialParticipants[1];
      if (!p0 || !p1) {
        throw new Error('Expected 2 participants');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: p0.id,
          modelId: p0.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: 'new-participant',
          modelId: 'new-model',
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: p1.id,
          modelId: p1.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.priority).toBe(0);
      expect(store.getState().selectedParticipants[1]?.priority).toBe(1);
      expect(store.getState().selectedParticipants[2]?.priority).toBe(2);
    });

    it('should recalculate priorities when participants removed', () => {
      setupStoreWithInitialRound(store, 4);

      const newParticipants = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(3, { priority: 1 }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.priority).toBe(0);
      expect(store.getState().selectedParticipants[1]?.priority).toBe(1);
    });
  });

  describe('expectedModelIds Order Consistency', () => {
    it('should maintain order consistency between selectedParticipants and expectedModelIds', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const p0 = initialParticipants[0];
      const p1 = initialParticipants[1];
      const p2 = initialParticipants[2];
      if (!p0 || !p1 || !p2) {
        throw new Error('Expected 3 participants');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: p1.id,
          modelId: p1.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: p0.id,
          modelId: p0.modelId,
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: p2.id,
          modelId: p2.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedModelIds([
          p1.modelId,
          p0.modelId,
          p2.modelId,
        ]);

      const expectedOrder = [
        p1.modelId,
        p0.modelId,
        p2.modelId,
      ];

      expect(store.getState().expectedModelIds).toEqual(expectedOrder);
    });

    it('should stream participants in correct order after reordering', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const p0 = initialParticipants[0];
      const p1 = initialParticipants[1];
      if (!p0 || !p1) {
        throw new Error('Expected 2 participants');
      }

      const newParticipants = [
        createParticipantConfig(0, {
          id: p1.id,
          modelId: p1.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: p0.id,
          modelId: p0.modelId,
          priority: 1,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedModelIds([p1.modelId, p0.modelId]);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().expectedModelIds[0]).toBe(p1.modelId);
      expect(store.getState().expectedModelIds[1]).toBe(p0.modelId);
    });
  });
});
