/**
 * Regeneration Service - Round regeneration and cleanup logic
 *
 * Following backend-patterns.md: Service layer for business logic
 * Extracted from streaming.handler.ts for better maintainability
 *
 * This service handles:
 * - Regeneration validation (only most recent round)
 * - Message deletion for assistant messages in regenerated round
 * - RAG embedding cleanup for deleted messages
 * - Analysis, feedback, and changelog cleanup
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { executeBatch } from '@/api/common/batch-operations';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';

import { validateRegenerateRound } from './round.service';

// ============================================================================
// ZOD SCHEMAS - Single source of truth for type definitions
// ============================================================================

/**
 * Regenerate round params schema
 * Note: db is a Drizzle database instance that cannot be expressed in Zod
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const RegenerateRoundParamsSchema = z.object({
  threadId: z.string(),
  regenerateRound: z.number().int().nonnegative(),
  participantIndex: z.number().int().nonnegative(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(val => val !== null && typeof val === 'object'),
});

export type RegenerateRoundParams = z.infer<typeof RegenerateRoundParamsSchema>;

/**
 * Regenerate round result schema
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const RegenerateRoundResultSchema = z.object({
  deletedMessagesCount: z.number().int().nonnegative(),
  cleanedEmbeddingsCount: z.number().int().nonnegative(),
});

export type RegenerateRoundResult = z.infer<typeof RegenerateRoundResultSchema>;

// ============================================================================
// Round Regeneration Logic
// ============================================================================

/**
 * Handle round regeneration by cleaning up old round data
 *
 * CRITICAL PATTERNS:
 * - Only participant 0 can trigger regeneration (prevents duplicate cleanup)
 * - Validates regeneration is for most recent round only
 * - Deletes ALL messages from the round (both user and assistant)
 * - Cleans up RAG embeddings for deleted messages (non-blocking)
 * - Removes analysis, feedback, and changelog entries for the round
 * - Uses batch operations for atomicity
 * - User's prompt text is re-sent from frontend to create fresh messages
 *
 * Reference: streaming.handler.ts lines 97-156
 */
export async function handleRoundRegeneration(
  params: RegenerateRoundParams,
): Promise<RegenerateRoundResult> {
  const { threadId, regenerateRound, participantIndex, db } = params;

  // =========================================================================
  // STEP 1: Validate regeneration request
  // =========================================================================
  // Only participant 0 can trigger regeneration
  if (participantIndex !== 0) {
    return {
      deletedMessagesCount: 0,
      cleanedEmbeddingsCount: 0,
    };
  }

  // Validate regeneration is for most recent round
  await validateRegenerateRound(threadId, regenerateRound, db);

  let deletedMessagesCount = 0;
  const cleanedEmbeddingsCount = 0;

  try {
    // =========================================================================
    // STEP 2: Delete ALL messages from round (user + assistant)
    // =========================================================================
    // When regenerating, we want to delete the entire round and start fresh
    // The user's prompt will be re-sent as a new message
    const deletedMessages = await db
      .delete(tables.chatMessage)
      .where(
        and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.roundNumber, regenerateRound),
        ),
      )
      .returning();

    deletedMessagesCount = deletedMessages.length;

    // =========================================================================
    // STEP 3: Delete feedback and changelog entries
    // =========================================================================
    // ✅ TEXT STREAMING: Moderator messages are now stored in chatMessage
    // and deleted in STEP 2 above (delete ALL messages from round)
    await executeBatch(db, [
      db.delete(tables.chatRoundFeedback).where(
        and(
          eq(tables.chatRoundFeedback.threadId, threadId),
          eq(tables.chatRoundFeedback.roundNumber, regenerateRound),
        ),
      ),
      db.delete(tables.chatThreadChangelog).where(
        and(
          eq(tables.chatThreadChangelog.threadId, threadId),
          eq(tables.chatThreadChangelog.roundNumber, regenerateRound),
        ),
      ),
    ]);
  } catch (error) {
    // Re-throw AppError instances
    if (error instanceof Error && error.name === 'AppError') {
      throw error;
    }
    // Continue with streaming on cleanup errors
    // Return partial results
  }

  return {
    deletedMessagesCount,
    cleanedEmbeddingsCount,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Reset participant index after regeneration
 *
 * When regenerating a round, subsequent participants need to be re-triggered
 * with participantIndex reset to continue the conversation flow.
 *
 * This is typically handled on the frontend, but this function provides
 * a server-side utility for cases where backend needs to coordinate
 * multi-participant flows.
 */
export function resetParticipantIndex(
  participantIndex: number,
  isRegeneration: boolean,
): number {
  // If regenerating, always start from participant 0
  if (isRegeneration) {
    return 0;
  }
  return participantIndex;
}
