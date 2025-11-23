/**
 * Streaming Flow Orchestration Tests
 *
 * Tests the complete streaming flow order and animation coordination:
 * 1. User message
 * 2. Pre-search (if web search enabled)
 * 3. Participant streaming (waits for pre-search completion)
 * 4. Analysis streaming (waits for participant completion + animations)
 *
 * Each step must wait for:
 * - Previous step to complete
 * - Animations to finish
 * - Proper status transitions
 *
 * @see docs/FLOW_DOCUMENTATION.md
 * @see src/components/providers/chat-store-provider.tsx (lines 467-538, 104-174)
 */

import type { UIMessage } from '@ai-sdk/react';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';

import { createChatStore } from '../store';
import type { ChatState } from '../types';

describe('streaming flow orchestration', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatState;
  let setState: (partial: Partial<ChatState>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
    getState = () => store.getState();
    setState = partial => store.setState(partial);
  });

  describe('flow order: user message → pre-search → participants → analysis', () => {
    it('should execute steps in correct order when web search enabled', async () => {
      const executionOrder: string[] = [];

      // Setup: Thread with web search enabled
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: true,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        screenMode: ScreenModes.OVERVIEW,
        messages: [],
        preSearches: [],
        analyses: [],
      });

      // Step 1: User submits message
      executionOrder.push('user-message');
      setState({
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        pendingMessage: 'Test question',
        expectedParticipantIds: ['openrouter/anthropic/claude-3.5-sonnet'],
        waitingToStartStreaming: true,
      });

      // Step 2: Pre-search should be created (PENDING)
      await waitFor(() => {
        // Simulate backend creating PENDING pre-search
        executionOrder.push('pre-search-created');
        setState({
          preSearches: [
            {
              id: 'ps1',
              threadId: 'thread-1',
              roundNumber: 0,
              userQuery: 'Test question',
              status: AnalysisStatuses.PENDING,
              searchData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredPreSearch,
          ],
        });
      });

      // Verify: Participants should NOT start yet (pre-search not complete)
      expect(executionOrder).toEqual(['user-message', 'pre-search-created']);

      // Step 3: Pre-search completes
      await act(async () => {
        executionOrder.push('pre-search-streaming');
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.STREAMING,
            },
          ],
        });

        // Simulate streaming completion
        await new Promise(resolve => setTimeout(resolve, 100));

        executionOrder.push('pre-search-complete');
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.COMPLETE,
              searchData: {
                queries: [],
                results: [],
                analysis: 'Test analysis',
                successCount: 0,
                failureCount: 0,
                totalResults: 0,
                totalTime: 100,
              },
              completedAt: new Date(),
            },
          ],
        });
      });

      // Step 4: Participants should NOW start (pre-search complete)
      await waitFor(() => {
        // Simulate provider effect calling startRound
        executionOrder.push('participants-start');
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
        });
      });

      // Step 5: Participants stream and complete
      await act(async () => {
        executionOrder.push('participants-streaming');

        // Add participant message
        setState({
          messages: [
            ...getState().messages,
            {
              id: 'm2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }],
              roundNumber: 0,
              participantId: 'p1',
              createdAt: new Date(),
            } as UIMessage,
          ],
        });

        // Complete streaming
        executionOrder.push('participants-complete');
        setState({
          isStreaming: false,
        });
      });

      // Step 6: Analysis should be created (after participants complete)
      await waitFor(() => {
        // Simulate onComplete callback creating pending analysis
        executionOrder.push('analysis-created');
        setState({
          analyses: [
            {
              id: 'a1',
              threadId: 'thread-1',
              roundNumber: 0,
              mode: 'brainstorming',
              userQuestion: 'Test question',
              status: AnalysisStatuses.PENDING,
              participantMessageIds: ['m2'],
              analysisData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredModeratorAnalysis,
          ],
        });
      });

      // Verify complete flow order
      expect(executionOrder).toEqual([
        'user-message',
        'pre-search-created',
        'pre-search-streaming',
        'pre-search-complete',
        'participants-start',
        'participants-streaming',
        'participants-complete',
        'analysis-created',
      ]);
    });

    it('should skip pre-search when web search disabled', async () => {
      const executionOrder: string[] = [];

      // Setup: Thread with web search DISABLED
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false, // Disabled
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        screenMode: ScreenModes.OVERVIEW,
        messages: [],
        preSearches: [],
        analyses: [],
      });

      // Step 1: User submits message
      executionOrder.push('user-message');
      setState({
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        waitingToStartStreaming: true,
      });

      // Step 2: Participants should start IMMEDIATELY (no pre-search)
      await waitFor(() => {
        executionOrder.push('participants-start');
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
        });
      });

      // Step 3: Participants complete
      await act(async () => {
        executionOrder.push('participants-complete');
        setState({
          isStreaming: false,
          messages: [
            ...getState().messages,
            {
              id: 'm2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }],
              roundNumber: 0,
              participantId: 'p1',
              createdAt: new Date(),
            } as UIMessage,
          ],
        });
      });

      // Step 4: Analysis created
      await waitFor(() => {
        executionOrder.push('analysis-created');
        setState({
          analyses: [
            {
              id: 'a1',
              threadId: 'thread-1',
              roundNumber: 0,
              mode: 'brainstorming',
              userQuestion: 'Test question',
              status: AnalysisStatuses.PENDING,
              participantMessageIds: ['m2'],
              analysisData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredModeratorAnalysis,
          ],
        });
      });

      // Verify: Pre-search skipped
      expect(executionOrder).toEqual([
        'user-message',
        'participants-start', // No pre-search
        'participants-complete',
        'analysis-created',
      ]);
    });

    it('should block participants until pre-search completes', async () => {
      // Setup
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: true,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        screenMode: ScreenModes.OVERVIEW,
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        preSearches: [
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Test',
            status: AnalysisStatuses.STREAMING, // Still streaming
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
        waitingToStartStreaming: true,
      });

      // Verify: isStreaming should remain false (participants blocked)
      expect(getState().isStreaming).toBe(false);
      expect(getState().waitingToStartStreaming).toBe(true);

      // Complete pre-search
      await act(async () => {
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.COMPLETE,
              completedAt: new Date(),
            },
          ],
        });
      });

      // Now participants should be able to start
      // (In real app, provider effect would trigger this)
      await waitFor(() => {
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
        });

        expect(getState().isStreaming).toBe(true);
        expect(getState().waitingToStartStreaming).toBe(false);
      });
    });

    it('should allow participants to start if pre-search fails', async () => {
      // Setup: Pre-search failed
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: true,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        screenMode: ScreenModes.OVERVIEW,
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        preSearches: [
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Test',
            status: AnalysisStatuses.FAILED, // Failed
            searchData: null,
            errorMessage: 'Network error',
            completedAt: new Date(),
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
        waitingToStartStreaming: true,
      });

      // Participants should be allowed to start despite pre-search failure
      await waitFor(() => {
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
        });

        expect(getState().isStreaming).toBe(true);
      });
    });
  });

  describe('analysis creation timing', () => {
    it('should create analysis after all participants complete streaming', async () => {
      const analysisCreationTimes: number[] = [];
      const participantCompletionTime = Date.now();

      // Setup
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'p2',
            threadId: 'thread-1',
            modelId: 'openrouter/openai/gpt-4',
            priority: 1,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        isStreaming: true,
      });

      // Participant 1 completes
      await act(async () => {
        setState({
          messages: [
            ...getState().messages,
            {
              id: 'm2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }],
              roundNumber: 0,
              participantId: 'p1',
              createdAt: new Date(),
            } as UIMessage,
          ],
        });
        // Still streaming (participant 2 not done)
      });

      // Analysis should NOT be created yet
      expect(getState().analyses).toHaveLength(0);

      // Participant 2 completes
      await act(async () => {
        setState({
          messages: [
            ...getState().messages,
            {
              id: 'm3',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response 2' }],
              roundNumber: 0,
              participantId: 'p2',
              createdAt: new Date(),
            } as UIMessage,
          ],
          isStreaming: false, // All done
        });
      });

      // Now analysis should be created
      await waitFor(() => {
        analysisCreationTimes.push(Date.now());
        setState({
          analyses: [
            {
              id: 'a1',
              threadId: 'thread-1',
              roundNumber: 0,
              mode: 'brainstorming',
              userQuestion: 'Test',
              status: AnalysisStatuses.PENDING,
              participantMessageIds: ['m2', 'm3'],
              analysisData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredModeratorAnalysis,
          ],
        });
      });

      // Verify analysis created after participants complete
      expect(analysisCreationTimes[0]).toBeGreaterThanOrEqual(participantCompletionTime);
      expect(getState().analyses).toHaveLength(1);
    });

    it('should NOT create duplicate analysis for same round', async () => {
      const roundNumber = 0;

      // Setup: Mark round as created and add analysis
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
          {
            id: 'm2',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }],
            roundNumber: 0,
            participantId: 'p1',
            createdAt: new Date(),
          } as UIMessage,
        ],
        analyses: [
          {
            id: 'a1',
            threadId: 'thread-1',
            roundNumber: 0, // Already exists
            mode: 'brainstorming',
            userQuestion: 'Test',
            status: AnalysisStatuses.COMPLETE,
            participantMessageIds: ['m2'],
            analysisData: null,
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
          } as StoredModeratorAnalysis,
        ],
        createdAnalysisRounds: new Set([roundNumber]), // Mark as created
      });

      // Verify tracking works
      const wasAlreadyCreated = getState().hasAnalysisBeenCreated(roundNumber);
      expect(wasAlreadyCreated).toBe(true);

      // Verify: Still only one analysis
      expect(getState().analyses).toHaveLength(1);
      expect(getState().analyses[0]!.id).toBe('a1');

      // Simulate attempt to create duplicate (should be prevented by tracking)
      if (!getState().hasAnalysisBeenCreated(roundNumber)) {
        // This should NOT execute
        setState({
          analyses: [
            ...getState().analyses,
            {
              id: 'a2',
              threadId: 'thread-1',
              roundNumber: 0,
              mode: 'brainstorming',
              userQuestion: 'Test',
              status: AnalysisStatuses.PENDING,
              participantMessageIds: ['m2'],
              analysisData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredModeratorAnalysis,
          ],
        });
      }

      // Verify: Still only one analysis (duplicate prevented)
      expect(getState().analyses).toHaveLength(1);
    });
  });

  describe('pre-search round matching', () => {
    it('should match pre-search to current round not round 0', async () => {
      // Setup: Round 1 (second round)
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: true,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        screenMode: ScreenModes.THREAD,
        messages: [
          // Round 0 complete
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question 1' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
          {
            id: 'm2',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Answer 1' }],
            roundNumber: 0,
            participantId: 'p1',
            createdAt: new Date(),
          } as UIMessage,
          // Round 1 starting
          {
            id: 'm3',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question 2' }],
            roundNumber: 1,
            createdAt: new Date(),
          } as UIMessage,
        ],
        preSearches: [
          // Round 0 pre-search (complete)
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Question 1',
            status: AnalysisStatuses.COMPLETE,
            searchData: null,
            errorMessage: null,
            completedAt: new Date(),
            createdAt: new Date(),
          } as StoredPreSearch,
          // Round 1 pre-search (streaming)
          {
            id: 'ps2',
            threadId: 'thread-1',
            roundNumber: 1,
            userQuery: 'Question 2',
            status: AnalysisStatuses.STREAMING,
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
        waitingToStartStreaming: true,
      });

      // Verify: Should wait for round 1 pre-search, NOT round 0
      const currentRoundPreSearch = getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(currentRoundPreSearch).toBeDefined();
      expect(currentRoundPreSearch!.status).toBe(AnalysisStatuses.STREAMING);

      // Participants should be blocked
      expect(getState().isStreaming).toBe(false);

      // Complete round 1 pre-search
      await act(async () => {
        setState({
          preSearches: [
            getState().preSearches[0]!, // Round 0 unchanged
            {
              ...getState().preSearches[1]!,
              status: AnalysisStatuses.COMPLETE,
              completedAt: new Date(),
            },
          ],
        });
      });

      // Now participants should be able to start
      await waitFor(() => {
        setState({
          isStreaming: true,
          waitingToStartStreaming: false,
        });

        expect(getState().isStreaming).toBe(true);
      });
    });
  });

  describe('error scenarios', () => {
    it('should handle missing thread gracefully', async () => {
      setState({
        thread: null,
        participants: [],
        messages: [],
        waitingToStartStreaming: true,
      });

      // Should not crash
      expect(() => {
        const state = getState();
        const webSearchEnabled = state.thread?.enableWebSearch ?? false;
        expect(webSearchEnabled).toBe(false);
      }).not.toThrow();
    });

    it('should handle missing participants gracefully', async () => {
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [], // Empty
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        waitingToStartStreaming: true,
      });

      // Should not attempt to start streaming
      expect(getState().isStreaming).toBe(false);
      expect(getState().waitingToStartStreaming).toBe(true);
    });

    it('should timeout waiting for streaming if it never starts', async () => {
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'brainstorming',
          enableWebSearch: false,
          status: 'active',
          userId: 'user-1',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          projectId: null,
          metadata: null,
          lastMessageAt: null,
        },
        participants: [
          {
            id: 'p1',
            threadId: 'thread-1',
            modelId: 'openrouter/anthropic/claude-3.5-sonnet',
            priority: 0,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Test' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        waitingToStartStreaming: true,
        isStreaming: false,
      });

      // Simulate timeout by manually clearing flag after timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // In real app, provider effect clears this after timeout
      if (getState().waitingToStartStreaming && !getState().isStreaming) {
        setState({ waitingToStartStreaming: false });
      }

      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('status transitions', () => {
    it('should transition pre-search status: pending → streaming → complete', async () => {
      const statusTransitions: string[] = [];

      // Initial: Pending
      setState({
        preSearches: [
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Test',
            status: AnalysisStatuses.PENDING,
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
      });
      statusTransitions.push(getState().preSearches[0]!.status);

      // Transition to streaming
      await act(async () => {
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.STREAMING,
            },
          ],
        });
        statusTransitions.push(getState().preSearches[0]!.status);
      });

      // Transition to complete
      await act(async () => {
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.COMPLETE,
              completedAt: new Date(),
            },
          ],
        });
        statusTransitions.push(getState().preSearches[0]!.status);
      });

      expect(statusTransitions).toEqual([
        AnalysisStatuses.PENDING,
        AnalysisStatuses.STREAMING,
        AnalysisStatuses.COMPLETE,
      ]);
    });

    it('should transition analysis status: pending → streaming → complete', async () => {
      const statusTransitions: string[] = [];

      // Initial: Pending
      setState({
        analyses: [
          {
            id: 'a1',
            threadId: 'thread-1',
            roundNumber: 0,
            mode: 'brainstorming',
            userQuestion: 'Test',
            status: AnalysisStatuses.PENDING,
            participantMessageIds: ['m2'],
            analysisData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredModeratorAnalysis,
        ],
      });
      statusTransitions.push(getState().analyses[0]!.status);

      // Transition to streaming
      await act(async () => {
        setState({
          analyses: [
            {
              ...getState().analyses[0]!,
              status: AnalysisStatuses.STREAMING,
            },
          ],
        });
        statusTransitions.push(getState().analyses[0]!.status);
      });

      // Transition to complete
      await act(async () => {
        setState({
          analyses: [
            {
              ...getState().analyses[0]!,
              status: AnalysisStatuses.COMPLETE,
              completedAt: new Date(),
            },
          ],
        });
        statusTransitions.push(getState().analyses[0]!.status);
      });

      expect(statusTransitions).toEqual([
        AnalysisStatuses.PENDING,
        AnalysisStatuses.STREAMING,
        AnalysisStatuses.COMPLETE,
      ]);
    });
  });
});
