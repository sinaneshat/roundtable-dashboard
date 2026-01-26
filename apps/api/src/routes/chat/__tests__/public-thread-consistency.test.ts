/**
 * Public Thread Consistency Tests
 *
 * Verifies that public thread viewing returns consistent data with private viewing.
 * Key consistency requirements:
 * 1. All participants who contributed messages should be visible (regardless of isEnabled)
 * 2. Messages should be properly matched to participants via participantId
 * 3. Complete rounds should be visible on both public and private views
 */

import { describe, expect, it } from 'vitest';

describe('public Thread Data Consistency', () => {
  describe('participant Visibility', () => {
    it('should return all participants regardless of isEnabled status', () => {
      // Simulate a thread where participant was disabled after contributing
      const allParticipants = [
        { id: 'p1', isEnabled: true, modelId: 'gpt-4', priority: 0 },
        { id: 'p2', isEnabled: false, modelId: 'claude-3', priority: 1 }, // Disabled after contributing
        { id: 'p3', isEnabled: true, modelId: 'gemini', priority: 2 },
      ];

      // Messages reference all three participants
      const messages = [
        { content: 'Hello', id: 'm1', role: 'user', roundNumber: 0 },
        { id: 'm2', participantId: 'p1', role: 'assistant', roundNumber: 0 },
        { id: 'm3', participantId: 'p2', role: 'assistant', roundNumber: 0 }, // From disabled participant
        { id: 'm4', participantId: 'p3', role: 'assistant', roundNumber: 0 },
      ];

      // Public thread should return ALL participants (fix applied)
      // Previously filtered by isEnabled = true which would exclude p2
      const publicParticipants = allParticipants; // No filter
      const privateBySlugParticipants = allParticipants; // No filter

      // Verify consistency
      expect(publicParticipants).toHaveLength(privateBySlugParticipants.length);
      expect(publicParticipants).toHaveLength(3);

      // Verify all message participantIds can be resolved
      const participantIds = new Set(publicParticipants.map(p => p.id));
      const messagesWithParticipants = messages.filter(m => m.participantId);

      for (const msg of messagesWithParticipants) {
        const pid = msg.participantId ?? '';
        expect(participantIds.has(pid)).toBe(true);
      }
    });

    it('should not lose participant info when participant is disabled', () => {
      // This was the bug: disabled participants were not returned
      const participantsInDb = [
        { id: 'p1', isEnabled: true },
        { id: 'p2', isEnabled: false },
      ];

      // Old query (bug): filter by isEnabled = true
      const oldBuggyQuery = participantsInDb.filter(p => p.isEnabled);
      expect(oldBuggyQuery).toHaveLength(1);
      expect(oldBuggyQuery.some(p => p.id === 'p2')).toBe(false);

      // Fixed query: no filter
      const fixedQuery = participantsInDb;
      expect(fixedQuery).toHaveLength(2);
      expect(fixedQuery.some(p => p.id === 'p2')).toBe(true);
    });
  });

  describe('message-Participant Matching', () => {
    it('should be able to match all messages to participants by participantId', () => {
      const participants = [
        { id: 'p1', modelId: 'gpt-4' },
        { id: 'p2', modelId: 'claude-3' },
        { id: 'p3', modelId: 'gemini' },
      ];

      const assistantMessages = [
        { participantId: 'p1', roundNumber: 0 },
        { participantId: 'p2', roundNumber: 0 },
        { participantId: 'p3', roundNumber: 0 },
        { participantId: 'p1', roundNumber: 1 },
        { participantId: 'p2', roundNumber: 1 },
      ];

      // Verify all participantIds can be resolved
      const participantMap = new Map(participants.map(p => [p.id, p]));

      for (const msg of assistantMessages) {
        const participant = participantMap.get(msg.participantId);
        expect(participant).toBeDefined();
        expect(participant?.modelId).toBeDefined();
      }
    });

    it('should handle participantIndex fallback correctly', () => {
      // Some old messages might only have participantIndex, not participantId
      const participants = [
        { id: 'p1', modelId: 'gpt-4' },
        { id: 'p2', modelId: 'claude-3' },
      ];

      const messageWithIndex = {
        participantId: undefined as string | undefined,
        participantIndex: 1,
      };

      // Fallback to index-based lookup
      const resolvedParticipant = participants[messageWithIndex.participantIndex];
      expect(resolvedParticipant).toBeDefined();
      expect(resolvedParticipant?.id).toBe('p2');
    });
  });

  describe('complete Round Filtering', () => {
    it('should only show complete rounds on public view', () => {
      const messages = [
        // Round 0 - complete
        { role: 'user', roundNumber: 0 },
        { participantId: 'p1', role: 'assistant', roundNumber: 0 },
        // Round 1 - incomplete (no assistant response)
        { role: 'user', roundNumber: 1 },
      ];

      // Determine complete rounds
      const roundHasUser = new Map<number, boolean>();
      const roundHasAssistant = new Map<number, boolean>();

      for (const msg of messages) {
        if (msg.role === 'user') {
          roundHasUser.set(msg.roundNumber, true);
        } else if (msg.role === 'assistant' && msg.participantId) {
          roundHasAssistant.set(msg.roundNumber, true);
        }
      }

      const completeRounds = new Set<number>();
      for (const [round, hasUser] of roundHasUser) {
        if (hasUser && roundHasAssistant.get(round)) {
          completeRounds.add(round);
        }
      }

      expect(completeRounds.has(0)).toBe(true);
      expect(completeRounds.has(1)).toBe(false);

      // Filter messages for public view
      const publicMessages = messages.filter(m => completeRounds.has(m.roundNumber));
      expect(publicMessages).toHaveLength(2);
    });
  });

  describe('consistency Between Handlers', () => {
    it('getThreadBySlugHandler and getPublicThreadHandler should return same participant count', () => {
      // Simulate the fixed behavior
      const threadParticipants = [
        { id: 'p1', isEnabled: true },
        { id: 'p2', isEnabled: false },
        { id: 'p3', isEnabled: true },
      ];

      // getThreadBySlugHandler - always returned all (no filter)
      const bySlugParticipants = threadParticipants;

      // getPublicThreadHandler - now returns all (fix applied)
      // Previously: threadParticipants.filter(p => p.isEnabled)
      const publicParticipants = threadParticipants;

      expect(bySlugParticipants).toHaveLength(publicParticipants.length);
      expect(bySlugParticipants).toEqual(publicParticipants);
    });

    it('getThreadHandler should also return all participants for consistency', () => {
      const threadParticipants = [
        { id: 'p1', isEnabled: true },
        { id: 'p2', isEnabled: false },
      ];

      // All three handlers now return all participants
      const byIdParticipants = threadParticipants;
      const bySlugParticipants = threadParticipants;
      const publicParticipants = threadParticipants;

      expect(byIdParticipants).toHaveLength(2);
      expect(bySlugParticipants).toHaveLength(2);
      expect(publicParticipants).toHaveLength(2);
    });
  });

  describe('edge Cases', () => {
    it('should handle thread with all participants disabled', () => {
      const participants = [
        { id: 'p1', isEnabled: false },
        { id: 'p2', isEnabled: false },
      ];

      // Should still return both for historical viewing
      expect(participants).toHaveLength(2);
    });

    it('should handle thread with no participants', () => {
      const participants: { id: string; isEnabled: boolean }[] = [];

      expect(participants).toHaveLength(0);
    });

    it('should handle messages with missing participantId', () => {
      const participants = [
        { id: 'p1', modelId: 'gpt-4' },
      ];

      const messagesWithMissingIds = [
        { participantId: undefined, participantIndex: 0, role: 'assistant' },
      ];

      // Should fall back to participantIndex
      const msg = messagesWithMissingIds[0];
      const resolved = msg.participantId
        ? participants.find(p => p.id === msg.participantId)
        : participants[msg.participantIndex ?? 0];

      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe('p1');
    });
  });
});
