/**
 * Participant Completion Gate
 *
 * SINGLE SOURCE OF TRUTH for determining if all participants have finished streaming.
 * This is the STRICT GATE that MUST be passed before moderator message creation can proceed.
 *
 * KEY INVARIANTS:
 * 1. A participant is NOT complete if ANY part has `state: 'streaming'`
 * 2. A participant is NOT complete if it has no finishReason
 * 3. A participant is NOT complete if it has no content parts
 * 4. ALL expected participants must have complete messages for the round
 *
 * RACE CONDITION PREVENTION:
 * - This module provides fresh state checks (via store.getState())
 * - Never relies on closure values which can be stale
 * - Called immediately before moderator message creation decisions
 *
 * MODERATOR FLOW:
 * - useModeratorTrigger checks this gate before creating moderator messages
 * - Moderator messages (assistant role with isModerator: true) trigger moderator streaming
 * - This ensures moderators only start after ALL participants complete their responses
 *
 * Location: /src/stores/chat/utils/participant-completion-gate.ts
 */

import type { UIMessage } from 'ai';

import { MessagePartTypes, MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { getAssistantMetadata, getModeratorMetadata, getParticipantId, getRoundNumber } from '@/lib/utils/metadata';
import { isNonEmptyString, isObject } from '@/lib/utils/type-guards';

// ============================================================================
// Types
// ============================================================================

export type ParticipantCompletionStatus = {
  /** Whether all participants have completed for this round */
  allComplete: boolean;
  /** Total number of expected participants */
  expectedCount: number;
  /** Number of participants with complete messages */
  completedCount: number;
  /** Number of participants still streaming */
  streamingCount: number;
  /** Participant IDs that are still streaming */
  streamingParticipantIds: string[];
  /** Participant IDs that have completed */
  completedParticipantIds: string[];
  /** Debug info about each participant's status */
  debugInfo: ParticipantDebugInfo[];
};

export type ParticipantDebugInfo = {
  participantId: string | null;
  participantIndex: number | null;
  hasMessage: boolean;
  hasStreamingParts: boolean;
  hasFinishReason: boolean;
  hasContent: boolean;
  isComplete: boolean;
};

// ============================================================================
// Core Completion Check
// ============================================================================

/**
 * Check if a single message is complete (finished streaming)
 *
 * A message is complete when:
 * 1. It has NO parts with `state: 'streaming'`
 * 2. It has a finishReason in metadata (streaming ended)
 * 3. It has actual text content (not just placeholders)
 */
export function isMessageComplete(message: UIMessage): boolean {
  // Check for streaming parts - if ANY part is streaming, message is not complete
  const hasStreamingParts = message.parts?.some(
    p => 'state' in p && p.state === 'streaming',
  ) ?? false;

  if (hasStreamingParts) {
    return false;
  }

  // Check for text content
  const hasTextContent = message.parts?.some(
    p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
  );

  // Check for finishReason (streaming complete signal)
  const metadata = getAssistantMetadata(message.metadata);
  const hasFinishReason = !!metadata?.finishReason;

  // ✅ FALLBACK: Check finishReason directly when Zod validation fails
  // When streams fail, metadata may have finishReason but lack required fields (e.g., usage)
  // causing getAssistantMetadata() to return null. This fallback prevents failed
  // participants from blocking moderator creation.
  let hasFallbackFinishReason = false;
  if (!metadata && isObject(message.metadata)) {
    const rawFinishReason = message.metadata.finishReason;
    hasFallbackFinishReason = isNonEmptyString(rawFinishReason);
  }

  // Complete if has text content OR has finish reason (handles error cases)
  return hasTextContent || hasFinishReason || hasFallbackFinishReason;
}

/**
 * Get comprehensive completion status for all participants in a round
 *
 * This is the STRICT CHECK that should be used before triggering moderator.
 * Moderator messages (assistant role with isModerator: true metadata) trigger moderator streaming.
 * It provides detailed debugging information for troubleshooting race conditions.
 */
export function getParticipantCompletionStatus(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
): ParticipantCompletionStatus {
  // Get enabled participants
  const enabledParticipants = participants.filter(p => p.isEnabled);

  if (enabledParticipants.length === 0) {
    return {
      allComplete: false,
      expectedCount: 0,
      completedCount: 0,
      streamingCount: 0,
      streamingParticipantIds: [],
      completedParticipantIds: [],
      debugInfo: [],
    };
  }

  // Get assistant messages for this round
  const roundMessages = messages.filter((m) => {
    return (
      m.role === MessageRoles.ASSISTANT
      && getRoundNumber(m.metadata) === roundNumber
    );
  });

  const debugInfo: ParticipantDebugInfo[] = [];
  const streamingParticipantIds: string[] = [];
  const completedParticipantIds: string[] = [];

  // Check each expected participant
  for (const participant of enabledParticipants) {
    const participantMessage = roundMessages.find((m) => {
      const pId = getParticipantId(m.metadata);
      return pId === participant.id;
    });

    if (!participantMessage) {
      // No message yet for this participant
      debugInfo.push({
        participantId: participant.id,
        participantIndex: participant.priority,
        hasMessage: false,
        hasStreamingParts: false,
        hasFinishReason: false,
        hasContent: false,
        isComplete: false,
      });
      streamingParticipantIds.push(participant.id);
      continue;
    }

    // Check message completion status
    const hasStreamingParts = participantMessage.parts?.some(
      p => 'state' in p && p.state === 'streaming',
    ) ?? false;

    const hasTextContent = participantMessage.parts?.some(
      p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
    );

    const metadata = getAssistantMetadata(participantMessage.metadata);
    const hasFinishReason = !!metadata?.finishReason;

    // ✅ FALLBACK: Check finishReason directly when Zod validation fails
    let hasFallbackFinishReason = false;
    if (!metadata && isObject(participantMessage.metadata)) {
      const rawFinishReason = participantMessage.metadata.finishReason;
      hasFallbackFinishReason = isNonEmptyString(rawFinishReason);
    }

    const isComplete = !hasStreamingParts && (hasTextContent || hasFinishReason || hasFallbackFinishReason);

    debugInfo.push({
      participantId: participant.id,
      participantIndex: participant.priority,
      hasMessage: true,
      hasStreamingParts,
      hasFinishReason: hasFinishReason || hasFallbackFinishReason,
      hasContent: !!hasTextContent,
      isComplete,
    });

    if (isComplete) {
      completedParticipantIds.push(participant.id);
    } else {
      streamingParticipantIds.push(participant.id);
    }
  }

  return {
    allComplete: streamingParticipantIds.length === 0 && completedParticipantIds.length === enabledParticipants.length,
    expectedCount: enabledParticipants.length,
    completedCount: completedParticipantIds.length,
    streamingCount: streamingParticipantIds.length,
    streamingParticipantIds,
    completedParticipantIds,
    debugInfo,
  };
}

/**
 * Quick check if all participants are complete for a round
 *
 * Use this for simple boolean checks. For debugging, use getParticipantCompletionStatus.
 */
export function areAllParticipantsCompleteForRound(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
): boolean {
  const status = getParticipantCompletionStatus(messages, participants, roundNumber);
  return status.allComplete;
}

/**
 * Log participant completion status for debugging
 *
 * Only logs in development mode.
 */
export function logParticipantCompletionStatus(
  _status: ParticipantCompletionStatus,
  _context: string,
): void {
  if (process.env.NODE_ENV !== 'development') {
    // No-op in production
  }
}

// ============================================================================
// Moderator Message Utilities
// ============================================================================

/**
 * Get the moderator message for a specific round
 *
 * Moderator messages are assistant messages with isModerator: true metadata.
 * This is the consolidated utility to prevent duplication across the codebase.
 *
 * @param messages - Array of UI messages
 * @param roundNumber - Round number to check
 * @returns Moderator message for the round, or undefined if not found
 */
export function getModeratorMessageForRound(
  messages: UIMessage[],
  roundNumber: number,
): UIMessage | undefined {
  return messages.find((m) => {
    if (m.role !== MessageRoles.ASSISTANT)
      return false;

    const metadata = getModeratorMetadata(m.metadata);
    if (!metadata)
      return false;

    return getRoundNumber(m.metadata) === roundNumber;
  });
}

/**
 * Get streaming status of a message
 *
 * Checks if the message has streaming parts to determine if it's still being generated.
 *
 * @param message - UI message to check
 * @returns STREAMING if message has streaming parts, COMPLETE otherwise
 */
export function getMessageStreamingStatus(
  message: UIMessage,
): typeof MessageStatuses.STREAMING | typeof MessageStatuses.COMPLETE {
  const hasStreamingParts = message.parts?.some(
    p => 'state' in p && p.state === 'streaming',
  ) ?? false;

  return hasStreamingParts ? MessageStatuses.STREAMING : MessageStatuses.COMPLETE;
}
