/**
 * Summary Utility Functions
 *
 * Shared utilities for working with round summaries in chat threads.
 * These functions handle summary deduplication, status priority, and
 * validation logic used across ChatOverviewScreen and ChatThreadScreen.
 *
 * @module lib/utils/summary-utils
 */

import type { DeepPartial } from 'ai';

import { MessageStatuses } from '@/api/core/enums';
import type { RoundSummaryPayload, StoredRoundSummary } from '@/api/routes/chat/schema';
import { getStatusPriority } from '@/stores/chat';

import { isObject } from './type-guards';

// ============================================================================
// SUMMARY DATA COMPLETENESS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Summary data input type
 * Accepts both complete data and AI SDK streaming partial data
 *
 * DeepPartial<T> from AI SDK makes all properties recursively optional,
 * including array elements, which differs from TypeScript's Partial<T>
 */
type SummaryDataInput
  = | RoundSummaryPayload
    | DeepPartial<RoundSummaryPayload>
    | null
    | undefined;

/**
 * Check if summary data has displayable content
 *
 * Type guard that narrows the input type from nullable to non-nullable.
 * Handles both complete summary data (RoundSummaryPayload) and
 * partial streaming data (AI SDK's DeepPartial<RoundSummaryPayload>).
 *
 * For the new simplified schema:
 * - summary: string (the main summary text)
 * - metrics: { engagement, insight, balance, clarity } (0-100 scores)
 *
 * @param data - Summary data (complete or streaming partial)
 * @returns True if data has displayable content, with type narrowing
 */
export function hasSummaryData(
  data: SummaryDataInput,
): data is RoundSummaryPayload | DeepPartial<RoundSummaryPayload> {
  // Null/undefined check
  if (!data) {
    return false;
  }

  // Type-safe access to properties for SIMPLIFIED SUMMARY SCHEMA
  const summary = 'summary' in data ? data.summary : undefined;
  const metrics = 'metrics' in data ? data.metrics : undefined;

  // Check if we have summary text (excluding whitespace-only)
  const hasSummaryText = typeof summary === 'string' && summary.trim().length > 0;

  // Check if we have any metrics greater than 0
  const hasMetrics = isObject(metrics) && (
    (typeof metrics.engagement === 'number' && !Number.isNaN(metrics.engagement) && metrics.engagement > 0)
    || (typeof metrics.insight === 'number' && !Number.isNaN(metrics.insight) && metrics.insight > 0)
    || (typeof metrics.balance === 'number' && !Number.isNaN(metrics.balance) && metrics.balance > 0)
    || (typeof metrics.clarity === 'number' && !Number.isNaN(metrics.clarity) && metrics.clarity > 0)
  );

  // Returns true as soon as we have summary text OR any metrics
  return hasSummaryText || hasMetrics;
}

// ============================================================================
// SUMMARY DATA NORMALIZATION
// ============================================================================

/**
 * Normalize summary data to ensure consistent format
 *
 * For the new simplified schema, normalization is minimal since we only have:
 * - summary: string
 * - metrics: { engagement, insight, balance, clarity }
 *
 * This function is kept for consistency and future extensibility.
 *
 * @param data - Raw summary data from AI model
 * @returns Normalized data
 */
export function normalizeSummaryData<T>(data: T): T {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(data)) {
    return data;
  }

  // Deep clone to avoid mutation
  const normalized: Record<string, unknown> = JSON.parse(JSON.stringify(data));

  // For the simplified schema, no complex normalization needed
  // Just ensure metrics are clamped to 0-100 range if present
  if (isObject(normalized.metrics)) {
    const metrics = normalized.metrics;
    const clamp = (value: unknown): number | undefined => {
      if (typeof value !== 'number')
        return undefined;
      return Math.max(0, Math.min(100, value));
    };

    if ('engagement' in metrics)
      metrics.engagement = clamp(metrics.engagement);
    if ('insight' in metrics)
      metrics.insight = clamp(metrics.insight);
    if ('balance' in metrics)
      metrics.balance = clamp(metrics.balance);
    if ('clarity' in metrics)
      metrics.clarity = clamp(metrics.clarity);
  }

  return normalized as T;
}

// ============================================================================
// SUMMARY DEDUPLICATION
// ============================================================================

/**
 * Deduplicate summaries by ID and round number
 *
 * Performs multi-step deduplication to ensure clean summary list:
 *
 * Step 1: Deduplicate by ID
 * - Remove duplicate summary objects with same ID
 * - Keeps first occurrence of each ID
 *
 * Step 2: Filter invalid summaries
 * - Removes failed summaries (status === 'failed')
 * - Optionally filters out summaries for regenerating rounds
 *
 * Step 3: Deduplicate by round number
 * - One summary per round (keeps highest priority)
 * - Priority: complete > streaming > pending
 * - If same priority, keeps most recent (by createdAt)
 *
 * Step 4: Sort by round number (ascending)
 *
 * @param summaries - Raw summaries array (may contain duplicates)
 * @param options - Optional configuration
 * @param options.regeneratingRoundNumber - Round being regenerated (filtered out)
 * @param options.excludeFailed - Whether to exclude failed summaries (default: true)
 * @returns Deduplicated and sorted summaries
 *
 * @example
 * ```typescript
 * // Basic deduplication
 * const clean = deduplicateSummaries(rawSummaries);
 *
 * // With regeneration filtering
 * const clean = deduplicateSummaries(rawSummaries, {
 *   regeneratingRoundNumber: 2
 * });
 * ```
 */
export function deduplicateSummaries(
  summaries: StoredRoundSummary[],
  options?: {
    regeneratingRoundNumber?: number | null;
    excludeFailed?: boolean;
  },
): StoredRoundSummary[] {
  const { regeneratingRoundNumber, excludeFailed = true } = options || {};

  // Step 1: Deduplicate by ID
  const seenIds = new Set<string>();
  const uniqueById = summaries.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }
    seenIds.add(item.id);
    return true;
  });

  // Step 2: Filter out invalid summaries
  const SUMMARY_TIMEOUT_MS = 60000; // 60 seconds
  const now = Date.now();

  const validSummaries = uniqueById.filter((item) => {
    // Exclude failed summaries
    if (excludeFailed && item.status === MessageStatuses.FAILED) {
      return false;
    }

    // ✅ TIMEOUT PROTECTION: Exclude stuck streaming summaries
    // If summary has been 'streaming' or 'pending' for >60 seconds, treat as failed
    // This prevents infinite loading when SSE streams fail
    if ((item.status === MessageStatuses.STREAMING || item.status === MessageStatuses.PENDING) && item.createdAt) {
      const createdTime = item.createdAt instanceof Date
        ? item.createdAt.getTime()
        : new Date(item.createdAt).getTime();
      const elapsed = now - createdTime;

      if (elapsed > SUMMARY_TIMEOUT_MS) {
        return false; // Exclude stuck summaries
      }
    }

    // Exclude summary for the round being regenerated
    if (regeneratingRoundNumber !== null
      && regeneratingRoundNumber !== undefined
      && item.roundNumber === regeneratingRoundNumber) {
      return false;
    }

    return true;
  });

  // Step 3: Deduplicate by round number (keep highest priority status)
  const deduplicatedByRound = validSummaries.reduce((acc, item) => {
    const existing = acc.get(item.roundNumber);
    if (!existing) {
      acc.set(item.roundNumber, item);
      return acc;
    }

    // Priority: complete > streaming > pending (via SUMMARY_STATUS_PRIORITY)
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
  }, new Map<number, StoredRoundSummary>());

  // Step 4: Sort by round number (ascending)
  return Array.from(deduplicatedByRound.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}
