import type { RouteHandler } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, ne, notLike, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import Fuse from 'fuse.js';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { invalidateMessagesCache, invalidatePublicThreadCache, invalidateSidebarCache, invalidateThreadCache } from '@/api/common/cache-utils';
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
  IdParamSchema,
  Responses,
  ThreadSlugParamSchema,
} from '@/api/core';
import type { ChatMode, ThreadStatus } from '@/api/core/enums';
import { ChangelogChangeTypes, ChangelogTypes, MessagePartTypes, MessageRoles, MessageStatuses, PlanTypes, SubscriptionTiers, ThreadStatusSchema } from '@/api/core/enums';
import {
  canAccessModelByPricing,
  checkFreeUserHasCreatedThread,
  deductCreditsForAction,
  enforceCredits,
  enrichWithTierAccess,
  estimateStreamingCredits,
  getRequiredTierForModel,
  getUserCreditBalance,
  isFreeUserWithPendingRound,
} from '@/api/services/billing';
import { trackThreadCreated } from '@/api/services/errors';
import { getModelById } from '@/api/services/models';
import { generateTitleFromMessage, generateUniqueSlug, updateThreadTitleAndSlug } from '@/api/services/prompts';
import { logModeChange, logWebSearchToggle } from '@/api/services/threads';
import { cancelUploadCleanup, generateBatchSignedPaths, isCleanupSchedulerAvailable } from '@/api/services/uploads';
import type { BatchSignOptions } from '@/api/services/uploads/signed-url.service';
import {
  getUserTier,
} from '@/api/services/usage';
import type { ApiEnv } from '@/api/types';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import { MessageCacheTags, PublicSlugsListCacheTags, PublicThreadCacheTags, ThreadCacheTags } from '@/db/cache/cache-tags';
import type { DbThreadMetadata } from '@/db/schemas/chat-metadata';
import { isModeChange, isWebSearchChange, safeParseChangelogData } from '@/db/schemas/chat-metadata';
import type {
  ChatCustomRole,
} from '@/db/validation';
import { SUBSCRIPTION_TIER_NAMES } from '@/lib/config';
import { STALE_TIMES } from '@/lib/data/stale-times';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { sortByPriority } from '@/lib/utils';

import type {
  createThreadRoute,
  deleteThreadRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadRoute,
  getThreadSlugStatusRoute,
  listPublicThreadSlugsRoute,
  listSidebarThreadsRoute,
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

    // ✅ DB-LEVEL CACHING: Cache thread list queries for faster subsequent loads
    // Cache key includes user ID for isolation, TTL 60 seconds
    // Invalidated on thread create/update/delete via invalidateThreadCache()
    const allThreads = await db
      .select()
      .from(tables.chatThread)
      .where(buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        filters,
      ))
      .orderBy(getCursorOrderBy(tables.chatThread.updatedAt, 'desc'))
      .limit(fetchLimit)
      .$withCache({
        config: { ex: STALE_TIMES.threadListKV }, // 2 minutes cache
        tag: ThreadCacheTags.list(user.id),
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

    // ✅ PERF: Cache sidebar thread list for faster navigation
    c.header('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');

    return Responses.cursorPaginated(c, items, pagination);
  },
);

