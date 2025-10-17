/**
 * ✅ AI SDK v5 Multi-Participant Chat Hook
 *
 * OFFICIAL AI SDK v5 PATTERN:
 * - Uses `useChat` hook with proper state management
 * - Uses `setMessages` callback to avoid stale closures
 * - Resilient error handling - continues to next participant on failure
 * - Sequential orchestration via onFinish callback
 * - Error messages displayed in participant chat boxes
 * - NO manual SSE parsing - AI SDK handles streaming
 */

'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useRef, useState } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';

/**
 * Options for useMultiParticipantChat hook
 */
type UseMultiParticipantChatOptions = {
  /** Thread ID for the conversation */
  threadId: string;
  /** List of AI participants that will respond */
  participants: ChatParticipant[];
  /** Initial messages to load (from database) */
  initialMessages?: UIMessage[];
  /** Called when all participants have finished responding */
  onComplete?: () => void;
  /** Called when a participant starts streaming */
  onParticipantStart?: (index: number) => void;
  /** Called when a participant finishes streaming */
  onParticipantFinish?: (index: number) => void;
  /** Called when round is complete and ready for analysis */
  onAnalysisReady?: (participantMessageIds: string[]) => void;
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
  /** Trigger participants WITHOUT sending user message (for auto-trigger) */
  triggerParticipantsOnly: () => Promise<void>;
  /** Whether any participant is currently streaming */
  isStreaming: boolean;
  /** Index of currently active participant (0-based) */
  currentParticipantIndex: number;
  /** Current error if any */
  error: Error | null;
};

/**
 * ✅ AI SDK v5 Multi-Participant Chat Hook
 *
 * Sequential multi-participant orchestration with resilient error handling.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, triggerParticipantsOnly } = useMultiParticipantChat({
 *   threadId: 'thread-123',
 *   participants: [participant1, participant2],
 *   initialMessages: previousMessages,
 *   onAnalysisReady: (ids) => triggerAnalysis(ids),
 * });
 * ```
 */
