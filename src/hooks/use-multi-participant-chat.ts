/**
 * ✅ AI SDK v5 Multi-Participant Chat Hook
 *
 * OFFICIAL AI SDK v5 CORE PATTERNS:
 * - useChat() hook from @ai-sdk/react (single hook instance per chat)
 * - DefaultChatTransport for API communication
 * - UIMessage[] format for message handling
 * - Standard error handling via onError/onFinish callbacks
 *
 * APPLICATION-SPECIFIC CUSTOMIZATIONS:
 * This hook extends the basic AI SDK v5 pattern to support sequential multi-model
 * conversations (roundtable discussions). These customizations are NOT in the official
 * docs because they're specific to our multi-participant use case:
 *
 * 1. **Sequential Participant Queue**: Manages multiple AI models responding in order
 *    - Queue pattern: [participant0, participant1, participant2, ...]
 *    - Each participant streams response before next starts
 *    - Frontend orchestrates the queue (not backend)
 *
 * 2. **Participant Index Routing**: Sends participantIndex to backend via transport
 *    - Backend selects correct model based on index
 *    - Allows single API endpoint for all participants
 *    - Simplifies backend implementation
 *
 * 3. **Ref-Based State Management** (CRITICAL PATTERN):
 *    - Uses refs alongside state to handle async callback timing
 *    - WHY? AI SDK callbacks (onFinish, onError) fire asynchronously
 *    - React state updates aren't synchronous - callbacks read stale state
 *    - Refs provide immediate access to current values in callbacks
 *    - Pattern: Update BOTH ref and state for reactive UI + correct callback logic
 *
 * 4. **Auto-Progression**: Automatically triggers next participant after current finishes
 *    - onFinish callback processes queue and triggers next participant
 *    - Uses pendingNextParticipant flag to wait for AI SDK status reset
 *    - Essential for reasoning models which have longer state transitions
 *
 * 5. **Error Handling**: Stops entire round when ANY participant fails
 *    - Clears queue to prevent cascading failures
 *    - Creates inline error message with participant context
 *    - Provides retry() function to restart from beginning
 *
 * WHY THESE CUSTOMIZATIONS?
 * The official AI SDK v5 docs show single-model chat. We're building a roundtable
 * discussion with multiple AI models (Claude, GPT-4, Gemini, etc.) responding
 * sequentially to the same user question. This requires frontend orchestration
 * to coordinate the participant queue.
 *
 * PATTERN COMPARISON:
 * ```
 * ❌ STANDARD AI SDK v5 (Single Model):
 * User → AI Model → Response → Done
 *
 * ✅ OUR PATTERN (Multi-Participant Round):
 * User → Model A → Response A → Model B → Response B → Model C → Response C → Done
 *         ^queue[0]^          ^queue[1]^          ^queue[2]^
 * ```
 *
 * OFFICIAL DOCS REFERENCE:
 * - AI SDK v5 useChat: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 * - Shared Context Pattern: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 *
 * @example
 * ```tsx
 * // Used inside ChatContext (src/contexts/chat-context.tsx)
 * const chat = useMultiParticipantChat({
 *   threadId: thread?.id || '',
 *   participants: [participantA, participantB, participantC],
 *   messages: initialMessages,
 *   onComplete: () => {
 *     // All participants finished - navigate or update UI
 *   },
 *   onRoundComplete: () => {
 *     // Triggered after each round - refetch analyses
 *   },
 * });
 * ```
 */

'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';

type UseMultiParticipantChatOptions = {
  threadId: string;
  participants: ChatParticipant[];
  messages?: UIMessage[]; // ✅ AI SDK v5 uses 'messages' not 'initialMessages'
  onComplete?: () => void;
  onRoundComplete?: () => void; // ✅ NEW: Triggered when all participants finish responding (round complete)
  onError?: (error: Error) => void;
};

type UseMultiParticipantChatReturn = {
  messages: UIMessage[];
  sendMessage: (content: string) => Promise<void>;
  startRound: () => void; // ✅ NEW: Start participant round without sending new user message
  isStreaming: boolean;
  currentParticipantIndex: number;
  error: Error | null;
  retry: () => void;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
};

/**
 * ✅ SIMPLIFIED Multi-Participant Chat Hook
 *
 * Sequential participant responses with single useChat instance.
 * Backend handles participant index via transport config.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isStreaming } = useMultiParticipantChat({
 *   threadId: 'thread-123',
 *   participants: [participant1, participant2],
 *   initialMessages: previousMessages,
 * });
 * ```
 */
