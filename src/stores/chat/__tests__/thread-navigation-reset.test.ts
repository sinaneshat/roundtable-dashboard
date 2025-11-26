/**
 * Thread Navigation Reset Tests
 *
 * Tests the critical fix for stale state leakage during navigation.
 *
 * ROOT CAUSE: When navigating between threads or from overview to thread,
 * old messages/participants would persist because:
 * 1. resetThreadState() only cleared flags, not messages/participants
 * 2. AI SDK hook retained internal messages that got synced back to store
 *
 * FIX: Added resetForThreadNavigation() which clears ALL thread data including:
 * - messages, participants, thread (prevents participant ID mismatch)
 * - analyses, preSearches (prevents old content showing)
 * - Calls chatSetMessages([]) to clear AI SDK hook's internal state
 *
 * @see https://github.com/pmndrs/zustand/blob/main/docs/guides/testing.md
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ChatModes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread, StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';

import { createChatStore } from '../store';

describe('thread Navigation Reset', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('resetForThreadNavigation', () => {
    it('should clear ALL thread data including messages, participants, and thread', () => {
      // Setup: simulate a thread with data
      const mockThread: ChatThread = {
        id: 'old-thread-id',
        userId: 'user-1',
        projectId: null,
        title: 'Old Thread',
        slug: 'old-thread-slug',
        mode: ChatModes.DEBATING,
        status: 'active',
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: true,
        enableWebSearch: false,
        metadata: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      };

      const mockParticipants: ChatParticipant[] = [
        {
          id: 'old-participant-1',
          threadId: 'old-thread-id',
          modelId: 'openai/gpt-4',
          customRoleId: null,
          role: 'Analyst',
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockMessages: UIMessage[] = [
        {
          id: 'old-thread-id_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Old message content' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'old-participant-1',
            participantIndex: 0,
          },
        },
      ];

      const mockAnalysis: StoredModeratorAnalysis = {
        id: 'old-analysis-id',
        threadId: 'old-thread-id',
        roundNumber: 0,
        mode: ChatModes.DEBATING,
        userQuestion: 'Old question',
        status: AnalysisStatuses.COMPLETE,
        participantMessageIds: ['old-thread-id_r0_p0'],
        analysisData: null,
        errorMessage: null,
        completedAt: new Date(),
        createdAt: new Date(),
      };

      const mockPreSearch: StoredPreSearch = {
        id: 'old-presearch-id',
        threadId: 'old-thread-id',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Old search query',
        searchData: null,
        errorMessage: null,
        completedAt: new Date(),
        createdAt: new Date(),
      };

      // Set all the state
      store.setState({
        thread: mockThread,
        participants: mockParticipants,
        messages: mockMessages,
        analyses: [mockAnalysis],
        preSearches: [mockPreSearch],
        isStreaming: true,
        createdThreadId: 'old-thread-id',
        screenMode: ScreenModes.THREAD,
      });

      // Verify state is set
      expect(store.getState().thread?.id).toBe('old-thread-id');
      expect(store.getState().participants).toHaveLength(1);
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().preSearches).toHaveLength(1);

      // Act: Reset for thread navigation
      store.getState().resetForThreadNavigation();

      // Assert: ALL thread data should be cleared
      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.participants).toHaveLength(0);
      expect(state.messages).toHaveLength(0);
      expect(state.analyses).toHaveLength(0);
      expect(state.preSearches).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
      expect(state.createdThreadId).toBeNull();
    });

    it('should call chatSetMessages to clear AI SDK hook messages', () => {
      const mockSetMessages = vi.fn();

      store.setState({
        chatSetMessages: mockSetMessages,
        messages: [
          {
            id: 'test-msg',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'Test' }],
          },
        ],
      });

      store.getState().resetForThreadNavigation();

      // Should be called with empty array to clear AI SDK hook messages
      expect(mockSetMessages).toHaveBeenCalledWith([]);
    });

    it('should call stop() to cancel ongoing streams', () => {
      const mockStop = vi.fn();

      store.setState({
        stop: mockStop,
        isStreaming: true,
      });

      store.getState().resetForThreadNavigation();

      expect(mockStop).toHaveBeenCalled();
    });

    it('should create fresh Set instances for tracking state', () => {
      // Pre-populate tracking sets
      store.getState().markAnalysisCreated(0);
      store.getState().markPreSearchTriggered(0);

      // Verify they have data
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Reset
      store.getState().resetForThreadNavigation();

      // Should have fresh empty Sets
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });

  describe('resetToOverview', () => {
    it('should clear AI SDK hook messages via chatSetMessages', () => {
      const mockSetMessages = vi.fn();

      store.setState({
        chatSetMessages: mockSetMessages,
        thread: {
          id: 'test-thread',
          userId: 'user-1',
          projectId: null,
          title: 'Test',
          slug: 'test-slug',
          mode: ChatModes.DEBATING,
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: true,
          enableWebSearch: false,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        messages: [
          {
            id: 'test-msg',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'Test' }],
          },
        ],
      });

      store.getState().resetToOverview();

      // Should be called with empty array
      expect(mockSetMessages).toHaveBeenCalledWith([]);
    });

    it('should reset screenMode to overview', () => {
      store.setState({
        screenMode: ScreenModes.THREAD,
      });

      store.getState().resetToOverview();

      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should stop ongoing streams', () => {
      const mockStop = vi.fn();

      store.setState({
        stop: mockStop,
        isStreaming: true,
      });

      store.getState().resetToOverview();

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('resetToNewChat', () => {
    it('should clear AI SDK hook messages via chatSetMessages', () => {
      const mockSetMessages = vi.fn();

      store.setState({
        chatSetMessages: mockSetMessages,
        messages: [
          {
            id: 'test-msg',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'Test' }],
          },
        ],
      });

      store.getState().resetToNewChat();

      expect(mockSetMessages).toHaveBeenCalledWith([]);
    });
  });

  describe('state leakage prevention', () => {
    it('should prevent participant ID mismatch after navigation', () => {
      // This test simulates the exact bug scenario from the user report
      //
      // Scenario:
      // 1. User is on thread-1 with participant ID 'OLD_PARTICIPANT_123'
      // 2. User navigates to /chat (overview)
      // 3. User clicks pre-built conversation -> creates thread-2 with participant ID 'NEW_PARTICIPANT_456'
      // 4. BUG: Message still has metadata.participantId = 'OLD_PARTICIPANT_123'

      // Setup: Thread 1 state
      store.setState({
        thread: {
          id: 'thread-1',
          userId: 'user-1',
          projectId: null,
          title: 'Thread 1',
          slug: 'thread-1-slug',
          mode: ChatModes.DEBATING,
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: true,
          enableWebSearch: false,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        participants: [
          {
            id: 'OLD_PARTICIPANT_123',
            threadId: 'thread-1',
            modelId: 'deepseek/deepseek-r1',
            customRoleId: null,
            role: 'Resource Analyst',
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'thread-1_r1_p3',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'Old content' }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber: 1,
              participantId: 'OLD_PARTICIPANT_123',
              participantIndex: 3,
              participantRole: 'Resource Analyst',
              model: 'deepseek/deepseek-r1',
            },
          },
        ],
        screenMode: ScreenModes.THREAD,
      });

      // Navigate to overview (step 2)
      store.getState().resetToOverview();

      // Verify ALL old state is cleared
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().participants).toHaveLength(0);
      expect(store.getState().thread).toBeNull();

      // Now setup new thread (step 3) - simulating what would happen after creating new thread
      store.setState({
        thread: {
          id: 'thread-2',
          userId: 'user-1',
          projectId: null,
          title: 'Thread 2',
          slug: 'thread-2-slug',
          mode: ChatModes.DEBATING,
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: true,
          enableWebSearch: false,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        participants: [
          {
            id: 'NEW_PARTICIPANT_456',
            threadId: 'thread-2',
            modelId: 'deepseek/deepseek-r1',
            customRoleId: null,
            role: 'Medical Ethicist',
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        createdThreadId: 'thread-2',
      });

      // FIX VERIFICATION: Messages should be empty, not contain old participant data
      expect(store.getState().messages).toHaveLength(0);

      // If we had a message, it should belong to the new participant
      // This would fail BEFORE the fix because old messages would persist
    });

    it('should handle thread-to-thread navigation correctly', () => {
      // Setup: Thread A state
      store.setState({
        thread: {
          id: 'thread-A',
          userId: 'user-1',
          projectId: null,
          title: 'Thread A',
          slug: 'thread-a-slug',
          mode: ChatModes.ANALYZING,
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: true,
          enableWebSearch: true,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        participants: [
          {
            id: 'participant-a',
            threadId: 'thread-A',
            modelId: 'anthropic/claude-sonnet-4',
            customRoleId: null,
            role: 'Geneticist',
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'thread-A_r0_p0',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'Thread A content' }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber: 0,
              participantId: 'participant-a',
              participantIndex: 0,
            },
          },
        ],
        analyses: [
          {
            id: 'analysis-a',
            threadId: 'thread-A',
            roundNumber: 0,
            mode: ChatModes.ANALYZING,
            userQuestion: 'Question A',
            status: AnalysisStatuses.COMPLETE,
            participantMessageIds: ['thread-A_r0_p0'],
            analysisData: null,
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
          },
        ],
        screenMode: ScreenModes.THREAD,
      });

      // Simulate navigation to Thread B
      store.getState().resetForThreadNavigation();

      // Verify ALL thread A data is cleared
      expect(store.getState().thread).toBeNull();
      expect(store.getState().participants).toHaveLength(0);
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().analyses).toHaveLength(0);

      // Now Thread B can be initialized cleanly
      store.getState().initializeThread(
        {
          id: 'thread-B',
          userId: 'user-1',
          projectId: null,
          title: 'Thread B',
          slug: 'thread-b-slug',
          mode: ChatModes.DEBATING,
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: true,
          enableWebSearch: false,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        },
        [
          {
            id: 'participant-b',
            threadId: 'thread-B',
            modelId: 'openai/gpt-5',
            customRoleId: null,
            role: 'Bioethicist',
            priority: 0,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      );

      // Verify Thread B is clean
      expect(store.getState().thread?.id).toBe('thread-B');
      expect(store.getState().participants[0]?.id).toBe('participant-b');
      expect(store.getState().messages).toHaveLength(0); // No stale messages from Thread A
    });
  });
});
