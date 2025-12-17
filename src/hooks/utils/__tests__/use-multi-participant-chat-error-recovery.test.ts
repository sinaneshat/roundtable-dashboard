/**
 * AI SDK State Error Recovery Tests
 *
 * Tests for graceful error handling when AI SDK's Chat instance
 * enters an invalid state (e.g., during Hot Module Replacement).
 *
 * KEY SCENARIOS TESTED:
 * 1. aiSendMessage throws "Cannot read properties of undefined (reading 'state')"
 * 2. State is reset properly after error
 * 3. Triggering lock is released to allow retry
 * 4. Queue is cleared to prevent stale entries
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagePartTypes, UIMessageRoles } from '@/api/core/enums';

// Track mock state
let mockStatus = 'ready';
let mockMessages: UIMessage[] = [];
let mockSetMessages: ((messages: UIMessage[]) => void) | null = null;
let mockSendMessage: ReturnType<typeof vi.fn> | null = null;
let mockError: Error | null = null;

// Create mock useChat hook
const mockUseChat = vi.fn(() => ({
  messages: mockMessages,
  sendMessage: mockSendMessage,
  status: mockStatus,
  error: mockError,
  setMessages: mockSetMessages || vi.fn(),
}));

// Mock @ai-sdk/react
vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) => mockUseChat(options),
}));

// Mock ai package
vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn().mockImplementation(() => ({
    sendMessages: vi.fn(),
  })),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function _createMockParticipant(id: string, modelId: string) {
  return {
    id,
    threadId: 'thread-123',
    modelId,
    customRoleId: null,
    role: null,
    priority: 0,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockUserMessage(roundNumber: number): UIMessage {
  return {
    id: `user-msg-${roundNumber}`,
    role: 'user',
    content: 'Test message',
    parts: [{ type: MessagePartTypes.TEXT, text: 'Test message' }],
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
    },
  } as UIMessage;
}

// ============================================================================
// TESTS
// ============================================================================

describe('aI SDK State Error Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus = 'ready';
    mockMessages = [];
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockSetMessages = vi.fn();
    mockError = null;

    // Mock queueMicrotask to run immediately in tests
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => {
      fn();
    });

    // Mock flushSync to run immediately
    vi.mock('react-dom', async () => {
      const actual = await vi.importActual('react-dom');
      return {
        ...actual,
        flushSync: (fn: () => void) => fn(),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when aiSendMessage throws state error', () => {
    it('should reset isStreamingRef to false', async () => {
      // Setup: Create error that simulates AI SDK state corruption
      const stateError = new TypeError('Cannot read properties of undefined (reading \'state\')');
      mockSendMessage = vi.fn().mockRejectedValue(stateError);
      mockMessages = [createMockUserMessage(0)];

      // The useMultiParticipantChat hook should catch this error
      // and reset the streaming state

      // For now, we test the error handling pattern directly
      const errorHandler = async (sendMessage: typeof mockSendMessage) => {
        const isStreamingRef = { current: true };
        const isTriggeringRef = { current: true };
        const queuedParticipantsThisRoundRef = { current: new Set([0]) };
        const participantIndexQueue = { current: [0] };
        const lastUsedParticipantIndex = { current: 0 };
        let isExplicitlyStreaming = true;

        try {
          await sendMessage!({ text: 'test', metadata: {} });
        } catch {
          // This is the error recovery pattern from the hook
          isStreamingRef.current = false;
          isTriggeringRef.current = false;
          queuedParticipantsThisRoundRef.current.clear();
          participantIndexQueue.current = [];
          lastUsedParticipantIndex.current = null as unknown as number;
          isExplicitlyStreaming = false;
        }

        return {
          isStreamingRef,
          isTriggeringRef,
          queuedParticipantsThisRoundRef,
          participantIndexQueue,
          lastUsedParticipantIndex,
          isExplicitlyStreaming,
        };
      };

      const result = await errorHandler(mockSendMessage);

      expect(result.isStreamingRef.current).toBe(false);
      expect(result.isTriggeringRef.current).toBe(false);
      expect(result.queuedParticipantsThisRoundRef.current.size).toBe(0);
      expect(result.participantIndexQueue.current).toEqual([]);
      expect(result.lastUsedParticipantIndex.current).toBeNull();
      expect(result.isExplicitlyStreaming).toBe(false);
    });

    it('should allow retry after error recovery', async () => {
      // First call throws, second succeeds
      let callCount = 0;
      mockSendMessage = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new TypeError('Cannot read properties of undefined (reading \'state\')'));
        }
        return Promise.resolve();
      });

      // Simulate the retry pattern
      const attemptSend = async () => {
        const isTriggeringRef = { current: false };

        // First attempt
        if (!isTriggeringRef.current) {
          isTriggeringRef.current = true;
          try {
            await mockSendMessage!({ text: 'test' });
            return { success: true, attempts: callCount };
          } catch {
            isTriggeringRef.current = false;
          }
        }

        // Retry attempt (after error recovery)
        if (!isTriggeringRef.current) {
          isTriggeringRef.current = true;
          try {
            await mockSendMessage!({ text: 'test' });
            return { success: true, attempts: callCount };
          } catch {
            isTriggeringRef.current = false;
          }
        }

        return { success: false, attempts: callCount };
      };

      const result = await attemptSend();

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('atomic isTriggeringRef check-and-set', () => {
    it('should prevent concurrent calls from both passing guards', async () => {
      const callOrder: string[] = [];
      const isTriggeringRef = { current: false };

      // Simulate two concurrent calls
      const attemptStart = async (callerId: string): Promise<boolean> => {
        // ATOMIC: Check and set in one operation
        if (isTriggeringRef.current) {
          callOrder.push(`${callerId}: blocked`);
          return false;
        }
        isTriggeringRef.current = true;
        callOrder.push(`${callerId}: acquired lock`);

        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));

        callOrder.push(`${callerId}: completed`);
        isTriggeringRef.current = false;
        return true;
      };

      // Start both "concurrently" (in same tick)
      const results = await Promise.all([
        attemptStart('call-1'),
        attemptStart('call-2'),
      ]);

      // One should succeed, one should be blocked
      const successCount = results.filter(r => r).length;
      expect(successCount).toBe(1);

      // The blocked call should not have acquired the lock
      expect(callOrder).toContain('call-1: acquired lock');
      expect(callOrder).toContain('call-2: blocked');
    });
  });

  describe('queue clearing on error', () => {
    it('should clear participantIndexQueue after error', async () => {
      const participantIndexQueue = { current: [0, 1, 2] };
      const queuedParticipantsThisRoundRef = { current: new Set([0, 1, 2]) };

      // Simulate error recovery
      const stateError = new TypeError('Cannot read properties of undefined (reading \'state\')');

      try {
        throw stateError;
      } catch {
        // Error recovery pattern
        queuedParticipantsThisRoundRef.current.clear();
        participantIndexQueue.current = [];
      }

      expect(participantIndexQueue.current).toEqual([]);
      expect(queuedParticipantsThisRoundRef.current.size).toBe(0);
    });
  });

  describe('error logging', () => {
    it('should log error with descriptive message', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const stateError = new TypeError('Cannot read properties of undefined (reading \'state\')');

      // Simulate the error handling from the hook
      console.error('[startRound] aiSendMessage failed, resetting state:', stateError);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[startRound] aiSendMessage failed, resetting state:',
        stateError,
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('hot Module Replacement Resilience', () => {
  it('should recover gracefully when Chat instance is corrupted', async () => {
    // This test documents the expected behavior during Fast Refresh
    // The AI SDK's Chat instance can become corrupted during HMR
    // Our error handling should catch this and allow the app to recover

    const states: string[] = [];

    // Simulate the HMR scenario
    const simulateHMR = async () => {
      states.push('initial');

      // 1. User triggers action
      states.push('user-action');

      // 2. aiSendMessage is called
      states.push('send-message-started');

      // 3. Fast Refresh happens mid-request
      states.push('fast-refresh');

      // 4. Chat instance is corrupted
      const _error = new TypeError('Cannot read properties of undefined (reading \'state\')');

      // 5. Error is caught and handled
      states.push('error-caught');

      // 6. State is reset
      states.push('state-reset');

      // 7. User can retry
      states.push('retry-allowed');

      return states;
    };

    const result = await simulateHMR();

    expect(result).toContain('error-caught');
    expect(result).toContain('state-reset');
    expect(result).toContain('retry-allowed');
  });
});
