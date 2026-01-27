import type { RouteHandler } from '@hono/zod-openapi';
import { PROJECT_LIMITS, SUBSCRIPTION_TIER_NAMES } from '@roundtable/shared';
import { ChangelogChangeTypes, ChangelogTypes, MessagePartTypes, MessageRoles, MessageStatuses, PlanTypes, SubscriptionTiers, ThreadStatusSchema } from '@roundtable/shared/enums';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, isNull, ne, notLike, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import Fuse from 'fuse.js';
import { ulid } from 'ulid';

import { executeBatch } from '@/common/batch-operations';
import { invalidateMessagesCache, invalidateProjectCache, invalidatePublicThreadCache, invalidateSidebarCache, invalidateThreadCache } from '@/common/cache-utils';
import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { verifyThreadOwnership } from '@/common/permissions';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createHandlerWithBatch,
  createTimestampCursor,
  getCursorOrderBy,
  IdParamSchema,
  Responses,
  ThreadIdParamSchema,
  ThreadSlugParamSchema,
} from '@/core';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import { MessageCacheTags, PublicSlugsListCacheTags, PublicThreadCacheTags, ThreadCacheTags } from '@/db/cache/cache-tags';
import { isModeChange, isWebSearchChange, safeParseChangelogData } from '@/db/schemas/chat-metadata';
import type {
  ChatCustomRole,
  ChatThreadUpdate,
} from '@/db/validation';
import { STALE_TIMES } from '@/lib/data/stale-times';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { sortByPriority } from '@/lib/utils';
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
  toModelForPricing,
} from '@/services/billing';
import { trackThreadCreated } from '@/services/errors';
import { getModelById } from '@/services/models';
import { autoLinkUploadsToProject } from '@/services/projects';
import { generateTitleFromMessage, generateUniqueSlug, updateThreadTitleAndSlug } from '@/services/prompts';
import { logModeChange, logWebSearchToggle } from '@/services/threads';
import { cancelUploadCleanup, deleteFile, generateBatchSignedPaths, isCleanupSchedulerAvailable } from '@/services/uploads';
import type { BatchSignOptions } from '@/services/uploads/signed-url.service';
import {
  getUserTier,
} from '@/services/usage';
import type { ApiEnv } from '@/types';

import type {
  createThreadRoute,
  deleteThreadRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadMemoryEventsRoute,
  getThreadRoute,
  getThreadSlugStatusRoute,
  listPublicThreadSlugsRoute,
  listSidebarThreadsRoute,
  listThreadsRoute,
  updateThreadRoute,
} from '../route';
import type { MessageAttachment } from '../schema';
import {
  CreateThreadRequestSchema,
  MemoryEventQuerySchema,
  ThreadListQuerySchema,
  UpdateThreadRequestSchema,
} from '../schema';

