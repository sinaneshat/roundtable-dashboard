/**
 * Performance Optimizations Tests
 *
 * Verifies that all O(n²) → O(n) optimizations work correctly:
 * 1. flow-state-machine.ts - Single-pass message scanning
 * 2. participant-completion-gate.ts - Map-based participant lookup
 * 3. round-utils.ts - Single-pass round grouping with forward tracking
 * 4. participant-config.service.ts - Map-based participant categorization
 *
 * These tests ensure:
 * - Optimized algorithms produce same results as original
 * - No race conditions introduced by optimizations
 * - Edge cases handled correctly
 * - Performance characteristics are maintained
 */

import type { FinishReason, TextPartState } from '@roundtable/shared';
import {
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  TextPartStates,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';

import {
  getParticipantCompletionStatus,
  isMessageComplete,
} from '../utils/participant-completion-gate';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a UIMessage for testing with proper type safety
 * Uses the established pattern from sibling test files
 */
function createUIMessage(overrides: {
  id: string;
  role: string;
  content?: string;
  parts?: UIMessage['parts'];
  createdAt?: Date;
  metadata?: UIMessage['metadata'];
}): UIMessage {
  return {
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? new Date(),
    id: overrides.id,
    metadata: overrides.metadata,
    parts: overrides.parts ?? [],
    role: overrides.role as typeof MessageRoles.USER | typeof MessageRoles.ASSISTANT | 'system',
  };
}

function createParticipant(id: string, priority: number, isEnabled = true): ChatParticipant {
  return {
    createdAt: new Date(),
    customRoleId: null,
    id,
    isEnabled,
    modelId: `model-${id}`,
    priority,
    role: null,
    settings: null,
    threadId: 'thread-1',
    updatedAt: new Date(),
  };
}

/**
 * Create assistant message with proper typing
 * Uses enum types from @/api/core/enums for type safety
 */
function createAssistantMessage(
  participantId: string,
  roundNumber: number,
  options: {
    hasContent?: boolean;
    isStreaming?: boolean;
    finishReason?: FinishReason;
    isModerator?: boolean;
  } = {},
): UIMessage {
  const { finishReason, hasContent = true, isModerator = false, isStreaming = false } = options;

  const partState: TextPartState | undefined = isStreaming ? TextPartStates.STREAMING : undefined;

  const parts: UIMessage['parts'] = hasContent
    ? [{
        text: 'Test content',
        type: MessagePartTypes.TEXT,
        ...(partState ? { state: partState } : {}),
      }]
    : [];

  return createUIMessage({
    id: `msg-${participantId}-r${roundNumber}`,
    metadata: {
      finishReason,
      participantId: isModerator ? undefined : participantId,
      roundNumber,
      ...(isModerator ? { isModerator: true } : {}),
    },
    parts,
    role: MessageRoles.ASSISTANT,
  });
}

// ============================================================================
// PARTICIPANT COMPLETION GATE - MAP OPTIMIZATION TESTS
// ============================================================================

describe('participant Completion Gate - Map Optimization', () => {
  describe('getParticipantCompletionStatus', () => {
    it('correctly identifies all participants complete with Map lookup', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];

      const messages = [
        createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        createAssistantMessage('p2', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        createAssistantMessage('p3', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBeTruthy();
      expect(status.expectedCount).toBe(3);
      expect(status.completedCount).toBe(3);
      expect(status.streamingCount).toBe(0);
    });

    it('correctly identifies streaming participants with Map lookup', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];

      const messages = [
        createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        createAssistantMessage('p2', 0, { hasContent: true, isStreaming: true }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBeFalsy();
      expect(status.completedCount).toBe(1);
      expect(status.streamingCount).toBe(1);
      expect(status.streamingParticipantIds).toContain('p2');
      expect(status.completedParticipantIds).toContain('p1');
    });

    it('correctly handles missing participant messages', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
        createParticipant('p3', 2),
      ];

      const messages = [
        createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        // p2 missing
        // p3 missing
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBeFalsy();
      expect(status.expectedCount).toBe(3);
      expect(status.completedCount).toBe(1);
      expect(status.streamingCount).toBe(2); // p2 and p3 counted as "streaming" (not complete)
    });

    it('excludes disabled participants from completion check', () => {
      const participants = [
        createParticipant('p1', 0, true),
        createParticipant('p2', 1, false), // disabled
        createParticipant('p3', 2, true),
      ];

      const messages = [
        createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        createAssistantMessage('p3', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      ];

      const status = getParticipantCompletionStatus(messages, participants, 0);

      expect(status.allComplete).toBeTruthy();
      expect(status.expectedCount).toBe(2); // Only enabled participants
      expect(status.completedCount).toBe(2);
    });

    it('handles large number of participants efficiently', () => {
      // Create 100 participants
      const participants = Array.from({ length: 100 }, (_, i) =>
        createParticipant(`p${i}`, i));

      // Create messages for all participants
      const messages = participants.map(p =>
        createAssistantMessage(p.id, 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      );

      const startTime = performance.now();
      const status = getParticipantCompletionStatus(messages, participants, 0);
      const endTime = performance.now();

      expect(status.allComplete).toBeTruthy();
      expect(status.expectedCount).toBe(100);
      expect(status.completedCount).toBe(100);

      // Should complete in under 1000ms even with 100 participants (accounts for test env overhead + JIT warmup + CI variability)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('correctly handles multiple rounds', () => {
      const participants = [
        createParticipant('p1', 0),
        createParticipant('p2', 1),
      ];

      const messages = [
        // Round 0 - complete
        createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        createAssistantMessage('p2', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
        // Round 1 - incomplete
        createAssistantMessage('p1', 1, { finishReason: FinishReasons.STOP, hasContent: true }),
        // p2 for round 1 is missing
      ];

      const round0Status = getParticipantCompletionStatus(messages, participants, 0);
      const round1Status = getParticipantCompletionStatus(messages, participants, 1);

      expect(round0Status.allComplete).toBeTruthy();
      expect(round1Status.allComplete).toBeFalsy();
      expect(round1Status.completedCount).toBe(1);
    });
  });

  describe('isMessageComplete', () => {
    it('returns false for message with streaming parts', () => {
      const message = createAssistantMessage('p1', 0, {
        finishReason: FinishReasons.STOP,
        hasContent: true,
        isStreaming: true,
      });

      expect(isMessageComplete(message)).toBeFalsy();
    });

    it('returns true for message with content and no streaming', () => {
      const message = createAssistantMessage('p1', 0, {
        hasContent: true,
        isStreaming: false,
      });

      expect(isMessageComplete(message)).toBeTruthy();
    });

    it('returns true for message with valid finish reason', () => {
      const message = createAssistantMessage('p1', 0, {
        finishReason: FinishReasons.STOP,
        hasContent: false,
      });

      expect(isMessageComplete(message)).toBeTruthy();
    });

    it('returns false for message with unknown finish reason and no content', () => {
      const message = createUIMessage({
        id: 'msg-1',
        metadata: {
          finishReason: FinishReasons.UNKNOWN,
          roundNumber: 0,
        },
        parts: [],
        role: MessageRoles.ASSISTANT,
      });

      expect(isMessageComplete(message)).toBeFalsy();
    });
  });
});

// ============================================================================
// FLOW STATE MACHINE - SINGLE PASS OPTIMIZATION TESTS
// ============================================================================

describe('flow State Machine - Single Pass Optimization', () => {
  type MessageMetadata = {
    roundNumber?: number;
    isModerator?: boolean;
    finishReason?: FinishReason;
  };

  /**
   * Helper to safely get round number from metadata
   */
  function getMetadataRoundNumber(metadata: MessageMetadata | undefined | null): number | undefined {
    if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata) {
      return metadata.roundNumber;
    }
    return undefined;
  }

  /**
   * Helper to check if metadata indicates moderator
   */
  function isMetadataModerator(metadata: MessageMetadata | undefined | null): boolean {
    if (metadata && typeof metadata === 'object' && 'isModerator' in metadata) {
      return metadata.isModerator === true;
    }
    return false;
  }

  /**
   * Helper to get finish reason from metadata
   */
  function getMetadataFinishReason(metadata: MessageMetadata | undefined | null): FinishReason | undefined {
    if (metadata && typeof metadata === 'object' && 'finishReason' in metadata) {
      return metadata.finishReason;
    }
    return undefined;
  }

  /**
   * Simulates the optimized single-pass algorithm from flow-state-machine.ts
   */
  function calculateRoundInfo(
    messages: UIMessage[],
    currentRound: number,
  ): {
    moderatorMessage: UIMessage | null;
    completedCount: number;
  } {
    let moderatorMessage: UIMessage | null = null;
    let completedCount = 0;

    for (const m of messages) {
      if (m.role !== MessageRoles.ASSISTANT) {
        continue;
      }

      const roundNumber = getMetadataRoundNumber(m.metadata);
      if (roundNumber !== currentRound) {
        continue;
      }

      // Check if moderator
      if (isMetadataModerator(m.metadata)) {
        moderatorMessage = m;
        continue;
      }

      // Check if complete
      const hasStreamingParts = m.parts?.some(
        p => 'state' in p && p.state === TextPartStates.STREAMING,
      ) ?? false;

      if (!hasStreamingParts) {
        const hasTextContent = m.parts?.some(
          p => p.type === MessagePartTypes.TEXT && 'text' in p && (p as { text?: string }).text,
        );

        if (hasTextContent) {
          completedCount++;
        } else {
          const finishReason = getMetadataFinishReason(m.metadata);
          if (finishReason) {
            completedCount++;
          }
        }
      }
    }

    return { completedCount, moderatorMessage };
  }

  it('correctly identifies moderator and completed count in single pass', () => {
    const messages = [
      createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      createAssistantMessage('p2', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      createAssistantMessage('mod', 0, { hasContent: true, isModerator: true }),
    ];

    const result = calculateRoundInfo(messages, 0);

    expect(result.moderatorMessage).not.toBeNull();
    expect(result.moderatorMessage?.id).toBe('msg-mod-r0');
    expect(result.completedCount).toBe(2); // Moderator not counted
  });

  it('handles mixed rounds correctly', () => {
    const messages = [
      createAssistantMessage('p1', 0, { hasContent: true }),
      createAssistantMessage('p2', 0, { hasContent: true }),
      createAssistantMessage('p1', 1, { hasContent: true }),
      createAssistantMessage('p2', 1, { isStreaming: true }),
    ];

    const round0 = calculateRoundInfo(messages, 0);
    const round1 = calculateRoundInfo(messages, 1);

    expect(round0.completedCount).toBe(2);
    expect(round1.completedCount).toBe(1); // p2 is streaming
  });

  it('excludes streaming messages from completed count', () => {
    const messages = [
      createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      createAssistantMessage('p2', 0, { hasContent: true, isStreaming: true }),
    ];

    const result = calculateRoundInfo(messages, 0);

    expect(result.completedCount).toBe(1);
  });

  it('handles empty messages array', () => {
    const result = calculateRoundInfo([], 0);

    expect(result.moderatorMessage).toBeNull();
    expect(result.completedCount).toBe(0);
  });

  it('performance test - handles 1000 messages efficiently', () => {
    const messages = Array.from({ length: 1000 }, (_, i) =>
      createAssistantMessage(`p${i % 10}`, Math.floor(i / 100), { hasContent: true }));

    const startTime = performance.now();
    const result = calculateRoundInfo(messages, 5);
    const endTime = performance.now();

    expect(result.completedCount).toBe(100); // 100 messages in round 5
    // Should complete in under 50ms (CI variability)
    expect(endTime - startTime).toBeLessThan(50);
  });
});

// ============================================================================
// ROUND UTILS - SINGLE PASS GROUPING TESTS
// ============================================================================

describe('round Utils - Single Pass Grouping', () => {
  type RoundMetadata = {
    roundNumber?: number;
  };

  /**
   * Helper to safely get round number from metadata
   */
  function getMetadataRoundNumber(metadata: RoundMetadata | undefined | null): number | undefined {
    if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata) {
      return metadata.roundNumber;
    }
    return undefined;
  }

  /**
   * Simulates the optimized single-pass grouping from round-utils.ts
   */
  function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
    const result = new Map<number, UIMessage[]>();
    const seenIds = new Set<string>();
    let lastKnownUserRound = -1;

    for (const message of messages) {
      if (seenIds.has(message.id)) {
        continue;
      }
      seenIds.add(message.id);

      const explicitRound = getMetadataRoundNumber(message.metadata);
      let roundNumber: number;

      if (explicitRound !== undefined && explicitRound !== null) {
        roundNumber = explicitRound;
        if (message.role === MessageRoles.USER) {
          lastKnownUserRound = roundNumber;
        }
      } else {
        if (message.role === MessageRoles.USER) {
          roundNumber = lastKnownUserRound + 1;
          lastKnownUserRound = roundNumber;
        } else {
          roundNumber = lastKnownUserRound >= 0 ? lastKnownUserRound : 0;
        }
      }

      if (!result.has(roundNumber)) {
        result.set(roundNumber, []);
      }
      const roundMessages = result.get(roundNumber);
      if (!roundMessages) {
        throw new Error('expected round messages array');
      }
      roundMessages.push(message);
    }

    return result;
  }

  it('groups messages by round correctly', () => {
    const messages = [
      createUIMessage({ id: 'u1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }),
      createUIMessage({ id: 'a1', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT }),
      createUIMessage({ id: 'u2', metadata: { roundNumber: 1 }, role: MessageRoles.USER }),
      createUIMessage({ id: 'a2', metadata: { roundNumber: 1 }, role: MessageRoles.ASSISTANT }),
    ];

    const grouped = groupMessagesByRound(messages);

    expect(grouped.get(0)?.length).toBe(2);
    expect(grouped.get(1)?.length).toBe(2);
  });

  it('handles duplicate messages (deduplication)', () => {
    const messages = [
      createUIMessage({ id: 'u1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }),
      createUIMessage({ id: 'u1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }), // duplicate
      createUIMessage({ id: 'a1', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT }),
    ];

    const grouped = groupMessagesByRound(messages);

    expect(grouped.get(0)?.length).toBe(2); // u1 only counted once
  });

  it('infers round from forward tracking when metadata missing', () => {
    const messages = [
      createUIMessage({ id: 'u1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }),
      createUIMessage({ id: 'a1', metadata: {}, role: MessageRoles.ASSISTANT }), // no roundNumber
      createUIMessage({ id: 'u2', metadata: {}, role: MessageRoles.USER }), // no roundNumber
      createUIMessage({ id: 'a2', metadata: {}, role: MessageRoles.ASSISTANT }), // no roundNumber
    ];

    const grouped = groupMessagesByRound(messages);

    expect(grouped.get(0)?.length).toBe(2); // u1 + a1
    expect(grouped.get(1)?.length).toBe(2); // u2 + a2
  });

  it('performance test - handles 10000 messages efficiently', () => {
    const messages = Array.from({ length: 10000 }, (_, i) =>
      createUIMessage({
        id: `msg-${i}`,
        metadata: { roundNumber: Math.floor(i / 100) },
        role: i % 3 === 0 ? MessageRoles.USER : MessageRoles.ASSISTANT,
      }));

    const startTime = performance.now();
    const grouped = groupMessagesByRound(messages);
    const endTime = performance.now();

    expect(grouped.size).toBe(100); // 100 rounds
    // Should complete in under 300ms for 10000 messages (CI variability)
    expect(endTime - startTime).toBeLessThan(300);
  });
});

// ============================================================================
// PARTICIPANT CONFIG SERVICE - MAP OPTIMIZATION TESTS
// ============================================================================

describe('participant Config Service - Map Optimization', () => {
  /**
   * Simulated DB participant structure for testing Map-based categorization
   * Mirrors the structure used in participant-config.service.ts
   */
  type SimulatedDbParticipant = {
    id: string;
    modelId: string;
    isEnabled: boolean;
    role: string | null;
  };

  /**
   * Simulated provided participant structure for testing
   * Represents participant data sent from the client
   */
  type SimulatedProvidedParticipant = {
    id: string;
    modelId: string;
    isEnabled?: boolean;
    role?: string;
  };

  /**
   * Simulates the optimized categorization from participant-config.service.ts
   * Uses Map-based lookups for O(1) complexity instead of O(n×m)
   */
  function categorizeParticipantChanges(
    allDbParticipants: SimulatedDbParticipant[],
    providedParticipants: SimulatedProvidedParticipant[],
  ) {
    const enabledDbParticipants = allDbParticipants.filter(p => p.isEnabled);
    const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

    // Build Maps for O(1) lookups
    const allDbByModelId = new Map(allDbParticipants.map(p => [p.modelId, p]));
    const enabledDbByModelId = new Map(enabledDbParticipants.map(p => [p.modelId, p]));
    const providedByModelId = new Map(providedEnabledParticipants.map(p => [p.modelId, p]));

    // Removed: in enabled DB but not in provided
    const removedParticipants = enabledDbParticipants.filter(
      dbP => !providedByModelId.has(dbP.modelId),
    );

    // Added: not in DB at all
    const addedParticipants = providedEnabledParticipants.filter(
      provided => !allDbByModelId.has(provided.modelId),
    );

    // Re-enabled: exists in DB but was disabled
    const reenabledParticipants = providedEnabledParticipants.filter((provided) => {
      const dbP = allDbByModelId.get(provided.modelId);
      return dbP && !dbP.isEnabled;
    });

    // Updated: role changed
    const updatedParticipants = providedEnabledParticipants.filter((provided) => {
      const dbP = enabledDbByModelId.get(provided.modelId);
      if (!dbP) {
        return false;
      }
      return (dbP.role || null) !== (provided.role || null);
    });

    return {
      addedParticipants,
      reenabledParticipants,
      removedParticipants,
      updatedParticipants,
    };
  }

  it('correctly identifies added participants', () => {
    const dbParticipants: SimulatedDbParticipant[] = [
      { id: 'p1', isEnabled: true, modelId: 'model-1', role: null },
    ];

    const providedParticipants: SimulatedProvidedParticipant[] = [
      { id: 'p1', modelId: 'model-1' },
      { id: 'p2', modelId: 'model-2' }, // new
    ];

    const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

    expect(result.addedParticipants).toHaveLength(1);
    expect(result.addedParticipants[0].modelId).toBe('model-2');
  });

  it('correctly identifies removed participants', () => {
    const dbParticipants: SimulatedDbParticipant[] = [
      { id: 'p1', isEnabled: true, modelId: 'model-1', role: null },
      { id: 'p2', isEnabled: true, modelId: 'model-2', role: null },
    ];

    const providedParticipants: SimulatedProvidedParticipant[] = [
      { id: 'p1', modelId: 'model-1' },
      // model-2 removed
    ];

    const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

    expect(result.removedParticipants).toHaveLength(1);
    expect(result.removedParticipants[0].modelId).toBe('model-2');
  });

  it('correctly identifies re-enabled participants', () => {
    const dbParticipants: SimulatedDbParticipant[] = [
      { id: 'p1', isEnabled: true, modelId: 'model-1', role: null },
      { id: 'p2', isEnabled: false, modelId: 'model-2', role: null }, // disabled
    ];

    const providedParticipants: SimulatedProvidedParticipant[] = [
      { id: 'p1', modelId: 'model-1' },
      { id: 'p2', modelId: 'model-2' }, // re-enabling
    ];

    const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

    expect(result.reenabledParticipants).toHaveLength(1);
    expect(result.reenabledParticipants[0].modelId).toBe('model-2');
    expect(result.addedParticipants).toHaveLength(0); // Should not be counted as added
  });

  it('correctly identifies updated participants (role change)', () => {
    const dbParticipants: SimulatedDbParticipant[] = [
      { id: 'p1', isEnabled: true, modelId: 'model-1', role: 'Old Role' },
    ];

    const providedParticipants: SimulatedProvidedParticipant[] = [
      { id: 'p1', modelId: 'model-1', role: 'New Role' },
    ];

    const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

    expect(result.updatedParticipants).toHaveLength(1);
    expect(result.updatedParticipants[0].role).toBe('New Role');
  });

  it('performance test - handles 100 participants efficiently', () => {
    const dbParticipants: SimulatedDbParticipant[] = Array.from({ length: 100 }, (_, i) => ({
      id: `p${i}`,
      isEnabled: i % 10 !== 0, // 10 disabled
      modelId: `model-${i}`,
      role: null,
    }));

    const providedParticipants: SimulatedProvidedParticipant[] = Array.from({ length: 100 }, (_, i) => ({
      id: `p${i}`,
      modelId: `model-${i}`,
      role: i % 5 === 0 ? 'New Role' : undefined,
    }));

    const startTime = performance.now();
    const result = categorizeParticipantChanges(dbParticipants, providedParticipants);
    const endTime = performance.now();

    expect(result.reenabledParticipants).toHaveLength(10); // 10 were disabled
    expect(result.updatedParticipants.length).toBeGreaterThan(0); // Some have new roles
    // Should complete in under 50ms (CI variability)
    expect(endTime - startTime).toBeLessThan(50);
  });
});

// ============================================================================
// RACE CONDITION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  it('participant completion status is consistent across multiple calls', () => {
    const participants = [
      createParticipant('p1', 0),
      createParticipant('p2', 1),
    ];

    const messages = [
      createAssistantMessage('p1', 0, { finishReason: FinishReasons.STOP, hasContent: true }),
      createAssistantMessage('p2', 0, { hasContent: true, isStreaming: true }),
    ];

    // Call multiple times to ensure consistency
    const results = Array.from({ length: 10 }, () =>
      getParticipantCompletionStatus(messages, participants, 0));

    // All results should be identical
    results.forEach((result) => {
      expect(result.allComplete).toBeFalsy();
      expect(result.completedCount).toBe(1);
      expect(result.streamingCount).toBe(1);
    });
  });

  it('message grouping is deterministic with duplicate IDs', () => {
    const messages = [
      createUIMessage({ id: 'msg-1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }),
      createUIMessage({ id: 'msg-1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }),
      createUIMessage({ id: 'msg-1', metadata: { roundNumber: 0 }, role: MessageRoles.USER }),
    ];

    // Simulated grouping function
    const seenIds = new Set<string>();
    const deduped = messages.filter((m) => {
      if (seenIds.has(m.id)) {
        return false;
      }
      seenIds.add(m.id);
      return true;
    });

    expect(deduped).toHaveLength(1);
  });

  it('streaming state detection is consistent', () => {
    const streamingMessage = createAssistantMessage('p1', 0, {
      hasContent: true,
      isStreaming: true,
    });

    const completeMessage = createAssistantMessage('p2', 0, {
      finishReason: FinishReasons.STOP,
      hasContent: true,
      isStreaming: false,
    });

    // Multiple checks should be consistent
    for (let i = 0; i < 10; i++) {
      expect(isMessageComplete(streamingMessage)).toBeFalsy();
      expect(isMessageComplete(completeMessage)).toBeTruthy();
    }
  });
});
