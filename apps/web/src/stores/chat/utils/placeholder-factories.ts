/**
 * Placeholder Factories - Minimal implementations for optimistic UI
 */

import type { ChatMode } from '@roundtable/shared';
import { MessagePartTypes, MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import type { ExtendedFilePart, ParticipantConfig } from '@/lib/schemas';
import type { ChangelogItem, ChatParticipant, StoredPreSearch } from '@/services/api';

// Simple ID generator to avoid nanoid dependency
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Extract model name from modelId (e.g., 'openai/gpt-4' -> 'gpt-4')
function getModelName(modelId: string): string {
  return modelId.split('/').pop() || modelId;
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

type CreateOptimisticChangelogParams = {
  threadId: string;
  roundNumber: number;
  currentParticipants: ChatParticipant[];
  selectedParticipants: ParticipantConfig[];
  oldMode: ChatMode | null;
  newMode: ChatMode | null;
  oldWebSearch: boolean;
  newWebSearch: boolean;
};

/**
 * Creates optimistic changelog items for immediate UI display
 * before server confirmation. Detects participant, mode, and web search changes.
 */
export function createOptimisticChangelogItems({
  currentParticipants,
  newMode,
  newWebSearch,
  oldMode,
  oldWebSearch,
  roundNumber,
  selectedParticipants,
  threadId,
}: CreateOptimisticChangelogParams): ChangelogItem[] {
  const items: ChangelogItem[] = [];
  const now = new Date().toISOString();

  // Detect mode changes
  if (oldMode && newMode && oldMode !== newMode) {
    items.push({
      changeData: {
        newMode,
        oldMode,
        type: 'mode_change',
      },
      changeSummary: `Changed conversation mode from ${oldMode} to ${newMode}`,
      changeType: 'modified',
      createdAt: now,
      id: `optimistic_changelog_mode_${generateId()}`,
      roundNumber,
      threadId,
    });
  }

  // Detect web search changes
  if (oldWebSearch !== newWebSearch) {
    items.push({
      changeData: {
        enabled: newWebSearch,
        type: 'web_search',
      },
      changeSummary: newWebSearch ? 'Enabled web search' : 'Disabled web search',
      changeType: 'modified',
      createdAt: now,
      id: `optimistic_changelog_websearch_${generateId()}`,
      roundNumber,
      threadId,
    });
  }

  // Detect participant additions
  const currentModelIds = new Set(currentParticipants.map(p => p.modelId));
  for (const selected of selectedParticipants) {
    if (!currentModelIds.has(selected.modelId)) {
      items.push({
        changeData: {
          modelId: selected.modelId,
          role: selected.role || null,
          type: 'participant',
        },
        changeSummary: selected.role
          ? `Added ${selected.role}`
          : `Added ${getModelName(selected.modelId)}`,
        changeType: 'added',
        createdAt: now,
        id: `optimistic_changelog_add_${generateId()}`,
        roundNumber,
        threadId,
      });
    }
  }

  // Detect participant removals
  const selectedModelIds = new Set(selectedParticipants.map(p => p.modelId));
  for (const current of currentParticipants) {
    if (!selectedModelIds.has(current.modelId)) {
      items.push({
        changeData: {
          modelId: current.modelId,
          participantId: current.id,
          role: current.role || null,
          type: 'participant',
        },
        changeSummary: current.role
          ? `Removed ${current.role}`
          : `Removed ${getModelName(current.modelId)}`,
        changeType: 'removed',
        createdAt: now,
        id: `optimistic_changelog_remove_${generateId()}`,
        roundNumber,
        threadId,
      });
    }
  }

  return items;
}
