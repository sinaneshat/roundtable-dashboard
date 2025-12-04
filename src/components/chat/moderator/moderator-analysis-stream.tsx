'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useRef } from 'react';

import type { StreamErrorType } from '@/api/core/enums';
import { AnalysisStatuses, StreamErrorTypes } from '@/api/core/enums';
import type {
  ModeratorAnalysisPayload,
  Recommendation,
  StoredModeratorAnalysis,
} from '@/api/routes/chat/schema';
import {
  AlternativeScenarioSchema,
  ConsensusAnalysisSchema,
  ConsensusEvolutionPhaseSchema,
  ContributorPerspectiveSchema,
  EvidenceAndReasoningSchema,
  ModeratorAnalysisPayloadSchema,
  RecommendationSchema,
  RoundSummarySchema,
} from '@/api/routes/chat/schema';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { AnimatedStreamingItem, AnimatedStreamingList, ANIMATION_DURATION, ANIMATION_EASE } from '@/components/ui/motion';
import { useBoolean } from '@/hooks/utils';
import { hasAnalysisData, normalizeAnalysisData } from '@/lib/utils/analysis-utils';
import { filterArrayWithSchema, safeParse } from '@/lib/utils/type-guards';
import { getAnalysisResumeService } from '@/services/api';

// ✅ NEW COMPONENTS: Multi-AI Deliberation Framework
import { AlternativesSection } from './alternatives-section';
import { ConsensusAnalysisSection } from './consensus-analysis-section';
import { ContributorPerspectivesSection } from './contributor-perspectives-section';
import { EvidenceReasoningSection } from './evidence-reasoning-section';
import { KeyInsightsSection } from './key-insights-section';
import { RoundOutcomeHeader } from './round-outcome-header';
import { RoundSummarySection } from './round-summary-section';

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
 * - 202 Accepted: Stream is still active, should poll for completion
 * - 200 OK with X-Stream-Status: completed: Complete data available
 * - 200 OK without header: Legacy/fallback, try to parse
 */
