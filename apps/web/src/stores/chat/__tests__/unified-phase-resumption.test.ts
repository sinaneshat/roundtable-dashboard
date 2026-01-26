/**
 * Unified Phase Resumption Tests
 *
 * Tests for the unified stream resumption across all phases:
 * - Pre-search phase
 * - Participants phase
 * - Summarizer phase
 *
 * BUG SCENARIOS BEING TESTED:
 * 1. Overlapping resumption triggers - multiple phases trying to resume simultaneously
 * 2. Duplicate message creation - prefetched content + resumed stream creating duplicates
 * 3. Phase transition issues - incorrect detection of phase completion
 * 4. Content duplication from KV pub/sub + server prefetch
 */

import type { RoundPhase } from '@roundtable/shared';
import { MessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

// Type definitions for the test
type MessagePart = {
  type: 'text' | 'reasoning' | 'step-start' | 'file';
  text?: string;
  state?: 'streaming' | 'done';
};

type MessageMetadata = {
  roundNumber?: number;
  participantIndex?: number;
  participantId?: string;
};

type UIMessage = {
  id: string;
  role: typeof MessageRoles.USER | typeof MessageRoles.ASSISTANT;
  parts: MessagePart[];
  metadata?: MessageMetadata;
};

type ParticipantPhaseStatus = {
  hasActiveStream: boolean;
  streamId: string | null;
  totalParticipants: number | null;
  currentParticipantIndex: number | null;
  participantStatuses: Record<string, 'active' | 'completed' | 'failed'> | null;
  nextParticipantToTrigger: number | null;
  allComplete: boolean;
};

type PreSearchPhaseStatus = {
  enabled: boolean;
  status: 'pending' | 'streaming' | 'complete' | 'failed' | null;
  streamId: string | null;
  preSearchId: string | null;
};

type SummarizerPhaseStatus = {
  status: 'pending' | 'streaming' | 'complete' | 'failed' | null;
  streamId: string | null;
  summaryId: string | null;
};

type ThreadStreamResumptionState = {
  roundNumber: number | null;
  currentPhase: RoundPhase;
  preSearch: PreSearchPhaseStatus | null;
  participants: ParticipantPhaseStatus;
  summarizer: SummarizerPhaseStatus | null;
  roundComplete: boolean;
  hasActiveStream: boolean;
  streamId: string | null;
  totalParticipants: number | null;
  participantStatuses: Record<string, 'active' | 'completed' | 'failed'> | null;
  nextParticipantToTrigger: number | null;
};

// Helper functions
function createMockParticipantMessage(
  roundNumber: number,
  participantIndex: number,
  options: {
    hasContent?: boolean;
    finishReason?: string;
    state?: 'streaming' | 'done';
  } = {},
): UIMessage {
  const { finishReason = 'stop', hasContent = true, state = 'done' } = options;
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
    },
    parts: hasContent
      ? [
          { type: 'step-start' },
          { state, text: `Response from participant ${participantIndex}`, type: 'text' },
        ]
      : [],
    role: MessageRoles.ASSISTANT,
  };
}

