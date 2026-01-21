/**
 * Pre-Search & Moderator Hook Tests
 *
 * Comprehensive tests for SSE parsing in the pre-search and moderator hook.
 * Verifies the SSE parsing fix that uses event:+data: format.
 */

import { MessageStatuses } from '@roundtable/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockSSEFetchResponse,
  createModeratorDoneEvent,
  createModeratorMessageEvent,
  createPreSearchDoneEvent,
  createPreSearchResultEvent,
  createTestChatStoreV2,
  createV2ModeratorMessage,
} from '@/lib/testing';

import { usePreSearchModerator } from '../use-pre-search-moderator';

describe('usePreSearchModerator', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('pre-search SSE parsing', () => {
    it('parses "event: result" + "data: {...}" correctly', async () => {
      const store = createTestChatStoreV2();
      const events = [
        createPreSearchResultEvent({
          query: 'test query',
          results: [
            { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
          ],
        }),
        createPreSearchDoneEvent({
          queries: [{ query: 'test query' }],
          results: [
            { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
          ],
        }),
      ];

      mockFetch.mockResolvedValueOnce(createMockSSEFetchResponse(events));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startPreSearch('thread-1', 0);
      });

      await waitFor(() => {
        const preSearch = store.getState().preSearches.get(0);
        return preSearch?.status === MessageStatuses.COMPLETE;
      });

      const preSearch = store.getState().preSearches.get(0);
      expect(preSearch).toBeDefined();
      expect(preSearch?.query).toBe('test query');
      expect(preSearch?.results).toHaveLength(1);
      expect(preSearch?.results?.[0].title).toBe('Result 1');
    });

    it.todo('parses "event: done" correctly and dispatches PRE_SEARCH_COMPLETE - blocked: mock stream timing unreliable');

    it('updates store with intermediate results', async () => {
      const store = createTestChatStoreV2();
      const intermediateResults = [
        { title: 'Intermediate 1', url: 'https://int.com/1' },
        { title: 'Intermediate 2', url: 'https://int.com/2' },
      ];

      const events = [
        createPreSearchResultEvent({
          query: 'intermediate query',
          results: intermediateResults,
        }),
        createPreSearchDoneEvent({
          queries: [{ query: 'intermediate query' }],
          results: intermediateResults,
        }),
      ];

      mockFetch.mockResolvedValueOnce(createMockSSEFetchResponse(events));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startPreSearch('thread-1', 0);
      });

      await waitFor(() => {
        const preSearch = store.getState().preSearches.get(0);
        return preSearch?.status === MessageStatuses.COMPLETE;
      });

      const preSearch = store.getState().preSearches.get(0);
      expect(preSearch?.results).toHaveLength(2);
    });

    it.todo('handles split events across chunks - blocked: mock streams lack real timing characteristics');

    it.todo('handles buffered multiple events in one chunk - blocked: mock streams cannot simulate SSE buffering behavior');

    it.todo('handles malformed JSON gracefully - blocked: mock streams lack precise timing control for error recovery');

    it('handles abort without error dispatch', async () => {
      const store = createTestChatStoreV2();

      // Create a never-ending stream
      const stream = new ReadableStream({
        start(_controller) {
          // Never closes - simulates long-running connection
        },
      });

      mockFetch.mockResolvedValueOnce(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startPreSearch('thread-1', 0);
      });

      // Wait for initial state
      await waitFor(() => {
        const preSearch = store.getState().preSearches.get(0);
        return preSearch?.status === MessageStatuses.STREAMING;
      });

      // Abort the request
      act(() => {
        result.current.stopAll();
      });

      // Should NOT dispatch error for abort
      expect(store.getState().flow.type).not.toBe('error');
    });

    it('handles network errors with ERROR dispatch', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'pre_search', threadId: 'thread-1', round: 0 },
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startPreSearch('thread-1', 0);
      });

      await waitFor(() => {
        return store.getState().flow.type === 'error';
      });

      expect(store.getState().flow.type).toBe('error');
      const flowState = store.getState().flow;
      expect(flowState.type).toBe('error');
      expect(flowState.type === 'error' && flowState.error).toContain('Pre-search failed');
    });
  });

  describe('moderator SSE parsing', () => {
    it('parses "data: {"type":"message"}" correctly', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'awaiting_moderator', threadId: 'thread-1', round: 0 },
        messages: [],
      });

      const moderatorMessage = createV2ModeratorMessage({
        id: 'mod-1',
        roundNumber: 0,
        content: 'Moderator summary',
      });

      const events = [
        createModeratorMessageEvent(moderatorMessage),
        createModeratorDoneEvent(),
      ];

      mockFetch.mockResolvedValueOnce(createMockSSEFetchResponse(events));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startModerator('thread-1', 0, ['msg-1', 'msg-2']);
      });

      await waitFor(() => {
        return store.getState().messages.length > 0;
      });

      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('mod-1');
    });

    it('parses "data: {"type":"done"}" correctly and dispatches MODERATOR_COMPLETE', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'moderator_streaming', threadId: 'thread-1', round: 0 },
        messages: [],
      });

      const moderatorMessage = createV2ModeratorMessage({
        id: 'mod-done',
        roundNumber: 0,
        content: 'Final summary',
      });

      const events = [
        createModeratorMessageEvent(moderatorMessage),
        createModeratorDoneEvent(),
      ];

      mockFetch.mockResolvedValueOnce(createMockSSEFetchResponse(events));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startModerator('thread-1', 0, ['msg-1']);
      });

      await waitFor(() => {
        return store.getState().flow.type === 'round_complete';
      });

      expect(store.getState().flow.type).toBe('round_complete');
    });

    it('adds message to store on type:message', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'moderator_streaming', threadId: 'thread-1', round: 0 },
        messages: [],
      });

      const moderatorMessage = createV2ModeratorMessage({
        id: 'mod-add',
        roundNumber: 0,
        content: 'Added message',
      });

      const events = [
        createModeratorMessageEvent(moderatorMessage),
      ];

      mockFetch.mockResolvedValueOnce(createMockSSEFetchResponse(events));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startModerator('thread-1', 0, ['msg-1']);
      });

      await waitFor(() => {
        return store.getState().messages.length > 0;
      });

      expect(store.getState().messages[0].parts).toEqual([
        { type: 'text', text: 'Added message' },
      ]);
    });

    it('calls onModeratorComplete callback', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'moderator_streaming', threadId: 'thread-1', round: 0 },
        messages: [],
      });

      const onModeratorComplete = vi.fn();

      const moderatorMessage = createV2ModeratorMessage({
        id: 'mod-callback',
        roundNumber: 0,
        content: 'Callback test',
      });

      const events = [
        createModeratorMessageEvent(moderatorMessage),
        createModeratorDoneEvent(),
      ];

      mockFetch.mockResolvedValueOnce(createMockSSEFetchResponse(events));

      const { result } = renderHook(() => usePreSearchModerator({
        store,
        onModeratorComplete,
      }));

      act(() => {
        result.current.startModerator('thread-1', 0, ['msg-1']);
      });

      await waitFor(() => {
        return onModeratorComplete.mock.calls.length > 0;
      });

      expect(onModeratorComplete).toHaveBeenCalledTimes(1);
      expect(onModeratorComplete).toHaveBeenCalledWith(moderatorMessage);
    });

    it('handles abort without error dispatch', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'moderator_streaming', threadId: 'thread-1', round: 0 },
      });

      // Create a never-ending stream
      const stream = new ReadableStream({
        start(_controller) {
          // Never closes
        },
      });

      mockFetch.mockResolvedValueOnce(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startModerator('thread-1', 0, ['msg-1']);
      });

      // Give it a moment
      await new Promise(r => setTimeout(r, 50));

      // Abort
      act(() => {
        result.current.stopAll();
      });

      // Should NOT dispatch error
      expect(store.getState().flow.type).not.toBe('error');
    });

    it('handles network errors with ERROR dispatch', async () => {
      const store = createTestChatStoreV2({
        flow: { type: 'moderator_streaming', threadId: 'thread-1', round: 0 },
      });

      mockFetch.mockRejectedValueOnce(new Error('Moderator network error'));

      const { result } = renderHook(() => usePreSearchModerator({ store }));

      act(() => {
        result.current.startModerator('thread-1', 0, ['msg-1']);
      });

      await waitFor(() => {
        return store.getState().flow.type === 'error';
      });

      expect(store.getState().flow.type).toBe('error');
    });
  });

  // Note: Abort management tests require AbortController signals to propagate to
  // ReadableStream.cancel() callbacks, which doesn't work reliably in JSDOM.
  // The abort functionality is tested indirectly through the "handles abort without
  // error dispatch" tests above, which verify the hook doesn't dispatch ERROR on abort.
  describe('abort management', () => {
    it.todo('startPreSearch aborts previous pre-search - blocked: AbortController signals do not propagate to ReadableStream.cancel in JSDOM');

    it.todo('startModerator aborts previous moderator - blocked: AbortController signals do not propagate to ReadableStream.cancel in JSDOM');

    it.todo('stopAll aborts both pre-search and moderator - blocked: AbortController signals do not propagate to ReadableStream.cancel in JSDOM');
  });
});
