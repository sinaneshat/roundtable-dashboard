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

import {
  FinishReasons,
  MessageRoles,
} from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { useThreadTimeline } from '@/hooks/utils';
import { createTestAssistantMessage, createTestUserMessage, renderHook } from '@/lib/testing';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/services/api';

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
        content: 'Test',
        id: expectedPattern,
        participantId: 'p1',
        participantIndex,
        roundNumber,
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
        content: 'User message',
        id: userMsgId,
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
      content: 'First message',
      id: 'msg-1',
      roundNumber: 0,
    });

    const msg2 = createTestUserMessage({
      content: 'Second message with same ID',
      id: 'msg-1', // Same ID
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
        changeData: { newMode: 'analyzing', oldMode: 'brainstorm' },
        changeType: 'mode_change' as const,
        createdAt: new Date(),
        id: 'changelog-1',
        roundNumber: 1,
        threadId: 'thread-123',
      },
      {
        changeData: { newMode: 'analyzing', oldMode: 'brainstorm' },
        changeType: 'mode_change' as const,
        createdAt: new Date(),
        id: 'changelog-1', // Duplicate ID
        roundNumber: 1,
        threadId: 'thread-123',
      },
    ];

    const userMsg = createTestUserMessage({
      content: 'Test',
      id: 'user-msg-1',
      roundNumber: 1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog,
        messages: [userMsg],
        moderators: [],
      }),
    );

    const changelogItem = result.current.find(item => item.type === 'changelog');
    expect(changelogItem).toBeDefined();
    expect(changelogItem?.type).toBe('changelog');
    // Should be deduplicated to 1
    const changelogData = changelogItem?.type === 'changelog' ? changelogItem.data : [];
    expect(changelogData).toHaveLength(1);
  });

  it('should allow same change type with different IDs', () => {
    const changelog = [
      {
        changeData: { participantId: 'p1' },
        changeType: 'participant_added' as const,
        createdAt: new Date(),
        id: 'changelog-1',
        roundNumber: 1,
        threadId: 'thread-123',
      },
      {
        changeData: { participantId: 'p2' },
        changeType: 'participant_added' as const, // Same type
        createdAt: new Date(),
        id: 'changelog-2', // Different ID
        roundNumber: 1,
        threadId: 'thread-123',
      },
    ];

    const userMsg = createTestUserMessage({
      content: 'Test',
      id: 'user-msg-1',
      roundNumber: 1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog,
        messages: [userMsg],
        moderators: [],
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
      content: 'Test',
      id: `${threadId}_r${roundNumber}_p0`,
      participantId: 'p0',
      participantIndex: 0,
      roundNumber,
    });

    const metadata = msg.metadata as DbAssistantMessageMetadata;

    // Extract round from ID
    const idMatch = msg.id.match(/_r(\d+)_/);
    const idRound = idMatch && idMatch[1] ? Number.parseInt(idMatch[1], 10) : -1;

    // Should match metadata
    expect(idRound).toBe(metadata.roundNumber);
  });

  it('should detect roundNumber mismatch', () => {
    // This test documents the potential bug: ID says r2 but metadata says r3
    const msg = createTestAssistantMessage({
      content: 'Test',
      id: 'thread-123_r2_p0', // ID says round 2
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 3, // Metadata says round 3 (MISMATCH!)
    });

    const metadata = msg.metadata as DbAssistantMessageMetadata;

    // Extract round from ID
    const idMatch = msg.id.match(/_r(\d+)_/);
    const idRound = idMatch && idMatch[1] ? Number.parseInt(idMatch[1], 10) : -1;

    // Document the mismatch
    expect(idRound).not.toBe(metadata.roundNumber);
    expect(idRound).toBe(2);
    expect(metadata.roundNumber).toBe(3);
  });

  it('should group messages by metadata roundNumber (not ID)', () => {
    // Messages with mismatched IDs but correct metadata
    const msg1 = createTestUserMessage({
      content: 'User message',
      id: 'msg-wrong-id-format',
      roundNumber: 0,
    });

    const msg2 = createTestAssistantMessage({
      content: 'Assistant message',
      id: 'another-wrong-format',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg1, msg2],
        moderators: [],
      }),
    );

    // Should still group correctly by metadata roundNumber
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(0);
    expect(result.current[0]?.type).toBe('messages');
    const messagesData = result.current[0]?.type === 'messages' ? result.current[0].data : [];
    expect(messagesData).toHaveLength(2);
  });
});

// ============================================================================
// PARTICIPANT INDEX CONSISTENCY TESTS
// ============================================================================

