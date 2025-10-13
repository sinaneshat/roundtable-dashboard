import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { APICallError, consumeStream, convertToModelMessages, streamText, validateUIMessages } from 'ai';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, like, ne } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createTimestampCursor,
  getCursorOrderBy,
} from '@/api/common/pagination';
import { createHandler, Responses } from '@/api/core';
import { CursorPaginationQuerySchema } from '@/api/core/schemas';
import { apiLogger } from '@/api/middleware/hono-logger';
import type { ClassifiedError, ParticipantInfo, RoundtablePromptConfig } from '@/api/routes/chat/schema';
import {
  AI_TIMEOUT_CONFIG,
  DEFAULT_AI_PARAMS,
} from '@/api/routes/chat/schema';
import {
  canAccessModelByPricing,
  getModelPricingDisplay,
  getRequiredTierForModel,
} from '@/api/services/model-pricing-tiers.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import {
  classifyOpenRouterError,
  extractErrorDetails,
  formatErrorForDatabase,
} from '@/api/services/openrouter-error-handler';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import { retryParticipantStream } from '@/api/services/participant-retry.service';
import {
  buildRoundtablePrompt,
} from '@/api/services/roundtable-prompt.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import {
  logModeChange,
  logParticipantAdded,
  logParticipantRemoved,
  logParticipantsReordered,
  logParticipantUpdated,
} from '@/api/services/thread-changelog.service';
import { generateTitleFromMessage } from '@/api/services/title-generator.service';
import {
  enforceCustomRoleQuota,
  enforceMessageQuota,
  enforceThreadQuota,
  getUserUsageStats,
  incrementCustomRoleUsage,
  incrementMessageUsage,
  incrementThreadUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import type { SubscriptionTier } from '@/db/config/subscription-tiers';
import { getMaxOutputTokens, getTierConfig, getTierName } from '@/db/config/subscription-tiers';
import * as tables from '@/db/schema';
import type { ChatModeId, ThreadStatus } from '@/lib/config/chat-modes';

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
  CustomRoleIdParamSchema,
  ModeratorAnalysisRequestSchema,
  ParticipantIdParamSchema,
  RoundAnalysisParamSchema,
  StreamChatRequestSchema,
  ThreadIdParamSchema,
  ThreadListQuerySchema,
  ThreadSlugParamSchema,
  UpdateCustomRoleRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

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

    // Build filters for thread query
    const filters: SQL[] = [
      eq(tables.chatThread.userId, user.id),
      ne(tables.chatThread.status, 'deleted'), // Exclude deleted threads
    ];

    // Add search filter if search query is provided
    if (query.search && query.search.trim().length > 0) {
      filters.push(like(tables.chatThread.title, `%${query.search.trim()}%`));
    }

    // Fetch threads with cursor-based pagination (limit + 1 to check hasMore)
    const threads = await db.query.chatThread.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.chatThread.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply cursor pagination and format response
    return Responses.ok(c, applyCursorPagination(
      threads,
      query.limit,
      thread => createTimestampCursor(thread.updatedAt),
    ));
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
    const usageStats = await getUserUsageStats(user.id);
    const userTier = usageStats.subscription.tier as SubscriptionTier;

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
          `Your ${getTierName(userTier)} plan does not include access to ${model.name}. Upgrade to ${getTierName(requiredTier)} or higher to use this model.`,
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
      } catch (error) {
        // Log error but don't fail the request since thread is already created
        apiLogger.error('Failed to generate async title for thread', {
          threadId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
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
    validateParams: ThreadIdParamSchema,
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

    // Fetch thread owner information (only safe public fields: name and image)
    const threadOwner = await db.query.user.findFirst({
      where: eq(tables.user.id, thread.userId),
      columns: {
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
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      changelog,
      user: {
        name: threadOwner.name,
        image: threadOwner.image,
      },
    });
  },
);

export const updateThreadHandler: RouteHandler<typeof updateThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: UpdateThreadRequestSchema,
    operationName: 'updateThread',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

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

    if (body.title !== undefined)
      updateData.title = body.title;
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

    return Responses.ok(c, {
      thread: updatedThread,
    });
  },
);

export const deleteThreadHandler: RouteHandler<typeof deleteThreadRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    operationName: 'deleteThread',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

    // Soft delete - set status to deleted
    await db
      .update(tables.chatThread)
      .set({
        status: 'deleted',
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, id));

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

    // Fetch thread owner information (only safe public fields: name and image)
    const threadOwner = await db.query.user.findFirst({
      where: eq(tables.user.id, thread.userId),
      columns: {
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
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      changelog,
      user: {
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
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      user: {
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
    validateParams: ThreadIdParamSchema,
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
    const usageStats = await getUserUsageStats(user.id);
    const userTier = usageStats.subscription.tier as SubscriptionTier;

    // ✅ SINGLE SOURCE OF TRUTH: Validate model access using backend service
    const model = await openRouterModelsService.getModelById(body.modelId);

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
        `Your ${getTierName(userTier)} plan does not include access to ${model.name}. Upgrade to ${getTierName(requiredTier)} or higher to use this model.`,
        {
          errorType: 'authorization',
          resource: 'model',
          resourceId: body.modelId,
        },
      );
    }

    // Validate maxConcurrentModels limit for user's tier
    const existingParticipants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, id),
    });

    const currentModelCount = existingParticipants.length;

    // ✅ SINGLE SOURCE OF TRUTH: Check maxModels limit from tier config
    const tierConfig = getTierConfig(userTier);
    if (currentModelCount >= tierConfig.maxModels) {
      throw createError.badRequest(
        `Your ${getTierName(userTier)} plan allows up to ${tierConfig.maxModels} AI models per conversation. You already have ${currentModelCount} models. Remove a model or upgrade your plan to add more.`,
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
        modelId: body.modelId,
        role: body.role,
        priority: body.priority || 0,
        isEnabled: true,
        settings: body.settings,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return Responses.ok(c, {
      participant,
    });
  },
);

export const updateParticipantHandler: RouteHandler<typeof updateParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ParticipantIdParamSchema,
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
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, id))
      .returning();

    return Responses.ok(c, {
      participant: updatedParticipant,
    });
  },
);

export const deleteParticipantHandler: RouteHandler<typeof deleteParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ParticipantIdParamSchema,
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
    validateParams: ThreadIdParamSchema,
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

    return Responses.ok(c, {
      messages,
      count: messages.length,
    });
  },
);

/**
 * Get changelog for a thread
 * Returns configuration change history ordered by creation time (newest first)
 */
export const getThreadChangelogHandler: RouteHandler<typeof getThreadChangelogRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
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

    return Responses.ok(c, {
      changelog,
      count: changelog.length,
    });
  },
);

