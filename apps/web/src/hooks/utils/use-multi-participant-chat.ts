/**
 * Multi-Participant Chat Hook - Backend-First Streaming Architecture
 *
 * This hook provides AI SDK integration for P0 (first participant) message sending.
 * Per FLOW_DOCUMENTATION.md:
 *
 * - Frontend SUBSCRIBES and DISPLAYS only (via useRoundSubscription)
 * - Backend ORCHESTRATES everything (P0 → P1 → ... → Moderator)
 *
 * This hook's role:
 * 1. Initialize AI SDK for the thread
 * 2. Send P0 message when user submits (via startRound)
 * 3. Sync messages between AI SDK and store
 *
 * P1+ participants and moderator are handled by:
 * - Backend queue (triggers)
 * - useRoundSubscription hooks (subscribes to streams)
 */
import { useChat } from '@ai-sdk/react';
import { AiSdkStatuses, MessagePartTypes, MessageRoles, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { extractValidFileParts, isValidFilePartForTransmission } from '@/lib/schemas/message-schemas';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { deduplicateParticipants, getCurrentRoundNumber, getEnabledParticipants } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatParticipant } from '@/services/api';

import { useSyncedRefs } from './use-synced-refs';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for configuring the multi-participant chat hook
 */
export type UseMultiParticipantChatOptions = {
  /** The current chat thread ID */
  threadId: string;
  /** All participants (enabled and disabled) */
  participants: ChatParticipant[];
  /** Initial messages for the chat (optional) */
  messages?: UIMessage[];
  /** Chat mode (e.g., 'moderator', 'standard') */
  mode?: string;
  /** Enable web search before participant streaming */
  enableWebSearch?: boolean;
  /** Pending attachment IDs to associate with the user message */
  pendingAttachmentIds?: string[] | null;
  /** Pending file parts to include in AI SDK message */
  pendingFileParts?: ExtendedFilePart[] | null;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Callback to set store.isStreaming */
  setIsStreaming?: (value: boolean) => void;
  /** Callback to clear pending file parts on navigation */
  setPendingFileParts?: (value: ExtendedFilePart[] | null) => void;
  /** Callback to clear pending attachment IDs on navigation */
  setPendingAttachmentIds?: (value: string[] | null) => void;
};

/**
 * Return value from the multi-participant chat hook
 */
