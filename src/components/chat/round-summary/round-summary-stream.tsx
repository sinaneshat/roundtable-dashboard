'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { AlertTriangle, CheckCircle2, GitMerge, Info, Lightbulb, Users, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useRef } from 'react';

import type { StreamErrorType } from '@/api/core/enums';
import { AnalysisStatuses, StreamErrorTypes } from '@/api/core/enums';
import type {
  ArticleRecommendation,
  ModeratorAnalysisPayload,
  StoredModeratorAnalysis,
} from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ANIMATION_DURATION, ANIMATION_EASE } from '@/components/ui/motion';
import { useBoolean } from '@/hooks/utils';
import { extractModelName, getModelIconInfo } from '@/lib/utils/ai-display';
import { hasAnalysisData, normalizeAnalysisData } from '@/lib/utils/analysis-utils';
import { getRoleBadgeStyle } from '@/lib/utils/role-colors';
import { getAnalysisResumeService } from '@/services/api';

import { CollapsibleSection } from './collapsible-section';
import { KeyInsightsSection } from './key-insights-section';
import { RoundOutcomeHeader } from './round-outcome-header';
import { getResolutionBadgeVariant, getStanceIcon } from './round-summary-utils';

// ============================================================================
// RESUMABLE STREAMS: Attempt to resume analysis from buffer on page reload
// ============================================================================

/**
 * Attempt to resume an analysis stream from KV buffer
 * Returns the parsed analysis data if successful, null otherwise
 *
 * @pattern Following stream-resume.handler.ts pattern for chat streams
 *
 * Response handling:
 * - 204 No Content: No buffer available
 * - 200 OK with X-Stream-Status: completed: Complete data available
 * - 200 OK without header: Legacy/fallback, try to parse
 */
async function attemptAnalysisResume(
  threadId: string,
  roundNumber: number,
): Promise<{ success: true; data: ModeratorAnalysisPayload } | { success: false; reason: 'no-buffer' | 'incomplete' | 'error' }> {
  try {
    // ✅ TYPE-SAFE: Use service with RPC-compliant structure
    const response = await getAnalysisResumeService({
      param: { threadId, roundNumber: roundNumber.toString() },
    });

    // 204 No Content = no buffer available
    if (response.status === 204) {
      return { success: false, reason: 'no-buffer' };
    }

    // Non-200 = error
    if (!response.ok) {
      console.error('[ModeratorAnalysisStream] Resume request failed:', response.status);
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
        const validated = ModeratorAnalysisPayloadSchema.safeParse(parsed);

        if (validated.success) {
          return { success: true, data: validated.data };
        }

        // Even with completed status, schema validation might fail
        // Check if we have enough data to be useful
        if (hasAnalysisData(parsed)) {
          return { success: true, data: parsed as ModeratorAnalysisPayload };
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
      const validated = ModeratorAnalysisPayloadSchema.safeParse(parsed);

      if (validated.success) {
        return { success: true, data: validated.data };
      }

      if (hasAnalysisData(parsed)) {
        return { success: true, data: parsed as ModeratorAnalysisPayload };
      }

      return { success: false, reason: 'incomplete' };
    } catch {
      return { success: false, reason: 'incomplete' };
    }
  } catch (error) {
    console.error('[ModeratorAnalysisStream] Resume attempt failed:', error);
    return { success: false, reason: 'error' };
  }
}

type RoundSummaryStreamProps = {
  threadId: string;
  analysis: StoredModeratorAnalysis;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload | null, error?: Error | null) => void;
  onStreamStart?: () => void;
  onActionClick?: (action: ArticleRecommendation) => void;
};

// ✅ ZUSTAND PATTERN: Analysis stream tracking now in store
// See store.ts: markAnalysisStreamTriggered, hasAnalysisStreamBeenTriggered, clearAnalysisStreamTracking

