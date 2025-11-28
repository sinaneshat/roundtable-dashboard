/**
 * AI SDK Status Guard Tests
 *
 * CRITICAL: These tests prevent regression of the bug where startRound/sendMessage
 * checked for status === 'submitted' instead of status === 'ready'.
 *
 * AI SDK v5 Status Lifecycle:
 * - 'ready' - Initial/idle state, READY TO ACCEPT NEW MESSAGES
 * - 'submitted' - Message submitted, waiting for response
 * - 'streaming' - Currently streaming a response
 * - 'error' - An error occurred
 *
 * ROOT CAUSE OF BUG:
 * The guards were checking `status === 'submitted'` but AI SDK v5 uses 'ready'
 * to indicate it's ready to accept messages. This caused all startRound/sendMessage
 * calls to fail silently because status is 'ready' on initial mount.
 *
 * Location: /src/hooks/utils/__tests__/use-multi-participant-chat-status-guard.test.ts
 */

import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';

import { useMultiParticipantChat } from '../use-multi-participant-chat';

// Mock AI SDK useChat hook
const mockSendMessage = vi.fn();
const mockSetMessages = vi.fn();

let _useChatOnFinish: ((data: { message: UIMessage }) => void) | undefined;
let mockMessages: UIMessage[] = [];
let mockStatus = 'ready'; // Default to 'ready' - this is the initial AI SDK v5 status

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn((options) => {
    _useChatOnFinish = options?.onFinish;

    return {
      messages: mockMessages,
      sendMessage: mockSendMessage,
      status: mockStatus,
      error: null,
      setMessages: mockSetMessages,
    };
  }),
}));

// Mock DefaultChatTransport
vi.mock('ai', () => ({
  DefaultChatTransport: class MockDefaultChatTransport {
    constructor() {}
  },
}));

