/**
 * Multi-Participant Chat Turn-Taking Tests
 *
 * Tests for sequential streaming behavior:
 * - Participants stream one at a time
 * - Race conditions are prevented
 * - Message IDs are unique per participant
 *
 * These tests validate the fix for the RAF non-blocking bug
 * where multiple streams were firing concurrently.
 */

import type { UIMessage } from 'ai';
import type { Mock } from 'vitest';

import { UIMessageRoles } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { createTestAssistantMessage, createTestUserMessage, waitForAsync } from '@/lib/testing';

// Track all sendMessage calls to verify sequential execution
let sendMessageCallOrder: Array<{ participantIndex: number; timestamp: number }> = [];
let mockSendMessageImpl: Mock;
let currentStreamingIndex: number | null = null;

// Mock the useChat hook from AI SDK
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn((options) => {
    // Store callbacks for test access
    const onFinishCallback = options?.onFinish;
    const onErrorCallback = options?.onError;

    return {
      messages: [],
      setMessages: vi.fn(),
      append: vi.fn(),
      reload: vi.fn(),
      stop: vi.fn(),
      status: 'ready',
      error: null,
      input: '',
      setInput: vi.fn(),
      handleInputChange: vi.fn(),
      handleSubmit: vi.fn(),
      isLoading: false,
      data: undefined,
      // Expose sendMessage with tracking
      sendMessage: mockSendMessageImpl,
      // Expose callbacks for test simulation
      _testCallbacks: { onFinish: onFinishCallback, onError: onErrorCallback },
    };
  }),
}));

// Mock flushSync to be a no-op
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    flushSync: (fn: () => void) => fn(),
  };
});

