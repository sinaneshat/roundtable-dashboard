/**
 * Placeholder Object Factories - V2
 *
 * Factory functions for creating placeholder/optimistic objects:
 * - Optimistic user messages (for immediate UI feedback)
 * - Placeholder pre-search objects (for web search UI)
 *
 * PATTERN: Uses enum constants from @roundtable/shared for type-safe status values
 * SINGLE SOURCE: Eliminates duplicate inline object creation
 * TYPE-SAFE: Returns typed UIMessage and PreSearchResult objects
 */

import { MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import type { PreSearchResult } from '../store-schemas';

// ============================================================================
// OPTIMISTIC USER MESSAGE FACTORY
// ============================================================================

type CreateOptimisticUserMessageParams = {
  roundNumber: number;
  text: string;
};

/**
 * Create an optimistic user message for immediate UI feedback
 *
 * Creates a user message with isOptimistic: true marker that displays
 * immediately while the actual message is being sent to the server.
 */
export function createOptimisticUserMessage(
  params: CreateOptimisticUserMessageParams,
): UIMessage {
  const { roundNumber, text } = params;

  return {
    id: `optimistic-user-${roundNumber}-${Date.now()}`,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      isOptimistic: true,
    },
  };
}

// ============================================================================
// PLACEHOLDER PRE-SEARCH FACTORY
// ============================================================================

type CreatePlaceholderPreSearchParams = {
  roundNumber: number;
  query: string;
};

/**
 * Create a placeholder pre-search object for eager UI rendering
 *
 * Creates a pre-search in PENDING status that allows PreSearchSection
 * to render with loading UI before web search results arrive.
 */
export function createPlaceholderPreSearch(
  params: CreatePlaceholderPreSearchParams,
): PreSearchResult {
  const { roundNumber, query } = params;

  return {
    roundNumber,
    status: MessageStatuses.PENDING,
    query,
    results: null,
    startedAt: Date.now(),
    completedAt: null,
  };
}

// ============================================================================
// PLACEHOLDER PARTICIPANT MESSAGE FACTORY
// ============================================================================

type CreatePlaceholderParticipantParams = {
  roundNumber: number;
  participantIndex: number;
  modelId: string;
};

/**
 * Create a placeholder participant message for sequential streaming UI
 *
 * Creates an assistant placeholder that shows "thinking" state while
 * waiting for the participant's stream to begin.
 */
export function createPlaceholderParticipant(
  params: CreatePlaceholderParticipantParams,
): UIMessage {
  const { roundNumber, participantIndex, modelId } = params;

  return {
    id: `placeholder-participant-${roundNumber}-${participantIndex}-${Date.now()}`,
    role: MessageRoles.ASSISTANT,
    parts: [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      modelId,
      isPlaceholder: true,
    },
  };
}
