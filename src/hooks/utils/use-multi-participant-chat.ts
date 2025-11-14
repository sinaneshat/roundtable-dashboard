'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { z } from 'zod';

import { AiSdkStatuses, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { ErrorMetadataSchema } from '@/lib/schemas/error-schemas';
import { DEFAULT_PARTICIPANT_INDEX, ParticipantsArraySchema } from '@/lib/schemas/participant-schemas';
import type { UIMessageErrorType } from '@/lib/utils/message-transforms';
import { createErrorUIMessage, mergeParticipantMetadata } from '@/lib/utils/message-transforms';
import { getRoundNumber, getUserMetadata } from '@/lib/utils/metadata';
import { deduplicateParticipants } from '@/lib/utils/participant';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';

import { useSyncedRefs } from './use-synced-refs';

/**
 * Zod schema for UseMultiParticipantChatOptions validation
 * Validates hook options at entry point to ensure type safety
 * Note: Callbacks are not validated to preserve their type signatures
 *
 * ✅ SINGLE SOURCE OF TRUTH: Uses ParticipantsArraySchema from central schemas
 */
const UseMultiParticipantChatOptionsSchema = z
  .object({
    threadId: z.string(), // Allow empty string for initial state
    participants: ParticipantsArraySchema,
    messages: z.array(z.custom<UIMessage>()).optional(),
    mode: z.string().optional(),
    regenerateRoundNumber: z.number().int().nonnegative().optional(), // ✅ 0-BASED: Allow round 0
  })
  .passthrough(); // Allow callbacks to pass through without validation

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
  onComplete?: (messages: UIMessage[]) => void;
  /** Callback when user clicks retry (receives the round number being retried) */
  onRetry?: (roundNumber: number) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Chat mode (e.g., 'moderator', 'standard') */
  mode?: string;
  /** When set, indicates this is a round regeneration */
  regenerateRoundNumber?: number;
  /** Enable web search before participant streaming */
  enableWebSearch?: boolean;
  /** Callback when pre-search starts */
  onPreSearchStart?: (data: { userQuery: string; totalQueries: number }) => void;
  /** Callback for each pre-search query */
  onPreSearchQuery?: (data: { query: string; rationale: string; index: number; total: number }) => void;
  /** Callback for each pre-search result */
  onPreSearchResult?: (data: { query: string; resultCount: number; index: number }) => void;
  /** Callback when pre-search completes */
  onPreSearchComplete?: (data: { successfulSearches: number; totalResults: number }) => void;
  /** Callback when pre-search encounters an error */
  onPreSearchError?: (data: { error: string }) => void;
};

/**
 * Return value from the multi-participant chat hook
 */
