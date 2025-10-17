import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, streamText, validateUIMessages } from 'ai';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, ne } from 'drizzle-orm';
import Fuse from 'fuse.js';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  CursorPaginationQuerySchema,
  getCursorOrderBy,
  Responses,
} from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { extractModeratorModelName, openRouterModelsService } from '@/api/services/openrouter-models.service';
import {
  AI_TIMEOUT_CONFIG,
  canAccessModelByPricing,
  getMaxOutputTokensForTier,
  getRequiredTierForModel,
  SUBSCRIPTION_TIER_NAMES,
} from '@/api/services/product-logic.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import { generateTitleFromMessage } from '@/api/services/title-generator.service';
import {
  enforceCustomRoleQuota,
  enforceMessageQuota,
  enforceThreadQuota,
  getMaxModels,
  getUserTier,
  incrementCustomRoleUsage,
  incrementMessageUsage,
  incrementThreadUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatModeId, ThreadStatus } from '@/lib/config/chat-modes';
import { filterNonEmptyMessages } from '@/lib/utils/message-transforms';

import type {
  addParticipantRoute,
  analyzeRoundRoute,
  createCustomRoleRoute,
  createThreadRoute,
  deleteCustomRoleRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  getCustomRoleRoute,
  getPublicThreadRoute,
  getThreadAnalysesRoute,
  getThreadBySlugRoute,
  getThreadChangelogRoute,
  getThreadMessagesRoute,
  getThreadRoute,
  listCustomRolesRoute,
  listThreadsRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './route';
import {
  AddParticipantRequestSchema,
  CreateCustomRoleRequestSchema,
  CreateThreadRequestSchema,
  ModeratorAnalysisRequestSchema,
  RoundAnalysisParamSchema,
  StreamChatRequestSchema,
  ThreadListQuerySchema,
  ThreadSlugParamSchema,
  UIMessageMetadataSchema,
  UpdateCustomRoleRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

/**
 * ✅ AUTO-TRIGGER ANALYSIS: Automatically create pending analysis after round completes
 *
 * This function is called asynchronously after the last participant finishes responding.
 * It creates a pending analysis record immediately to prevent duplicate analysis generation.
 * The actual analysis streaming happens when the frontend requests it.
 *
 * @param params - Round completion parameters
 * @returns Promise<void> - Resolves when pending analysis record is created
 */
async function triggerRoundAnalysisAsync(params: {
  threadId: string;
  thread: typeof tables.chatThread.$inferSelect & {
    participants: Array<typeof tables.chatParticipant.$inferSelect>;
  };
  allParticipants: Array<typeof tables.chatParticipant.$inferSelect>;
  savedMessageId: string;
  db: Awaited<ReturnType<typeof getDbAsync>>;
}): Promise<void> {
  const { threadId, thread, db } = params;

  try {
    // Get all assistant messages for this thread to determine round number
    const assistantMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, 'assistant'),
      ),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Calculate round number: each round has N assistant messages (one per participant)
    const participantCount = thread.participants.length;
    const roundNumber = Math.ceil(assistantMessages.length / participantCount);

    // Check if analysis already exists for this round (idempotency)
    const existingAnalysis = await db.query.chatModeratorAnalysis.findFirst({
      where: and(
        eq(tables.chatModeratorAnalysis.threadId, threadId),
        eq(tables.chatModeratorAnalysis.roundNumber, roundNumber),
      ),
    });

    if (existingAnalysis) {
      // Analysis already exists - skip
      return;
    }

    // Get the participant message IDs for this round
    const roundStartIndex = (roundNumber - 1) * participantCount;
    const roundMessages = assistantMessages.slice(roundStartIndex, roundStartIndex + participantCount);
    const participantMessageIds = roundMessages.map(m => m.id);

    // Get the user question for this round (last user message before round messages)
    const userMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, threadId),
        eq(tables.chatMessage.role, 'user'),
      ),
      orderBy: [desc(tables.chatMessage.createdAt)],
      limit: 10,
    });

    const earliestRoundMessageTime = Math.min(...roundMessages.map(m => m.createdAt.getTime()));
    const userQuestion = userMessages.find(
      m => m.createdAt.getTime() < earliestRoundMessageTime,
    )?.content || 'N/A';

    // ✅ CREATE PENDING ANALYSIS: This prevents duplicate generation
    // Frontend will automatically pick this up and start streaming
    await db.insert(tables.chatModeratorAnalysis).values({
      id: ulid(),
      threadId,
      roundNumber,
      mode: thread.mode,
      userQuestion,
      status: 'pending', // Mark as pending - frontend will trigger streaming
      participantMessageIds,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to trigger round analysis:', error);
    // Don't throw - this is a background operation
  }
}

