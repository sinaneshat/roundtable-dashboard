'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { memo, useCallback, useEffect, useRef } from 'react';
import type { z } from 'zod';

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
import { AnimatedStreamingItem, AnimatedStreamingList } from '@/components/ui/motion';
import { useAutoScroll, useBoolean } from '@/hooks/utils';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';

// ✅ NEW COMPONENTS: Multi-AI Deliberation Framework
import { AlternativesSection } from './alternatives-section';
import { ConsensusAnalysisSection } from './consensus-analysis-section';
import { ContributorPerspectivesSection } from './contributor-perspectives-section';
import { EvidenceReasoningSection } from './evidence-reasoning-section';
import { KeyInsightsSection } from './key-insights-section';
import { RoundOutcomeHeader } from './round-outcome-header';
import { RoundSummarySection } from './round-summary-section';

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

  // ✅ Unified auto-scroll: Only scrolls if user is at bottom
  const isStreaming = analysis.status === AnalysisStatuses.STREAMING;
  const bottomRef = useAutoScroll(isStreaming);

  // ✅ Reset the streaming flag when analysis ID changes (new analysis)
  useEffect(() => {
    hasStartedStreamingRef.current = false;
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

        // ✅ Enum Pattern: Classify error type
        if (streamError instanceof Error) {
          if (streamError.name === 'AbortError' || errorMessage.includes('aborted')) {
            errorType = StreamErrorTypes.ABORT;
          } else if (streamError.name === 'TypeValidationError' || errorMessage.includes('validation')) {
            errorType = StreamErrorTypes.VALIDATION;
          } else if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
            errorType = StreamErrorTypes.CONFLICT;
            // ✅ CRITICAL FIX: Don't call onStreamComplete on 409 - polling will handle completion
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

  // ✅ CRITICAL FIX: Polling for 409 Conflict - stream already in progress
  // When page refreshes during streaming, backend returns 409
  // Instead of retrying POST, poll GET endpoint for completion
  useEffect(() => {
    if (!is409Conflict.value)
      return undefined;

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
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

      // AI SDK v5 Pattern: Use queueMicrotask for post-render scheduling
      // Capture participantMessageIds at time of queueing for stability
      const messageIds = analysis.participantMessageIds;
      queueMicrotask(() => {
        onStreamStartRef.current?.();
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

  // Don't show internal loading - unified loading indicator handles this
  if ((analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) && !hasData) {
    return null;
  }

  // Don't render if no data
  if (!hasData) {
    return null;
  }

  // ✅ NEW SCHEMA: Multi-AI Deliberation Framework
  // Sections ordered to match visual top-to-bottom flow AND backend generation order
  const {
    // Header section (generated first by backend)
    roundConfidence,
    confidenceWeighting,
    consensusEvolution,
    // Key insights (generated second)
    summary,
    recommendations,
    // Detail sections (generated in visual order)
    contributorPerspectives,
    consensusAnalysis,
    evidenceAndReasoning,
    alternatives,
    roundSummary,
  } = displayData;

  // ✅ ZOD-BASED ARRAY VALIDATION: Use schema validation for array elements
  // Following established pattern: Use Zod safeParse for runtime type validation
  // This validates each element and filters out invalid/incomplete ones during streaming
  const validContributorPerspectives = (contributorPerspectives ?? [])
    .map(p => ContributorPerspectiveSchema.safeParse(p))
    .filter((result): result is { success: true; data: z.infer<typeof ContributorPerspectiveSchema> } => result.success)
    .map(result => result.data);

  const validAlternatives = (alternatives ?? [])
    .map(a => AlternativeScenarioSchema.safeParse(a))
    .filter((result): result is { success: true; data: z.infer<typeof AlternativeScenarioSchema> } => result.success)
    .map(result => result.data);

  // ✅ VALIDATE CONSENSUS EVOLUTION: Filter incomplete phases during streaming
  const validConsensusEvolution = (consensusEvolution ?? [])
    .map(p => ConsensusEvolutionPhaseSchema.safeParse(p))
    .filter((result): result is { success: true; data: z.infer<typeof ConsensusEvolutionPhaseSchema> } => result.success)
    .map(result => result.data);

  // ✅ VALIDATE RECOMMENDATIONS: Filter incomplete recommendations during streaming
  const validRecommendations = (recommendations ?? [])
    .map(r => RecommendationSchema.safeParse(r))
    .filter((result): result is { success: true; data: z.infer<typeof RecommendationSchema> } => result.success)
    .map(result => result.data);

  // ✅ ZOD-BASED TYPE GUARDS: Use schema validation instead of manual type guards
  // Following established pattern: Use Zod safeParse for runtime type validation
  // This is type-safe and reuses existing schema definitions
  const consensusResult = ConsensusAnalysisSchema.safeParse(consensusAnalysis);
  const validConsensusAnalysis = consensusResult.success ? consensusResult.data : null;

  const evidenceResult = EvidenceAndReasoningSchema.safeParse(evidenceAndReasoning);
  const validEvidenceAndReasoning = evidenceResult.success ? evidenceResult.data : null;

  const roundSummaryResult = RoundSummarySchema.safeParse(roundSummary);
  const validRoundSummary = roundSummaryResult.success ? roundSummaryResult.data : null;

  // Content checking
  const isCurrentlyStreaming = analysis.status === AnalysisStatuses.STREAMING;

  // ✅ Check for header data availability
  const hasHeaderData = roundConfidence !== undefined && roundConfidence > 0;

  // ✅ Check for key insights availability (use validated recommendations)
  const hasKeyInsights = summary || validRecommendations.length > 0;

  // Track section indices for staggered animations - sections appear top-to-bottom
  let sectionIndex = 0;

  return (
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

      <div ref={bottomRef} />
    </AnimatedStreamingList>
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
