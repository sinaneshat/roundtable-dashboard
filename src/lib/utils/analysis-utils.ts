/**
 * Analysis Utility Functions
 *
 * Shared utilities for working with moderator analyses in chat threads.
 * These functions handle analysis deduplication, status priority, and
 * validation logic used across ChatOverviewScreen and ChatThreadScreen.
 *
 * @module lib/utils/analysis-utils
 */

import type { DeepPartial } from 'ai';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { getStatusPriority } from '@/stores/chat';

import { isObject } from './type-guards';

// ============================================================================
// ANALYSIS DATA COMPLETENESS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Check if analysis has any displayable data (for rendering control)
 *
 * Returns `true` if ANY field has data (OR logic).
 * Returns `false` if NO fields have data (component should render null).
 *
 * @param data - Analysis data object (can be partial during streaming)
 * @returns True if analysis has any displayable content
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
 * @param data - Analysis data (complete or streaming partial)
 * @returns True if data has displayable content, with type narrowing
 */
export function hasAnalysisData(
  data: AnalysisDataInput,
): data is ModeratorAnalysisPayload | DeepPartial<ModeratorAnalysisPayload> {
  // Null/undefined check
  if (!data) {
    return false;
  }

  // Type-safe access to properties for ARTICLE-STYLE SCHEMA
  // Safely access optional properties (both complete and partial data)
  const article = 'article' in data ? data.article : undefined;
  const confidence = 'confidence' in data ? data.confidence : undefined;
  const recommendations = 'recommendations' in data ? data.recommendations : undefined;
  const modelVoices = 'modelVoices' in data ? data.modelVoices : undefined;
  const consensusTable = 'consensusTable' in data ? data.consensusTable : undefined;
  const minorityViews = 'minorityViews' in data ? data.minorityViews : undefined;
  const convergenceDivergence = 'convergenceDivergence' in data ? data.convergenceDivergence : undefined;

  // ✅ KEY INSIGHTS (generated FIRST by backend - highest priority)
  // Check article and recommendations first since they stream before other fields
  const hasArticle = isObject(article) && (
    (typeof article.headline === 'string' && article.headline.length > 0)
    || (typeof article.narrative === 'string' && article.narrative.length > 0)
    || (typeof article.keyTakeaway === 'string' && article.keyTakeaway.length > 0)
  );
  const recommendationsArray = recommendations ?? [];
  const hasRecommendations = Array.isArray(recommendationsArray) && recommendationsArray.length > 0;

  // ✅ CONFIDENCE (generated after key insights)
  const hasConfidence = isObject(confidence) && typeof confidence.overall === 'number' && confidence.overall > 0;

  // Check arrays: handle both complete arrays and partial arrays with undefined elements
  const modelVoicesArray = modelVoices ?? [];
  const consensusTableArray = consensusTable ?? [];
  const minorityViewsArray = minorityViews ?? [];

  // Check if arrays have content (filter undefined elements from PartialObject)
  const hasModelVoices = Array.isArray(modelVoicesArray) && modelVoicesArray.length > 0;
  const hasConsensusTable = Array.isArray(consensusTableArray) && consensusTableArray.length > 0;
  const hasMinorityViews = Array.isArray(minorityViewsArray) && minorityViewsArray.length > 0;

  // Check object fields
  const hasConvergenceDivergence = convergenceDivergence != null;

  // ✅ STREAMING ORDER: article → recommendations → confidence → rest
  // Returns true as soon as ANY displayable field has content
  return hasArticle || hasRecommendations || hasConfidence || hasModelVoices || hasConsensusTable || hasMinorityViews || hasConvergenceDivergence;
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