/**
 * Verify thread exists and user owns it
 * Reusable validation pattern used across multiple handlers
 *
 * Overload 1: Without participants
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>
): Promise<typeof tables.chatThread.$inferSelect>;

/**
 * Overload 2: With participants
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options: { includeParticipants: true }
): Promise<typeof tables.chatThread.$inferSelect & {
  participants: Array<typeof tables.chatParticipant.$inferSelect>;
}>;

/**
 * Implementation
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options?: { includeParticipants?: boolean },
) {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: options?.includeParticipants
      ? {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [tables.chatParticipant.priority],
          },
        }
      : undefined,
  });

  if (!thread) {
    throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId));
  }

  if (thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to access this thread',
      ErrorContextBuilders.authorization('thread', threadId),
    );
  }

  // VALIDATION: If participants were requested, ensure at least one enabled participant exists
  if (options?.includeParticipants) {
    // Type guard: thread has participants when includeParticipants is true
    const threadWithParticipants = thread as typeof thread & {
      participants: Array<typeof tables.chatParticipant.$inferSelect>;
    };

    if (threadWithParticipants.participants.length === 0) {
      throw createError.badRequest(
        'No enabled participants in this thread. Please add or enable at least one AI model to continue the conversation.',
        { errorType: 'validation' },
      );
    }
  }

  return thread;
}

// Removed verifyMemoryOwnership() and verifyCustomRoleOwnership()
// These resources are ALWAYS user-scoped - just query with userId in WHERE clause

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

export const createThreadHandler: RouteHandler<typeof createThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateThreadRequestSchema,
    operationName: 'createThread',
  },
  async (c) => {
    const { user } = c.auth();

    // Enforce thread and message quotas BEFORE creating anything
    await enforceThreadQuota(user.id);
    await enforceMessageQuota(user.id); // First message will be created

    const body = c.validated.body;
    const db = await getDbAsync();

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
        mode: (body.mode || 'brainstorming') as ChatModeId,
        status: 'active',
        isFavorite: false,
        isPublic: false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .returning();

    // Create participants with priority based on array order (immutable)
    // Load custom roles if specified
    const participants = await Promise.all(
      body.participants.map(async (p, index) => {
        let systemPrompt = p.systemPrompt; // Request systemPrompt takes precedence

        // If customRoleId is provided and no systemPrompt override, load custom role
        if (p.customRoleId && !systemPrompt) {
          const customRole = await db.query.chatCustomRole.findFirst({
            where: eq(tables.chatCustomRole.id, p.customRoleId),
          });

          if (customRole) {
            // Verify ownership
            if (customRole.userId !== user.id) {
              throw createError.unauthorized(
                'Not authorized to use this custom role',
                ErrorContextBuilders.authorization('custom_role', p.customRoleId),
              );
            }
            systemPrompt = customRole.systemPrompt;
          }
        }

        const participantId = ulid();

        // Only create settings object if at least one value is provided
        // Use undefined to omit the field entirely when no settings exist
        const hasSettings = systemPrompt || p.temperature !== undefined || p.maxTokens !== undefined;
        const settingsValue = hasSettings
          ? {
              systemPrompt,
              temperature: p.temperature,
              maxTokens: p.maxTokens,
            }
          : undefined;

        const [participant] = await db
          .insert(tables.chatParticipant)
          .values({
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
          })
          .returning();
        return participant;
      }),
    );

    // VALIDATION: Ensure at least one participant was successfully created
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

    // Create first user message
    const userMessageId = ulid();
    const [userMessage] = await db
      .insert(tables.chatMessage)
      .values({
        id: userMessageId,
        threadId,
        // Omit participantId for user messages (it's nullable in schema)
        role: 'user',
        content: body.firstMessage,
        // ✅ User messages don't need variant tracking
        createdAt: now,
      })
      .returning();

    // Increment usage counters AFTER successful creation
    // AI responses will be generated through the streaming endpoint
    await incrementThreadUsage(user.id);
    await incrementMessageUsage(user.id, 1); // Only the user message for now

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
        // Generate AI title from first message
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env);

        // Update thread with AI-generated title ONLY
        // IMPORTANT: Don't update slug - it must remain immutable to prevent 404s
        // The slug was already generated at creation time and users may have bookmarked it
        await db
          .update(tables.chatThread)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));
      } catch {
        // Suppress error - don't fail the request since thread is already created
      }
    })().catch(() => {
      // Suppress unhandled rejection warnings
    });

    // Return thread with participants and first user message
    // AI responses will be generated via the streaming endpoint
    return Responses.ok(c, {
      thread,
      participants,
      messages: [userMessage],
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

    // Fetch participants (ordered by priority)
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, id),
      orderBy: [tables.chatParticipant.priority],
    });

    // ✅ Fetch all messages for this thread
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
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

    // Build update object using reusable types from chat-modes config
    const updateData: {
      title?: string;
      mode?: ChatModeId;
      status?: ThreadStatus;
      isFavorite?: boolean;
      isPublic?: boolean;
      metadata?: Record<string, unknown>;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined && body.title !== null)
      updateData.title = body.title as string;
    if (body.mode !== undefined)
      updateData.mode = body.mode as ChatModeId;
    if (body.status !== undefined)
      updateData.status = body.status as ThreadStatus;
    if (body.isFavorite !== undefined)
      updateData.isFavorite = body.isFavorite;
    if (body.isPublic !== undefined)
      updateData.isPublic = body.isPublic;
    if (body.metadata !== undefined)
      updateData.metadata = body.metadata ?? undefined;

    const [updatedThread] = await db
      .update(tables.chatThread)
      .set(updateData)
      .where(eq(tables.chatThread.id, id))
      .returning();

    // ✅ Invalidate backend cache if status changed (affects list visibility)
    // Particularly important for 'deleted', 'archived' status changes
    if (body.status !== undefined && db.$cache?.invalidate) {
      const { ThreadCacheTags } = await import('@/db/cache/cache-tags');
      await db.$cache.invalidate({
        tags: ThreadCacheTags.all(user.id, id, thread.slug),
      });
    }

    return Responses.ok(c, {
      thread: updatedThread,
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

    // Fetch participants (ordered by priority) - same as private handler
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority],
    });

    // Fetch all messages
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Fetch changelog entries (ordered by creation time, newest first)
    // Following the pattern from getThreadChangelog service
    const changelog = await db.query.chatThreadChangelog.findMany({
      where: eq(tables.chatThreadChangelog.threadId, thread.id),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
    });

    // Return expanded structure with user info and changelog
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

    // Fetch participants (ordered by priority)
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority],
    });

    // ✅ Fetch all messages for this thread
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Return everything in one response (same pattern as getThreadHandler)
    // Include user data for proper hydration (prevents client/server mismatch)
    // ✅ NO TRANSFORM: Return user fields directly from DB (schema handles field selection)
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

// ============================================================================
// Participant Handlers
// ============================================================================
// Note: listParticipantsHandler removed - use getThreadHandler instead

export const addParticipantHandler: RouteHandler<typeof addParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: AddParticipantRequestSchema,
    operationName: 'addParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

    // Get user's subscription tier to validate model access
    // ✅ DRY: Using centralized getUserTier utility with 5-minute caching
    const userTier = await getUserTier(user.id);

    // ✅ SINGLE SOURCE OF TRUTH: Validate model access using backend service
    const model = await openRouterModelsService.getModelById(body.modelId as string);

    if (!model) {
      throw createError.badRequest(
        `Model "${body.modelId}" not found`,
        {
          errorType: 'validation',
          field: 'modelId',
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
          resourceId: body.modelId as string,
        },
      );
    }

    // Validate maxConcurrentModels limit for user's tier
    const existingParticipants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, id),
    });

    const currentModelCount = existingParticipants.length;

    // ✅ SINGLE SOURCE OF TRUTH: Check maxModels limit from database config
    const maxModels = await getMaxModels(userTier);
    if (currentModelCount >= maxModels) {
      throw createError.badRequest(
        `Your ${SUBSCRIPTION_TIER_NAMES[userTier]} plan allows up to ${maxModels} AI models per conversation. You already have ${currentModelCount} models. Remove a model or upgrade your plan to add more.`,
        {
          errorType: 'validation',
          field: 'modelId',
        },
      );
    }

    const participantId = ulid();
    const now = new Date();

    const [participant] = await db
      .insert(tables.chatParticipant)
      .values({
        id: participantId,
        threadId: id,
        modelId: body.modelId as string,
        role: body.role as string | null,
        priority: (body.priority as number | undefined) ?? 0,
        isEnabled: true,
        settings: body.settings ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // ✅ CREATE CHANGELOG ENTRY: Track participant addition
    const modelName = extractModeratorModelName(body.modelId as string);
    const changelogId = ulid();
    await db.insert(tables.chatThreadChangelog).values({
      id: changelogId,
      threadId: id,
      changeType: 'participant_added',
      changeSummary: `Added ${modelName}${body.role ? ` as "${body.role}"` : ''}`,
      changeData: {
        participantId,
        modelId: body.modelId as string,
        role: body.role as string | null,
      },
      createdAt: now,
    });

    return Responses.ok(c, {
      participant,
    });
  },
);

export const updateParticipantHandler: RouteHandler<typeof updateParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateParticipantRequestSchema,
    operationName: 'updateParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Get participant and verify thread ownership
    const participant = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, id),
      with: {
        thread: true,
      },
    });

    if (!participant) {
      throw createError.notFound('Participant not found', ErrorContextBuilders.resourceNotFound('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to modify this participant', ErrorContextBuilders.authorization('participant', id));
    }

    const [updatedParticipant] = await db
      .update(tables.chatParticipant)
      .set({
        role: body.role as string | null | undefined,
        priority: body.priority as number | undefined,
        isEnabled: body.isEnabled,
        settings: body.settings ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, id))
      .returning();

    // ✅ CREATE CHANGELOG ENTRY: Track participant update
    // Only create changelog if role changed (most common/visible change)
    if (body.role !== undefined && body.role !== participant.role) {
      const modelName = extractModeratorModelName(participant.modelId);
      const changelogId = ulid();
      await db.insert(tables.chatThreadChangelog).values({
        id: changelogId,
        threadId: participant.threadId,
        changeType: 'participant_updated',
        changeSummary: `Updated ${modelName} role from "${participant.role || 'none'}" to "${body.role || 'none'}"`,
        changeData: {
          participantId: id,
          modelId: participant.modelId,
          oldRole: participant.role,
          newRole: body.role as string | null,
        },
        createdAt: new Date(),
      });
    }

    return Responses.ok(c, {
      participant: updatedParticipant,
    });
  },
);

export const deleteParticipantHandler: RouteHandler<typeof deleteParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Get participant and verify thread ownership
    const participant = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, id),
      with: {
        thread: true,
      },
    });

    if (!participant) {
      throw createError.notFound('Participant not found', ErrorContextBuilders.resourceNotFound('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to delete this participant', ErrorContextBuilders.authorization('participant', id));
    }

    // ✅ CREATE CHANGELOG ENTRY: Track participant removal (BEFORE deletion)
    const modelName = extractModeratorModelName(participant.modelId);
    const changelogId = ulid();
    await db.insert(tables.chatThreadChangelog).values({
      id: changelogId,
      threadId: participant.threadId,
      changeType: 'participant_removed',
      changeSummary: `Removed ${modelName}${participant.role ? ` ("${participant.role}")` : ''}`,
      changeData: {
        participantId: id,
        modelId: participant.modelId,
        role: participant.role,
      },
      createdAt: new Date(),
    });

    await db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, id));

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Get messages for a thread
 * Fetches all messages ordered by creation time
 */
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
      orderBy: [tables.chatMessage.createdAt],
    });

    return Responses.collection(c, messages);
  },
);

