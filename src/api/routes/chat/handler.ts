import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { consumeStream, convertToModelMessages, streamText, validateUIMessages } from 'ai';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
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
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  canAccessModelByPricing,
  getRequiredTierForModel,
  getSafeMaxOutputTokens,
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
  getThreadFeedbackRoute,
  getThreadMessagesRoute,
  getThreadRoute,
  listCustomRolesRoute,
  listThreadsRoute,
  setRoundFeedbackRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './route';
import {
  AddParticipantRequestSchema,
  CreateCustomRoleRequestSchema,
  CreateThreadRequestSchema,
  ModeratorAnalysisPayloadSchema,
  ModeratorAnalysisRequestSchema,
  RoundAnalysisParamSchema,
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
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
 * ✅ BATCH/TRANSACTION HELPER: Execute atomic operations
 * - D1 (production): Use batch() for atomicity
 * - Better-SQLite3 (local dev): Use transaction() for atomicity
 *
 * This helper provides a unified API that works in both environments
 */
async function executeAtomic<T extends Awaited<ReturnType<typeof getDbAsync>>>(
  db: T,
  operations: Array<unknown>,
) {
  // ✅ TYPE-SAFE RUNTIME CHECK: Check if batch() exists (D1 Database)
  // This allows us to use batch() on D1 and transaction() on BetterSQLite3
  if ('batch' in db && typeof db.batch === 'function') {
    // ✅ D1 PATTERN: Use batch operations
    if (operations.length > 0) {
      await (db as { batch: (ops: unknown[]) => Promise<unknown> }).batch(operations);
    }
  } else if ('transaction' in db && typeof db.transaction === 'function') {
    // ✅ BETTER-SQLITE3 PATTERN: Use transaction
    await (db as { transaction: (fn: () => Promise<void>) => Promise<void> }).transaction(async () => {
      // Execute operations sequentially within transaction
      for (const op of operations) {
        await op;
      }
    });
  } else {
    // Fallback: Execute operations sequentially (not atomic)
    for (const op of operations) {
      await op;
    }
  }
}

/**
 * ✅ AI SDK V5 PATTERN: Automatically generate analysis in background after round completes
 *
 * This function is called asynchronously after the last participant finishes responding.
 * It immediately starts analysis generation using the official AI SDK V5 streamObject pattern.
 * No frontend trigger needed - fully automatic background generation.
 *
 * Following the official AI SDK V5 documentation:
 * "Record Final Object after Streaming Object" - uses streamObject + onFinish callback
 *
 * @param params - Round completion parameters
 * @param params.threadId - The chat thread ID
 * @param params.thread - The chat thread with participants
 * @param params.allParticipants - All participants in the chat
 * @param params.savedMessageId - The saved message ID
 * @param params.db - Database instance
 * @param params.env - Cloudflare environment bindings
 * @returns Promise<void> - Resolves when analysis generation starts (non-blocking)
 */
async function triggerRoundAnalysisAsync(params: {
  threadId: string;
  thread: typeof tables.chatThread.$inferSelect & {
    participants: Array<typeof tables.chatParticipant.$inferSelect>;
  };
  allParticipants: Array<typeof tables.chatParticipant.$inferSelect>;
  savedMessageId: string;
  db: Awaited<ReturnType<typeof getDbAsync>>;
  env: CloudflareEnv;
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
      console.warn('[triggerRoundAnalysisAsync] ⏭️  Analysis already exists for round', roundNumber);
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

    // ✅ CREATE PENDING ANALYSIS RECORD: Frontend will stream from /analyze endpoint
    // This prevents duplicate generation and signals frontend to start real-time streaming
    const analysisId = ulid();

    await db.insert(tables.chatModeratorAnalysis).values({
      id: analysisId,
      threadId,
      roundNumber,
      mode: thread.mode,
      userQuestion,
      status: 'pending', // Frontend will detect and stream from /analyze endpoint
      participantMessageIds,
      createdAt: new Date(),
    });

    console.warn('[triggerRoundAnalysisAsync] ✅ Created pending analysis - frontend will stream', {
      threadId,
      roundNumber,
      analysisId,
      participantCount: participantMessageIds.length,
    });
  } catch (error) {
    console.error('[triggerRoundAnalysisAsync] ❌ Failed to trigger round analysis:', error);
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

    // Enforce thread quota BEFORE creating anything
    // Message quota will be enforced by streamChatHandler when it creates the first message
    await enforceThreadQuota(user.id);

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

    // ✅ FIX: Don't create user message here - let streamChatHandler create it
    // The streamChatHandler has proper duplicate detection and round number management
    // This prevents duplicate messages when the frontend calls streamChatHandler for participant 0

    // Increment usage counter for thread creation
    // Message will be counted when streamChatHandler saves it
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
        console.warn('[createThreadHandler] 🎯 Starting AI title generation', {
          threadId,
          firstMessagePreview: body.firstMessage.substring(0, 50),
        });

        // Generate AI title from first message (using fastest available model)
        const aiTitle = await generateTitleFromMessage(body.firstMessage, c.env);

        console.warn('[createThreadHandler] ✅ AI title generated', {
          threadId,
          aiTitle,
          previousTitle: tempTitle,
        });

        // ✅ CRITICAL FIX: Update both title AND slug
        // Generate new slug from AI title for better SEO and user experience
        const newSlug = await generateUniqueSlug(aiTitle);

        console.warn('[createThreadHandler] 📝 Updating thread with AI title and new slug', {
          threadId,
          aiTitle,
          newSlug,
          previousSlug: tempSlug,
        });

        // Update thread with AI-generated title and slug
        await db
          .update(tables.chatThread)
          .set({
            title: aiTitle,
            slug: newSlug,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        console.warn('[createThreadHandler] ✅ Thread updated with AI title and slug', {
          threadId,
          aiTitle,
          newSlug,
        });

        // ✅ CRITICAL FIX: Invalidate cache after title update
        // This ensures the sidebar shows the updated AI-generated title immediately
        if (db.$cache?.invalidate) {
          const { ThreadCacheTags } = await import('@/db/cache/cache-tags');
          await db.$cache.invalidate({
            tags: [ThreadCacheTags.list(user.id)],
          });

          console.warn('[createThreadHandler] ✅ Cache invalidated after title update', {
            threadId,
            userId: user.id,
          });
        }

        console.warn('[createThreadHandler] 🎉 AI title generation complete', {
          threadId,
          aiTitle,
          newSlug,
        });
      } catch (error) {
        // Log error but don't fail the request since thread is already created
        console.error('[createThreadHandler] ❌ AI title generation failed', {
          threadId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    })().catch((error) => {
      // Log unhandled rejection
      console.error('[createThreadHandler] ❌ Unhandled rejection in title generation', {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Return thread with participants (no messages yet)
    // The first user message will be created by streamChatHandler
    // AI responses will be generated via the streaming endpoint
    return Responses.ok(c, {
      thread,
      participants,
      messages: [], // No messages yet - streamChatHandler will create the first user message
      changelog: [], // No changelog entries yet for a new thread
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

    const now = new Date();

    // ✅ CRITICAL: Calculate the round number for changelog entries
    // Changelog should be associated with the NEXT round that will happen
    // This ensures changelog appears BEFORE the messages of the new round
    const latestMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.threadId, id),
      orderBy: [desc(tables.chatMessage.roundNumber)],
      columns: { roundNumber: true },
    });
    const nextRoundNumber = latestMessage ? latestMessage.roundNumber + 1 : 1;

    console.warn('[updateThreadHandler] 📊 Calculated round number for changelog', {
      threadId: id,
      latestRoundNumber: latestMessage?.roundNumber,
      nextRoundNumber,
    });

    // ✅ Track changelog entries for all changes
    const changelogEntries: Array<typeof tables.chatThreadChangelog.$inferInsert> = [];

    // ✅ Handle mode change
    if (body.mode !== undefined && body.mode !== thread.mode) {
      changelogEntries.push({
        id: ulid(),
        threadId: id,
        roundNumber: nextRoundNumber, // ✅ Associate with next round
        changeType: 'mode_change',
        changeSummary: `Changed conversation mode from ${thread.mode} to ${body.mode}`,
        changeData: {
          oldMode: thread.mode,
          newMode: body.mode,
        },
        createdAt: now,
      });
    }

    // ✅ Handle participant changes (if provided)
    if (body.participants !== undefined) {
      // Get current participants
      const currentParticipants = await db.query.chatParticipant.findMany({
        where: eq(tables.chatParticipant.threadId, id),
      });

      // Build maps for comparison
      const currentMap = new Map(currentParticipants.map(p => [p.id, p]));
      const newMap = new Map(body.participants.filter(p => p.id).map(p => [p.id!, p]));

      // Detect removals
      for (const current of currentParticipants) {
        if (!newMap.has(current.id)) {
          const modelName = extractModeratorModelName(current.modelId);
          changelogEntries.push({
            id: ulid(),
            threadId: id,
            roundNumber: nextRoundNumber, // ✅ Associate with next round
            changeType: 'participant_removed',
            changeSummary: `Removed ${modelName}${current.role ? ` ("${current.role}")` : ''}`,
            changeData: {
              participantId: current.id,
              modelId: current.modelId,
              role: current.role,
            },
            createdAt: now,
          });
        }
      }

      // Detect additions and updates
      const participantsToInsert: Array<typeof tables.chatParticipant.$inferInsert> = [];
      const participantsToUpdate: Array<{ id: string; updates: Partial<typeof tables.chatParticipant.$inferSelect> }> = [];

      for (const newP of body.participants) {
        if (!newP.id) {
          // New participant
          const participantId = ulid();
          const modelName = extractModeratorModelName(newP.modelId);

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

          changelogEntries.push({
            id: ulid(),
            threadId: id,
            roundNumber: nextRoundNumber, // ✅ Associate with next round
            changeType: 'participant_added',
            changeSummary: `Added ${modelName}${newP.role ? ` as "${newP.role}"` : ''}`,
            changeData: {
              participantId,
              modelId: newP.modelId,
              role: newP.role || null,
            },
            createdAt: now,
          });
        } else {
          // Existing participant - check for changes
          const current = currentMap.get(newP.id);
          if (!current)
            continue;

          const hasChanges
            = current.role !== (newP.role || null)
              || current.customRoleId !== (newP.customRoleId || null)
              || current.priority !== newP.priority
              || current.isEnabled !== (newP.isEnabled ?? true);

          if (hasChanges) {
            participantsToUpdate.push({
              id: newP.id,
              updates: {
                role: newP.role || null,
                customRoleId: newP.customRoleId || null,
                priority: newP.priority,
                isEnabled: newP.isEnabled ?? true,
                updatedAt: now,
              },
            });

            // Create changelog for role changes
            if (current.role !== (newP.role || null)) {
              const modelName = extractModeratorModelName(current.modelId);
              changelogEntries.push({
                id: ulid(),
                threadId: id,
                roundNumber: nextRoundNumber, // ✅ Associate with next round
                changeType: 'participant_updated',
                changeSummary: `Updated ${modelName} role from ${current.role || 'none'} to ${newP.role || 'none'}`,
                changeData: {
                  participantId: newP.id,
                  modelId: current.modelId,
                  oldRole: current.role,
                  newRole: newP.role || null,
                },
                createdAt: now,
              });
            }

            // Create changelog for priority changes (reordering)
            if (current.priority !== newP.priority) {
              const modelName = extractModeratorModelName(current.modelId);
              changelogEntries.push({
                id: ulid(),
                threadId: id,
                roundNumber: nextRoundNumber, // ✅ Associate with next round
                changeType: 'participants_reordered',
                changeSummary: `Reordered ${modelName}`,
                changeData: {
                  participantId: newP.id,
                  modelId: current.modelId,
                  oldPriority: current.priority,
                  newPriority: newP.priority,
                },
                createdAt: now,
              });
            }
          }
        }
      }

      // ✅ BATCH OPERATIONS: Execute participant changes atomically
      // Following Cloudflare D1 best practices - batch operations provide atomicity
      const batchOperations: Array<unknown> = [];

      // Delete removed participants
      for (const current of currentParticipants) {
        if (!newMap.has(current.id)) {
          batchOperations.push(
            db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, current.id)),
          );
        }
      }

      // Insert new participants
      if (participantsToInsert.length > 0) {
        batchOperations.push(
          db.insert(tables.chatParticipant).values(participantsToInsert),
        );
      }

      // Update existing participants
      for (const { id: participantId, updates } of participantsToUpdate) {
        batchOperations.push(
          db.update(tables.chatParticipant)
            .set(updates)
            .where(eq(tables.chatParticipant.id, participantId)),
        );
      }

      // Execute all operations atomically
      if (batchOperations.length > 0) {
        await executeAtomic(db, batchOperations);
      }
    }

    // Build thread update object
    const updateData: {
      title?: string;
      mode?: ChatModeId;
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
      updateData.mode = body.mode as ChatModeId;
    if (body.status !== undefined)
      updateData.status = body.status as ThreadStatus;
    if (body.isFavorite !== undefined)
      updateData.isFavorite = body.isFavorite;
    if (body.isPublic !== undefined)
      updateData.isPublic = body.isPublic;
    if (body.metadata !== undefined)
      updateData.metadata = body.metadata ?? undefined;

    // ✅ BATCH OPERATIONS: Execute thread update and changelog insertion atomically
    // Following Cloudflare D1 best practices - batch operations provide atomicity
    const batchOps: Array<unknown> = [
      db.update(tables.chatThread)
        .set(updateData)
        .where(eq(tables.chatThread.id, id)),
    ];

    // Insert changelog entries
    if (changelogEntries.length > 0) {
      batchOps.push(
        db.insert(tables.chatThreadChangelog).values(changelogEntries),
      );
    }

    await executeAtomic(db, batchOps);

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

    // ✅ Invalidate backend cache if status changed (affects list visibility)
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
    const { messages, id: threadId, participantIndex, participants: providedParticipants } = c.validated.body;

    console.warn('[streamChatHandler] 🚀 REQUEST START', {
      threadId,
      participantIndex,
      userId: user.id,
      messageCount: messages?.length || 0,
      hasProvidedParticipants: !!providedParticipants,
    });

    // Validate messages array exists and is not empty
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('[streamChatHandler] ❌ VALIDATION ERROR: Messages array invalid', {
        threadId,
        participantIndex,
        messagesProvided: !!messages,
        isArray: Array.isArray(messages),
      });
      throw createError.badRequest('Messages array is required and cannot be empty');
    }

    const db = await getDbAsync();

    // =========================================================================
    // STEP 1: Verify Thread & Load/Use Participants
    // =========================================================================

    if (!threadId) {
      console.error('[streamChatHandler] ❌ VALIDATION ERROR: Thread ID missing');
      throw createError.badRequest('Thread ID is required for streaming');
    }

    // Load thread for verification and metadata
    // Always load participants from DB for verification, but may override with providedParticipants
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
      console.error('[streamChatHandler] ❌ THREAD NOT FOUND', { threadId });
      throw createError.notFound('Thread not found');
    }

    if (thread.userId !== user.id) {
      console.error('[streamChatHandler] ❌ UNAUTHORIZED ACCESS', {
        threadId,
        threadOwner: thread.userId,
        requestUser: user.id,
      });
      throw createError.unauthorized('Not authorized to access this thread');
    }

    // =========================================================================
    // STEP 1.4: Calculate Round Number (ONLY for first participant)
    // =========================================================================
    // ✅ EVENT-BASED ROUND TRACKING: Calculate round number ONCE per round
    // Only participant 0 calculates the round number to avoid race conditions
    // Other participants will use the roundNumber from the saved user message

    let currentRoundNumber: number;

    if (participantIndex === 0) {
      // First participant: Calculate round number
      const existingUserMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.role, 'user'),
        ),
        columns: { id: true },
      });

      currentRoundNumber = existingUserMessages.length + 1;

      console.warn('[streamChatHandler] 🔢 Round number calculated (first participant)', {
        threadId,
        participantIndex,
        existingUserMessages: existingUserMessages.length,
        currentRoundNumber,
      });
    } else {
      // Subsequent participants: Get round number from the user message
      const userMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.role, 'user'),
        ),
        columns: { id: true, roundNumber: true },
        orderBy: desc(tables.chatMessage.createdAt),
        limit: 1,
      });

      currentRoundNumber = userMessages[0]?.roundNumber || 1;

      console.warn('[streamChatHandler] 🔢 Round number from saved user message', {
        threadId,
        participantIndex,
        currentRoundNumber,
      });
    }

    // =========================================================================
    // STEP 1.5: ✅ PERSIST PARTICIPANT CHANGES FIRST (Atomic Pattern)
    // =========================================================================
    // CRITICAL: Persist participant changes BEFORE loading participants for streaming
    // This ensures the participants used for streaming are always up-to-date
    //
    // If participants were provided in request AND this is the first participant (index 0),
    // persist the participant changes to database and create changelog entries.
    // This implements the "staged changes" pattern where participant config changes
    // are only persisted when user submits a new message, not when they change the UI.

    if (providedParticipants && participantIndex === 0) {
      console.warn('[streamChatHandler] 📝 Persisting participant changes from request', {
        threadId,
        providedCount: providedParticipants.length,
        dbCount: thread.participants.length,
      });

      // ✅ DETAILED CHANGE DETECTION: Track specific types of changes
      const changelogEntries: Array<{
        id: string;
        changeType: 'participant_added' | 'participant_removed' | 'participant_updated' | 'participants_reordered';
        changeSummary: string;
        changeData: Record<string, unknown>;
      }> = [];

      // Get current enabled participants from DB for comparison
      const enabledDbParticipants = thread.participants.filter(p => p.isEnabled);
      const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

      // Detect removed participants (in DB but not in provided)
      const removedParticipants = enabledDbParticipants.filter(
        dbP => !providedEnabledParticipants.find(p => p.id === dbP.id),
      );

      // Detect added participants (in provided but not in DB enabled)
      // ✅ CRITICAL: Also check if ID is temporary (starts with "participant-")
      const addedParticipants = providedEnabledParticipants.filter(
        provided => !enabledDbParticipants.find(dbP => dbP.id === provided.id) || provided.id.startsWith('participant-'),
      );

      // Detect updated participants (role, model, or customRole changed)
      const updatedParticipants = providedEnabledParticipants.filter((provided) => {
        const dbP = enabledDbParticipants.find(db => db.id === provided.id);
        if (!dbP) {
          return false; // This is an added participant, not updated
        }
        return dbP.modelId !== provided.modelId
          || dbP.role !== provided.role
          || dbP.customRoleId !== provided.customRoleId;
      });

      // Detect reordering (priority changes)
      const wasReordered = providedEnabledParticipants.some((provided, index) => {
        const dbP = enabledDbParticipants.find(db => db.id === provided.id);
        return dbP && dbP.priority !== index;
      });

      // ✅ BUILD INSERT OPERATIONS FOR NEW PARTICIPANTS
      const insertOps = addedParticipants.map((provided) => {
        const newId = ulid(); // Generate a real database ID
        return db.insert(tables.chatParticipant).values({
          id: newId,
          threadId,
          modelId: provided.modelId,
          role: provided.role ?? null,
          customRoleId: provided.customRoleId ?? null,
          priority: provided.priority,
          isEnabled: provided.isEnabled ?? true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // ✅ BUILD UPDATE OPERATIONS FOR EXISTING PARTICIPANTS ONLY
      const updateOps = providedParticipants
        .filter(provided => !provided.id.startsWith('participant-')) // Skip temporary IDs
        .filter(provided => enabledDbParticipants.find(dbP => dbP.id === provided.id)) // Only update existing
        .map(provided =>
          db.update(tables.chatParticipant)
            .set({
              modelId: provided.modelId,
              role: provided.role ?? null,
              customRoleId: provided.customRoleId ?? null,
              priority: provided.priority,
              isEnabled: provided.isEnabled ?? true,
              updatedAt: new Date(),
            })
            .where(eq(tables.chatParticipant.id, provided.id)),
        );

      // Also disable participants that were removed (not in provided list)
      const disableOps = removedParticipants.map(removed =>
        db.update(tables.chatParticipant)
          .set({
            isEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatParticipant.id, removed.id)),
      );

      // Create specific changelog entries
      if (removedParticipants.length > 0) {
        removedParticipants.forEach((removed) => {
          changelogEntries.push({
            id: ulid(),
            changeType: 'participant_removed',
            changeSummary: `Removed ${removed.role || removed.modelId}`,
            changeData: {
              participantId: removed.id,
              modelId: removed.modelId,
              role: removed.role,
            },
          });
        });
      }

      if (addedParticipants.length > 0) {
        addedParticipants.forEach((added) => {
          changelogEntries.push({
            id: ulid(),
            changeType: 'participant_added',
            changeSummary: `Added ${added.role || added.modelId}`,
            changeData: {
              participantId: added.id,
              modelId: added.modelId,
              role: added.role,
            },
          });
        });
      }

      if (updatedParticipants.length > 0) {
        updatedParticipants.forEach((updated) => {
          const dbP = enabledDbParticipants.find(db => db.id === updated.id);
          if (!dbP) {
            return;
          }

          const changes: string[] = [];
          if (dbP.modelId !== updated.modelId) {
            changes.push(`model changed to ${updated.modelId}`);
          }
          if (dbP.role !== updated.role) {
            changes.push(`role changed to ${updated.role || 'none'}`);
          }

          changelogEntries.push({
            id: ulid(),
            changeType: 'participant_updated',
            changeSummary: `Updated ${updated.role || updated.modelId}: ${changes.join(', ')}`,
            changeData: {
              participantId: updated.id,
              modelId: updated.modelId,
              role: updated.role,
              oldModelId: dbP.modelId,
              oldRole: dbP.role,
            },
          });
        });
      }

      if (wasReordered) {
        changelogEntries.push({
          id: ulid(),
          changeType: 'participants_reordered',
          changeSummary: `Reordered ${providedEnabledParticipants.length} participant(s)`,
          changeData: {
            participants: providedEnabledParticipants.map((p, index) => ({
              id: p.id,
              modelId: p.modelId,
              role: p.role,
              order: index,
            })),
          },
        });
      }

      // Only persist if there are actual changes
      if (changelogEntries.length > 0 || insertOps.length > 0 || updateOps.length > 0 || disableOps.length > 0) {
        console.warn('[streamChatHandler] 🔄 Participant changes detected', {
          threadId,
          added: addedParticipants.length,
          removed: removedParticipants.length,
          updated: updatedParticipants.length,
          reordered: wasReordered,
          changelogEntries: changelogEntries.length,
        });

        // Build changelog insert operations
        const changelogOps = changelogEntries.map(entry =>
          db.insert(tables.chatThreadChangelog)
            .values({
              id: entry.id,
              threadId,
              roundNumber: currentRoundNumber,
              changeType: entry.changeType,
              changeSummary: entry.changeSummary,
              changeData: entry.changeData,
              createdAt: new Date(),
            })
            .onConflictDoNothing(),
        );

        // ✅ Execute all operations atomically (INSERT new, UPDATE existing, DISABLE removed)
        await executeAtomic(db, [...insertOps, ...updateOps, ...disableOps, ...changelogOps]);

        console.warn('[streamChatHandler] ✅ Participant changes persisted', {
          threadId,
          insertCount: insertOps.length,
          updateCount: updateOps.length,
          disableCount: disableOps.length,
          changelogCount: changelogOps.length,
        });
      } else {
        console.warn('[streamChatHandler] ℹ️  No participant changes detected', {
          threadId,
        });
      }
    }

    // =========================================================================
    // STEP 1.6: ✅ LOAD PARTICIPANTS (After Persistence)
    // =========================================================================
    // CRITICAL: After persisting changes, ALL participants must reload from database
    // This ensures streaming uses the correct, up-to-date participant configuration
    //
    // WHY RELOAD FOR ALL PARTICIPANTS?
    // - Participant 0: Just persisted changes, must reload to get fresh state
    // - Participants 1, 2, 3...: Must see the changes participant 0 persisted
    // - Without reload, subsequent participants use stale thread.participants from line 1690

    let participants: Array<typeof tables.chatParticipant.$inferSelect>;

    if (providedParticipants) {
      // ✅ PROVIDED PARTICIPANTS: Always reload from database to get latest persisted state
      // This applies to ALL participants (0, 1, 2, 3...) when frontend sends config
      console.warn('[streamChatHandler] 🔄 Reloading participants from database (provided config)', {
        threadId,
        participantIndex,
        providedCount: providedParticipants.length,
      });

      const reloadedThread = await db.query.chatThread.findFirst({
        where: eq(tables.chatThread.id, threadId),
        with: {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [asc(tables.chatParticipant.priority)],
          },
        },
      });

      if (!reloadedThread || reloadedThread.participants.length === 0) {
        console.error('[streamChatHandler] ❌ NO PARTICIPANTS after reload', { threadId });
        throw createError.badRequest('No enabled participants after persistence');
      }

      participants = reloadedThread.participants;

      console.warn('[streamChatHandler] ✅ Participants reloaded from database', {
        threadId,
        participantIndex,
        participantCount: participants.length,
        participantIds: participants.map(p => p.id),
        participantRoles: participants.map(p => p.role),
        participantPriorities: participants.map(p => p.priority),
      });
    } else {
      // ✅ NO PROVIDED PARTICIPANTS: Use database state from initial query
      participants = thread.participants;

      console.warn('[streamChatHandler] ✅ Using database participants from initial query', {
        threadId,
        participantIndex,
        participantCount: participants.length,
      });
    }

    if (participants.length === 0) {
      console.error('[streamChatHandler] ❌ NO PARTICIPANTS', { threadId });
      throw createError.badRequest('No enabled participants in this thread');
    }

    // =========================================================================
    // STEP 2: Get SINGLE Participant (frontend orchestration)
    // =========================================================================

    const participant = participants[participantIndex ?? 0];
    if (!participant) {
      console.error('[streamChatHandler] ❌ PARTICIPANT NOT FOUND', {
        threadId,
        participantIndex,
        availableParticipants: participants.length,
      });
      throw createError.badRequest(`Participant at index ${participantIndex} not found`);
    }

    console.warn('[streamChatHandler] 🤖 Selected participant', {
      threadId,
      participantIndex,
      participantId: participant.id,
      modelId: participant.modelId,
      role: participant.role,
      priority: participant.priority,
    });

    // =========================================================================
    // STEP 3: ✅ OFFICIAL PATTERN - Type and Validate Messages
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages-from-database
    // =========================================================================

    console.warn('[streamChatHandler] 📋 Validating messages', {
      threadId,
      participantIndex,
      messageCount: messages.length,
    });

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

      console.warn('[streamChatHandler] ✅ Messages validated', {
        threadId,
        participantIndex,
        messageCount: typedMessages.length,
      });
    } catch (error) {
      console.error('[streamChatHandler] ❌ MESSAGE VALIDATION ERROR', {
        threadId,
        participantIndex,
        error: error instanceof Error ? error.message : String(error),
        messageCount: messages.length,
      });
      throw createError.badRequest(`Invalid message format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // =========================================================================
    // STEP 4: Save New User Message (ONLY first participant)
    // =========================================================================
    // ✅ EVENT-BASED ROUND TRACKING: Only first participant saves user message
    // This prevents duplicate user messages and ensures consistent round numbers

    const lastMessage = typedMessages[typedMessages.length - 1];
    if (lastMessage && lastMessage.role === 'user' && participantIndex === 0) {
      console.warn('[streamChatHandler] 💾 Checking user message (first participant)', {
        threadId,
        participantIndex,
        messageId: lastMessage.id,
        roundNumber: currentRoundNumber,
        hasPartsArray: !!lastMessage.parts,
      });

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
            // ✅ DUPLICATE PREVENTION: Check if a user message with the same content already exists in this round
            // This prevents duplicate messages when startRound() is called (which creates a new message ID)
            const duplicateCheck = await db.query.chatMessage.findFirst({
              where: and(
                eq(tables.chatMessage.threadId, threadId),
                eq(tables.chatMessage.role, 'user'),
                eq(tables.chatMessage.roundNumber, currentRoundNumber),
                eq(tables.chatMessage.content, content),
              ),
            });

            if (duplicateCheck) {
              console.warn('[streamChatHandler] ⏭️  Duplicate user message detected (same content in same round) - skipping save', {
                threadId,
                participantIndex,
                messageId: lastMessage.id,
                existingMessageId: duplicateCheck.id,
                roundNumber: currentRoundNumber,
                contentPreview: content.substring(0, 50),
              });
            } else {
              console.warn('[streamChatHandler] 💾 Saving user message', {
                threadId,
                participantIndex,
                messageId: lastMessage.id,
                roundNumber: currentRoundNumber,
                contentLength: content.length,
              });

              await enforceMessageQuota(user.id);
              await db.insert(tables.chatMessage).values({
                id: lastMessage.id,
                threadId,
                role: 'user',
                content,
                roundNumber: currentRoundNumber,
                createdAt: new Date(),
              });
              await incrementMessageUsage(user.id, 1);

              console.warn('[streamChatHandler] ✅ User message saved', {
                threadId,
                participantIndex,
                messageId: lastMessage.id,
                roundNumber: currentRoundNumber,
              });
            }
          }
        }
      } else {
        console.warn('[streamChatHandler] ⏭️  User message already exists', {
          threadId,
          participantIndex,
          messageId: lastMessage.id,
        });
      }
    }

    // =========================================================================
    // STEP 5: Initialize OpenRouter and Setup
    // =========================================================================

    console.warn('[streamChatHandler] 🔧 Initializing OpenRouter', {
      threadId,
      participantIndex,
      modelId: participant.modelId,
    });

    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();
    const userTier = await getUserTier(user.id);

    // ✅ DYNAMIC TOKEN LIMIT: Fetch model info to get context_length and calculate safe max tokens
    const modelInfo = await openRouterModelsService.getModelById(participant.modelId);
    const modelContextLength = modelInfo?.context_length || 16000; // Default fallback

    // Estimate input tokens: system prompt + average message content
    // Rough estimate: 1 token ≈ 4 characters
    // Use conservative average of 200 tokens per message (includes system, user, assistant)
    const systemPromptTokens = Math.ceil((participant.settings?.systemPrompt || '').length / 4);
    const averageTokensPerMessage = 200;
    const messageTokens = typedMessages.length * averageTokensPerMessage;
    const estimatedInputTokens = systemPromptTokens + messageTokens + 500; // +500 for overhead and safety

    // Calculate safe max output tokens based on model's context length
    const maxOutputTokens = getSafeMaxOutputTokens(
      modelContextLength,
      estimatedInputTokens,
      userTier,
    );

    console.warn('[streamChatHandler] ✅ OpenRouter initialized', {
      threadId,
      participantIndex,
      userTier,
      modelContextLength,
      estimatedInputTokens,
      maxOutputTokens,
    });

    // =========================================================================
    // STEP 6: ✅ OFFICIAL AI SDK v5 PATTERN - Direct streamText()
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // =========================================================================

    console.warn('[streamChatHandler] 🔄 Preparing messages for model', {
      threadId,
      participantIndex,
      totalMessages: typedMessages.length,
    });

    // Prepare system prompt for this participant
    const systemPrompt = participant.settings?.systemPrompt
      || `You are ${participant.role || 'an AI assistant'}.`;

    console.warn('[streamChatHandler] 📝 System prompt prepared', {
      threadId,
      participantIndex,
      hasCustomPrompt: !!participant.settings?.systemPrompt,
      promptLength: systemPrompt.length,
    });

    // Convert UI messages to model messages
    // ✅ SHARED UTILITY: Filter out empty messages (caused by subsequent participant triggers)
    const nonEmptyMessages = filterNonEmptyMessages(typedMessages);

    console.warn('[streamChatHandler] 🔍 Filtered messages', {
      threadId,
      participantIndex,
      originalCount: typedMessages.length,
      nonEmptyCount: nonEmptyMessages.length,
    });

    if (nonEmptyMessages.length === 0) {
      console.error('[streamChatHandler] ❌ NO VALID MESSAGES', {
        threadId,
        participantIndex,
        originalMessageCount: typedMessages.length,
      });
      throw createError.badRequest('No valid messages to send to AI model');
    }

    let modelMessages;
    try {
      modelMessages = convertToModelMessages(nonEmptyMessages);

      console.warn('[streamChatHandler] ✅ Messages converted to model format', {
        threadId,
        participantIndex,
        modelMessageCount: modelMessages.length,
      });
    } catch (conversionError) {
      console.error('[streamChatHandler] ❌ MESSAGE CONVERSION ERROR', {
        threadId,
        participantIndex,
        error: conversionError instanceof Error ? conversionError.message : String(conversionError),
        nonEmptyMessageCount: nonEmptyMessages.length,
      });
      throw createError.badRequest('Failed to convert messages for model');
    }

    // =========================================================================
    // STEP 7: ✅ OFFICIAL AI SDK v5 STREAMING PATTERN
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling
    // =========================================================================
    //
    // OFFICIAL PATTERN: Direct streamText() → toUIMessageStreamResponse()
    // - NO content validation (models return what they return)
    // - NO custom retry loops (AI SDK maxRetries handles all retries)
    // - NO minimum length checking (accept all model responses)
    //
    // CUSTOMIZATION: Multi-participant routing via participantIndex (application-specific)
    //

    // ✅ TEMPERATURE SUPPORT: Some models (like o4-mini) don't support temperature parameter
    // Check if model supports temperature before including it
    const modelSupportsTemperature = !participant.modelId.includes('o4-mini') && !participant.modelId.includes('o4-deep');
    const temperatureValue = modelSupportsTemperature ? (participant.settings?.temperature ?? 0.7) : undefined;

    console.warn('[streamChatHandler] 🚀 Starting streamText', {
      threadId,
      participantIndex,
      participantId: participant.id,
      modelId: participant.modelId,
      modelRole: participant.role,
      maxOutputTokens,
      temperature: temperatureValue,
      modelSupportsTemperature,
      timeoutMs: AI_TIMEOUT_CONFIG.perAttemptMs,
      maxRetries: AI_RETRY_CONFIG.maxAttempts,
    });

    const result = streamText({
      model: client(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      ...(modelSupportsTemperature && { temperature: temperatureValue }),

      // ✅ AI SDK RETRY: Handles ALL errors (network, server, timeouts, rate limits)
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling
      // ✅ INCREASED RETRIES: Using reusable config (10 attempts for max reliability)
      maxRetries: AI_RETRY_CONFIG.maxAttempts,

      abortSignal: AbortSignal.any([
        (c.req as unknown as { raw: Request }).raw.signal, // Cancel on client disconnect
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs), // Server-side timeout
      ]),

      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat.thread.${threadId}.participant.${participant.id}`,
      },

      // ✅ OFFICIAL PATTERN: onFinish for message persistence only
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#on-finish
      onFinish: async (finishResult) => {
        console.warn('[streamChatHandler] ✨ onFinish triggered', {
          threadId,
          participantIndex,
          participantId: participant.id,
          modelId: participant.modelId,
        });

        const { text, usage, finishReason, providerMetadata } = finishResult;

        // ✅ AI SDK v5 OFFICIAL PATTERN: No custom validation - accept all model responses
        // Reference: "NO content validation (models return what they return)"
        // If the model finished successfully, we save whatever it returned

        console.warn('[streamChatHandler] 📊 Finish result details', {
          threadId,
          participantIndex,
          participantId: participant.id,
          textLength: text?.length || 0,
          finishReason,
          hasUsage: !!usage,
          totalTokens: usage?.totalTokens || 0,
        });

        // ✅ REASONING SUPPORT: Extract reasoning for o1/o3/DeepSeek models
        const reasoningText = typeof providerMetadata?.openai?.reasoning === 'string'
          ? providerMetadata.openai.reasoning
          : null;

        console.warn('[streamChatHandler] 💾 Saving assistant message to database', {
          threadId,
          participantIndex,
          participantId: participant.id,
          hasReasoning: !!reasoningText,
        });

        // ✅ CRITICAL ERROR HANDLING: Wrap DB operations in try-catch
        // This ensures that errors don't break the round - next participant can still respond
        try {
          // ✅ IMPROVED EMPTY RESPONSE DETECTION: Check for meaningful content
          // Some models output whitespace or minimal tokens (1-5 tokens) that aren't useful responses.
          // Examples: amazon/nova-pro-v1, some reasoning models during failures
          //
          // Detection criteria:
          // 1. No text at all
          // 2. Empty/whitespace-only text
          // 3. Zero output tokens (model refused/filtered)
          // 4. Minimal response: <10 chars AND <10 tokens (likely just whitespace/punctuation)
          const trimmedText = (text || '').trim();
          // ✅ VALIDATION: Only check for TRULY empty responses
          // - Empty text (no content at all)
          // - Zero output tokens (content filtered/refused)
          // ❌ NO minimum length check - short responses like "Yes", "No", "Hi!", "42" are VALID
          const isEmptyResponse = (
            !text
            || trimmedText.length === 0
            || usage?.outputTokens === 0
          );

          if (isEmptyResponse) {
            console.error('[streamChatHandler] ❌ Empty response detected - treating as error', {
              threadId,
              participantIndex,
              participantId: participant.id,
              modelId: participant.modelId,
              textLength: text?.length || 0,
              outputTokens: usage?.outputTokens || 0,
              finishReason,
            });
          }

          // ✅ AI SDK v5 ERROR HANDLING PATTERN: Save error state for empty responses
          // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/error-handling

          // Generate specific error message based on failure type
          let errorMessage: string | undefined;
          if (isEmptyResponse) {
            const outputTokens = usage?.outputTokens || 0;
            const inputTokens = usage?.inputTokens || 0;

            if (outputTokens === 0) {
              // Model refused to respond or was filtered
              errorMessage = `The model (${participant.modelId}) refused to respond or output was filtered. The model processed ${inputTokens} input tokens but produced no output. This typically indicates content filtering, safety constraints, or model limitations. Status: ${finishReason}.`;
            } else {
              // Generic empty response (should rarely happen since we check outputTokens === 0 above)
              errorMessage = `The model (${participant.modelId}) did not generate a valid response. The model processed ${inputTokens} input tokens but produced no usable output (${outputTokens} tokens). This can happen due to content filtering, model limitations, or API issues. Status: ${finishReason}.`;
            }
          }

          // ✅ CRITICAL FIX: Save empty string for content (error details shown via MessageErrorDetails component)
          // The MessageErrorDetails component reads from metadata.errorMessage and displays comprehensive error info
          // We keep content empty to maintain consistency - errors are always shown via metadata, not content
          const contentToSave = text || '';

          const [savedMessage] = await db.insert(tables.chatMessage)
            .values({
              id: ulid(),
              threadId,
              participantId: participant.id,
              role: 'assistant' as const,
              content: contentToSave,
              reasoning: reasoningText,
              roundNumber: currentRoundNumber, // ✅ EVENT-BASED ROUND TRACKING: Use same round as user message
              metadata: {
                model: participant.modelId,
                participantId: participant.id,
                participantIndex,
                participantRole: participant.role,
                usage,
                finishReason,
                // ✅ ERROR STATE: Flag empty responses as errors per AI SDK patterns
                hasError: isEmptyResponse,
                errorType: isEmptyResponse ? 'empty_response' : undefined,
                errorMessage,
              },
              createdAt: new Date(),
            })
            .onConflictDoNothing()
            .returning();

          console.warn('[streamChatHandler] ✅ Assistant message saved', {
            threadId,
            participantIndex,
            participantId: participant.id,
            messageId: savedMessage?.id,
            isLastParticipant: participantIndex === participants.length - 1,
          });

          await incrementMessageUsage(user.id, 1);

          // ✅ TRIGGER ANALYSIS: When last participant finishes
          if (participantIndex === participants.length - 1 && savedMessage) {
            console.warn('[streamChatHandler] 🎯 Last participant finished - triggering analysis', {
              threadId,
              participantIndex,
              roundNumber: Math.ceil((participantIndex + 1) / participants.length),
              totalParticipants: participants.length,
            });

            triggerRoundAnalysisAsync({
              threadId,
              thread: { ...thread, participants },
              allParticipants: participants,
              savedMessageId: savedMessage.id,
              db,
              env: c.env, // ✅ ADDED: Pass env for background analysis generation
            }).catch((error) => {
              console.error('[streamChatHandler] ❌ Failed to trigger analysis (non-blocking):', error);
            });
          }
        } catch (dbError) {
          // ✅ NON-BLOCKING ERROR: Log but don't throw
          // This allows the next participant to continue even if this one failed to save
          console.error('[streamChatHandler] ❌ FAILED TO SAVE MESSAGE (non-blocking)', {
            threadId,
            participantIndex,
            participantId: participant.id,
            modelId: participant.modelId,
            error: dbError instanceof Error ? dbError.message : String(dbError),
            stack: dbError instanceof Error ? dbError.stack : undefined,
          });
          // Don't throw - allow round to continue
        }
      },
    });

    // ✅ OFFICIAL PATTERN: Return UI message stream response
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/streaming-text-to-response#toUIMessageStreamResponse

    console.warn('[streamChatHandler] 📤 Returning stream response', {
      threadId,
      participantIndex,
      participantId: participant.id,
      modelId: participant.modelId,
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true, // Stream reasoning for o1/o3/DeepSeek models

      // ✅ OFFICIAL PATTERN: Pass original messages for type-safe metadata
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
      originalMessages: typedMessages,

      // ✅ OFFICIAL PATTERN: Required for proper abort handling
      // Reference: https://sdk.vercel.ai/docs/09-troubleshooting/14-stream-abort-handling
      // Without this, onFinish callback may not fire when stream is aborted
      consumeSseStream: consumeStream,

      onError: (error) => {
        // ✅ COMPREHENSIVE ERROR LOGGING: Log all error details for debugging
        // Type assertion: AI SDK onError provides error as unknown type
        const err = error as Error & { cause?: unknown };
        console.error('[streamChatHandler] ❌ STREAMING ERROR (handled by onError)', {
          threadId,
          participantIndex,
          participantId: participant.id,
          modelId: participant.modelId,
          modelRole: participant.role,
          errorName: err?.name,
          errorMessage: err?.message,
          errorType: err?.constructor?.name,
          errorCause: err?.cause,
          stack: err?.stack,
        });

        // Return user-friendly error message for the frontend
        const modelName = participant.role || participant.modelId || 'AI model';
        return `${modelName} encountered an error. The round will continue with the next participant.`;
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

      // ✅ STREAMING: Return 202 Accepted if actively streaming
      // Frontend should handle this by showing loading state without re-triggering
      if (existingAnalysis.status === 'streaming') {
        return Responses.accepted(c, {
          status: existingAnalysis.status,
          message: 'Analysis is currently being generated. Please wait...',
          analysisId: existingAnalysis.id,
          createdAt: existingAnalysis.createdAt,
        }); // 202 Accepted - request accepted but not yet completed
      }

      // ✅ PENDING: Check if stuck (created > 2 minutes ago)
      // If stuck, delete and allow retry. Otherwise, proceed with generation
      if (existingAnalysis.status === 'pending') {
        const ageMs = Date.now() - existingAnalysis.createdAt.getTime();
        const TWO_MINUTES_MS = 2 * 60 * 1000;

        if (ageMs > TWO_MINUTES_MS) {
          // Stuck pending - mark as failed and allow fresh retry
          console.warn('[analyzeRoundHandler] Pending analysis is stuck (> 2 min), marking as failed:', existingAnalysis.id);
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: 'failed',
              errorMessage: 'Analysis timed out - stuck in pending state for over 2 minutes',
            })
            .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));

          // Fall through to create new analysis
        } else {
          // Recent pending - proceed with generation (don't return early!)
          console.warn('[analyzeRoundHandler] Found recent pending analysis, proceeding with generation:', existingAnalysis.id);
          // Delete pending and create streaming below
          await db.delete(tables.chatModeratorAnalysis)
            .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
        }
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
    const { buildModeratorSystemPrompt, buildModeratorUserPrompt } = await import('@/api/services/moderator-analysis.service');

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
        schema: ModeratorAnalysisPayloadSchema,
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

// ============================================================================
// Round Feedback Handlers
// ============================================================================

/**
 * Set Round Feedback Handler
 *
 * Allows users to like/dislike a conversation round.
 * - Creates new feedback if it doesn't exist
 * - Updates existing feedback if it exists
 * - Deletes feedback if feedbackType is null
 *
 * Security: Users can only set feedback for their own threads
 */
export const setRoundFeedbackHandler: RouteHandler<typeof setRoundFeedbackRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: RoundFeedbackParamSchema,
    validateBody: RoundFeedbackRequestSchema,
    operationName: 'setRoundFeedback',
  },
  async (c) => {
    const { threadId, roundNumber: roundNumberStr } = c.validated.params;
    const { feedbackType } = c.validated.body;
    const roundNumber = Number.parseInt(roundNumberStr, 10);

    const db = await getDbAsync();
    const user = c.get('user');

    if (!user) {
      throw createError.unauthenticated(
        'Authentication required',
        ErrorContextBuilders.auth(),
      );
    }

    // ✅ Verify thread exists and belongs to user
    const thread = await db.query.chatThread.findFirst({
      where: and(
        eq(tables.chatThread.id, threadId),
        eq(tables.chatThread.userId, user.id),
      ),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId),
      );
    }

    // ✅ Check if feedback already exists
    const existingFeedback = await db.query.chatRoundFeedback.findFirst({
      where: and(
        eq(tables.chatRoundFeedback.threadId, threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
        eq(tables.chatRoundFeedback.roundNumber, roundNumber),
      ),
    });

    let result;

    if (feedbackType === null) {
      // ✅ DELETE: Remove feedback if exists
      if (existingFeedback) {
        await db
          .delete(tables.chatRoundFeedback)
          .where(eq(tables.chatRoundFeedback.id, existingFeedback.id));
      }

      // Return null feedback (removed)
      result = {
        id: existingFeedback?.id || ulid(),
        threadId,
        userId: user.id,
        roundNumber,
        feedbackType: null,
        createdAt: existingFeedback?.createdAt || /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
      };
    } else if (existingFeedback) {
      // ✅ UPDATE: Update existing feedback
      const [updated] = await db
        .update(tables.chatRoundFeedback)
        .set({
          feedbackType,
          updatedAt: /* @__PURE__ */ new Date(),
        })
        .where(eq(tables.chatRoundFeedback.id, existingFeedback.id))
        .returning();

      if (!updated) {
        throw createError.internal(
          'Failed to update feedback',
          ErrorContextBuilders.database('update', 'chat_round_feedback'),
        );
      }

      result = updated;
    } else {
      // ✅ CREATE: Insert new feedback
      const [created] = await db
        .insert(tables.chatRoundFeedback)
        .values({
          id: ulid(),
          threadId,
          userId: user.id,
          roundNumber,
          feedbackType,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
        })
        .returning();

      if (!created) {
        throw createError.internal(
          'Failed to create feedback',
          ErrorContextBuilders.database('insert', 'chat_round_feedback'),
        );
      }

      result = created;
    }

    // ✅ Serialize dates to ISO strings for API response
    return Responses.ok(c, {
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  },
);

/**
 * Get Thread Feedback Handler
 *
 * Retrieves all round feedback for a thread for the current user.
 *
 * Security: Users can only get feedback for their own threads
 */
export const getThreadFeedbackHandler: RouteHandler<typeof getThreadFeedbackRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadFeedback',
  },
  async (c) => {
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    const user = c.get('user');

    if (!user) {
      throw createError.unauthenticated(
        'Authentication required',
        ErrorContextBuilders.auth(),
      );
    }

    // ✅ Verify thread exists and belongs to user
    const thread = await db.query.chatThread.findFirst({
      where: and(
        eq(tables.chatThread.id, threadId),
        eq(tables.chatThread.userId, user.id),
      ),
    });

    if (!thread) {
      throw createError.notFound(
        'Thread not found',
        ErrorContextBuilders.resourceNotFound('thread', threadId),
      );
    }

    // ✅ Get all feedback for this thread and user
    const feedbackList = await db.query.chatRoundFeedback.findMany({
      where: and(
        eq(tables.chatRoundFeedback.threadId, threadId),
        eq(tables.chatRoundFeedback.userId, user.id),
      ),
      orderBy: (table, { asc }) => [asc(table.roundNumber)],
    });

    // ✅ Serialize dates to ISO strings for API response
    return Responses.ok(
      c,
      feedbackList.map(feedback => ({
        ...feedback,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
      })),
    );
  },
);
