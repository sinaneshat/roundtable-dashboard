/**
 * Database Message Type Guards
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Provides Zod-validated type guards for database ChatMessage records:
 * - Type-safe filtering for handlers and services
 * - Separates database concerns from frontend transforms
 */

import { MessageRoles } from '@/api/core/enums';
import type { ChatMessage } from '@/db/validation';
import { getMessageMetadata, getParticipantId, getPreSearchMetadata, isModeratorMessage } from '@/lib/utils/metadata';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if database message is pre-search message
 * Uses Zod schema validation for runtime type safety
 */
export function isDbPreSearchMessage(message: ChatMessage): boolean {
  if (!message.metadata)
    return false;
  return getPreSearchMetadata(message.metadata) !== null;
}

/**
 * Check if database message is participant message
 * Must have participantId column AND metadata indicating participant (not moderator)
 *
 * ✅ LENIENT CHECK: Doesn't require full Zod validation
 * Just checks essential fields to allow persisted messages to be found
 */
export function isDbParticipantMessage(message: ChatMessage): boolean {
  if (!message.participantId || !message.metadata)
    return false;

  // Use type-safe metadata extraction helpers
  const metadata = getMessageMetadata(message.metadata);
  if (!metadata)
    return false;

  // Must be assistant role
  if (metadata.role !== MessageRoles.ASSISTANT)
    return false;

  // Must have participantId in metadata
  const participantId = getParticipantId(message.metadata);
  if (!participantId)
    return false;

  // Must NOT be a moderator message
  if (isModeratorMessage(message))
    return false;

  return true;
}

// ============================================================================
// Bulk Filtering
// ============================================================================

export function filterDbToParticipantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(isDbParticipantMessage);
}

export function filterDbToPreSearchMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(isDbPreSearchMessage);
}

export function filterDbToConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(msg => !isDbPreSearchMessage(msg));
}

export function countDbParticipantMessages(messages: ChatMessage[]): number {
  return filterDbToParticipantMessages(messages).length;
}
