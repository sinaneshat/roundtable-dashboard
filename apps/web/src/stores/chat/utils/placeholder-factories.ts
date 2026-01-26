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
import type { FileUIPart, UIMessage } from 'ai';
import { z } from 'zod';

import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';
import type { StoredPreSearch } from '@/services/api';

import type { StoredModeratorData } from '../store-schemas';

// ============================================================================
// Helper Functions for Type-Safe File Part Conversion
// ============================================================================

/**
 * Convert ExtendedFilePart to FileUIPart
 *
 * ✅ PATTERN: Handles exactOptionalPropertyTypes by conditionally adding optional fields
 * FileUIPart expects `filename?: string` (no undefined), but ExtendedFilePart has
 * `filename?: string | undefined`. This function converts by only including defined values.
 *
 * @param part - ExtendedFilePart with optional filename/uploadId
 * @returns FileUIPart compatible with AI SDK
 */
function toFileUIPart(part: ExtendedFilePart): FileUIPart {
  const result: FileUIPart = {
    mediaType: part.mediaType,
    type: 'file',
    url: part.url,
  };

  // ✅ PATTERN: Conditionally add optional fields to satisfy exactOptionalPropertyTypes
  if (part.filename !== undefined) {
    result.filename = part.filename;
  }

  return result;
}

// ============================================================================
// ZOD SCHEMAS - Single source of truth for type definitions
// ============================================================================

/**
 * Parameters schema for creating a placeholder moderator
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const CreatePlaceholderModeratorParamsSchema = z.object({
  mode: ChatModeSchema,
  roundNumber: z.number().int().nonnegative(),
  threadId: z.string(),
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
  const { mode, roundNumber, threadId, userQuestion } = params;

  return {
    completedAt: null,
    createdAt: new Date().toISOString(),
    errorMessage: null,
    id: `placeholder-moderator-${threadId}-${roundNumber}`,
    mode,
    moderatorData: null,
    participantMessageIds: [],
    roundNumber,
    status: MessageStatuses.PENDING,
    threadId,
    userQuestion,
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
  roundNumber: z.number().int().nonnegative(),
  threadId: z.string(),
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
  const { roundNumber, threadId, userQuery } = params;

  return {
    completedAt: null,
    createdAt: new Date().toISOString(),
    errorMessage: null,
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    roundNumber,
    searchData: null,
    status: MessageStatuses.PENDING,
    threadId,
    userQuery,
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
  fileParts: z.array(ExtendedFilePartSchema).optional(),
  roundNumber: z.number().int().nonnegative(),
  text: z.string(),
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
  const { fileParts = [], roundNumber, text } = params;

  // ✅ PATTERN: Convert ExtendedFilePart to FileUIPart for exactOptionalPropertyTypes compliance
  const convertedFileParts = fileParts.map(toFileUIPart);

  return {
    id: `optimistic-user-${roundNumber}-${Date.now()}`,
    metadata: {
      isOptimistic: true, // Marker for optimistic update
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [
      ...convertedFileParts, // Files first (matches UI layout)
      { text, type: MessagePartTypes.TEXT },
    ],
    role: MessageRoles.USER,
  };
}
