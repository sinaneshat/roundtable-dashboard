/**
 * Test: createPendingAnalysis Message ID/Metadata Mismatch After Navigation
 *
 * BUG SCENARIO:
 * 1. User is on overview screen, creates a thread with round 0
 * 2. Round 0 completes with analysis
 * 3. User is navigated to thread detail screen
 * 4. User sends new message for round 1
 * 5. Streaming completes for round 1
 * 6. createPendingAnalysis is called for round 1
 * 7. ERROR: "Message ID/metadata mismatch detected - rejecting analysis"
 *
 * EXPECTED BEHAVIOR:
 * When message ID contains _r{N}_p{M} and metadata has matching roundNumber and participantIndex,
 * no mismatch should be detected.
 *
 * Location: /src/stores/chat/__tests__/createpending-mismatch-navigation.test.ts
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ChatModes, UIMessageRoles } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat';

import {
  createMockParticipant,
  createMockThread,
} from './test-factories';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('createPendingAnalysis: Message ID/metadata mismatch detection', () => {
  let store: ReturnType<typeof createChatStore>;
  let mockThread: ChatThread;
  let mockParticipants: ChatParticipant[];

  const THREAD_ID = '01KB15Z8MNAX4YFVAXMFX4N9TX';

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();

    mockThread = createMockThread({
      id: THREAD_ID,
      slug: 'hi-7pmohz',
      title: 'Hi',
      mode: ChatModes.DEBATING,
      enableWebSearch: false,
      isAiGeneratedTitle: true,
    });

    mockParticipants = [
      createMockParticipant(0, {
        id: '01KB15Z8MZN4TMXK2KSM786N11',
        modelId: 'google/gemini-2.5-flash-lite',
      }),
    ];
  });

  /**
   * Create complete assistant message with all required metadata
   */
  function createCompleteAssistantMessage(
    roundNumber: number,
    participantIndex: number,
    options?: { id?: string; text?: string },
  ): UIMessage {
    const messageId = options?.id ?? `${THREAD_ID}_r${roundNumber}_p${participantIndex}`;
    return {
      id: messageId,
      role: UIMessageRoles.ASSISTANT,
      parts: [
        { type: 'step-start' },
        { type: 'text', text: options?.text ?? 'Test response.', state: 'done' },
      ],
      metadata: {
        role: 'assistant',
        roundNumber,
        participantId: mockParticipants[participantIndex]?.id ?? `p${participantIndex}`,
        participantIndex,
        participantRole: null,
        model: mockParticipants[participantIndex]?.modelId ?? 'test-model',
        finishReason: 'stop',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 1000,
        },
        hasError: false,
        isTransient: false,
        isPartialResponse: false,
      },
    };
  }

  function createUserMessage(roundNumber: number, text: string, id?: string): UIMessage {
    return {
      id: id ?? `${THREAD_ID}_user_r${roundNumber}`,
      role: UIMessageRoles.USER,
      parts: [{ type: 'text', text }],
      metadata: {
        role: 'user',
        roundNumber,
        createdAt: new Date().toISOString(),
      },
    };
  }

  // ============================================================================
  // BUG REPLICATION TEST
  // ============================================================================

  describe('bug Replication: Navigation to Thread Screen + Round 1 Message', () => {
    it('should NOT reject analysis when message ID and metadata match correctly', () => {
      // Setup: Initialize store (simulates thread screen load)
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      // Exact user scenario from bug report
      // Round 0 is complete, user sends round 1 message
      const messages: UIMessage[] = [
        // Round 0 - complete (from server load)
        createUserMessage(0, 'Say hi one word.', '01KB15Z8NDXDTE4RDFVP3X8CYG'),
        createCompleteAssistantMessage(0, 0, {
          id: `${THREAD_ID}_r0_p0`,
          text: 'Hello.',
        }),
        // Round 1 - new (from streaming)
        createUserMessage(1, 'retry', 'HyGZYVEwij6hz41z'),
        createCompleteAssistantMessage(1, 0, {
          id: `${THREAD_ID}_r1_p0`,
          text: 'Hi.',
        }),
      ];

      store.getState().setMessages(messages);

      // Add round 0 analysis (already complete)
      store.getState().addAnalysis({
        id: '01KB15ZAYSATEMSP7AREJWV5GF',
        threadId: THREAD_ID,
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Say hi one word.',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: [`${THREAD_ID}_r0_p0`],
        analysisData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      // ACT: Call createPendingAnalysis for round 1
      const consoleSpy = vi.spyOn(console, 'error');

      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages,
        userQuestion: 'retry',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // ASSERT: Should NOT log mismatch error
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.anything(),
      );

      // Should create analysis for round 1
      const analyses = store.getState().analyses;
      const round1Analysis = analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis).toBeDefined();
      expect(round1Analysis?.participantMessageIds).toContain(`${THREAD_ID}_r1_p0`);

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // GENUINE MISMATCH TEST
  // ============================================================================

  describe('genuine Mismatch Detection', () => {
    it('should reject when ID round number differs from metadata round number', () => {
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      // Message where ID says round 0 but metadata says round 1
      const mismatchedMessage: UIMessage = {
        id: `${THREAD_ID}_r0_p0`, // ID says round 0
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response' }],
        metadata: {
          role: 'assistant',
          roundNumber: 1, // Metadata says round 1 - MISMATCH!
          participantId: mockParticipants[0]!.id,
          participantIndex: 0,
          participantRole: null,
          model: mockParticipants[0]!.modelId,
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 100 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
      };

      const messages: UIMessage[] = [
        createUserMessage(1, 'test'),
        mismatchedMessage,
      ];

      store.getState().setMessages(messages);

      const consoleSpy = vi.spyOn(console, 'error');

      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages,
        userQuestion: 'test',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // Should correctly detect mismatch
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.objectContaining({
          roundNumber: 1,
          threadId: THREAD_ID,
        }),
      );

      // Should NOT create analysis
      const analyses = store.getState().analyses;
      const round1Analysis = analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('should reject when ID participant index differs from metadata', () => {
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      // Message where ID says participant 0 but metadata says participant 1
      const mismatchedMessage: UIMessage = {
        id: `${THREAD_ID}_r1_p0`, // ID says participant 0
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response' }],
        metadata: {
          role: 'assistant',
          roundNumber: 1,
          participantId: mockParticipants[0]!.id,
          participantIndex: 1, // Metadata says participant 1 - MISMATCH!
          participantRole: null,
          model: mockParticipants[0]!.modelId,
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 100 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
      };

      const messages: UIMessage[] = [
        createUserMessage(1, 'test'),
        mismatchedMessage,
      ];

      store.getState().setMessages(messages);

      const consoleSpy = vi.spyOn(console, 'error');

      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages,
        userQuestion: 'test',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // Should correctly detect mismatch
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // TEMP ID TEST
  // ============================================================================

  describe('temp ID Handling', () => {
    it('should skip temp IDs that do not match _r{N}_p{M} pattern', () => {
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      // Message with AI SDK temp ID
      const tempIdMessage: UIMessage = {
        id: 'gen-abc123xyz', // Temp ID
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response' }],
        metadata: {
          role: 'assistant',
          roundNumber: 1,
          participantId: mockParticipants[0]!.id,
          participantIndex: 0,
          participantRole: null,
          model: mockParticipants[0]!.modelId,
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 100 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
      };

      const messages: UIMessage[] = [
        createUserMessage(1, 'test'),
        tempIdMessage,
      ];

      store.getState().setMessages(messages);

      const consoleSpy = vi.spyOn(console, 'error');

      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages,
        userQuestion: 'test',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // Should NOT flag as mismatch
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.anything(),
      );

      // Should create analysis with temp ID
      const analyses = store.getState().analyses;
      const round1Analysis = analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis).toBeDefined();
      expect(round1Analysis?.participantMessageIds).toContain('gen-abc123xyz');

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // INCOMPLETE METADATA TEST
  // ============================================================================

  describe('incomplete Metadata Handling', () => {
    it('should NOT report mismatch for incomplete metadata when ID matches roundNumber and participantIndex', () => {
      // BUG FIX TEST: This test verifies the fix for the issue where
      // incomplete metadata (missing finishReason, usage, etc.) caused
      // getParticipantIndex to return null, resulting in false mismatch detection.
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      // Message with INCOMPLETE metadata - missing required fields like finishReason, usage
      // But has roundNumber and participantIndex which should be extracted via fallback
      const incompleteMessage: UIMessage = {
        id: `${THREAD_ID}_r1_p0`, // ID says round=1, participantIndex=0
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response' }],
        metadata: {
          // Missing: finishReason, usage, hasError, isTransient, isPartialResponse
          // This will cause DbAssistantMessageMetadataSchema.safeParse to fail
          role: 'assistant',
          roundNumber: 1, // Should be extracted via fallback
          participantId: mockParticipants[0]!.id,
          participantIndex: 0, // Should be extracted via fallback
        },
      };

      const messages: UIMessage[] = [
        createUserMessage(1, 'test'),
        incompleteMessage,
      ];

      store.getState().setMessages(messages);

      const consoleSpy = vi.spyOn(console, 'error');

      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages,
        userQuestion: 'test',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // ASSERT: Should NOT flag as mismatch because:
      // - ID has r1_p0 (round=1, participantIndex=0)
      // - Metadata has roundNumber=1, participantIndex=0
      // - Even with incomplete schema, the fallback should extract these values
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.anything(),
      );

      // Should create analysis with the incomplete metadata message
      const analyses = store.getState().analyses;
      const round1Analysis = analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis).toBeDefined();
      expect(round1Analysis?.participantMessageIds).toContain(`${THREAD_ID}_r1_p0`);

      consoleSpy.mockRestore();
    });

    it('should exclude messages with missing roundNumber from filtering (no analysis created)', () => {
      // When roundNumber is missing, the message won't be included in
      // getParticipantMessagesForRound, so no mismatch is detected but
      // also no analysis is created (no participant messages for round 1)
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      // Message with metadata missing roundNumber
      const missingRoundMessage: UIMessage = {
        id: `${THREAD_ID}_r1_p0`,
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Response' }],
        metadata: {
          role: 'assistant',
          participantId: mockParticipants[0]!.id,
          participantIndex: 0,
          // Missing roundNumber - message won't match round 1 filter
        },
      };

      const messages: UIMessage[] = [
        createUserMessage(1, 'test'),
        missingRoundMessage,
      ];

      store.getState().setMessages(messages);

      const consoleSpy = vi.spyOn(console, 'error');

      store.getState().createPendingAnalysis({
        roundNumber: 1,
        messages,
        userQuestion: 'test',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // No mismatch error because message is excluded from filtering
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.anything(),
      );

      // No analysis created because no participant messages for round 1
      const analyses = store.getState().analyses;
      const round1Analysis = analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // MULTI-ROUND TEST
  // ============================================================================

  describe('multi-round Scenarios', () => {
    it('should correctly create analysis for round 2 after rounds 0 and 1 complete', () => {
      store.getState().setThread(mockThread);
      store.getState().setParticipants(mockParticipants);

      const messages: UIMessage[] = [
        // Round 0
        createUserMessage(0, 'First'),
        createCompleteAssistantMessage(0, 0),
        // Round 1
        createUserMessage(1, 'Second'),
        createCompleteAssistantMessage(1, 0),
        // Round 2
        createUserMessage(2, 'Third'),
        createCompleteAssistantMessage(2, 0),
      ];

      store.getState().setMessages(messages);

      // Add existing analyses
      store.getState().addAnalysis({
        id: 'analysis-r0',
        threadId: THREAD_ID,
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'First',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: [`${THREAD_ID}_r0_p0`],
        analysisData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      store.getState().addAnalysis({
        id: 'analysis-r1',
        threadId: THREAD_ID,
        roundNumber: 1,
        mode: 'debating',
        userQuestion: 'Second',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: [`${THREAD_ID}_r1_p0`],
        analysisData: null,
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      const consoleSpy = vi.spyOn(console, 'error');

      // Create analysis for round 2
      store.getState().createPendingAnalysis({
        roundNumber: 2,
        messages,
        userQuestion: 'Third',
        threadId: THREAD_ID,
        mode: 'debating',
      });

      // No mismatch error
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Message ID/metadata mismatch detected'),
        expect.anything(),
      );

      // Should have 3 analyses
      const analyses = store.getState().analyses;
      expect(analyses).toHaveLength(3);

      const round2Analysis = analyses.find(a => a.roundNumber === 2);
      expect(round2Analysis).toBeDefined();
      expect(round2Analysis?.participantMessageIds).toContain(`${THREAD_ID}_r2_p0`);

      consoleSpy.mockRestore();
    });
  });
});