export type UseMultiParticipantChatReturn = {
  /** All messages in the conversation */
  messages: UIMessage[];
  /** Send a new user message (used for initial message flow) */
  sendMessage: (content: string, filePartsOverride?: ExtendedFilePart[]) => Promise<void>;
  /** Start P0 streaming for a round */
  startRound: (participantsOverride?: ChatParticipant[], messagesOverride?: UIMessage[]) => void;
  /** Continue from participant (legacy - backend handles via subscriptions) */
  continueFromParticipant: (
    fromIndexOrTarget: number | { index: number; participantId: string },
    participantsOverride?: ChatParticipant[],
    messagesOverride?: UIMessage[],
  ) => void;
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Ref to check streaming state synchronously */
  isStreamingRef: React.RefObject<boolean>;
  /** Ref to check if triggering is in progress */
  isTriggeringRef: React.RefObject<boolean>;
  /** Current participant index (always 0 for P0) */
  currentParticipantIndex: number;
  /** Error from chat */
  error: Error | null;
  /** Retry function (legacy) */
  retry: () => void;
  /** Set messages in AI SDK */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  /** Whether AI SDK is ready */
  isReady: boolean;
  /** Stop streaming */
  stop: () => void;
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useMultiParticipantChat(
  options: UseMultiParticipantChatOptions,
): UseMultiParticipantChatReturn {
  const {
    enableWebSearch = false,
    messages: initialMessages = [],
    mode,
    onError,
    participants,
    pendingAttachmentIds = null,
    setIsStreaming: setIsStreamingCallback,
    setPendingAttachmentIds,
    setPendingFileParts,
    threadId,
  } = options;

  // Sync callbacks into refs to avoid stale closures
  const callbackRefs = useSyncedRefs({
    enableWebSearch,
    mode,
    onError,
    pendingAttachmentIds,
    setIsStreamingCallback,
    setPendingAttachmentIds,
    setPendingFileParts,
    threadId,
  });

  // Simple state
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState(0);
  const [isExplicitlyStreaming, setIsExplicitlyStreaming] = useState(false);
  const isStreamingRef = useRef<boolean>(false);
  const isTriggeringRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const participantsRef = useRef<ChatParticipant[]>(participants);
  const currentRoundRef = useRef<number>(0);
  const currentIndexRef = useRef<number>(0);
  const messagesRef = useRef<UIMessage[]>([]);
  const statusRef = useRef<string>(AiSdkStatuses.READY);
  const hasHydratedRef = useRef<boolean>(false);
  const expectedUserMessageIdRef = useRef<string | null>(null);

  // Track mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keep participantsRef in sync
  useLayoutEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Prepare transport request body for AI SDK
  const prepareSendMessagesRequest = useCallback(
    ({ id, messages }: { id: string; messages: { role?: string; content?: string; id?: string; parts?: { type: string; text?: string }[] }[] }) => {
      const participantIndexToUse = currentIndexRef.current;

      // Only send attachment IDs with first participant
      const attachmentIdsForRequest = participantIndexToUse === 0
        ? (callbackRefs.pendingAttachmentIds.current || undefined)
        : undefined;

      // Sanitize message parts
      const lastMessage = messages[messages.length - 1];
      const sanitizedMessage = lastMessage && lastMessage.parts
        ? {
            ...lastMessage,
            parts: lastMessage.parts.filter((part) => {
              if (part.type !== 'file') {
                return true;
              }
              return isValidFilePartForTransmission(part);
            }),
          }
        : lastMessage;

      const body = {
        id,
        message: sanitizedMessage,
        participantIndex: participantIndexToUse,
        participants: participantsRef.current,
        ...(callbackRefs.mode.current && { mode: callbackRefs.mode.current }),
        enableWebSearch: callbackRefs.enableWebSearch.current,
        ...(attachmentIdsForRequest && attachmentIdsForRequest.length > 0 && { attachmentIds: attachmentIdsForRequest }),
        ...(expectedUserMessageIdRef.current && participantIndexToUse === 0 && { userMessageId: expectedUserMessageIdRef.current }),
      };

      return { body };
    },
    [],
  );

  // Create AI SDK transport
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/v1/chat',
        prepareReconnectToStreamRequest: ({ id }) => {
          if (!id || id.trim() === '') {
            return { credentials: 'include' };
          }
          return {
            api: `/api/v1/chat/threads/${id}/stream`,
            credentials: 'include',
          };
        },
        prepareSendMessagesRequest,
      }),
    [prepareSendMessagesRequest],
  );

  // Build useChat options
  const useChatId = threadId && threadId.trim() !== '' ? threadId : undefined;
  const useChatOptions = useMemo(() => {
    if (useChatId !== undefined) {
      return { id: useChatId };
    }
    return {};
  }, [useChatId]);

  // AI SDK hook
  const {
    error: chatError,
    messages,
    sendMessage: aiSendMessage,
    setMessages,
    status,
    stop: stopAiSdk,
  } = useChat({
    ...useChatOptions,
    onError: (error) => {
      rlog.stuck('ai-sdk', `error: ${error.message}`);
      callbackRefs.onError.current?.(error);
    },
    // resume: false - Disabled: backend-first architecture uses useRoundSubscription for stream resumption
    // Enabling resume causes 404 errors when navigating between threads (stale thread IDs)
    transport,
  });

  // Sync status to ref for microtask checks
  useLayoutEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Keep messages ref in sync
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Track hydration from initial messages
  useEffect(() => {
    if (messages.length > 0 && !hasHydratedRef.current) {
      hasHydratedRef.current = true;
    }
  }, [messages.length]);

  /**
   * Start P0 streaming for a round
   * Only triggers the first participant via AI SDK
   */
  const startRound = useCallback((
    participantsOverride?: ChatParticipant[],
    messagesOverride?: UIMessage[],
  ) => {
    rlog.stream('start', `ENTER - status=${status}, isTriggeringRef=${isTriggeringRef.current}, isExplicitlyStreaming=${isExplicitlyStreaming}`);

    const freshMessages = messagesOverride || initialMessages;

    // Atomic guard
    if (isTriggeringRef.current) {
      rlog.stream('start', `BLOCKED: already triggering`);
      return;
    }
    isTriggeringRef.current = true;

    const currentParticipants = participantsOverride || participantsRef.current;
    if (participantsOverride) {
      participantsRef.current = participantsOverride;
    }

    const hasMessagesOverride = messagesOverride && messagesOverride.length > 0;

    // Guards
    if (!hasMessagesOverride && (messages.length === 0 || status !== AiSdkStatuses.READY || isExplicitlyStreaming)) {
      rlog.stream('start', `BLOCKED: not ready (msgs=${messages.length}, status=${status})`);
      isTriggeringRef.current = false;
      return;
    }

    if (hasMessagesOverride && isExplicitlyStreaming) {
      rlog.stream('start', `BLOCKED: already streaming`);
      isTriggeringRef.current = false;
      return;
    }

    const effectiveThreadId = callbackRefs.threadId.current;
    if (!effectiveThreadId || effectiveThreadId.trim() === '') {
      rlog.stream('start', `BLOCKED: no threadId`);
      isTriggeringRef.current = false;
      return;
    }

    if (!hasMessagesOverride && !hasHydratedRef.current) {
      rlog.stream('start', `BLOCKED: not hydrated`);
      isTriggeringRef.current = false;
      return;
    }

    const uniqueParticipants = deduplicateParticipants(currentParticipants);
    const enabled = getEnabledParticipants(uniqueParticipants);

    if (enabled.length === 0) {
      rlog.stream('start', `BLOCKED: no enabled participants`);
      isTriggeringRef.current = false;
      return;
    }

    const messagesToSearch = freshMessages.length > 0 ? freshMessages : messages;
    const lastUserMessage = [...messagesToSearch].reverse().find(m => m.role === MessageRoles.USER);

    if (!lastUserMessage) {
      rlog.stream('start', `BLOCKED: no user message`);
      isTriggeringRef.current = false;
      return;
    }

    const textPart = lastUserMessage.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p);
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    if (!userText.trim()) {
      rlog.stream('start', `BLOCKED: empty user text`);
      isTriggeringRef.current = false;
      return;
    }

    const fileParts = extractValidFileParts(lastUserMessage.parts);
    const roundNumber = getCurrentRoundNumber(messagesToSearch);

    rlog.stream('start', `ALL GUARDS PASSED - starting round ${roundNumber} with ${enabled.length} participants`);

    // Update refs
    currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
    currentRoundRef.current = roundNumber;
    isStreamingRef.current = true;

    // Update state
    queueMicrotask(() => {
      // eslint-disable-next-line react-dom/no-flush-sync -- Required for proper streaming sync
      flushSync(() => {
        setIsExplicitlyStreaming(true);
        setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);
      });
    });

    // Store expected user message ID for backend lookup
    expectedUserMessageIdRef.current = lastUserMessage.id;

    // Send P0 message via AI SDK
    const scheduledThreadId = effectiveThreadId;
    queueMicrotask(async () => {
      try {
        if (!isMountedRef.current) {
          isTriggeringRef.current = false;
          isStreamingRef.current = false;
          return;
        }

        if (callbackRefs.threadId.current !== scheduledThreadId) {
          rlog.stream('start', `ABORTED: thread changed`);
          isTriggeringRef.current = false;
          isStreamingRef.current = false;
          // eslint-disable-next-line react-dom/no-flush-sync -- Required for state reset
          flushSync(() => setIsExplicitlyStreaming(false));
          return;
        }

        if (statusRef.current !== AiSdkStatuses.READY) {
          rlog.stream('start', `ABORTED: AI SDK not ready (${statusRef.current})`);
          isTriggeringRef.current = false;
          isStreamingRef.current = false;
          // eslint-disable-next-line react-dom/no-flush-sync -- Required for state reset
          flushSync(() => setIsExplicitlyStreaming(false));
          return;
        }

        rlog.stream('start', `sending P0 message r${roundNumber}`);
        await aiSendMessage({
          text: userText,
          ...(fileParts.length > 0 && { files: fileParts }),
          metadata: {
            isParticipantTrigger: true,
            role: UIMessageRoles.USER,
            roundNumber,
          },
        });
        isTriggeringRef.current = false;
      } catch (error) {
        console.error('[startRound] aiSendMessage failed:', error);
        isStreamingRef.current = false;
        isTriggeringRef.current = false;
        // eslint-disable-next-line react-dom/no-flush-sync -- Required for error recovery
        flushSync(() => setIsExplicitlyStreaming(false));
      }
    });
  }, [messages, initialMessages, status, isExplicitlyStreaming, aiSendMessage]);

  /**
   * Continue from participant - legacy function
   * Backend handles resumption via subscriptions now
   */
  const continueFromParticipant = useCallback((
    _fromIndexOrTarget: number | { index: number; participantId: string },
    _participantsOverride?: ChatParticipant[],
    _messagesOverride?: UIMessage[],
  ) => {
    // No-op - backend handles resumption via useRoundSubscription
    rlog.stream('resume', 'continueFromParticipant called but backend handles resumption');
  }, []);

  /**
   * Send a new user message
   * Used for initial thread creation flow
   */
  const sendMessage = useCallback(
    async (content: string, _filePartsOverride?: ExtendedFilePart[]) => {
      if (isTriggeringRef.current) {
        return;
      }
      isTriggeringRef.current = true;

      if (status !== AiSdkStatuses.READY || isExplicitlyStreaming) {
        isTriggeringRef.current = false;
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        isTriggeringRef.current = false;
        return;
      }

      const uniqueParticipants = deduplicateParticipants(participants);
      const enabled = getEnabledParticipants(uniqueParticipants);

      if (enabled.length === 0) {
        isTriggeringRef.current = false;
        throw new Error('No enabled participants');
      }

      currentIndexRef.current = DEFAULT_PARTICIPANT_INDEX;
      isStreamingRef.current = true;
      setIsExplicitlyStreaming(true);
      setCurrentParticipantIndex(DEFAULT_PARTICIPANT_INDEX);

      try {
        await aiSendMessage({
          metadata: {
            isParticipantTrigger: true,
            role: UIMessageRoles.USER,
            roundNumber: 0,
          },
          text: trimmed,
        });
        isTriggeringRef.current = false;
      } catch (error) {
        isStreamingRef.current = false;
        isTriggeringRef.current = false;
        setIsExplicitlyStreaming(false);
        throw error;
      }
    },
    [status, isExplicitlyStreaming, participants, aiSendMessage],
  );

  /**
   * Retry - legacy function
   */
  const retry = useCallback(() => {
    rlog.resume('retry', 'retry called - no-op in backend-first architecture');
  }, []);

  // Sync streaming state to callback
  useEffect(() => {
    callbackRefs.setIsStreamingCallback.current?.(isExplicitlyStreaming);
  }, [isExplicitlyStreaming, callbackRefs]);

  // Recovery: Reset stuck state when AI SDK is ready
  useLayoutEffect(() => {
    if (status !== AiSdkStatuses.READY) {
      return;
    }

    const hasStuckState = isTriggeringRef.current || isStreamingRef.current || isExplicitlyStreaming;
    if (!hasStuckState) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (status !== AiSdkStatuses.READY) {
        return;
      }
      if (isTriggeringRef.current) {
        isTriggeringRef.current = false;
      }
      if (isStreamingRef.current) {
        isStreamingRef.current = false;
      }
      setIsExplicitlyStreaming(false);
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [status, isExplicitlyStreaming]);

  // Derive streaming state
  const isActuallyStreaming = isExplicitlyStreaming;
  isStreamingRef.current = isActuallyStreaming;

  // AI SDK readiness
  const isReady = messages.length > 0 && status === AiSdkStatuses.READY;

  // Debug logging
  useEffect(() => {
    rlog.trigger('isReady-calc', `status=${status} msgs=${messages.length} isReady=${isReady}`);
  }, [status, messages.length, isReady]);

  return useMemo(
    () => ({
      continueFromParticipant,
      currentParticipantIndex,
      error: chatError || null,
      isReady,
      isStreaming: isActuallyStreaming,
      isStreamingRef,
      isTriggeringRef,
      messages,
      retry,
      sendMessage,
      setMessages,
      startRound,
      stop: stopAiSdk,
    }),
    [
      continueFromParticipant,
      currentParticipantIndex,
      chatError,
      isReady,
      isActuallyStreaming,
      messages,
      retry,
      sendMessage,
      setMessages,
      startRound,
      stopAiSdk,
    ],
  );
}

// Re-export types for backwards compatibility
export type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
