/**
 * Analysis Utility Functions
 *
 * Shared utilities for working with moderator analyses in chat threads.
 * These functions handle analysis deduplication, status priority, and
 * validation logic used across ChatOverviewScreen and ChatThreadScreen.
 *
 * @module lib/utils/analysis-utils
 */

import type { DeepPartial, UIMessage } from 'ai';

import { AnalysisStatuses, MessageRoles } from '@/api/core/enums';
import type { ChatParticipant, ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { DbMessageMetadataSchema } from '@/db/schemas/chat-metadata';
import { messageHasError } from '@/lib/schemas/message-metadata';
import { getStatusPriority } from '@/stores/chat';

import { isObject } from './type-guards';

// ============================================================================
// ANALYSIS DATA COMPLETENESS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Check if analysis has any displayable data (for rendering control)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this function everywhere to check if
 * analysis should be rendered. Prevents inconsistencies like the bug where
 * keyInsights/consensusPoints were checked in some places but not others.
 *
 * Checks ALL possible data fields that can be displayed:
 * - leaderboard (participant rankings)
 * - participantAnalyses (individual participant breakdown)
 * - roundSummary subfields:
 *   - keyInsights
 *   - consensusPoints
 *   - divergentApproaches
 *   - comparativeAnalysis
 *   - decisionFramework
 *   - overallSummary
 *   - conclusion
 *   - recommendedActions
 *
 * Returns `true` if ANY field has data (OR logic).
 * Returns `false` if NO fields have data (component should render null).
 *
 * @param data - Analysis data object (can be partial during streaming)
 * @returns True if analysis has any displayable content
 *
 * @example
 * ```typescript
 * // In components (streaming or completed)
 * const displayData = partialAnalysis || analysis.analysisData;
 * if (!hasAnalysisData(displayData)) {
 *   return null; // Don't render empty analysis
 * }
 * // Render analysis UI...
 * ```
 */
/**
 * Analysis data input type
 * Accepts both complete data and AI SDK streaming partial data
 *
 * DeepPartial<T> from AI SDK makes all properties recursively optional,
 * including array elements, which differs from TypeScript's Partial<T>
 */
type AnalysisDataInput
  = | ModeratorAnalysisPayload
    | DeepPartial<ModeratorAnalysisPayload>
    | null
    | undefined;

/**
 * Check if analysis data has displayable content
 *
 * Type guard that narrows the input type from nullable to non-nullable.
 * Handles both complete analysis data (ModeratorAnalysisPayload) and
 * partial streaming data (AI SDK's DeepPartial<ModeratorAnalysisPayload>).
 *
 * Runtime checks ensure type safety for both scenarios:
 * - Complete data: All fields present and validated
 * - Partial data: Checks array lengths and field existence
 *
 * @param data - Analysis data (complete or streaming partial)
 * @returns True if data has displayable content, with type narrowing
 *
 * @example
 * ```typescript
 * // Complete data
 * const complete: ModeratorAnalysisPayload | null = {...};
 * if (hasAnalysisData(complete)) {
 *   // TypeScript knows complete is non-null here
 *   complete.leaderboard // OK
 * }
 *
 * // Streaming partial data from AI SDK
 * const partial: DeepPartial<ModeratorAnalysisPayload> | undefined = {...};
 * if (hasAnalysisData(partial)) {
 *   // TypeScript knows partial is defined here
 *   partial.leaderboard // OK (might be undefined at runtime)
 * }
 * ```
 */
export function hasAnalysisData(
  data: AnalysisDataInput,
): data is ModeratorAnalysisPayload | DeepPartial<ModeratorAnalysisPayload> {
  // Null/undefined check
  if (!data) {
    return false;
  }

  // Type-safe access to properties for NEW SCHEMA: Multi-AI Deliberation Framework
  // Both ModeratorAnalysisPayload and PartialObject<ModeratorAnalysisPayload> have these properties
  const {
    // ✅ CRITICAL FIX: Include first-streamed fields
    // Backend generates these fields FIRST, but they weren't being checked
    // causing hasAnalysisData to return false during initial streaming
    roundConfidence,
    summary,
    recommendations,
    // Later-streamed detail sections
    contributorPerspectives,
    consensusAnalysis,
    evidenceAndReasoning,
    alternatives,
    roundSummary,
  } = data;

  // ✅ CRITICAL FIX: Check header/summary fields (generated FIRST by backend)
  // Without these checks, UI shows nothing until later sections stream
  const hasRoundConfidence = typeof roundConfidence === 'number' && roundConfidence > 0;
  const hasSummary = typeof summary === 'string' && summary.length > 0;
  const recommendationsArray = recommendations ?? [];
  const hasRecommendations = Array.isArray(recommendationsArray) && recommendationsArray.length > 0;

  // Check arrays: handle both complete arrays and partial arrays with undefined elements
  const contributorPerspectivesArray = contributorPerspectives ?? [];
  const alternativesArray = alternatives ?? [];

  // Check if arrays have content (filter undefined elements from PartialObject)
  const hasContributorPerspectives = Array.isArray(contributorPerspectivesArray)
    && contributorPerspectivesArray.length > 0;

  const hasAlternatives = Array.isArray(alternativesArray)
    && alternativesArray.length > 0;

  // Check object fields
  const hasConsensusAnalysis = consensusAnalysis != null;
  const hasEvidenceAndReasoning = evidenceAndReasoning != null;

  // Check roundSummary fields (all possible sections)
  const hasRoundSummaryData = hasRoundSummaryContent(roundSummary);

  // ✅ CRITICAL FIX: Include first-streamed fields in OR condition
  return hasRoundConfidence || hasSummary || hasRecommendations || hasContributorPerspectives || hasConsensusAnalysis || hasEvidenceAndReasoning || hasAlternatives || hasRoundSummaryData;
}

/**
 * Check if roundSummary has any displayable content
 *
 * **SINGLE SOURCE OF TRUTH**: Use this to check roundSummary completeness.
 * Checks ALL fields defined in RoundSummarySchema.
 *
 * @param roundSummary - RoundSummary object (can be partial during streaming)
 * @returns True if roundSummary has any content
 *
 * @example
 * ```typescript
 * // In RoundSummarySection component
 * if (!hasRoundSummaryContent(roundSummary)) {
 *   return null;
 * }
 * ```
 */
export function hasRoundSummaryContent(
  roundSummary: unknown,
): boolean {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(roundSummary)) {
    return false;
  }

  // TypeScript now knows roundSummary is Record<string, unknown>
  const summary = roundSummary;
  const hasProperty = (key: string): boolean => key in summary;

  return Boolean(
    (hasProperty('keyInsights') && Array.isArray(summary.keyInsights) && summary.keyInsights.length > 0)
    || (hasProperty('consensusPoints') && Array.isArray(summary.consensusPoints) && summary.consensusPoints.length > 0)
    || (hasProperty('divergentApproaches') && Array.isArray(summary.divergentApproaches) && summary.divergentApproaches.length > 0)
    || (hasProperty('comparativeAnalysis') && summary.comparativeAnalysis)
    || (hasProperty('decisionFramework') && summary.decisionFramework)
    || (hasProperty('overallSummary') && summary.overallSummary)
    || (hasProperty('conclusion') && summary.conclusion)
    || (hasProperty('recommendedActions') && Array.isArray(summary.recommendedActions) && summary.recommendedActions.length > 0),
  );
}

