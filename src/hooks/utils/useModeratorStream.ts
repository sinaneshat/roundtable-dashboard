/**
 * Moderator Stream Hook
 *
 * Triggers and manages the moderator stream after participants complete.
 * Uses text streaming via fetch to consume the backend's streamText() response.
 *
 * ✅ UNIFIED RENDERING: Uses same message-based path as participants
 * Moderator message is added to messages array during streaming (just like participants)
 * and rendered via the same ModelMessageCard component with no special handling.
 * Uses throttled updates to match participant streaming behavior.
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from '@/api/core/enums';
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

  // ✅ ZUSTAND v5 BEST PRACTICE: Batch all store subscriptions with useShallow
  // Prevents 7 individual subscriptions that can trigger cascading re-renders
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
  // Track current messages ref to avoid stale closure in streaming loop
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

  /**
   * Trigger the moderator stream for a specific round
   */
  const triggerModeratorStream = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
  ) => {
    if (!enabled || !threadId)
      return;

    // Check if already triggered
    const moderatorId = `${threadId}_r${roundNumber}_moderator`;
    if (hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      return;
    }

    // Mark as triggered
    markModeratorStreamTriggered(moderatorId, roundNumber);
    setIsModeratorStreaming(true);

    // Abort any existing stream
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

    // ✅ UNIFIED RENDERING: Update existing moderator placeholder to streaming state
    // The placeholder was already added in use-streaming-trigger.ts or use-pending-message.ts when round started
    // Now we update it to show streaming state with empty text
    // Use function updater to reduce race conditions with concurrent updates
    setMessages((currentMessages) => {
      const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorId);

      if (hasExistingPlaceholder) {
        // Update existing placeholder to streaming state
        return currentMessages.map(msg =>
          msg.id === moderatorId
            ? {
                ...msg,
                parts: [{ type: MessagePartTypes.TEXT, text: '' }],
              }
            : msg,
        );
      } else {
        // Fallback: Add moderator message if placeholder doesn't exist (e.g., resumption)
        const streamingModeratorMessage: UIMessage = {
          id: moderatorId,
          role: 'assistant',
          parts: [{ type: 'text', text: '' }],
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

      // ✅ UNIFIED RENDERING: Throttle UI updates to match participant behavior
      // Without throttling, per-chunk updates create a "typing effect"
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

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;

        const chunk = decoder.decode(value, { stream: true });

        // Parse SSE format from AI SDK
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('0:')) {
            // Text chunk from streamText
            try {
              const textData = JSON.parse(line.slice(2));
              if (typeof textData === 'string') {
                accumulatedText += textData;
                pendingUpdate = true;

                // ✅ UNIFIED RENDERING: Throttle updates to match AI SDK batching behavior
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
                  flushUpdate();
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Flush any pending update at stream end
      if (pendingUpdate) {
        flushUpdate();
      }

      // Stream completed - fetch fresh messages to get the saved moderator message with full metadata
      const result = await queryClient.fetchQuery({
        queryKey: queryKeys.threads.messages(threadId),
        queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
        staleTime: 0, // Force fresh fetch
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
        // Aborted - not an error
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
      // ✅ CRITICAL FIX: Call completeStreaming to clear pendingMessage and streamingRoundNumber
      // Without this, the chat input remains disabled because pendingMessage is never cleared
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