/**
 * Get changelog for a thread
 * Returns configuration change history ordered by creation time (newest first)
 */
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

/**
 * ✅ OFFICIAL AI SDK v5 PATTERN - Single-Participant Streaming
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
 *
 * SIMPLIFIED Pattern Flow:
 * 1. Frontend sends messages + participantIndex (which model to use)
 * 2. Backend streams SINGLE participant's response
 * 3. Frontend orchestrates multiple participants sequentially
 * 4. Direct streamText() → toUIMessageStreamResponse() (no wrappers)
 * 5. Message persistence in onFinish callback (doesn't block stream)
 *
 * This follows official AI SDK v5 docs exactly - no custom events.
 */
export const streamChatHandler: RouteHandler<typeof streamChatRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: StreamChatRequestSchema,
    operationName: 'streamChat',
  },
  async (c) => {
    const { user } = c.auth();
    const { messages, id: threadId, participantIndex } = c.validated.body;

    // Validate messages array exists and is not empty
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw createError.badRequest('Messages array is required and cannot be empty');
    }

    const db = await getDbAsync();

    // =========================================================================
    // STEP 1: Verify Thread & Load Participants
    // =========================================================================

    if (!threadId) {
      throw createError.badRequest('Thread ID is required for streaming');
    }

    // Load existing thread
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      with: {
        participants: {
          where: eq(tables.chatParticipant.isEnabled, true),
          orderBy: [tables.chatParticipant.priority],
        },
      },
    });

    if (!thread) {
      throw createError.notFound('Thread not found');
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread');
    }

    if (thread.participants.length === 0) {
      throw createError.badRequest('No enabled participants in this thread');
    }

    // =========================================================================
    // STEP 2: Get SINGLE Participant (frontend orchestration)
    // =========================================================================

    const participant = thread.participants[participantIndex ?? 0];
    if (!participant) {
      throw createError.badRequest(`Participant at index ${participantIndex} not found`);
    }

    // =========================================================================
    // STEP 3: ✅ OFFICIAL PATTERN - Type and Validate Messages
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages-from-database
    // =========================================================================

    let typedMessages: UIMessage[] = [];

    try {
      if (!Array.isArray(messages)) {
        throw new TypeError('Messages must be an array');
      }

      typedMessages = messages as UIMessage[];
      // ✅ AI SDK v5 OFFICIAL PATTERN: Validate messages with metadata schema
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
      validateUIMessages({
        messages: typedMessages,
        metadataSchema: UIMessageMetadataSchema,
      });
    } catch (error) {
      console.error('Message validation error:', error);
      throw createError.badRequest(`Invalid message format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // =========================================================================
    // STEP 4: Save New User Message (if exists and not already saved)
    // =========================================================================

    const lastMessage = typedMessages[typedMessages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      const existsInDb = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, lastMessage.id),
      });

      if (!existsInDb) {
        const textParts = lastMessage.parts?.filter(part => part.type === 'text') || [];
        if (textParts.length > 0) {
          const content = textParts
            .map((part) => {
              if ('text' in part && typeof part.text === 'string') {
                return part.text;
              }
              return '';
            })
            .join('')
            .trim();

          if (content.length > 0) {
            await enforceMessageQuota(user.id);
            await db.insert(tables.chatMessage).values({
              id: lastMessage.id,
              threadId,
              role: 'user',
              content,
              createdAt: new Date(),
            });
            await incrementMessageUsage(user.id, 1);
          }
        }
      }
    }

    // =========================================================================
    // STEP 5: Initialize OpenRouter and Setup
    // =========================================================================

    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();
    const userTier = await getUserTier(user.id);
    const maxOutputTokens = getMaxOutputTokensForTier(userTier);

    // =========================================================================
    // STEP 6: ✅ OFFICIAL AI SDK v5 PATTERN - Direct streamText()
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // =========================================================================

    // Prepare system prompt for this participant
    const systemPrompt = participant.settings?.systemPrompt
      || `You are ${participant.role || 'an AI assistant'}.`;

    // Convert UI messages to model messages
    // ✅ SHARED UTILITY: Filter out empty messages (caused by subsequent participant triggers)
    const nonEmptyMessages = filterNonEmptyMessages(typedMessages);

    if (nonEmptyMessages.length === 0) {
      throw createError.badRequest('No valid messages to send to AI model');
    }

    let modelMessages;
    try {
      modelMessages = convertToModelMessages(nonEmptyMessages);
    } catch (conversionError) {
      console.error('Error converting messages:', conversionError);
      throw createError.badRequest('Failed to convert messages for model');
    }

    // ✅ OFFICIAL PATTERN: Direct streamText() call
    const result = streamText({
      model: client(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      temperature: participant.settings?.temperature ?? 0.7,
      abortSignal: AbortSignal.any([
        // Cancel when client disconnects
        (c.req as unknown as { raw: Request }).raw.signal,
        // Server-side protection per attempt
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
      ]),
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat.thread.${threadId}.participant.${participant.id}`,
      },

      // ✅ MESSAGE PERSISTENCE: onFinish callback (doesn't block stream)
      onFinish: async ({ text, usage, finishReason }) => {
        try {
          // Persist message to database AFTER streaming completes
          const [savedMessage] = await db.insert(tables.chatMessage).values({
            id: ulid(),
            threadId,
            participantId: participant.id,
            role: 'assistant',
            content: text,
            metadata: {
              model: participant.modelId,
              participantId: participant.id,
              participantIndex,
              participantRole: participant.role,
              usage,
              finishReason,
            } as Record<string, unknown>,
            createdAt: new Date(),
          }).onConflictDoNothing().returning();

          await incrementMessageUsage(user.id, 1);

          // ✅ AUTO-TRIGGER ANALYSIS: When last participant finishes
          // This happens asynchronously - don't await to avoid blocking
          if (participantIndex === thread.participants.length - 1 && savedMessage) {
            // Last participant just finished - trigger analysis for this round
            triggerRoundAnalysisAsync({
              threadId,
              thread,
              allParticipants: thread.participants,
              savedMessageId: savedMessage.id,
              db,
            }).catch((error) => {
              console.error('Failed to trigger round analysis:', error);
              // Don't throw - this is a background task
            });
          }
        } catch (error) {
          console.error('Failed to save message:', error);
          // Don't throw - message already streamed to client
        }
      },
    });

    // ✅ OFFICIAL PATTERN: Return standard UI message stream response
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/streaming-text-to-response#toUIMessageStreamResponse
    return result.toUIMessageStreamResponse();
  },
);

