/**
 * Flow State Machine Tests
 *
 * Tests for the chat flow state machine logic:
 * - State determination based on context
 * - Summary triggering conditions
 * - Participant completion detection
 * - State transition actions
 *
 * These tests verify that:
 * 1. Summary is only triggered after ALL participants complete
 * 2. State transitions are correct based on context
 * 3. Incomplete messages don't count as "responded"
 * 4. Guard conditions prevent premature summary
 */

import { describe, expect, it } from 'vitest';

import type { FlowState } from '@/api/core/enums';
import {
  FinishReasons,
  FlowStates,
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  ScreenModes,
} from '@/api/core/enums';

// ============================================================================
// EXTRACTED PURE FUNCTIONS FOR TESTING
// These mirror the logic in flow-state-machine.ts for unit testing
// ============================================================================

type FlowContext = {
  threadId: string | null;
  threadSlug: string | null;
  hasAiGeneratedTitle: boolean;
  currentRound: number;
  hasMessages: boolean;
  participantCount: number;
  allParticipantsResponded: boolean;
  summaryStatus: typeof MessageStatuses[keyof typeof MessageStatuses] | null;
  summaryExists: boolean;
  isAiSdkStreaming: boolean;
  isCreatingThread: boolean;
  isCreatingSummary: boolean;
  hasNavigated: boolean;
  screenMode: typeof ScreenModes[keyof typeof ScreenModes] | null;
};

/**
 * Pure function that determines flow state - mirrors flow-state-machine.ts
 */
function determineFlowState(context: FlowContext): FlowState {
  // Priority 1: Navigation complete
  if (context.hasNavigated) {
    return FlowStates.COMPLETE;
  }

  // Priority 2: Ready to navigate (summary done + title ready)
  if (
    context.screenMode === ScreenModes.OVERVIEW
    && context.summaryStatus === MessageStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return FlowStates.NAVIGATING;
  }

  // Priority 3: Summary streaming
  if (
    context.summaryStatus === MessageStatuses.STREAMING
    || (context.summaryExists && context.isAiSdkStreaming)
  ) {
    return FlowStates.STREAMING_SUMMARY;
  }

  // Priority 4: Creating summary (participants done, no summary yet)
  if (
    !context.isAiSdkStreaming
    && context.allParticipantsResponded
    && context.participantCount > 0
    && !context.summaryExists
    && !context.isCreatingSummary
  ) {
    return FlowStates.CREATING_SUMMARY;
  }

  // Priority 5: Participants streaming
  if (context.isAiSdkStreaming && !context.summaryExists) {
    return FlowStates.STREAMING_PARTICIPANTS;
  }

  // Priority 6: Thread creation
  if (context.isCreatingThread) {
    return FlowStates.CREATING_THREAD;
  }

  // Default: Idle
  return FlowStates.IDLE;
}

/**
 * Pure function that checks if all participants responded - mirrors flow-state-machine.ts
 */
function calculateAllParticipantsResponded(
  messages: Array<{
    role: string;
    metadata?: unknown;
    parts?: Array<{ type: string; text?: string }>;
  }>,
  participants: Array<{ id: string; isEnabled: boolean }>,
  currentRound: number,
): boolean {
  // Filter assistant messages for current round
  const participantMessagesInRound = messages.filter((m) => {
    if (m.role !== MessageRoles.ASSISTANT)
      return false;
    const metadata = m.metadata as { roundNumber?: number } | undefined;
    return metadata?.roundNumber === currentRound;
  });

  // Only count messages with actual content or finishReason
  const completedMessagesInRound = participantMessagesInRound.filter((m) => {
    // Check for streaming parts - don't count messages still streaming
    const hasStreamingParts = m.parts?.some(
      p => 'state' in p && p.state === 'streaming',
    ) ?? false;
    if (hasStreamingParts)
      return false;

    // Check for text content
    const hasTextContent = m.parts?.some(
      p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
    );
    if (hasTextContent)
      return true;

    // Check for finishReason - accept any (including 'unknown')
    const metadata = m.metadata as { finishReason?: string } | undefined;
    const finishReason = metadata?.finishReason;
    if (finishReason)
      return true;

    return false;
  });

  const enabledParticipants = participants.filter(p => p.isEnabled);
  return completedMessagesInRound.length >= enabledParticipants.length
    && enabledParticipants.length > 0;
}

