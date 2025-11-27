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
  ModeratorAnalysisListResponseSchema,
  ModeratorAnalysisPayloadSchema,
  RecommendationSchema,
  RoundSummarySchema,
} from '@/api/routes/chat/schema';
import { LoaderFive } from '@/components/ui/loader';
import { AnimatedStreamingItem, AnimatedStreamingList, ANIMATION_DURATION, ANIMATION_EASE } from '@/components/ui/motion';
import { useBoolean } from '@/hooks/utils';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';
import { filterArrayWithSchema, safeParse } from '@/lib/utils/type-guards';

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
 */
async function attemptAnalysisResume(
  threadId: string,
  roundNumber: number,
): Promise<{ success: true; data: ModeratorAnalysisPayload } | { success: false; reason: 'no-buffer' | 'incomplete' | 'error' }> {
  try {
    const response = await fetch(
      `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/analyze/resume`,
      { credentials: 'include' },
    );

    // 204 No Content = no buffer available
    if (response.status === 204) {
      return { success: false, reason: 'no-buffer' };
    }

    // Non-200 = error
    if (!response.ok) {
      console.error('[ModeratorAnalysisStream] Resume request failed:', response.status);
      return { success: false, reason: 'error' };
    }

    // Read the buffered text chunks
    const bufferedText = await response.text();

    if (!bufferedText || bufferedText.trim() === '') {
      return { success: false, reason: 'no-buffer' };
    }

    // Try to parse as complete JSON object
    // Object streams send JSON being built incrementally
    try {
      const parsed = JSON.parse(bufferedText);
      const validated = ModeratorAnalysisPayloadSchema.safeParse(parsed);

      if (validated.success) {
        return { success: true, data: validated.data };
      }

      // Partial data - schema validation failed (incomplete stream)
      // Check if we have enough data to be useful
      if (hasAnalysisData(parsed)) {
        // Return partial data as complete (best effort)
        return { success: true, data: parsed as ModeratorAnalysisPayload };
      }

      return { success: false, reason: 'incomplete' };
    } catch {
      // JSON parse failed - incomplete stream
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
  const is409Conflict = useBoolean(false);

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

  // ✅ SCROLL FIX: Removed useAutoScroll - scroll is managed centrally by useChatScroll
  // Having nested useAutoScroll (with its own ResizeObserver) inside the accordion
  // caused conflicting scroll systems that fought each other, resulting in excessive
  // jumping/snapping behavior. The useChatScroll hook in ChatThreadScreen handles all
  // window-level auto-scroll during streaming via a single ResizeObserver on document.body.

  // ✅ Reset the streaming flag when analysis ID changes (new analysis)
  useEffect(() => {
    hasStartedStreamingRef.current = false;
    partialAnalysisRef.current = null; // Reset fallback data for new analysis
  }, [analysis.id]);

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
      // ✅ AI SDK v5 Pattern: Check if object is undefined (validation failure)
      // From docs: "object is undefined if the final object does not match the schema"
      if (finalObject === undefined) {
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
            onStreamCompleteRef.current?.(fallbackData as ModeratorAnalysisPayload);
            return;
          }

          // ✅ NEW: Empty response detection - AI model returned no valid data
          errorType = StreamErrorTypes.EMPTY_RESPONSE;
          streamErrorTypeRef.current = errorType;
          // User-friendly error message instead of raw Zod validation error
          onStreamCompleteRef.current?.(null, new Error(t('errors.emptyResponseError')));
          return;
        } else if (streamError instanceof Error) {
          if (streamError.name === 'AbortError' || errorMessage.includes('aborted')) {
            errorType = StreamErrorTypes.ABORT;
          } else if (streamError.name === 'TypeValidationError' || errorMessage.includes('validation')) {
            errorType = StreamErrorTypes.VALIDATION;
          } else if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
            errorType = StreamErrorTypes.CONFLICT;
            // ✅ CRITICAL FIX: Don't call onStreamComplete on 409 - polling will handle completion
            is409Conflict.onTrue();
            return; // Exit early - polling effect will handle completion
          } else if (errorMessage.includes('202') || errorMessage.includes('Accepted') || errorMessage.includes('Please poll for completion')) {
            // ✅ FIX: Handle 202 Accepted - stream in progress but buffer not ready
            // Treat same as 409 - start polling for completion
            errorType = StreamErrorTypes.CONFLICT;
            is409Conflict.onTrue();
            return; // Exit early - polling effect will handle completion
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

  // ✅ Store submit function in ref for stable access in effects
  const submitRef = useRef(submit);
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

  // ✅ CRITICAL FIX: Polling for 409 Conflict - stream already in progress
  // When page refreshes during streaming, backend returns 409
  // ✅ RESUMABLE STREAMS: First try to resume from buffer, then poll DB for completion
  useEffect(() => {
    if (!is409Conflict.value)
      return undefined;

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        // ✅ RESUMABLE STREAMS: Try to resume from buffer first
        // If buffer has complete data, we can use it immediately
        const resumeResult = await attemptAnalysisResume(threadId, analysis.roundNumber);

        if (resumeResult.success) {
          onStreamCompleteRef.current?.(resumeResult.data);
          if (isMounted)
            is409Conflict.onFalse(); // Stop polling
          return;
        }

        // Resume failed - fall back to polling the analyses list
        const res = await fetch(`/api/v1/chat/threads/${threadId}/analyses`);
        if (!res.ok)
          throw new Error('Failed to fetch analyses');

        // ✅ ZOD VALIDATION: Parse API response with schema instead of force typecast
        const json: unknown = await res.json();
        const parseResult = ModeratorAnalysisListResponseSchema.safeParse(json);

        if (!parseResult.success) {
          console.error('[ModeratorAnalysisStream] Invalid API response:', parseResult.error);
          return; // Continue polling on validation error
        }

        const analyses = parseResult.data.data.items;
        const current = analyses.find(a => a.roundNumber === analysis.roundNumber);

        if (current) {
          if (current.status === AnalysisStatuses.COMPLETE && current.analysisData) {
            // ✅ TYPE SAFE: Reconstruct full payload by adding back omitted fields
            // StoredModeratorAnalysis.analysisData omits roundNumber, mode, userQuestion
            // (stored at top level) - reconstruct for ModeratorAnalysisPayload
            const fullPayload: ModeratorAnalysisPayload = {
              ...current.analysisData,
              roundNumber: current.roundNumber,
              mode: current.mode,
              userQuestion: current.userQuestion,
            };
            onStreamCompleteRef.current?.(fullPayload);
            if (isMounted)
              is409Conflict.onFalse(); // Stop polling
            return;
          } else if (current.status === AnalysisStatuses.FAILED) {
            onStreamCompleteRef.current?.(null, new Error(current.errorMessage ?? 'Analysis failed'));
            if (isMounted)
              is409Conflict.onFalse(); // Stop polling
            return;
          }
          // If still STREAMING or PENDING, continue polling
        }
      } catch (err) {
        // Silent failure on polling error, retry next interval
        console.error('[ModeratorAnalysisStream] Polling failed:', err);
      }

      if (isMounted) {
        timeoutId = setTimeout(poll, 2000); // Poll every 2s
      }
    };

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [is409Conflict.value, threadId, analysis.roundNumber, is409Conflict]);

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

        // ✅ RESUMABLE STREAMS: For STREAMING status, attempt to resume first
        if (analysis.status === AnalysisStatuses.STREAMING) {
          const resumeResult = await attemptAnalysisResume(threadId, roundNumber);

          if (resumeResult.success) {
            // Successfully resumed from buffer - complete the stream
            onStreamCompleteRef.current?.(resumeResult.data);
            return; // Don't start new stream
          }

          // Resume failed - if incomplete, fall back to polling (409 will be handled)
          // Stream is still in progress but we couldn't get complete data
          // Fall through to submit() which will get 409 and trigger polling
        }

        // Normal flow: start new stream (or retry after failed resume)
        const body = { participantMessageIds: messageIds };
        submitRef.current(body);
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
              <LoaderFive text={t('pendingAnalysis')} />
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
