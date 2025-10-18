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
  stop: () => void; // ✅ NEW: Stop streaming (from AI SDK useChat)
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
    stop,
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
      const currentParticipant = participants[currentIndexRef.current];

      // ✅ AI SDK v5 ERROR HANDLING PATTERN: Parse structured error metadata from backend
      // The backend returns JSON-stringified error metadata with comprehensive details
      // NOTE: Errors that reach here have ALREADY gone through AI SDK's server-side retry mechanism
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

      // Try to parse JSON error metadata from backend
      try {
        if (typeof errorMessage === 'string' && (errorMessage.startsWith('{') || errorMessage.includes('errorCategory'))) {
          errorMetadata = JSON.parse(errorMessage);
          // Use the user-friendly error message from backend
          if (errorMetadata?.errorMessage) {
            errorMessage = errorMetadata.errorMessage;
          }
        }
      } catch {
        // Not JSON - use error message as is
      }

      setPendingNextParticipant(false);

      // ✅ NO FRONTEND RETRIES: Errors that reach here have already been retried by the server
      // Display error inline and move to next participant
      if (currentParticipant) {
        const errorMessageId = `error-${Date.now()}-${currentIndexRef.current}`;
        const errorUIMessage: UIMessage = {
          id: errorMessageId,
          role: 'assistant',
          // ✅ CRITICAL FIX: Add empty text part to ensure message card renders
          // The MessageErrorDetails component will show the full error from metadata
          parts: [{ type: 'text', text: '' }],
          metadata: {
            participantId: currentParticipant.id,
            participantIndex: currentIndexRef.current,
            participantRole: currentParticipant.role,
            model: currentParticipant.modelId,
            hasError: true,
            errorType: errorMetadata?.errorCategory || 'error',
            errorMessage,
            errorCategory: errorMetadata?.errorCategory,
            statusCode: errorMetadata?.statusCode,
            rawErrorMessage: errorMetadata?.rawErrorMessage,
            providerMessage: errorMetadata?.rawErrorMessage || errorMessage,
            openRouterError: errorMetadata?.openRouterError,
            openRouterCode: errorMetadata?.openRouterCode,
          },
        };

        setMessages(prev => [...prev, errorUIMessage]);
      }

      // ✅ MOVE TO NEXT PARTICIPANT: Don't retry - server already did that
      const nextIndex = participantQueueRef.current.shift();
      if (nextIndex !== undefined) {
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
        // Trigger next participant after small delay
        setPendingNextParticipant(true);
      } else {
        // No more participants - round complete
        onRoundComplete?.();
        onComplete?.();
      }

      // Notify parent component
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    },

    // ✅ FIX: Add participant metadata to messages during streaming
    onFinish: async (data) => {
      // ✅ CRITICAL: Update message metadata with participant info
      // This ensures the frontend can display the correct model name/icon
      const currentParticipant = participants[currentIndexRef.current];

      // ✅ CRITICAL BUG FIX: Validate data.message exists before continuing
      // Silent failures occur when AI SDK doesn't create a message (empty response, error, etc.)
      if (!data.message) {
        setPendingNextParticipant(false);

        // ✅ CREATE ERROR MESSAGE: Make the failure visible to the user
        if (currentParticipant) {
          const errorMessageId = `error-no-message-${Date.now()}-${currentIndexRef.current}`;
          const errorUIMessage: UIMessage = {
            id: errorMessageId,
            role: 'assistant',
            // ✅ CRITICAL FIX: Add empty text part to ensure message card renders
            // Previously parts: [] would cause the message card to potentially not render
            // The MessageErrorDetails component will show the full error from metadata
            parts: [{ type: 'text', text: '' }],
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

        // ✅ MOVE TO NEXT PARTICIPANT: Don't stop the round, just advance
        const nextIndex = participantQueueRef.current.shift();
        if (nextIndex !== undefined) {
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          // Trigger next participant
          setPendingNextParticipant(true);
        } else {
          // No more participants - round complete
          currentIndexRef.current = 0;
          setCurrentIndex(0);
          onRoundComplete?.();
          onComplete?.();
        }

        // Notify parent component of the error
        const error = new Error(`Participant ${currentIndexRef.current} (${currentParticipant?.role || 'unknown'}) failed: data.message is missing`);
        onError?.(error);

        return;
      }

      if (currentParticipant && data.message) {
        // ✅ AI SDK v5 ERROR HANDLING: Check for error metadata and empty responses
        // 1. Check backend-provided error metadata (hasError, errorMessage, errorType)
        // 2. Detect empty/invalid responses on frontend
        const messageMetadata = data.message.metadata as Record<string, unknown> | undefined;
        const hasBackendError = messageMetadata?.hasError === true || !!messageMetadata?.error || !!messageMetadata?.errorMessage;

        // Check if message has actual content
        const textParts = data.message.parts?.filter(p => p.type === 'text') || [];
        const hasTextContent = textParts.some((part) => {
          if ('text' in part && typeof part.text === 'string') {
            return part.text.trim().length > 0;
          }
          return false;
        });

        // Detect empty response: no text parts or all text parts are empty
        const isEmptyResponse = textParts.length === 0 || !hasTextContent;
        const hasError = hasBackendError || isEmptyResponse;

        // Build error message for empty responses
        let errorMessage = messageMetadata?.errorMessage as string | undefined;
        if (isEmptyResponse && !errorMessage) {
          errorMessage = `The model (${currentParticipant.modelId}) did not generate a response. This can happen due to content filtering, model limitations, or API issues.`;
        }

        // Merge participant metadata with any existing error metadata from backend
        const updatedMetadata = {
          ...(typeof data.message.metadata === 'object' && data.message.metadata !== null ? data.message.metadata : {}),
          participantId: currentParticipant.id,
          participantIndex: currentIndexRef.current,
          participantRole: currentParticipant.role,
          model: currentParticipant.modelId,
          // Add error fields if error detected
          ...(hasError && {
            hasError: true,
            errorType: messageMetadata?.errorType || (isEmptyResponse ? 'empty_response' : 'unknown'),
            errorMessage,
            providerMessage: messageMetadata?.providerMessage || messageMetadata?.openRouterError || errorMessage,
            openRouterError: messageMetadata?.openRouterError,
          }),
        };

        setMessages((prev) => {
          // ✅ CRITICAL FIX: Check if message exists in array before trying to update
          const messageExists = prev.some(msg => msg.id === data.message.id);

          if (!messageExists) {
            // Message doesn't exist in array - ADD it
            return [...prev, { ...data.message, metadata: updatedMetadata }];
          }

          // Message exists - UPDATE it
          return prev.map((msg) => {
            if (msg.id === data.message.id && msg.role === 'assistant') {
              return { ...msg, metadata: updatedMetadata };
            }
            return msg;
          });
        });

        // ✅ NO FRONTEND RETRIES: Server already handled retries
        // If there's an error at this point, it's already been saved to the database
        // Just continue to next participant
      }

      // ✅ ALWAYS ADVANCE TO NEXT PARTICIPANT: After message is processed (success or error)
      // Process next participant in queue using REF (immediate access)
      if (participantQueueRef.current.length > 0) {
        const nextIndex = participantQueueRef.current[0];
        const remaining = participantQueueRef.current.slice(1);
        if (nextIndex !== undefined) {
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

    // ✅ CRITICAL: Add small delay to ensure stream is fully flushed
    // This prevents race conditions where status becomes 'ready' but stream hasn't fully completed
    // ✅ FIX: Assign timeout to variable for proper cleanup
    const timeoutId = setTimeout(() => {
      // AI SDK is ready for the next message - reset pending state
      setPendingNextParticipant(false);

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
      return;
    }

    const enabled = participants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    if (enabled.length === 0) {
      return;
    }

    // Setup participant queue (skip first, it triggers automatically)
    const queue = enabled.slice(1).map((_, i) => i + 1);

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
      return;
    }

    // Extract text from the last user message
    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      return;
    }

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
      if (status !== 'ready') {
        return; // ✅ FIX: Already streaming, can't send new message
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const enabled = participants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority);

      if (enabled.length === 0) {
        throw new Error('No enabled participants');
      }

      // Setup participant queue (skip first, it triggers automatically)
      const queue = enabled.slice(1).map((_, i) => i + 1);

      // ✅ Setup queue
      participantQueueRef.current = queue;
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      setPendingNextParticipant(false);

      // Send user message (first participant responds automatically)
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
    if (status !== 'ready') {
      return; // ✅ FIX: Already streaming, can't retry
    }

    // ✅ Get the last user message to retry
    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      return;
    }

    // Extract text from the last user message
    const textPart = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
    if (!textPart || !('text' in textPart)) {
      return;
    }

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
    isStreaming: status !== 'ready', // ✅ FIX: AI SDK v5 uses 'in_progress' not 'submitted'
    currentParticipantIndex: currentIndex,
    error: chatError || null,
    retry,
    stop, // ✅ NEW: Stop streaming
    setMessages,
  };
}