export const listThreadsHandler: RouteHandler<typeof listThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listThreads',
    validateQuery: ThreadListQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();
    const filters: SQL[] = [
      eq(tables.chatThread.userId, user.id),
      ne(tables.chatThread.status, ThreadStatusSchema.enum.deleted),
    ];

    // ✅ PROJECT FILTER: If projectId provided, verify ownership and filter by project
    if (query.projectId) {
      const project = await db.query.chatProject.findFirst({
        columns: { id: true },
        where: and(
          eq(tables.chatProject.id, query.projectId),
          eq(tables.chatProject.userId, user.id),
        ),
      });
      if (!project) {
        throw createError.notFound(`Project not found: ${query.projectId}`, {
          errorType: 'resource',
          resource: 'project',
          resourceId: query.projectId,
        });
      }
      filters.push(eq(tables.chatThread.projectId, query.projectId));
    } else {
      // Exclude project threads from main list when no projectId specified
      filters.push(isNull(tables.chatThread.projectId));
    }

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
        tag: query.projectId ? `project-threads-${query.projectId}` : ThreadCacheTags.list(user.id),
      });

    let threads = allThreads;
    if (query.search && query.search.trim().length > 0) {
      const fuse = new Fuse(allThreads, {
        ignoreLocation: true,
        includeScore: false,
        keys: ['title', 'slug'],
        minMatchCharLength: 2,
        threshold: 0.3,
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

    // ✅ PROJECT THREADS: Omit isFavorite for project threads (not supported)
    const transformedItems = query.projectId
      ? items.map(({ isFavorite: _isFavorite, ...rest }) => rest)
      : items;

    // ✅ PERF: Cache sidebar thread list for faster navigation
    // CDN-Cache-Control: no-store prevents Cloudflare edge caching for mutable user data
    c.header('Cache-Control', 'private, no-cache, must-revalidate');
    c.header('CDN-Cache-Control', 'no-store');

    return Responses.cursorPaginated(c, transformedItems, pagination);
  },
);

export const listSidebarThreadsHandler: RouteHandler<typeof listSidebarThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listSidebarThreads',
    validateQuery: ThreadListQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();

    const filters: SQL[] = [
      eq(tables.chatThread.userId, user.id),
      ne(tables.chatThread.status, ThreadStatusSchema.enum.deleted),
    ];

    // ✅ PROJECT FILTER: If projectId provided, verify ownership and filter by project
    if (query.projectId) {
      const project = await db.query.chatProject.findFirst({
        columns: { id: true },
        where: and(
          eq(tables.chatProject.id, query.projectId),
          eq(tables.chatProject.userId, user.id),
        ),
      });
      if (!project) {
        throw createError.notFound(`Project not found: ${query.projectId}`, {
          errorType: 'resource',
          resource: 'project',
          resourceId: query.projectId,
        });
      }
      filters.push(eq(tables.chatThread.projectId, query.projectId));
    } else {
      // Exclude project threads from sidebar when no projectId specified
      filters.push(isNull(tables.chatThread.projectId));
    }

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
        tag: query.projectId ? `project-sidebar-${query.projectId}` : ThreadCacheTags.sidebar(user.id),
      });

    // Map to lightweight sidebar schema
    // ✅ PROJECT THREADS: Conditionally omit isFavorite for project threads
    const allThreads = allThreadsRaw.map(t => query.projectId
      ? {
          createdAt: t.createdAt,
          id: t.id,
          isPublic: t.isPublic,
          previousSlug: t.previousSlug,
          slug: t.slug,
          title: t.title,
          updatedAt: t.updatedAt,
        }
      : {
          createdAt: t.createdAt,
          id: t.id,
          isFavorite: t.isFavorite,
          isPublic: t.isPublic,
          previousSlug: t.previousSlug,
          slug: t.slug,
          title: t.title,
          updatedAt: t.updatedAt,
        });

    let threads = allThreads;
    if (query.search?.trim()) {
      const fuse = new Fuse(allThreads, {
        ignoreLocation: true,
        keys: ['title', 'slug'],
        minMatchCharLength: 2,
        threshold: 0.3,
      });
      threads = fuse.search(query.search.trim()).map(r => r.item).slice(0, query.limit + 1);
    }

    const { items, pagination } = applyCursorPagination(
      threads,
      query.limit,
      thread => createTimestampCursor(thread.updatedAt),
    );

    // CDN-Cache-Control: no-store prevents Cloudflare edge caching for mutable user data
    c.header('Cache-Control', 'private, no-cache, must-revalidate');
    c.header('CDN-Cache-Control', 'no-store');
    return Responses.cursorPaginated(c, items, pagination);
  },
);

