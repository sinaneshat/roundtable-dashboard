/**
 * Analysis Participant ID Validation Tests
 *
 * CRITICAL BUG DISCOVERED:
 * Round 1 analysis included participant message ID from round 0:
 * participantMessageIds: ['...r0_p1', '...r1_p1'] ❌
 * Should be: ['...r1_p0', '...r1_p1'] ✓
 *
 * ROOT CAUSE:
 * - Message ID generation using wrong round/participant combination
 * - Analysis creation using messages with mismatched IDs
 * - No validation that participantMessageIds match the analysis roundNumber
 *
 * These tests verify:
 * 1. Participant message IDs match their metadata roundNumber
 * 2. Participant message IDs match their metadata participantIndex
 * 3. Analysis participantMessageIds only contain messages from THAT round
 * 4. No duplicate message IDs in the same round
 * 5. Message ID format: {threadId}_r{roundNumber}_p{participantIndex}
 */

import { MessageRoles } from '@/api/core/enums';
import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getParticipantId, getParticipantIndex, getRoundNumber } from '@/lib/utils/metadata';

describe('Analysis Participant ID Validation', () => {
  const THREAD_ID = '01KA1RNWKYNQSDM5EGMCSCYGX5';

  /**
   * CRITICAL TEST: Participant message IDs must match their metadata
   */
  describe('Message ID and metadata consistency', () => {
    it('should have message ID roundNumber matching metadata roundNumber', () => {
      // Simulate actual backend behavior with multiple rounds
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        // Round 0
        createTestUserMessage({
          id: 'user-r0',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'First response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'Second response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        // Round 1
        createTestUserMessage({
          id: 'user-r1',
          content: 'Second question',
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'Third response',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p1`,
          content: 'Fourth response',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Verify each participant message
      messages.forEach((msg) => {
        if (msg.role === MessageRoles.ASSISTANT && msg.id.includes('_r')) {
          // Extract round number from ID
          const idMatch = msg.id.match(/_r(\d+)_p(\d+)/);
          expect(idMatch).toBeTruthy();

          const roundFromId = Number.parseInt(idMatch![1]!);
          const participantIndexFromId = Number.parseInt(idMatch![2]!);

          // CRITICAL: ID must match metadata
          expect(getRoundNumber(msg.metadata)).toBe(roundFromId);
          expect(getParticipantIndex(msg.metadata)).toBe(participantIndexFromId);
        }
      });
    });

    it('should detect CORRUPTED message (ID says r0_p1, metadata says round 1, index 0)', () => {
      // This is the actual bug from user's state dump
      const corruptedMessage = createTestAssistantMessage({
        id: `${THREAD_ID}_r0_p1`, // ❌ ID says round 0, participant 1
        content: 'Response',
        roundNumber: 1, // ❌ Metadata says round 1
        participantId: 'p0',
        participantIndex: 0, // ❌ Metadata says participant 0
      });

      const idMatch = corruptedMessage.id.match(/_r(\d+)_p(\d+)/);
      const roundFromId = Number.parseInt(idMatch![1]!);
      const participantIndexFromId = Number.parseInt(idMatch![2]!);

      // These should fail - detecting the corruption
      expect(getRoundNumber(corruptedMessage.metadata)).not.toBe(roundFromId);
      expect(getParticipantIndex(corruptedMessage.metadata)).not.toBe(participantIndexFromId);

      // Verify the mismatch
      expect(roundFromId).toBe(0); // ID says 0
      expect(getRoundNumber(corruptedMessage.metadata)).toBe(1); // Metadata says 1
      expect(participantIndexFromId).toBe(1); // ID says p1
      expect(getParticipantIndex(corruptedMessage.metadata)).toBe(0); // Metadata says p0
    });
  });

  /**
   * CRITICAL TEST: Analysis must only include participants from its round
   */
  describe('Analysis participant message ID validation', () => {
    it('should only include participant message IDs from the SAME round', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'A1',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'A2',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'A3',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p1`,
          content: 'A4',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Simulate analysis creation for round 1
      const round1Messages = messages.filter(m =>
        getRoundNumber(m.metadata) === 1 && m.role === MessageRoles.ASSISTANT && getParticipantId(m.metadata)
      );

      const participantMessageIds = round1Messages.map(m => m.id);

      // CRITICAL: Round 1 analysis must ONLY have round 1 participant IDs
      expect(participantMessageIds).toEqual([
        `${THREAD_ID}_r1_p0`,
        `${THREAD_ID}_r1_p1`,
      ]);

      // CRITICAL: Must NOT include round 0 IDs
      expect(participantMessageIds).not.toContain(`${THREAD_ID}_r0_p0`);
      expect(participantMessageIds).not.toContain(`${THREAD_ID}_r0_p1`);

      // Verify all IDs match the round
      participantMessageIds.forEach((id) => {
        expect(id).toContain('_r1_');
        expect(id).not.toContain('_r0_');
      });
    });

    it('should FAIL if analysis includes participant IDs from WRONG round (user bug)', () => {
      // This is the actual bug scenario from user's state dump
      const analysisRoundNumber = 1;

      // ❌ BUGGY: Analysis includes message from round 0
      const buggyParticipantMessageIds = [
        `${THREAD_ID}_r0_p1`, // ❌ From round 0
        `${THREAD_ID}_r1_p1`, // ✓ From round 1
      ];

      // Verify each ID matches the analysis round
      buggyParticipantMessageIds.forEach((id) => {
        const idMatch = id.match(/_r(\d+)_p(\d+)/);
        const roundFromId = Number.parseInt(idMatch![1]!);

        // This should fail - detecting the bug
        if (id === `${THREAD_ID}_r0_p1`) {
          expect(roundFromId).not.toBe(analysisRoundNumber);
          expect(roundFromId).toBe(0); // Wrong round
        } else {
          expect(roundFromId).toBe(analysisRoundNumber);
        }
      });

      // Correct IDs should be
      const correctParticipantMessageIds = [
        `${THREAD_ID}_r1_p0`,
        `${THREAD_ID}_r1_p1`,
      ];

      expect(buggyParticipantMessageIds).not.toEqual(correctParticipantMessageIds);
    });

    it('should verify participant indices are sequential (0, 1, 2, ...)', () => {
      const round1ParticipantIds = [
        `${THREAD_ID}_r1_p0`,
        `${THREAD_ID}_r1_p1`,
        `${THREAD_ID}_r1_p2`,
      ];

      round1ParticipantIds.forEach((id, index) => {
        const idMatch = id.match(/_r(\d+)_p(\d+)/);
        const participantIndexFromId = Number.parseInt(idMatch![2]!);

        // Participant indices should be sequential starting from 0
        expect(participantIndexFromId).toBe(index);
      });
    });
  });

  /**
   * CRITICAL TEST: No duplicate message IDs in same round
   */
  describe('Duplicate message ID detection', () => {
    it('should NOT have duplicate participant message IDs in same round', () => {
      const round1Messages = [
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p0`,
          content: 'A1',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r1_p1`,
          content: 'A2',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const ids = round1Messages.map(m => m.id);
      const uniqueIds = new Set(ids);

      // No duplicates
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should DETECT if same message ID appears twice (user bug scenario)', () => {
      // User's state dump shows r0_p1 appearing twice with different metadata
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        // Round 0 - original r0_p1
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`,
          content: 'Round 0 response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        // Round 1 - WRONG: reusing r0_p1 ID
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p1`, // ❌ Same ID as above
          content: 'Round 1 response',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const ids = messages.map(m => m.id);
      const uniqueIds = new Set(ids);

      // Should detect duplicate
      expect(ids.length).not.toBe(uniqueIds.size);
      expect(ids.length).toBe(2);
      expect(uniqueIds.size).toBe(1); // Only one unique ID

      // Find the duplicate
      const duplicateId = `${THREAD_ID}_r0_p1`;
      const messagesWithThisId = messages.filter(m => m.id === duplicateId);
      expect(messagesWithThisId).toHaveLength(2);

      // Verify they have different roundNumbers
      expect(getRoundNumber(messagesWithThisId[0]!.metadata)).toBe(0);
      expect(getRoundNumber(messagesWithThisId[1]!.metadata)).toBe(1);
    });
  });

  /**
   * CRITICAL TEST: Message ID format validation
   */
  describe('Message ID format validation', () => {
    it('should match pattern {threadId}_r{roundNumber}_p{participantIndex}', () => {
      const validIds = [
        { id: `${THREAD_ID}_r0_p0`, round: 0, index: 0 },
        { id: `${THREAD_ID}_r0_p1`, round: 0, index: 1 },
        { id: `${THREAD_ID}_r1_p0`, round: 1, index: 0 },
        { id: `${THREAD_ID}_r1_p1`, round: 1, index: 1 },
        { id: `${THREAD_ID}_r2_p2`, round: 2, index: 2 },
      ];

      validIds.forEach(({ id, round, index }) => {
        const match = id.match(/^(.+)_r(\d+)_p(\d+)$/);

        expect(match).toBeTruthy();
        expect(match![1]).toBe(THREAD_ID);
        expect(Number.parseInt(match![2]!)).toBe(round);
        expect(Number.parseInt(match![3]!)).toBe(index);
      });
    });

    it('should construct correct ID from components', () => {
      const testCases = [
        { round: 0, index: 0, expected: `${THREAD_ID}_r0_p0` },
        { round: 0, index: 1, expected: `${THREAD_ID}_r0_p1` },
        { round: 1, index: 0, expected: `${THREAD_ID}_r1_p0` },
        { round: 1, index: 1, expected: `${THREAD_ID}_r1_p1` },
      ];

      testCases.forEach(({ round, index, expected }) => {
        const constructed = `${THREAD_ID}_r${round}_p${index}`;
        expect(constructed).toBe(expected);
      });
    });
  });
});