/**
 * ✅ OFFICIAL AI SDK v5 STREAMING PATTERN
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 *
 * This handler demonstrates the EXACT patterns from AI SDK documentation:
 *
 * 1. MESSAGE VALIDATION (Lines 1190-1210):
 *    - Accept messages as `z.array(z.unknown())` in schema
 *    - Runtime validation with `validateUIMessages()`
 *    - Type assertion to `UIMessage[]` after validation
 *    Pattern: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages
 *
 * 2. STREAMING CONFIGURATION (Lines 1341-1365):
 *    - Use `streamText()` from 'ai' package
 *    - Convert UIMessages with `convertToModelMessages()`
 *    - Apply transformations with `experimental_transform`
 *    - Handle abort signals (timeout + client disconnect)
 *    Pattern: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
 *
 * 3. RESPONSE STREAMING (Lines 1368-1557):
 *    - Use `toUIMessageStreamResponse()` for SSE streaming
 *    - Use `consumeSseStream` for client disconnect handling
 *    - Use `onFinish` callback for database persistence
 *    - Use `onError` callback for error handling
 *    Pattern: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#streaming-responses
 *
 * 🚫 NO CUSTOM TYPES: All types inferred from AI SDK
 * 🚫 NO CUSTOM STREAMING: All streaming via AI SDK built-ins
 * 🚫 NO MANUAL SSE: toUIMessageStreamResponse() handles everything
 */
