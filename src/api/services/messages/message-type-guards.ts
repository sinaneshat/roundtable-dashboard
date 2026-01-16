/**
 * Message Type Guards - Zod-based validation
 *
 * ✅ ZOD-FIRST PATTERN: Uses .safeParse() from existing schemas
 * ✅ SINGLE SOURCE OF TRUTH: Delegates to metadata.ts utilities
 */

import type { ChatMessage } from '@/db/validation';
import { getParticipantMetadata, getPreSearchMetadata } from '@/lib/utils';

export function isDbPreSearchMessage(message: ChatMessage): boolean {
  return getPreSearchMetadata(message.metadata) !== null;
}

export function isDbParticipantMessage(message: ChatMessage): boolean {
  if (!message.participantId)
    return false;
  return getParticipantMetadata(message.metadata) !== null;
}

/**
 * Filter messages to only participant messages (non-system, non-pre-search)
 * Generic to preserve the input type (e.g., messages with relations)
 */
export function filterDbToParticipantMessages<T extends ChatMessage>(messages: T[]): T[] {
  return messages.filter(isDbParticipantMessage);
}

/**
 * Filter messages to only pre-search messages
 * Generic to preserve the input type (e.g., messages with relations)
 */
export function filterDbToPreSearchMessages<T extends ChatMessage>(messages: T[]): T[] {
  return messages.filter(isDbPreSearchMessage);
}

/**
 * Filter messages to conversation messages (excluding pre-search)
 * Generic to preserve the input type (e.g., messages with relations)
 */
export function filterDbToConversationMessages<T extends ChatMessage>(messages: T[]): T[] {
  return messages.filter(msg => !isDbPreSearchMessage(msg));
}

export function countDbParticipantMessages(messages: ChatMessage[]): number {
  return filterDbToParticipantMessages(messages).length;
}
