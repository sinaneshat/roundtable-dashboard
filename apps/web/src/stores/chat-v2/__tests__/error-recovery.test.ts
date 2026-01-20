/**
 * Error Recovery Tests - V2
 *
 * Tests for error handling and recovery scenarios.
 * Verifies correct error state transitions and retry behavior.
 */

import { describe, expect, it } from 'vitest';

import {
  createErrorFlowState,
  createPreSearchFlowState,
  createStreamingFlowState,
  createTestChatStoreV2,
  createTestFlowContext,
} from '@/lib/testing';

import { transition } from '../flow-machine';

describe('V2 error handling', () => {
  describe('network errors', () => {
    it('ERROR event transitions any state to error', () => {
      const states = [
        { type: 'idle' as const },
        { type: 'creating_thread' as const, message: 'test', mode: 'council' as const, participants: [] },
        { type: 'pre_search' as const, threadId: 't1', round: 0 },
        { type: 'streaming' as const, threadId: 't1', round: 0, participantIndex: 0, totalParticipants: 2 },
        { type: 'awaiting_moderator' as const, threadId: 't1', round: 0 },
        { type: 'moderator_streaming' as const, threadId: 't1', round: 0 },
      ];

      const context = createTestFlowContext();

      for (const state of states) {
        const result = transition(state, { type: 'ERROR', error: 'Network failed' }, context);
        expect(result.type).toBe('error');
        if (result.type === 'error') {
          expect(result.error).toBe('Network failed');
        }
      }
    });

    it('pre-search failure preserves thread context', () => {
      const state = createPreSearchFlowState({ threadId: 't1', round: 2 });
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Pre-search failed' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(2);
        expect(result.error).toBe('Pre-search failed');
      }
    });

    it('streaming failure preserves thread context', () => {
      const state = createStreamingFlowState({ threadId: 't1', round: 1 });
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Stream error' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(1);
      }
    });

    it('error from idle has no thread context', () => {
      const state = { type: 'idle' as const };
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Early failure' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBeUndefined();
        expect(result.round).toBeUndefined();
      }
    });

    it('error from creating_thread has no thread context', () => {
      const state = {
        type: 'creating_thread' as const,
        message: 'test',
        mode: 'council' as const,
        participants: [],
      };
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Thread creation failed' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBeUndefined();
        expect(result.round).toBeUndefined();
      }
    });
  });

  describe('retry from error', () => {
    it('RETRY with threadId and web search -> pre_search', () => {
      const state = createErrorFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext({ enableWebSearch: true, participantCount: 2 });

      const result = transition(state, { type: 'RETRY', round: 0 }, context);

      expect(result.type).toBe('pre_search');
      if (result.type === 'pre_search') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(0);
      }
    });

    it('RETRY with threadId and no web search -> streaming', () => {
      const state = createErrorFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext({ enableWebSearch: false, participantCount: 3 });

      const result = transition(state, { type: 'RETRY', round: 0 }, context);

      expect(result.type).toBe('streaming');
      if (result.type === 'streaming') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(0);
        expect(result.participantIndex).toBe(0);
        expect(result.totalParticipants).toBe(3);
      }
    });

    it('RETRY without threadId stays in error', () => {
      const state: ReturnType<typeof createErrorFlowState> = {
        type: 'error',
        error: 'No context',
      };
      const context = createTestFlowContext();

      const result = transition(state, { type: 'RETRY', round: 0 }, context);

      expect(result.type).toBe('error');
    });

    it('RETRY preserves round context', () => {
      const state = createErrorFlowState({ threadId: 't1', round: 3 });
      const context = createTestFlowContext({ enableWebSearch: true });

      const result = transition(state, { type: 'RETRY', round: 3 }, context);

      expect(result.type).toBe('pre_search');
      if (result.type === 'pre_search') {
        expect(result.round).toBe(3);
      }
    });

    it('RESET from error -> idle', () => {
      const state = createErrorFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext();

      const result = transition(state, { type: 'RESET' }, context);

      expect(result.type).toBe('idle');
    });
  });

  describe('abort handling', () => {
    it('AbortError should not dispatch ERROR (handled in hooks)', () => {
      // AbortError handling is done at the hook level, not in the state machine
      // The state machine only sees ERROR events that are explicitly dispatched
      // This test documents that the state machine doesn't have special abort handling
      const state = createStreamingFlowState({ threadId: 't1', round: 0 });
      const context = createTestFlowContext();

      // If an abort happens, the hook should NOT dispatch ERROR
      // But if it did, the state machine would transition to error
      const result = transition(state, { type: 'ERROR', error: 'Abort' }, context);

      // State machine doesn't distinguish abort from other errors
      expect(result.type).toBe('error');
    });

    it('cleanup runs correctly after abort', () => {
      // This is a documentation test - actual cleanup is in hooks
      // The state machine ensures consistent state after ERROR or STOP

      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
      });

      // STOP is the clean way to abort without error
      store.getState().dispatch({ type: 'STOP' });

      expect(store.getState().flow.type).toBe('round_complete');
    });
  });

  describe('error state store behavior', () => {
    it('store dispatch ERROR preserves error message', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 1 }),
      });

      store.getState().dispatch({
        type: 'ERROR',
        error: 'Something went wrong',
      });

      const flow = store.getState().flow;
      expect(flow.type).toBe('error');
      if (flow.type === 'error') {
        expect(flow.error).toBe('Something went wrong');
        expect(flow.threadId).toBe('t1');
        expect(flow.round).toBe(1);
      }
    });

    it('store dispatch ERROR clears threadId/round if not in thread state', () => {
      const store = createTestChatStoreV2({
        flow: { type: 'idle' },
      });

      store.getState().dispatch({
        type: 'ERROR',
        error: 'Failed before thread creation',
      });

      const flow = store.getState().flow;
      expect(flow.type).toBe('error');
      if (flow.type === 'error') {
        expect(flow.threadId).toBeUndefined();
        expect(flow.round).toBeUndefined();
      }
    });

    it('can retry from error state in store', () => {
      const store = createTestChatStoreV2({
        flow: createErrorFlowState({ threadId: 't1', round: 0 }),
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
        ],
        enableWebSearch: false,
      });

      store.getState().dispatch({ type: 'RETRY', round: 0 });

      expect(store.getState().flow.type).toBe('streaming');
    });

    it('can reset from error state in store', () => {
      const store = createTestChatStoreV2({
        flow: createErrorFlowState({ threadId: 't1', round: 0 }),
      });

      store.getState().dispatch({ type: 'RESET' });

      expect(store.getState().flow.type).toBe('idle');
    });
  });

  describe('error recovery with different contexts', () => {
    it('retry uses current context enableWebSearch value', () => {
      const state = createErrorFlowState({ threadId: 't1', round: 0 });

      // First context: web search enabled
      const contextWithWebSearch = createTestFlowContext({
        enableWebSearch: true,
        participantCount: 2,
      });

      const resultWithWebSearch = transition(state, { type: 'RETRY', round: 0 }, contextWithWebSearch);
      expect(resultWithWebSearch.type).toBe('pre_search');

      // Second context: web search disabled
      const contextWithoutWebSearch = createTestFlowContext({
        enableWebSearch: false,
        participantCount: 2,
      });

      const resultWithoutWebSearch = transition(state, { type: 'RETRY', round: 0 }, contextWithoutWebSearch);
      expect(resultWithoutWebSearch.type).toBe('streaming');
    });

    it('retry uses current context participantCount value', () => {
      const state = createErrorFlowState({ threadId: 't1', round: 0 });

      // Context with 3 participants
      const contextWith3 = createTestFlowContext({
        enableWebSearch: false,
        participantCount: 3,
      });

      const result3 = transition(state, { type: 'RETRY', round: 0 }, contextWith3);
      if (result3.type === 'streaming') {
        expect(result3.totalParticipants).toBe(3);
      }

      // Context with 5 participants
      const contextWith5 = createTestFlowContext({
        enableWebSearch: false,
        participantCount: 5,
      });

      const result5 = transition(state, { type: 'RETRY', round: 0 }, contextWith5);
      if (result5.type === 'streaming') {
        expect(result5.totalParticipants).toBe(5);
      }
    });
  });

  describe('error during different phases', () => {
    it('error during updating_thread preserves context', () => {
      const state = {
        type: 'updating_thread' as const,
        threadId: 't1',
        round: 2,
        message: 'follow up',
        hasConfigChanges: true,
      };
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Update failed' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(2);
      }
    });

    it('error during awaiting_changelog preserves context', () => {
      const state = {
        type: 'awaiting_changelog' as const,
        threadId: 't1',
        round: 1,
      };
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Changelog failed' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(1);
      }
    });

    it('error during round_complete preserves context', () => {
      const state = {
        type: 'round_complete' as const,
        threadId: 't1',
        round: 0,
      };
      const context = createTestFlowContext();

      const result = transition(state, { type: 'ERROR', error: 'Unexpected error' }, context);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.threadId).toBe('t1');
        expect(result.round).toBe(0);
      }
    });
  });

  describe('setError store action', () => {
    it('setError stores error message', () => {
      const store = createTestChatStoreV2();

      store.getState().setError('Custom error message');

      expect(store.getState().error).toBe('Custom error message');
    });

    it('setError can clear error', () => {
      const store = createTestChatStoreV2({
        error: 'Previous error',
      });

      store.getState().setError(null);

      expect(store.getState().error).toBeNull();
    });

    it('setError is independent of flow state', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
      });

      store.getState().setError('Side error');

      // Error field is set
      expect(store.getState().error).toBe('Side error');
      // But flow state is unchanged
      expect(store.getState().flow.type).toBe('streaming');
    });
  });
});