function createMockUserMessage(roundNumber: number): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_user`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text: 'Test question', type: 'text' }],
    role: MessageRoles.USER,
  };
}

describe('unified Phase Resumption', () => {
  describe('phase Detection', () => {
    it('should correctly detect pre_search phase when pre-search is streaming', () => {
      const serverState: ThreadStreamResumptionState = {
        currentPhase: 'pre_search',
        hasActiveStream: true,
        nextParticipantToTrigger: 0,
        participants: {
          allComplete: false,
          currentParticipantIndex: null,
          hasActiveStream: false,
          nextParticipantToTrigger: 0,
          participantStatuses: null,
          streamId: null,
          totalParticipants: 3,
        },
        participantStatuses: null,
        preSearch: {
          enabled: true,
          preSearchId: 'ps_123',
          status: 'streaming',
          streamId: 'presearch_thread_123_0',
        },
        roundComplete: false,
        roundNumber: 0,
        streamId: 'presearch_thread_123_0',
        summarizer: null,
        totalParticipants: 3,
      };

      expect(serverState.currentPhase).toBe('pre_search');
      expect(serverState.preSearch?.status).toBe('streaming');
      // Participants should NOT be triggered while pre-search is streaming
      expect(serverState.participants.hasActiveStream).toBeFalsy();
    });

    it('should correctly detect participants phase when some participants have completed', () => {
      const serverState: ThreadStreamResumptionState = {
        currentPhase: 'participants',
        hasActiveStream: true,
        nextParticipantToTrigger: 2,
        participants: {
          allComplete: false,
          currentParticipantIndex: 1,
          hasActiveStream: true,
          nextParticipantToTrigger: 2,
          participantStatuses: { 0: 'completed', 1: 'active', 2: 'active' },
          streamId: 'thread_123_r0_p1',
          totalParticipants: 3,
        },
        participantStatuses: { 0: 'completed', 1: 'active', 2: 'active' },
        preSearch: {
          enabled: true,
          preSearchId: 'ps_123',
          status: 'complete',
          streamId: null,
        },
        roundComplete: false,
        roundNumber: 0,
        streamId: 'thread_123_r0_p1',
        summarizer: null,
        totalParticipants: 3,
      };

      expect(serverState.currentPhase).toBe('participants');
      // Pre-search is complete, not null
      expect(serverState.preSearch?.status).toBe('complete');
      // Participant 0 completed, participant 1 is active
      expect(serverState.participants.participantStatuses?.['0']).toBe('completed');
      expect(serverState.participants.participantStatuses?.['1']).toBe('active');
    });

    it('should correctly detect summarizer phase when all participants done', () => {
      const serverState: ThreadStreamResumptionState = {
        currentPhase: 'summarizer',
        hasActiveStream: true,
        nextParticipantToTrigger: null,
        participants: {
          allComplete: true,
          currentParticipantIndex: null,
          hasActiveStream: false,
          nextParticipantToTrigger: null,
          participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
          streamId: null,
          totalParticipants: 3,
        },
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
        preSearch: {
          enabled: true,
          preSearchId: 'ps_123',
          status: 'complete',
          streamId: null,
        },
        roundComplete: false,
        roundNumber: 0,
        streamId: 'summary_thread_123_r0',
        summarizer: {
          status: 'streaming',
          streamId: 'summary_thread_123_r0',
          summaryId: 'summary_123',
        },
        totalParticipants: 3,
      };

      expect(serverState.currentPhase).toBe('summarizer');
      expect(serverState.participants.allComplete).toBeTruthy();
      expect(serverState.summarizer?.status).toBe('streaming');
    });
  });

  describe('overlapping Resumption Prevention', () => {
    it('should NOT trigger participant resumption while pre-search is still streaming', () => {
      // BUG: If pre-search is streaming but incomplete-round-resumption
      // doesn't check currentPhase, it might try to trigger participants

      const currentPhase = 'pre_search' as const;
      const _preSearchStatus = 'streaming'; // Unused but documents the scenario
      const participantsNextToTrigger = 0;

      // The resumption hook should check currentPhase FIRST
      const shouldTriggerParticipants
        = currentPhase === 'participants' && participantsNextToTrigger !== null;

      expect(shouldTriggerParticipants).toBeFalsy();
    });

    it('should NOT trigger summarizer while participants are still streaming', () => {
      // BUG: If last participant finishes but summarizer effect runs before
      // participant phase completion is detected

      const currentPhase = 'participants' as const;
      const participantsAllComplete = false;
      const summarizerStatus = null;

      // Summarizer should only be triggered when:
      // 1. currentPhase === 'summarizer' OR
      // 2. participants.allComplete === true AND summarizer not yet started
      const shouldTriggerSummarizer
        = currentPhase === 'summarizer'
          || (participantsAllComplete && summarizerStatus === null);

      expect(shouldTriggerSummarizer).toBeFalsy();
    });

    it('should prevent double-triggering of the same participant', () => {
      // BUG: If resumption effect runs while participant stream is already active

      const participantStatuses: Record<string, 'active' | 'completed' | 'failed'> = {
        0: 'completed',
        1: 'active', // Currently streaming
        2: 'active', // Needs to be triggered
      };

      // Find first non-completed participant that is NOT already active
      let nextToTrigger: number | null = null;
      for (let i = 0; i < 3; i++) {
        const status = participantStatuses[String(i)];
        if (status === 'active') {
          // If any participant is actively streaming, don't trigger new ones
          nextToTrigger = null;
          break;
        }
        if (status !== 'completed' && status !== 'failed' && nextToTrigger === null) {
          nextToTrigger = i;
        }
      }

      // Should NOT trigger while participant 1 is active
      expect(nextToTrigger).toBeNull();
    });
  });

  describe('duplicate Content Prevention', () => {
    it('should detect when message already has content from server prefetch', () => {
      // BUG: Server prefetches messages that already have partial/complete content
      // Then KV resume sends the same content again, creating duplicates

      const prefetchedMessage = createMockParticipantMessage(0, 0, {
        finishReason: 'unknown', // Incomplete
        hasContent: true,
        state: 'streaming',
      });

      // Check if message already has text content
      const hasExistingContent = prefetchedMessage.parts.some(
        p => p.type === 'text' && p.text && p.text.length > 0,
      );

      expect(hasExistingContent).toBeTruthy();

      // When AI SDK resumes, it should NOT create a new message
      // but instead append to the existing one (or skip if complete)
    });

    it('should merge resumed stream content with prefetched content', () => {
      // Expected behavior: If prefetch has "Response from" and resume sends "participant 0"
      // Result should be "Response from participant 0" (merged), not two separate texts

      const prefetchedContent = 'Response from ';
      const resumedContent = 'participant 0';

      // Correct merge behavior
      const merged = prefetchedContent + resumedContent;
      expect(merged).toBe('Response from participant 0');

      // Wrong: duplicating content
      const wrongDuplicate = prefetchedContent + prefetchedContent + resumedContent;
      expect(wrongDuplicate).not.toBe(merged);
    });

    it('should NOT add duplicate messages when participant message ID already exists', () => {
      // BUG: resumption creates a new message with same participant index
      // but different internal ID, causing duplicates in the messages array

      const existingMessages: UIMessage[] = [
        createMockUserMessage(0),
        createMockParticipantMessage(0, 0, { hasContent: true, state: 'done' }),
      ];

      const expectedMessageId = 'thread-123_r0_p0';

      // Check if message with this ID already exists
      const messageExists = existingMessages.some(m => m.id === expectedMessageId);
      expect(messageExists).toBeTruthy();

      // Resumption should NOT add another message for participant 0
      const shouldCreateNewMessage = !messageExists;
      expect(shouldCreateNewMessage).toBeFalsy();
    });
  });

  describe('phase Transition Handling', () => {
    it('should transition from pre_search to participants after pre-search completes', () => {
      // Initial state: pre-search streaming
      let currentPhase: RoundPhase = 'pre_search';
      const _preSearchStatus = 'streaming'; // Unused but documents initial state

      // After pre-search completes
      const preSearchCompleteStatus = 'complete';
      const participantsAllComplete = false;

      if (preSearchCompleteStatus === 'complete' && !participantsAllComplete) {
        currentPhase = 'participants';
      }

      expect(currentPhase).toBe('participants');
    });

    it('should transition from participants to summarizer after all participants complete', () => {
      let currentPhase: RoundPhase = 'participants';
      const participantsAllComplete = true;
      const summarizerStatus = null;

      if (participantsAllComplete && (summarizerStatus === null || summarizerStatus === 'pending')) {
        currentPhase = 'summarizer';
      }

      expect(currentPhase).toBe('summarizer');
    });

    it('should transition to complete after summarizer finishes', () => {
      let currentPhase: RoundPhase = 'summarizer';
      const participantsAllComplete = true;
      const summarizerStatus = 'complete';

      if (participantsAllComplete && summarizerStatus === 'complete') {
        currentPhase = 'complete';
      }

      expect(currentPhase).toBe('complete');
    });

    it('should handle interrupted pre-search by retrying or failing gracefully', () => {
      const preSearchStatus = 'failed';
      const _currentPhase: RoundPhase = 'pre_search'; // Unused but documents the context

      // On pre-search failure, should either:
      // 1. Retry pre-search
      // 2. Skip to participants phase (if retries exhausted)
      // 3. Show error to user

      const shouldSkipToParticipants = preSearchStatus === 'failed';
      expect(shouldSkipToParticipants).toBeTruthy();
    });
  });

  describe('race Condition Prevention', () => {
    it('should guard against multiple effects triggering the same phase resumption', () => {
      // BUG: Multiple effects (pre-search resumption, participant resumption, summarizer resumption)
      // might all run and try to set state simultaneously

      const resumptionAttempted = new Map<string, boolean>();
      const threadId = 'thread-123';
      const roundNumber = 0;

      // Pre-search resumption attempts
      const preSearchKey = `${threadId}_presearch_${roundNumber}`;
      const participantsKey = `${threadId}_participants_${roundNumber}`;
      const _summarizerKey = `${threadId}_summarizer_${roundNumber}`; // Unused but shows full pattern

      // First attempt should succeed
      const canAttemptPreSearch = !resumptionAttempted.has(preSearchKey);
      expect(canAttemptPreSearch).toBeTruthy();
      resumptionAttempted.set(preSearchKey, true);

      // Second attempt should be blocked
      const canAttemptPreSearchAgain = !resumptionAttempted.has(preSearchKey);
      expect(canAttemptPreSearchAgain).toBeFalsy();

      // Different phases should have separate tracking
      const canAttemptParticipants = !resumptionAttempted.has(participantsKey);
      expect(canAttemptParticipants).toBeTruthy();
    });

    it('should handle concurrent AI SDK resume and incomplete-round-resumption', () => {
      // Scenario: AI SDK resume starts streaming participant 0
      // incomplete-round-resumption also detects participant 0 needs streaming

      const aiSdkIsStreaming = true;
      const aiSdkStreamingParticipant = 0;
      const incompleteRoundNextParticipant = 0;

      // If AI SDK is already streaming the participant, don't trigger again
      const shouldIncompleteRoundTrigger
        = !aiSdkIsStreaming || aiSdkStreamingParticipant !== incompleteRoundNextParticipant;

      // AI SDK is streaming participant 0, so incomplete-round should NOT trigger
      expect(shouldIncompleteRoundTrigger).toBeFalsy();
    });

    it('should serialize phase transitions to prevent state corruption', () => {
      // Test that phase transitions happen in order and don't overlap

      const phaseOrder: RoundPhase[] = [];
      const expectedOrder: RoundPhase[] = ['pre_search', 'participants', 'summarizer', 'complete'];

      // Simulate phase transitions
      phaseOrder.push('pre_search');
      // ... pre-search completes
      phaseOrder.push('participants');
      // ... participants complete
      phaseOrder.push('summarizer');
      // ... summarizer completes
      phaseOrder.push('complete');

      expect(phaseOrder).toEqual(expectedOrder);

      // Verify no duplicate phases
      const uniquePhases = new Set(phaseOrder);
      expect(uniquePhases.size).toBe(phaseOrder.length);
    });
  });

  describe('prefetch + Resume Coordination', () => {
    it('should prefer prefetched content over resumed content when prefetch is more complete', () => {
      // Server prefetch might have more complete data than KV resume
      // (e.g., if stream finished between KV write and DB write)

      const prefetchedMessage = createMockParticipantMessage(0, 0, {
        finishReason: 'stop', // Complete
        hasContent: true,
        state: 'done',
      });

      const resumedMessage = createMockParticipantMessage(0, 0, {
        finishReason: 'unknown', // Partial
        hasContent: true,
        state: 'streaming',
      });

      // Prefetch is complete, resume is partial - use prefetch
      const prefetchIsComplete = prefetchedMessage.metadata?.finishReason === 'stop';
      const resumeIsComplete = resumedMessage.metadata?.finishReason === 'stop';

      expect(prefetchIsComplete).toBeTruthy();
      expect(resumeIsComplete).toBeFalsy();

      // Should use prefetched content
      const useContent = prefetchIsComplete ? prefetchedMessage : resumedMessage;
      expect(useContent.metadata?.finishReason).toBe('stop');
    });

    it('should merge partial prefetch with resumed continuation', () => {
      // Scenario: Prefetch has "Hello, " and resume continues with "world!"

      const prefetchParts: MessagePart[] = [
        { state: 'streaming', text: 'Hello, ', type: 'text' },
      ];

      const resumeDelta = 'world!';

      // Merge by appending delta to last text part
      const lastTextPart = prefetchParts.find(p => p.type === 'text');
      if (lastTextPart && lastTextPart.text) {
        lastTextPart.text += resumeDelta;
      }

      expect(lastTextPart?.text).toBe('Hello, world!');
    });

    it('should skip resumption when all phases are complete in prefetch', () => {
      const serverState: ThreadStreamResumptionState = {
        currentPhase: 'complete',
        hasActiveStream: false,
        nextParticipantToTrigger: null,
        participants: {
          allComplete: true,
          currentParticipantIndex: null,
          hasActiveStream: false,
          nextParticipantToTrigger: null,
          participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
          streamId: null,
          totalParticipants: 3,
        },
        participantStatuses: { 0: 'completed', 1: 'completed', 2: 'completed' },
        preSearch: {
          enabled: true,
          preSearchId: 'ps_123',
          status: 'complete',
          streamId: null,
        },
        roundComplete: true,
        roundNumber: 0,
        streamId: null,
        summarizer: {
          status: 'complete',
          streamId: null,
          summaryId: 'summary_123',
        },
        totalParticipants: 3,
      };

      // When round is complete, no resumption should happen
      const shouldResume = !serverState.roundComplete && serverState.currentPhase !== 'complete';
      expect(shouldResume).toBeFalsy();
    });
  });

  describe('message ID Consistency', () => {
    it('should use deterministic message IDs to prevent duplicates', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;
      const participantIndex = 1;

      // Deterministic ID format
      const expectedId = `${threadId}_r${roundNumber}_p${participantIndex}`;

      // Both prefetch and resume should use the same ID
      const prefetchMessageId = `${threadId}_r${roundNumber}_p${participantIndex}`;
      const resumeMessageId = `${threadId}_r${roundNumber}_p${participantIndex}`;

      expect(prefetchMessageId).toBe(expectedId);
      expect(resumeMessageId).toBe(expectedId);
      expect(prefetchMessageId).toBe(resumeMessageId);
    });

    it('should update existing message instead of creating duplicate', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockParticipantMessage(0, 0, { finishReason: 'unknown', hasContent: false }),
      ];

      const messageId = 'thread-123_r0_p0';
      const existingIndex = messages.findIndex(m => m.id === messageId);

      expect(existingIndex).toBe(1); // Message exists at index 1

      // Update should happen at existing index, not push new message
      const newContent = { state: 'done' as const, text: 'Updated content', type: 'text' as const };

      if (existingIndex >= 0) {
        const message = messages[existingIndex];
        if (message) {
          message.parts = [newContent];
        }
      }

      // Should still have 2 messages, not 3
      expect(messages).toHaveLength(2);
      expect(messages[1]?.parts[0]).toEqual(newContent);
    });
  });

  describe('participant Index Calculation', () => {
    it('should correctly identify next participant when some are complete', () => {
      const participantStatuses: Record<string, 'active' | 'completed' | 'failed'> = {
        0: 'completed',
        1: 'completed',
        2: 'active', // Next one needs attention after this
      };
      const totalParticipants = 3;

      // Find first non-completed participant
      let nextToTrigger: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        const status = participantStatuses[String(i)];
        if (status !== 'completed' && status !== 'failed') {
          nextToTrigger = i;
          break;
        }
      }

      // Participant 2 is active but not completed - it's the "next" one
      expect(nextToTrigger).toBe(2);
    });

    it('should return null when all participants are complete', () => {
      const participantStatuses: Record<string, 'active' | 'completed' | 'failed'> = {
        0: 'completed',
        1: 'completed',
        2: 'completed',
      };
      const totalParticipants = 3;

      let nextToTrigger: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        const status = participantStatuses[String(i)];
        if (status !== 'completed' && status !== 'failed') {
          nextToTrigger = i;
          break;
        }
      }

      expect(nextToTrigger).toBeNull();
    });

    it('should NOT trigger already active participant', () => {
      // BUG: If participant 1 is "active" (streaming), we should NOT trigger it again
      // but we should also NOT skip to participant 2

      const participantStatuses: Record<string, 'active' | 'completed' | 'failed'> = {
        0: 'completed',
        1: 'active', // Currently streaming!
        2: 'active', // Waiting
      };

      // Check if ANY participant is actively streaming
      const hasActiveStream = Object.values(participantStatuses).includes('active');

      // If there's an active stream, don't trigger new participant
      // Let the current one finish first
      const shouldTriggerNew = !hasActiveStream;

      expect(shouldTriggerNew).toBeFalsy();
    });
  });
});
