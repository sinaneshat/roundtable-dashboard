/**
 * Database Message Type Guards
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * Provides Zod-validated type guards for database ChatMessage records:
 * - Type-safe filtering for handlers and services
 * - Separates database concerns from frontend transforms
 */

import type { ChatMessage } from '@/db/validation';
import { getParticipantMetadata, getPreSearchMetadata } from '@/lib/utils';

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
 * Must have participantId column AND valid participant metadata
 */
export function isDbParticipantMessage(message: ChatMessage): boolean {
  if (!message.participantId || !message.metadata)
    return false;
  return getParticipantMetadata(message.metadata) !== null;
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