// ============================================================================
// TEST HELPERS
// ============================================================================

function createDefaultContext(): FlowContext {
  return {
    threadId: 'thread-123',
    threadSlug: 'test-thread',
    hasAiGeneratedTitle: false,
    currentRound: 0,
    hasMessages: false,
    participantCount: 2,
    allParticipantsResponded: false,
    summaryStatus: null,
    summaryExists: false,
    isAiSdkStreaming: false,
    isCreatingThread: false,
    isCreatingSummary: false,
    hasNavigated: false,
    screenMode: ScreenModes.OVERVIEW,
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('flow State Machine - State Determination', () => {
  describe('idle State', () => {
    it('returns IDLE when no activity', () => {
      const context = createDefaultContext();
      expect(determineFlowState(context)).toBe(FlowStates.IDLE);
    });

    it('returns IDLE when thread exists but no streaming', () => {
      const context = createDefaultContext();
      context.threadId = 'thread-123';
      context.hasMessages = true;
      expect(determineFlowState(context)).toBe(FlowStates.IDLE);
    });
  });

  describe('creating Thread State', () => {
    it('returns CREATING_THREAD when isCreatingThread is true', () => {
      const context = createDefaultContext();
      context.isCreatingThread = true;
      expect(determineFlowState(context)).toBe(FlowStates.CREATING_THREAD);
    });

    it('prioritizes streaming over thread creation', () => {
      const context = createDefaultContext();
      context.isCreatingThread = true;
      context.isAiSdkStreaming = true;
      expect(determineFlowState(context)).toBe(FlowStates.STREAMING_PARTICIPANTS);
    });
  });

  describe('streaming Participants State', () => {
    it('returns STREAMING_PARTICIPANTS when AI SDK is streaming', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;
      context.threadId = 'thread-123';
      expect(determineFlowState(context)).toBe(FlowStates.STREAMING_PARTICIPANTS);
    });

    it('does NOT return STREAMING_PARTICIPANTS when summary exists', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;
      context.summaryExists = true;
      // Should be STREAMING_SUMMARY instead
      expect(determineFlowState(context)).toBe(FlowStates.STREAMING_SUMMARY);
    });
  });

  describe('creating Summary State', () => {
    it('returns CREATING_SUMMARY when all participants responded and no summary', () => {
      const context = createDefaultContext();
      context.allParticipantsResponded = true;
      context.participantCount = 2;
      context.summaryExists = false;
      context.isAiSdkStreaming = false;
      expect(determineFlowState(context)).toBe(FlowStates.CREATING_SUMMARY);
    });

    it('does NOT return CREATING_SUMMARY when still streaming', () => {
      const context = createDefaultContext();
      context.allParticipantsResponded = true;
      context.participantCount = 2;
      context.isAiSdkStreaming = true;
      expect(determineFlowState(context)).not.toBe(FlowStates.CREATING_SUMMARY);
    });

    it('does NOT return CREATING_SUMMARY when not all participants responded', () => {
      const context = createDefaultContext();
      context.allParticipantsResponded = false;
      context.participantCount = 2;
      context.isAiSdkStreaming = false;
      expect(determineFlowState(context)).not.toBe(FlowStates.CREATING_SUMMARY);
    });

    it('does NOT return CREATING_SUMMARY when summary already exists', () => {
      const context = createDefaultContext();
      context.allParticipantsResponded = true;
      context.participantCount = 2;
      context.summaryExists = true;
      context.isAiSdkStreaming = false;
      expect(determineFlowState(context)).not.toBe(FlowStates.CREATING_SUMMARY);
    });

    it('does NOT return CREATING_SUMMARY when no participants', () => {
      const context = createDefaultContext();
      context.allParticipantsResponded = false; // Can't be true with 0 participants
      context.participantCount = 0;
      context.isAiSdkStreaming = false;
      expect(determineFlowState(context)).not.toBe(FlowStates.CREATING_SUMMARY);
    });

    it('does NOT return CREATING_SUMMARY when already creating summary', () => {
      const context = createDefaultContext();
      context.allParticipantsResponded = true;
      context.participantCount = 2;
      context.isCreatingSummary = true;
      expect(determineFlowState(context)).not.toBe(FlowStates.CREATING_SUMMARY);
    });
  });

  describe('streaming Summary State', () => {
    it('returns STREAMING_SUMMARY when summary status is streaming', () => {
      const context = createDefaultContext();
      context.summaryStatus = MessageStatuses.STREAMING;
      expect(determineFlowState(context)).toBe(FlowStates.STREAMING_SUMMARY);
    });

    it('returns STREAMING_SUMMARY when summary exists and SDK streaming', () => {
      const context = createDefaultContext();
      context.summaryExists = true;
      context.isAiSdkStreaming = true;
      expect(determineFlowState(context)).toBe(FlowStates.STREAMING_SUMMARY);
    });
  });

  describe('navigating State', () => {
    it('returns NAVIGATING when summary complete and has AI title', () => {
      const context = createDefaultContext();
      context.screenMode = ScreenModes.OVERVIEW;
      context.summaryStatus = MessageStatuses.COMPLETE;
      context.hasAiGeneratedTitle = true;
      context.threadSlug = 'test-slug';
      expect(determineFlowState(context)).toBe(FlowStates.NAVIGATING);
    });

    it('does NOT navigate without AI-generated title', () => {
      const context = createDefaultContext();
      context.screenMode = ScreenModes.OVERVIEW;
      context.summaryStatus = MessageStatuses.COMPLETE;
      context.hasAiGeneratedTitle = false;
      context.threadSlug = 'test-slug';
      expect(determineFlowState(context)).not.toBe(FlowStates.NAVIGATING);
    });

    it('does NOT navigate on thread screen mode', () => {
      const context = createDefaultContext();
      context.screenMode = ScreenModes.THREAD;
      context.summaryStatus = MessageStatuses.COMPLETE;
      context.hasAiGeneratedTitle = true;
      context.threadSlug = 'test-slug';
      expect(determineFlowState(context)).not.toBe(FlowStates.NAVIGATING);
    });
  });

  describe('complete State', () => {
    it('returns COMPLETE when hasNavigated is true', () => {
      const context = createDefaultContext();
      context.hasNavigated = true;
      expect(determineFlowState(context)).toBe(FlowStates.COMPLETE);
    });

    it('cOMPLETE takes priority over all other states', () => {
      const context = createDefaultContext();
      context.hasNavigated = true;
      context.isAiSdkStreaming = true;
      context.isCreatingThread = true;
      context.allParticipantsResponded = true;
      expect(determineFlowState(context)).toBe(FlowStates.COMPLETE);
    });
  });
});

