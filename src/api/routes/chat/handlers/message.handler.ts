import type { RouteHandler } from '@hono/zod-openapi';
import { and, asc, desc, eq } from 'drizzle-orm';

import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, IdParamSchema, Responses, ThreadRoundParamSchema } from '@/api/core';
import { MessagePartTypes } from '@/api/core/enums';
import { generateSignedDownloadPath } from '@/api/services/uploads';
import type { ApiEnv } from '@/api/types';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { ExtendedFilePartSchema } from '@/lib/schemas/message-schemas';

import type {
  getThreadChangelogRoute,
  getThreadMessagesRoute,
  getThreadRoundChangelogRoute,
} from '../route';

export const getThreadMessagesHandler: RouteHandler<typeof getThreadMessagesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadMessages',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);

    // Note: Relational queries (db.query.*) don't support $withCache
    // Use select builder pattern for cacheable queries
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
      with: {
        messageUploads: {
          with: {
            upload: true,
          },
          orderBy: [asc(tables.messageUpload.displayOrder)],
        },
      },
    });

    const baseUrl = new URL(c.req.url).origin;
    const messagesWithAttachments = await Promise.all(
      messages.map(async (message) => {
        const attachmentParts = await Promise.all(
          (message.messageUploads || []).map(async (mu) => {
            const signedPath = await generateSignedDownloadPath(c, {
              uploadId: mu.upload.id,
              userId: user.id,
              threadId,
              expirationMs: 60 * 60 * 1000,
            });

            const filePartData: ExtendedFilePart = {
              type: MessagePartTypes.FILE,
              url: `${baseUrl}${signedPath}`,
              filename: mu.upload.filename,
              mediaType: mu.upload.mimeType,
              uploadId: mu.upload.id,
            };

            const parseResult = ExtendedFilePartSchema.safeParse(filePartData);
            if (!parseResult.success) {
              throw new Error(
                `Invalid file part for upload ${mu.upload.id}: ${parseResult.error.message}`,
              );
            }

            return parseResult.data;
          }),
        );

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
      }),
    );

    return Responses.collection(c, messagesWithAttachments);
  },
);
export const getThreadChangelogHandler: RouteHandler<typeof getThreadChangelogRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadChangelog',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);
    const changelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, threadId),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
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
    validateParams: ThreadRoundParamSchema,
    operationName: 'getThreadRoundChangelog',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber: roundNumberStr } = c.validated.params;
    const roundNumber = Number.parseInt(roundNumberStr, 10);
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);

    const changelog = await db.query.chatThreadChangelog.findMany({
      where: and(
        eq(tables.chatThreadChangelog.threadId, threadId),
        eq(tables.chatThreadChangelog.roundNumber, roundNumber),
      ),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });

    return Responses.collection(c, changelog);
  },
);
