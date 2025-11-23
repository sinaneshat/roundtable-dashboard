/**
 * Multi-Participant Chat Empty Response Fix Tests
 *
 * Tests that fast models (like gemini-flash-lite) don't get incorrectly
 * marked as empty_response errors when finishReason='stop' but parts
 * haven't been populated yet in React state.
 *
 * This prevents false empty_response errors for successful completions.
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

let useChatOnFinish: ((data: { message: UIMessage }) => void) | undefined;
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

describe('empty_response fix for fast models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages = [];
    mockStatus = 'ready';
    useChatOnFinish = undefined;
  });

  it('should NOT mark as error when finishReason=stop but parts not populated', () => {
    const participants: ChatParticipant[] = [{
      id: 'p1',
      threadId: 'thread-1',
      modelId: 'google/gemini-2.5-flash-lite',
      role: 'Assistant',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    renderHook(() =>
      useMultiParticipantChat({
        threadId: 'thread-1',
        participants,
      }),
    );

    // Simulate message with finishReason='stop' but empty parts array
    // This happens when onFinish fires before React state updates parts
    const messageWithMetadata: UIMessage = {
      id: 'thread-1_r0_p0',
      role: MessageRoles.ASSISTANT,
      parts: [], // Empty parts - not populated yet
      metadata: {
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: 'Assistant',
        model: 'google/gemini-2.5-flash-lite',
        finishReason: 'stop', // ✅ Indicates successful completion
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        hasError: false,
      },
    };

    // Trigger onFinish
    act(() => {
      useChatOnFinish?.({ message: messageWithMetadata });
    });

    // ✅ Should NOT have hasError=true in metadata
    expect(mockSetMessages).toHaveBeenCalled();
    const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1];
    const setMessagesCallback = lastCall[0];

    // Execute callback to get final messages
    const finalMessages = setMessagesCallback([messageWithMetadata]);
    const updatedMessage = finalMessages.find((m: UIMessage) => m.id === 'thread-1_r0_p0');

    expect(updatedMessage).toBeDefined();
    expect(updatedMessage?.metadata).toBeDefined();

    // Verify hasError is false (not marked as error)
    expect(updatedMessage?.metadata).toMatchObject({
      hasError: false,
    });
  });

  it('should detect success even when parts have text', () => {
    const participants: ChatParticipant[] = [{
      id: 'p1',
      threadId: 'thread-1',
      modelId: 'google/gemini-2.5-flash-lite',
      role: 'Assistant',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    renderHook(() =>
      useMultiParticipantChat({
        threadId: 'thread-1',
        participants,
      }),
    );

    // Message with both parts AND finishReason='stop'
    const messageWithContent: UIMessage = {
      id: 'thread-1_r0_p0',
      role: MessageRoles.ASSISTANT,
      parts: [{
        type: 'text',
        text: 'This is a successful response',
      }],
      metadata: {
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: 'Assistant',
        model: 'google/gemini-2.5-flash-lite',
        finishReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        hasError: false,
      },
    };

    act(() => {
      useChatOnFinish?.({ message: messageWithContent });
    });

    // Verify message is not marked as error
    expect(mockSetMessages).toHaveBeenCalled();
    const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1];
    const setMessagesCallback = lastCall[0];
    const finalMessages = setMessagesCallback([messageWithContent]);
    const updatedMessage = finalMessages.find((m: UIMessage) => m.id === 'thread-1_r0_p0');

    expect(updatedMessage?.metadata).toBeDefined();
    expect(updatedMessage?.metadata).toMatchObject({
      hasError: false,
    });
    // Verify errorType is not present
    expect(updatedMessage?.metadata).not.toHaveProperty('errorType');
  });

  it('should still mark as error when finishReason is NOT stop and no content', () => {
    const participants: ChatParticipant[] = [{
      id: 'p1',
      threadId: 'thread-1',
      modelId: 'some-model',
      role: 'Assistant',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    renderHook(() =>
      useMultiParticipantChat({
        threadId: 'thread-1',
        participants,
      }),
    );

    // Message with finishReason='failed' and no content - this IS an error
    const errorMessage: UIMessage = {
      id: 'thread-1_r0_p0',
      role: MessageRoles.ASSISTANT,
      parts: [],
      metadata: {
        role: UIMessageRoles.ASSISTANT,
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 0,
        participantRole: 'Assistant',
        model: 'some-model',
        finishReason: 'failed', // ✅ Indicates failure
        usage: {
          promptTokens: 100,
          completionTokens: 0,
          totalTokens: 100,
        },
        hasError: true,
      },
    };

    act(() => {
      useChatOnFinish?.({ message: errorMessage });
    });

    // Verify message IS marked as error
    expect(mockSetMessages).toHaveBeenCalled();
    const lastCall = mockSetMessages.mock.calls[mockSetMessages.mock.calls.length - 1];
    const setMessagesCallback = lastCall[0];
    const finalMessages = setMessagesCallback([errorMessage]);
    const updatedMessage = finalMessages.find((m: UIMessage) => m.id === 'thread-1_r0_p0');

    expect(updatedMessage?.metadata).toBeDefined();
    expect(updatedMessage?.metadata).toMatchObject({
      hasError: true,
    });
  });
});
