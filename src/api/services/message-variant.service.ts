import { and, desc, eq } from 'drizzle-orm';

import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

/**
 * Save assistant message with variant support for regeneration feature
 *
 * This service handles the complexity of message variant tracking:
 * - Links assistant messages to their parent user message
 * - Tracks variant index (0 for original, 1+ for regenerations)
 * - Marks active variant (only one variant is active at a time)
 * - Idempotent saves to prevent duplicates
 *
 * @param params - Message save parameters
 * @param params.messageId - Unique message identifier
 * @param params.threadId - Thread identifier
 * @param params.participantId - Participant identifier
 * @param params.content - Message content text
 * @param params.metadata - Message metadata object
 * @param params.createdAt - Message creation timestamp
 * @returns The saved message
 */
export async function saveAssistantMessageWithVariants(params: {
  messageId: string;
  threadId: string;
  participantId: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}) {
  const db = await getDbAsync();

  // Find the parent user message (last user message in conversation)
  const userMessages = await db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, params.threadId),
      eq(tables.chatMessage.role, 'user'),
    ),
    orderBy: [desc(tables.chatMessage.createdAt)],
    limit: 1,
  });

  const parentUserMessage = userMessages[0];

  // Check for existing assistant message variants with same parent and participant
  const existingVariants = parentUserMessage
    ? await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, params.threadId),
        eq(tables.chatMessage.role, 'assistant'),
        eq(tables.chatMessage.parentMessageId, parentUserMessage.id),
        eq(tables.chatMessage.participantId, params.participantId),
      ),
    })
    : [];

  // Calculate variant index (0 for first message, 1+ for regenerations)
  const variantIndex = existingVariants.length;

  // If this is a regeneration (variantIndex > 0), mark all previous variants as inactive
  if (variantIndex > 0 && parentUserMessage) {
    await db
      .update(tables.chatMessage)
      .set({ isActiveVariant: false })
      .where(
        and(
          eq(tables.chatMessage.threadId, params.threadId),
          eq(tables.chatMessage.parentMessageId, parentUserMessage.id),
          eq(tables.chatMessage.participantId, params.participantId),
        ),
      );
  }

  // Save message with variant tracking (idempotent - prevents duplicate inserts)
  const [savedMessage] = await db
    .insert(tables.chatMessage)
    .values({
      id: params.messageId,
      threadId: params.threadId,
      participantId: params.participantId,
      role: 'assistant',
      content: params.content,
      parentMessageId: parentUserMessage?.id || null, // Link to parent user message
      variantIndex, // Track which variant this is (0, 1, 2, ...)
      isActiveVariant: true, // This is now the active variant
      metadata: params.metadata,
      createdAt: params.createdAt,
    })
    .onConflictDoNothing()
    .returning();

  return savedMessage;
}
