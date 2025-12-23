/**
 * Participant Message Lookup Utilities
 *
 * **TYPE-SAFE PARTICIPANT LOOKUP**: Multi-strategy message matching for streaming resumption
 * **ELIMINATES ANTI-PATTERNS**: No more `participantMessages.get(participant.id)` single-strategy lookups
 *
 * This module provides utilities for finding participant messages using multiple strategies:
 * 1. By participantId (primary - DB messages with full metadata)
 * 2. By participantIndex (fallback - resumed streams with partial metadata)
 * 3. By modelId (last resort - AI SDK resumed messages with minimal metadata)
 *
 * Design Principles:
 * 1. Use type-safe metadata extraction from @/lib/utils/metadata
 * 2. Support streaming resumption where messages may have incomplete metadata
 * 3. Provide both Map building and lookup functions
 */

import type { UIMessage } from 'ai';

import { MessagePartTypes } from '@/api/core/enums';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import type { ChatParticipant } from '@/db/validation/chat';
import {
  getMessageMetadata,
  getModel,
  getParticipantId,
  getParticipantIndex,
} from '@/lib/utils';

// ============================================================================
// Participant Message Maps Type
// ============================================================================

/**
 * Multi-strategy lookup maps for participant messages
 *
 * Built from assistant messages for a specific round, these maps enable
 * finding participant messages even when metadata is incomplete (e.g., during
 * streaming resumption after page refresh).
 */
export type ParticipantMessageMaps = {
  /** Primary lookup by participantId (most reliable for DB messages) */
  byId: Map<string, UIMessage>;
  /** Fallback lookup by participantIndex (for resumed streams with partial metadata) */
  byIndex: Map<number, UIMessage>;
  /** Last resort lookup by modelId (for AI SDK resumed messages with minimal metadata) */
  byModelId: Map<string, UIMessage>;
};

// ============================================================================
// Map Building Functions
// ============================================================================

/**
 * Build multi-strategy lookup maps from assistant messages
 *
 * Creates three maps for participant message lookup, handling cases where:
 * - DB messages have full metadata (participantId available)
 * - Resumed streams may only have participantIndex
 * - AI SDK temp ID messages may only have modelId
 *
 * @param assistantMessages - Assistant messages from a specific round
 * @returns ParticipantMessageMaps for multi-strategy lookup
 *
 * @example
 * ```typescript
 * const maps = buildParticipantMessageMaps(messagesForRound);
 * const message = getParticipantMessageFromMaps(maps, participant, participantIdx);
 * ```
 */
export function buildParticipantMessageMaps(
  assistantMessages: UIMessage[],
): ParticipantMessageMaps {
  const byId = new Map<string, UIMessage>();
  const byIndex = new Map<number, UIMessage>();
  const byModelId = new Map<string, UIMessage>();

  for (const message of assistantMessages) {
    const meta = getMessageMetadata(message.metadata);
    if (!meta || !isAssistantMessageMetadata(meta)) {
      continue;
    }

    // Map by participantId (primary lookup for DB messages)
    const participantId = getParticipantId(message.metadata);
    if (participantId) {
      byId.set(participantId, message);
    }

    // Map by participantIndex (fallback for resumed streams)
    const participantIndex = getParticipantIndex(message.metadata);
    if (participantIndex !== null) {
      byIndex.set(participantIndex, message);
    }

    // Map by modelId (last resort for messages with minimal metadata)
    const modelId = getModel(message.metadata);
    if (modelId) {
      byModelId.set(modelId, message);
    }
  }

  return { byId, byIndex, byModelId };
}

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Find a participant's message using multiple lookup strategies
 *
 * Tries strategies in order of reliability:
 * 1. participantId - Most reliable, used for DB messages
 * 2. participantIndex - Fallback for resumed streams with partial metadata
 * 3. modelId - Last resort for AI SDK resumed messages
 *
 * @param maps - Pre-built ParticipantMessageMaps
 * @param participant - The participant to find a message for
 * @param participantIdx - The participant's index in the sorted list
 * @returns The participant's message or undefined if not found
 *
 * @example
 * ```typescript
 * const message = getParticipantMessageFromMaps(maps, participant, idx);
 * if (message) {
 *   // Participant has responded in this round
 * }
 * ```
 */
export function getParticipantMessageFromMaps(
  maps: ParticipantMessageMaps,
  participant: ChatParticipant,
  participantIdx: number,
): UIMessage | undefined {
  // Strategy 1: By participantId (most reliable for DB messages)
  const byId = maps.byId.get(participant.id);
  if (byId) {
    return byId;
  }

  // Strategy 2: By participantIndex (for resumed streams with partial metadata)
  const byIndex = maps.byIndex.get(participantIdx);
  if (byIndex) {
    return byIndex;
  }

  // Strategy 3: By modelId (last resort for AI SDK resumed messages)
  const byModelId = maps.byModelId.get(participant.modelId);
  if (byModelId) {
    return byModelId;
  }

  return undefined;
}

// ============================================================================
// Content Check Functions
// ============================================================================

/**
 * Check if a message has visible content (text, tool calls, or reasoning)
 *
 * Used to determine if a participant has actually responded vs just having
 * an empty placeholder message.
 *
 * @param message - The message to check
 * @returns True if the message has visible content
 */
export function messageHasVisibleContent(message: UIMessage | undefined): boolean {
  if (!message?.parts) {
    return false;
  }

  return message.parts.some(
    part =>
      (part.type === MessagePartTypes.TEXT && 'text' in part && (part.text as string)?.trim().length > 0)
      || part.type === MessagePartTypes.TOOL_CALL
      || part.type === MessagePartTypes.REASONING,
  );
}

/**
 * Check if a participant has visible content using multi-strategy lookup
 *
 * Combines map lookup with content check for convenience.
 *
 * @param maps - Pre-built ParticipantMessageMaps
 * @param participant - The participant to check
 * @param participantIdx - The participant's index in the sorted list
 * @returns True if the participant has a message with visible content
 */
export function participantHasVisibleContent(
  maps: ParticipantMessageMaps,
  participant: ChatParticipant,
  participantIdx: number,
): boolean {
  const message = getParticipantMessageFromMaps(maps, participant, participantIdx);
  return messageHasVisibleContent(message);
}

/**
 * Check if ALL participants have visible content
 *
 * Used to determine if streaming is complete and all participants
 * have responded with actual content.
 *
 * @param maps - Pre-built ParticipantMessageMaps
 * @param participants - Sorted array of participants
 * @returns True if all participants have visible content
 */
export function allParticipantsHaveVisibleContent(
  maps: ParticipantMessageMaps,
  participants: ChatParticipant[],
): boolean {
  return participants.every((participant, idx) =>
    participantHasVisibleContent(maps, participant, idx),
  );
}
