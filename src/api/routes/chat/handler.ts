import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { consumeStream, convertToModelMessages, smoothStream, streamText, validateUIMessages } from 'ai';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, like, ne } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createTimestampCursor,
  getCursorOrderBy,
} from '@/api/common/pagination';
import type { ErrorContext } from '@/api/core';
import { createHandler, Responses } from '@/api/core';
import { CursorPaginationQuerySchema } from '@/api/core/schemas';
import { apiLogger } from '@/api/middleware/hono-logger';
import { getMessageVariantsForStream, saveAssistantMessageWithVariants } from '@/api/services/message-variant.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import {
  classifyOpenRouterError,
  formatErrorForDatabase,
} from '@/api/services/openrouter-error-handler';
import { generateUniqueSlug } from '@/api/services/slug-generator.service';
import {
  logMemoryAdded,
  logMemoryRemoved,
  logModeChange,
  logParticipantAdded,
  logParticipantRemoved,
  logParticipantsReordered,
  logParticipantUpdated,
} from '@/api/services/thread-changelog.service';
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
import {
  buildRoundtableSystemPrompt,
  canAccessModel,
  canAddMoreModels,
  getMaxModelsErrorMessage,
  getMaxOutputTokens,
  getModelById,
  getTierDisplayName,
} from '@/lib/ai/models-config';
import type { ChatModeId, ThreadStatus } from '@/lib/config/chat-modes';
import type { MessageMetadata } from '@/lib/schemas/message-metadata';

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
  getThreadChangelogRoute,
  getThreadMessagesRoute,
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
  ThreadListQuerySchema,
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

    // Parse query parameters including search
    const query = ThreadListQuerySchema.parse(c.req.query());
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

    // ✅ UPDATED: Fetch ALL messages (including inactive variants)
    // ✅ Fetch ALL messages (no filtering by isActiveVariant - that's now in metadata)
    const allMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ Get active messages for display using metadata.isActiveVariant
    const activeMessages = allMessages.filter((msg) => {
      const metadata = msg.metadata as MessageMetadata;
      // User messages are always active, assistant messages check metadata
      return msg.role === 'user' || (metadata?.isActiveVariant === true);
    });

    // ✅ Enrich active messages with ALL their variant siblings
    const messages = await Promise.all(
      activeMessages.map(async (message) => {
        if (message.role !== 'assistant' || !message.participantId) {
          return message;
        }

        try {
          const messageMetadata = message.metadata as MessageMetadata;
          const parentMsgId = messageMetadata?.parentMessageId as string || null;

          // ✅ Filter variant siblings using metadata.parentMessageId
          const variantSiblings = allMessages.filter((msg) => {
            const msgMetadata = msg.metadata as MessageMetadata;
            return msg.role === 'assistant'
              && msg.participantId === message.participantId
              && msgMetadata?.parentMessageId === parentMsgId;
          });

          // ✅ Map variants reading from metadata
          const variants = variantSiblings.map((v) => {
            const vMetadata = v.metadata as MessageMetadata;
            return {
              id: v.id,
              content: v.content,
              variantIndex: (vMetadata?.variantIndex as number) || 0,
              isActive: (vMetadata?.isActiveVariant as boolean) || false,
              createdAt: v.createdAt.toISOString(),
              metadata: v.metadata,
              participantId: v.participantId,
              reasoning: v.reasoning || undefined,
            };
          });

          const currentVariantIndex = (messageMetadata?.variantIndex as number) || 0;
          const activeVariantIndex = variants.findIndex(v => v.isActive);

          return {
            ...message,
            metadata: {
              ...(typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}),
              variants,
              currentVariantIndex,
              activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : currentVariantIndex,
              totalVariants: variants.length,
              hasVariants: variants.length > 1,
              roundId: message.id,
              parentMessageId: parentMsgId,
            },
          };
        } catch (error) {
          apiLogger.error('[getThread] Failed to process variants for message', {
            messageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return message;
        }
      }),
    );

    // Fetch attached memories via junction table
    const threadMemories = await db.query.chatThreadMemory.findMany({
      where: eq(tables.chatThreadMemory.threadId, id),
      with: {
        memory: true, // Include the full memory object
      },
    });

    // Extract just the memory objects from the junction records
    const memories = threadMemories.map(tm => tm.memory);

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
        createResourceNotFoundContext('user', thread.userId),
      );
    }

    // Return everything in one response (ChatGPT pattern)
    return Responses.ok(c, {
      thread,
      participants,
      messages,
      memories,
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

    // Thread doesn't exist at all - 404 Not Found (standard HTTP status)
    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        createResourceNotFoundContext('thread', slug),
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
        createResourceNotFoundContext('user', thread.userId),
      );
    }

    // Fetch participants (ordered by priority) - same as private handler
    const participants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, thread.id),
      orderBy: [tables.chatParticipant.priority],
    });

    // ✅ Fetch messages using metadata-based approach (no isActiveVariant column)
    const allMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ Filter active messages using metadata.isActiveVariant
    const activeMessages = allMessages.filter((msg) => {
      const metadata = msg.metadata as MessageMetadata;
      return msg.role === 'user' || (metadata?.isActiveVariant === true);
    });

    // ✅ Enrich active messages with ALL their variant siblings
    const messages = await Promise.all(
      activeMessages.map(async (message) => {
        if (message.role !== 'assistant' || !message.participantId) {
          return message;
        }

        try {
          const messageMetadata = message.metadata as MessageMetadata;
          const parentMsgId = messageMetadata?.parentMessageId as string || null;

          // ✅ Filter variant siblings using metadata.parentMessageId
          const variantSiblings = allMessages.filter((msg) => {
            const msgMetadata = msg.metadata as MessageMetadata;
            return msg.role === 'assistant'
              && msg.participantId === message.participantId
              && msgMetadata?.parentMessageId === parentMsgId;
          });

          // ✅ Map variants reading from metadata
          const variants = variantSiblings.map((v) => {
            const vMetadata = v.metadata as MessageMetadata;
            return {
              id: v.id,
              content: v.content,
              variantIndex: (vMetadata?.variantIndex as number) || 0,
              isActive: (vMetadata?.isActiveVariant as boolean) || false,
              createdAt: v.createdAt.toISOString(),
              metadata: v.metadata,
              participantId: v.participantId,
              reasoning: v.reasoning || undefined,
            };
          });

          const currentVariantIndex = (messageMetadata?.variantIndex as number) || 0;
          const activeVariantIndex = variants.findIndex(v => v.isActive);

          return {
            ...message,
            metadata: {
              ...(typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}),
              variants,
              currentVariantIndex,
              activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : currentVariantIndex,
              totalVariants: variants.length,
              hasVariants: variants.length > 1,
              roundId: message.id,
              parentMessageId: parentMsgId,
            },
          };
        } catch (error) {
          apiLogger.error('[getPublicThread] Failed to process variants for message', {
            messageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return message;
        }
      }),
    );

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

    // ✅ UPDATED: Fetch ALL messages (including inactive variants) using metadata-based approach
    const allMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, thread.id),
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ Get active messages for display using metadata.isActiveVariant
    const activeMessages = allMessages.filter((msg) => {
      const metadata = msg.metadata as MessageMetadata;
      // User messages are always active, assistant messages check metadata
      return msg.role === 'user' || (metadata?.isActiveVariant === true);
    });

    // ✅ Enrich active messages with ALL their variant siblings
    const messagesWithVariants = await Promise.all(
      activeMessages.map(async (message) => {
        if (message.role !== 'assistant' || !message.participantId) {
          return message;
        }

        try {
          const messageMetadata = message.metadata as MessageMetadata;
          const parentMsgId = messageMetadata?.parentMessageId as string || null;

          // ✅ Filter variant siblings using metadata.parentMessageId
          const variantSiblings = allMessages.filter((msg) => {
            const msgMetadata = msg.metadata as MessageMetadata;
            return msg.role === 'assistant'
              && msg.participantId === message.participantId
              && msgMetadata?.parentMessageId === parentMsgId;
          });

          // ✅ Map variants reading from metadata
          const variants = variantSiblings.map((v) => {
            const vMetadata = v.metadata as MessageMetadata;
            return {
              id: v.id,
              content: v.content,
              variantIndex: (vMetadata?.variantIndex as number) || 0,
              isActive: (vMetadata?.isActiveVariant as boolean) || false,
              createdAt: v.createdAt.toISOString(),
              metadata: v.metadata,
              participantId: v.participantId,
              reasoning: v.reasoning || undefined,
            };
          });

          const currentVariantIndex = (messageMetadata?.variantIndex as number) || 0;
          const activeVariantIndex = variants.findIndex(v => v.isActive);

          return {
            ...message,
            metadata: {
              ...(typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}),
              variants,
              currentVariantIndex,
              activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : currentVariantIndex,
              totalVariants: variants.length,
              hasVariants: variants.length > 1,
              roundId: message.id,
              parentMessageId: parentMsgId,
            },
          };
        } catch (error) {
          apiLogger.error('[getThreadBySlug] Failed to process variants for message', {
            messageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return message;
        }
      }),
    );

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
      messages: messagesWithVariants, // ✅ Return messages with variant metadata
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

    // Validate maxConcurrentModels limit for user's tier
    const existingParticipants = await db.query.chatParticipant.findMany({
      where: eq(tables.chatParticipant.threadId, id),
    });

    const currentModelCount = existingParticipants.length;

    if (!canAddMoreModels(currentModelCount, userTier)) {
      const errorMessage = getMaxModelsErrorMessage(userTier);
      throw createError.badRequest(errorMessage, {
        errorType: 'validation',
        field: 'modelId',
      });
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

    // ✅ Fetch messages using metadata-based filtering
    const allMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ Filter active messages using metadata.isActiveVariant
    const messages = allMessages.filter((msg) => {
      const metadata = msg.metadata as MessageMetadata;
      return msg.role === 'user' || (metadata?.isActiveVariant === true);
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
      memoryIds: newMemoryIds,
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

    // Update memories if provided
    if (newMemoryIds !== undefined) {
      // Get existing memory attachments before deletion for changelog
      const oldMemoryAttachments = await db.query.chatThreadMemory.findMany({
        where: eq(tables.chatThreadMemory.threadId, threadId),
        with: {
          memory: {
            columns: { id: true, title: true },
          },
        },
      });

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

        // Fetch the newly attached memories for changelog
        const newMemories = await db.query.chatMemory.findMany({
          where: (fields, { inArray }) => inArray(fields.id, newMemoryIds),
          columns: { id: true, title: true },
        });

        // Log memory changes to changelog
        // Find removed memories (in old but not in new)
        for (const oldM of oldMemoryAttachments) {
          const stillExists = newMemoryIds.includes(oldM.memoryId);
          if (!stillExists) {
            await logMemoryRemoved(threadId, oldM.memory.id, oldM.memory.title);
          }
        }

        // Find added memories (in new but not in old)
        for (const newM of newMemories) {
          const wasExisting = oldMemoryAttachments.some(oldM => oldM.memoryId === newM.id);
          if (!wasExisting) {
            await logMemoryAdded(threadId, newM.id, newM.title);
          }
        }
      } else {
        // All memories removed
        for (const oldM of oldMemoryAttachments) {
          await logMemoryRemoved(threadId, oldM.memory.id, oldM.memory.title);
        }
      }
    }

    // ✅ Load existing messages from database using metadata-based filtering
    const allDbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ Filter active messages using metadata.isActiveVariant
    const dbMessages = allDbMessages.filter((msg) => {
      const metadata = msg.metadata as MessageMetadata;
      return msg.role === 'user' || (metadata?.isActiveVariant === true);
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
      // This happens when user updates participants/mode/memories without sending a message
      apiLogger.info('Configuration update only - no streaming', {
        threadId,
        userId: user.id,
        modeUpdated: !!newMode,
        participantsUpdated: !!newParticipants,
        memoriesUpdated: newMemoryIds !== undefined,
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
    // - Full control over stream transformations (smoothStream)
    // - Full control over callbacks (onFinish, onError, onChunk)
    // - Full control over message metadata
    // - This is the RECOMMENDED pattern from AI SDK documentation
    //
    // Alternative (not used): Service wrapper
    // - Less control, more abstraction
    // - Only useful for simple non-streaming operations
    // - See openrouter.service.ts for non-streaming example
    // ====================================================================

    // Use all messages as context for this participant
    const currentHistory = [...uiMessages];

    // Stream ONLY the requested participant
    const participantIndex = requestedParticipantIndex;
    const participant = participants[participantIndex]!;

    // Build system prompt (only includes previous participants)
    const systemPrompt = buildRoundtableSystemPrompt({
      mode: thread.mode as ChatModeId,
      participantIndex,
      participantRole: participant.role,
      customSystemPrompt: participant.settings?.systemPrompt,
      otherParticipants: participants
        .slice(0, participantIndex)
        .map((p, idx) => ({
          index: idx,
          role: p.role,
        })),
    });

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

    // ✅ Cost Control: Calculate max output tokens based on tier and model
    const modelConfig = getModelById(participant.modelId);
    const tierMaxOutputTokens = getMaxOutputTokens(userTier);
    const modelSpecificLimit = modelConfig?.defaultSettings?.maxOutputTokens;

    // Use the most restrictive limit:
    // 1. Model-specific limit (if set) - for expensive models
    // 2. Tier-level limit (from subscription config)
    const maxOutputTokensLimit = modelSpecificLimit || tierMaxOutputTokens;

    // ✅ OFFICIAL AI SDK PATTERN: Timeout Protection with AbortSignal.timeout()
    // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/settings#abortsignal
    // Prevents streams from hanging indefinitely if AI provider doesn't respond
    const combinedSignal = AbortSignal.any([
      c.req.raw.signal, // Client disconnect
      AbortSignal.timeout(60000), // 60s timeout (built-in)
    ]);

    // ✅ OFFICIAL AI SDK PATTERN: streamText() Configuration
    // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#streaming
    //
    // Key features from AI SDK:
    // - Built-in retry with `maxRetries` (replaces custom retry logic)
    // - Built-in transformations with `experimental_transform`
    // - Built-in telemetry with `experimental_telemetry`
    // - Built-in abort handling with `abortSignal`
    const result = streamText({
      model: client.chat(participant.modelId),
      messages: convertToModelMessages(currentHistory),
      system: systemPrompt,
      temperature: participant.settings?.temperature || 0.7,
      abortSignal: combinedSignal, // ✅ Use combined signal for both timeout and client disconnect

      // ✅ Cost Control: Enforce output token limit based on subscription tier
      maxOutputTokens: maxOutputTokensLimit,

      // ✅ AI SDK v5: Built-in retry (replaced 120 lines of manual retry)
      maxRetries: 3,

      // ✅ AI SDK v5: Smooth streaming for better UX
      experimental_transform: smoothStream({
        chunking: 'word',
        delayInMs: 20,
      }),

      // ✅ AI SDK v5: Telemetry for performance monitoring
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat-participant-${participant.id}-${participantIndex}`,
      },

      // ✅ OFFICIAL AI SDK PATTERN: onAbort callback
      // Documentation: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling#handling-stream-aborts
      // Called when stream is aborted via AbortSignal (timeout or client disconnect)
      onAbort: ({ steps }) => {
        apiLogger.info('Stream aborted', {
          threadId,
          participantId: participant.id,
          participantIndex,
          model: participant.modelId,
          stepsCompleted: steps.length,
          timestamp: new Date().toISOString(),
        });
      },
    });

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
      // ✅ CRITICAL FIX: Only pass USER messages in originalMessages for roundtable scenarios
      // Including previous assistant messages causes ID reuse across participants
      // Each participant needs a NEW unique message, not an update to existing ones
      // See: AI SDK v5 Multi-Agent Pattern - each agent gets unique message ID
      originalMessages: uiMessages.filter(msg => msg.role === 'user'),

      // ✅ CRITICAL: consumeSseStream ensures onFinish runs even on client disconnect
      // See: https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling
      consumeSseStream: consumeStream,

      // ✅ Return consistent NEW ID for this participant's message
      generateMessageId: () => messageId,

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
            model: participant.modelId, // ✅ Matches DB schema (not "modelId")
            role: participant.role || '', // ✅ Matches DB schema (not "participantRole")
            // ✅ NEW: Add roundId for variant tracking (AI SDK pattern)
            roundId: messageId, // Unique identifier for this generation round
          };
        }

        // ✅ NEW: Include variant metadata in finish event
        if (part.type === 'finish') {
          // Find the parent user message (last user message before this assistant response)
          const userMessages = await db.query.chatMessage.findMany({
            where: and(
              eq(tables.chatMessage.threadId, threadId),
              eq(tables.chatMessage.role, 'user'),
            ),
            orderBy: [desc(tables.chatMessage.createdAt)],
            limit: 1,
          });

          const parentUserMessage = userMessages[0];

          // Fetch existing variants (previous regenerations) for this parent/participant
          // The current streaming message will be added to this list when saved in onFinish
          let variants: Array<{
            id: string;
            content: string;
            variantIndex: number;
            isActive: boolean;
            createdAt: string;
            metadata: Record<string, unknown> | null;
          }> = [];

          if (parentUserMessage) {
            try {
              variants = await getMessageVariantsForStream({
                threadId,
                parentMessageId: parentUserMessage.id,
                participantId: participant.id,
              });

              apiLogger.info('[Stream Handler] Fetched variants for finish metadata', {
                threadId,
                participantId: participant.id,
                parentMessageId: parentUserMessage.id,
                variantCount: variants.length,
              });
            } catch (error) {
              apiLogger.error('[Stream Handler] Failed to fetch variants for metadata', {
                threadId,
                participantId: participant.id,
                error: error instanceof Error ? error.message : String(error),
              });
              // Continue without variants - don't fail the stream
            }
          }

          // Calculate variant index for the current message
          // It will be variants.length (0 for first, 1 for second, etc.)
          const currentVariantIndex = variants.length;
          const activeVariantIndex = variants.findIndex(v => v.isActive);

          return {
            // ✅ NEW: Variant metadata following AI SDK patterns
            variants, // All existing variants (previous regenerations)
            currentVariantIndex, // Index of the message being streamed
            activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : currentVariantIndex, // Which variant is active
            totalVariants: variants.length + 1, // Total including current
            hasVariants: variants.length > 0, // Whether regenerations exist
            roundId: messageId, // Matches start event roundId
            parentMessageId: parentUserMessage?.id || null, // For variant grouping
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

        // Extract text content from the assistant message
        const textPart = responseMessage.parts.find(p => p.type === 'text');
        let content = textPart?.type === 'text' ? textPart.text : '';

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
        if (!content || content.trim().length === 0) {
          content = 'Error: No response generated';
          hasError = true;

          apiLogger.error('Empty content with no error - saving fallback message', {
            threadId,
            participantId: participant.id,
            messageId: responseMessage.id,
            model: participant.modelId,
          });
        }

        // ✅ Prepare metadata - include error info if error occurred
        // When onError returns a message, content is the error text
        // We need to include error metadata so frontend can display error UI
        const errorMetadata = streamError
          ? formatErrorForDatabase(streamError, participant.modelId)
          : null;

        // ✅ Add hasError flag to metadata for frontend error detection
        const baseMetadata = {
          model: participant.modelId,
          role: participant.role,
          mode: thread.mode,
          participantId: participant.id,
          participantIndex,
          aborted: isAborted,
          partialResponse: isAborted,
          hasError, // ✅ Flag for frontend error display
        };

        // ✅ Save message with variant support using service function
        // This service handles all the complexity of variant tracking:
        // - Links to parent user message
        // - Tracks variant index (0 for original, 1+ for regenerations)
        // - Marks active variant (only one active at a time)
        // - Idempotent saves to prevent duplicates
        await saveAssistantMessageWithVariants({
          messageId: responseMessage.id,
          threadId,
          participantId: participant.id,
          content,
          metadata: {
            ...baseMetadata,
            // Include error metadata if error occurred
            ...(errorMetadata || {}),
          },
          createdAt: now,
        });

        await db.update(tables.chatThread)
          .set({
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(tables.chatThread.id, threadId));

        // Increment usage
        const totalNewMessages = isNewMessage ? 2 : 1;
        await incrementMessageUsage(user.id, totalNewMessages);

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

        const classified = classifyOpenRouterError(error);

        // ✅ Enhanced error context
        const errorContext = {
          threadId,
          participantId: participant.id,
          participantIndex,
          model: participant.modelId,
          errorType: classified.type,
          userMessage: classified.message,
          isAborted: c.req.raw.signal.aborted,
          timestamp: new Date().toISOString(),
        };

        apiLogger.error('Stream error with context', errorContext);

        // Return user-friendly error message
        // This becomes the content text streamed to the client
        return classified.message;
      },
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