async function attemptAnalysisResume(
  threadId: string,
  roundNumber: number,
): Promise<{ success: true; data: ModeratorAnalysisPayload } | { success: false; reason: 'no-buffer' | 'incomplete' | 'streaming' | 'error' }> {
  try {
    // ✅ TYPE-SAFE: Use service instead of direct fetch
    const response = await getAnalysisResumeService({ threadId, roundNumber });

    // 204 No Content = no buffer available
    if (response.status === 204) {
      return { success: false, reason: 'no-buffer' };
    }

    // 202 Accepted = stream is still active, poll for completion
    if (response.status === 202) {
      return { success: false, reason: 'streaming' };
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

type ModeratorAnalysisStreamProps = {
  threadId: string;
  analysis: StoredModeratorAnalysis;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload | null, error?: Error | null) => void;
  onStreamStart?: () => void;
  onActionClick?: (action: Recommendation) => void;
};

// ✅ CRITICAL FIX: Track at TWO levels to prevent duplicate submissions
// 1. Analysis ID level - prevents same analysis from submitting twice
// 2. Round number level - prevents different analyses for same round from submitting
const triggeredAnalysisIds = new Map<string, boolean>();
const triggeredRounds = new Map<string, Set<number>>(); // threadId -> Set of round numbers

// Export cleanup function for regeneration scenarios
// eslint-disable-next-line react-refresh/only-export-components -- Utility function for managing component state
export function clearTriggeredAnalysis(analysisId: string) {
  triggeredAnalysisIds.delete(analysisId);
}

// Export cleanup function to clear all triggered analyses for a round
// eslint-disable-next-line react-refresh/only-export-components -- Utility function for managing component state
export function clearTriggeredAnalysesForRound(roundNumber: number) {
  // Clear analysis IDs
  const keysToDelete: string[] = [];
  triggeredAnalysisIds.forEach((_value, key) => {
    if (key.includes(`-${roundNumber}-`) || key.includes(`round-${roundNumber}`)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => triggeredAnalysisIds.delete(key));

  // Clear round tracking
  triggeredRounds.forEach((roundSet) => {
    roundSet.delete(roundNumber);
  });
}

function ModeratorAnalysisStreamComponent({
  threadId,
  analysis,
  onStreamComplete,
  onStreamStart,
  onActionClick,
}: ModeratorAnalysisStreamProps) {
  const t = useTranslations('moderator');
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
  const stableOnActionClick = useCallback((_action: Recommendation) => {
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

  // ✅ MOCK MODE: Mock streaming effect (disabled in favor of real API)
  // useEffect(() => {
  //   if (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) {
  //     if (!hasStartedStreamingRef.current) {
  //       hasStartedStreamingRef.current = true;
  //       onStreamStartRef.current?.();
  //     }
  //     const mockData = createMockAnalysisData(analysis.roundNumber);
  //     let progress = 0;
  //     const interval = setInterval(() => {
  //       progress += 0.1;
  //       if (progress >= 1) {
  //         clearInterval(interval);
  //         setPartialAnalysis(mockData);
  //         onStreamCompleteRef.current?.(mockData);
  //       }
  //     }, 800);
  //     return () => clearInterval(interval);
  //   }
  //   return undefined;
  // }, [analysis.status, analysis.roundNumber]);

  // AI SDK v5 Pattern: useObject hook for streaming structured data
  const { object: partialAnalysis, error: _error, submit } = useObject({
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
          // ✅ CRITICAL FIX: Check if we have valid partial data from streaming
          // AI SDK may report "empty response" due to stream termination issues
          // even when valid data was successfully streamed and displayed
          // Use the partial data as fallback instead of failing
          const fallbackData = partialAnalysisRef.current;
          if (fallbackData && hasAnalysisData(fallbackData)) {
            // We have valid streamed data - treat as success
            emptyResponseRetryCountRef.current = 0; // Reset on success
            onStreamCompleteRef.current?.(fallbackData as ModeratorAnalysisPayload);
            return;
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
            // ✅ CRITICAL FIX: For validation errors, try to normalize and use partial data
            // AI models sometimes return object formats instead of arrays
            // Normalize the data and check if it's usable
            const fallbackData = partialAnalysisRef.current;
            if (fallbackData && hasAnalysisData(fallbackData)) {
              // Normalize the data to fix object-to-array format issues
              const normalizedData = normalizeAnalysisData(fallbackData);
              // Try to validate normalized data
              const validated = ModeratorAnalysisPayloadSchema.safeParse(normalizedData);
              if (validated.success) {
                emptyResponseRetryCountRef.current = 0;
                onStreamCompleteRef.current?.(validated.data);
                return;
              }
              // Even if strict validation fails, use normalized data if it has content
              if (hasAnalysisData(normalizedData)) {
                emptyResponseRetryCountRef.current = 0;
                onStreamCompleteRef.current?.(normalizedData as ModeratorAnalysisPayload);
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

      // ✅ CRITICAL FIX: Do NOT delete analysis ID from triggered map on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // The ID is only cleared via clearTriggeredAnalysesForRound() during regeneration
      // triggeredAnalysisIds.delete(analysis.id); // REMOVED - causes double streaming
    };
  }, []); // Removed analysis.id, stop from deps as they are no longer used

  // ✅ CRITICAL FIX: Prevent duplicate submissions at both analysis ID and round number level
  // Use useEffect that only runs when analysis becomes ready (status changes to PENDING/STREAMING)
  // NOTE: participantMessageIds intentionally NOT in dependencies to avoid re-trigger on metadata updates
  useEffect(() => {
    const roundAlreadyTriggered = triggeredRounds.get(threadId)?.has(analysis.roundNumber) ?? false;

    if (
      !triggeredAnalysisIds.has(analysis.id)
      && !roundAlreadyTriggered
      && (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING)
    ) {
      // Mark as triggered at BOTH levels BEFORE scheduling to prevent duplicate calls
      triggeredAnalysisIds.set(analysis.id, true);

      const roundSet = triggeredRounds.get(threadId);
      if (roundSet) {
        roundSet.add(analysis.roundNumber);
      } else {
        triggeredRounds.set(threadId, new Set([analysis.roundNumber]));
      }

      // =========================================================================
      // ✅ RESUMABLE STREAMS: Try to resume from buffer before starting new stream
      // =========================================================================
      // If analysis status is STREAMING, it may have been interrupted by page refresh
      // Try to resume from KV buffer first before starting a new POST request
      const messageIds = analysis.participantMessageIds;
      const roundNumber = analysis.roundNumber;

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
        const body = { participantMessageIds: messageIds };
        submitRef.current?.(body);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- analysis.participantMessageIds intentionally excluded to prevent re-trigger on metadata updates for reasoning models
  }, [analysis.id, analysis.roundNumber, analysis.status, threadId]);

  // Mark completed/failed analyses as triggered to prevent re-triggering on re-renders
  // NOTE: Do NOT mark STREAMING here - that would prevent useEffect from triggering submit()
  const roundAlreadyMarked = triggeredRounds.get(threadId)?.has(analysis.roundNumber) ?? false;

  if (
    !triggeredAnalysisIds.has(analysis.id)
    && !roundAlreadyMarked
    && (analysis.status === AnalysisStatuses.COMPLETE
      || analysis.status === AnalysisStatuses.FAILED)
  ) {
    triggeredAnalysisIds.set(analysis.id, true);

    const roundSet = triggeredRounds.get(threadId);
    if (roundSet) {
      roundSet.add(analysis.roundNumber);
    } else {
      triggeredRounds.set(threadId, new Set([analysis.roundNumber]));
    }
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

  // ✅ TYPE-SAFE DISPLAY DATA: Define union type for streaming + completed data
  // Uses optional chaining to safely access properties from either:
  // 1. StoredModeratorAnalysis['analysisData'] - omits roundNumber, mode, userQuestion
  // 2. DeepPartial<ModeratorAnalysisPayload> - streaming partial data from AI SDK
  // ✅ NEW SCHEMA: Multi-AI Deliberation Framework
  // Sections ordered to match visual top-to-bottom flow AND backend generation order
  const roundConfidence = displayData?.roundConfidence;
  const confidenceWeighting = displayData?.confidenceWeighting;
  const consensusEvolution = displayData?.consensusEvolution;
  const summary = displayData?.summary;
  const recommendations = displayData?.recommendations;
  const contributorPerspectives = displayData?.contributorPerspectives;
  const consensusAnalysis = displayData?.consensusAnalysis;
  const evidenceAndReasoning = displayData?.evidenceAndReasoning;
  const alternatives = displayData?.alternatives;
  const roundSummary = displayData?.roundSummary;

  // ✅ ZOD-BASED ARRAY VALIDATION: Use filterArrayWithSchema for streaming data
  // Type inference flows from schema - no inline type definitions needed
  const validContributorPerspectives = filterArrayWithSchema(contributorPerspectives, ContributorPerspectiveSchema);
  const validAlternatives = filterArrayWithSchema(alternatives, AlternativeScenarioSchema);
  const validConsensusEvolution = filterArrayWithSchema(consensusEvolution, ConsensusEvolutionPhaseSchema);
  const validRecommendations = filterArrayWithSchema(recommendations, RecommendationSchema);

  // ✅ ZOD-BASED OBJECT VALIDATION: Use safeParse for single object validation
  const validConsensusAnalysis = safeParse(ConsensusAnalysisSchema, consensusAnalysis) ?? null;
  const validEvidenceAndReasoning = safeParse(EvidenceAndReasoningSchema, evidenceAndReasoning) ?? null;
  const validRoundSummary = safeParse(RoundSummarySchema, roundSummary) ?? null;

  // Content checking
  const isCurrentlyStreaming = analysis.status === AnalysisStatuses.STREAMING;

  // ✅ ANIMATION ALIGNMENT: Skip animations for already-complete content
  // When analysis is COMPLETE (loaded from DB), render instantly without animation
  // When STREAMING, animate sections as they appear
  const skipAnimation = analysis.status === AnalysisStatuses.COMPLETE;

  // ✅ Check for header data availability
  const hasHeaderData = roundConfidence !== undefined && roundConfidence > 0;

  // ✅ Check for key insights availability (use validated recommendations)
  const hasKeyInsights = summary || validRecommendations.length > 0;

  // Track section indices for staggered animations - sections appear top-to-bottom
  let sectionIndex = 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isPendingWithNoData
        ? (
            <motion.div
              key="analysis-loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: ANIMATION_DURATION.fast,
                ease: ANIMATION_EASE.standard,
              }}
              className="flex items-center justify-center py-8 text-muted-foreground text-sm"
            >
              <Shimmer>{isAutoRetrying.value ? t('autoRetryingAnalysis') : t('pendingAnalysis')}</Shimmer>
            </motion.div>
          )
        : (
            <motion.div
              key="analysis-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: ANIMATION_DURATION.normal,
                ease: ANIMATION_EASE.enter,
              }}
            >
              <AnimatedStreamingList groupId={`analysis-stream-${analysis.id}`} className="space-y-6">
                {/* 1. Round Outcome Header - Generated FIRST by backend, shown at TOP */}
                {hasHeaderData && (
                  <AnimatedStreamingItem
                    key="round-outcome-header"
                    itemKey="round-outcome-header"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <RoundOutcomeHeader
                      roundConfidence={roundConfidence}
                      confidenceWeighting={confidenceWeighting}
                      consensusEvolution={validConsensusEvolution.length > 0 ? validConsensusEvolution : undefined}
                      contributors={validContributorPerspectives}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}

                {/* 2. Key Insights - Generated SECOND by backend */}
                {hasKeyInsights && (
                  <AnimatedStreamingItem
                    key="key-insights"
                    itemKey="key-insights"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <KeyInsightsSection
                      summary={summary}
                      recommendations={validRecommendations.length > 0 ? validRecommendations : undefined}
                      onActionClick={stableOnActionClick}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}

                {/* 3. Contributor Perspectives */}
                {validContributorPerspectives.length > 0 && (
                  <AnimatedStreamingItem
                    key="contributor-perspectives"
                    itemKey="contributor-perspectives"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <ContributorPerspectivesSection
                      perspectives={validContributorPerspectives}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}

                {/* 4. Consensus Analysis */}
                {validConsensusAnalysis && (
                  <AnimatedStreamingItem
                    key="consensus-analysis"
                    itemKey="consensus-analysis"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <ConsensusAnalysisSection
                      analysis={validConsensusAnalysis}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}

                {/* 5. Evidence & Reasoning */}
                {validEvidenceAndReasoning && (
                  <AnimatedStreamingItem
                    key="evidence-reasoning"
                    itemKey="evidence-reasoning"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <EvidenceReasoningSection
                      evidenceAndReasoning={validEvidenceAndReasoning}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}

                {/* 6. Alternative Scenarios */}
                {validAlternatives.length > 0 && (
                  <AnimatedStreamingItem
                    key="alternatives"
                    itemKey="alternatives"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <AlternativesSection
                      alternatives={validAlternatives}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}

                {/* 7. Round Summary - Generated LAST by backend, shown at BOTTOM */}
                {validRoundSummary && (
                  <AnimatedStreamingItem
                    key="round-summary"
                    itemKey="round-summary"
                    index={sectionIndex++}
                    skipAnimation={skipAnimation}
                  >
                    <RoundSummarySection
                      roundSummary={validRoundSummary}
                      onActionClick={stableOnActionClick}
                      isStreaming={isCurrentlyStreaming}
                    />
                  </AnimatedStreamingItem>
                )}
              </AnimatedStreamingList>
            </motion.div>
          )}
    </AnimatePresence>
  );
}
export const ModeratorAnalysisStream = memo(ModeratorAnalysisStreamComponent, (prevProps, nextProps) => {
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
