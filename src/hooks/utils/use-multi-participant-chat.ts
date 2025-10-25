/**
 * ✅ AI SDK v5 Multi-Participant Chat Hook - SIMPLIFIED
 *
 * OFFICIAL AI SDK v5 CORE PATTERNS:
 * - useChat() hook from @ai-sdk/react (single hook instance per chat)
 * - DefaultChatTransport for API communication
 * - UIMessage[] format with consistent metadata structure
 * - Standard error handling via onError/onFinish callbacks
 *
 * KEY SIMPLIFICATIONS (Following AI SDK v5 Documentation):
 * 1. **Single Source of Truth**: AI SDK manages ALL message state
 * 2. **Consistent Round Numbers**: Set ONCE when user sends message, never recalculated
 * 3. **No Separate Streaming State**: Use AI SDK's built-in `status` and `messages`
 * 4. **Simplified Metadata**: Participant info attached during `onFinish`, not mid-stream
 *
 * REFERENCE: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 */

'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { UIMessageErrorType } from '@/lib/utils/message-transforms';
import { createErrorUIMessage, deduplicateMessages, mergeParticipantMetadata } from '@/lib/utils/message-transforms';
import { deduplicateParticipants } from '@/lib/utils/participant-utils';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';

import { useParticipantErrorTracking } from './use-participant-error-tracking';
import { useParticipantQueue } from './use-participant-queue';
import { useRoundTracking } from './use-round-tracking';

type UseMultiParticipantChatOptions = {
  threadId: string;
  participants: ChatParticipant[];
  messages?: UIMessage[];
  onComplete?: () => void; // ✅ SIMPLIFIED: Merged stream + round completion into single callback
  onRetry?: (roundNumber: number) => void;
  onError?: (error: Error) => void;
  mode?: string;
  regenerateRoundNumber?: number;
};

type UseMultiParticipantChatReturn = {
  messages: UIMessage[];
  sendMessage: (content: string) => Promise<void>;
  startRound: () => void;
  isStreaming: boolean;
  currentParticipantIndex: number;
  error: Error | null;
  retry: () => void;
  stop: () => void;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  resetHookState: () => void;
};

/**
 * ✅ SIMPLIFIED Multi-Participant Chat Hook
 *
 * Key changes from previous version:
 * - Removed complex ref-based state tracking
 * - Round numbers set ONCE when user message is created
 * - Participant queue managed with simple state
 * - Message metadata updated in onFinish (not during streaming)
 * - Merged onComplete + onRoundComplete into single callback
 */
