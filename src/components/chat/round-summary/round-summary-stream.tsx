'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef } from 'react';

import type { StreamErrorType } from '@/api/core/enums';
import { MessagePartTypes, MessageStatuses, StreamErrorTypes } from '@/api/core/enums';
import type {
  RoundSummaryAIContent,
  StoredRoundSummary,
} from '@/api/routes/chat/schema';
import { RoundSummaryAIContentSchema } from '@/api/routes/chat/schema';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { BRAND } from '@/constants/brand';
import { useBoolean } from '@/hooks/utils';
import { hasSummaryData } from '@/lib/utils/summary-utils';
import { getSummaryResumeService } from '@/services/api';

import { MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from './moderator-constants';
import { ModeratorHeader } from './moderator-header';

// ============================================================================
// RESUMABLE STREAMS: Attempt to resume summary from buffer on page reload
// ============================================================================

/**
 * Attempt to resume a summary stream from KV buffer
 * Returns the parsed summary data if successful, null otherwise
 *
 * @pattern Following stream-resume.handler.ts pattern for chat streams
 *
 * Response handling:
 * - 204 No Content: No buffer available
 * - 200 OK with X-Stream-Status: completed: Complete data available
 * - 200 OK without header: Legacy/fallback, try to parse
 */
async function attemptSummaryResume(
  threadId: string,
  roundNumber: number,
): Promise<{ success: true; data: RoundSummaryAIContent } | { success: false; reason: 'no-buffer' | 'incomplete' | 'error' }> {
  try {
    // ✅ TYPE-SAFE: Use service with RPC-compliant structure
    const response = await getSummaryResumeService({
      param: { threadId, roundNumber: roundNumber.toString() },
    });

    // 204 No Content = no buffer available
    if (response.status === 204) {
      return { success: false, reason: 'no-buffer' };
    }

    // Non-200 = error
    if (!response.ok) {
      console.error('[RoundSummaryStream] Resume request failed:', response.status);
      return { success: false, reason: 'error' };
    }

    // Check X-Stream-Status header
    const streamStatus = response.headers.get('X-Stream-Status');

    // If status header indicates completed, data should be complete
    if (streamStatus === 'completed') {
      const bufferedText = await response.text();

      if (!bufferedText || bufferedText.trim() === '') {
        return { success: false, reason: 'no-buffer' };
      }

      try {
        const parsed = JSON.parse(bufferedText);
        const validated = RoundSummaryAIContentSchema.safeParse(parsed);

        if (validated.success) {
          return { success: true, data: validated.data };
        }

        // Even with completed status, schema validation might fail
        // Check if we have enough data to be useful
        if (hasSummaryData(parsed)) {
          return { success: true, data: parsed as RoundSummaryAIContent };
        }

        return { success: false, reason: 'incomplete' };
      } catch {
        // JSON parse failed even though status said completed
        return { success: false, reason: 'incomplete' };
      }
    }

    // No status header (legacy) or unknown status - try to parse
    const bufferedText = await response.text();

    if (!bufferedText || bufferedText.trim() === '') {
      return { success: false, reason: 'no-buffer' };
    }

    try {
      const parsed = JSON.parse(bufferedText);
      const validated = RoundSummaryAIContentSchema.safeParse(parsed);

      if (validated.success) {
        return { success: true, data: validated.data };
      }

      if (hasSummaryData(parsed)) {
        return { success: true, data: parsed as RoundSummaryAIContent };
      }

      return { success: false, reason: 'incomplete' };
    } catch {
      return { success: false, reason: 'incomplete' };
    }
  } catch (error) {
    console.error('[RoundSummaryStream] Resume attempt failed:', error);
    return { success: false, reason: 'error' };
  }
}

type RoundSummaryStreamProps = {
  threadId: string;
  summary: StoredRoundSummary;
  // ✅ AI SDK v5: Uses RoundSummaryAIContent (summary + metrics only)
  // Metadata (roundNumber, mode, userQuestion) is stored in DB row, not streamed
  onStreamComplete?: (completedSummaryData?: RoundSummaryAIContent | null, error?: Error | null) => void;
  onStreamStart?: () => void;
};

// ✅ ZUSTAND PATTERN: Summary stream tracking now in store
// See store.ts: markSummaryStreamTriggered, hasSummaryStreamBeenTriggered, clearSummaryStreamTracking

function RoundSummaryStreamComponent({
  threadId,
  summary,
  onStreamComplete,
  onStreamStart,
}: RoundSummaryStreamProps) {
  const t = useTranslations('moderator');

  // ✅ ZUSTAND PATTERN: Summary stream tracking from store (replaces module-level Maps)
  const markSummaryStreamTriggered = useChatStore(s => s.markSummaryStreamTriggered);
  const hasSummaryStreamBeenTriggered = useChatStore(s => s.hasSummaryStreamBeenTriggered);

  // ✅ CRITICAL FIX: Store callbacks in refs for stability and to allow calling after unmount
  // This prevents summary from getting stuck in "streaming" state when component unmounts
  // Follows the same pattern as use-multi-participant-chat.ts callback refs
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  // ✅ Error handling state for UI display
  const streamErrorTypeRef = useRef<StreamErrorType>(StreamErrorTypes.UNKNOWN);
  // ✅ AUTO-RETRY UI: Track when retrying for streaming completion
  const isAutoRetrying = useBoolean(false);

  // ✅ FIX: Track if we've already started streaming to prevent infinite loop
  // Without this, calling onStreamStart → updateMessageStatus creates new state
  // → triggers re-render → useEffect runs again → infinite loop
  const hasStartedStreamingRef = useRef(false);

  // ✅ CRITICAL FIX: Store partial summary in ref for fallback in onFinish
  // AI SDK's onFinish may receive object=undefined due to stream termination issues
  // even when valid data was successfully streamed (visible in partialSummary)
  // This ref captures the latest streamed data to use as fallback
  // NOTE: Using 'unknown' because AI SDK's PartialObject<T> type differs from Partial<T>
  // The hasSummaryData() util handles the type checking at runtime
  const partialSummaryRef = useRef<unknown>(null);

  // ✅ AUTO-RETRY: Track retry attempts for empty response errors
  // Empty responses happen due to: model timeout, rate limiting, network issues
  // Auto-retry provides better UX than showing error immediately
  // ✅ FIX: Increased retries and fixed 3-second intervals for better UX
  const MAX_EMPTY_RESPONSE_RETRIES = 3;
  const RETRY_INTERVAL_MS = 3000; // Fixed 3-second intervals as requested
  const emptyResponseRetryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ Submit function ref - declared early to be available in onFinish callback
  // The actual submit function is set after useObject returns
  const submitRef = useRef<((input: { participantMessageIds: string[] }) => void) | null>(null);

  // ✅ SCROLL FIX: Removed useAutoScroll - scroll is managed centrally by useChatScroll
  // Having nested useAutoScroll (with its own ResizeObserver) inside the accordion
  // caused conflicting scroll systems that fought each other, resulting in excessive
  // jumping/snapping behavior. The useChatScroll hook in ChatThreadScreen handles all
  // window-level auto-scroll during streaming via a single ResizeObserver on document.body.

  // ✅ Reset the streaming flag when summary ID changes (new summary)
  useEffect(() => {
    hasStartedStreamingRef.current = false;
    partialSummaryRef.current = null; // Reset fallback data for new summary
    emptyResponseRetryCountRef.current = 0; // Reset retry count for new summary
  }, [summary.id]);

  // ✅ AUTO-RETRY: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // ✅ AI SDK v5 Pattern: useObject hook for streaming structured data
  // Server uses streamObject with RoundSummaryAIContentSchema (summary + metrics only)
  // Client receives partialObjectStream as JSON is progressively built
  const { object: partialSummary, error: _error, submit, isLoading: isStreamLoading } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${summary.roundNumber}/summarize`,
    schema: RoundSummaryAIContentSchema, // ✅ AI-generated content only (no metadata)
    // ✅ AI SDK v5 Pattern: onFinish callback for handling completion and errors
    onFinish: ({ object: finalObject, error: streamError }) => {
      // ✅ Success case: object is defined and valid
      if (finalObject && hasSummaryData(finalObject)) {
        emptyResponseRetryCountRef.current = 0;
        onStreamCompleteRef.current?.(finalObject as RoundSummaryAIContent);
        return;
      }

      // Handle error cases
      if (!finalObject || !hasSummaryData(finalObject)) {
        // Classify error type using enum pattern
        let errorType: StreamErrorType = StreamErrorTypes.UNKNOWN;
        const errorMessage = streamError?.message || String(streamError || 'Unknown error');

        // ✅ CRITICAL FIX: Detect empty/undefined response from AI model
        const isEmptyResponse = errorMessage.includes('expected object, received undefined')
          || errorMessage.includes('Invalid input: expected object, received undefined')
          || (errorMessage.includes('invalid_type') && errorMessage.includes('path": []'));

        // ✅ Enum Pattern: Classify error type
        if (isEmptyResponse) {
          // Check if we have valid partial data from streaming
          const fallbackData = partialSummaryRef.current;
          if (fallbackData && hasSummaryData(fallbackData)) {
            const validated = RoundSummaryAIContentSchema.safeParse(fallbackData);
            if (validated.success) {
              emptyResponseRetryCountRef.current = 0;
              onStreamCompleteRef.current?.(validated.data);
              return;
            }
          }

          // ✅ AUTO-RETRY: Automatically retry empty response errors
          if (emptyResponseRetryCountRef.current < MAX_EMPTY_RESPONSE_RETRIES) {
            emptyResponseRetryCountRef.current++;
            isAutoRetrying.onTrue();

            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }

            retryTimeoutRef.current = setTimeout(() => {
              hasStartedStreamingRef.current = false;
              const messageIds = summary.participantMessageIds;
              if (messageIds?.length && submitRef.current) {
                submitRef.current({ participantMessageIds: messageIds });
              }
            }, RETRY_INTERVAL_MS);
            return;
          }

          // ✅ Max retries exceeded - report error
          errorType = StreamErrorTypes.EMPTY_RESPONSE;
          streamErrorTypeRef.current = errorType;
          emptyResponseRetryCountRef.current = 0;
          isAutoRetrying.onFalse();
          onStreamCompleteRef.current?.(null, new Error(t('errors.emptyResponseError')));
          return;
        } else if (streamError instanceof Error) {
          if (streamError.name === 'AbortError' || errorMessage.includes('aborted')) {
            errorType = StreamErrorTypes.ABORT;
          } else if (streamError.name === 'TypeValidationError' || errorMessage.includes('validation') || errorMessage.includes('invalid_type')) {
            // For validation errors, try to use partial data
            const fallbackData = partialSummaryRef.current;
            if (fallbackData && hasSummaryData(fallbackData)) {
              const validated = RoundSummaryAIContentSchema.safeParse(fallbackData);
              if (validated.success) {
                emptyResponseRetryCountRef.current = 0;
                onStreamCompleteRef.current?.(validated.data);
                return;
              }
            }
            errorType = StreamErrorTypes.VALIDATION;
          } else if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
            // =========================================================================
            // ✅ 409 CONFLICT: Another stream is actively generating
            // =========================================================================
            errorType = StreamErrorTypes.CONFLICT;

            if (emptyResponseRetryCountRef.current < MAX_EMPTY_RESPONSE_RETRIES) {
              emptyResponseRetryCountRef.current++;
              isAutoRetrying.onTrue();

              if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
              }

              retryTimeoutRef.current = setTimeout(() => {
                hasStartedStreamingRef.current = false;
                const messageIds = summary.participantMessageIds;
                if (messageIds?.length && submitRef.current) {
                  submitRef.current({ participantMessageIds: messageIds });
                }
              }, RETRY_INTERVAL_MS);
              return;
            }

            streamErrorTypeRef.current = errorType;
            emptyResponseRetryCountRef.current = 0;
            isAutoRetrying.onFalse();
            onStreamCompleteRef.current?.(null, new Error('Summary generation in progress. Please wait.'));
            return;
          } else if (errorMessage.includes('202') || errorMessage.includes('Accepted') || errorMessage.includes('Please poll for completion')) {
            // =========================================================================
            // ✅ 202 ACCEPTED: Stream not ready yet, retry
            // =========================================================================
            errorType = StreamErrorTypes.CONFLICT;

            if (emptyResponseRetryCountRef.current < MAX_EMPTY_RESPONSE_RETRIES) {
              emptyResponseRetryCountRef.current++;
              isAutoRetrying.onTrue();

              if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
              }

              retryTimeoutRef.current = setTimeout(() => {
                hasStartedStreamingRef.current = false;
                const messageIds = summary.participantMessageIds;
                if (messageIds?.length && submitRef.current) {
                  submitRef.current({ participantMessageIds: messageIds });
                }
              }, RETRY_INTERVAL_MS);
              return;
            }

            streamErrorTypeRef.current = errorType;
            emptyResponseRetryCountRef.current = 0;
            isAutoRetrying.onFalse();
            onStreamCompleteRef.current?.(null, new Error('Summary stream not available. Please try again.'));
            return;
          } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
            errorType = StreamErrorTypes.NETWORK;
          }
        }

        // Store error type for UI display
        streamErrorTypeRef.current = errorType;

        // ✅ CRITICAL FIX: Pass error information to parent callback
        onStreamCompleteRef.current?.(null, streamError || new Error(errorMessage));
      }
    },
  });

  // ✅ Update submitRef with the actual submit function from useObject
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // ✅ CRITICAL FIX: Keep partialSummaryRef in sync with streaming data
  // AI SDK's onFinish may receive object=undefined due to stream termination issues
  // even when valid data was successfully streamed. This effect captures the latest
  // streamed data so we can use it as fallback in onFinish callback.
  const lastStreamDataTimeRef = useRef<number>(0);
  useEffect(() => {
    if (partialSummary && hasSummaryData(partialSummary)) {
      partialSummaryRef.current = partialSummary;
      lastStreamDataTimeRef.current = Date.now(); // Track when we last received data
    }
  }, [partialSummary]);

  // =========================================================================
  // ✅ STREAM INACTIVITY TIMEOUT: Detect stuck streams that stop sending data
  // =========================================================================
  // If streaming is active but no new data arrives for 20 seconds, the stream
  // is likely stuck (truncated JSON, network issue, model died). Trigger error
  // handling so user can retry instead of waiting for the 45-second server timeout.
  const STREAM_INACTIVITY_TIMEOUT_MS = 20_000;
  const streamInactivityIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only run when stream is loading and we've received some data
    if (isStreamLoading && lastStreamDataTimeRef.current > 0) {
      streamInactivityIntervalRef.current = setInterval(() => {
        const timeSinceLastData = Date.now() - lastStreamDataTimeRef.current;
        if (timeSinceLastData > STREAM_INACTIVITY_TIMEOUT_MS) {
          // Stream is stuck - no new data for 20 seconds
          // eslint-disable-next-line no-console -- legitimate warning for debug purposes
          console.warn('[Summary] Stream inactivity detected:', timeSinceLastData, 'ms since last data');

          // Clear the interval
          if (streamInactivityIntervalRef.current) {
            clearInterval(streamInactivityIntervalRef.current);
            streamInactivityIntervalRef.current = null;
          }

          // Try to use partial object data from stream
          const fallbackData = partialSummaryRef.current;
          if (fallbackData && hasSummaryData(fallbackData)) {
            const validated = RoundSummaryAIContentSchema.safeParse(fallbackData);
            if (validated.success) {
              onStreamCompleteRef.current?.(validated.data);
              return;
            }
          }

          // Report stream timeout error
          onStreamCompleteRef.current?.(null, new Error(t('errors.streamTimeout')));
        }
      }, 5000); // Check every 5 seconds

      return () => {
        if (streamInactivityIntervalRef.current) {
          clearInterval(streamInactivityIntervalRef.current);
          streamInactivityIntervalRef.current = null;
        }
      };
    }

    // Cleanup when streaming stops
    return () => {
      if (streamInactivityIntervalRef.current) {
        clearInterval(streamInactivityIntervalRef.current);
        streamInactivityIntervalRef.current = null;
      }
    };
  }, [isStreamLoading, t]);

  // =========================================================================
  // ✅ UNIFIED STREAM RESUMPTION: Use object stream endpoint, not list polling
  // =========================================================================
  // When 409 conflict or 202 accepted is detected (stream in progress/not ready),
  // we DON'T poll the /summaries list endpoint. Instead, the onFinish callback
  // in useObject handles retrying the actual POST /summarize endpoint (via submit()).
  // This follows the same pattern as pre-search streams which retry the object
  // stream endpoint instead of polling list endpoints.
  //
  // Retries are handled by:
  // 1. onFinish detecting 409/202 errors → retry submit() with delay
  // 2. This approach uses the actual object stream endpoint (AI SDK pattern)
  // 3. Backend returns live stream from buffer or starts new stream

  // Cleanup on unmount: stop streaming
  useEffect(() => {
    return () => {
      // Stop any active streaming
      // stop();

      // ✅ ZUSTAND PATTERN: Do NOT clear summary tracking on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // Tracking is only cleared via clearSummaryStreamTracking() during regeneration (called by startRegeneration)
    };
  }, []);

  // ✅ BUG FIX: Track pending trigger to handle race condition with submit availability
  // When summary becomes pending but submit isn't ready yet, we need to retry
  const pendingTriggerRef = useRef<{ summaryId: string; roundNumber: number } | null>(null);
  const triggerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ BUG FIX: Separate effect to poll for submit availability when trigger is pending
  // This handles the race condition where submit isn't available when the summary becomes pending
  useEffect(() => {
    const pending = pendingTriggerRef.current;
    const alreadyTriggered = hasSummaryStreamBeenTriggered(summary.id, summary.roundNumber);

    // If we have a pending trigger and submit is now available, trigger immediately
    if (pending && submit && !alreadyTriggered
      && pending.summaryId === summary.id
      && pending.roundNumber === summary.roundNumber
      && (summary.status === MessageStatuses.PENDING || summary.status === MessageStatuses.STREAMING)
    ) {
      // Clear pending state
      pendingTriggerRef.current = null;
      if (triggerCheckIntervalRef.current) {
        clearInterval(triggerCheckIntervalRef.current);
        triggerCheckIntervalRef.current = null;
      }

      // Trigger now
      markSummaryStreamTriggered(summary.id, summary.roundNumber);

      const messageIds = summary.participantMessageIds;
      const roundNumber = summary.roundNumber;
      const submitFn = submit;

      queueMicrotask(async () => {
        onStreamStartRef.current?.();

        if (summary.status === MessageStatuses.STREAMING) {
          const resumeResult = await attemptSummaryResume(threadId, roundNumber);
          if (resumeResult.success) {
            onStreamCompleteRef.current?.(resumeResult.data);
            return;
          }
        }

        const body = { participantMessageIds: messageIds };
        submitFn(body);
      });
    }
  }, [submit, summary.id, summary.roundNumber, summary.status, summary.participantMessageIds, threadId, hasSummaryStreamBeenTriggered, markSummaryStreamTriggered]);

  // ✅ CRITICAL FIX: Prevent duplicate submissions at both summary ID and round number level
  // Use useEffect that only runs when summary becomes ready (status changes to PENDING/STREAMING)
  // NOTE: participantMessageIds intentionally NOT in dependencies to avoid re-trigger on metadata updates
  // ✅ AI SDK v5 FIX: Include `submit` in dependencies to re-trigger when submit becomes available
  useEffect(() => {
    // ✅ ZUSTAND PATTERN: Use store's hasSummaryStreamBeenTriggered for two-level check
    const alreadyTriggered = hasSummaryStreamBeenTriggered(summary.id, summary.roundNumber);

    const shouldTrigger = !alreadyTriggered
      && (summary.status === MessageStatuses.PENDING || summary.status === MessageStatuses.STREAMING);

    // ✅ BUG FIX: If should trigger but submit isn't available, mark as pending for retry
    if (shouldTrigger && !submit) {
      // Track that we need to trigger for this summary
      pendingTriggerRef.current = { summaryId: summary.id, roundNumber: summary.roundNumber };
      return;
    }

    // ✅ AI SDK v5 FIX: Ensure submit is available before triggering
    // useObject's submit may not be immediately available on first render
    if (!submit) {
      return; // Wait for submit to be available
    }

    if (shouldTrigger) {
      // ✅ ZUSTAND PATTERN: Mark as triggered at BOTH levels via store action
      markSummaryStreamTriggered(summary.id, summary.roundNumber);

      // =========================================================================
      // ✅ RESUMABLE STREAMS: Try to resume from buffer before starting new stream
      // =========================================================================
      // If summary status is STREAMING, it may have been interrupted by page refresh
      // Try to resume from KV buffer first before starting a new POST request
      const messageIds = summary.participantMessageIds;
      const roundNumber = summary.roundNumber;

      // ✅ AI SDK v5 FIX: Capture submit in closure to ensure it's available when microtask runs
      const submitFn = submit;

      queueMicrotask(async () => {
        onStreamStartRef.current?.();

        // =========================================================================
        // ✅ UNIFIED STREAM RESUMPTION: Try resume, then fall through to submit()
        // =========================================================================
        // For STREAMING status, attempt to resume from KV buffer first.
        // If resume fails for ANY reason (streaming, no-buffer, incomplete, error),
        // fall through to submit() which calls the actual object stream endpoint.
        // This follows the pre-search pattern: retry the object stream, not poll lists.
        if (summary.status === MessageStatuses.STREAMING) {
          const resumeResult = await attemptSummaryResume(threadId, roundNumber);

          if (resumeResult.success) {
            // Successfully resumed from buffer - complete the stream
            onStreamCompleteRef.current?.(resumeResult.data);
            return; // Don't start new stream
          }

          // Resume failed - fall through to submit() regardless of reason.
          // The POST /summarize endpoint will either:
          // - Return live stream from buffer (if stream is truly active)
          // - Return 409/202 which onFinish will handle with retries
          // - Mark stale summary as failed and start new stream
          // - Start fresh stream if no active stream exists
        }

        // Normal flow: start new stream (or retry after failed resume)
        // ✅ AI SDK v5 FIX: Use captured submitFn instead of ref to avoid race condition
        const body = { participantMessageIds: messageIds };
        submitFn(body);
      });
    }
    // ✅ AI SDK v5 FIX: Include submit in dependencies to ensure effect re-runs when submit becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summary.participantMessageIds intentionally excluded to avoid re-trigger on metadata updates
  }, [summary.id, summary.roundNumber, summary.status, threadId, hasSummaryStreamBeenTriggered, markSummaryStreamTriggered, submit]);

  // ✅ BUG FIX: Cleanup retry interval on unmount
  useEffect(() => {
    return () => {
      if (triggerCheckIntervalRef.current) {
        clearInterval(triggerCheckIntervalRef.current);
      }
    };
  }, []);

  // Mark completed/failed summaries as triggered to prevent re-triggering on re-renders
  // NOTE: Do NOT mark STREAMING here - that would prevent useEffect from triggering submit()
  // ✅ ZUSTAND PATTERN: Use store for tracking (replaces module-level Maps)
  const alreadyMarked = hasSummaryStreamBeenTriggered(summary.id, summary.roundNumber);

  if (
    !alreadyMarked
    && (summary.status === MessageStatuses.COMPLETE
      || summary.status === MessageStatuses.FAILED)
  ) {
    markSummaryStreamTriggered(summary.id, summary.roundNumber);
  }

  // ✅ AI SDK v5 OBJECT STREAMING: Use partialObjectStream for gradual object building
  // PENDING/STREAMING: Display progressive partial object from useObject hook
  // COMPLETED: Show stored summaryData from database
  // AI SDK streams JSON character by character, building the object progressively
  const displayData = summary.status === MessageStatuses.COMPLETE
    ? summary.summaryData
    : (partialSummary as RoundSummaryAIContent | undefined);

  const hasData = hasSummaryData(displayData);

  // Extract summary text for display
  const summaryText = displayData?.summary;

  // ✅ Use both DB status AND useObject's isLoading for accurate streaming state
  const isCurrentlyStreaming = summary.status === MessageStatuses.STREAMING || isStreamLoading;

  // Build message parts for ModelMessageCard
  const parts = summaryText
    ? [{ type: MessagePartTypes.TEXT, text: summaryText }]
    : [];

  // Determine status for ModelMessageCard
  const cardStatus = isCurrentlyStreaming
    ? MessageStatuses.STREAMING
    : hasData
      ? MessageStatuses.COMPLETE
      : MessageStatuses.PENDING;

  // ✅ PROGRESSIVE STREAMING: Use ModelMessageCard with ModeratorHeader for consistent display
  return (
    <div className="flex justify-start">
      <div className="w-full">
        <ModeratorHeader isStreaming={isCurrentlyStreaming} />
        <ModelMessageCard
          avatarSrc={BRAND.logos.main}
          avatarName={MODERATOR_NAME}
          participantIndex={MODERATOR_PARTICIPANT_INDEX}
          status={cardStatus}
          parts={parts}
          loadingText={isAutoRetrying.value ? t('autoRetryingSummary') : t('pendingSummary')}
          hideInlineHeader
          hideAvatar
        />
      </div>
    </div>
  );
}
export const RoundSummaryStream = memo(RoundSummaryStreamComponent, (prevProps, nextProps) => {
  return (
    prevProps.summary.id === nextProps.summary.id
    && prevProps.summary.status === nextProps.summary.status
    && prevProps.summary.summaryData === nextProps.summary.summaryData
    && prevProps.threadId === nextProps.threadId
    && prevProps.onStreamComplete === nextProps.onStreamComplete
    && prevProps.onStreamStart === nextProps.onStreamStart
  );
});