describe('participant Completion Detection', () => {
  const twoParticipants = [
    { id: 'p1', isEnabled: true },
    { id: 'p2', isEnabled: true },
  ];

  describe('no Messages', () => {
    it('returns false when no messages exist', () => {
      const result = calculateAllParticipantsResponded([], twoParticipants, 0);
      expect(result).toBe(false);
    });

    it('returns false when only user message exists', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(false);
    });
  });

  describe('partial Responses', () => {
    it('returns false when only one participant responded', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hi there!' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(false);
    });

    it('returns false when one message is empty (placeholder)', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hi!' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [] }, // Empty placeholder
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(false);
    });

    it('returns false when message has empty text', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hi!' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: '' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(false);
    });
  });

  describe('complete Responses', () => {
    it('returns true when all participants have text content', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 2' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(true);
    });

    it('returns true when message has finishReason even without text', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0, finishReason: FinishReasons.STOP }, parts: [] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(true);
    });

    it('dOES count messages with UNKNOWN finishReason (stream ended)', () => {
      // ✅ FIX: 'unknown' finishReason means stream ended (possibly abnormally)
      // For summarizer trigger purposes, we should accept any finishReason
      // The message has finished streaming, even if abnormally
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0, finishReason: FinishReasons.UNKNOWN }, parts: [] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(true); // 'unknown' counts as completed
    });

    it('does NOT count messages with streaming parts', () => {
      // ✅ CRITICAL: Messages with state:'streaming' parts are still in-flight
      // Do NOT count them as completed even if they have content
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0, finishReason: FinishReasons.UNKNOWN }, parts: [{ type: MessagePartTypes.TEXT, text: 'Partial', state: 'streaming' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(false); // streaming parts = not complete
    });
  });

  describe('round-Specific Counting', () => {
    it('only counts messages from the current round', () => {
      const messages = [
        // Round 0 messages
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'R0 P1' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'R0 P2' }] },
        // Round 1 messages - only one participant
        { role: MessageRoles.USER, metadata: { roundNumber: 1 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Follow up' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1 }, parts: [{ type: MessagePartTypes.TEXT, text: 'R1 P1' }] },
      ];

      // Round 0 should be complete
      expect(calculateAllParticipantsResponded(messages, twoParticipants, 0)).toBe(true);
      // Round 1 should NOT be complete
      expect(calculateAllParticipantsResponded(messages, twoParticipants, 1)).toBe(false);
    });

    it('ignores messages without roundNumber metadata', () => {
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }] },
        { role: MessageRoles.ASSISTANT, metadata: {}, parts: [{ type: MessagePartTypes.TEXT, text: 'No round' }] }, // No roundNumber
      ];
      const result = calculateAllParticipantsResponded(messages, twoParticipants, 0);
      expect(result).toBe(false);
    });
  });

  describe('participant Configuration', () => {
    it('returns false when no enabled participants', () => {
      const disabledParticipants = [
        { id: 'p1', isEnabled: false },
        { id: 'p2', isEnabled: false },
      ];
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, disabledParticipants, 0);
      expect(result).toBe(false);
    });

    it('only counts enabled participants', () => {
      const mixedParticipants = [
        { id: 'p1', isEnabled: true },
        { id: 'p2', isEnabled: false }, // Disabled
        { id: 'p3', isEnabled: true },
      ];
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response 2' }] },
      ];
      // Should be true because only 2 enabled participants and we have 2 responses
      const result = calculateAllParticipantsResponded(messages, mixedParticipants, 0);
      expect(result).toBe(true);
    });

    it('handles single participant correctly', () => {
      const oneParticipant = [{ id: 'p1', isEnabled: true }];
      const messages = [
        { role: MessageRoles.USER, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }] },
        { role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 }, parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }] },
      ];
      const result = calculateAllParticipantsResponded(messages, oneParticipant, 0);
      expect(result).toBe(true);
    });
  });
});

