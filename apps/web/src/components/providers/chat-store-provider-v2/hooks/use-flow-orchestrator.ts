/**
 * Flow Orchestrator Hook - V2
 *
 * Single useEffect that responds to flow state changes and triggers side effects.
 * Coordinates API calls, streaming, and navigation based on FlowState.
 *
 * ARCHITECTURE:
 * - Subscribes to flow state changes
 * - Triggers appropriate actions based on new state type
 * - Handles thread creation, participant streaming, moderator trigger
 * - Syncs store with backend after round completes
 *
 * KEY SIMPLIFICATIONS:
 * - No complex resumption chains (backend completes rounds)
 * - No animation promise tracking (CSS handles transitions)
 * - Single effect instead of 14 hooks
 *
 * SYNC BEHAVIOR:
 * - After moderator completes → sync from backend to ensure store = DB truth
 */

import { useCallback, useEffect, useRef } from 'react';

import { getThreadBySlugService } from '@/services/api';
import type { ChatStoreApi, FlowState } from '@/stores/chat-v2';
import { createOptimisticUserMessage, createPlaceholderPreSearch } from '@/stores/chat-v2';

import type { UsePreSearchModeratorReturn } from './use-pre-search-moderator';
import type { UseStreamingReturn } from './use-streaming';

type UseFlowOrchestratorParams = {
  store: ChatStoreApi;
  streaming: UseStreamingReturn;
  preSearchModerator: UsePreSearchModeratorReturn;
  /** Thread slug for backend sync after round complete */
  slug?: string;
};

type ThreadCreateResponse = {
  success: boolean;
  data?: {
    thread: {
      id: string;
      slug: string;
    };
  };
};

/**
 * Flow orchestrator - responds to flow state and triggers side effects
 */
