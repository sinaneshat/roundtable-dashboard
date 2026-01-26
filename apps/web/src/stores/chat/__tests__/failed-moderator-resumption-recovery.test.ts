/**
 * Failed Moderator Resumption Recovery Tests
 *
 * Tests the fix for the bug where:
 * - moderatorResumption.status === 'failed'
 * - waitingToStartStreaming === true
 * - isModeratorStreaming === true
 * - BUT the moderator message is actually complete (finishReason: 'stop')
 *
 * The fix detects this state and clears the stuck streaming flags.
 *
 * These tests verify the underlying detection logic used by the fix:
 * 1. getModeratorMessageForRound - finds moderator for a round
 * 2. getAssistantMetadata - extracts finishReason from moderator metadata
 * 3. finishReason validation - detects STOP vs UNKNOWN
 *
 * @see src/stores/chat/actions/incomplete-round-resumption.ts lines 1119-1153
 */

import { FinishReasons, MessageRoles, ModelIds, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createTestAssistantMessage, createTestModeratorMessage, createTestUserMessage } from '@/lib/testing';
import { getModeratorMetadata, getRoundNumber } from '@/lib/utils';

import { getModeratorMessageForRound } from '../utils/participant-completion-gate';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createCompleteRoundWithModerator(roundNumber: number, participantCount: number): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      content: `User message for round ${roundNumber}`,
      id: `thread-123_r${roundNumber}_user`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        content: `Participant ${i} response`,
        finishReason: FinishReasons.STOP,
        id: `thread-123_r${roundNumber}_p${i}`,
        participantId: `participant-${i}`,
        participantIndex: i,
        roundNumber,
      }),
    );
  }

  messages.push(
    createTestModeratorMessage({
      content: 'Moderator summary complete',
      finishReason: FinishReasons.STOP,
      id: `thread-123_r${roundNumber}_moderator`,
      roundNumber,
    }),
  );

  return messages;
}