export const streamChatHandler: RouteHandler<typeof streamChatRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: StreamChatRequestSchema,
    operationName: 'streamChat',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const {
      messages: clientMessages,
      participantIndex: requestedParticipantIndex, // Optional - undefined for config-only updates
      mode: newMode,
      participants: newParticipants,
    } = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership and get participants
    let thread = await verifyThreadOwnership(threadId, user.id, db, { includeParticipants: true });

    // Get user's subscription tier (used for model access validation and output token limits)
    const usageStats = await getUserUsageStats(user.id);
    const userTier = usageStats.subscription.tier as SubscriptionTier;

    // ==================================================
    // DYNAMIC CONFIGURATION UPDATES
    // Update thread mode/participants/memories if provided
    // ==================================================

    // Update thread mode if changed
    if (newMode && newMode !== thread.mode) {
      const oldMode = thread.mode;

      await db
        .update(tables.chatThread)
        .set({ mode: newMode as ChatModeId, updatedAt: new Date() })
        .where(eq(tables.chatThread.id, threadId));

      // Log mode change to changelog
      await logModeChange(threadId, oldMode, newMode);

      thread.mode = newMode as ChatModeId; // Update local reference
    }

    // Update participants if provided
    if (newParticipants && newParticipants.length > 0) {
      // ✅ TIER-BASED MODEL VALIDATION: Validate that user can access all requested models
      // Fetch all models from OpenRouter to check pricing-based access control
      const allModels = await openRouterModelsService.fetchAllModels();

      for (const participant of newParticipants) {
        // Find the model in OpenRouter's model list
        const openRouterModel = allModels.find(m => m.id === participant.modelId);

        if (!openRouterModel) {
          // Model not found in OpenRouter - reject the request
          throw createError.badRequest(
            `Model "${participant.modelId}" not found in OpenRouter catalog`,
            {
              errorType: 'validation',
              field: 'participants.modelId',
            },
          );
        }

        // ✅ PRICING-BASED ACCESS CONTROL: Check if user's tier can access this model
        if (!canAccessModelByPricing(userTier, openRouterModel)) {
          const requiredTier = getRequiredTierForModel(openRouterModel);
          const modelPricing = getModelPricingDisplay(openRouterModel);
          throw createError.unauthorized(
            `Your ${getTierName(userTier)} plan does not include access to ${openRouterModel.name} (${modelPricing}). Upgrade to ${getTierName(requiredTier)} or higher to use this model.`,
            {
              errorType: 'authorization',
              resource: 'model',
              resourceId: participant.modelId,
            },
          );
        }
      }

      // ✅ MODEL COUNT VALIDATION: Check if user can add this many models based on tier
      const tierConfig = getTierConfig(userTier);
      if (newParticipants.length > tierConfig.maxModels) {
        throw createError.unauthorized(
          `Your ${getTierName(userTier)} plan allows up to ${tierConfig.maxModels} AI models per conversation. You've selected ${newParticipants.length} models. Remove some models or upgrade your plan.`,
          {
            errorType: 'authorization',
            resource: 'participants',
          },
        );
      }

      // Get existing participants before deletion for changelog
      const oldParticipants = await db.query.chatParticipant.findMany({
        where: eq(tables.chatParticipant.threadId, threadId),
      });

      // ✅ CRITICAL: Check if participants have actually changed before recreating
      // Prevents breaking variant tracking on regeneration
      // Compare: modelId, role, customRoleId, and priority
      const participantsChanged
        = oldParticipants.length !== newParticipants.length
          || newParticipants.some((newP, idx) => {
            const oldP = oldParticipants.find(op => op.priority === (newP.order ?? idx));
            if (!oldP)
              return true; // New participant
            // Check if any field changed
            return (
              oldP.modelId !== newP.modelId
              || (oldP.role || null) !== (newP.role || null)
              || (oldP.customRoleId || null) !== (newP.customRoleId || null)
              || oldP.priority !== (newP.order ?? idx)
            );
          });

      // Skip recreation if participants haven't changed
      if (!participantsChanged) {
        apiLogger.info('Participants unchanged - skipping recreation', {
          threadId,
          participantCount: oldParticipants.length,
        });
        // No need to reload thread since participants didn't change
      } else {
      // Delete existing participants
        await db
          .delete(tables.chatParticipant)
          .where(eq(tables.chatParticipant.threadId, threadId));

        // Create new participants
        const participantsToCreate = newParticipants.map((p, index) => ({
          id: ulid(),
          threadId,
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: p.order ?? index,
          isEnabled: true,
        }));

        await db.insert(tables.chatParticipant).values(participantsToCreate);

        // ========================================
        // ENHANCED CHANGELOG DETECTION
        // Detects additions, removals, reordering, and role changes
        // ========================================

        // Build sets for comparison
        const oldModelIds = new Set(oldParticipants.map(p => p.modelId));
        const newModelIds = new Set(newParticipants.map(p => p.modelId));

        // Detect additions and removals
        const addedParticipants = newParticipants.filter(p => !oldModelIds.has(p.modelId));
        const removedParticipants = oldParticipants.filter(p => !newModelIds.has(p.modelId));

        // If no additions/removals, check for reordering or role changes
        if (addedParticipants.length === 0 && removedParticipants.length === 0) {
        // Same set of models - check for reordering or role changes

          // Check for reordering (different priorities) and role changes
          let hasReordering = false;
          const roleChanges: Array<{
            old: typeof oldParticipants[0];
            new: NonNullable<typeof newParticipants[0]>;
          }> = [];

          for (let i = 0; i < newParticipants.length; i++) {
            const newP = newParticipants[i];
            if (!newP)
              continue; // Type guard: skip if undefined

            const oldP = oldParticipants.find(op => op.modelId === newP.modelId);

            if (oldP) {
            // Check priority change (reordering)
              const newPriority = newP.order ?? i;
              if (oldP.priority !== newPriority) {
                hasReordering = true;
              }

              // Check role change
              const normalizedOldRole = oldP.role || null;
              const normalizedNewRole = newP.role || null;
              if (normalizedOldRole !== normalizedNewRole) {
                roleChanges.push({ old: oldP, new: newP });
              }
            }
          }

          // Log reordering if detected (takes precedence over role changes in UI)
          if (hasReordering) {
            const reorderedParticipants = newParticipants
              .map((p, idx) => {
                if (!p)
                  return null; // Type guard
                return {
                  id: participantsToCreate[idx]!.id, // Use the newly created participant IDs
                  modelId: p.modelId,
                  role: p.role || null,
                  order: p.order ?? idx,
                };
              })
              .filter((p): p is NonNullable<typeof p> => p !== null); // Filter out nulls and narrow type

            await logParticipantsReordered(threadId, reorderedParticipants);
          }

          // Log role changes if detected and no reordering
          // (If both reordering and role changes happen, reordering takes precedence)
          if (!hasReordering && roleChanges.length > 0) {
            for (const { old: oldP, new: newP } of roleChanges) {
              await logParticipantUpdated(
                threadId,
                oldP.id,
                oldP.modelId,
                oldP.role,
                newP.role || null,
              );
            }
          }
        } else {
        // Has additions or removals - log them
          for (const oldP of removedParticipants) {
            await logParticipantRemoved(threadId, oldP.id, oldP.modelId, oldP.role);
          }

          for (const newP of addedParticipants) {
          // Use a placeholder ID since we don't have the real ID yet (it's generated above)
          // The ID isn't critical for the changelog display
            await logParticipantAdded(threadId, 'pending', newP.modelId, newP.role || null);
          }
        }

        // Reload thread with new participants
        thread = await verifyThreadOwnership(threadId, user.id, db, { includeParticipants: true });
      } // end of participantsChanged check
    }

    // Load existing messages from database
    const dbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ OFFICIAL AI SDK PATTERN: Runtime Validation + Type Assertion
    // Documentation: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages
    //
    // Why this pattern?
    // - AI SDK types are complex (UIMessage<METADATA, DATA, TOOLS>)
    // - Zod cannot accurately represent AI SDK's recursive generic types
    // - Runtime validation ensures messages match AI SDK's expected structure
    // - Type assertion after validation is safe and recommended by AI SDK team
    //
    // Pattern:
    // 1. Accept messages as `z.array(z.unknown())` in schema (schema.ts:434)
    // 2. Runtime validate with `validateUIMessages()` (below)
    // 3. Type assert to `UIMessage[]` after validation passes
    const uiMessages = clientMessages as UIMessage[];

    try {
      validateUIMessages({ messages: uiMessages });
    } catch (error) {
      apiLogger.error('Invalid UI messages from client', {
        threadId,
        userId: user.id,
        messageCount: uiMessages.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw createError.badRequest('Invalid message format', {
        errorType: 'validation',
        field: 'messages',
      });
    }

    // Identify new message: last client message not in database
    const lastClientMessage = uiMessages[uiMessages.length - 1];
    const existsInDb = dbMessages.some(m => m.id === lastClientMessage?.id);
    let isNewMessage = false;

    if (!existsInDb && lastClientMessage && lastClientMessage.role === 'user') {
      // New user message - extract text and save to database
      const textParts = lastClientMessage.parts.filter(part => part.type === 'text');
      if (textParts.length === 0) {
        throw createError.badRequest('Message must contain at least one text part');
      }

      const content = textParts
        .map((part) => {
          if (!('text' in part) || typeof part.text !== 'string') {
            throw createError.badRequest('Text part missing text property');
          }
          return part.text;
        })
        .join('');

      if (content.trim().length === 0) {
        throw createError.badRequest('User message content is empty');
      }

      // Enforce quota
      await enforceMessageQuota(user.id);

      // ✅ Save user message to database (no variant tracking needed for user messages)
      await db.insert(tables.chatMessage).values({
        id: lastClientMessage.id,
        threadId,
        role: 'user',
        content,
        createdAt: new Date(),
      });

      isNewMessage = true;
    }

    // ==================================================
    // CONFIG-ONLY UPDATE: Return early if no streaming requested
    // ==================================================
    if (requestedParticipantIndex === undefined) {
      // Configuration was updated but no streaming response requested
      // This happens when user updates participants/mode without sending a message
      apiLogger.info('Configuration update only - no streaming', {
        threadId,
        userId: user.id,
        modeUpdated: !!newMode,
        participantsUpdated: !!newParticipants,
      });

      return Responses.ok(c, {
        success: true,
        message: 'Configuration updated successfully',
      });
    }

    // ==================================================
    // STREAMING RESPONSE: Validate and stream participant
    // ==================================================

    // Participants are already filtered for isEnabled=true by verifyThreadOwnership
    // and ordered by priority in the database query - no need to filter/sort again
    const participants = thread.participants;

    // One participant per HTTP request (N requests for N participants)
    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();

    // Validate requested participant index
    if (requestedParticipantIndex < 0 || requestedParticipantIndex >= participants.length) {
      throw createError.badRequest(
        `Invalid participantIndex ${requestedParticipantIndex}. Must be between 0 and ${participants.length - 1}`,
        {
          errorType: 'validation',
          field: 'participantIndex',
        },
      );
    }

    // ====================================================================
    // ✅ OFFICIAL AI SDK PATTERN: Direct streamText() Usage
    // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
    //
    // Why direct usage instead of service wrapper?
    // - Full control over abort signals (timeout + client disconnect)
    // - Full control over callbacks (onFinish, onError, onChunk)
    // - Full control over message metadata
    // - This is the RECOMMENDED pattern from AI SDK documentation
    //
    // Alternative (not used): Service wrapper
    // - Less control, more abstraction
    // - Only useful for simple non-streaming operations
    // - See openrouter.service.ts for non-streaming example
    // ====================================================================

    // ====================================================================
    // ✅ BUILD PARTICIPANT INFO: Prepare participant data for prompt
    // ====================================================================
    const participantInfos: ParticipantInfo[] = participants.map((p, idx) => ({
      id: p.id,
      modelId: p.modelId,
      modelName: undefined, // Will be extracted from modelId by service
      role: p.role,
      priority: idx,
    }));

    // Stream ONLY the requested participant
    const participantIndex = requestedParticipantIndex;
    const participant = participants[participantIndex]!;
    const currentParticipant = participantInfos[participantIndex]!;

    // ====================================================================
    // ✅ BUILD IMPROVED PROMPTS: Using AI SDK best practices
    // Separates system prompt (behavior) from context (memories, participants)
    // ====================================================================
    const promptConfig: RoundtablePromptConfig = {
      mode: thread.mode as ChatModeId,
      currentParticipantIndex: participantIndex,
      currentParticipant,
      allParticipants: participantInfos,
      customSystemPrompt: participant.settings?.systemPrompt,
    };

    const promptSetup = buildRoundtablePrompt(promptConfig, []);

    // ====================================================================
    // ✅ CONSTRUCT MESSAGE HISTORY: Inject context as user message
    // AI SDK best practice: Context belongs in user messages, not system prompt
    // ====================================================================
    const currentHistory: UIMessage[] = [];

    // Add context message as initial user message (if context exists)
    if (promptSetup.contextMessage) {
      currentHistory.push({
        id: `context-${threadId}`,
        role: 'user',
        parts: [{ type: 'text', text: promptSetup.contextMessage }],
        metadata: {
          isContextMessage: true,
        },
      } as UIMessage);
    }

    // Add actual conversation history
    currentHistory.push(...uiMessages);

    // ✅ Generate unique message ID ONCE per participant response
    // This prevents duplicate key errors in multi-participant scenarios
    const messageId = ulid();

    // 🛡️ Guard against duplicate onFinish calls
    // NOTE: AI SDK Behavior with consumeSseStream (observed but not explicitly documented):
    // - consumeSseStream ensures onFinish runs even on client disconnect
    // - However, in some cases onFinish may be called multiple times
    // - This guard prevents:
    //   1. Duplicate database inserts (though onConflictDoNothing provides backup)
    //   2. Multiple usage counter increments (would cause billing issues)
    //   3. Multiple title generation calls (unnecessary API calls)
    // Without this guard, we've observed duplicate processing in production
    let onFinishExecuted = false;

    // 🛡️ Track error for metadata in onFinish
    // NOTE: AI SDK Behavior (not explicitly documented):
    // - When onError returns a string, it's sent to client as error SSE event
    // - onFinish still runs afterward (due to consumeSseStream)
    // - However, responseMessage.parts may be empty in this case
    // - We track the error here to:
    //   1. Use error message as content if parts are empty
    //   2. Include error metadata in database for UI error state display
    let streamError: Error | null = null;

    // ✅ CRITICAL: Store classified error to prevent double classification
    // When onError returns a string, AI SDK creates a NEW Error with that string.
    // If we reclassify that new error, we lose the HTTP context (statusCode, etc.)
    // and it gets misclassified as "unknown" instead of the correct type (rate_limit, etc.)
    let classifiedError: ClassifiedError | null = null;

    // ✅ Cost Control: Calculate max output tokens based on tier
    // Note: OpenRouter models don't have maxOutputTokens config, use tier limits
    const tierMaxOutputTokens = getMaxOutputTokens(userTier);
    const maxOutputTokensLimit = tierMaxOutputTokens;

    // ✅ RETRY MECHANISM: Up to 10 attempts with fallback models (USER REQUIREMENT)
    // Track retry metadata for storage in message
    let retryMetadata: {
      totalAttempts: number;
      retryHistory: Array<{
        attemptNumber: number;
        modelId: string;
        errorType: string;
        errorMessage: string;
        timestamp: string;
        delayMs: number;
      }>;
      originalModel: string;
      finalModel: string;
      modelSwitched: boolean;
    } = {
      totalAttempts: 0,
      retryHistory: [],
      originalModel: participant.modelId,
      finalModel: participant.modelId,
      modelSwitched: false,
    };

    // ✅ OFFICIAL AI SDK PATTERN: streamText() Configuration wrapped in retry mechanism
    // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#streaming
    //
    // Key features from AI SDK:
    // - Built-in retry with `maxRetries` (disabled - we handle retries at higher level)
    // - Built-in transformations with `experimental_transform`
    // - Built-in telemetry with `experimental_telemetry`
    // - Built-in abort handling with `abortSignal`
    //
    // ✅ IMPROVED PROMPT ENGINEERING:
    // - System prompt: Clean behavior definition (from promptSetup.systemPrompt)
    // - User messages: Dynamic context (memories, participants) injected into currentHistory
    // - Message history: Properly formatted with participant labels

    // Create a stream function that can be retried with different models
    // ✅ CRITICAL FIX: Create NEW AbortSignal for EACH retry attempt
    // Each attempt gets its own fresh 30-second timeout
    const streamWithModel = async (modelId: string) => {
      // ✅ OFFICIAL AI SDK PATTERN: Timeout Protection with AbortSignal.timeout()
      // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/settings#abortsignal
      // ✅ USER REQUIREMENT: Timeout per attempt from centralized config
      // ✅ CRITICAL: Create NEW signal for EACH retry attempt (not shared across attempts)
      const attemptSignal = AbortSignal.any([
        c.req.raw.signal, // Client disconnect
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs), // ✅ Fresh timeout for THIS attempt from config
      ]);

      return streamText({
        model: client.chat(modelId),
        messages: convertToModelMessages(currentHistory),
        system: promptSetup.systemPrompt, // ✅ Clean system prompt without dynamic context
        temperature: participant.settings?.temperature ?? DEFAULT_AI_PARAMS.temperature,
        abortSignal: attemptSignal, // ✅ Use fresh signal for THIS attempt

        // ✅ Cost Control: Enforce output token limit based on subscription tier
        maxOutputTokens: maxOutputTokensLimit,

        // ✅ Disable AI SDK's built-in retry - we handle retries at higher level with fallback models
        maxRetries: 0,

        // ✅ AI SDK v5: Telemetry for performance monitoring
        experimental_telemetry: {
          isEnabled: true,
          functionId: `chat-participant-${participant.id}-${participantIndex}-model-${modelId}`,
        },

        // ✅ OFFICIAL AI SDK PATTERN: onAbort callback
        // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling#handling-stream-aborts
        // Called when stream is aborted via AbortSignal (timeout or client disconnect)
        onAbort: ({ steps }) => {
          apiLogger.info('Stream aborted', {
            threadId,
            participantId: participant.id,
            participantIndex,
            model: modelId,
            stepsCompleted: steps.length,
            timestamp: new Date().toISOString(),
          });
        },
      });
    };

    // ✅ Execute stream with retry mechanism (up to 10 attempts with fallback models - USER REQUIREMENT)
    // Will NOT skip to next participant until all retries exhausted
    const retryResult = await retryParticipantStream(
      streamWithModel,
      participant.modelId,
      userTier,
      {
        threadId,
        participantId: participant.id,
        participantIndex,
      },
    );

    // Store retry metadata for message persistence (map to our expected format)
    retryMetadata = {
      totalAttempts: retryResult.metadata.totalAttempts,
      retryHistory: retryResult.metadata.retryHistory.map(attempt => ({
        attemptNumber: attempt.attemptNumber,
        modelId: attempt.modelId,
        errorType: attempt.error.type,
        errorMessage: attempt.error.message,
        timestamp: attempt.timestamp,
        delayMs: attempt.delayMs,
      })),
      originalModel: retryResult.metadata.originalModel,
      finalModel: retryResult.metadata.finalModel,
      modelSwitched: retryResult.metadata.modelSwitched,
    };

    // If all retries failed, throw the error (will be caught by onError in toUIMessageStreamResponse)
    if (!retryResult.success || !retryResult.result) {
      const error = retryResult.error || new Error('All retry attempts failed');
      apiLogger.error('Participant stream failed after all retries', {
        threadId,
        participantId: participant.id,
        participantIndex,
        originalModel: retryMetadata.originalModel,
        finalModel: retryMetadata.finalModel,
        totalAttempts: retryMetadata.totalAttempts,
        modelSwitched: retryMetadata.modelSwitched,
        error: error.message,
      });

      // Classify and store the error
      classifiedError = classifyOpenRouterError(error);
      streamError = error;

      // Throw to trigger error handling in toUIMessageStreamResponse
      throw error;
    }

    // Get the successful result
    const result = retryResult.result;

    // ✅ OFFICIAL AI SDK PATTERN: toUIMessageStreamResponse()
    // Documentation: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#streaming-responses
    //
    // This single method handles:
    // - SSE (Server-Sent Events) formatting
    // - Message ID generation
    // - Message metadata
    // - Client disconnect detection
    // - onFinish callback for persistence
    // - onError callback for error handling
    //
    // 🚫 NO MANUAL SSE FORMATTING
    // 🚫 NO MANUAL STREAM HANDLING
    // 🚫 NO CUSTOM STREAMING UTILITIES
    return result.toUIMessageStreamResponse({
      // ✅ CRITICAL FIX: Only pass USER messages in originalMessages for Roundtable scenarios
      // Including previous assistant messages causes ID reuse across participants
      // Each participant needs a NEW unique message, not an update to existing ones
      // See: AI SDK v5 Multi-Agent Pattern - each agent gets unique message ID
      originalMessages: uiMessages.filter(msg => msg.role === 'user'),

      // ✅ CRITICAL: consumeSseStream ensures onFinish runs even on client disconnect
      // See: https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling
      consumeSseStream: consumeStream,

      // ✅ Return consistent NEW ID for this participant's message
      generateMessageId: () => messageId,

      // ✅ OFFICIAL AI SDK PATTERN: Enable reasoning streaming
      // Documentation: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
      // When enabled, AI SDK automatically emits reasoning-start, reasoning-delta, reasoning-end events
      // for models that support reasoning (Claude extended thinking, GPT reasoning, DeepSeek R1, etc.)
      sendReasoning: true,

      // ✅ CRITICAL: Send updated participant data when config changes
      // When participants are updated (reordered/added/removed), frontend needs new IDs
      // This prevents "Invalid participantIndex" errors and "losing memory" issues
      // ✅ NEW: Now async to fetch variant data in finish event
      messageMetadata: async ({ part }) => {
        if (part.type === 'start') {
          // Include updated participant data so frontend can sync state
          // Map to match frontend ParticipantConfig type exactly
          const updatedParticipants = participants.map(p => ({
            id: p.id,
            modelId: p.modelId,
            role: p.role || '', // Frontend expects string, not null
            customRoleId: p.customRoleId || undefined,
            order: p.priority,
          }));

          return {
            participants: updatedParticipants,
            threadMode: thread.mode,
            participantIndex, // ✅ For current participant preview during streaming
            // ✅ CRITICAL: Store actual participant data so historical messages are independent
            // When participants change (reorder/add/remove), historical messages must not be affected
            // Field names match database schema for consistency
            participantId: participant.id,
            model: retryMetadata.finalModel, // ✅ Use final model (may be fallback)
            role: participant.role || '', // ✅ Matches DB schema (not "participantRole")
            // ✅ NEW: Add roundId for variant tracking (AI SDK pattern)
            roundId: messageId, // Unique identifier for this generation round
            // ✅ NEW: Retry metadata for tracking attempts and fallbacks
            retryAttempts: retryMetadata.totalAttempts,
            originalModel: retryMetadata.originalModel,
            modelSwitched: retryMetadata.modelSwitched,
            hadRetries: retryMetadata.totalAttempts > 1,
          };
        }

        // ✅ Include error information in finish event if error occurred during streaming
        if (part.type === 'finish') {
          // ✅ Include error information if error occurred during streaming
          // This allows frontend to display detailed error messages immediately
          const errorInfo = streamError
            ? (() => {
                const classified = classifyOpenRouterError(streamError);
                const errorData: Record<string, unknown> = {
                  hasError: true,
                  error: classified.message,
                  errorMessage: classified.message,
                  errorType: classified.type,
                  isTransient: classified.isTransient,
                };

                // Add API error details if available
                if (APICallError.isInstance(streamError)) {
                  const { statusCode, url, responseBody } = streamError;
                  errorData.statusCode = statusCode;
                  errorData.url = url;

                  // Extract provider message from response body
                  try {
                    if (responseBody && typeof responseBody === 'object') {
                      const body = responseBody as Record<string, unknown>;
                      if (body.error && typeof body.error === 'object') {
                        const errorObj = body.error as Record<string, unknown>;
                        if (typeof errorObj.message === 'string') {
                          errorData.providerMessage = errorObj.message;
                        }
                        // ✅ Extract metadata.raw for upstream provider messages
                        if (errorObj.metadata && typeof errorObj.metadata === 'object') {
                          const metadata = errorObj.metadata as Record<string, unknown>;
                          if (typeof metadata.raw === 'string') {
                            errorData.providerMessage = metadata.raw;
                          }
                        }
                      }
                      errorData.responseBody = JSON.stringify(responseBody).substring(0, 500);
                    }
                  } catch {}
                }

                return errorData;
              })()
            : {};

          // ✅ USER REQUIREMENT: Flag to indicate moderator analysis is being generated
          const isLastParticipant = participantIndex === participants.length - 1;
          const analysisInfo = isLastParticipant && !streamError
            ? {
                isLastParticipant: true,
                moderatorAnalysisGenerating: true,
                moderatorAnalysisNote: 'Moderator analysis is being generated automatically and will be available via the analyses endpoint',
              }
            : {};

          return {
            // ✅ Include error information for frontend display
            ...errorInfo,
            // ✅ Include retry metadata in finish event
            retryAttempts: retryMetadata.totalAttempts,
            originalModel: retryMetadata.originalModel,
            finalModel: retryMetadata.finalModel,
            modelSwitched: retryMetadata.modelSwitched,
            hadRetries: retryMetadata.totalAttempts > 1,
            retryHistory: retryMetadata.retryHistory,
            // ✅ Include analysis generation info
            ...analysisInfo,
          };
        }

        // Return undefined for other part types (required by TypeScript)
        return undefined;
      },

      // ✅ AI SDK: Simplified onFinish with formatted UIMessage[] ready to save
      onFinish: async ({ messages, responseMessage, isAborted }) => {
        // 🛡️ Prevent duplicate execution (consumeSseStream can cause multiple calls)
        if (onFinishExecuted) {
          apiLogger.warn('onFinish called multiple times - skipping duplicate', {
            threadId,
            participantId: participant.id,
            messageId: responseMessage.id,
          });
          return;
        }
        onFinishExecuted = true;

        const now = new Date();

        // ✅ USER REQUIREMENT: Check if this is the last participant
        const isLastParticipant = participantIndex === participants.length - 1;

        // Extract text content and reasoning from the assistant message
        const textPart = responseMessage.parts.find(p => p.type === 'text');
        let content = textPart?.type === 'text' ? textPart.text : '';

        // Extract reasoning if present (for models that support extended thinking)
        const reasoningPart = responseMessage.parts.find(p => p.type === 'reasoning');
        const reasoning = reasoningPart?.type === 'reasoning' ? reasoningPart.text : null;

        // ✅ CRITICAL: Always save error messages to database for UI display
        // Following AI SDK error handling pattern: errors should be persisted
        // See: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling
        let hasError = false;
        if (streamError) {
          const classified = classifyOpenRouterError(streamError);
          hasError = true;

          // If no content, use error message as content
          if (!content || content.trim().length === 0) {
            content = `Error: ${classified.message}`;
          }

          apiLogger.warn('Error occurred during streaming - saving with error metadata', {
            threadId,
            participantId: participant.id,
            messageId: responseMessage.id,
            model: participant.modelId,
            errorMessage: classified.message,
            errorType: classified.type,
          });
        }

        // ✅ If still no content after error handling, use a fallback message
        // Never skip saving - always persist the message for error display
        //
        // ⚠️ NOTE: Empty responses should now be caught earlier in retryParticipantStream
        // via result.text validation. If we reach this code path, it suggests:
        // 1. The AI SDK's behavior changed (result.text showed content but parts are empty)
        // 2. Or there's an edge case in how empty responses are represented
        // This should be very rare now that we validate in the retry mechanism.
        if (!content || content.trim().length === 0) {
          hasError = true;

          // If we don't have a streamError but got empty content, create synthetic error
          if (!streamError) {
            const emptyResponseError = new Error('Model generated empty response - this usually indicates an API failure that did not trigger the error handler');
            streamError = emptyResponseError;

            apiLogger.error('Empty content with no streamError - model silently failed', {
              threadId,
              participantId: participant.id,
              messageId: responseMessage.id,
              model: participant.modelId,
              note: 'This indicates the AI SDK did not trigger onError callback despite generation failure. Empty responses should normally be caught in retryParticipantStream validation.',
            });
          }

          // ✅ Use stored classified error or classify if not available
          // This should rarely happen (only if empty response without error callback)
          const classified = classifiedError || classifyOpenRouterError(streamError);
          content = `Error: ${classified.message}`;

          apiLogger.warn('Setting error content from classification', {
            threadId,
            participantId: participant.id,
            errorType: classified.type,
            errorMessage: classified.message,
            usedStoredClassification: !!classifiedError,
          });
        }

        // ✅ Prepare metadata - include error info if error occurred
        // When onError returns a message, content is the error text
        // We need to include error metadata so frontend can display error UI

        // ✅ CRITICAL: Use stored classifiedError to prevent double classification
        // If we call formatErrorForDatabase(streamError), it will reclassify the error
        // and lose the HTTP context, resulting in "unknown" error type
        let errorMetadata = null;
        if (streamError && classifiedError) {
          // Build error metadata from the already-classified error
          const errorDetailsObj: Record<string, unknown> = {
            technicalMessage: classifiedError.technicalMessage,
            userMessage: classifiedError.message,
            modelId: participant.modelId,
            timestamp: new Date().toISOString(),
            isTransient: classifiedError.isTransient,
            shouldRetry: classifiedError.shouldRetry,
          };

          // ✅ Add APICallError-specific details if available from original error
          if (APICallError.isInstance(streamError)) {
            const { statusCode, url, responseBody, isRetryable } = streamError;
            errorDetailsObj.statusCode = statusCode;
            errorDetailsObj.url = url;
            errorDetailsObj.isRetryable = isRetryable;

            // Extract provider-specific error details
            const { providerMessage, providerCode } = extractErrorDetails(responseBody);
            if (providerMessage) {
              errorDetailsObj.providerMessage = providerMessage;
            }
            if (providerCode) {
              errorDetailsObj.providerCode = providerCode;
            }

            // Include raw response body for debugging (truncate if too large)
            const responseBodyStr = JSON.stringify(responseBody);
            errorDetailsObj.responseBody = responseBodyStr.length > 1000
              ? `${responseBodyStr.substring(0, 1000)}... (truncated)`
              : responseBodyStr;
          } else if (streamError instanceof Error) {
            // Include Error-specific details
            errorDetailsObj.errorName = streamError.name;
            errorDetailsObj.errorStack = streamError.stack;
          }

          errorMetadata = {
            error: classifiedError.type,
            errorMessage: classifiedError.message,
            errorType: classifiedError.type,
            errorDetails: JSON.stringify(errorDetailsObj, null, 2),
            isTransient: classifiedError.isTransient,
          };
        } else if (streamError) {
          // Fallback: If we don't have classifiedError, use formatErrorForDatabase
          // This should only happen in edge cases
          errorMetadata = formatErrorForDatabase(streamError, participant.modelId);
        }

        // ✅ Add hasError flag to metadata for frontend error detection
        const baseMetadata = {
          model: retryMetadata.finalModel, // ✅ Use final model (may be fallback)
          originalModel: retryMetadata.originalModel, // ✅ Track original model for transparency
          modelSwitched: retryMetadata.modelSwitched, // ✅ Flag if fallback was used
          role: participant.role,
          mode: thread.mode,
          participantId: participant.id,
          participantIndex,
          aborted: isAborted,
          partialResponse: isAborted,
          hasError, // ✅ Flag for frontend error display
          // ✅ NEW: Retry metadata for tracking attempts and errors
          retryAttempts: retryMetadata.totalAttempts,
          hadRetries: retryMetadata.totalAttempts > 1,
          retryHistory: retryMetadata.retryHistory,
        };

        // ✅ Save assistant message to database
        // Simple insert without variant tracking
        await db.insert(tables.chatMessage).values({
          id: responseMessage.id,
          threadId,
          participantId: participant.id,
          role: 'assistant',
          content,
          reasoning, // ✅ Extracted from parts array (may be null)
          metadata: {
            ...baseMetadata,
            // Include error metadata if error occurred
            ...(errorMetadata || {}),
          },
          createdAt: now,
        }).onConflictDoNothing(); // ✅ Prevent duplicates if onFinish called multiple times

        await db.update(tables.chatThread)
          .set({
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(tables.chatThread.id, threadId));

        // Increment usage
        const totalNewMessages = isNewMessage ? 2 : 1;
        await incrementMessageUsage(user.id, totalNewMessages);

        // ✅ USER REQUIREMENT: Automatically trigger moderator analysis after last participant
        // This analysis will be streamed to the frontend as part of the finish event
        if (isLastParticipant && !isAborted && !hasError) {
          apiLogger.info('Last participant completed - triggering automatic moderator analysis', {
            threadId,
            participantCount: participants.length,
            participantIndex,
          });

          // Generate moderator analysis in background (fire-and-forget)
          // This will be picked up by the frontend via the analyses endpoint
          (async () => {
            // Declare variables in outer scope so catch block can access them
            let analysisId: string | undefined;
            let roundNumber: number | undefined;

            try {
              // Collect all participant message IDs from this round
              // A round consists of all participant responses after the last user message
              const allMessages = await db.query.chatMessage.findMany({
                where: eq(tables.chatMessage.threadId, threadId),
                orderBy: [tables.chatMessage.createdAt],
              });

              // Find the last user message
              const userMessages = allMessages.filter(m => m.role === 'user');
              const lastUserMessage = userMessages[userMessages.length - 1];

              if (!lastUserMessage) {
                apiLogger.warn('No user message found for moderator analysis', { threadId });
                return;
              }

              // Get all assistant messages after the last user message
              const participantMessages = allMessages.filter(
                m => m.role === 'assistant'
                  && m.createdAt > lastUserMessage.createdAt
                  && m.participantId !== null,
              );

              // Only analyze if we have responses from all participants
              if (participantMessages.length !== participants.length) {
                apiLogger.warn('Not all participants have responded yet', {
                  threadId,
                  expected: participants.length,
                  actual: participantMessages.length,
                });
                return;
              }

              // Calculate round number (number of user messages so far)
              roundNumber = userMessages.length;

              // ✅ Create pending analysis record FIRST - enables loading state in frontend
              // Frontend polls and sees this pending record, shows loading indicator
              analysisId = ulid();
              await db.insert(tables.chatModeratorAnalysis).values({
                id: analysisId,
                threadId,
                roundNumber,
                mode: thread.mode,
                userQuestion: lastUserMessage.content,
                status: 'pending', // ✅ Start as pending - will update to completed/failed
                analysisData: null, // No data yet
                participantMessageIds: participantMessages.map(m => m.id),
                createdAt: new Date(),
              });

              apiLogger.info('Created pending analysis record - frontend can show loading state', {
                threadId,
                roundNumber,
                analysisId,
              });

              // Build participant response data
              const participantResponses = participantMessages.map((msg, index) => {
                const msgParticipant = participants.find(p => p.id === msg.participantId);
                if (!msgParticipant) {
                  throw new Error(`Participant not found for message ${msg.id}`);
                }

                const modelName = extractModeratorModelName(msgParticipant.modelId);
                return {
                  participantIndex: index,
                  participantRole: msgParticipant.role,
                  modelId: msgParticipant.modelId,
                  modelName,
                  responseContent: msg.content,
                };
              });

              // Build moderator prompts
              const { buildModeratorSystemPrompt, buildModeratorUserPrompt, ModeratorAnalysisSchema }
                = await import('@/api/services/moderator-analysis.service');

              const moderatorConfig = {
                mode: thread.mode as ChatModeId,
                roundNumber,
                userQuestion: lastUserMessage.content,
                participantResponses,
              };

              const systemPrompt = buildModeratorSystemPrompt(moderatorConfig);
              const userPrompt = buildModeratorUserPrompt(moderatorConfig);

              // ✅ DYNAMIC MODEL SELECTION: Use optimal analysis model from OpenRouter
              // Intelligently selects cheapest, fastest model for structured output
              // Falls back to gpt-4o-mini if no suitable model found
              const optimalModel = await openRouterModelsService.getOptimalAnalysisModel();
              const analysisModelId = optimalModel?.id || 'openai/gpt-4o-mini';

              apiLogger.info('Generating automatic moderator analysis', {
                threadId,
                roundNumber,
                analysisModel: analysisModelId,
                modelName: optimalModel?.name || 'GPT-4o Mini (fallback)',
                dynamicallySelected: !!optimalModel,
              });

              // Initialize OpenRouter
              initializeOpenRouter(c.env);
              const client = openRouterService.getClient();

              // ✅ AI SDK generateObject() Pattern: Generate complete structured JSON
              // Non-streaming approach for background analysis
              const { generateObject, NoObjectGeneratedError } = await import('ai');

              let analysisResult;
              try {
                analysisResult = await generateObject({
                  model: client.chat(analysisModelId),
                  schema: ModeratorAnalysisSchema,
                  schemaName: 'ModeratorAnalysis',
                  schemaDescription: 'Structured analysis of a conversation round with participant ratings, skills, pros/cons, leaderboard, and summary',
                  system: systemPrompt,
                  prompt: userPrompt,
                  mode: 'json',
                  experimental_telemetry: {
                    isEnabled: true,
                    functionId: `moderator-analysis-background-round-${roundNumber}`,
                  },
                  abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.moderatorAnalysisMs),
                });
              } catch (error) {
                if (NoObjectGeneratedError.isInstance(error)) {
                  throw new Error(`Failed to generate background analysis: ${error.message}`);
                }
                throw error;
              }

              const analysis = analysisResult.object;

              // Validate schema structure before saving
              const hasValidStructure = analysis.participantAnalyses
                && Array.isArray(analysis.participantAnalyses)
                && analysis.leaderboard
                && Array.isArray(analysis.leaderboard)
                && analysis.overallSummary
                && analysis.conclusion;

              if (!hasValidStructure) {
                const actualKeys = Object.keys(analysis);
                apiLogger.error('Background moderator analysis generated invalid structure', {
                  threadId,
                  roundNumber,
                  expectedKeys: ['participantAnalyses', 'leaderboard', 'overallSummary', 'conclusion'],
                  actualKeys,
                  sampleData: JSON.stringify(analysis).substring(0, 500),
                });
                throw new Error('Background analysis generated invalid structure - AI model did not follow schema');
              }

              // ✅ Update analysis record to completed with results
              // Frontend polls and sees status change, displays results
              await db
                .update(tables.chatModeratorAnalysis)
                .set({
                  status: 'completed',
                  analysisData: {
                    leaderboard: analysis.leaderboard,
                    participantAnalyses: analysis.participantAnalyses,
                    overallSummary: analysis.overallSummary,
                    conclusion: analysis.conclusion,
                  },
                  completedAt: new Date(),
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));

              apiLogger.info('Automatic moderator analysis completed successfully', {
                threadId,
                roundNumber,
                analysisId,
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);

              apiLogger.error('Failed to generate automatic moderator analysis', {
                threadId,
                roundNumber,
                analysisId,
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
              });

              // ✅ Update analysis record to failed
              // Frontend polls and sees status change, displays error
              if (analysisId) {
                try {
                  await db
                    .update(tables.chatModeratorAnalysis)
                    .set({
                      status: 'failed',
                      errorMessage,
                    })
                    .where(eq(tables.chatModeratorAnalysis.id, analysisId));
                } catch (updateError) {
                  apiLogger.error('Failed to update analysis status to failed', {
                    analysisId,
                    error: updateError instanceof Error ? updateError.message : String(updateError),
                  });
                }
              }

              // Don't throw - this is a background operation
            }
          })().catch(() => {
            // Suppress unhandled rejection warnings
          });
        }

        // Generate title if needed
        if (thread.title === 'New Chat' && messages.length > 0) {
          const firstUserMessage = messages.find(m => m.role === 'user');
          if (firstUserMessage) {
            const userTextPart = firstUserMessage.parts.find(p => p.type === 'text');
            const userContent = userTextPart?.type === 'text' ? userTextPart.text : '';

            if (userContent) {
              const generatedTitle = await generateTitleFromMessage(userContent, c.env);
              await db
                .update(tables.chatThread)
                .set({ title: generatedTitle })
                .where(eq(tables.chatThread.id, threadId));
            }
          }
        }
      },

      // ✅ AI SDK: Simplified error handling
      // Store error for metadata in onFinish so UI can display error state
      onError: (error) => {
        // Track error for metadata
        streamError = error instanceof Error ? error : new Error(String(error));

        // ✅ CRITICAL: Classify and store the error BEFORE returning
        // This prevents double classification that loses HTTP context
        const classified = classifyOpenRouterError(error);
        classifiedError = classified; // Store for use in onFinish

        // ✅ Extract detailed error information for logging
        const errorDetails: Record<string, unknown> = {
          threadId,
          participantId: participant.id,
          participantIndex,
          model: participant.modelId,
          errorType: classified.type,
          userMessage: classified.message,
          technicalMessage: classified.technicalMessage,
          isAborted: c.req.raw.signal.aborted,
          timestamp: new Date().toISOString(),
        };

        // ✅ Add AI SDK error details if available
        if (error && typeof error === 'object') {
          const errorObj = error as Record<string, unknown>;
          if ('statusCode' in errorObj)
            errorDetails.statusCode = errorObj.statusCode;
          if ('url' in errorObj)
            errorDetails.url = errorObj.url;
          if ('responseBody' in errorObj) {
            try {
              errorDetails.responseBody = JSON.stringify(errorObj.responseBody).substring(0, 500);
            } catch {
              errorDetails.responseBody = String(errorObj.responseBody).substring(0, 500);
            }
          }
        }

        // ✅ Add error stack for debugging
        if (error instanceof Error && error.stack) {
          errorDetails.errorStack = error.stack.split('\n').slice(0, 5).join('\n'); // First 5 lines
        }

        // ✅ Check for error.cause (AI SDK retry errors often have underlying cause)
        if (error && typeof error === 'object' && 'cause' in error) {
          const cause = (error as { cause: unknown }).cause;
          if (cause && typeof cause === 'object') {
            errorDetails.errorCause = cause instanceof Error
              ? { message: cause.message, name: cause.name, stack: cause.stack?.split('\n').slice(0, 3).join('\n') }
              : JSON.stringify(cause).substring(0, 500);
          }
        }

        // ✅ Dump full error object structure for debugging (in dev mode)
        if (process.env.NODE_ENV === 'development') {
          try {
            errorDetails.fullErrorObject = JSON.stringify(error, Object.getOwnPropertyNames(error), 2).substring(0, 1000);
          } catch {
            errorDetails.fullErrorObject = '[Could not serialize error object]';
          }
        }

        apiLogger.error('Stream error with full context', errorDetails);

        // Log what we're returning to verify it's the correct message
        apiLogger.warn('onError returning classified message', {
          classifiedType: classified.type,
          classifiedMessage: classified.message,
          classifiedTechnical: classified.technicalMessage,
          isTransient: classified.isTransient,
        });

        // Return user-friendly error message
        // This becomes the content text streamed to the client
        return classified.message;
      },
    });
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
    return Responses.ok(c, applyCursorPagination(
      customRoles,
      query.limit,
      customRole => createTimestampCursor(customRole.updatedAt),
    ));
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
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        metadata: body.metadata,
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
    validateParams: CustomRoleIdParamSchema,
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
    validateParams: CustomRoleIdParamSchema,
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
        ...body,
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
    validateParams: CustomRoleIdParamSchema,
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
        apiLogger.info('Analysis already completed for this round - returning existing', {
          threadId,
          roundNumber: roundNum,
          analysisId: existingAnalysis.id,
          status: existingAnalysis.status,
        });

        return c.json({
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
        apiLogger.info('Analysis already in progress for this round - returning 202', {
          threadId,
          roundNumber: roundNum,
          analysisId: existingAnalysis.id,
          status: existingAnalysis.status,
          createdAt: existingAnalysis.createdAt,
        });

        return c.json({
          status: existingAnalysis.status,
          message: 'Analysis is currently being generated. Please wait...',
          analysisId: existingAnalysis.id,
          createdAt: existingAnalysis.createdAt,
        }, 202); // 202 Accepted - request accepted but not yet completed
      }

      // ✅ FAILED: Allow retry by creating new analysis
      if (existingAnalysis.status === 'failed') {
        apiLogger.info('Previous analysis failed - allowing retry', {
          threadId,
          roundNumber: roundNum,
          analysisId: existingAnalysis.id,
          errorMessage: existingAnalysis.errorMessage,
        });

        // Delete failed analysis to allow fresh retry
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }
    }

    // Fetch all participant messages for this round
    const participantMessages = await db.query.chatMessage.findMany({
      where: (fields, { inArray, eq: eqOp, and: andOp }) =>
        andOp(
          inArray(fields.id, body.participantMessageIds),
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, 'assistant'),
        ),
      with: {
        participant: true, // Include participant info (model, role, etc.)
      },
      orderBy: [tables.chatMessage.createdAt], // Maintain response order
    });

    // Validation: Ensure we have all requested messages
    if (participantMessages.length !== body.participantMessageIds.length) {
      const foundIds = participantMessages.map(m => m.id);
      const missingIds = body.participantMessageIds.filter(id => !foundIds.includes(id));
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

    c.logger.info('Using dynamically selected analysis model for moderator', {
      logType: 'operation',
      operationName: 'analyzeRound',
      resource: `${analysisModelId} (${optimalModel?.name || 'GPT-4o Mini - fallback'}) - ${optimalModel ? 'dynamically selected' : 'fallback'}`,
    });

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

    apiLogger.info('Created pending analysis record - streaming will begin', {
      threadId,
      roundNumber: roundNum,
      analysisId,
      participantCount: participantMessages.length,
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
        onFinish: async ({ object: finalObject, error, usage }) => {
          // ✅ FAILED: Update status to failed with error message
          if (error) {
            apiLogger.error('Moderator analysis failed', {
              threadId,
              roundNumber: roundNum,
              analysisId,
              error,
            });

            try {
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: error instanceof Error ? error.message : String(error),
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));

              apiLogger.info('Analysis status updated to failed', {
                threadId,
                roundNumber: roundNum,
                analysisId,
              });
            } catch (updateError) {
              apiLogger.error('Failed to update analysis status to failed', {
                threadId,
                roundNumber: roundNum,
                analysisId,
                updateError,
              });
            }
            return;
          }

          // ✅ NO OBJECT: Mark as failed
          if (!finalObject) {
            apiLogger.warn('Moderator analysis completed with no object', {
              threadId,
              roundNumber: roundNum,
              analysisId,
            });

            try {
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: 'Analysis completed but no object was generated',
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            } catch (updateError) {
              apiLogger.error('Failed to update analysis status (no object)', {
                threadId,
                roundNumber: roundNum,
                analysisId,
                updateError,
              });
            }
            return;
          }

          apiLogger.info('Moderator analysis completed successfully', {
            threadId,
            roundNumber: roundNum,
            analysisId,
            participantCount: participantMessages.length,
            hasParticipantAnalyses: !!finalObject?.participantAnalyses,
            hasLeaderboard: !!finalObject?.leaderboard,
            usage,
          });

          // ✅ Validate schema before saving to prevent corrupt data
          const hasValidStructure = finalObject.participantAnalyses
            && Array.isArray(finalObject.participantAnalyses)
            && finalObject.leaderboard
            && Array.isArray(finalObject.leaderboard)
            && finalObject.overallSummary
            && finalObject.conclusion;

          if (!hasValidStructure) {
            apiLogger.error('Moderator analysis has invalid structure - schema not followed', {
              threadId,
              roundNumber: roundNum,
              analysisId,
              hasParticipantAnalyses: !!finalObject.participantAnalyses,
              hasLeaderboard: !!finalObject.leaderboard,
              hasOverallSummary: !!finalObject.overallSummary,
              hasConclusion: !!finalObject.conclusion,
              actualKeys: Object.keys(finalObject),
            });

            try {
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: 'Analysis generated but structure is invalid',
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            } catch (updateError) {
              apiLogger.error('Failed to update analysis status (invalid structure)', {
                threadId,
                roundNumber: roundNum,
                analysisId,
                updateError,
              });
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

            apiLogger.info('Moderator analysis updated to completed in database', {
              threadId,
              roundNumber: roundNum,
              analysisId,
            });
          } catch (updateError) {
            apiLogger.error('Failed to update moderator analysis to completed', {
              threadId,
              roundNumber: roundNum,
              analysisId,
              error: updateError,
            });
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
        apiLogger.error('No object generated by AI model', {
          threadId,
          roundNumber: roundNum,
          cause: error.cause,
          text: error.text,
          finishReason: error.finishReason,
        });

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
    validateParams: ThreadIdParamSchema,
    operationName: 'getThreadAnalyses',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;

    c.logger.info('Fetching moderator analyses', {
      logType: 'operation',
      operationName: 'getThreadAnalyses',
      userId: user.id,
      resource: threadId,
    });

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

    c.logger.info(`Moderator analyses fetched successfully: ${analyses.length} unique rounds (${allAnalyses.length} total records)`, {
      logType: 'operation',
      operationName: 'getThreadAnalyses',
      resource: threadId,
    });

    return Responses.ok(c, {
      analyses,
      count: analyses.length,
    });
  },
);

/**
 * Helper function to extract model name from model ID
 * (Duplicated from moderator service to avoid circular dependency)
 */
function extractModeratorModelName(modelId: string): string {
  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1] || modelId;

  return modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
