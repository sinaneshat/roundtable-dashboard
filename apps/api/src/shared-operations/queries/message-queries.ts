/**
 * Message Queries
 *
 * Reusable DB operations for chat messages.
 * Provides typed, consistent access patterns.
 */

import { MessageRoles } from '@roundtable/shared/enums';
import { and, desc, eq } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

// ============================================================================
// Message Lookup Operations
// ============================================================================

/**
 * Get latest user message in thread
 */
export async function getLatestUserMessage(
  threadId: string,
  db: DbInstance,
) {
  return db.query.chatMessage.findFirst({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
    orderBy: [desc(tables.chatMessage.roundNumber), desc(tables.chatMessage.createdAt)],
    columns: {
      id: true,
      parts: true,
      roundNumber: true,
    },
  });
}

/**
 * Get messages by round
 */
export async function getMessagesByRound(
  threadId: string,
  roundNumber: number,
  db: DbInstance,
) {
  return db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
    ),
    orderBy: [desc(tables.chatMessage.createdAt)],
    columns: {
      id: true,
      role: true,
      parts: true,
      participantId: true,
      metadata: true,
    },
  });
}

/**
 * Get user message text for a round
 */
export async function getUserMessageTextForRound(
  threadId: string,
  roundNumber: number,
  db: DbInstance,
): Promise<string | null> {
  const message = await db.query.chatMessage.findFirst({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.USER),
    ),
    columns: {
      parts: true,
    },
  });

  if (!message)
    return null;

  return extractTextFromParts(message.parts);
}

/**
 * Get assistant messages for a round
 */
export async function getAssistantMessagesForRound(
  threadId: string,
  roundNumber: number,
  db: DbInstance,
) {
  return db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, threadId),
      eq(tables.chatMessage.roundNumber, roundNumber),
      eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
    ),
    columns: {
      id: true,
      participantId: true,
      parts: true,
      metadata: true,
    },
  });
}

/**
 * Get moderator message by round
 */
export async function getModeratorMessage(
  threadId: string,
  roundNumber: number,
  db: DbInstance,
) {
  const moderatorMessageId = `${threadId}_r${roundNumber}_moderator`;

  return db.query.chatMessage.findFirst({
    where: eq(tables.chatMessage.id, moderatorMessageId),
    columns: {
      id: true,
      parts: true,
      metadata: true,
    },
  });
}
