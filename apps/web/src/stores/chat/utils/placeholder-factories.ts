/**
 * Placeholder Object Factories
 *
 * Centralized factory functions for creating placeholder/optimistic objects:
 * - Placeholder moderator objects (for test mocking)
 * - Placeholder pre-search objects (for web search UI)
 * - Optimistic user messages (for immediate UI feedback)
 *
 * ✅ PATTERN: Uses enum constants from @/api/core/enums for type-safe status values
 * ✅ SINGLE SOURCE: Eliminates duplicate inline object creation in form-actions.ts
 * ✅ TYPE-SAFE: Returns typed StoredModeratorData, StoredPreSearch, and UIMessage objects
 * ✅ ZOD-FIRST: All types inferred from schemas for maximum type safety
 *
 * @module stores/chat/utils/placeholder-factories
 */

import { ChatModeSchema, MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';
import type { StoredModeratorData, StoredPreSearch } from '@/types/api';

// ============================================================================
// ZOD SCHEMAS - Single source of truth for type definitions
// ============================================================================

/**
 * Parameters schema for creating a placeholder moderator
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const CreatePlaceholderModeratorParamsSchema = z.object({
  threadId: z.string(),
  roundNumber: z.number().int().nonnegative(),
  mode: ChatModeSchema,
  userQuestion: z.string(),
});

export type CreatePlaceholderModeratorParams = z.infer<typeof CreatePlaceholderModeratorParamsSchema>;

/**
 * Create a placeholder moderator object for test mocking
 *
 * This factory exists solely for test utilities that need to mock moderator objects
 * without triggering the full moderator message flow.
 *
 * @see useModeratorTrigger - Production moderator triggering mechanism
 *
 * @example
 * const mockModerator = createPlaceholderModerator({
 *   threadId: 'test-thread',
 *   roundNumber: 0,
 *   mode: ChatMode.BRAINSTORM,
 *   userQuestion: 'Test question',
 * });
 */
export function createPlaceholderModerator(
  params: CreatePlaceholderModeratorParams,
): StoredModeratorData {
  const { threadId, roundNumber, mode, userQuestion } = params;

  return {
    id: `placeholder-moderator-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    mode,
    userQuestion,
    status: MessageStatuses.PENDING,
    moderatorData: null,
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
 * Parameters schema for creating a placeholder pre-search
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const CreatePlaceholderPreSearchParamsSchema = z.object({
  threadId: z.string(),
  roundNumber: z.number().int().nonnegative(),
  userQuery: z.string(),
});

export type CreatePlaceholderPreSearchParams = z.infer<typeof CreatePlaceholderPreSearchParamsSchema>;

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
    createdAt: new Date().toISOString(),
    completedAt: null,
    errorMessage: null,
  };
}

// ============================================================================
// OPTIMISTIC USER MESSAGE FACTORY
// ============================================================================

/**
 * Parameters schema for creating an optimistic user message
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const CreateOptimisticUserMessageParamsSchema = z.object({
  roundNumber: z.number().int().nonnegative(),
  text: z.string(),
  fileParts: z.array(ExtendedFilePartSchema).optional(),
});

export type CreateOptimisticUserMessageParams = z.infer<typeof CreateOptimisticUserMessageParamsSchema>;

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
