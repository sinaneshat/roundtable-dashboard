/**
 * ✅ AI SDK v5 Multi-Participant Chat Hook (FIXED)
 *
 * This hook uses AI SDK's official `useChat` hook for proper streaming.
 * It handles multi-participant orchestration using CALLBACKS, not polling.
 *
 * OFFICIAL PATTERN: Based on AI SDK v5 documentation
 * - Uses `useChat` from '@ai-sdk/react'
 * - Uses `DefaultChatTransport` for HTTP transport
 * - Automatic SSE streaming (no manual parsing)
 * - Sequential orchestration via onFinish callback
 * - NO POLLING - event-driven only
 */

'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Participant } from '@/types/chat';

/**
 * Options for useMultiParticipantChat hook
 */
type UseMultiParticipantChatOptions = {
  /** Thread ID for the conversation */
  threadId: string;
  /** List of AI participants that will respond */
  participants: Participant[];
  /** Initial messages to load (from database) */
  initialMessages?: UIMessage[];
  /** Called when all participants have finished responding */
  onComplete?: () => void;
  /** Called when a participant starts streaming */
  onParticipantStart?: (index: number) => void;
  /** Called when a participant finishes streaming */
  onParticipantFinish?: (index: number) => void;
  /** Called on error */
  onError?: (error: Error) => void;
};

/**
 * Return type for useMultiParticipantChat hook
 */
type UseMultiParticipantChatReturn = {
  /** Current messages in the conversation */
  messages: UIMessage[];
  /** Send a user message and trigger all participants to respond */
  sendMessage: (content: string) => Promise<void>;
  /** Whether any participant is currently streaming */
  isStreaming: boolean;
  /** Index of currently active participant (0-based) */
  currentParticipantIndex: number;
  /** Current error if any */
  error: Error | null;
};

/**
 * ✅ AI SDK v5 Multi-Participant Chat Hook (FIXED)
 *
 * Uses AI SDK's `useChat` hook with proper callback-based orchestration.
 * NO POLLING - uses onFinish callback to trigger next participant.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isStreaming } = useMultiParticipantChat({
 *   threadId: 'thread-123',
 *   participants: [participant1, participant2],
 *   initialMessages: previousMessages,
 * });
 *
 * // Send a message - all participants will respond sequentially
 * await sendMessage('Hello!');
 * ```
 */
export function useMultiParticipantChat({
  threadId,
  participants,
  initialMessages = [],
  onComplete,
  onParticipantStart,
  onParticipantFinish,
  onError,
}: UseMultiParticipantChatOptions): UseMultiParticipantChatReturn {
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [customError, setCustomError] = useState<Error | null>(null);

  // Track pending participants to process
  const pendingParticipantsRef = useRef<number[]>([]);
  const isOrchestratingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // ✅ AI SDK v5 OFFICIAL PATTERN: Use the useChat hook
  const {
    messages,
    sendMessage: sendMessageToSingleParticipant,
    status,
    error: chatError,
    setMessages, // For initializing with DB messages
  } = useChat({
    id: threadId,
    transport: new DefaultChatTransport({
      api: '/api/v1/chat',
      // ✅ CRITICAL: Include participantIndex in request body
      prepareSendMessagesRequest: ({ id, messages }) => {
        return {
          body: {
            id,
            messages,
            participantIndex: currentParticipantIndex,
          },
        };
      },
    }),
    onError: (error) => {
      console.error('Chat error:', error);
      setCustomError(error);
      isOrchestratingRef.current = false;
      pendingParticipantsRef.current = [];
      if (onError) {
        onError(error);
      }
    },

    // ✅ CORRECT: Use onFinish callback for sequential orchestration
    onFinish: () => {
      // Called when a single participant finishes streaming
      if (onParticipantFinish) {
        onParticipantFinish(currentParticipantIndex);
      }

      // Check if there are more participants to process
      if (pendingParticipantsRef.current.length > 0) {
        // Get next participant index
        const nextIndex = pendingParticipantsRef.current.shift()!;
        setCurrentParticipantIndex(nextIndex);

        if (onParticipantStart) {
          onParticipantStart(nextIndex);
        }

        // ✅ CORRECT: Trigger next participant
        // Backend will use full message history from messages array
        sendMessageToSingleParticipant({
          role: 'user',
          parts: [{ type: 'text', text: '' }], // Empty message - backend uses history
        });
      } else {
        // All participants finished
        isOrchestratingRef.current = false;
        setCurrentParticipantIndex(0);
        if (onComplete) {
          onComplete();
        }
      }
    },
  });

  // ✅ Initialize messages from database on mount (only once)
  useEffect(() => {
    if (!hasInitializedRef.current && initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
      hasInitializedRef.current = true;
    }
  }, [initialMessages, messages.length, setMessages]); // Include deps but use ref to prevent re-runs

  const isStreaming = status === 'submitted' || isOrchestratingRef.current;

  /**
   * ✅ FIXED: Multi-Participant Orchestration (NO POLLING)
   *
   * Sends user message, then orchestrates participants via callbacks.
   * Each participant streams in real-time as it responds.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (isOrchestratingRef.current || status === 'submitted') {
        console.warn('Already streaming, ignoring new message');
        return;
      }

      if (!content.trim()) {
        return;
      }

      // Clear any previous errors
      setCustomError(null);

      // Get enabled participants in priority order
      const enabledParticipants = participants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority);

      if (enabledParticipants.length === 0) {
        throw new Error('No enabled participants');
      }

      // Start orchestration
      isOrchestratingRef.current = true;

      // Queue all participants except the first one
      // The first one will be triggered by sendMessageToSingleParticipant below
      // Subsequent ones will be triggered in onFinish callback
      pendingParticipantsRef.current = enabledParticipants
        .slice(1)
        .map((_, i) => i + 1);

      // Start with first participant (index 0)
      setCurrentParticipantIndex(0);

      if (onParticipantStart) {
        onParticipantStart(0);
      }

      // ✅ CORRECT: Send user message - triggers first participant
      // The onFinish callback will handle subsequent participants
      sendMessageToSingleParticipant({
        role: 'user',
        parts: [{ type: 'text', text: content }],
      });
    },
    [participants, status, sendMessageToSingleParticipant, onParticipantStart],
  );

  // Sync errors from useChat (handle undefined from AI SDK)
  const error = customError || chatError || null;

  return {
    messages,
    sendMessage,
    isStreaming,
    currentParticipantIndex,
    error,
  };
}
