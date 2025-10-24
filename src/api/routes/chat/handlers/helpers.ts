/**
 * Shared helper functions for chat handlers
 *
 * Following backend patterns: Reusable utilities for handler operations
 */

import type { UIMessage } from 'ai';
import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

/**
 * ✅ AI SDK V5 HELPER: Convert database messages to UIMessage format
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 *
 * Used by "send only last message" pattern to load previous messages from DB.
 * Converts database chat_message table rows to AI SDK UIMessage format.
 */
export function chatMessagesToUIMessages(
  dbMessages: Array<typeof tables.chatMessage.$inferSelect>,
): UIMessage[] {
  return dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: msg.parts as unknown as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
    ...(msg.metadata && { metadata: msg.metadata }),
    createdAt: msg.createdAt,
  })) as UIMessage[];
}

/**
 * Verify thread exists and user owns it
 * Reusable validation pattern used across multiple handlers
 *
 * Overload 1: Without participants
 */
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<typeof tables.chatThread.$inferSelect>;

/**
 * Overload 2: With participants
 */
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options: { includeParticipants: true },
): Promise<typeof tables.chatThread.$inferSelect & {
  participants: Array<typeof tables.chatParticipant.$inferSelect>;
}>;

/**
 * Implementation
 */
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options?: { includeParticipants?: boolean },
) {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: options?.includeParticipants
      ? {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
          },
        }
      : undefined,
  });

  if (!thread) {
    throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId));
  }

  if (thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to access this thread',
      ErrorContextBuilders.authorization('thread', threadId),
    );
  }

  if (options?.includeParticipants) {
    const threadWithParticipants = thread as typeof thread & {
      participants: Array<typeof tables.chatParticipant.$inferSelect>;
    };

    if (threadWithParticipants.participants.length === 0) {
      throw createError.badRequest(
        'No enabled participants in this thread. Please add or enable at least one AI model to continue the conversation.',
        { errorType: 'validation' },
      );
    }
  }

  return thread;
}
