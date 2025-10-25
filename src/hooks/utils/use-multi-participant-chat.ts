'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { UIMessageErrorType } from '@/lib/utils/message-transforms';
import { createErrorUIMessage, mergeParticipantMetadata } from '@/lib/utils/message-transforms';
import { deduplicateParticipants } from '@/lib/utils/participant-utils';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';

import { useParticipantErrorTracking } from './use-participant-error-tracking';
import { useParticipantQueue } from './use-participant-queue';
import { useRoundTracking } from './use-round-tracking';

/**
 * Options for configuring the multi-participant chat hook
 */
type UseMultiParticipantChatOptions = {
  /** The current chat thread ID */
  threadId: string;
  /** All participants (enabled and disabled) */
  participants: ChatParticipant[];
  /** Initial messages for the chat (optional) */
  messages?: UIMessage[];
  /** Callback when a round completes (all enabled participants have responded) */
  onComplete?: () => void;
  /** Callback when user clicks retry (receives the round number being retried) */
  onRetry?: (roundNumber: number) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Chat mode (e.g., 'moderator', 'standard') */
  mode?: string;
  /** When set, indicates this is a round regeneration */
  regenerateRoundNumber?: number;
};

/**
 * Return value from the multi-participant chat hook
 */
type UseMultiParticipantChatReturn = {
  /** All messages in the conversation */
  messages: UIMessage[];
  /** Send a new user message and start a round */
  sendMessage: (content: string) => Promise<void>;
  /** Start a new round with the existing participants (used for manual round triggering) */
  startRound: () => void;
  /** Whether participants are currently streaming responses */
  isStreaming: boolean;
  /** The index of the currently active participant */
  currentParticipantIndex: number;
  /** Any error that occurred during the chat */
  error: Error | null;
  /** Retry the last round (regenerate responses) */
  retry: () => void;
  /** Stop the current streaming session */
  stop: () => void;
  /** Manually set messages (used for optimistic updates or message deletion) */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  /** Reset all hook state (queue, round tracking, error tracking) */
  resetHookState: () => void;
};

/**
 * Multi-Participant Chat Hook - Main Orchestration for AI Conversations
 *
 * Coordinates multiple AI participants responding sequentially to user messages.
 * Integrates AI SDK's `useChat` with three specialized orchestration hooks to manage
 * turn-taking, round tracking, and error handling.
 *
 * @example
 * ```typescript
 * const chat = useMultiParticipantChat({
 *   threadId: 'thread-123',
 *   participants: [
 *     { id: '1', modelId: 'gpt-4', isEnabled: true, priority: 0 },
 *     { id: '2', modelId: 'claude-3', isEnabled: true, priority: 1 },
 *     { id: '3', modelId: 'gemini-pro', isEnabled: false, priority: 2 }
 *   ],
 *   onComplete: () => console.log('Round complete!')
 * });
 *
 * // User sends a message
 * await chat.sendMessage("What's the best way to learn React?");
 *
 * // Internally:
 * // 1. User message added to UI
 * // 2. GPT-4 responds (priority 0)
 * // 3. Claude-3 responds (priority 1)
 * // 4. Round completes (Gemini skipped - not enabled)
 * // 5. onComplete() called
 *
 * // User clicks retry
 * chat.retry(); // Regenerates round with same participants
 * ```
 *
 * **Architecture**:
 * ```
 * useMultiParticipantChat (this hook)
 *   ├─> useParticipantQueue (turn management)
 *   ├─> useRoundTracking (round context + participant snapshot)
 *   ├─> useParticipantErrorTracking (response deduplication)
 *   └─> useChat from AI SDK (streaming + API integration)
 * ```
 *
 * **Execution Flow**:
 * 1. **User sends message**: `sendMessage("How do I build a React app?")`
 * 2. **Initialize round**:
 *    - Deduplicate and filter enabled participants
 *    - Snapshot participants (prevents mid-round changes)
 *    - Set round number in metadata
 *    - Initialize queue: [1, 2] for 3 participants
 * 3. **Participant loop**:
 *    - Participant 0 responds → advance queue
 *    - Participant 1 responds → advance queue
 *    - Participant 2 responds → queue empty, round complete
 * 4. **Round completion**: Trigger callbacks, reset tracking
 *
 * **Error Handling**:
 * - Errors don't stop the round - they create error messages and continue
 * - Duplicate errors are prevented via `useParticipantErrorTracking`
 * - Each participant gets one chance to respond (error or success)
 *
 * **Round Regeneration**:
 * When user clicks retry:
 * - Rewind messages to before the round
 * - Set `regenerateRoundNumber` to maintain round numbering
 * - Re-send the user message
 * - Backend uses `regenerateRound` flag to preserve round number
 *
 * **State Management**:
 * - Uses refs for values that don't trigger re-renders (participantsRef, currentIndexRef)
 * - Uses state for UI-affecting values (isExplicitlyStreaming)
 * - Callbacks wrapped in useCallback for dependency stability
 *
 * **Integration**: This is the main orchestration hook. It coordinates all participant
 * orchestration logic. See `/src/hooks/utils/README.md` for full architecture documentation.
 *
 * @param options - Configuration options for the multi-participant chat
 * @returns Chat state and control functions
 */
