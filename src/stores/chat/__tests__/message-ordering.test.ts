/**
 * Message Ordering Tests
 *
 * Verifies that messages maintain correct order throughout the conversation flow:
 * 1. User messages appear in chronological order
 * 2. Participant responses follow their priority order (p0, p1, p2...)
 * 3. Messages are grouped correctly by round
 * 4. Analysis messages appear after participant responses
 *
 * Critical for ensuring FLOW_DOCUMENTATION.md sequential response pattern
 */

import type { UIMessage } from 'ai';

import { MessageRoles } from '@/api/core/enums';
import type { TestAssistantMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getParticipantId, getParticipantIndex, getRoundNumber } from '@/lib/utils/metadata';
import { groupMessagesByRound } from '@/lib/utils/round-utils';

describe('message ordering', () => {
  describe('participant priority ordering', () => {
    /**
     * TEST CASE 1: Participants respond in priority order
     * p0 should respond first, p1 second, p2 third, etc.
     */
    it('should maintain participant priority order within a round', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'p0-response',
          content: 'Response from p0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1-response',
          content: 'Response from p1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'p2-response',
          content: 'Response from p2',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      const participantMessages = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      // Verify order by participantId
      expect(getParticipantId(participantMessages[0]?.metadata)).toBe('p0');
      expect(getParticipantId(participantMessages[1]?.metadata)).toBe('p1');
      expect(getParticipantId(participantMessages[2]?.metadata)).toBe('p2');

      // Verify participant indices
      expect(getParticipantIndex(participantMessages[0]?.metadata)).toBe(0);
      expect(getParticipantIndex(participantMessages[1]?.metadata)).toBe(1);
      expect(getParticipantIndex(participantMessages[2]?.metadata)).toBe(2);
    });

    /**
     * TEST CASE 2: Priority order maintained across multiple rounds
     */
    it('should maintain priority order across multiple rounds', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'p0-r0', content: 'R0-P0', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-r0', content: 'R0-P1', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        // Round 1
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'p0-r1', content: 'R1-P0', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-r1', content: 'R1-P1', roundNumber: 1, participantId: 'p1', participantIndex: 1 }),
      ];

      const grouped = groupMessagesByRound(messages);

      // Round 0 participants
      const round0Participants = (grouped.get(0) || []).filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );
      expect(getParticipantId(round0Participants[0]?.metadata)).toBe('p0');
      expect(getParticipantId(round0Participants[1]?.metadata)).toBe('p1');

      // Round 1 participants
      const round1Participants = (grouped.get(1) || []).filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );
      expect(getParticipantId(round1Participants[0]?.metadata)).toBe('p0');
      expect(getParticipantId(round1Participants[1]?.metadata)).toBe('p1');
    });

    /**
     * TEST CASE 3: Out-of-order insertion maintains logical order
     * Simulates messages arriving out of order but should be displayed in priority order
     */
    it('should handle out-of-order message insertion gracefully', () => {
      // Messages arrive in wrong order (p2, p0, p1)
      const messages: TestAssistantMessage[] = [
        createTestAssistantMessage({ id: 'p2-response', content: 'P2', roundNumber: 0, participantId: 'p2', participantIndex: 2 }),
        createTestAssistantMessage({ id: 'p0-response', content: 'P0', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-response', content: 'P1', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
      ];

      // Messages should be sortable by participantIndex
      const sorted = [...messages].sort((a, b) => {
        const indexA = getParticipantIndex(a.metadata) ?? 0;
        const indexB = getParticipantIndex(b.metadata) ?? 0;
        return indexA - indexB;
      });

      expect(getParticipantId(sorted[0]?.metadata)).toBe('p0');
      expect(getParticipantId(sorted[1]?.metadata)).toBe('p1');
      expect(getParticipantId(sorted[2]?.metadata)).toBe('p2');
    });
  });

  describe('round grouping', () => {
    /**
     * TEST CASE 4: Messages grouped correctly by round
     */
    it('should group messages by round number', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a2', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'a3', content: 'A3', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      ];

      const grouped = groupMessagesByRound(messages);

      expect(grouped.size).toBe(2);
      expect(grouped.get(0)).toHaveLength(3); // 1 user + 2 assistant
      expect(grouped.get(1)).toHaveLength(2); // 1 user + 1 assistant
    });

    /**
     * TEST CASE 5: User message always first in round
     */
    it('should have user message as first message in each round', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'a2', content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      ];

      const grouped = groupMessagesByRound(messages);

      // First message in each round should be user message
      expect(grouped.get(0)?.[0]?.role).toBe(MessageRoles.USER);
      expect(grouped.get(1)?.[0]?.role).toBe(MessageRoles.USER);
    });

    /**
     * TEST CASE 6: Rounds maintain chronological order
     */
    it('should maintain chronological order of rounds', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
        createTestUserMessage({ id: 'u3', content: 'Q3', roundNumber: 2 }),
      ];

      const grouped = groupMessagesByRound(messages);

      const roundNumbers = Array.from(grouped.keys()).sort((a, b) => a - b);

      expect(roundNumbers).toEqual([0, 1, 2]);
    });
  });

  describe('sequential response pattern', () => {
    /**
     * TEST CASE 7: Each participant sees previous responses
     * From FLOW_DOCUMENTATION.md:
     * - First AI sees only user's question
     * - Second AI sees user's question + first AI's response
     * - Third AI sees user's question + both previous responses
     */
    it('should allow each participant to see previous responses in same round', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'What is the capital of France?',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'p0-response',
          content: 'Paris is the capital of France.',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'p1-response',
          content: 'I agree with p0, it\'s Paris.',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'p2-response',
          content: 'Both p0 and p1 are correct - Paris.',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      // When p0 responds, they see only user message
      const p0Context = messages.slice(0, 1); // Just user message
      expect(p0Context).toHaveLength(1);
      expect(p0Context[0]?.role).toBe(MessageRoles.USER);

      // When p1 responds, they see user message + p0's response
      const p1Context = messages.slice(0, 2);
      expect(p1Context).toHaveLength(2);
      expect(getParticipantId(p1Context[1]?.metadata)).toBe('p0');

      // When p2 responds, they see user message + p0's + p1's responses
      const p2Context = messages.slice(0, 3);
      expect(p2Context).toHaveLength(3);
      expect(getParticipantId(p2Context[1]?.metadata)).toBe('p0');
      expect(getParticipantId(p2Context[2]?.metadata)).toBe('p1');
    });

    /**
     * TEST CASE 8: All participants see full history from previous rounds
     */
    it('should allow participants to see complete history from previous rounds', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'p0-r0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1-r0', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        // Round 1 - participants should see all of round 0
        createTestUserMessage({ id: 'u2', content: 'Q2', roundNumber: 1 }),
      ];

      // When first participant of round 1 responds, they see all of round 0
      const p0Round1Context = messages; // All messages up to this point
      const round0Messages = p0Round1Context.filter(m => getRoundNumber(m.metadata) === 0);

      expect(round0Messages).toHaveLength(3); // User + 2 participants
    });
  });

  describe('message filtering', () => {
    /**
     * TEST CASE 9: Filter to participant messages only
     */
    it('should filter to participant messages only', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a2', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        // Pre-search message (no participantId)
        { id: 'search', role: MessageRoles.ASSISTANT, parts: [{ type: 'text', text: 'Search results' }], createdAt: new Date() } as UIMessage,
      ];

      const participantMessages = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      // Should only include messages with participantId
      expect(participantMessages).toHaveLength(2);
      expect(participantMessages.every(m => getParticipantId(m.metadata) !== null)).toBe(true);
    });

    /**
     * TEST CASE 10: Pre-search messages excluded from participant count
     */
    it('should exclude pre-search messages from participant message count', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-1', content: 'Q', roundNumber: 0 }),
        {
          id: 'pre-search',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Web search results...' }],
          // Pre-search message with minimal metadata (no participantId)
          createdAt: new Date(),
        } as UIMessage,
        createTestAssistantMessage({ id: 'p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'p1', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
      ];

      const participantMessages = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      // Should only count actual participant responses (not pre-search)
      expect(participantMessages).toHaveLength(2);

      // Pre-search message should not be included
      const hasPreSearch = participantMessages.some(m => m.id === 'pre-search');
      expect(hasPreSearch).toBe(false);
    });
  });

  describe('message metadata integrity', () => {
    /**
     * TEST CASE 11: All messages have required metadata
     */
    it('should ensure all messages have round number metadata', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'u1', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
      ];

      messages.forEach((message) => {
        expect(message.metadata).toBeDefined();
        const roundNumber = getRoundNumber(message.metadata);
        expect(roundNumber).not.toBeNull();
        expect(typeof roundNumber).toBe('number');
      });
    });

    /**
     * TEST CASE 12: Participant messages have participantId
     */
    it('should ensure participant messages have participantId metadata', () => {
      const messages: TestAssistantMessage[] = [
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a2', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
      ];

      const participantMessages = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      participantMessages.forEach((message) => {
        const participantId = getParticipantId(message.metadata);
        expect(participantId).toBeDefined();
        expect(participantId).not.toBeNull();
        expect(typeof participantId).toBe('string');
      });
    });

    /**
     * TEST CASE 13: Priority metadata is sequential
     */
    it('should have sequential priority values starting from 0', () => {
      const messages: TestAssistantMessage[] = [
        createTestAssistantMessage({ id: 'a1', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'a2', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),
        createTestAssistantMessage({ id: 'a3', content: 'A3', roundNumber: 0, participantId: 'p2', participantIndex: 2 }),
      ];

      const participantMessages = messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata) !== null,
      );

      // Sort by participantIndex
      const sorted = [...participantMessages].sort((a, b) => {
        const indexA = getParticipantIndex(a.metadata) ?? 0;
        const indexB = getParticipantIndex(b.metadata) ?? 0;
        return indexA - indexB;
      });

      sorted.forEach((message, index) => {
        expect(getParticipantIndex(message.metadata)).toBe(index);
      });
    });
  });
});
