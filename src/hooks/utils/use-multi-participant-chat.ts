/**
 * ✅ OFFICIAL AI SDK v5 PATTERN: Multi-Participant Chat Hook
 *
 * Wraps @ai-sdk/react useChat hook for sequential multi-participant streaming.
 * Following: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 *
 * This is the ONLY streaming hook - replaces all custom SSE parsing.
 */

'use client';

import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';

import { invalidationPatterns } from '@/lib/data/query-keys';
import { ParticipantConfigSchema } from '@/lib/schemas/chat-forms';

type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

type UseMultiParticipantChatOptions = {
  threadId: string;
  initialMessages: UIMessage[];
  selectedMode: string;
  selectedParticipants: ParticipantConfig[];
  onError?: (error: Error) => void;
  onParticipantsUpdate?: (participants: ParticipantConfig[]) => void;
};

export function useMultiParticipantChat(options: UseMultiParticipantChatOptions) {
  const {
    threadId,
    initialMessages,
    selectedMode,
    selectedParticipants,
    onError,
    onParticipantsUpdate,
  } = options;

  const queryClient = useQueryClient();
  const [isStreamingParticipants, setIsStreamingParticipants] = useState(false);
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ OFFICIAL AI SDK HOOK - Handles ALL streaming automatically
  const chat = useChat({
    id: threadId,
    messages: initialMessages,

    // ✅ AI SDK v5 PATTERN: Throttle UI updates for performance
    // Reference: AI SDK v5 Performance Optimization patterns
    // Reduces React re-renders during high-frequency streaming
    experimental_throttle: 50, // 50ms throttle

    // ✅ Custom transport configuration
    transport: new DefaultChatTransport({
      api: '/api/v1/chat',

      // ✅ OFFICIAL PATTERN: Send only last message for persistence
      // Following: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
      // Backend loads previous messages from database and appends the new message
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          message: messages[messages.length - 1], // Only send last message
          id: threadId, // Thread ID for loading conversation history
        },
      }),
    }),

    // ✅ Error handling - AI SDK provides error object
    onError: (err) => {
      onError?.(err);
      setIsStreamingParticipants(false);
      setCurrentParticipantIndex(null);
    },

    // ✅ Success callback - AI SDK provides complete messages
    onFinish: ({ message }) => {
      // ✅ Check if backend sent updated participants in metadata
      // Validate using Zod schema before using the data
      if (message.metadata && typeof message.metadata === 'object') {
        const MessageMetadataWithParticipantsSchema = z.object({
          participants: z.array(ParticipantConfigSchema),
        }).partial();

        const result = MessageMetadataWithParticipantsSchema.safeParse(message.metadata);
        if (result.success && result.data.participants) {
          onParticipantsUpdate?.(result.data.participants);
        }
      }

      // ✅ Invalidate cache after message completion
      invalidationPatterns.afterThreadMessage(threadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });

  /**
   * ✅ Sequential multi-participant streaming
   * Each participant streams one-by-one using the official AI SDK hook
   */
  const streamAllParticipants = useCallback(
    async (userMessage: string) => {
      if (isStreamingParticipants || chat.status !== 'ready') {
        return;
      }

      // Create abort controller for this session
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsStreamingParticipants(true);

      // Stream each participant sequentially
      for (let i = 0; i < selectedParticipants.length; i++) {
        if (abortController.signal.aborted) {
          break;
        }

        setCurrentParticipantIndex(i);

        // ✅ AI SDK handles everything: SSE parsing, state updates, metadata
        await chat.sendMessage(
          { text: i === 0 ? userMessage : '' }, // Only send text for first participant
          {
            body: {
              id: threadId,
              participantIndex: i,
            },
          },
        );
      }

      // Cleanup
      setIsStreamingParticipants(false);
      setCurrentParticipantIndex(null);
      abortControllerRef.current = null;
    },
    [isStreamingParticipants, chat, selectedParticipants, selectedMode, threadId],
  );

  /**
   * ✅ Stop all streaming
   */
  const stopAllStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    chat.stop();
    setIsStreamingParticipants(false);
    setCurrentParticipantIndex(null);
  }, [chat]);

  return {
    // ✅ AI SDK managed state (automatic)
    messages: chat.messages,
    status: chat.status,
    error: chat.error,

    // ✅ AI SDK actions (automatic)
    stop: stopAllStreaming,
    setMessages: chat.setMessages,

    // ✅ Multi-participant specific state
    isStreamingParticipants,
    currentParticipantIndex,

    // ✅ Multi-participant action
    streamAllParticipants,
  };
}
