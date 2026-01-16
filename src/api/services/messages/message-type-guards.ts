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
