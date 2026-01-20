import { useChat } from '@ai-sdk/react';
import { AiSdkStatuses, FinishReasons, MessagePartTypes, MessageRoles, TextPartStates, UIMessageErrorTypeSchema, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { z } from 'zod';

import { errorCategoryToUIType, ErrorMetadataSchema } from '@/lib/schemas/error-schemas';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { extractValidFileParts, isRenderableContent, isValidFilePartForTransmission } from '@/lib/schemas/message-schemas';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { calculateNextRoundNumber, createErrorUIMessage, deduplicateParticipants, getAssistantMetadata, getAvailableSources, getCurrentRoundNumber, getEnabledParticipants, getParticipantIndex, getRoundNumber, getUserMetadata, isObject, isPreSearch, mergeParticipantMetadata } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatParticipant, DbUserMessageMetadata } from '@/services/api';

import { useSyncedRefs } from './use-synced-refs';

/**
 * ✅ FIX: Sanitize messages for AI SDK hydration
 * Handles malformed messages that have streaming text parts after page refresh.
 * These cause "Cannot read properties of undefined (reading 'text')" errors
 * during AI SDK's resumeStream operation.
 *
 * The fix: Mark all streaming text parts as 'done' to prevent AI SDK from
 * attempting to resume them (which fails with malformed message structures).
 */
function sanitizeMessagesForAiSdk(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    // Only process assistant messages (user messages don't have streaming state)
    if (msg.role !== MessageRoles.ASSISTANT) {
      return msg;
    }

    // ✅ FIX: Handle messages with null/undefined/empty parts
    // AI SDK expects valid parts array - malformed parts cause "Cannot read properties of undefined (reading 'text')"
    if (!msg.parts || !Array.isArray(msg.parts) || msg.parts.length === 0) {
      // Return message with empty parts array to prevent AI SDK errors
      return msg;
    }

    // ✅ FIX: Filter and sanitize parts to prevent AI SDK errors
    // 1. Remove null/undefined parts
    // 2. Ensure text/reasoning parts have valid 'text' property
    // 3. Mark streaming parts as done
    const clonedMsg = structuredClone(msg);
    const sanitizedParts: typeof clonedMsg.parts = [];

    for (const part of clonedMsg.parts) {
      // Skip null/undefined parts
      if (!part || typeof part !== 'object') {
        continue;
      }

      // Handle text parts - ensure they have valid text property
      if (part.type === MessagePartTypes.TEXT || part.type === MessagePartTypes.REASONING) {
        // ✅ FIX: Ensure text property exists and is a string
        // AI SDK accesses part.text directly, causing error if undefined
        if (!('text' in part) || typeof part.text !== 'string') {
          // Skip malformed text parts or create with empty string
          sanitizedParts.push({
            ...part,
            text: '',
            // Mark as done to prevent resume attempts
            ...('state' in part ? { state: 'done' } : {}),
          });
          continue;
        }

        // Mark streaming text parts as done
        if ('state' in part && part.state === TextPartStates.STREAMING) {
          sanitizedParts.push({ ...part, state: 'done' });
        } else {
          sanitizedParts.push(part);
        }
      } else {
        // Non-text parts (tool-invocation, etc.) - pass through
        sanitizedParts.push(part);
      }
    }

    clonedMsg.parts = sanitizedParts;
    return clonedMsg;
  });
}

/**
 * Zod schema for UseMultiParticipantChatOptions validation
 * Validates hook options at entry point to ensure type safety
 * Note: Callbacks are not validated to preserve their type signatures
 *
 * ✅ LENIENT VALIDATION: Only validates essential fields for hook operation
 * Database fields (createdAt, updatedAt) are optional to support test fixtures
 */
/**
 * ✅ TYPE-SAFE: Participant settings schema (inferred from ParticipantConfigSchema)
 * Matches the settings field from /src/lib/schemas/participant-schemas.ts
 */
const ParticipantSettingsValidationSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  })
  .nullable()
  .optional();