type UseMultiParticipantChatReturn = {
  /** All messages in the conversation */
  messages: UIMessage[];
  /** Send a new user message and start a round */
  sendMessage: (content: string) => Promise<void>;
  /**
   * Start a new round with the existing participants (used for manual round triggering)
   * @param participantsOverride - Optional fresh participants (used by store subscription to avoid stale data)
   */
  startRound: (participantsOverride?: ChatParticipant[]) => void;
  /** Whether participants are currently streaming responses */
  isStreaming: boolean;
  /** The index of the currently active participant */
  currentParticipantIndex: number;
  /** Any error that occurred during the chat */
  error: Error | null;
  /** Retry the last round (regenerate entire round from scratch - deletes all messages and re-sends user prompt) */
  retry: () => void;
  /** Stop the current streaming session */
  stop: () => void;
  /** Manually set messages (used for optimistic updates or message deletion) */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
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
 * AI SDK v5 Pattern: Message Metadata Flow
 * ========================================
 *
 * 1. STREAMING STATE (no metadata yet):
 *    - Message is being generated by AI SDK
 *    - No model/participant metadata available yet
 *    - UI uses currentParticipantIndex to show correct avatar/name
 *    - flushSync ensures index updates before next participant streams
 *
 * 2. ON FINISH (metadata added):
 *    - AI SDK calls onFinish with complete message
 *    - mergeParticipantMetadata adds: model, participantId, participantIndex, role, roundNumber
 *    - flushSync ensures metadata is committed BEFORE next participant starts
 *    - This prevents UI from showing wrong participant info during streaming
 *
 * 3. COMPLETED STATE (has metadata):
 *    - Message has full metadata from backend
 *    - UI trusts saved metadata and ignores currentParticipantIndex
 *    - No re-rendering when currentParticipantIndex changes
 *
 * CRITICAL SYNCHRONIZATION POINTS:
 * --------------------------------
 * 1. Before triggering next participant: flushSync(setCurrentParticipantIndex)
 * 2. After finishing current participant: flushSync(setMessages with metadata)
 * 3. These ensure React commits state BEFORE triggering next API call
 *
 * Without flushSync, React batches updates and causes:
 * - Wrong participant avatars/names during streaming
 * - Message UI flickering between participants
 * - Completed messages showing as streaming
 *
 * @example
 * const chat = useMultiParticipantChat({
 *   threadId: 'thread-123',
 *   participants: [
 *     { id: '1', modelId: 'gpt-4', isEnabled: true, priority: 0 },
 *     { id: '2', modelId: 'claude-3', isEnabled: true, priority: 1 },
 *   ],
 *   onComplete: () => {
 *     // Round complete callback
 *   }
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
    enableWebSearch = false,
    onPreSearchStart,
    onPreSearchQuery,
    onPreSearchResult,
    onPreSearchComplete,
    onPreSearchError,
  } = options;

  // ✅ CONSOLIDATED: Sync all callbacks and state values into refs
  // Prevents stale closures by keeping refs in sync with latest values
  // Uses useSyncedRefs to reduce boilerplate (replaces 9 separate useLayoutEffect calls)
  const callbackRefs = useSyncedRefs({
    onComplete,
    onRetry,
    onError,
    onPreSearchStart,
    onPreSearchQuery,
    onPreSearchResult,
    onPreSearchComplete,
    onPreSearchError,
    threadId,
    enableWebSearch,
  });

  // Participant error tracking - simple Set-based tracking to prevent duplicate responses
  // Key format: `${participant.modelId}-${participantIndex}`
  const respondedParticipantsRef = useRef<Set<string>>(new Set());
  const hasResponded = useCallback((participantKey: string) => {
    return respondedParticipantsRef.current.has(participantKey);
  }, []);
  const markAsResponded = useCallback((participantKey: string) => {
    respondedParticipantsRef.current.add(participantKey);
  }, []);
  const resetErrorTracking = useCallback(() => {
    respondedParticipantsRef.current.clear();
  }, []);

  // Track regenerate round number for backend communication
  const regenerateRoundNumberRef = useRef<number | null>(regenerateRoundNumberParam || null);

  // Simple round tracking state - backend is source of truth
  // ✅ 0-BASED: First round is round 0
  const [_currentRound, setCurrentRound] = useState(0);
  const currentRoundRef = useRef<number>(0);

  // Simple participant state - index-based iteration
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [isExplicitlyStreaming, setIsExplicitlyStreaming] = useState(false);

  // Participant refs for round stability
  const participantsRef = useRef<ChatParticipant[]>(participants);
  const roundParticipantsRef = useRef<ChatParticipant[]>([]);
  const currentIndexRef = useRef<number>(currentParticipantIndex);

  // Track if we're currently triggering to prevent double triggers
  const isTriggeringRef = useRef<boolean>(false);

  // ✅ CRITICAL FIX: Use a FIFO queue to prevent race conditions with participant indices
  // The AI SDK processes requests in order, so a queue ensures each transport callback
  // gets the correct participant index regardless of timing or concurrent calls
  // Queue stores participant indices in the order aiSendMessage is called
  const participantIndexQueue = useRef<number[]>([]);

  // ✅ CRITICAL FIX: Track last used index to prevent queue drainage on retries
  // AI SDK transport may call prepareSendMessagesRequest multiple times per message
  // (retries, preflight, etc.), so we track the last used index to avoid shifting
  // multiple times for the same participant
  const lastUsedParticipantIndex = useRef<number | null>(null);

  // Refs to hold values needed for triggering (to avoid closure issues in callbacks)
  const messagesRef = useRef<UIMessage[]>([]);
  const aiSendMessageRef = useRef<((message: { text: string; metadata?: Record<string, unknown> }) => void) | null>(null);

  /**
   * Trigger the next participant using refs (safe to call from useChat callbacks)
   */
  const triggerNextParticipantWithRefs = useCallback(() => {
    // Prevent double triggers
    if (isTriggeringRef.current) {
      return;
    }

    const nextIndex = currentIndexRef.current + 1;
    const totalParticipants = roundParticipantsRef.current.length;

    // Round complete - reset state
    // Analysis triggering now handled automatically by store subscription
    if (nextIndex >= totalParticipants) {
      // eslint-disable-next-line react-dom/no-flush-sync -- Required for analysis trigger synchronization
      flushSync(() => {
        setIsExplicitlyStreaming(false);
        setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
      });

      resetErrorTracking();
      regenerateRoundNumberRef.current = null;
      lastUsedParticipantIndex.current = null; // Reset for next round

      // ✅ CRITICAL FIX: Pass messages directly to avoid stale ref issue
      // messagesRef.current has the latest messages with complete metadata
      callbackRefs.onComplete.current?.(messagesRef.current);

      return;
    }

    // More participants to process - trigger next one
    isTriggeringRef.current = true;

    // CRITICAL: Update ref BEFORE setting state to avoid race condition
    // The prepareSendMessagesRequest reads from currentIndexRef.current
    // so we must update it synchronously before calling aiSendMessage
    currentIndexRef.current = nextIndex;

    // CRITICAL FIX: Use flushSync to ensure participant index update is committed BEFORE triggering next participant
    // Without flushSync, React batches this state update and may re-render with the new index
    // before the first participant's message metadata is properly evaluated, causing both messages
    // to show the second participant's icon/name during the batched render.
    // AI SDK v5 Pattern: Prevents UI from showing wrong participant info during sequential streaming
    // eslint-disable-next-line react-dom/no-flush-sync -- Required for multi-participant chat synchronization
    flushSync(() => {
      setCurrentParticipantIndex(nextIndex);
    });

    // Find the last user message using ref
    const lastUserMessage = messagesRef.current.findLast((m: UIMessage) => m.role === MessageRoles.USER);
    if (!lastUserMessage) {
      // Restore to previous index on error
      currentIndexRef.current = currentIndexRef.current - 1;
      isTriggeringRef.current = false;
      return;
    }

    const textPart = lastUserMessage.parts?.find((p: { type: string; text?: string }) => p.type === MessagePartTypes.TEXT && 'text' in p);
    const userText = textPart && 'text' in textPart ? String(textPart.text || '') : '';

    if (!userText.trim()) {
      // Restore to previous index on error
      currentIndexRef.current = currentIndexRef.current - 1;
      isTriggeringRef.current = false;
      return;
    }

    // ✅ CRITICAL FIX: Push participant index to queue BEFORE calling aiSendMessage
    participantIndexQueue.current.push(nextIndex);

    if (aiSendMessageRef.current) {
      aiSendMessageRef.current({
        text: userText,
        metadata: {
          role: 'user',
          roundNumber: currentRoundRef.current,
          isParticipantTrigger: true,
        },
      });
    }

    // AI SDK v5 Pattern: Use requestAnimationFrame instead of setTimeout
    // This resets trigger lock after the browser's next paint cycle
    requestAnimationFrame(() => {
      isTriggeringRef.current = false;
    });
    // Note: callbackRefs not in deps - we use callbackRefs.onComplete.current to always get latest value
    // hasResponded, markAsResponded, resetErrorTracking are stable functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetErrorTracking]);

  /**
   * Prepare request body for AI SDK chat transport
   *
   * AI SDK v5 Pattern: Use callback to access refs safely
   * Refs should only be accessed in callbacks/effects, not during render
   *
   * ✅ CRITICAL FIX: Uses FIFO queue with retry protection
   * Queue approach prevents race conditions where currentIndexRef changes
   * before transport callback executes. Tracks last used index to prevent
   * queue drainage when AI SDK retries or calls multiple times per participant.
   */
  const prepareSendMessagesRequest = useCallback(
    ({ id, messages }: { id: string; messages: unknown[] }) => {
      // ✅ CRITICAL FIX: Prevent queue drainage on retries/duplicate calls
      // AI SDK transport may call this function multiple times for the same message
      // (retries, preflight, etc.). We only shift from queue when processing a NEW participant.

      // Peek at the next queued index without removing it
      const queuedIndex = participantIndexQueue.current[0];

      let participantIndexToUse: number;

      if (queuedIndex !== undefined && queuedIndex !== lastUsedParticipantIndex.current) {
        // New participant detected - shift from queue and remember it
        participantIndexToUse = participantIndexQueue.current.shift()!;
        lastUsedParticipantIndex.current = participantIndexToUse;
      } else if (lastUsedParticipantIndex.current !== null) {
        // Same participant (retry/duplicate call) - reuse last index without shifting queue
        participantIndexToUse = lastUsedParticipantIndex.current;
      } else {
        // Fallback to current index ref (shouldn't normally happen)
        participantIndexToUse = currentIndexRef.current;
      }

      const body = {
        id,
        message: messages[messages.length - 1],
        participantIndex: participantIndexToUse,
        participants: participantsRef.current,
        ...(regenerateRoundNumberRef.current && { regenerateRound: regenerateRoundNumberRef.current }),
        ...(mode && { mode }),
      };

      return { body };
    },
    [mode],
  );

  // AI SDK v5 Pattern: Create transport with callback that accesses refs safely
  // Reference: https://github.com/vercel/ai/blob/ai_5_0_0/content/cookbook/01-next/80-send-custom-body-from-use-chat.mdx
  // The prepareSendMessagesRequest callback is invoked by the transport at request time (not during render),
  // so accessing refs inside the callback is safe and follows the recommended AI SDK v5 pattern.
  // The callback is stable (only depends on 'mode') and refs are only accessed during callback invocation.

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
    // AI SDK v5 Pattern: Pass messages (renamed from initialMessages in v5.0)
    // When provided from backend after thread creation, these hydrate the chat
    // Reference: https://github.com/vercel/ai/blob/ai_5_0_0/content/docs/08-migration-guides/26-migration-guide-5-0.mdx
    ...(initialMessages && initialMessages.length > 0 ? { messages: initialMessages } : {}),

    /**
     * Handle participant errors - create error UI and continue to next participant
     */
    onError: (error) => {
      // CRITICAL: Use ref for current index to avoid stale closure
      const currentIndex = currentIndexRef.current;
      const participant = roundParticipantsRef.current[currentIndex];

      // ✅ SINGLE SOURCE OF TRUTH: Parse and validate error metadata with schema
      let errorMessage = error instanceof Error ? error.message : String(error);
      let errorMetadata: z.infer<typeof ErrorMetadataSchema> | undefined;

      try {
        if (typeof errorMessage === 'string' && (errorMessage.startsWith('{') || errorMessage.includes('errorCategory'))) {
          const parsed = JSON.parse(errorMessage);
          const validated = ErrorMetadataSchema.safeParse(parsed);
          if (validated.success) {
            errorMetadata = validated.data;
            if (errorMetadata.rawErrorMessage) {
              errorMessage = errorMetadata.rawErrorMessage;
            }
          }
        }
      } catch {
        // Invalid JSON - use original error message
      }

      // Create error message UI only if not already responded
      if (participant) {
        const errorKey = `${participant.modelId}-${currentIndex}`;

        if (!hasResponded(errorKey)) {
          markAsResponded(errorKey);

          const errorUIMessage = createErrorUIMessage(
            participant,
            currentIndex,
            errorMessage,
            (errorMetadata?.errorCategory as UIMessageErrorType) || 'failed',
            errorMetadata,
            currentRoundRef.current,
          );

          setMessages(prev => [...prev, errorUIMessage]);
        }
      }

      // Trigger next participant immediately (no delay needed)
      triggerNextParticipantWithRefs();
      callbackRefs.onError.current?.(error instanceof Error ? error : new Error(errorMessage));
    },

    /**
     * Handle successful participant response
     * AI SDK v5 Pattern: Trust the SDK's built-in deduplication
     */
    onFinish: async (data) => {
      // CRITICAL: Use ref for current index to avoid stale closure
      const currentIndex = currentIndexRef.current;
      const participant = roundParticipantsRef.current[currentIndex];

      // Handle silent failure (no message object from AI SDK)
      if (!data.message) {
        if (participant) {
          const errorKey = `${participant.modelId}-${currentIndex}`;

          // Only create error message if not already tracked
          if (!hasResponded(errorKey)) {
            markAsResponded(errorKey);

            const errorUIMessage = createErrorUIMessage(
              participant,
              currentIndex,
              'This model failed to generate a response. The AI SDK did not create a message object.',
              'silent_failure',
              { providerMessage: 'No response text available' },
              currentRoundRef.current,
            );

            setMessages(prev => [...prev, errorUIMessage]);
          }
        }

        // Trigger next participant immediately
        triggerNextParticipantWithRefs();
        const error = new Error(`Participant ${currentIndex} failed: data.message is missing`);
        callbackRefs.onError.current?.(error);
        return;
      }

      // AI SDK v5 Pattern: ALWAYS update message metadata on finish
      // The AI SDK adds the message during streaming; we update it with proper metadata
      if (participant && data.message) {
        // ✅ CRITICAL FIX: Skip metadata merge for pre-search messages
        // Pre-search messages have isPreSearch: true and complete metadata from backend
        // They should NOT be modified with participant metadata
        const messageMetadata = data.message.metadata as Record<string, unknown> | null | undefined;
        const isPreSearch = messageMetadata
          && typeof messageMetadata === 'object'
          && 'isPreSearch' in messageMetadata
          && messageMetadata.isPreSearch === true;

        if (isPreSearch) {
          // Pre-search messages already have complete metadata - skip this flow entirely
          return;
        }

        // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe metadata access
        const backendRoundNumber = getRoundNumber(data.message.metadata);
        const finalRoundNumber = backendRoundNumber || currentRoundRef.current;

        // ✅ STRICT TYPING: mergeParticipantMetadata now requires roundNumber parameter
        // Returns complete AssistantMessageMetadata with ALL required fields
        const completeMetadata = mergeParticipantMetadata(
          data.message,
          participant,
          currentIndex,
          finalRoundNumber, // REQUIRED: Pass round number explicitly
        );

        // Use flushSync to force React to commit metadata update synchronously
        // AI SDK v5 Pattern: Prevents race conditions between sequential participants
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for multi-participant chat synchronization
        flushSync(() => {
          setMessages((prev) => {
            const completeMessage: UIMessage = {
              ...data.message,
              metadata: completeMetadata, // ✅ Now uses strictly typed metadata
            };

            // ✅ DETERMINISTIC IDs: No duplicate detection needed
            // Backend generates IDs using composite key: {threadId}_r{roundNumber}_p{participantId}
            // Each participant can only respond ONCE per round - collisions are impossible
            // No defensive suffix generation required
            const originalMessageId = data.message.id;
            const idToSearchFor = originalMessageId;

            // ✅ STRICT TYPING FIX: Check if message exists AND belongs to current participant AND current round
            // No more loose optional chaining - completeMetadata has ALL required fields
            // ✅ CRITICAL FIX: Search for idToSearchFor (original ID if we changed it, otherwise the current ID)
            const existingMessageIndex = prev.findIndex((msg: UIMessage) => {
              if (msg.id !== idToSearchFor)
                return false;

              const msgMetadata = msg.metadata as DbAssistantMessageMetadata | undefined;

              // If message has no metadata, it's unclaimed - safe to use
              if (!msgMetadata)
                return true;

              // ✅ CRITICAL: Must match BOTH participant AND round (no optional chaining!)
              // This prevents round 3 from overwriting round 2's message
              const participantMatches = msgMetadata.participantId === participant.id
                || msgMetadata.participantIndex === currentIndex;
              const roundMatches = msgMetadata.roundNumber === finalRoundNumber;

              return participantMatches && roundMatches;
            });

            if (existingMessageIndex === -1) {
              // ✅ SAFETY CHECK: Before adding, verify no duplicate IDs exist
              // This prevents edge cases where messages might have been refetched
              const duplicateMsg = prev.find(msg => msg.id === completeMessage.id);
              if (duplicateMsg) {
                const dupMetadata = duplicateMsg.metadata as DbAssistantMessageMetadata | undefined;
                const dupParticipantId = dupMetadata?.participantId;

                // Only replace if it's the same participant (prevents overwriting different participant's message)
                if (dupParticipantId === participant.id) {
                  return prev.map((msg: UIMessage) =>
                    msg.id === completeMessage.id ? completeMessage : msg,
                  );
                }
                // Different participant with same ID - this shouldn't happen after our ID generation fix
                // Silently handle by adding as new message with the (hopefully unique) ID
              }
              // Message doesn't exist or belongs to different participant - add new message
              return [...prev, completeMessage];
            }

            // Update existing message with complete metadata (verified to be same participant)
            return prev.map((msg: UIMessage, idx: number) => {
              if (idx === existingMessageIndex) {
                return completeMessage;
              }
              return msg;
            });
          });
        });

        // Track this response to prevent duplicate error messages
        const responseKey = `${participant.modelId}-${currentIndex}`;
        markAsResponded(responseKey);
      }

      // CRITICAL: Wait for browser paint before triggering next participant
      // flushSync above ensures React commits the metadata update
      // requestAnimationFrame ensures the browser paints the update
      // THEN we trigger the next participant
      // This prevents the second participant from showing before the first participant's metadata is visible
      requestAnimationFrame(() => {
        triggerNextParticipantWithRefs();
      });
    },

    /**
     * NOTE: Pre-search progress streaming is not implemented
     *
     * AI SDK useChat does not support onStreamEvent for custom data streaming.
     * Pre-search results are displayed through persisted messages instead.
     */
  });

  /**
   * Keep refs in sync with latest values from useChat and props
   */
  useLayoutEffect(() => {
    messagesRef.current = messages;
    aiSendMessageRef.current = aiSendMessage;
    participantsRef.current = participants;
  }, [messages, aiSendMessage, participants]);

  /**
   * ✅ CRITICAL FIX: Sync external messages prop when it changes
   *
   * For ChatOverviewScreen pattern:
   * 1. Hook initializes with empty messages (before thread created)
   * 2. Thread created → backend returns messages
   * 3. Provider passes new messages prop
   * 4. We MUST sync these into hook's internal state
   *
   * AI SDK's `messages` prop only hydrates on mount, not on updates.
   * Use setMessages() to sync external changes.
   */
  useLayoutEffect(() => {
    // Only sync if we have external messages and they differ from current
    if (initialMessages && initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, messages.length, setMessages]);

  /**
   * Start a new round with existing participants
   *
   * AI SDK v5 Pattern: Used when initializing a thread with existing messages
   * (e.g., from backend after thread creation) and need to trigger streaming
   * for the first participant. This is the pattern from Exercise 01.07, 04.02, 04.03.
   *
   * ✅ FIX: Removed AI SDK status check - store subscription guards prevent premature calls
   * The AI SDK status may not be 'ready' when this is called from the subscription,
   * but the store subscription has proper guards (messages exist, not already streaming, etc.)
   * Only check isExplicitlyStreaming to prevent concurrent rounds
   */
  const startRound = useCallback((participantsOverride?: ChatParticipant[]) => {
    // ✅ CRITICAL FIX: Allow caller to pass fresh participants (from store subscription)
    // When subscription calls this before provider re-renders, ref is stale
    // Subscription can pass participants directly from store.getState()
    const currentParticipants = participantsOverride || participantsRef.current;

    // Guard: Prevent concurrent rounds
    if (isExplicitlyStreaming) {
      return;
    }

    const uniqueParticipants = deduplicateParticipants(currentParticipants);
    const enabled = uniqueParticipants.filter(p => p.isEnabled);

    if (enabled.length === 0) {
      return;
    }

    const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);

    if (!lastUserMessage) {
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      return;
    }

    const roundNumber = getCurrentRoundNumber(messages);

    // CRITICAL: Update refs FIRST to avoid race conditions
    // These refs are used in prepareSendMessagesRequest and must be set before the API call
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    roundParticipantsRef.current = enabled;
    isTriggeringRef.current = false;
    currentRoundRef.current = roundNumber;
    lastUsedParticipantIndex.current = null; // Reset for new round

    // Reset all state for new round
    setIsExplicitlyStreaming(true);
    setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
    setCurrentRound(roundNumber);
    resetErrorTracking();

    // React 18+ automatically batches updates, no need for flushSync here
    // State updates will be committed synchronously within this callback

    // ✅ CRITICAL FIX: Push participant 0 index to queue before calling aiSendMessage
    participantIndexQueue.current.push(0);

    // Trigger streaming with the existing user message
    // Use isParticipantTrigger:true to indicate this is triggering the first participant
    aiSendMessage({
      text: userText,
      metadata: {
        role: 'user',
        roundNumber,
        isParticipantTrigger: true,
      },
    });
  }, [messages, resetErrorTracking, isExplicitlyStreaming, aiSendMessage]);
  // Note: participantsOverride comes from caller, not deps

  /**
   * Send a user message and start a new round
   *
   * If enableWebSearch is true, executes pre-search BEFORE participant streaming
   */
  const sendMessage = useCallback(
    async (content: string) => {
      // ✅ ENUM PATTERN: Use AiSdkStatuses constant instead of hardcoded 'ready'
      if (status !== AiSdkStatuses.READY || isExplicitlyStreaming) {
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      // AI SDK v5 Pattern: Simple, straightforward participant filtering
      const uniqueParticipants = deduplicateParticipants(participants);
      const enabled = uniqueParticipants.filter(p => p.isEnabled);

      if (enabled.length === 0) {
        throw new Error('No enabled participants');
      }

      // CRITICAL: Update refs FIRST to avoid race conditions
      // These refs are used in prepareSendMessagesRequest and must be set before the API call
      currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
      roundParticipantsRef.current = enabled;
      isTriggeringRef.current = false;
      lastUsedParticipantIndex.current = null; // Reset for new round

      // Use regenerate round number if retrying, otherwise calculate next
      const newRoundNumber = regenerateRoundNumberRef.current !== null
        ? regenerateRoundNumberRef.current
        : calculateNextRoundNumber(messages);

      // CRITICAL: Update round number in ref BEFORE sending message
      // This ensures the backend receives the correct round number
      currentRoundRef.current = newRoundNumber;

      // ========================================================================
      // PRE-SEARCH: Handled by provider wrapper (sendMessageWithQuotaInvalidation)
      // Provider executes pre-search before calling this function
      // This ensures proper timing - pre-search completes before participant streaming
      // ========================================================================

      // ========================================================================
      // PARTICIPANT STREAMING: Starts after pre-search (handled by provider)
      // ========================================================================

      // AI SDK v5 Pattern: Synchronization for proper message ordering
      // Reset all state for new round
      setIsExplicitlyStreaming(true);
      setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
      setCurrentRound(newRoundNumber);
      resetErrorTracking();

      // CRITICAL FIX: Use flushSync to ensure state updates are committed synchronously
      // before the API call is made. This prevents the first participant's response
      // from appearing before the user message during streaming.
      //
      // Without this, React batches state updates and the assistant message
      // can be added to the DOM before the user message is rendered,
      // causing messages to appear in the wrong order during streaming.
      // eslint-disable-next-line react-dom/no-flush-sync -- Required for proper message ordering
      flushSync(() => {
        // Force React to commit the state updates immediately
      });

      // ✅ CRITICAL FIX: Push participant 0 index to queue before calling aiSendMessage
      participantIndexQueue.current.push(0);

      // Send message without custom ID - let backend generate unique IDs
      aiSendMessage({
        text: trimmed,
        metadata: {
          role: 'user',
          roundNumber: newRoundNumber,
        },
      });
    },
    [participants, status, aiSendMessage, messages, resetErrorTracking, isExplicitlyStreaming],
  );

  /**
   * Retry the last round (regenerate entire round from scratch)
   * AI SDK v5 Pattern: Clean state management for round regeneration
   *
   * This completely removes ALL messages from the round (user + assistant)
   * and re-sends the user's prompt to regenerate the round from ground up.
   */
  const retry = useCallback(() => {
    // ✅ ENUM PATTERN: Use AiSdkStatuses constant instead of hardcoded 'ready'
    if (status !== AiSdkStatuses.READY) {
      return;
    }

    // Find the last substantive user message (not a participant trigger)
    const lastUserMessage = messages.findLast((m) => {
      if (m.role !== MessageRoles.USER) {
        return false;
      }

      // ✅ TYPE-SAFE: Use extraction utility for user metadata
      const userMetadata = getUserMetadata(m.metadata);
      const isParticipantTrigger = userMetadata?.isParticipantTrigger === true;

      if (isParticipantTrigger) {
        return false;
      }

      const textPart = m.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
      const hasContent = textPart && 'text' in textPart && textPart.text.trim().length > 0;

      return hasContent;
    });

    if (!lastUserMessage) {
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
    if (!textPart || !('text' in textPart) || !textPart.text.trim()) {
      return;
    }

    // Save the user's prompt text before we delete everything
    const userPromptText = textPart.text;

    const roundNumber = getCurrentRoundNumber(messages);

    // STEP 1: Set regenerate flag to preserve round numbering
    regenerateRoundNumberRef.current = roundNumber;

    // STEP 2: Call onRetry FIRST to remove analysis and cleanup state
    // This must happen before setMessages to ensure UI updates properly
    callbackRefs.onRetry.current?.(roundNumber);

    // STEP 3: Remove ALL messages from the current round (user + assistant)
    // Find the first message of the current round and remove everything from that point
    const firstMessageIndexOfRound = messages.findIndex((m) => {
      // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe metadata access
      const msgRoundNumber = getRoundNumber(m.metadata);
      return msgRoundNumber === roundNumber;
    });

    // If we found the round, remove all messages from that point onward
    const messagesBeforeRound = firstMessageIndexOfRound >= 0
      ? messages.slice(0, firstMessageIndexOfRound)
      : messages.slice(0, -1); // Fallback: remove last message if round not found

    setMessages(messagesBeforeRound);

    // STEP 4: Reset streaming state to start fresh
    setIsExplicitlyStreaming(false);

    // CRITICAL: Update ref BEFORE setting state
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    lastUsedParticipantIndex.current = null; // Reset for retry

    // Update participant index synchronously (no flushSync needed)
    setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);

    resetErrorTracking();
    isTriggeringRef.current = false;

    // STEP 5: Send message to start regeneration (as if user just sent the message)
    // This will create a new round with fresh messages (user + assistant)
    // React will batch the state updates naturally
    // The sendMessage function will handle participant orchestration properly
    sendMessage(userPromptText);
    // Note: callbackRefs not in deps - we use callbackRefs.onRetry.current to always get latest value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sendMessage, status, setMessages, resetErrorTracking]);

  /**
   * Stop the current streaming session
   */
  const stopStreaming = useCallback(() => {
    stop();
    setIsExplicitlyStreaming(false);
    setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
    isTriggeringRef.current = false;
    lastUsedParticipantIndex.current = null; // Reset when stopping
  }, [stop]);

  // ✅ CRITICAL FIX: Derive isStreaming from BOTH manual flag AND AI SDK status
  // AI SDK v5 Pattern: status can be 'ready' | 'streaming' | 'awaiting_message'
  // - isExplicitlyStreaming: Our manual flag for participant orchestration
  // - status !== AiSdkStatuses.READY: AI SDK's internal streaming state
  // Both must be false for streaming to be truly complete
  // ✅ ENUM PATTERN: Use AiSdkStatuses.READY instead of hardcoded 'ready'
  const isActuallyStreaming = isExplicitlyStreaming || status !== AiSdkStatuses.READY;

  return {
    messages,
    sendMessage,
    startRound,
    isStreaming: isActuallyStreaming,
    currentParticipantIndex,
    error: chatError || null,
    retry,
    stop: stopStreaming,
    setMessages,
  };
}
