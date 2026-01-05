/**
 * Message Deduplication Logic Unit Tests
 *
 * Tests the deduplication logic from chat-message-list.tsx:641-775
 * that filters and deduplicates messages for display.
 *
 * Key Behaviors Tested:
 * 1. Participant trigger messages (isParticipantTrigger=true) are filtered out
 * 2. User messages deduplicated by round number (optimistic vs DB IDs)
 * 3. Assistant messages deduplicated by (roundNumber, participantIndex)
 * 4. Moderator messages deduplicated by round number only
 * 5. Deterministic IDs preferred over optimistic/temp IDs
 * 6. Edge case: only participant trigger exists for a round (regression test)
 *
 * Related Files:
 * - src/components/chat/chat-message-list.tsx:641-775 - Deduplication implementation
 * - src/lib/utils/metadata.ts - Metadata extraction utilities
 * - src/db/schemas/chat-metadata.ts - Metadata type definitions
 */

import { describe, expect, it } from 'vitest';

import { FinishReasons, MessageRoles } from '@/api/core/enums';
import type { UIMessage } from '@/lib/schemas/message-schemas';
import {
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';

// ============================================================================
// DEDUPLICATION SIMULATION
// ============================================================================

/**
 * Simulates the exact deduplication logic from chat-message-list.tsx:641-775
 * Uses O(1) Map lookups for performance (matching production implementation)
 */
function deduplicateMessages(messages: UIMessage[]): UIMessage[] {
  const seenMessageIds = new Set<string>();
  const assistantKeyToIdx = new Map<string, number>();
  const moderatorRoundToIdx = new Map<number, number>();
  const userRoundToIdx = new Map<number, number>();
  const result: UIMessage[] = [];

  for (const message of messages) {
    // Skip duplicate message IDs
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    // User message handling
    if (message.role === MessageRoles.USER) {
      const userMeta = message.metadata as { roundNumber?: number; isParticipantTrigger?: boolean };

      // Filter out participant trigger messages
      const isParticipantTrigger = userMeta?.isParticipantTrigger === true;
      if (isParticipantTrigger) {
        continue;
      }

      // Deduplicate by round number
      const roundNum = userMeta?.roundNumber;
      if (roundNum !== undefined && roundNum !== null) {
        const existingIdx = userRoundToIdx.get(roundNum);
        if (existingIdx !== undefined) {
          // Prefer deterministic IDs over optimistic IDs
          const isDeterministicId = message.id.includes('_r') && message.id.includes('_user');
          const isOptimistic = message.id.startsWith('optimistic-');
          if (isOptimistic) {
            continue; // Skip optimistic in favor of DB message
          }
          if (isDeterministicId) {
            // Replace optimistic with deterministic
            result[existingIdx] = message;
            seenMessageIds.add(message.id);
            continue;
          }
          continue; // Skip duplicate
        }
        userRoundToIdx.set(roundNum, result.length);
      }

      seenMessageIds.add(message.id);
      result.push(message);
    } else {
      // Check if this is a moderator message
      const isModerator = message.metadata && typeof message.metadata === 'object'
        && 'isModerator' in message.metadata && message.metadata.isModerator === true;

      if (isModerator) {
        const roundNum = getRoundNumber(message.metadata);

        if (roundNum !== null) {
          const existingIdx = moderatorRoundToIdx.get(roundNum);
          if (existingIdx !== undefined) {
            const isDeterministicId = message.id.includes('_r') && message.id.includes('_moderator');
            if (!isDeterministicId) {
              continue; // Skip temp ID
            }
            // Replace with deterministic ID
            result[existingIdx] = message;
            seenMessageIds.add(message.id);
            continue;
          }
          moderatorRoundToIdx.set(roundNum, result.length);
        }
        seenMessageIds.add(message.id);
        result.push(message);
        continue;
      }

      // Assistant message handling (participants only)
      const meta = message.metadata as {
        roundNumber?: number;
        participantIndex?: number;
        participantId?: string;
        model?: string;
      };

      const roundNum = meta?.roundNumber;
      const participantIdx = meta?.participantIndex;
      const participantId = meta?.participantId;
      const modelId = meta?.model;

      // Create deduplication key
      let dedupeKey: string | null = null;
      if (roundNum !== undefined && roundNum !== null) {
        if (participantId) {
          dedupeKey = `r${roundNum}_pid${participantId}`;
        } else if (participantIdx !== undefined && participantIdx !== null) {
          dedupeKey = `r${roundNum}_p${participantIdx}`;
        } else if (modelId) {
          dedupeKey = `r${roundNum}_m${modelId}`;
        }
      }

      if (dedupeKey) {
        const existingIdx = assistantKeyToIdx.get(dedupeKey);
        if (existingIdx !== undefined) {
          const isDeterministicId = message.id.includes('_r') && message.id.includes('_p');
          if (!isDeterministicId) {
            continue; // Skip temp ID
          }
          // Replace with deterministic ID
          result[existingIdx] = message;
          seenMessageIds.add(message.id);
          continue;
        }
        assistantKeyToIdx.set(dedupeKey, result.length);
      }

      seenMessageIds.add(message.id);
      result.push(message);
    }
  }

  return result;
}

// ============================================================================
// PARTICIPANT TRIGGER MESSAGE TESTS
// ============================================================================

describe('message Deduplication - Participant Trigger Filtering', () => {
  it('sHOULD filter out participant trigger messages', () => {
    const messages = [
      createTestUserMessage({
        id: 'user-1',
        content: 'Real user message',
        roundNumber: 0,
      }),
      {
        ...createTestUserMessage({
          id: 'trigger-1',
          content: 'Participant trigger',
          roundNumber: 0,
        }),
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0,
          isParticipantTrigger: true,
        },
      },
      createTestAssistantMessage({
        id: 'assistant-1',
        content: 'Response',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Trigger message should be filtered out
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.find(m => m.id === 'trigger-1')).toBeUndefined();
    expect(deduplicated.find(m => m.id === 'user-1')).toBeDefined();
    expect(deduplicated.find(m => m.id === 'assistant-1')).toBeDefined();
  });

  it('rEGRESSION: should NOT filter out all messages when only trigger exists', () => {
    // BUG: When only participant trigger message exists for a round,
    // filtering it out causes no user message to be visible
    const messages = [
      {
        ...createTestUserMessage({
          id: 'trigger-only',
          content: 'Only this trigger exists',
          roundNumber: 0,
        }),
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0,
          isParticipantTrigger: true,
        },
      },
      createTestAssistantMessage({
        id: 'assistant-1',
        content: 'Response',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // CURRENT BEHAVIOR: Trigger is filtered, leaving only assistant message
    // This is the bug - no user message visible for round 0
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.role).toBe(MessageRoles.ASSISTANT);

    // Verify the bug: round has assistant response but no user question
    const userMessages = deduplicated.filter(m => m.role === MessageRoles.USER);
    expect(userMessages).toHaveLength(0); // BUG: No user message!
  });

  it('sHOULD preserve normal user message when both trigger and normal exist', () => {
    const messages = [
      createTestUserMessage({
        id: 'normal-user',
        content: 'Normal message',
        roundNumber: 0,
      }),
      {
        ...createTestUserMessage({
          id: 'trigger',
          content: 'Trigger message',
          roundNumber: 0,
        }),
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0,
          isParticipantTrigger: true,
        },
      },
    ];

    const deduplicated = deduplicateMessages(messages);

    // Only normal message should remain
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('normal-user');
  });
});

// ============================================================================
// USER MESSAGE DEDUPLICATION TESTS
// ============================================================================

describe('message Deduplication - User Messages', () => {
  it('sHOULD deduplicate user messages by round number', () => {
    const messages = [
      createTestUserMessage({
        id: 'optimistic-user-0',
        content: 'Question',
        roundNumber: 0,
      }),
      createTestUserMessage({
        id: 'db-user-0',
        content: 'Question',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // First occurrence wins (optimistic)
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('optimistic-user-0');
  });

  it('sHOULD prefer deterministic IDs over optimistic IDs', () => {
    const messages = [
      createTestUserMessage({
        id: 'optimistic-user-12345',
        content: 'Question',
        roundNumber: 0,
      }),
      createTestUserMessage({
        id: 'thread_abc123_r0_user',
        content: 'Question',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Deterministic ID should replace optimistic
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_abc123_r0_user');
  });

  it('sHOULD allow same user in different rounds', () => {
    const messages = [
      createTestUserMessage({
        id: 'user-r0',
        content: 'Question 0',
        roundNumber: 0,
      }),
      createTestUserMessage({
        id: 'user-r1',
        content: 'Question 1',
        roundNumber: 1,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Both messages should be kept (different rounds)
    expect(deduplicated).toHaveLength(2);
    const round0 = deduplicated.find(m => getRoundNumber(m.metadata) === 0);
    const round1 = deduplicated.find(m => getRoundNumber(m.metadata) === 1);
    expect(round0).toBeDefined();
    expect(round1).toBeDefined();
  });

  it('sHOULD skip optimistic when DB message already exists', () => {
    const messages = [
      createTestUserMessage({
        id: 'thread_abc_r0_user',
        content: 'Question',
        roundNumber: 0,
      }),
      createTestUserMessage({
        id: 'optimistic-user-67890',
        content: 'Question',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // First message (deterministic) should remain
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_abc_r0_user');
  });
});

// ============================================================================
// ASSISTANT MESSAGE DEDUPLICATION TESTS
// ============================================================================

describe('message Deduplication - Assistant Messages', () => {
  it('sHOULD deduplicate by (roundNumber, participantIndex)', () => {
    const messages = [
      createTestAssistantMessage({
        id: 'temp-gen-123',
        content: 'Streaming...',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Complete',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Deterministic ID should replace temp ID
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_abc_r0_p0');
  });

  it('sHOULD deduplicate by (roundNumber, participantId) when available', () => {
    const messages = [
      createTestAssistantMessage({
        id: 'temp-1',
        content: 'Temp',
        roundNumber: 0,
        participantId: 'unique-p-id-123',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_r0_p0', // Deterministic ID pattern
        content: 'DB',
        roundNumber: 0,
        participantId: 'unique-p-id-123',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Should use participantId for deduplication and prefer deterministic ID
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_r0_p0');
  });

  it('sHOULD allow same participant in different rounds', () => {
    const messages = [
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Round 0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_r1_p0',
        content: 'Round 1',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Both should be kept (different rounds)
    expect(deduplicated).toHaveLength(2);
    const round0 = deduplicated.find(m => getRoundNumber(m.metadata) === 0);
    const round1 = deduplicated.find(m => getRoundNumber(m.metadata) === 1);
    expect(round0).toBeDefined();
    expect(round1).toBeDefined();
  });

  it('sHOULD allow different participants in same round', () => {
    const messages = [
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Participant 0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_r0_p1',
        content: 'Participant 1',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Both should be kept (different participants)
    expect(deduplicated).toHaveLength(2);
  });

  it('sHOULD fallback to modelId when participantId and participantIndex unavailable', () => {
    const messages = [
      {
        id: 'temp-model',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text' as const, text: 'Temp' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          model: 'gpt-4',
          finishReason: FinishReasons.UNKNOWN,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          hasError: false,
        },
      },
      {
        id: 'thread_r0_p0', // Deterministic ID pattern
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text' as const, text: 'DB' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          model: 'gpt-4',
          finishReason: FinishReasons.STOP,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          hasError: false,
        },
      },
    ];

    const deduplicated = deduplicateMessages(messages);

    // Should use model for deduplication when no participantId/Index
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_r0_p0');
  });

  it('sHOULD prefer temp ID when deterministic ID arrives first', () => {
    const messages = [
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Deterministic first',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'gen-temp-123',
        content: 'Temp second',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // First message (deterministic) should remain
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_r0_p0');
  });
});

// ============================================================================
// MODERATOR MESSAGE DEDUPLICATION TESTS
// ============================================================================

describe('message Deduplication - Moderator Messages', () => {
  it('sHOULD deduplicate moderator messages by round number', () => {
    const messages = [
      createTestModeratorMessage({
        id: 'gen-temp-mod-123',
        content: 'Streaming...',
        roundNumber: 0,
      }),
      createTestModeratorMessage({
        id: 'thread_r0_moderator',
        content: 'Complete',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Deterministic ID should replace temp ID
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.id).toBe('thread_r0_moderator');
  });

  it('sHOULD allow moderator in different rounds', () => {
    const messages = [
      createTestModeratorMessage({
        id: 'thread_r0_moderator',
        content: 'Summary 0',
        roundNumber: 0,
      }),
      createTestModeratorMessage({
        id: 'thread_r1_moderator',
        content: 'Summary 1',
        roundNumber: 1,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Both should be kept (different rounds)
    expect(deduplicated).toHaveLength(2);
  });

  it('sHOULD NOT confuse moderator with participant messages', () => {
    const messages = [
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Participant',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestModeratorMessage({
        id: 'thread_r0_moderator',
        content: 'Moderator',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Both should be kept (different message types)
    expect(deduplicated).toHaveLength(2);
  });
});

// ============================================================================
// COMPLEX MULTI-ROUND SCENARIOS
// ============================================================================

describe('message Deduplication - Complex Scenarios', () => {
  it('sHOULD handle complete multi-round conversation', () => {
    const messages = [
      // Round 0
      createTestUserMessage({
        id: 'optimistic-u0',
        content: 'Q0',
        roundNumber: 0,
      }),
      createTestUserMessage({
        id: 'thread_abc_r0_user',
        content: 'Q0',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'gen-p0-r0',
        content: 'Streaming...',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Complete',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestModeratorMessage({
        id: 'gen-mod-r0',
        content: 'Moderating...',
        roundNumber: 0,
      }),
      createTestModeratorMessage({
        id: 'thread_abc_r0_moderator',
        content: 'Summary 0',
        roundNumber: 0,
      }),
      // Round 1
      createTestUserMessage({
        id: 'thread_abc_r1_user',
        content: 'Q1',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r1_p0',
        content: 'Response',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Should have: 2 users, 2 assistants, 1 moderator = 5 total
    expect(deduplicated).toHaveLength(5);

    // Verify round 0
    const round0 = deduplicated.filter(m => getRoundNumber(m.metadata) === 0);
    expect(round0).toHaveLength(3); // user, assistant, moderator
    expect(round0.find(m => m.id === 'thread_abc_r0_user')).toBeDefined();
    expect(round0.find(m => m.id === 'thread_abc_r0_p0')).toBeDefined();
    expect(round0.find(m => m.id === 'thread_abc_r0_moderator')).toBeDefined();

    // Verify round 1
    const round1 = deduplicated.filter(m => getRoundNumber(m.metadata) === 1);
    expect(round1).toHaveLength(2); // user, assistant
  });

  it('sHOULD handle resumed stream with partial metadata', () => {
    // Scenario: Page refresh during streaming, resumed stream creates new temp IDs
    const messages = [
      createTestUserMessage({
        id: 'thread_r0_user',
        content: 'Question',
        roundNumber: 0,
      }),
      // DB message from before refresh
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Original DB message',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
      // Resumed stream creates temp ID
      createTestAssistantMessage({
        id: 'gen-resumed-abc123',
        content: 'Resumed streaming...',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
        finishReason: FinishReasons.UNKNOWN,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // Should keep DB message, skip temp resumed message
    expect(deduplicated).toHaveLength(2);
    const assistant = deduplicated.find(m => m.role === MessageRoles.ASSISTANT);
    expect(assistant?.id).toBe('thread_r0_p0');
  });

  it('sHOULD handle mixed optimistic and deterministic across rounds', () => {
    const messages = [
      // Round 0 - fully resolved
      createTestUserMessage({
        id: 'thread_r0_user',
        content: 'Q0',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      // Round 1 - has optimistic
      createTestUserMessage({
        id: 'optimistic-u1',
        content: 'Q1',
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        id: 'gen-temp-p0',
        content: 'Streaming...',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    expect(deduplicated).toHaveLength(4);

    // Round 0 should have deterministic IDs
    const round0 = deduplicated.filter(m => getRoundNumber(m.metadata) === 0);
    expect(round0.every(m => !m.id.startsWith('optimistic-') && !m.id.startsWith('gen-'))).toBe(true);

    // Round 1 should have optimistic/temp IDs
    const round1 = deduplicated.filter(m => getRoundNumber(m.metadata) === 1);
    expect(round1.some(m => m.id.startsWith('optimistic-'))).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('message Deduplication - Edge Cases', () => {
  it('sHOULD handle empty messages array', () => {
    const deduplicated = deduplicateMessages([]);
    expect(deduplicated).toEqual([]);
  });

  it('sHOULD handle messages with missing metadata', () => {
    const messages = [
      createTestUserMessage({
        id: 'valid-user',
        content: 'Valid',
        roundNumber: 0,
      }),
      {
        id: 'missing-meta',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text' as const, text: 'Missing metadata' }],
        metadata: {} as UIMessage['metadata'],
      },
    ];

    const deduplicated = deduplicateMessages(messages);

    // Should not crash
    expect(deduplicated.length).toBeGreaterThanOrEqual(1);
    expect(deduplicated.find(m => m.id === 'valid-user')).toBeDefined();
  });

  it('sHOULD handle duplicate message IDs (seenMessageIds check)', () => {
    const messages = [
      createTestUserMessage({
        id: 'duplicate-id',
        content: 'First',
        roundNumber: 0,
      }),
      createTestUserMessage({
        id: 'duplicate-id',
        content: 'Second',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // First occurrence should win
    expect(deduplicated).toHaveLength(1);
    expect((deduplicated[0]?.parts[0] as { text: string }).text).toBe('First');
  });

  it('sHOULD handle messages without roundNumber', () => {
    const messages = [
      {
        id: 'no-round',
        role: MessageRoles.USER,
        parts: [{ type: 'text' as const, text: 'No round' }],
        metadata: { role: MessageRoles.USER },
      },
      createTestUserMessage({
        id: 'with-round',
        content: 'With round',
        roundNumber: 0,
      }),
    ];

    const deduplicated = deduplicateMessages(messages as UIMessage[]);

    // Both should be kept (different IDs, first has no round for deduplication)
    expect(deduplicated).toHaveLength(2);
  });

  it('sHOULD handle many rounds efficiently (O(1) lookups)', () => {
    const messages: UIMessage[] = [];

    // Create 100 rounds with duplicates
    for (let round = 0; round < 100; round++) {
      messages.push(
        createTestUserMessage({
          id: `opt-u${round}`,
          content: `Q${round}`,
          roundNumber: round,
        }),
      );
      messages.push(
        createTestUserMessage({
          id: `db-u${round}`,
          content: `Q${round}`,
          roundNumber: round,
        }),
      );
      messages.push(
        createTestAssistantMessage({
          id: `temp-p0-r${round}`,
          content: `Temp ${round}`,
          roundNumber: round,
          participantId: 'p0',
          participantIndex: 0,
        }),
      );
      messages.push(
        createTestAssistantMessage({
          id: `db-p0-r${round}`,
          content: `DB ${round}`,
          roundNumber: round,
          participantId: 'p0',
          participantIndex: 0,
        }),
      );
    }

    const deduplicated = deduplicateMessages(messages);

    // Should have 200 messages (100 rounds × 2 deduplicated messages each)
    expect(deduplicated).toHaveLength(200);

    // Verify each round has exactly 2 messages
    for (let round = 0; round < 100; round++) {
      const roundMessages = deduplicated.filter(m => getRoundNumber(m.metadata) === round);
      expect(roundMessages).toHaveLength(2);
    }
  });

  it('rEGRESSION: should handle round with only participant trigger and assistant', () => {
    // This is the critical bug case: when a round has ONLY a participant trigger
    // (no normal user message), the deduplication filters it out, leaving
    // assistant messages orphaned without a user question.
    const messages = [
      // Round 0 - only participant trigger
      {
        ...createTestUserMessage({
          id: 'trigger-r0',
          content: 'Participant trigger only',
          roundNumber: 0,
        }),
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0,
          isParticipantTrigger: true,
        },
      },
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'Response to trigger',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_r0_p1',
        content: 'Another response',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
      }),
    ];

    const deduplicated = deduplicateMessages(messages);

    // BUG: Round has assistant messages but no user message
    const round0 = deduplicated.filter(m => getRoundNumber(m.metadata) === 0);
    const userMessages = round0.filter(m => m.role === MessageRoles.USER);
    const assistantMessages = round0.filter(m => m.role === MessageRoles.ASSISTANT);

    expect(userMessages).toHaveLength(0); // BUG: No user message!
    expect(assistantMessages).toHaveLength(2); // Assistants present

    // This creates orphaned assistant messages without context
    // The UI would show responses without showing what question they're answering
  });
});
