/**
 * Timeline ID Collision and Metadata Consistency Tests
 *
 * Tests for:
 * - Message ID generation patterns and collision prevention
 * - Round number consistency between ID and metadata
 * - Participant index consistency
 * - Deduplication mechanisms
 * - Metadata integrity across operations
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  FinishReasons,
  MessageRoles,
} from '@/api/core/enums';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';
import { useThreadTimeline } from '@/hooks/utils/useThreadTimeline';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// ID GENERATION TESTS
// ============================================================================

describe('message ID Generation', () => {
  describe('deterministic ID Pattern', () => {
    it('should follow pattern: threadId_r{round}_p{participantIndex}', () => {
      const threadId = 'thread-123';
      const roundNumber = 2;
      const participantIndex = 1;

      // Expected ID format
      const expectedPattern = `${threadId}_r${roundNumber}_p${participantIndex}`;

      // Create message with this pattern
      const msg = createTestAssistantMessage({
        id: expectedPattern,
        content: 'Test',
        roundNumber,
        participantId: 'p1',
        participantIndex,
      });

      expect(msg.id).toBe(expectedPattern);
      expect(msg.id).toMatch(/^thread-123_r2_p1$/);
    });

    it('should generate unique IDs for different participants in same round', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;

      const p0Id = `${threadId}_r${roundNumber}_p0`;
      const p1Id = `${threadId}_r${roundNumber}_p1`;
      const p2Id = `${threadId}_r${roundNumber}_p2`;

      expect(p0Id).not.toBe(p1Id);
      expect(p1Id).not.toBe(p2Id);
      expect(p0Id).not.toBe(p2Id);
    });

    it('should generate unique IDs for same participant across rounds', () => {
      const threadId = 'thread-123';
      const participantIndex = 0;

      const r0Id = `${threadId}_r0_p${participantIndex}`;
      const r1Id = `${threadId}_r1_p${participantIndex}`;
      const r2Id = `${threadId}_r2_p${participantIndex}`;

      expect(r0Id).not.toBe(r1Id);
      expect(r1Id).not.toBe(r2Id);
      expect(r0Id).not.toBe(r2Id);
    });

    it('should generate unique IDs across different threads', () => {
      const roundNumber = 0;
      const participantIndex = 0;

      const thread1Id = `thread-1_r${roundNumber}_p${participantIndex}`;
      const thread2Id = `thread-2_r${roundNumber}_p${participantIndex}`;

      expect(thread1Id).not.toBe(thread2Id);
    });
  });

  describe('user Message ID Pattern', () => {
    it('should follow pattern for user messages', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;

      // User messages typically use: threadId_r{round}_user or similar
      const userMsgId = `${threadId}_r${roundNumber}_user`;

      const msg = createTestUserMessage({
        id: userMsgId,
        content: 'User message',
        roundNumber,
      });

      expect(msg.id).toBe(userMsgId);
    });
  });
});

// ============================================================================
// ID COLLISION PREVENTION TESTS
// ============================================================================

describe('iD Collision Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should allow duplicate IDs when explicitly set (documents behavior)', () => {
    // Note: setMessages replaces the entire array without deduplication
    // Deduplication happens at the data source level (backend) or UI level
    const msg1 = createTestUserMessage({
      id: 'msg-1',
      content: 'First message',
      roundNumber: 0,
    });

    const msg2 = createTestUserMessage({
      id: 'msg-1', // Same ID
      content: 'Second message with same ID',
      roundNumber: 0,
    });

    // setMessages replaces - will have both if passed both
    store.getState().setMessages([msg1, msg2]);

    const messages = store.getState().messages;
    // Documents current behavior: store doesn't deduplicate by ID
    expect(messages).toHaveLength(2);

    // Timeline hook also doesn't deduplicate messages by ID
    // (it groups by round, sorts by participant index)
  });

  it('should deduplicate changelog entries by ID', () => {
    const changelog = [
      {
        id: 'changelog-1',
        threadId: 'thread-123',
        roundNumber: 1,
        changeType: 'mode_change' as const,
        changeData: { oldMode: 'brainstorm', newMode: 'analyzing' },
        createdAt: new Date(),
      },
      {
        id: 'changelog-1', // Duplicate ID
        threadId: 'thread-123',
        roundNumber: 1,
        changeType: 'mode_change' as const,
        changeData: { oldMode: 'brainstorm', newMode: 'analyzing' },
        createdAt: new Date(),
      },
    ];

    const userMsg = createTestUserMessage({
      id: 'user-msg-1',
      content: 'Test',
      roundNumber: 1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg],
        changelog,
        analyses: [],
      }),
    );

    const changelogItem = result.current.find(item => item.type === 'changelog');
    expect(changelogItem).toBeDefined();

    if (changelogItem?.type === 'changelog') {
      // Should be deduplicated to 1
      expect(changelogItem.data).toHaveLength(1);
    }
  });

  it('should allow same change type with different IDs', () => {
    const changelog = [
      {
        id: 'changelog-1',
        threadId: 'thread-123',
        roundNumber: 1,
        changeType: 'participant_added' as const,
        changeData: { participantId: 'p1' },
        createdAt: new Date(),
      },
      {
        id: 'changelog-2', // Different ID
        threadId: 'thread-123',
        roundNumber: 1,
        changeType: 'participant_added' as const, // Same type
        changeData: { participantId: 'p2' },
        createdAt: new Date(),
      },
    ];

    const userMsg = createTestUserMessage({
      id: 'user-msg-1',
      content: 'Test',
      roundNumber: 1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [userMsg],
        changelog,
        analyses: [],
      }),
    );

    const changelogItem = result.current.find(item => item.type === 'changelog');
    expect(changelogItem?.type === 'changelog' && changelogItem.data).toHaveLength(2);
  });
});

// ============================================================================
// ROUND NUMBER CONSISTENCY TESTS
// ============================================================================

describe('round Number Consistency', () => {
  it('should match roundNumber in ID and metadata', () => {
    const roundNumber = 3;
    const threadId = 'thread-123';

    const msg = createTestAssistantMessage({
      id: `${threadId}_r${roundNumber}_p0`,
      content: 'Test',
      roundNumber,
      participantId: 'p0',
      participantIndex: 0,
    });

    const metadata = msg.metadata as DbAssistantMessageMetadata;

    // Extract round from ID
    const idMatch = msg.id.match(/_r(\d+)_/);
    const idRound = idMatch ? Number.parseInt(idMatch[1]!, 10) : -1;

    // Should match metadata
    expect(idRound).toBe(metadata.roundNumber);
  });

  it('should detect roundNumber mismatch', () => {
    // This test documents the potential bug: ID says r2 but metadata says r3
    const msg = createTestAssistantMessage({
      id: 'thread-123_r2_p0', // ID says round 2
      content: 'Test',
      roundNumber: 3, // Metadata says round 3 (MISMATCH!)
      participantId: 'p0',
      participantIndex: 0,
    });

    const metadata = msg.metadata as DbAssistantMessageMetadata;

    // Extract round from ID
    const idMatch = msg.id.match(/_r(\d+)_/);
    const idRound = idMatch ? Number.parseInt(idMatch[1]!, 10) : -1;

    // Document the mismatch
    expect(idRound).not.toBe(metadata.roundNumber);
    expect(idRound).toBe(2);
    expect(metadata.roundNumber).toBe(3);
  });

  it('should group messages by metadata roundNumber (not ID)', () => {
    // Messages with mismatched IDs but correct metadata
    const msg1 = createTestUserMessage({
      id: 'msg-wrong-id-format',
      content: 'User message',
      roundNumber: 0,
    });

    const msg2 = createTestAssistantMessage({
      id: 'another-wrong-format',
      content: 'Assistant message',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg1, msg2],
        changelog: [],
        analyses: [],
      }),
    );

    // Should still group correctly by metadata roundNumber
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(0);

    if (result.current[0]?.type === 'messages') {
      expect(result.current[0].data).toHaveLength(2);
    }
  });
});

// ============================================================================
// PARTICIPANT INDEX CONSISTENCY TESTS
// ============================================================================

describe('participant Index Consistency', () => {
  it('should maintain participantIndex order in timeline', () => {
    const msgs = [
      createTestUserMessage({ id: 'user-0', content: 'Q', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'thread_r0_p2',
        content: 'P2',
        roundNumber: 0,
        participantId: 'p2',
        participantIndex: 2,
      }),
      createTestAssistantMessage({
        id: 'thread_r0_p0',
        content: 'P0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_r0_p1',
        content: 'P1',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
      }),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: msgs,
        changelog: [],
        analyses: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();

    if (messagesItem?.type === 'messages') {
      const assistants = messagesItem.data.filter(m => m.role === 'assistant');

      // Should be sorted: p0, p1, p2
      expect((assistants[0]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(0);
      expect((assistants[1]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(1);
      expect((assistants[2]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(2);
    }
  });

  it('should handle missing participantIndex gracefully', () => {
    const msgs = [
      createTestUserMessage({ id: 'user-0', content: 'Q', roundNumber: 0 }),
      {
        id: 'msg-no-index',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'Response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          // participantIndex intentionally missing
        },
      },
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: msgs,
        changelog: [],
        analyses: [],
      }),
    );

    // Should not crash, should still render
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.type).toBe('messages');
  });

  it('should handle duplicate participantIndex (edge case)', () => {
    // Two messages claim to be participantIndex 0 - should both appear
    const msgs = [
      createTestUserMessage({ id: 'user-0', content: 'Q', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'msg-p0-first',
        content: 'First P0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'msg-p0-second',
        content: 'Second P0',
        roundNumber: 0,
        participantId: 'p0-dupe',
        participantIndex: 0, // Same index!
      }),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: msgs,
        changelog: [],
        analyses: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');

    if (messagesItem?.type === 'messages') {
      // Both should be present (no dedup by participantIndex)
      expect(messagesItem.data).toHaveLength(3);
    }
  });
});

// ============================================================================
// METADATA INTEGRITY TESTS
// ============================================================================

describe('metadata Integrity', () => {
  it('should preserve all metadata fields through timeline', () => {
    const msg = createTestAssistantMessage({
      id: 'msg-full-meta',
      content: 'Full metadata message',
      roundNumber: 1,
      participantId: 'participant-123',
      participantIndex: 2,
      model: 'gpt-4-turbo',
      finishReason: FinishReasons.STOP,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [
          createTestUserMessage({ id: 'user-1', content: 'Q', roundNumber: 1 }),
          msg,
        ],
        changelog: [],
        analyses: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');

    if (messagesItem?.type === 'messages') {
      const assistantMsg = messagesItem.data.find(m => m.role === 'assistant');
      const meta = assistantMsg?.metadata as DbAssistantMessageMetadata;

      expect(meta.roundNumber).toBe(1);
      expect(meta.participantId).toBe('participant-123');
      expect(meta.participantIndex).toBe(2);
      expect(meta.model).toBe('gpt-4-turbo');
      expect(meta.finishReason).toBe(FinishReasons.STOP);
    }
  });

  it('should preserve user message metadata', () => {
    const msg = createTestUserMessage({
      id: 'user-detailed',
      content: 'User question',
      roundNumber: 5,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');

    if (messagesItem?.type === 'messages') {
      const userMsg = messagesItem.data.find(m => m.role === 'user');
      const meta = userMsg?.metadata as DbUserMessageMetadata;

      expect(meta.roundNumber).toBe(5);
      expect(meta.role).toBe(MessageRoles.USER);
    }
  });

  it('should handle null/undefined metadata values', () => {
    const msg = createTestAssistantMessage({
      id: 'msg-nullable',
      content: 'Message with nulls',
      roundNumber: 0,
      participantId: 'p0',
      participantIndex: 0,
    });

    // The helper sets participantRole to null by default
    const meta = msg.metadata as DbAssistantMessageMetadata;
    expect(meta.participantRole).toBeNull();

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [
          createTestUserMessage({ id: 'u0', content: 'Q', roundNumber: 0 }),
          msg,
        ],
        changelog: [],
        analyses: [],
      }),
    );

    // Should not crash
    expect(result.current).toHaveLength(1);
  });
});

// ============================================================================
// TIMELINE KEY UNIQUENESS TESTS
// ============================================================================

describe('timeline Key Uniqueness', () => {
  it('should generate unique keys for each timeline item', () => {
    const msgs = [
      createTestUserMessage({ id: 'u0', content: 'R0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'a0',
        content: 'A0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestUserMessage({ id: 'u1', content: 'R1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'a1',
        content: 'A1',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    const changelog = [
      {
        id: 'cl-1',
        threadId: 'thread',
        roundNumber: 1,
        changeType: 'mode_change' as const,
        changeData: {},
        createdAt: new Date(),
      },
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: msgs,
        changelog,
        analyses: [],
      }),
    );

    // Collect all keys
    const keys = result.current.map(item => item.key);

    // All keys should be unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('should include roundNumber in timeline item keys', () => {
    const msgs = [
      createTestUserMessage({ id: 'u0', content: 'R0', roundNumber: 0 }),
      createTestUserMessage({ id: 'u1', content: 'R1', roundNumber: 1 }),
      createTestUserMessage({ id: 'u2', content: 'R2', roundNumber: 2 }),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: msgs,
        changelog: [],
        analyses: [],
      }),
    );

    // Keys should contain round numbers
    result.current.forEach((item) => {
      expect(item.key).toContain(`round-${item.roundNumber}`);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  it('should handle empty messages array', () => {
    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [],
        changelog: [],
        analyses: [],
      }),
    );

    expect(result.current).toHaveLength(0);
  });

  it('should handle very large round numbers', () => {
    const largeRound = 999999;

    const msg = createTestUserMessage({
      id: `user-r${largeRound}`,
      content: 'Large round',
      roundNumber: largeRound,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(largeRound);
  });

  it('should handle negative round numbers gracefully', () => {
    // This shouldn't happen in practice, but test resilience
    const msg = createTestUserMessage({
      id: 'user-negative',
      content: 'Negative round',
      roundNumber: -1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    // Should still work
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(-1);
  });

  it('should handle very long message IDs', () => {
    const longId = 'a'.repeat(1000);

    const msg = createTestUserMessage({
      id: longId,
      content: 'Long ID message',
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle special characters in IDs', () => {
    const specialId = 'msg-with-special_chars.and/slashes:colons';

    const msg = createTestUserMessage({
      id: specialId,
      content: 'Special ID',
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle messages with empty content', () => {
    const msg = createTestUserMessage({
      id: 'empty-content',
      content: '',
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle messages with only whitespace content', () => {
    const msg = createTestUserMessage({
      id: 'whitespace-content',
      content: '   \n\t  ',
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        messages: [msg],
        changelog: [],
        analyses: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });
});
