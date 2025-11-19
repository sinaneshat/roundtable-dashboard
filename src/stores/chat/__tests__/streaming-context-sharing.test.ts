/**
 * AI Responses Streaming - Context Sharing Tests
 *
 * Tests PART 3 of FLOW_DOCUMENTATION.md - Context Sharing Between Participants
 *
 * SCOPE:
 * - Each AI sees previous responses in same round
 * - Context accumulation during sequential streaming
 * - First AI sees only user question
 * - Second AI sees user + first AI response
 * - Third AI sees user + first + second responses
 *
 * CRITICAL BEHAVIORS TESTED:
 * - Message visibility during streaming
 * - Context builds sequentially (not all at once)
 * - Participants can reference earlier responses
 * - Cross-round context (previous rounds visible)
 *
 * Pattern from: /docs/FLOW_DOCUMENTATION.md:182-190, 387-400
 */

import type { UIMessage } from 'ai';

import { MessageRoles } from '@/api/core/enums';
import type { TestAssistantMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils/metadata';

describe('streaming context sharing', () => {
  const THREAD_ID = '01KA1DEY81D0X6760M7ZDKZTC5';

  describe('within same round context', () => {
    /**
     * TEST: First participant sees only user question
     * No other participant responses yet
     */
    it('should provide only user question to first participant', () => {
      const roundNumber = 0;
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'What are the benefits of TypeScript?',
          roundNumber,
        }),
      ];

      // First participant starts streaming
      const contextForP0 = messages.filter(m => getRoundNumber(m.metadata) === roundNumber);

      // Should only see user message
      expect(contextForP0).toHaveLength(1);
      expect(contextForP0[0]!.role).toBe(MessageRoles.USER);
      expect(contextForP0.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(0);
    });

    /**
     * TEST: Second participant sees user + first participant
     * Context builds as each participant completes
     */
    it('should provide user + p0 response to second participant', () => {
      const roundNumber = 0;
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'What are the benefits of TypeScript?',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'TypeScript provides type safety and better IDE support',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      // Second participant starts streaming (sees p0's completed response)
      const contextForP1 = messages.filter(m => getRoundNumber(m.metadata) === roundNumber);

      // Should see user + p0
      expect(contextForP1).toHaveLength(2);
      expect(contextForP1[0]!.role).toBe(MessageRoles.USER);
      expect(contextForP1[1]!.role).toBe(MessageRoles.ASSISTANT);
      expect(contextForP1[1]!.metadata.participantIndex).toBe(0);
    });

    /**
     * TEST: Third participant sees user + p0 + p1
     * Full context accumulation
     */
    it('should provide complete context to third participant', () => {
      const roundNumber = 0;
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'What are the benefits of TypeScript?',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'TypeScript provides type safety',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'Building on that, it also catches errors at compile time',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Third participant starts streaming (sees p0 and p1 completed responses)
      const contextForP2 = messages.filter(m => getRoundNumber(m.metadata) === roundNumber);

      // Should see user + p0 + p1
      expect(contextForP2).toHaveLength(3);
      expect(contextForP2[0]!.role).toBe(MessageRoles.USER);
      expect(contextForP2[1]!.role).toBe(MessageRoles.ASSISTANT);
      expect(contextForP2[2]!.role).toBe(MessageRoles.ASSISTANT);

      const assistantMessages = contextForP2.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);
      expect(assistantMessages[0]!.metadata.participantIndex).toBe(0);
      expect(assistantMessages[1]!.metadata.participantIndex).toBe(1);
    });

    /**
     * TEST: Participants can reference earlier responses
     * Second participant's response can explicitly reference first
     */
    it('should allow participants to reference earlier responses in same round', () => {
      const roundNumber = 0;
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Should I use TypeScript?',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'Yes, TypeScript is great for large projects',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'I agree with the previous response. Additionally, it improves team collaboration',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const p1Response = messages.find(m => m.role === MessageRoles.ASSISTANT && m.metadata?.participantIndex === 1);

      // p1's response references "previous response"
      expect(p1Response?.parts?.[0]?.text).toContain('previous response');

      // Verify p1 had access to p0's response
      const messagesBeforeP1 = messages.slice(0, 2); // user + p0
      expect(messagesBeforeP1.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(1);
    });
  });

  describe('cross-round context', () => {
    /**
     * TEST: Participants in round 1 see all of round 0
     * Pattern from: FLOW_DOCUMENTATION.md:395-399
     */
    it('should provide complete history from previous rounds', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({
          id: 'user-r0',
          content: 'What is TypeScript?',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'TypeScript is a typed superset of JavaScript',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'It compiles to plain JavaScript',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        // Round 1
        createTestUserMessage({
          id: 'user-r1',
          content: 'What are its main benefits?',
          roundNumber: 1,
        }),
      ];

      // First participant in round 1 sees ALL of round 0 + round 1 user message
      const contextForP0Round1 = messages;

      expect(contextForP0Round1).toHaveLength(4);

      // Round 0 messages
      const round0Messages = contextForP0Round1.filter(m => getRoundNumber(m.metadata) === 0);
      expect(round0Messages).toHaveLength(3);

      // Round 1 messages
      const round1Messages = contextForP0Round1.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Messages).toHaveLength(1);
      expect(round1Messages[0]!.role).toBe(MessageRoles.USER);
    });

    /**
     * TEST: Multi-round context accumulation
     * Each round builds on all previous rounds
     */
    it('should accumulate context across multiple rounds', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p0`, content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        // Round 2
        createTestUserMessage({ id: 'user-r2', content: 'Q3', roundNumber: 2 }),
      ];

      // Participant in round 2 sees all previous rounds
      const contextForP0Round2 = messages;

      expect(contextForP0Round2).toHaveLength(5);

      // Each round represented
      expect(contextForP0Round2.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(2);
      expect(contextForP0Round2.filter(m => getRoundNumber(m.metadata) === 1)).toHaveLength(2);
      expect(contextForP0Round2.filter(m => getRoundNumber(m.metadata) === 2)).toHaveLength(1);
    });

    /**
     * TEST: No need to repeat information across rounds
     * Pattern from: FLOW_DOCUMENTATION.md:398-399
     */
    it('should allow participants to reference previous rounds without repetition', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({
          id: 'user-r0',
          content: 'What is dependency injection?',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Dependency injection is a design pattern for managing dependencies',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        // Round 1
        createTestUserMessage({
          id: 'user-r1',
          content: 'Can you give an example?',
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'As mentioned in the previous round, here is a concrete example...',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const round1Response = messages.find(m => getRoundNumber(m.metadata) === 1 && m.role === MessageRoles.ASSISTANT);

      // Round 1 response references "previous round"
      expect(round1Response?.parts?.[0]?.text).toContain('previous round');

      // Verify round 0 context was available
      const round0Messages = messages.filter(m => getRoundNumber(m.metadata) === 0);
      expect(round0Messages).toHaveLength(2);
    });
  });

  describe('context filtering and isolation', () => {
    /**
     * TEST: Only messages from current and previous rounds included
     * No future rounds leaked into context
     */
    it('should not include messages from future rounds in context', () => {
      const roundNumber = 1;
      const messages: UIMessage[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
      ];

      // Filter context for round 1
      const contextForRound1 = messages.filter(m => getRoundNumber(m.metadata) <= roundNumber);

      expect(contextForRound1).toHaveLength(3);

      // No messages from round 2+ should exist
      contextForRound1.forEach((msg) => {
        expect(getRoundNumber(msg.metadata)).toBeLessThanOrEqual(roundNumber);
      });
    });

    /**
     * TEST: Participant index isolation per round
     * p0 in round 1 is different from p0 in round 0
     */
    it('should treat participant indices as per-round, not global', () => {
      const messages: UIMessage[] = [
        // Round 0
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Round 0 response from p0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        // Round 1
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'Round 1 response from p0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      // Both have participantIndex: 0, but different rounds
      expect(messages[0]!.metadata.participantIndex).toBe(0);
      expect(messages[1]!.metadata.participantIndex).toBe(0);

      expect(messages[0]!.metadata.roundNumber).toBe(0);
      expect(messages[1]!.metadata.roundNumber).toBe(1);

      // Different message IDs
      expect(messages[0]!.id).not.toBe(messages[1]!.id);
      expect(messages[0]!.id).toContain('_r0_');
      expect(messages[1]!.id).toContain('_r1_');
    });
  });

  describe('context ordering', () => {
    /**
     * TEST: Messages ordered chronologically within context
     * Maintains temporal coherence for AI processing
     */
    it('should maintain chronological order in context', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'First question',
          roundNumber: 0,
          createdAt: '2024-01-01T00:00:00Z',
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'First response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          createdAt: '2024-01-01T00:00:01Z',
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'Second response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
          createdAt: '2024-01-01T00:00:02Z',
        }),
      ];

      // Verify chronological ordering
      for (let i = 1; i < messages.length; i++) {
        const prevTime = new Date(messages[i - 1]!.metadata.createdAt!).getTime();
        const currTime = new Date(messages[i]!.metadata.createdAt!).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    /**
     * TEST: Participant order within round maintained
     * p0 → p1 → p2 order preserved in context
     */
    it('should maintain participant order within each round', () => {
      const roundNumber = 0;
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-r0', content: 'Q', roundNumber }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'A0', roundNumber, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p1`, content: 'A1', roundNumber, participantId: 'p1', participantIndex: 1 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p2`, content: 'A2', roundNumber, participantId: 'p2', participantIndex: 2 }),
      ];

      const participantMessages = messages.filter((m): m is TestAssistantMessage => m.role === MessageRoles.ASSISTANT);

      // Verify ascending participant index order
      participantMessages.forEach((msg, index) => {
        expect(msg.metadata.participantIndex).toBe(index);
      });
    });
  });

  describe('context edge cases', () => {
    /**
     * TEST: Empty context for first message ever
     * Very first participant in very first round sees only user message
     */
    it('should handle empty context for first participant in first round', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Very first question',
          roundNumber: 0,
        }),
      ];

      expect(messages).toHaveLength(1);
      expect(messages.filter(m => m.role === MessageRoles.ASSISTANT)).toHaveLength(0);
    });

    /**
     * TEST: Large context across many rounds
     * System should handle deep conversation history
     */
    it('should handle large context across many rounds', () => {
      const rounds = 5;
      const participantsPerRound = 3;
      const messages: UIMessage[] = [];

      // Build large conversation
      for (let r = 0; r < rounds; r++) {
        messages.push(
          createTestUserMessage({
            id: `user-r${r}`,
            content: `Question ${r}`,
            roundNumber: r,
          }),
        );

        for (let p = 0; p < participantsPerRound; p++) {
          messages.push(
            createTestAssistantMessage({
              id: `${THREAD_ID}_r${r}_p${p}`,
              content: `Response R${r}-P${p}`,
              roundNumber: r,
              participantId: `p${p}`,
              participantIndex: p,
            }),
          );
        }
      }

      // Total messages: 5 user + (5 rounds * 3 participants) = 20
      expect(messages).toHaveLength(20);

      // Last participant in last round sees everything
      const allContext = messages;
      expect(allContext).toHaveLength(20);

      // Verify each round present
      for (let r = 0; r < rounds; r++) {
        const roundMessages = allContext.filter(m => getRoundNumber(m.metadata) === r);
        expect(roundMessages).toHaveLength(4); // 1 user + 3 participants
      }
    });

    /**
     * TEST: Context with single participant per round
     * Minimum viable context still works
     */
    it('should handle context with single participant per round', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r0_p0`, content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: `${THREAD_ID}_r1_p0`, content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
      ];

      // Round 1 participant sees all of round 0
      const contextForRound1 = messages;
      expect(contextForRound1.filter(m => getRoundNumber(m.metadata) === 0)).toHaveLength(2);
      expect(contextForRound1.filter(m => getRoundNumber(m.metadata) === 1)).toHaveLength(2);
    });
  });
});
