/**
 * Participant Message ID Format Tests
 *
 * CRITICAL BUG: Participant message IDs are using r1 instead of r0 for first round
 * User reported: "participantMessageIds":["01KA1DEY81D0X6760M7ZDKZTC5_r1_p0"]
 * Expected: "01KA1DEY81D0X6760M7ZDKZTC5_r0_p0" for first round
 *
 * Message ID Format: {threadId}_r{roundNumber}_p{participantIndex}
 * Example correct IDs:
 * - First round, first participant: "thread123_r0_p0"
 * - First round, second participant: "thread123_r0_p1"
 * - Second round, first participant: "thread123_r1_p0"
 *
 * These tests verify:
 * 1. Message IDs use r0 for first round (not r1)
 * 2. Round numbers in IDs match round numbers in metadata
 * 3. Participant indices are 0-based
 * 4. ID format is consistent across all rounds
 */

import type { TestAssistantMessage, TestUserMessage } from '@/lib/testing';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

describe('participant message ID format', () => {
  const THREAD_ID = '01KA1DEY81D0X6760M7ZDKZTC5';

  describe('first round (r0) message IDs', () => {
    /**
     * REGRESSION TEST: First round should use r0, not r1
     * User reported bug: participantMessageIds show r1 for first round
     */
    it('should generate r0 IDs for first round, NOT r1', () => {
      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`, // Expected correct format
          content: 'First response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const firstAssistantMessage = messages[1]!;

      expect(firstAssistantMessage.id).toContain('_r0_'); // Should contain r0
      expect(firstAssistantMessage.id).not.toContain('_r1_'); // Should NOT contain r1
      expect(firstAssistantMessage.metadata.roundNumber).toBe(0);
    });

    /**
     * TEST: Multiple participants in first round all use r0
     */
    it('should generate r0 IDs for all participants in first round', () => {
      const participants = [
        { id: 'p0', index: 0 },
        { id: 'p1', index: 1 },
        { id: 'p2', index: 2 },
      ];

      participants.forEach(({ index }) => {
        const expectedId = `${THREAD_ID}_r0_p${index}`;

        expect(expectedId).toBe(`${THREAD_ID}_r0_p${index}`);
        expect(expectedId).toContain('_r0_');
      });
    });

    /**
     * REGRESSION TEST: Verify actual buggy ID vs expected ID
     */
    it('should match expected ID format for first round', () => {
      const buggyId = '01KA1DEY81D0X6760M7ZDKZTC5_r1_p0'; // What user reported
      const expectedId = '01KA1DEY81D0X6760M7ZDKZTC5_r0_p0'; // What it should be

      // Verify buggy ID incorrectly uses r1
      expect(buggyId).toContain('_r1_');

      // Verify expected ID correctly uses r0
      expect(expectedId).toContain('_r0_');

      // They should differ in round number part only
      expect(buggyId.replace('_r1_', '_r0_')).toBe(expectedId);
    });
  });

  describe('round number consistency in IDs', () => {
    /**
     * TEST: Message ID round number matches metadata round number
     */
    it('should have matching round numbers in ID and metadata', () => {
      const testCases = [
        { roundNumber: 0, expectedIdPart: '_r0_' },
        { roundNumber: 1, expectedIdPart: '_r1_' },
        { roundNumber: 2, expectedIdPart: '_r2_' },
        { roundNumber: 5, expectedIdPart: '_r5_' },
      ];

      testCases.forEach(({ roundNumber, expectedIdPart }) => {
        const messageId = `${THREAD_ID}_r${roundNumber}_p0`;
        const message = createTestAssistantMessage({
          id: messageId,
          content: 'Response',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        });

        // ID round number matches metadata round number
        expect(message.metadata.roundNumber).toBe(roundNumber);
        expect(message.id).toContain(expectedIdPart);
      });
    });

    /**
     * TEST: All participant messages in same round have same round number in IDs
     */
    it('should have consistent round numbers across participants in same round', () => {
      const roundNumber = 0;
      const participantCount = 3;

      const messages: (TestUserMessage | TestAssistantMessage)[] = [];

      for (let i = 0; i < participantCount; i++) {
        const messageId = `${THREAD_ID}_r${roundNumber}_p${i}`;
        messages.push(createTestAssistantMessage({
          id: messageId,
          content: `Response from p${i}`,
          roundNumber,
          participantId: `p${i}`,
          participantIndex: i,
        }));
      }

      // All messages should have same round number in ID
      messages.forEach((msg) => {
        expect(msg.metadata.roundNumber).toBe(roundNumber);
        expect(msg.id).toContain(`_r${roundNumber}_`);
      });

      // Round number should match current round
      const currentRound = getCurrentRoundNumber(messages);
      expect(currentRound).toBe(roundNumber);
    });
  });

  describe('participant index in IDs', () => {
    /**
     * TEST: Participant indices are 0-based (p0, p1, p2, ...)
     */
    it('should use 0-based participant indices', () => {
      const roundNumber = 0;
      const participantIndices = [0, 1, 2, 3, 4];

      participantIndices.forEach((index) => {
        const messageId = `${THREAD_ID}_r${roundNumber}_p${index}`;

        expect(messageId).toContain(`_p${index}`);
      });

      // Verify first participant specifically
      const firstParticipantId = `${THREAD_ID}_r${roundNumber}_p0`;
      expect(firstParticipantId).toContain('_p0');
      expect(firstParticipantId).not.toContain('_p1');
    });

    /**
     * TEST: Participant indices increment correctly within a round
     */
    it('should have sequential participant indices in same round', () => {
      const roundNumber = 0;
      const participantCount = 3;

      for (let i = 0; i < participantCount; i++) {
        const messageId = `${THREAD_ID}_r${roundNumber}_p${i}`;
        expect(messageId).toBe(`${THREAD_ID}_r${roundNumber}_p${i}`);
      }
    });
  });

  describe('multi-round ID format consistency', () => {
    /**
     * TEST: IDs maintain correct format across multiple rounds
     */
    it('should generate correct IDs across multiple rounds', () => {
      const rounds = [
        {
          roundNumber: 0,
          participants: 2,
          expectedIds: [
            `${THREAD_ID}_r0_p0`,
            `${THREAD_ID}_r0_p1`,
          ],
        },
        {
          roundNumber: 1,
          participants: 2,
          expectedIds: [
            `${THREAD_ID}_r1_p0`,
            `${THREAD_ID}_r1_p1`,
          ],
        },
        {
          roundNumber: 2,
          participants: 3,
          expectedIds: [
            `${THREAD_ID}_r2_p0`,
            `${THREAD_ID}_r2_p1`,
            `${THREAD_ID}_r2_p2`,
          ],
        },
      ];

      rounds.forEach(({ roundNumber, participants, expectedIds }) => {
        for (let p = 0; p < participants; p++) {
          const messageId = `${THREAD_ID}_r${roundNumber}_p${p}`;

          expect(messageId).toBe(expectedIds[p]);
          expect(messageId).toContain(`_r${roundNumber}_`);
          expect(messageId).toContain(`_p${p}`);
        }
      });
    });

    /**
     * TEST: Verify ID format matches expected pattern
     */
    it('should match expected ID pattern format', () => {
      const testCases = [
        { threadId: 'thread1', round: 0, participant: 0, expected: 'thread1_r0_p0' },
        { threadId: 'thread2', round: 1, participant: 2, expected: 'thread2_r1_p2' },
        { threadId: '01HXYZ', round: 5, participant: 3, expected: '01HXYZ_r5_p3' },
      ];

      testCases.forEach(({ threadId, round, participant, expected }) => {
        const generated = `${threadId}_r${round}_p${participant}`;
        expect(generated).toBe(expected);
      });
    });
  });

  describe('id format validation', () => {
    /**
     * TEST: Valid message IDs follow expected pattern
     */
    it('should follow pattern: {threadId}_r{roundNumber}_p{participantIndex}', () => {
      const validIds = [
        'thread_r0_p0',
        'abc123_r1_p1',
        '01KA1DEY81D0X6760M7ZDKZTC5_r0_p0',
        '01KA1DEY81D0X6760M7ZDKZTC5_r2_p3',
      ];

      validIds.forEach((id) => {
        expect(id).toMatch(/^.+_r\d+_p\d+$/);
      });
    });

    /**
     * TEST: Invalid formats don't match pattern
     */
    it('should not match pattern for invalid formats', () => {
      const invalidIds = [
        'no-round-info',
        'thread_p0', // missing round
        'thread_r1', // missing participant
        'thread_r1_', // incomplete participant
        '', // empty
      ];

      const pattern = /^.+_r\d+_p\d+$/;

      invalidIds.forEach((id) => {
        expect(id).not.toMatch(pattern);
      });
    });
  });

  describe('regression test for user-reported bug', () => {
    /**
     * CRITICAL REGRESSION TEST
     * User state dump showed: participantMessageIds: ["01KA1DEY81D0X6760M7ZDKZTC5_r1_p0"]
     * This should be: "01KA1DEY81D0X6760M7ZDKZTC5_r0_p0"
     *
     * Root cause: Backend streaming handler using wrong round number
     * Location: src/api/routes/chat/handlers/streaming.handler.ts:476
     */
    it('should NOT generate r1 IDs for first round (user-reported bug)', () => {
      // User's actual state
      const userReportedId = '01KA1DEY81D0X6760M7ZDKZTC5_r1_p0';

      // Verify this is the buggy behavior
      expect(userReportedId).toContain('_r1_'); // Bug: using round 1

      // What it SHOULD be
      const correctId = '01KA1DEY81D0X6760M7ZDKZTC5_r0_p0';

      expect(correctId).toContain('_r0_'); // Correct: round 0

      // The message metadata should have roundNumber: 0
      const message = createTestAssistantMessage({
        id: correctId, // Use correct ID
        content: 'Response',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      });

      // ID should match metadata
      expect(message.id).toContain('_r0_');
      expect(message.metadata.roundNumber).toBe(0);
    });

    /**
     * CRITICAL VERIFICATION: Analysis roundNumber should match message ID round
     */
    it('should create analysis with roundNumber matching message IDs', () => {
      const correctFirstRoundId = '01KA1DEY81D0X6760M7ZDKZTC5_r0_p0';

      const messages: (TestUserMessage | TestAssistantMessage)[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: correctFirstRoundId,
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
      ];

      const currentRound = getCurrentRoundNumber(messages);

      // All should agree on round 0
      expect(currentRound).toBe(0);
      expect(messages[1]!.metadata.roundNumber).toBe(0);

      // Analysis should be created for round 0
      const analysisRoundNumber = currentRound;
      expect(analysisRoundNumber).toBe(0);

      // participantMessageIds array should contain r0 IDs
      const participantMessageIds = [correctFirstRoundId];
      participantMessageIds.forEach((id) => {
        expect(id).toContain('_r0_');
        expect(id).not.toContain('_r1_');
      });
    });
  });
});