/**
 * Check if participant analysis has any renderable content
 *
 * **TYPE-SAFE**: Uses type guards to check for actual content
 * Prevents empty participant cards from rendering during streaming
 *
 * @param participant - Partial participant analysis (can be incomplete during streaming)
 * @returns True if participant has any displayable content
 */
export function hasParticipantContent(
  participant: unknown,
): boolean {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(participant)) {
    return false;
  }

  // TypeScript now knows participant is Record<string, unknown>
  const p = participant;
  const hasProperty = (key: string): boolean => key in p;

  // Must have participantIndex to be valid
  if (!hasProperty('participantIndex') || typeof p.participantIndex !== 'number') {
    return false;
  }

  return Boolean(
    (hasProperty('summary') && typeof p.summary === 'string' && p.summary.length > 0)
    || (hasProperty('pros') && Array.isArray(p.pros) && p.pros.length > 0)
    || (hasProperty('cons') && Array.isArray(p.cons) && p.cons.length > 0)
    || (hasProperty('skillsMatrix') && Array.isArray(p.skillsMatrix) && p.skillsMatrix.length > 0)
    || (hasProperty('overallRating') && typeof p.overallRating === 'number' && !Number.isNaN(p.overallRating)),
  );
}

/**
 * Validate analysis data against schema (strict type checking)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this for strict validation that requires
 * ALL required fields to be present and valid according to schema.
 *
 * Schema Requirements (enforced by Zod):
 * - roundNumber: Required integer ≥ 0 (✅ 0-BASED: First round is 0)
 * - mode: Required string
 * - userQuestion: Required string
 * - participantAnalyses: Required array with ≥ 1 item
 * - leaderboard: Required array with ≥ 1 item
 * - roundSummary: Required object
 *
 * Use this when:
 * - Validating API responses
 * - Type guards for TypeScript
 * - Ensuring data integrity before persistence
 *
 * @param data - Data to validate
 * @returns True if data matches complete schema, false otherwise
 *
 * @example
 * ```typescript
 * // In store actions
 * if (!isCompleteAnalysis(data)) {
 *   throw new Error('Invalid analysis data');
 * }
 * // Safe to use as ModeratorAnalysisPayload
 * ```
 */
