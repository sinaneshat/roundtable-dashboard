/**
 * Stream Resumption Deduplication Tests
 *
 * Tests for fixes applied to prevent duplicate messages and parts during stream resumption:
 *
 * 1. DUPLICATE MESSAGE PREVENTION:
 *    - When page refreshes mid-stream, don't create duplicate messages for participants
 *    - Check if message with participant's ID already exists before triggering
 *
 * 2. DUPLICATE PARTS DEDUPLICATION:
 *    - When AI SDK resumes and hydration both add parts, deduplicate them
 *    - Parts with same type and content should be merged (prefer 'state: done')
 *
 * 3. INCOMPLETE ROUND DETECTION:
 *    - Messages with finishReason: 'unknown' + content → count as responded
 *    - Messages with finishReason: 'unknown' + NO content → DON'T count (retry)
 *
 * 4. STREAM CONTINUATION:
 *    - After refresh, continue with next participant, not retry completed ones
 *
 * Location: /src/stores/chat/__tests__/stream-resumption-deduplication.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import { getAssistantMetadata } from '@/lib/utils/metadata';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipants,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// Helper Functions - Extracted from actual implementation for testing
// ============================================================================

/**
 * Simulates the duplicate parts deduplication logic from chat-store-provider
 */
function deduplicateMessageParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== MessageRoles.ASSISTANT || !msg.parts || msg.parts.length <= 1) {
      return msg;
    }

    const seenParts = new Map<string, (typeof msg.parts)[0]>();

    for (const part of msg.parts) {
      let key: string;
      if (part.type === 'text' && 'text' in part) {
        key = `text:${part.text}`;
      } else if (part.type === 'reasoning' && 'text' in part) {
        key = `reasoning:${part.text}`;
      } else if (part.type === 'step-start') {
        key = 'step-start';
      } else {
        key = `other:${Math.random()}`;
      }

      const existing = seenParts.get(key);
      if (!existing) {
        seenParts.set(key, part);
      } else {
        const existingHasState = 'state' in existing && existing.state === 'done';
        const currentHasState = 'state' in part && part.state === 'done';

        if (currentHasState && !existingHasState) {
          seenParts.set(key, part);
        }
      }
    }

    const uniqueParts = Array.from(seenParts.values());

    if (uniqueParts.length === msg.parts.length) {
      return msg;
    }

    return { ...msg, parts: uniqueParts };
  });
}

/**
 * Simulates incomplete round detection logic
 */
function detectRespondedParticipants(
  messages: UIMessage[],
  currentRoundNumber: number,
): Set<number> {
  const respondedParticipantIndices = new Set<number>();

  for (const msg of messages) {
    if (msg.role !== MessageRoles.ASSISTANT)
      continue;

    const metadata = msg.metadata as Record<string, unknown> | undefined;
    if (!metadata)
      continue;

    const msgRound = metadata.roundNumber as number | undefined;
    const participantIndex = metadata.participantIndex as number | undefined;

    if (msgRound !== currentRoundNumber || participantIndex === undefined)
      continue;

    // Check if message is still streaming
    const isStillStreaming = msg.parts?.some(
      p => 'state' in p && p.state === 'streaming',
    ) || false;

    // Check for empty interrupted response
    const assistantMetadata = getAssistantMetadata(msg.metadata);
    const hasTextContent = msg.parts?.some(
      p => p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0,
    ) || false;

    const isEmptyInterruptedResponse = assistantMetadata?.finishReason === 'unknown'
      && assistantMetadata?.usage?.totalTokens === 0
      && !hasTextContent;

    if (!isStillStreaming && !isEmptyInterruptedResponse) {
      respondedParticipantIndices.add(participantIndex);
    }
  }

  return respondedParticipantIndices;
}

/**
 * Check if a message with the given ID already exists and has content
 */
function hasCompleteMessageForParticipant(
  messages: UIMessage[],
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): boolean {
  const expectedMessageId = `${threadId}_r${roundNumber}_p${participantIndex}`;
  const existingMessage = messages.find(m => m.id === expectedMessageId);

  if (!existingMessage)
    return false;

  const existingMetadata = getAssistantMetadata(existingMessage.metadata);
  const hasContent = existingMessage.parts?.some(
    p => p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0,
  ) || false;
  const isComplete = hasContent && existingMetadata?.finishReason !== 'unknown';

  return isComplete;
}

// ============================================================================
// Tests
// ============================================================================

