'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { z } from 'zod';

import { AiSdkStatuses, FinishReasons, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { DbUserMessageMetadata } from '@/db/schemas/chat-metadata';
import { errorCategoryToUIType, ErrorMetadataSchema, UIMessageErrorTypeSchema } from '@/lib/schemas/error-schemas';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { createErrorUIMessage, mergeParticipantMetadata } from '@/lib/utils/message-transforms';
import { getAssistantMetadata, getParticipantIndex, getRoundNumber, getUserMetadata } from '@/lib/utils/metadata';
import { deduplicateParticipants } from '@/lib/utils/participant';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';

import { useSyncedRefs } from './use-synced-refs';

/**
 * Zod schema for UseMultiParticipantChatOptions validation
 * Validates hook options at entry point to ensure type safety
 * Note: Callbacks are not validated to preserve their type signatures
 *
 * ✅ LENIENT VALIDATION: Only validates essential fields for hook operation
 * Database fields (createdAt, updatedAt) are optional to support test fixtures
 */
const UseMultiParticipantChatOptionsSchema = z
  .object({
    threadId: z.string(), // Allow empty string for initial state
    participants: z.array(z.object({
      id: z.string(),
      modelId: z.string(),
      isEnabled: z.boolean(),
      priority: z.number().int().nonnegative(),
    }).passthrough()), // Allow additional fields (database fields, etc.)
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
  /** Animation tracking: wait for animation completion */
  waitForAnimation?: (participantIndex: number) => Promise<void>;
  /** Animation tracking: clear all pending animations */
  clearAnimations?: () => void;
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
  /**
   * Continue a round from a specific participant index (used for incomplete round resumption)
   * @param fromIndex - The participant index to continue from
   * @param participantsOverride - Optional fresh participants
   */
  continueFromParticipant: (fromIndex: number, participantsOverride?: ChatParticipant[]) => void;
  /** Whether participants are currently streaming responses */
  isStreaming: boolean;
  /**
   * Ref to check streaming state synchronously (for use in async callbacks/microtasks)
   * Avoids race conditions between store state and hook state
   */
  isStreamingRef: React.MutableRefObject<boolean>;
  /** The index of the currently active participant */
  currentParticipantIndex: number;
  /** Any error that occurred during the chat */
  error: Error | null;
  /** Retry the last round (regenerate entire round from scratch - deletes all messages and re-sends user prompt) */
  retry: () => void;
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
    waitForAnimation,
    clearAnimations,
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
    mode, // ✅ FIX: Add mode to refs to prevent transport recreation
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

  // ✅ RACE CONDITION FIX: Ref to track streaming state for synchronous checks in microtasks
  // This prevents race conditions where store.isStreaming and hook.isExplicitlyStreaming are out of sync
  const isStreamingRef = useRef<boolean>(false);

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
  // ✅ TYPE-SAFE: Use DbUserMessageMetadata (without createdAt which is added by backend)
  const aiSendMessageRef = useRef<((message: { text: string; metadata?: Omit<DbUserMessageMetadata, 'createdAt'> }) => void) | null>(null);

  /**
   * Trigger the next participant using refs (safe to call from useChat callbacks)
   */
  const triggerNextParticipantWithRefs = useCallback(() => {
    // Prevent double triggers
    if (isTriggeringRef.current) {
      return;
    }

    const nextIndex = currentIndexRef.current + 1;
    let totalParticipants = roundParticipantsRef.current.length;

    // ✅ CRITICAL GUARD: Prevent premature round completion
    // If roundParticipantsRef is empty but we have participants, populate it first
    // This can happen during resumed streams or race conditions
    if (totalParticipants === 0 && participantsRef.current.length > 0) {
      const enabled = participantsRef.current.filter(p => p.isEnabled);
      roundParticipantsRef.current = enabled;
      totalParticipants = enabled.length;
    }

    // ✅ SAFETY CHECK: Don't complete round if we have no participants at all
    // This prevents triggering onComplete when participants haven't loaded yet
    if (totalParticipants === 0) {
      return;
    }

    // Round complete - reset state
    // Analysis triggering now handled automatically by store subscription
    if (nextIndex >= totalParticipants) {
      // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
      isStreamingRef.current = false;

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
    // ✅ TYPE-SAFE: Properly typed AI SDK transport message format
    ({ id, messages }: { id: string; messages: Array<{ role?: string; content?: string; id?: string; parts?: Array<{ type: string; text?: string }> }> }) => {
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
        // ✅ CRITICAL FIX: Access mode via ref to prevent transport recreation
        // Previously mode was in closure, causing callback to recreate on mode change
        // This recreated transport mid-stream, corrupting AI SDK's Chat instance state
        ...(callbackRefs.mode.current && { mode: callbackRefs.mode.current }),
        // ✅ CRITICAL FIX: Pass enableWebSearch to backend for ALL rounds
        // BUG FIX: Previously only round 0 (thread creation) included enableWebSearch
        // Now all subsequent rounds will also trigger pre-search when enabled
        // Backend uses this to create PENDING pre-search records before participant streaming
        enableWebSearch: callbackRefs.enableWebSearch.current,
      };

      return { body };
    },
    // ✅ CRITICAL FIX: Empty dependencies - callback is stable across renders
    // All dynamic values accessed via callbackRefs.*.current (stable refs)
    // This prevents transport recreation which corrupts AI SDK's Chat instance
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs is stable, all values accessed via .current
    [],
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
        // ✅ RESUMABLE STREAMS: Configure resume endpoint for stream reconnection
        // When resume: true, AI SDK calls this on mount to check for active streams
        // Returns the GET endpoint that serves buffered SSE chunks from Cloudflare KV
        //
        // Following AI SDK documentation pattern: Backend tracks active stream per thread
        // Frontend doesn't need to construct stream ID - backend looks it up
        prepareReconnectToStreamRequest: ({ id }) => {
          // ✅ FIX: Only include 'api' field when we have a valid ID
          // AI SDK v5 skips reconnection when 'api' field is omitted from returned object
          // This prevents constructing invalid endpoints like /api/v1/chat/threads//stream
          if (!id || id.trim() === '') {
            // Return object without 'api' field to signal SDK to skip reconnection
            return { credentials: 'include' };
          }

          return {
            // ✅ SIMPLIFIED: Resume endpoint looks up active stream by thread ID
            // Backend determines which stream to resume (round/participant)
            // No need to construct stream ID on frontend
            api: `/api/v1/chat/threads/${id}/stream`,
            credentials: 'include', // Required for session auth
          };
        },
      }),
    [prepareSendMessagesRequest],
    // threadId accessed in closure at call time, doesn't affect transport creation
  );

  // ✅ CRITICAL FIX: NEVER pass messages prop - use uncontrolled AI SDK
  // Problem: Passing messages makes useChat controlled, causing updates to be overwritten
  // Solution: Let AI SDK manage its own state via id-based persistence
  // We'll sync external messages using setMessages in an effect below

  const useChatId = threadId && threadId.trim() !== '' ? threadId : undefined;
  const useChatResume = !!threadId && threadId.trim() !== '';

  const {
    messages,
    sendMessage: aiSendMessage,
    status,
    error: chatError,
    setMessages,
  } = useChat({
    // ✅ CRITICAL FIX: Pass undefined instead of empty string when no thread ID
    // AI SDK's Chat class expects either valid ID or undefined, not empty string
    // Empty string causes "Cannot read properties of undefined (reading 'state')" error
    // in Chat.makeRequest because internal state initialization fails
    id: useChatId,
    transport,
    // ✅ RESUMABLE STREAMS: Enable automatic stream resumption after page reload
    // ONLY when we have a valid threadId (prevents 404s on overview page)
    // When true, useChat automatically checks for and reconnects to active streams on mount
    // Backend buffers SSE chunks to Cloudflare KV via consumeSseStream callback
    // GET endpoint at /api/v1/chat/{threadId}/stream serves buffered chunks
    resume: useChatResume,
    // ✅ NEVER pass messages - let AI SDK be uncontrolled
    // Initial hydration happens via setMessages effect below

    /**
     * Handle participant errors - create error UI and continue to next participant
     */
    onError: (error) => {
      // ✅ GUARD: Ensure roundParticipantsRef is populated before any transitions
      // This prevents premature round completion when totalParticipants is 0
      if (roundParticipantsRef.current.length === 0 && participantsRef.current.length > 0) {
        const enabled = participantsRef.current.filter(p => p.isEnabled);
        roundParticipantsRef.current = enabled;
      }

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

          // ✅ TYPE-SAFE: Convert ErrorCategory to UIMessageErrorType using mapping function
          const errorType = errorMetadata?.errorCategory
            ? errorCategoryToUIType(errorMetadata.errorCategory)
            : UIMessageErrorTypeSchema.enum.failed;

          const errorUIMessage = createErrorUIMessage(
            participant,
            currentIndex,
            errorMessage,
            errorType,
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
      // ✅ Skip phantom resume completions (no active stream to resume)
      const notOurMessageId = !data.message?.id?.includes('_r');
      const emptyParts = data.message?.parts?.length === 0;
      const noFinishReason = data.finishReason === undefined;
      const noActiveRound = roundParticipantsRef.current.length === 0;
      const notStreaming = !isStreamingRef.current;

      if (notOurMessageId && emptyParts && noFinishReason && noActiveRound && notStreaming) {
        return;
      }

      // ✅ RESUMABLE STREAMS: Detect and handle resumed stream completion
      // After page reload, refs are reset but message metadata has correct values
      // Check if this is a resumed stream by looking at the message metadata
      // ✅ TYPE-SAFE: Use metadata utility functions instead of Record<string, unknown>
      const metadataRoundNumber = getRoundNumber(data.message?.metadata);
      const metadataParticipantIndex = getParticipantIndex(data.message?.metadata);

      // Determine the actual participant index - prefer metadata for resumed streams
      let currentIndex = currentIndexRef.current;

      // ✅ CRITICAL FIX: Detect resumed stream when roundParticipantsRef is empty
      // After page reload, roundParticipantsRef is [] but we receive onFinish from resumed stream
      // Detection: roundParticipantsRef is empty AND we have valid metadata
      const isResumedStream = roundParticipantsRef.current.length === 0
        && metadataParticipantIndex !== null
        && participantsRef.current.length > 0;

      if (isResumedStream) {
        // Update refs from metadata for resumed stream
        currentIndex = metadataParticipantIndex;
        currentIndexRef.current = currentIndex;

        if (metadataRoundNumber !== null) {
          currentRoundRef.current = metadataRoundNumber;
        }

        // ✅ CRITICAL: Populate roundParticipantsRef from participantsRef
        // This MUST happen before triggerNextParticipantWithRefs checks totalParticipants
        const enabled = participantsRef.current.filter(p => p.isEnabled);
        roundParticipantsRef.current = enabled;

        // Also set streaming state since we're in the middle of a round
        setIsExplicitlyStreaming(true);
      }

      // ✅ GUARD: Ensure roundParticipantsRef is populated before any transitions
      // This prevents premature round completion when totalParticipants is 0
      if (roundParticipantsRef.current.length === 0 && participantsRef.current.length > 0) {
        const enabled = participantsRef.current.filter(p => p.isEnabled);
        roundParticipantsRef.current = enabled;
      }

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
        // ✅ TYPE-SAFE: Check for pre-search metadata without force casting
        const isPreSearch = data.message.metadata !== null
          && typeof data.message.metadata === 'object'
          && 'isPreSearch' in data.message.metadata
          && data.message.metadata.isPreSearch === true;

        if (isPreSearch) {
          // Pre-search messages already have complete metadata - skip this flow entirely
          return;
        }

        // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe metadata access
        const backendRoundNumber = getRoundNumber(data.message.metadata);
        const finalRoundNumber = backendRoundNumber ?? currentRoundRef.current;

        // 🐛 DEBUG: Log message ID received from AI SDK
        const expectedId = `${threadId}_r${finalRoundNumber}_p${currentIndex}`;

        // ✅ CRITICAL FIX: Check if message has generated text to avoid false empty_response errors
        // For some fast models (e.g., gemini-flash-lite), parts might not be populated yet when onFinish fires
        // ✅ REASONING MODELS: Include REASONING parts (DeepSeek R1, Claude thinking, etc.)
        // AI SDK v5 Pattern: Reasoning models emit type='reasoning' parts before type='text' parts
        const textParts = data.message.parts?.filter(
          p => p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING,
        ) || [];
        const hasTextInParts = textParts.some(
          part => 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
        );

        // ✅ RACE CONDITION FIX: Multiple signals for successful generation
        // Some models (DeepSeek R1, etc.) return finishReason='unknown' even on success
        const metadata = data.message.metadata;
        const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};

        // Signal 1: finishReason='stop' indicates successful completion
        const hasSuccessfulFinish = 'finishReason' in metadataObj && metadataObj.finishReason === 'stop';

        // Signal 2: Backend explicitly marked hasError=false (successful generation)
        const backendMarkedSuccess = 'hasError' in metadataObj && metadataObj.hasError === false;

        // Signal 3: Output tokens > 0 indicates content was generated
        const hasOutputTokens = Boolean(
          'usage' in metadataObj
          && metadataObj.usage
          && typeof metadataObj.usage === 'object'
          && 'completionTokens' in metadataObj.usage
          && typeof metadataObj.usage.completionTokens === 'number'
          && metadataObj.usage.completionTokens > 0,
        );

        // Signal 4: finishReason is NOT an explicit error state
        // 'unknown' is ambiguous - could be success or failure, so don't treat as error signal
        // Valid finish reasons: stop, length, tool-calls, content-filter, other, failed, unknown
        const finishReason = 'finishReason' in metadataObj ? metadataObj.finishReason : FinishReasons.UNKNOWN;
        const isExplicitErrorFinish = finishReason === FinishReasons.FAILED;

        // ✅ CRITICAL: Consider it successful if ANY positive signal is present
        // and there's no explicit error signal
        const hasGeneratedText = hasTextInParts
          || hasSuccessfulFinish
          || backendMarkedSuccess
          || hasOutputTokens
          || (!isExplicitErrorFinish && textParts.length > 0);

        // ✅ STRICT TYPING: mergeParticipantMetadata now requires roundNumber parameter
        // Returns complete AssistantMessageMetadata with ALL required fields
        const completeMetadata = mergeParticipantMetadata(
          data.message,
          participant,
          currentIndex,
          finalRoundNumber, // REQUIRED: Pass round number explicitly
          { hasGeneratedText: Boolean(hasGeneratedText) }, // REQUIRED: Tell it we have content to avoid false empty_response errors
        );

        // Use flushSync to force React to commit metadata update synchronously
        // AI SDK v5 Pattern: Prevents race conditions between sequential participants
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for multi-participant chat synchronization
        flushSync(() => {
          setMessages((prev) => {
            // ✅ CRITICAL FIX: Correct message ID if AI SDK sent wrong ID
            // AI SDK sometimes reuses message IDs from previous rounds
            // Backend sends correct ID in metadata, so use that as source of truth
            const receivedId = data.message.id;
            const correctId = expectedId;
            const needsIdCorrection = receivedId !== correctId;

            if (needsIdCorrection) {
              // This is expected behavior in multi-round conversations
              // AI SDK v5 caches messages by threadId and may reuse IDs from previous rounds
              // We correct this using the backend's deterministic ID format
            }

            const completeMessage: UIMessage = {
              ...data.message,
              id: correctId, // ✅ Use correct ID from backend metadata
              metadata: completeMetadata, // ✅ Now uses strictly typed metadata
            };

            // ✅ DETERMINISTIC IDs: No duplicate detection needed
            // Backend generates IDs using composite key: {threadId}_r{roundNumber}_p{participantId}
            // Each participant can only respond ONCE per round - collisions are impossible
            // No defensive suffix generation required
            const idToSearchFor = correctId; // Search for correct ID, not wrong one from AI SDK

            // ✅ CRITICAL FIX: Handle AI SDK message ID mismatch
            // If AI SDK sent wrong ID, we need to:
            // 1. Remove the wrongly-ID'd streaming message (if it exists)
            // 2. Add/update the message with the correct ID
            if (needsIdCorrection) {
              // Remove any message with the wrong ID from this participant AND this round
              // ✅ CRITICAL FIX: Must check BOTH participant AND round to avoid removing messages from other rounds
              const filteredMessages = prev.filter((msg: UIMessage) => {
                if (msg.id !== receivedId)
                  return true; // Keep messages with different IDs

                // ✅ TYPE-SAFE: Use extraction utility instead of force casting
                const msgMetadata = getAssistantMetadata(msg.metadata);
                const msgRoundNumber = getRoundNumber(msg.metadata);

                // Remove ONLY if it's from the same participant AND same round
                // This prevents removing legitimate messages from other rounds with the same ID pattern
                const sameParticipant = msgMetadata?.participantId === participant.id;
                const sameRound = msgRoundNumber === finalRoundNumber;

                // Remove if BOTH participant and round match (this is the wrongly-ID'd streaming message)
                // Keep if either doesn't match (legitimate message from another round)
                return !(sameParticipant && sameRound);
              });

              // Check if correct ID already exists (from previous completion or DB load)
              const correctIdExists = filteredMessages.some(msg => msg.id === correctId);

              if (correctIdExists) {
                // Update existing message with correct ID
                return filteredMessages.map((msg: UIMessage) =>
                  msg.id === correctId ? completeMessage : msg,
                );
              } else {
                // Add new message with correct ID
                return [...filteredMessages, completeMessage];
              }
            }

            // ✅ STRICT TYPING FIX: Check if message exists AND belongs to current participant AND current round
            // No more loose optional chaining - completeMetadata has ALL required fields
            // ✅ CRITICAL FIX: Search for idToSearchFor (original ID if we changed it, otherwise the current ID)
            const existingMessageIndex = prev.findIndex((msg: UIMessage) => {
              if (msg.id !== idToSearchFor)
                return false;

              // ✅ TYPE-SAFE: Use extraction utility instead of force casting
              const msgMetadata = getAssistantMetadata(msg.metadata);

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
                // ✅ TYPE-SAFE: Use extraction utility instead of force casting
                const dupMetadata = getAssistantMetadata(duplicateMsg.metadata);
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

        // ✅ BUG FIX: Skip animation wait for error messages
        // Error messages from backend (hasError=true) never go through streaming phase
        // They're rendered immediately with status='failed', so no animation to wait for
        // If we wait, the animation never completes and next participant never starts
        const hasErrorInMetadata = completeMetadata?.hasError === true;

        if (hasErrorInMetadata) {
          // Error messages don't animate - trigger next participant immediately
          await new Promise(resolve => requestAnimationFrame(resolve));
          triggerNextParticipantWithRefs();
          return;
        }
      }

      // CRITICAL: Wait for animation to complete before triggering next participant
      // This ensures the typing animation finishes before starting the next one
      // flushSync above ensures React commits the metadata update
      // waitForAnimation resolves when ModelMessageCard signals animation complete
      // THEN we trigger the next participant
      const triggerWithAnimationWait = async () => {
        // Normal flow for successful responses: wait for animation
        await new Promise(resolve => requestAnimationFrame(resolve));

        // ✅ FIX: Wait for current participant's animation
        if (waitForAnimation) {
          await waitForAnimation(currentIndex);
        }

        // Now trigger next participant
        triggerNextParticipantWithRefs();
      };

      triggerWithAnimationWait();
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
   * ✅ CRITICAL FIX: Sync external messages ONLY for initial hydration
   *
   * Problem: Syncing continuously overwrites AI SDK's internal updates from sendMessage
   * Solution: Only sync when AI SDK is empty and we have messages to hydrate
   *
   * Scenarios:
   * 1. ChatOverviewScreen → Thread created → Backend returns messages → Hydrate AI SDK
   * 2. ChatThreadScreen loads → Fetch thread → Backend returns messages → Hydrate AI SDK
   * 3. After hydration → AI SDK manages its own state → DON'T sync again
   *
   * AI SDK persists state per threadId, so we only need to hydrate on first load,
   * not on every prop change.
   */
  const hasHydratedRef = useRef(false);
  useLayoutEffect(() => {
    // Only hydrate if:
    // 1. Haven't hydrated yet for this hook instance
    // 2. AI SDK has no messages (empty state)
    // 3. We have external messages to hydrate with
    const shouldHydrate
      = !hasHydratedRef.current
        && messages.length === 0
        && initialMessages
        && initialMessages.length > 0;

    if (shouldHydrate) {
      setMessages(initialMessages);
      hasHydratedRef.current = true;
    }
  }, [messages.length, initialMessages, setMessages]);

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

    // ✅ Guards: Wait for dependencies to be ready (effect will retry)
    if (messages.length === 0 || status !== AiSdkStatuses.READY || isExplicitlyStreaming || isTriggeringRef.current) {
      return;
    }

    // Set lock to prevent concurrent calls
    isTriggeringRef.current = true;

    const uniqueParticipants = deduplicateParticipants(currentParticipants);
    const enabled = uniqueParticipants.filter(p => p.isEnabled);

    if (enabled.length === 0) {
      isTriggeringRef.current = false;
      return;
    }

    const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);

    if (!lastUserMessage) {
      isTriggeringRef.current = false;
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      isTriggeringRef.current = false;
      return;
    }

    // Get round number from the last user message
    // startRound is called to trigger participants for an EXISTING user message
    // The user message already has the correct roundNumber in its metadata
    const roundNumber = getCurrentRoundNumber(messages);

    // CRITICAL: Update refs FIRST to avoid race conditions
    // These refs are used in prepareSendMessagesRequest and must be set before the API call
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    roundParticipantsRef.current = enabled;
    currentRoundRef.current = roundNumber;
    lastUsedParticipantIndex.current = null; // Reset for new round

    // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
    // This prevents race condition where pendingMessage effect checks ref
    // before React re-renders with new isExplicitlyStreaming state
    isStreamingRef.current = true;

    // Reset all state for new round
    setIsExplicitlyStreaming(true);
    setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
    setCurrentRound(roundNumber);
    resetErrorTracking();
    clearAnimations?.(); // Clear any pending animations from previous round

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

    // Release lock after message is sent
    // Use requestAnimationFrame to release after browser paint cycle
    requestAnimationFrame(() => {
      isTriggeringRef.current = false;
    });
  }, [messages, status, resetErrorTracking, clearAnimations, isExplicitlyStreaming, aiSendMessage]);
  // Note: participantsOverride comes from caller, not deps
  // callbackRefs provides stable ref access to threadId (no deps needed)

  /**
   * Continue a round from a specific participant index
   * Used for incomplete round resumption when user navigates away during streaming
   * and returns later to find some participants have responded but not all
   *
   * @param fromIndex - The participant index to continue from (0-based)
   * @param participantsOverride - Optional fresh participants to use
   */
  const continueFromParticipant = useCallback((fromIndex: number, participantsOverride?: ChatParticipant[]) => {
    // ✅ CRITICAL FIX: Allow caller to pass fresh participants (from store subscription)
    const currentParticipants = participantsOverride || participantsRef.current;

    // ✅ Guards: Wait for dependencies to be ready
    if (messages.length === 0 || status !== AiSdkStatuses.READY || isExplicitlyStreaming || isTriggeringRef.current) {
      return;
    }

    // Set lock to prevent concurrent calls
    isTriggeringRef.current = true;

    const uniqueParticipants = deduplicateParticipants(currentParticipants);
    const enabled = uniqueParticipants.filter(p => p.isEnabled);

    if (enabled.length === 0) {
      isTriggeringRef.current = false;
      return;
    }

    // Validate fromIndex is within bounds
    if (fromIndex < 0 || fromIndex >= enabled.length) {
      isTriggeringRef.current = false;
      return;
    }

    const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);

    if (!lastUserMessage) {
      isTriggeringRef.current = false;
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      isTriggeringRef.current = false;
      return;
    }

    // Get round number from the last user message
    const roundNumber = getCurrentRoundNumber(messages);

    // CRITICAL: Update refs to start from the specified participant index
    currentIndexRef.current = fromIndex;
    roundParticipantsRef.current = enabled;
    currentRoundRef.current = roundNumber;
    lastUsedParticipantIndex.current = null; // Reset for new continuation

    // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
    isStreamingRef.current = true;

    // Reset state for continuation
    setIsExplicitlyStreaming(true);
    setCurrentParticipantIndex(fromIndex);
    setCurrentRound(roundNumber);
    resetErrorTracking();
    clearAnimations?.(); // Clear any pending animations

    // ✅ CRITICAL FIX: Push participant index to queue before calling aiSendMessage
    participantIndexQueue.current.push(fromIndex);

    // Trigger streaming for the specified participant
    aiSendMessage({
      text: userText,
      metadata: {
        role: 'user',
        roundNumber,
        isParticipantTrigger: true,
      },
    });

    // Release lock after message is sent
    requestAnimationFrame(() => {
      isTriggeringRef.current = false;
    });
  }, [messages, status, resetErrorTracking, clearAnimations, isExplicitlyStreaming, aiSendMessage]);

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

      // Guard: Prevent concurrent calls using triggering lock
      if (isTriggeringRef.current) {
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      // Set lock to prevent concurrent calls
      isTriggeringRef.current = true;

      // AI SDK v5 Pattern: Simple, straightforward participant filtering
      const uniqueParticipants = deduplicateParticipants(participants);
      const enabled = uniqueParticipants.filter(p => p.isEnabled);

      if (enabled.length === 0) {
        isTriggeringRef.current = false;
        throw new Error('No enabled participants');
      }

      // CRITICAL: Update refs FIRST to avoid race conditions
      // These refs are used in prepareSendMessagesRequest and must be set before the API call
      currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
      roundParticipantsRef.current = enabled;
      lastUsedParticipantIndex.current = null; // Reset for new round

      // ✅ CRITICAL FIX: Validate regenerate round matches current round
      // If regenerateRoundNumberRef is set but doesn't match current round,
      // it's stale state from a previous operation - clear it
      const currentRound = getCurrentRoundNumber(messages);
      const isActuallyRegenerating = regenerateRoundNumberRef.current !== null
        && regenerateRoundNumberRef.current === currentRound;

      // Use regenerate round number if retrying current round, otherwise calculate next
      const newRoundNumber = isActuallyRegenerating
        ? regenerateRoundNumberRef.current!
        : calculateNextRoundNumber(messages);

      // Clear regenerate flag if we're not actually regenerating
      if (!isActuallyRegenerating) {
        regenerateRoundNumberRef.current = null;
      }

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

      // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
      // This prevents race condition where pendingMessage effect checks ref
      // before React re-renders with new isExplicitlyStreaming state
      isStreamingRef.current = true;

      // AI SDK v5 Pattern: Synchronization for proper message ordering
      // Reset all state for new round
      setIsExplicitlyStreaming(true);
      setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
      setCurrentRound(newRoundNumber);
      resetErrorTracking();
      clearAnimations?.(); // Clear any pending animations from previous round

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

      // Release lock after message is sent
      // Use requestAnimationFrame to release after browser paint cycle
      requestAnimationFrame(() => {
        isTriggeringRef.current = false;
      });
    },
    [participants, status, aiSendMessage, messages, resetErrorTracking, clearAnimations, isExplicitlyStreaming],
    // callbackRefs provides stable ref access to threadId (no deps needed)
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
    // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
    isStreamingRef.current = false;
    setIsExplicitlyStreaming(false);

    // CRITICAL: Update ref BEFORE setting state
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    lastUsedParticipantIndex.current = null; // Reset for retry

    // Update participant index synchronously (no flushSync needed)
    setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);

    resetErrorTracking();
    clearAnimations?.(); // Clear any pending animations before retry
    isTriggeringRef.current = false;

    // STEP 5: Send message to start regeneration (as if user just sent the message)
    // This will create a new round with fresh messages (user + assistant)
    // React will batch the state updates naturally
    // The sendMessage function will handle participant orchestration properly
    sendMessage(userPromptText);
    // Note: callbackRefs not in deps - we use callbackRefs.onRetry.current to always get latest value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sendMessage, status, setMessages, resetErrorTracking, clearAnimations]);

  // ✅ RESUMABLE STREAMS: Stop functionality removed
  // Stream resumption is incompatible with abort signals
  // Streams now continue until completion and can resume after page reload

  // ✅ CRITICAL FIX: Derive isStreaming from manual flag as primary source of truth
  // AI SDK v5 Pattern: status can be 'ready' | 'streaming' | 'awaiting_message'
  // - isExplicitlyStreaming: Our manual flag for participant orchestration
  // - We rely primarily on isExplicitlyStreaming which is set/cleared by our logic
  // - This prevents false positives on initial mount when status='awaiting_message'
  // ✅ ENUM PATTERN: Use isExplicitlyStreaming as single source of truth
  const isActuallyStreaming = isExplicitlyStreaming;

  // ✅ RACE CONDITION FIX: Keep ref in sync with streaming state
  // This allows synchronous checks in microtasks to use the latest value
  isStreamingRef.current = isActuallyStreaming;

  return {
    messages,
    sendMessage,
    startRound,
    continueFromParticipant,
    isStreaming: isActuallyStreaming,
    isStreamingRef,
    currentParticipantIndex,
    error: chatError || null,
    retry,
    setMessages,
  };
}
