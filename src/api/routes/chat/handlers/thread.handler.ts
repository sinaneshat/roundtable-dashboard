import type { RouteHandler } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import Fuse from 'fuse.js';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { invalidateThreadCache } from '@/api/common/cache-utils';
import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createHandlerWithBatch,
  createTimestampCursor,
  getCursorOrderBy,
  Responses,
} from '@/api/core';
import type { ChatMode, ThreadStatus } from '@/api/core/enums';
import { ChangelogTypes, DEFAULT_CHAT_MODE, ThreadStatusSchema } from '@/api/core/enums';
import { IdParamSchema, ThreadSlugParamSchema } from '@/api/core/schemas';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  SUBSCRIPTION_TIER_NAMES,
} from '@/api/services/product-logic.service';
import { ragService } from '@/api/services/rag.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import { generateTitleFromMessage } from '@/api/services/title-generator.service';
import {
  enforceMessageQuota,
  enforceThreadQuota,
  getUserTier,
  incrementMessageUsage,
  incrementThreadUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  createThreadRoute,
  deleteThreadRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadRoute,
  listThreadsRoute,
  updateThreadRoute,
} from '../route';
import type { ChangeData } from '../schema';
import {
  CreateThreadRequestSchema,
  ThreadListQuerySchema,
  UpdateThreadRequestSchema,
} from '../schema';