// Mock react-dom flushSync
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    flushSync: (fn: () => void) => fn(),
  };
});

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestParticipant(index: number): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    role: null,
    customRoleId: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createTestUserMessage(roundNumber: number, text = 'Test question'): UIMessage {
  return {
    id: `msg-user-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: { role: 'user', roundNumber },
    createdAt: new Date(),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('aI SDK Status Guards - Prevent Regression', () => {
  const mockParticipants = [createTestParticipant(0), createTestParticipant(1)];

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages = [];
    mockStatus = 'ready'; // AI SDK v5 initial state - READY to accept messages
    _useChatOnFinish = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('critical: status === "ready" allows startRound', () => {
    it('should call sendMessage when status is "ready" and messages exist', () => {
      // Setup: Messages exist and status is 'ready'
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'ready';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      act(() => {
        result.current.startRound();
      });

      // CRITICAL: startRound should work when status is 'ready'
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should NOT call sendMessage when status is "submitted"', () => {
      // Setup: Messages exist but status is 'submitted' (already processing)
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'submitted';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      act(() => {
        result.current.startRound();
      });

      // Should NOT call sendMessage because AI SDK is already processing
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should NOT call sendMessage when status is "streaming"', () => {
      // Setup: Status is 'streaming' (already streaming response)
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'streaming';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      act(() => {
        result.current.startRound();
      });

      // Should NOT call sendMessage because AI SDK is streaming
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should NOT call sendMessage when status is "error"', () => {
      // Setup: Status is 'error'
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'error';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      act(() => {
        result.current.startRound();
      });

      // Should NOT call sendMessage when AI SDK is in error state
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('critical: sendMessage works with status "ready"', () => {
    it('should call aiSendMessage when status is "ready"', async () => {
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'ready';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('New message');
      });

      // CRITICAL: sendMessage should work when status is 'ready'
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should NOT call aiSendMessage when status is "submitted"', async () => {
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'submitted';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('New message');
      });

      // Should NOT send when AI SDK is already processing
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('critical: continueFromParticipant works with status "ready"', () => {
    it('should call sendMessage when status is "ready" and continuing from participant', () => {
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'ready';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      act(() => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      // CRITICAL: continueFromParticipant should work when status is 'ready'
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('regression prevention: verify canSendMessage logic', () => {
    it('should treat "ready" as the only valid state for accepting new messages', () => {
      // This test documents the expected behavior:
      // ONLY status === 'ready' should allow sending messages
      //
      // Previous bug: code checked status === 'submitted' which is WRONG
      // 'submitted' means a message was already sent and is being processed
      //
      // AI SDK v5 status lifecycle:
      // 1. 'ready' - Initial state, ready for new messages ← THIS IS WHERE WE CAN SEND
      // 2. 'submitted' - Message sent, waiting for response ← CANNOT SEND HERE
      // 3. 'streaming' - Receiving response ← CANNOT SEND HERE
      // 4. 'ready' - Response complete, ready for new messages ← CAN SEND AGAIN

      const validStatesToSend = ['ready'];
      const invalidStatesToSend = ['submitted', 'streaming', 'error'];

      // Verify our understanding is correct
      expect(validStatesToSend).toContain('ready');
      expect(invalidStatesToSend).toContain('submitted');
      expect(invalidStatesToSend).not.toContain('ready');
    });
  });

  // ==========================================================================
  // CRITICAL: isReady flag tests - Prevent incomplete round resumption bugs
  // ==========================================================================
  // BUG CONTEXT: After page refresh, provider effect called continueFromParticipant
  // before AI SDK was initialized. Without isReady check, continueFromParticipant
  // returned early silently, leaving waitingToStartStreaming=true and UI stuck.
  //
  // SOLUTION: isReady = status === 'ready' && messages.length > 0
  // Provider must wait for isReady before calling continueFromParticipant.
  // ==========================================================================

  describe('critical: isReady flag for provider guard', () => {
    it('should return isReady=true when status is "ready" AND messages exist', () => {
      // Setup: Messages exist and status is 'ready' - SDK is fully initialized
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'ready';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // CRITICAL: isReady should be true - safe to call continueFromParticipant
      expect(result.current.isReady).toBe(true);
    });

    it('should return isReady=false when status is "ready" but NO messages', () => {
      // Setup: Status is 'ready' but no messages - SDK initialized but not hydrated
      mockMessages = [];
      mockStatus = 'ready';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: [],
        }),
      );

      // CRITICAL: isReady should be false - messages not hydrated yet
      // Provider must NOT call continueFromParticipant in this state
      expect(result.current.isReady).toBe(false);
    });

    it('should return isReady=false when status is "submitted"', () => {
      // Setup: Messages exist but status is 'submitted' - SDK is processing
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'submitted';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // isReady should be false - SDK is busy processing
      expect(result.current.isReady).toBe(false);
    });

    it('should return isReady=false when status is "streaming"', () => {
      // Setup: Status is 'streaming' - SDK is currently streaming
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'streaming';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // isReady should be false - SDK is busy streaming
      expect(result.current.isReady).toBe(false);
    });

    it('should return isReady=false when status is "error"', () => {
      // Setup: Status is 'error'
      mockMessages = [createTestUserMessage(0)];
      mockStatus = 'error';

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // isReady should be false - SDK is in error state
      expect(result.current.isReady).toBe(false);
    });

    it('should transition isReady from false to true when messages are hydrated', () => {
      // Scenario: Page refresh - messages load asynchronously
      // Initially no messages, then messages are hydrated from server
      mockMessages = [];
      mockStatus = 'ready';

      const { result, rerender } = renderHook(
        ({ messages }) =>
          useMultiParticipantChat({
            threadId: 'thread-123',
            participants: mockParticipants,
            messages,
          }),
        { initialProps: { messages: [] as UIMessage[] } },
      );

      // Initially isReady is false - no messages yet
      expect(result.current.isReady).toBe(false);

      // Simulate messages being hydrated from server
      const hydratedMessages = [createTestUserMessage(0)];
      mockMessages = hydratedMessages;

      rerender({ messages: hydratedMessages });

      // Now isReady should be true - safe to continue streaming
      expect(result.current.isReady).toBe(true);
    });
  });

  describe('regression prevention: provider must wait for isReady', () => {
    it('should document the isReady contract for provider effect', () => {
      // This test documents the critical isReady contract:
      //
      // PROVIDER EFFECT PATTERN (chat-store-provider.tsx):
      // ```
      // useEffect(() => {
      //   if (!chat.isReady) return; // ← CRITICAL: Wait for SDK
      //   if (incompleteRound) {
      //     chat.continueFromParticipant(participantIndex, participants);
      //   }
      // }, [chat.isReady, incompleteRound, ...]);
      // ```
      //
      // WITHOUT isReady CHECK:
      // 1. Page refresh triggers provider mount
      // 2. Messages not hydrated yet (messages.length === 0)
      // 3. Provider calls continueFromParticipant
      // 4. continueFromParticipant checks: if (messages.length === 0) return;
      // 5. Returns silently, waitingToStartStreaming stays true forever
      // 6. UI shows "waiting" state indefinitely
      //
      // WITH isReady CHECK:
      // 1. Page refresh triggers provider mount
      // 2. chat.isReady is false (messages not hydrated)
      // 3. Provider effect returns early, waits
      // 4. Messages hydrate, isReady becomes true
      // 5. Effect re-runs, calls continueFromParticipant successfully
      // 6. Streaming resumes correctly

      // Verify the isReady formula
      const statusReady = 'ready';
      const statusNotReady = 'submitted';
      const messagesExist = [createTestUserMessage(0)];
      const noMessages: UIMessage[] = [];

      // isReady = status === 'ready' && messages.length > 0
      expect(statusReady === 'ready' && messagesExist.length > 0).toBe(true);
      expect(statusReady === 'ready' && noMessages.length > 0).toBe(false);
      expect(statusNotReady === 'ready' && messagesExist.length > 0).toBe(false);
    });
  });
});