export function isCompleteAnalysis(
  data: unknown,
): data is ModeratorAnalysisPayload {
  const result = ModeratorAnalysisPayloadSchema.safeParse(data);
  return result.success;
}

// ============================================================================
// ANALYSIS DATA NORMALIZATION
// ============================================================================

/**
 * Normalize analysis data to ensure consistent format
 *
 * **CRITICAL FIX**: AI models sometimes return object formats instead of arrays:
 * - perspectives: { "Claude 4.5 Opus": "agree" } instead of [{ modelName: "Claude 4.5 Opus", status: "agree" }]
 * - argumentStrengthProfile: { "Claude 4.5 Opus": { logic: 85 } } instead of [{ modelName: "Claude 4.5 Opus", logic: 85 }]
 *
 * This function normalizes these formats to ensure consistent array structures
 * that match the expected schema.
 *
 * @param data - Raw analysis data from AI model (may have inconsistent formats)
 * @returns Normalized data with consistent array formats
 */
export function normalizeAnalysisData<T>(data: T): T {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(data)) {
    return data;
  }

  // Deep clone to avoid mutation
  const normalized: Record<string, unknown> = JSON.parse(JSON.stringify(data));

  // Normalize consensusAnalysis if present
  if (isObject(normalized.consensusAnalysis)) {
    const consensus = normalized.consensusAnalysis;

    // Normalize agreementHeatmap perspectives
    if (Array.isArray(consensus.agreementHeatmap)) {
      consensus.agreementHeatmap = consensus.agreementHeatmap.map((entry: unknown) => {
        // ✅ TYPE-SAFE: Use type guard for entry validation
        if (!isObject(entry)) {
          return entry;
        }

        if (entry.perspectives && !Array.isArray(entry.perspectives) && isObject(entry.perspectives)) {
          // Convert { "modelName": "status" } to [{ modelName, status }]
          entry.perspectives = Object.entries(entry.perspectives).map(([modelName, status]) => ({
            modelName,
            status,
          }));
        }
        return entry;
      });
    }

    // Normalize argumentStrengthProfile
    if (consensus.argumentStrengthProfile && !Array.isArray(consensus.argumentStrengthProfile) && isObject(consensus.argumentStrengthProfile)) {
      // Convert { "modelName": { scores } } to [{ modelName, ...scores }]
      consensus.argumentStrengthProfile = Object.entries(consensus.argumentStrengthProfile).map(([modelName, scores]) => ({
        modelName,
        ...(isObject(scores) ? scores : {}),
      }));
    }
  }

  return normalized as T;
}

// ============================================================================
// STATUS PRIORITY - Imported from Single Source of Truth
// ============================================================================

/**
 * Status priority for analysis deduplication
 *
 * SINGLE SOURCE OF TRUTH: Imported from @/stores/chat/store-constants
 * See store-constants.ts for implementation and priority values.
 *
 * Priority Order (from ANALYSIS_STATUS_PRIORITY constant):
 * - complete (3): Analysis fully generated and saved
 * - streaming (2): Analysis actively being generated
 * - pending (1): Analysis queued but not started
 * - failed (0): Analysis generation failed
 *
 * Used by deduplicateAnalyses() to choose which analysis to keep
 * when multiple analyses exist for the same round.
 *
 * @example
 * ```typescript
 * const priority1 = getStatusPriority('complete'); // 3
 * const priority2 = getStatusPriority('streaming');  // 2
 * if (priority1 > priority2) {
 *   // Keep complete analysis
 * }
 * ```
 */
// Re-export getStatusPriority from store-constants for use in deduplicateAnalyses()
// No local implementation - uses centralized ANALYSIS_STATUS_PRIORITY constant

// ============================================================================
// ANALYSIS VALIDATION
// ============================================================================