describe('summary Triggering Guard Conditions', () => {
  describe('full Flow Integration', () => {
    it('prevents summary when first participant still streaming', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;
      context.participantCount = 2;
      context.allParticipantsResponded = false;

      const state = determineFlowState(context);
      expect(state).toBe(FlowStates.STREAMING_PARTICIPANTS);
      expect(state).not.toBe(FlowStates.CREATING_SUMMARY);
    });

    it('prevents summary when second participant has not started', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;
      context.participantCount = 2;
      // First participant done, second hasn't even started
      context.allParticipantsResponded = false;

      const state = determineFlowState(context);
      expect(state).toBe(FlowStates.STREAMING_PARTICIPANTS);
    });

    it('allows summary only after ALL participants complete', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = false;
      context.participantCount = 2;
      context.allParticipantsResponded = true;
      context.summaryExists = false;

      const state = determineFlowState(context);
      expect(state).toBe(FlowStates.CREATING_SUMMARY);
    });

    it('transitions to STREAMING_SUMMARY after summary created', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;
      context.participantCount = 2;
      context.allParticipantsResponded = true;
      context.summaryExists = true;

      const state = determineFlowState(context);
      expect(state).toBe(FlowStates.STREAMING_SUMMARY);
    });
  });

  describe('edge Cases', () => {
    it('handles rapid refresh during participant transition', () => {
      // Simulate page refresh between participant 0 finish and participant 1 start
      const context = createDefaultContext();
      context.isAiSdkStreaming = false; // SDK not streaming (after refresh)
      context.participantCount = 2;
      context.allParticipantsResponded = false; // Only 1 message exists
      context.summaryExists = false;

      const state = determineFlowState(context);
      // Should stay IDLE, not jump to CREATING_SUMMARY
      expect(state).toBe(FlowStates.IDLE);
    });

    it('handles empty participant list gracefully', () => {
      const context = createDefaultContext();
      context.participantCount = 0;
      context.allParticipantsResponded = false;
      context.isAiSdkStreaming = false;

      const state = determineFlowState(context);
      expect(state).toBe(FlowStates.IDLE);
      expect(state).not.toBe(FlowStates.CREATING_SUMMARY);
    });

    it('prevents double summary creation', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = false;
      context.participantCount = 2;
      context.allParticipantsResponded = true;
      context.isCreatingSummary = true; // Already creating

      const state = determineFlowState(context);
      // Should NOT return CREATING_SUMMARY when already creating
      expect(state).not.toBe(FlowStates.CREATING_SUMMARY);
    });
  });
});

