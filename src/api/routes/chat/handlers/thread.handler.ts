/**
 * Thread Handlers - CRUD operations for chat threads
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Extracted from monolithic handler.ts for better maintainability
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import Fuse from 'fuse.js';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
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
import {
  CreateThreadRequestSchema,
  ThreadListQuerySchema,
  UpdateThreadRequestSchema,
} from '../schema';
import { verifyThreadOwnership } from './helpers';

// ============================================================================
// Thread Handlers
// ============================================================================

export const listThreadsHandler: RouteHandler<typeof listThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ThreadListQuerySchema,
    operationName: 'listThreads',
  },
  async (c) => {
    // With auth: 'session', c.auth() provides type-safe access to user and session
    const { user } = c.auth();

    // Use validated query parameters
    const query = c.validated.query;
    const db = await getDbAsync();

    // Build filters for thread query (no search filter - we'll use fuzzy search)
    const filters: SQL[] = [
      eq(tables.chatThread.userId, user.id),
      ne(tables.chatThread.status, 'deleted'), // Exclude deleted threads
    ];

    // Fetch threads with cursor-based pagination
    // For search: fetch more threads initially for fuzzy filtering (up to 200)
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

    // Apply fuzzy search if search query is provided
    let threads = allThreads;
    if (query.search && query.search.trim().length > 0) {
      // Use fuse.js for fuzzy search on title
      const fuse = new Fuse(allThreads, {
        keys: ['title', 'slug'],
        threshold: 0.3, // Lower = stricter matching, Higher = more lenient
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeScore: false,
      });

      const searchResults = fuse.search(query.search.trim());
      threads = searchResults.map(result => result.item);

      // Limit fuzzy search results to requested page size + 1
      threads = threads.slice(0, query.limit + 1);
    }

    // Apply cursor pagination and format response
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

    // Enforce thread quota BEFORE creating anything
    // Message quota will be enforced by streamChatHandler when it creates the first message
    await enforceThreadQuota(user.id);

    const body = c.validated.body;
    // ✅ BATCH PATTERN: Access database through batch.db for atomic operations
    const db = batch.db;

    // Get user's subscription tier to validate model access
    // ✅ DRY: Using centralized getUserTier utility with 5-minute caching
    const userTier = await getUserTier(user.id);

    // ✅ SINGLE SOURCE OF TRUTH: Validate model access using backend service
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

      // ✅ PRICING-BASED ACCESS: Check using dynamic pricing from OpenRouter
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

    // Use temporary title - AI title will be generated asynchronously
    // But generate slug from first message immediately for nice URLs
    const tempTitle = 'New Chat';
    const tempSlug = await generateUniqueSlug(body.firstMessage);

    const threadId = ulid();
    const now = new Date();

    // Create thread with temporary title (will be updated asynchronously)
    const [thread] = await db
      .insert(tables.chatThread)
      .values({
        id: threadId,
        userId: user.id,
        title: tempTitle,
        slug: tempSlug,
        mode: (body.mode || 'brainstorming') as ChatMode,
        status: 'active',
        isFavorite: false,
        isPublic: false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .returning();

    // ✅ BATCH OPTIMIZATION: Pre-load all custom roles in single query instead of N queries
    // This reduces database round-trips from N to 1 when custom roles are used
    const customRoleIds = body.participants
      .map(p => p.customRoleId)
      .filter((id): id is string => !!id);

    const customRolesMap = new Map<string, typeof tables.chatCustomRole.$inferSelect>();
    if (customRoleIds.length > 0) {
      // ✅ BATCH PATTERN: Single query to load all custom roles using inArray
      const customRoles = await db.query.chatCustomRole.findMany({
        where: and(
          eq(tables.chatCustomRole.userId, user.id),
          inArray(tables.chatCustomRole.id, customRoleIds),
        ),
      });

      // Build map for O(1) lookup
      for (const role of customRoles) {
        customRolesMap.set(role.id, role);
      }

      // Verify all requested custom roles exist and belong to user
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
      let systemPrompt = p.systemPrompt; // Request systemPrompt takes precedence

      // Load system prompt from pre-fetched custom roles (no additional query)
      if (p.customRoleId && !systemPrompt) {
        const customRole = customRolesMap.get(p.customRoleId);
        if (customRole) {
          systemPrompt = customRole.systemPrompt;
        }
      }

      const participantId = ulid();

      // Only create settings object if at least one value is provided
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
        priority: index, // Array order determines priority
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

    // Verify at least one participant is enabled (all should be enabled at creation)
    const enabledCount = participants.filter(p => p && p.isEnabled).length;
    if (enabledCount === 0) {
      throw createError.badRequest(
        'No enabled participants in thread. At least one participant must be enabled to start a conversation.',
        { errorType: 'validation' },
      );
    }

    // Create first user message with Round 1 assignment
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

    // ✅ Invalidate backend cache for thread lists
    // This ensures new threads immediately appear in the sidebar
    if (db.$cache?.invalidate) {
      const { ThreadCacheTags } = await import('@/db/cache/cache-tags');
      await db.$cache.invalidate({
        tags: [ThreadCacheTags.list(user.id)],
      });
    }

    // Generate AI title asynchronously in background
    // This won't block the response, allowing immediate navigation with temp title
    // Fire-and-forget pattern (no await) - runs in background
    (async () => {
      try {
        // Generate AI title from first message (using fastest available model)
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env);

        // ✅ STABLE URL FIX: Only update title, NOT slug
        // Slug remains permanent to prevent 404 errors when client is using the original slug
        // Changing the slug after creation causes race conditions where the client still uses old slug

        // Update thread with AI-generated title only (slug stays the same)
        await db
          .update(tables.chatThread)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        // ✅ CRITICAL FIX: Invalidate cache after title update
        // This ensures the sidebar shows the updated AI-generated title immediately
        if (db.$cache?.invalidate) {
          const { ThreadCacheTags } = await import('@/db/cache/cache-tags');
          await db.$cache.invalidate({
            tags: [ThreadCacheTags.list(user.id)],
          });
        }
      } catch {
        // Log error but don't fail the request since thread is already created

      }
    })().catch(() => {
      // Intentionally suppressed - unhandled rejections in title generation
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
    auth: 'session-optional', // Allow both authenticated and unauthenticated access
    validateParams: IdParamSchema,
    operationName: 'getThread',
  },
  async (c) => {
    const user = c.get('user'); // May be null for unauthenticated requests
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', id));
    }

    // Smart access control: Public threads are accessible to anyone, private threads require ownership
    if (!thread.isPublic) {
      // Private thread - requires authentication and ownership
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

    // Fetch changelog entries (ordered by creation time, newest first)
    const changelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, id),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });

    // Fetch thread owner information (only safe public fields: id, name, image)
    const threadOwner = await db.query.user.findFirst({
      where: eq(tables.user.id, thread.userId),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    });

    // This should never happen due to foreign key constraints, but guard for type safety
    if (!threadOwner) {
      throw createError.internal(
        'Thread owner not found',
        ErrorContextBuilders.resourceNotFound('user', thread.userId),
      );
    }

    // Return everything in one response (ChatGPT pattern)
    // ✅ NO TRANSFORM: Return user fields directly from DB (schema handles field selection)
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

    // Verify thread ownership
    const thread = await verifyThreadOwnership(id, user.id, db);

    const now = new Date();

    // ✅ DEFERRED CHANGELOG PATTERN: Don't create changelog entries here
    // Changes are persisted immediately to database for data integrity
    // Changelog entries will be created when the next message is submitted
    // This ensures changelog only appears when starting a new round

    // ✅ Mode change will be tracked in changelog when next message is submitted
    if (body.participants !== undefined) {
      const currentParticipants = await db.query.chatParticipant.findMany({
        where: eq(tables.chatParticipant.threadId, id),
      });

      // Build maps for comparison
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

          // ✅ Changelog will be created on next message submission
        } else {
          // Intentionally empty
          // Existing participant - check for changes
          const current = currentMap.get(newP.id);
          if (!current)
            continue;

          const hasChanges
            = current.modelId !== newP.modelId // ✅ Check for model changes
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

            // ✅ Changelog for role changes and reordering will be created on next message submission
            // No immediate changelog creation
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
    }

    // Build thread update object
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

    // ✅ Execute thread update (no changelog here - deferred to message submission)
    await db.update(tables.chatThread)
      .set(updateData)
      .where(eq(tables.chatThread.id, id));

    // Fetch updated thread WITH participants
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

    if (body.status !== undefined && db.$cache?.invalidate) {
      const { ThreadCacheTags } = await import('@/db/cache/cache-tags');
      await db.$cache.invalidate({
        tags: ThreadCacheTags.all(user.id, id, thread.slug),
      });
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

    // Verify thread ownership and get thread details for cache invalidation
    const thread = await verifyThreadOwnership(id, user.id, db);

    // Soft delete - set status to deleted
    await db
      .update(tables.chatThread)
      .set({
        status: 'deleted',
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, id));

    // ✅ RAG CLEANUP: Delete all embeddings for the thread
    // Even though this is a soft delete, we clean up RAG embeddings to free vector storage
    // If thread is restored in the future, embeddings can be regenerated
    try {
      await ragService.deleteThreadEmbeddings({
        threadId: id,
        db,
      });
    } catch {
      // Log but don't fail the deletion

    }

    // ✅ CRITICAL: Invalidate backend cache for thread lists
    // This ensures deleted threads immediately disappear from the sidebar
    // Without this, the listThreadsHandler cache returns stale data
    if (db.$cache?.invalidate) {
      const { ThreadCacheTags } = await import('@/db/cache/cache-tags');
      await db.$cache.invalidate({
        tags: ThreadCacheTags.all(user.id, id, thread.slug),
      });
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

export const getPublicThreadHandler: RouteHandler<typeof getPublicThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'public', // No authentication required for public threads
    validateParams: ThreadSlugParamSchema,
    operationName: 'getPublicThread',
  },
  async (c) => {
    const { slug } = c.validated.params;
    const db = await getDbAsync();

    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.slug, slug),
    });

    // Thread doesn't exist at all - 404 Not Found (standard HTTP status)
    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', slug),
      );
    }

    // Thread exists but is not public or is archived/deleted - 410 Gone (SEO-friendly)
    // HTTP 410 tells search engines the resource is permanently gone and should be removed from index
    if (!thread.isPublic || thread.status === 'archived' || thread.status === 'deleted') {
      const reason = thread.status === 'deleted' ? 'deleted' : thread.status === 'archived' ? 'archived' : 'private';
      throw createError.gone(
        `Thread is no longer publicly available (${reason})`,
      );
    }

    // Fetch thread owner information (only safe public fields: id, name, image)
    const threadOwner = await db.query.user.findFirst({
      where: eq(tables.user.id, thread.userId),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    });

    // This should never happen due to foreign key constraints, but guard for type safety
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

    // Ownership check - user can only access their own threads
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        ErrorContextBuilders.authorization('thread', slug),
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
