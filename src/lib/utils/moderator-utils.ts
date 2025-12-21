/**
 * Moderator Utility Functions
 *
 * Shared utilities for working with moderators in chat threads.
 * These functions handle moderator deduplication, status priority, and
 * validation logic used across ChatOverviewScreen and ChatThreadScreen.
 *
 * MODERATOR ARCHITECTURE:
 * - Moderators are triggered via moderator messages (assistant role with isModerator: true)
 * - useModeratorTrigger creates moderator messages after all participants complete
 * - Moderator streaming populates moderatorData field in StoredModeratorData
 * - These utilities validate and process the resulting moderator data
 *
 * @module lib/utils/moderator-utils
 */

import type { DeepPartial } from 'ai';

import { MessageStatuses } from '@/api/core/enums';
import type { ModeratorPayload, StoredModeratorData } from '@/api/routes/chat/schema';
import { getStatusPriority } from '@/stores/chat';

import { isObject } from './type-guards';

// ============================================================================
// MODERATOR DATA COMPLETENESS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Moderator data input type
 * Accepts both complete data and AI SDK streaming partial data
 *
 * DeepPartial<T> from AI SDK makes all properties recursively optional,
 * including array elements, which differs from TypeScript's Partial<T>
 */
type ModeratorDataInput
  = | ModeratorPayload
    | DeepPartial<ModeratorPayload>
    | null
    | undefined;

/**
 * Check if moderator data has displayable content
 *
 * Type guard that narrows the input type from nullable to non-nullable.
 * Handles both complete moderator data (ModeratorPayload) and
 * partial streaming data (AI SDK's DeepPartial<ModeratorPayload>).
 *
 * MODERATOR SCHEMA:
 * - summary: string (the main moderator text)
 * - metrics: { engagement, insight, balance, clarity } (0-100 scores)
 *
 * USAGE:
 * - Called during moderator streaming to detect first displayable content
 * - Used by ModelMessageCard to determine when to show moderator UI
 * - Works with progressive streaming (detects partial data)
 *
 * @param data - Moderator data (complete or streaming partial)
 * @returns True if data has displayable content, with type narrowing
 */
export function hasModeratorData(
  data: ModeratorDataInput,
): data is ModeratorPayload | DeepPartial<ModeratorPayload> {
  // Null/undefined check
  if (!data) {
    return false;
  }

  // Type-safe access to properties for MODERATOR SCHEMA
  const summary = 'summary' in data ? data.summary : undefined;
  const metrics = 'metrics' in data ? data.metrics : undefined;

  // Check if we have moderator text (excluding whitespace-only)
  const hasModeratorText = typeof summary === 'string' && summary.trim().length > 0;

  // Check if we have any metrics greater than 0
  const hasMetrics = isObject(metrics) && (
    (typeof metrics.engagement === 'number' && !Number.isNaN(metrics.engagement) && metrics.engagement > 0)
    || (typeof metrics.insight === 'number' && !Number.isNaN(metrics.insight) && metrics.insight > 0)
    || (typeof metrics.balance === 'number' && !Number.isNaN(metrics.balance) && metrics.balance > 0)
    || (typeof metrics.clarity === 'number' && !Number.isNaN(metrics.clarity) && metrics.clarity > 0)
  );

  // Returns true as soon as we have moderator text OR any metrics
  return hasModeratorText || hasMetrics;
}

// ============================================================================
// MODERATOR DATA NORMALIZATION
// ============================================================================

/**
 * Normalize moderator data to ensure consistent format
 *
 * MODERATOR SCHEMA:
 * - summary: string (moderator text)
 * - metrics: { engagement, insight, balance, clarity } (0-100 scores)
 *
 * Normalization ensures metrics are clamped to 0-100 range.
 *
 * @param data - Raw moderator data from AI model (streamed via moderator message)
 * @returns Normalized data with clamped metrics
 */
export function normalizeModeratorData<T>(data: T): T {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(data)) {
    return data;
  }

  // Deep clone to avoid mutation
  const normalized: Record<string, unknown> = JSON.parse(JSON.stringify(data));

  // Ensure metrics are clamped to 0-100 range if present
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
// MODERATOR DEDUPLICATION
// ============================================================================

/**
 * Deduplicate moderators by ID and round number
 *
 * Performs multi-step deduplication to ensure clean moderator list:
 *
 * Step 1: Deduplicate by ID
 * - Remove duplicate moderator objects with same ID
 * - Keeps first occurrence of each ID
 *
 * Step 2: Filter invalid moderators
 * - Removes failed moderators (status === 'failed')
 * - Optionally filters out moderators for regenerating rounds
 *
 * Step 3: Deduplicate by round number
 * - One moderator per round (keeps highest priority)
 * - Priority: complete > streaming > pending
 * - If same priority, keeps most recent (by createdAt)
 *
 * Step 4: Sort by round number (ascending)
 *
 * @param moderators - Raw moderators array (may contain duplicates)
 * @param options - Optional configuration
 * @param options.regeneratingRoundNumber - Round being regenerated (filtered out)
 * @param options.excludeFailed - Whether to exclude failed moderators (default: true)
 * @returns Deduplicated and sorted moderators
 *
 * @example
 * ```typescript
 * // Basic deduplication
 * const clean = deduplicateModerators(rawModerators);
 *
 * // With regeneration filtering
 * const clean = deduplicateModerators(rawModerators, {
 *   regeneratingRoundNumber: 2
 * });
 * ```
 */
export function deduplicateModerators(
  moderators: StoredModeratorData[],
  options?: {
    regeneratingRoundNumber?: number | null;
    excludeFailed?: boolean;
  },
): StoredModeratorData[] {
  const { regeneratingRoundNumber, excludeFailed = true } = options || {};

  // Step 1: Deduplicate by ID
  const seenIds = new Set<string>();
  const uniqueById = moderators.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }
    seenIds.add(item.id);
    return true;
  });

  // Step 2: Filter out invalid moderators
  const MODERATOR_TIMEOUT_MS = 60000; // 60 seconds
  const now = Date.now();

  const validModerators = uniqueById.filter((item) => {
    // Exclude failed moderators
    if (excludeFailed && item.status === MessageStatuses.FAILED) {
      return false;
    }

    // ✅ TIMEOUT PROTECTION: Exclude stuck streaming moderators
    // If moderator has been 'streaming' or 'pending' for >60 seconds, treat as failed
    // This prevents infinite loading when SSE streams fail
    if ((item.status === MessageStatuses.STREAMING || item.status === MessageStatuses.PENDING) && item.createdAt) {
      const createdTime = item.createdAt instanceof Date
        ? item.createdAt.getTime()
        : new Date(item.createdAt).getTime();
      const elapsed = now - createdTime;

      if (elapsed > MODERATOR_TIMEOUT_MS) {
        return false; // Exclude stuck moderators
      }
    }

    // Exclude moderator for the round being regenerated
    if (regeneratingRoundNumber !== null
      && regeneratingRoundNumber !== undefined
      && item.roundNumber === regeneratingRoundNumber) {
      return false;
    }

    return true;
  });

  // Step 3: Deduplicate by round number (keep highest priority status)
  const deduplicatedByRound = validModerators.reduce((acc, item) => {
    const existing = acc.get(item.roundNumber);
    if (!existing) {
      acc.set(item.roundNumber, item);
      return acc;
    }

    // Priority: complete > streaming > pending
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
  }, new Map<number, StoredModeratorData>());

  // Step 4: Sort by round number (ascending)
  return Array.from(deduplicatedByRound.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}