/**
 * Check if all participants in a round failed
 *
 * Examines assistant messages to determine if all participants encountered
 * errors during generation. Used to decide whether to create an analysis
 * (no analysis needed if all participants failed).
 *
 * Detection Logic:
 * 1. Filters to assistant messages only (user messages excluded)
 * 2. Validates each message's metadata against DbMessageMetadataSchema
 * 3. Uses messageHasError() to check for error indicators:
 *    - hasError flag
 *    - errorType field
 *    - errorMessage field
 *    - errorCategory field
 *
 * @param messages - Array of UIMessages from the round
 * @returns True if all assistant messages have errors
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'user', ... },
 *   { role: 'assistant', metadata: { hasError: true } },
 *   { role: 'assistant', metadata: { errorType: 'rate_limit' } }
 * ];
 * checkAllParticipantsFailed(messages); // true
 * ```
 */
export function checkAllParticipantsFailed(messages: UIMessage[]): boolean {
  const assistantMessages = messages.filter(m => m.role === MessageRoles.ASSISTANT);

  // No assistant messages means no failures (just no responses yet)
  if (assistantMessages.length === 0) {
    return false;
  }

  // Check if every assistant message has an error
  return assistantMessages.every((m) => {
    const parsed = DbMessageMetadataSchema.safeParse(m.metadata);
    return parsed.success && messageHasError(parsed.data);
  });
}

/**
 * Check if round has incomplete participant responses
 *
 * Returns true if:
 * 1. Round has fewer participant messages than expected participants
 * 2. OR some participant messages have errors (partial failure)
 *
 * Use this to determine if retry button should be shown.
 *
 * @param messages - All messages in conversation
 * @param participants - Expected participants
 * @param roundNumber - Round number to check
 * @returns True if round is incomplete or has partial failures
 *
 * @example
 * ```typescript
 * const isIncomplete = isRoundIncomplete(
 *   messages,
 *   participants,
 *   1
 * );
 * if (isIncomplete) {
 *   // Show retry button
 * }
 * ```
 */
export function isRoundIncomplete(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
): boolean {
  // Filter messages by round
  const assistantMessagesInRound = messages.filter((m) => {
    if (m.role !== MessageRoles.ASSISTANT) {
      return false;
    }
    const parsed = DbMessageMetadataSchema.safeParse(m.metadata);
    return parsed.success && parsed.data?.roundNumber === roundNumber;
  });

  const enabledParticipants = participants.filter(p => p.isEnabled);

  // Round is incomplete if fewer messages than expected participants
  if (assistantMessagesInRound.length < enabledParticipants.length) {
    return true;
  }

  // Round is incomplete if any participant message has an error
  const hasErrors = assistantMessagesInRound.some((m) => {
    const parsed = DbMessageMetadataSchema.safeParse(m.metadata);
    return parsed.success && messageHasError(parsed.data);
  });

  return hasErrors;
}

/**
 * Determine if analysis should be created for a round
 *
 * Validates preconditions before creating a moderator analysis:
 * 1. Analysis not already created for this round
 * 2. Sufficient participant responses received FOR THIS ROUND
 * 3. At least one participant succeeded (not all failed)
 *
 * CRITICAL: Only counts messages from the CURRENT round, not all messages.
 * This prevents false positives in multi-round conversations.
 *
 * @param messages - All messages in the conversation
 * @param participants - Chat participants
 * @param roundNumber - Round number to check
 * @param createdAnalysisRounds - Set of rounds with existing analyses
 * @returns True if analysis should be created
 *
 * @example
 * ```typescript
 * const createdRounds = new Set([1, 2]);
 * const shouldCreate = shouldCreateAnalysis(
 *   messages,
 *   participants,
 *   3,
 *   createdRounds
 * );
 * if (shouldCreate) {
 *   // Create analysis for round 3
 * }
 * ```
 */
export function shouldCreateAnalysis(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
  createdAnalysisRounds: Set<number>,
): boolean {
  // Check if already created
  if (createdAnalysisRounds.has(roundNumber)) {
    return false;
  }

  // CRITICAL FIX: Filter assistant messages BY CURRENT ROUND ONLY
  // Previous bug: counted messages from ALL rounds, causing validation failures
  const assistantMessagesInRound = messages.filter((m) => {
    if (m.role !== MessageRoles.ASSISTANT) {
      return false;
    }

    // Check if message belongs to current round
    const parsed = DbMessageMetadataSchema.safeParse(m.metadata);
    if (!parsed.success || !parsed.data) {
      return false;
    }

    return parsed.data.roundNumber === roundNumber;
  });

  const enabledParticipants = participants.filter(p => p.isEnabled);

  // Check minimum message count FOR THIS ROUND
  if (assistantMessagesInRound.length === 0 || assistantMessagesInRound.length < enabledParticipants.length) {
    return false;
  }

  // Check if all participants failed IN THIS ROUND
  const allParticipantsFailed = checkAllParticipantsFailed(assistantMessagesInRound);

  return !allParticipantsFailed;
}