// ============================================================================
// Custom Role Handlers
// ============================================================================

export const listCustomRolesHandler: RouteHandler<typeof listCustomRolesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: CursorPaginationQuerySchema,
    operationName: 'listCustomRoles',
  },
  async (c) => {
    const { user } = c.auth();

    // Use validated cursor pagination query parameters
    const query = c.validated.query;
    const db = await getDbAsync();

    // Fetch custom roles with cursor-based pagination (limit + 1 to check hasMore)
    const customRoles = await db.query.chatCustomRole.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatCustomRole.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatCustomRole.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatCustomRole.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply cursor pagination and format response
    const { items, pagination } = applyCursorPagination(
      customRoles,
      query.limit,
      customRole => createTimestampCursor(customRole.updatedAt),
    );
    return Responses.cursorPaginated(c, items, pagination);
  },
);

export const createCustomRoleHandler: RouteHandler<typeof createCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateCustomRoleRequestSchema,
    operationName: 'createCustomRole',
  },
  async (c) => {
    const { user } = c.auth();

    // Enforce custom role quota BEFORE creating
    await enforceCustomRoleQuota(user.id);

    const body = c.validated.body;
    const db = await getDbAsync();

    const customRoleId = ulid();
    const now = new Date();

    const [customRole] = await db
      .insert(tables.chatCustomRole)
      .values({
        id: customRoleId,
        userId: user.id,
        name: body.name as string,
        description: body.description as string | null,
        systemPrompt: body.systemPrompt as string,
        metadata: body.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Increment custom role usage AFTER successful creation
    await incrementCustomRoleUsage(user.id);

    return Responses.ok(c, {
      customRole,
    });
  },
);

export const getCustomRoleHandler: RouteHandler<typeof getCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Query with userId - custom roles are always user-scoped
    const customRole = await db.query.chatCustomRole.findFirst({
      where: and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ),
    });

    if (!customRole) {
      throw createError.notFound('Custom role not found', ErrorContextBuilders.resourceNotFound('custom_role', id));
    }

    return Responses.ok(c, {
      customRole,
    });
  },
);

