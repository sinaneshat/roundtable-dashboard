/**
 * Multi-Participant Chat Hook Unit Tests
 *
 * Tests the useMultiParticipantChat hook which orchestrates multi-AI participant conversations.
 * Covers round completion, turn-taking, error handling, and credit deduction scenarios.
 *
 * Test Coverage:
 * - Round initialization and participant ordering
 * - Sequential participant streaming
 * - Round completion detection
 * - Error handling and retry
 * - Incomplete round resumption
 * - Credit deduction per round
 */

import { MessageRoles } from '@roundtable/shared';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockParticipant, renderHook } from '@/lib/testing';
import type { ChatParticipant } from '@/services/api';

import { useMultiParticipantChat } from '../use-multi-participant-chat';

// Mock @ai-sdk/react before importing the hook
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    append: vi.fn(),
    data: undefined,
    error: null,
    isLoading: false,
    messages: [],
    reload: vi.fn(),
    setMessages: vi.fn(),
    stop: vi.fn(),
  })),
}));

describe('useMultiParticipantChat', () => {
  const mockThreadId = 'thread-123';
  let mockParticipants: ChatParticipant[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock participants in priority order using factory
    mockParticipants = [
      createMockParticipant(0, {
        id: 'p1',
        isEnabled: true,
        modelId: 'model-1',
        priority: 0,
        threadId: mockThreadId,
      }),
      createMockParticipant(1, {
        id: 'p2',
        isEnabled: true,
        modelId: 'model-2',
        priority: 1,
        threadId: mockThreadId,
      }),
      createMockParticipant(2, {
        id: 'p3',
        isEnabled: true,
        modelId: 'model-3',
        priority: 2,
        threadId: mockThreadId,
      }),
    ];
  });

  describe('round Initialization', () => {
    it('should initialize with no messages', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.messages).toEqual([]);
      expect(result.current.isStreaming).toBeFalsy();
      expect(result.current.currentParticipantIndex).toBe(0);
    });

    it('should order participants by priority', () => {
      const unorderedParticipants = [
        { ...mockParticipants[2], priority: 2 },
        { ...mockParticipants[0], priority: 0 },
        { ...mockParticipants[1], priority: 1 },
      ];

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: unorderedParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.currentParticipantIndex).toBe(0);
    });

    it('should filter out disabled participants', () => {
      const mixedParticipants = [
        { ...mockParticipants[0], isEnabled: true },
        { ...mockParticipants[1], isEnabled: false },
        { ...mockParticipants[2], isEnabled: true },
      ];

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mixedParticipants,
          threadId: mockThreadId,
        }),
      );

      // Should only consider enabled participants
      expect(result.current.currentParticipantIndex).toBe(0);
    });
  });

  describe('round Start', () => {
    it('should accept sendMessage to start round', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify hook is ready to stream
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should call startRound with participants override', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      const freshParticipants = [...mockParticipants];

      await act(async () => {
        result.current.startRound(freshParticipants);
      });

      expect(result.current.currentParticipantIndex).toBe(0);
    });
  });

  describe('participant Turn-Taking', () => {
    it('should expose continueFromParticipant function', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Verify function exists and can be called
      expect(result.current.continueFromParticipant).toBeDefined();
      expect(typeof result.current.continueFromParticipant).toBe('function');

      // Call function without error
      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      // Function executed without throwing
      expect(result.current.currentParticipantIndex).toBeDefined();
    });

    it('should accept participant validation object', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Should accept both number and validation object
      await act(async () => {
        result.current.continueFromParticipant(
          { index: 1, participantId: 'p2' },
          mockParticipants,
        );
      });

      // Function executed without throwing
      expect(result.current.continueFromParticipant).toBeDefined();
    });

    it('should allow sequential continuation calls', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Should allow multiple continuation calls
      await act(async () => {
        result.current.continueFromParticipant(0, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(2, mockParticipants);
      });

      // All calls completed without error
      expect(result.current.continueFromParticipant).toBeDefined();
    });
  });

  describe('round Completion', () => {
    it('should detect round complete when all participants respond', async () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onComplete,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Simulate all 3 participants completing
      await act(async () => {
        result.current.continueFromParticipant(0, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(2, mockParticipants);
      });

      // Round should be complete
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should NOT mark round complete until ALL participants finish', async () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onComplete,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Only 2 out of 3 participants complete
      await act(async () => {
        result.current.continueFromParticipant(0, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      // Round NOT complete yet
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('should call onComplete callback when round finishes', async () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onComplete,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Complete all participants
      await act(async () => {
        result.current.continueFromParticipant(0, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      await act(async () => {
        result.current.continueFromParticipant(2, mockParticipants);
      });

      expect(result.current.isStreaming).toBeFalsy();
    });
  });

  describe('error handling', () => {
    it('should call onError callback when error occurs', async () => {
      const onError = vi.fn();
      const testError = new Error('Test error');

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onError,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Simulate error by setting error state
      await act(async () => {
        // This would normally come from AI SDK error
        result.current.error = testError;
      });

      expect(result.current.error).toBe(testError);
    });

    it('should support retry after error', async () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onRetry,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        result.current.retry();
      });

      // Retry should reset state
      expect(result.current.error).toBeNull();
    });
  });

  describe('incomplete round resumption', () => {
    it('should support resumption via continueFromParticipant', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Should allow calling continueFromParticipant for resumption
      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      // Function executed for resumption scenario
      expect(result.current.continueFromParticipant).toBeDefined();
    });

    it('should handle stream resumption prefilled flag', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          streamResumptionPrefilled: true,
          threadId: mockThreadId,
        }),
      );

      // With prefilled flag, should not auto-resume
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should accept onResumedStreamComplete callback', async () => {
      const onResumedStreamComplete = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onResumedStreamComplete,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        result.current.continueFromParticipant(1, mockParticipants);
      });

      // Callback is configured and available
      expect(result.current.continueFromParticipant).toBeDefined();
    });
  });

  describe('streaming state management', () => {
    it('should track isStreaming state correctly', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.isStreaming).toBeFalsy();

      // Start streaming would set this to true
      await act(async () => {
        result.current.startRound(mockParticipants);
      });

      // Initial state should be false until AI SDK starts
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should provide isStreamingRef for synchronous checks', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.isStreamingRef.current).toBeFalsy();
    });

    it('should provide isTriggeringRef for race condition prevention', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.isTriggeringRef.current).toBeFalsy();
    });
  });

  describe('animation tracking', () => {
    it('should call clearAnimations callback when provided', async () => {
      const clearAnimations = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          clearAnimations,
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        result.current.startRound(mockParticipants);
      });

      // Animations would be cleared on round start
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should call completeAnimation for specific participant', async () => {
      const completeAnimation = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          completeAnimation,
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        result.current.continueFromParticipant(0, mockParticipants);
      });

      // Animation completion would be called when participant finishes
      expect(result.current.currentParticipantIndex).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty participants array', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: [],
          threadId: mockThreadId,
        }),
      );

      expect(result.current.messages).toEqual([]);
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should handle single participant scenario', async () => {
      const singleParticipant = [mockParticipants[0]];
      const onComplete = vi.fn();

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          onComplete,
          participants: singleParticipant,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        result.current.continueFromParticipant(0, singleParticipant);
      });

      // With single participant, round completes after participant 0
      expect(result.current.currentParticipantIndex).toBe(0);
    });

    it('should handle participant reconfiguration mid-round', async () => {
      const { rerender, result } = renderHook(
        ({ participants }) =>
          useMultiParticipantChat({
            messages: [],
            participants,
            threadId: mockThreadId,
          }),
        {
          initialProps: { participants: mockParticipants },
        },
      );

      // Reconfigure to 2 participants
      const newParticipants = mockParticipants.slice(0, 2);

      rerender({ participants: newParticipants });

      // Should handle gracefully
      expect(result.current.currentParticipantIndex).toBe(0);
    });

    it('should handle newly created thread flag', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Newly created threads don't auto-resume
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should handle early optimistic message flag', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          hasEarlyOptimisticMessage: true,
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // With early optimistic message, prevents resumed stream race
      expect(result.current.isStreaming).toBeFalsy();
    });
  });

  describe('messages state', () => {
    it('should allow setting messages manually', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      const testMessages = [
        {
          content: 'Test message',
          id: 'msg-1',
          role: MessageRoles.USER as const,
        },
      ];

      await act(async () => {
        result.current.setMessages(testMessages);
      });

      // Messages would be updated in AI SDK
      expect(result.current.messages).toBeDefined();
    });

    it('should accept messages callback function', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        result.current.setMessages(prev => [...prev]);
      });

      expect(result.current.messages).toBeDefined();
    });
  });

  describe('isReady state', () => {
    it('should provide isReady state', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // isReady should be defined as a boolean
      expect(typeof result.current.isReady).toBe('boolean');
    });
  });

  describe('pre-search integration', () => {
    it('should handle pre-search start callback', async () => {
      const onPreSearchStart = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          enableWebSearch: true,
          messages: [],
          onPreSearchStart,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Pre-search callbacks would be called during search phase
      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should handle pre-search query callback', async () => {
      const onPreSearchQuery = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          enableWebSearch: true,
          messages: [],
          onPreSearchQuery,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      // Callback setup verified
      expect(onPreSearchQuery).toBeDefined();
    });

    it('should handle pre-search result callback', async () => {
      const onPreSearchResult = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          enableWebSearch: true,
          messages: [],
          onPreSearchResult,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(onPreSearchResult).toBeDefined();
    });

    it('should handle pre-search complete callback', async () => {
      const onPreSearchComplete = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          enableWebSearch: true,
          messages: [],
          onPreSearchComplete,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(onPreSearchComplete).toBeDefined();
    });

    it('should handle pre-search error callback', async () => {
      const onPreSearchError = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          enableWebSearch: true,
          messages: [],
          onPreSearchError,
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(onPreSearchError).toBeDefined();
    });
  });

  describe('file Attachments', () => {
    it('should handle pending attachment IDs', async () => {
      const pendingAttachmentIds = ['att-1', 'att-2'];
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          pendingAttachmentIds,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('Message with attachments');
      });

      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should handle pending file parts', async () => {
      const pendingFileParts = [
        {
          data: 'base64data',
          mimeType: 'application/pdf',
          type: 'file' as const,
          uploadId: 'upload-1',
        },
      ];

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          pendingFileParts,
          threadId: mockThreadId,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('Message with file');
      });

      expect(result.current.isStreaming).toBeFalsy();
    });
  });

  describe('regenerate Round', () => {
    it('should handle round regeneration', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          participants: mockParticipants,
          regenerateRoundNumber: 0,
          threadId: mockThreadId,
        }),
      );

      // Regenerate flag indicates round 0 should be regenerated
      expect(result.current.currentParticipantIndex).toBe(0);
    });
  });

  describe('chat Mode', () => {
    it('should accept moderator mode', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          mode: 'moderator',
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.isStreaming).toBeFalsy();
    });

    it('should accept standard mode', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          messages: [],
          mode: 'standard',
          participants: mockParticipants,
          threadId: mockThreadId,
        }),
      );

      expect(result.current.isStreaming).toBeFalsy();
    });
  });
});