export const listSidebarThreadsHandler: RouteHandler<typeof listSidebarThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ThreadListQuerySchema,
    operationName: 'listSidebarThreads',
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

    const allThreadsRaw = await db
      .select()
      .from(tables.chatThread)
      .where(buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        filters,
      ))
      .orderBy(getCursorOrderBy(tables.chatThread.updatedAt, 'desc'))
      .limit(fetchLimit)
      .$withCache({
        config: { ex: STALE_TIMES.threadSidebarKV },
        tag: ThreadCacheTags.sidebar(user.id),
      });

    // Map to lightweight sidebar schema
    const allThreads = allThreadsRaw.map(t => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      previousSlug: t.previousSlug,
      isFavorite: t.isFavorite,
      isPublic: t.isPublic,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    let threads = allThreads;
    if (query.search?.trim()) {
      const fuse = new Fuse(allThreads, {
        keys: ['title', 'slug'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
      threads = fuse.search(query.search.trim()).map(r => r.item).slice(0, query.limit + 1);
    }

    const { items, pagination } = applyCursorPagination(
      threads,
      query.limit,
      thread => createTimestampCursor(thread.updatedAt),
    );

    c.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
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

    // 🔍 DEBUG: Log thread creation attempt (enable with DEBUG_REQUESTS=true)
    const debugRequests = process.env.DEBUG_REQUESTS === 'true';
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] Starting thread creation for user:', user.id, user.email);
    }

    // ✅ FREE USER THREAD LIMIT: Free users can only create ONE thread total
    // This check runs BEFORE credit enforcement to provide a clearer error message
    const creditBalance = await getUserCreditBalance(user.id);
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] Credit balance:', {
        planType: creditBalance.planType,
        balance: creditBalance.balance,
        userId: user.id,
      });
    }

    if (creditBalance.planType === PlanTypes.FREE) {
      const hasExistingThread = await checkFreeUserHasCreatedThread(user.id);
      if (debugRequests) {
        console.error('[CREATE-THREAD-DEBUG] Free user thread check:', { hasExistingThread });
      }
      if (hasExistingThread) {
        throw createError.badRequest(
          'Free users can only create one thread. Subscribe to Pro for unlimited threads.',
          {
            errorType: 'resource',
            resource: 'thread',
            userId: user.id,
          },
        );
      }
    }

    // ✅ CREDITS: Check if user has enough credits for thread creation + initial message
    // This is the PRIMARY gating mechanism - if user passes this check, they have credits
    // and should be able to create threads. Credits are the real limiting factor.
    const estimatedCredits = estimateStreamingCredits(1); // Minimum estimate
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] Enforcing credits:', { estimatedCredits });
    }
    await enforceCredits(user.id, estimatedCredits);
    const body = c.validated.body;
    const db = batch.db;
    const userTier = await getUserTier(user.id);
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] User tier:', { userTier });
    }

    // ✅ FREE ROUND BYPASS: Free users who haven't completed their free round
    // can use ANY models (within 3-model limit) for their first experience.
    // Model pricing restrictions only apply after free round is used.
    const skipPricingCheck = await isFreeUserWithPendingRound(user.id, userTier);
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] Free round bypass:', { skipPricingCheck });
    }

    for (const participant of body.participants) {
      const model = getModelById(participant.modelId);
      if (debugRequests) {
        console.error('[CREATE-THREAD-DEBUG] Model lookup:', {
          modelId: participant.modelId,
          found: !!model,
          modelName: model?.name,
        });
      }
      if (!model) {
        throw createError.badRequest(
          `Model "${participant.modelId}" not found`,
          {
            errorType: 'validation',
            field: 'participants.modelId',
          },
        );
      }
      // Skip pricing check for free users on their first (free) round
      if (!skipPricingCheck) {
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
      // Use custom role name as participant role if customRoleId is set
      // systemPrompt is generated at runtime from role name in streaming handler
      const customRole = p.customRoleId ? customRolesMap.get(p.customRoleId) : undefined;
      const role = customRole?.name ?? p.role;

      // Only use systemPrompt from request if explicitly provided (custom override)
      // Custom roles no longer store systemPrompt - it's generated at runtime
      const systemPrompt = p.systemPrompt;

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
        role,
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
    // ✅ CREDITS: Credits already enforced at start of handler (line 134)
    // ✅ CRITICAL FIX: Use provided ID if present, otherwise generate new ULID
    // Streaming handler expects user messages to be pre-persisted with the EXACT ID
    // that the frontend sends in the streaming request. If we generate a different ID,
    // streaming will fail with "User message not found in DB" error.
    const firstMessageId = body.firstMessageId || ulid();
    const [firstMessage] = await db
      .insert(tables.chatMessage)
      .values({
        id: firstMessageId,
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
    // ✅ CREDITS: Deduct for thread creation (includes first message)
    await deductCreditsForAction(user.id, 'threadCreation', { threadId });
    await invalidateThreadCache(db, user.id, threadId);
    await invalidateMessagesCache(db, threadId);

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

      // ✅ PERF: Batch sign all attachments with single key import
      const dbSignOptions: BatchSignOptions[] = body.attachmentIds
        .filter(uploadId => uploadMap.has(uploadId))
        .map(uploadId => ({
          uploadId,
          userId: user.id,
          threadId,
          expirationMs: 7 * 24 * 60 * 60 * 1000,
        }));
      const dbSignedPaths = await generateBatchSignedPaths(c, dbSignOptions);

      const filePartsForDb: ExtendedFilePart[] = body.attachmentIds
        .map((uploadId): ExtendedFilePart | null => {
          const upload = uploadMap.get(uploadId);
          const signedPath = dbSignedPaths.get(uploadId);
          if (!upload || !signedPath)
            return null;
          return {
            type: MessagePartTypes.FILE,
            url: `${baseUrlForDb}${signedPath}`,
            filename: upload.filename,
            mediaType: upload.mimeType,
            uploadId,
          };
        })
        .filter((p): p is ExtendedFilePart => p !== null);

      if (filePartsForDb.length > 0) {
        const existingTextParts = (firstMessage.parts ?? []).filter(
          (p): p is { type: 'text'; text: string } => p.type === MessagePartTypes.TEXT && 'text' in p,
        );
        const combinedPartsForDb = [...filePartsForDb, ...existingTextParts];
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

      // ✅ PERF: Batch sign all attachments with single key import (1 hour for UI display)
      const uiSignOptions: BatchSignOptions[] = body.attachmentIds
        .filter(uploadId => uploadMap.has(uploadId))
        .map(uploadId => ({
          uploadId,
          userId: user.id,
          threadId,
          expirationMs: 60 * 60 * 1000,
        }));
      const uiSignedPaths = await generateBatchSignedPaths(c, uiSignOptions);

      const fileParts: ExtendedFilePart[] = body.attachmentIds
        .map((uploadId): ExtendedFilePart | null => {
          const upload = uploadMap.get(uploadId);
          const signedPath = uiSignedPaths.get(uploadId);
          if (!upload || !signedPath)
            return null;
          return {
            type: MessagePartTypes.FILE,
            url: `${baseUrl}${signedPath}`,
            filename: upload.filename,
            mediaType: upload.mimeType,
            uploadId,
          };
        })
        .filter((p): p is ExtendedFilePart => p !== null);

      const existingParts = firstMessage.parts ?? [];
      const combinedParts = [...fileParts, ...existingParts];
      messageWithFileParts = {
        ...firstMessage,
        parts: combinedParts,
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
    // Matches moderator summary pattern: database record created upfront
    if (body.enableWebSearch) {
      await db.insert(tables.chatPreSearch).values({
        id: ulid(),
        threadId,
        roundNumber: 0, // ✅ 0-BASED: First round is 0
        userQuery: body.firstMessage,
        status: MessageStatuses.PENDING,
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
        // ✅ BILLING: Pass billing context for title generation credit deduction
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env, {
          userId: user.id,
          threadId,
        });
        await updateThreadTitleAndSlug(threadId, aiTitle);
        const db = await getDbAsync();
        await invalidateThreadCache(db, user.id, threadId);
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

    // ✅ DB-LEVEL CACHING: Cache thread lookup (5 minutes)
    // Fast retrieval for subsequent visits to the same thread
    const threadResults = await db
      .select()
      .from(tables.chatThread)
      .where(eq(tables.chatThread.id, id))
      .limit(1)
      .$withCache({
        config: { ex: STALE_TIMES.threadDetailKV }, // 5 minutes cache
        tag: ThreadCacheTags.single(id),
      });
    const thread = threadResults[0];

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

    // ✅ PERF FIX: Parallelize ALL independent queries
    // Previously 5 sequential queries (~500ms) → now 1 parallel batch (~100ms)
    const [rawParticipants, userTier, messages, changelog, threadOwnerResult] = await Promise.all([
      // Query 1: Participants (cached)
      db
        .select()
        .from(tables.chatParticipant)
        .where(and(
          eq(tables.chatParticipant.threadId, id),
          eq(tables.chatParticipant.isEnabled, true),
        ))
        .orderBy(tables.chatParticipant.priority, tables.chatParticipant.id)
        .$withCache({
          config: { ex: STALE_TIMES.threadParticipantsKV }, // 10 minutes
          tag: ThreadCacheTags.participants(id),
        }),

      // Query 2: User tier (cached in getUserTier)
      user ? getUserTier(user.id) : Promise.resolve(SubscriptionTiers.FREE),

      // Query 3: Messages (cached)
      // Exclude pre-search messages (rendered separately via PreSearchCard)
      db
        .select()
        .from(tables.chatMessage)
        .where(
          and(
            eq(tables.chatMessage.threadId, id),
            notLike(tables.chatMessage.id, 'pre-search-%'),
          ),
        )
        .orderBy(
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        )
        .$withCache({
          config: { ex: STALE_TIMES.threadMessagesKV }, // 5 minutes
          tag: MessageCacheTags.byThread(id),
        }),

      // Query 4: Changelog (cached)
      db
        .select()
        .from(tables.chatThreadChangelog)
        .where(eq(tables.chatThreadChangelog.threadId, id))
        .orderBy(desc(tables.chatThreadChangelog.createdAt))
        .$withCache({
          config: { ex: 300 }, // 5 min cache
          tag: MessageCacheTags.changelog(id),
        }),

      // Query 5: Thread owner (cached)
      db
        .select()
        .from(tables.user)
        .where(eq(tables.user.id, thread.userId))
        .limit(1)
        .$withCache({
          config: { ex: 3600 }, // 1 hour cache
          tag: `user-${thread.userId}`,
        }),
    ]);

    // ✅ DRY: Use enrichWithTierAccess helper (single source of truth)
    const participants = rawParticipants.map(participant => ({
      ...participant,
      ...enrichWithTierAccess(participant.modelId, userTier, getModelById),
    }));
    const threadOwner = threadOwnerResult[0];
    if (!threadOwner) {
      throw createError.internal(
        'Thread owner not found',
        ErrorContextBuilders.resourceNotFound('user', thread.userId),
      );
    }
    // Include user tier config for access control in UI
    const userTierConfig = {
      tier: userTier,
      tier_name: SUBSCRIPTION_TIER_NAMES[userTier],
    };

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
      userTierConfig,
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
      // summary queries with `with: { participant: true }` will fail because the join returns null.
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
      // ✅ UPSERT: Insert participants individually with onConflictDoUpdate
      // Follows stripe-sync.service.ts pattern for race condition handling
      // Each insert handles its own conflict - if (threadId, modelId) exists, update instead
      // ✅ RACE CONDITION FIX: Deduplicate by modelId to prevent batch conflicts
      // If same modelId appears twice in input, only process first occurrence
      const seenModelIds = new Set<string>();
      for (const participant of participantsToInsert) {
        if (seenModelIds.has(participant.modelId)) {
          continue; // Skip duplicate modelId
        }
        seenModelIds.add(participant.modelId);
        batchOperations.push(
          db.insert(tables.chatParticipant)
            .values(participant)
            .onConflictDoUpdate({
              target: [tables.chatParticipant.threadId, tables.chatParticipant.modelId],
              set: {
                role: participant.role,
                customRoleId: participant.customRoleId,
                priority: participant.priority,
                isEnabled: participant.isEnabled,
                settings: participant.settings,
                updatedAt: participant.updatedAt,
              },
            }),
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

      // Helper to extract model name from modelId
      const extractModelName = (modelId: string) => {
        const parts = modelId.split('/');
        return parts[parts.length - 1] || modelId;
      };

      // ✅ Only create changelog if conversation has actually started
      if (shouldCreateChangelog) {
        // ✅ LATEST STATE FIX: Compare previous state (before this update) vs new state (after this update)
        // Delete existing entries for this round and insert fresh ones based on current comparison
        await db.delete(tables.chatThreadChangelog).where(
          and(
            eq(tables.chatThreadChangelog.threadId, id),
            eq(tables.chatThreadChangelog.roundNumber, nextRoundNumber),
            sql`json_extract(${tables.chatThreadChangelog.changeData}, '$.type') = ${ChangelogChangeTypes.PARTICIPANT}`,
          ),
        );

        // Previous state = current DB participants (before this update was applied)
        const prevParticipantsMap = new Map(
          currentParticipants
            .filter(p => p.isEnabled)
            .map(p => [p.modelId, { modelId: p.modelId, role: p.role, id: p.id }]),
        );

        // New state = request body participants
        const newParticipantsMap = new Map(
          body.participants
            .filter(p => p.isEnabled !== false)
            .map(p => [p.modelId, { modelId: p.modelId, role: p.role || null }]),
        );

        const changelogEntries = [];

        // Detect added participants (in new but not in previous)
        for (const [modelId, newP] of newParticipantsMap) {
          if (!prevParticipantsMap.has(modelId)) {
            const modelName = extractModelName(modelId);
            const displayName = newP.role || modelName;
            changelogEntries.push({
              id: ulid(),
              threadId: id,
              roundNumber: nextRoundNumber,
              changeType: ChangelogTypes.ADDED,
              changeSummary: `Added ${displayName}`,
              changeData: {
                type: ChangelogChangeTypes.PARTICIPANT,
                modelId,
                role: newP.role,
              },
              createdAt: now,
            });
          }
        }

        // Detect removed participants (in previous but not in new)
        for (const [modelId, prevP] of prevParticipantsMap) {
          if (!newParticipantsMap.has(modelId)) {
            const modelName = extractModelName(modelId);
            const displayName = prevP.role || modelName;
            changelogEntries.push({
              id: ulid(),
              threadId: id,
              roundNumber: nextRoundNumber,
              changeType: ChangelogTypes.REMOVED,
              changeSummary: `Removed ${displayName}`,
              changeData: {
                type: ChangelogChangeTypes.PARTICIPANT,
                participantId: prevP.id,
                modelId,
                role: prevP.role,
              },
              createdAt: now,
            });
          }
        }

        // Insert changelog entries if any changes exist
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

        // ✅ DEDUPLICATION FIX: If mode was changed multiple times before next round,
        // update the existing entry instead of creating duplicates.
        // This shows the NET change (original mode → final mode) rather than intermediate steps.
        const existingModeChange = await db.query.chatThreadChangelog.findFirst({
          where: and(
            eq(tables.chatThreadChangelog.threadId, id),
            eq(tables.chatThreadChangelog.roundNumber, nextRoundNumber),
            sql`json_extract(${tables.chatThreadChangelog.changeData}, '$.type') = ${ChangelogChangeTypes.MODE_CHANGE}`,
          ),
        });

        if (existingModeChange) {
          // Existing entry found - use its oldMode as the baseline
          // ✅ TYPE-SAFE: Use Zod validation + type guard instead of type cast
          const parsedData = safeParseChangelogData(existingModeChange.changeData);
          if (!parsedData || !isModeChange(parsedData)) {
            throw createError.internal('Invalid changelog data structure', ErrorContextBuilders.database('select', 'chatThreadChangelog'));
          }
          const baselineMode = parsedData.oldMode;

          if (baselineMode === body.mode) {
            // ✅ NO NET CHANGE: Mode changed back to baseline - delete the entry
            await db.delete(tables.chatThreadChangelog)
              .where(eq(tables.chatThreadChangelog.id, existingModeChange.id));
          } else {
            // ✅ NET CHANGE EXISTS: Update entry with baseline oldMode → new newMode
            await db.update(tables.chatThreadChangelog)
              .set({
                changeSummary: `Changed conversation mode from ${baselineMode} to ${body.mode}`,
                changeData: {
                  type: ChangelogChangeTypes.MODE_CHANGE,
                  oldMode: baselineMode,
                  newMode: body.mode,
                },
                createdAt: now,
              })
              .where(eq(tables.chatThreadChangelog.id, existingModeChange.id));
          }
        } else {
          // ✅ SERVICE LAYER: Use thread-changelog.service for new changelog creation
          await logModeChange(id, nextRoundNumber, thread.mode, body.mode);
        }
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

        // ✅ DEDUPLICATION FIX: If web search was toggled multiple times before next round,
        // update the existing entry instead of creating duplicates.
        const existingWebSearchChange = await db.query.chatThreadChangelog.findFirst({
          where: and(
            eq(tables.chatThreadChangelog.threadId, id),
            eq(tables.chatThreadChangelog.roundNumber, nextRoundNumber),
            sql`json_extract(${tables.chatThreadChangelog.changeData}, '$.type') = ${ChangelogChangeTypes.WEB_SEARCH}`,
          ),
        });

        if (existingWebSearchChange) {
          // Existing entry found - infer baseline from it
          // Since web_search is a boolean toggle, baseline = opposite of what was changed TO
          // ✅ TYPE-SAFE: Use Zod validation + type guard instead of type cast
          const parsedWebSearchData = safeParseChangelogData(existingWebSearchChange.changeData);
          if (!parsedWebSearchData || !isWebSearchChange(parsedWebSearchData)) {
            throw createError.internal('Invalid web search changelog data structure', ErrorContextBuilders.database('select', 'chatThreadChangelog'));
          }
          const baselineEnabled = !parsedWebSearchData.enabled;

          if (baselineEnabled === body.enableWebSearch) {
            // ✅ NO NET CHANGE: Web search toggled back to baseline - delete the entry
            await db.delete(tables.chatThreadChangelog)
              .where(eq(tables.chatThreadChangelog.id, existingWebSearchChange.id));
          } else {
            // ✅ NET CHANGE EXISTS: Update entry with new state
            await db.update(tables.chatThreadChangelog)
              .set({
                changeSummary: body.enableWebSearch ? 'Enabled web search' : 'Disabled web search',
                changeData: {
                  type: ChangelogChangeTypes.WEB_SEARCH,
                  enabled: body.enableWebSearch,
                },
                createdAt: now,
              })
              .where(eq(tables.chatThreadChangelog.id, existingWebSearchChange.id));
          }
        } else {
          // ✅ SERVICE LAYER: Use thread-changelog.service for new changelog creation
          await logWebSearchToggle(id, nextRoundNumber, body.enableWebSearch);
        }
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
      throw createError.notFound('Thread not found after update', ErrorContextBuilders.resourceNotFound('thread', id, user.id));
    }
    // ✅ CACHE INVALIDATION: Always invalidate when sidebar-relevant fields change
    // This ensures sidebar shows fresh titles, favorites, and public status after updates
    if (body.title !== undefined || body.isFavorite !== undefined || body.isPublic !== undefined || body.status !== undefined) {
      await invalidateThreadCache(db, user.id, id, thread.slug);
      await invalidateSidebarCache(db, user.id);
    }

    // ✅ PUBLIC THREAD CACHE: Invalidate when visibility changes
    // Also clears cached OG images from R2
    if (body.isPublic !== undefined && thread.slug) {
      await invalidatePublicThreadCache(db, thread.slug, id, c.env.UPLOADS_R2_BUCKET);
    }

    // ✅ NEW MESSAGE CREATION: Create user message if provided
    // ✅ CRITICAL FIX: Use provided ID if present, otherwise generate new ULID
    // Streaming handler expects user messages to be pre-persisted with the EXACT ID
    // that the frontend sends in the streaming request. If we generate a different ID,
    // streaming will fail with "User message not found in DB" error.
    let createdMessage: typeof tables.chatMessage.$inferSelect | undefined;
    if (body.newMessage) {
      const messageId = body.newMessage.id || ulid();
      const messageParts: Array<{ type: 'text'; text: string }> = [
        { type: MessagePartTypes.TEXT, text: body.newMessage.content },
      ];

      const [message] = await db
        .insert(tables.chatMessage)
        .values({
          id: messageId,
          threadId: id,
          role: MessageRoles.USER,
          parts: messageParts,
          roundNumber: body.newMessage.roundNumber,
          metadata: {
            role: MessageRoles.USER,
            roundNumber: body.newMessage.roundNumber,
          },
          createdAt: now,
        })
        .returning();

      createdMessage = message;

      // ✅ ATTACHMENT SUPPORT: Handle attachments if provided
      if (body.newMessage.attachmentIds && body.newMessage.attachmentIds.length > 0) {
        // Get upload details for constructing file parts
        const uploads = await db.query.upload.findMany({
          where: inArray(tables.upload.id, body.newMessage.attachmentIds),
          columns: {
            id: true,
            filename: true,
            mimeType: true,
          },
        });

        const uploadMap = new Map(uploads.map(u => [u.id, u]));

        // Insert message-upload associations
        const messageUploadValues = body.newMessage.attachmentIds.map((uploadId, index) => ({
          id: ulid(),
          messageId,
          uploadId,
          displayOrder: index,
          createdAt: now,
        }));
        await db.insert(tables.messageUpload).values(messageUploadValues);

        // Generate signed URLs and add file parts to message
        const baseUrl = new URL(c.req.url).origin;

        // ✅ PERF: Batch sign all attachments with single key import
        const signOptions: BatchSignOptions[] = body.newMessage.attachmentIds
          .filter(uploadId => uploadMap.has(uploadId))
          .map(uploadId => ({
            uploadId,
            userId: user.id,
            threadId: id,
            expirationMs: 7 * 24 * 60 * 60 * 1000,
          }));
        const signedPaths = await generateBatchSignedPaths(c, signOptions);

        const filePartsForDb: ExtendedFilePart[] = body.newMessage.attachmentIds
          .map((uploadId): ExtendedFilePart | null => {
            const upload = uploadMap.get(uploadId);
            const signedPath = signedPaths.get(uploadId);
            if (!upload || !signedPath)
              return null;
            return {
              type: MessagePartTypes.FILE,
              url: `${baseUrl}${signedPath}`,
              filename: upload.filename,
              mediaType: upload.mimeType,
              uploadId,
            };
          })
          .filter((p): p is ExtendedFilePart => p !== null);

        // Update message parts to include file parts
        if (filePartsForDb.length > 0 && message) {
          const combinedPartsForDb = [
            ...filePartsForDb,
            ...messageParts,
          ] as typeof message.parts;
          await db.update(tables.chatMessage)
            .set({ parts: combinedPartsForDb })
            .where(eq(tables.chatMessage.id, messageId));

          // Update the createdMessage to include file parts
          createdMessage = {
            ...message,
            parts: combinedPartsForDb,
          } as typeof message;
        }

        // Cancel scheduled cleanup for attached uploads (non-blocking)
        if (isCleanupSchedulerAvailable(c.env)) {
          const cancelCleanupTasks = body.newMessage.attachmentIds.map(uploadId =>
            cancelUploadCleanup(c.env.UPLOAD_CLEANUP_SCHEDULER, uploadId).catch(() => {}),
          );
          if (c.executionCtx) {
            c.executionCtx.waitUntil(Promise.all(cancelCleanupTasks));
          } else {
            Promise.all(cancelCleanupTasks).catch(() => {});
          }
        }
      }

      // Update thread's lastMessageAt timestamp
      await db.update(tables.chatThread)
        .set({ lastMessageAt: now })
        .where(eq(tables.chatThread.id, id));

      // Invalidate message cache after new user message
      await invalidateMessagesCache(db, id);
    }

    return Responses.ok(c, {
      thread: updatedThreadWithParticipants,
      participants: updatedThreadWithParticipants.participants,
      message: createdMessage,
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

    // ✅ PUBLIC THREAD CACHE: Invalidate if thread was public
    // Also clears cached OG images from R2
    if (thread.isPublic && thread.slug) {
      await invalidatePublicThreadCache(db, thread.slug, id, c.env.UPLOADS_R2_BUCKET);
    }

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

    // ✅ DB-LEVEL CACHING: Cache public thread lookups (1 hour)
    const threads = await db
      .select()
      .from(tables.chatThread)
      .where(or(
        eq(tables.chatThread.slug, slug),
        eq(tables.chatThread.previousSlug, slug),
      ))
      .limit(1)
      .$withCache({
        config: { ex: 3600 }, // 1 hour cache
        tag: PublicThreadCacheTags.single(slug),
      });
    const thread = threads[0];
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

    // ✅ PERF OPTIMIZATION: Run all 6 queries in parallel with KV caching
    // Reduces latency from ~500ms (sequential) to ~100ms (parallel)
    // Each query uses $withCache for 1-hour KV caching
    const [
      ownerResults,
      participants,
      allMessages,
      allChangelog,
      allFeedback,
      allPreSearches,
    ] = await Promise.all([
      // 1. Thread owner (now cached)
      db.select()
        .from(tables.user)
        .where(eq(tables.user.id, thread.userId))
        .limit(1)
        .$withCache({
          config: { ex: 3600 }, // 1 hour cache
          tag: PublicThreadCacheTags.owner(thread.id),
        }),

      // 2. Participants (already cached)
      db.select()
        .from(tables.chatParticipant)
        .where(and(
          eq(tables.chatParticipant.threadId, thread.id),
          eq(tables.chatParticipant.isEnabled, true),
        ))
        .orderBy(tables.chatParticipant.priority, tables.chatParticipant.id)
        .$withCache({
          config: { ex: 3600 }, // 1 hour cache
          tag: ThreadCacheTags.participants(thread.id),
        }),

      // 3. Messages (already cached)
      // Exclude pre-search messages (rendered separately via PreSearchCard)
      db.select()
        .from(tables.chatMessage)
        .where(
          and(
            eq(tables.chatMessage.threadId, thread.id),
            notLike(tables.chatMessage.id, 'pre-search-%'),
          ),
        )
        .orderBy(
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        )
        .$withCache({
          config: { ex: 3600 }, // 1 hour - public thread messages are immutable
          tag: MessageCacheTags.byThread(thread.id),
        }),

      // 4. Changelog (now cached)
      db.select()
        .from(tables.chatThreadChangelog)
        .where(eq(tables.chatThreadChangelog.threadId, thread.id))
        .orderBy(desc(tables.chatThreadChangelog.createdAt))
        .$withCache({
          config: { ex: 3600 }, // 1 hour cache
          tag: PublicThreadCacheTags.changelog(thread.id),
        }),

      // 5. Feedback (now cached)
      db.select()
        .from(tables.chatRoundFeedback)
        .where(eq(tables.chatRoundFeedback.threadId, thread.id))
        .orderBy(tables.chatRoundFeedback.roundNumber)
        .$withCache({
          config: { ex: 3600 }, // 1 hour cache
          tag: PublicThreadCacheTags.feedback(thread.id),
        }),

      // 6. PreSearches (now cached)
      db.select()
        .from(tables.chatPreSearch)
        .where(and(
          eq(tables.chatPreSearch.threadId, thread.id),
          eq(tables.chatPreSearch.status, MessageStatuses.COMPLETE),
        ))
        .orderBy(tables.chatPreSearch.roundNumber)
        .$withCache({
          config: { ex: 3600 }, // 1 hour cache
          tag: PublicThreadCacheTags.preSearch(thread.id),
        }),
    ]);

    const ownerRecord = ownerResults[0];
    if (!ownerRecord) {
      throw createError.internal(
        'Thread owner not found',
        ErrorContextBuilders.resourceNotFound('user', thread.userId),
      );
    }
    // Extract only needed fields for response
    const threadOwner = {
      id: ownerRecord.id,
      name: ownerRecord.name,
      image: ownerRecord.image,
    };

    // ✅ PUBLIC PAGE FIX: Exclude incomplete rounds from public view
    // Incomplete rounds (mid-stream) can cause duplications when the same user
    // views the public page. Only show rounds that are fully complete.
    //
    // ✅ BUG FIX: Handle participant changes after round completion
    // Previous bug: If participants were added after round completion, old rounds
    // would be filtered out because assistantCount < enabledParticipantCount.
    //
    // NEW APPROACH: A round is considered complete if it has AT LEAST ONE assistant
    // response. For public threads (historical data), we trust that rounds were
    // complete when the thread was made public. The strict "all participants
    // responded" check fails when participants are added/removed post-publication.
    const roundHasUserMessage = new Map<number, boolean>();
    const roundHasAssistantResponse = new Map<number, boolean>();

    for (const msg of allMessages) {
      const round = msg.roundNumber;
      if (msg.role === MessageRoles.USER) {
        roundHasUserMessage.set(round, true);
      } else if (msg.role === MessageRoles.ASSISTANT && msg.participantId) {
        roundHasAssistantResponse.set(round, true);
      }
    }

    // Determine which rounds are complete
    // A round is complete if it has a user message AND at least one assistant response
    const completeRounds = new Set<number>();
    for (const [round, hasUser] of roundHasUserMessage) {
      if (hasUser && roundHasAssistantResponse.get(round)) {
        completeRounds.add(round);
      }
    }

    // Filter messages to only include complete rounds
    const messages = allMessages.filter(msg => completeRounds.has(msg.roundNumber));

    // ✅ PUBLIC PAGE FIX: Only show changelogs for complete rounds
    const changelog = allChangelog.filter(cl => completeRounds.has(cl.roundNumber));

    // ✅ TEXT STREAMING: Moderator messages are now in chatMessage with metadata.isModerator: true
    const analyses: never[] = [];

    const feedback = allFeedback.filter(f => completeRounds.has(f.roundNumber));

    // ✅ PUBLIC PAGE FIX: Only return pre-searches for complete rounds
    const preSearches = allPreSearches.filter(ps => completeRounds.has(ps.roundNumber));

    const response = Responses.ok(c, {
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

    // ✅ HTTP CACHING: Public threads are immutable once complete
    // Enable aggressive CDN caching for faster public page loads
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');
    response.headers.set('CDN-Cache-Control', 'max-age=86400'); // 24h Cloudflare cache
    response.headers.set('Vary', 'Accept-Encoding');

    return response;
  },
);

/**
 * List Public Thread Slugs Handler
 * Returns all public, active thread slugs for SSG/ISR page generation
 * Used by generateStaticParams in public thread pages
 *
 * ✅ AGGRESSIVE CACHING: 1-hour DB cache + 1-hour HTTP cache
 * This data changes infrequently and is critical for SSG build performance
 */
export const listPublicThreadSlugsHandler: RouteHandler<typeof listPublicThreadSlugsRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'listPublicThreadSlugs',
  },
  async (c) => {
    const db = await getDbAsync();

    // ✅ DB-LEVEL CACHING: Cache public slugs for 1 hour
    // Invalidated when thread visibility changes via invalidatePublicThreadCache()
    const publicThreads = await db
      .select()
      .from(tables.chatThread)
      .where(and(
        eq(tables.chatThread.isPublic, true),
        eq(tables.chatThread.status, ThreadStatusSchema.enum.active),
      ))
      .limit(1000)
      .$withCache({
        config: { ex: 3600 }, // 1 hour cache
        tag: PublicSlugsListCacheTags.list,
      });

    const slugs = publicThreads
      .filter(thread => thread.slug)
      .map(thread => ({ slug: thread.slug! }));

    const response = Responses.ok(c, { slugs });

    // ✅ HTTP CACHING: Enable CDN caching for SSG builds
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=1800');
    response.headers.set('CDN-Cache-Control', 'max-age=3600');

    return response;
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

    // ✅ PERF FIX: Cache thread lookup (was uncached, causing ~100ms per request)
    const threadResults = await db
      .select()
      .from(tables.chatThread)
      .where(or(
        eq(tables.chatThread.slug, slug),
        eq(tables.chatThread.previousSlug, slug),
      ))
      .limit(1)
      .$withCache({
        config: { ex: STALE_TIMES.threadDetailKV }, // 5 minutes
        tag: ThreadCacheTags.single(slug),
      });
    const thread = threadResults[0];

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', slug));
    }
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', slug),
      );
    }

    // ✅ PERF FIX: Parallelize ALL independent queries
    // Previously 6 sequential queries (~600ms) → now 3 parallel batches (~200ms)
    const [rawParticipants, userTier, rawMessages, preSearches] = await Promise.all([
      // Query 1: Participants (now cached)
      db
        .select()
        .from(tables.chatParticipant)
        .where(eq(tables.chatParticipant.threadId, thread.id))
        .orderBy(tables.chatParticipant.priority, tables.chatParticipant.id)
        .$withCache({
          config: { ex: STALE_TIMES.threadParticipantsKV }, // 10 minutes
          tag: ThreadCacheTags.participants(thread.id),
        }),

      // Query 2: User tier (already cached in getUserTier)
      getUserTier(user.id),

      // Query 3: Messages (already cached)
      db
        .select()
        .from(tables.chatMessage)
        .where(
          and(
            eq(tables.chatMessage.threadId, thread.id),
            notLike(tables.chatMessage.id, 'pre-search-%'),
          ),
        )
        .orderBy(
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        )
        .$withCache({
          config: { ex: STALE_TIMES.threadMessagesKV }, // 5 minutes
          tag: MessageCacheTags.byThread(thread.id),
        }),

      // Query 4: PreSearches (now cached)
      db
        .select()
        .from(tables.chatPreSearch)
        .where(eq(tables.chatPreSearch.threadId, thread.id))
        .orderBy(tables.chatPreSearch.roundNumber)
        .$withCache({
          config: { ex: STALE_TIMES.threadMessagesKV }, // 5 minutes
          tag: `presearch-${thread.id}`,
        }),
    ]);

    // ✅ DRY: Use enrichWithTierAccess helper (single source of truth)
    const participants = rawParticipants.map(participant => ({
      ...participant,
      ...enrichWithTierAccess(participant.modelId, userTier, getModelById),
    }));

    // ✅ ATTACHMENT SUPPORT: Load message attachments for user messages
    const userMessageIds = rawMessages
      .filter(m => m.role === MessageRoles.USER)
      .map(m => m.id);

    type MessageAttachment = {
      messageId: string;
      displayOrder: number;
      uploadId: string;
      filename: string;
      mimeType: string;
      fileSize: number;
    };

    // Get all attachments for user messages in one query (with cache)
    const messageAttachmentsRaw = userMessageIds.length > 0
      ? await db
          .select()
          .from(tables.messageUpload)
          .innerJoin(tables.upload, eq(tables.messageUpload.uploadId, tables.upload.id))
          .where(inArray(tables.messageUpload.messageId, userMessageIds))
          .orderBy(asc(tables.messageUpload.displayOrder))
          .$withCache({
            config: { ex: STALE_TIMES.threadMessagesKV }, // 5 minutes
            tag: `attachments-${thread.id}`,
          })
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
      const existing = attachmentsByMessage.get(att.messageId) ?? [];
      existing.push(att);
      attachmentsByMessage.set(att.messageId, existing);
    }

    // ✅ Transform messages to include file parts for user messages with attachments
    // ✅ SECURITY: Use signed URLs for secure, time-limited download access
    const baseUrl = new URL(c.req.url).origin;

    // ✅ PERF: Batch sign all attachments with single key import
    const allUploads: BatchSignOptions[] = messageAttachments.map(att => ({
      uploadId: att.uploadId,
      userId: thread.userId,
      threadId: thread.id,
      expirationMs: 60 * 60 * 1000,
    }));
    const signedPaths = await generateBatchSignedPaths(c, allUploads);

    const messages = rawMessages.map((msg) => {
      const attachments = attachmentsByMessage.get(msg.id);
      if (!attachments || attachments.length === 0 || msg.role !== MessageRoles.USER) {
        return msg;
      }

      const existingParts = msg.parts ?? [];
      const nonFileParts = existingParts.filter(p => p.type !== MessagePartTypes.FILE);
      const fileParts: ExtendedFilePart[] = attachments.map((att): ExtendedFilePart => {
        const signedPath = signedPaths.get(att.uploadId);
        if (!signedPath)
          throw new Error(`Missing signed path for upload ${att.uploadId}`);

        return {
          type: MessagePartTypes.FILE,
          url: `${baseUrl}${signedPath}`,
          filename: att.filename,
          mediaType: att.mimeType,
          uploadId: att.uploadId,
        };
      });

      return {
        ...msg,
        parts: [...fileParts, ...nonFileParts],
      };
    });

    // ✅ USER TIER CONFIG: Include subscription info for frontend access control
    // This allows the UI to show upgrade prompts and disable inaccessible models
    const userTierConfig = {
      tier: userTier,
      tier_name: SUBSCRIPTION_TIER_NAMES[userTier],
    };

    // ✅ PERF: Add cache headers for faster navigation
    // private = browser cache only (not CDN), stale-while-revalidate for instant loads
    c.header('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');

    return Responses.ok(c, {
      thread,
      participants,
      messages,
      preSearches,
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
      userTierConfig,
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
