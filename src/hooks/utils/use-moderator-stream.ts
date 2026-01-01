'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, UIMessageRoles } from '@/api/core/enums';
import { useChatStore } from '@/components/providers';
import { queryKeys } from '@/lib/data/query-keys';
import { chatMessagesToUIMessages } from '@/lib/utils';
import { getThreadMessagesService } from '@/services/api';

/** Throttle interval for UI updates (matches AI SDK batching behavior) */
const UPDATE_THROTTLE_MS = 50;

export type ModeratorStreamState = {
  isStreaming: boolean;
  error: Error | null;
  roundNumber: number | null;
};

type UseModeratorStreamOptions = {
  threadId: string;
  enabled?: boolean;
};

/**
 * Hook to manage moderator streaming after participants complete
 * Moderator is triggered programmatically via useModeratorTrigger hook
 * and rendered inline in ChatMessageList using the same path as participants.
 *
 * ✅ UNIFIED RENDERING: Adds moderator message to messages array during streaming
 * so it goes through the exact same rendering path as participant messages.
 */
export function useModeratorStream({ threadId, enabled = true }: UseModeratorStreamOptions) {
  const queryClient = useQueryClient();

  const {
    participants,
    messages,
    setMessages,
    setIsModeratorStreaming,
    hasModeratorStreamBeenTriggered,
    markModeratorStreamTriggered,
    completeStreaming,
  } = useChatStore(
    useShallow(s => ({
      participants: s.participants,
      messages: s.messages,
      setMessages: s.setMessages,
      setIsModeratorStreaming: s.setIsModeratorStreaming,
      hasModeratorStreamBeenTriggered: s.hasModeratorStreamBeenTriggered,
      markModeratorStreamTriggered: s.markModeratorStreamTriggered,
      completeStreaming: s.completeStreaming,
    })),
  );

  const [state, setState] = useState<ModeratorStreamState>({
    isStreaming: false,
    error: null,
    roundNumber: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const triggerModeratorStream = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
  ) => {
    if (!enabled || !threadId)
      return;

    const moderatorId = `${threadId}_r${roundNumber}_moderator`;
    if (hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      return;
    }

    markModeratorStreamTriggered(moderatorId, roundNumber);
    setIsModeratorStreaming(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({
      isStreaming: true,
      error: null,
      roundNumber,
    });

    setMessages((currentMessages) => {
      const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorId);

      if (hasExistingPlaceholder) {
        return currentMessages.map(msg =>
          msg.id === moderatorId
            ? {
                ...msg,
                parts: [{ type: MessagePartTypes.TEXT, text: '' }],
              }
            : msg,
        );
      } else {
        const streamingModeratorMessage: UIMessage = {
          id: moderatorId,
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: '' }],
          metadata: {
            isModerator: true,
            roundNumber,
            participantIndex: MODERATOR_PARTICIPANT_INDEX,
            model: MODERATOR_NAME,
          },
        };
        return [...currentMessages, streamingModeratorMessage];
      }
    });

    try {
      const response = await fetch(
        `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/moderator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ participantMessageIds }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Moderator stream failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let lastUpdateTime = 0;
      let pendingUpdate = false;

      const flushUpdate = () => {
        if (accumulatedText) {
          const textToSet = accumulatedText;
          setMessages(currentMessages =>
            currentMessages.map(msg =>
              msg.id === moderatorId
                ? {
                    ...msg,
                    parts: [{ type: MessagePartTypes.TEXT, text: textToSet }],
                  }
                : msg,
            ),
          );
          lastUpdateTime = Date.now();
          pendingUpdate = false;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;

        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const textData = JSON.parse(line.slice(2));
              if (typeof textData === 'string') {
                accumulatedText += textData;
                pendingUpdate = true;

                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
                  flushUpdate();
                }
              }
            } catch {
            }
          }
        }
      }

      if (pendingUpdate) {
        flushUpdate();
      }

      const result = await queryClient.fetchQuery({
        queryKey: queryKeys.threads.messages(threadId),
        queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
        staleTime: 0,
      });

      if (result.success && result.data?.messages) {
        const uiMessages = chatMessagesToUIMessages(result.data.messages, participants);
        setMessages(uiMessages);
      }

      setState(prev => ({
        ...prev,
        isStreaming: false,
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          isStreaming: false,
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    } finally {
      setIsModeratorStreaming(false);
      completeStreaming();
      abortControllerRef.current = null;
    }
  }, [
    enabled,
    threadId,
    hasModeratorStreamBeenTriggered,
    markModeratorStreamTriggered,
    setIsModeratorStreaming,
    completeStreaming,
    queryClient,
    participants,
    setMessages,
  ]);

  return {
    state,
    triggerModeratorStream,
  };
}
