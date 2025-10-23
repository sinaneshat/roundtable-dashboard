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
import { createErrorUIMessage, mergeParticipantMetadata } from '@/lib/utils/message-transforms';

type UseMultiParticipantChatOptions = {
  threadId: string;
  participants: ChatParticipant[];
  messages?: UIMessage[];
  onComplete?: () => void;
  onRoundComplete?: () => void;
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
};

/**
 * ✅ SIMPLIFIED Multi-Participant Chat Hook
 *
 * Key changes from previous version:
 * - Removed complex ref-based state tracking
 * - Round numbers set ONCE when user message is created
 * - Participant queue managed with simple state
 * - Message metadata updated in onFinish (not during streaming)
 */
export function useMultiParticipantChat({
  threadId,
  participants,
  messages: initialMessages = [],
  onComplete,
  onRoundComplete,
  onRetry,
  onError,
  mode,
  regenerateRoundNumber: regenerateRoundNumberParam,
}: UseMultiParticipantChatOptions): UseMultiParticipantChatReturn {
  // ============================================================================
  // STATE MANAGEMENT - Simplified
  // ============================================================================

  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingNextParticipant, setPendingNextParticipant] = useState(false);
  const [participantQueue, setParticipantQueue] = useState<number[]>([]);
  const [regenerateRoundNumber, setRegenerateRoundNumber] = useState<number | null>(
    regenerateRoundNumberParam || null,
  );

  // ✅ CRITICAL: Track current round number for this streaming session
  // Set ONCE when user sends message, used by all participants in the round
  const currentRoundNumberRef = useRef<number | null>(null);

  // ✅ Track which participants have already responded (prevent duplicate errors)
  const respondedParticipantsRef = useRef<Set<string>>(new Set());

  // ✅ Snapshot participants at round start to prevent stale metadata
  const roundParticipantsRef = useRef<ChatParticipant[]>([]);

  // ✅ Keep participants ref for transport callback
  const participantsRef = useRef<ChatParticipant[]>(participants);

  // ✅ CRITICAL FIX: Use ref for currentIndex to avoid transport recreation
  // The AI SDK's useChat doesn't react to transport changes after initialization
  // So we need the callback to always read the latest index from a ref
  const currentIndexRef = useRef<number>(currentIndex);

  // ============================================================================
  // PARTICIPANT QUEUE MANAGEMENT - Simplified
  // ============================================================================

  /**
   * Advance to next participant in queue, or complete round if queue is empty
   */
  const advanceToNextParticipant = useCallback(() => {
    setParticipantQueue((queue) => {
      const [nextIndex, ...remaining] = queue;

      if (nextIndex !== undefined) {
        setCurrentIndex(nextIndex);
        setPendingNextParticipant(true);
        return remaining;
      }

      // Queue empty - round complete
      setCurrentIndex(0);
      respondedParticipantsRef.current.clear();
      currentRoundNumberRef.current = null;
      onRoundComplete?.();
      onComplete?.();
      return [];
    });
  }, [onRoundComplete, onComplete]);

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
      ...(regenerateRoundNumber && { regenerateRound: regenerateRoundNumber }),
      ...(mode && { mode }),
    };

    return { body };
  }, [regenerateRoundNumber, mode]); // ✅ CRITICAL: Removed currentIndex from deps

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
      // ✅ CRITICAL FIX: Use currentIndexRef to get correct participant
      // Using currentIndex here would be stale due to closure
      const index = currentIndexRef.current;
      const participant = roundParticipantsRef.current[index];

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

      setPendingNextParticipant(false);

      // Create error message for this participant
      if (participant) {
        const errorKey = `${participant.id}-${index}`;

        if (!respondedParticipantsRef.current.has(errorKey)) {
          respondedParticipantsRef.current.add(errorKey);

          const errorUIMessage = createErrorUIMessage(
            participant,
            index,
            errorMessage,
            (errorMetadata?.errorCategory as UIMessageErrorType) || 'error',
            errorMetadata || undefined,
            currentRoundNumberRef.current || undefined,
          );

          setMessages(prev => [...prev, errorUIMessage]);
        }
      }

      // Advance to next participant or complete round
      advanceToNextParticipant();
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    },

    onFinish: async (data) => {
      // ✅ CRITICAL FIX: Use currentIndexRef to get correct participant
      // Using currentIndex here would be stale due to closure
      const index = currentIndexRef.current;
      const participant = roundParticipantsRef.current[index];

      // Validate message exists
      if (!data.message) {
        setPendingNextParticipant(false);

        if (participant) {
          const errorKey = `${participant.id}-${index}`;

          if (!respondedParticipantsRef.current.has(errorKey)) {
            respondedParticipantsRef.current.add(errorKey);

            const errorUIMessage = createErrorUIMessage(
              participant,
              index,
              'This model failed to generate a response. The AI SDK did not create a message object.',
              'silent_failure',
              { providerMessage: 'No response text available' },
              currentRoundNumberRef.current || undefined,
            );

            setMessages(prev => [...prev, errorUIMessage]);
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

        // ✅ Add round number to metadata (from ref set when user sent message)
        const metadataWithRoundNumber = {
          ...updatedMetadata,
          roundNumber: currentRoundNumberRef.current || 1,
        };

        setMessages((prev) => {
          const messageExists = prev.some((msg: UIMessage) => msg.id === data.message.id);

          if (!messageExists) {
            return [...prev, { ...data.message, metadata: metadataWithRoundNumber }];
          }

          return prev.map((msg: UIMessage) => {
            if (msg.id === data.message.id && msg.role === 'assistant') {
              return { ...msg, metadata: metadataWithRoundNumber };
            }
            return msg;
          });
        });

        // Mark participant as responded
        respondedParticipantsRef.current.add(`${participant.id}-${currentIndex}`);
      }

      // Clear regeneration flag after first participant
      if (currentIndex === 0 && regenerateRoundNumber !== null) {
        setRegenerateRoundNumber(null);
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
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (!pendingNextParticipant || status !== 'ready') {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPendingNextParticipant(false);

      // ✅ ALIGNMENT FIX: Include roundNumber in trigger message for subsequent participants
      // This ensures the context maintains round information throughout the streaming process
      // Trigger next participant with empty user message
      aiSendMessage({
        role: 'user',
        parts: [{ type: 'text', text: '' }],
        metadata: {
          roundNumber: currentRoundNumberRef.current || 1,
          isParticipantTrigger: true, // Mark as internal trigger message
        },
      });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [pendingNextParticipant, status, aiSendMessage, currentIndex, participants, participantQueue.length]);

  // ============================================================================
  // PUBLIC API - Send Message & Start Round
  // ============================================================================

  /**
   * Start participant round without sending user message
   * Used when messages already exist (e.g., after thread creation)
   */
  const startRound = useCallback(() => {
    if (status !== 'ready') {
      return;
    }

    // ✅ CRITICAL FIX: Deduplicate participants by ID before filtering
    // Backend may return duplicates, causing 3 distinct participants to appear as 6 messages
    const uniqueParticipants = Array.from(
      new Map(participants.map(p => [p.id, p])).values(),
    );

    const enabled = uniqueParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    if (enabled.length === 0) {
      return;
    }

    // Setup participant queue
    const queue = enabled.slice(1).map((_, i) => i + 1);
    setParticipantQueue(queue);
    setCurrentIndex(0);
    setPendingNextParticipant(false);
    respondedParticipantsRef.current.clear();
    // ✅ CRITICAL FIX: Store only enabled participants sorted by priority
    // This ensures currentIndex correctly maps to the right participant
    roundParticipantsRef.current = enabled;

    // Find last user message
    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      return;
    }

    // ✅ ALIGNMENT FIX: Extract roundNumber from last user message to maintain consistency
    const metadata = lastUserMessage.metadata as Record<string, unknown> | undefined;
    const roundNumber = (metadata?.roundNumber as number) || 1;

    // ✅ CRITICAL: Store round number in ref for subsequent participants
    currentRoundNumberRef.current = roundNumber;

    aiSendMessage({
      role: 'user',
      parts: [{ type: 'text', text: userText }],
      metadata: { roundNumber }, // ✅ Include roundNumber to maintain context
    });
  }, [participants, status, messages, aiSendMessage]);

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

      // ✅ CRITICAL FIX: Deduplicate participants by ID before filtering
      // Backend may return duplicates, causing 3 distinct participants to appear as 6 messages
      const uniqueParticipants = Array.from(
        new Map(participants.map(p => [p.id, p])).values(),
      );

      const enabled = uniqueParticipants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority);

      if (enabled.length === 0) {
        throw new Error('No enabled participants');
      }

      // Setup participant queue
      const queue = enabled.slice(1).map((_, i) => i + 1);
      setParticipantQueue(queue);
      setCurrentIndex(0);
      setPendingNextParticipant(false);
      respondedParticipantsRef.current.clear();
      // ✅ CRITICAL FIX: Store only enabled participants sorted by priority
      // This ensures currentIndex correctly maps to the right participant
      roundParticipantsRef.current = enabled;

      // ✅ CRITICAL: Calculate round number ONCE and store in ref
      const userMessages = messages.filter((m: UIMessage) => m.role === 'user');
      const newRoundNumber = userMessages.length + 1;
      currentRoundNumberRef.current = newRoundNumber;

      // Send user message with roundNumber metadata
      aiSendMessage({
        text: trimmed,
        metadata: { roundNumber: newRoundNumber },
      });
    },
    [participants, status, aiSendMessage, messages],
  );

  /**
   * Retry the last message (regenerate entire round)
   */
  const retry = useCallback(() => {
    if (status !== 'ready') {
      return;
    }

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    if (!textPart || !('text' in textPart)) {
      return;
    }

    const metadata = lastUserMessage.metadata as Record<string, unknown> | undefined;
    const roundNumber = (metadata?.roundNumber as number) || 1;

    // Notify parent that retry is happening
    if (onRetry) {
      onRetry(roundNumber);
    }

    // Set regenerate flag
    setRegenerateRoundNumber(roundNumber);

    // Remove entire round from UI
    const lastUserIndex = messages.findLastIndex(m => m.role === 'user');
    const messagesBeforeRound = messages.slice(0, lastUserIndex);
    setMessages(messagesBeforeRound);

    // Send fresh user message
    sendMessage(textPart.text);
  }, [messages, sendMessage, status, setMessages, onRetry]);

  // ============================================================================
  // STREAMING STATE - Derived from AI SDK
  // ============================================================================

  const isStreaming = status !== 'ready' || participantQueue.length > 0 || pendingNextParticipant;

  return {
    messages,
    sendMessage,
    startRound,
    isStreaming,
    currentParticipantIndex: currentIndex,
    error: chatError || null,
    retry,
    stop,
    setMessages,
  };
}
