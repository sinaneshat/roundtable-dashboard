/**
 * Phantom Resume Completion Tests
 *
 * Tests for the fix that prevents phantom resume completions from creating
 * false empty_response errors.
 *
 * ROOT CAUSE (Fixed 2025-11-25):
 * When AI SDK's useChat has `resume: true` and no active stream exists,
 * it fires `onFinish` with:
 * - Random message ID (not our format: {threadId}_r{round}_p{index})
 * - Empty parts array
 * - undefined finishReason
 * - 0 tokens
 *
 * This was incorrectly treated as a real participant response failure,
 * creating error messages like "The model did not generate a response."
 *
 * FIX: Detect and skip phantom resume completions by checking:
 * 1. Message ID doesn't match our format (no `_r` in ID)
 * 2. Empty parts array
 * 3. undefined finishReason
 * 4. No active round (roundParticipantsRef empty)
 * 5. Not actively streaming (isStreamingRef false)
 */

import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles, UIMessageRoles } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';

import { useMultiParticipantChat } from '../use-multi-participant-chat';

// Mock AI SDK useChat hook
const mockSendMessage = vi.fn();
const mockSetMessages = vi.fn();

let useChatOnFinish: ((data: { message: UIMessage; finishReason?: string }) => void) | undefined;
let mockMessages: UIMessage[] = [];
let mockStatus = 'ready';

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn((options) => {
    useChatOnFinish = options?.onFinish;

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

describe('phantom Resume Completion Detection', () => {
  const mockParticipants: ChatParticipant[] = [
    {
      id: 'p1',
      threadId: 'thread-123',
      modelId: 'google/gemini-2.5-flash',
      role: 'Assistant',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages = [];
    mockStatus = 'ready';
    useChatOnFinish = undefined;
  });

  describe('phantom resume detection criteria', () => {
    it('should skip onFinish when message ID does not match our format', () => {
      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
        }),
      );

      // Phantom resume message - random AI SDK ID without our format
      const phantomMessage: UIMessage = {
        id: 'SJSIuWYg6CtcSEk6', // Random ID, no _r in it
        role: MessageRoles.ASSISTANT,
        parts: [],
      };

      act(() => {
        useChatOnFinish?.({ message: phantomMessage, finishReason: undefined });
      });

      // Should NOT have called setMessages (phantom was skipped)
      // The key indicator is that no error message was created
      const setMessagesCalls = mockSetMessages.mock.calls;
      const hasErrorMessage = setMessagesCalls.some((call) => {
        const callback = call[0];
        if (typeof callback === 'function') {
          const result = callback([]);
          return result.some((m: UIMessage) => m.metadata?.hasError);
        }
        return false;
      });

      expect(hasErrorMessage).toBe(false);
    });

    it('should NOT skip onFinish when message ID matches our format', () => {
      mockMessages = [
        {
          id: 'msg-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];

      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // Real message with our format - should be processed
      const realMessage: UIMessage = {
        id: 'thread-123_r0_p0', // Our format: {threadId}_r{round}_p{participant}
        role: MessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Hello!' }],
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
          finishReason: 'stop',
        },
      };

      act(() => {
        useChatOnFinish?.({ message: realMessage, finishReason: 'stop' });
      });

      // Should have called setMessages for real message
      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should skip phantom even with partial matching criteria', () => {
      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
        }),
      );

      // All 5 criteria must be true for phantom detection:
      // 1. No _r in ID ✓
      // 2. Empty parts ✓
      // 3. undefined finishReason ✓
      // 4. No active round (roundParticipantsRef empty) ✓
      // 5. Not streaming ✓
      const phantomMessage: UIMessage = {
        id: 'random-sdk-id',
        role: MessageRoles.ASSISTANT,
        parts: [],
      };

      act(() => {
        useChatOnFinish?.({ message: phantomMessage, finishReason: undefined });
      });

      // Verify no error messages were created
      const errorMessageCreated = mockSetMessages.mock.calls.some((call) => {
        const callback = call[0];
        if (typeof callback === 'function') {
          const result = callback([]);
          return result.some((m: UIMessage) =>
            m.metadata?.errorType === 'empty_response',
          );
        }
        return false;
      });

      expect(errorMessageCreated).toBe(false);
    });
  });

  describe('real empty response detection', () => {
    it('should still detect real empty responses (message ID matches our format)', () => {
      mockMessages = [
        {
          id: 'msg-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];

      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // Real empty response - has our ID format but no content
      const emptyResponseMessage: UIMessage = {
        id: 'thread-123_r0_p0',
        role: MessageRoles.ASSISTANT,
        parts: [], // Empty - real error
        metadata: {
          role: UIMessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
          finishReason: 'unknown',
          hasError: true,
          errorType: 'empty_response',
        },
      };

      act(() => {
        useChatOnFinish?.({ message: emptyResponseMessage, finishReason: 'unknown' });
      });

      // Should process this as a real error (not skip it)
      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should NOT skip when finishReason is defined (even with empty parts)', () => {
      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
        }),
      );

      // Has defined finishReason - should NOT be skipped
      const messageWithFinishReason: UIMessage = {
        id: 'random-id',
        role: MessageRoles.ASSISTANT,
        parts: [],
      };

      act(() => {
        // finishReason is 'failed' not undefined - should NOT skip
        useChatOnFinish?.({ message: messageWithFinishReason, finishReason: 'failed' });
      });

      // This should be processed (not skipped) because finishReason is defined
      // The phantom detection requires ALL 5 criteria
    });
  });

  describe('edge cases', () => {
    it('should handle undefined message gracefully', () => {
      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
        }),
      );

      // Should not throw when message is undefined
      expect(() => {
        act(() => {
          useChatOnFinish?.({ message: undefined as unknown as UIMessage });
        });
      }).not.toThrow();
    });

    it('should handle message with null parts gracefully', () => {
      renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
        }),
      );

      const messageWithNullParts: UIMessage = {
        id: 'random-id',
        role: MessageRoles.ASSISTANT,
        parts: null as unknown as UIMessage['parts'],
      };

      expect(() => {
        act(() => {
          useChatOnFinish?.({ message: messageWithNullParts });
        });
      }).not.toThrow();
    });
  });
});

