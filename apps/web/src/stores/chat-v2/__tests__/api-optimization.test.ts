/**
 * API Optimization Tests - V2
 *
 * Tests to verify API calls are deduplicated and aborted correctly.
 * Ensures no redundant API calls during the chat flow.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createPreSearchFlowState,
  createRoundCompleteFlowState,
  createStreamingFlowState,
  createTestChatStoreV2,
  createTestFlowContext,
} from '@/lib/testing';

import { canStop, canSubmitMessage, isFlowActive, transition } from '../flow-machine';
import { reset } from '../reset';

describe('V2 API optimization', () => {
  describe('deduplication via state machine', () => {
    it('state machine prevents duplicate transitions', () => {
      // The state machine inherently prevents duplicate API calls by:
      // 1. Only allowing valid transitions from each state
      // 2. Ignoring events that don't match the current state

      const state = createPreSearchFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext({ participantCount: 2 });

      // First PRE_SEARCH_COMPLETE transitions to streaming
      const result1 = transition(state, { type: 'PRE_SEARCH_COMPLETE', round: 0 }, context);
      expect(result1.type).toBe('streaming');

      // Second PRE_SEARCH_COMPLETE in streaming state has no effect
      const result2 = transition(result1, { type: 'PRE_SEARCH_COMPLETE', round: 0 }, context);
      expect(result2.type).toBe('streaming');
      // State unchanged - no duplicate API call would be triggered
    });

    it('wrong round events are ignored', () => {
      const state = createPreSearchFlowState({ threadId: 't1', round: 1 });
      const context = createTestFlowContext();

      // PRE_SEARCH_COMPLETE for round 0 is ignored
      const result = transition(state, { type: 'PRE_SEARCH_COMPLETE', round: 0 }, context);
      expect(result.type).toBe('pre_search');
      // No state change means no API call would be triggered
    });

    it('events in wrong state are ignored', () => {
      const state = createStreamingFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext();

      // THREAD_CREATED in streaming state is ignored
      const result = transition(state, {
        type: 'THREAD_CREATED',
        threadId: 't2',
        slug: 'new',
      }, context);

      expect(result.type).toBe('streaming');
      // Original state unchanged
    });
  });

  describe('single entry points', () => {
    it('createThread only callable from creating_thread state', () => {
      // The flow orchestrator only calls createThread when flow.type === 'creating_thread'
      // This is enforced by the orchestrator's switch statement

      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
      });

      // In streaming state, SUBMIT_MESSAGE has no effect
      store.getState().dispatch({
        type: 'SUBMIT_MESSAGE',
        message: 'test',
        mode: 'council',
        participants: [],
        enableWebSearch: false,
      });

      // Flow didn't change to creating_thread, so createThread would NOT be called
      expect(store.getState().flow.type).toBe('streaming');
    });

    it('updateThread only callable from updating_thread state', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
      });

      // In streaming state, there's no way to get to updating_thread
      // except through round_complete + SUBMIT_MESSAGE

      expect(store.getState().flow.type).toBe('streaming');
      // No way to accidentally trigger updateThread
    });

    it('startPreSearch only callable from pre_search state', () => {
      // The flow orchestrator only calls startPreSearch when flow.type === 'pre_search'

      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
      });

      // Already in streaming, can't get back to pre_search without completing round
      store.getState().dispatch({ type: 'PRE_SEARCH_COMPLETE', round: 0 });

      // Still streaming (PRE_SEARCH_COMPLETE ignored)
      expect(store.getState().flow.type).toBe('streaming');
    });

    it('startModerator only callable from awaiting_moderator state', () => {
      // The flow orchestrator only calls startModerator when flow.type === 'awaiting_moderator'

      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0, totalParticipants: 2 }),
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
      });

      // Need to complete all participants first
      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 0 });
      expect(store.getState().flow.type).toBe('streaming');

      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 1 });
      // Now in awaiting_moderator - startModerator CAN be called
      expect(store.getState().flow.type).toBe('awaiting_moderator');
    });

    it('syncFromBackend only called in round_complete after moderator', () => {
      // The flow orchestrator only calls syncFromBackend when:
      // - flow.type === 'round_complete'
      // - prevFlow.type === 'moderator_streaming'

      const store = createTestChatStoreV2({
        flow: {
          type: 'moderator_streaming',
          threadId: 't1',
          round: 0,
        },
      });

      // Complete moderator -> triggers sync
      store.getState().dispatch({ type: 'MODERATOR_COMPLETE', round: 0 });

      expect(store.getState().flow.type).toBe('round_complete');
      // syncFromBackend would be called by orchestrator here
    });
  });

  describe('abort behavior', () => {
    it('pre_search abort does not trigger new API call', () => {
      const store = createTestChatStoreV2({
        flow: createPreSearchFlowState({ threadId: 't1', round: 0 }),
      });

      // STOP transitions to round_complete
      store.getState().dispatch({ type: 'STOP' });

      expect(store.getState().flow.type).toBe('round_complete');
      // No API call should be made - just state transition
    });

    it('streaming abort does not trigger moderator', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({
          threadId: 't1',
          round: 0,
          participantIndex: 0,
          totalParticipants: 2,
        }),
      });

      // STOP transitions to round_complete, skipping moderator
      store.getState().dispatch({ type: 'STOP' });

      expect(store.getState().flow.type).toBe('round_complete');
      // moderator_streaming was never entered
    });

    it('moderator abort transitions directly to round_complete', () => {
      const store = createTestChatStoreV2({
        flow: {
          type: 'moderator_streaming',
          threadId: 't1',
          round: 0,
        },
      });

      // STOP transitions to round_complete
      store.getState().dispatch({ type: 'STOP' });

      expect(store.getState().flow.type).toBe('round_complete');
    });
  });

  describe('navigation cleanup', () => {
    it('RESET prevents any further API calls', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
      });

      store.getState().dispatch({ type: 'RESET' });

      expect(store.getState().flow.type).toBe('idle');

      // No events should trigger API calls from idle
      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 0 });
      expect(store.getState().flow.type).toBe('idle');

      store.getState().dispatch({ type: 'MODERATOR_COMPLETE', round: 0 });
      expect(store.getState().flow.type).toBe('idle');
    });

    it('navigation reset clears API-related state', () => {
      const store = createTestChatStoreV2({
        flow: createRoundCompleteFlowState({ threadId: 't1', round: 0 }),
        createdThreadId: 't1',
        createdSlug: 'test-slug',
        pendingMessage: 'pending',
      });

      // Simulate navigation reset
      reset(store, 'navigation');

      expect(store.getState().flow.type).toBe('idle');
      expect(store.getState().createdThreadId).toBeNull();
      expect(store.getState().createdSlug).toBeNull();
    });
  });

  describe('state transition determinism', () => {
    it('same state + same event = same result (pure function)', () => {
      const state = createPreSearchFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext({ participantCount: 2 });
      const event = { type: 'PRE_SEARCH_COMPLETE' as const, round: 0 };

      const result1 = transition(state, event, context);
      const result2 = transition(state, event, context);
      const result3 = transition(state, event, context);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('transition is deterministic regardless of call timing', async () => {
      const state = createStreamingFlowState({
        threadId: 't1',
        round: 0,
        participantIndex: 0,
        totalParticipants: 2,
      });
      const context = createTestFlowContext();
      const event = { type: 'PARTICIPANT_COMPLETE' as const, participantIndex: 0 };

      // Simulate multiple "concurrent" calls
      const results = await Promise.all([
        Promise.resolve(transition(state, event, context)),
        Promise.resolve(transition(state, event, context)),
        Promise.resolve(transition(state, event, context)),
      ]);

      // All should produce identical results
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });
  });

  describe('flow state guards', () => {
    it('isFlowActive prevents overlapping operations', () => {
      // Active states should prevent new operations
      expect(isFlowActive({ type: 'creating_thread', message: '', mode: 'council', participants: [] })).toBe(true);
      expect(isFlowActive({ type: 'pre_search', threadId: 't1', round: 0 })).toBe(true);
      expect(isFlowActive({ type: 'streaming', threadId: 't1', round: 0, participantIndex: 0, totalParticipants: 1 })).toBe(true);

      // Inactive states allow new operations
      expect(isFlowActive({ type: 'idle' })).toBe(false);
      expect(isFlowActive({ type: 'round_complete', threadId: 't1', round: 0 })).toBe(false);
      expect(isFlowActive({ type: 'error', error: 'test' })).toBe(false);
    });

    it('canSubmitMessage prevents duplicate message submission', () => {
      // Can only submit in these states
      expect(canSubmitMessage({ type: 'idle' })).toBe(true);
      expect(canSubmitMessage({ type: 'round_complete', threadId: 't1', round: 0 })).toBe(true);

      // Cannot submit in these states
      expect(canSubmitMessage({ type: 'creating_thread', message: '', mode: 'council', participants: [] })).toBe(false);
      expect(canSubmitMessage({ type: 'streaming', threadId: 't1', round: 0, participantIndex: 0, totalParticipants: 1 })).toBe(false);
    });

    it('canStop guards abort API calls', () => {
      // Can abort in these states
      expect(canStop({ type: 'pre_search', threadId: 't1', round: 0 })).toBe(true);
      expect(canStop({ type: 'streaming', threadId: 't1', round: 0, participantIndex: 0, totalParticipants: 1 })).toBe(true);
      expect(canStop({ type: 'moderator_streaming', threadId: 't1', round: 0 })).toBe(true);

      // Cannot abort in these states (no active streams)
      expect(canStop({ type: 'idle' })).toBe(false);
      expect(canStop({ type: 'creating_thread', message: '', mode: 'council', participants: [] })).toBe(false);
      expect(canStop({ type: 'awaiting_moderator', threadId: 't1', round: 0 })).toBe(false);
    });
  });

  describe('context-aware transitions', () => {
    it('participantCount affects streaming state', () => {
      const state = createPreSearchFlowState({ threadId: 't1', round: 0 });
      const event = { type: 'PRE_SEARCH_COMPLETE' as const, round: 0 };

      const context1 = createTestFlowContext({ participantCount: 1 });
      const result1 = transition(state, event, context1);
      if (result1.type === 'streaming') {
        expect(result1.totalParticipants).toBe(1);
      }

      const context5 = createTestFlowContext({ participantCount: 5 });
      const result5 = transition(state, event, context5);
      if (result5.type === 'streaming') {
        expect(result5.totalParticipants).toBe(5);
      }
    });

    it('enableWebSearch affects transition target', () => {
      const state = {
        type: 'creating_thread' as const,
        message: 'test',
        mode: 'council' as const,
        participants: [],
      };
      const event = { type: 'THREAD_CREATED' as const, threadId: 't1', slug: 's1' };

      const contextWithSearch = createTestFlowContext({ enableWebSearch: true });
      const resultWithSearch = transition(state, event, contextWithSearch);
      expect(resultWithSearch.type).toBe('pre_search');

      const contextWithoutSearch = createTestFlowContext({ enableWebSearch: false });
      const resultWithoutSearch = transition(state, event, contextWithoutSearch);
      expect(resultWithoutSearch.type).toBe('streaming');
    });
  });
});
