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
} from '@/lib/schemas';
import { isTextPart } from '@/lib/utils';

// ============================================================================
// TYPE DEFINITIONS (Zod-first pattern)
// ============================================================================

type DbClient = Awaited<ReturnType<typeof getDbAsync>>;

// Message part schema for round calculation (internal strict version)
const _RoundCalculationPartSchemaStrict = z.object({
  text: z.string().optional(),
  type: z.string(),
}).strict();

// Message metadata schema for round calculation (internal strict version)
const _RoundCalculationMetadataSchemaStrict = z.object({
  isParticipantTrigger: z.boolean().optional(),
  roundNumber: z.number().optional(),
}).strict();

// Message schema for round calculation - subset of full message (internal strict version)
const _RoundCalculationMessageSchemaStrict = z.object({
  metadata: _RoundCalculationMetadataSchemaStrict.optional(),
  parts: z.array(_RoundCalculationPartSchemaStrict).optional(),
  role: z.string().optional(),
}).strict();

type RoundCalculationMessage = z.infer<typeof _RoundCalculationMessageSchemaStrict>;

// ============================================================================
// INPUT PARSING SCHEMAS (non-strict for accepting UIMessage with extra fields)
// ============================================================================

// Message part schema for parsing input (allows extra fields, extracts needed ones)
const RoundCalculationPartInputSchema = z.object({
  text: z.string().optional(),
  type: z.string(),
});

// Message metadata schema for parsing input
const RoundCalculationMetadataInputSchema = z.object({
  isParticipantTrigger: z.boolean().optional(),
  roundNumber: z.number().optional(),
});

// Message schema for parsing UIMessage input - accepts any message with parts/metadata/role
const RoundCalculationMessageInputSchema = z.object({
  metadata: RoundCalculationMetadataInputSchema.optional(),
  parts: z.array(RoundCalculationPartInputSchema).optional(),
  role: z.string().optional(),
});

/**
 * Safely parse a message (e.g., UIMessage) to extract fields needed for round calculation.
 * This function accepts messages with extra properties (like UIMessage from AI SDK)
 * and extracts only the fields needed for round calculation.
 *
 * @param message - Any message object that may contain parts, metadata, and role
 * @returns Parsed RoundCalculationMessage or throws if validation fails
 */
export function parseRoundCalculationMessage(message: unknown): RoundCalculationMessage {
  const result = RoundCalculationMessageInputSchema.safeParse(message);
  if (!result.success) {
    throw createError.badRequest('Invalid message format for round calculation', {
      errorType: 'validation',
      field: 'message',
    });
  }
  // Transform to strict internal format by picking only needed fields
  const parsed = result.data;
  return {
    metadata: parsed.metadata
      ? {
          isParticipantTrigger: parsed.metadata.isParticipantTrigger,
          roundNumber: parsed.metadata.roundNumber,
        }
      : undefined,
    parts: parsed.parts?.map(p => ({
      text: p.text,
      type: p.type,
    })),
    role: parsed.role,
  };
}

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
  isRegeneration: z.boolean(),
  isTriggerMessage: z.boolean(),
  roundNumber: z.number(),
}).strict();

type RoundNumberResult = z.infer<typeof _RoundNumberResultSchema>;

export async function calculateRoundNumber(
  params: CalculateRoundNumberParams,
): Promise<RoundNumberResult> {
  const { db, message, participantIndex, regenerateRound, threadId } = params;

  if (regenerateRound && participantIndex === 0) {
    return {
      isRegeneration: true,
      isTriggerMessage: false,
      roundNumber: regenerateRound,
    };
  }

  if (participantIndex === 0) {
    const { metadata, parts } = message;
    const isParticipantTrigger = metadata?.isParticipantTrigger === true;
    const frontendRoundNumber = metadata?.roundNumber;
    if (typeof frontendRoundNumber === 'number' && frontendRoundNumber >= 0) {
      return {
        isRegeneration: false,
        isTriggerMessage: isParticipantTrigger,
        roundNumber: frontendRoundNumber,
      };
    }

    const textParts = parts?.filter(isTextPart) ?? [];
    const textContent = textParts
      .map(p => p.text)
      .join('')
      .trim();

    const existingUserMessages = await db.query.chatMessage.findMany({
      columns: { roundNumber: true },
      limit: 1,
      orderBy: desc(tables.chatMessage.roundNumber),
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
    });

    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;

    if ((isParticipantTrigger || textContent.length === 0) && lastRoundNumber >= DEFAULT_ROUND_NUMBER) {
      return {
        isRegeneration: false,
        isTriggerMessage: true,
        roundNumber: lastRoundNumber,
      };
    }

    return {
      isRegeneration: false,
      isTriggerMessage: false,
      roundNumber: calculateNextRound(lastRoundNumber),
    };
  }

  const lastUserMessage = await db.query.chatMessage.findFirst({
    columns: { createdAt: true, roundNumber: true },
    orderBy: desc(tables.chatMessage.createdAt),
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
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
    columns: { createdAt: true, roundNumber: true },
    orderBy: desc(tables.chatMessage.createdAt),
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
      eq(tables.chatMessage.roundNumber, expectedRoundNumber),
    ),
  });

  const roundNumber = assistantInRound
    ? assistantInRound.roundNumber
    : expectedRoundNumber;

  return {
    isRegeneration: false,
    isTriggerMessage: false,
    roundNumber,
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
      columns: { roundNumber: true },
      limit: 1,
      orderBy: desc(tables.chatMessage.roundNumber),
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
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
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      where: eq(tables.chatMessage.threadId, threadId),
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