export function useFlowOrchestrator({
  store,
  streaming,
  preSearchModerator,
  slug,
}: UseFlowOrchestratorParams): void {
  const prevFlowRef = useRef<FlowState | null>(null);

  /**
   * Sync store with backend after round completes
   * Ensures store state matches DB truth
   */
  const syncFromBackend = useCallback(async (threadSlug: string) => {
    try {
      const response = await getThreadBySlugService({
        param: { slug: threadSlug },
      });

      if (response.success && response.data) {
        store.getState().syncFromBackend(response.data);
      }
    } catch (error) {
      console.error('[FlowOrchestrator] Failed to sync from backend:', error);
    }
  }, [store]);

  // Create thread mutation
  const createThread = useCallback(async (message: string) => {
    const state = store.getState();
    const { selectedMode, selectedParticipants, enableWebSearch } = state;

    try {
      const response = await fetch('/api/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: selectedMode,
          participants: selectedParticipants,
          enableWebSearch,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create thread');
      }

      const data = await response.json() as ThreadCreateResponse;
      if (data.success && data.data) {
        store.getState().dispatch({
          type: 'THREAD_CREATED',
          threadId: data.data.thread.id,
          slug: data.data.thread.slug,
        });
      }
    } catch (error) {
      store.getState().dispatch({
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Thread creation failed',
      });
    }
  }, [store]);

  // Update thread mutation (follow-up rounds)
  const updateThread = useCallback(async (threadId: string, message: string) => {
    const state = store.getState();
    const { selectedParticipants, enableWebSearch } = state;

    try {
      const response = await fetch(`/api/v1/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: selectedParticipants,
          enableWebSearch,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update thread');
      }

      store.getState().dispatch({ type: 'UPDATE_THREAD_COMPLETE' });
    } catch (error) {
      store.getState().dispatch({
        type: 'ERROR',
        error: error instanceof Error ? error.message : 'Thread update failed',
      });
    }
  }, [store]);

  // Main orchestration effect
  useEffect(() => {
    const unsubscribe = store.subscribe((state) => {
      const { flow } = state;
      const prevFlow = prevFlowRef.current;

      // Skip if flow hasn't changed
      if (prevFlow && prevFlow.type === flow.type) {
        // Check for round/participant changes within same type
        if (flow.type === 'streaming' && prevFlow.type === 'streaming') {
          if (
            flow.participantIndex === prevFlow.participantIndex
            && flow.round === prevFlow.round
          ) {
            return;
          }
        } else {
          return;
        }
      }

      prevFlowRef.current = flow;

      // React to flow state changes
      switch (flow.type) {
        case 'creating_thread': {
          // 1. Create optimistic user message for immediate UI feedback
          const optimisticUserMessage = createOptimisticUserMessage({
            roundNumber: 0,
            text: flow.message,
          });
          store.getState().addMessage(optimisticUserMessage);

          // 2. Create pre-search placeholder if web search enabled
          if (state.enableWebSearch) {
            store.getState().setPreSearch(0, createPlaceholderPreSearch({
              roundNumber: 0,
              query: flow.message,
            }));
          }

          // 3. Store pending message for streaming trigger
          store.getState().setPendingMessage(flow.message);

          // 4. Create thread
          createThread(flow.message);
          break;
        }

        case 'updating_thread': {
          // 1. Create optimistic user message for follow-up round
          const followUpUserMessage = createOptimisticUserMessage({
            roundNumber: flow.round,
            text: flow.message,
          });
          store.getState().addMessage(followUpUserMessage);

          // 2. Create pre-search placeholder if web search enabled
          if (state.enableWebSearch) {
            store.getState().setPreSearch(flow.round, createPlaceholderPreSearch({
              roundNumber: flow.round,
              query: flow.message,
            }));
          }

          // 3. Store pending message for streaming trigger
          store.getState().setPendingMessage(flow.message);

          // 4. Update thread via API
          updateThread(flow.threadId, flow.message);
          break;
        }

        case 'pre_search': {
          // Trigger pre-search SSE stream
          preSearchModerator.startPreSearch(flow.threadId, flow.round);
          break;
        }

        case 'streaming': {
          // Trigger participant streaming explicitly
          // First participant gets the user message, subsequent get empty signal
          const pendingMessage = state.pendingMessage;
          if (flow.participantIndex === 0 && pendingMessage) {
            streaming.sendMessage(pendingMessage);
            store.getState().setPendingMessage(null);
          } else if (flow.participantIndex > 0) {
            // Continue signal for subsequent participants
            streaming.sendMessage('');
          }
          break;
        }

        case 'awaiting_moderator': {
          // Trigger moderator SSE stream
          const messages = state.messages;
          const participantMessageIds = messages
            .filter((m) => {
              const meta = m.metadata as Record<string, unknown> | undefined;
              return (
                meta?.roundNumber === flow.round
                && meta?.role === 'assistant'
                && !meta?.isModerator
              );
            })
            .map(m => m.id);

          if (participantMessageIds.length > 0) {
            preSearchModerator.startModerator(
              flow.threadId,
              flow.round,
              participantMessageIds,
            );
            store.getState().dispatch({ type: 'MODERATOR_STARTED' });
          }
          break;
        }

        case 'round_complete': {
          // Check for pending URL update after thread creation
          const { createdSlug } = state;
          if (createdSlug && flow.round === 0) {
            // Use history.replaceState to update URL without full navigation/re-render
            queueMicrotask(() => {
              window.history.replaceState(
                window.history.state,
                '',
                `/chat/${createdSlug}`,
              );
            });
          }

          // After round completes (moderator done), sync with backend
          // This ensures store = DB truth after streaming optimistic updates
          // Fire-and-forget: optimistic UI already has state, backend handles consistency
          if (prevFlow?.type === 'moderator_streaming') {
            const syncSlug = slug ?? createdSlug;
            if (syncSlug) {
              void syncFromBackend(syncSlug);
            }
          }
          break;
        }

        case 'error': {
          // Error handling - could show toast, etc.
          console.error('[FlowOrchestrator] Error:', flow.error);
          break;
        }
      }
    });

    return unsubscribe;
  }, [store, createThread, updateThread, streaming, preSearchModerator, syncFromBackend, slug]);
}
