/**
 * Reset Function Tests
 *
 * Tests for the chat-v2 reset scopes:
 * - all: full reset
 * - thread: clear thread data
 * - form: clear form input
 * - round: clear round state
 * - navigation: thread-to-thread navigation reset
 */

import { describe, expect, it } from 'vitest';

import { reset } from '../reset';
import { createChatStore } from '../store';

describe('reset', () => {
  describe('navigation scope', () => {
    it('clears changelog on navigation reset', () => {
      const store = createChatStore();
      store.setState({
        changelog: [
          { id: 'ch1', threadId: 't1', roundNumber: 1, changes: {} as never, createdAt: new Date() },
        ],
      });

      reset(store, 'navigation');

      expect(store.getState().changelog).toEqual([]);
    });

    it('clears threadUser on navigation reset', () => {
      const store = createChatStore();
      store.setState({
        threadUser: { id: 'user1', name: 'Test User', email: 'test@test.com', image: null },
      });

      reset(store, 'navigation');

      expect(store.getState().threadUser).toBeNull();
    });

    it('clears thread and messages on navigation reset', () => {
      const store = createChatStore();
      store.setState({
        thread: { id: 't1', mode: 'council' } as never,
        messages: [{ id: 'm1', role: 'user', content: 'test' }] as never,
        participants: [{ id: 'p1' }] as never,
      });

      reset(store, 'navigation');

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toEqual([]);
      expect(store.getState().participants).toEqual([]);
    });

    it('clears preSearches and feedbackByRound on navigation reset', () => {
      const store = createChatStore();
      const preSearches = new Map([[1, { roundNumber: 1, status: 'complete', query: 'test' }]]);
      const feedbackByRound = new Map([[1, 'like' as const]]);
      store.setState({ preSearches, feedbackByRound } as never);

      reset(store, 'navigation');

      expect(store.getState().preSearches.size).toBe(0);
      expect(store.getState().feedbackByRound.size).toBe(0);
    });

    it('preserves form preferences on navigation reset', () => {
      const store = createChatStore();
      store.setState({
        selectedMode: 'council',
        enableWebSearch: true,
        selectedParticipants: [{ id: 'p1', modelId: 'gpt-4', role: 'analyst' }] as never,
        inputValue: 'some text',
      });

      reset(store, 'navigation');

      expect(store.getState().selectedMode).toBe('council');
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().selectedParticipants).toHaveLength(1);
      expect(store.getState().inputValue).toBe('some text');
    });

    it('resets UI state on navigation reset', () => {
      const store = createChatStore();
      store.setState({
        hasInitiallyLoaded: true,
        displayedTitle: 'Old Title',
        targetTitle: 'Target Title',
        isTitleAnimating: true,
      });

      reset(store, 'navigation');

      expect(store.getState().hasInitiallyLoaded).toBe(false);
      expect(store.getState().displayedTitle).toBeNull();
      expect(store.getState().targetTitle).toBeNull();
      expect(store.getState().isTitleAnimating).toBe(false);
    });

    it('resets flow state to initial on navigation reset', () => {
      const store = createChatStore();
      store.setState({
        flow: { type: 'round_complete', threadId: 't1', round: 2 },
        createdThreadId: 't1',
        createdSlug: 'thread-slug',
      });

      reset(store, 'navigation');

      expect(store.getState().flow.type).toBe('idle');
      expect(store.getState().createdThreadId).toBeNull();
      expect(store.getState().createdSlug).toBeNull();
    });
  });

  describe('all scope', () => {
    it('resets everything including form preferences', () => {
      const store = createChatStore();
      store.setState({
        thread: { id: 't1' } as never,
        changelog: [{ id: 'ch1' }] as never,
        threadUser: { id: 'u1' } as never,
        selectedMode: 'council',
        enableWebSearch: true,
        inputValue: 'test',
      });

      reset(store, 'all');

      expect(store.getState().thread).toBeNull();
      expect(store.getState().selectedMode).toBeNull();
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().inputValue).toBe('');
    });
  });

  describe('thread scope', () => {
    it('clears thread data but preserves form config', () => {
      const store = createChatStore();
      store.setState({
        thread: { id: 't1' } as never,
        messages: [{ id: 'm1' }] as never,
        selectedMode: 'council',
        enableWebSearch: true,
      });

      reset(store, 'thread');

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toEqual([]);
      // Form config preserved
      expect(store.getState().selectedMode).toBe('council');
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });

  describe('form scope', () => {
    it('clears form input only', () => {
      const store = createChatStore();
      store.setState({
        inputValue: 'test input',
        pendingMessage: 'pending',
        thread: { id: 't1' } as never,
      });

      reset(store, 'form');

      expect(store.getState().inputValue).toBe('');
      expect(store.getState().pendingMessage).toBeNull();
      // Thread preserved
      expect(store.getState().thread).not.toBeNull();
    });
  });

  describe('round scope', () => {
    it('clears round state only', () => {
      const store = createChatStore();
      store.setState({
        flow: { type: 'streaming', threadId: 't1', round: 1 } as never,
        createdThreadId: 't1',
        createdSlug: 'slug',
        error: 'some error',
        thread: { id: 't1' } as never,
        messages: [{ id: 'm1' }] as never,
      });

      reset(store, 'round');

      expect(store.getState().flow.type).toBe('idle');
      expect(store.getState().createdThreadId).toBeNull();
      expect(store.getState().createdSlug).toBeNull();
      expect(store.getState().error).toBeNull();
      // Thread and messages preserved
      expect(store.getState().thread).not.toBeNull();
      expect(store.getState().messages).toHaveLength(1);
    });
  });
});
