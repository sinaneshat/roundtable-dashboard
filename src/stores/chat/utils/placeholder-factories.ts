/**
 * Placeholder Object Factories
 *
 * Centralized factory functions for creating placeholder analysis and pre-search objects.
 * Used by form-actions.ts to create optimistic UI state before backend confirmation.
 *
 * ✅ PATTERN: Uses enum constants from @/api/core/enums for type-safe status values
 * ✅ SINGLE SOURCE: Eliminates duplicate inline object creation in form-actions.ts
 * ✅ TYPE-SAFE: Returns typed StoredModeratorAnalysis and StoredPreSearch objects
 *
 * @module stores/chat/utils/placeholder-factories
 */

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatModeId } from '@/lib/config/chat-modes';

// ============================================================================
// PLACEHOLDER ANALYSIS FACTORY
// ============================================================================

/**
 * Parameters for creating a placeholder analysis
 */
export type CreatePlaceholderAnalysisParams = {
  threadId: string;
  roundNumber: number;
  mode: ChatModeId;
  userQuestion: string;
};

/**
 * Create a placeholder analysis object for eager UI rendering
 *
 * Creates an analysis in PENDING status that allows RoundAnalysisCard
 * to render with loading UI before participants finish streaming.
 *
 * @example
 * // In handleCreateThread:
 * actions.addAnalysis(createPlaceholderAnalysis({
 *   threadId: thread.id,
 *   roundNumber: 0,
 *   mode: thread.mode,
 *   userQuestion: prompt,
 * }));
 */
export function createPlaceholderAnalysis(
  params: CreatePlaceholderAnalysisParams,
): StoredModeratorAnalysis {
  const { threadId, roundNumber, mode, userQuestion } = params;

  return {
    id: `placeholder-analysis-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    mode,
    userQuestion,
    status: AnalysisStatuses.PENDING,
    analysisData: null,
    participantMessageIds: [],
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

// ============================================================================
// PLACEHOLDER PRE-SEARCH FACTORY
// ============================================================================

/**
 * Parameters for creating a placeholder pre-search
 */
export type CreatePlaceholderPreSearchParams = {
  threadId: string;
  roundNumber: number;
  userQuery: string;
};

/**
 * Create a placeholder pre-search object for eager UI rendering
 *
 * Creates a pre-search in PENDING status that allows PreSearchSection
 * to render with loading UI before web search results arrive.
 *
 * @example
 * // In handleCreateThread with web search enabled:
 * if (formState.enableWebSearch) {
 *   actions.addPreSearch(createPlaceholderPreSearch({
 *     threadId: thread.id,
 *     roundNumber: 0,
 *     userQuery: prompt,
 *   }));
 * }
 */
export function createPlaceholderPreSearch(
  params: CreatePlaceholderPreSearchParams,
): StoredPreSearch {
  const { threadId, roundNumber, userQuery } = params;

  return {
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: AnalysisStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}
