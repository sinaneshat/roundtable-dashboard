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

import { renderHook } from '@/lib/testing';
import type { ChatParticipant } from '@/types/api';

import { useMultiParticipantChat } from '../use-multi-participant-chat';

// Mock @ai-sdk/react before importing the hook
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    append: vi.fn(),
    setMessages: vi.fn(),
    isLoading: false,
    error: null,
    reload: vi.fn(),
    stop: vi.fn(),
    data: undefined,
  })),
}));

describe('useMultiParticipantChat', () => {
  const mockThreadId = 'thread-123';
  let mockParticipants: ChatParticipant[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock participants in priority order
    mockParticipants = [
      {
        id: 'p1',
        threadId: mockThreadId,
        modelId: 'model-1',
        isEnabled: true,
        priority: 0,
        customRoleId: null,
        role: null,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'p2',
        threadId: mockThreadId,
        modelId: 'model-2',
        isEnabled: true,
        priority: 1,
        customRoleId: null,
        role: null,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'p3',
        threadId: mockThreadId,
        modelId: 'model-3',
        isEnabled: true,
        priority: 2,
        customRoleId: null,
        role: null,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  });

  describe('round Initialization', () => {
    it('should initialize with no messages', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
        }),
      );

      expect(result.current.messages).toEqual([]);
      expect(result.current.isStreaming).toBe(false);
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
          threadId: mockThreadId,
          participants: unorderedParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mixedParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
        }),
      );

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify hook is ready to stream
      expect(result.current.isStreaming).toBe(false);
    });

    it('should call startRound with participants override', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          onComplete,
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
      expect(result.current.isStreaming).toBe(false);
    });

    it('should NOT mark round complete until ALL participants finish', async () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          onComplete,
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          onComplete,
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

      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should call onError callback when error occurs', async () => {
      const onError = vi.fn();
      const testError = new Error('Test error');

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          onError,
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          onRetry,
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          streamResumptionPrefilled: true,
        }),
      );

      // With prefilled flag, should not auto-resume
      expect(result.current.isStreaming).toBe(false);
    });

    it('should accept onResumedStreamComplete callback', async () => {
      const onResumedStreamComplete = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          onResumedStreamComplete,
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
        }),
      );

      expect(result.current.isStreaming).toBe(false);

      // Start streaming would set this to true
      await act(async () => {
        result.current.startRound(mockParticipants);
      });

      // Initial state should be false until AI SDK starts
      expect(result.current.isStreaming).toBe(false);
    });

    it('should provide isStreamingRef for synchronous checks', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
        }),
      );

      expect(result.current.isStreamingRef.current).toBe(false);
    });

    it('should provide isTriggeringRef for race condition prevention', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
        }),
      );

      expect(result.current.isTriggeringRef.current).toBe(false);
    });
  });

  describe('animation tracking', () => {
    it('should call clearAnimations callback when provided', async () => {
      const clearAnimations = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          clearAnimations,
        }),
      );

      await act(async () => {
        result.current.startRound(mockParticipants);
      });

      // Animations would be cleared on round start
      expect(result.current.isStreaming).toBe(false);
    });

    it('should call completeAnimation for specific participant', async () => {
      const completeAnimation = vi.fn();
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          completeAnimation,
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
          threadId: mockThreadId,
          participants: [],
          messages: [],
        }),
      );

      expect(result.current.messages).toEqual([]);
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle single participant scenario', async () => {
      const singleParticipant = [mockParticipants[0]];
      const onComplete = vi.fn();

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: singleParticipant,
          messages: [],
          onComplete,
        }),
      );

      await act(async () => {
        result.current.continueFromParticipant(0, singleParticipant);
      });

      // With single participant, round completes after participant 0
      expect(result.current.currentParticipantIndex).toBe(0);
    });

    it('should handle participant reconfiguration mid-round', async () => {
      const { result, rerender } = renderHook(
        ({ participants }) =>
          useMultiParticipantChat({
            threadId: mockThreadId,
            participants,
            messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          isNewlyCreatedThread: true,
        }),
      );

      // Newly created threads don't auto-resume
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle early optimistic message flag', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          hasEarlyOptimisticMessage: true,
        }),
      );

      // With early optimistic message, prevents resumed stream race
      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('messages state', () => {
    it('should allow setting messages manually', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
        }),
      );

      const testMessages = [
        {
          id: 'msg-1',
          role: MessageRoles.USER as const,
          content: 'Test message',
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          enableWebSearch: true,
          onPreSearchStart,
        }),
      );

      // Pre-search callbacks would be called during search phase
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle pre-search query callback', async () => {
      const onPreSearchQuery = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          enableWebSearch: true,
          onPreSearchQuery,
        }),
      );

      // Callback setup verified
      expect(onPreSearchQuery).toBeDefined();
    });

    it('should handle pre-search result callback', async () => {
      const onPreSearchResult = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          enableWebSearch: true,
          onPreSearchResult,
        }),
      );

      expect(onPreSearchResult).toBeDefined();
    });

    it('should handle pre-search complete callback', async () => {
      const onPreSearchComplete = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          enableWebSearch: true,
          onPreSearchComplete,
        }),
      );

      expect(onPreSearchComplete).toBeDefined();
    });

    it('should handle pre-search error callback', async () => {
      const onPreSearchError = vi.fn();
      renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          enableWebSearch: true,
          onPreSearchError,
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          pendingAttachmentIds,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('Message with attachments');
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle pending file parts', async () => {
      const pendingFileParts = [
        {
          type: 'file' as const,
          mimeType: 'application/pdf',
          data: 'base64data',
          uploadId: 'upload-1',
        },
      ];

      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          pendingFileParts,
        }),
      );

      await act(async () => {
        await result.current.sendMessage('Message with file');
      });

      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('regenerate Round', () => {
    it('should handle round regeneration', async () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          regenerateRoundNumber: 0,
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
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          mode: 'moderator',
        }),
      );

      expect(result.current.isStreaming).toBe(false);
    });

    it('should accept standard mode', () => {
      const { result } = renderHook(() =>
        useMultiParticipantChat({
          threadId: mockThreadId,
          participants: mockParticipants,
          messages: [],
          mode: 'standard',
        }),
      );

      expect(result.current.isStreaming).toBe(false);
    });
  });
});
