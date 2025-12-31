/**
 * Round Number Service - Round calculation and validation logic
 *
 * Following backend-patterns.md: Service layer for business logic
 * Extracted from streaming.handler.ts for better maintainability
 *
 * This service handles:
 * - Round number calculation based on message history
 * - Round regeneration logic
 * - Participant trigger detection (empty messages that reuse rounds)
 * - ✅ 0-BASED INDEXING: First round is round 0, first participant is p0
 */

import { and, desc, eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { MessageRoles } from '@/api/core/enums';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  NO_ROUND_SENTINEL,
} from '@/lib/schemas/round-schemas';
import { isTextPart } from '@/lib/utils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Message structure for round number calculation
 * ✅ TYPE-SAFE: Explicit structure instead of `unknown`
 *
 * Uses optional properties since we only need metadata and parts for calculation.
 * Avoids force casting by using type guards for property access.
 */
export type RoundCalculationMessage = {
  role?: string;
  metadata?: {
    isParticipantTrigger?: boolean;
    roundNumber?: number;
  };
  parts?: Array<{
    type: string;
    text?: string;
  }>;
};

export type CalculateRoundNumberParams = {
  threadId: string;
  participantIndex: number;
  message: RoundCalculationMessage;
  regenerateRound?: number;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

export type RoundNumberResult = {
  roundNumber: number;
  isRegeneration: boolean;
  isTriggerMessage: boolean;
};

// ============================================================================
// Round Number Calculation
// ============================================================================

/**
 * Calculate round number for a streaming request
 *
 * CRITICAL PATTERNS:
 * - Only participant 0 calculates round numbers (prevents race conditions)
 * - Subsequent participants (1, 2, 3...) query from database
 * - Regeneration reuses exact round number being regenerated
 * - Trigger messages (empty content) reuse existing round number
 * - Real messages with content increment to new round
 *
 * Reference: streaming.handler.ts lines 193-309
 */
export async function calculateRoundNumber(
  params: CalculateRoundNumberParams,
): Promise<RoundNumberResult> {
  const { threadId, participantIndex, message, regenerateRound, db } = params;

  // =========================================================================
  // REGENERATION: Reuse exact round number
  // =========================================================================
  if (regenerateRound && participantIndex === 0) {
    return {
      roundNumber: regenerateRound,
      isRegeneration: true,
      isTriggerMessage: false,
    };
  }

  // =========================================================================
  // PARTICIPANT 0: Calculate round number from message content
  // =========================================================================
  if (participantIndex === 0) {
    // ✅ TYPE-SAFE: Direct property access on typed message structure
    const { metadata, parts } = message;
    const isParticipantTrigger = metadata?.isParticipantTrigger === true;

    // CRITICAL FIX: Trust frontend's round number if provided
    // Frontend calculates correctly using calculateNextRoundNumber()
    const frontendRoundNumber = metadata?.roundNumber;

    // ✅ 0-BASED: Round numbers start at 0
    if (typeof frontendRoundNumber === 'number' && frontendRoundNumber >= 0) {
      // Frontend provided explicit round number - trust it
      return {
        roundNumber: frontendRoundNumber,
        isRegeneration: false,
        isTriggerMessage: isParticipantTrigger,
      };
    }

    // Fallback to backend calculation if frontend didn't provide
    // ✅ TYPE GUARD: Extract text parts with runtime validation
    const textParts = parts?.filter(isTextPart) ?? [];
    const textContent = textParts
      .map(p => p.text)
      .join('')
      .trim();

    // Get existing user messages to determine round number
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });

    // ✅ 0-BASED: Use NO_ROUND_SENTINEL so first round becomes 0
    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;

    // If trigger message (empty OR flagged), reuse last round number
    // If real message with content, increment to new round
    // ✅ 0-BASED: Allow round 0 (lastRoundNumber >= 0 instead of > 0)
    if ((isParticipantTrigger || textContent.length === 0) && lastRoundNumber >= DEFAULT_ROUND_NUMBER) {
      return {
        roundNumber: lastRoundNumber,
        isRegeneration: false,
        isTriggerMessage: true,
      };
    }

    // ✅ 0-BASED: Use centralized calculation (NO_ROUND_SENTINEL + 1 = 0 for first round)
    return {
      roundNumber: calculateNextRound(lastRoundNumber),
      isRegeneration: false,
      isTriggerMessage: false,
    };
  }

  // =========================================================================
  // SUBSEQUENT PARTICIPANTS: Get round number from database
  // =========================================================================
  // CRITICAL FIX: Replaced time-based filtering with explicit round number matching
  //
  // Strategy:
  // 1. Query the last user message to get the expected round number
  // 2. Check if any assistant has responded in that round
  // 3. Use that round number for subsequent participants
  // 4. Throw clear errors if round number cannot be determined

  // Step 1: Get the last user message to determine expected round number
  const lastUserMessage = await db.query.chatMessage.findFirst({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
    columns: { roundNumber: true, createdAt: true },
    orderBy: desc(tables.chatMessage.createdAt),
  });

  if (!lastUserMessage) {
    const errorContext: ErrorContext = {
      errorType: 'resource',
      resource: 'chatMessage',
      resourceId: threadId,
    };
    throw createError.notFound(
      `Cannot determine round number for participant ${participantIndex}: No user messages found`,
      errorContext,
    );
  }

  const expectedRoundNumber = lastUserMessage.roundNumber;

  // Step 2: Check if any assistant messages exist for this round
  // This handles the race condition where participant 0 might not have saved yet
  const assistantInRound = await db.query.chatMessage.findFirst({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
      eq(tables.chatMessage.roundNumber, expectedRoundNumber),
    ),
    columns: { roundNumber: true, createdAt: true },
    orderBy: desc(tables.chatMessage.createdAt),
  });

  // Step 3: Use the round number from either the assistant or the user message
  const roundNumber = assistantInRound
    ? assistantInRound.roundNumber
    : expectedRoundNumber;

  return {
    roundNumber,
    isRegeneration: false,
    isTriggerMessage: false,
  };
}

// ============================================================================
// Round Validation
// ============================================================================

/**
 * Validate that regeneration is only for the most recent round
 *
 * Reference: streaming.handler.ts lines 115-129
 */
export async function validateRegenerateRound(
  threadId: string,
  regenerateRound: number,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  const maxRound = await db.query.chatMessage.findFirst({
    where: eq(tables.chatMessage.threadId, threadId),
    orderBy: desc(tables.chatMessage.roundNumber),
    columns: { roundNumber: true },
  });

  const maxRoundNumber = maxRound?.roundNumber ?? DEFAULT_ROUND_NUMBER;

  if (regenerateRound !== maxRoundNumber) {
    const errorContext: ErrorContext = {
      errorType: 'validation',
      field: 'regenerateRound',
    };
    throw createError.badRequest(
      `Can only regenerate the most recent round (${maxRoundNumber}). Attempted to regenerate round ${regenerateRound}.`,
      errorContext,
    );
  }
}