function createIncompleteModeratorMessage(roundNumber: number): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_moderator`,
    metadata: {
      finishReason: FinishReasons.UNKNOWN, // Incomplete - interrupted stream
      hasError: false,
      isModerator: true,
      model: ModelIds.GOOGLE_GEMINI_3_FLASH_PREVIEW,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
    },
    parts: [{ text: 'Partial moderator...', type: 'text' as const }],
    role: UIMessageRoles.ASSISTANT,
  };
}

// ============================================================================
// TEST SUITES - Detection Logic Unit Tests
// ============================================================================

describe('moderator Message Detection for Recovery', () => {
  describe('getModeratorMessageForRound', () => {
    it('should find a complete moderator message for a given round', () => {
      const messages = createCompleteRoundWithModerator(0, 2);

      const moderator = getModeratorMessageForRound(messages, 0);

      expect(moderator).toBeDefined();
      expect(moderator?.id).toBe('thread-123_r0_moderator');
    });

    it('should return undefined when no moderator exists for round', () => {
      // Round 0 with participants but no moderator
      const messages: UIMessage[] = [
        createTestUserMessage({
          content: 'Test',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Response',
          finishReason: FinishReasons.STOP,
          id: 'thread-123_r0_p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      const moderator = getModeratorMessageForRound(messages, 0);

      expect(moderator).toBeUndefined();
    });

    it('should find moderator for correct round in multi-round thread', () => {
      const round0 = createCompleteRoundWithModerator(0, 2);
      const round1 = createCompleteRoundWithModerator(1, 2);
      const messages = [...round0, ...round1];

      const moderatorR0 = getModeratorMessageForRound(messages, 0);
      const moderatorR1 = getModeratorMessageForRound(messages, 1);

      expect(moderatorR0?.id).toBe('thread-123_r0_moderator');
      expect(moderatorR1?.id).toBe('thread-123_r1_moderator');
    });
  });

  describe('moderator FinishReason Detection', () => {
    it('should detect complete moderator via finishReason = STOP', () => {
      const moderator = createTestModeratorMessage({
        content: 'Summary',
        finishReason: FinishReasons.STOP,
        id: 'mod-1',
        roundNumber: 0,
      });

      // Use getModeratorMetadata for moderator messages, not getAssistantMetadata
      const metadata = getModeratorMetadata(moderator.metadata);

      expect(metadata?.finishReason).toBe(FinishReasons.STOP);
      expect(metadata?.finishReason).not.toBe(FinishReasons.UNKNOWN);
    });

    it('should detect incomplete moderator via finishReason = UNKNOWN', () => {
      const moderator = createIncompleteModeratorMessage(0);

      const metadata = getModeratorMetadata(moderator.metadata);

      expect(metadata?.finishReason).toBe(FinishReasons.UNKNOWN);
    });

    it('should distinguish between complete and incomplete moderators', () => {
      const completeModerator = createTestModeratorMessage({
        content: 'Complete summary',
        finishReason: FinishReasons.STOP,
        id: 'mod-complete',
        roundNumber: 0,
      });

      const incompleteModerator = createIncompleteModeratorMessage(0);

      const completeMetadata = getModeratorMetadata(completeModerator.metadata);
      const incompleteMetadata = getModeratorMetadata(incompleteModerator.metadata);

      // The fix logic: hasValidFinishReason = finishReason && finishReason !== UNKNOWN
      const hasValidCompleteFinishReason = completeMetadata?.finishReason
        && completeMetadata.finishReason !== FinishReasons.UNKNOWN;
      const hasValidIncompleteFinishReason = incompleteMetadata?.finishReason
        && incompleteMetadata.finishReason !== FinishReasons.UNKNOWN;

      expect(hasValidCompleteFinishReason).toBeTruthy();
      expect(hasValidIncompleteFinishReason).toBeFalsy();
    });
  });

  describe('moderator Metadata Parsing', () => {
    it('should parse moderator metadata correctly via getModeratorMetadata', () => {
      const moderator = createTestModeratorMessage({
        content: 'Summary',
        finishReason: FinishReasons.STOP,
        id: 'mod-1',
        roundNumber: 0,
      });

      const metadata = getModeratorMetadata(moderator.metadata);

      expect(metadata).not.toBeNull();
      expect(metadata?.isModerator).toBeTruthy();
      expect(metadata?.finishReason).toBe(FinishReasons.STOP);
    });

    it('should return null for non-moderator assistant metadata', () => {
      const participantMessage = createTestAssistantMessage({
        content: 'Response',
        finishReason: FinishReasons.STOP,
        id: 'p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const metadata = getModeratorMetadata(participantMessage.metadata);

      // Regular participant messages should not parse as moderator
      expect(metadata).toBeNull();
    });

    it('should extract round number from moderator metadata', () => {
      const moderator = createTestModeratorMessage({
        content: 'Summary',
        finishReason: FinishReasons.STOP,
        id: 'mod-1',
        roundNumber: 3,
      });

      const roundNumber = getRoundNumber(moderator.metadata);

      expect(roundNumber).toBe(3);
    });
  });
});

describe('recovery Logic Validation', () => {
  describe('failed Resumption + Complete Moderator Detection', () => {
    it('should correctly identify when moderator resumption failed but message is complete', () => {
      // This simulates the bug scenario:
      // - Server prefilled moderatorResumption with status: 'failed'
      // - But the moderator message is actually complete (finishReason: 'stop')

      const messages = createCompleteRoundWithModerator(0, 2);
      const resumptionRoundNumber = 0;
      const moderatorResumptionStatus = 'failed';

      // Find the moderator message
      const moderatorMessage = getModeratorMessageForRound(messages, resumptionRoundNumber);
      expect(moderatorMessage).toBeDefined();

      // Check if it has a valid finishReason (the fix logic)
      // Note: The actual fix uses getAssistantMetadata which works on moderator messages
      // because it doesn't require isModerator field - it just extracts finishReason
      const metadata = moderatorMessage ? getModeratorMetadata(moderatorMessage.metadata) : undefined;
      const hasValidFinishReason = metadata?.finishReason
        && metadata.finishReason !== FinishReasons.UNKNOWN;

      // In this case, recovery SHOULD trigger because:
      // 1. moderatorResumptionStatus === 'failed' ✓
      // 2. moderatorMessage exists ✓
      // 3. hasValidFinishReason === true (finishReason is 'stop') ✓
      expect(moderatorResumptionStatus).toBe('failed');
      expect(hasValidFinishReason).toBeTruthy();
    });

    it('should NOT trigger recovery when moderator is incomplete', () => {
      // This simulates the case where resumption failed AND moderator is incomplete
      // - Server prefilled moderatorResumption with status: 'failed'
      // - Moderator message exists but is incomplete (finishReason: 'unknown')

      const incompleteMessages: UIMessage[] = [
        createTestUserMessage({
          content: 'Test',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Response',
          finishReason: FinishReasons.STOP,
          id: 'thread-123_r0_p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createIncompleteModeratorMessage(0), // Incomplete moderator
      ];

      const resumptionRoundNumber = 0;
      const moderatorResumptionStatus = 'failed';

      // Find the moderator message
      const moderatorMessage = getModeratorMessageForRound(incompleteMessages, resumptionRoundNumber);
      expect(moderatorMessage).toBeDefined();

      // Check if it has a valid finishReason
      const metadata = moderatorMessage ? getModeratorMetadata(moderatorMessage.metadata) : undefined;
      const hasValidFinishReason = metadata?.finishReason
        && metadata.finishReason !== FinishReasons.UNKNOWN;

      // Recovery should NOT trigger because:
      // 1. moderatorResumptionStatus === 'failed' ✓
      // 2. moderatorMessage exists ✓
      // 3. hasValidFinishReason === false (finishReason is 'unknown') ✗
      expect(moderatorResumptionStatus).toBe('failed');
      expect(hasValidFinishReason).toBeFalsy();
    });

    it('should NOT trigger recovery when no moderator message exists', () => {
      // This simulates the case where moderator never started
      const messagesWithoutModerator: UIMessage[] = [
        createTestUserMessage({
          content: 'Test',
          id: 'thread-123_r0_user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'Response',
          finishReason: FinishReasons.STOP,
          id: 'thread-123_r0_p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        // No moderator message
      ];

      const resumptionRoundNumber = 0;

      // Find the moderator message
      const moderatorMessage = getModeratorMessageForRound(messagesWithoutModerator, resumptionRoundNumber);

      // Recovery should NOT trigger because moderatorMessage doesn't exist
      expect(moderatorMessage).toBeUndefined();
    });
  });

  describe('finish Reason Edge Cases', () => {
    it('should treat length finish reason as complete', () => {
      const moderator = createTestModeratorMessage({
        content: 'Truncated summary due to length...',
        finishReason: FinishReasons.LENGTH,
        id: 'mod-1',
        roundNumber: 0,
      });

      const metadata = getModeratorMetadata(moderator.metadata);
      const hasValidFinishReason = metadata?.finishReason
        && metadata.finishReason !== FinishReasons.UNKNOWN;

      expect(hasValidFinishReason).toBeTruthy();
    });

    it('should treat content_filter finish reason as complete', () => {
      const moderator = createTestModeratorMessage({
        content: 'Filtered content',
        finishReason: FinishReasons.CONTENT_FILTER,
        id: 'mod-1',
        roundNumber: 0,
      });

      const metadata = getModeratorMetadata(moderator.metadata);
      const hasValidFinishReason = metadata?.finishReason
        && metadata.finishReason !== FinishReasons.UNKNOWN;

      expect(hasValidFinishReason).toBeTruthy();
    });

    it('should treat error finish reason as complete', () => {
      const moderator = createTestModeratorMessage({
        content: 'Error during generation',
        finishReason: FinishReasons.ERROR,
        id: 'mod-1',
        roundNumber: 0,
      });

      const metadata = getModeratorMetadata(moderator.metadata);
      const hasValidFinishReason = metadata?.finishReason
        && metadata.finishReason !== FinishReasons.UNKNOWN;

      expect(hasValidFinishReason).toBeTruthy();
    });
  });
});

describe('regression: Bug Scenario Reproduction', () => {
  it('should match the exact bug scenario from user report', () => {
    // Reproducing the exact state from the bug report:
    // - moderatorResumption.status: 'failed'
    // - waitingToStartStreaming: true
    // - isModeratorStreaming: true
    // - moderatorMessage exists with finishReason: 'stop'

    const bugScenarioMessages: UIMessage[] = [
      createTestUserMessage({
        content: 'AGI Alignment Hope Or Catastrophe',
        id: '01KE3DYA5V7GQ160ZF7CJEAJBY_r0_user',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'Participant 0 response about AGI...',
        finishReason: FinishReasons.STOP,
        id: '01KE3DYA5V7GQ160ZF7CJEAJBY_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'Participant 1 response about AGI...',
        finishReason: FinishReasons.STOP,
        id: '01KE3DYA5V7GQ160ZF7CJEAJBY_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }),
      createTestModeratorMessage({
        content: 'Moderator summary: Both participants discussed AGI...',
        finishReason: FinishReasons.STOP, // Key: moderator is complete
        id: '01KE3DYA5V7GQ160ZF7CJEAJBY_r0_moderator',
        roundNumber: 0,
      }),
    ];

    // State from bug report
    const bugState = {
      isModeratorStreaming: true,
      moderatorResumption: {
        moderatorMessageId: '01KE3DYA5V7GQ160ZF7CJEAJBY_r0_moderator',
        status: 'failed' as const,
        streamId: null,
      },
      resumptionRoundNumber: 0,
      waitingToStartStreaming: true,
    };

    // The fix logic should detect this and clear state
    const moderatorMessage = getModeratorMessageForRound(
      bugScenarioMessages,
      bugState.resumptionRoundNumber,
    );

    expect(moderatorMessage).toBeDefined();

    const metadata = moderatorMessage ? getModeratorMetadata(moderatorMessage.metadata) : undefined;
    const hasValidFinishReason = metadata?.finishReason
      && metadata.finishReason !== FinishReasons.UNKNOWN;

    // All conditions for recovery are met:
    expect(bugState.moderatorResumption.status).toBe('failed');
    expect(moderatorMessage).toBeDefined();
    expect(hasValidFinishReason).toBeTruthy();

    // Fix should clear these flags:
    // - clearStreamResumption()
    // - setWaitingToStartStreaming(false)
    // - setIsCreatingModerator(false)
  });
});
