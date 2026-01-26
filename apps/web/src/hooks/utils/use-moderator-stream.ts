import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, UIMessageRoles } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers';
import { queryKeys } from '@/lib/data/query-keys';
import { chatMessagesToUIMessages } from '@/lib/utils';
import { getThreadMessagesService, streamModeratorService } from '@/services/api';

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
export function useModeratorStream({ enabled = true, threadId }: UseModeratorStreamOptions) {
  const queryClient = useQueryClient();

  const {
    completeStreaming,
    hasModeratorStreamBeenTriggered,
    markModeratorStreamTriggered,
    messages,
    participants,
    setIsModeratorStreaming,
    setMessages,
  } = useChatStore(
    useShallow(s => ({
      completeStreaming: s.completeStreaming,
      hasModeratorStreamBeenTriggered: s.hasModeratorStreamBeenTriggered,
      markModeratorStreamTriggered: s.markModeratorStreamTriggered,
      messages: s.messages,
      participants: s.participants,
      setIsModeratorStreaming: s.setIsModeratorStreaming,
      setMessages: s.setMessages,
    })),
  );

  const [state, setState] = useState<ModeratorStreamState>({
    error: null,
    isStreaming: false,
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
    // Capture ref at function start to satisfy require-atomic-updates
    const abortRef = abortControllerRef;

    if (!enabled || !threadId) {
      return;
    }

    const moderatorId = `${threadId}_r${roundNumber}_moderator`;
    if (hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      return;
    }

    markModeratorStreamTriggered(moderatorId, roundNumber);
    setIsModeratorStreaming(true);

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      error: null,
      isStreaming: true,
      roundNumber,
    });

    setMessages((currentMessages) => {
      const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorId);

      if (hasExistingPlaceholder) {
        return currentMessages.map(msg =>
          msg.id === moderatorId
            ? {
                ...msg,
                parts: [{ text: '', type: MessagePartTypes.TEXT }],
              }
            : msg,
        );
      } else {
        const streamingModeratorMessage: UIMessage = {
          id: moderatorId,
          metadata: {
            isModerator: true,
            model: MODERATOR_NAME,
            participantIndex: MODERATOR_PARTICIPANT_INDEX,
            roundNumber,
          },
          parts: [{ text: '', type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        };
        return [...currentMessages, streamingModeratorMessage];
      }
    });

    try {
      // Use RPC service for type-safe moderator streaming
      const response = await streamModeratorService(
        {
          json: { participantMessageIds },
          param: {
            roundNumber: String(roundNumber),
            threadId,
          },
        },
        { signal: controller.signal },
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
                    parts: [{ text: textToSet, type: MessagePartTypes.TEXT }],
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
        if (done) {
          break;
        }

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
        queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
        queryKey: queryKeys.threads.messages(threadId),
        staleTime: 0,
      });

      if (result.success && result.data.items) {
        const uiMessages = chatMessagesToUIMessages(result.data.items, participants);
        setMessages(uiMessages);
      }

      // ✅ INVALIDATE USAGE STATS: After moderator completes, free users have freeRoundUsed=true
      // This ensures the submit button is disabled immediately after the round completes
      await queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });

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
        error: error instanceof Error ? error : new Error(String(error)),
        isStreaming: false,
      }));
    } finally {
      setIsModeratorStreaming(false);
      completeStreaming();
      abortRef.current = null;
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