// ============================================================================
// ANALYSIS DEDUPLICATION
// ============================================================================

/**
 * Deduplicate analyses by ID and round number
 *
 * Performs multi-step deduplication to ensure clean analysis list:
 *
 * Step 1: Deduplicate by ID
 * - Remove duplicate analysis objects with same ID
 * - Keeps first occurrence of each ID
 *
 * Step 2: Filter invalid analyses
 * - Removes failed analyses (status === 'failed')
 * - Optionally filters out analyses for regenerating rounds
 *
 * Step 3: Deduplicate by round number
 * - One analysis per round (keeps highest priority)
 * - Priority: complete > streaming > pending
 * - If same priority, keeps most recent (by createdAt)
 *
 * Step 4: Sort by round number (ascending)
 *
 * @param analyses - Raw analyses array (may contain duplicates)
 * @param options - Optional configuration
 * @param options.regeneratingRoundNumber - Round being regenerated (filtered out)
 * @param options.excludeFailed - Whether to exclude failed analyses (default: true)
 * @returns Deduplicated and sorted analyses
 *
 * @example
 * ```typescript
 * // Basic deduplication
 * const clean = deduplicateAnalyses(rawAnalyses);
 *
 * // With regeneration filtering
 * const clean = deduplicateAnalyses(rawAnalyses, {
 *   regeneratingRoundNumber: 2
 * });
 * ```
 */
export function deduplicateAnalyses(
  analyses: StoredModeratorAnalysis[],
  options?: {
    regeneratingRoundNumber?: number | null;
    excludeFailed?: boolean;
  },
): StoredModeratorAnalysis[] {
  const { regeneratingRoundNumber, excludeFailed = true } = options || {};

  // Step 1: Deduplicate by ID
  const seenIds = new Set<string>();
  const uniqueById = analyses.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }
    seenIds.add(item.id);
    return true;
  });

  // Step 2: Filter out invalid analyses
  const ANALYSIS_TIMEOUT_MS = 60000; // 60 seconds
  const now = Date.now();

  const validAnalyses = uniqueById.filter((item) => {
    // Exclude failed analyses
    if (excludeFailed && item.status === AnalysisStatuses.FAILED) {
      return false;
    }

    // ✅ TIMEOUT PROTECTION: Exclude stuck streaming analyses
    // If analysis has been 'streaming' or 'pending' for >60 seconds, treat as failed
    // This prevents infinite loading when SSE streams fail
    if ((item.status === AnalysisStatuses.STREAMING || item.status === AnalysisStatuses.PENDING) && item.createdAt) {
      const createdTime = item.createdAt instanceof Date
        ? item.createdAt.getTime()
        : new Date(item.createdAt).getTime();
      const elapsed = now - createdTime;

      if (elapsed > ANALYSIS_TIMEOUT_MS) {
        return false; // Exclude stuck analyses
      }
    }

    // Exclude analysis for the round being regenerated
    if (regeneratingRoundNumber !== null
      && regeneratingRoundNumber !== undefined
      && item.roundNumber === regeneratingRoundNumber) {
      return false;
    }

    return true;
  });

  // Step 3: Deduplicate by round number (keep highest priority status)
  const deduplicatedByRound = validAnalyses.reduce((acc, item) => {
    const existing = acc.get(item.roundNumber);
    if (!existing) {
      acc.set(item.roundNumber, item);
      return acc;
    }

    // Priority: complete > streaming > pending (via ANALYSIS_STATUS_PRIORITY)
    const itemPriority = getStatusPriority(item.status);
    const existingPriority = getStatusPriority(existing.status);

    if (itemPriority > existingPriority) {
      acc.set(item.roundNumber, item);
      return acc;
    }

    // If same priority, keep the most recent one
    if (itemPriority === existingPriority) {
      const itemTime = item.createdAt instanceof Date
        ? item.createdAt.getTime()
        : new Date(item.createdAt).getTime();
      const existingTime = existing.createdAt instanceof Date
        ? existing.createdAt.getTime()
        : new Date(existing.createdAt).getTime();
      if (itemTime > existingTime) {
        acc.set(item.roundNumber, item);
      }
    }

    return acc;
  }, new Map<number, StoredModeratorAnalysis>());

  // Step 4: Sort by round number (ascending)
  return Array.from(deduplicatedByRound.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}
