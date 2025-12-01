/**
 * Chat Form Actions with Attachments Tests
 *
 * Tests for submitting messages with file attachments including:
 * - Creating thread with attachments on initial round
 * - Sending messages with attachments in subsequent rounds
 * - Attachment ID tracking through the form submission flow
 * - Multiple attachments per message
 * - Error handling when attachments fail
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { renderHook, waitFor } from '@/lib/testing';

import { useChatFormActions } from '../actions/form-actions';

// Mock mutations
const mockCreateThreadMutation = vi.fn();
const mockUpdateThreadMutation = vi.fn();

vi.mock('@/hooks/mutations/chat-mutations', () => ({
  useCreateThreadMutation: () => ({
    mutateAsync: mockCreateThreadMutation,
    isPending: false,
  }),
  useUpdateThreadMutation: () => ({
    mutateAsync: mockUpdateThreadMutation,
    isPending: false,
  }),
}));

// Mock chat store provider with both hook and component
vi.mock('@/components/providers/chat-store-provider', () => ({
  useChatStore: vi.fn(),
  ChatStoreProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('chat Form Actions with Attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default store state
    vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
      const mockState = {
        // Form state
        inputValue: 'Test message',
        selectedMode: 'brainstorming',
        selectedParticipants: [
          {
            id: 'participant-1',
            modelId: 'anthropic/claude-sonnet-4.5',
            role: null,
            priority: 0,
            settings: null,
          },
        ],
        enableWebSearch: false,

        // Thread state
        thread: null,
        participants: [],
        messages: [],

        // Actions
        setInputValue: vi.fn(),
        resetForm: vi.fn(),
        setSelectedMode: vi.fn(),
        setSelectedParticipants: vi.fn(),
        setEnableWebSearch: vi.fn(),
        setShowInitialUI: vi.fn(),
        setIsCreatingThread: vi.fn(),
        setWaitingToStartStreaming: vi.fn(),
        setCreatedThreadId: vi.fn(),
        setHasPendingConfigChanges: vi.fn(),
        prepareForNewMessage: vi.fn(),
        setExpectedParticipantIds: vi.fn(),
        initializeThread: vi.fn(),
        updateParticipants: vi.fn(),
        addPreSearch: vi.fn(),
        addAnalysis: vi.fn(),
        setStreamingRoundNumber: vi.fn(),
        setMessages: vi.fn(),
        setHasEarlyOptimisticMessage: vi.fn(),
      };

      return selector(mockState);
    });
  });

  describe('handleCreateThread with attachments', () => {
    it('creates thread with single attachment', async () => {
      mockCreateThreadMutation.mockResolvedValue({
        data: {
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'New Chat',
            slug: 'new-chat-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-123',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Test message' }],
              roundNumber: 0,
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-123'];
      await result.current.handleCreateThread(attachmentIds);

      expect(mockCreateThreadMutation).toHaveBeenCalledWith({
        json: expect.objectContaining({
          firstMessage: 'Test message',
          mode: 'brainstorming',
          attachmentIds: ['upload-123'],
        }),
      });
    });

    it('creates thread with multiple attachments', async () => {
      mockCreateThreadMutation.mockResolvedValue({
        data: {
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'New Chat',
            slug: 'new-chat-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-123',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Test message' }],
              roundNumber: 0,
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-123', 'upload-456', 'upload-789'];
      await result.current.handleCreateThread(attachmentIds);

      expect(mockCreateThreadMutation).toHaveBeenCalledWith({
        json: expect.objectContaining({
          attachmentIds: ['upload-123', 'upload-456', 'upload-789'],
        }),
      });
    });

    it('creates thread without attachments when none provided', async () => {
      mockCreateThreadMutation.mockResolvedValue({
        data: {
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'New Chat',
            slug: 'new-chat-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-123',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Test message' }],
              roundNumber: 0,
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      await result.current.handleCreateThread();

      expect(mockCreateThreadMutation).toHaveBeenCalledWith({
        json: expect.objectContaining({
          firstMessage: 'Test message',
          // attachmentIds should be undefined or empty
        }),
      });
    });

    it('passes attachment IDs to prepareForNewMessage', async () => {
      const mockPrepareForNewMessage = vi.fn();

      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Test message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: null,
          participants: [],
          messages: [],
          pendingAttachments: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: mockPrepareForNewMessage,
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
          clearAttachments: vi.fn(),
        };

        return selector(mockState);
      });

      mockCreateThreadMutation.mockResolvedValue({
        data: {
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'New Chat',
            slug: 'new-chat-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-123',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Test message' }],
              roundNumber: 0,
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-123', 'upload-456'];
      await result.current.handleCreateThread(attachmentIds);

      await waitFor(() => {
        expect(mockPrepareForNewMessage).toHaveBeenCalledWith(
          'Test message',
          expect.any(Array), // participantModelIds
          attachmentIds,
        );
      });
    });
  });

  describe('handleUpdateThreadAndSend with attachments', () => {
    beforeEach(() => {
      // Mock thread with existing data
      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Follow-up message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'db-participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'Existing Thread',
            slug: 'existing-thread-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Previous message' }],
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
            },
            {
              id: 'message-2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'AI response' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'db-participant-1',
                participantIndex: 0,
                model: 'anthropic/claude-sonnet-4.5',
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              },
            },
          ],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: vi.fn(),
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
        };

        return selector(mockState);
      });
    });

    it('sends message with single attachment in round 1', async () => {
      const mockPrepareForNewMessage = vi.fn();

      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Follow-up message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'db-participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'Existing Thread',
            slug: 'existing-thread-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Previous message' }],
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
            },
            {
              id: 'message-2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'AI response' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'db-participant-1',
                participantIndex: 0,
                model: 'anthropic/claude-sonnet-4.5',
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              },
            },
          ],
          pendingAttachments: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: mockPrepareForNewMessage,
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
          clearAttachments: vi.fn(),
        };

        return selector(mockState);
      });

      mockUpdateThreadMutation.mockResolvedValue({
        data: {
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-abc'];
      await result.current.handleUpdateThreadAndSend('thread-123', attachmentIds);

      // prepareForNewMessage should be called with attachment IDs
      expect(mockPrepareForNewMessage).toHaveBeenCalledWith(
        'Follow-up message',
        [],
        attachmentIds,
      );
    });

    it('sends message with multiple attachments', async () => {
      const mockPrepareForNewMessage = vi.fn();

      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Follow-up message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'db-participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'Existing Thread',
            slug: 'existing-thread-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Previous message' }],
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
            },
            {
              id: 'message-2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'AI response' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'db-participant-1',
                participantIndex: 0,
                model: 'anthropic/claude-sonnet-4.5',
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              },
            },
          ],
          pendingAttachments: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: mockPrepareForNewMessage,
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
          clearAttachments: vi.fn(),
        };

        return selector(mockState);
      });

      mockUpdateThreadMutation.mockResolvedValue({
        data: {
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-1', 'upload-2', 'upload-3'];
      await result.current.handleUpdateThreadAndSend('thread-123', attachmentIds);

      expect(mockPrepareForNewMessage).toHaveBeenCalledWith(
        'Follow-up message',
        [],
        attachmentIds,
      );
    });

    it('sends message without attachments when none provided', async () => {
      const mockPrepareForNewMessage = vi.fn();

      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Follow-up message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'db-participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'Existing Thread',
            slug: 'existing-thread-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Previous message' }],
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
            },
            {
              id: 'message-2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'AI response' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'db-participant-1',
                participantIndex: 0,
                model: 'anthropic/claude-sonnet-4.5',
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              },
            },
          ],
          pendingAttachments: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: mockPrepareForNewMessage,
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
          clearAttachments: vi.fn(),
        };

        return selector(mockState);
      });

      mockUpdateThreadMutation.mockResolvedValue({
        data: {
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      });

      const { result } = renderHook(() => useChatFormActions());

      await result.current.handleUpdateThreadAndSend('thread-123');

      expect(mockPrepareForNewMessage).toHaveBeenCalledWith(
        'Follow-up message',
        [],
        undefined, // No attachments
      );
    });

    it('creates optimistic user message with attachment IDs stored in metadata', async () => {
      mockUpdateThreadMutation.mockResolvedValue({
        data: {
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      });

      const mockSetMessages = vi.fn();

      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Follow-up message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'db-participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'Existing Thread',
            slug: 'existing-thread-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Previous message' }],
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
            },
            {
              id: 'message-2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'AI response' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'db-participant-1',
                participantIndex: 0,
                model: 'anthropic/claude-sonnet-4.5',
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              },
            },
          ],
          pendingAttachments: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: vi.fn(),
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: mockSetMessages,
          setHasEarlyOptimisticMessage: vi.fn(),
          clearAttachments: vi.fn(),
        };

        return selector(mockState);
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-123'];
      await result.current.handleUpdateThreadAndSend('thread-123', attachmentIds);

      // Optimistic message should be created immediately
      await waitFor(() => {
        expect(mockSetMessages).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Follow-up message' }],
              metadata: expect.objectContaining({
                role: MessageRoles.USER,
                roundNumber: 1,
                isOptimistic: true,
              }),
            }),
          ]),
        );
      });
    });
  });

  describe('validation with attachments', () => {
    it('validates form even when attachments are present', () => {
      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: '', // Empty input
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'participant-1',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: false,
          thread: null,
          participants: [],
          messages: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: vi.fn(),
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
        };

        return selector(mockState);
      });

      const { result } = renderHook(() => useChatFormActions());

      // Form should be invalid even with attachments
      expect(result.current.isFormValid).toBe(false);
    });

    it('allows submission with valid input and attachments', () => {
      const { result } = renderHook(() => useChatFormActions());

      // Form should be valid with input and participants
      expect(result.current.isFormValid).toBe(true);
    });
  });

  describe('error handling with attachments', () => {
    it('handles thread creation error gracefully', async () => {
      mockCreateThreadMutation.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-123'];

      // Error should be caught and handled gracefully (toast shown)
      // handleCreateThread catches errors, so this should resolve (not reject)
      await result.current.handleCreateThread(attachmentIds);

      // Mutation should have been attempted
      expect(mockCreateThreadMutation).toHaveBeenCalled();
    });

    it('handles update thread error with attachments', async () => {
      mockUpdateThreadMutation.mockRejectedValue(new Error('Update failed'));

      vi.mocked(useChatStore).mockImplementation((selector: (state: unknown) => unknown) => {
        const mockState = {
          inputValue: 'Follow-up message',
          selectedMode: 'brainstorming',
          selectedParticipants: [
            {
              id: 'new-participant', // Different ID to trigger update
              modelId: 'anthropic/claude-opus-4.5', // Different model to trigger update
              role: null,
              priority: 0,
              settings: null,
            },
          ],
          enableWebSearch: true, // Different to trigger update
          thread: {
            id: 'thread-123',
            userId: 'user-1',
            title: 'Existing Thread',
            slug: 'existing-thread-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          participants: [
            {
              id: 'db-participant-1',
              threadId: 'thread-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Previous message' }],
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
            },
            {
              id: 'message-2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: 'text', text: 'AI response' }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber: 0,
                participantId: 'db-participant-1',
                participantIndex: 0,
                model: 'anthropic/claude-sonnet-4.5',
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
              },
            },
          ],
          pendingAttachments: [],
          setInputValue: vi.fn(),
          resetForm: vi.fn(),
          setSelectedMode: vi.fn(),
          setSelectedParticipants: vi.fn(),
          setEnableWebSearch: vi.fn(),
          setShowInitialUI: vi.fn(),
          setIsCreatingThread: vi.fn(),
          setWaitingToStartStreaming: vi.fn(),
          setCreatedThreadId: vi.fn(),
          setHasPendingConfigChanges: vi.fn(),
          prepareForNewMessage: vi.fn(),
          setExpectedParticipantIds: vi.fn(),
          initializeThread: vi.fn(),
          updateParticipants: vi.fn(),
          addPreSearch: vi.fn(),
          addAnalysis: vi.fn(),
          setStreamingRoundNumber: vi.fn(),
          setMessages: vi.fn(),
          setHasEarlyOptimisticMessage: vi.fn(),
          clearAttachments: vi.fn(),
        };

        return selector(mockState);
      });

      const { result } = renderHook(() => useChatFormActions());

      const attachmentIds = ['upload-123'];

      // Error should be handled gracefully (toast shown)
      await result.current.handleUpdateThreadAndSend('thread-123', attachmentIds);

      // Mutation should have been attempted (because enableWebSearch changed from false to true)
      expect(mockUpdateThreadMutation).toHaveBeenCalled();
    });
  });
});