export const createThreadHandler: RouteHandler<typeof createThreadRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    operationName: 'createThread',
    validateBody: CreateThreadRequestSchema,
  },
  async (c, batch) => {
    const { user } = c.auth();

    // 🔍 DEBUG: Log thread creation attempt (enable with DEBUG_REQUESTS=true)
    // Use variable to access index signature property safely
    const debugEnvKey = 'DEBUG_REQUESTS';
    const debugRequests = process.env[debugEnvKey] === 'true';
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] Starting thread creation for user:', user.id, user.email);
    }

    // ✅ FREE USER THREAD LIMIT: Free users can only create ONE thread total
    // This check runs BEFORE credit enforcement to provide a clearer error message
    const creditBalance = await getUserCreditBalance(user.id);
    if (debugRequests) {
      console.error('[CREATE-THREAD-DEBUG] Credit balance:', {
        balance: creditBalance.balance,
        planType: creditBalance.planType,
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

    // ✅ PROJECT THREAD LIMIT: Check thread count if creating thread in a project
    if (body.projectId) {
      const existingThreads = await db.query.chatThread.findMany({
        columns: { id: true },
        where: eq(tables.chatThread.projectId, body.projectId),
      });

      if (existingThreads.length >= PROJECT_LIMITS.MAX_THREADS_PER_PROJECT) {
        throw createError.unauthorized(
          `Thread limit reached for project (max ${PROJECT_LIMITS.MAX_THREADS_PER_PROJECT})`,
          {
            errorType: 'quota',
            resource: 'thread',
            resourceId: body.projectId,
          },
        );
      }
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
          found: !!model,
          modelId: participant.modelId,
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
        const modelForPricing = toModelForPricing(participant.modelId);
        if (!modelForPricing) {
          throw createError.badRequest(
            `Model "${participant.modelId}" pricing information not found`,
            {
              errorType: 'validation',
              field: 'participants.modelId',
            },
          );
        }
        const canAccess = canAccessModelByPricing(userTier, modelForPricing);
        if (!canAccess) {
          const requiredTier = getRequiredTierForModel(modelForPricing);
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
        createdAt: now,
        enableWebSearch: body.enableWebSearch ?? false,
        id: threadId,
        isFavorite: false,
        isPublic: false,
        lastMessageAt: now,
        metadata: body.metadata,
        mode: body.mode,
        projectId: body.projectId ?? null,
        slug: tempSlug,
        status: ThreadStatusSchema.enum.active,
        title: tempTitle,
        updatedAt: now,
        userId: user.id,
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
            maxTokens: p.maxTokens,
            systemPrompt,
            temperature: p.temperature,
          }
        : undefined;
      return {
        customRoleId: p.customRoleId,
        id: participantId,
        isEnabled: true,
        modelId: p.modelId,
        priority: index,
        role,
        threadId,
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
        createdAt: now,
        id: firstMessageId,
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 0, // ✅ CRITICAL: Must be in metadata for frontend transform
        },
        parts: [{ text: body.firstMessage, type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER,
        roundNumber: 0, // ✅ 0-BASED: First round is 0
        threadId,
      })
      .returning();
    // ✅ CREDITS: Deduct for thread creation (includes first message)
    await deductCreditsForAction(user.id, 'threadCreation', { threadId });
    await invalidateThreadCache(db, user.id, threadId);
    await invalidateMessagesCache(db, threadId);

    // ✅ CACHE: Invalidate project caches when thread is created in a project
    if (body.projectId) {
      await invalidateProjectCache(db, body.projectId);
    }

    // ✅ Associate attachments with the first user message and add file parts
    let messageWithFileParts = firstMessage;
    if (body.attachmentIds && body.attachmentIds.length > 0 && firstMessage) {
      // Get upload details for constructing file parts
      const uploads = await db.query.upload.findMany({
        columns: {
          filename: true,
          id: true,
          mimeType: true,
        },
        where: inArray(tables.upload.id, body.attachmentIds),
      });

      // Create map for ordered lookup
      const uploadMap = new Map(uploads.map(u => [u.id, u]));

      // Insert message-upload associations
      const messageUploadValues = body.attachmentIds.map((uploadId, index) => ({
        createdAt: now,
        displayOrder: index,
        id: ulid(),
        messageId: firstMessage.id,
        uploadId,
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
          expirationMs: 7 * 24 * 60 * 60 * 1000,
          threadId,
          uploadId,
          userId: user.id,
        }));
      const dbSignedPaths = await generateBatchSignedPaths(c, dbSignOptions);

      const filePartsForDb: ExtendedFilePart[] = body.attachmentIds
        .map((uploadId): ExtendedFilePart | null => {
          const upload = uploadMap.get(uploadId);
          const signedPath = dbSignedPaths.get(uploadId);
          if (!upload || !signedPath) {
            return null;
          }
          return {
            filename: upload.filename,
            mediaType: upload.mimeType,
            type: MessagePartTypes.FILE,
            uploadId,
            url: `${baseUrlForDb}${signedPath}`,
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
        const cancelCleanupTasks = body.attachmentIds.map(async uploadId =>
          await cancelUploadCleanup(c.env.UPLOAD_CLEANUP_SCHEDULER, uploadId).catch(() => {}),
        );
        if (c.executionCtx) {
          c.executionCtx.waitUntil(Promise.all(cancelCleanupTasks));
        } else {
          Promise.all(cancelCleanupTasks).catch(() => {});
        }
      }

      // ✅ Auto-link uploads to project if thread belongs to a project
      if (body.projectId) {
        await autoLinkUploadsToProject({
          db,
          executionCtx: c.executionCtx,
          projectId: body.projectId,
          r2Bucket: c.env.UPLOADS_R2_BUCKET,
          threadId,
          uploadIds: body.attachmentIds,
          userId: user.id,
        });
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
          expirationMs: 60 * 60 * 1000,
          threadId,
          uploadId,
          userId: user.id,
        }));
      const uiSignedPaths = await generateBatchSignedPaths(c, uiSignOptions);

      const fileParts: ExtendedFilePart[] = body.attachmentIds
        .map((uploadId): ExtendedFilePart | null => {
          const upload = uploadMap.get(uploadId);
          const signedPath = uiSignedPaths.get(uploadId);
          if (!upload || !signedPath) {
            return null;
          }
          return {
            filename: upload.filename,
            mediaType: upload.mimeType,
            type: MessagePartTypes.FILE,
            uploadId,
            url: `${baseUrl}${signedPath}`,
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
        createdAt: now,
        id: ulid(),
        roundNumber: 0, // ✅ 0-BASED: First round is 0
        status: MessageStatuses.PENDING,
        threadId,
        userQuery: body.firstMessage,
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
          threadId,
          userId: user.id,
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
            sessionId: session?.id,
            threadId,
            threadMode: body.mode,
            userId: user.id,
            userTier,
          },
          {
            enableWebSearch: body.enableWebSearch ?? false,
            models: participants.map(p => p.modelId),
            participantCount: participants.length,
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
      changelog: [],
      messages: [messageWithFileParts],
      participants,
      thread,
      user: {
        id: user.id,
        image: user.image,
        name: user.name,
      },
    });
  },
);
export const getThreadHandler: RouteHandler<typeof getThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session-optional',
    operationName: 'getThread',
    validateParams: IdParamSchema,
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
    const participants = rawParticipants.map((participant: typeof tables.chatParticipant.$inferSelect) => ({
      ...participant,
      ...enrichWithTierAccess(participant.modelId, userTier, toModelForPricing),
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
      changelog,
      messages,
      participants,
      thread,
      user: {
        id: threadOwner.id,
        image: threadOwner.image,
        name: threadOwner.name,
      },
      userTierConfig,
    });
  },
);
export const updateThreadHandler: RouteHandler<typeof updateThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'updateThread',
    validateBody: UpdateThreadRequestSchema,
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();
    const thread = await verifyThreadOwnership(id, user.id, db);
    const now = new Date();

    // ✅ BUSINESS RULE: Project threads cannot be favorited
    // If setting isFavorite=true AND thread already has projectId → throw 400 error
    if (body.isFavorite === true && thread.projectId) {
      throw createError.badRequest(
        'Project threads cannot be favorited',
        { errorType: 'validation', field: 'isFavorite' },
      );
    }

    // ✅ BUSINESS RULE: Clear isFavorite when assigning thread to a project
    // If setting projectId on thread that has isFavorite=true → clear isFavorite
    if (body.projectId !== undefined && body.projectId !== null && thread.isFavorite === true) {
      body.isFavorite = false;
    }

    if (body.participants !== undefined) {
      const currentParticipants = await db.query.chatParticipant.findMany({
        where: eq(tables.chatParticipant.threadId, id),
      });
      const currentMap = new Map(currentParticipants.map(p => [p.id, p]));
      // ✅ FIX: Also map by modelId to handle re-enabling disabled participants
      // This prevents UNIQUE constraint violations when participant sent without id
      // but modelId already exists in thread (even if disabled)
      const currentByModelId = new Map(currentParticipants.map(p => [p.modelId, p]));
      const newMap = new Map(
        body.participants
          .filter((p): p is typeof p & { id: string } => Boolean(p.id))
          .map(p => [p.id, p]),
      );
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
                customRoleId: newP.customRoleId,
                isEnabled: newP.isEnabled ?? true,
                modelId: newP.modelId,
                priority: newP.priority,
                role: newP.role,
                updatedAt: now,
              },
            });
            // Mark as handled so it won't be disabled later
            newMap.set(existingByModel.id, { ...newP, id: existingByModel.id });
          } else {
            // Truly new participant - insert
            const participantId = ulid();
            participantsToInsert.push({
              createdAt: now,
              customRoleId: newP.customRoleId,
              id: participantId,
              isEnabled: newP.isEnabled ?? true,
              modelId: newP.modelId,
              priority: newP.priority,
              role: newP.role,
              settings: null,
              threadId: id,
              updatedAt: now,
            });
          }
        } else {
          const current = currentMap.get(newP.id);
          if (!current) {
            continue;
          }
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
                customRoleId: newP.customRoleId,
                isEnabled: newP.isEnabled ?? true,
                modelId: newP.modelId,
                priority: newP.priority,
                role: newP.role,
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
      const batchOperations: BatchItem<'sqlite'>[] = [];
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
              set: {
                customRoleId: participant.customRoleId,
                isEnabled: participant.isEnabled,
                priority: participant.priority,
                role: participant.role,
                settings: participant.settings,
                updatedAt: participant.updatedAt,
              },
              target: [tables.chatParticipant.threadId, tables.chatParticipant.modelId],
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
        limit: 1,
        orderBy: [desc(tables.chatMessage.createdAt)],
        where: eq(tables.chatMessage.threadId, id),
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
            .map(p => [p.modelId, { id: p.id, modelId: p.modelId, role: p.role }]),
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
              changeData: {
                modelId,
                role: newP.role,
                type: ChangelogChangeTypes.PARTICIPANT,
              },
              changeSummary: `Added ${displayName}`,
              changeType: ChangelogTypes.ADDED,
              createdAt: now,
              id: ulid(),
              roundNumber: nextRoundNumber,
              threadId: id,
            });
          }
        }

        // Detect removed participants (in previous but not in new)
        for (const [modelId, prevP] of prevParticipantsMap) {
          if (!newParticipantsMap.has(modelId)) {
            const modelName = extractModelName(modelId);
            const displayName = prevP.role || modelName;
            changelogEntries.push({
              changeData: {
                modelId,
                participantId: prevP.id,
                role: prevP.role,
                type: ChangelogChangeTypes.PARTICIPANT,
              },
              changeSummary: `Removed ${displayName}`,
              changeType: ChangelogTypes.REMOVED,
              createdAt: now,
              id: ulid(),
              roundNumber: nextRoundNumber,
              threadId: id,
            });
          }
        }

        // Insert changelog entries if any changes exist
        if (changelogEntries.length > 0) {
          await db.insert(tables.chatThreadChangelog).values(changelogEntries);
          // ✅ CACHE FIX: Invalidate changelog cache after inserting entries
          // Without this, the changelog query returns stale/empty data from cache
          await invalidateMessagesCache(db, id);
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
          limit: 1,
          orderBy: [desc(tables.chatMessage.createdAt)],
          where: eq(tables.chatMessage.threadId, id),
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
                changeData: {
                  newMode: body.mode,
                  oldMode: baselineMode,
                  type: ChangelogChangeTypes.MODE_CHANGE,
                },
                changeSummary: `Changed conversation mode from ${baselineMode} to ${body.mode}`,
                createdAt: now,
              })
              .where(eq(tables.chatThreadChangelog.id, existingModeChange.id));
          }
        } else {
          // ✅ SERVICE LAYER: Use thread-changelog.service for new changelog creation
          await logModeChange(id, nextRoundNumber, thread.mode, body.mode);
        }
        // ✅ CACHE FIX: Invalidate changelog cache after mode change entries
        await invalidateMessagesCache(db, id);
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
          limit: 1,
          orderBy: [desc(tables.chatMessage.createdAt)],
          where: eq(tables.chatMessage.threadId, id),
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
                changeData: {
                  enabled: body.enableWebSearch,
                  type: ChangelogChangeTypes.WEB_SEARCH,
                },
                changeSummary: body.enableWebSearch ? 'Enabled web search' : 'Disabled web search',
                createdAt: now,
              })
              .where(eq(tables.chatThreadChangelog.id, existingWebSearchChange.id));
          }
        } else {
          // ✅ SERVICE LAYER: Use thread-changelog.service for new changelog creation
          await logWebSearchToggle(id, nextRoundNumber, body.enableWebSearch);
        }
        // ✅ CACHE FIX: Invalidate changelog cache after web search toggle entries
        await invalidateMessagesCache(db, id);
      }
    }

    // Build update object using schema-derived type
    const updateData: ChatThreadUpdate = {
      updatedAt: now,
    };
    if (body.title !== undefined && body.title !== null && typeof body.title === 'string') {
      updateData.title = body.title;
    }
    if (body.mode !== undefined) {
      updateData.mode = body.mode;
    }
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    if (body.isFavorite !== undefined) {
      updateData.isFavorite = body.isFavorite;
    }
    if (body.isPublic !== undefined) {
      updateData.isPublic = body.isPublic;
    }
    if (body.enableWebSearch !== undefined) {
      updateData.enableWebSearch = body.enableWebSearch;
    }
    if (body.metadata !== undefined) {
      updateData.metadata = body.metadata ?? undefined;
    }
    // ✅ PROJECT ASSIGNMENT: Validate user owns target project before assignment
    if (body.projectId !== undefined) {
      if (body.projectId === null) {
        // Explicitly removing from project
        updateData.projectId = null;
      } else {
        // Validate user owns the target project
        const project = await db.query.chatProject.findFirst({
          where: and(
            eq(tables.chatProject.id, body.projectId),
            eq(tables.chatProject.userId, user.id),
          ),
        });
        if (!project) {
          throw createError.notFound('Project not found', ErrorContextBuilders.resourceNotFound('project', body.projectId, user.id));
        }
        updateData.projectId = body.projectId;
      }
    }
    await db.update(tables.chatThread)
      .set(updateData)
      .where(eq(tables.chatThread.id, id));
    const updatedThreadWithParticipants = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
      with: {
        participants: {
          orderBy: [asc(tables.chatParticipant.priority)],
          where: eq(tables.chatParticipant.isEnabled, true),
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
    // CRITICAL: Must invalidate BOTH current slug AND previousSlug caches
    // since public pages can be accessed via either URL
    if (body.isPublic !== undefined && thread.slug) {
      await invalidatePublicThreadCache(db, thread.slug, id, c.env.UPLOADS_R2_BUCKET);
      // Also invalidate previousSlug cache if it exists
      if (thread.previousSlug) {
        await invalidatePublicThreadCache(db, thread.previousSlug, id, c.env.UPLOADS_R2_BUCKET);
      }
    }

    // ✅ NEW MESSAGE CREATION: Create user message if provided
    // ✅ CRITICAL FIX: Use provided ID if present, otherwise generate new ULID
    // Streaming handler expects user messages to be pre-persisted with the EXACT ID
    // that the frontend sends in the streaming request. If we generate a different ID,
    // streaming will fail with "User message not found in DB" error.
    let createdMessage: typeof tables.chatMessage.$inferSelect | undefined;
    if (body.newMessage) {
      const messageId = body.newMessage.id || ulid();
      const messageParts: { type: 'text'; text: string }[] = [
        { text: body.newMessage.content, type: MessagePartTypes.TEXT },
      ];

      // ✅ IDEMPOTENT: Use onConflictDoNothing to handle retry/double-submit cases
      // The same message ID may be sent multiple times (StrictMode, retry, double-click)
      const [message] = await db
        .insert(tables.chatMessage)
        .values({
          createdAt: now,
          id: messageId,
          metadata: {
            role: MessageRoles.USER,
            roundNumber: body.newMessage.roundNumber,
          },
          parts: messageParts,
          role: MessageRoles.USER,
          roundNumber: body.newMessage.roundNumber,
          threadId: id,
        })
        .onConflictDoNothing({ target: tables.chatMessage.id })
        .returning();

      // If conflict occurred, fetch the existing message
      if (!message) {
        const existingMessage = await db.query.chatMessage.findFirst({
          where: eq(tables.chatMessage.id, messageId),
        });
        createdMessage = existingMessage ?? undefined;
      } else {
        createdMessage = message;
      }

      // ✅ ATTACHMENT SUPPORT: Handle attachments if provided
      if (body.newMessage.attachmentIds && body.newMessage.attachmentIds.length > 0) {
        // Get upload details for constructing file parts
        const uploads = await db.query.upload.findMany({
          columns: {
            filename: true,
            id: true,
            mimeType: true,
          },
          where: inArray(tables.upload.id, body.newMessage.attachmentIds),
        });

        const uploadMap = new Map(uploads.map(u => [u.id, u]));

        // Insert message-upload associations
        const messageUploadValues = body.newMessage.attachmentIds.map((uploadId, index) => ({
          createdAt: now,
          displayOrder: index,
          id: ulid(),
          messageId,
          uploadId,
        }));
        await db.insert(tables.messageUpload).values(messageUploadValues);

        // Generate signed URLs and add file parts to message
        const baseUrl = new URL(c.req.url).origin;

        // ✅ PERF: Batch sign all attachments with single key import
        const signOptions: BatchSignOptions[] = body.newMessage.attachmentIds
          .filter(uploadId => uploadMap.has(uploadId))
          .map(uploadId => ({
            expirationMs: 7 * 24 * 60 * 60 * 1000,
            threadId: id,
            uploadId,
            userId: user.id,
          }));
        const signedPaths = await generateBatchSignedPaths(c, signOptions);

        const filePartsForDb: ExtendedFilePart[] = body.newMessage.attachmentIds
          .map((uploadId): ExtendedFilePart | null => {
            const upload = uploadMap.get(uploadId);
            const signedPath = signedPaths.get(uploadId);
            if (!upload || !signedPath) {
              return null;
            }
            return {
              filename: upload.filename,
              mediaType: upload.mimeType,
              type: MessagePartTypes.FILE,
              uploadId,
              url: `${baseUrl}${signedPath}`,
            };
          })
          .filter((p): p is ExtendedFilePart => p !== null);

        // Update message parts to include file parts
        if (filePartsForDb.length > 0 && message) {
          const combinedPartsForDb = [...filePartsForDb, ...messageParts];
          await db.update(tables.chatMessage)
            .set({ parts: combinedPartsForDb })
            .where(eq(tables.chatMessage.id, messageId));

          // Update the createdMessage to include file parts
          createdMessage = {
            ...message,
            parts: combinedPartsForDb,
          };
        }

        // Cancel scheduled cleanup for attached uploads (non-blocking)
        if (isCleanupSchedulerAvailable(c.env)) {
          const cancelCleanupTasks = body.newMessage.attachmentIds.map(async uploadId =>
            await cancelUploadCleanup(c.env.UPLOAD_CLEANUP_SCHEDULER, uploadId).catch(() => {}),
          );
          if (c.executionCtx) {
            c.executionCtx.waitUntil(Promise.all(cancelCleanupTasks));
          } else {
            Promise.all(cancelCleanupTasks).catch(() => {});
          }
        }

        // ✅ Auto-link uploads to project if thread belongs to a project
        if (thread.projectId) {
          await autoLinkUploadsToProject({
            db,
            executionCtx: c.executionCtx,
            projectId: thread.projectId,
            r2Bucket: c.env.UPLOADS_R2_BUCKET,
            threadId: id,
            uploadIds: body.newMessage.attachmentIds,
            userId: user.id,
          });
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
      message: createdMessage,
      participants: updatedThreadWithParticipants.participants,
      thread: updatedThreadWithParticipants,
    });
  },
);
/**
 * Delete a thread with FULL CASCADE
 *
 * Hard deletes the thread and all related data:
 * - All messages and their uploads
 * - All participants, changelogs, pre-searches
 * - All project memories from this thread
 * - All project attachments linked to this thread
 * - All junction table records (threadUpload, messageUpload)
 * - All R2 files from uploads
 */
export const deleteThreadHandler: RouteHandler<typeof deleteThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'deleteThread',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const thread = await verifyThreadOwnership(id, user.id, db);

    // =========================================================================
    // STEP 1: Collect all data for cascade deletion
    // =========================================================================

    // Get all messages for this thread
    const messages = await db.query.chatMessage.findMany({
      columns: { id: true },
      where: eq(tables.chatMessage.threadId, id),
    });
    const messageIds = messages.map(m => m.id);

    // Get thread uploads for R2 cleanup
    const threadUploads = await db.query.threadUpload.findMany({
      where: eq(tables.threadUpload.threadId, id),
      with: {
        upload: {
          columns: { r2Key: true },
        },
      },
    });

    // Get message uploads for R2 cleanup
    const messageUploads = messageIds.length > 0
      ? await db.query.messageUpload.findMany({
          where: inArray(tables.messageUpload.messageId, messageIds),
          with: {
            upload: {
              columns: { r2Key: true },
            },
          },
        })
      : [];

    // Get project attachments linked via ragMetadata.sourceThreadId
    const linkedAttachments = await db.query.projectAttachment.findMany({
      where: sql`json_extract(${tables.projectAttachment.ragMetadata}, '$.sourceThreadId') = ${id}`,
    });

    // =========================================================================
    // STEP 2: Delete junction table records (no FK constraints to thread/message)
    // Must delete before thread/messages due to missing FKs
    // =========================================================================

    await db.delete(tables.threadUpload)
      .where(eq(tables.threadUpload.threadId, id));

    if (messageIds.length > 0) {
      await db.delete(tables.messageUpload)
        .where(inArray(tables.messageUpload.messageId, messageIds));
    }

    // =========================================================================
    // STEP 3: Delete project memories from this thread (HARD DELETE)
    // =========================================================================

    await db.delete(tables.projectMemory)
      .where(eq(tables.projectMemory.sourceThreadId, id));

    // =========================================================================
    // STEP 4: Delete project attachments linked to this thread
    // =========================================================================

    if (linkedAttachments.length > 0) {
      await db.delete(tables.projectAttachment)
        .where(sql`json_extract(${tables.projectAttachment.ragMetadata}, '$.sourceThreadId') = ${id}`);
    }

    // =========================================================================
    // STEP 5: Invalidate caches before deletion
    // =========================================================================

    await invalidateThreadCache(db, user.id, id, thread.slug);

    if (thread.projectId) {
      await invalidateProjectCache(db, thread.projectId);
    }

    if (thread.isPublic && thread.slug) {
      await invalidatePublicThreadCache(db, thread.slug, id, c.env.UPLOADS_R2_BUCKET);
      if (thread.previousSlug) {
        await invalidatePublicThreadCache(db, thread.previousSlug, id, c.env.UPLOADS_R2_BUCKET);
      }
    }

    // =========================================================================
    // STEP 6: HARD DELETE the thread (DB cascade handles messages, participants, etc.)
    // =========================================================================

    await db.delete(tables.chatThread).where(eq(tables.chatThread.id, id));

    // =========================================================================
    // STEP 7: Delete R2 files in background (non-blocking)
    // =========================================================================

    if (c.executionCtx && c.env.UPLOADS_R2_BUCKET) {
      const r2CleanupTasks: Promise<unknown>[] = [];

      // Delete thread upload files
      for (const threadUpload of threadUploads) {
        if (threadUpload.upload?.r2Key) {
          r2CleanupTasks.push(deleteFile(c.env.UPLOADS_R2_BUCKET, threadUpload.upload.r2Key));
        }
      }

      // Delete message upload files
      for (const messageUpload of messageUploads) {
        if (messageUpload.upload?.r2Key) {
          r2CleanupTasks.push(deleteFile(c.env.UPLOADS_R2_BUCKET, messageUpload.upload.r2Key));
        }
      }

      // Delete linked project attachment R2 files
      for (const attachment of linkedAttachments) {
        const ragMetadata = attachment.ragMetadata;
        if (ragMetadata?.projectR2Key) {
          r2CleanupTasks.push(deleteFile(c.env.UPLOADS_R2_BUCKET, ragMetadata.projectR2Key));
        }
      }

      if (r2CleanupTasks.length > 0) {
        c.executionCtx.waitUntil(Promise.all(r2CleanupTasks).catch(() => {}));
      }
    }

    return Responses.ok(c, {
      deleted: true,
      projectId: thread.projectId,
    });
  },
);
export const getPublicThreadHandler: RouteHandler<typeof getPublicThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'getPublicThread',
    validateParams: ThreadSlugParamSchema,
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

    // ✅ PERF OPTIMIZATION: Run all 5 queries in parallel with KV caching
    // Reduces latency from ~500ms (sequential) to ~100ms (parallel)
    // Each query uses $withCache for 1-hour KV caching
    const [
      ownerResults,
      participants,
      allMessages,
      allChangelog,
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

      // 5. PreSearches (now cached)
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
      image: ownerRecord.image,
      name: ownerRecord.name,
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

    // ✅ PUBLIC PAGE FIX: Only return pre-searches for complete rounds
    const preSearches = allPreSearches.filter(ps => completeRounds.has(ps.roundNumber));

    const response = Responses.ok(c, {
      analyses,
      changelog,
      messages,
      participants,
      preSearches,
      thread,
      user: {
        id: threadOwner.id,
        image: threadOwner.image,
        name: threadOwner.name,
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
      .filter((thread): thread is typeof thread & { slug: string } => Boolean(thread.slug))
      .map(thread => ({ slug: thread.slug }));

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
    operationName: 'getThreadBySlug',
    validateParams: ThreadSlugParamSchema,
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
        // ✅ FIX: Use bySlug for slug-based lookups, not single (which expects threadId)
        tag: ThreadCacheTags.bySlug(slug),
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
          // ✅ FIX: Use standardized cache tag so invalidateMessagesCache clears this too
          tag: MessageCacheTags.preSearch(thread.id),
        }),
    ]);

    // DEBUG: Log query results immediately after Promise.all
    console.info(`[getThreadBySlug:query] threadId=${thread.id} rawParts=${rawParticipants.length} rawMsgs=${rawMessages.length} preSearch=${preSearches.length} cacheTag=${MessageCacheTags.byThread(thread.id)}`);

    // DEBUG: Query DB directly without cache to compare
    if (rawMessages.length === 0) {
      const dbMessages = await db
        .select()
        .from(tables.chatMessage)
        .where(eq(tables.chatMessage.threadId, thread.id))
        .limit(5);
      const dbParts = await db
        .select()
        .from(tables.chatParticipant)
        .where(eq(tables.chatParticipant.threadId, thread.id));
      console.info(`[getThreadBySlug:DB-DIRECT] threadId=${thread.id} dbMsgs=${dbMessages.length} dbParts=${dbParts.length} (bypassing cache)`);
    }

    // ✅ DRY: Use enrichWithTierAccess helper (single source of truth)
    const participants = rawParticipants.map((participant: typeof tables.chatParticipant.$inferSelect) => ({
      ...participant,
      ...enrichWithTierAccess(participant.modelId, userTier, toModelForPricing),
    }));

    // ✅ ATTACHMENT SUPPORT: Load message attachments for user messages
    const userMessageIds = rawMessages
      .filter((m: typeof tables.chatMessage.$inferSelect) => m.role === MessageRoles.USER)
      .map((m: typeof tables.chatMessage.$inferSelect) => m.id);

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
            // ✅ FIX: Use standardized cache tag so invalidateMessagesCache clears this too
            tag: MessageCacheTags.attachments(thread.id),
          })
      : [];

    // Transform to flat structure
    const messageAttachments: MessageAttachment[] = messageAttachmentsRaw.map(row => ({
      displayOrder: row.message_upload.displayOrder,
      filename: row.upload.filename,
      fileSize: row.upload.fileSize,
      messageId: row.message_upload.messageId,
      mimeType: row.upload.mimeType,
      uploadId: row.upload.id,
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
      expirationMs: 60 * 60 * 1000,
      threadId: thread.id,
      uploadId: att.uploadId,
      userId: thread.userId,
    }));
    const signedPaths = await generateBatchSignedPaths(c, allUploads);

    const messages = rawMessages.map((msg: typeof tables.chatMessage.$inferSelect) => {
      const attachments = attachmentsByMessage.get(msg.id);
      if (!attachments || attachments.length === 0 || msg.role !== MessageRoles.USER) {
        return msg;
      }

      const existingParts = msg.parts ?? [];
      const nonFileParts = existingParts.filter(p => p.type !== MessagePartTypes.FILE);
      const fileParts: ExtendedFilePart[] = attachments.map((att: MessageAttachment): ExtendedFilePart => {
        const signedPath = signedPaths.get(att.uploadId);
        if (!signedPath) {
          throw new Error(`Missing signed path for upload ${att.uploadId}`);
        }

        return {
          filename: att.filename,
          mediaType: att.mimeType,
          type: MessagePartTypes.FILE,
          uploadId: att.uploadId,
          url: `${baseUrl}${signedPath}`,
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

    // ✅ CACHE: Prevent stale HTTP cache for mutable user data
    // KV cache with tags handles server-side caching (invalidated on title/thread updates)
    // HTTP no-cache ensures browser revalidates - server responds fast from KV if tags valid
    c.header('Cache-Control', 'private, no-cache, must-revalidate');
    c.header('CDN-Cache-Control', 'no-store');

    // DEBUG: Log message count
    console.info(`[getThreadBySlug] slug=${slug} threadId=${thread.id} rawMsgs=${rawMessages.length} msgs=${messages.length} parts=${rawParticipants.length}`);

    return Responses.ok(c, {
      messages,
      participants,
      preSearches,
      thread,
      user: {
        id: user.id,
        image: user.image,
        name: user.name,
      },
      userTierConfig,
    });
  },
);
export const getThreadSlugStatusHandler: RouteHandler<typeof getThreadSlugStatusRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadSlugStatus',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      columns: {
        isAiGeneratedTitle: true,
        slug: true,
        title: true,
        userId: true,
      },
      where: eq(tables.chatThread.id, id),
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
      isAiGeneratedTitle: thread.isAiGeneratedTitle,
      slug: thread.slug,
      title: thread.title,
    });
  },
);

/**
 * Get Memory Events Handler
 * ✅ MEMORY EVENTS: Poll for memory creation events after round completes
 */
export const getThreadMemoryEventsHandler: RouteHandler<typeof getThreadMemoryEventsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadMemoryEvents',
    validateParams: ThreadIdParamSchema,
    validateQuery: MemoryEventQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId } = c.validated.params;
    const { roundNumber } = c.validated.query;

    // Verify thread ownership
    const db = await getDbAsync();
    const thread = await db.query.chatThread.findFirst({
      columns: { projectId: true, userId: true },
      where: eq(tables.chatThread.id, threadId),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId));
    }
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', threadId),
      );
    }

    // Check KV for memory event
    const memoryEventKey = `memory-event:${threadId}:${roundNumber}`;
    const eventData = await c.env.KV.get(memoryEventKey);

    if (!eventData) {
      return Responses.ok(c, null);
    }

    try {
      const parsed = JSON.parse(eventData);
      return Responses.ok(c, parsed);
    } catch {
      console.error('[MemoryEvents] Failed to parse KV data', { key: memoryEventKey });
      return Responses.ok(c, null);
    }
  },
);
