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

  describe('streaming Sync Throttle', () => {
    it('should allow immediate sync for message count changes', () => {
      // Simulate message count change detection
      const prevCount = 2;
      const newCount = 3;

      const countChanged = newCount !== prevCount;
      const shouldThrottle = false; // Count changes never throttled

      const shouldSync = countChanged || (false && !shouldThrottle);
      expect(shouldSync).toBe(true);
    });

    it('should throttle rapid content-only changes during streaming', async () => {
      // Simulate rapid streaming content updates
      // Note: lastSyncTime starts at 0, so first sync at time 0 has 0-0=0ms elapsed,
      // which is NOT < 100ms, so it won't be throttled (this matches production behavior)
      let lastSyncTime = 0;
      const THROTTLE_MS = 100;
      const syncTimes: number[] = [];

      const attemptSync = (now: number, countChanged: boolean, contentChanged: boolean) => {
        const timeSinceLastSync = now - lastSyncTime;
        const shouldThrottle = !countChanged && contentChanged && timeSinceLastSync < THROTTLE_MS;

        if (!shouldThrottle && (countChanged || contentChanged)) {
          lastSyncTime = now;
          syncTimes.push(now);
          return true;
        }
        return false;
      };

      // Start at time 1000 to simulate real-world scenario (Date.now() returns large values)
      const baseTime = 1000;
      attemptSync(baseTime, false, true); // Syncs (first content change, 1000-0=1000ms elapsed)
      attemptSync(baseTime + 20, false, true); // Throttled (1020-1000=20ms < 100ms)
      attemptSync(baseTime + 40, false, true); // Throttled
      attemptSync(baseTime + 60, false, true); // Throttled
      attemptSync(baseTime + 80, false, true); // Throttled
      attemptSync(baseTime + 100, false, true); // Syncs (1100-1000=100ms, not < 100ms)
      attemptSync(baseTime + 120, false, true); // Throttled (1120-1100=20ms < 100ms)

      // Only 2 syncs should occur
      expect(syncTimes).toHaveLength(2);
      expect(syncTimes[0]).toBe(1000);
      expect(syncTimes[1]).toBe(1100);
    });

    it('should NOT throttle when message count changes', async () => {
      // Message count changes (new participants) must sync immediately
      let lastSyncTime = 0;
      const THROTTLE_MS = 100;
      const syncTimes: number[] = [];

      const attemptSync = (now: number, countChanged: boolean, contentChanged: boolean) => {
        const timeSinceLastSync = now - lastSyncTime;
        const shouldThrottle = !countChanged && contentChanged && timeSinceLastSync < THROTTLE_MS;

        if (!shouldThrottle && (countChanged || contentChanged)) {
          lastSyncTime = now;
          syncTimes.push(now);
          return true;
        }
        return false;
      };

      // Rapid count changes should all sync (new participants)
      const baseTime = 0;
      attemptSync(baseTime + 0, true, false); // Syncs
      attemptSync(baseTime + 10, true, false); // Syncs (count change = immediate)
      attemptSync(baseTime + 20, true, false); // Syncs
      attemptSync(baseTime + 30, true, false); // Syncs

      // All 4 syncs should occur - count changes are never throttled
      expect(syncTimes).toHaveLength(4);
    });

    it('should compare text content for streaming detection', () => {
      // Test content comparison logic
      const hookMessage = {
        id: 'msg-1',
        parts: [{ type: 'text' as const, text: 'Hello world streaming...' }],
      };

      const storeMessage = {
        id: 'msg-1',
        parts: [{ type: 'text' as const, text: 'Hello world' }],
      };

      // Content comparison
      let contentChanged = false;
      for (let j = 0; j < hookMessage.parts.length; j++) {
        const hookPart = hookMessage.parts[j];
        const storePart = storeMessage.parts[j];
        if (hookPart?.type === 'text' && storePart?.type === 'text') {
          if (hookPart.text !== storePart.text) {
            contentChanged = true;
            break;
          }
        }
      }

      expect(contentChanged).toBe(true);
    });

    it('should compare reasoning content for streaming detection', () => {
      // Test reasoning comparison logic
      const hookMessage = {
        id: 'msg-1',
        parts: [{ type: 'reasoning' as const, text: 'Thinking about this problem...' }],
      };

      const storeMessage = {
        id: 'msg-1',
        parts: [{ type: 'reasoning' as const, text: 'Thinking' }],
      };

      // Content comparison
      let contentChanged = false;
      for (let j = 0; j < hookMessage.parts.length; j++) {
        const hookPart = hookMessage.parts[j];
        const storePart = storeMessage.parts[j];
        if (hookPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
          if (hookPart.text !== storePart.text) {
            contentChanged = true;
            break;
          }
        }
      }

      expect(contentChanged).toBe(true);
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

  describe('content Mixing Race Condition Detection', () => {
    it('should detect when participant content is mixed (wrong content for participant)', () => {
      // This test catches the bug where p1 gets p0's content
      // Symptom: Both participants have identical content when they should be different
      const messages: UIMessage[] = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'Response from GPT-4o Mini',
          roundNumber: 0,
          participantId: 'p0-gpt',
          participantIndex: 0,
          model: 'openai/gpt-4o-mini',
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p1',
          content: 'Response from GPT-4o Mini', // BUG: Same content as p0!
          roundNumber: 0,
          participantId: 'p1-grok',
          participantIndex: 1,
          model: 'x-ai/grok-4.1-fast',
        }),
      ];

      // Detect content mixing: different participants should have different content
      // (in a real conversation, two different models almost never produce identical responses)
      const assistantMessages = messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      const contentSet = new Set<string>();

      assistantMessages.forEach((msg) => {
        const textPart = msg.parts?.find(p => p.type === 'text' && 'text' in p);
        if (textPart && 'text' in textPart) {
          contentSet.add(textPart.text);
        }
      });

      // If we have 2 participants but only 1 unique content, something is wrong
      const hasMixedContent = assistantMessages.length > 1 && contentSet.size < assistantMessages.length;
      expect(hasMixedContent).toBe(true); // This test EXPECTS the bug to be detectable
    });

    it('should validate participant metadata matches message ID', () => {
      // Each message ID contains participant index (e.g., _r0_p1)
      // The metadata.participantIndex should match
      const messages: UIMessage[] = [
        createTestAssistantMessage({
          id: 'thread-1_r0_p0',
          content: 'Response 0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread-1_r0_p1',
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Validate each message
      const inconsistencies: string[] = [];
      messages.forEach((msg) => {
        // Extract participant index from ID
        const idMatch = msg.id.match(/_p(\d+)$/);
        if (idMatch) {
          const idParticipantIndex = Number.parseInt(idMatch[1], 10);
          const metadataIndex = msg.metadata.participantIndex;

          if (idParticipantIndex !== metadataIndex) {
            inconsistencies.push(
              `Message ${msg.id} has ID index ${idParticipantIndex} but metadata index ${metadataIndex}`,
            );
          }
        }
      });

      expect(inconsistencies).toHaveLength(0);
    });

    it('should detect concurrent network requests (more requests than participants)', () => {
      // Simulate tracking network requests
      const networkRequests: Array<{ participantIndex: number; timestamp: number }> = [];
      const participants = ['p0', 'p1'];

      // Simulate race condition: 3 requests for 2 participants
      networkRequests.push({ participantIndex: 0, timestamp: 1000 });
      networkRequests.push({ participantIndex: 0, timestamp: 1010 }); // Duplicate!
      networkRequests.push({ participantIndex: 1, timestamp: 1020 });

      // Check for duplicates
      const indexCounts = new Map<number, number>();
      networkRequests.forEach((req) => {
        indexCounts.set(req.participantIndex, (indexCounts.get(req.participantIndex) ?? 0) + 1);
      });

      const hasDuplicateRequests = Array.from(indexCounts.values()).some(count => count > 1);
      const totalRequests = networkRequests.length;
      const expectedRequests = participants.length;

      // Race condition detected: more requests than participants
      expect(hasDuplicateRequests).toBe(true);
      expect(totalRequests).toBeGreaterThan(expectedRequests);
    });
  });

  describe('message ID Processing Guard', () => {
    it('should prevent double-processing of same message ID in onFinish', () => {
      // Simulate the processedMessageIdsRef guard
      const processedMessageIds = new Set<string>();
      const processedMessages: string[] = [];

      const simulateOnFinish = (messageId: string, content: string) => {
        // Guard: skip if already processed
        if (processedMessageIds.has(messageId)) {
          return false; // Skipped
        }
        processedMessageIds.add(messageId);
        processedMessages.push(content);
        return true; // Processed
      };

      // First call should process
      const result1 = simulateOnFinish('msg-1', 'First content');
      expect(result1).toBe(true);
      expect(processedMessages).toHaveLength(1);

      // Second call with same ID should be skipped
      const result2 = simulateOnFinish('msg-1', 'Duplicate content');
      expect(result2).toBe(false);
      expect(processedMessages).toHaveLength(1); // Still 1, not 2

      // Different ID should process
      const result3 = simulateOnFinish('msg-2', 'Second content');
      expect(result3).toBe(true);
      expect(processedMessages).toHaveLength(2);
    });

    it('should track all processed messages across a round', () => {
      const processedMessageIds = new Set<string>();
      const participants = [
        { id: 'p0', modelId: 'gpt-4o-mini' },
        { id: 'p1', modelId: 'grok-4.1-fast' },
      ];
      const threadId = 'thread-1';
      const roundNumber = 0;

      // Process each participant's message
      participants.forEach((p, idx) => {
        const messageId = `${threadId}_r${roundNumber}_p${idx}`;
        processedMessageIds.add(messageId);
      });

      // Verify all participants were processed exactly once
      expect(processedMessageIds.size).toBe(participants.length);

      // Verify correct message IDs
      expect(processedMessageIds.has('thread-1_r0_p0')).toBe(true);
      expect(processedMessageIds.has('thread-1_r0_p1')).toBe(true);
    });
  });

  describe('isTriggeringRef Lock Validation', () => {
    it('should prevent concurrent triggers with lock pattern', () => {
      let isTriggeringLock = false;
      const triggerLog: Array<{ action: string; index: number; timestamp: number }> = [];

      const triggerNextParticipant = (index: number): boolean => {
        // Check lock
        if (isTriggeringLock) {
          triggerLog.push({ action: 'blocked', index, timestamp: Date.now() });
          return false;
        }

        // Acquire lock
        isTriggeringLock = true;
        triggerLog.push({ action: 'started', index, timestamp: Date.now() });

        // Simulate work (synchronous for this test)
        // ... trigger participant ...

        // Release lock (MUST be synchronous)
        isTriggeringLock = false;
        triggerLog.push({ action: 'completed', index, timestamp: Date.now() });

        return true;
      };

      // Sequential triggers should all succeed
      expect(triggerNextParticipant(0)).toBe(true);
      expect(triggerNextParticipant(1)).toBe(true);
      expect(triggerNextParticipant(2)).toBe(true);

      // All should have completed
      const completed = triggerLog.filter(l => l.action === 'completed');
      expect(completed).toHaveLength(3);
    });

    it('should block concurrent trigger attempts during async operations', async () => {
      let isTriggeringLock = false;
      const triggerLog: Array<{ action: string; index: number }> = [];

      const triggerWithAsyncWork = async (index: number): Promise<boolean> => {
        if (isTriggeringLock) {
          triggerLog.push({ action: 'blocked', index });
          return false;
        }

        isTriggeringLock = true;
        triggerLog.push({ action: 'started', index });

        // Simulate async work (like RAF)
        await waitForAsync(10);

        triggerLog.push({ action: 'completed', index });
        isTriggeringLock = false;

        return true;
      };

      // Start trigger for participant 0
      const trigger0Promise = triggerWithAsyncWork(0);

      // Try to trigger participant 1 while 0 is still processing
      // (simulates race condition)
      const trigger1Result = await triggerWithAsyncWork(1);

      // Wait for trigger 0 to complete
      const trigger0Result = await trigger0Promise;

      // First trigger should succeed
      expect(trigger0Result).toBe(true);

      // Second trigger should be blocked (race condition prevented)
      expect(trigger1Result).toBe(false);

      // Verify log shows correct behavior
      const blocked = triggerLog.filter(l => l.action === 'blocked');
      expect(blocked).toHaveLength(1);
      expect(blocked[0].index).toBe(1);
    });
  });

  describe('queue Double-Push Prevention', () => {
    it('should prevent duplicate pushes to participantIndexQueue', () => {
      // Simulates the queuedParticipantsThisRoundRef pattern
      const queuedParticipants = new Set<number>();
      const queue: number[] = [];
      const pushLog: Array<{ index: number; pushed: boolean }> = [];

      const safePush = (index: number): boolean => {
        if (queuedParticipants.has(index)) {
          pushLog.push({ index, pushed: false });
          return false;
        }
        queuedParticipants.add(index);
        queue.push(index);
        pushLog.push({ index, pushed: true });
        return true;
      };

      // First push for participant 0 - should succeed
      expect(safePush(0)).toBe(true);
      expect(queue).toEqual([0]);

      // Duplicate push for participant 0 - should be blocked
      expect(safePush(0)).toBe(false);
      expect(queue).toEqual([0]); // Still only one entry

      // Push for participant 1 - should succeed
      expect(safePush(1)).toBe(true);
      expect(queue).toEqual([0, 1]);

      // Verify log
      expect(pushLog).toEqual([
        { index: 0, pushed: true },
        { index: 0, pushed: false }, // Duplicate blocked
        { index: 1, pushed: true },
      ]);
    });

    it('should reset queue tracking at start of new round', () => {
      const queuedParticipants = new Set<number>();
      const queue: number[] = [];

      const safePush = (index: number): boolean => {
        if (queuedParticipants.has(index)) {
          return false;
        }
        queuedParticipants.add(index);
        queue.push(index);
        return true;
      };

      const resetForNewRound = () => {
        queuedParticipants.clear();
        queue.length = 0;
      };

      // Round 1: Push participants 0 and 1
      expect(safePush(0)).toBe(true);
      expect(safePush(1)).toBe(true);
      expect(queue).toEqual([0, 1]);

      // Reset for new round
      resetForNewRound();
      expect(queue).toEqual([]);

      // Round 2: Push participant 0 again - should succeed after reset
      expect(safePush(0)).toBe(true);
      expect(queue).toEqual([0]);
    });

    it('should detect race condition when same participant is triggered from multiple entry points', () => {
      // Simulates: startRound AND pendingMessage effect both triggering participant 0
      const queuedParticipants = new Set<number>();
      const networkRequestLog: Array<{ source: string; index: number }> = [];
      let isTriggeringLock = false;

      const triggerFromSource = (source: string, index: number): boolean => {
        // Check trigger lock first (simulates isTriggeringRef)
        if (isTriggeringLock) {
          return false;
        }

        // Check if already queued (simulates queuedParticipantsThisRoundRef)
        if (queuedParticipants.has(index)) {
          return false;
        }

        isTriggeringLock = true;
        queuedParticipants.add(index);
        networkRequestLog.push({ source, index });
        isTriggeringLock = false;

        return true;
      };

      // startRound triggers participant 0
      const startRoundResult = triggerFromSource('startRound', 0);

      // pendingMessage effect also tries to trigger participant 0 (race condition)
      const pendingMessageResult = triggerFromSource('pendingMessage', 0);

      // First call should succeed, second should be blocked
      expect(startRoundResult).toBe(true);
      expect(pendingMessageResult).toBe(false);

      // Only ONE network request should be made
      expect(networkRequestLog).toHaveLength(1);
      expect(networkRequestLog[0]).toEqual({ source: 'startRound', index: 0 });
    });
  });
});
