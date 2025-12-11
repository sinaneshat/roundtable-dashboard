import type { RouteHandler } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
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
import { AnalysisStatuses, ChangelogTypes, MessagePartTypes, MessageRoles, ThreadStatusSchema } from '@/api/core/enums';
import { IdParamSchema, ThreadSlugParamSchema } from '@/api/core/schemas';
import { getModelById } from '@/api/services/models-config.service';
import { trackThreadCreated } from '@/api/services/posthog-llm-tracking.service';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  SUBSCRIPTION_TIER_NAMES,
} from '@/api/services/product-logic.service';
import { generateSignedDownloadPath } from '@/api/services/signed-url.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import { logModeChange, logWebSearchToggle } from '@/api/services/thread-changelog.service';
import {
  generateTitleFromMessage,
  updateThreadTitleAndSlug,
} from '@/api/services/title-generator.service';
import {
  cancelUploadCleanup,
  isCleanupSchedulerAvailable,
} from '@/api/services/upload-cleanup.service';
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
import type { DbThreadMetadata } from '@/db/schemas/chat-metadata';
import type {
  ChatCustomRole,
} from '@/db/validation';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { sortByPriority } from '@/lib/utils/participant';

import type {
  createThreadRoute,
  deleteThreadRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadRoute,
  getThreadSlugStatusRoute,
  listThreadsRoute,
  updateThreadRoute,
} from '../route';
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
      const model = getModelById(participant.modelId);
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
        mode: body.mode,
        status: ThreadStatusSchema.enum.active,
        isFavorite: false,
        isPublic: false,
        enableWebSearch: body.enableWebSearch ?? false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .returning();
    const customRoleIds = body.participants
      .map(p => p.customRoleId)
      .filter((id): id is string => !!id);
    const customRolesMap = new Map<string, ChatCustomRole>();
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
    // ✅ FIX: Sort participants by priority after insertion
    // INSERT ... RETURNING does NOT guarantee order in SQLite/D1
    // Without sorting, participants may return in random order (by internal row ID)
    // causing placeholders to appear in wrong order in the UI
    const insertedParticipants = await db
      .insert(tables.chatParticipant)
      .values(participantValues)
      .returning();
    const participants = sortByPriority(insertedParticipants);
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
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: body.firstMessage }],
        roundNumber: 0, // ✅ 0-BASED: First round is 0
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0, // ✅ CRITICAL: Must be in metadata for frontend transform
        },
        createdAt: now,
      })
      .returning();
    await incrementMessageUsage(user.id, 1);
    await incrementThreadUsage(user.id);
    await invalidateThreadCache(db, user.id);

    // ✅ Associate attachments with the first user message and add file parts
    let messageWithFileParts = firstMessage;
    if (body.attachmentIds && body.attachmentIds.length > 0 && firstMessage) {
      // Get upload details for constructing file parts
      const uploads = await db.query.upload.findMany({
        where: inArray(tables.upload.id, body.attachmentIds),
        columns: {
          id: true,
          filename: true,
          mimeType: true,
        },
      });

      // Create map for ordered lookup
      const uploadMap = new Map(uploads.map(u => [u.id, u]));

      // Insert message-upload associations
      const messageUploadValues = body.attachmentIds.map((uploadId, index) => ({
        id: ulid(),
        messageId: firstMessage.id,
        uploadId,
        displayOrder: index,
        createdAt: now,
      }));
      await db.insert(tables.messageUpload).values(messageUploadValues);

      // ✅ CRITICAL FIX (Round 0): Update DB message parts to include file parts
      // Previously, the message was stored with only text parts, and we relied on
      // loadMessageAttachments to add file parts during streaming. But this was unreliable.
      // By storing file parts in the DB (with signed HTTP URLs), streaming can directly
      // use them without needing the junction table lookup.
      // Note: These URLs will be converted to base64 by prepareValidatedMessages.
      const baseUrlForDb = new URL(c.req.url).origin;
      const filePartsForDb: ExtendedFilePart[] = await Promise.all(
        body.attachmentIds.map(async (uploadId): Promise<ExtendedFilePart | null> => {
          const upload = uploadMap.get(uploadId);
          if (!upload)
            return null;
          const signedPath = await generateSignedDownloadPath(c, {
            uploadId,
            userId: user.id,
            threadId,
            expirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days for DB storage
          });
          return {
            type: MessagePartTypes.FILE,
            url: `${baseUrlForDb}${signedPath}`,
            filename: upload.filename,
            mediaType: upload.mimeType,
            uploadId, // ✅ ExtendedFilePart: uploadId for participant 1+ to load content from R2
          };
        }),
      ).then(parts => parts.filter((p): p is ExtendedFilePart => p !== null));

      // Update message parts in DB to include file parts
      if (filePartsForDb.length > 0) {
        const existingTextParts = (firstMessage.parts || []).filter(
          (p): p is { type: 'text'; text: string } => p.type === MessagePartTypes.TEXT && 'text' in p,
        );
        const combinedPartsForDb = [
          ...filePartsForDb,
          ...existingTextParts,
        ] as typeof firstMessage.parts;
        await db.update(tables.chatMessage)
          .set({ parts: combinedPartsForDb })
          .where(eq(tables.chatMessage.id, firstMessage.id));
      }

      // Cancel scheduled cleanup for attached uploads (non-blocking)
      if (isCleanupSchedulerAvailable(c.env)) {
        const cancelCleanupTasks = body.attachmentIds.map(uploadId =>
          cancelUploadCleanup(c.env.UPLOAD_CLEANUP_SCHEDULER, uploadId).catch(() => {}),
        );
        if (c.executionCtx) {
          c.executionCtx.waitUntil(Promise.all(cancelCleanupTasks));
        } else {
          Promise.all(cancelCleanupTasks).catch(() => {});
        }
      }

      // ✅ FIX: Construct file parts and add to message for immediate UI display
      // Without this, the returned message only has text parts and attachments
      // don't show until full page refresh loads thread via getThreadBySlugHandler
      // ✅ SECURITY: Use signed URLs for secure, time-limited download access
      const baseUrl = new URL(c.req.url).origin;
      const filePartPromises = body.attachmentIds.map(async (uploadId): Promise<ExtendedFilePart | null> => {
        const upload = uploadMap.get(uploadId);
        if (!upload)
          return null;

        // Generate signed download URL with 1 hour expiration
        const signedPath = await generateSignedDownloadPath(c, {
          uploadId,
          userId: user.id,
          threadId,
          expirationMs: 60 * 60 * 1000, // 1 hour
        });

        return {
          type: MessagePartTypes.FILE,
          url: `${baseUrl}${signedPath}`,
          filename: upload.filename,
          mediaType: upload.mimeType,
          uploadId, // ✅ ExtendedFilePart: uploadId for participant 1+ file loading
        };
      });
      const filePartsWithNulls = await Promise.all(filePartPromises);
      const fileParts: ExtendedFilePart[] = filePartsWithNulls.filter((p): p is ExtendedFilePart => p !== null);

      // Combine existing text parts with file parts
      const existingParts = firstMessage.parts || [];
      const combinedParts = [...fileParts, ...existingParts] as typeof firstMessage.parts;
      messageWithFileParts = {
        ...firstMessage,
        parts: combinedParts, // Files first, then text (matches UI layout)
      };
    }

    // ✅ DATABASE-FIRST PATTERN: Create PENDING pre-search record if web search enabled
    // This ensures the record exists BEFORE any frontend streaming requests
    // Frontend should NEVER create database records - that's backend's responsibility
    //
    // FLOW:
    // 1. Thread creation → Create PENDING pre-search record here
    // 2. Frontend detects PENDING via orchestrator → PreSearchStream calls POST endpoint
    // 3. POST endpoint updates status to STREAMING → Executes SSE streaming
    // 4. POST endpoint updates status to COMPLETED → Stores results
    //
    // Matches moderator analysis pattern: database record created upfront
    if (body.enableWebSearch) {
      await db.insert(tables.chatPreSearch).values({
        id: ulid(),
        threadId,
        roundNumber: 0, // ✅ 0-BASED: First round is 0
        userQuery: body.firstMessage,
        status: AnalysisStatuses.PENDING,
        createdAt: now,
      });
    }

    // =========================================================================
    // ✅ ASYNC TITLE GENERATION (Non-blocking, Background)
    // =========================================================================
    // Generate AI title using waitUntil() - user gets immediate response
    // Frontend polls via useThreadSlugStatusQuery to detect when title is ready
    //
    // Benefits:
    // - Instant thread creation (~100ms instead of 1-5s blocking)
    // - User can start chatting immediately without waiting for title
    // - Title updates in background, URL updates seamlessly via polling
    // - No request blocking on AI model latency
    const generateTitleAsync = async () => {
      try {
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env);
        await updateThreadTitleAndSlug(threadId, aiTitle);
        const db = await getDbAsync();
        await invalidateThreadCache(db, user.id);
      } catch {
        // Silent failure - thread created with default "New Chat" title
      }
    };

    if (c.executionCtx) {
      c.executionCtx.waitUntil(generateTitleAsync());
    } else {
      // Fallback for environments without executionCtx
      generateTitleAsync().catch(() => {});
    }

    // =========================================================================
    // ✅ POSTHOG TRACKING: Track thread creation for analytics
    // =========================================================================
    // Non-blocking - use waitUntil to prevent blocking the response
    const { session } = c.auth();
    const trackThread = async () => {
      try {
        await trackThreadCreated(
          {
            userId: user.id,
            sessionId: session?.id,
            threadId,
            threadMode: body.mode,
            userTier,
          },
          {
            participantCount: participants.length,
            enableWebSearch: body.enableWebSearch ?? false,
            models: participants.map(p => p.modelId),
          },
        );
      } catch {
        // Silently fail - analytics should never break thread creation
      }
    };

    if (c.executionCtx) {
      c.executionCtx.waitUntil(trackThread());
    } else {
      trackThread().catch(() => {});
    }

    return Responses.ok(c, {
      thread,
      participants,
      messages: [messageWithFileParts],
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
    // ✅ CRITICAL FIX: Exclude pre-search messages from messages array
    // Pre-search messages are stored in chat_message table for historical reasons,
    // but they're rendered separately using the pre_search table via PreSearchCard.
    // Including them here causes ordering issues and duplicate rendering logic.
    // Filter criteria: Exclude messages where id starts with 'pre-search-'
    const messages = await db
      .select()
      .from(tables.chatMessage)
      .where(
        and(
          eq(tables.chatMessage.threadId, id),
          sql`${tables.chatMessage.id} NOT LIKE 'pre-search-%'`,
        ),
      )
      .orderBy(
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      );
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
      // ✅ FIX: Also map by modelId to handle re-enabling disabled participants
      // This prevents UNIQUE constraint violations when participant sent without id
      // but modelId already exists in thread (even if disabled)
      const currentByModelId = new Map(currentParticipants.map(p => [p.modelId, p]));
      const newMap = new Map(body.participants.filter(p => p.id).map(p => [p.id!, p]));
      // Follow established pattern from createThreadHandler (lines 196-229)
      // Construct values inline with TypeScript type inference
      const participantsToInsert = [];
      const participantsToUpdate = [];
      for (const newP of body.participants) {
        if (!newP.id) {
          // ✅ FIX: Check if participant with same modelId already exists
          // If exists (even disabled), update/re-enable instead of inserting
          // This prevents UNIQUE constraint violation on (thread_id, model_id)
          const existingByModel = currentByModelId.get(newP.modelId);
          if (existingByModel) {
            // Re-enable and update existing participant
            participantsToUpdate.push({
              id: existingByModel.id,
              updates: {
                modelId: newP.modelId,
                role: newP.role,
                customRoleId: newP.customRoleId,
                priority: newP.priority,
                isEnabled: newP.isEnabled ?? true,
                updatedAt: now,
              },
            });
            // Mark as handled so it won't be disabled later
            newMap.set(existingByModel.id, { ...newP, id: existingByModel.id });
          } else {
            // Truly new participant - insert
            const participantId = ulid();
            participantsToInsert.push({
              id: participantId,
              threadId: id,
              modelId: newP.modelId,
              role: newP.role,
              customRoleId: newP.customRoleId,
              priority: newP.priority,
              isEnabled: newP.isEnabled ?? true,
              settings: null,
              createdAt: now,
              updatedAt: now,
            });
          }
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
                role: newP.role,
                customRoleId: newP.customRoleId,
                priority: newP.priority,
                isEnabled: newP.isEnabled ?? true,
                updatedAt: now,
              },
            });
          }
        }
      }
      // ✅ CRITICAL FIX: Disable participants instead of deleting them
      // Deleting participants breaks foreign key relationships with messages.
      // Messages reference participants via participantId, so if we delete a participant,
      // analysis queries with `with: { participant: true }` will fail because the join returns null.
      // Instead, set isEnabled=false to preserve data integrity while removing from active use.
      const batchOperations: Array<BatchItem<'sqlite'>> = [];
      for (const current of currentParticipants) {
        if (!newMap.has(current.id)) {
          batchOperations.push(
            db.update(tables.chatParticipant)
              .set({ isEnabled: false, updatedAt: new Date() })
              .where(eq(tables.chatParticipant.id, current.id)),
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

      // roundNumber is a column, not in metadata
      // ✅ 0-BASED FIX: Default to 0 for first round (was: 1)
      const currentRoundNumber = latestMessages.length > 0 && latestMessages[0]
        ? latestMessages[0].roundNumber
        : 0;

      // ✅ ROOT CAUSE FIX: Only create changelog entries if conversation has started
      // Check if at least one AI has responded (assistant message exists)
      // Changes before any AI responds are "initial setup", not meaningful changes to track
      const hasAssistantMessages = await db.query.chatMessage.findFirst({
        where: and(
          eq(tables.chatMessage.threadId, id),
          eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
        ),
      });

      // Skip changelog creation if conversation hasn't started yet
      const shouldCreateChangelog = !!hasAssistantMessages;

      // ✅ CRITICAL FIX: Changelog should appear BEFORE the next round
      // User makes changes AFTER round N completes, so changelog belongs to round N+1
      // This ensures changelog appears between round N and round N+1 messages
      const nextRoundNumber = currentRoundNumber + 1;

      const changelogEntries = [];

      // Get current enabled participants before the update (for changelog comparison)
      const oldParticipantsMap = new Map(currentParticipants.map(p => [p.modelId, p]));
      const newParticipantsMap = new Map(
        body.participants
          .filter(p => p.isEnabled !== false)
          .map(p => [p.modelId, p]),
      );

      // Helper to extract model name from modelId
      const extractModelName = (modelId: string) => {
        const parts = modelId.split('/');
        return parts[parts.length - 1] || modelId;
      };

      // ✅ Only create changelog if conversation has actually started
      if (shouldCreateChangelog) {
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
                type: 'participant' as const,
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
                type: 'participant' as const,
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
    }

    // ✅ CREATE CHANGELOG ENTRY for mode change
    // Only log if conversation has started (at least one AI response exists)
    if (body.mode !== undefined && body.mode !== thread.mode) {
      // Check if conversation has started
      const hasAssistantForMode = await db.query.chatMessage.findFirst({
        where: and(
          eq(tables.chatMessage.threadId, id),
          eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
        ),
      });

      if (hasAssistantForMode) {
        // Need to get latest roundNumber from messages
        const latestMessagesForMode = await db.query.chatMessage.findMany({
          where: eq(tables.chatMessage.threadId, id),
          orderBy: [desc(tables.chatMessage.createdAt)],
          limit: 1,
        });

        // roundNumber is a column, not in metadata
        // ✅ 0-BASED FIX: Default to 0 for first round (was: 1)
        const currentRoundNumber = latestMessagesForMode.length > 0 && latestMessagesForMode[0]
          ? latestMessagesForMode[0].roundNumber
          : 0;

        // ✅ CRITICAL FIX: Changelog should appear BEFORE the next round
        // Mode change applies to the next round, not the current one
        const nextRoundNumber = currentRoundNumber + 1;

        // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
        await logModeChange(id, nextRoundNumber, thread.mode, body.mode);
      }
    }

    // ✅ CREATE CHANGELOG ENTRY for web search toggle
    // Only log if conversation has started (at least one AI response exists)
    if (body.enableWebSearch !== undefined && body.enableWebSearch !== thread.enableWebSearch) {
      // Check if conversation has started
      const hasAssistantForWebSearch = await db.query.chatMessage.findFirst({
        where: and(
          eq(tables.chatMessage.threadId, id),
          eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
        ),
      });

      if (hasAssistantForWebSearch) {
        // Need to get latest roundNumber from messages
        const latestMessagesForWebSearch = await db.query.chatMessage.findMany({
          where: eq(tables.chatMessage.threadId, id),
          orderBy: [desc(tables.chatMessage.createdAt)],
          limit: 1,
        });

        // roundNumber is a column, not in metadata
        // ✅ 0-BASED FIX: Default to 0 for first round (was: 1)
        const currentRoundNumber = latestMessagesForWebSearch.length > 0 && latestMessagesForWebSearch[0]
          ? latestMessagesForWebSearch[0].roundNumber
          : 0;

        // ✅ CRITICAL FIX: Changelog should appear BEFORE the next round
        // Web search toggle applies to the next round, not the current one
        const nextRoundNumber = currentRoundNumber + 1;

        // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
        await logWebSearchToggle(id, nextRoundNumber, body.enableWebSearch);
      }
    }

    // ✅ TYPE-SAFE: Use properly typed update data derived from validated body
    // Body is already typed by UpdateThreadRequestSchema, no force casts needed
    const updateData: {
      title?: string;
      mode?: ChatMode;
      status?: ThreadStatus;
      isFavorite?: boolean;
      isPublic?: boolean;
      enableWebSearch?: boolean;
      metadata?: DbThreadMetadata;
      updatedAt: Date;
    } = {
      updatedAt: now,
    };
    if (body.title !== undefined && body.title !== null && typeof body.title === 'string') {
      updateData.title = body.title;
    }
    if (body.mode !== undefined)
      updateData.mode = body.mode;
    if (body.status !== undefined)
      updateData.status = body.status;
    if (body.isFavorite !== undefined)
      updateData.isFavorite = body.isFavorite;
    if (body.isPublic !== undefined)
      updateData.isPublic = body.isPublic;
    if (body.enableWebSearch !== undefined)
      updateData.enableWebSearch = body.enableWebSearch;
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
    // ✅ BACKWARDS COMPATIBLE SLUGS: Check both current slug AND previousSlug
    // This ensures public links with the initial (non-AI) slug continue to work
    const thread = await db.query.chatThread.findFirst({
      where: or(
        eq(tables.chatThread.slug, slug),
        eq(tables.chatThread.previousSlug, slug),
      ),
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
    // ✅ CRITICAL FIX: Exclude pre-search messages from messages array
    // Pre-search messages are stored in chat_message table for historical reasons,
    // but they're rendered separately using the pre_search table via PreSearchCard.
    // Including them here causes ordering issues and duplicate rendering logic.
    // Filter criteria: Exclude messages where id starts with 'pre-search-'
    const allMessages = await db
      .select()
      .from(tables.chatMessage)
      .where(
        and(
          eq(tables.chatMessage.threadId, thread.id),
          sql`${tables.chatMessage.id} NOT LIKE 'pre-search-%'`,
        ),
      )
      .orderBy(
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      );

    // ✅ PUBLIC PAGE FIX: Exclude incomplete rounds from public view
    // Incomplete rounds (mid-stream) can cause duplications when the same user
    // views the public page. Only show rounds that are fully complete.
    // A round is complete when it has all enabled participant responses.
    const enabledParticipantCount = participants.length;

    // Count participant responses per round
    const roundParticipantCounts = new Map<number, number>();
    const roundHasUserMessage = new Map<number, boolean>();

    for (const msg of allMessages) {
      const round = msg.roundNumber;
      if (msg.role === MessageRoles.USER) {
        roundHasUserMessage.set(round, true);
      } else if (msg.role === MessageRoles.ASSISTANT) {
        roundParticipantCounts.set(round, (roundParticipantCounts.get(round) ?? 0) + 1);
      }
    }

    // Determine which rounds are complete
    // A round is complete if it has a user message AND all participants have responded
    const completeRounds = new Set<number>();
    for (const [round, hasUser] of roundHasUserMessage) {
      if (hasUser) {
        const participantCount = roundParticipantCounts.get(round) ?? 0;
        // Round is complete if all enabled participants have responded
        if (participantCount >= enabledParticipantCount) {
          completeRounds.add(round);
        }
      }
    }

    // Filter messages to only include complete rounds
    const messages = allMessages.filter(msg => completeRounds.has(msg.roundNumber));

    const allChangelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, thread.id),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });
    // ✅ PUBLIC PAGE FIX: Only show changelogs for complete rounds
    // Root cause fix: Changelogs are now only created after conversation has started
    // (at least one assistant message exists), so no need to filter by roundNumber > 1
    const changelog = allChangelog.filter(cl => completeRounds.has(cl.roundNumber));

    // Fetch all analyses - filter to only include complete rounds
    const allAnalyses = await db.query.chatModeratorAnalysis.findMany({
      where: eq(tables.chatModeratorAnalysis.threadId, thread.id),
      orderBy: [tables.chatModeratorAnalysis.roundNumber],
    });
    const analyses = allAnalyses.filter(a => completeRounds.has(a.roundNumber));

    const allFeedback = await db.query.chatRoundFeedback.findMany({
      where: eq(tables.chatRoundFeedback.threadId, thread.id),
      orderBy: [tables.chatRoundFeedback.roundNumber],
    });
    const feedback = allFeedback.filter(f => completeRounds.has(f.roundNumber));

    // ✅ PUBLIC PAGE FIX: Include pre-searches for web search display
    // Only return COMPLETE pre-searches for complete rounds
    const allPreSearches = await db.query.chatPreSearch.findMany({
      where: and(
        eq(tables.chatPreSearch.threadId, thread.id),
        eq(tables.chatPreSearch.status, AnalysisStatuses.COMPLETE),
      ),
      orderBy: [tables.chatPreSearch.roundNumber],
    });
    const preSearches = allPreSearches.filter(ps => completeRounds.has(ps.roundNumber));

    return Responses.ok(c, {
      thread,
      participants,
      messages,
      changelog,
      analyses,
      feedback,
      preSearches,
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
    // ✅ BACKWARDS COMPATIBLE SLUGS: Check both current slug AND previousSlug
    // This ensures links with the initial (non-AI) slug continue to work
    // after the AI-generated title creates a new slug
    const thread = await db.query.chatThread.findFirst({
      where: or(
        eq(tables.chatThread.slug, slug),
        eq(tables.chatThread.previousSlug, slug),
      ),
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
    // ✅ CRITICAL FIX: Exclude pre-search messages from messages array
    // Pre-search messages are stored in chat_message table for historical reasons,
    // but they're rendered separately using the pre_search table via PreSearchCard.
    // Including them here causes ordering issues and duplicate rendering logic.
    // Filter criteria: Exclude messages where id starts with 'pre-search-'
    const rawMessages = await db
      .select()
      .from(tables.chatMessage)
      .where(
        and(
          eq(tables.chatMessage.threadId, thread.id),
          sql`${tables.chatMessage.id} NOT LIKE 'pre-search-%'`,
        ),
      )
      .orderBy(
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      );

    // ✅ ATTACHMENT SUPPORT: Load message attachments for user messages
    const userMessageIds = rawMessages
      .filter(m => m.role === MessageRoles.USER)
      .map(m => m.id);

    // Define type for attachment results
    type MessageAttachment = {
      messageId: string;
      displayOrder: number;
      uploadId: string;
      filename: string;
      mimeType: string;
      fileSize: number;
    };

    // Get all attachments for user messages in one query
    const messageAttachmentsRaw = userMessageIds.length > 0
      ? await db
          .select()
          .from(tables.messageUpload)
          .innerJoin(tables.upload, eq(tables.messageUpload.uploadId, tables.upload.id))
          .where(inArray(tables.messageUpload.messageId, userMessageIds))
          .orderBy(asc(tables.messageUpload.displayOrder))
      : [];

    // Transform to flat structure
    const messageAttachments: MessageAttachment[] = messageAttachmentsRaw.map(row => ({
      messageId: row.message_upload.messageId,
      displayOrder: row.message_upload.displayOrder,
      uploadId: row.upload.id,
      filename: row.upload.filename,
      mimeType: row.upload.mimeType,
      fileSize: row.upload.fileSize,
    }));

    // Group attachments by message ID
    const attachmentsByMessage = new Map<string, MessageAttachment[]>();
    for (const att of messageAttachments) {
      const existing = attachmentsByMessage.get(att.messageId) || [];
      existing.push(att);
      attachmentsByMessage.set(att.messageId, existing);
    }

    // ✅ Transform messages to include file parts for user messages with attachments
    // ✅ SECURITY: Use signed URLs for secure, time-limited download access
    const baseUrl = new URL(c.req.url).origin;
    const messages = await Promise.all(
      rawMessages.map(async (msg) => {
        const attachments = attachmentsByMessage.get(msg.id);
        if (!attachments || attachments.length === 0 || msg.role !== 'user') {
          return msg;
        }

        // Add file parts for each attachment with signed URLs
        // ✅ FIX: Filter out existing file parts to prevent duplication
        // streaming.handler.ts may have already saved file parts, but they need fresh signed URLs
        const existingParts = msg.parts || [];
        const nonFileParts = existingParts.filter(p => p.type !== MessagePartTypes.FILE);
        const fileParts: ExtendedFilePart[] = await Promise.all(
          attachments.map(async (att): Promise<ExtendedFilePart> => {
            const signedPath = await generateSignedDownloadPath(c, {
              uploadId: att.uploadId,
              userId: thread.userId,
              threadId: thread.id,
              expirationMs: 60 * 60 * 1000, // 1 hour
            });

            return {
              type: MessagePartTypes.FILE,
              url: `${baseUrl}${signedPath}`,
              filename: att.filename,
              mediaType: att.mimeType,
              uploadId: att.uploadId, // ✅ ExtendedFilePart: uploadId for participant 1+ file loading
            };
          }),
        );

        return {
          ...msg,
          // ✅ FIX: Replace file parts instead of appending to prevent duplication
          // Fresh signed URLs replace any expired ones from initial save
          parts: [...fileParts, ...nonFileParts],
        };
      }),
    );

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
export const getThreadSlugStatusHandler: RouteHandler<typeof getThreadSlugStatusRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadSlugStatus',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
      columns: {
        slug: true,
        title: true,
        isAiGeneratedTitle: true,
        userId: true,
      },
    });
    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', id));
    }
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', id),
      );
    }
    return Responses.ok(c, {
      slug: thread.slug,
      title: thread.title,
      isAiGeneratedTitle: thread.isAiGeneratedTitle,
    });
  },
);
