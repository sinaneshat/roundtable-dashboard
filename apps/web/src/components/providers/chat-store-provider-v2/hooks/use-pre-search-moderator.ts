/**
 * Pre-Search & Moderator Hook - V2
 *
 * Handles both pre-search and moderator SSE streams.
 * Consolidated from separate hooks for simplicity.
 *
 * KEY SIMPLIFICATIONS:
 * - Single hook for both SSE stream types
 * - No complex tracking sets (flow machine handles state)
 * - Simple abort controller management
 */

import { MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useCallback, useRef } from 'react';

import type { ChatStoreApi, PreSearchResult } from '@/stores/chat-v2';

export type UsePreSearchModeratorReturn = {
  startPreSearch: (threadId: string, round: number) => void;
  startModerator: (threadId: string, round: number, participantMessageIds: string[]) => void;
  stopAll: () => void;
};

type UsePreSearchModeratorParams = {
  store: ChatStoreApi;
  onModeratorComplete?: (message: UIMessage) => void;
};

/**
 * Pre-search and moderator SSE handler
 */
export function usePreSearchModerator({
  store,
  onModeratorComplete,
}: UsePreSearchModeratorParams): UsePreSearchModeratorReturn {
  const preSearchAbortRef = useRef<AbortController | null>(null);
  const moderatorAbortRef = useRef<AbortController | null>(null);

  /**
   * Start pre-search SSE stream
   */
  const startPreSearch = useCallback((threadId: string, round: number) => {
    // Abort any existing pre-search
    preSearchAbortRef.current?.abort();
    preSearchAbortRef.current = new AbortController();

    // Initialize pre-search state
    const initialResult: PreSearchResult = {
      roundNumber: round,
      status: MessageStatuses.STREAMING,
      query: null,
      results: null,
      startedAt: Date.now(),
      completedAt: null,
    };
    store.getState().setPreSearch(round, initialResult);

    // Start SSE stream
    const url = `/api/v1/chat/${threadId}/pre-search?round=${round}`;

    fetch(url, {
      signal: preSearchAbortRef.current.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Pre-search failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'result') {
                  store.getState().setPreSearch(round, {
                    roundNumber: round,
                    status: MessageStatuses.COMPLETE,
                    query: data.query,
                    results: data.results,
                    startedAt: initialResult.startedAt,
                    completedAt: Date.now(),
                  });

                  // Dispatch completion event
                  store.getState().dispatch({
                    type: 'PRE_SEARCH_COMPLETE',
                    round,
                  });
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError')
          return;

        store.getState().updatePreSearchStatus(round, MessageStatuses.FAILED);
        store.getState().dispatch({
          type: 'ERROR',
          error: `Pre-search failed: ${error.message}`,
        });
      });
  }, [store]);

  /**
   * Start moderator SSE stream
   */
  const startModerator = useCallback((
    threadId: string,
    round: number,
    participantMessageIds: string[],
  ) => {
    // Abort any existing moderator stream
    moderatorAbortRef.current?.abort();
    moderatorAbortRef.current = new AbortController();

    const url = `/api/v1/chat/${threadId}/moderator`;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundNumber: round,
        participantMessageIds,
      }),
      signal: moderatorAbortRef.current.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Moderator failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let moderatorMessage: UIMessage | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'message') {
                  moderatorMessage = data.message as UIMessage;
                  store.getState().addMessage(moderatorMessage);
                }

                if (data.type === 'done' && moderatorMessage) {
                  onModeratorComplete?.(moderatorMessage);
                  store.getState().dispatch({
                    type: 'MODERATOR_COMPLETE',
                    round,
                  });
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError')
          return;

        store.getState().dispatch({
          type: 'ERROR',
          error: `Moderator failed: ${error.message}`,
        });
      });
  }, [store, onModeratorComplete]);

  /**
   * Stop all active streams
   */
  const stopAll = useCallback(() => {
    preSearchAbortRef.current?.abort();
    moderatorAbortRef.current?.abort();
    preSearchAbortRef.current = null;
    moderatorAbortRef.current = null;
  }, []);

  return {
    startPreSearch,
    startModerator,
    stopAll,
  };
}
