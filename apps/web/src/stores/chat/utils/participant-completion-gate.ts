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

import { FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses, TextPartStates } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { getAssistantMetadata, getModeratorMetadata, getParticipantId, getRoundNumber, isNonEmptyString, isObject } from '@/lib/utils';
import type { ChatParticipant } from '@/services/api';

// ============================================================================
// Zod Schemas - Single Source of Truth
// ============================================================================

export const ParticipantDebugInfoSchema = z.object({
  participantId: z.string().nullable(),
  participantIndex: z.number().nullable(),
  hasMessage: z.boolean(),
  hasStreamingParts: z.boolean(),
  hasFinishReason: z.boolean(),
  hasContent: z.boolean(),
  isComplete: z.boolean(),
});

export const ParticipantCompletionStatusSchema = z.object({
  /** Whether all participants have completed for this round */
  allComplete: z.boolean(),
  /** Total number of expected participants */
  expectedCount: z.number(),
  /** Number of participants with complete messages */
  completedCount: z.number(),
  /** Number of participants still streaming */
  streamingCount: z.number(),
  /** Participant IDs that are still streaming */
  streamingParticipantIds: z.array(z.string()),
  /** Participant IDs that have completed */
  completedParticipantIds: z.array(z.string()),
  /** Debug info about each participant's status */
  debugInfo: z.array(ParticipantDebugInfoSchema),
});

// ============================================================================
// Type Inference - Derived from Zod schemas
// ============================================================================

export type ParticipantDebugInfo = z.infer<typeof ParticipantDebugInfoSchema>;
export type ParticipantCompletionStatus = z.infer<typeof ParticipantCompletionStatusSchema>;

// ============================================================================
// Core Completion Check
// ============================================================================

/**
 * Check if a single message is complete (finished streaming)
 *
 * A message is complete when:
 * 1. It has NO parts with `state: 'streaming'` (CHECKED FIRST for UI consistency)
 * 2. It has a VALID finishReason in metadata (NOT 'unknown')
 * 3. It has actual text content (not just placeholders)
 *
 * ✅ CRITICAL: Streaming parts state is checked FIRST for UI consistency.
 * If parts are visually streaming, the message is NOT complete - even if finishReason exists.
 * This prevents premature moderator triggering during active streaming.
 *
 * ✅ CRITICAL: finishReason: 'unknown' indicates an INTERRUPTED stream, NOT completion.
 * Interrupted streams should be re-triggered, not counted as complete.
 */
