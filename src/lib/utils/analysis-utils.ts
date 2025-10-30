/**
 * Analysis Utility Functions
 *
 * Shared utilities for working with moderator analyses in chat threads.
 * These functions handle analysis deduplication, status priority, and
 * validation logic used across ChatOverviewScreen and ChatThreadScreen.
 *
 * @module lib/utils/analysis-utils
 */

import type { UIMessage } from 'ai';

import type { ChatParticipant, ModeratorAnalysisPayload, RoundSummary, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';

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
export function hasAnalysisData(
  data: Partial<ModeratorAnalysisPayload> | null | undefined,
): data is Pick<ModeratorAnalysisPayload, 'leaderboard' | 'participantAnalyses' | 'roundSummary'> {
  if (!data) {
    return false;
  }

  const { leaderboard = [], participantAnalyses = [], roundSummary } = data;

  // Check top-level arrays
  const hasLeaderboard = leaderboard.length > 0;
  const hasParticipantAnalyses = participantAnalyses.length > 0;

  // Check roundSummary fields (all possible sections)
  const hasRoundSummaryData = hasRoundSummaryContent(roundSummary);

  return hasLeaderboard || hasParticipantAnalyses || hasRoundSummaryData;
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
  roundSummary: Partial<RoundSummary> | null | undefined,
): boolean {
  if (!roundSummary) {
    return false;
  }

  return Boolean(
    (roundSummary.keyInsights && roundSummary.keyInsights.length > 0)
    || (roundSummary.consensusPoints && roundSummary.consensusPoints.length > 0)
    || (roundSummary.divergentApproaches && roundSummary.divergentApproaches.length > 0)
    || roundSummary.comparativeAnalysis
    || roundSummary.decisionFramework
    || roundSummary.overallSummary
    || roundSummary.conclusion
    || (roundSummary.recommendedActions && roundSummary.recommendedActions.length > 0),
  );
}

/**
 * Validate analysis data against schema (strict type checking)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this for strict validation that requires
 * ALL required fields to be present and valid according to schema.
 *
 * Schema Requirements (enforced by Zod):
 * - roundNumber: Required integer ≥ 1
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
// STATUS PRIORITY
// ============================================================================

/**
 * Get priority value for analysis status
 *
 * Used for deduplication when multiple analyses exist for the same round.
 * Higher priority status wins when choosing which analysis to display.
 *
 * Priority Order:
 * - completed (3): Analysis fully generated and saved
 * - streaming (2): Analysis actively being generated
 * - pending (1): Analysis queued but not started
 * - unknown (0): Invalid or unrecognized status
 *
 * @param status - Analysis status string
 * @returns Priority number (higher = more important)
 *
 * @example
 * ```typescript
 * const priority1 = getStatusPriority('completed'); // 3
 * const priority2 = getStatusPriority('streaming');  // 2
 * if (priority1 > priority2) {
 *   // Keep completed analysis
 * }
 * ```
 */
export function getStatusPriority(status: string): number {
  switch (status) {
    case 'completed':
      return 3;
    case 'streaming':
      return 2;
    case 'pending':
      return 1;
    default:
      return 0;
  }
}

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
 * 2. Validates each message's metadata against MessageMetadataSchema
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
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  // No assistant messages means no failures (just no responses yet)
  if (assistantMessages.length === 0) {
    return false;
  }

  // Check if every assistant message has an error
  return assistantMessages.every((m) => {
    const parsed = MessageMetadataSchema.safeParse(m.metadata);
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
    if (m.role !== 'assistant') {
      return false;
    }
    const parsed = MessageMetadataSchema.safeParse(m.metadata);
    return parsed.success && parsed.data?.roundNumber === roundNumber;
  });

  const enabledParticipants = participants.filter(p => p.isEnabled);

  // Round is incomplete if fewer messages than expected participants
  if (assistantMessagesInRound.length < enabledParticipants.length) {
    return true;
  }

  // Round is incomplete if any participant message has an error
  const hasErrors = assistantMessagesInRound.some((m) => {
    const parsed = MessageMetadataSchema.safeParse(m.metadata);
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
    if (m.role !== 'assistant') {
      return false;
    }

    // Check if message belongs to current round
    const parsed = MessageMetadataSchema.safeParse(m.metadata);
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
 * - Priority: completed > streaming > pending
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
  const validAnalyses = uniqueById.filter((item) => {
    // Exclude failed analyses
    if (excludeFailed && item.status === 'failed') {
      return false;
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

    // Priority: completed > streaming > pending
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
