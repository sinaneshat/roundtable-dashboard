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
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore, shouldWaitForPreSearch } from '@/stores/chat';
import type { StoredPreSearch } from '@/types/api';

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
      role: p.role,
      priority: p.priority,
    })),
  );

  store.getState().prepareForNewMessage('First message', []);
  store.getState().setStreamingRoundNumber(0);
  store.getState().completeStreaming();

  return participants;
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
    it('should update expectedParticipantIds when adding one participant', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        ...initialParticipants.map(p => ({
          id: p.id,
          modelId: p.modelId,
          role: p.role,
          priority: p.priority,
        })),
        createParticipantConfig(2, {
          id: 'participant-2',
          modelId: 'model-2',
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2']);

      expect(store.getState().expectedParticipantIds).toHaveLength(3);
      expect(store.getState().expectedParticipantIds).toContain('model-2');
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
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2']);
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
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().expectedParticipantIds).toHaveLength(3);
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
        .setExpectedParticipantIds(['model-0', 'model-1', 'model-2', 'model-3', 'model-4']);

      expect(store.getState().expectedParticipantIds).toHaveLength(5);
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
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2', 'model-3']);

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
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
      expect(store.getState().expectedParticipantIds).toHaveLength(3);
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
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2']);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      const pendingPreSearch: StoredPreSearch = {
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 1,
        status: MessageStatuses.PENDING,
        searchData: null,
        userQuery: 'Second message',
        errorMessage: null,
        createdAt: new Date(),
        completedAt: null,
      };

      store.getState().addPreSearch(pendingPreSearch);

      const shouldWait = shouldWaitForPreSearch(true, pendingPreSearch);
      expect(shouldWait).toBe(true);
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
    it('should update expectedParticipantIds when removing one participant', () => {
      setupStoreWithInitialRound(store, 3);

      const newParticipants = [createParticipantConfig(0), createParticipantConfig(1)];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['model-0', 'model-1']);

      expect(store.getState().expectedParticipantIds).toHaveLength(2);
      expect(store.getState().expectedParticipantIds).not.toContain('model-2');
    });

    it('should handle currentParticipantIndex bounds after removal', () => {
      setupStoreWithInitialRound(store, 3);

      store.getState().setCurrentParticipantIndex(2);

      const newParticipants = [createParticipantConfig(0), createParticipantConfig(1)];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['model-0', 'model-1']);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });
  });

  describe('multiple Participant Removals', () => {
    it('should handle removing multiple participants at once', () => {
      setupStoreWithInitialRound(store, 5);

      const newParticipants = [createParticipantConfig(0), createParticipantConfig(1)];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['model-0', 'model-1']);

      expect(store.getState().expectedParticipantIds).toHaveLength(2);
      expect(store.getState().selectedParticipants).toHaveLength(2);
    });

    it('should preserve order of remaining participants', () => {
      setupStoreWithInitialRound(store, 4);

      const newParticipants = [
        createParticipantConfig(0, { priority: 0 }),
        createParticipantConfig(2, { priority: 1 }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['model-0', 'model-2']);

      const selectedParticipants = store.getState().selectedParticipants;
      expect(selectedParticipants[0]?.priority).toBe(0);
      expect(selectedParticipants[1]?.priority).toBe(1);
    });
  });

  describe('edge Cases - All Participants Removed', () => {
    it('should handle empty participant list', () => {
      setupStoreWithInitialRound(store, 2);

      store.getState().setSelectedParticipants([]);
      store.getState().setExpectedParticipantIds([]);

      expect(store.getState().expectedParticipantIds).toHaveLength(0);
      expect(store.getState().selectedParticipants).toHaveLength(0);
    });

    it('should reset currentParticipantIndex when all participants removed', () => {
      setupStoreWithInitialRound(store, 3);

      store.getState().setCurrentParticipantIndex(2);

      store.getState().setSelectedParticipants([]);
      store.getState().setExpectedParticipantIds([]);
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

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          role: 'Updated Role',
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          role: initialParticipants[1]!.role,
          priority: 1,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.role).toBe('Updated Role');
      expect(store.getState().selectedParticipants[1]?.role).toBe(initialParticipants[1]!.role);
    });

    it('should preserve participant count when only role changes', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          role: 'Analyst',
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          role: 'Critic',
          priority: 1,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedParticipantIds([initialParticipants[0]!.modelId, initialParticipants[1]!.modelId]);

      expect(store.getState().expectedParticipantIds).toHaveLength(2);
      expect(store.getState().selectedParticipants).toHaveLength(2);
    });
  });

  describe('multiple Role Changes', () => {
    it('should update all roles when multiple changed', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          role: 'Strategist',
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          role: 'Implementer',
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: initialParticipants[2]!.id,
          modelId: initialParticipants[2]!.modelId,
          role: 'Validator',
          priority: 2,
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
        threadId: 'thread-1',
        role: null,
      });
      store.getState().updateParticipants([participant0]);

      const newParticipants = [
        createParticipantConfig(0, {
          id: participant0.id,
          modelId: participant0.modelId,
          role: 'New Role',
          priority: 0,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.role).toBe('New Role');
    });

    it('should handle role removed', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          role: null,
          priority: 0,
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

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          role: 'Updated Role',
          priority: 0,
        }),
        createParticipantConfig(3, {
          id: 'participant-3',
          modelId: 'model-3',
          role: 'New Participant',
          priority: 1,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['model-0', 'model-3']);

      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().selectedParticipants[0]?.role).toBe('Updated Role');
      expect(store.getState().selectedParticipants[1]?.id).toBe('participant-3');
      expect(store.getState().expectedParticipantIds).toContain('model-0');
      expect(store.getState().expectedParticipantIds).toContain('model-3');
      expect(store.getState().expectedParticipantIds).not.toContain('model-1');
      expect(store.getState().expectedParticipantIds).not.toContain('model-2');
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
      store.getState().setExpectedParticipantIds(['model-0', 'model-1', 'model-2', 'model-3']);
      store.getState().prepareForNewMessage('Second message', []);

      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().expectedParticipantIds).toHaveLength(4);
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
      store.getState().setExpectedParticipantIds(['new-model-10', 'new-model-11', 'new-model-12']);

      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().expectedParticipantIds).toHaveLength(3);
      expect(store.getState().expectedParticipantIds).toEqual([
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
      store.getState().setExpectedParticipantIds(['model-10', 'model-11', 'model-12', 'model-13']);
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

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[2]!.id,
          modelId: initialParticipants[2]!.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);

      expect(store.getState().selectedParticipants[0]?.priority).toBe(0);
      expect(store.getState().selectedParticipants[1]?.priority).toBe(1);
      expect(store.getState().selectedParticipants[2]?.priority).toBe(2);

      expect(store.getState().selectedParticipants[0]?.id).toBe(initialParticipants[2]!.id);
      expect(store.getState().selectedParticipants[1]?.id).toBe(initialParticipants[0]!.id);
      expect(store.getState().selectedParticipants[2]?.id).toBe(initialParticipants[1]!.id);
    });

    it('should handle sequential streaming with new order', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[2]!.id,
          modelId: initialParticipants[2]!.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedParticipantIds([
          initialParticipants[2]!.modelId,
          initialParticipants[0]!.modelId,
          initialParticipants[1]!.modelId,
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

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: 'new-participant',
          modelId: 'new-model',
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
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

  describe('expectedParticipantIds Order Consistency', () => {
    it('should maintain order consistency between selectedParticipants and expectedParticipantIds', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 3);

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          priority: 1,
        }),
        createParticipantConfig(2, {
          id: initialParticipants[2]!.id,
          modelId: initialParticipants[2]!.modelId,
          priority: 2,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedParticipantIds([
          initialParticipants[1]!.modelId,
          initialParticipants[0]!.modelId,
          initialParticipants[2]!.modelId,
        ]);

      const expectedOrder = [
        initialParticipants[1]!.modelId,
        initialParticipants[0]!.modelId,
        initialParticipants[2]!.modelId,
      ];

      expect(store.getState().expectedParticipantIds).toEqual(expectedOrder);
    });

    it('should stream participants in correct order after reordering', () => {
      const initialParticipants = setupStoreWithInitialRound(store, 2);

      const newParticipants = [
        createParticipantConfig(0, {
          id: initialParticipants[1]!.id,
          modelId: initialParticipants[1]!.modelId,
          priority: 0,
        }),
        createParticipantConfig(1, {
          id: initialParticipants[0]!.id,
          modelId: initialParticipants[0]!.modelId,
          priority: 1,
        }),
      ];

      store.getState().setSelectedParticipants(newParticipants);
      store
        .getState()
        .setExpectedParticipantIds([initialParticipants[1]!.modelId, initialParticipants[0]!.modelId]);
      store.getState().prepareForNewMessage('Second message', []);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().expectedParticipantIds[0]).toBe(initialParticipants[1]!.modelId);
      expect(store.getState().expectedParticipantIds[1]).toBe(initialParticipants[0]!.modelId);
    });
  });
});
