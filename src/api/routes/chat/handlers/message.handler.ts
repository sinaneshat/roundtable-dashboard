import type { RouteHandler } from '@hono/zod-openapi';
import { asc, desc, eq } from 'drizzle-orm';

import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses } from '@/api/core';
import { MessagePartTypes } from '@/api/core/enums';
import { IdParamSchema } from '@/api/core/schemas';
import { generateSignedDownloadPath } from '@/api/services/signed-url.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';

import type {
  getThreadChangelogRoute,
  getThreadMessagesRoute,
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

    // Direct database query for thread messages with uploads
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

    // Transform messages to include upload attachments as file parts with signed URLs
    const baseUrl = new URL(c.req.url).origin;
    const messagesWithAttachments = await Promise.all(
      messages.map(async (message) => {
        // Generate signed URLs for each attachment
        const attachmentParts: ExtendedFilePart[] = await Promise.all(
          (message.messageUploads || []).map(async (mu): Promise<ExtendedFilePart> => {
            const signedPath = await generateSignedDownloadPath(c, {
              uploadId: mu.upload.id,
              userId: user.id,
              threadId,
              expirationMs: 60 * 60 * 1000, // 1 hour
            });

            return {
              type: MessagePartTypes.FILE,
              url: `${baseUrl}${signedPath}`,
              filename: mu.upload.filename,
              mediaType: mu.upload.mimeType,
              uploadId: mu.upload.id, // ✅ ExtendedFilePart: uploadId for participant 1+ file loading
            };
          }),
        );

        // Filter out existing file parts to prevent duplication, then add new signed ones
        const existingParts = message.parts || [];
        const nonFileParts = existingParts.filter(p => p.type !== MessagePartTypes.FILE);
        const combinedParts = [...nonFileParts, ...attachmentParts];

        // Return message without the messageUploads relation (transformed to parts)
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
