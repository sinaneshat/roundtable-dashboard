import type { RouteHandler } from '@hono/zod-openapi';
import { asc, desc, eq } from 'drizzle-orm';

import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses } from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

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

    // Transform messages to include upload attachments as file parts
    const messagesWithAttachments = messages.map((message) => {
      const attachmentParts = message.messageUploads?.map(mu => ({
        type: 'file' as const,
        url: `/api/v1/uploads/${mu.upload.id}/download`,
        filename: mu.upload.filename,
        mediaType: mu.upload.mimeType,
      })) || [];

      // Add attachment parts after text parts
      const existingParts = message.parts || [];
      const combinedParts = [...existingParts, ...attachmentParts];

      // Return message without the messageUploads relation (transformed to parts)
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
