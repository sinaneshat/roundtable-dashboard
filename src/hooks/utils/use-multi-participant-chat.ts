'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { chatParticipantSelectSchema } from '@/db/validation/chat';
import { ParticipantSettingsSchema } from '@/lib/config/participant-settings';
import type { UIMessageErrorType } from '@/lib/utils/message-transforms';
import { createErrorUIMessage, mergeParticipantMetadata } from '@/lib/utils/message-transforms';
import { deduplicateParticipants } from '@/lib/utils/participant-utils';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';

import { useParticipantErrorTracking } from './use-participant-error-tracking';

/**
 * Full ChatParticipant schema with settings
 * Matches the ChatParticipant type from the API routes
 */
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    settings: ParticipantSettingsSchema,
  });

/**
 * Zod schema for UseMultiParticipantChatOptions validation
 * Validates hook options at entry point to ensure type safety
 * Note: Callbacks are not validated to preserve their type signatures
 */
const UseMultiParticipantChatOptionsSchema = z.object({
  threadId: z.string(), // Allow empty string for initial state
  participants: z.array(ChatParticipantSchema).min(0, 'Participants must be an array'),
  messages: z.array(z.custom<UIMessage>()).optional(),
  mode: z.string().optional(),
  regenerateRoundNumber: z.number().int().positive().optional(),
}).passthrough(); // Allow callbacks to pass through without validation

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
  /** Reset all hook state (error tracking) */
  resetHookState: () => void;
};

/**
 * Multi-Participant Chat Hook - Simplified Orchestration for AI Conversations
 *
 * Coordinates multiple AI participants responding sequentially to user messages.
 * Simplified to trust backend for round tracking and participant management.
 *
 * The hook maintains minimal client state and delegates complex logic to the backend,
 * following the FLOW_DOCUMENTATION.md principle of backend authority.
 *
 * @example
 * const chat = useMultiParticipantChat({
 *   threadId: 'thread-123',
 *   participants: [
 *     { id: '1', modelId: 'gpt-4', isEnabled: true, priority: 0 },
 *     { id: '2', modelId: 'claude-3', isEnabled: true, priority: 1 },
 *   ],
 *   onComplete: () => console.log('Round complete!')
 * });
 *
 * await chat.sendMessage("What's the best way to learn React?");
 */