function RoundSummaryStreamComponent({
  threadId,
  analysis,
  onStreamComplete,
  onStreamStart,
  onActionClick,
}: RoundSummaryStreamProps) {
  const t = useTranslations('moderator');

  // ✅ ZUSTAND PATTERN: Analysis stream tracking from store (replaces module-level Maps)
  const markAnalysisStreamTriggered = useChatStore(s => s.markAnalysisStreamTriggered);
  const hasAnalysisStreamBeenTriggered = useChatStore(s => s.hasAnalysisStreamBeenTriggered);

  // ✅ CRITICAL FIX: Store callbacks in refs for stability and to allow calling after unmount
  // This prevents analysis from getting stuck in "streaming" state when component unmounts
  // Follows the same pattern as use-multi-participant-chat.ts callback refs
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);
  const onActionClickRef = useRef(onActionClick);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  useEffect(() => {
    onActionClickRef.current = onActionClick;
  }, [onActionClick]);

  // ✅ Create stable wrapper for onActionClick that can be safely passed to child components
  // This prevents ref access during render
  const stableOnActionClick = useCallback((_action: ArticleRecommendation) => {
    // Disabled for demo mode - no action clicks allowed
    // onActionClickRef.current?.(action);
  }, []);

  // ✅ Error handling state for UI display
  const streamErrorTypeRef = useRef<StreamErrorType>(StreamErrorTypes.UNKNOWN);
  // ✅ AUTO-RETRY UI: Track when retrying for streaming completion
  const isAutoRetrying = useBoolean(false);

  // ✅ FIX: Track if we've already started streaming to prevent infinite loop
  // Without this, calling onStreamStart → updateAnalysisStatus creates new state
  // → triggers re-render → useEffect runs again → infinite loop
  const hasStartedStreamingRef = useRef(false);

  // ✅ CRITICAL FIX: Store partial analysis in ref for fallback in onFinish
  // AI SDK's onFinish may receive object=undefined due to stream termination issues
  // even when valid data was successfully streamed (visible in partialAnalysis)
  // This ref captures the latest streamed data to use as fallback
  // NOTE: Using 'unknown' because AI SDK's PartialObject<T> type differs from Partial<T>
  // The hasAnalysisData() util handles the type checking at runtime
  const partialAnalysisRef = useRef<unknown>(null);

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

  // ✅ Reset the streaming flag when analysis ID changes (new analysis)
  useEffect(() => {
    hasStartedStreamingRef.current = false;
    partialAnalysisRef.current = null; // Reset fallback data for new analysis
    emptyResponseRetryCountRef.current = 0; // Reset retry count for new analysis
  }, [analysis.id]);

  // ✅ AUTO-RETRY: Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // AI SDK v5 Pattern: useObject hook for streaming structured data
  // ✅ isLoading: true when stream is active (submit called but not finished)
  // This allows us to show streaming state even before partialAnalysis has data
  const { object: partialAnalysis, error: _error, submit, isLoading: isStreamLoading } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    // ✅ AI SDK v5 Pattern: onFinish callback for handling completion and errors
    // According to AI SDK v5 docs, when object === undefined, schema validation failed
    // The error parameter contains the TypeValidationError or other streaming errors
    onFinish: ({ object: finalObject, error: streamError }) => {
      // ✅ CRITICAL FIX: Check for any falsy value (undefined, null, empty object)
      // AI SDK may return undefined on validation failure, but edge cases may return null
      // Also check hasAnalysisData to ensure we have actual content, not just an empty object
      if (!finalObject || !hasAnalysisData(finalObject)) {
        // Classify error type using enum pattern
        let errorType: StreamErrorType = StreamErrorTypes.UNKNOWN;
        const errorMessage = streamError?.message || String(streamError || 'Unknown error');

        // ✅ CRITICAL FIX: Detect empty/undefined response from AI model
        // When path is [] and error is "expected object, received undefined", the AI returned nothing
        // This happens due to: model timeout, rate limiting, empty response, or network interruption
        const isEmptyResponse = errorMessage.includes('expected object, received undefined')
          || errorMessage.includes('Invalid input: expected object, received undefined')
          || (errorMessage.includes('invalid_type') && errorMessage.includes('path": []'));

        // ✅ Enum Pattern: Classify error type
        if (isEmptyResponse) {
          // Check if we have valid partial data from streaming
          // AI SDK may report "empty response" due to stream termination issues
          // Validate with Zod schema to ensure complete data before passing
          const fallbackData = partialAnalysisRef.current;
          if (fallbackData) {
            const validated = ModeratorAnalysisPayloadSchema.safeParse(fallbackData);
            if (validated.success) {
              emptyResponseRetryCountRef.current = 0;
              onStreamCompleteRef.current?.(validated.data);
              return;
            }
          }

          // ✅ AUTO-RETRY: Automatically retry empty response errors
          // Empty responses often succeed on retry (transient network/model issues)
          // This is expected during page refresh recovery - don't alarm with console.error
          // ✅ FIX: Use fixed 3-second intervals and show retrying UI to user
          if (emptyResponseRetryCountRef.current < MAX_EMPTY_RESPONSE_RETRIES) {
            emptyResponseRetryCountRef.current++;

            // ✅ FIX: Show "Retrying..." UI to user instead of raw error
            isAutoRetrying.onTrue();

            // Clear any existing timeout
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }

            // ✅ FIX: Use fixed 3-second intervals as requested
            retryTimeoutRef.current = setTimeout(() => {
              // Reset streaming state for retry but KEEP partial data visible
              hasStartedStreamingRef.current = false;
              // NOTE: Don't reset partialAnalysisRef - keep showing streamed content

              // Trigger retry via submit
              const messageIds = analysis.participantMessageIds;
              if (messageIds?.length && submitRef.current) {
                submitRef.current({ participantMessageIds: messageIds });
              }
            }, RETRY_INTERVAL_MS);
            return; // Don't report error yet - retry in progress
          }

          // ✅ Max retries exceeded - report error
          errorType = StreamErrorTypes.EMPTY_RESPONSE;
          streamErrorTypeRef.current = errorType;
          emptyResponseRetryCountRef.current = 0; // Reset for next attempt
          isAutoRetrying.onFalse(); // Clear retrying state
          // User-friendly error message instead of raw Zod validation error
          onStreamCompleteRef.current?.(null, new Error(t('errors.emptyResponseError')));
          return;
        } else if (streamError instanceof Error) {
          if (streamError.name === 'AbortError' || errorMessage.includes('aborted')) {
            errorType = StreamErrorTypes.ABORT;
          } else if (streamError.name === 'TypeValidationError' || errorMessage.includes('validation') || errorMessage.includes('invalid_type')) {
            // For validation errors, try to normalize and validate partial data
            const fallbackData = partialAnalysisRef.current;
            if (fallbackData) {
              const normalizedData = normalizeAnalysisData(fallbackData);
              const validated = ModeratorAnalysisPayloadSchema.safeParse(normalizedData);
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
            // Backend returned live stream from buffer OR 202 polling response
            // Retry submit() to get the live stream - backend will return buffered data
            errorType = StreamErrorTypes.CONFLICT;

            if (emptyResponseRetryCountRef.current < MAX_EMPTY_RESPONSE_RETRIES) {
              emptyResponseRetryCountRef.current++;
              isAutoRetrying.onTrue();

              if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
              }

              retryTimeoutRef.current = setTimeout(() => {
                hasStartedStreamingRef.current = false;
                const messageIds = analysis.participantMessageIds;
                if (messageIds?.length && submitRef.current) {
                  submitRef.current({ participantMessageIds: messageIds });
                }
              }, RETRY_INTERVAL_MS);
              return;
            }

            // Max retries exceeded - report error
            streamErrorTypeRef.current = errorType;
            emptyResponseRetryCountRef.current = 0;
            isAutoRetrying.onFalse();
            onStreamCompleteRef.current?.(null, new Error('Analysis generation in progress. Please wait.'));
            return;
          } else if (errorMessage.includes('202') || errorMessage.includes('Accepted') || errorMessage.includes('Please poll for completion')) {
            // =========================================================================
            // ✅ 202 ACCEPTED: Stream not ready yet, retry the object stream
            // =========================================================================
            // Instead of polling /analyses, retry submit() to get the actual object stream
            // Backend will either return live stream, start new stream, or return data
            errorType = StreamErrorTypes.CONFLICT;

            if (emptyResponseRetryCountRef.current < MAX_EMPTY_RESPONSE_RETRIES) {
              emptyResponseRetryCountRef.current++;
              isAutoRetrying.onTrue();

              if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
              }

              retryTimeoutRef.current = setTimeout(() => {
                hasStartedStreamingRef.current = false;
                const messageIds = analysis.participantMessageIds;
                if (messageIds?.length && submitRef.current) {
                  submitRef.current({ participantMessageIds: messageIds });
                }
              }, RETRY_INTERVAL_MS);
              return;
            }

            // Max retries exceeded - report error
            streamErrorTypeRef.current = errorType;
            emptyResponseRetryCountRef.current = 0;
            isAutoRetrying.onFalse();
            onStreamCompleteRef.current?.(null, new Error('Analysis stream not available. Please try again.'));
            return;
          } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
            errorType = StreamErrorTypes.NETWORK;
          }
        }

        // Store error type for UI display
        streamErrorTypeRef.current = errorType;

        // ✅ CRITICAL FIX: Pass error information to parent callback
        // Pass null for data and the error object so parent can store error message
        // This prevents silent failures with null errorMessage in the store
        onStreamCompleteRef.current?.(null, streamError || new Error(errorMessage));
        return;
      }

      // ✅ AI SDK v5 Pattern: object is defined, streaming completed successfully
      if (finalObject) {
        onStreamCompleteRef.current?.(finalObject);
      }
    },
  });

  // ✅ Update submitRef with the actual submit function from useObject
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // ✅ CRITICAL FIX: Keep partialAnalysisRef in sync with streaming data
  // AI SDK's onFinish may receive object=undefined due to stream termination issues
  // even when valid data was successfully streamed. This effect captures the latest
  // streamed data so we can use it as fallback in onFinish callback.
  useEffect(() => {
    if (partialAnalysis) {
      partialAnalysisRef.current = partialAnalysis;
    }
  }, [partialAnalysis]);

  // =========================================================================
  // ✅ UNIFIED STREAM RESUMPTION: Use object stream endpoint, not list polling
  // =========================================================================
  // When 409 conflict or 202 accepted is detected (stream in progress/not ready),
  // we DON'T poll the /analyses list endpoint. Instead, the onFinish callback
  // in useObject handles retrying the actual POST /analyze endpoint (via submit()).
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

      // ✅ ZUSTAND PATTERN: Do NOT clear analysis tracking on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // Tracking is only cleared via clearAnalysisStreamTracking() during regeneration (called by startRegeneration)
    };
  }, []);

  // ✅ BUG FIX: Track pending trigger to handle race condition with submit availability
  // When analysis becomes pending but submit isn't ready yet, we need to retry
  const pendingTriggerRef = useRef<{ analysisId: string; roundNumber: number } | null>(null);
  const triggerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ BUG FIX: Separate effect to poll for submit availability when trigger is pending
  // This handles the race condition where submit isn't available when the analysis becomes pending
  useEffect(() => {
    const pending = pendingTriggerRef.current;
    const alreadyTriggered = hasAnalysisStreamBeenTriggered(analysis.id, analysis.roundNumber);

    // If we have a pending trigger and submit is now available, trigger immediately
    if (pending && submit && !alreadyTriggered
      && pending.analysisId === analysis.id
      && pending.roundNumber === analysis.roundNumber
      && (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING)
    ) {
      // Clear pending state
      pendingTriggerRef.current = null;
      if (triggerCheckIntervalRef.current) {
        clearInterval(triggerCheckIntervalRef.current);
        triggerCheckIntervalRef.current = null;
      }

      // Trigger now
      markAnalysisStreamTriggered(analysis.id, analysis.roundNumber);

      const messageIds = analysis.participantMessageIds;
      const roundNumber = analysis.roundNumber;
      const submitFn = submit;

      queueMicrotask(async () => {
        onStreamStartRef.current?.();

        if (analysis.status === AnalysisStatuses.STREAMING) {
          const resumeResult = await attemptAnalysisResume(threadId, roundNumber);
          if (resumeResult.success) {
            onStreamCompleteRef.current?.(resumeResult.data);
            return;
          }
        }

        const body = { participantMessageIds: messageIds };
        submitFn(body);
      });
    }
  }, [submit, analysis.id, analysis.roundNumber, analysis.status, analysis.participantMessageIds, threadId, hasAnalysisStreamBeenTriggered, markAnalysisStreamTriggered]);

  // ✅ CRITICAL FIX: Prevent duplicate submissions at both analysis ID and round number level
  // Use useEffect that only runs when analysis becomes ready (status changes to PENDING/STREAMING)
  // NOTE: participantMessageIds intentionally NOT in dependencies to avoid re-trigger on metadata updates
  // ✅ AI SDK v5 FIX: Include `submit` in dependencies to re-trigger when submit becomes available
  useEffect(() => {
    // ✅ ZUSTAND PATTERN: Use store's hasAnalysisStreamBeenTriggered for two-level check
    const alreadyTriggered = hasAnalysisStreamBeenTriggered(analysis.id, analysis.roundNumber);

    const shouldTrigger = !alreadyTriggered
      && (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING);

    // ✅ BUG FIX: If should trigger but submit isn't available, mark as pending for retry
    if (shouldTrigger && !submit) {
      // Track that we need to trigger for this analysis
      pendingTriggerRef.current = { analysisId: analysis.id, roundNumber: analysis.roundNumber };
      return;
    }

    // ✅ AI SDK v5 FIX: Ensure submit is available before triggering
    // useObject's submit may not be immediately available on first render
    if (!submit) {
      return; // Wait for submit to be available
    }

    if (shouldTrigger) {
      // ✅ ZUSTAND PATTERN: Mark as triggered at BOTH levels via store action
      markAnalysisStreamTriggered(analysis.id, analysis.roundNumber);

      // =========================================================================
      // ✅ RESUMABLE STREAMS: Try to resume from buffer before starting new stream
      // =========================================================================
      // If analysis status is STREAMING, it may have been interrupted by page refresh
      // Try to resume from KV buffer first before starting a new POST request
      const messageIds = analysis.participantMessageIds;
      const roundNumber = analysis.roundNumber;

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
        if (analysis.status === AnalysisStatuses.STREAMING) {
          const resumeResult = await attemptAnalysisResume(threadId, roundNumber);

          if (resumeResult.success) {
            // Successfully resumed from buffer - complete the stream
            onStreamCompleteRef.current?.(resumeResult.data);
            return; // Don't start new stream
          }

          // Resume failed - fall through to submit() regardless of reason.
          // The POST /analyze endpoint will either:
          // - Return live stream from buffer (if stream is truly active)
          // - Return 409/202 which onFinish will handle with retries
          // - Mark stale analysis as failed and start new stream
          // - Start fresh stream if no active stream exists
        }

        // Normal flow: start new stream (or retry after failed resume)
        // ✅ AI SDK v5 FIX: Use captured submitFn instead of ref to avoid race condition
        const body = { participantMessageIds: messageIds };
        submitFn(body);
      });
    }
    // ✅ AI SDK v5 FIX: Include submit in dependencies to ensure effect re-runs when submit becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps -- analysis.participantMessageIds intentionally excluded to avoid re-trigger on metadata updates
  }, [analysis.id, analysis.roundNumber, analysis.status, threadId, hasAnalysisStreamBeenTriggered, markAnalysisStreamTriggered, submit]);

  // ✅ BUG FIX: Cleanup retry interval on unmount
  useEffect(() => {
    return () => {
      if (triggerCheckIntervalRef.current) {
        clearInterval(triggerCheckIntervalRef.current);
      }
    };
  }, []);

  // Mark completed/failed analyses as triggered to prevent re-triggering on re-renders
  // NOTE: Do NOT mark STREAMING here - that would prevent useEffect from triggering submit()
  // ✅ ZUSTAND PATTERN: Use store for tracking (replaces module-level Maps)
  const alreadyMarked = hasAnalysisStreamBeenTriggered(analysis.id, analysis.roundNumber);

  if (
    !alreadyMarked
    && (analysis.status === AnalysisStatuses.COMPLETE
      || analysis.status === AnalysisStatuses.FAILED)
  ) {
    markAnalysisStreamTriggered(analysis.id, analysis.roundNumber);
  }

  // ✅ AI SDK v5 Pattern: Handle streaming state properly
  // PENDING/STREAMING: Only show partialAnalysis (actual stream data), never stored data
  // COMPLETED: Show stored analysisData
  // This prevents UI from showing before stream actually starts
  const displayData = analysis.status === AnalysisStatuses.COMPLETE
    ? analysis.analysisData
    : partialAnalysis;

  const hasData = hasAnalysisData(displayData);

  // ✅ Determine loading state for AnimatePresence
  const isPendingWithNoData = (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) && !hasData;

  // Don't render if no data and not pending/streaming
  if (!hasData && !isPendingWithNoData) {
    return null;
  }

  // ✅ AI SDK v5 PATTERN: Extract partial data WITHOUT mid-stream validation
  // According to AI SDK v5 docs: Display partial data as-is during streaming
  // Use optional chaining in JSX to handle undefined values gracefully
  // Only validate on stream completion in onFinish callback
  // UI Order: confidence → modelVoices → article → recommendations → consensusTable → minorityViews → convergenceDivergence
  const confidence = displayData?.confidence;
  const modelVoices = displayData?.modelVoices;
  const article = displayData?.article;
  const recommendations = displayData?.recommendations;
  const consensusTable = displayData?.consensusTable;
  const minorityViews = displayData?.minorityViews;
  const convergenceDivergence = displayData?.convergenceDivergence;

  // Content checking
  // ✅ Use both DB status AND useObject's isLoading for accurate streaming state
  // isStreamLoading is true when submit() is called but stream hasn't finished
  // This provides earlier feedback than waiting for DB status change
  const isCurrentlyStreaming = analysis.status === AnalysisStatuses.STREAMING || isStreamLoading;

  // ✅ AI SDK v5: Stream data is valid - just display it directly
  // No validation during streaming, no excessive checks
  const safeModelVoices = modelVoices ?? [];
  const safeRecommendations = recommendations ?? [];
  const safeConsensusTable = consensusTable ?? [];
  const safeMinorityViews = minorityViews ?? [];

  // Calculate counts for subtitles
  const recommendationCount = safeRecommendations.length;
  const modelVoicesCount = safeModelVoices.length;
  const consensusTopicCount = safeConsensusTable.length;
  const minorityViewCount = safeMinorityViews.length;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isPendingWithNoData
        ? (
            <motion.div
              key="analysis-loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: ANIMATION_DURATION.fast, ease: ANIMATION_EASE.standard }}
              className="flex items-center justify-center py-8 text-muted-foreground text-sm"
            >
              <TextShimmer>{isAutoRetrying.value ? t('autoRetryingAnalysis') : t('pendingAnalysis')}</TextShimmer>
            </motion.div>
          )
        : (
            <motion.div
              key="analysis-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: ANIMATION_DURATION.normal, ease: ANIMATION_EASE.enter }}
              className="space-y-4"
            >
              {/* Collapsible Sections - Match schema streaming order */}
              <div className="space-y-2">
                {/* ═══════════════════════════════════════════════════════════════════
                    1. KEY INSIGHTS & RECOMMENDATIONS - Article + Recommendations (TOP)
                    ✅ STREAMING FIRST: Streams before all other sections
                    ✅ AI SDK v5 Pattern: forceOpen during streaming, show partial data
                ═══════════════════════════════════════════════════════════════════ */}
                {(article || safeRecommendations.length > 0) && (
                  <CollapsibleSection
                    icon={<Lightbulb className="size-4" />}
                    title={t('keyInsights.title')}
                    subtitle={recommendationCount > 0 ? t('keyInsights.insightsIdentified', { count: recommendationCount }) : undefined}
                    defaultOpen
                    forceOpen={isCurrentlyStreaming}
                  >
                    <KeyInsightsSection
                      article={article}
                      recommendations={safeRecommendations}
                      onActionClick={stableOnActionClick}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </CollapsibleSection>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    2. ROUND OUTCOME HEADER - Confidence + Model Badges
                    ✅ STREAMING: After key insights, before detailed breakdown
                    ✅ AI SDK v5 Pattern: Pass raw partial data, component handles undefined
                ═══════════════════════════════════════════════════════════════════ */}
                <RoundOutcomeHeader
                  confidence={confidence}
                  modelVoices={safeModelVoices}
                  isStreaming={isCurrentlyStreaming}
                />

                {/* ═══════════════════════════════════════════════════════════════════
                    3. MODEL VOICES - Detailed contributor info with avatars
                    ✅ AI SDK v5 Pattern: forceOpen during streaming, handle partial voice data
                ═══════════════════════════════════════════════════════════════════ */}
                {safeModelVoices.length > 0 && (
                  <CollapsibleSection
                    icon={<Users className="size-4" />}
                    title={t('modelVoices.title')}
                    subtitle={t('modelVoices.contributorCount', { count: modelVoicesCount })}
                    forceOpen={isCurrentlyStreaming}
                  >
                    <div className="space-y-3">
                      {safeModelVoices.map((voice, idx) => {
                        // ✅ AI SDK v5 Pattern: Handle partial data with optional chaining
                        if (!voice?.modelId)
                          return null;
                        const { icon, providerName } = getModelIconInfo(voice.modelId);
                        const modelName = extractModelName(voice.modelId);
                        return (
                          <div key={`voice-${voice.modelId}-${voice.participantIndex ?? idx}`} className="flex items-start gap-3">
                            <Avatar className="size-8 flex-shrink-0">
                              <AvatarImage src={icon} alt={modelName} />
                              <AvatarFallback className="text-xs">{providerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{modelName}</span>
                                {voice.role && (
                                  <Badge
                                    className="text-[10px] px-1.5 py-0"
                                    style={getRoleBadgeStyle(voice.role)}
                                  >
                                    {voice.role}
                                  </Badge>
                                )}
                              </div>
                              {voice.position && (
                                <p className="text-sm text-muted-foreground">{voice.position}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    4. CONSENSUS TABLE - Agreement/disagreement grid
                    ✅ AI SDK v5 Pattern: forceOpen during streaming, handle partial data
                ═══════════════════════════════════════════════════════════════════ */}
                {safeConsensusTable.length > 0 && (
                  <CollapsibleSection
                    icon={<CheckCircle2 className="size-4" />}
                    title={t('consensusTable.title')}
                    subtitle={t('consensusTable.topicCount', { count: consensusTopicCount })}
                    forceOpen={isCurrentlyStreaming}
                  >
                    <div className="space-y-3">
                      {safeConsensusTable.map((entry) => {
                        // ✅ AI SDK v5 Pattern: Skip incomplete entries during streaming
                        if (!entry?.topic)
                          return null;
                        return (
                          <div key={`consensus-${entry.topic}`} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{entry.topic}</span>
                              {entry.resolution && (
                                <Badge
                                  variant={getResolutionBadgeVariant(entry.resolution)}
                                  className="text-xs"
                                >
                                  {entry.resolution}
                                </Badge>
                              )}
                            </div>
                            {entry.positions && (
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {entry.positions.map((pos) => {
                                  if (!pos?.modelName)
                                    return null;
                                  return (
                                    <span key={`pos-${entry.topic}-${pos.modelName}`} className="flex items-center gap-1">
                                      {getStanceIcon(pos.stance)}
                                      <span className="font-medium">{pos.modelName}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    5. MINORITY VIEWS - Dissenting opinions
                    ✅ AI SDK v5 Pattern: forceOpen during streaming, handle partial data
                ═══════════════════════════════════════════════════════════════════ */}
                {safeMinorityViews.length > 0 && (
                  <CollapsibleSection
                    icon={<AlertTriangle className="size-4" />}
                    title={t('minorityViews.title')}
                    subtitle={t('minorityViews.viewCount', { count: minorityViewCount })}
                    forceOpen={isCurrentlyStreaming}
                  >
                    <div className="space-y-2">
                      {safeMinorityViews.map((view) => {
                        // ✅ AI SDK v5 Pattern: Skip incomplete entries
                        if (!view?.modelName)
                          return null;
                        return (
                          <div key={`minority-${view.modelName}`} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="size-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span>
                              <span className="font-medium">
                                {view.modelName}
                                :
                              </span>
                              {' '}
                              <span className="text-muted-foreground">{view.view ?? ''}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    6. CONVERGENCE & DIVERGENCE - Where views met or parted
                    ✅ AI SDK v5 Pattern: forceOpen during streaming, handle partial data
                    ✅ FIX: Check for actual content, not just truthy object (empty {} would render accordion)
                ═══════════════════════════════════════════════════════════════════ */}
                {convergenceDivergence && (convergenceDivergence.convergedOn?.length || convergenceDivergence.divergedOn?.length || convergenceDivergence.evolved?.length) && (
                  <CollapsibleSection
                    icon={<GitMerge className="size-4" />}
                    title={t('convergenceDivergence.title')}
                    forceOpen={isCurrentlyStreaming}
                  >
                    <div className="space-y-3 text-sm">
                      {/* ✅ AI SDK v5 Pattern: Extra null checks for partial data */}
                      {convergenceDivergence.convergedOn && convergenceDivergence.convergedOn.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                          <CheckCircle2 className="size-3.5 text-green-500 flex-shrink-0" />
                          <span className="font-medium text-green-600 dark:text-green-400 mr-1">
                            {t('convergenceDivergence.agreed')}
                            :
                          </span>
                          <span className="text-muted-foreground">
                            {convergenceDivergence.convergedOn.join(' • ')}
                          </span>
                        </div>
                      )}
                      {convergenceDivergence.divergedOn && convergenceDivergence.divergedOn.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                          <XCircle className="size-3.5 text-orange-500 flex-shrink-0" />
                          <span className="font-medium text-orange-600 dark:text-orange-400 mr-1">
                            {t('convergenceDivergence.split')}
                            :
                          </span>
                          <span className="text-muted-foreground">
                            {convergenceDivergence.divergedOn.join(' • ')}
                          </span>
                        </div>
                      )}
                      {convergenceDivergence.evolved && convergenceDivergence.evolved.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">{t('convergenceDivergence.evolved')}</span>
                          {convergenceDivergence.evolved.map((evolution) => {
                            if (!evolution?.point)
                              return null;
                            return (
                              <div key={`evolved-${evolution.point}-${evolution.initialState ?? ''}-${evolution.finalState ?? ''}`} className="flex items-center gap-1.5 text-xs">
                                <span className="font-medium">
                                  {evolution.point}
                                  :
                                </span>
                                <span className="text-orange-500">{evolution.initialState ?? ''}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-green-500">{evolution.finalState ?? ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    7. ABOUT THIS FRAMEWORK - Static explanation (BOTTOM)
                    ✅ Matches panel structure exactly
                ═══════════════════════════════════════════════════════════════════ */}
                <CollapsibleSection
                  icon={<Info className="size-4" />}
                  title={t('aboutFramework.title')}
                >
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>
                      This analysis synthesizes perspectives from
                      {' '}
                      {modelVoicesCount}
                      {' '}
                      AI models participating in a collaborative
                      {' '}
                      {analysis.mode}
                      {' '}
                      discussion.
                    </p>
                    <p>The consensus table shows where models agreed and disagreed, while minority views highlight important dissenting opinions that may warrant further consideration.</p>
                  </div>
                </CollapsibleSection>
              </div>
            </motion.div>
          )}
    </AnimatePresence>
  );
}
export const RoundSummaryStream = memo(RoundSummaryStreamComponent, (prevProps, nextProps) => {
  // ✅ Memo optimization: Prevent re-renders when props haven't changed
  // Callbacks are stored in refs internally, so callback equality checks prevent unnecessary work
  return (
    prevProps.analysis.id === nextProps.analysis.id
    && prevProps.analysis.status === nextProps.analysis.status
    && prevProps.analysis.analysisData === nextProps.analysis.analysisData
    && prevProps.threadId === nextProps.threadId
    && prevProps.onStreamComplete === nextProps.onStreamComplete
    && prevProps.onStreamStart === nextProps.onStreamStart
    && prevProps.onActionClick === nextProps.onActionClick
  );
});
