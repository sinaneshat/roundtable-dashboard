import type { RouteHandler } from '@hono/zod-openapi';
import { MessagePartTypes } from '@roundtable/shared/enums';
import { and, asc, desc, eq } from 'drizzle-orm';

import { verifyThreadOwnership } from '@/common/permissions';
import { createHandler, IdParamSchema, Responses, ThreadRoundParamSchema } from '@/core';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import type { ExtendedFilePart } from '@/lib/schemas';
import { ExtendedFilePartSchema } from '@/lib/schemas';
import { generateBatchSignedPaths } from '@/services/uploads';
import type { BatchSignOptions } from '@/services/uploads/signed-url.service';
import type { ApiEnv } from '@/types';

import type {
  getThreadChangelogRoute,
  getThreadMessagesRoute,
  getThreadRoundChangelogRoute,
} from '../route';

export const getThreadMessagesHandler: RouteHandler<typeof getThreadMessagesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadMessages',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);

    // Note: Relational queries (db.query.*) don't support $withCache
    // Use select builder pattern for cacheable queries
    const messages = await db.query.chatMessage.findMany({
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
      where: eq(tables.chatMessage.threadId, threadId),
      with: {
        messageUploads: {
          orderBy: [asc(tables.messageUpload.displayOrder)],
          with: {
            upload: true,
          },
        },
      },
    });

    const baseUrl = new URL(c.req.url).origin;

    // ✅ PERF: Batch sign all attachments with single key import
    const allUploads: BatchSignOptions[] = messages.flatMap(msg =>
      (msg.messageUploads || []).map(mu => ({
        expirationMs: 60 * 60 * 1000,
        threadId,
        uploadId: mu.upload.id,
        userId: user.id,
      })),
    );
    const signedPaths = await generateBatchSignedPaths(c, allUploads);

    const messagesWithAttachments = messages.map((message) => {
      const attachmentParts = (message.messageUploads || []).map((mu) => {
        const signedPath = signedPaths.get(mu.upload.id);
        if (!signedPath) {
          throw new Error(`Missing signed path for upload ${mu.upload.id}`);
        }

        const filePartData: ExtendedFilePart = {
          filename: mu.upload.filename,
          mediaType: mu.upload.mimeType,
          type: MessagePartTypes.FILE,
          uploadId: mu.upload.id,
          url: `${baseUrl}${signedPath}`,
        };

        const parseResult = ExtendedFilePartSchema.safeParse(filePartData);
        if (!parseResult.success) {
          throw new Error(`Invalid file part for upload ${mu.upload.id}: ${parseResult.error.message}`);
        }

        return parseResult.data;
      });

      const existingParts = message.parts || [];
      const nonFileParts = existingParts.filter(
        (p): p is Exclude<typeof p, { type: 'file' }> =>
          typeof p === 'object' && p !== null && 'type' in p && p.type !== MessagePartTypes.FILE,
      );
      const combinedParts = [...nonFileParts, ...attachmentParts];

      const { messageUploads: _, ...messageWithoutUploads } = message;
      return {
        ...messageWithoutUploads,
        parts: combinedParts,
      };
    });

    return Responses.collection(c, messagesWithAttachments);
  },
);
export const getThreadChangelogHandler: RouteHandler<typeof getThreadChangelogRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadChangelog',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);

    // ✅ PERF: KV cache for read-heavy changelog data (10 min TTL)
    // Changelog changes infrequently - only when thread config is modified
    const changelog = await db
      .select()
      .from(tables.chatThreadChangelog)
      .where(eq(tables.chatThreadChangelog.threadId, threadId))
      .orderBy(desc(tables.chatThreadChangelog.createdAt))
      .$withCache({
        config: { ex: 600 },
        tag: `changelog:${threadId}`,
      });

    return Responses.collection(c, changelog);
  },
);

/**
 * Get changelog for a specific round
 *
 * ✅ PERF OPTIMIZATION: Returns only changelog entries for a specific round
 * Used for incremental changelog updates after config changes mid-conversation
 * Much more efficient than fetching all changelogs
 */
export const getThreadRoundChangelogHandler: RouteHandler<typeof getThreadRoundChangelogRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadRoundChangelog',
    validateParams: ThreadRoundParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { roundNumber: roundNumberStr, threadId } = c.validated.params;
    const roundNumber = Number.parseInt(roundNumberStr, 10);
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);

    // ✅ PERF: KV cache for round-specific changelog (15 min TTL)
    // Round changelogs are immutable once round completes
    const changelog = await db
      .select()
      .from(tables.chatThreadChangelog)
      .where(
        and(
          eq(tables.chatThreadChangelog.threadId, threadId),
          eq(tables.chatThreadChangelog.roundNumber, roundNumber),
        ),
      )
      .orderBy(desc(tables.chatThreadChangelog.createdAt))
      .$withCache({
        config: { ex: 900 },
        tag: `changelog:${threadId}:round:${roundNumber}`,
      });

    return Responses.collection(c, changelog);
  },
);
