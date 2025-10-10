import { and, desc, eq } from 'drizzle-orm';

import { apiLogger } from '@/api/middleware/hono-logger';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { MessageMetadata, StreamingVariant } from '@/lib/schemas/message-metadata';

/**
 * Save assistant message with variant support for regeneration feature
 *
 * ✅ UPDATED: Variant tracking moved to metadata (no more variant columns)
 *
 * This service handles message saving with metadata-based variant tracking:
 * - Stores variant data in message metadata
 * - Generates variantGroupId for grouping related variants
 * - Tracks variant index and active status in metadata
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

  apiLogger.info('[Variant Service] Starting saveAssistantMessageWithVariants', {
    messageId: params.messageId,
    threadId: params.threadId,
    participantId: params.participantId,
  });

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

  apiLogger.info('[Variant Service] Parent user message lookup', {
    messageId: params.messageId,
    parentFound: !!parentUserMessage,
    parentId: parentUserMessage?.id,
    parentContent: parentUserMessage?.content.substring(0, 50),
  });

  // ✅ NEW: Query existing variants using metadata filter
  // Look for messages with the same participantId and parentMessageId in metadata
  const existingMessages = parentUserMessage
    ? await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, params.threadId),
        eq(tables.chatMessage.role, 'assistant'),
        eq(tables.chatMessage.participantId, params.participantId),
      ),
    })
    : [];

  // ✅ Filter variants by metadata.parentMessageId using proper MessageMetadata type
  const existingVariants = existingMessages.filter((msg) => {
    const metadata = msg.metadata as MessageMetadata;
    return metadata?.parentMessageId === parentUserMessage?.id;
  });

  apiLogger.info('[Variant Service] Existing variants query', {
    messageId: params.messageId,
    parentMessageId: parentUserMessage?.id,
    participantId: params.participantId,
    existingVariantsCount: existingVariants.length,
    existingVariantIds: existingVariants.map(v => v.id),
  });

  // ✅ Calculate variant index from existing variants
  const variantIndex = existingVariants.length;

  // ✅ Generate or reuse variantGroupId using proper MessageMetadata type
  const variantGroupId = existingVariants.length > 0
    ? (existingVariants[0]?.metadata as MessageMetadata)?.variantGroupId
    : `variant-${parentUserMessage?.id || 'initial'}-${params.participantId}`;

  apiLogger.info('[Variant Service] Calculated variant metadata', {
    messageId: params.messageId,
    variantIndex,
    variantGroupId,
    isRegeneration: variantIndex > 0,
  });

  // ✅ CRITICAL: Mark all existing variants as inactive before creating new variant
  // This ensures only the latest variant is active on initial load
  if (existingVariants.length > 0) {
    apiLogger.info('[Variant Service] Marking existing variants as inactive', {
      messageId: params.messageId,
      variantsToDeactivate: existingVariants.length,
      variantIds: existingVariants.map(v => v.id),
    });

    // Update each existing variant's metadata to set isActiveVariant: false
    for (const existingVariant of existingVariants) {
      const existingMetadata = existingVariant.metadata as MessageMetadata;
      const updatedMetadata = {
        ...(existingMetadata || {}),
        isActiveVariant: false, // ✅ Mark as inactive
      };

      await db
        .update(tables.chatMessage)
        .set({
          metadata: updatedMetadata as typeof tables.chatMessage.$inferInsert['metadata'],
        })
        .where(eq(tables.chatMessage.id, existingVariant.id));
    }

    apiLogger.info('[Variant Service] Successfully deactivated existing variants', {
      messageId: params.messageId,
      deactivatedCount: existingVariants.length,
    });
  }

  // ✅ Build metadata with variant tracking fields
  // Cast to MessageMetadata to ensure type safety during construction
  const baseMetadata = params.metadata as MessageMetadata;
  const messageMetadata = {
    ...(baseMetadata || {}),
    variantIndex,
    isActiveVariant: true, // ✅ New variant is always active
    variantGroupId: variantGroupId || `variant-${parentUserMessage?.id || 'initial'}-${params.participantId}`,
    parentMessageId: parentUserMessage?.id || null,
    roundId: baseMetadata?.roundId,
  };

  // ✅ Save message with metadata-based variant tracking
  apiLogger.info('[Variant Service] Attempting to insert message', {
    messageId: params.messageId,
    threadId: params.threadId,
    participantId: params.participantId,
    variantIndex,
    variantGroupId,
  });

  const [savedMessage] = await db
    .insert(tables.chatMessage)
    .values({
      id: params.messageId,
      threadId: params.threadId,
      participantId: params.participantId,
      role: 'assistant',
      content: params.content,
      // ✅ Type cast to match database schema's metadata type
      metadata: messageMetadata as typeof tables.chatMessage.$inferInsert['metadata'],
      createdAt: params.createdAt,
    })
    .onConflictDoNothing()
    .returning();

  apiLogger.info('[Variant Service] Message insert result', {
    messageId: params.messageId,
    savedMessageId: savedMessage?.id,
    success: !!savedMessage,
    wasConflict: !savedMessage,
  });

  return savedMessage;
}

/**
 * Get all variants for a message (for including in stream metadata)
 *
 * ✅ UPDATED: Fetches variants using metadata-based tracking
 *
 * Returns all variant messages linked to the same parent user message and participant.
 * This is used to include variant data in the SSE stream, eliminating the need
 * for separate API calls to fetch variants.
 *
 * @param params - Query parameters
 * @param params.threadId - Thread identifier
 * @param params.parentMessageId - Parent user message ID (null for first message)
 * @param params.participantId - Participant identifier
 * @returns Array of variant messages with minimal data for streaming
 */