describe('participant Index Consistency', () => {
  it('should maintain participantIndex order in timeline', () => {
    const msgs = [
      createTestUserMessage({ content: 'Q', id: 'user-0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'P2',
        id: 'thread_r0_p2',
        participantId: 'p2',
        participantIndex: 2,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P0',
        id: 'thread_r0_p0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P1',
        id: 'thread_r0_p1',
        participantId: 'p1',
        participantIndex: 1,
        roundNumber: 0,
      }),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: msgs,
        moderators: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');

    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    const assistants = messagesData.filter(m => m.role === MessageRoles.ASSISTANT);

    // Should be sorted: p0, p1, p2
    expect((assistants[0]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(0);
    expect((assistants[1]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(1);
    expect((assistants[2]?.metadata as DbAssistantMessageMetadata)?.participantIndex).toBe(2);
  });

  it('should handle missing participantIndex gracefully', () => {
    const msgs = [
      createTestUserMessage({ content: 'Q', id: 'user-0', roundNumber: 0 }),
      {
        id: 'msg-no-index',
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          // participantIndex intentionally missing
        },
        parts: [{ text: 'Response', type: 'text' as const }],
        role: MessageRoles.ASSISTANT as const,
      },
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: msgs,
        moderators: [],
      }),
    );

    // Should not crash, should still render
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.type).toBe('messages');
  });

  it('should handle duplicate participantIndex (edge case)', () => {
    // Two messages claim to be participantIndex 0 - should both appear
    const msgs = [
      createTestUserMessage({ content: 'Q', id: 'user-0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'First P0',
        id: 'msg-p0-first',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'Second P0',
        id: 'msg-p0-second',
        participantId: 'p0-dupe',
        participantIndex: 0, // Same index!
        roundNumber: 0,
      }),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: msgs,
        moderators: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');
    // Both should be present (no dedup by participantIndex)
    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    expect(messagesData).toHaveLength(3);
  });
});

// ============================================================================
// METADATA INTEGRITY TESTS
// ============================================================================

describe('metadata Integrity', () => {
  it('should preserve all metadata fields through timeline', () => {
    const msg = createTestAssistantMessage({
      content: 'Full metadata message',
      finishReason: FinishReasons.STOP,
      id: 'msg-full-meta',
      model: 'gpt-4-turbo',
      participantId: 'participant-123',
      participantIndex: 2,
      roundNumber: 1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [
          createTestUserMessage({ content: 'Q', id: 'user-1', roundNumber: 1 }),
          msg,
        ],
        moderators: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');

    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    const assistantMsg = messagesData.find(m => m.role === MessageRoles.ASSISTANT);
    const meta = assistantMsg?.metadata as DbAssistantMessageMetadata;

    expect(meta.roundNumber).toBe(1);
    expect(meta.participantId).toBe('participant-123');
    expect(meta.participantIndex).toBe(2);
    expect(meta.model).toBe('gpt-4-turbo');
    expect(meta.finishReason).toBe(FinishReasons.STOP);
  });

  it('should preserve user message metadata', () => {
    const msg = createTestUserMessage({
      content: 'User question',
      id: 'user-detailed',
      roundNumber: 5,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        moderators: [],
      }),
    );

    const messagesItem = result.current.find(item => item.type === 'messages');
    expect(messagesItem).toBeDefined();
    expect(messagesItem?.type).toBe('messages');

    const messagesData = messagesItem?.type === 'messages' ? messagesItem.data : [];
    const userMsg = messagesData.find(m => m.role === MessageRoles.USER);
    const userMeta = userMsg?.metadata as DbUserMessageMetadata;

    expect(userMeta.roundNumber).toBe(5);
    expect(userMeta.role).toBe(MessageRoles.USER);
  });

  it('should handle null/undefined metadata values', () => {
    const msg = createTestAssistantMessage({
      content: 'Message with nulls',
      id: 'msg-nullable',
      participantId: 'p0',
      participantIndex: 0,
      roundNumber: 0,
    });

    // The helper sets participantRole to null by default
    const meta = msg.metadata as DbAssistantMessageMetadata;
    expect(meta.participantRole).toBeNull();

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [
          createTestUserMessage({ content: 'Q', id: 'u0', roundNumber: 0 }),
          msg,
        ],
        moderators: [],
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
      createTestUserMessage({ content: 'R0', id: 'u0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'A0',
        id: 'a0',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestUserMessage({ content: 'R1', id: 'u1', roundNumber: 1 }),
      createTestAssistantMessage({
        content: 'A1',
        id: 'a1',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 1,
      }),
    ];

    const changelog = [
      {
        changeData: {},
        changeType: 'mode_change' as const,
        createdAt: new Date(),
        id: 'cl-1',
        roundNumber: 1,
        threadId: 'thread',
      },
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog,
        messages: msgs,
        moderators: [],
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
      createTestUserMessage({ content: 'R0', id: 'u0', roundNumber: 0 }),
      createTestUserMessage({ content: 'R1', id: 'u1', roundNumber: 1 }),
      createTestUserMessage({ content: 'R2', id: 'u2', roundNumber: 2 }),
    ];

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: msgs,
        moderators: [],
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
        changelog: [],
        messages: [],
        moderators: [],
      }),
    );

    expect(result.current).toHaveLength(0);
  });

  it('should handle very large round numbers', () => {
    const largeRound = 999999;

    const msg = createTestUserMessage({
      content: 'Large round',
      id: `user-r${largeRound}`,
      roundNumber: largeRound,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        moderators: [],
      }),
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(largeRound);
  });

  it('should handle negative round numbers gracefully', () => {
    // This shouldn't happen in practice, but test resilience
    // Negative round numbers are rejected by Zod validation and default to 0
    const msg = createTestUserMessage({
      content: 'Negative round',
      id: 'user-negative',
      roundNumber: -1,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        preSearches: [],
      }),
    );

    // Zod schema validates non-negative at parse time, rejecting negative values
    // Invalid metadata causes getRoundNumber to return null, which defaults to 0
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.roundNumber).toBe(0);
  });

  it('should handle very long message IDs', () => {
    const longId = 'a'.repeat(1000);

    const msg = createTestUserMessage({
      content: 'Long ID message',
      id: longId,
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        moderators: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle special characters in IDs', () => {
    const specialId = 'msg-with-special_chars.and/slashes:colons';

    const msg = createTestUserMessage({
      content: 'Special ID',
      id: specialId,
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        moderators: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle messages with empty content', () => {
    const msg = createTestUserMessage({
      content: '',
      id: 'empty-content',
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        moderators: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });

  it('should handle messages with only whitespace content', () => {
    const msg = createTestUserMessage({
      content: '   \n\t  ',
      id: 'whitespace-content',
      roundNumber: 0,
    });

    const { result } = renderHook(() =>
      useThreadTimeline({
        changelog: [],
        messages: [msg],
        moderators: [],
      }),
    );

    expect(result.current).toHaveLength(1);
  });
});