export const listThreadsHandler: RouteHandler<typeof listThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ThreadListQuerySchema,
    operationName: 'listThreads',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();
    const filters: SQL[] = [
      eq(tables.chatThread.userId, user.id),
      ne(tables.chatThread.status, ThreadStatusSchema.enum.deleted),
    ];
    const fetchLimit = query.search ? 200 : (query.limit + 1);
    const allThreads = await db.query.chatThread.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.chatThread.updatedAt, 'desc'),
      limit: fetchLimit,
    });
    let threads = allThreads;
    if (query.search && query.search.trim().length > 0) {
      const fuse = new Fuse(allThreads, {
        keys: ['title', 'slug'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeScore: false,
      });
      const searchResults = fuse.search(query.search.trim());
      threads = searchResults.map(result => result.item);
      threads = threads.slice(0, query.limit + 1);
    }
    const { items, pagination } = applyCursorPagination(
      threads,
      query.limit,
      thread => createTimestampCursor(thread.updatedAt),
    );
    return Responses.cursorPaginated(c, items, pagination);
  },
);
export const createThreadHandler: RouteHandler<typeof createThreadRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: CreateThreadRequestSchema,
    operationName: 'createThread',
  },
  async (c, batch) => {
    const { user } = c.auth();
    await enforceThreadQuota(user.id);
    const body = c.validated.body;
    const db = batch.db;
    const userTier = await getUserTier(user.id);
    for (const participant of body.participants) {
      const model = await openRouterModelsService.getModelById(participant.modelId);
      if (!model) {
        throw createError.badRequest(
          `Model "${participant.modelId}" not found`,
          {
            errorType: 'validation',
            field: 'participants.modelId',
          },
        );
      }
      const canAccess = canAccessModelByPricing(userTier, model);
      if (!canAccess) {
        const requiredTier = getRequiredTierForModel(model);
        throw createError.unauthorized(
          `Your ${SUBSCRIPTION_TIER_NAMES[userTier]} plan does not include access to ${model.name}. Upgrade to ${SUBSCRIPTION_TIER_NAMES[requiredTier]} or higher to use this model.`,
          {
            errorType: 'authorization',
            resource: 'model',
            resourceId: participant.modelId,
          },
        );
      }
    }
    const tempTitle = 'New Chat';
    const tempSlug = await generateUniqueSlug(body.firstMessage);
    const threadId = ulid();
    const now = new Date();
    const [thread] = await db
      .insert(tables.chatThread)
      .values({
        id: threadId,
        userId: user.id,
        title: tempTitle,
        slug: tempSlug,
        mode: (body.mode || DEFAULT_CHAT_MODE) as ChatMode,
        status: ThreadStatusSchema.enum.active,
        isFavorite: false,
        isPublic: false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .returning();
    const customRoleIds = body.participants
      .map(p => p.customRoleId)
      .filter((id): id is string => !!id);
    const customRolesMap = new Map<string, typeof tables.chatCustomRole.$inferSelect>();
    if (customRoleIds.length > 0) {
      const customRoles = await db.query.chatCustomRole.findMany({
        where: and(
          eq(tables.chatCustomRole.userId, user.id),
          inArray(tables.chatCustomRole.id, customRoleIds),
        ),
      });
      for (const role of customRoles) {
        customRolesMap.set(role.id, role);
      }
      for (const roleId of customRoleIds) {
        if (!customRolesMap.has(roleId)) {
          throw createError.unauthorized(
            'Not authorized to use this custom role',
            ErrorContextBuilders.authorization('custom_role', roleId),
          );
        }
      }
    }
    const participantValues = body.participants.map((p, index) => {
      let systemPrompt = p.systemPrompt;
      if (p.customRoleId && !systemPrompt) {
        const customRole = customRolesMap.get(p.customRoleId);
        if (customRole) {
          systemPrompt = customRole.systemPrompt;
        }
      }
      const participantId = ulid();
      const hasSettings = systemPrompt || p.temperature !== undefined || p.maxTokens !== undefined;
      const settingsValue = hasSettings
        ? {
            systemPrompt,
            temperature: p.temperature,
            maxTokens: p.maxTokens,
          }
        : undefined;
      return {
        id: participantId,
        threadId,
        modelId: p.modelId,
        customRoleId: p.customRoleId,
        role: p.role,
        priority: index,
        isEnabled: true,
        ...(settingsValue !== undefined && { settings: settingsValue }),
        createdAt: now,
        updatedAt: now,
      };
    });
    const participants = await db
      .insert(tables.chatParticipant)
      .values(participantValues)
      .returning();
    if (participants.length === 0) {
      throw createError.badRequest(
        'No participants were created for this thread. Please ensure at least one AI model is selected.',
        { errorType: 'validation' },
      );
    }
    const enabledCount = participants.filter(p => p && p.isEnabled).length;
    if (enabledCount === 0) {
      throw createError.badRequest(
        'No enabled participants in thread. At least one participant must be enabled to start a conversation.',
        { errorType: 'validation' },
      );
    }
    await enforceMessageQuota(user.id);
    const [firstMessage] = await db
      .insert(tables.chatMessage)
      .values({
        id: ulid(),
        threadId,
        role: 'user' as const,
        parts: [{ type: 'text', text: body.firstMessage }],
        roundNumber: 1,
        createdAt: now,
      })
      .returning();
    await incrementMessageUsage(user.id, 1);
    await incrementThreadUsage(user.id);
    await invalidateThreadCache(db, user.id);
    (async () => {
      try {
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env);
        await db
          .update(tables.chatThread)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));
        await invalidateThreadCache(db, user.id);
      } catch {
      }
    })().catch(() => {
    });
    return Responses.ok(c, {
      thread,
      participants,
      messages: [firstMessage],
      changelog: [],
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
    });
  },
);
export const getThreadHandler: RouteHandler<typeof getThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session-optional',
    validateParams: IdParamSchema,
    operationName: 'getThread',
  },
  async (c) => {
    const user = c.get('user');
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
    });
    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', id));
    }
    if (!thread.isPublic) {
      if (!user) {
        throw createError.unauthenticated(
          'Authentication required to access private thread',
          ErrorContextBuilders.auth(),
        );
      }
      if (thread.userId !== user.id) {
        throw createError.unauthorized(
          'Not authorized to access this thread',
          ErrorContextBuilders.authorization('thread', id),
        );
      }
    }
    const participants = await db.query.chatParticipant.findMany({
      where: and(
        eq(tables.chatParticipant.threadId, id),
        eq(tables.chatParticipant.isEnabled, true),
      ),
      orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
    });
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });
    const changelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, id),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });
    const threadOwner = await db.query.user.findFirst({
      where: eq(tables.user.id, thread.userId),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    });
    if (!threadOwner) {
      throw createError.internal(
        'Thread owner not found',
        ErrorContextBuilders.resourceNotFound('user', thread.userId),
      );
    }
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      changelog,
      user: {
        id: threadOwner.id,
        name: threadOwner.name,
        image: threadOwner.image,
      },
    });
  },
);
export const updateThreadHandler: RouteHandler<typeof updateThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateThreadRequestSchema,
    operationName: 'updateThread',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();
    const thread = await verifyThreadOwnership(id, user.id, db);
    const now = new Date();
    if (body.participants !== undefined) {
      const currentParticipants = await db.query.chatParticipant.findMany({
        where: eq(tables.chatParticipant.threadId, id),
      });
      const currentMap = new Map(currentParticipants.map(p => [p.id, p]));
      const newMap = new Map(body.participants.filter(p => p.id).map(p => [p.id!, p]));
      const participantsToInsert: Array<typeof tables.chatParticipant.$inferInsert> = [];
      const participantsToUpdate: Array<{ id: string; updates: Partial<typeof tables.chatParticipant.$inferSelect> }> = [];
      for (const newP of body.participants) {
        if (!newP.id) {
          const participantId = ulid();
          participantsToInsert.push({
            id: participantId,
            threadId: id,
            modelId: newP.modelId,
            role: newP.role || null,
            customRoleId: newP.customRoleId || null,
            priority: newP.priority,
            isEnabled: newP.isEnabled ?? true,
            settings: null,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          const current = currentMap.get(newP.id);
          if (!current)
            continue;
          const hasChanges
            = current.modelId !== newP.modelId
              || current.role !== (newP.role || null)
              || current.customRoleId !== (newP.customRoleId || null)
              || current.priority !== newP.priority
              || current.isEnabled !== (newP.isEnabled ?? true);
          if (hasChanges) {
            participantsToUpdate.push({
              id: newP.id,
              updates: {
                modelId: newP.modelId,
                role: newP.role || null,
                customRoleId: newP.customRoleId || null,
                priority: newP.priority,
                isEnabled: newP.isEnabled ?? true,
                updatedAt: now,
              },
            });
          }
        }
      }
      const batchOperations: Array<BatchItem<'sqlite'>> = [];
      for (const current of currentParticipants) {
        if (!newMap.has(current.id)) {
          batchOperations.push(
            db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, current.id)),
          );
        }
      }
      if (participantsToInsert.length > 0) {
        batchOperations.push(
          db.insert(tables.chatParticipant).values(participantsToInsert),
        );
      }
      for (const { id: participantId, updates } of participantsToUpdate) {
        batchOperations.push(
          db.update(tables.chatParticipant)
            .set(updates)
            .where(eq(tables.chatParticipant.id, participantId)),
        );
      }
      if (batchOperations.length > 0) {
        await executeBatch(db, batchOperations);
      }

      // ✅ CREATE CHANGELOG ENTRIES for participant changes
      // Need to get latest roundNumber from messages
      const latestMessages = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, id),
        orderBy: [desc(tables.chatMessage.createdAt)],
        limit: 1,
      });

      const currentRoundNumber = latestMessages.length > 0 && latestMessages[0]?.metadata
        ? ((latestMessages[0].metadata as { roundNumber?: number }).roundNumber ?? 1)
        : 1;

      // ✅ CRITICAL FIX: Changelog should appear BEFORE the next round
      // User makes changes AFTER round N completes, so changelog belongs to round N+1
      // This ensures changelog appears between round N and round N+1 messages
      const nextRoundNumber = currentRoundNumber + 1;

      const changelogEntries: Array<{
        id: string;
        threadId: string;
        roundNumber: number;
        changeType: typeof ChangelogTypes[keyof typeof ChangelogTypes];
        changeSummary: string;
        changeData: ChangeData;
        createdAt: Date;
      }> = [];

      // Get current enabled participants before the update (for changelog comparison)
      const oldParticipantsMap = new Map(currentParticipants.map(p => [p.modelId, p]));
      const newParticipantsMap = new Map(body.participants.filter(p => p.isEnabled !== false).map(p => [p.modelId, p]));

      // Helper to extract model name from modelId
      const extractModelName = (modelId: string) => {
        const parts = modelId.split('/');
        return parts[parts.length - 1] || modelId;
      };

      // Detect added participants
      for (const newP of body.participants.filter(p => p.isEnabled !== false)) {
        if (!oldParticipantsMap.has(newP.modelId)) {
          const modelName = extractModelName(newP.modelId);
          const displayName = newP.role || modelName;
          changelogEntries.push({
            id: ulid(),
            threadId: id,
            roundNumber: nextRoundNumber,
            changeType: ChangelogTypes.ADDED,
            changeSummary: `Added ${displayName}`,
            changeData: {
              type: 'participant',
              modelId: newP.modelId,
              role: newP.role || null,
            },
            createdAt: now,
          });
        }
      }

      // Detect removed participants
      for (const current of currentParticipants.filter(p => p.isEnabled)) {
        if (!newParticipantsMap.has(current.modelId)) {
          const modelName = extractModelName(current.modelId);
          const displayName = current.role || modelName;
          changelogEntries.push({
            id: ulid(),
            threadId: id,
            roundNumber: nextRoundNumber,
            changeType: ChangelogTypes.REMOVED,
            changeSummary: `Removed ${displayName}`,
            changeData: {
              type: 'participant',
              participantId: current.id,
              modelId: current.modelId,
              role: current.role,
            },
            createdAt: now,
          });
        }
      }

      // Insert changelog entries if any
      if (changelogEntries.length > 0) {
        await db.insert(tables.chatThreadChangelog).values(changelogEntries);
      }
    }

    // ✅ CREATE CHANGELOG ENTRY for mode change
    if (body.mode !== undefined && body.mode !== thread.mode) {
      // Need to get latest roundNumber from messages
      const latestMessagesForMode = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, id),
        orderBy: [desc(tables.chatMessage.createdAt)],
        limit: 1,
      });

      const currentRoundNumber = latestMessagesForMode.length > 0 && latestMessagesForMode[0]?.metadata
        ? ((latestMessagesForMode[0].metadata as { roundNumber?: number }).roundNumber ?? 1)
        : 1;

      // ✅ CRITICAL FIX: Changelog should appear BEFORE the next round
      // Mode change applies to the next round, not the current one
      const nextRoundNumber = currentRoundNumber + 1;

      const changelogForModeChange: {
        id: string;
        threadId: string;
        roundNumber: number;
        changeType: typeof ChangelogTypes[keyof typeof ChangelogTypes];
        changeSummary: string;
        changeData: ChangeData;
        createdAt: Date;
      } = {
        id: ulid(),
        threadId: id,
        roundNumber: nextRoundNumber,
        changeType: ChangelogTypes.MODIFIED,
        changeSummary: `Changed mode from ${thread.mode} to ${body.mode}`,
        changeData: {
          type: 'mode_change',
          oldMode: thread.mode,
          newMode: body.mode,
        },
        createdAt: now,
      };

      await db.insert(tables.chatThreadChangelog).values(changelogForModeChange);
    }

    const updateData: {
      title?: string;
      mode?: ChatMode;
      status?: ThreadStatus;
      isFavorite?: boolean;
      isPublic?: boolean;
      metadata?: Record<string, unknown>;
      updatedAt: Date;
    } = {
      updatedAt: now,
    };
    if (body.title !== undefined && body.title !== null)
      updateData.title = body.title as string;
    if (body.mode !== undefined)
      updateData.mode = body.mode as ChatMode;
    if (body.status !== undefined)
      updateData.status = body.status as ThreadStatus;
    if (body.isFavorite !== undefined)
      updateData.isFavorite = body.isFavorite;
    if (body.isPublic !== undefined)
      updateData.isPublic = body.isPublic;
    if (body.metadata !== undefined)
      updateData.metadata = body.metadata ?? undefined;
    await db.update(tables.chatThread)
      .set(updateData)
      .where(eq(tables.chatThread.id, id));
    const updatedThreadWithParticipants = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
      with: {
        participants: {
          where: eq(tables.chatParticipant.isEnabled, true),
          orderBy: [asc(tables.chatParticipant.priority)],
        },
      },
    });
    if (!updatedThreadWithParticipants) {
      throw createError.notFound('Thread not found after update');
    }
    if (body.status !== undefined) {
      await invalidateThreadCache(db, user.id, id, thread.slug);
    }
    return Responses.ok(c, {
      thread: updatedThreadWithParticipants,
      participants: updatedThreadWithParticipants.participants,
    });
  },
);
export const deleteThreadHandler: RouteHandler<typeof deleteThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteThread',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const thread = await verifyThreadOwnership(id, user.id, db);
    await db
      .update(tables.chatThread)
      .set({
        status: ThreadStatusSchema.enum.deleted,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, id));
    try {
      await ragService.deleteThreadEmbeddings({
        threadId: id,
        db,
      });
    } catch {
    }
    await invalidateThreadCache(db, user.id, id, thread.slug);
    return Responses.ok(c, {
      deleted: true,
    });
  },
);
export const getPublicThreadHandler: RouteHandler<typeof getPublicThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    validateParams: ThreadSlugParamSchema,
    operationName: 'getPublicThread',
  },
  async (c) => {
    const { slug } = c.validated.params;
    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.slug, slug),
    });
    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', slug),
      );
    }
    if (!thread.isPublic || thread.status === ThreadStatusSchema.enum.archived || thread.status === ThreadStatusSchema.enum.deleted) {
      const reason = thread.status === ThreadStatusSchema.enum.deleted ? 'deleted' : thread.status === ThreadStatusSchema.enum.archived ? 'archived' : 'private';
      throw createError.gone(
        `Thread is no longer publicly available (${reason})`,
      );
    }
    const threadOwner = await db.query.user.findFirst({
      where: eq(tables.user.id, thread.userId),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    });
    if (!threadOwner) {
      throw createError.internal(
        'Thread owner not found',
        ErrorContextBuilders.resourceNotFound('user', thread.userId),
      );
    }
    const participants = await db.query.chatParticipant.findMany({
      where: and(
        eq(tables.chatParticipant.threadId, thread.id),
        eq(tables.chatParticipant.isEnabled, true),
      ),
      orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
    });
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });
    const changelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, thread.id),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      changelog,
      user: {
        id: threadOwner.id,
        name: threadOwner.name,
        image: threadOwner.image,
      },
    });
  },
);
export const getThreadBySlugHandler: RouteHandler<typeof getThreadBySlugRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadSlugParamSchema,
    operationName: 'getThreadBySlug',
  },
  async (c) => {
    const { user } = c.auth();
    const { slug } = c.validated.params;
    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.slug, slug),
    });
    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', slug));
    }
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', slug),
      );
    }
    // ✅ CRITICAL FIX: Return ALL participants (enabled + disabled)
    // Messages contain participant metadata, so they need access to all participant info
    // Filtering by isEnabled caused issues where messages from "disabled" participants
    // wouldn't display properly in the thread view
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
    });
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
    });
  },
);
