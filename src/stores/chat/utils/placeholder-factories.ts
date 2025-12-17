/**
 * Placeholder Object Factories
 *
 * Centralized factory functions for creating placeholder/optimistic objects:
 * - Placeholder summary objects (for eager UI rendering)
 * - Placeholder pre-search objects (for web search UI)
 * - Optimistic user messages (for immediate UI feedback)
 *
 * ✅ PATTERN: Uses enum constants from @/api/core/enums for type-safe status values
 * ✅ SINGLE SOURCE: Eliminates duplicate inline object creation in form-actions.ts
 * ✅ TYPE-SAFE: Returns typed StoredRoundSummary, StoredPreSearch, and UIMessage objects
 *
 * @module stores/chat/utils/placeholder-factories
 */

import type { UIMessage } from 'ai';

import type { ChatMode } from '@/api/core/enums';
import { MessagePartTypes, MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { StoredPreSearch, StoredRoundSummary } from '@/api/routes/chat/schema';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';

// ============================================================================
// PLACEHOLDER SUMMARY FACTORY
// ============================================================================

/**
 * Parameters for creating a placeholder summary
 */
export type CreatePlaceholderSummaryParams = {
  threadId: string;
  roundNumber: number;
  mode: ChatMode;
  userQuestion: string;
};

/**
 * Create a placeholder summary object for eager UI rendering
 *
 * Creates a summary in PENDING status that allows RoundSummaryCard
 * to render with loading UI before participants finish streaming.
 *
 * @example
 * // In handleCreateThread:
 * actions.addSummary(createPlaceholderSummary({
 *   threadId: thread.id,
 *   roundNumber: 0,
 *   mode: thread.mode,
 *   userQuestion: prompt,
 * }));
 */
export function createPlaceholderSummary(
  params: CreatePlaceholderSummaryParams,
): StoredRoundSummary {
  const { threadId, roundNumber, mode, userQuestion } = params;

  return {
    id: `placeholder-summary-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    mode,
    userQuestion,
    status: MessageStatuses.PENDING,
    summaryData: null,
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
    status: MessageStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

// ============================================================================
// OPTIMISTIC USER MESSAGE FACTORY
// ============================================================================

/**
 * Parameters for creating an optimistic user message
 */
export type CreateOptimisticUserMessageParams = {
  roundNumber: number;
  text: string;
  fileParts?: ExtendedFilePart[];
};

/**
 * Create an optimistic user message for immediate UI feedback
 *
 * Creates a user message with isOptimistic: true marker that displays
 * immediately while the actual message is being sent to the server.
 *
 * **SINGLE SOURCE OF TRUTH**: Use this instead of inline UIMessage creation.
 * Consolidates duplicate patterns from form-actions.ts and incomplete-round-resumption.ts.
 *
 * @example
 * // In handleUpdateThreadAndSend:
 * const optimisticMessage = createOptimisticUserMessage({
 *   roundNumber: nextRoundNumber,
 *   text: trimmedInput,
 *   fileParts,
 * });
 * actions.setMessages([...messages, optimisticMessage]);
 *
 * @example
 * // In incomplete-round-resumption (text only):
 * const optimisticMessage = createOptimisticUserMessage({
 *   roundNumber: orphanedRoundNumber,
 *   text: recoveredQuery,
 * });
 */
export function createOptimisticUserMessage(
  params: CreateOptimisticUserMessageParams,
): UIMessage {
  const { roundNumber, text, fileParts = [] } = params;

  return {
    id: `optimistic-user-${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [
      ...fileParts, // Files first (matches UI layout)
      { type: MessagePartTypes.TEXT, text },
    ],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      isOptimistic: true, // Marker for optimistic update
    },
  };
}