export function useMultiParticipantChat({
  threadId,
  participants,
  messages: initialMessages = [],
  onComplete,
  onRetry,
  onError,
  mode,
  regenerateRoundNumber: regenerateRoundNumberParam,
}: UseMultiParticipantChatOptions): UseMultiParticipantChatReturn {
  const participantQueue = useParticipantQueue({
    participantCount: participants.length,
    onComplete,
    regenerateRoundNumber: regenerateRoundNumberParam,
  });

  const roundTracking = useRoundTracking(threadId);
  const errorTracking = useParticipantErrorTracking();

  // Track regenerate round number for backend communication
  const regenerateRoundNumberRef = useRef<number | null>(regenerateRoundNumberParam || null);

  const [isExplicitlyStreaming, setIsExplicitlyStreaming] = useState(false);

  const participantsRef = useRef<ChatParticipant[]>(participants);
  const currentIndexRef = useRef<number>(participantQueue.currentIndex);
  const expectedParticipantIdsRef = useRef<string[]>([]);

  /**
   * Advance to the next participant and handle round completion
   *
   * Called after each participant finishes (success or error).
   * If this is the last participant, clears round state and triggers callbacks.
   */
  const advanceToNextParticipant = useCallback(() => {
    const willCompleteRound = participantQueue.queue.length === 0;

    if (willCompleteRound) {
      errorTracking.reset();
      regenerateRoundNumberRef.current = null;
      setIsExplicitlyStreaming(false);
    }

    participantQueue.advance();
  }, [participantQueue, errorTracking]);

  /**
   * Prepare request body for AI SDK chat transport
   *
   * This function is called by the AI SDK before each API request.
   * It augments the request with participant context and metadata.
   *
   * Note: Uses refs to access current values without triggering re-renders.
   */

  const prepareSendMessagesRequest = useCallback(
    ({ id, messages }: { id: string; messages: unknown[] }) => {
      const index = currentIndexRef.current;

      const body = {
        id,
        message: messages[messages.length - 1],
        participantIndex: index,
        participants: participantsRef.current,
        ...(regenerateRoundNumberRef.current && { regenerateRound: regenerateRoundNumberRef.current }),
        ...(mode && { mode }),
      };

      return { body };
    },
    [mode],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/v1/chat',
        prepareSendMessagesRequest,
      }),
    [prepareSendMessagesRequest],
  );

  const {
    messages,
    sendMessage: aiSendMessage,
    status,
    error: chatError,
    setMessages,
    stop,
  } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,

    /**
     * Handle participant errors
     *
     * When a participant encounters an error, create an error message and continue
     * to the next participant. Uses error tracking to prevent duplicate error messages.
     */
    onError: (error) => {
      const index = currentIndexRef.current;
      const participant = roundTracking.getRoundParticipants()[index];

      // Parse error metadata if present
      let errorMessage = error instanceof Error ? error.message : String(error);
      let errorMetadata: Record<string, unknown> | undefined;

      try {
        if (typeof errorMessage === 'string' && (errorMessage.startsWith('{') || errorMessage.includes('errorCategory'))) {
          errorMetadata = JSON.parse(errorMessage) as Record<string, unknown>;
          if (errorMetadata?.errorMessage) {
            errorMessage = errorMetadata.errorMessage as string;
          }
        }
      } catch {
        // Invalid JSON - use original error message
      }

      participantQueue.setPending(false);

      // Create error message UI only if not already responded
      if (participant) {
        const errorKey = `${participant.modelId}-${index}`;

        if (!errorTracking.hasResponded(errorKey)) {
          errorTracking.markAsResponded(errorKey);

          const errorUIMessage = createErrorUIMessage(
            participant,
            index,
            errorMessage,
            (errorMetadata?.errorCategory as UIMessageErrorType) || 'error',
            errorMetadata,
            roundTracking.getRoundNumber() || undefined,
          );

          setMessages(prev => [...prev, errorUIMessage]);
        }
      }

      // Continue to next participant after brief delay
      setTimeout(() => advanceToNextParticipant(), 500);
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    },

    /**
     * Handle successful participant response
     *
     * Called when a participant successfully generates a response.
     * Merges participant metadata, handles round numbers, and advances to next participant.
     */
    onFinish: async (data) => {
      const index = currentIndexRef.current;
      const participant = roundTracking.getRoundParticipants()[index];

      // Skip if this participant already responded (deduplication)
      if (participant) {
        const responseKey = `${participant.modelId}-${index}`;
        if (errorTracking.hasResponded(responseKey)) {
          setTimeout(() => advanceToNextParticipant(), 500);
          return;
        }
      }

      // Handle silent failure (no message object from AI SDK)
      if (!data.message) {
        participantQueue.setPending(false);

        if (participant) {
          const errorKey = `${participant.modelId}-${index}`;

          if (!errorTracking.hasResponded(errorKey)) {
            errorTracking.markAsResponded(errorKey);

            const errorUIMessage = createErrorUIMessage(
              participant,
              index,
              'This model failed to generate a response. The AI SDK did not create a message object.',
              'silent_failure',
              { providerMessage: 'No response text available' },
              roundTracking.getRoundNumber() || undefined,
            );

            setMessages(prev => [...prev, errorUIMessage]);
          }
        }

        setTimeout(() => advanceToNextParticipant(), 500);
        const error = new Error(`Participant ${index} failed: data.message is missing`);
        onError?.(error);
        return;
      }

      // Successful response - add to messages with participant metadata
      if (participant && data.message) {
        const updatedMetadata = mergeParticipantMetadata(
          data.message,
          participant,
          index,
        );

        // Determine round number (prefer backend, fallback to tracked, then current)
        const backendRoundNumber = (data.message.metadata as Record<string, unknown> | undefined)?.roundNumber as number | undefined;
        const trackedRoundNumber = roundTracking.getRoundNumber();
        const finalRoundNumber = backendRoundNumber || trackedRoundNumber || getCurrentRoundNumber(messages) || 1;

        const metadataWithRoundNumber = {
          ...updatedMetadata,
          roundNumber: finalRoundNumber,
        };

        // Add or update message in the list
        setMessages((prev) => {
          const completeMessage: UIMessage = {
            ...data.message,
            metadata: metadataWithRoundNumber,
          };

          const messageExists = prev.some((msg: UIMessage) => msg.id === data.message.id);

          if (!messageExists) {
            return [...prev, completeMessage];
          }

          // Update existing message (streaming completion)
          return prev.map((msg: UIMessage) => {
            if (msg.id === data.message.id) {
              return completeMessage;
            }
            return msg;
          });
        });

        errorTracking.markAsResponded(`${participant.modelId}-${index}`);
      }

      setTimeout(() => advanceToNextParticipant(), 500);
    },
  });

  /**
   * Sync participants ref with latest participants
   * Uses layoutEffect to ensure ref is updated before render
   */
  useLayoutEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  /**
   * Sync current index ref with queue state
   * Uses layoutEffect to ensure ref is updated before render
   */
  useLayoutEffect(() => {
    currentIndexRef.current = participantQueue.currentIndex;
  }, [participantQueue.currentIndex]);

  /**
   * Automatic participant triggering
   *
   * When a participant is pending and the chat is ready, automatically
   * trigger their response by sending an empty user message.
   *
   * This is the core loop that makes participants respond sequentially.
   */
  useEffect(() => {
    if (!participantQueue.pending || status !== 'ready') {
      return;
    }

    const timeoutId = setTimeout(() => {
      participantQueue.setPending(false);

      aiSendMessage({
        role: 'user',
        parts: [{ type: 'text', text: '' }],
        metadata: {
          roundNumber: roundTracking.getRoundNumber() || 1,
          isParticipantTrigger: true,
        },
      });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [participantQueue.pending, status, aiSendMessage, participantQueue, roundTracking]);

  /**
   * Start a new round with existing participants
   *
   * This is used for manual round triggering (e.g., clicking a "Start Round" button).
   * It uses the last user message as context for participant responses.
   *
   * @returns void - No-op if chat is not ready or already streaming
   */
  const startRound = useCallback(() => {
    if (status !== 'ready' || isExplicitlyStreaming) {
      return;
    }

    const uniqueParticipants = deduplicateParticipants(participants);
    const enabled = uniqueParticipants.filter(p => p.isEnabled);

    if (enabled.length === 0) {
      return;
    }

    setIsExplicitlyStreaming(true);
    roundTracking.reset();
    expectedParticipantIdsRef.current = enabled.map(p => p.id);

    participantQueue.initialize(enabled.length);
    participantQueue.setPending(false);
    errorTracking.reset();
    roundTracking.snapshotParticipants(enabled);

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      setIsExplicitlyStreaming(false);
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      setIsExplicitlyStreaming(false);
      return;
    }

    const roundNumber = getCurrentRoundNumber(messages);
    roundTracking.setRoundNumber(roundNumber);

    aiSendMessage({
      role: 'user',
      parts: [{ type: 'text', text: '' }],
      metadata: {
        roundNumber,
        isParticipantTrigger: true,
      },
    });
  }, [participants, status, messages, aiSendMessage, errorTracking, participantQueue, roundTracking, isExplicitlyStreaming]);

  /**
   * Send a user message and start a new round
   *
   * Initializes all orchestration hooks, snapshots participants, and triggers
   * the participant response sequence.
   *
   * @param content - The user's message text
   * @throws Error if no participants are enabled
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (status !== 'ready' || isExplicitlyStreaming) {
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const uniqueParticipants = deduplicateParticipants(participants);
      const enabled = uniqueParticipants.filter(p => p.isEnabled);

      if (enabled.length === 0) {
        throw new Error('No enabled participants');
      }

      setIsExplicitlyStreaming(true);
      roundTracking.reset();
      expectedParticipantIdsRef.current = enabled.map(p => p.id);

      participantQueue.initialize(enabled.length);
      participantQueue.setPending(false);
      errorTracking.reset();
      roundTracking.snapshotParticipants(enabled);

      // Use regenerate round number if retrying, otherwise calculate next
      const newRoundNumber = regenerateRoundNumberRef.current !== null
        ? regenerateRoundNumberRef.current
        : calculateNextRoundNumber(messages);

      roundTracking.setRoundNumber(newRoundNumber);

      aiSendMessage({
        text: trimmed,
        metadata: { roundNumber: newRoundNumber },
      });
    },
    [participants, status, aiSendMessage, messages, errorTracking, participantQueue, roundTracking, isExplicitlyStreaming],
  );

  /**
   * Retry the last round (regenerate responses)
   *
   * Finds the last user message with content, rewinds the messages to before that round,
   * and re-sends the message to regenerate all participant responses.
   *
   * The `regenerateRoundNumber` flag is set to preserve round numbering in the backend.
   */
  const retry = useCallback(() => {
    if (status !== 'ready') {
      return;
    }

    // Find the last substantive user message (not a participant trigger)
    const lastUserMessage = messages.findLast((m) => {
      if (m.role !== 'user') {
        return false;
      }

      const metadata = m.metadata as Record<string, unknown> | undefined;
      if (metadata?.isParticipantTrigger) {
        return false;
      }

      const textPart = m.parts?.find(p => p.type === 'text' && 'text' in p);
      const hasContent = textPart && 'text' in textPart && textPart.text.trim().length > 0;

      return hasContent;
    });

    if (!lastUserMessage) {
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    if (!textPart || !('text' in textPart) || !textPart.text.trim()) {
      return;
    }

    const roundNumber = getCurrentRoundNumber(messages);

    // Set regenerate flag to preserve round numbering
    regenerateRoundNumberRef.current = roundNumber;

    if (onRetry) {
      onRetry(roundNumber);
    }

    // Rewind messages to before this round
    const lastUserIndex = messages.findLastIndex(m => m.role === 'user');
    const messagesBeforeRound = messages.slice(0, lastUserIndex);
    setMessages(messagesBeforeRound);

    // Re-send the message
    setTimeout(() => {
      sendMessage(textPart.text);
    }, 0);
  }, [messages, sendMessage, status, setMessages, onRetry]);

  /**
   * Stop the current streaming session
   *
   * Immediately stops AI SDK streaming and resets all queue state.
   */
  const stopStreaming = useCallback(() => {
    stop();
    setIsExplicitlyStreaming(false);
    participantQueue.reset();
    participantQueue.setPending(false);
  }, [stop, participantQueue]);

  /**
   * Reset all hook state
   *
   * Clears queue, round tracking, error tracking, and regenerate flags.
   * If currently streaming, only clears error tracking (preserves in-flight state).
   */
  const resetHookState = useCallback(() => {
    const currentlyStreaming = isExplicitlyStreaming || participantQueue.pending;

    if (currentlyStreaming) {
      errorTracking.reset();
      return;
    }

    participantQueue.reset();
    participantQueue.setPending(false);
    roundTracking.reset();
    errorTracking.reset();
    regenerateRoundNumberRef.current = null;
    expectedParticipantIdsRef.current = [];
    setIsExplicitlyStreaming(false);
  }, [participantQueue, roundTracking, errorTracking, isExplicitlyStreaming]);

  return {
    messages,
    sendMessage,
    startRound,
    isStreaming: isExplicitlyStreaming,
    currentParticipantIndex: participantQueue.currentIndex,
    error: chatError || null,
    retry,
    stop: stopStreaming,
    setMessages,
    resetHookState,
  };
}
