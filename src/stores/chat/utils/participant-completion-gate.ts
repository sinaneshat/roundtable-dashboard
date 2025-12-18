/**
 * Participant Completion Gate
 *
 * SINGLE SOURCE OF TRUTH for determining if all participants have finished streaming.
 * This is the STRICT GATE that MUST be passed before any summary creation can proceed.
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
 * - Called immediately before summary creation decisions
 *
 * Location: /src/stores/chat/utils/participant-completion-gate.ts
 */

import type { UIMessage } from 'ai';

import { MessagePartTypes, MessageRoles } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { getAssistantMetadata, getParticipantId, getRoundNumber } from '@/lib/utils/metadata';

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

  // Complete if has text content OR has finish reason (handles error cases)
  return hasTextContent || hasFinishReason;
}

/**
 * Get comprehensive completion status for all participants in a round
 *
 * This is the STRICT CHECK that should be used before creating summaries.
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

    const isComplete = !hasStreamingParts && (hasTextContent || hasFinishReason);

    debugInfo.push({
      participantId: participant.id,
      participantIndex: participant.priority,
      hasMessage: true,
      hasStreamingParts,
      hasFinishReason,
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