export function useMultiParticipantChat(
  options: UseMultiParticipantChatOptions,
): UseMultiParticipantChatReturn {
  // Validate critical options at hook entry point (excluding callbacks to preserve types)
  const validationResult = UseMultiParticipantChatOptionsSchema.safeParse(options);

  if (!validationResult.success) {
    console.error('[useMultiParticipantChat] Invalid options:', validationResult.error);
    throw new Error(`Invalid hook options: ${validationResult.error.message}`);
  }

  const {
    threadId,
    participants,
    messages: initialMessages = [],
    onComplete,
    onRetry,
    onError,
    mode,
    regenerateRoundNumber: regenerateRoundNumberParam,
  } = options;

  const errorTracking = useParticipantErrorTracking();

  // Track regenerate round number for backend communication
  const regenerateRoundNumberRef = useRef<number | null>(regenerateRoundNumberParam || null);

  // Simple round tracking state - backend is source of truth
  const [currentRound, setCurrentRound] = useState(1);

  // Simple participant state - index-based iteration
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [isParticipantPending, setIsParticipantPending] = useState(false);
  const [isExplicitlyStreaming, setIsExplicitlyStreaming] = useState(false);

  // Participant refs for round stability
  const participantsRef = useRef<ChatParticipant[]>(participants);
  const roundParticipantsRef = useRef<ChatParticipant[]>([]);
  const currentIndexRef = useRef<number>(currentParticipantIndex);

  /**
   * Advance to the next participant or complete the round
   * Uses simple index incrementing instead of complex queue management
   */
  const advanceToNextParticipant = useCallback(() => {
    setCurrentParticipantIndex((prevIndex) => {
      const nextIndex = prevIndex + 1;

      // Check if we've completed the round
      if (nextIndex >= roundParticipantsRef.current.length) {
        // Round complete - reset state and trigger callback
        setIsParticipantPending(false);
        setIsExplicitlyStreaming(false);
        errorTracking.reset();
        regenerateRoundNumberRef.current = null;

        setTimeout(() => {
          onComplete?.();
        }, 0);

        return 0; // Reset for next round
      }

      // More participants to process
      setIsParticipantPending(true);
      return nextIndex;
    });
  }, [errorTracking, onComplete]);

  /**
   * Prepare request body for AI SDK chat transport
   * Uses ref for current index to avoid transport recreation on every index change
   */
  const prepareSendMessagesRequest = useCallback(
    ({ id, messages }: { id: string; messages: unknown[] }) => {
      const body = {
        id,
        message: messages[messages.length - 1],
        participantIndex: currentIndexRef.current,
        participants: participantsRef.current,
        ...(regenerateRoundNumberRef.current && { regenerateRound: regenerateRoundNumberRef.current }),
        ...(mode && { mode }),
      };

      return { body };
    },
    [mode],
  );

  // Note: prepareSendMessagesRequest uses refs, but only inside the callback (not during render)
  // This is safe and follows React best practices for callback refs
  const transport = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
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
     * Handle participant errors - create error UI and continue to next participant
     */
    onError: (error) => {
      const participant = roundParticipantsRef.current[currentParticipantIndex];

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

      setIsParticipantPending(false);

      // Create error message UI only if not already responded
      if (participant) {
        const errorKey = `${participant.modelId}-${currentParticipantIndex}`;

        if (!errorTracking.hasResponded(errorKey)) {
          errorTracking.markAsResponded(errorKey);

          const errorUIMessage = createErrorUIMessage(
            participant,
            currentParticipantIndex,
            errorMessage,
            (errorMetadata?.errorCategory as UIMessageErrorType) || 'error',
            errorMetadata,
            currentRound,
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
     */
    onFinish: async (data) => {
      const participant = roundParticipantsRef.current[currentParticipantIndex];

      // Skip if this participant already responded (deduplication)
      if (participant) {
        const responseKey = `${participant.modelId}-${currentParticipantIndex}`;
        if (errorTracking.hasResponded(responseKey)) {
          setTimeout(() => advanceToNextParticipant(), 500);
          return;
        }
      }

      // Handle silent failure (no message object from AI SDK)
      if (!data.message) {
        setIsParticipantPending(false);

        if (participant) {
          const errorKey = `${participant.modelId}-${currentParticipantIndex}`;

          if (!errorTracking.hasResponded(errorKey)) {
            errorTracking.markAsResponded(errorKey);

            const errorUIMessage = createErrorUIMessage(
              participant,
              currentParticipantIndex,
              'This model failed to generate a response. The AI SDK did not create a message object.',
              'silent_failure',
              { providerMessage: 'No response text available' },
              currentRound,
            );

            setMessages(prev => [...prev, errorUIMessage]);
          }
        }

        setTimeout(() => advanceToNextParticipant(), 500);
        const error = new Error(`Participant ${currentParticipantIndex} failed: data.message is missing`);
        onError?.(error);
        return;
      }

      // Successful response - add to messages with participant metadata
      if (participant && data.message) {
        const updatedMetadata = mergeParticipantMetadata(
          data.message,
          participant,
          currentParticipantIndex,
        );

        // Prefer backend round number, fallback to current state
        const backendRoundNumber = (data.message.metadata as Record<string, unknown> | undefined)?.roundNumber as number | undefined;
        const finalRoundNumber = backendRoundNumber || currentRound;

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

        errorTracking.markAsResponded(`${participant.modelId}-${currentParticipantIndex}`);
      }

      setTimeout(() => advanceToNextParticipant(), 500);
    },
  });

  /**
   * Sync participants ref with latest participants
   */
  useLayoutEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  /**
   * Sync current index ref with state
   */
  useLayoutEffect(() => {
    currentIndexRef.current = currentParticipantIndex;
  }, [currentParticipantIndex]);

  /**
   * Automatic participant triggering
   * When pending, automatically trigger the next participant's response
   */
  useLayoutEffect(() => {
    if (!isParticipantPending || status !== 'ready') {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsParticipantPending(false);

      aiSendMessage({
        role: 'user',
        parts: [{ type: 'text', text: '' }],
        metadata: {
          roundNumber: currentRound,
          isParticipantTrigger: true,
        },
      });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [isParticipantPending, status, aiSendMessage, currentRound]);

  /**
   * Start a new round with existing participants
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
    setCurrentParticipantIndex(0);
    setIsParticipantPending(false);
    errorTracking.reset();
    roundParticipantsRef.current = enabled;

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
    setCurrentRound(roundNumber);

    aiSendMessage({
      role: 'user',
      parts: [{ type: 'text', text: '' }],
      metadata: {
        roundNumber,
        isParticipantTrigger: true,
      },
    });
  }, [participants, status, messages, aiSendMessage, errorTracking, isExplicitlyStreaming]);

  /**
   * Send a user message and start a new round
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
      setCurrentParticipantIndex(0);
      setIsParticipantPending(false);
      errorTracking.reset();
      roundParticipantsRef.current = enabled;

      // Use regenerate round number if retrying, otherwise calculate next
      const newRoundNumber = regenerateRoundNumberRef.current !== null
        ? regenerateRoundNumberRef.current
        : calculateNextRoundNumber(messages);

      setCurrentRound(newRoundNumber);

      aiSendMessage({
        text: trimmed,
        metadata: { roundNumber: newRoundNumber },
      });
    },
    [participants, status, aiSendMessage, messages, errorTracking, isExplicitlyStreaming],
  );

  /**
   * Retry the last round (regenerate responses)
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
   */
  const stopStreaming = useCallback(() => {
    stop();
    setIsExplicitlyStreaming(false);
    setIsParticipantPending(false);
    setCurrentParticipantIndex(0);
  }, [stop]);

  /**
   * Reset all hook state
   */
  const resetHookState = useCallback(() => {
    if (isExplicitlyStreaming || isParticipantPending) {
      // Only reset error tracking during active streaming
      errorTracking.reset();
      return;
    }

    setCurrentParticipantIndex(0);
    setIsParticipantPending(false);
    roundParticipantsRef.current = [];
    setCurrentRound(1);
    errorTracking.reset();
    regenerateRoundNumberRef.current = null;
    setIsExplicitlyStreaming(false);
  }, [errorTracking, isExplicitlyStreaming, isParticipantPending]);

  return {
    messages,
    sendMessage,
    startRound,
    isStreaming: isExplicitlyStreaming,
    currentParticipantIndex,
    error: chatError || null,
    retry,
    stop: stopStreaming,
    setMessages,
    resetHookState,
  };
}
