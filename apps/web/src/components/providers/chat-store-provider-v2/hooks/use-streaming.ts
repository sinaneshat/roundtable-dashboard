/**
 * Streaming Hook - V2
 *
 * Wrapper around AI SDK's useChat that dispatches flow events.
 * Handles participant streaming with sequential triggering.
 *
 * KEY SIMPLIFICATIONS:
 * - No complex resumption logic (backend queue completes rounds)
 * - No animation tracking (CSS handles transitions)
 * - Simple dispatch on completion events
 */

import { useChat } from '@ai-sdk/react';
import { AiSdkStatuses, MessageRoles, TextPartStates } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ChatStoreApi, FlowState } from '@/stores/chat-v2';

type UseStreamingParams = {
  store: ChatStoreApi;
  threadId: string;
  onError?: (error: Error) => void;
};

export type UseStreamingReturn = {
  messages: UIMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  setMessages: (messages: UIMessage[]) => void;
};

/**
 * Get participant endpoint URL
 */
function getParticipantEndpoint(threadId: string, roundNumber: number, participantIndex: number): string {
  return `/api/v1/chat/${threadId}/participant?round=${roundNumber}&participant=${participantIndex}`;
}

/**
 * Streaming hook - wraps AI SDK useChat with flow dispatch
 */
export function useStreaming({
  store,
  threadId,
  onError,
}: UseStreamingParams): UseStreamingReturn {
  // Subscribe to flow state reactively for URL computation
  const flow = useSyncExternalStore(
    store.subscribe,
    () => store.getState().flow,
    () => ({ type: 'idle' }) as FlowState,
  );

  // Build API URL based on flow state - recomputes when flow changes
  const apiUrl = useMemo(() => {
    if (flow.type === 'streaming') {
      return getParticipantEndpoint(flow.threadId, flow.round, flow.participantIndex);
    }
    // Default endpoint for new threads
    return `/api/v1/chat/${threadId || 'new'}/stream`;
  }, [flow, threadId]);

  // Create transport with dynamic URL
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: apiUrl,
      credentials: 'include',
    });
  }, [apiUrl]);

  const useChatId = threadId && threadId.trim() !== '' ? threadId : undefined;

  const {
    messages,
    sendMessage: aiSendMessage,
    status,
    setMessages,
    stop,
  } = useChat({
    id: useChatId,
    transport,
    // No resume - backend completes rounds, we just show current state
    resume: false,

    onError: (error) => {
      store.getState().dispatch({ type: 'ERROR', error: error.message });
      onError?.(error);
    },

    onFinish: ({ message }) => {
      // Dispatch completion event based on message type
      const meta = message.metadata as Record<string, unknown> | undefined;
      if (!meta)
        return;

      const isComplete = !message.parts?.some(
        (p: { type: string; state?: string }) => 'state' in p && p.state === TextPartStates.STREAMING,
      );

      if (!isComplete)
        return;

      if (meta.isModerator) {
        store.getState().dispatch({
          type: 'MODERATOR_COMPLETE',
          round: (meta.roundNumber as number) ?? 0,
        });
      } else if (meta.role === MessageRoles.ASSISTANT) {
        store.getState().dispatch({
          type: 'PARTICIPANT_COMPLETE',
          participantIndex: (meta.participantIndex as number) ?? 0,
        });
      }
    },
  });

  const isStreaming = status === AiSdkStatuses.STREAMING || status === AiSdkStatuses.SUBMITTED;

  // Sync messages to store
  useEffect(() => {
    if (messages.length > 0) {
      store.getState().setMessages(messages);
    }
  }, [messages, store]);

  const sendMessage = useCallback(async (content: string) => {
    await aiSendMessage({ text: content });
  }, [aiSendMessage]);

  return {
    messages,
    isStreaming,
    sendMessage,
    stop,
    setMessages,
  };
}
