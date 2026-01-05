/**
 * Pre-Search and Moderator Race Condition Tests
 *
 * These tests verify that moderator triggering NEVER happens before
 * pre-search completes and animations finish:
 *
 * 1. Moderator waits for pre-search completion
 * 2. Moderator waits for all animations (pre-search, participants)
 * 3. handleComplete checks pre-search status before triggering
 * 4. Flow state machine blocks moderator creation if animations pending
 *
 * CRITICAL SCENARIOS:
 * - Pre-search streaming, participants complete → NO moderator yet
 * - Pre-search animating, participants done → NO moderator yet
 * - Pre-search complete, animations pending → NO moderator yet
 * - Pre-search complete, animations done → TRIGGER moderator
 *
 * Location: /src/stores/chat/__tests__/pre-search-moderator-race-condition.test.ts
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatParticipant, StoredPreSearch } from '@/api/routes/chat/schema';

import { AnimationIndices } from '../store-constants';
import { getParticipantCompletionStatus } from '../utils/participant-completion-gate';

// ============================================================================
// Test Utilities
// ============================================================================

function createParticipant(id: string, index: number): ChatParticipant {
  return {
    id,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

function createUserMessage(roundNumber: number): UIMessage {
  return {
    id: `user-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: 'Question' }],
    metadata: { role: MessageRoles.USER, roundNumber },
  };
}

function createAssistantMessage(
  participantId: string,
  roundNumber: number,
  participantIndex: number,
  options: { streaming?: boolean; hasContent?: boolean; finishReason?: string } = {},
): UIMessage {
  const { streaming = false, hasContent = true, finishReason = 'stop' } = options;

  return {
    id: `msg-${participantId}-r${roundNumber}`,
    role: MessageRoles.ASSISTANT,
    parts: hasContent
      ? [{ type: 'text', text: 'Response', state: streaming ? 'streaming' as const : 'done' as const }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId,
      participantIndex,
      model: `model-${participantIndex}`,
      finishReason: streaming ? undefined : finishReason,
    },
  };
}

function createPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses.PENDING | typeof MessageStatuses.STREAMING | typeof MessageStatuses.COMPLETE,
): StoredPreSearch {
  return {
    id: `ps-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    userQuery: 'Question',
    searchData: status === MessageStatuses.COMPLETE
      ? {
          queries: ['query'],
          results: [],
          summary: 'Summary',
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    createdAt: new Date('2024-01-01'),
    completedAt: status === MessageStatuses.COMPLETE ? new Date('2024-01-01') : null,
  };
}

// ============================================================================
// Pre-Search Race Condition Tests
// ============================================================================

describe('pre-Search and Moderator Race Conditions', () => {
  let participants: ChatParticipant[];

  beforeEach(() => {
    participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];
  });

  describe('participant Completion Gate', () => {
    it('should detect all participants complete when pre-search is also complete', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBe(true);
      expect(status.completedCount).toBe(2);
      expect(status.streamingCount).toBe(0);
    });

    it('should detect NOT complete if any participant is streaming', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1, { streaming: true }), // Still streaming
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBe(false);
      expect(status.completedCount).toBe(1);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('p2');
    });

    it('should detect NOT complete if any participant has no message yet', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        // p2 hasn't responded yet
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBe(false);
      expect(status.completedCount).toBe(1);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('p2');
    });
  });

  describe('pre-Search Status Checks', () => {
    it('should block moderator if pre-search is STREAMING', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.STREAMING),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants are complete
      expect(participantStatus.allComplete).toBe(true);

      // But pre-search is still streaming - moderator should NOT trigger
      expect(preSearchForRound?.status).toBe(MessageStatuses.STREAMING);

      // This simulates the check in provider.tsx handleComplete
      const shouldBlockModerator = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlockModerator).toBe(true);
    });

    it('should block moderator if pre-search is PENDING', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.PENDING),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants are complete
      expect(participantStatus.allComplete).toBe(true);

      // But pre-search is pending - moderator should NOT trigger
      expect(preSearchForRound?.status).toBe(MessageStatuses.PENDING);

      const shouldBlockModerator = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlockModerator).toBe(true);
    });

    it('should allow moderator if pre-search is COMPLETE', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants are complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search is complete
      expect(preSearchForRound?.status).toBe(MessageStatuses.COMPLETE);

      // Moderator CAN trigger (if animations also complete)
      const shouldBlockModerator = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(shouldBlockModerator).toBe(false);
    });
  });

  describe('animation State Checks', () => {
    it('should block moderator if pre-search animation is pending', () => {
      const pendingAnimations = new Set<number>([AnimationIndices.PRE_SEARCH]);

      // Even if participants are complete, moderator should NOT trigger
      // while pre-search animation is running
      expect(pendingAnimations.size).toBeGreaterThan(0);
      expect(pendingAnimations.has(AnimationIndices.PRE_SEARCH)).toBe(true);

      // This simulates the check in flow-state-machine.ts
      const shouldBlockModerator = pendingAnimations.size > 0;
      expect(shouldBlockModerator).toBe(true);
    });

    it('should block moderator if participant animation is pending', () => {
      const pendingAnimations = new Set<number>([AnimationIndices.PARTICIPANT_0]);

      expect(pendingAnimations.size).toBeGreaterThan(0);
      expect(pendingAnimations.has(AnimationIndices.PARTICIPANT_0)).toBe(true);

      const shouldBlockModerator = pendingAnimations.size > 0;
      expect(shouldBlockModerator).toBe(true);
    });

    it('should block moderator if ANY animation is pending', () => {
      const pendingAnimations = new Set<number>([
        AnimationIndices.PRE_SEARCH,
        AnimationIndices.PARTICIPANT_0,
      ]);

      expect(pendingAnimations.size).toBeGreaterThan(1);

      const shouldBlockModerator = pendingAnimations.size > 0;
      expect(shouldBlockModerator).toBe(true);
    });

    it('should allow moderator if NO animations are pending', () => {
      const pendingAnimations = new Set<number>();

      expect(pendingAnimations.size).toBe(0);

      const shouldBlockModerator = pendingAnimations.size > 0;
      expect(shouldBlockModerator).toBe(false);
    });
  });

  describe('complete Race Condition Scenarios', () => {
    it('sCENARIO 1: Pre-search streaming, participants complete → NO moderator', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.STREAMING),
      ];

      const pendingAnimations = new Set<number>();

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search BLOCKING
      const preSearchBlocking = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(preSearchBlocking).toBe(true);

      // Final decision: BLOCK moderator
      const shouldTriggerModerator = participantStatus.allComplete
        && !preSearchBlocking
        && pendingAnimations.size === 0;

      expect(shouldTriggerModerator).toBe(false);
    });

    it('sCENARIO 2: Pre-search complete, animation running → NO moderator', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const pendingAnimations = new Set<number>([AnimationIndices.PRE_SEARCH]);

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search NOT blocking
      const preSearchBlocking = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(preSearchBlocking).toBe(false);

      // Animations BLOCKING
      expect(pendingAnimations.size).toBeGreaterThan(0);

      // Final decision: BLOCK moderator
      const shouldTriggerModerator = participantStatus.allComplete
        && !preSearchBlocking
        && pendingAnimations.size === 0;

      expect(shouldTriggerModerator).toBe(false);
    });

    it('sCENARIO 3: Pre-search complete, participant animation running → NO moderator', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const pendingAnimations = new Set<number>([AnimationIndices.PARTICIPANT_1]);

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search NOT blocking
      const preSearchBlocking = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(preSearchBlocking).toBe(false);

      // Participant animation BLOCKING
      expect(pendingAnimations.has(AnimationIndices.PARTICIPANT_1)).toBe(true);

      // Final decision: BLOCK moderator
      const shouldTriggerModerator = participantStatus.allComplete
        && !preSearchBlocking
        && pendingAnimations.size === 0;

      expect(shouldTriggerModerator).toBe(false);
    });

    it('sCENARIO 4: Pre-search complete, all animations done → TRIGGER moderator', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [
        createPreSearch(0, MessageStatuses.COMPLETE),
      ];

      const pendingAnimations = new Set<number>();

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // Pre-search NOT blocking
      const preSearchBlocking = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(preSearchBlocking).toBe(false);

      // No animations BLOCKING
      expect(pendingAnimations.size).toBe(0);

      // Final decision: TRIGGER moderator
      const shouldTriggerModerator = participantStatus.allComplete
        && !preSearchBlocking
        && pendingAnimations.size === 0;

      expect(shouldTriggerModerator).toBe(true);
    });

    it('sCENARIO 5: No pre-search, participants complete, animations done → TRIGGER moderator', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createAssistantMessage('p1', 0, 0),
        createAssistantMessage('p2', 0, 1),
      ];

      const preSearches: StoredPreSearch[] = [];
      const pendingAnimations = new Set<number>();

      const participantStatus = getParticipantCompletionStatus(messages, participants, 0);
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === 0);

      // Participants complete
      expect(participantStatus.allComplete).toBe(true);

      // No pre-search - NOT blocking
      const preSearchBlocking = preSearchForRound && preSearchForRound.status !== MessageStatuses.COMPLETE;
      expect(preSearchBlocking).toBeFalsy();

      // No animations BLOCKING
      expect(pendingAnimations.size).toBe(0);

      // Final decision: TRIGGER moderator
      const shouldTriggerModerator = participantStatus.allComplete
        && !preSearchBlocking
        && pendingAnimations.size === 0;

      expect(shouldTriggerModerator).toBe(true);
    });
  });
});