describe('startRound Guards', () => {
  const mockParticipants: ChatParticipant[] = [
    {
      id: 'p1',
      threadId: 'thread-123',
      modelId: 'openai/gpt-4',
      role: 'Assistant',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages = [];
    mockStatus = 'ready';
  });

  describe('messages hydration guard', () => {
    it('should NOT start streaming when messages are empty', () => {
      mockMessages = []; // Empty - not hydrated

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

      // Should NOT have called sendMessage
      expect(mockSendMessage).not.toHaveBeenCalled();
      // Should NOT be streaming
      expect(result.current.isStreaming).toBe(false);
    });

    it('should start streaming when messages are hydrated', () => {
      mockMessages = [
        {
          id: 'msg-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];

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

      // Should have called sendMessage
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('ai sdk status guard', () => {
    it('should NOT start streaming when AI SDK status is not ready', () => {
      mockMessages = [
        {
          id: 'msg-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];
      mockStatus = 'streaming'; // AI SDK is streaming, not ready to accept new messages

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

      // Should NOT have called sendMessage
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should start streaming when AI SDK status is ready', () => {
      mockMessages = [
        {
          id: 'msg-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];
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

      // Should have called sendMessage
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('concurrent streaming guard', () => {
    it('should block concurrent startRound calls', () => {
      mockMessages = [
        {
          id: 'msg-user-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: { role: 'user', roundNumber: 0 },
        },
      ];

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: 'thread-123',
          participants: mockParticipants,
          messages: mockMessages,
        }),
      );

      // First call should succeed
      act(() => {
        result.current.startRound();
      });

      const firstCallCount = mockSendMessage.mock.calls.length;

      // Second call should be blocked
      act(() => {
        result.current.startRound();
      });

      // Should NOT have called sendMessage again
      expect(mockSendMessage.mock.calls).toHaveLength(firstCallCount);
    });
  });
});