const UseMultiParticipantChatOptionsSchema = z.object({
  threadId: z.string(), // Allow empty string for initial state
  participants: z.array(z.object({
    id: z.string(),
    modelId: z.string(),
    isEnabled: z.boolean(),
    priority: z.number().int().nonnegative(),
    // Database fields that may be present
    threadId: z.string().optional(),
    customRoleId: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    settings: ParticipantSettingsValidationSchema,
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })),
  messages: z.array(z.custom<UIMessage>()).optional(),
  mode: z.string().optional(),
  regenerateRoundNumber: z.number().int().nonnegative().optional(), // ✅ 0-BASED: Allow round 0
  // Callbacks are not validated - they pass through via TypeScript types
});

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
  /** Pending attachment IDs to associate with the user message */
  pendingAttachmentIds?: string[] | null;
  /**
   * Pending file parts to include in AI SDK message
   * These are passed to sendMessage so AI SDK creates user message with file parts
   * Required for file attachments to appear in UI without full page refresh
   * Uses ExtendedFilePart to support uploadId fallback for PDFs with empty previewUrls
   */
  pendingFileParts?: ExtendedFilePart[] | null;
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
  /** Animation tracking: clear all pending animations */
  clearAnimations?: () => void;
  /** Animation tracking: complete animation for a specific participant */
  completeAnimation?: (participantIndex: number) => void;
  /**
   * ✅ RACE CONDITION FIX: Flag indicating a form submission is in progress
   * When true, prevents resumed stream detection from setting isStreaming=true
   * This avoids a deadlock state where isStreaming=true but pendingMessage=null
   */
  hasEarlyOptimisticMessage?: boolean;
  /**
   * ✅ RESUMABLE STREAMS: Flag indicating server prefilled resumption state
   * When true, skips phantom resume detection to let incomplete-round-resumption handle continuation
   */
  streamResumptionPrefilled?: boolean;
  /**
   * ✅ STREAM RESUMPTION: Callback when a resumed stream completes but participants aren't loaded yet
   * This allows the store to queue the next participant trigger for when participants load
   */
  onResumedStreamComplete?: (roundNumber: number, participantIndex: number) => void;
  /**
   * ✅ PERF FIX: Flag indicating thread was just created in this session
   * When true, disables automatic stream resume since there's nothing to resume for new threads
   * This prevents wasteful GET /stream calls on thread creation
   */
  isNewlyCreatedThread?: boolean;
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
   * @param messagesOverride - Optional fresh messages (used to avoid stale closure in queueMicrotask)
   */
  startRound: (participantsOverride?: ChatParticipant[], messagesOverride?: UIMessage[]) => void;
  /**
   * Continue a round from a specific participant index (used for incomplete round resumption)
   * @param fromIndexOrTarget - The participant index or object with index + participantId for validation
   * @param participantsOverride - Optional fresh participants
   * @param messagesOverride - Optional fresh messages (used to avoid stale closure)
   */
  continueFromParticipant: (
    fromIndexOrTarget: number | { index: number; participantId: string },
    participantsOverride?: ChatParticipant[],
    messagesOverride?: UIMessage[],
  ) => void;
  /** Whether participants are currently streaming responses */
  isStreaming: boolean;
  /**
   * Ref to check streaming state synchronously (for use in async callbacks/microtasks)
   * Avoids race conditions between store state and hook state
   */
  isStreamingRef: React.RefObject<boolean>;
  /**
   * Ref to check if a trigger is in progress (for provider guards)
   * Prevents race conditions between startRound and pendingMessage effects
   */
  isTriggeringRef: React.RefObject<boolean>;
  /** The index of the currently active participant */
  currentParticipantIndex: number;
  /** Any error that occurred during the chat */
  error: Error | null;
  /** Retry the last round (regenerate entire round from scratch - deletes all messages and re-sends user prompt) */
  retry: () => void;
  /** Manually set messages (used for optimistic updates or message deletion) */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  /**
   * Whether the AI SDK is ready to accept new messages
   * Used by provider to delay continueFromParticipant until SDK is initialized
   */
  isReady: boolean;
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
 * AI SDK v6 Pattern: Message Metadata Flow
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
    pendingAttachmentIds = null,
    pendingFileParts = null,
    onPreSearchStart,
    onPreSearchQuery,
    onPreSearchResult,
    onPreSearchComplete,
    onPreSearchError,
    clearAnimations,
    completeAnimation,
    hasEarlyOptimisticMessage = false,
    streamResumptionPrefilled = false,
    onResumedStreamComplete,
    isNewlyCreatedThread = false,
  } = options;

  // ✅ CONSOLIDATED: Sync all callbacks and state values into refs
  // Prevents stale closures by keeping refs in sync with latest values
  // Uses useSyncedRefs to reduce boilerplate (replaces 9 separate useLayoutEffect calls)
  //
  // NOTE: useEffectEvent would be ideal here but React's rules-of-hooks linter
  // restricts it to only being called from inside effects, not stored in objects.
  // useSyncedRefs achieves the same goal: stable references that read latest values.
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
    pendingAttachmentIds, // ✅ ATTACHMENTS: Pass attachment IDs to streaming request
    pendingFileParts, // ✅ ATTACHMENTS: Pass file parts for AI SDK message (display in UI)
    mode, // ✅ FIX: Add mode to refs to prevent transport recreation
    hasEarlyOptimisticMessage, // ✅ RACE CONDITION FIX: Track submission in progress
    onResumedStreamComplete, // ✅ STREAM RESUMPTION: Queue next participant when participants aren't loaded
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
  // ✅ RACE CONDITION FIX: Track processed message IDs to prevent double-processing in onFinish
  // AI SDK may call onFinish multiple times or the same message may complete while we're awaiting RAF
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  const resetErrorTracking = useCallback(() => {
    respondedParticipantsRef.current.clear();
    processedMessageIdsRef.current.clear();
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

  // ✅ RACE CONDITION FIX: Track which participants have been queued this round
  // Prevents duplicate network requests when multiple entry points trigger concurrently
  // Key: participantIndex, Value: true if queued
  // Reset at start of each round (in startRound/sendMessage)
  const queuedParticipantsThisRoundRef = useRef<Set<number>>(new Set());

  // ✅ PHANTOM GUARD: Track which (round, participantIndex) pairs have already triggered next participant
  // AI SDK calls onFinish multiple times for the same message (phantom calls)
  // This prevents duplicate triggerNextParticipantWithRefs() calls before round completes
  // Key format: "r{round}_p{participantIndex}"
  const triggeredNextForRef = useRef<Set<string>>(new Set());

  // ✅ CRITICAL FIX: Track expected user message ID for backend lookup
  // AI SDK's sendMessage creates messages with its own nanoid-style IDs, but user messages
  // are pre-persisted via PATCH/POST with backend ULIDs. This ref allows us to pass the
  // correct ID to the streaming endpoint so backend can find the pre-persisted message.
  const expectedUserMessageIdRef = useRef<string | null>(null);

  // Refs to hold values needed for triggering (to avoid closure issues in callbacks)
  const messagesRef = useRef<UIMessage[]>([]);
  // ✅ TYPE-SAFE: Use DbUserMessageMetadata (without createdAt which is added by backend)
  const aiSendMessageRef = useRef<((message: { text: string; metadata?: Omit<DbUserMessageMetadata, 'createdAt'> }) => void) | null>(null);

  // Track previous threadId for navigation reset (effect defined after hasHydratedRef)
  const prevThreadIdRef = useRef<string>(threadId);

  // ✅ UNMOUNT GUARD: Track component lifecycle to prevent stale sendMessage calls
  // AI SDK's internal state may be cleared on unmount, causing "Cannot read properties of undefined (reading 'state')"
  const isMountedRef = useRef<boolean>(true);

  /**
   * Trigger the next participant using refs (safe to call from useChat callbacks)
   */
  const triggerNextParticipantWithRefs = useCallback(() => {
    // Prevent double triggers
    if (isTriggeringRef.current) {
      return;
    }

    let totalParticipants = roundParticipantsRef.current.length;

    // ✅ CRITICAL GUARD: Prevent premature round completion
    // If roundParticipantsRef is empty but we have participants, populate it first
    // This can happen during resumed streams or race conditions
    // Store guarantees participants are sorted by priority
    if (totalParticipants === 0 && participantsRef.current.length > 0) {
      const enabled = getEnabledParticipants(participantsRef.current);
      roundParticipantsRef.current = enabled;
      totalParticipants = enabled.length;
    }

    // ✅ BUG FIX: Detect stale roundParticipantsRef when participant config changed between rounds
    // When user changes participants (add/remove/enable/disable) between rounds:
    // - roundParticipantsRef still has OLD participants from previous round
    // - participantsRef has CURRENT participants
    // - Round completion check uses OLD count, causing system to wait for non-existent participants
    // or triggering onComplete prematurely
    // Solution: Compare IDs and use current count if participants changed
    // Store guarantees participants are sorted by priority
    const currentEnabled = getEnabledParticipants(participantsRef.current);
    const roundParticipantIds = new Set(roundParticipantsRef.current.map(p => p.id));
    const currentParticipantIds = new Set(currentEnabled.map(p => p.id));

    // Check if participants changed (different IDs or different count)
    const participantsChanged = roundParticipantIds.size !== currentParticipantIds.size
      || ![...currentParticipantIds].every(id => roundParticipantIds.has(id));

    if (participantsChanged && currentEnabled.length > 0) {
      // ✅ BUG FIX: Update BOTH totalParticipants AND roundParticipantsRef
      // Previously only updated totalParticipants, causing subsequent lookups
      // (e.g., in onFinish) to use wrong/old participants from stale ref
      // This caused participant 1 to not be triggered correctly after config changes
      totalParticipants = currentEnabled.length;
      roundParticipantsRef.current = currentEnabled;
    }

    // ✅ SAFETY CHECK: Don't complete round if we have no participants at all
    // This prevents triggering onComplete when participants haven't loaded yet
    if (totalParticipants === 0) {
      return;
    }

    // ✅ CRITICAL FIX: Check for missing/incomplete participants before incrementing
    // Bug: During stream resumption, P1 might finish but P0 never responded
    // Bug 2: P1 might have a partial message (interrupted stream) that looks like it responded
    // Old logic: nextIndex = currentIndex + 1 (blindly skips P0)
    // New logic: Find first participant without a COMPLETE message in current round
    const currentRound = currentRoundRef.current;

    // ✅ DEBUG: Log message state before recovery check
    const allMsgs = messagesRef.current;
    const assistantMsgsInRound = allMsgs.filter((m) => {
      if (m.role !== MessageRoles.ASSISTANT)
        return false;
      const md = m.metadata;
      if (!md || typeof md !== 'object')
        return false;
      if ('isModerator' in md && md.isModerator === true)
        return false;
      const msgRound = 'roundNumber' in md ? md.roundNumber : null;
      return msgRound === currentRound;
    });
    rlog.trigger('check', `r${currentRound} idx=${currentIndexRef.current} total=${totalParticipants} assistInRnd=${assistantMsgsInRound.length}`);

    const participantIndicesWithCompleteMessages = new Set<number>();
    for (const msg of messagesRef.current) {
      if (msg.role !== MessageRoles.ASSISTANT)
        continue;
      const metadata = msg.metadata;
      if (!metadata || typeof metadata !== 'object')
        continue;
      // Skip moderator messages
      if ('isModerator' in metadata && metadata.isModerator === true)
        continue;
      // Check if message is for current round
      const msgRound = 'roundNumber' in metadata ? metadata.roundNumber : null;
      if (msgRound !== currentRound)
        continue;

      // ✅ FIX: Check if message is COMPLETE, not just exists
      // A message is incomplete ONLY if:
      // - Any text part has state='streaming' (still actively streaming)
      // - hasError is true (explicit error from backend)
      // NOTE: finishReason='unknown' is NOT a reliable indicator - many complete
      // messages have this value. Only rely on explicit signals.
      const hasError = 'hasError' in metadata ? metadata.hasError : false;
      const hasStreamingParts = msg.parts?.some(
        p => 'state' in p && p.state === TextPartStates.STREAMING,
      );
      // Only explicit errors or active streaming indicate incompleteness
      const isIncomplete = hasError === true || hasStreamingParts === true;

      if (isIncomplete) {
        continue;
      }

      // Get participant index for complete messages only
      if ('participantIndex' in metadata && typeof metadata.participantIndex === 'number') {
        participantIndicesWithCompleteMessages.add(metadata.participantIndex);
      }
    }

    // Find first participant without a COMPLETE message (0 to totalParticipants-1)
    // ✅ FIX: Default to totalParticipants (round complete) - only set lower if incomplete found
    let nextIndex = totalParticipants;
    for (let i = 0; i < totalParticipants; i++) {
      if (!participantIndicesWithCompleteMessages.has(i)) {
        // Found a participant without a complete message - trigger them
        // Clear from queue if they were previously queued but message is missing
        if (queuedParticipantsThisRoundRef.current.has(i)) {
          queuedParticipantsThisRoundRef.current.delete(i);
        }
        nextIndex = i;
        break;
      }
    }

    // Round complete - reset state
    // Moderator triggering now handled automatically by store subscription
    if (nextIndex >= totalParticipants) {
      // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
      isStreamingRef.current = false;

      // ✅ PHANTOM GUARD: Increment round ref so phantom calls from previous round are blocked
      // Without this, phantom onFinish calls would see `msgRound < currentRoundRef` as false
      // because currentRoundRef would still be the old round number
      currentRoundRef.current = currentRoundRef.current + 1;

      // eslint-disable-next-line react-dom/no-flush-sync -- Required for moderator trigger synchronization
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
    rlog.trigger('next', `P${nextIndex} r${currentRound} done=[${[...participantIndicesWithCompleteMessages]}]`);
    isTriggeringRef.current = true;

    // Race condition fix: Check if participant is already queued
    if (queuedParticipantsThisRoundRef.current.has(nextIndex)) {
      isTriggeringRef.current = false;
      return;
    }

    // CRITICAL: Update ref BEFORE setting state to avoid race condition
    // The prepareSendMessagesRequest reads from currentIndexRef.current
    // so we must update it synchronously before calling aiSendMessage
    currentIndexRef.current = nextIndex;

    // CRITICAL FIX: Use flushSync to ensure participant index update is committed BEFORE triggering next participant
    // Without flushSync, React batches this state update and may re-render with the new index
    // before the first participant's message metadata is properly evaluated, causing both messages
    // to show the second participant's icon/name during the batched render.
    // AI SDK v6 Pattern: Prevents UI from showing wrong participant info during sequential streaming
    // eslint-disable-next-line react-dom/no-flush-sync -- Required for multi-participant chat synchronization
    flushSync(() => {
      setCurrentParticipantIndex(nextIndex);
    });

    // Find the last user message using ref
    const lastUserMessage = [...messagesRef.current].reverse().find((m: UIMessage) => m.role === MessageRoles.USER);
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

    // ✅ CRITICAL FIX: Extract file parts from existing user message for participant 1+
    // Without this, participant 1+ sends only text - model never sees uploaded files
    // Uses shared extractValidFileParts utility for consistent file part handling
    // Backend can use uploadId fallback to load content from R2 for parts with empty URLs
    const fileParts = extractValidFileParts(lastUserMessage.parts);

    // ✅ CRITICAL FIX: Push participant index to queue BEFORE calling aiSendMessage
    // Mark as queued to prevent duplicate triggers
    queuedParticipantsThisRoundRef.current.add(nextIndex);
    participantIndexQueue.current.push(nextIndex);

    // DEBUG: Verbose queue tracing disabled

    // ✅ CRITICAL FIX: Use queueMicrotask and try-catch to handle AI SDK state errors
    // Same pattern as startRound for consistent error handling
    //
    // ✅ CRITICAL: isTriggeringRef stays TRUE until async work completes
    if (aiSendMessageRef.current) {
      queueMicrotask(async () => {
        // ✅ UNMOUNT GUARD: Re-check refs inside microtask to handle race conditions
        // Component may unmount or AI SDK may reinitialize between scheduling and execution
        // This prevents "Cannot read properties of undefined (reading 'state')" errors
        if (!isMountedRef.current || !aiSendMessageRef.current) {
          isTriggeringRef.current = false;
          return;
        }

        const sendMessage = aiSendMessageRef.current;

        try {
          await sendMessage({
            text: userText,
            // ✅ CRITICAL FIX: Include file parts so AI SDK sends them to participant 1+
            // Bug: Without files, backend receives message without file parts, causing
            // "Invalid file URL: filename" errors when AI provider uses filename as fallback URL
            ...(fileParts.length > 0 && { files: fileParts }),
            metadata: {
              role: UIMessageRoles.USER,
              roundNumber: currentRoundRef.current,
              isParticipantTrigger: true,
            },
          });
          // ✅ SUCCESS: Reset trigger lock after aiSendMessage succeeds
          isTriggeringRef.current = false;
        } catch (error) {
          // ✅ GRACEFUL ERROR HANDLING: Reset state to allow retry
          console.error('[triggerNextParticipant] aiSendMessage failed, resetting state:', error);
          isStreamingRef.current = false;
          isTriggeringRef.current = false;
          queuedParticipantsThisRoundRef.current.clear();
          participantIndexQueue.current = [];
          lastUsedParticipantIndex.current = null;
        }
      });
    } else {
      // No sendMessage ref available, reset immediately
      isTriggeringRef.current = false;
    }
    // ✅ NOTE: isTriggeringRef is NOT reset here - it stays true until async work completes
    // Note: callbackRefs not in deps - we use callbackRefs.onComplete.current to always get latest value
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs.onComplete accessed via .current (ref pattern)
  }, [resetErrorTracking]);

  /**
   * Prepare request body for AI SDK chat transport
   *
   * AI SDK v6 Pattern: Use callback to access refs safely
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
        const shiftedIndex = participantIndexQueue.current.shift();
        participantIndexToUse = shiftedIndex ?? currentIndexRef.current;
        lastUsedParticipantIndex.current = participantIndexToUse;
      } else if (lastUsedParticipantIndex.current !== null) {
        // Same participant (retry/duplicate call) - reuse last index without shifting queue
        participantIndexToUse = lastUsedParticipantIndex.current;
      } else {
        // Fallback to current index ref (shouldn't normally happen)
        participantIndexToUse = currentIndexRef.current;
      }

      // ✅ ATTACHMENTS: Only send attachment IDs with first participant (when user message is created)
      const attachmentIdsForRequest = participantIndexToUse === 0
        ? (callbackRefs.pendingAttachmentIds.current || undefined)
        : undefined;

      // ✅ DEBUG: Log attachment IDs being sent
      rlog.msg('cite-send', `pIdx=${participantIndexToUse} pending=${callbackRefs.pendingAttachmentIds.current?.length ?? 0} sending=${attachmentIdsForRequest?.length ?? 0}`);

      // ✅ SANITIZATION: Filter message parts for backend transmission
      // Uses shared isValidFilePartForTransmission type guard for consistent handling
      // - Keeps all non-file parts (text, etc.)
      // - Keeps file parts with valid URL or uploadId (backend uses uploadId fallback)
      // - Filters out file parts with neither (invalid blob/empty URLs without uploadId)
      const lastMessage = messages[messages.length - 1];
      const sanitizedMessage = lastMessage && lastMessage.parts
        ? {
            ...lastMessage,
            parts: lastMessage.parts.filter((part) => {
              // Keep non-file parts (text, etc.)
              if (part.type !== 'file')
                return true;
              // For file parts, use shared validation logic
              return isValidFilePartForTransmission(part);
            }),
          }
        : lastMessage;

      const body = {
        id,
        message: sanitizedMessage,
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
        // ✅ ATTACHMENTS: Include attachment IDs for message association (first participant only)
        ...(attachmentIdsForRequest && attachmentIdsForRequest.length > 0 && { attachmentIds: attachmentIdsForRequest }),
        // ✅ CRITICAL FIX: Pass expected user message ID for backend DB lookup
        // AI SDK's sendMessage creates messages with its own nanoid-style IDs, but user messages
        // are pre-persisted via PATCH/POST with backend ULIDs. This allows backend to find the
        // correct pre-persisted message instead of using AI SDK's generated ID.
        ...(expectedUserMessageIdRef.current && participantIndexToUse === 0 && { userMessageId: expectedUserMessageIdRef.current }),
      };

      return { body };
    },
    // ✅ CRITICAL FIX: Empty dependencies - callback is stable across renders
    // All dynamic values accessed via callbackRefs.*.current (stable refs)
    // This prevents transport recreation which corrupts AI SDK's Chat instance
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs is stable, all values accessed via .current
    [],
  );

  // AI SDK v6 Pattern: Create transport with callback that accesses refs safely
  // Reference: https://github.com/vercel/ai/blob/ai_6_0_0/content/cookbook/01-next/80-send-custom-body-from-use-chat.mdx
  // The prepareSendMessagesRequest callback is invoked by the transport at request time (not during render),
  // so accessing refs inside the callback is safe and follows the recommended AI SDK v6 pattern.
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
          // AI SDK v6 skips reconnection when 'api' field is omitted from returned object
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

    // ✅ DEBUG: Log all streaming data parts to trace when metadata arrives
    onData: (dataPart) => {
      rlog.msg('cite-data', `type=${dataPart?.type} keys=[${dataPart && typeof dataPart === 'object' ? Object.keys(dataPart).join(',') : 'null'}]`);
    },

    // ✅ AI SDK RESUME PATTERN: Enable automatic stream resumption after page reload
    // When true, AI SDK calls prepareReconnectToStreamRequest on mount to check for active streams
    // GET endpoint at /api/v1/chat/threads/{threadId}/stream serves buffered chunks
    //
    // ⚠️ CLOUDFLARE KV LIMITATION: Unlike Redis with resumable-stream package,
    // Cloudflare KV doesn't support true pub/sub. Our implementation:
    // 1. POST: Buffers chunks to KV synchronously via consumeSseStream
    // 2. GET: Returns buffered chunks + polls for new ones until stream completes
    //
    // ✅ FIX: Only enable resume when we have a valid thread ID AND it's not a newly created thread
    // This prevents "Cannot read properties of undefined (reading 'state')" errors
    // that occur when AI SDK tries to resume on new threads without an ID.
    // When useChatId is undefined (new thread), resume is disabled to prevent corruption.
    // When useChatId is valid (existing thread), resume enables automatic reconnection.
    // ✅ PERF FIX: Disable resume for newly created threads - nothing to resume, avoids wasteful GET /stream
    resume: !!useChatId && !isNewlyCreatedThread,
    // ✅ NEVER pass messages - let AI SDK be uncontrolled
    // Initial hydration happens via setMessages effect below

    /**
     * Handle participant errors - create error UI and continue to next participant
     */
    onError: (error) => {
      // Ensure roundParticipantsRef is populated before any transitions
      // Store guarantees participants are sorted by priority
      if (roundParticipantsRef.current.length === 0 && participantsRef.current.length > 0) {
        const enabled = getEnabledParticipants(participantsRef.current);
        roundParticipantsRef.current = enabled;
      }

      // CRITICAL: Use ref for current index to avoid stale closure
      const currentIndex = currentIndexRef.current;
      const participant = roundParticipantsRef.current[currentIndex];

      // ✅ FIX: Handle edge case where error is undefined, null, or empty object
      // AI SDK might call onError with unexpected values in edge cases
      if (!error || (typeof error === 'object' && Object.keys(error).length === 0)) {
        console.error('[Chat Streaming Error] Received empty or undefined error', {
          errorType: typeof error,
          errorValue: error,
          currentIndex,
          participantId: participant?.id,
          modelId: participant?.modelId,
          roundParticipantsCount: roundParticipantsRef.current.length,
        });
      }

      // ✅ SINGLE SOURCE OF TRUTH: Parse and validate error metadata with schema
      let errorMessage = error instanceof Error
        ? error.message
        : (error ? String(error) : 'Unknown streaming error');
      let errorMetadata: z.infer<typeof ErrorMetadataSchema> | undefined;

      try {
        if (typeof errorMessage === 'string' && (errorMessage.startsWith('{') || errorMessage.includes('errorCategory') || errorMessage.includes('errorMessage'))) {
          const parsed = JSON.parse(errorMessage);
          const validated = ErrorMetadataSchema.safeParse(parsed);
          if (validated.success) {
            errorMetadata = validated.data;
          } else {
            // ✅ FIX: Even if schema validation fails, try to extract key fields
            // This handles cases where backend sends extra fields or slightly different types
            errorMetadata = {
              errorCategory: parsed.errorCategory,
              errorMessage: parsed.errorMessage,
              rawErrorMessage: parsed.rawErrorMessage,
              openRouterError: parsed.openRouterError,
              openRouterCode: parsed.openRouterCode,
              statusCode: parsed.statusCode,
              modelId: parsed.modelId,
              participantId: parsed.participantId,
              isTransient: parsed.isTransient,
              responseBody: parsed.responseBody,
              traceId: parsed.traceId,
            };
          }
          // Extract the most descriptive error message available
          errorMessage = errorMetadata.rawErrorMessage
            || errorMetadata.errorMessage
            || (typeof errorMetadata.openRouterError === 'string' ? errorMetadata.openRouterError : null)
            || errorMessage;
        }
      } catch {
        // Invalid JSON - use original error message
      }

      // ✅ ERROR LOGGING: Log full error details for debugging
      console.error('[Chat Streaming Error]', {
        errorMessage,
        errorCategory: errorMetadata?.errorCategory,
        statusCode: errorMetadata?.statusCode,
        modelId: errorMetadata?.modelId || participant?.modelId,
        participantId: errorMetadata?.participantId || participant?.id,
        participantIndex: currentIndex,
        traceId: errorMetadata?.traceId,
        isTransient: errorMetadata?.isTransient,
        // Include response body for provider errors (truncated)
        responseBody: errorMetadata?.responseBody?.substring(0, 300),
        // Full metadata in dev mode
        ...(import.meta.env.MODE === 'development' && { fullMetadata: errorMetadata }),
      });

      // ✅ BUG FIX: Update EXISTING participant message with hasError: true
      // Previously created a NEW error message with random ID, leaving the original
      // message (deterministic ID: threadId_r{round}_p{index}) with hasError: false.
      // This caused infinite retry loops because resumption checked the original message.
      if (participant) {
        const errorKey = `${participant.modelId}-${currentIndex}`;

        if (!hasResponded(errorKey)) {
          markAsResponded(errorKey);

          // ✅ TYPE-SAFE: Convert ErrorCategory to UIMessageErrorType using mapping function
          const errorType = errorMetadata?.errorCategory
            ? errorCategoryToUIType(errorMetadata.errorCategory)
            : UIMessageErrorTypeSchema.enum.failed;

          // ✅ FIX: Update existing message instead of creating new one
          // The deterministic message ID allows us to find and update the original
          // ✅ CRITICAL: Use callbackRefs.threadId.current, not threadId prop (stale in closure)
          const effectiveThreadId = callbackRefs.threadId.current;
          const expectedMessageId = `${effectiveThreadId}_r${currentRoundRef.current}_p${currentIndex}`;

          setMessages((prev) => {
            const existingIndex = prev.findIndex(m => m.id === expectedMessageId);
            if (existingIndex >= 0) {
              // Update existing message with error metadata
              const updated = [...prev];
              const existing = updated[existingIndex];
              if (existing) {
                updated[existingIndex] = {
                  ...existing,
                  parts: existing.parts?.length ? existing.parts : [{ type: MessagePartTypes.TEXT, text: '' }],
                  metadata: {
                    ...(typeof existing.metadata === 'object' ? existing.metadata : {}),
                    hasError: true,
                    errorType,
                    errorMessage,
                    errorCategory: errorMetadata?.errorCategory || errorType,
                    finishReason: FinishReasons.FAILED,
                  },
                };
              }
              // ✅ FROZEN ARRAY FIX: Deep clone to break Immer freeze
              // AI SDK needs mutable arrays for streaming - frozen refs cause
              // "Cannot add property 0, object is not extensible" errors
              return structuredClone(updated);
            }
            // Fallback: create new error message if original not found
            const errorUIMessage = createErrorUIMessage(
              participant,
              currentIndex,
              errorMessage,
              errorType,
              errorMetadata,
              currentRoundRef.current,
            );
            // ✅ FROZEN ARRAY FIX: Clone prev to break Immer freeze
            return structuredClone([...prev, errorUIMessage]);
          });
        }
      }

      // ✅ FIX: Complete animation for errored participant before moving to next
      // Without this, the animation timeout would trigger because:
      // 1. Original message is created with empty parts and hasError: false
      // 2. Error message is a NEW message that doesn't complete the original's animation
      // 3. Animation for currentIndex never completes, causing 5s timeout
      if (completeAnimation) {
        completeAnimation(currentIndex);
      }

      // Phantom guard: Check if we've already triggered next for this (round, participant)
      const triggerKey = `r${currentRoundRef.current}_p${currentIndex}`;
      if (triggeredNextForRef.current.has(triggerKey)) {
        return;
      }
      triggeredNextForRef.current.add(triggerKey);

      // ✅ CRITICAL FIX: Reset AI SDK state before triggering next participant
      // When an error occurs, AI SDK status becomes 'error' and won't accept new sendMessage calls.
      // Calling setMessages forces the SDK back to 'ready' state, allowing the next participant to send.
      // Use flushSync to ensure the state reset is committed BEFORE triggering next participant.
      // eslint-disable-next-line react-dom/no-flush-sync -- Required for AI SDK state reset
      flushSync(() => {
        setMessages(structuredClone(messagesRef.current));
      });

      // Trigger next participant immediately (no delay needed)
      triggerNextParticipantWithRefs();
      callbackRefs.onError.current?.(error instanceof Error ? error : new Error(errorMessage));
    },

    /**
     * Handle successful participant response
     * AI SDK v6 Pattern: Trust the SDK's built-in deduplication
     */
    onFinish: async (data) => {
      const msgId = data.message?.id;
      const pIdxMatch = msgId?.match(/_p(\d+)$/);
      const rndMatch = msgId?.match(/_r(\d+)_/);
      // ✅ DEBUG: Log metadata to trace availableSources (only for real messages)
      const availableSources = getAvailableSources(data.message?.metadata);
      const hasAvail = availableSources?.length ?? 0;
      rlog.stream('end', `r${rndMatch?.[1] ?? '-'} p${pIdxMatch?.[1] ?? '-'} reason=${data.finishReason ?? '-'} parts=${data.message?.parts?.length ?? 0} avail=${hasAvail}`);

      // ✅ Skip phantom resume completions (no active stream to resume)
      const notOurMessageId = !data.message?.id?.includes('_r');
      const emptyParts = data.message?.parts?.length === 0;
      const noFinishReason = data.finishReason === undefined;
      const noActiveRound = roundParticipantsRef.current.length === 0;
      const notStreaming = !isStreamingRef.current;

      if (notOurMessageId && emptyParts && noFinishReason && noActiveRound && notStreaming) {
        return;
      }

      // ✅ CRITICAL FIX: Skip moderator messages completely
      // Moderator messages are handled by useModeratorStream hook, NOT by this participant hook
      // After page refresh, AI SDK may incorrectly call onFinish for moderator messages
      // that were loaded from the database. This causes participant state corruption.
      const isModeratorMessage = data.message?.id?.includes('_moderator');
      const hasModeratorFlag = data.message?.metadata && typeof data.message.metadata === 'object'
        && 'isModerator' in data.message.metadata && data.message.metadata.isModerator === true;
      if (isModeratorMessage || hasModeratorFlag) {
        return; // Moderator messages handled by useModeratorTrigger
      }

      // ✅ RACE CONDITION FIX: Skip if this message ID was already processed
      // This prevents double-processing when AI SDK calls onFinish multiple times
      // or when the same completion arrives while we're awaiting requestAnimationFrame
      const messageId = data.message?.id;
      if (messageId && processedMessageIdsRef.current.has(messageId)) {
        return;
      }
      if (messageId) {
        processedMessageIdsRef.current.add(messageId);
      }

      // ✅ RESUMABLE STREAMS: Detect and handle resumed stream completion
      // After page reload, refs are reset but message metadata has correct values
      // Check if this is a resumed stream by looking at the message metadata
      // ✅ TYPE-SAFE: Use metadata utility functions instead of Record<string, unknown>
      const metadataRoundNumber = getRoundNumber(data.message?.metadata);
      const metadataParticipantIndex = getParticipantIndex(data.message?.metadata);

      // ✅ CRITICAL FIX: Handle case where participants haven't loaded yet after page refresh
      // If we have valid metadata from resumed stream but participants aren't loaded,
      // queue the continuation via callback and let provider effect handle it
      if (roundParticipantsRef.current.length === 0
        && participantsRef.current.length === 0
        && metadataParticipantIndex !== null
        && metadataRoundNumber !== null
      ) {
        // Call the callback to queue next participant trigger in the store
        // Provider effect will pick this up when participants load
        callbackRefs.onResumedStreamComplete.current?.(metadataRoundNumber, metadataParticipantIndex);
        return;
      }

      // Determine the actual participant index - prefer metadata for resumed streams
      let currentIndex = currentIndexRef.current;

      // ✅ CRITICAL FIX: Detect resumed stream when roundParticipantsRef is empty
      // After page reload, roundParticipantsRef is [] but we receive onFinish from resumed stream
      // Detection: roundParticipantsRef is empty AND we have valid metadata
      const isResumedStream = roundParticipantsRef.current.length === 0
        && metadataParticipantIndex !== null
        && participantsRef.current.length > 0;

      if (isResumedStream) {
        // ✅ RACE CONDITION FIX: Don't set streaming state if a form submission is in progress
        // When hasEarlyOptimisticMessage is true, handleUpdateThreadAndSend is executing
        // and will call prepareForNewMessage soon. Setting isStreaming=true here would
        // create a deadlock state where isStreaming=true but pendingMessage=null.
        //
        // IMPORTANT: We still process the refs update and let onFinish continue - we only
        // skip setting isStreaming=true. Otherwise, we'd ignore the message data entirely
        // and cause a stuck stream!
        const isFormSubmissionInProgress = callbackRefs.hasEarlyOptimisticMessage.current;

        // Update refs from metadata for resumed stream (even during submission - safe)
        currentIndex = metadataParticipantIndex;
        currentIndexRef.current = currentIndex;

        if (metadataRoundNumber !== null) {
          currentRoundRef.current = metadataRoundNumber;
        }

        // Populate roundParticipantsRef before triggerNextParticipantWithRefs checks totalParticipants
        // Store guarantees participants are sorted by priority
        const enabled = getEnabledParticipants(participantsRef.current);
        roundParticipantsRef.current = enabled;

        // Only set streaming state if NOT in the middle of a form submission
        // This prevents the deadlock but still allows the message to be processed
        if (!isFormSubmissionInProgress) {
          setIsExplicitlyStreaming(true);
        }
      }

      // Ensure roundParticipantsRef is populated before any transitions
      // Store guarantees participants are sorted by priority
      if (roundParticipantsRef.current.length === 0 && participantsRef.current.length > 0) {
        const enabled = getEnabledParticipants(participantsRef.current);
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

            // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
            setMessages(prev => structuredClone([...prev, errorUIMessage]));
          }
        }

        // ✅ PHANTOM GUARD: Check if we've already triggered next for this (round, participant)
        const triggerKey = `r${currentRoundRef.current}_p${currentIndex}`;
        if (triggeredNextForRef.current.has(triggerKey)) {
          rlog.gate('dup-skip', triggerKey);
          return;
        }
        triggeredNextForRef.current.add(triggerKey);

        // ✅ CRITICAL FIX: Reset AI SDK state before triggering next participant
        // Same fix as in onError - ensures SDK is in 'ready' state to accept sendMessage
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for AI SDK state reset
        flushSync(() => {
          setMessages(structuredClone(messagesRef.current));
        });

        // Trigger next participant immediately
        triggerNextParticipantWithRefs();
        const error = new Error(`Participant ${currentIndex} failed: data.message is missing`);
        callbackRefs.onError.current?.(error);
        return;
      }

      // AI SDK v6 Pattern: ALWAYS update message metadata on finish
      // The AI SDK adds the message during streaming; we update it with proper metadata

      if (participant && data.message) {
        // ✅ CRITICAL FIX: Skip metadata merge for pre-search messages
        // Pre-search messages have isPreSearch: true and complete metadata from backend
        // They should NOT be modified with participant metadata
        const isPreSearchMsg = isPreSearch(data.message.metadata);

        if (isPreSearchMsg) {
          // Pre-search messages already have complete metadata - skip this flow entirely
          return;
        }

        // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe metadata access
        const backendRoundNumber = getRoundNumber(data.message.metadata);

        // ✅ CRITICAL FIX: Extract round AND participant from message ID as PRIMARY source
        // Bug: AI SDK sometimes calls onFinish again after round completion (phantom calls)
        // When this happens, refs and even backend metadata can be stale/wrong
        // The message ID is generated by backend and NEVER changes - it's the source of truth
        const idMatch = data.message?.id?.match(/_r(\d+)_p(\d+)/);
        const roundFromId = idMatch?.[1] ? Number.parseInt(idMatch[1]) : null;
        const participantFromId = idMatch?.[2] ? Number.parseInt(idMatch[2]) : null;
        // ✅ FIX: Prioritize ID over metadata - metadata can be stale on phantom calls
        const finalRoundNumber = roundFromId ?? backendRoundNumber ?? currentRoundRef.current;
        // ✅ FIX: Use participant index from ID to prevent phantom calls from corrupting messages
        const finalParticipantIndex = participantFromId ?? currentIndex;
        const expectedId = `${threadId}_r${finalRoundNumber}_p${finalParticipantIndex}`;

        // ✅ CRITICAL FIX: Check if message has generated text to avoid false empty_response errors
        // For some fast models (e.g., gemini-flash-lite), parts might not be populated yet when onFinish fires
        // ✅ REASONING MODELS: Include REASONING parts (Claude thinking, etc.)
        // AI SDK v6 Pattern: Reasoning models emit type='reasoning' parts before type='text' parts
        // ✅ FIX: Filter out [REDACTED]-only reasoning (GPT-5 Nano, o3-mini encrypted reasoning)
        // Uses centralized isRenderableContent from message-schemas.ts for consistency
        const textParts = data.message.parts?.filter(
          p => p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING,
        ) || [];
        const hasTextInParts = textParts.some(
          part => 'text' in part && typeof part.text === 'string' && isRenderableContent(part.text),
        );

        // ✅ RACE CONDITION FIX: Multiple signals for successful generation
        // Some models return finishReason='unknown' even on success
        const metadata = data.message.metadata;
        const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};

        // Signal 1: finishReason='stop' indicates successful completion
        const hasSuccessfulFinish = 'finishReason' in metadataObj && metadataObj.finishReason === FinishReasons.STOP;

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

        // ✅ FIX: Signal 5 - Check if any parts are still streaming
        // AI SDK v6 marks parts with state: 'streaming' while content is still being generated
        // If parts are still streaming, we should NOT set hasError=true yet
        // This prevents premature "No Response Generated" errors while stream is active
        const isStillStreaming = data.message.parts?.some(
          p => 'state' in p && p.state === TextPartStates.STREAMING,
        ) || false;

        // ✅ CRITICAL: Consider it successful if ANY positive signal is present
        // and there's no explicit error signal
        const hasGeneratedText = hasTextInParts
          || hasSuccessfulFinish
          || backendMarkedSuccess
          || hasOutputTokens
          || (!isExplicitErrorFinish && textParts.length > 0)
          || isStillStreaming; // ← Parts still streaming = content generation in progress

        // ✅ STRICT TYPING: mergeParticipantMetadata now requires roundNumber parameter
        // Returns complete AssistantMessageMetadata with ALL required fields
        // ✅ FIX: Use finalParticipantIndex from message ID, not currentIndex from ref
        const completeMetadata = mergeParticipantMetadata(
          data.message,
          participant,
          finalParticipantIndex,
          finalRoundNumber, // REQUIRED: Pass round number explicitly
          { hasGeneratedText: Boolean(hasGeneratedText) }, // REQUIRED: Tell it we have content to avoid false empty_response errors
        );

        // Use flushSync to force React to commit metadata update synchronously
        // AI SDK v6 Pattern: Prevents race conditions between sequential participants
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
              // AI SDK v6 caches messages by threadId and may reuse IDs from previous rounds
              // We correct this using the backend's deterministic ID format
            }

            // ✅ CRITICAL FIX: Ensure all parts have state='done' when onFinish is called
            // AI SDK may leave parts with state='streaming' even after stream completes
            // This causes the participant completion gate to fail, preventing moderator trigger
            const partsWithDone = data.message.parts?.map((part) => {
              if ('state' in part && part.state === TextPartStates.STREAMING) {
                return { ...part, state: TextPartStates.DONE };
              }
              return part;
            }) ?? [];

            // ✅ DEDUPLICATION FIX: AI SDK can emit duplicate parts (with and without state)
            // During streaming, parts may be added without state, then again with state
            // Keep only the version with state='done', remove stateless duplicates
            const seenParts = new Map<string, typeof partsWithDone[0]>();
            for (const part of partsWithDone) {
              let key: string;
              if (part.type === MessagePartTypes.TEXT && 'text' in part) {
                key = `text:${part.text}`;
              } else if (part.type === MessagePartTypes.REASONING && 'text' in part) {
                key = `reasoning:${part.text}`;
              } else if (part.type === MessagePartTypes.STEP_START) {
                key = 'step-start';
              } else {
                // For other part types, keep all of them
                key = `other:${Math.random()}`;
              }
              const existing = seenParts.get(key);
              if (!existing) {
                seenParts.set(key, part);
              } else {
                // Keep the one with state='done', discard the one without state
                const existingHasState = 'state' in existing && existing.state === TextPartStates.DONE;
                const currentHasState = 'state' in part && part.state === TextPartStates.DONE;
                if (currentHasState && !existingHasState) {
                  seenParts.set(key, part);
                }
              }
            }
            const completedParts = Array.from(seenParts.values());

            const completeMessage: UIMessage = {
              ...data.message,
              id: correctId, // ✅ Use correct ID from backend metadata
              parts: completedParts, // ✅ Ensure all parts have state='done' and deduplicated
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
                // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
                return structuredClone(filteredMessages.map((msg: UIMessage) =>
                  msg.id === correctId ? completeMessage : msg,
                ));
              } else {
                // Add new message with correct ID
                // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
                return structuredClone([...filteredMessages, completeMessage]);
              }
            }

            // ✅ FIX: First, find ALL messages with this ID and deduplicate
            // AI SDK can create streaming messages without our metadata, causing duplicates
            // We need to find any message with matching ID and update it
            const messagesWithSameId = prev.filter(msg => msg.id === idToSearchFor);

            // ✅ FIX: If multiple messages exist with same ID, something went wrong - deduplicate first
            if (messagesWithSameId.length > 1) {
              // Remove all duplicates, keep only the first one, then update it
              const deduplicatedPrev = prev.filter((msg, index) => {
                if (msg.id !== idToSearchFor)
                  return true;
                // Keep only the first occurrence
                return prev.findIndex(m => m.id === idToSearchFor) === index;
              });
              // Now update the single remaining message
              // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
              return structuredClone(deduplicatedPrev.map((msg: UIMessage) =>
                msg.id === idToSearchFor ? completeMessage : msg,
              ));
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
              // ✅ FIX: Even if metadata doesn't match, check if message with same ID exists
              // AI SDK creates streaming messages without metadata - we should update them
              const anyMessageWithSameId = prev.findIndex(msg => msg.id === completeMessage.id);
              if (anyMessageWithSameId !== -1) {
                // Message exists but metadata didn't match - update it anyway
                // This handles the case where AI SDK created a streaming message without our metadata
                // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
                return structuredClone(prev.map((msg: UIMessage, idx: number) =>
                  idx === anyMessageWithSameId ? completeMessage : msg,
                ));
              }
              // Message truly doesn't exist - add new message
              // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
              return structuredClone([...prev, completeMessage]);
            }

            // Update existing message with complete metadata (verified to be same participant)
            // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
            return structuredClone(prev.map((msg: UIMessage, idx: number) => {
              if (idx === existingMessageIndex) {
                return completeMessage;
              }
              return msg;
            }));
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
          // Phantom guard: Check if already triggered for this (round, participant)
          const triggerKey = `r${currentRoundRef.current}_p${currentIndex}`;
          if (triggeredNextForRef.current.has(triggerKey)) {
            return;
          }
          triggeredNextForRef.current.add(triggerKey);

          // Error messages don't animate - trigger next after double RAF
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          // Skip if from a previous round
          if (finalRoundNumber < currentRoundRef.current) {
            return;
          }
          // ✅ CRITICAL FIX: Reset AI SDK state before triggering next participant
          // Same fix as in onError - ensures SDK is in 'ready' state to accept sendMessage
          // eslint-disable-next-line react-dom/no-flush-sync -- Required for AI SDK state reset
          flushSync(() => {
            setMessages(structuredClone(messagesRef.current));
          });
          triggerNextParticipantWithRefs();
          return;
        }
      }

      // CRITICAL: Trigger next participant after current one finishes
      // ✅ SIMPLIFIED: Removed animation waiting - it was causing 5s delays
      // Animation coordination is now handled by the store's waitForAllAnimations in handleComplete
      // which has its own timeout mechanism for moderator creation

      // ✅ PHANTOM GUARD: Check if we've already triggered next for this (round, participant)
      // AI SDK calls onFinish multiple times for the same message (phantom calls)
      // This check MUST happen BEFORE the await to prevent interleaved duplicates
      const triggerKey = `r${currentRoundRef.current}_p${currentIndex}`;
      if (triggeredNextForRef.current.has(triggerKey)) {
        return;
      }
      triggeredNextForRef.current.add(triggerKey);

      // ✅ FIX: Must await to block onFinish from returning before next participant triggers
      // Without await, onFinish returns immediately and AI SDK status changes,
      // allowing multiple streams to start concurrently (race condition)
      // ✅ CRITICAL FIX: Double RAF ensures React has flushed all state updates
      // Single RAF only waits for next paint, but React might batch updates across frames
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // ✅ PHANTOM GUARD: Skip trigger if message is from a previous round
      // AI SDK calls onFinish twice (phantom call) after round completion when refs are reset
      // Must re-extract round from ID since we're outside the if(participant && data.message) block
      const msgIdMatch = data.message?.id?.match(/_r(\d+)_p/);
      const msgRoundNumber = msgIdMatch?.[1] ? Number.parseInt(msgIdMatch[1]) : currentRoundRef.current;
      if (msgRoundNumber < currentRoundRef.current) {
        return;
      }
      triggerNextParticipantWithRefs();
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
   * ✅ UNMOUNT CLEANUP: Set isMountedRef to false when component unmounts
   * This prevents stale sendMessage calls in queueMicrotask from executing
   * after the AI SDK's internal state has been cleaned up
   */
  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      // ✅ CRITICAL FIX: Deep clone messages to break Immer proxy freeze
      // Store messages come from Zustand+Immer which freezes all arrays (Object.freeze)
      // AI SDK needs mutable arrays to push streaming parts during response generation
      // Without this, streaming fails with "Cannot add property 0, object is not extensible"
      //
      // ✅ FIX: Sanitize messages to handle malformed parts from interrupted streams
      // Messages with multiple text parts (streaming + done) cause AI SDK resumeStream errors
      const mutableMessages = structuredClone(sanitizeMessagesForAiSdk(initialMessages));
      setMessages(mutableMessages);
      hasHydratedRef.current = true;
    }
  }, [messages.length, initialMessages, setMessages]);

  // ✅ NAVIGATION FIX: Reset all refs when threadId changes (to empty OR different thread)
  // This handles:
  // 1. Navigation from /chat/[slug] to /chat overview (threadId becomes empty)
  // 2. Navigation between different threads (threadId changes to different value)
  // Without this reset, refs persist and cause stale state issues
  useLayoutEffect(() => {
    const prevId = prevThreadIdRef.current;
    const currentId = threadId;

    const wasValidThread = prevId && prevId.trim() !== '';
    const isNowEmpty = !currentId || currentId.trim() === '';
    const isNowDifferentThread = wasValidThread && currentId && currentId.trim() !== '' && prevId !== currentId;

    // Reset all refs when:
    // 1. Transitioning from valid thread to empty (overview)
    // 2. Transitioning between different threads
    if ((wasValidThread && isNowEmpty) || isNowDifferentThread) {
      // Reset participant tracking refs
      respondedParticipantsRef.current = new Set();
      regenerateRoundNumberRef.current = null;

      // Reset round state refs
      currentRoundRef.current = 0;
      roundParticipantsRef.current = [];
      currentIndexRef.current = 0;

      // Reset queue and triggering refs
      participantIndexQueue.current = [];
      lastUsedParticipantIndex.current = null;
      isTriggeringRef.current = false;
      isStreamingRef.current = false;
      queuedParticipantsThisRoundRef.current = new Set();
      // ✅ BUG FIX: Clear phantom guard to prevent blocking participant continuation
      // in subsequent conversations. Without this, keys like "r0_p0" from a previous
      // conversation would block the same round/participant in a new conversation.
      triggeredNextForRef.current = new Set();
      // ✅ BUG FIX: Clear processed message IDs to prevent duplicate filtering
      // in subsequent conversations.
      processedMessageIdsRef.current = new Set();

      // Reset hydration flag to allow re-hydration on next thread
      hasHydratedRef.current = false;

      // Reset state synchronously on navigation - legitimate useLayoutEffect pattern
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on navigation required
      setCurrentRound(0);
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on navigation required
      setCurrentParticipantIndex(0);
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- synchronous reset on navigation required
      setIsExplicitlyStreaming(false);
    }

    prevThreadIdRef.current = currentId;
  }, [threadId]);

  /**
   * Start a new round with existing participants
   *
   * AI SDK v6 Pattern: Used when initializing a thread with existing messages
   * (e.g., from backend after thread creation) and need to trigger streaming
   * for the first participant. This is the pattern from Exercise 01.07, 04.02, 04.03.
   *
   * ✅ FIX: Removed AI SDK status check - store subscription guards prevent premature calls
   * The AI SDK status may not be 'ready' when this is called from the subscription,
   * but the store subscription has proper guards (messages exist, not already streaming, etc.)
   * Only check isExplicitlyStreaming to prevent concurrent rounds
   */
  const startRound = useCallback((
    participantsOverride?: ChatParticipant[],
    messagesOverride?: UIMessage[],
  ) => {
    // ✅ STALE CLOSURE FIX: Accept messagesOverride to avoid stale closure in queueMicrotask
    // When passed from trigger, these messages are guaranteed to be persisted (from PATCH response)
    const freshMessages = messagesOverride || initialMessages;

    // ✅ CRITICAL FIX: ATOMIC check-and-set to prevent race conditions
    // Must happen FIRST before any other logic. Two effects calling startRound simultaneously
    // could both pass guards before either sets the lock, causing duplicate aiSendMessage calls
    // which corrupts AI SDK's Chat instance state ("Cannot read properties of undefined (reading 'state')")
    if (isTriggeringRef.current) {
      return;
    }
    isTriggeringRef.current = true;

    // ✅ CRITICAL FIX: Allow caller to pass fresh participants (from store subscription)
    // When subscription calls this before provider re-renders, ref is stale
    // Subscription can pass participants directly from store.getState()
    const currentParticipants = participantsOverride || participantsRef.current;

    // ✅ CRITICAL FIX: Update participantsRef synchronously when fresh participants provided
    // This ensures prepareSendMessagesRequest uses up-to-date participants with real DB IDs
    // Without this, the transport callback may read stale ref data with temp frontend IDs,
    // causing the backend to create duplicate participants (race condition)
    if (participantsOverride) {
      participantsRef.current = participantsOverride;
    }

    // ✅ FIX: Hydrate AI SDK from messagesOverride for newly created threads
    // When ChatStoreProvider mounts before thread creation, initialMessages is empty.
    // The hydration effect never runs because initialMessages.length === 0.
    // When startRound is called with messagesOverride (the store's current messages),
    // we need to hydrate the AI SDK immediately before proceeding.
    // ✅ FIX: Sanitize messages to handle malformed parts from interrupted streams
    if (messages.length === 0 && messagesOverride && messagesOverride.length > 0 && !hasHydratedRef.current) {
      const mutableMessages = structuredClone(sanitizeMessagesForAiSdk(messagesOverride));
      setMessages(mutableMessages);
      hasHydratedRef.current = true;
      // Reset triggering flag - we'll be called again after hydration takes effect
      isTriggeringRef.current = false;
      return;
    }

    // ✅ Guards: Wait for dependencies to be ready (effect will retry)
    // ✅ FIX: Require AI SDK to be fully ready before sending
    // Previously used relaxed check (not STREAMING/SUBMITTED) but this allowed calls
    // when Chat instance wasn't initialized, causing "Cannot read properties of undefined (reading 'state')" error
    if (messages.length === 0 || status !== AiSdkStatuses.READY || isExplicitlyStreaming) {
      isTriggeringRef.current = false;
      return;
    }

    // ✅ FIX: Ensure threadId is valid before proceeding
    // AI SDK's Chat instance requires a valid id to initialize its internal state map
    // Calling sendMessage before this is ready causes "Cannot read properties of undefined (reading 'state')"
    const effectiveThreadId = callbackRefs.threadId.current;
    if (!effectiveThreadId || effectiveThreadId.trim() === '') {
      isTriggeringRef.current = false;
      return;
    }

    // ✅ FIX: Ensure AI SDK has been hydrated with initial messages
    // Without this check, we might call aiSendMessage before setMessages has initialized
    // the AI SDK's internal state, causing "Cannot read properties of undefined (reading 'state')"
    if (!hasHydratedRef.current) {
      isTriggeringRef.current = false;
      return;
    }

    // ✅ FIX: Ensure AI SDK has actually processed the hydrated messages
    // setMessages is asynchronous in React - the AI SDK might not have updated its internal
    // state map yet. Check that AI SDK's messages match what we expect.
    // This prevents "Cannot read properties of undefined (reading 'state')" error
    if (messages.length === 0) {
      isTriggeringRef.current = false;
      return;
    }

    const uniqueParticipants = deduplicateParticipants(currentParticipants);
    const enabled = getEnabledParticipants(uniqueParticipants);

    if (enabled.length === 0) {
      isTriggeringRef.current = false;
      return;
    }

    // ✅ STALE CLOSURE FIX: Use freshMessages (messagesOverride or initialMessages)
    // For round 1+, messages are now persisted via PATCH before streaming
    // freshMessages contains the guaranteed-persisted messages from the trigger
    const messagesToSearch = freshMessages.length > 0 ? freshMessages : messages;
    const lastUserMessage = [...messagesToSearch].reverse().find(m => m.role === MessageRoles.USER);

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

    // ✅ CRITICAL FIX: Extract file parts from existing user message
    // Round 0 user message already has file parts from thread creation
    // Without this, AI SDK sends only text - model never sees uploaded files
    // Uses shared extractValidFileParts utility for consistent file part handling
    const fileParts = extractValidFileParts(lastUserMessage.parts);

    // ✅ STALE CLOSURE FIX: Use freshMessages (persisted messages) for round number calculation
    // Messages are now persisted via PATCH before streaming starts (round 1+)
    // freshMessages contains guaranteed-persisted messages, avoiding stale closure issues
    const roundNumber = getCurrentRoundNumber(messagesToSearch);

    // CRITICAL: Update refs FIRST to avoid race conditions
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    roundParticipantsRef.current = enabled;
    currentRoundRef.current = roundNumber;
    lastUsedParticipantIndex.current = null; // Reset for new round
    queuedParticipantsThisRoundRef.current = new Set(); // Reset queued tracking for new round
    participantIndexQueue.current = []; // ✅ FIX: Clear stale queue entries from previous round
    // ✅ BUG FIX: Clear phantom guard at start of each round to prevent stale entries
    // from blocking participant continuation. This is especially important after
    // navigation to new chat where refs might not be reset if threadId stays empty.
    triggeredNextForRef.current = new Set();

    // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
    // This prevents race condition where pendingMessage effect checks ref
    // before React re-renders with new isExplicitlyStreaming state
    isStreamingRef.current = true;

    // CRITICAL FIX: Use flushSync to ensure state updates are committed synchronously
    // before the API call is made. This prevents chat.isStreaming from being false
    // when the sync effect runs, which would cause streaming content to not update gradually.
    // eslint-disable-next-line react-dom/no-flush-sync -- Required for proper streaming sync
    flushSync(() => {
      // Reset all state for new round - INSIDE flushSync so they commit immediately
      setIsExplicitlyStreaming(true);
      setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
      setCurrentRound(roundNumber);
    });

    // These don't need to be in flushSync
    resetErrorTracking();
    clearAnimations?.(); // Clear any pending animations from previous round

    // ✅ CRITICAL FIX: Push participant 0 index to queue before calling aiSendMessage
    // Guard against double-push if startRound is called multiple times
    if (!queuedParticipantsThisRoundRef.current.has(0)) {
      queuedParticipantsThisRoundRef.current.add(0);
      participantIndexQueue.current.push(0);
    }

    // ✅ CRITICAL FIX: Store the expected user message ID for backend DB lookup
    // AI SDK's sendMessage creates messages with its own nanoid-style IDs, but the user message
    // was already persisted via PATCH/POST with a backend ULID. Store the correct ID so
    // prepareSendMessagesRequest can pass it to the backend for correct DB lookup.
    expectedUserMessageIdRef.current = lastUserMessage.id;

    // ✅ CRITICAL FIX: Use queueMicrotask and try-catch to handle AI SDK state errors
    // The AI SDK's Chat instance can be in an invalid state during:
    // - Hot Module Replacement (Fast Refresh in development)
    // - Component remount
    // - ThreadId changes during initialization
    // By deferring to microtask and catching errors, we can recover gracefully
    //
    // ✅ CRITICAL: isTriggeringRef stays TRUE until async work completes
    // This prevents other functions (continueFromParticipant, etc.) from calling aiSendMessage concurrently
    queueMicrotask(async () => {
      try {
        // Trigger streaming with the existing user message
        // Use isParticipantTrigger:true to indicate this is triggering the first participant
        await aiSendMessage({
          text: userText,
          // ✅ CRITICAL FIX: Include file parts so AI SDK sends them to the model
          // Without this, Round 0 attachments are never seen by the participant
          ...(fileParts.length > 0 && { files: fileParts }),
          metadata: {
            role: UIMessageRoles.USER,
            roundNumber,
            isParticipantTrigger: true,
          },
        });
        // ✅ SUCCESS: Reset trigger lock after aiSendMessage succeeds
        isTriggeringRef.current = false;
      } catch (error) {
        // ✅ GRACEFUL ERROR HANDLING: Reset state to allow retry
        // This handles the "Cannot read properties of undefined (reading 'state')" error
        // that occurs when AI SDK's Chat instance is corrupted (e.g., during Fast Refresh)
        console.error('[startRound] aiSendMessage failed, resetting state:', error);
        isStreamingRef.current = false;
        isTriggeringRef.current = false;
        queuedParticipantsThisRoundRef.current.clear();
        participantIndexQueue.current = [];
        lastUsedParticipantIndex.current = null;
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for error recovery
        flushSync(() => {
          setIsExplicitlyStreaming(false);
        });
      }
    });
    // ✅ NOTE: isTriggeringRef is NOT reset here - it stays true until async work completes
    // This prevents concurrent aiSendMessage calls from startRound/continueFromParticipant/etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs provides stable ref access to threadId (intentionally omitted to avoid effect re-runs)
  }, [messages, initialMessages, status, resetErrorTracking, clearAnimations, isExplicitlyStreaming, aiSendMessage]);

  /**
   * Continue a round from a specific participant index
   * Used for incomplete round resumption when user navigates away during streaming
   * and returns later to find some participants have responded but not all
   *
   * @param fromIndexOrTarget - The participant index (0-based) or object with index and participantId for validation
   * @param participantsOverride - Optional fresh participants to use
   * @param messagesOverride - Optional fresh messages (used to avoid stale closure)
   */
  const continueFromParticipant = useCallback((
    fromIndexOrTarget: number | { index: number; participantId: string },
    participantsOverride?: ChatParticipant[],
    messagesOverride?: UIMessage[],
  ) => {
    // ✅ TYPE-SAFE: Extract index and optional participantId for validation
    const fromIndex = typeof fromIndexOrTarget === 'number' ? fromIndexOrTarget : fromIndexOrTarget.index;
    const expectedParticipantId = typeof fromIndexOrTarget === 'object' ? fromIndexOrTarget.participantId : undefined;
    // ✅ STALE CLOSURE FIX: Accept messagesOverride to avoid stale closure
    // When passed from trigger, these messages are guaranteed to be persisted (from PATCH response)
    const freshMessages = messagesOverride || initialMessages;

    // ✅ DEBUG: Log entry with all guard states
    rlog.resume('cfp-entry', `P${fromIndex} status=${status} msgs=${messages.length} triggering=${isTriggeringRef.current ? 1 : 0} hydrated=${hasHydratedRef.current ? 1 : 0} streaming=${isExplicitlyStreaming ? 1 : 0}`);

    // ✅ CRITICAL FIX: ATOMIC check-and-set to prevent race conditions
    // Same pattern as startRound - must happen FIRST before any other logic
    if (isTriggeringRef.current) {
      rlog.resume('cfp-guard', 'EXIT: already triggering');
      return;
    }
    isTriggeringRef.current = true;

    // ✅ CRITICAL FIX: Allow caller to pass fresh participants (from store subscription)
    const currentParticipants = participantsOverride || participantsRef.current;

    // ✅ CRITICAL FIX: Update participantsRef synchronously when fresh participants provided
    // Same fix as startRound - ensures prepareSendMessagesRequest uses up-to-date participants
    if (participantsOverride) {
      participantsRef.current = participantsOverride;
    }

    // ✅ STALE STREAMING STATE FIX: If AI SDK is ready but we think we're streaming,
    // the isExplicitlyStreaming state is stale (from page refresh or race condition).
    // AI SDK status 'ready' means it's NOT streaming, so clear the stale state.
    // This happens when page refreshes during streaming - isExplicitlyStreaming gets
    // stuck true while AI SDK resets to 'ready' state.
    if (status === AiSdkStatuses.READY && isExplicitlyStreaming) {
      setIsExplicitlyStreaming(false);
      isStreamingRef.current = false;
    }

    // ✅ HYDRATION FIX: When AI SDK has no messages but messagesOverride is provided,
    // hydrate the AI SDK first. This handles resumption after page refresh where:
    // - Store has messages (from SSR prefill)
    // - AI SDK has 0 messages (initialMessages was empty at mount time)
    // - Resumption needs messages to be in AI SDK before streaming can start
    // Same pattern as startRound hydration (line ~1717)
    if (messages.length === 0 && messagesOverride && messagesOverride.length > 0 && !hasHydratedRef.current) {
      rlog.resume('cfp-hydrate', `hydrating AI SDK: override=${messagesOverride.length} msgs`);
      const mutableMessages = structuredClone(sanitizeMessagesForAiSdk(messagesOverride));
      setMessages(mutableMessages);
      hasHydratedRef.current = true;
      // Reset triggering flag - we'll be called again after hydration takes effect
      isTriggeringRef.current = false;
      return;
    }

    // ✅ Guards: Wait for dependencies to be ready
    // ✅ FIX: Require AI SDK to be fully ready before sending
    if (messages.length === 0 || status !== AiSdkStatuses.READY) {
      rlog.resume('cfp-guard', `EXIT: not ready msgs=${messages.length} status=${status}`);
      isTriggeringRef.current = false;
      return;
    }

    // ✅ FIX: Ensure threadId is valid before proceeding
    const effectiveThreadId = callbackRefs.threadId.current;
    if (!effectiveThreadId || effectiveThreadId.trim() === '') {
      rlog.resume('cfp-guard', 'EXIT: no threadId');
      isTriggeringRef.current = false;
      return;
    }

    // ✅ FIX: Ensure AI SDK has been hydrated with initial messages
    if (!hasHydratedRef.current) {
      rlog.resume('cfp-guard', 'EXIT: not hydrated');
      isTriggeringRef.current = false;
      return;
    }

    const uniqueParticipants = deduplicateParticipants(currentParticipants);
    const enabled = getEnabledParticipants(uniqueParticipants);

    if (enabled.length === 0) {
      rlog.resume('cfp-guard', 'EXIT: no participants');
      isTriggeringRef.current = false;
      return;
    }

    // Validate fromIndex is within bounds
    if (fromIndex < 0 || fromIndex >= enabled.length) {
      rlog.resume('cfp-guard', `EXIT: index out of bounds idx=${fromIndex} len=${enabled.length}`);
      isTriggeringRef.current = false;
      return;
    }

    // ✅ CONFIG CHANGE VALIDATION: Verify participant at index matches expected ID
    // This prevents triggering wrong participant if config changed between when
    // nextParticipantToTrigger was set and when continueFromParticipant is called
    if (expectedParticipantId) {
      const actualParticipant = enabled[fromIndex];
      if (actualParticipant && actualParticipant.id !== expectedParticipantId) {
        rlog.resume('cfp-guard', `EXIT: participant mismatch expected=${expectedParticipantId.slice(-8)} actual=${actualParticipant.id.slice(-8)}`);
        console.error(
          `[continueFromParticipant] Participant mismatch at index ${fromIndex}: `
          + `expected ${expectedParticipantId}, got ${actualParticipant.id}. `
          + `Config may have changed. Skipping to prevent wrong participant from streaming.`,
        );
        isTriggeringRef.current = false;
        return;
      }
    }

    // ✅ STALE CLOSURE FIX: Use freshMessages (messagesOverride or initialMessages)
    // Messages are now persisted via PATCH before streaming (round 1+)
    // freshMessages contains guaranteed-persisted messages, avoiding stale closure issues
    const messagesToSearch = freshMessages.length > 0 ? freshMessages : messages;
    const lastUserMessage = [...messagesToSearch].reverse().find(m => m.role === MessageRoles.USER);

    if (!lastUserMessage) {
      rlog.resume('cfp-guard', 'EXIT: no user message');
      isTriggeringRef.current = false;
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      rlog.resume('cfp-guard', 'EXIT: empty user text');
      isTriggeringRef.current = false;
      return;
    }

    // ✅ STALE CLOSURE FIX: Use freshMessages (persisted messages) for round number calculation
    // Messages are now persisted via PATCH before streaming starts (round 1+)
    const roundNumber = getCurrentRoundNumber(messagesToSearch);

    rlog.resume('continue', `P${fromIndex} r${roundNumber} msgs=${messages.length} search=${messagesToSearch.length} enabled=${enabled.length}`);

    // =========================================================================
    // ✅ MISSING EARLIER PARTICIPANT FIX: Validate all earlier participants have messages
    // =========================================================================
    // Race condition: Server says "start from P1" (P0 completed in DB), but SSR returns
    // messages WITHOUT P0's response (DB propagation delay). If we blindly start P1,
    // P0's message is lost and never re-triggered.
    //
    // Fix: Before proceeding, verify all participants 0..(fromIndex-1) have messages.
    // If any are missing, start from the first missing participant instead.
    let actualFromIndex = fromIndex;

    // ✅ FIX: Check BOTH messages AND messagesToSearch to find earlier participants
    // messages = hook state, messagesToSearch = persisted messages from PATCH
    // Either source having the message is sufficient
    if (effectiveThreadId && fromIndex > 0) {
      for (let i = 0; i < fromIndex; i++) {
        const expectedMsgId = `${effectiveThreadId}_r${roundNumber}_p${i}`;
        const existingInMessages = messages.find(m => m.id === expectedMsgId);
        const existingInSearch = messagesToSearch.find(m => m.id === expectedMsgId);
        const existingInRef = messagesRef.current.find(m => m.id === expectedMsgId);
        const existingMsg = existingInMessages || existingInSearch || existingInRef;

        // Check if message exists and has actual content
        const hasContent = existingMsg?.parts?.some(
          p => p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
        );

        if (!existingMsg || !hasContent) {
          rlog.resume('gap', `P${i} missing (wanted P${fromIndex}) → start P${i}`);
          actualFromIndex = i;
          break;
        }
      }
    }

    const fromIndexToUse = actualFromIndex;

    // =========================================================================
    // ✅ DUPLICATE MESSAGE FIX: Check if participant already has a complete message
    // =========================================================================
    // Before triggering a participant, check if they already have a message.
    // This prevents duplicate messages when:
    // 1. User refreshes mid-stream
    // 2. Participant's message was saved to DB before refresh
    // 3. On refresh, resumption logic triggers the same participant again
    // 4. Without this check, a NEW message would be created (duplicate)
    //
    // The deterministic message ID format is: {threadId}_r{roundNumber}_p{participantIndex}
    const participant = enabled[fromIndexToUse];
    if (participant && threadId) {
      const expectedMessageId = `${threadId}_r${roundNumber}_p${fromIndexToUse}`;
      const existingMessage = messages.find(m => m.id === expectedMessageId);

      if (existingMessage) {
        // Check if the existing message is TRULY complete (has finishReason AND content)
        const existingMetadata = getAssistantMetadata(existingMessage.metadata);
        const hasFinishReason = !!existingMetadata?.finishReason
          && existingMetadata.finishReason !== FinishReasons.UNKNOWN;
        const hasContent = existingMessage.parts?.some(
          p => p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
        ) || false;

        // ✅ CONTENT DUPLICATION FIX: Only skip if message is TRULY complete
        // A message is truly complete if it has BOTH valid finishReason AND content.
        // If it only has partial content (no finishReason), we need to re-stream.
        if (hasFinishReason && hasContent) {
          // ✅ RACE CONDITION FIX: Notify store when skipping a completed participant
          // Previously, this would return early without notifying anyone, leaving
          // the system stuck with nextParticipantToTrigger set but no streaming starting.
          // Now we call onResumedStreamComplete which tells the store to advance to next participant.
          isTriggeringRef.current = false;
          // Notify store that this participant was "completed" (already had content)
          // Store will then find and trigger the NEXT incomplete participant
          onResumedStreamComplete?.(roundNumber, fromIndexToUse);
          return;
        }

        // ✅ CONTENT DUPLICATION FIX (AGGRESSIVE): ALWAYS clear parts when resuming
        // This is necessary because:
        // 1. Cross-contamination can occur if AI SDK picks up from wrong stream position
        // 2. Partial content from interrupted streams MUST be cleared before re-streaming
        // 3. Even "empty" messages might have stale state from previous session
        // 4. The AI SDK appends to existing parts - we need a clean slate
        //
        // ✅ CRITICAL: Use flushSync to ensure AI SDK sees cleared state BEFORE streaming starts
        // Without flushSync, setMessages is async and AI SDK may use stale internal state
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for race condition fix: AI SDK must see cleared state synchronously
        flushSync(() => {
          // ✅ FROZEN ARRAY FIX: Clone to break Immer freeze for AI SDK mutability
          setMessages(currentMessages =>
            structuredClone(currentMessages.map(m =>
              m.id === expectedMessageId
                ? { ...m, parts: [], metadata: isObject(m.metadata) ? { ...m.metadata, finishReason: undefined } : { finishReason: undefined } }
                : m,
            )),
          );
        });
      }
    }

    // CRITICAL: Update refs to start from the specified participant index
    currentIndexRef.current = fromIndexToUse;
    roundParticipantsRef.current = enabled;
    currentRoundRef.current = roundNumber;
    lastUsedParticipantIndex.current = null; // Reset for new continuation
    queuedParticipantsThisRoundRef.current = new Set(); // Reset queued tracking for continuation
    participantIndexQueue.current = []; // ✅ FIX: Clear stale queue entries from previous round

    // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
    isStreamingRef.current = true;

    // Reset state for continuation
    setIsExplicitlyStreaming(true);
    setCurrentParticipantIndex(fromIndexToUse);
    setCurrentRound(roundNumber);
    resetErrorTracking();
    clearAnimations?.(); // Clear any pending animations

    // ✅ CRITICAL FIX: Push participant index to queue before calling aiSendMessage
    // Guard against double-push if continueFromParticipant is called concurrently
    if (!queuedParticipantsThisRoundRef.current.has(fromIndexToUse)) {
      queuedParticipantsThisRoundRef.current.add(fromIndexToUse);
      participantIndexQueue.current.push(fromIndexToUse);
    }

    // ✅ CRITICAL FIX: Store expected user message ID for backend DB lookup
    // Only needed when this is triggering the first participant (index 0)
    // AI SDK's sendMessage will create a message with its own ID, but we need
    // the backend to look up by the correct pre-persisted message ID.
    if (fromIndexToUse === 0) {
      expectedUserMessageIdRef.current = lastUserMessage.id;
    }

    // ✅ CRITICAL FIX: Use queueMicrotask and try-catch to handle AI SDK state errors
    // Same pattern as startRound for consistent error handling
    //
    // ✅ CRITICAL: isTriggeringRef stays TRUE until async work completes
    queueMicrotask(async () => {
      try {
        // Trigger streaming for the specified participant
        await aiSendMessage({
          text: userText,
          metadata: {
            role: UIMessageRoles.USER,
            roundNumber,
            isParticipantTrigger: true,
          },
        });
        // ✅ SUCCESS: Reset trigger lock after aiSendMessage succeeds
        isTriggeringRef.current = false;
      } catch (error) {
        // ✅ GRACEFUL ERROR HANDLING: Reset state to allow retry
        console.error('[continueFromParticipant] aiSendMessage failed, resetting state:', error);
        isStreamingRef.current = false;
        isTriggeringRef.current = false;
        queuedParticipantsThisRoundRef.current.clear();
        participantIndexQueue.current = [];
        lastUsedParticipantIndex.current = null;
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for error recovery
        flushSync(() => {
          setIsExplicitlyStreaming(false);
        });
      }
    });
    // ✅ NOTE: isTriggeringRef is NOT reset here - it stays true until async work completes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs provides stable ref access to threadId (intentionally omitted to avoid effect re-runs)
  }, [messages, initialMessages, status, resetErrorTracking, clearAnimations, isExplicitlyStreaming, aiSendMessage, threadId, onResumedStreamComplete]);

  /**
   * Send a user message and start a new round
   *
   * If enableWebSearch is true, executes pre-search BEFORE participant streaming
   */
  const sendMessage = useCallback(
    async (content: string) => {
      // ✅ CRITICAL FIX: ATOMIC check-and-set to prevent race conditions
      // Same pattern as startRound - must happen FIRST before any other logic
      if (isTriggeringRef.current) {
        return;
      }
      isTriggeringRef.current = true;

      // ✅ FIX: Require AI SDK to be fully ready before sending
      // Previously used relaxed check (not STREAMING/SUBMITTED) but this allowed calls
      // when Chat instance wasn't initialized, causing "Cannot read properties of undefined (reading 'state')" error
      // The 204 resume response case will eventually set status to 'ready', so callers should wait
      if (status !== AiSdkStatuses.READY || isExplicitlyStreaming) {
        isTriggeringRef.current = false;
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        isTriggeringRef.current = false;
        return;
      }

      // AI SDK v6 Pattern: Simple, straightforward participant filtering
      const uniqueParticipants = deduplicateParticipants(participants);
      const enabled = getEnabledParticipants(uniqueParticipants);

      if (enabled.length === 0) {
        isTriggeringRef.current = false;
        throw new Error('No enabled participants');
      }

      // CRITICAL: Update refs FIRST to avoid race conditions
      // These refs are used in prepareSendMessagesRequest and must be set before the API call
      currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
      roundParticipantsRef.current = enabled;
      lastUsedParticipantIndex.current = null; // Reset for new round
      queuedParticipantsThisRoundRef.current = new Set(); // Reset queued tracking for new round
      participantIndexQueue.current = []; // ✅ FIX: Clear stale queue entries from previous round

      // ✅ CRITICAL FIX: Validate regenerate round matches current round
      // If regenerateRoundNumberRef is set but doesn't match current round,
      // it's stale state from a previous operation - clear it
      const currentRound = getCurrentRoundNumber(messages);
      const isActuallyRegenerating = regenerateRoundNumberRef.current !== null
        && regenerateRoundNumberRef.current === currentRound;

      // Use regenerate round number if retrying current round, otherwise calculate next
      const newRoundNumber = isActuallyRegenerating
        ? (regenerateRoundNumberRef.current ?? calculateNextRoundNumber(messages))
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

      // CRITICAL FIX: Use flushSync to ensure state updates are committed synchronously
      // before the API call is made. This prevents:
      // 1. First participant's response appearing before user message during streaming
      // 2. chat.isStreaming being false when sync effect runs, causing content updates to be skipped
      //
      // Without this, React batches state updates and the sync effect runs before
      // isExplicitlyStreaming is committed, so streaming content doesn't update gradually.
      // eslint-disable-next-line react-dom/no-flush-sync -- Required for proper streaming sync
      flushSync(() => {
        // AI SDK v6 Pattern: Synchronization for proper message ordering
        // Reset all state for new round - INSIDE flushSync so they commit immediately
        setIsExplicitlyStreaming(true);
        setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
        setCurrentRound(newRoundNumber);
      });

      // These don't need to be in flushSync
      resetErrorTracking();
      clearAnimations?.(); // Clear any pending animations from previous round

      // ✅ CRITICAL FIX: Push participant 0 index to queue before calling aiSendMessage
      // Guard against double-push if sendMessage is called concurrently
      if (!queuedParticipantsThisRoundRef.current.has(0)) {
        queuedParticipantsThisRoundRef.current.add(0);
        participantIndexQueue.current.push(0);
      }

      // ✅ ATTACHMENTS: Get file parts from ref for AI SDK message creation
      // This ensures AI SDK includes file parts in the user message it creates
      // Without this, file attachments in 2nd+ rounds don't show until refresh
      const fileParts = callbackRefs.pendingFileParts.current || [];

      // ✅ CRITICAL FIX: Use queueMicrotask and try-catch to handle AI SDK state errors
      // Same pattern as startRound for consistent error handling
      //
      // ✅ CRITICAL: isTriggeringRef stays TRUE until async work completes
      queueMicrotask(async () => {
        try {
          // Send message without custom ID - let backend generate unique IDs
          await aiSendMessage({
            text: trimmed,
            // ✅ AI SDK v6: Include files so user message has file parts
            ...(fileParts.length > 0 && { files: fileParts }),
            metadata: {
              role: UIMessageRoles.USER,
              roundNumber: newRoundNumber,
            },
          });
          // ✅ SUCCESS: Reset trigger lock after aiSendMessage succeeds
          isTriggeringRef.current = false;
        } catch (error) {
          // ✅ GRACEFUL ERROR HANDLING: Reset state to allow retry
          console.error('[sendMessage] aiSendMessage failed, resetting state:', error);
          isStreamingRef.current = false;
          isTriggeringRef.current = false;
          queuedParticipantsThisRoundRef.current.clear();
          participantIndexQueue.current = [];
          lastUsedParticipantIndex.current = null;
          // eslint-disable-next-line react-dom/no-flush-sync -- Required for error recovery
          flushSync(() => {
            setIsExplicitlyStreaming(false);
          });
        }
      });
      // ✅ NOTE: isTriggeringRef is NOT reset here - it stays true until async work completes
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs is stable, all values accessed via .current
    [participants, status, aiSendMessage, messages, resetErrorTracking, clearAnimations, isExplicitlyStreaming],
  );

  /**
   * Retry the last round (regenerate entire round from scratch)
   * AI SDK v6 Pattern: Clean state management for round regeneration
   *
   * This completely removes ALL messages from the round (user + assistant)
   * and re-sends the user's prompt to regenerate the round from ground up.
   */
  const retry = useCallback(() => {
    // ✅ FIX: Require AI SDK to be fully ready before sending
    // Previously used relaxed check (not STREAMING/SUBMITTED) but this allowed calls
    // when Chat instance wasn't initialized, causing "Cannot read properties of undefined (reading 'state')" error
    if (status !== AiSdkStatuses.READY) {
      return;
    }

    // Find the last substantive user message (not a participant trigger)
    const lastUserMessage = [...messages].reverse().find((m) => {
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

    // ✅ CRITICAL FIX: Extract file parts from the original message for retry
    // Without this, retrying a round with attachments loses the attachments
    // Uses shared extractValidFileParts utility for consistent file part handling
    const originalFileParts = extractValidFileParts(lastUserMessage.parts);

    const roundNumber = getCurrentRoundNumber(messages);

    // STEP 1: Set regenerate flag to preserve round numbering
    regenerateRoundNumberRef.current = roundNumber;

    // STEP 2: Call onRetry FIRST to remove moderator and cleanup state
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

    // ✅ CRITICAL FIX: Deep clone messages to break Immer freeze
    // Messages may contain frozen objects from Zustand store (via sync)
    // AI SDK needs mutable arrays to push streaming parts during response generation
    // Without this, streaming fails with "Cannot add property 0, object is not extensible"
    setMessages(structuredClone(messagesBeforeRound));

    // STEP 4: Reset streaming state to start fresh
    // ✅ CRITICAL FIX: Update streaming ref SYNCHRONOUSLY before setState
    isStreamingRef.current = false;
    setIsExplicitlyStreaming(false);

    // CRITICAL: Update ref BEFORE setting state
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    lastUsedParticipantIndex.current = null; // Reset for retry
    queuedParticipantsThisRoundRef.current = new Set(); // Reset queued tracking for retry
    participantIndexQueue.current = []; // ✅ FIX: Clear stale queue entries before retry

    // Update participant index synchronously (no flushSync needed)
    setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);

    resetErrorTracking();
    clearAnimations?.(); // Clear any pending animations before retry
    isTriggeringRef.current = false;

    // ✅ CRITICAL FIX: Set pendingFileParts ref so sendMessage includes attachments
    // Without this, file attachments are lost when retrying a round
    // sendMessage reads from callbackRefs.pendingFileParts.current
    // originalFileParts is ExtendedFilePart[] from extractValidFileParts
    if (originalFileParts.length > 0) {
      callbackRefs.pendingFileParts.current = originalFileParts;
    }

    // STEP 5: Send message to start regeneration (as if user just sent the message)
    // This will create a new round with fresh messages (user + assistant)
    // React will batch the state updates naturally
    // The sendMessage function will handle participant orchestration properly
    sendMessage(userPromptText);
    // Note: callbackRefs not in deps - we use callbackRefs.onRetry.current to always get latest value
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefs.onRetry/pendingFileParts accessed via .current (ref pattern)
  }, [messages, sendMessage, status, setMessages, resetErrorTracking, clearAnimations]);

  // ✅ REACT 19 PATTERN: useEffectEvent for resumed stream handling
  // This event handler reads latest values (hasEarlyOptimisticMessage, threadId, messages)
  // without causing the effect to re-run when those values change
  const handleResumedStreamDetection = useEffectEvent(() => {
    // ✅ GUARD: Don't set during form submission (hasEarlyOptimisticMessage check)
    if (hasEarlyOptimisticMessage) {
      return false;
    }

    // ✅ GUARD: Only if we have a valid thread ID (not on overview page initial load)
    if (!threadId || threadId.trim() === '') {
      return false;
    }

    // ✅ GUARD: Need messages to determine round/participant context
    if (messagesRef.current.length === 0) {
      return false;
    }

    // ✅ CRITICAL GUARD: Only detect resume on PAGE REFRESH, not normal round transitions
    // On page refresh: roundParticipantsRef is empty (not populated yet)
    // On normal round start: roundParticipantsRef is populated from previous round
    // Without this guard, the phantom timeout would be set on every new round,
    // causing the first participant to wait 5 seconds before streaming shows in UI
    if (roundParticipantsRef.current.length > 0) {
      return false; // Normal round transition, not a page refresh
    }

    // Detected resumed stream - set streaming flag FIRST
    // This ensures store.isStreaming reflects the actual state for message sync
    // Must happen BEFORE the streamResumptionPrefilled check so message sync works
    isStreamingRef.current = true;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- called from useEffectEvent in response to AI SDK status
    setIsExplicitlyStreaming(true);

    // ✅ CRITICAL FIX: When server has prefilled resumption state, DON'T trigger custom resumption
    // The server knows which participant needs to be triggered, but AI SDK is already handling
    // the stream. We've already set isExplicitlyStreaming=true above so message sync works.
    // Return 'blocked' to prevent incomplete-round-resumption from triggering a duplicate.
    if (streamResumptionPrefilled) {
      return 'blocked'; // Stream is being handled by AI SDK, don't trigger custom resumption
    }

    // Also populate roundParticipantsRef if needed for proper orchestration
    // Store guarantees participants are sorted by priority
    if (roundParticipantsRef.current.length === 0 && participantsRef.current.length > 0) {
      const enabled = getEnabledParticipants(participantsRef.current);
      roundParticipantsRef.current = enabled;
    }

    return true;
  });

  // Track whether we've detected a phantom resume (no data flowing)
  const phantomResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesAtResumeDetectionRef = useRef<number>(0);

  // ✅ CRITICAL FIX: Detect resumed stream from AI SDK status
  // When AI SDK auto-resumes via `resume: true`, its status becomes 'streaming'
  // but isExplicitlyStreaming stays false because none of the entry points were called.
  //
  // ✅ PHANTOM RESUME FIX: After setting isExplicitlyStreaming=true, start a 5-second timeout.
  // If no new messages arrive in that time, the resume was phantom (204 response or stale stream).
  // Clear isExplicitlyStreaming to allow incomplete round resumption to take over.
  //
  // ✅ BLOCKED FIX: When streamResumptionPrefilled=true, DON'T let AI SDK take over.
  // Custom resumption will handle triggering the correct participant.
  useLayoutEffect(() => {
    // Only act when AI SDK says it's streaming but we haven't acknowledged it
    if (status === AiSdkStatuses.STREAMING && !isExplicitlyStreaming && !isTriggeringRef.current) {
      const streamResult = handleResumedStreamDetection();

      // ✅ FIX: Handle 'blocked' - server prefilled, let custom resumption handle
      // Don't set any streaming state, let incomplete-round-resumption.ts handle it
      if (streamResult === 'blocked') {
        // AI SDK resume blocked, custom resumption will trigger correct participant
        return;
      }

      if (streamResult === true) {
        // Record message count at resume detection for phantom detection
        messagesAtResumeDetectionRef.current = messagesRef.current.length;

        // ✅ PHANTOM RESUME TIMEOUT: If no new messages in 5 seconds, this was a phantom resume
        // Clear the streaming flag to allow incomplete round resumption to work
        phantomResumeTimeoutRef.current = setTimeout(() => {
          // Check if we're still streaming and no new messages arrived
          if (isStreamingRef.current && messagesRef.current.length === messagesAtResumeDetectionRef.current) {
            // Phantom resume detected - no actual data flowing
            // Clear streaming state to allow incomplete round resumption to trigger
            isStreamingRef.current = false;
            setIsExplicitlyStreaming(false);
          }
        }, 5000);
      }
    }

    // Cleanup timeout on unmount or when status changes
    return () => {
      if (phantomResumeTimeoutRef.current) {
        clearTimeout(phantomResumeTimeoutRef.current);
        phantomResumeTimeoutRef.current = null;
      }
    };
  }, [status, isExplicitlyStreaming]);

  // ✅ CLEAR PHANTOM TIMEOUT: When new messages arrive, cancel the phantom detection
  // This means real data is flowing and the resume was successful
  useLayoutEffect(() => {
    if (phantomResumeTimeoutRef.current && messages.length > messagesAtResumeDetectionRef.current) {
      clearTimeout(phantomResumeTimeoutRef.current);
      phantomResumeTimeoutRef.current = null;
    }
  }, [messages.length]);

  // Track previous status for transition detection
  const previousStatusRef = useRef<typeof status>(status);

  // ✅ DEAD STREAM DETECTION: Detect when resumed stream dies without completing
  // When AI SDK status transitions streaming → ready AND we have isExplicitlyStreaming=true,
  // check if current participant completed. If not, clear streaming state so
  // incomplete-round-resumption can retry.
  //
  // This fixes the bug where:
  // 1. User refreshes mid-stream
  // 2. AI SDK resumes and receives buffered data
  // 3. Original worker is dead, so stream ends with partial data
  // 4. AI SDK status goes to 'ready'
  // 5. But isExplicitlyStreaming stays true, blocking retry
  useLayoutEffect(() => {
    const prevStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    // Only check on streaming → ready transition
    if (prevStatus !== AiSdkStatuses.STREAMING || status !== AiSdkStatuses.READY) {
      return;
    }

    // Only relevant when we think we're streaming
    if (!isExplicitlyStreaming) {
      return;
    }

    // Check if the last assistant message completed properly
    const assistantMessages = messagesRef.current.filter(m => m.role === UIMessageRoles.ASSISTANT);
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

    if (!lastAssistantMessage) {
      return;
    }

    // Extract finishReason from metadata
    const metadata = lastAssistantMessage.metadata;
    const finishReason = metadata && typeof metadata === 'object' && 'finishReason' in metadata && typeof metadata.finishReason === 'string'
      ? metadata.finishReason
      : undefined;
    const isComplete = finishReason === FinishReasons.STOP || finishReason === FinishReasons.LENGTH;

    // If participant completed, normal orchestration will handle next steps
    if (isComplete) {
      return;
    }

    // ✅ DEAD STREAM DETECTED: Stream ended but participant didn't complete
    // Clear streaming state so incomplete-round-resumption can retry
    // Use a short timeout to avoid race with legitimate stream continuation
    const deadStreamTimeoutId = setTimeout(() => {
      // Double-check we're still in the same state
      if (isStreamingRef.current) {
        isStreamingRef.current = false;
        setIsExplicitlyStreaming(false);
      }
    }, 500); // Short delay to allow for legitimate reconnections

    return () => {
      clearTimeout(deadStreamTimeoutId);
    };
  }, [status, isExplicitlyStreaming]);

  // ✅ STALE TRIGGER RECOVERY: Reset stuck refs and state
  // When AI SDK completes processing but our refs/state are stuck, this causes a deadlock:
  // - isTriggeringRef.current = true blocks new triggers
  // - isStreamingRef.current = true blocks new streaming
  // - isExplicitlyStreaming = true prevents triggering next participant
  //
  // Recovery: When AI SDK status is 'ready' but state is stuck for 1.5s, reset everything.
  // This allows incomplete-round-resumption to retry.
  //
  // NOTE: We DON'T skip when isExplicitlyStreaming is true - that's exactly the state we
  // need to recover from when AI SDK resume completes but state wasn't cleared properly.
  useLayoutEffect(() => {
    // Only apply when AI SDK says it's ready
    if (status !== AiSdkStatuses.READY) {
      return;
    }

    // Check if any state indicates we think we're processing but AI SDK is done
    const hasStuckState = isTriggeringRef.current || isStreamingRef.current || isExplicitlyStreaming;

    if (!hasStuckState) {
      return;
    }

    // Give a delay to avoid false positives during legitimate operations
    // Increased to 1.5s to ensure any in-flight operations complete
    const staleRecoveryTimeoutId = setTimeout(() => {
      // Double-check AI SDK is still ready (no new operation started)
      if (status !== AiSdkStatuses.READY) {
        return;
      }

      // Reset all stuck state
      if (isTriggeringRef.current) {
        isTriggeringRef.current = false;
      }
      if (isStreamingRef.current) {
        isStreamingRef.current = false;
      }
      // Always reset isExplicitlyStreaming if we get here - AI SDK is ready but we think we're streaming
      setIsExplicitlyStreaming(false);
    }, 1500); // 1.5s delay to avoid false positives

    return () => {
      clearTimeout(staleRecoveryTimeoutId);
    };
  }, [status, isExplicitlyStreaming]);

  // ✅ ERROR STATE RECOVERY: Reset state when AI SDK transitions to error
  // When AI SDK resume fails (e.g., nothing to resume, network error), status becomes 'error'.
  // This blocks all retry attempts because isReady checks status === 'ready'.
  //
  // Recovery: When status transitions to 'error' and we're not actively streaming,
  // call setMessages to reset AI SDK state back to 'ready'.
  // This allows incomplete-round-resumption to retry triggering participants.
  const previousErrorCheckRef = useRef(status);
  useLayoutEffect(() => {
    const prevStatus = previousErrorCheckRef.current;
    previousErrorCheckRef.current = status;

    // Only handle transitions TO error state (not from initial render)
    if (status !== AiSdkStatuses.ERROR || prevStatus === AiSdkStatuses.ERROR) {
      return;
    }

    // Skip if we're in the middle of explicit streaming (error will be handled by onError callback)
    if (isExplicitlyStreaming) {
      return;
    }

    // Reset AI SDK state by re-setting current messages
    // This typically causes AI SDK to transition back to 'ready' state
    // Use a microtask to avoid race conditions with ongoing state updates
    // ✅ CRITICAL FIX: Deep clone to ensure mutable arrays for AI SDK streaming
    queueMicrotask(() => {
      setMessages(structuredClone(messagesRef.current));
    });
  }, [status, isExplicitlyStreaming, setMessages]);

  // ✅ CRITICAL FIX: Derive isStreaming from manual flag as primary source of truth
  // AI SDK v6 Pattern: status can be 'ready' | 'submitted' | 'streaming' | 'error'
  // - isExplicitlyStreaming: Our manual flag for participant orchestration
  // - We rely primarily on isExplicitlyStreaming which is set/cleared by our logic
  // - This prevents false positives on initial mount
  // ✅ ENUM PATTERN: Use isExplicitlyStreaming as single source of truth
  const isActuallyStreaming = isExplicitlyStreaming;

  // ✅ RACE CONDITION FIX: Keep ref in sync with streaming state
  // This allows synchronous checks in microtasks to use the latest value
  isStreamingRef.current = isActuallyStreaming;

  // ✅ AI SDK READINESS: Derive from status for provider's continueFromParticipant guard
  // When AI SDK isn't ready, continueFromParticipant returns early silently.
  // Provider needs this flag to wait before calling continueFromParticipant.
  //
  // ✅ BUG FIX: MUST match the internal guard in continueFromParticipant (line 1511)
  // Internal guard: status !== AiSdkStatuses.READY → return early
  // External isReady MUST be false when internal guard would trigger
  // Otherwise: isReady=true, caller proceeds, but continueFromParticipant returns early silently!
  //
  // Previously: allowed 'error' status, causing silent failures after AI SDK errors
  // Now: requires status === 'ready' (matches internal guard)
  const isReady = messages.length > 0
    && status === AiSdkStatuses.READY;

  // ✅ INFINITE LOOP FIX: Memoize return value to prevent new object reference on every render
  // Without this, the chat object creates a new reference each render, causing any effect
  // that depends on `chat` to re-run infinitely (e.g., message sync effect in chat-store-provider)
  // The chat object is used as dependency in provider effects - stable reference is critical.
  return useMemo(
    () => ({
      messages,
      sendMessage,
      startRound,
      continueFromParticipant,
      isStreaming: isActuallyStreaming,
      isStreamingRef,
      isTriggeringRef, // ✅ RACE CONDITION FIX: Expose for provider guards
      currentParticipantIndex,
      error: chatError || null,
      retry,
      setMessages,
      isReady,
    }),
    [
      messages,
      sendMessage,
      startRound,
      continueFromParticipant,
      isActuallyStreaming,
      // isStreamingRef is stable (useRef)
      // isTriggeringRef is stable (useRef)
      currentParticipantIndex,
      chatError,
      retry,
      setMessages,
      isReady,
    ],
  );
}
