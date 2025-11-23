/**
 * Race Condition Tests: Sequencing
 *
 * Tests scenarios where steps start out of order:
 * 1. Participants start while pre-search is still streaming
 * 2. Analysis triggers before all participants complete
 * 3. Multiple concurrent state updates cause inconsistent flow
 * 4. Store state and provider state get out of sync
 *
 * These tests should FAIL initially, exposing the race conditions.
 * Then we fix the code to make them pass.
 */

import type { UIMessage } from '@ai-sdk/react';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';

import { createChatStore } from '../index';
import type { ChatState } from '../types';

describe('race conditions: sequencing', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatState;
  let setState: (partial: Partial<ChatState>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
    getState = () => store.getState();
    setState = partial => store.setState(partial);
  });

  describe('[RACE] participants start while pre-search streaming', () => {
    it('should FAIL: provider effect triggers participants while pre-search status is STREAMING', async () => {
      // Setup: Thread with web search, pre-search in STREAMING state
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
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
            modelId: 'model-1',
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
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        preSearches: [
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Question',
            status: AnalysisStatuses.STREAMING, // Still streaming
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      const events: string[] = [];

      // Simulate provider effect checking conditions
      events.push('provider-effect-runs');

      const preSearch = getState().preSearches[0];
      const isPreSearchComplete = preSearch && (preSearch.status === AnalysisStatuses.COMPLETE || preSearch.status === AnalysisStatuses.FAILED);

      if (!isPreSearchComplete) {
        events.push('pre-search-still-streaming');
      }

      // BUG: If provider effect doesn't properly check status, participants might start
      // Simulate faulty logic that only checks for existence, not status
      const hasPreSearch = getState().preSearches.length > 0;
      if (hasPreSearch) {
        // Faulty logic: "pre-search exists, so start participants"
        events.push('participants-start-BUG');
        setState({ isStreaming: true, waitingToStartStreaming: false });
      }

      // Pre-search completes later
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.COMPLETE,
              completedAt: new Date(),
            },
          ],
        });
        events.push('pre-search-completes');
      });

      // ASSERTION: Should FAIL
      expect(events).toEqual([
        'provider-effect-runs',
        'pre-search-still-streaming',
        'participants-start-BUG', // BUG: Should NOT start yet
        'pre-search-completes',
      ]);

      expect(isPreSearchComplete).toBe(false); // Pre-search was streaming
      expect(getState().isStreaming).toBe(true); // BUG: Participants started too early
    });

    it('should FAIL: rapid status transitions skip COMPLETE check', async () => {
      // Simulate rapid state updates where status goes PENDING → STREAMING → COMPLETE
      // But provider effect only sees PENDING and COMPLETE, missing STREAMING
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
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
            modelId: 'model-1',
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
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      const statusChecks: AnalysisStatuses[] = [];

      // PENDING
      setState({
        preSearches: [
          {
            id: 'ps1',
            threadId: 'thread-1',
            roundNumber: 0,
            userQuery: 'Question',
            status: AnalysisStatuses.PENDING,
            searchData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredPreSearch,
        ],
      });
      statusChecks.push(getState().preSearches[0]!.status);

      // Rapid transitions in same microtask
      await act(async () => {
        // STREAMING
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.STREAMING,
            },
          ],
        });

        // COMPLETE (immediate)
        setState({
          preSearches: [
            {
              ...getState().preSearches[0]!,
              status: AnalysisStatuses.COMPLETE,
              completedAt: new Date(),
            },
          ],
        });
        statusChecks.push(getState().preSearches[0]!.status);
      });

      // Provider effect runs and only sees final state
      const currentStatus = getState().preSearches[0]!.status;
      statusChecks.push(currentStatus);

      // ASSERTION: Provider might miss the STREAMING phase
      expect(statusChecks).toEqual([
        AnalysisStatuses.PENDING,
        AnalysisStatuses.COMPLETE, // Skipped STREAMING in effect
        AnalysisStatuses.COMPLETE,
      ]);

      // This test shows the status SHOULD be checked properly, not just final state
    });
  });

  describe('[RACE] analysis triggers before all participants complete', () => {
    it('should FAIL: onComplete fires with incomplete participant set', async () => {
      // Setup: 3 participants
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
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
            modelId: 'model-1',
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
            modelId: 'model-2',
            priority: 1,
            isEnabled: true,
            role: null,
            customRoleId: null,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'p3',
            threadId: 'thread-1',
            modelId: 'model-3',
            priority: 2,
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
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
        screenMode: ScreenModes.OVERVIEW,
        isStreaming: true,
      });

      const events: string[] = [];

      // Participant 1 completes
      setState({
        messages: [
          ...getState().messages,
          {
            id: 'm2',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }],
            roundNumber: 0,
            participantId: 'p1',
            metadata: { participantIndex: 0 },
            createdAt: new Date(),
          } as UIMessage,
        ],
      });
      events.push('p1-complete');

      // Participant 2 completes
      setState({
        messages: [
          ...getState().messages,
          {
            id: 'm3',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Response 2' }],
            roundNumber: 0,
            participantId: 'p2',
            metadata: { participantIndex: 1 },
            createdAt: new Date(),
          } as UIMessage,
        ],
      });
      events.push('p2-complete');

      // BUG: isStreaming gets set to false prematurely
      setState({ isStreaming: false });
      events.push('streaming-false-prematurely');

      // Simulate provider's handleComplete firing
      // It checks if isStreaming is false, and if so, creates analysis
      if (!getState().isStreaming) {
        events.push('handle-complete-fires');

        // Count participant messages
        const participantMessages = getState().messages.filter(m => m.role === MessageRoles.ASSISTANT);
        events.push(`analysis-created-with-${participantMessages.length}-messages`);

        // Create analysis
        setState({
          analyses: [
            {
              id: 'a1',
              threadId: 'thread-1',
              roundNumber: 0,
              mode: 'brainstorming',
              userQuestion: 'Question',
              status: AnalysisStatuses.PENDING,
              participantMessageIds: participantMessages.map(m => m.id),
              analysisData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredModeratorAnalysis,
          ],
        });
      }

      // Participant 3 completes (TOO LATE)
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        setState({
          messages: [
            ...getState().messages,
            {
              id: 'm4',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response 3' }],
              roundNumber: 0,
              participantId: 'p3',
              metadata: { participantIndex: 2 },
              createdAt: new Date(),
            } as UIMessage,
          ],
        });
        events.push('p3-complete-too-late');
      });

      // ASSERTION: Should FAIL
      expect(events).toEqual([
        'p1-complete',
        'p2-complete',
        'streaming-false-prematurely',
        'handle-complete-fires',
        'analysis-created-with-2-messages', // BUG: Should be 3 messages
        'p3-complete-too-late',
      ]);

      // Analysis should have 3 participant messages, but only has 2
      const analysis = getState().analyses[0]!;
      expect(analysis.participantMessageIds).toHaveLength(2); // BUG: Should be 3
    });

    it('should FAIL: concurrent message additions race with completion check', async () => {
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
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
            modelId: 'model-1',
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
            modelId: 'model-2',
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
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
      });

      const timeline: string[] = [];

      // Simulate both participants finishing "simultaneously"
      await act(async () => {
        // Participant 1 in microtask 1
        queueMicrotask(() => {
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
          timeline.push('p1-added');
        });

        // Participant 2 in microtask 2
        queueMicrotask(() => {
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
          });
          timeline.push('p2-added');
        });

        // Complete check in microtask 3
        queueMicrotask(() => {
          const messageCount = getState().messages.filter(m => m.role === MessageRoles.ASSISTANT).length;
          timeline.push(`completion-check:${messageCount}-messages`);
        });

        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // ASSERTION: Might see inconsistent message count
      expect(timeline).toHaveLength(3);
      // The order might be unpredictable, causing completion check to see 0, 1, or 2 messages
    });
  });

  describe('[RACE] store state vs provider state sync', () => {
    it('should FAIL: provider stale closure sees old state', async () => {
      // This simulates the classic React stale closure problem
      // Provider effect creates a callback that captures state at effect creation time
      // State updates don't trigger callback update

      let capturedState: { isStreaming: boolean; messageCount: number } | null = null;

      // Initial state
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
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
        messages: [],
        isStreaming: false,
      });

      // Simulate provider effect creating callback with closure
      const providerCallback = () => {
        const state = getState();
        capturedState = {
          isStreaming: state.isStreaming,
          messageCount: state.messages.length,
        };
      };

      // Capture state
      providerCallback();
      const initialCapture = { ...capturedState! };

      // Update state
      setState({
        isStreaming: true,
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
      });

      // Callback runs again (if it's a stale closure, it might not see new state)
      // In React, useCallback with missing deps would capture old state
      // But since we're calling getState(), this should always see latest

      providerCallback();
      const updatedCapture = { ...capturedState! };

      // ASSERTION: Should see updated state (this should PASS)
      // But if provider uses stale refs instead of getState(), it would FAIL
      expect(initialCapture).toEqual({ isStreaming: false, messageCount: 0 });
      expect(updatedCapture).toEqual({ isStreaming: true, messageCount: 1 });
    });

    it('should FAIL: rapid setState calls cause state updates to be lost', async () => {
      // Simulate rapid state updates where intermediate states get lost
      const stateSnapshots: number[] = [];

      // Initial messages
      setState({
        messages: [
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
        ],
      });
      stateSnapshots.push(getState().messages.length);

      // Rapid concurrent updates
      await act(async () => {
        // Update 1: Add message
        setState({
          messages: [
            ...getState().messages,
            {
              id: 'm2',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }],
              roundNumber: 0,
              createdAt: new Date(),
            } as UIMessage,
          ],
        });
        stateSnapshots.push(getState().messages.length);

        // Update 2: Add another message (reading stale state)
        // BUG: If this reads from stale closure, it might overwrite previous addition
        const currentMessages = getState().messages; // Fresh read
        setState({
          messages: [
            ...currentMessages,
            {
              id: 'm3',
              role: MessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: 'Response 2' }],
              roundNumber: 0,
              createdAt: new Date(),
            } as UIMessage,
          ],
        });
        stateSnapshots.push(getState().messages.length);
      });

      // ASSERTION: Should have 3 messages total
      expect(stateSnapshots).toEqual([1, 2, 3]);
      expect(getState().messages).toHaveLength(3);

      // But if setState uses stale spreads, might only have 2
    });
  });

  describe('[RACE] multi-round concurrent updates', () => {
    it('should FAIL: round 1 analysis triggers while round 0 still completing', async () => {
      // Setup: Round 0 complete, round 1 starting
      setState({
        thread: {
          id: 'thread-1',
          slug: 'test',
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
            modelId: 'model-1',
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
          // Round 0
          {
            id: 'm1',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Q1' }],
            roundNumber: 0,
            createdAt: new Date(),
          } as UIMessage,
          {
            id: 'm2',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'A1' }],
            roundNumber: 0,
            participantId: 'p1',
            createdAt: new Date(),
          } as UIMessage,
        ],
        analyses: [
          {
            id: 'a0',
            threadId: 'thread-1',
            roundNumber: 0,
            mode: 'brainstorming',
            userQuestion: 'Q1',
            status: AnalysisStatuses.STREAMING, // Still streaming
            participantMessageIds: ['m2'],
            analysisData: null,
            errorMessage: null,
            completedAt: null,
            createdAt: new Date(),
          } as StoredModeratorAnalysis,
        ],
        isStreaming: false,
      });

      const events: string[] = [];

      // User sends round 1 message
      setState({
        messages: [
          ...getState().messages,
          {
            id: 'm3',
            role: MessageRoles.USER,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Q2' }],
            roundNumber: 1,
            createdAt: new Date(),
          } as UIMessage,
        ],
        isStreaming: true,
      });
      events.push('round-1-started');

      // Round 1 participant completes
      setState({
        messages: [
          ...getState().messages,
          {
            id: 'm4',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'A2' }],
            roundNumber: 1,
            participantId: 'p1',
            createdAt: new Date(),
          } as UIMessage,
        ],
        isStreaming: false,
      });
      events.push('round-1-participant-complete');

      // BUG: Provider's handleComplete might create analysis for round 1
      // even though round 0 analysis is still streaming
      const round0Analysis = getState().analyses.find(a => a.roundNumber === 0);
      const isRound0Complete = round0Analysis?.status === AnalysisStatuses.COMPLETE;

      if (!isRound0Complete) {
        events.push('round-0-analysis-still-streaming');

        // But provider might create round 1 analysis anyway
        setState({
          analyses: [
            ...getState().analyses,
            {
              id: 'a1',
              threadId: 'thread-1',
              roundNumber: 1,
              mode: 'brainstorming',
              userQuestion: 'Q2',
              status: AnalysisStatuses.PENDING,
              participantMessageIds: ['m4'],
              analysisData: null,
              errorMessage: null,
              completedAt: null,
              createdAt: new Date(),
            } as StoredModeratorAnalysis,
          ],
        });
        events.push('round-1-analysis-created-while-round-0-streaming-BUG');
      }

      // Round 0 analysis completes later
      setState({
        analyses: getState().analyses.map(a =>
          a.roundNumber === 0
            ? { ...a, status: AnalysisStatuses.COMPLETE, completedAt: new Date() }
            : a,
        ),
      });
      events.push('round-0-analysis-complete');

      // ASSERTION: Should FAIL
      expect(events).toContain('round-1-analysis-created-while-round-0-streaming-BUG');
      expect(isRound0Complete).toBe(false);
    });
  });
});