export const updateCustomRoleHandler: RouteHandler<typeof updateCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateCustomRoleRequestSchema,
    operationName: 'updateCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Update with userId filter - custom roles are always user-scoped
    const [updatedCustomRole] = await db
      .update(tables.chatCustomRole)
      .set({
        name: body.name as string | undefined,
        description: body.description as string | null | undefined,
        systemPrompt: body.systemPrompt as string | undefined,
        metadata: body.metadata ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ))
      .returning();

    if (!updatedCustomRole) {
      throw createError.notFound('Custom role not found', ErrorContextBuilders.resourceNotFound('custom_role', id));
    }

    return Responses.ok(c, {
      customRole: updatedCustomRole,
    });
  },
);

export const deleteCustomRoleHandler: RouteHandler<typeof deleteCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Delete with userId filter - custom roles are always user-scoped
    const result = await db
      .delete(tables.chatCustomRole)
      .where(and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ))
      .returning();

    if (result.length === 0) {
      throw createError.notFound('Custom role not found', ErrorContextBuilders.resourceNotFound('custom_role', id));
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

// ============================================================================
// Moderator Analysis Handler
// ============================================================================

/**
 * Analyze Conversation Round Handler
 *
 * ✅ AI SDK streamObject() Pattern: Generates structured analysis instead of text
 * ✅ Follows Existing Patterns: Similar to streamChatHandler but for analysis
 * ✅ Cheap Model: Uses GPT-4o-mini for cost-effective moderation
 * ✅ Integrated Flow: Not a separate service, part of the chat system
 *
 * This handler:
 * 1. Fetches all participant messages for the round
 * 2. Builds a moderator prompt with all responses
 * 3. Streams structured JSON analysis using streamObject()
 * 4. Returns ratings, pros/cons, leaderboard, and insights
 *
 * Frontend Integration:
 * - Call this after all participants have responded in a round
 * - Use AI SDK's useObject() hook to stream and display the analysis
 * - Render skills matrix, leaderboard, and insights as they stream in
 */
export const analyzeRoundHandler: RouteHandler<typeof analyzeRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: RoundAnalysisParamSchema,
    validateBody: ModeratorAnalysisRequestSchema,
    operationName: 'analyzeRound',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Convert roundNumber from string to number
    const roundNum = Number.parseInt(roundNumber, 10);
    if (Number.isNaN(roundNum) || roundNum < 1) {
      throw createError.badRequest(
        'Invalid round number. Must be a positive integer.',
        {
          errorType: 'validation',
          field: 'roundNumber',
        },
      );
    }

    // Verify thread ownership
    const thread = await verifyThreadOwnership(threadId, user.id, db);

    // ✅ IDEMPOTENCY: Check if analysis exists in ANY state (pending, streaming, completed, failed)
    // Prevents duplicate analyses if user refreshes during generation
    const existingAnalysis = await db.query.chatModeratorAnalysis.findFirst({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.roundNumber, roundNum),
        ),
    });

    if (existingAnalysis) {
      // ✅ COMPLETED: Return existing analysis data
      if (existingAnalysis.status === 'completed' && existingAnalysis.analysisData) {
        return Responses.ok(c, {
          object: {
            ...existingAnalysis.analysisData,
            mode: existingAnalysis.mode,
            roundNumber: existingAnalysis.roundNumber,
            userQuestion: existingAnalysis.userQuestion,
          },
        });
      }

      // ✅ STREAMING or PENDING: Return 202 Accepted to indicate in-progress
      // Frontend should handle this by showing loading state without re-triggering
      if (existingAnalysis.status === 'streaming' || existingAnalysis.status === 'pending') {
        return Responses.accepted(c, {
          status: existingAnalysis.status,
          message: 'Analysis is currently being generated. Please wait...',
          analysisId: existingAnalysis.id,
          createdAt: existingAnalysis.createdAt,
        }); // 202 Accepted - request accepted but not yet completed
      }

      // ✅ FAILED: Allow retry by creating new analysis
      if (existingAnalysis.status === 'failed') {
        // Delete failed analysis to allow fresh retry
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }
    }

    // ✅ AI SDK V5 PATTERN: Support optional participantMessageIds
    // If not provided, query automatically (future enhancement)
    // For now, require them with clear error message
    if (!body.participantMessageIds || body.participantMessageIds.length === 0) {
      throw createError.badRequest(
        'participantMessageIds array is required for analysis',
        {
          errorType: 'validation',
          field: 'participantMessageIds',
        },
      );
    }

    // Fetch all participant messages for this round
    // Safe to assert: we validated participantMessageIds exists above
    const messageIds = body.participantMessageIds!;
    const participantMessages = await db.query.chatMessage.findMany({
      where: (fields, { inArray, eq: eqOp, and: andOp }) =>
        andOp(
          inArray(fields.id, messageIds),
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, 'assistant'),
        ),
      with: {
        participant: true, // Include participant info (model, role, etc.)
      },
      orderBy: [tables.chatMessage.createdAt], // Maintain response order
    });

    // Validation: Ensure we have all requested messages
    if (participantMessages.length !== messageIds.length) {
      const foundIds = participantMessages.map(m => m.id);
      const missingIds = messageIds.filter(id => !foundIds.includes(id));
      throw createError.badRequest(
        `Some participant messages not found: ${missingIds.join(', ')}`,
        {
          errorType: 'validation',
          field: 'participantMessageIds',
        },
      );
    }

    // Validation: Ensure all messages have participants
    const invalidMessages = participantMessages.filter(m => !m.participant || !m.participantId);
    if (invalidMessages.length > 0) {
      throw createError.badRequest(
        'Some messages do not have associated participants (they may be user messages)',
        {
          errorType: 'validation',
          field: 'participantMessageIds',
        },
      );
    }

    // Find the user's question (the last user message before these assistant messages)
    const userMessages = await db.query.chatMessage.findMany({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, 'user'),
        ),
      orderBy: [desc(tables.chatMessage.createdAt)],
      limit: 10, // Get last 10 user messages to find the relevant one
    });

    // The user question is the last user message before the earliest participant message
    const earliestParticipantTime = Math.min(...participantMessages.map(m => m.createdAt.getTime()));
    const relevantUserMessage = userMessages.find(
      m => m.createdAt.getTime() < earliestParticipantTime,
    );

    const userQuestion = relevantUserMessage?.content || 'N/A';

    // Build participant response data for the moderator
    const participantResponses = participantMessages.map((msg, index) => {
      const participant = msg.participant!;
      const modelName = extractModeratorModelName(participant.modelId);

      return {
        participantIndex: index,
        participantRole: participant.role,
        modelId: participant.modelId,
        modelName,
        responseContent: msg.content,
      };
    });

    // Build moderator prompts using the service
    const { buildModeratorSystemPrompt, buildModeratorUserPrompt, ModeratorAnalysisSchema } = await import('@/api/services/moderator-analysis.service');

    const moderatorConfig = {
      mode: thread.mode as ChatModeId,
      roundNumber: roundNum,
      userQuestion,
      participantResponses,
    };

    const systemPrompt = buildModeratorSystemPrompt(moderatorConfig);
    const userPrompt = buildModeratorUserPrompt(moderatorConfig);

    // ✅ DYNAMIC MODEL SELECTION: Use optimal analysis model from OpenRouter
    // Intelligently selects cheapest, fastest model for structured output
    // Falls back to gpt-4o-mini if no suitable model found
    const optimalModel = await openRouterModelsService.getOptimalAnalysisModel();
    const analysisModelId = optimalModel?.id || 'openai/gpt-4o-mini';

    // Initialize OpenRouter with selected optimal model
    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();

    // ✅ CRITICAL: Create pending analysis record BEFORE streaming starts
    // This acts as a distributed lock to prevent duplicate analysis generation
    // If another request comes in (e.g., page refresh), it will see this pending record
    const analysisId = ulid();
    await db.insert(tables.chatModeratorAnalysis).values({
      id: analysisId,
      threadId,
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      status: 'streaming', // Mark as streaming immediately
      participantMessageIds: body.participantMessageIds,
      createdAt: new Date(),
    });

    // ✅ AI SDK streamObject() Pattern: Stream structured JSON as it's generated
    // Real streaming approach - sends partial objects as they arrive
    // Frontend uses useObject() hook from @ai-sdk/react for consumption
    //
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/object-generation
    const { streamObject } = await import('ai');

    try {
      const result = streamObject({
        model: client.chat(analysisModelId),
        schema: ModeratorAnalysisSchema,
        schemaName: 'ModeratorAnalysis',
        schemaDescription: 'Structured analysis of a conversation round with participant ratings, skills, pros/cons, leaderboard, and summary',
        system: systemPrompt,
        prompt: userPrompt,
        mode: 'json', // Force JSON mode for better schema adherence

        // ✅ Telemetry for monitoring
        experimental_telemetry: {
          isEnabled: true,
          functionId: `moderator-analysis-round-${roundNum}`,
        },

        // ✅ Timeout protection
        abortSignal: AbortSignal.any([
          c.req.raw.signal, // Client disconnect
          AbortSignal.timeout(AI_TIMEOUT_CONFIG.moderatorAnalysisMs), // Centralized timeout for analysis
        ]),

        // ✅ Stream callbacks for server-side logging and database persistence
        onFinish: async ({ object: finalObject, error, usage: _usage }) => {
          // ✅ FAILED: Update status to failed with error message
          if (error) {
            try {
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: error instanceof Error ? error.message : String(error),
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            } catch {
              // Suppress error - analysis status update is best effort
            }
            return;
          }

          // ✅ NO OBJECT: Mark as failed
          if (!finalObject) {
            try {
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: 'Analysis completed but no object was generated',
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            } catch {
              // Suppress error - analysis status update is best effort
            }
            return;
          }

          // ✅ Validate schema before saving to prevent corrupt data
          const hasValidStructure = finalObject.participantAnalyses
            && Array.isArray(finalObject.participantAnalyses)
            && finalObject.leaderboard
            && Array.isArray(finalObject.leaderboard)
            && finalObject.overallSummary
            && finalObject.conclusion;

          if (!hasValidStructure) {
            try {
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: 'Analysis generated but structure is invalid',
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            } catch {
              // Suppress error - analysis status update is best effort
            }
            return;
          }

          // ✅ SUCCESS: Update existing record with analysis data and mark as completed
          try {
            await db.update(tables.chatModeratorAnalysis)
              .set({
                status: 'completed',
                analysisData: {
                  leaderboard: finalObject.leaderboard,
                  participantAnalyses: finalObject.participantAnalyses,
                  overallSummary: finalObject.overallSummary,
                  conclusion: finalObject.conclusion,
                },
                completedAt: new Date(),
              })
              .where(eq(tables.chatModeratorAnalysis.id, analysisId));
          } catch {
            // Suppress error - analysis completion update is best effort
          }
        },
      });

      // ✅ AI SDK Pattern: Return streaming text response using toTextStreamResponse()
      // Sets content-type to 'text/plain; charset=utf-8' with streaming
      // Frontend consumes via useObject() hook from @ai-sdk/react
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/object-generation
      return result.toTextStreamResponse();
    } catch (error) {
      // Handle NoObjectGeneratedError specifically
      const { NoObjectGeneratedError } = await import('ai');
      if (NoObjectGeneratedError.isInstance(error)) {
        throw createError.internal(
          'Failed to generate analysis',
          {
            errorType: 'external_service',
            service: 'OpenRouter AI',
          },
        );
      }

      // Re-throw other errors
      throw error;
    }
  },
);

