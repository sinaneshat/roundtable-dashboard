import { MessageRoles } from '@roundtable/shared/enums';
import { and, desc, eq } from 'drizzle-orm';
import * as z from 'zod';

import { createError } from '@/common/error-handling';
import type { ErrorContext } from '@/core';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  NO_ROUND_SENTINEL,
} from '@/lib/schemas/round-schemas';
import { isTextPart } from '@/lib/utils';

// ============================================================================
// TYPE DEFINITIONS (Zod-first pattern)
// ============================================================================

type DbClient = Awaited<ReturnType<typeof getDbAsync>>;

// Message part schema for round calculation
const _RoundCalculationPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

// Message metadata schema for round calculation
const _RoundCalculationMetadataSchema = z.object({
  isParticipantTrigger: z.boolean().optional(),
  roundNumber: z.number().optional(),
});

// Message schema for round calculation - subset of full message
const _RoundCalculationMessageSchema = z.object({
  role: z.string().optional(),
  metadata: _RoundCalculationMetadataSchema.optional(),
  parts: z.array(_RoundCalculationPartSchema).optional(),
});

type RoundCalculationMessage = z.infer<typeof _RoundCalculationMessageSchema>;

// Params type includes DbClient which cannot be Zod validated
type CalculateRoundNumberParams = {
  threadId: string;
  participantIndex: number;
  message: RoundCalculationMessage;
  regenerateRound?: number;
  db: DbClient;
};

// Result schema for round number calculation
const _RoundNumberResultSchema = z.object({
  roundNumber: z.number(),
  isRegeneration: z.boolean(),
  isTriggerMessage: z.boolean(),
});

type RoundNumberResult = z.infer<typeof _RoundNumberResultSchema>;

export async function calculateRoundNumber(
  params: CalculateRoundNumberParams,
): Promise<RoundNumberResult> {
  const { threadId, participantIndex, message, regenerateRound, db } = params;

  if (regenerateRound && participantIndex === 0) {
    return {
      roundNumber: regenerateRound,
      isRegeneration: true,
      isTriggerMessage: false,
    };
  }

  if (participantIndex === 0) {
    const { metadata, parts } = message;
    const isParticipantTrigger = metadata?.isParticipantTrigger === true;
    const frontendRoundNumber = metadata?.roundNumber;
    if (typeof frontendRoundNumber === 'number' && frontendRoundNumber >= 0) {
      return {
        roundNumber: frontendRoundNumber,
        isRegeneration: false,
        isTriggerMessage: isParticipantTrigger,
      };
    }

    const textParts = parts?.filter(isTextPart) ?? [];
    const textContent = textParts
      .map(p => p.text)
      .join('')
      .trim();

    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });

    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;

    if ((isParticipantTrigger || textContent.length === 0) && lastRoundNumber >= DEFAULT_ROUND_NUMBER) {
      return {
        roundNumber: lastRoundNumber,
        isRegeneration: false,
        isTriggerMessage: true,
      };
    }

    return {
      roundNumber: calculateNextRound(lastRoundNumber),
      isRegeneration: false,
      isTriggerMessage: false,
    };
  }

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

  const assistantInRound = await db.query.chatMessage.findFirst({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
      eq(tables.chatMessage.roundNumber, expectedRoundNumber),
    ),
    columns: { roundNumber: true, createdAt: true },
    orderBy: desc(tables.chatMessage.createdAt),
  });

  const roundNumber = assistantInRound
    ? assistantInRound.roundNumber
    : expectedRoundNumber;

  return {
    roundNumber,
    isRegeneration: false,
    isTriggerMessage: false,
  };
}

/**
 * Simple helper to get the next round number for changelog entries
 * Used when adding/updating/removing participants, settings changes, etc.
 * where we need the next round number without the full message context.
 */
export async function getNextRoundForChangelog(
  threadId: string,
  db: DbClient,
): Promise<number> {
  const existingUserMessages = await db.query.chatMessage
    .findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });

  const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
  return calculateNextRound(lastRoundNumber);
}

export async function validateRegenerateRound(
  threadId: string,
  regenerateRound: number,
  db: DbClient,
): Promise<void> {
  const maxRound = await db.query.chatMessage
    .findFirst({
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