describe('state Priority', () => {
  it('cOMPLETE has highest priority', () => {
    const context = createDefaultContext();
    context.hasNavigated = true;
    // Set all other conditions that would trigger different states
    context.isAiSdkStreaming = true;
    context.isCreatingThread = true;
    context.allParticipantsResponded = true;
    context.summaryStatus = MessageStatuses.STREAMING;

    expect(determineFlowState(context)).toBe(FlowStates.COMPLETE);
  });

  it('nAVIGATING takes precedence over STREAMING_SUMMARY', () => {
    const context = createDefaultContext();
    context.screenMode = ScreenModes.OVERVIEW;
    context.summaryStatus = MessageStatuses.COMPLETE;
    context.hasAiGeneratedTitle = true;
    context.threadSlug = 'test-slug';
    context.isAiSdkStreaming = true;

    expect(determineFlowState(context)).toBe(FlowStates.NAVIGATING);
  });

  it('sTREAMING_ANALYSIS takes precedence over CREATING_SUMMARY', () => {
    const context = createDefaultContext();
    context.summaryStatus = MessageStatuses.STREAMING;
    context.allParticipantsResponded = true;
    context.participantCount = 2;

    expect(determineFlowState(context)).toBe(FlowStates.STREAMING_SUMMARY);
  });

  it('cREATING_ANALYSIS takes precedence over STREAMING_PARTICIPANTS when streaming stopped', () => {
    const context = createDefaultContext();
    context.isAiSdkStreaming = false;
    context.allParticipantsResponded = true;
    context.participantCount = 2;
    context.summaryExists = false;

    expect(determineFlowState(context)).toBe(FlowStates.CREATING_SUMMARY);
  });

  it('sTREAMING_PARTICIPANTS takes precedence over CREATING_THREAD', () => {
    const context = createDefaultContext();
    context.isAiSdkStreaming = true;
    context.isCreatingThread = true;

    expect(determineFlowState(context)).toBe(FlowStates.STREAMING_PARTICIPANTS);
  });
});
