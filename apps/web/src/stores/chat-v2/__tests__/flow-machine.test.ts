/**
 * Flow Machine Tests
 *
 * Comprehensive tests for the V2 chat flow state machine.
 * Tests pure transition function and query functions.
 */

import { describe, expect, it } from 'vitest';

import {
  createAwaitingChangelogFlowState,
  createAwaitingModeratorFlowState,
  createCreatingThreadState,
  createErrorFlowState,
  createIdleFlowState,
  createModeratorStreamingFlowState,
  createPreSearchFlowState,
  createRoundCompleteFlowState,
  createStreamingFlowState,
  createTestFlowContext,
  createUpdatingThreadFlowState,
  createV2AssistantMessage,
  createV2ModeratorMessage,
  createV2UserMessage,
} from '@/lib/testing';

import {
  canStop,
  canSubmitMessage,
  getCurrentRound,
  getThreadId,
  INITIAL_FLOW_STATE,
  isFlowActive,
  transition,
} from '../flow-machine';

describe('flow-machine', () => {
  describe('transition function', () => {
    // ========================================================================
    // GLOBAL EVENTS (work from any state)
    // ========================================================================

    describe('global events', () => {
      it('RESET from any state returns idle', () => {
        const states = [
          createIdleFlowState(),
          createCreatingThreadState(),
          createPreSearchFlowState(),
          createStreamingFlowState(),
          createAwaitingModeratorFlowState(),
          createModeratorStreamingFlowState(),
          createRoundCompleteFlowState(),
          createErrorFlowState(),
        ];

        const context = createTestFlowContext();

        for (const state of states) {
          const result = transition(state, { type: 'RESET' }, context);
          expect(result.type).toBe('idle');
        }
      });

      it('ERROR from any state returns error with context preserved', () => {
        const state = createStreamingFlowState({ threadId: 'thread-1', round: 2 });
        const context = createTestFlowContext();

        const result = transition(state, { type: 'ERROR', error: 'Test error' }, context);

        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.threadId).toBe('thread-1');
          expect(result.round).toBe(2);
          expect(result.error).toBe('Test error');
        }
      });

      it('STOP from stoppable states returns round_complete', () => {
        const stoppableStates = [
          createPreSearchFlowState({ threadId: 't1', round: 1 }),
          createStreamingFlowState({ threadId: 't1', round: 1 }),
          createModeratorStreamingFlowState({ threadId: 't1', round: 1 }),
        ];

        const context = createTestFlowContext();

        for (const state of stoppableStates) {
          const result = transition(state, { type: 'STOP' }, context);
          expect(result.type).toBe('round_complete');
          if (result.type === 'round_complete') {
            expect(result.threadId).toBe('t1');
            expect(result.round).toBe(1);
          }
        }
      });

      it('STOP from non-stoppable states returns same state', () => {
        const nonStoppableStates = [
          createIdleFlowState(),
          createCreatingThreadState(),
          createAwaitingModeratorFlowState(),
          createRoundCompleteFlowState(),
          createUpdatingThreadFlowState(),
          createAwaitingChangelogFlowState(),
          createErrorFlowState(),
        ];

        const context = createTestFlowContext();

        for (const state of nonStoppableStates) {
          const result = transition(state, { type: 'STOP' }, context);
          expect(result.type).toBe(state.type);
        }
      });
    });

    // ========================================================================
    // IDLE STATE
    // ========================================================================

    describe('state: idle', () => {
      it('SUBMIT_MESSAGE -> creating_thread', () => {
        const state = createIdleFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'SUBMIT_MESSAGE',
          message: 'Hello',
          mode: 'council',
          participants: [{ modelId: 'gpt-4', role: null, priority: 1 }],
          enableWebSearch: false,
        }, context);

        expect(result.type).toBe('creating_thread');
        if (result.type === 'creating_thread') {
          expect(result.message).toBe('Hello');
          expect(result.mode).toBe('council');
        }
      });

      it('LOAD_THREAD with complete round -> round_complete at correct round', () => {
        const state = createIdleFlowState();
        const messages = [
          createV2UserMessage({ roundNumber: 0 }),
          createV2AssistantMessage({ roundNumber: 0, participantIndex: 0 }),
          createV2AssistantMessage({ roundNumber: 0, participantIndex: 1 }),
          createV2ModeratorMessage({ roundNumber: 0 }),
        ];

        const context = createTestFlowContext({ participantCount: 2 });

        const result = transition(state, {
          type: 'LOAD_THREAD',
          thread: { id: 'thread-1', slug: 'test' } as never,
          messages,
        }, context);

        expect(result.type).toBe('round_complete');
        if (result.type === 'round_complete') {
          expect(result.threadId).toBe('thread-1');
          expect(result.round).toBe(0);
        }
      });

      it('LOAD_THREAD with incomplete round -> round_complete at previous round', () => {
        const state = createIdleFlowState();
        // Round 1 started but no moderator
        const messages = [
          createV2UserMessage({ roundNumber: 0 }),
          createV2AssistantMessage({ roundNumber: 0, participantIndex: 0 }),
          createV2ModeratorMessage({ roundNumber: 0 }),
          createV2UserMessage({ roundNumber: 1 }),
          createV2AssistantMessage({ roundNumber: 1, participantIndex: 0 }),
        ];

        const context = createTestFlowContext({ participantCount: 2 });

        const result = transition(state, {
          type: 'LOAD_THREAD',
          thread: { id: 'thread-1', slug: 'test' } as never,
          messages,
        }, context);

        expect(result.type).toBe('round_complete');
        if (result.type === 'round_complete') {
          expect(result.round).toBe(0); // Previous completed round
        }
      });

      it('other events stay idle', () => {
        const state = createIdleFlowState();
        const context = createTestFlowContext();

        const irrelevantEvents = [
          { type: 'THREAD_CREATED' as const, threadId: 't1', slug: 'test' },
          { type: 'PRE_SEARCH_COMPLETE' as const, round: 0 },
          { type: 'PARTICIPANT_COMPLETE' as const, participantIndex: 0 },
        ];

        for (const event of irrelevantEvents) {
          const result = transition(state, event, context);
          expect(result.type).toBe('idle');
        }
      });
    });

    // ========================================================================
    // CREATING_THREAD STATE
    // ========================================================================

    describe('state: creating_thread', () => {
      it('THREAD_CREATED + web search -> pre_search', () => {
        const state = createCreatingThreadState();
        const context = createTestFlowContext({ enableWebSearch: true, participantCount: 2 });

        const result = transition(state, {
          type: 'THREAD_CREATED',
          threadId: 'new-thread',
          slug: 'test-slug',
        }, context);

        expect(result.type).toBe('pre_search');
        if (result.type === 'pre_search') {
          expect(result.threadId).toBe('new-thread');
          expect(result.round).toBe(0);
        }
      });

      it('THREAD_CREATED + no web search -> streaming (index 0)', () => {
        const state = createCreatingThreadState();
        const context = createTestFlowContext({ enableWebSearch: false, participantCount: 2 });

        const result = transition(state, {
          type: 'THREAD_CREATED',
          threadId: 'new-thread',
          slug: 'test-slug',
        }, context);

        expect(result.type).toBe('streaming');
        if (result.type === 'streaming') {
          expect(result.threadId).toBe('new-thread');
          expect(result.round).toBe(0);
          expect(result.participantIndex).toBe(0);
          expect(result.totalParticipants).toBe(2);
        }
      });

      it('other events stay in creating_thread', () => {
        const state = createCreatingThreadState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PRE_SEARCH_COMPLETE',
          round: 0,
        }, context);

        expect(result.type).toBe('creating_thread');
      });
    });

    // ========================================================================
    // PRE_SEARCH STATE
    // ========================================================================

    describe('state: pre_search', () => {
      it('PRE_SEARCH_COMPLETE (correct round) -> streaming', () => {
        const state = createPreSearchFlowState({ threadId: 't1', round: 0 });
        const context = createTestFlowContext({ participantCount: 3 });

        const result = transition(state, {
          type: 'PRE_SEARCH_COMPLETE',
          round: 0,
        }, context);

        expect(result.type).toBe('streaming');
        if (result.type === 'streaming') {
          expect(result.threadId).toBe('t1');
          expect(result.round).toBe(0);
          expect(result.participantIndex).toBe(0);
          expect(result.totalParticipants).toBe(3);
        }
      });

      it('PRE_SEARCH_COMPLETE (wrong round) -> stays pre_search', () => {
        const state = createPreSearchFlowState({ threadId: 't1', round: 1 });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PRE_SEARCH_COMPLETE',
          round: 0, // Wrong round
        }, context);

        expect(result.type).toBe('pre_search');
      });

      it('other events stay in pre_search', () => {
        const state = createPreSearchFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('pre_search');
      });
    });

    // ========================================================================
    // STREAMING STATE
    // ========================================================================

    describe('state: streaming', () => {
      it('PARTICIPANT_COMPLETE -> advances participantIndex', () => {
        const state = createStreamingFlowState({
          threadId: 't1',
          round: 0,
          participantIndex: 0,
          totalParticipants: 3,
        });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('streaming');
        if (result.type === 'streaming') {
          expect(result.participantIndex).toBe(1);
          expect(result.totalParticipants).toBe(3);
        }
      });

      it('PARTICIPANT_COMPLETE (last participant) -> awaiting_moderator', () => {
        const state = createStreamingFlowState({
          threadId: 't1',
          round: 0,
          participantIndex: 1,
          totalParticipants: 2,
        });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 1,
        }, context);

        expect(result.type).toBe('awaiting_moderator');
        if (result.type === 'awaiting_moderator') {
          expect(result.threadId).toBe('t1');
          expect(result.round).toBe(0);
        }
      });

      it('ALL_PARTICIPANTS_COMPLETE -> awaiting_moderator', () => {
        const state = createStreamingFlowState({
          threadId: 't1',
          round: 2,
          participantIndex: 0,
          totalParticipants: 3,
        });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'ALL_PARTICIPANTS_COMPLETE',
          round: 2,
        }, context);

        expect(result.type).toBe('awaiting_moderator');
        if (result.type === 'awaiting_moderator') {
          expect(result.round).toBe(2);
        }
      });

      it('other events stay in streaming', () => {
        const state = createStreamingFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'MODERATOR_COMPLETE',
          round: 0,
        }, context);

        expect(result.type).toBe('streaming');
      });
    });

    // ========================================================================
    // AWAITING_MODERATOR STATE
    // ========================================================================

    describe('state: awaiting_moderator', () => {
      it('MODERATOR_STARTED -> moderator_streaming', () => {
        const state = createAwaitingModeratorFlowState({ threadId: 't1', round: 0 });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'MODERATOR_STARTED',
        }, context);

        expect(result.type).toBe('moderator_streaming');
        if (result.type === 'moderator_streaming') {
          expect(result.threadId).toBe('t1');
          expect(result.round).toBe(0);
        }
      });

      it('MODERATOR_COMPLETE -> round_complete (skip streaming)', () => {
        const state = createAwaitingModeratorFlowState({ threadId: 't1', round: 0 });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'MODERATOR_COMPLETE',
          round: 0,
        }, context);

        expect(result.type).toBe('round_complete');
      });

      it('other events stay in awaiting_moderator', () => {
        const state = createAwaitingModeratorFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('awaiting_moderator');
      });
    });

    // ========================================================================
    // MODERATOR_STREAMING STATE
    // ========================================================================

    describe('state: moderator_streaming', () => {
      it('MODERATOR_COMPLETE -> round_complete', () => {
        const state = createModeratorStreamingFlowState({ threadId: 't1', round: 1 });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'MODERATOR_COMPLETE',
          round: 1,
        }, context);

        expect(result.type).toBe('round_complete');
        if (result.type === 'round_complete') {
          expect(result.threadId).toBe('t1');
          expect(result.round).toBe(1);
        }
      });

      it('other events stay in moderator_streaming', () => {
        const state = createModeratorStreamingFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('moderator_streaming');
      });
    });

    // ========================================================================
    // ROUND_COMPLETE STATE
    // ========================================================================

    describe('state: round_complete', () => {
      it('SUBMIT_MESSAGE -> updating_thread with next round', () => {
        const state = createRoundCompleteFlowState({ threadId: 't1', round: 0 });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'SUBMIT_MESSAGE',
          message: 'Follow up',
          mode: 'council',
          participants: [],
          enableWebSearch: false,
          hasConfigChanges: true,
        }, context);

        expect(result.type).toBe('updating_thread');
        if (result.type === 'updating_thread') {
          expect(result.threadId).toBe('t1');
          expect(result.round).toBe(1);
          expect(result.message).toBe('Follow up');
          expect(result.hasConfigChanges).toBe(true);
        }
      });

      it('RETRY + web search -> pre_search', () => {
        const state = createRoundCompleteFlowState({ threadId: 't1', round: 2 });
        const context = createTestFlowContext({ enableWebSearch: true, participantCount: 2 });

        const result = transition(state, {
          type: 'RETRY',
          round: 2,
        }, context);

        expect(result.type).toBe('pre_search');
        if (result.type === 'pre_search') {
          expect(result.round).toBe(2);
        }
      });

      it('RETRY + no web search -> streaming', () => {
        const state = createRoundCompleteFlowState({ threadId: 't1', round: 1 });
        const context = createTestFlowContext({ enableWebSearch: false, participantCount: 3 });

        const result = transition(state, {
          type: 'RETRY',
          round: 1,
        }, context);

        expect(result.type).toBe('streaming');
        if (result.type === 'streaming') {
          expect(result.round).toBe(1);
          expect(result.participantIndex).toBe(0);
          expect(result.totalParticipants).toBe(3);
        }
      });

      it('other events stay in round_complete', () => {
        const state = createRoundCompleteFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('round_complete');
      });
    });

    // ========================================================================
    // UPDATING_THREAD STATE
    // ========================================================================

    describe('state: updating_thread', () => {
      it('UPDATE_THREAD_COMPLETE + config changes -> awaiting_changelog', () => {
        const state = createUpdatingThreadFlowState({
          threadId: 't1',
          round: 1,
          hasConfigChanges: true,
        });
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'UPDATE_THREAD_COMPLETE',
        }, context);

        expect(result.type).toBe('awaiting_changelog');
        if (result.type === 'awaiting_changelog') {
          expect(result.threadId).toBe('t1');
          expect(result.round).toBe(1);
        }
      });

      it('UPDATE_THREAD_COMPLETE + web search -> pre_search', () => {
        const state = createUpdatingThreadFlowState({
          threadId: 't1',
          round: 1,
          hasConfigChanges: false,
        });
        const context = createTestFlowContext({ enableWebSearch: true });

        const result = transition(state, {
          type: 'UPDATE_THREAD_COMPLETE',
        }, context);

        expect(result.type).toBe('pre_search');
      });

      it('UPDATE_THREAD_COMPLETE + no config changes + no web search -> streaming', () => {
        const state = createUpdatingThreadFlowState({
          threadId: 't1',
          round: 1,
          hasConfigChanges: false,
        });
        const context = createTestFlowContext({
          enableWebSearch: false,
          participantCount: 2,
        });

        const result = transition(state, {
          type: 'UPDATE_THREAD_COMPLETE',
        }, context);

        expect(result.type).toBe('streaming');
        if (result.type === 'streaming') {
          expect(result.round).toBe(1);
          expect(result.participantIndex).toBe(0);
        }
      });

      it('other events stay in updating_thread', () => {
        const state = createUpdatingThreadFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PRE_SEARCH_COMPLETE',
          round: 0,
        }, context);

        expect(result.type).toBe('updating_thread');
      });
    });

    // ========================================================================
    // AWAITING_CHANGELOG STATE
    // ========================================================================

    describe('state: awaiting_changelog', () => {
      it('CHANGELOG_RECEIVED + web search -> pre_search', () => {
        const state = createAwaitingChangelogFlowState({ threadId: 't1', round: 1 });
        const context = createTestFlowContext({ enableWebSearch: true });

        const result = transition(state, {
          type: 'CHANGELOG_RECEIVED',
        }, context);

        expect(result.type).toBe('pre_search');
        if (result.type === 'pre_search') {
          expect(result.round).toBe(1);
        }
      });

      it('CHANGELOG_RECEIVED + no web search -> streaming', () => {
        const state = createAwaitingChangelogFlowState({ threadId: 't1', round: 1 });
        const context = createTestFlowContext({
          enableWebSearch: false,
          participantCount: 2,
        });

        const result = transition(state, {
          type: 'CHANGELOG_RECEIVED',
        }, context);

        expect(result.type).toBe('streaming');
        if (result.type === 'streaming') {
          expect(result.round).toBe(1);
        }
      });

      it('other events stay in awaiting_changelog', () => {
        const state = createAwaitingChangelogFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('awaiting_changelog');
      });
    });

    // ========================================================================
    // ERROR STATE
    // ========================================================================

    describe('state: error', () => {
      it('RETRY with context + web search -> pre_search', () => {
        const state = createErrorFlowState({ threadId: 't1', round: 0 });
        const context = createTestFlowContext({ enableWebSearch: true });

        const result = transition(state, {
          type: 'RETRY',
          round: 0,
        }, context);

        expect(result.type).toBe('pre_search');
      });

      it('RETRY with context + no web search -> streaming', () => {
        const state = createErrorFlowState({ threadId: 't1', round: 0 });
        const context = createTestFlowContext({
          enableWebSearch: false,
          participantCount: 2,
        });

        const result = transition(state, {
          type: 'RETRY',
          round: 0,
        }, context);

        expect(result.type).toBe('streaming');
      });

      it('RETRY without threadId -> stays error', () => {
        const state: ReturnType<typeof createErrorFlowState> = {
          type: 'error',
          error: 'No thread',
        };
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'RETRY',
          round: 0,
        }, context);

        expect(result.type).toBe('error');
      });

      it('other events stay in error', () => {
        const state = createErrorFlowState();
        const context = createTestFlowContext();

        const result = transition(state, {
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: 0,
        }, context);

        expect(result.type).toBe('error');
      });
    });
  });

  // ==========================================================================
  // QUERY FUNCTIONS
  // ==========================================================================

  describe('query functions', () => {
    describe('isFlowActive', () => {
      it('returns true for active states', () => {
        const activeStates = [
          createCreatingThreadState(),
          createUpdatingThreadFlowState(),
          createAwaitingChangelogFlowState(),
          createPreSearchFlowState(),
          createStreamingFlowState(),
          createAwaitingModeratorFlowState(),
          createModeratorStreamingFlowState(),
        ];

        for (const state of activeStates) {
          expect(isFlowActive(state)).toBe(true);
        }
      });

      it('returns false for inactive states', () => {
        const inactiveStates = [
          createIdleFlowState(),
          createRoundCompleteFlowState(),
          createErrorFlowState(),
        ];

        for (const state of inactiveStates) {
          expect(isFlowActive(state)).toBe(false);
        }
      });
    });

    describe('canSubmitMessage', () => {
      it('returns true for idle and round_complete', () => {
        expect(canSubmitMessage(createIdleFlowState())).toBe(true);
        expect(canSubmitMessage(createRoundCompleteFlowState())).toBe(true);
      });

      it('returns false for other states', () => {
        const nonSubmittableStates = [
          createCreatingThreadState(),
          createPreSearchFlowState(),
          createStreamingFlowState(),
          createAwaitingModeratorFlowState(),
          createModeratorStreamingFlowState(),
          createErrorFlowState(),
        ];

        for (const state of nonSubmittableStates) {
          expect(canSubmitMessage(state)).toBe(false);
        }
      });
    });

    describe('canStop', () => {
      it('returns true for stoppable states', () => {
        expect(canStop(createPreSearchFlowState())).toBe(true);
        expect(canStop(createStreamingFlowState())).toBe(true);
        expect(canStop(createModeratorStreamingFlowState())).toBe(true);
      });

      it('returns false for non-stoppable states', () => {
        const nonStoppableStates = [
          createIdleFlowState(),
          createCreatingThreadState(),
          createAwaitingModeratorFlowState(),
          createRoundCompleteFlowState(),
          createErrorFlowState(),
        ];

        for (const state of nonStoppableStates) {
          expect(canStop(state)).toBe(false);
        }
      });
    });

    describe('getCurrentRound', () => {
      it('extracts round from round-aware states', () => {
        expect(getCurrentRound(createPreSearchFlowState({ round: 2 }))).toBe(2);
        expect(getCurrentRound(createStreamingFlowState({ round: 3 }))).toBe(3);
        expect(getCurrentRound(createRoundCompleteFlowState({ round: 1 }))).toBe(1);
        expect(getCurrentRound(createErrorFlowState({ round: 4 }))).toBe(4);
      });

      it('returns null for states without round', () => {
        expect(getCurrentRound(createIdleFlowState())).toBeNull();
        expect(getCurrentRound(createCreatingThreadState())).toBeNull();
        expect(getCurrentRound(createErrorFlowState())).toBeNull(); // Error without round
      });
    });

    describe('getThreadId', () => {
      it('extracts threadId from thread-aware states', () => {
        expect(getThreadId(createPreSearchFlowState({ threadId: 'abc' }))).toBe('abc');
        expect(getThreadId(createStreamingFlowState({ threadId: 'def' }))).toBe('def');
        expect(getThreadId(createRoundCompleteFlowState({ threadId: 'ghi' }))).toBe('ghi');
      });

      it('returns null for states without threadId', () => {
        expect(getThreadId(createIdleFlowState())).toBeNull();
        expect(getThreadId(createCreatingThreadState())).toBeNull();
        expect(getThreadId({ type: 'error', error: 'test' })).toBeNull();
      });
    });
  });

  // ==========================================================================
  // INITIAL STATE
  // ==========================================================================

  describe('INITIAL_FLOW_STATE', () => {
    it('is idle', () => {
      expect(INITIAL_FLOW_STATE.type).toBe('idle');
    });
  });
});