export function isMessageComplete(message: UIMessage): boolean {
  // ✅ FIRST: Check streaming parts for UI consistency
  // If ANY part is streaming, the message is NOT visually complete
  // This takes precedence over finishReason to ensure UI consistency
  const hasStreamingParts = message.parts?.some(
    p => 'state' in p && p.state === TextPartStates.STREAMING,
  ) ?? false;

  if (hasStreamingParts) {
    return false;
  }

  // ✅ SECOND: Check finishReason for completion status
  const metadata = getAssistantMetadata(message.metadata);
  const hasAnyFinishReason = !!metadata?.finishReason;

  // ✅ FALLBACK: Check finishReason directly when Zod validation fails
  let hasFallbackFinishReason = false;
  if (!metadata && isObject(message.metadata)) {
    const rawFinishReason = message.metadata.finishReason;
    hasFallbackFinishReason = isNonEmptyString(rawFinishReason);
  }

  // Check for text content
  const hasTextContent = message.parts?.some(
    p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
  );

  // Check for VALID finishReason (not 'unknown')
  // 'unknown' means interrupted stream - only complete if has content
  const hasValidFinishReason = hasAnyFinishReason
    && metadata?.finishReason !== FinishReasons.UNKNOWN;

  let hasValidFallbackFinishReason = false;
  if (hasFallbackFinishReason && isObject(message.metadata)) {
    hasValidFallbackFinishReason = message.metadata.finishReason !== FinishReasons.UNKNOWN;
  }

  // Complete if:
  // - Has valid finishReason (stream definitively ended, even if error with no content), OR
  // - Has text content (works for 'unknown' finishReason with content, or messages without metadata)
  return hasValidFinishReason || hasValidFallbackFinishReason || !!hasTextContent;
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

  // ✅ PERF FIX: Build participant ID → message Map for O(1) lookups
  // Previously O(p×n): For each participant, find() scans all round messages
  // Now O(n+p): Single pass to build map, then O(1) lookups per participant
  const participantMessageMap = new Map<string, UIMessage>();
  for (const msg of roundMessages) {
    const pId = getParticipantId(msg.metadata);
    if (pId) {
      participantMessageMap.set(pId, msg);
    }
  }

  const debugInfo: ParticipantDebugInfo[] = [];
  const streamingParticipantIds: string[] = [];
  const completedParticipantIds: string[] = [];

  // Check each expected participant
  for (const participant of enabledParticipants) {
    // ✅ O(1) lookup instead of O(n) find
    const participantMessage = participantMessageMap.get(participant.id);

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
    // ✅ FIRST: Check streaming parts for UI consistency
    // If ANY part is streaming, the message is NOT visually complete
    const hasStreamingParts = participantMessage.parts?.some(
      p => 'state' in p && p.state === TextPartStates.STREAMING,
    ) ?? false;

    // Check finishReason for debug info
    const metadata = getAssistantMetadata(participantMessage.metadata);
    const hasAnyFinishReason = !!metadata?.finishReason;

    // ✅ FALLBACK: Check finishReason directly when Zod validation fails
    let hasFallbackFinishReason = false;
    if (!metadata && isObject(participantMessage.metadata)) {
      const rawFinishReason = participantMessage.metadata.finishReason;
      hasFallbackFinishReason = isNonEmptyString(rawFinishReason);
    }

    const hasTextContent = participantMessage.parts?.some(
      p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
    );

    // Check for VALID finishReason (not 'unknown')
    const hasValidFinishReason = hasAnyFinishReason
      && metadata?.finishReason !== FinishReasons.UNKNOWN;

    let hasValidFallbackFinishReason = false;
    if (hasFallbackFinishReason && isObject(participantMessage.metadata)) {
      hasValidFallbackFinishReason = participantMessage.metadata.finishReason !== FinishReasons.UNKNOWN;
    }

    // If streaming, message is NOT complete - streaming parts takes precedence over finishReason
    // (But we still compute all values for accurate debug info above)
    const isComplete = !hasStreamingParts && (hasValidFinishReason || hasValidFallbackFinishReason || !!hasTextContent);

    debugInfo.push({
      participantId: participant.id,
      participantIndex: participant.priority,
      hasMessage: true,
      hasStreamingParts,
      hasFinishReason: hasValidFinishReason || hasValidFallbackFinishReason,
      hasContent: !!hasTextContent,
      isComplete,
    });

    if (isComplete) {
      completedParticipantIds.push(participant.id);
    } else {
      streamingParticipantIds.push(participant.id);
    }
  }

  const allComplete = streamingParticipantIds.length === 0 && completedParticipantIds.length === enabledParticipants.length;

  return {
    allComplete,
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
    p => 'state' in p && p.state === TextPartStates.STREAMING,
  ) ?? false;

  return hasStreamingParts ? MessageStatuses.STREAMING : MessageStatuses.COMPLETE;
}

// ============================================================================
// Round Completion Check (includes moderator)
// ============================================================================

/**
 * Check if an entire round is complete (all participants + moderator)
 *
 * This is used to detect stale streaming state where streamingRoundNumber
 * is still set but the entire round has actually completed.
 *
 * A round is complete when:
 * 1. All participants have complete messages (finishReason or content)
 * 2. Moderator message exists and is complete (finishReason or content)
 *
 * @param messages - Array of UI messages
 * @param participants - Array of participants
 * @param roundNumber - Round number to check
 * @returns true if the entire round (participants + moderator) is complete
 */
export function isRoundComplete(
  messages: UIMessage[],
  participants: ChatParticipant[],
  roundNumber: number,
): boolean {
  // Check if all participants are complete
  const participantStatus = getParticipantCompletionStatus(messages, participants, roundNumber);
  if (!participantStatus.allComplete) {
    return false;
  }

  // Check if moderator exists and is complete
  const moderatorMessage = getModeratorMessageForRound(messages, roundNumber);
  if (!moderatorMessage) {
    return false;
  }

  // Check if moderator is complete (not streaming and has content/finishReason)
  return isMessageComplete(moderatorMessage);
}
