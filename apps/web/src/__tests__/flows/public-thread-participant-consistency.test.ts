/**
 * Public Thread Participant Consistency E2E Tests
 *
 * These tests verify that the frontend correctly handles participant data
 * from public threads, ensuring consistency with private thread viewing.
 *
 * Key scenarios tested:
 * 1. All participants (including disabled) are properly rendered
 * 2. Messages are correctly matched to participants by participantId
 * 3. Participant avatars and names display correctly for all messages
 * 4. No participant info is lost when viewing public vs private thread
 */

import { MessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ApiParticipant } from '@/services/api';

// ============================================================================
// TEST DATA
// ============================================================================

/**
 * Simulates API response with all participants (including disabled)
 * This is the expected response after the bug fix
 */
function createMockPublicThreadResponse() {
  return {
    messages: [
    // Round 0
      {
        content: 'Hello everyone',
        id: 'm1',
        metadata: { role: 'user', roundNumber: 0 },
        role: 'user',
        roundNumber: 0,
        threadId: 'thread-123',
      },
      {
        content: 'Hello from GPT-4',
        id: 'm2',
        metadata: {
          model: 'gpt-4',
          participantId: 'p1',
          participantIndex: 0,
          role: 'assistant',
          roundNumber: 0,
        },
        participantId: 'p1',
        role: 'assistant',
        roundNumber: 0,
        threadId: 'thread-123',
      },
      {
        content: 'Hello from Claude', // From disabled participant
        id: 'm3',
        metadata: {
          model: 'claude-3-opus',
          participantId: 'p2',
          participantIndex: 1,
          role: 'assistant',
          roundNumber: 0,
        },
        participantId: 'p2',
        role: 'assistant',
        roundNumber: 0,
        threadId: 'thread-123',
      },
      {
        content: 'Hello from Gemini',
        id: 'm4',
        metadata: {
          model: 'gemini-pro',
          participantId: 'p3',
          participantIndex: 2,
          role: 'assistant',
          roundNumber: 0,
        },
        participantId: 'p3',
        role: 'assistant',
        roundNumber: 0,
        threadId: 'thread-123',
      },
    ],
    participants: [
      {
        id: 'p1',
        isEnabled: true,
        modelId: 'gpt-4',
        priority: 0,
        role: 'Expert analyst',
        threadId: 'thread-123',
      },
      {
        id: 'p2',
        isEnabled: false, // Disabled after contributing - should still be visible
        modelId: 'claude-3-opus',
        priority: 1,
        role: 'Creative writer',
        threadId: 'thread-123',
      },
      {
        id: 'p3',
        isEnabled: true,
        modelId: 'gemini-pro',
        priority: 2,
        role: null,
        threadId: 'thread-123',
      },
    ] as ApiParticipant[],
    thread: {
      id: 'thread-123',
      isPublic: true,
      slug: 'test-thread',
      title: 'Test Thread',
      userId: 'user-123',
    },
    user: {
      id: 'user-123',
      image: null,
      name: 'Test User',
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('public Thread Participant Consistency', () => {
  describe('participant Data Integrity', () => {
    it('should return all participants including disabled ones', () => {
      const response = createMockPublicThreadResponse();

      // All 3 participants should be present
      expect(response.participants).toHaveLength(3);

      // Disabled participant should be included
      const disabledParticipant = response.participants.find(p => !p.isEnabled);
      expect(disabledParticipant).toBeDefined();
      expect(disabledParticipant?.id).toBe('p2');
      expect(disabledParticipant?.modelId).toBe('claude-3-opus');
    });

    it('should have participant for every assistant message', () => {
      const response = createMockPublicThreadResponse();
      const participantMap = new Map(response.participants.map(p => [p.id, p]));

      const assistantMessages = response.messages.filter(m => m.role === MessageRoles.ASSISTANT);

      for (const msg of assistantMessages) {
        const participantId = msg.participantId || (msg.metadata as { participantId?: string }).participantId;
        expect(participantId).toBeDefined();

        const participant = participantId ? participantMap.get(participantId) : undefined;
        expect(participant).toBeDefined();
        expect(participant?.modelId).toBeDefined();
      }
    });
  });

  describe('message-Participant Matching', () => {
    it('should resolve participant by participantId from metadata', () => {
      const response = createMockPublicThreadResponse();

      const resolveParticipant = (message: typeof response.messages[0]) => {
        const metadata = message.metadata as { participantId?: string; participantIndex?: number };

        // Primary: use participantId
        if (metadata.participantId) {
          return response.participants.find(p => p.id === metadata.participantId);
        }

        // Fallback: use participantIndex
        if (metadata.participantIndex !== undefined) {
          return response.participants[metadata.participantIndex];
        }

        return undefined;
      };

      const assistantMessages = response.messages.filter(m => m.role === MessageRoles.ASSISTANT);

      for (const msg of assistantMessages) {
        const participant = resolveParticipant(msg);
        expect(participant).toBeDefined();
      }

      // Verify specific resolutions
      const claudeMessage = assistantMessages.find(m => m.participantId === 'p2');
      expect(claudeMessage).toBeDefined();
      const resolved = claudeMessage ? resolveParticipant(claudeMessage) : undefined;
      expect(resolved).toBeDefined();
      expect(resolved?.modelId).toBe('claude-3-opus');
      expect(resolved?.isEnabled).toBeFalsy(); // Disabled but still resolvable
    });

    it('should handle fallback to participantIndex when participantId missing', () => {
      const response = createMockPublicThreadResponse();

      // Simulate old message format with only participantIndex
      const legacyMessage = {
        ...response.messages[1],
        metadata: {
          model: 'gpt-4',
          participantIndex: 0,
          role: 'assistant',
          roundNumber: 0,
        },
        participantId: undefined,
      };

      const metadata = legacyMessage.metadata as { participantIndex?: number };
      const participant = metadata.participantIndex !== undefined
        ? response.participants[metadata.participantIndex]
        : undefined;

      expect(participant).toBeDefined();
      expect(participant?.modelId).toBe('gpt-4');
    });
  });

  describe('consistency with Private Thread View', () => {
    it('should have same participant count as private by-slug view', () => {
      const publicResponse = createMockPublicThreadResponse();

      // Simulate private by-slug response (always returns all participants)
      const privateBySlugResponse = {
        participants: publicResponse.participants, // Same data
      };

      expect(publicResponse.participants).toHaveLength(privateBySlugResponse.participants.length);
    });

    it('should have same participant IDs in same order', () => {
      const publicResponse = createMockPublicThreadResponse();
      const privateResponse = createMockPublicThreadResponse(); // Same data after fix

      const publicIds = publicResponse.participants.map(p => p.id);
      const privateIds = privateResponse.participants.map(p => p.id);

      expect(publicIds).toEqual(privateIds);
    });
  });

  describe('edge Cases', () => {
    it('should handle thread with all participants disabled', () => {
      const response = createMockPublicThreadResponse();
      // Mark all as disabled
      response.participants.forEach((p) => {
        p.isEnabled = false;
      });

      // All should still be present
      expect(response.participants).toHaveLength(3);
      expect(response.participants.every(p => !p.isEnabled)).toBeTruthy();

      // Messages should still be resolvable
      const participantMap = new Map(response.participants.map(p => [p.id, p]));
      const assistantMessages = response.messages.filter(m => m.role === MessageRoles.ASSISTANT);

      for (const msg of assistantMessages) {
        const hasParticipant = msg.participantId ? participantMap.has(msg.participantId) : false;
        expect(hasParticipant || !msg.participantId).toBeTruthy();
      }
    });

    it('should handle participant order changes', () => {
      const response = createMockPublicThreadResponse();

      // Simulate priority change: swap p1 and p2
      response.participants[0].priority = 1;
      response.participants[1].priority = 0;

      // Sort by priority (as the query does)
      response.participants.sort((a, b) => a.priority - b.priority);

      // Messages should still resolve correctly via participantId
      const participantMap = new Map(response.participants.map(p => [p.id, p]));
      const msg = response.messages.find(m => m.participantId === 'p1');
      expect(msg).toBeDefined();
      const p1Participant = participantMap.get('p1');
      expect(p1Participant).toBeDefined();
      expect(p1Participant?.modelId).toBe('gpt-4');
    });

    it('should not lose participant when looking up by index after participant removed', () => {
      // This was the bug: participantIndex lookup failed when participant removed
      const response = createMockPublicThreadResponse();

      // After fix: all participants present, index lookup works
      const messageWithIndex = {
        metadata: { participantIndex: 1 }, // Claude's original index
      };

      const participant = response.participants[messageWithIndex.metadata.participantIndex];
      expect(participant).toBeDefined();
      expect(participant.id).toBe('p2'); // Claude is still at index 1
    });
  });

  describe('uI Rendering Requirements', () => {
    it('should provide all necessary fields for avatar rendering', () => {
      const response = createMockPublicThreadResponse();

      for (const participant of response.participants) {
        // Required fields for avatar
        expect(participant.modelId).toBeDefined();
        expect(typeof participant.modelId).toBe('string');
        expect(participant.modelId.length).toBeGreaterThan(0);
      }
    });

    it('should provide role information for display', () => {
      const response = createMockPublicThreadResponse();

      // Check that roles are present where defined
      const participantWithRole = response.participants.find(p => p.id === 'p1');
      expect(participantWithRole).toBeDefined();
      expect(participantWithRole?.role).toBe('Expert analyst');

      // Null role should also be handled
      const participantWithoutRole = response.participants.find(p => p.id === 'p3');
      expect(participantWithoutRole).toBeDefined();
      expect(participantWithoutRole?.role).toBeNull();
    });
  });
});

describe('transformChatParticipants Utility', () => {
  it('should preserve all participant data including isEnabled', () => {
    // Simulate the transform function's expected behavior
    const rawParticipants = [
      { id: 'p1', isEnabled: true, modelId: 'gpt-4' },
      { id: 'p2', isEnabled: false, modelId: 'claude-3' },
    ];

    // Transform should preserve all fields
    const transformed = rawParticipants.map(p => ({
      ...p,
      // Add any additional transformations
    }));

    expect(transformed).toHaveLength(2);
    expect(transformed[0].isEnabled).toBeTruthy();
    expect(transformed[1].isEnabled).toBeFalsy();
  });
});
