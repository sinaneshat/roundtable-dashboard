import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  getMessageMatchKey,
  getModeratorStreamingId,
  getParticipantStreamingId,
  hasStreamingPlaceholders,
  isPlaceholderId,
  mergeServerMessages,
} from '../streaming-helpers';

describe('streaming-helpers', () => {
  describe('getParticipantStreamingId', () => {
    it('generates correct ID format', () => {
      expect(getParticipantStreamingId(0, 0)).toBe('streaming_p0_r0');
      expect(getParticipantStreamingId(1, 2)).toBe('streaming_p1_r2');
      expect(getParticipantStreamingId(5, 10)).toBe('streaming_p5_r10');
    });
  });

  describe('getModeratorStreamingId', () => {
    it('uses threadId when available', () => {
      expect(getModeratorStreamingId('thread123', 0)).toBe('thread123_r0_moderator');
      expect(getModeratorStreamingId('abc', 5)).toBe('abc_r5_moderator');
    });

    it('falls back to streaming prefix when no threadId', () => {
      expect(getModeratorStreamingId(null, 0)).toBe('streaming_moderator_r0');
      expect(getModeratorStreamingId(null, 3)).toBe('streaming_moderator_r3');
    });
  });

  describe('isPlaceholderId', () => {
    it('identifies streaming placeholder IDs', () => {
      expect(isPlaceholderId('streaming_p0_r0')).toBe(true);
      expect(isPlaceholderId('streaming_moderator_r0')).toBe(true);
      expect(isPlaceholderId('streaming_anything')).toBe(true);
    });

    it('identifies non-placeholder IDs', () => {
      expect(isPlaceholderId('thread123_r0_p0')).toBe(false);
      expect(isPlaceholderId('thread123_r0_moderator')).toBe(false);
      expect(isPlaceholderId('regular-id')).toBe(false);
    });
  });

  describe('hasStreamingPlaceholders', () => {
    it('detects placeholder IDs', () => {
      const messages: UIMessage[] = [
        { id: 'streaming_p0_r0', parts: [], role: MessageRoles.ASSISTANT },
      ];
      expect(hasStreamingPlaceholders(messages)).toBe(true);
    });

    it('detects streaming metadata', () => {
      const messages: UIMessage[] = [
        {
          id: 'real-id',
          metadata: { isStreaming: true },
          parts: [],
          role: MessageRoles.ASSISTANT,
        },
      ];
      expect(hasStreamingPlaceholders(messages)).toBe(true);
    });

    it('returns false for non-streaming messages', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread123_r0_p0',
          metadata: { isStreaming: false },
          parts: [],
          role: MessageRoles.ASSISTANT,
        },
      ];
      expect(hasStreamingPlaceholders(messages)).toBe(false);
    });
  });

  describe('getMessageMatchKey', () => {
    it('generates key for participant messages', () => {
      const msg: UIMessage = {
        id: 'test',
        metadata: { participantIndex: 0, roundNumber: 0 },
        parts: [],
        role: MessageRoles.ASSISTANT,
      };
      expect(getMessageMatchKey(msg)).toBe('r0_p0_assistant');
    });

    it('generates key for moderator messages by metadata', () => {
      const msg: UIMessage = {
        id: 'test',
        metadata: { isModerator: true, roundNumber: 1 },
        parts: [],
        role: MessageRoles.ASSISTANT,
      };
      expect(getMessageMatchKey(msg)).toBe('r1_moderator');
    });

    it('generates key for moderator messages by ID pattern', () => {
      const msg: UIMessage = {
        id: 'thread123_r0_moderator',
        metadata: { roundNumber: 0 },
        parts: [],
        role: MessageRoles.ASSISTANT,
      };
      expect(getMessageMatchKey(msg)).toBe('r0_moderator');
    });

    it('returns null for messages without roundNumber', () => {
      const msg: UIMessage = {
        id: 'test',
        metadata: {},
        parts: [],
        role: MessageRoles.ASSISTANT,
      };
      expect(getMessageMatchKey(msg)).toBeNull();
    });

    it('returns null for messages without metadata', () => {
      const msg: UIMessage = {
        id: 'test',
        parts: [],
        role: MessageRoles.ASSISTANT,
      };
      expect(getMessageMatchKey(msg)).toBeNull();
    });
  });

  describe('mergeServerMessages', () => {
    const createMessage = (
      id: string,
      roundNumber: number,
      participantIndex: number,
      content = '',
    ): UIMessage => ({
      id,
      metadata: { participantIndex, roundNumber },
      parts: content ? [{ text: content, type: 'text' }] : [],
      role: MessageRoles.ASSISTANT,
    });

    const createUserMessage = (id: string, roundNumber: number): UIMessage => ({
      id,
      metadata: { roundNumber },
      parts: [{ text: 'user message', type: 'text' }],
      role: MessageRoles.USER,
    });

    it('replaces placeholders with server messages', () => {
      const current: UIMessage[] = [
        createUserMessage('user1', 0),
        createMessage('streaming_p0_r0', 0, 0, 'streaming content'),
        createMessage('streaming_p1_r0', 0, 1, 'streaming content'),
      ];

      const server: UIMessage[] = [
        createUserMessage('user1', 0),
        createMessage('thread_r0_p0', 0, 0, 'final content p0'),
        createMessage('thread_r0_p1', 0, 1, 'final content p1'),
      ];

      const result = mergeServerMessages(current, server);

      // Should have all 3 messages
      expect(result).toHaveLength(3);
      // Placeholders should be replaced with server versions
      expect(result[1].id).toBe('thread_r0_p0');
      expect(result[2].id).toBe('thread_r0_p1');
    });

    it('keeps non-placeholder messages with same ID updated from server', () => {
      const current: UIMessage[] = [
        createMessage('thread_r0_p0', 0, 0, 'old content'),
      ];

      const server: UIMessage[] = [
        createMessage('thread_r0_p0', 0, 0, 'updated content'),
      ];

      const result = mergeServerMessages(current, server);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('thread_r0_p0');
      expect(result[0].parts?.[0]).toEqual({ text: 'updated content', type: 'text' });
    });

    it('preserves local-only messages (optimistic, presearch)', () => {
      const current: UIMessage[] = [
        { id: 'optimistic_123', metadata: {}, parts: [], role: MessageRoles.USER },
        { id: 'presearch_r0', metadata: { roundNumber: 0 }, parts: [], role: MessageRoles.ASSISTANT },
      ];

      const server: UIMessage[] = [
        createMessage('thread_r0_p0', 0, 0, 'server content'),
      ];

      const result = mergeServerMessages(current, server);

      // Should have 3 messages: 2 local + 1 server
      expect(result).toHaveLength(3);
      expect(result.find(m => m.id === 'optimistic_123')).toBeDefined();
      expect(result.find(m => m.id === 'presearch_r0')).toBeDefined();
      expect(result.find(m => m.id === 'thread_r0_p0')).toBeDefined();
    });

    it('adds new server messages not in current state', () => {
      const current: UIMessage[] = [
        createUserMessage('user1', 0),
        createMessage('streaming_p0_r0', 0, 0, 'content'),
      ];

      const server: UIMessage[] = [
        createUserMessage('user1', 0),
        createMessage('thread_r0_p0', 0, 0, 'final p0'),
        createMessage('thread_r0_p1', 0, 1, 'final p1'),
        { // moderator
          id: 'thread_r0_moderator',
          metadata: { isModerator: true, roundNumber: 0 },
          parts: [{ text: 'moderator summary', type: 'text' }],
          role: MessageRoles.ASSISTANT,
        },
      ];

      const result = mergeServerMessages(current, server);

      // Should have user + p0 (replaced) + p1 (added) + moderator (added)
      expect(result).toHaveLength(4);
      expect(result.map(m => m.id)).toContain('thread_r0_p0');
      expect(result.map(m => m.id)).toContain('thread_r0_p1');
      expect(result.map(m => m.id)).toContain('thread_r0_moderator');
    });

    it('handles empty current messages', () => {
      const current: UIMessage[] = [];

      const server: UIMessage[] = [
        createUserMessage('user1', 0),
        createMessage('thread_r0_p0', 0, 0, 'content'),
      ];

      const result = mergeServerMessages(current, server);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('user1');
      expect(result[1].id).toBe('thread_r0_p0');
    });

    it('handles empty server messages', () => {
      const current: UIMessage[] = [
        createUserMessage('user1', 0),
        createMessage('streaming_p0_r0', 0, 0, 'content'),
      ];

      const server: UIMessage[] = [];

      const result = mergeServerMessages(current, server);

      // Should keep current messages since no server match
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('user1');
      expect(result[1].id).toBe('streaming_p0_r0');
    });

    it('handles multiple rounds correctly', () => {
      const current: UIMessage[] = [
        // Round 0 - already persisted
        createUserMessage('user_r0', 0),
        createMessage('thread_r0_p0', 0, 0, 'r0 p0'),
        createMessage('thread_r0_p1', 0, 1, 'r0 p1'),
        // Round 1 - streaming placeholders
        createUserMessage('user_r1', 1),
        createMessage('streaming_p0_r1', 1, 0, 'streaming r1 p0'),
        createMessage('streaming_p1_r1', 1, 1, 'streaming r1 p1'),
      ];

      const server: UIMessage[] = [
        // Round 0 - same as before
        createUserMessage('user_r0', 0),
        createMessage('thread_r0_p0', 0, 0, 'r0 p0'),
        createMessage('thread_r0_p1', 0, 1, 'r0 p1'),
        // Round 1 - completed
        createUserMessage('user_r1', 1),
        createMessage('thread_r1_p0', 1, 0, 'final r1 p0'),
        createMessage('thread_r1_p1', 1, 1, 'final r1 p1'),
      ];

      const result = mergeServerMessages(current, server);

      expect(result).toHaveLength(6);
      // Round 0 should be unchanged
      expect(result.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta.roundNumber === 0;
      })).toHaveLength(3);
      // Round 1 placeholders should be replaced
      expect(result.find(m => m.id === 'streaming_p0_r1')).toBeUndefined();
      expect(result.find(m => m.id === 'streaming_p1_r1')).toBeUndefined();
      expect(result.find(m => m.id === 'thread_r1_p0')).toBeDefined();
      expect(result.find(m => m.id === 'thread_r1_p1')).toBeDefined();
    });
  });
});