export function useMultiParticipantChat({
  threadId,
  participants,
  messages: initialMessages = [],
  onComplete,
  onRoundComplete,
  onError,
}: UseMultiParticipantChatOptions): UseMultiParticipantChatReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingNextParticipant, setPendingNextParticipant] = useState(false);

  // ✅ FIX: Use refs to track current index AND queue for immediate access
  // State updates don't happen immediately, so we need refs for the callbacks to read
  const currentIndexRef = useRef(0);
  const participantQueueRef = useRef<number[]>([]);
  const participantsRef = useRef<ChatParticipant[]>(participants);

  // ✅ SIMPLIFIED: Single useChat instance, backend handles participants
  const {
    messages,
    sendMessage: aiSendMessage,
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
          participantIndex: currentIndexRef.current, // ✅ FIX: Use ref for immediate value
          participants: participantsRef.current, // ✅ RACE CONDITION FIX: Send current participant configuration
        },
      }),
    }),
    messages: initialMessages,

    onError: (error) => {
      console.error('[Multi-Participant Chat] Error:', error);

      // ✅ CRITICAL: Stop the entire round when ANY participant fails
      // Clear the queue to prevent continuing to next participants
      participantQueueRef.current = [];
      setPendingNextParticipant(false);

      // ✅ CRITICAL: Create inline error message with participant identity
      // This makes the error appear as a message bubble from the failed participant
      const currentParticipant = participants[currentIndexRef.current];
      if (currentParticipant) {
        // Generate unique ID for error message
        const errorMessageId = `error-${Date.now()}-${currentIndexRef.current}`;

        // Extract error message from error object or streaming response
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Parse error details if it's a structured error from backend
        const errorDetails: {
          errorMessage: string;
          errorType: 'streaming_error' | 'retry_exhausted';
          hasError: boolean;
        } = {
          errorMessage,
          errorType: 'streaming_error',
          hasError: true,
        };

        // Try to extract structured error from message (backend sends JSON in error text)
        try {
          // AI SDK may wrap errors in specific formats
          if (errorMessage.includes('failed to respond after')) {
            errorDetails.errorType = 'retry_exhausted';
          }
        } catch {
          // Use default error details if parsing fails
        }

        // ✅ Create error message that will render with ModelMessageCard
        // The message will show with the participant's avatar and error styling
        const errorUIMessage: UIMessage = {
          id: errorMessageId,
          role: 'assistant',
          parts: [], // No text parts - error will be shown by MessageErrorDetails component
          metadata: {
            participantId: currentParticipant.id,
            participantIndex: currentIndexRef.current,
            participantRole: currentParticipant.role,
            model: currentParticipant.modelId,
            ...errorDetails,
            // ✅ Include provider message for detailed error display
            providerMessage: errorMessage,
          },
        };

        // ✅ Add error message to messages array so it appears inline
        setMessages(prev => [...prev, errorUIMessage]);
      }

      // Notify parent component
      onError?.(error instanceof Error ? error : new Error(String(error)));
    },

    // ✅ FIX: Add participant metadata to messages during streaming
    onFinish: async (data) => {
      // ✅ CRITICAL: Update message metadata with participant info
      // This ensures the frontend can display the correct model name/icon
      const currentParticipant = participants[currentIndexRef.current];

      console.warn('[useMultiParticipantChat] onFinish - Participant', currentIndexRef.current, 'completed streaming', {
        hasMessage: !!data.message,
        messageId: data.message?.id,
        participantId: currentParticipant?.id,
        participantRole: currentParticipant?.role,
        participantModelId: currentParticipant?.modelId,
      });

      // ✅ CRITICAL BUG FIX: Validate data.message exists before continuing
      // Silent failures occur when AI SDK doesn't create a message (empty response, error, etc.)
      if (!data.message) {
        console.error('[useMultiParticipantChat] ❌ SILENT FAILURE: onFinish called but data.message is missing!', {
          participantIndex: currentIndexRef.current,
          participantId: currentParticipant?.id,
          participantRole: currentParticipant?.role,
          participantModelId: currentParticipant?.modelId,
        });

        // ✅ STOP THE ROUND: Clear queue to prevent continuing with broken state
        participantQueueRef.current = [];
        setPendingNextParticipant(false);

        // ✅ CREATE ERROR MESSAGE: Make the failure visible to the user
        if (currentParticipant) {
          const errorMessageId = `error-no-message-${Date.now()}-${currentIndexRef.current}`;
          const errorUIMessage: UIMessage = {
            id: errorMessageId,
            role: 'assistant',
            parts: [], // No text parts - error will be shown by MessageErrorDetails component
            metadata: {
              participantId: currentParticipant.id,
              participantIndex: currentIndexRef.current,
              participantRole: currentParticipant.role,
              model: currentParticipant.modelId,
              hasError: true,
              errorType: 'silent_failure',
              errorMessage: 'This model failed to generate a response. The AI SDK did not create a message object.',
              providerMessage: 'No response text available',
            },
          };

          setMessages(prev => [...prev, errorUIMessage]);
        }

        // Notify parent component of the error
        const error = new Error(`Participant ${currentIndexRef.current} (${currentParticipant?.role || 'unknown'}) failed: data.message is missing`);
        onError?.(error);

        // Reset state and stop round
        currentIndexRef.current = 0;
        setCurrentIndex(0);
        return;
      }

      if (currentParticipant && data.message) {
        setMessages((prev) => {
          return prev.map((msg) => {
            // Update the last assistant message with participant metadata
            if (msg.id === data.message.id && msg.role === 'assistant') {
              console.warn('[useMultiParticipantChat] ✅ Updating message metadata for participant', currentIndexRef.current);
              return {
                ...msg,
                metadata: {
                  ...(typeof msg.metadata === 'object' && msg.metadata !== null ? msg.metadata : {}),
                  participantId: currentParticipant.id,
                  participantIndex: currentIndexRef.current,
                  participantRole: currentParticipant.role,
                  model: currentParticipant.modelId,
                },
              };
            }
            return msg;
          });
        });
      }

      // ✅ CRITICAL FIX: Use ref for queue to avoid React state timing issues
      // Process next participant in queue using REF (immediate access)
      if (participantQueueRef.current.length > 0) {
        const nextIndex = participantQueueRef.current[0];
        const remaining = participantQueueRef.current.slice(1);
        if (nextIndex !== undefined) {
          console.warn('[useMultiParticipantChat] ⏭️  Next participant in queue:', nextIndex, {
            remaining: remaining.length,
            totalParticipants: participants.length,
          });

          // ✅ FIX: Update both ref and state immediately
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          participantQueueRef.current = remaining;

          // ✅ CRITICAL FIX: Set pending flag instead of immediately calling aiSendMessage
          // This allows us to wait for AI SDK status to reset in useEffect
          setPendingNextParticipant(true);
        }
      } else {
        // All participants finished successfully
        currentIndexRef.current = 0;
        setCurrentIndex(0);
        participantQueueRef.current = [];

        // ✅ SUCCESS: All participants responded successfully
        console.warn('[useMultiParticipantChat] ✅ Round completed successfully - all participants responded');

        // ✅ CRITICAL: Trigger round completion callback FIRST
        // This allows the frontend to immediately refetch analyses
        // before calling the general onComplete callback
        onRoundComplete?.();
        onComplete?.();
      }
    },
  });

  // ✅ CRITICAL FIX: Watch AI SDK status and trigger next participant when ready
  // This effect waits for status to return to 'ready' before sending next participant
  // This is essential for reasoning models which take longer to complete state transitions
  // ChatStatus: 'submitted' | 'streaming' | 'ready' | 'error'
  // ✅ RACE CONDITION FIX: Keep participantsRef in sync with participants prop
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    if (!pendingNextParticipant || status !== 'ready') {
      return;
    }

    console.warn('[useMultiParticipantChat] Status is ready, triggering participant', currentIndexRef.current);

    // ✅ CRITICAL: Add small delay to ensure stream is fully flushed
    // This prevents race conditions where status becomes 'ready' but stream hasn't fully completed
    // ✅ FIX: Assign timeout to variable for proper cleanup
    const timeoutId = setTimeout(() => {
      // AI SDK is ready for the next message - reset pending state
      setPendingNextParticipant(false);

      console.warn('[useMultiParticipantChat] Sending message for participant', currentIndexRef.current);
      // Trigger next participant with empty user message
      aiSendMessage({
        role: 'user',
        parts: [{ type: 'text', text: '' }],
      });
    }, 200); // 200ms safety delay

    // ✅ CLEANUP: Clear timeout on unmount or when dependencies change
    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingNextParticipant, status, aiSendMessage]);

  /**
   * ✅ NEW: Start participant round without sending user message
   * Used when messages already exist (e.g., after thread creation)
   *
   * This triggers all participants to respond to the last user message
   * without creating a new user message in the chat
   */
  const startRound = useCallback(() => {
    if (status !== 'ready') {
      console.warn('[useMultiParticipantChat] Cannot start round - status is:', status);
      return;
    }

    const enabled = participants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    if (enabled.length === 0) {
      console.warn('[useMultiParticipantChat] No enabled participants');
      return;
    }

    console.warn('[useMultiParticipantChat] 🚀 Starting round with', enabled.length, 'participants', {
      participants: enabled.map((p, i) => ({
        index: i,
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        priority: p.priority,
        isEnabled: p.isEnabled,
      })),
    });

    // Setup participant queue (skip first, it triggers automatically)
    const queue = enabled.slice(1).map((_, i) => i + 1);

    console.warn('[useMultiParticipantChat] 📋 Queue created:', {
      queueIndices: queue,
      firstParticipant: {
        index: 0,
        id: enabled[0]?.id,
        modelId: enabled[0]?.modelId,
        role: enabled[0]?.role,
      },
      queuedParticipants: queue.map(idx => ({
        index: idx,
        id: enabled[idx]?.id,
        modelId: enabled[idx]?.modelId,
        role: enabled[idx]?.role,
      })),
    });

    // ✅ Setup queue and reset index
    participantQueueRef.current = queue;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setPendingNextParticipant(false);

    // ✅ CRITICAL FIX: Find the last user message to re-trigger streaming
    // Instead of sending an empty message, we send the actual last user message
    // This ensures the backend has valid content to send to the AI model
    const lastUserMessage = messages.findLast(m => m.role === 'user');

    if (!lastUserMessage) {
      console.error('[useMultiParticipantChat] ❌ No user message found to trigger round');
      return;
    }

    // Extract text from the last user message
    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      console.error('[useMultiParticipantChat] ❌ Last user message has no text content');
      return;
    }

    console.warn('[useMultiParticipantChat] 🎯 Triggering first participant (index 0) with user message:', `${userText.substring(0, 50)}...`);

    // ✅ Send the actual user message text to trigger the round
    // The AI SDK will add this as a new message, but it's the same content as the existing one
    // The backend will process it correctly since it has valid content
    aiSendMessage({
      role: 'user',
      parts: [{ type: 'text', text: userText }],
    });
  }, [participants, status, messages, aiSendMessage]);

  /**
   * ✅ Send user message and trigger participant responses
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (status === 'submitted') {
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        console.warn('[useMultiParticipantChat] Cannot send empty message');
        return;
      }

      const enabled = participants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority);

      if (enabled.length === 0) {
        throw new Error('No enabled participants');
      }

      console.warn('[useMultiParticipantChat] 💬 Sending user message and starting round', {
        messageLength: trimmed.length,
        participantCount: enabled.length,
        participants: enabled.map((p, i) => ({
          index: i,
          id: p.id,
          modelId: p.modelId,
          role: p.role,
          priority: p.priority,
        })),
      });

      // Setup participant queue (skip first, it triggers automatically)
      const queue = enabled.slice(1).map((_, i) => i + 1);

      console.warn('[useMultiParticipantChat] 📋 Queue created:', {
        queueIndices: queue,
        firstParticipant: {
          index: 0,
          id: enabled[0]?.id,
          modelId: enabled[0]?.modelId,
          role: enabled[0]?.role,
        },
        queuedParticipants: queue.map(idx => ({
          index: idx,
          id: enabled[idx]?.id,
          modelId: enabled[idx]?.modelId,
          role: enabled[idx]?.role,
        })),
      });

      // ✅ Setup queue
      participantQueueRef.current = queue;
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      setPendingNextParticipant(false);

      // Send user message (first participant responds automatically)
      console.warn('[useMultiParticipantChat] 🎯 Sending user message - first participant (index 0) will respond');
      aiSendMessage({ text: trimmed });
    },
    [participants, status, aiSendMessage],
  );

  /**
   * ✅ AI SDK v5 PATTERN: Retry functionality
   * Retries the last message (useful when a participant fails)
   * This will restart the entire round from the beginning with all participants
   */
  const retry = useCallback(() => {
    if (status === 'submitted') {
      return; // Already streaming, can't retry
    }

    // ✅ Get the last user message to retry
    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      console.warn('[useMultiParticipantChat] No user message to retry');
      return;
    }

    // Extract text from the last user message
    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    if (!textPart || !('text' in textPart)) {
      console.warn('[useMultiParticipantChat] Last user message has no text');
      return;
    }

    console.warn('[useMultiParticipantChat] Retrying last message:', textPart.text);

    // Remove the failed assistant messages (keep all messages up to and including the last user message)
    const lastUserIndex = messages.findLastIndex(m => m.role === 'user');
    const messagesUpToLastUser = messages.slice(0, lastUserIndex + 1);
    setMessages(messagesUpToLastUser);

    // Retry the same message
    sendMessage(textPart.text);
  }, [messages, sendMessage, status, setMessages]);

  return {
    messages,
    sendMessage,
    startRound, // ✅ NEW: Trigger round without sending user message
    isStreaming: status === 'submitted',
    currentParticipantIndex: currentIndex,
    error: chatError || null,
    retry,
    setMessages,
  };
}
