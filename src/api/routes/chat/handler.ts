import type { RouteHandler } from '@hono/zod-openapi';
import { consumeStream, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, validateUIMessages } from 'ai';
import { and, eq, ne } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createTimestampCursor,
  getCursorOrderBy,
} from '@/api/common/pagination';
import { buildUIMessages } from '@/api/common/streaming';
import type { ErrorContext } from '@/api/core';
import { createHandler, Responses } from '@/api/core';
import { CursorPaginationQuerySchema } from '@/api/core/schemas';
import { apiLogger } from '@/api/middleware/hono-logger';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import { generateTitleFromMessage } from '@/api/services/title-generator.service';
import {
  enforceCustomRoleQuota,
  enforceMemoryQuota,
  enforceMessageQuota,
  enforceThreadQuota,
  getUserUsageStats,
  incrementCustomRoleUsage,
  incrementMemoryUsage,
  incrementMessageUsage,
  incrementThreadUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { SubscriptionTier } from '@/db/tables/usage';
import type { SessionTypeMode } from '@/lib/ai/models-config';
import {
  buildRoundtableSystemPrompt,
  canAccessModel,
  getModelById,
  getTierDisplayName,
} from '@/lib/ai/models-config';
import type { ChatModeId, ThreadStatus } from '@/lib/config/chat-modes';

import type {
  addParticipantRoute,
  createCustomRoleRoute,
  createMemoryRoute,
  createThreadRoute,
  deleteCustomRoleRoute,
  deleteMemoryRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  getCustomRoleRoute,
  getMemoryRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadRoute,
  listCustomRolesRoute,
  listMemoriesRoute,
  listThreadsRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateMemoryRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './route';
import {
  AddParticipantRequestSchema,
  CreateCustomRoleRequestSchema,
  CreateMemoryRequestSchema,
  CreateThreadRequestSchema,
  CustomRoleIdParamSchema,
  MemoryIdParamSchema,
  ParticipantIdParamSchema,
  StreamChatRequestSchema,
  ThreadIdParamSchema,
  ThreadSlugParamSchema,
  UpdateCustomRoleRequestSchema,
  UpdateMemoryRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

/**
 * Error Context Builders - Following src/api/routes/billing/handler.ts pattern
 */
function createAuthErrorContext(operation?: string): ErrorContext {
  return {
    errorType: 'authentication',
    operation: operation || 'session_required',
  };
}

function createResourceNotFoundContext(
  resource: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'resource',
    resource,
    resourceId,
  };
}

function createAuthorizationErrorContext(
  resource: string,
  resourceId?: string,
): ErrorContext {
  return {
    errorType: 'authorization',
    resource,
    resourceId,
  };
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
    throw createError.notFound('Thread not found', createResourceNotFoundContext('thread', threadId));
  }

  if (thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to access this thread',
      createAuthorizationErrorContext('thread', threadId),
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
    operationName: 'listThreads',
  },
  async (c) => {
    // With auth: 'session', c.auth() provides type-safe access to user and session
    const { user } = c.auth();

    // Parse cursor pagination query parameters
    const query = CursorPaginationQuerySchema.parse(c.req.query());
    const db = await getDbAsync();

    // Fetch threads with cursor-based pagination (limit + 1 to check hasMore)
    // Exclude deleted threads from the list (show active and archived only)
    const threads = await db.query.chatThread.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        [
          eq(tables.chatThread.userId, user.id),
          ne(tables.chatThread.status, 'deleted'), // Exclude deleted threads
        ],
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

    // Validate that user can access all requested models
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

      if (!canAccessModel(userTier, participant.modelId)) {
        throw createError.unauthorized(
          `Your ${getTierDisplayName(userTier)} plan does not include access to ${model.name}. Upgrade to ${getTierDisplayName(model.minTier)} or higher to use this model.`,
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
                createAuthorizationErrorContext('custom_role', p.customRoleId),
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

        apiLogger.info('Thread title updated asynchronously', {
          threadId,
          title: aiTitle,
        });
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

    // Attach memories to thread via junction table if provided
    if (body.memoryIds && body.memoryIds.length > 0) {
      // Verify all memories exist and belong to user
      const memories = await db.query.chatMemory.findMany({
        where: (fields, { inArray }) => inArray(fields.id, body.memoryIds!),
      });

      // Check if all memories exist
      if (memories.length !== body.memoryIds.length) {
        const foundIds = memories.map(m => m.id);
        const missingIds = body.memoryIds.filter(id => !foundIds.includes(id));
        throw createError.notFound(
          `Memories not found: ${missingIds.join(', ')}`,
          createResourceNotFoundContext('memory', missingIds[0]),
        );
      }

      // Check if all memories belong to the user
      const unauthorizedMemory = memories.find(m => m.userId !== user.id);
      if (unauthorizedMemory) {
        throw createError.unauthorized(
          'Not authorized to use this memory',
          createAuthorizationErrorContext('memory', unauthorizedMemory.id),
        );
      }

      // Create junction table entries
      await Promise.all(
        body.memoryIds.map(memoryId =>
          db.insert(tables.chatThreadMemory).values({
            id: ulid(),
            threadId,
            memoryId,
            attachedAt: now,
          }),
        ),
      );
    }

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
    const user = c.var.user; // May be undefined for unauthenticated requests
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, id),
    });

    if (!thread) {
      throw createError.notFound('Thread not found', createResourceNotFoundContext('thread', id));
    }

    // Smart access control: Public threads are accessible to anyone, private threads require ownership
    if (!thread.isPublic) {
      // Private thread - requires authentication and ownership
      if (!user) {
        throw createError.unauthenticated(
          'Authentication required to access private thread',
          createAuthErrorContext(),
        );
      }

      if (thread.userId !== user.id) {
        throw createError.unauthorized(
          'Not authorized to access this thread',
          createAuthorizationErrorContext('thread', id),
        );
      }
    }

    // Fetch participants (ordered by priority)
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, id),
      orderBy: [tables.chatParticipant.priority],
    });

    // Fetch messages (ordered by creation time)
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Fetch attached memories via junction table
    const threadMemories = await db.query.chatThreadMemory.findMany({
      where: eq(tables.chatThreadMemory.threadId, id),
      with: {
        memory: true, // Include the full memory object
      },
    });

    // Extract just the memory objects from the junction records
    const memories = threadMemories.map(tm => tm.memory);

    // Return everything in one response (ChatGPT pattern)
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      memories,
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
      updateData.metadata = body.metadata;

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

    if (!thread || !thread.isPublic) {
      throw createError.notFound(
        'Public thread not found',
        createResourceNotFoundContext('public_thread', slug),
      );
    }

    // Fetch participants (ordered by priority) - same as private handler
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority],
    });

    // Fetch messages (ordered by creation time) - same as private handler
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Return same structure as private thread handler for consistency
    return Responses.ok(c, {
      thread,
      participants,
      messages,
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
      throw createError.notFound('Thread not found', createResourceNotFoundContext('thread', slug));
    }

    // Ownership check - user can only access their own threads
    if (thread.userId !== user.id) {
      throw createError.unauthorized(
        'Not authorized to access this thread',
        createAuthorizationErrorContext('thread', slug),
      );
    }

    // Fetch participants (ordered by priority)
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority],
    });

    // Fetch messages (ordered by creation time)
    const messages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Fetch attached memories via junction table
    const threadMemories = await db.query.chatThreadMemory.findMany({
      where: eq(tables.chatThreadMemory.threadId, thread.id),
      with: {
        memory: true, // Include the full memory object
      },
    });

    // Extract just the memory objects from the junction records
    const memories = threadMemories.map(tm => tm.memory);

    // Return everything in one response (same pattern as getThreadHandler)
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      memories,
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

    // Validate that user can access the requested model
    const model = getModelById(body.modelId);

    if (!model) {
      throw createError.badRequest(
        `Model "${body.modelId}" not found`,
        {
          errorType: 'validation',
          field: 'modelId',
        },
      );
    }

    if (!canAccessModel(userTier, body.modelId)) {
      throw createError.unauthorized(
        `Your ${getTierDisplayName(userTier)} plan does not include access to ${model.name}. Upgrade to ${getTierDisplayName(model.minTier)} or higher to use this model.`,
        {
          errorType: 'authorization',
          resource: 'model',
          resourceId: body.modelId,
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
      throw createError.notFound('Participant not found', createResourceNotFoundContext('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to modify this participant', createAuthorizationErrorContext('participant', id));
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
      throw createError.notFound('Participant not found', createResourceNotFoundContext('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to delete this participant', createAuthorizationErrorContext('participant', id));
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
// Note: listMessagesHandler removed - use getThreadHandler instead
// Note: getMessageHandler removed - no use case for viewing single message
// Note: sendMessageHandler removed - use streamChatHandler for all chat operations

/**
 * Stream chat handler using AI SDK v5 Standard Pattern
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 *
 * AI SDK v5 Standard Pattern:
 * 1. Receive ALL messages from frontend (including new message)
 * 2. Identify new message by comparing with database
 * 3. Save new message to database
 * 4. Stream responses from participants
 * 5. Save responses to database
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
      participantIndex: requestedParticipantIndex,
      mode: newMode,
      participants: newParticipants,
      memoryIds: newMemoryIds,
    } = c.validated.body;
    const db = await getDbAsync();

    // Verify thread ownership and get participants
    let thread = await verifyThreadOwnership(threadId, user.id, db, { includeParticipants: true });

    // ==================================================
    // DYNAMIC CONFIGURATION UPDATES
    // Update thread mode/participants/memories if provided
    // ==================================================

    // Update thread mode if changed
    if (newMode && newMode !== thread.mode) {
      await db
        .update(tables.chatThread)
        .set({ mode: newMode as ChatModeId, updatedAt: new Date() })
        .where(eq(tables.chatThread.id, threadId));

      thread.mode = newMode as ChatModeId; // Update local reference
      apiLogger.info('Thread mode updated', { threadId, oldMode: thread.mode, newMode });
    }

    // Update participants if provided
    if (newParticipants && newParticipants.length > 0) {
      // Get user's subscription tier to validate model access
      const usageStats = await getUserUsageStats(user.id);
      const userTier = usageStats.subscription.tier as SubscriptionTier;

      // Validate that user can access all requested models
      for (const participant of newParticipants) {
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

        if (!canAccessModel(userTier, participant.modelId)) {
          throw createError.unauthorized(
            `Your ${getTierDisplayName(userTier)} plan does not include access to ${model.name}. Upgrade to ${getTierDisplayName(model.minTier)} or higher to use this model.`,
            {
              errorType: 'authorization',
              resource: 'model',
              resourceId: participant.modelId,
            },
          );
        }
      }

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

      // Reload thread with new participants
      thread = await verifyThreadOwnership(threadId, user.id, db, { includeParticipants: true });
      apiLogger.info('Thread participants updated', {
        threadId,
        participantCount: newParticipants.length,
        models: newParticipants.map(p => p.modelId),
      });
    }

    // Update memories if provided
    if (newMemoryIds !== undefined) {
      // Delete existing memory attachments
      await db
        .delete(tables.chatThreadMemory)
        .where(eq(tables.chatThreadMemory.threadId, threadId));

      // Attach new memories
      if (newMemoryIds.length > 0) {
        const memoriesToAttach = newMemoryIds.map(memoryId => ({
          id: ulid(),
          threadId,
          memoryId,
        }));

        await db.insert(tables.chatThreadMemory).values(memoriesToAttach);
      }

      apiLogger.info('Thread memories updated', {
        threadId,
        memoryCount: newMemoryIds.length,
      });
    }

    // Load existing messages from database
    const dbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [tables.chatMessage.createdAt],
    });

    // Identify new message: last client message not in database
    const lastClientMessage = clientMessages[clientMessages.length - 1];
    const existsInDb = dbMessages.some(m => m.id === lastClientMessage?.id);

    // Prepare messages for AI processing
    let messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
    let isNewMessage = false;

    if (!existsInDb && lastClientMessage && lastClientMessage.role === 'user') {
      // New user message - save to database
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

      // Save to database
      await db.insert(tables.chatMessage).values({
        id: lastClientMessage.id,
        threadId,
        role: 'user',
        content,
        createdAt: new Date(),
      });

      // Use all client messages for context
      messages = clientMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(''),
      }));
      isNewMessage = true;
    } else {
      // Use client messages as-is (regenerate or auto-trigger)
      messages = clientMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(''),
      }));
    }

    // Build UI messages for AI SDK
    const uiMessages = buildUIMessages(messages);

    // Validate UI messages before streaming
    try {
      validateUIMessages({ messages: uiMessages });
    } catch (error) {
      apiLogger.error('Invalid UI messages', {
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

    // Participants are already filtered for isEnabled=true by verifyThreadOwnership
    // and ordered by priority in the database query - no need to filter/sort again
    const participants = thread.participants;

    apiLogger.info('Participants loaded for streaming', {
      threadId,
      totalParticipants: participants.length,
      participants: participants.map(p => ({
        id: p.id,
        modelId: p.modelId,
        priority: p.priority,
        isEnabled: p.isEnabled,
      })),
    });

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

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Use all messages as context for this participant
        const currentHistory = [...uiMessages];

        // Stream ONLY the requested participant
        const participantIndex = requestedParticipantIndex;
        const participant = participants[participantIndex]!;

        apiLogger.info('Streaming participant response', {
          threadId,
          participantIndex,
          participantId: participant.id,
          model: participant.modelId,
          historyLength: currentHistory.length,
        });
        // Build system prompt (only includes previous participants)
        const systemPrompt = buildRoundtableSystemPrompt({
          mode: thread.mode as SessionTypeMode,
          participantIndex,
          participantRole: participant.role,
          customSystemPrompt: participant.settings?.systemPrompt,
          otherParticipants: participants
            .slice(0, participantIndex)
            .map(p => ({
              index: p.priority, // Use actual priority, not map index
              role: p.role,
            })),
        });

        const messageId = ulid();

        apiLogger.info('Stream starting', {
          threadId,
          participantId: participant.id,
          participantIndex,
          model: participant.modelId,
        });

        const result = streamText({
          model: client.chat(participant.modelId),
          messages: convertToModelMessages(currentHistory),
          system: systemPrompt,
          temperature: participant.settings?.temperature || 0.7,

          abortSignal: c.req.raw.signal,

          onFinish: async ({ text, usage }) => {
            try {
              const now = new Date();

              // Save message and update thread metadata
              await db.insert(tables.chatMessage).values({
                id: messageId,
                threadId,
                participantId: participant.id,
                role: 'assistant',
                content: text,
                metadata: {
                  model: participant.modelId,
                  role: participant.role,
                  mode: thread.mode,
                  participantId: participant.id,
                  participantIndex,
                  // Store usage if available
                  ...(usage && { totalTokens: usage.totalTokens }),
                },
                createdAt: now,
              });

              await db.update(tables.chatThread)
                .set({
                  lastMessageAt: now,
                  updatedAt: now,
                })
                .where(eq(tables.chatThread.id, threadId));

              const totalNewMessages = isNewMessage ? 2 : 1;
              await incrementMessageUsage(user.id, totalNewMessages);

              // Generate title if needed
              if (thread.title === 'New Chat' && messages.length > 0) {
                const firstUserMessage = messages.find(m => m.role === 'user');
                if (firstUserMessage) {
                  const generatedTitle = await generateTitleFromMessage(
                    firstUserMessage.content,
                    c.env,
                  );
                  await db
                    .update(tables.chatThread)
                    .set({ title: generatedTitle })
                    .where(eq(tables.chatThread.id, threadId));
                }
              }

              apiLogger.info('Participant response completed', {
                participantId: participant.id,
                participantIndex,
                messageId,
                textLength: text.length,
                totalTokens: usage?.totalTokens || 0,
              });
            } catch (error) {
              apiLogger.error('Failed to save participant response', {
                threadId,
                participantId: participant.id,
                participantIndex,
                messageId,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
              // Don't throw - allow stream to complete for user
            }
          },

          onError: (error) => {
            apiLogger.error('Streaming error', {
              threadId,
              participantId: participant.id,
              participantIndex,
              model: participant.modelId,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          },

          onAbort: () => {
            apiLogger.warn('Stream aborted by client', {
              threadId,
              participantId: participant.id,
              participantIndex,
              messageId,
            });
          },
        });

        const uiStream = result.toUIMessageStream({
          generateMessageId: () => messageId,
          messageMetadata: () => ({
            participantId: participant.id,
            model: participant.modelId,
            role: participant.role,
          }),
        });

        writer.merge(uiStream);
      },
    });

    // consumeSseStream ensures onFinish runs even on client disconnect
    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: consumeStream,
    });
  },
);

// ============================================================================
// Memory Handlers
// ============================================================================

export const listMemoriesHandler: RouteHandler<typeof listMemoriesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listMemories',
  },
  async (c) => {
    const { user } = c.auth();

    // Parse cursor pagination query parameters
    const query = CursorPaginationQuerySchema.parse(c.req.query());
    const db = await getDbAsync();

    // Fetch memories with cursor-based pagination (limit + 1 to check hasMore)
    const memories = await db.query.chatMemory.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatMemory.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatMemory.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatMemory.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    // Apply cursor pagination and format response
    return Responses.ok(c, applyCursorPagination(
      memories,
      query.limit,
      memory => createTimestampCursor(memory.updatedAt),
    ));
  },
);

export const createMemoryHandler: RouteHandler<typeof createMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateMemoryRequestSchema,
    operationName: 'createMemory',
  },
  async (c) => {
    const { user } = c.auth();

    // Enforce memory quota BEFORE creating
    await enforceMemoryQuota(user.id);

    const body = c.validated.body;
    const db = await getDbAsync();

    const memoryId = ulid();
    const now = new Date();

    const [memory] = await db
      .insert(tables.chatMemory)
      .values({
        id: memoryId,
        userId: user.id,
        threadId: body.threadId,
        type: body.type || 'topic',
        title: body.title,
        description: body.description,
        content: body.content,
        isGlobal: body.isGlobal || false,
        metadata: body.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Increment memory usage AFTER successful creation
    await incrementMemoryUsage(user.id);

    return Responses.ok(c, {
      memory,
    });
  },
);

export const getMemoryHandler: RouteHandler<typeof getMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: MemoryIdParamSchema,
    operationName: 'getMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Query with userId - memories are always user-scoped
    const memory = await db.query.chatMemory.findFirst({
      where: and(
        eq(tables.chatMemory.id, id),
        eq(tables.chatMemory.userId, user.id),
      ),
    });

    if (!memory) {
      throw createError.notFound('Memory not found', createResourceNotFoundContext('memory', id));
    }

    return Responses.ok(c, {
      memory,
    });
  },
);

export const updateMemoryHandler: RouteHandler<typeof updateMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: MemoryIdParamSchema,
    validateBody: UpdateMemoryRequestSchema,
    operationName: 'updateMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    // Update with userId filter - memories are always user-scoped
    const [updatedMemory] = await db
      .update(tables.chatMemory)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(
        eq(tables.chatMemory.id, id),
        eq(tables.chatMemory.userId, user.id),
      ))
      .returning();

    if (!updatedMemory) {
      throw createError.notFound('Memory not found', createResourceNotFoundContext('memory', id));
    }

    return Responses.ok(c, {
      memory: updatedMemory,
    });
  },
);

export const deleteMemoryHandler: RouteHandler<typeof deleteMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: MemoryIdParamSchema,
    operationName: 'deleteMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    // Delete with userId filter - memories are always user-scoped
    const result = await db
      .delete(tables.chatMemory)
      .where(and(
        eq(tables.chatMemory.id, id),
        eq(tables.chatMemory.userId, user.id),
      ))
      .returning();

    if (result.length === 0) {
      throw createError.notFound('Memory not found', createResourceNotFoundContext('memory', id));
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);

// ============================================================================
// Custom Role Handlers
// ============================================================================

export const listCustomRolesHandler: RouteHandler<typeof listCustomRolesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listCustomRoles',
  },
  async (c) => {
    const { user } = c.auth();

    // Parse cursor pagination query parameters
    const query = CursorPaginationQuerySchema.parse(c.req.query());
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
      throw createError.notFound('Custom role not found', createResourceNotFoundContext('custom_role', id));
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
      throw createError.notFound('Custom role not found', createResourceNotFoundContext('custom_role', id));
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
      throw createError.notFound('Custom role not found', createResourceNotFoundContext('custom_role', id));
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
