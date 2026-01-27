/**
 * Placeholder Factories - Minimal implementations for optimistic UI
 */

import { MessagePartTypes, MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import type { StoredPreSearch } from '@/services/api';

// Simple ID generator to avoid nanoid dependency
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

type CreateOptimisticUserMessageParams = {
  text: string;
  roundNumber: number;
  fileParts?: ExtendedFilePart[];
};

/**
 * Creates an optimistic user message for immediate UI display
 * before server confirmation
 */
export function createOptimisticUserMessage({
  fileParts,
  roundNumber,
  text,
}: CreateOptimisticUserMessageParams): UIMessage {
  const parts: UIMessage['parts'] = [];

  // Add file parts if present
  if (fileParts && fileParts.length > 0) {
    for (const filePart of fileParts) {
      parts.push({
        mediaType: filePart.mediaType,
        type: MessagePartTypes.FILE,
        url: filePart.url,
      });
    }
  }

  // Add text part
  parts.push({
    text,
    type: MessagePartTypes.TEXT,
  });

  return {
    id: `optimistic_${generateId()}`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts,
    role: MessageRoles.USER,
  };
}

type CreatePlaceholderPreSearchParams = {
  threadId: string;
  roundNumber: number;
  userQuery: string;
};

/**
 * Creates a placeholder pre-search entry for optimistic UI
 */
export function createPlaceholderPreSearch({
  roundNumber,
  threadId,
  userQuery,
}: CreatePlaceholderPreSearchParams): StoredPreSearch {
  return {
    completedAt: null,
    createdAt: new Date().toISOString(),
    errorMessage: null,
    id: `presearch_${generateId()}`,
    roundNumber,
    status: 'pending',
    threadId,
    userQuery,
  };
}