export function useMultiParticipantChat({
  threadId,
  participants,
  messages: initialMessages = [],
  onComplete, // ✅ SIMPLIFIED: Single callback for stream + round completion
  onRetry,
  onError,
  mode,
  regenerateRoundNumber: regenerateRoundNumberParam,
}: UseMultiParticipantChatOptions): UseMultiParticipantChatReturn {
  // ============================================================================
  // STATE MANAGEMENT - Extracted to Specialized Hooks
  // ============================================================================

  // ✅ Participant queue management
  const participantQueue = useParticipantQueue({
    participantCount: participants.length,
    onComplete, // ✅ SIMPLIFIED: Single callback for round completion
    regenerateRoundNumber: regenerateRoundNumberParam,
  });

  // ✅ Round number and participant tracking (auto-resets when threadId changes)
  const roundTracking = useRoundTracking(threadId);

  // ✅ Error tracking to prevent duplicates
  const errorTracking = useParticipantErrorTracking();

  // ✅ Regeneration state
  const [regenerateRoundNumber, setRegenerateRoundNumber] = useState<number | null>(
    regenerateRoundNumberParam || null,
  );
  const regenerateRoundNumberRef = useRef<number | null>(regenerateRoundNumber);

  // ✅ CRITICAL FIX: Explicit streaming state flag to eliminate race conditions
  // This replaces the derived streaming state calculation which caused:
  // - Loader disappearing before all participants complete
  // - Analysis triggering at wrong time
  // - Premature false streaming states
  const [isExplicitlyStreaming, setIsExplicitlyStreaming] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    regenerateRoundNumberRef.current = regenerateRoundNumber;
  }, [regenerateRoundNumber]);

  // ✅ Keep participants ref for transport callback
  const participantsRef = useRef<ChatParticipant[]>(participants);

  // ✅ CRITICAL FIX: Use ref for currentIndex to avoid transport recreation
  // The AI SDK's useChat doesn't react to transport changes after initialization
  // So we need the callback to always read the latest index from a ref
  const currentIndexRef = useRef<number>(participantQueue.currentIndex);

  // ============================================================================
  // PARTICIPANT QUEUE MANAGEMENT - Delegated to Hook
  // ============================================================================

  /**
   * Advance to next participant in queue, or complete round if queue is empty
   *
   * Wrapped to handle additional cleanup when queue becomes empty
   */
  const advanceToNextParticipant = useCallback(() => {
    // Check if this is the last participant before advancing
    const willCompleteRound = participantQueue.isEmpty || participantQueue.queue.length === 0;

    // Advance queue (handles onRoundComplete/onComplete internally)
    participantQueue.advance();

    if (willCompleteRound) {
      // Round completing - reset tracking state
      errorTracking.reset();
      roundTracking.reset();

      // ✅ CRITICAL FIX: Clear regeneration flag AFTER all participants complete
      if (regenerateRoundNumberRef.current !== null) {
        setRegenerateRoundNumber(null);
        regenerateRoundNumberRef.current = null;
      }

      // ✅ CRITICAL: Set streaming to false ONLY after callbacks complete
      // This ensures analysis triggers BEFORE loader disappears
      setTimeout(() => {
        setIsExplicitlyStreaming(false);
      }, 0);
    }
  }, [participantQueue, errorTracking, roundTracking]);

  // ============================================================================
  // TRANSPORT CONFIGURATION - Send Only Last Message
  // ============================================================================

  /**
   * ✅ AI SDK V5 OFFICIAL PATTERN: Send only last message
   * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
   *
   * Valid pattern: participantsRef.current is accessed in callback (at request time), not during render.
   * This is necessary to get current participant state at request time.
   */
  /* eslint-disable react-hooks/refs */
  const prepareSendMessagesRequest = useCallback(({ id, messages }: { id: string; messages: unknown[] }) => {
    // ✅ CRITICAL FIX: Read index from ref to get latest value
    // This ensures each request gets the correct participant index
    const index = currentIndexRef.current;

    const body = {
      id,
      message: messages[messages.length - 1],
      participantIndex: index, // ✅ Use ref value instead of stale closure
      participants: participantsRef.current,
      ...(regenerateRoundNumberRef.current && { regenerateRound: regenerateRoundNumberRef.current }),
      ...(mode && { mode }),
    };

    return { body };
  }, [mode]); // ✅ CRITICAL: Using ref instead of state for regenerateRoundNumber

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/v1/chat',
      prepareSendMessagesRequest,
    }),
    [prepareSendMessagesRequest],
  );
  /* eslint-enable react-hooks/refs */

  // ============================================================================
  // AI SDK CHAT HOOK - Single Source of Truth
  // ============================================================================

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

    onError: (error) => {
      console.error('[useChat] onError fired', { error: error.message });

      // ✅ CRITICAL FIX: Use currentIndexRef to get correct participant
      // Using currentIndex here would be stale due to closure
      const index = currentIndexRef.current;
      const participant = roundTracking.getRoundParticipants()[index];

      // Parse error metadata from backend
      let errorMetadata: {
        errorCategory?: string;
        errorMessage?: string;
        rawErrorMessage?: string;
        statusCode?: number;
        errorType?: string;
        participantId?: string;
        modelId?: string;
        openRouterError?: string;
        openRouterCode?: string;
      } | null = null;

      let errorMessage = error instanceof Error ? error.message : String(error);

      try {
        if (typeof errorMessage === 'string' && (errorMessage.startsWith('{') || errorMessage.includes('errorCategory'))) {
          errorMetadata = JSON.parse(errorMessage);
          if (errorMetadata?.errorMessage) {
            errorMessage = errorMetadata.errorMessage;
          }
        }
      } catch {
        // Not JSON - use error message as is
      }

      participantQueue.setPending(false);

      // Create error message for this participant
      if (participant) {
        // ✅ FIX: Use modelId for tracking to prevent duplicate model responses
        const errorKey = `${participant.modelId}-${index}`;

        if (!errorTracking.hasResponded(errorKey)) {
          errorTracking.markAsResponded(errorKey);

          const errorUIMessage = createErrorUIMessage(
            participant,
            index,
            errorMessage,
            (errorMetadata?.errorCategory as UIMessageErrorType) || 'error',
            errorMetadata || undefined,
            roundTracking.getRoundNumber() || undefined,
          );

          // ✅ PHASE 1 DEDUPLICATION: Deduplicate messages after appending error
          // Ensures no duplicate message IDs in the array
          setMessages(prev => deduplicateMessages([...prev, errorUIMessage]));
        }
      }

      // ✅ CRITICAL: Check if this is the last participant
      // If queue is empty after this error, streaming will end
      const isLastParticipant = participantQueue.isEmpty;
      if (isLastParticipant) {
        // Streaming will end after advanceToNextParticipant
      }

      // Advance to next participant or complete round
      advanceToNextParticipant();
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    },

    onFinish: async (data) => {
      // ✅ CRITICAL FIX: Use currentIndexRef to get correct participant
      // Using currentIndex here would be stale due to closure
      const index = currentIndexRef.current;
      const participant = roundTracking.getRoundParticipants()[index];

      // ✅ FIX: Check if this model has already responded to prevent duplicates
      if (participant) {
        const responseKey = `${participant.modelId}-${index}`;
        if (errorTracking.hasResponded(responseKey)) {
          console.warn(`[useMultiParticipantChat] Duplicate response prevented for ${participant.modelId} at index ${index}`);
          advanceToNextParticipant();
          return;
        }
      }

      // Validate message exists
      if (!data.message) {
        participantQueue.setPending(false);

        if (participant) {
          // ✅ FIX: Use modelId for tracking to prevent duplicate model responses
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

            // ✅ PHASE 1 DEDUPLICATION: Deduplicate messages after appending error
            // Ensures no duplicate message IDs in the array
            setMessages(prev => deduplicateMessages([...prev, errorUIMessage]));
          }
        }

        advanceToNextParticipant();
        const error = new Error(`Participant ${index} failed: data.message is missing`);
        onError?.(error);
        return;
      }

      // ✅ SIMPLIFIED: Update message with participant metadata
      if (participant && data.message) {
        const updatedMetadata = mergeParticipantMetadata(
          data.message,
          participant,
          index, // ✅ Use ref value
        );

        // ✅ CRITICAL FIX: Preserve backend's roundNumber from message metadata
        // Backend sets roundNumber in both message.roundNumber column AND message.metadata.roundNumber
        // We should ONLY use frontend's roundTracking.getRoundNumber() as fallback if backend didn't set it
        const backendRoundNumber = (data.message.metadata as Record<string, unknown> | undefined)?.roundNumber as number | undefined;
        const metadataWithRoundNumber = {
          ...updatedMetadata,
          roundNumber: backendRoundNumber || roundTracking.getRoundNumber() || getCurrentRoundNumber(messages) || 1,
        };

        setMessages((prev) => {
          const messageExists = prev.some((msg: UIMessage) => msg.id === data.message.id);

          if (!messageExists) {
            // ✅ PHASE 1 DEDUPLICATION: Deduplicate after appending new message
            // Ensures no duplicate message IDs even if AI SDK creates duplicates
            return deduplicateMessages([...prev, { ...data.message, metadata: metadataWithRoundNumber }]);
          }

          // ✅ PHASE 1 DEDUPLICATION: Deduplicate after updating existing message
          // Defensive deduplication in case message array has duplicates
          return deduplicateMessages(
            prev.map((msg: UIMessage) => {
              if (msg.id === data.message.id && msg.role === 'assistant') {
                // ✅ CRITICAL FIX: Merge ALL fields from completed message to preserve parts, role, etc.
                // This ensures the final message contains all data from backend (parts, reasoning, etc.)
                return {
                  ...msg, // Base message (preserves any client-side fields)
                  ...data.message, // Merge in all fields from completed message (parts, role, etc.)
                  metadata: metadataWithRoundNumber, // Override with enriched metadata (participant info + roundNumber)
                };
              }
              return msg;
            }),
          );
        });

        // Mark participant as responded
        // ✅ FIX: Use modelId for tracking to prevent duplicate model responses
        errorTracking.markAsResponded(`${participant.modelId}-${index}`);
      }

      // Advance to next participant or complete round
      advanceToNextParticipant();
    },
  });

  // ============================================================================
  // AUTO-TRIGGER NEXT PARTICIPANT - When AI SDK Ready
  // ============================================================================

  useLayoutEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // ✅ CRITICAL FIX: Update currentIndexRef whenever currentIndex changes
  // This ensures prepareSendMessagesRequest always reads the latest index
  useLayoutEffect(() => {
    currentIndexRef.current = participantQueue.currentIndex;
  }, [participantQueue.currentIndex]);

  useEffect(() => {
    if (!participantQueue.pending || status !== 'ready') {
      return;
    }

    const timeoutId = setTimeout(() => {
      participantQueue.setPending(false);

      // ✅ ALIGNMENT FIX: Include roundNumber in trigger message for subsequent participants
      // This ensures the context maintains round information throughout the streaming process
      // Trigger next participant with empty user message
      aiSendMessage({
        role: 'user',
        parts: [{ type: 'text', text: '' }],
        metadata: {
          roundNumber: roundTracking.getRoundNumber() || 1,
          isParticipantTrigger: true, // Mark as internal trigger message
        },
      });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [participantQueue.pending, status, aiSendMessage, participantQueue.currentIndex, participants, participantQueue.isEmpty, participantQueue, roundTracking]);

  // ============================================================================
  // PUBLIC API - Send Message & Start Round
  // ============================================================================

  /**
   * Start participant round without sending user message
   * Used when messages already exist (e.g., after thread creation)
   *
   * ✅ CRITICAL FIX: Don't create new user message - just trigger first participant
   * The user message already exists in the messages array (created by backend)
   * We only need to trigger AI responses, not duplicate the user message
   */
  const startRound = useCallback(() => {
    if (status !== 'ready') {
      return;
    }

    // ✅ Use canonical deduplication function
    // Backend may return duplicates or participant changes may create new IDs for same model
    const uniqueParticipants = deduplicateParticipants(participants);

    // Debug logging for duplicate detection
    if (participants.length > uniqueParticipants.length) {
      console.warn(`[useMultiParticipantChat] Duplicate participants detected in startRound:`, {
        original: participants.length,
        deduplicated: uniqueParticipants.length,
        removed: participants.length - uniqueParticipants.length,
      });
    }

    const enabled = uniqueParticipants.filter(p => p.isEnabled);

    if (enabled.length === 0) {
      return;
    }

    // ✅ CRITICAL: Set streaming to true when starting round
    setIsExplicitlyStreaming(true);

    // Setup participant queue using the queue hook
    participantQueue.initialize(enabled.length);
    participantQueue.setPending(false);
    errorTracking.reset();
    // ✅ CRITICAL FIX: Store only enabled participants sorted by priority
    // This ensures currentIndex correctly maps to the right participant
    roundTracking.snapshotParticipants(enabled);

    // Find last user message to validate it exists and get round number
    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      console.error('[useMultiParticipantChat] startRound aborted: no user message found', {
        messagesCount: messages.length,
        messages: messages.map(m => ({ role: m.role, id: m.id })),
      });
      setIsExplicitlyStreaming(false);
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      console.error('[useMultiParticipantChat] startRound aborted: empty user message text', {
        lastUserMessage,
      });
      setIsExplicitlyStreaming(false);
      return;
    }

    const roundNumber = getCurrentRoundNumber(messages);

    // ✅ CRITICAL: Store round number in tracking hook for subsequent participants
    roundTracking.setRoundNumber(roundNumber);

    // ✅ CRITICAL FIX: Use empty trigger message to start participant responses
    // Don't include user text - that would create a duplicate user message!
    // The empty message with isParticipantTrigger flag tells the backend to start AI responses
    aiSendMessage({
      role: 'user',
      parts: [{ type: 'text', text: '' }],
      metadata: {
        roundNumber,
        isParticipantTrigger: true, // ✅ Mark as trigger to distinguish from real user messages
      },
    });
  }, [participants, status, messages, aiSendMessage, errorTracking, participantQueue, roundTracking]);

  /**
   * Send user message and trigger participant responses
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (status !== 'ready') {
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      // ✅ Use canonical deduplication function
      // When participants change mid-conversation, they may get new IDs but same modelId
      const uniqueParticipants = deduplicateParticipants(participants);

      // Debug logging for duplicate detection
      if (participants.length > uniqueParticipants.length) {
        console.warn(`[useMultiParticipantChat] Duplicate participants detected and removed:`, {
          original: participants.length,
          deduplicated: uniqueParticipants.length,
          removed: participants.length - uniqueParticipants.length,
        });
      }

      const enabled = uniqueParticipants.filter(p => p.isEnabled);

      if (enabled.length === 0) {
        throw new Error('No enabled participants');
      }

      // ✅ CRITICAL: Set streaming to true when sending message
      setIsExplicitlyStreaming(true);

      participantQueue.initialize(enabled.length);
      participantQueue.setPending(false);
      errorTracking.reset();
      roundTracking.snapshotParticipants(enabled);

      // ✅ SINGLE SOURCE OF TRUTH: Use regenerateRoundNumber if set, otherwise calculate next round
      // During regeneration, round number is pre-set to maintain consistency
      // Use ref to ensure we get the current value
      const newRoundNumber = regenerateRoundNumberRef.current !== null
        ? regenerateRoundNumberRef.current
        : calculateNextRoundNumber(messages); // ✅ Use utility instead of inline calculation

      // ✅ CRITICAL FIX: Set round number BEFORE sending message
      // This ensures roundTracking.getRoundNumber() returns correct value during streaming
      roundTracking.setRoundNumber(newRoundNumber);

      aiSendMessage({
        text: trimmed,
        metadata: { roundNumber: newRoundNumber },
      });
    },
    [participants, status, aiSendMessage, messages, errorTracking, participantQueue, roundTracking],
  );

  /**
   * Retry the last message (regenerate entire round)
   */
  const retry = useCallback(() => {
    if (status !== 'ready') {
      return;
    }

    // ✅ FIX: Skip participant trigger messages and find the actual user message with content
    // Participant triggers have isParticipantTrigger: true in metadata and empty text
    const lastUserMessage = messages.findLast((m) => {
      if (m.role !== 'user') {
        return false;
      }

      // Skip participant trigger messages
      const metadata = m.metadata as Record<string, unknown> | undefined;
      if (metadata?.isParticipantTrigger) {
        return false;
      }

      // Check if message has actual text content
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

    // ✅ CRITICAL: Capture round number BEFORE any state changes
    // This ensures we preserve the correct round number for regeneration
    const roundNumber = getCurrentRoundNumber(messages);

    // ✅ CRITICAL: Set regenerate flag IMMEDIATELY in ref FIRST
    // The ref is used by sendMessage and transport, ensuring consistent round number
    // Setting ref BEFORE onRetry and message removal prevents race conditions
    regenerateRoundNumberRef.current = roundNumber;
    setRegenerateRoundNumber(roundNumber); // Update state for tracking

    // Notify parent that retry is happening (removes analysis)
    // This happens AFTER we capture and set the round number
    if (onRetry) {
      onRetry(roundNumber);
    }

    // Remove entire round from UI (all messages from last user message onward)
    const lastUserIndex = messages.findLastIndex(m => m.role === 'user');
    const messagesBeforeRound = messages.slice(0, lastUserIndex);
    // ✅ PHASE 1 DEDUPLICATION: Defensive deduplication when removing messages
    // Ensures message array is clean before regeneration
    setMessages(deduplicateMessages(messagesBeforeRound));

    // ✅ FIX: sendMessage will use regenerateRoundNumber instead of calculating
    // This ensures the regenerated round has the same round number as the removed round
    setTimeout(() => {
      sendMessage(textPart.text);
    }, 0);
  }, [messages, sendMessage, status, setMessages, onRetry]);

  // ============================================================================
  // STREAMING STATE - Explicit Flag (Replaces Derived State)
  // ============================================================================

  // ✅ CRITICAL: Use explicit flag instead of derived state
  // Derived state (status !== 'ready' || participantQueue.length > 0 || pendingNextParticipant)
  // caused race conditions where loader disappeared before all participants completed

  /**
   * Wrapper for stop that also sets streaming to false
   */
  const stopStreaming = useCallback(() => {
    stop();
    setIsExplicitlyStreaming(false);
    participantQueue.reset();
    participantQueue.setPending(false);
  }, [stop, participantQueue]);

  /**
   * Reset all internal hook state
   * Used by ChatContext during initializeThread to ensure clean state
   */
  const resetHookState = useCallback(() => {
    // Reset participant queue
    participantQueue.reset();
    participantQueue.setPending(false);

    // Reset round tracking
    roundTracking.reset();

    // Reset error tracking
    errorTracking.reset();

    // Reset regeneration state
    setRegenerateRoundNumber(null);
    regenerateRoundNumberRef.current = null;

    // Reset streaming flag
    setIsExplicitlyStreaming(false);
  }, [participantQueue, roundTracking, errorTracking]);

  return {
    messages,
    sendMessage,
    startRound,
    isStreaming: isExplicitlyStreaming, // ✅ Export explicit flag instead of derived state
    currentParticipantIndex: participantQueue.currentIndex,
    error: chatError || null,
    retry,
    stop: stopStreaming, // ✅ Use wrapper that also sets flag to false
    setMessages,
    resetHookState,
  };
}