export async function getMessageVariantsForStream(params: {
  threadId: string;
  parentMessageId: string | null;
  participantId: string;
}): Promise<StreamingVariant[]> {
  const db = await getDbAsync();

  apiLogger.info('[Variant Service] Fetching variants for stream', {
    threadId: params.threadId,
    parentMessageId: params.parentMessageId,
    participantId: params.participantId,
  });

  if (!params.parentMessageId) {
    // No parent message - this shouldn't happen for normal messages
    apiLogger.warn('[Variant Service] No parent message ID - returning empty variants', params);
    return [];
  }

  // ✅ Query all messages for this thread and participant
  const allMessages = await db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, params.threadId),
      eq(tables.chatMessage.role, 'assistant'),
      eq(tables.chatMessage.participantId, params.participantId),
    ),
    orderBy: [tables.chatMessage.createdAt],
  });

  // ✅ Filter by metadata.parentMessageId using proper MessageMetadata type
  const variants = allMessages.filter((msg) => {
    const metadata = msg.metadata as MessageMetadata;
    return metadata?.parentMessageId === params.parentMessageId;
  });

  // ✅ Sort by variantIndex from metadata using proper MessageMetadata type
  variants.sort((a, b) => {
    const aMetadata = a.metadata as MessageMetadata;
    const bMetadata = b.metadata as MessageMetadata;
    const aIndex = aMetadata?.variantIndex || 0;
    const bIndex = bMetadata?.variantIndex || 0;
    return aIndex - bIndex;
  });

  apiLogger.info('[Variant Service] Variants fetched', {
    threadId: params.threadId,
    variantCount: variants.length,
    variantIds: variants.map(v => v.id),
  });

  // ✅ Format for streaming with full message data for client-side switching
  return variants.map((v) => {
    const metadata = v.metadata as MessageMetadata;
    return {
      id: v.id,
      content: v.content,
      variantIndex: metadata?.variantIndex || 0,
      isActive: metadata?.isActiveVariant || false,
      createdAt: v.createdAt.toISOString(),
      metadata: v.metadata,
      participantId: v.participantId, // ✅ Required for identifying which participant created this variant
      reasoning: v.reasoning || undefined, // ✅ Optional reasoning/chain-of-thought data
    };
  });
}
