/**
 * Message Handlers - Operations for chat messages and changelog
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Extracted from monolithic handler.ts for better maintainability
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { asc, desc, eq } from 'drizzle-orm';

import { createHandler, Responses } from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  getThreadChangelogRoute,
  getThreadMessagesRoute,
} from '../route';
import { verifyThreadOwnership } from './helpers';

// ============================================================================
// Message & Changelog Handlers
// ============================================================================

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

    // Verify thread ownership
    await verifyThreadOwnership(threadId, user.id, db);

    // Fetch all messages
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });

    return Responses.collection(c, messages);
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

    // Verify thread ownership
    await verifyThreadOwnership(threadId, user.id, db);

    // Fetch changelog entries
    const changelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, threadId),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });

    return Responses.collection(c, changelog);
  },
);
