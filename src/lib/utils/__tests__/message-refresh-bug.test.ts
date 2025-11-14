/**
 * Test to reproduce the exact bug reported by user
 *
 * BUG SCENARIO:
 * 1. User sends first message → Round 0 created with R0_P0
 * 2. Page refresh loads messages from database
 * 3. After transformation, assistant message metadata.roundNumber changes from 0 to 1
 * 4. When user sends second message, calculateNextRoundNumber returns wrong value
 *
 * EXPECTED (0-BASED):
 * - First round: roundNumber = 0, messageId = "thread_r0_p0"
 * - Second round: roundNumber = 1, messageId = "thread_r1_p0"
 *
 * ROOT CAUSE TO FIND:
 * - Why does metadata.roundNumber change from 0 to 1 during transformation?
 */

import type { ChatMessage } from '@/api/routes/chat/schema';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getRoundNumber } from '@/lib/utils/metadata';
import { calculateNextRoundNumber } from '@/lib/utils/round-utils';

describe('message refresh bug - 0-based indexing', () => {
  const THREAD_ID = '01KA1K2GD2PP0BJH2VZ9J6QRBA';
  const PARTICIPANT_ID = '01KA1K2GD9KG4KNC9GX1RJH288';

  it('should preserve roundNumber: 0 after page refresh (user bug scenario)', () => {
    // Simulate messages as they come from database after page refresh
    // This matches the user's exact scenario
    const messagesFromDatabase: ChatMessage[] = [
      {
        id: '01KA1K2GDR317P155TYWY6G4C0',
        threadId: THREAD_ID,
        participantId: null,
        role: 'user',
        parts: [{ type: 'text', text: 'say hi, 1 word only' }],
        roundNumber: 0, // ✓ Database has correct value
        toolCalls: null,
        metadata: { role: 'user', roundNumber: 0 }, // ✓ Database metadata correct
        createdAt: new Date('2025-11-14T16:27:14.000Z'),
      },
      {
        id: `${THREAD_ID}_r0_p0`, // ✓ Correct ID format
        threadId: THREAD_ID,
        participantId: PARTICIPANT_ID,
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
        roundNumber: 0, // ✓ Database has correct value
        toolCalls: null,
        metadata: {
          role: 'assistant',
          roundNumber: 0, // ✓ Database metadata correct
          participantId: PARTICIPANT_ID,
          participantIndex: 0,
          participantRole: null, // ✓ Required by schema
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
          hasError: false,
          isTransient: false, // ✓ Required by schema
          isPartialResponse: false, // ✓ Required by schema
        },
        createdAt: new Date('2025-11-14T16:27:17.000Z'),
      },
    ];

    // Transform messages (simulates what happens after page refresh)
    const transformedMessages = chatMessagesToUIMessages(messagesFromDatabase);

    // ✅ ASSERTION 1: User message must have roundNumber: 0
    expect(getRoundNumber(transformedMessages[0]?.metadata)).toBe(0);

    // ✅ ASSERTION 2: Assistant message must have roundNumber: 0 (NOT 1!)
    // This was the critical bug - after transformation it was becoming 1 or null
    const assistantMsg = transformedMessages[1];
    const assistantRound = getRoundNumber(assistantMsg?.metadata);

    expect(assistantRound).toBe(0); // CRITICAL: Must be 0, not 1

    // ✅ ASSERTION 3: Message ID must match roundNumber
    expect(assistantMsg?.id).toBe(`${THREAD_ID}_r0_p0`);

    // ✅ ASSERTION 4: Next round number must be 1 (for second message)
    const nextRound = calculateNextRoundNumber(transformedMessages);
    expect(nextRound).toBe(1);
  });

  it('should handle NULL metadata from database', () => {
    // Simulate database returning NULL metadata
    const messagesFromDatabase: ChatMessage[] = [
      {
        id: 'user-r0',
        threadId: THREAD_ID,
        participantId: null,
        role: 'user',
        parts: [{ type: 'text', text: 'Question' }],
        roundNumber: 0,
        toolCalls: null,
        metadata: null, // ✗ NULL from database
        createdAt: new Date(),
      },
      {
        id: `${THREAD_ID}_r0_p0`,
        threadId: THREAD_ID,
        participantId: PARTICIPANT_ID,
        role: 'assistant',
        parts: [{ type: 'text', text: 'Answer' }],
        roundNumber: 0,
        toolCalls: null,
        metadata: null, // ✗ NULL from database
        createdAt: new Date(),
      },
    ];

    const transformed = chatMessagesToUIMessages(messagesFromDatabase);

    // Even with NULL metadata, roundNumber from column must be preserved
    expect(getRoundNumber(transformed[0]?.metadata)).toBe(0);
    expect(getRoundNumber(transformed[1]?.metadata)).toBe(0); // CRITICAL
    expect(calculateNextRoundNumber(transformed)).toBe(1);
  });

  it('should maintain 0-based indexing for multiple rounds', () => {
    const messages: ChatMessage[] = [
      // Round 0
      {
        id: 'user-r0',
        threadId: THREAD_ID,
        participantId: null,
        role: 'user',
        parts: [{ type: 'text', text: 'Q1' }],
        roundNumber: 0,
        toolCalls: null,
        metadata: { role: 'user', roundNumber: 0 },
        createdAt: new Date(),
      },
      {
        id: `${THREAD_ID}_r0_p0`,
        threadId: THREAD_ID,
        participantId: PARTICIPANT_ID,
        role: 'assistant',
        parts: [{ type: 'text', text: 'A1' }],
        roundNumber: 0,
        toolCalls: null,
        metadata: {
          role: 'assistant',
          roundNumber: 0,
          participantId: PARTICIPANT_ID,
          participantIndex: 0,
          participantRole: null,
          model: 'gpt-4',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
        createdAt: new Date(),
      },
      // Round 1
      {
        id: 'user-r1',
        threadId: THREAD_ID,
        participantId: null,
        role: 'user',
        parts: [{ type: 'text', text: 'Q2' }],
        roundNumber: 1,
        toolCalls: null,
        metadata: { role: 'user', roundNumber: 1 },
        createdAt: new Date(),
      },
      {
        id: `${THREAD_ID}_r1_p0`,
        threadId: THREAD_ID,
        participantId: PARTICIPANT_ID,
        role: 'assistant',
        parts: [{ type: 'text', text: 'A2' }],
        roundNumber: 1,
        toolCalls: null,
        metadata: {
          role: 'assistant',
          roundNumber: 1,
          participantId: PARTICIPANT_ID,
          participantIndex: 0,
          participantRole: null,
          model: 'gpt-4',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
        createdAt: new Date(),
      },
    ];

    const transformed = chatMessagesToUIMessages(messages);

    // Verify all round numbers are preserved
    expect(getRoundNumber(transformed[0]?.metadata)).toBe(0); // User R0
    expect(getRoundNumber(transformed[1]?.metadata)).toBe(0); // Assistant R0
    expect(getRoundNumber(transformed[2]?.metadata)).toBe(1); // User R1
    expect(getRoundNumber(transformed[3]?.metadata)).toBe(1); // Assistant R1

    // Next round should be 2
    expect(calculateNextRoundNumber(transformed)).toBe(2);
  });

  it('should verify participantIndex is 0-based', () => {
    const message: ChatMessage = {
      id: `${THREAD_ID}_r0_p0`,
      threadId: THREAD_ID,
      participantId: PARTICIPANT_ID,
      role: 'assistant',
      parts: [{ type: 'text', text: 'Response' }],
      roundNumber: 0,
      toolCalls: null,
      metadata: {
        role: 'assistant',
        roundNumber: 0,
        participantId: PARTICIPANT_ID,
        participantIndex: 0, // ✓ First participant = index 0
        participantRole: null,
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        hasError: false,
        isTransient: false,
        isPartialResponse: false,
      },
      createdAt: new Date(),
    };

    const [transformed] = chatMessagesToUIMessages([message]);

    // Verify participantIndex is preserved as 0
    const metadata = transformed?.metadata as { participantIndex?: number } | undefined;
    expect(metadata?.participantIndex).toBe(0);
  });
});