/**
 * Get Thread Analyses Handler
 *
 * ✅ Fetches all persisted moderator analyses for a thread
 * ✅ Returns analyses ordered by round number
 *
 * GET /api/v1/chat/threads/:id/analyses
 */
export const getThreadAnalysesHandler: RouteHandler<typeof getThreadAnalysesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadAnalyses',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;

    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(threadId, user.id, db);

    // Fetch all analyses for this thread, ordered by round number DESC (latest first)
    // ✅ CRITICAL: May have multiple analyses per round (pending, streaming, completed, failed)
    // Return only the LATEST one for each round to avoid duplicate keys on frontend
    const allAnalyses = await db.query.chatModeratorAnalysis.findMany({
      where: eq(tables.chatModeratorAnalysis.threadId, threadId),
      orderBy: [desc(tables.chatModeratorAnalysis.roundNumber), desc(tables.chatModeratorAnalysis.createdAt)],
    });

    // ✅ Deduplicate by round number - keep only the latest analysis for each round
    const analysesMap = new Map<number, typeof allAnalyses[0]>();
    for (const analysis of allAnalyses) {
      if (!analysesMap.has(analysis.roundNumber)) {
        analysesMap.set(analysis.roundNumber, analysis);
      }
    }

    // Convert back to array and sort by round number ascending
    const analyses = Array.from(analysesMap.values())
      .sort((a, b) => a.roundNumber - b.roundNumber);

    return Responses.collection(c, analyses);
  },
);