describe('stream Resumption Deduplication', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('duplicate Parts Deduplication', () => {
    it('should deduplicate text parts with same content', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'text', text: 'Hi' }, // From hydration (no state)
            { type: 'text', text: 'Hi', state: 'done' }, // From resume (has state)
          ],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      expect(deduplicated[0].parts).toHaveLength(1);
      expect(deduplicated[0].parts![0]).toHaveProperty('state', 'done');
    });

    it('should deduplicate reasoning parts with same content', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'reasoning', text: '[REDACTED]' },
            { type: 'step-start' },
            { type: 'reasoning', text: '[REDACTED]', state: 'done' },
          ],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      // Should have: 1 reasoning + 1 step-start = 2
      expect(deduplicated[0].parts).toHaveLength(2);
    });

    it('should keep multiple step-start parts (only one allowed)', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'step-start' },
            { type: 'text', text: 'Hello' },
            { type: 'step-start' }, // Duplicate
          ],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      // step-start should be deduplicated to 1
      const stepStartCount = deduplicated[0].parts!.filter(p => p.type === 'step-start').length;
      expect(stepStartCount).toBe(1);
    });

    it('should prefer parts with state: done over parts without state', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'text', text: 'Response' }, // No state (from hydration)
            { type: 'text', text: 'Response', state: 'done' }, // Has state (from resume)
          ],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      expect(deduplicated[0].parts).toHaveLength(1);
      expect((deduplicated[0].parts![0] as { state?: string }).state).toBe('done');
    });

    it('should NOT deduplicate different text content', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      expect(deduplicated[0].parts).toHaveLength(2);
    });

    it('should handle user messages without modification', () => {
      const messages: UIMessage[] = [
        {
          id: 'user-msg-0',
          role: MessageRoles.USER,
          parts: [
            { type: 'text', text: 'Question' },
            { type: 'text', text: 'Question' }, // Even duplicates in user msg
          ],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      // User messages should not be modified
      expect(deduplicated[0].parts).toHaveLength(2);
    });

    it('should handle complex resume scenario with multiple part types', () => {
      // Simulates actual Grok response with reasoning + text duplicates
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'text', text: 'Hi' }, // From hydration
            { type: 'reasoning', text: '[REDACTED]' }, // From hydration
            { type: 'step-start' }, // From resume
            { type: 'reasoning', text: '[REDACTED]', state: 'done' }, // From resume
            { type: 'text', text: 'Hi', state: 'done' }, // From resume
          ],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 1,
            participantRole: 'Free Market Theorist',
            model: 'x-ai/grok-4-fast',
            finishReason: 'stop',
          },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      // Should have: 1 text + 1 reasoning + 1 step-start = 3
      expect(deduplicated[0].parts).toHaveLength(3);

      // Verify each type
      const types = deduplicated[0].parts!.map(p => p.type);
      expect(types).toContain('text');
      expect(types).toContain('reasoning');
      expect(types).toContain('step-start');
    });
  });

  describe('incomplete Round Detection with finishReason: unknown', () => {
    it('should count message with content + finishReason: unknown as responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hello!' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 0,
            finishReason: 'unknown', // Interrupted but has content
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(true);
    });

    it('should NOT count empty message with finishReason: unknown as responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [], // No content
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: 'Test Role',
            model: 'openai/gpt-4',
            finishReason: 'unknown',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(false);
    });

    it('should NOT count whitespace-only message as responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: '   ' }], // Whitespace only
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: 'Test Role',
            model: 'openai/gpt-4',
            finishReason: 'unknown',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(false);
    });

    it('should count normal completion as responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hello!' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 0,
            finishReason: 'stop', // Normal completion
            usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(true);
    });

    it('should NOT count still-streaming message as responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hello', state: 'streaming' }], // Still streaming
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 0,
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(false);
    });

    it('should detect multiple participants responded status correctly', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        // Participant 0: Complete
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Response 0' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: 'Test Role',
            model: 'openai/gpt-4',
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
        // Participant 1: Interrupted with content
        {
          id: 'thread-123_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Response 1' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: 'participant-1',
            participantIndex: 1,
            participantRole: 'Test Role',
            model: 'openai/gpt-4',
            finishReason: 'unknown',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
        // Participant 2: Interrupted WITHOUT content (should retry)
        {
          id: 'thread-123_r0_p2',
          role: MessageRoles.ASSISTANT,
          parts: [],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: 'participant-2',
            participantIndex: 2,
            participantRole: 'Test Role',
            model: 'openai/gpt-4',
            finishReason: 'unknown',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(true); // Complete
      expect(responded.has(1)).toBe(true); // Has content even if unknown
      expect(responded.has(2)).toBe(false); // No content, should retry
    });
  });

  describe('duplicate Message Prevention', () => {
    it('should detect existing complete message for participant', () => {
      const threadId = 'thread-123';
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0, {
          id: `${threadId}_r0_p0`,
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 0,
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
          },
        }),
      ];

      const hasComplete = hasCompleteMessageForParticipant(messages, threadId, 0, 0);

      expect(hasComplete).toBe(true);
    });

    it('should NOT detect incomplete message as complete', () => {
      const threadId = 'thread-123';
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        {
          id: `${threadId}_r0_p0`,
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: 'Test Role',
            model: 'openai/gpt-4',
            finishReason: 'unknown', // Interrupted
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      const hasComplete = hasCompleteMessageForParticipant(messages, threadId, 0, 0);

      expect(hasComplete).toBe(false);
    });

    it('should NOT detect missing message as complete', () => {
      const threadId = 'thread-123';
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0), // Participant 0 exists
      ];

      // Check for participant 1 which doesn't exist
      const hasComplete = hasCompleteMessageForParticipant(messages, threadId, 0, 1);

      expect(hasComplete).toBe(false);
    });

    it('should check correct round number', () => {
      const threadId = 'thread-123';
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0, { id: `${threadId}_r0_p0` }), // Round 0
      ];

      // Round 0 participant 0 exists
      expect(hasCompleteMessageForParticipant(messages, threadId, 0, 0)).toBe(true);

      // Round 1 participant 0 does NOT exist
      expect(hasCompleteMessageForParticipant(messages, threadId, 1, 0)).toBe(false);
    });
  });

  describe('stream Resumption Round Continuation', () => {
    it('should identify next participant when some have responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0), // Participant 0 responded
        createMockMessage(1, 0), // Participant 1 responded
        // Participants 2 and 3 have NOT responded
      ];

      const responded = detectRespondedParticipants(messages, 0);
      const totalParticipants = 4;

      // Find first non-responded participant
      let nextParticipant: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        if (!responded.has(i)) {
          nextParticipant = i;
          break;
        }
      }

      expect(nextParticipant).toBe(2);
    });

    it('should return null when all participants have responded', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockMessage(2, 0),
        createMockMessage(3, 0),
      ];

      const responded = detectRespondedParticipants(messages, 0);
      const totalParticipants = 4;

      // Find first non-responded participant
      let nextParticipant: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        if (!responded.has(i)) {
          nextParticipant = i;
          break;
        }
      }

      expect(nextParticipant).toBeNull();
    });

    it('should handle gap in participant responses', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0), // Participant 0 responded
        // Participant 1 did NOT respond
        createMockMessage(2, 0), // Participant 2 responded (out of order from DB)
      ];

      const responded = detectRespondedParticipants(messages, 0);

      expect(responded.has(0)).toBe(true);
      expect(responded.has(1)).toBe(false); // Gap
      expect(responded.has(2)).toBe(true);

      // Next should be 1 (the gap)
      const totalParticipants = 4;
      let nextParticipant: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        if (!responded.has(i)) {
          nextParticipant = i;
          break;
        }
      }

      expect(nextParticipant).toBe(1);
    });
  });

  describe('store Integration - Message Management', () => {
    it('should correctly initialize thread with participants', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(4);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      expect(store.getState().thread?.id).toBe(threadId);
      expect(store.getState().participants).toHaveLength(4);
    });

    it('should set messages correctly', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2),
      );

      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0, { id: `${threadId}_r0_p0` }),
      ];

      store.getState().setMessages(messages);

      expect(store.getState().messages).toHaveLength(2);
    });

    it('should preserve message order when setting messages', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(4),
      );

      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0, { id: `${threadId}_r0_p0` }),
        createMockMessage(1, 0, { id: `${threadId}_r0_p1` }),
        createMockMessage(2, 0, { id: `${threadId}_r0_p2` }),
      ];

      store.getState().setMessages(messages);

      const storedMessages = store.getState().messages;
      expect(storedMessages[0].id).toBe('user-msg-0');
      expect(storedMessages[1].id).toBe(`${threadId}_r0_p0`);
      expect(storedMessages[2].id).toBe(`${threadId}_r0_p1`);
      expect(storedMessages[3].id).toBe(`${threadId}_r0_p2`);
    });
  });

  describe('edge Cases', () => {
    it('should handle empty messages array', () => {
      const deduplicated = deduplicateMessageParts([]);
      expect(deduplicated).toHaveLength(0);
    });

    it('should handle message with no parts', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: undefined as unknown as UIMessage['parts'],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);
      expect(deduplicated[0].parts).toBeUndefined();
    });

    it('should handle message with single part', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Single part' }],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);
      expect(deduplicated[0].parts).toHaveLength(1);
    });

    it('should handle multiple rounds correctly', () => {
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
        // Round 1, participant 1 not yet responded
      ];

      // Round 0 should be complete
      const round0Responded = detectRespondedParticipants(messages, 0);
      expect(round0Responded.has(0)).toBe(true);
      expect(round0Responded.has(1)).toBe(true);

      // Round 1 should be incomplete
      const round1Responded = detectRespondedParticipants(messages, 1);
      expect(round1Responded.has(0)).toBe(true);
      expect(round1Responded.has(1)).toBe(false);
    });

    it('should handle file parts without deduplication', () => {
      const messages: UIMessage[] = [
        {
          id: 'thread-123_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'file' as 'text', url: 'https://example.com/file1.pdf' },
            { type: 'file' as 'text', url: 'https://example.com/file2.pdf' },
            { type: 'text', text: 'Here are the files' },
          ],
          metadata: { role: 'assistant', roundNumber: 0, participantIndex: 0 },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      // File parts should not be deduplicated (each gets unique key)
      expect(deduplicated[0].parts!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('regression Tests', () => {
    it('rEGRESSION: Grok response with duplicate reasoning and text', () => {
      // Actual scenario from user report
      const messages: UIMessage[] = [
        {
          id: '01KBNFD79V8HGA478CAY888YP6_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: 'text', text: 'Hi' },
            { type: 'reasoning', text: '[REDACTED]' },
            { type: 'step-start' },
            {
              type: 'reasoning',
              text: '[REDACTED]',
              providerMetadata: { openrouter: { reasoning_details: [] } },
              state: 'done',
            },
            { type: 'text', text: 'Hi', state: 'done' },
          ],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantId: '01KBNFD7AGC7T78JDR4TAPR38K',
            participantIndex: 1,
            participantRole: 'Free Market Theorist',
            model: 'x-ai/grok-4-fast',
            finishReason: 'stop',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 3251 },
          },
        },
      ];

      const deduplicated = deduplicateMessageParts(messages);

      // Should deduplicate: 2 text -> 1, 2 reasoning -> 1, 1 step-start = 3 total
      expect(deduplicated[0].parts).toHaveLength(3);

      const textParts = deduplicated[0].parts!.filter(p => p.type === 'text');
      const reasoningParts = deduplicated[0].parts!.filter(p => p.type === 'reasoning');
      const stepStartParts = deduplicated[0].parts!.filter(p => p.type === 'step-start');

      expect(textParts).toHaveLength(1);
      expect(reasoningParts).toHaveLength(1);
      expect(stepStartParts).toHaveLength(1);

      // Text should have state: done
      expect((textParts[0] as { state?: string }).state).toBe('done');
    });

    it('rEGRESSION: Participant with finishReason unknown should continue round', () => {
      // Scenario: User refreshes, participant 1 has content but unknown finish
      const messages: UIMessage[] = [
        createMockUserMessage(0, 'say hi'),
        // Participant 0: Complete
        {
          id: 'thread_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hello!' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 0,
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 2, totalTokens: 102 },
          },
        },
        // Participant 1: Has content but unknown finish (from synthetic finish event)
        {
          id: 'thread_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hello!' }],
          metadata: {
            role: 'assistant',
            roundNumber: 0,
            participantIndex: 1,
            finishReason: 'unknown',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
        },
      ];

      const responded = detectRespondedParticipants(messages, 0);

      // Both should be counted as responded (participant 1 has content)
      expect(responded.has(0)).toBe(true);
      expect(responded.has(1)).toBe(true);

      // Next participant should be 2
      const totalParticipants = 4;
      let nextParticipant: number | null = null;
      for (let i = 0; i < totalParticipants; i++) {
        if (!responded.has(i)) {
          nextParticipant = i;
          break;
        }
      }

      expect(nextParticipant).toBe(2);
    });
  });
});