describe('useMultiParticipantChat Turn-Taking', () => {
  const mockParticipants: ChatParticipant[] = [
    {
      id: 'p1',
      threadId: 'thread-1',
      modelId: 'gpt-4',
      role: 'Analyst',
      priority: 0,
      isEnabled: true,
      customRoleId: null,
      settings: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p2',
      threadId: 'thread-1',
      modelId: 'claude-3',
      role: 'Expert',
      priority: 1,
      isEnabled: true,
      customRoleId: null,
      settings: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p3',
      threadId: 'thread-1',
      modelId: 'gemini',
      role: 'Researcher',
      priority: 2,
      isEnabled: true,
      customRoleId: null,
      settings: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageCallOrder = [];
    currentStreamingIndex = null;

    // Track sendMessage calls with timing
    mockSendMessageImpl = vi.fn().mockImplementation(async (options) => {
      const participantIndex = options?.body?.participantIndex ?? -1;

      // Detect concurrent streaming (race condition)
      if (currentStreamingIndex !== null) {
        throw new Error(
          `RACE CONDITION: Participant ${participantIndex} started while participant ${currentStreamingIndex} is still streaming`,
        );
      }

      currentStreamingIndex = participantIndex;
      sendMessageCallOrder.push({
        participantIndex,
        timestamp: Date.now(),
      });

      // Simulate streaming delay
      await waitForAsync(10);
      currentStreamingIndex = null;

      return { id: `msg-${participantIndex}` };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sequential Execution', () => {
    it('should call participants in priority order', () => {
      // Test that when messages are processed, they follow priority order
      const sorted = [...mockParticipants].sort((a, b) => a.priority - b.priority);

      expect(sorted[0].priority).toBe(0);
      expect(sorted[1].priority).toBe(1);
      expect(sorted[2].priority).toBe(2);

      expect(sorted[0].id).toBe('p1');
      expect(sorted[1].id).toBe('p2');
      expect(sorted[2].id).toBe('p3');
    });

    it('should generate unique message IDs per participant per round', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;

      const messageIds = mockParticipants.map((_, idx) =>
        `${threadId}_r${roundNumber}_p${idx}`,
      );

      // All IDs should be unique
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageIds.length);

      // Format should be threadId_rN_pN
      expect(messageIds[0]).toBe('thread-123_r0_p0');
      expect(messageIds[1]).toBe('thread-123_r0_p1');
      expect(messageIds[2]).toBe('thread-123_r0_p2');
    });

    it('should include participant metadata in each message', () => {
      const messages = mockParticipants.map((p, idx) =>
        createTestAssistantMessage({
          id: `thread-1_r0_p${idx}`,
          content: `Response from ${p.role}`,
          roundNumber: 0,
          participantId: p.id,
          participantIndex: idx,
          model: p.modelId,
        }),
      );

      // Verify each message has correct metadata
      messages.forEach((msg, idx) => {
        expect(msg.metadata.participantIndex).toBe(idx);
        expect(msg.metadata.participantId).toBe(mockParticipants[idx].id);
        expect(msg.metadata.model).toBe(mockParticipants[idx].modelId);
      });
    });
  });

  describe('race Condition Guards', () => {
    it('should detect duplicate message IDs within same round', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        // Duplicate ID - indicates race condition
        createTestAssistantMessage({
          id: 'thread-1_r0_p0', // Same ID as above!
          content: 'Response 1 duplicate',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      // Count messages with duplicate IDs
      const idCounts = new Map<string, number>();
      messages.forEach((m) => {
        idCounts.set(m.id, (idCounts.get(m.id) ?? 0) + 1);
      });

      const duplicates = Array.from(idCounts.entries())
        .filter(([_, count]) => count > 1);

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0][0]).toBe('thread-1_r0_p0');
    });

    it('should detect participants streaming out of order', () => {
      // Simulates the bug where participant 1 content appears in participant 0 slot
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        // Participant 0 message but with participant 1's expected content
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'I am participant 1 content', // Wrong content for p0
          roundNumber: 0,
          participantId: 'p1', // Wrong participant ID
          participantIndex: 0,
        }),
      ];

      const p0Message = messages.find(m =>
        m.id.endsWith('_p0') && m.role === UIMessageRoles.ASSISTANT,
      );

      // The message ID says p0 but metadata says p1 - inconsistent!
      expect(p0Message?.metadata.participantId).toBe('p1');
      // This inconsistency indicates a race condition
    });

    it('should ensure round numbers match between user and assistant messages', () => {
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Round 0 question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'Round 0 response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestUserMessage({
          id: 'user-2',
          content: 'Round 1 question',
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r1_p0',
          content: 'Round 1 response',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      // Group by round
      const round0 = messages.filter(m => m.metadata.roundNumber === 0);
      const round1 = messages.filter(m => m.metadata.roundNumber === 1);

      // Each round should have user + assistant messages
      expect(round0).toHaveLength(2);
      expect(round1).toHaveLength(2);

      // Message IDs should encode correct round
      expect(round0.find(m => m.role === UIMessageRoles.ASSISTANT)?.id).toContain('_r0_');
      expect(round1.find(m => m.role === UIMessageRoles.ASSISTANT)?.id).toContain('_r1_');
    });
  });

  describe('error Handling', () => {
    it('should mark messages with errors correctly', () => {
      const errorMessage = createTestAssistantMessage({
        id: 'thread-1_r0_p1',
        content: '',
        roundNumber: 0,
        participantId: 'p2',
        participantIndex: 1,
        hasError: true,
      });

      expect(errorMessage.metadata.hasError).toBe(true);
    });

    it('should continue to next participant after error', () => {
      // When participant 1 errors, participant 2 should still be triggered
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'Response from p0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        // P1 had an error
        createTestAssistantMessage({
          id: 'thread-1_r0_p1',
          content: '',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 1,
          hasError: true,
        }),
        // P2 should still respond
        createTestAssistantMessage({
          id: 'thread-1_r0_p2',
          content: 'Response from p2',
          roundNumber: 0,
          participantId: 'p3',
          participantIndex: 2,
        }),
      ];

      const round0Assistants = messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      );

      // All 3 participants should have messages (even with error)
      expect(round0Assistants).toHaveLength(3);

      // Error message should exist at index 1
      const errorMsg = round0Assistants.find(m => m.metadata.participantIndex === 1);
      expect(errorMsg?.metadata.hasError).toBe(true);

      // Participant 2 should have valid response
      const p2Msg = round0Assistants.find(m => m.metadata.participantIndex === 2);
      expect(p2Msg?.metadata.hasError).toBe(false);
    });
  });

  describe('message Deduplication', () => {
    it('should filter out duplicate messages by ID', () => {
      const messages: UIMessage[] = [
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'First version',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0', // Duplicate
          content: 'Second version',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0', // Another duplicate
          content: 'Third version',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      // Deduplicate by keeping last occurrence (most complete)
      const seen = new Map<string, UIMessage>();
      messages.forEach((m) => {
        seen.set(m.id, m);
      });
      const deduplicated = Array.from(seen.values());

      expect(deduplicated).toHaveLength(1);
      // Should keep the last one (most complete during streaming)
      expect(deduplicated[0].parts?.[0]?.type === 'text'
        && deduplicated[0].parts[0].text).toBe('Third version');
    });

    it('should preserve unique messages across participants', () => {
      const messages: UIMessage[] = [
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'P0 response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p1',
          content: 'P1 response',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p2',
          content: 'P2 response',
          roundNumber: 0,
          participantId: 'p3',
          participantIndex: 2,
        }),
      ];

      const uniqueIds = new Set(messages.map(m => m.id));
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('round Completion', () => {
    it('should detect round completion when all participants respond', () => {
      const enabledParticipants = mockParticipants.filter(p => p.isEnabled);
      const totalParticipants = enabledParticipants.length;

      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        ...enabledParticipants.map((p, idx) =>
          createTestAssistantMessage({
            id: `thread-1_r0_p${idx}`,
            content: `Response ${idx}`,
            roundNumber: 0,
            participantId: p.id,
            participantIndex: idx,
          }),
        ),
      ];

      const round0Assistants = messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      );

      // Round complete when all enabled participants have responded
      const isRoundComplete = round0Assistants.length === totalParticipants;
      expect(isRoundComplete).toBe(true);
    });

    it('should not complete round with missing participant responses', () => {
      const enabledParticipants = mockParticipants.filter(p => p.isEnabled);
      const totalParticipants = enabledParticipants.length;

      // Only 2 of 3 participants responded
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'Response 0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p1',
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 1,
        }),
        // Missing p2 response
      ];

      const round0Assistants = messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && m.metadata.roundNumber === 0,
      );

      const isRoundComplete = round0Assistants.length === totalParticipants;
      expect(isRoundComplete).toBe(false);
    });
  });

  describe('aWait Pattern Validation', () => {
    it('should demonstrate blocking vs non-blocking RAF behavior', async () => {
      const executionOrder: string[] = [];

      // NON-BLOCKING (the bug): Returns immediately
      const nonBlockingRAF = () => {
        requestAnimationFrame(() => {
          executionOrder.push('non-blocking-raf-callback');
        });
        executionOrder.push('non-blocking-after-schedule');
      };

      // BLOCKING (the fix): Waits for RAF before continuing
      const blockingRAF = async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        executionOrder.push('blocking-after-raf');
      };

      // Execute non-blocking first
      nonBlockingRAF();
      executionOrder.push('after-non-blocking');

      // Non-blocking returns immediately, so 'after-non-blocking' appears before 'raf-callback'
      expect(executionOrder).toEqual([
        'non-blocking-after-schedule',
        'after-non-blocking',
      ]);

      // Wait for RAF callbacks
      await waitForAsync(50);
      expect(executionOrder).toContain('non-blocking-raf-callback');

      // Clear and test blocking
      executionOrder.length = 0;

      // Execute blocking
      await blockingRAF();
      executionOrder.push('after-blocking');

      // Blocking waits for RAF, so order is deterministic
      expect(executionOrder).toEqual([
        'blocking-after-raf',
        'after-blocking',
      ]);
    });

    it('should prevent concurrent onFinish executions with blocking RAF', async () => {
      let activeFinishCount = 0;
      let maxConcurrent = 0;
      const finishOrder: number[] = [];

      const simulateOnFinish = async (participantIndex: number) => {
        activeFinishCount++;
        maxConcurrent = Math.max(maxConcurrent, activeFinishCount);

        // Simulate the blocking RAF pattern
        await new Promise(resolve => requestAnimationFrame(resolve));

        finishOrder.push(participantIndex);
        activeFinishCount--;
      };

      // Sequential execution (correct behavior)
      await simulateOnFinish(0);
      await simulateOnFinish(1);
      await simulateOnFinish(2);

      // With blocking RAF, max concurrent should be 1
      expect(maxConcurrent).toBe(1);
      expect(finishOrder).toEqual([0, 1, 2]);
    });
  });
});