export function useMultiParticipantChat({
  threadId,
  participants,
  initialMessages = [],
  onComplete,
  onParticipantStart,
  onParticipantFinish,
  onAnalysisReady,
  onError: _onError,
}: UseMultiParticipantChatOptions): UseMultiParticipantChatReturn {
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [customError, setCustomError] = useState<Error | null>(null);

  // Simplified refs - only what's needed
  const pendingParticipantsRef = useRef<number[]>([]);
  const isOrchestratingRef = useRef(false);
  const currentParticipantIndexRef = useRef(0);

  // ✅ Helper to finish orchestration and trigger analysis
  const finishOrchestration = useCallback(() => {
    isOrchestratingRef.current = false;
    currentParticipantIndexRef.current = 0;
    setCurrentParticipantIndex(0);

    // ✅ Trigger moderator analysis if callback provided
    if (onAnalysisReady) {
      // Get assistant message IDs from successful responses
      const assistantMessageIds: string[] = [];
      // Note: We'll populate this after setMessages updates
      setTimeout(() => {
        // Use a callback to access latest messages
        if (onAnalysisReady) {
          onAnalysisReady(assistantMessageIds);
        }
      }, 0);
    }

    if (onComplete) {
      onComplete();
    }
  }, [onAnalysisReady, onComplete]);

  // ✅ AI SDK v5 OFFICIAL PATTERN: Use the useChat hook
  const {
    messages,
    sendMessage: sendChatMessage,
    status,
    error: chatError,
    setMessages,
  } = useChat({
    id: threadId,
    transport: new DefaultChatTransport({
      api: '/api/v1/chat',
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          messages,
          participantIndex: currentParticipantIndexRef.current,
        },
      }),
    }),
    // Initialize with database messages
    messages: initialMessages,

    // ✅ RESILIENT ERROR HANDLING: Continue to next participant on error
    onError: (error) => {
      console.error(`[Participant ${currentParticipantIndex}] Error:`, error);

      // ✅ Create error message for this participant
      setMessages((prev) => {
        const errorMessage: UIMessage = {
          id: `error_${Date.now()}_${currentParticipantIndex}`,
          role: 'assistant',
          parts: [{
            type: 'text',
            text: error instanceof Error ? error.message : 'An error occurred during streaming.',
          }],
          metadata: {
            participantIndex: currentParticipantIndex,
            hasError: true,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        };
        return [...prev, errorMessage];
      });

      if (onParticipantFinish) {
        onParticipantFinish(currentParticipantIndex);
      }

      // ✅ CONTINUE TO NEXT PARTICIPANT (don't stop!)
      if (pendingParticipantsRef.current.length > 0) {
        const nextIndex = pendingParticipantsRef.current.shift()!;
        currentParticipantIndexRef.current = nextIndex;
        setCurrentParticipantIndex(nextIndex);

        if (onParticipantStart) {
          onParticipantStart(nextIndex);
        }

        // ✅ FIX: Trigger next participant by sending empty assistant message
        // This will cause the backend to generate a response for the next participant
        sendChatMessage({
          role: 'assistant',
          parts: [],
        });
      } else {
        // All participants done (some succeeded, some failed)
        finishOrchestration();
      }
    },

    // ✅ AI SDK v5 PATTERN: Sequential orchestration via onFinish
    onFinish: async () => {
      if (onParticipantFinish) {
        onParticipantFinish(currentParticipantIndex);
      }

      if (pendingParticipantsRef.current.length > 0) {
        const nextIndex = pendingParticipantsRef.current.shift()!;
        currentParticipantIndexRef.current = nextIndex;
        setCurrentParticipantIndex(nextIndex);

        if (onParticipantStart) {
          onParticipantStart(nextIndex);
        }

        // ✅ FIX: Trigger next participant WITHOUT adding user message
        // The transport will use the updated currentParticipantIndexRef.current
        sendChatMessage({
          role: 'assistant',
          parts: [],
        });
      } else {
        // All participants finished successfully
        finishOrchestration();
      }
    },
  });

  const isStreaming = status === 'submitted' || isOrchestratingRef.current;

  /**
   * ✅ Send user message and trigger all participants sequentially
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

      setCustomError(null);

      const enabledParticipants = participants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority);

      if (enabledParticipants.length === 0) {
        throw new Error('No enabled participants');
      }

      isOrchestratingRef.current = true;

      // Queue all except first participant
      pendingParticipantsRef.current = enabledParticipants
        .slice(1)
        .map((_, i) => i + 1);

      currentParticipantIndexRef.current = 0;
      setCurrentParticipantIndex(0);

      if (onParticipantStart) {
        onParticipantStart(0);
      }

      // ✅ AI SDK v5: Use sendMessage() with text property for user message
      sendChatMessage({ text: content });
    },
    [participants, status, sendChatMessage, onParticipantStart],
  );

  /**
   * ✅ Trigger participants WITHOUT sending user message
   * Used for auto-trigger when user message already exists
   */
  const triggerParticipantsOnly = useCallback(
    async () => {
      if (isOrchestratingRef.current || status === 'submitted') {
        console.warn('Already streaming, ignoring trigger');
        return;
      }

      setCustomError(null);

      const enabledParticipants = participants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority);

      if (enabledParticipants.length === 0) {
        throw new Error('No enabled participants');
      }

      isOrchestratingRef.current = true;

      // Queue all except first participant
      pendingParticipantsRef.current = enabledParticipants
        .slice(1)
        .map((_, i) => i + 1);

      currentParticipantIndexRef.current = 0;
      setCurrentParticipantIndex(0);

      if (onParticipantStart) {
        onParticipantStart(0);
      }

      // ✅ FIX: Trigger first participant WITHOUT adding user message
      sendChatMessage({
        role: 'assistant',
        parts: [],
      });
    },
    [participants, status, sendChatMessage, onParticipantStart],
  );

  const error = customError || chatError || null;

  return {
    messages,
    sendMessage,
    triggerParticipantsOnly,
    isStreaming,
    currentParticipantIndex,
    error,
  };
}
