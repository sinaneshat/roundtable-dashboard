import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, createIdGenerator, streamObject, streamText, validateUIMessages } from 'ai';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, lte, ne } from 'drizzle-orm';
import Fuse from 'fuse.js';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError, structureAIProviderError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createHandlerWithBatch,
  createTimestampCursor,
  CursorPaginationQuerySchema,
  getCursorOrderBy,
  Responses,
} from '@/api/core';
import type { ChangelogType, ChatMode, ThreadStatus } from '@/api/core/enums';
import { AnalysisStatuses, ChangelogTypes } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema, ThreadSlugParamSchema } from '@/api/core/schemas';
// ✅ Background analysis service removed - using streaming with onFinish callback only
// import { processAnalysisInBackground, restartStaleAnalysis } from '@/api/services/analysis-background.service';
import type { ModeratorPromptConfig } from '@/api/services/moderator-analysis.service';
import {
  buildModeratorSystemPrompt,
  buildModeratorUserPrompt,
} from '@/api/services/moderator-analysis.service';
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
import { ragService } from '@/api/services/rag.service';
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
import { messageHasError, MessageMetadataSchema, UIMessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { extractTextFromParts, filterNonEmptyMessages } from '@/lib/utils/message-transforms';

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
  RoundFeedbackParamSchema,
  RoundFeedbackRequestSchema,
  StreamChatRequestSchema,
  ThreadListQuerySchema,
  UpdateCustomRoleRequestSchema,
  UpdateParticipantRequestSchema,
  UpdateThreadRequestSchema,
} from './schema';

// ============================================================================
// Internal Helper Functions (Following 3-file pattern: handler, route, schema)
// ============================================================================

// ✅ CODE REDUCTION: structureErrorMetadata() moved to /src/api/common/error-handling.ts
// Now using shared structureAIProviderError() utility for consistent error handling
// REFERENCE: backend-patterns.md:1415-1437 (Shared utility pattern)

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
    const userMessage = userMessages.find(
      m => m.createdAt.getTime() < earliestRoundMessageTime,
    );
    const userQuestion = userMessage ? extractTextFromParts(userMessage.parts) : 'N/A';

    // ✅ CREATE PENDING ANALYSIS RECORD: Frontend will stream from /analyze endpoint
    // This prevents duplicate generation and signals frontend to start real-time streaming
    const analysisId = ulid();

    await db.insert(tables.chatModeratorAnalysis).values({
      id: analysisId,
      threadId,
      roundNumber,
      mode: thread.mode,
      userQuestion,
      status: AnalysisStatuses.PENDING, // Frontend will detect and stream from /analyze endpoint
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
 * ✅ AI SDK V5 HELPER: Convert database messages to UIMessage format
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 *
 * Used by "send only last message" pattern to load previous messages from DB.
 * Converts database chat_message table rows to AI SDK UIMessage format.
 */
function chatMessagesToUIMessages(
  dbMessages: Array<typeof tables.chatMessage.$inferSelect>,
): UIMessage[] {
  return dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: msg.parts as unknown as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>,
    ...(msg.metadata && { metadata: msg.metadata }),
    createdAt: msg.createdAt,
  })) as UIMessage[];
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
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<typeof tables.chatThread.$inferSelect>;

/**
 * Overload 2: With participants
 */
async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options: { includeParticipants: true },
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

/**
 * ✅ DEFERRED CHANGELOG PATTERN: Create changelog entries when starting a new round
 *
 * This function compares the current thread state with the state from the previous round
 * to detect any changes (mode, participants, roles, order) and creates changelog entries
 * for those changes. Changelog entries are associated with the current round number.
 *
 * This ensures changelog only appears when a message is submitted, not when changes
 * are made in the UI.
 */
async function createChangelogForRound(
  db: Awaited<ReturnType<typeof getDbAsync>>,
  thread: typeof tables.chatThread.$inferSelect & { participants: Array<typeof tables.chatParticipant.$inferSelect> },
  currentRoundNumber: number,
): Promise<void> {
  const now = new Date();
  const changelogEntries: Array<typeof tables.chatThreadChangelog.$inferInsert> = [];

  // Get the previous round number to compare state
  const previousRoundNumber = currentRoundNumber - 1;

  if (previousRoundNumber < 1) {
    // First round - no previous state to compare
    return;
  }

  // Get the thread state as it was in the previous round
  // We can infer this from the messages and changelog from that round
  const previousRoundMessages = await db.query.chatMessage.findMany({
    where: and(
      eq(tables.chatMessage.threadId, thread.id),
      eq(tables.chatMessage.roundNumber, previousRoundNumber),
    ),
    orderBy: [asc(tables.chatMessage.createdAt)],
  });

  // Get previous changelog to see what the mode was
  const previousChangelog = await db.query.chatThreadChangelog.findMany({
    where: and(
      eq(tables.chatThreadChangelog.threadId, thread.id),
      lte(tables.chatThreadChangelog.roundNumber, previousRoundNumber),
    ),
    orderBy: [desc(tables.chatThreadChangelog.roundNumber), desc(tables.chatThreadChangelog.createdAt)],
  });

  // Determine previous mode (from last mode_change in changelog, or thread.mode if no changes)
  const lastModeChange = previousChangelog.find(c => c.changeType === 'mode_change');
  const previousMode = lastModeChange?.changeData?.newMode as ChatMode | undefined || thread.mode;

  // Check for mode changes
  if (thread.mode !== previousMode) {
    changelogEntries.push({
      id: ulid(),
      threadId: thread.id,
      roundNumber: currentRoundNumber,
      changeType: ChangelogTypes.MODE_CHANGE,
      changeSummary: `Changed conversation mode from ${previousMode} to ${thread.mode}`,
      changeData: {
        oldMode: previousMode,
        newMode: thread.mode,
      },
      createdAt: now,
    });
  }

  // Get participant IDs from previous round messages
  const previousParticipantIds = new Set(
    previousRoundMessages
      .filter(m => m.role === 'assistant' && m.participantId)
      .map(m => m.participantId!),
  );

  // Get current participant IDs
  const currentParticipantIds = new Set(thread.participants.map(p => p.id));
  const currentParticipantsMap = new Map(thread.participants.map(p => [p.id, p]));

  // Detect participant removals
  for (const prevId of previousParticipantIds) {
    if (!currentParticipantIds.has(prevId)) {
      // Participant was removed - try to get info from previous messages
      const prevMessage = previousRoundMessages.find(m => m.participantId === prevId);
      if (prevMessage?.metadata) {
        const metadata = prevMessage.metadata as { model?: string; participantRole?: string };
        const modelName = extractModeratorModelName(metadata.model || 'unknown');
        changelogEntries.push({
          id: ulid(),
          threadId: thread.id,
          roundNumber: currentRoundNumber,
          changeType: ChangelogTypes.PARTICIPANT_REMOVED,
          changeSummary: `Removed ${modelName}${metadata.participantRole ? ` ("${metadata.participantRole}")` : ''}`,
          changeData: {
            participantId: prevId,
            modelId: metadata.model || 'unknown',
            role: metadata.participantRole || null,
          },
          createdAt: now,
        });
      }
    }
  }

  // Detect participant additions
  for (const participant of thread.participants) {
    if (!previousParticipantIds.has(participant.id)) {
      const modelName = extractModeratorModelName(participant.modelId);
      changelogEntries.push({
        id: ulid(),
        threadId: thread.id,
        roundNumber: currentRoundNumber,
        changeType: ChangelogTypes.PARTICIPANT_ADDED,
        changeSummary: `Added ${modelName}${participant.role ? ` as "${participant.role}"` : ''}`,
        changeData: {
          participantId: participant.id,
          modelId: participant.modelId,
          role: participant.role,
        },
        createdAt: now,
      });
    }
  }

  // Detect role and priority changes for existing participants
  for (const prevMessage of previousRoundMessages) {
    if (prevMessage.role !== 'assistant' || !prevMessage.participantId)
      continue;

    const participantId = prevMessage.participantId;
    const currentParticipant = currentParticipantsMap.get(participantId);

    if (!currentParticipant)
      continue; // Already handled in removals

    const prevMetadata = prevMessage.metadata as { participantRole?: string; participantIndex?: number };
    const prevRole = prevMetadata?.participantRole || null;
    const prevIndex = prevMetadata?.participantIndex ?? 0;

    // Check for role changes
    if (currentParticipant.role !== prevRole) {
      const modelName = extractModeratorModelName(currentParticipant.modelId);
      changelogEntries.push({
        id: ulid(),
        threadId: thread.id,
        roundNumber: currentRoundNumber,
        changeType: ChangelogTypes.PARTICIPANT_UPDATED,
        changeSummary: `Updated ${modelName} role from ${prevRole || 'none'} to ${currentParticipant.role || 'none'}`,
        changeData: {
          participantId,
          modelId: currentParticipant.modelId,
          oldRole: prevRole,
          newRole: currentParticipant.role,
        },
        createdAt: now,
      });
    }

    // Check for priority/order changes
    if (currentParticipant.priority !== prevIndex) {
      const modelName = extractModeratorModelName(currentParticipant.modelId);
      changelogEntries.push({
        id: ulid(),
        threadId: thread.id,
        roundNumber: currentRoundNumber,
        changeType: ChangelogTypes.PARTICIPANTS_REORDERED,
        changeSummary: `Reordered ${modelName}`,
        changeData: {
          participantId,
          modelId: currentParticipant.modelId,
          oldPriority: prevIndex,
          newPriority: currentParticipant.priority,
        },
        createdAt: now,
      });
    }
  }

  // Insert all changelog entries if any changes detected
  if (changelogEntries.length > 0) {
    await db.insert(tables.chatThreadChangelog).values(changelogEntries);

    console.warn('[createChangelogForRound] ✅ Created changelog entries for round', {
      threadId: thread.id,
      roundNumber: currentRoundNumber,
      entryCount: changelogEntries.length,
      changes: changelogEntries.map(e => e.changeType),
    });
  }
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

    // ✅ BATCH PATTERN: Prepare all participant values, then insert atomically
    // This ensures thread + participants are created in single atomic batch
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

    // ✅ BATCH PATTERN: Insert all participants in batch operation
    // batch.db operations are automatically collected and executed atomically
    const participants = await db
      .insert(tables.chatParticipant)
      .values(participantValues)
      .returning();

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

        // ✅ STABLE URL FIX: Only update title, NOT slug
        // Slug remains permanent to prevent 404 errors when client is using the original slug
        // Changing the slug after creation causes race conditions where the client still uses old slug
        console.warn('[createThreadHandler] 📝 Updating thread with AI title (keeping slug stable)', {
          threadId,
          aiTitle,
          slug: tempSlug, // Keep original slug
        });

        // Update thread with AI-generated title only (slug stays the same)
        await db
          .update(tables.chatThread)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        console.warn('[createThreadHandler] ✅ Thread updated with AI title', {
          threadId,
          aiTitle,
          slug: tempSlug, // Slug unchanged - stable URL
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
          slug: tempSlug, // Slug unchanged
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

    // ✅ DEFERRED CHANGELOG PATTERN: Don't create changelog entries here
    // Changes are persisted immediately to database for data integrity
    // Changelog entries will be created when the next message is submitted
    // This ensures changelog only appears when starting a new round

    // ✅ Mode change will be tracked in changelog when next message is submitted
    // No immediate changelog creation

    // ✅ Handle participant changes (if provided)
    if (body.participants !== undefined) {
      // Get current participants
      const currentParticipants = await db.query.chatParticipant.findMany({
        where: eq(tables.chatParticipant.threadId, id),
      });

      // Build maps for comparison
      const currentMap = new Map(currentParticipants.map(p => [p.id, p]));
      const newMap = new Map(body.participants.filter(p => p.id).map(p => [p.id!, p]));

      // Detect removals (changelog will be created on next message submission)
      // No immediate changelog creation

      // Detect additions and updates
      const participantsToInsert: Array<typeof tables.chatParticipant.$inferInsert> = [];
      const participantsToUpdate: Array<{ id: string; updates: Partial<typeof tables.chatParticipant.$inferSelect> }> = [];

      for (const newP of body.participants) {
        if (!newP.id) {
          // New participant
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

            // ✅ Changelog for role changes and reordering will be created on next message submission
            // No immediate changelog creation
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

    // ✅ RAG CLEANUP: Delete all embeddings for the thread
    // Even though this is a soft delete, we clean up RAG embeddings to free vector storage
    // If thread is restored in the future, embeddings can be regenerated
    try {
      await ragService.deleteThreadEmbeddings({
        threadId: id,
        db,
      });

      console.warn('[deleteThreadHandler] 🔍 RAG embeddings deleted', {
        threadId: id,
        userId: user.id,
      });
    } catch (error) {
      // Log but don't fail the deletion
      console.error('[deleteThreadHandler] ⚠️ Failed to delete RAG embeddings', {
        threadId: id,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
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

export const addParticipantHandler: RouteHandler<typeof addParticipantRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: AddParticipantRequestSchema,
    operationName: 'addParticipant',
  },
  async (c, batch) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    // ✅ BATCH PATTERN: Access database through batch.db for atomic operations
    const db = batch.db;

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
        changeType: ChangelogTypes.PARTICIPANT_UPDATED,
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

    // ✅ ATOMIC BATCH: Track changelog + delete participant atomically
    // Following backend-patterns.md:1007-1043 - Batch-First Architecture
    const modelName = extractModeratorModelName(participant.modelId);
    const changelogId = ulid();

    await executeBatch(db, [
      db.insert(tables.chatThreadChangelog).values({
        id: changelogId,
        threadId: participant.threadId,
        changeType: ChangelogTypes.PARTICIPANT_REMOVED,
        changeSummary: `Removed ${modelName}${participant.role ? ` ("${participant.role}")` : ''}`,
        changeData: {
          participantId: id,
          modelId: participant.modelId,
          role: participant.role,
        },
        createdAt: new Date(),
      }),
      db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, id)),
    ]);

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
    const { message, id: threadId, participantIndex, participants: providedParticipants, regenerateRound, mode: providedMode } = c.validated.body;

    // ✅ AI SDK V5 OFFICIAL PATTERN: Validate single message exists
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
    if (!message) {
      console.error('[streamChatHandler] ❌ VALIDATION ERROR: Message is required', {
        threadId,
        participantIndex,
      });
      throw createError.badRequest('Message is required');
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
    // STEP 1.3: ✅ REGENERATE ROUND: Delete old messages and analysis if regenerating
    // =========================================================================
    // When regenerateRound is provided, we delete all existing messages and analysis
    // for that round number. This allows the new streaming to reuse the same round number
    // and effectively "replace" the old round with new content.
    //
    // This is only done by the first participant (index 0) to avoid race conditions
    // where multiple participants try to delete the same messages simultaneously.

    if (regenerateRound && participantIndex === 0) {
      console.warn('[streamChatHandler] ♻️ REGENERATING ROUND: Deleting old messages and analysis', {
        threadId,
        regenerateRound,
        participantIndex,
      });

      try {
        // Delete all messages from the specified round
        const deletedMessages = await db
          .delete(tables.chatMessage)
          .where(
            and(
              eq(tables.chatMessage.threadId, threadId),
              eq(tables.chatMessage.roundNumber, regenerateRound),
            ),
          )
          .returning();

        console.warn('[streamChatHandler] ♻️ Deleted messages from round', {
          threadId,
          regenerateRound,
          deletedCount: deletedMessages.length,
        });

        // ✅ RAG CLEANUP: Delete embeddings for deleted messages
        // CASCADE foreign key will handle D1 cleanup, but we need to clean Vectorize
        if (deletedMessages.length > 0) {
          for (const deletedMessage of deletedMessages) {
            try {
              await ragService.deleteMessageEmbeddings({
                messageId: deletedMessage.id,
                db,
              });
            } catch (error) {
              // Log but don't fail the regeneration
              console.error('[streamChatHandler] ⚠️ Failed to delete RAG embeddings for message', {
                threadId,
                messageId: deletedMessage.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        // Delete analysis for the specified round (if exists)
        const deletedAnalyses = await db
          .delete(tables.chatModeratorAnalysis)
          .where(
            and(
              eq(tables.chatModeratorAnalysis.threadId, threadId),
              eq(tables.chatModeratorAnalysis.roundNumber, regenerateRound),
            ),
          )
          .returning();

        console.warn('[streamChatHandler] ♻️ Deleted analyses from round', {
          threadId,
          regenerateRound,
          deletedCount: deletedAnalyses.length,
        });

        // Delete feedback for the specified round (if exists)
        await db
          .delete(tables.chatRoundFeedback)
          .where(
            and(
              eq(tables.chatRoundFeedback.threadId, threadId),
              eq(tables.chatRoundFeedback.roundNumber, regenerateRound),
            ),
          );
      } catch (error) {
        console.error('[streamChatHandler] ❌ REGENERATION ERROR: Failed to delete old round data', {
          threadId,
          regenerateRound,
          error,
        });
        // Don't fail the request - continue with streaming
        // The old messages will remain but new ones will be added with a higher round number
      }
    }

    // =========================================================================
    // STEP 1.4: Calculate Round Number (ONLY for first participant)
    // =========================================================================
    // ✅ EVENT-BASED ROUND TRACKING: Calculate round number ONCE per round
    // Only participant 0 calculates the round number to avoid race conditions
    // Other participants will use the roundNumber from the saved user message

    let currentRoundNumber: number;

    if (regenerateRound && participantIndex === 0) {
      // ✅ REGENERATION: Reuse the exact round number being regenerated
      // This ensures the new messages replace the old round instead of creating a new round
      currentRoundNumber = regenerateRound;
    } else if (participantIndex === 0) {
      // First participant: Calculate round number
      const existingUserMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.role, 'user'),
        ),
        columns: { id: true },
      });

      currentRoundNumber = existingUserMessages.length + 1;
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
    }

    // =========================================================================
    // STEP 1.4A: ✅ HANDLE MODE CHANGE (If Provided)
    // =========================================================================
    // Check if mode was changed and persist immediately (not staged like participants)
    // Only first participant (index 0) should handle mode changes to avoid duplicates

    if (providedMode && providedMode !== thread.mode && participantIndex === 0) {
      console.warn('[streamChatHandler] 🔄 MODE CHANGE DETECTED', {
        threadId,
        oldMode: thread.mode,
        newMode: providedMode,
      });

      // Update thread mode
      await db
        .update(tables.chatThread)
        .set({
          mode: providedMode,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatThread.id, threadId));

      // Create mode change changelog entry
      await db.insert(tables.chatThreadChangelog).values({
        id: ulid(),
        threadId,
        roundNumber: currentRoundNumber,
        changeType: ChangelogTypes.MODE_CHANGE,
        changeSummary: `Changed mode from ${thread.mode} to ${providedMode}`,
        changeData: {
          oldMode: thread.mode,
          newMode: providedMode,
        },
        createdAt: new Date(),
      });

      // Update local thread object for subsequent logic
      thread.mode = providedMode;
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
      // ✅ DETAILED CHANGE DETECTION: Track specific types of changes
      const changelogEntries: Array<{
        id: string;
        changeType: ChangelogType;
        changeSummary: string;
        changeData: Record<string, unknown>;
      }> = [];

      // Get current enabled participants from DB for comparison
      const enabledDbParticipants = thread.participants.filter(p => p.isEnabled);
      const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

      // ✅ FIXED: Match participants by modelId+role combination, not by ID
      // Frontend sends temporary IDs like "participant-1" for new participants
      // We need to match by content (modelId + role) to detect actual changes
      const matchParticipant = (p1: { modelId: string; role?: string | null }, p2: { modelId: string; role?: string | null }) =>
        p1.modelId === p2.modelId && (p1.role || null) === (p2.role || null);

      // Detect removed participants (in DB but not in provided list)
      const removedParticipants = enabledDbParticipants.filter(
        dbP => !providedEnabledParticipants.find(p => matchParticipant(p, dbP)),
      );

      // Detect added participants (in provided but not in DB)
      // Match by modelId+role to avoid treating reordered participants as "new"
      const addedParticipants = providedEnabledParticipants.filter(
        provided => !enabledDbParticipants.find(dbP => matchParticipant(provided, dbP)),
      );

      // Detect updated participants (customRole changed for same modelId+role)
      const updatedParticipants = providedEnabledParticipants.filter((provided) => {
        const dbP = enabledDbParticipants.find(db => matchParticipant(provided, db));
        if (!dbP) {
          return false; // This is an added participant, not updated
        }
        // Only consider it updated if customRoleId changed
        return dbP.customRoleId !== provided.customRoleId;
      });

      // Detect reordering (priority changes for existing participants)
      // Match by modelId+role to get the correct DB participant
      const wasReordered = providedEnabledParticipants.some((provided, index) => {
        const dbP = enabledDbParticipants.find(db => matchParticipant(provided, db));
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

      // ✅ FIXED: UPDATE OPERATIONS - Match by modelId+role instead of ID
      // Build update operations for existing participants (matched by content, not ID)
      const updateOps = providedEnabledParticipants
        .map((provided) => {
          // Find matching DB participant by modelId+role
          const dbP = enabledDbParticipants.find(db => matchParticipant(provided, db));
          if (!dbP) {
            return null; // Not an existing participant, skip
          }

          // Update with new priority, customRoleId, and isEnabled status
          return db.update(tables.chatParticipant)
            .set({
              customRoleId: provided.customRoleId ?? null,
              priority: provided.priority,
              isEnabled: provided.isEnabled ?? true,
              updatedAt: new Date(),
            })
            .where(eq(tables.chatParticipant.id, dbP.id)); // Use DB ID for update
        })
        .filter((op): op is NonNullable<typeof op> => op !== null);

      // Also disable participants that were removed (not in provided list)
      const disableOps = removedParticipants.map(removed =>
        db.update(tables.chatParticipant)
          .set({
            isEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatParticipant.id, removed.id)),
      );

      // ✅ FIXED: Helper to extract model name from modelId
      const extractModelName = (modelId: string) => {
        // Extract last part after "/" for better readability
        const parts = modelId.split('/');
        return parts[parts.length - 1] || modelId;
      };

      // Create specific changelog entries with improved summaries
      if (removedParticipants.length > 0) {
        removedParticipants.forEach((removed) => {
          const modelName = extractModelName(removed.modelId);
          const displayName = removed.role || modelName;
          changelogEntries.push({
            id: ulid(),
            changeType: ChangelogTypes.PARTICIPANT_REMOVED,
            changeSummary: `Removed ${displayName}`,
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
          const modelName = extractModelName(added.modelId);
          const displayName = added.role || modelName;
          changelogEntries.push({
            id: ulid(),
            changeType: ChangelogTypes.PARTICIPANT_ADDED,
            changeSummary: `Added ${displayName}`,
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
          // ✅ FIXED: Match by modelId+role instead of ID
          const dbP = enabledDbParticipants.find(db => matchParticipant(updated, db));
          if (!dbP) {
            return;
          }

          const changes: string[] = [];
          if (dbP.customRoleId !== updated.customRoleId) {
            changes.push(`custom role changed`);
          }

          if (changes.length > 0) {
            const modelName = extractModelName(updated.modelId);
            const displayName = updated.role || modelName;
            changelogEntries.push({
              id: ulid(),
              changeType: ChangelogTypes.PARTICIPANT_UPDATED,
              changeSummary: `Updated ${displayName}: ${changes.join(', ')}`,
              changeData: {
                participantId: dbP.id,
                modelId: updated.modelId,
                role: updated.role,
                oldCustomRoleId: dbP.customRoleId,
                newCustomRoleId: updated.customRoleId,
              },
            });
          }
        });
      }

      if (wasReordered) {
        changelogEntries.push({
          id: ulid(),
          changeType: ChangelogTypes.PARTICIPANTS_REORDERED,
          changeSummary: `Reordered ${providedEnabledParticipants.length} participant(s)`,
          changeData: {
            participants: providedEnabledParticipants.map((p, index) => {
              const dbP = enabledDbParticipants.find(db => matchParticipant(p, db));
              return {
                id: dbP?.id || p.id,
                modelId: p.modelId,
                role: p.role,
                order: index,
              };
            }),
          },
        });
      }

      // Only persist if there are actual changes
      if (changelogEntries.length > 0 || insertOps.length > 0 || updateOps.length > 0 || disableOps.length > 0) {
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
    } else {
      // ✅ NO PROVIDED PARTICIPANTS: Use database state from initial query
      participants = thread.participants;
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

    // =========================================================================
    // STEP 3: ✅ AI SDK V5 OFFICIAL PATTERN - Load Previous Messages from DB
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
    // =========================================================================
    // OPTIMIZATION: Instead of sending entire message history from frontend,
    // load previous messages from database and append new message.
    //
    // Benefits:
    // - Reduced bandwidth (important for long conversations)
    // - Faster requests as conversation grows
    // - Single source of truth (database)

    // Load all previous messages from database
    const previousDbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [asc(tables.chatMessage.createdAt)],
    });

    // Convert database messages to UIMessage format
    const previousMessages = chatMessagesToUIMessages(previousDbMessages);

    // Combine previous messages + new message
    const allMessages = [...previousMessages, message as UIMessage];

    // ✅ AI SDK v5 OFFICIAL PATTERN: Validate ALL messages (previous + new)
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
    // This ensures both stored messages and new message are valid
    let typedMessages: UIMessage[] = [];

    try {
      // ✅ Validate combined message history
      validateUIMessages({
        messages: allMessages,
        metadataSchema: UIMessageMetadataSchema,
      });
      typedMessages = allMessages;
    } catch (error) {
      console.error('[streamChatHandler] ❌ MESSAGE VALIDATION ERROR', {
        threadId,
        participantIndex,
        error: error instanceof Error ? error.message : String(error),
        previousMessageCount: previousMessages.length,
        totalMessageCount: allMessages.length,
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
            // ✅ DUPLICATE PREVENTION: Check if a user message exists in this round
            // Since we can't filter by JSON content in SQL, check all messages in the round
            const roundMessages = await db.query.chatMessage.findMany({
              where: and(
                eq(tables.chatMessage.threadId, threadId),
                eq(tables.chatMessage.role, 'user'),
                eq(tables.chatMessage.roundNumber, currentRoundNumber),
              ),
              columns: { id: true, parts: true },
            });

            // Check if any existing message has the same content
            const isDuplicate = roundMessages.some(msg =>
              extractTextFromParts(msg.parts).trim() === content,
            );

            if (!isDuplicate) {
              await enforceMessageQuota(user.id);
              await db.insert(tables.chatMessage).values({
                id: lastMessage.id,
                threadId,
                role: 'user',
                parts: [{ type: 'text', text: content }],
                roundNumber: currentRoundNumber,
                createdAt: new Date(),
              });
              await incrementMessageUsage(user.id, 1);

              // ✅ DEFERRED CHANGELOG PATTERN: Create changelog entries when starting new round
              // This ensures changelog only appears when a message is submitted
              await createChangelogForRound(db, thread, currentRoundNumber);
            }
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

    // =========================================================================
    // STEP 6: ✅ OFFICIAL AI SDK v5 PATTERN - Direct streamText()
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // =========================================================================

    // Prepare system prompt for this participant
    // ✅ OPTIMIZED SYSTEM PROMPT: 2025 best practices for natural conversation
    // - Avoids AI self-awareness that triggers content filters
    // - Uses persona-based framing for natural engagement
    // - Direct, clear instructions without "AI" terminology
    // - Prevents fourth-wall breaking and self-referential behavior
    const baseSystemPrompt = participant.settings?.systemPrompt
      || (participant.role
        ? `You're ${participant.role}. Engage naturally in this discussion, sharing your perspective and insights. Be direct, thoughtful, and conversational.`
        : `Engage naturally in this discussion. Share your thoughts, ask questions, and build on others' ideas. Be direct and conversational.`);

    // =========================================================================
    // STEP 5.5: ✅ RAG CONTEXT RETRIEVAL - Semantic search for relevant context
    // =========================================================================
    // Retrieve relevant context from previous messages using semantic search
    // This enhances AI responses with relevant information from conversation history
    let systemPrompt = baseSystemPrompt;
    const startRetrievalTime = performance.now();

    try {
      // Extract query from last user message
      const lastUserMessage = typedMessages.findLast(m => m.role === 'user');
      const userQuery = lastUserMessage
        ? extractTextFromParts(lastUserMessage.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>)
        : '';

      // Only retrieve context if we have a valid query
      if (userQuery.trim()) {
        const ragContexts = await ragService.retrieveContext({
          query: userQuery,
          threadId,
          userId: user.id,
          topK: 5,
          minSimilarity: 0.7,
          db,
        });

        const retrievalTimeMs = performance.now() - startRetrievalTime;

        // If we found relevant context, inject it into the system prompt
        if (ragContexts.length > 0) {
          const contextPrompt = ragService.formatContextForPrompt(ragContexts);
          systemPrompt = `${baseSystemPrompt}\n\n${contextPrompt}`;

          console.warn('[streamChatHandler] 🔍 RAG context retrieved', {
            threadId,
            participantIndex,
            contextCount: ragContexts.length,
            topSimilarity: ragContexts[0]?.similarity,
            retrievalTimeMs,
          });

          // Track RAG usage for analytics (non-blocking)
          ragService.trackContextRetrieval({
            threadId,
            userId: user.id,
            query: userQuery,
            contexts: ragContexts,
            queryTimeMs: retrievalTimeMs,
            db,
          }).catch((error) => {
            console.error('[streamChatHandler] ⚠️ Failed to track RAG analytics', error);
          });
        } else {
          console.warn('[streamChatHandler] 🔍 No RAG context found', {
            threadId,
            participantIndex,
            retrievalTimeMs,
          });
        }
      }
    } catch (error) {
      // RAG failures should not break the chat flow
      console.error('[streamChatHandler] ⚠️ RAG context retrieval failed', {
        threadId,
        participantIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with base system prompt without RAG context
    }

    // Convert UI messages to model messages
    // ✅ SHARED UTILITY: Filter out empty messages (caused by subsequent participant triggers)
    const nonEmptyMessages = filterNonEmptyMessages(typedMessages);

    if (nonEmptyMessages.length === 0) {
      console.error('[streamChatHandler] ❌ NO VALID MESSAGES', {
        threadId,
        participantIndex,
        originalMessageCount: typedMessages.length,
      });
      throw createError.badRequest('No valid messages to send to AI model');
    }

    // =========================================================================
    // STEP 6.4: ✅ VALIDATE MESSAGES WITH AI SDK validateUIMessages()
    // =========================================================================
    // OFFICIAL AI SDK PATTERN: Validate messages before conversion
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages-from-database
    //
    // Ensures:
    // - Message format compliance (UIMessage structure)
    // - Tool call structure validation (when tools are used)
    // - Data parts integrity (when custom data parts exist)
    //
    // This is CRITICAL for message persistence - prevents malformed messages
    // from corrupting the database or causing silent failures downstream.

    let validatedMessages: UIMessage[];
    try {
      validatedMessages = await validateUIMessages({
        messages: nonEmptyMessages,
        // tools: undefined, // Add when tool support is implemented
        // dataPartsSchema: undefined, // Add when custom data parts are used
        // metadataSchema: undefined, // Optional: Add for strict metadata validation
      });
    } catch (validationError) {
      console.error('[streamChatHandler] ❌ MESSAGE VALIDATION ERROR', {
        threadId,
        participantIndex,
        error: validationError instanceof Error ? validationError.message : String(validationError),
        nonEmptyMessageCount: nonEmptyMessages.length,
      });
      throw createError.badRequest('Invalid message format. Please refresh and try again.');
    }

    let modelMessages;
    try {
      modelMessages = convertToModelMessages(validatedMessages);
    } catch (conversionError) {
      console.error('[streamChatHandler] ❌ MESSAGE CONVERSION ERROR', {
        threadId,
        participantIndex,
        error: conversionError instanceof Error ? conversionError.message : String(conversionError),
        validatedMessageCount: validatedMessages.length,
      });
      throw createError.badRequest('Failed to convert messages for model');
    }

    // =========================================================================
    // STEP 6.5: ✅ VALIDATE MESSAGE HISTORY: Ensure last message is from user
    // =========================================================================
    // OpenRouter and most LLM APIs require conversations to end with a user message.
    // This validation prevents the "Last message cannot be from the assistant" error.
    //
    // WHY THIS HAPPENS:
    // - Frontend sends empty user messages to trigger subsequent participants
    // - Backend filters out empty user messages (line 2454)
    // - Result: Message history ends with assistant message → API rejects it
    //
    // FIX: If last message is from assistant, duplicate the last user message to ensure
    // proper conversation structure for multi-participant flows.
    const lastModelMessage = modelMessages[modelMessages.length - 1];
    if (!lastModelMessage || lastModelMessage.role !== 'user') {
      console.warn('[streamChatHandler] ⚠️ INVALID MESSAGE HISTORY: Last message must be from user', {
        threadId,
        participantIndex,
        lastMessageRole: lastModelMessage?.role,
        messageCount: modelMessages.length,
      });

      // Find the last user message to duplicate
      const lastUserMessage = nonEmptyMessages.findLast(m => m.role === 'user');
      if (!lastUserMessage) {
        console.error('[streamChatHandler] ❌ NO USER MESSAGE FOUND', {
          threadId,
          participantIndex,
          messageCount: nonEmptyMessages.length,
        });
        throw createError.badRequest('No valid user message found in conversation history');
      }

      // Extract text content from last user message
      const lastUserText = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
      if (!lastUserText || !('text' in lastUserText)) {
        console.error('[streamChatHandler] ❌ USER MESSAGE HAS NO TEXT', {
          threadId,
          participantIndex,
          messageId: lastUserMessage.id,
        });
        throw createError.badRequest('Last user message has no valid text content');
      }

      // Re-convert with the last user message duplicated at the end
      // This ensures the conversation structure is: [user, assistant, user, assistant, ..., user]
      modelMessages = convertToModelMessages([
        ...validatedMessages,
        {
          id: `user-continuation-${ulid()}`,
          role: 'user',
          parts: [{ type: 'text', text: lastUserText.text }],
        },
      ]);
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

    // ✅ STREAMING APPROACH: Direct streamText() without validation
    //
    // PHILOSOPHY:
    // - Stream responses immediately without pre-validation
    // - AI SDK built-in retry handles transient errors (network, rate limits)
    // - onFinish callback handles response-level errors (empty responses, content filters)
    // - No double API calls, no validation overhead, faster response times
    //
    // Parameters for streamText
    const streamParams = {
      model: client(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      ...(modelSupportsTemperature && { temperature: temperatureValue }),
      maxRetries: AI_RETRY_CONFIG.maxAttempts, // AI SDK handles retries
      abortSignal: AbortSignal.any([
        (c.req as unknown as { raw: Request }).raw.signal,
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
      ]),
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat.thread.${threadId}.participant.${participant.id}`,
      },
      // ✅ CONDITIONAL RETRY: Don't retry validation errors (400), authentication errors (401, 403)
      // These are permanent errors that won't be fixed by retrying
      shouldRetry: ({ error }: { error: unknown }) => {
        // Extract status code and error name from error
        const err = error as Error & { statusCode?: number; responseBody?: string; name?: string };
        const statusCode = err?.statusCode;
        const errorName = err?.name || '';

        // Don't retry AI SDK type validation errors - these are provider response format issues
        // that won't be fixed by retrying. The stream already partially succeeded.
        if (errorName === 'AI_TypeValidationError') {
          console.warn('[streamChatHandler] ⏭️ Skipping retry for AI SDK type validation error', {
            threadId,
            participantIndex,
            errorName,
            errorMessage: err?.message?.substring(0, 200), // Log first 200 chars
          });
          return false;
        }

        // Don't retry validation errors (400) - malformed requests
        if (statusCode === 400) {
          // Check for specific non-retryable error messages
          const errorMessage = err?.message || '';
          const responseBody = err?.responseBody || '';

          // Don't retry "Multi-turn conversations are not supported" errors
          if (errorMessage.includes('Multi-turn conversations are not supported')
            || responseBody.includes('Multi-turn conversations are not supported')) {
            console.warn('[streamChatHandler] ⏭️ Model does not support multi-turn conversations', {
              threadId,
              participantIndex,
              modelId: participant.modelId,
              errorMessage,
            });
            return false;
          }

          console.warn('[streamChatHandler] ⏭️ Skipping retry for validation error (400)', {
            threadId,
            participantIndex,
            statusCode,
            errorMessage,
          });
          return false;
        }

        // Don't retry authentication errors (401, 403) - requires API key fix
        if (statusCode === 401 || statusCode === 403) {
          console.warn('[streamChatHandler] ⏭️ Skipping retry for authentication error', {
            threadId,
            participantIndex,
            statusCode,
            errorMessage: err?.message,
          });
          return false;
        }

        // Don't retry model not found errors (404) - model doesn't exist
        if (statusCode === 404) {
          console.warn('[streamChatHandler] ⏭️ Skipping retry for not found error (404)', {
            threadId,
            participantIndex,
            statusCode,
            errorMessage: err?.message,
          });
          return false;
        }

        // Retry everything else (rate limits, network errors, etc.)
        return true;
      },
    };

    // ✅ REASONING CAPTURE: Accumulate reasoning deltas from stream
    // AI SDK streams reasoning in parts (reasoning-start, reasoning-delta, reasoning-end)
    // but doesn't include the full reasoning in finishResult for most models
    const reasoningDeltas: string[] = [];

    // =========================================================================
    // ✅ AI SDK V5 BUILT-IN RETRY LOGIC
    // =========================================================================
    // Use AI SDK's built-in retry mechanism instead of custom retry loop
    // Benefits:
    // 1. No duplicate messages on frontend (retries happen internally)
    // 2. Exponential backoff for transient errors
    // 3. Single stream to frontend (cleaner UX)
    // 4. Follows official AI SDK v5 patterns
    //
    // The AI SDK automatically retries:
    // - Network errors
    // - Rate limit errors (429)
    // - Server errors (500, 502, 503)
    //
    // It does NOT retry:
    // - Validation errors (400)
    // - Authentication errors (401, 403)
    // - Not found errors (404)
    // - Content policy violations
    //
    // Reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
    // =========================================================================

    // ✅ STREAM RESPONSE: Single stream with built-in AI SDK retry logic
    const finalResult = streamText({
      ...streamParams,

      // ✅ AI SDK V5 BUILT-IN RETRY: Configure retry behavior
      // maxRetries: Maximum number of automatic retries for transient errors
      // Default is 2, which gives us 3 total attempts (1 initial + 2 retries)
      maxRetries: AI_RETRY_CONFIG.maxAttempts - 1, // -1 because maxRetries doesn't count initial attempt

      onChunk: async ({ chunk }) => {
        if (chunk.type === 'reasoning-delta') {
          reasoningDeltas.push(chunk.text);
        }
      },

      // ✅ PERSIST MESSAGE: Save to database after streaming completes
      onFinish: async (finishResult) => {
        const { text, usage, finishReason, providerMetadata, response } = finishResult;

        // ✅ CRITICAL FIX: Extract reasoning from accumulated deltas first
        // Priority 1: Use accumulated reasoning deltas from stream chunks
        let reasoningText: string | null = reasoningDeltas.length > 0 ? reasoningDeltas.join('') : null;

        // ✅ FALLBACK 1: Extract reasoning from finishResult directly (for OpenAI o1/o3)
        // The AI SDK v5 provides reasoning in the finishResult for certain models
        const finishResultWithReasoning = finishResult as typeof finishResult & { reasoning?: string };
        if (!reasoningText) {
          reasoningText = (typeof finishResultWithReasoning.reasoning === 'string' ? finishResultWithReasoning.reasoning : null) || null;
        }

        // ✅ FALLBACK 2: If reasoning not in finishResult, try extracting from providerMetadata
        // This handles cases where providers include reasoning in metadata instead
        if (!reasoningText) {
          const extractReasoning = (metadata: unknown): string | null => {
            if (!metadata || typeof metadata !== 'object')
              return null;

            const meta = metadata as Record<string, unknown>;

            // Helper to safely navigate nested paths
            const getNested = (obj: unknown, path: string[]): unknown => {
              let current = obj;
              for (const key of path) {
                if (!current || typeof current !== 'object')
                  return undefined;
                current = (current as Record<string, unknown>)[key];
              }
              return current;
            };

            // Check all possible reasoning field locations
            const fields = [
              getNested(meta, ['openai', 'reasoning']), // OpenAI o1/o3
              meta.reasoning,
              meta.thinking,
              meta.thought,
              meta.thoughts,
              meta.chain_of_thought,
              meta.internal_reasoning,
              meta.scratchpad,
            ];

            for (const field of fields) {
              if (typeof field === 'string' && field.trim())
                return field.trim();
              if (field && typeof field === 'object') {
                const obj = field as Record<string, unknown>;
                if (typeof obj.content === 'string' && obj.content.trim())
                  return obj.content.trim();
                if (typeof obj.text === 'string' && obj.text.trim())
                  return obj.text.trim();
              }
            }
            return null;
          };

          reasoningText = extractReasoning(providerMetadata);
        }

        // ✅ CRITICAL ERROR HANDLING: Wrap DB operations in try-catch
        // This ensures that errors don't break the round - next participant can still respond
        try {
          // ✅ EXTRACT OPENROUTER ERROR DETAILS: Check providerMetadata and response for error information
          let openRouterError: string | undefined;
          let errorCategory: string | undefined;

          // Check providerMetadata for OpenRouter-specific errors
          if (providerMetadata && typeof providerMetadata === 'object') {
            const metadata = providerMetadata as Record<string, unknown>;
            if (metadata.error) {
              openRouterError = typeof metadata.error === 'string'
                ? metadata.error
                : JSON.stringify(metadata.error);
            }
            if (!openRouterError && metadata.errorMessage) {
              openRouterError = String(metadata.errorMessage);
            }
            // Check for moderation/content filter errors
            if (metadata.moderation || metadata.contentFilter) {
              errorCategory = 'content_filter';
              openRouterError = openRouterError || 'Content was filtered by safety systems';
            }
          }

          // Check response object for errors
          if (!openRouterError && response && typeof response === 'object') {
            const resp = response as Record<string, unknown>;
            if (resp.error) {
              openRouterError = typeof resp.error === 'string'
                ? resp.error
                : JSON.stringify(resp.error);
            }
          }

          // ✅ DETECT EMPTY RESPONSES: Check for provider-level empty responses
          // Note: Empty responses should have been filtered out by the retry loop
          // If we get here with an empty response, all retries were exhausted

          // ✅ VALID RESPONSE: Accept ANY response where the model generated tokens
          // According to AI SDK best practices: if the provider returns tokens without
          // throwing an exception, it's a valid response. Only check for truly empty
          // responses (0 tokens from provider).
          // Accept responses with 1+ tokens even if text content is minimal or empty.
          // NOTE: Refusal detection removed - optimized system prompts prevent refusals by design
          const outputTokens = usage?.outputTokens || 0;
          const isEmptyResponse = outputTokens === 0;

          // Generate comprehensive error message
          let errorMessage: string | undefined;
          let providerMessage: string | undefined;

          if (isEmptyResponse || openRouterError) {
            const outputTokens = usage?.outputTokens || 0;
            const inputTokens = usage?.inputTokens || 0;

            // Use OpenRouter error if available
            if (openRouterError) {
              providerMessage = openRouterError;
              errorMessage = `OpenRouter Error for ${participant.modelId}: ${openRouterError}`;

              // Categorize based on error content
              const errorLower = openRouterError.toLowerCase();
              if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
                errorCategory = 'model_not_found';
              } else if (errorLower.includes('filter') || errorLower.includes('safety') || errorLower.includes('moderation')) {
                errorCategory = 'content_filter';
              } else if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
                errorCategory = 'rate_limit';
              } else if (errorLower.includes('timeout') || errorLower.includes('connection')) {
                errorCategory = 'network';
              } else {
                errorCategory = errorCategory || 'provider_error';
              }
            } else if (outputTokens === 0) {
              // True provider empty response - 0 tokens generated
              // Provide context-aware error messages based on finish reason
              const baseStats = `Input: ${inputTokens} tokens, Output: 0 tokens, Status: ${finishReason}`;

              if (finishReason === 'stop') {
                // Model completed normally but returned no content - likely filtered or refused
                providerMessage = `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`;
                errorMessage = `${participant.modelId} returned empty response - possible content filtering or safety block`;
                errorCategory = 'content_filter';
              } else if (finishReason === 'length') {
                // Model hit token limit before generating anything
                providerMessage = `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`;
                errorMessage = `${participant.modelId} exceeded token limit without generating content`;
                errorCategory = 'provider_error';
              } else if (finishReason === 'content-filter') {
                // Explicit content filtering
                providerMessage = `Content was filtered by safety systems. ${baseStats}`;
                errorMessage = `${participant.modelId} blocked by content filter`;
                errorCategory = 'content_filter';
              } else if (finishReason === 'error' || finishReason === 'other') {
                // Provider error
                providerMessage = `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`;
                errorMessage = `${participant.modelId} encountered a provider error`;
                errorCategory = 'provider_error';
              } else {
                // Unknown/unexpected finish reason
                providerMessage = `Model returned empty response. ${baseStats}`;
                errorMessage = `${participant.modelId} returned empty response (reason: ${finishReason})`;
                errorCategory = 'empty_response';
              }
            }
            // Note: We no longer reject responses with tokens but minimal/empty text content.
            // If model generated 1+ tokens, it's considered a valid response even if text is empty.
          }

          // ✅ SAVE MESSAGE: Content and metadata to database
          const contentToSave = text || '';
          const hasError = isEmptyResponse || !!openRouterError;

          // ✅ DETERMINE IF ERROR IS TRANSIENT
          // Empty responses with finish_reason='stop' are usually NOT transient
          // (content filtering, safety, or model refusal - retrying won't help)
          // Only mark as transient for network/provider errors
          const isTransientError = hasError && (
            errorCategory === 'provider_error'
            || errorCategory === 'network'
            || errorCategory === 'rate_limit'
            || (errorCategory === 'empty_response' && finishReason !== 'stop')
          );

          // ✅ AI SDK v5 PATTERN: Build parts[] array with text and reasoning
          const parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }> = [];

          if (contentToSave) {
            parts.push({ type: 'text', text: contentToSave });
          }

          if (reasoningText) {
            parts.push({ type: 'reasoning', text: reasoningText });
          }

          // Ensure at least one part exists (empty text for error messages)
          if (parts.length === 0) {
            parts.push({ type: 'text', text: '' });
          }

          const [savedMessage] = await db.insert(tables.chatMessage)
            .values({
              id: ulid(),
              threadId,
              participantId: participant.id,
              role: 'assistant' as const,
              parts,
              roundNumber: currentRoundNumber,
              metadata: {
                model: participant.modelId,
                participantId: participant.id,
                participantIndex,
                participantRole: participant.role,
                usage,
                finishReason,
                hasError,
                errorType: errorCategory || (hasError ? 'empty_response' : undefined),
                errorMessage,
                providerMessage,
                openRouterError,
                isTransient: isTransientError,
                // ⚠️ retryAttempts removed - AI SDK handles retries internally, we don't track attempts
              },
              createdAt: new Date(),
            })
            .onConflictDoNothing()
            .returning();

          // ✅ RAG EMBEDDING STORAGE: Store message embedding for semantic search
          // Only store embeddings for successful messages (non-empty, no errors)
          if (savedMessage && !hasError && contentToSave.trim()) {
            try {
              await ragService.storeMessageEmbedding({
                message: savedMessage,
                threadId,
                userId: user.id,
                db,
              });

              console.warn('[streamChatHandler] 🔍 RAG embedding stored', {
                threadId,
                messageId: savedMessage.id,
                participantIndex,
              });
            } catch (error) {
              // Embedding storage failures should not break the chat flow
              console.error('[streamChatHandler] ⚠️ Failed to store RAG embedding', {
                threadId,
                messageId: savedMessage.id,
                participantIndex,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          await incrementMessageUsage(user.id, 1);

          // ✅ TRIGGER ANALYSIS: When last participant finishes AND all participants succeeded
          if (participantIndex === participants.length - 1 && savedMessage) {
            // ✅ CRITICAL FIX: Use the currentRoundNumber from outer scope (lines 1904-1950)
            // DO NOT recalculate it here - that would give wrong results for rounds > 1
            // The currentRoundNumber is already calculated based on user message count

            // ✅ VALIDATE ROUND: Check if all participants in this round succeeded
            // Query all messages for the current round to ensure none have errors
            const roundMessages = await db.query.chatMessage.findMany({
              where: and(
                eq(tables.chatMessage.threadId, threadId),
                eq(tables.chatMessage.roundNumber, currentRoundNumber),
              ),
              orderBy: [tables.chatMessage.createdAt],
            });

            // ✅ TYPE-SAFE ERROR CHECK: Use validated MessageMetadata type
            const messagesWithErrors = roundMessages.filter(msg =>
              MessageMetadataSchema.safeParse(msg.metadata).success
              && messageHasError(MessageMetadataSchema.parse(msg.metadata)),
            );
            const hasAnyError = messagesWithErrors.length > 0;

            if (hasAnyError) {
              console.warn('[streamChatHandler] ⚠️ Round has errors - skipping analysis', {
                threadId,
                participantIndex,
                roundNumber: currentRoundNumber,
                totalParticipants: participants.length,
                messagesInRound: roundMessages.length,
                errorCount: messagesWithErrors.length,
              });
            } else {
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

    // ✅ AI SDK V5 OFFICIAL PATTERN: Handle client disconnects
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#handling-client-disconnects
    // This ensures the stream runs to completion even if client disconnects (e.g., tab closed, network issue)
    // The onFinish callback will still save the message to the database
    finalResult.consumeStream(); // no await - runs in background

    // Return stream response
    return finalResult.toUIMessageStreamResponse({
      sendReasoning: true, // Stream reasoning for o1/o3/DeepSeek models

      // ✅ OFFICIAL PATTERN: Pass original messages for type-safe metadata
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
      originalMessages: typedMessages,

      // ✅ AI SDK V5 OFFICIAL PATTERN: Server-side message ID generation
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#message-ids
      // Ensures consistent IDs for database-backed persistence across client refreshes
      generateMessageId: createIdGenerator({
        prefix: 'msg',
        size: 16,
      }),

      onError: (error) => {
        // ✅ DEEPSEEK R1 WORKAROUND: Suppress logprobs validation errors
        // These are non-fatal errors from DeepSeek R1's non-conforming logprobs structure
        // Reference: https://github.com/vercel/ai/issues/9087
        const err = error as Error & { name?: string };
        if (err?.name === 'AI_TypeValidationError' && err?.message?.includes('logprobs')) {
          console.warn('[streamChatHandler] ⏭️ Suppressing non-fatal logprobs validation error', {
            threadId,
            participantIndex,
            modelId: participant.modelId,
            errorType: 'AI_TypeValidationError',
            isLogprobsError: true,
          });
          // Return empty string to indicate error was handled and stream should continue
          return '';
        }

        console.error('[streamChatHandler] STREAM_ERROR', {
          threadId,
          participantIndex,
          modelId: participant.modelId,
          error,
        });

        // ✅ REFACTORED: Use shared error utility from /src/api/common/error-handling.ts
        const errorMetadata = structureAIProviderError(error, {
          id: participant.id,
          modelId: participant.modelId,
          role: participant.role,
        });

        return JSON.stringify(errorMetadata);
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
// Moderator Analysis Helper Functions
// ============================================================================

/**
 * Generate Moderator Analysis using AI SDK streamObject()
 *
 * ✅ AI SDK v5 PATTERN: Uses streamObject() for real-time structured object streaming
 * ✅ CHEAP MODEL: Uses Claude 3.5 Sonnet (cost-effective for analysis)
 * ✅ STRUCTURED OUTPUT: Returns streaming object conforming to ModeratorAnalysisPayloadSchema
 * ✅ PERSISTENCE: Uses onFinish callback to persist without consuming stream
 *
 * Pattern follows analysis-background.service.ts:145,163
 *
 * @param config - Analysis configuration including round, mode, user question, responses, IDs, and env
 * @param config.analysisId - Database ID of the analysis record to update
 * @param config.threadId - Thread ID for logging
 * @param config.env - API environment with OpenRouter config
 * @returns StreamObject result
 */
function generateModeratorAnalysis(
  config: ModeratorPromptConfig & {
    env: ApiEnv['Bindings'];
    analysisId: string;
    threadId: string;
  },
) {
  const { roundNumber, mode, userQuestion, participantResponses, changelogEntries, env, analysisId, threadId } = config;

  // ✅ ESTABLISHED PATTERN: Initialize OpenRouter and get client
  // Reference: src/api/services/analysis-background.service.ts:144-145
  initializeOpenRouter(env);
  const client = openRouterService.getClient();

  // ✅ FIXED MODEL: Always use Claude 3.5 Sonnet for analysis
  const analysisModelId = 'anthropic/claude-3.5-sonnet';

  // Build prompts using service layer
  const systemPrompt = buildModeratorSystemPrompt({
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
    changelogEntries,
  });

  const userPrompt = buildModeratorUserPrompt({
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
    changelogEntries, // ✅ Pass changelog to understand what changed before this round
  });

  // ✅ AI SDK streamObject(): Stream structured analysis
  // Pattern follows analysis-background.service.ts:162-177
  return streamObject({
    model: client.chat(analysisModelId),
    schema: ModeratorAnalysisPayloadSchema,
    schemaName: 'ModeratorAnalysis',
    system: systemPrompt,
    prompt: userPrompt,
    mode: 'json', // Force JSON mode for better schema adherence
    temperature: 0.3, // Lower temperature for more consistent analysis

    // ✅ Telemetry for monitoring
    experimental_telemetry: {
      isEnabled: true,
      functionId: `moderator-analysis-round-${roundNumber}`,
    },

    // ✅ CRITICAL FIX: Use onFinish callback to persist completed analysis
    // This avoids consuming the stream separately, ensuring smooth progressive streaming to the frontend
    // The onFinish callback runs after streaming completes without interfering with the stream
    onFinish: async ({ object: finalObject, error: finishError }) => {
      if (finishError) {
        console.error('[generateModeratorAnalysis] ❌ Stream error:', finishError);
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.FAILED,
              errorMessage: finishError instanceof Error ? finishError.message : 'Unknown error',
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));
        } catch (dbError) {
          console.error('[generateModeratorAnalysis] ❌ Failed to update error status:', dbError);
        }
        return;
      }

      if (finalObject) {
        console.warn('[generateModeratorAnalysis] ✅ Persisting completed analysis', {
          analysisId,
          threadId,
          roundNumber,
        });
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.COMPLETED,
              analysisData: finalObject,
              completedAt: new Date(),
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));
        } catch (dbError) {
          console.error('[generateModeratorAnalysis] ❌ Failed to persist analysis:', dbError);
        }
      }
    },
  });
}

// ============================================================================
// Moderator Analysis Handler
// ============================================================================

/**
 * Analyze Conversation Round Handler
 *
 * ✅ AI SDK streamObject() Pattern: Real-time streaming of structured analysis
 * ✅ Official AI SDK v5 Pattern: Uses streamObject() with onFinish() callback to persist
 * ✅ Follows Existing Patterns: Similar to streamChatHandler but for structured objects
 * ✅ Cheap Model: Uses Claude 3.5 Sonnet for reliable structured output
 * ✅ Integrated Flow: Not a separate service, part of the chat system
 *
 * This handler:
 * 1. Fetches all participant messages for the round
 * 2. Checks for existing completed analysis (idempotency)
 * 3. Streams structured analysis object in real-time using streamObject()
 * 4. Persists final analysis to database via onFinish() callback
 *
 * Frontend Integration (AI SDK v5):
 * - Use experimental_useObject hook to consume stream
 * - Progressive rendering as object properties stream in
 * - On page refresh, use GET /analyses to fetch persisted data
 * - No polling needed - real-time streaming provides updates
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/stream-object
 */
export const analyzeRoundHandler: RouteHandler<typeof analyzeRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
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

    // ✅ REGENERATION FIX: Check for ALL existing analyses (not just first)
    // During regeneration, multiple analyses might exist for the same round
    const existingAnalyses = await db.query.chatModeratorAnalysis.findMany({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.roundNumber, roundNum),
        ),
      orderBy: [desc(tables.chatModeratorAnalysis.createdAt)], // Most recent first
    });

    // ✅ REGENERATION FIX: If multiple analyses exist, keep only the most recent completed one
    // Delete all others to prevent conflicts
    if (existingAnalyses.length > 1) {
      console.warn('[analyzeRoundHandler] ⚠️ Multiple analyses found for round - cleaning up', {
        threadId,
        roundNumber: roundNum,
        count: existingAnalyses.length,
      });

      // Find the most recent completed analysis (if any)
      const completedAnalysis = existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETED);

      // Delete all except the most recent completed
      const analysesToDelete = existingAnalyses.filter(a =>
        a.id !== completedAnalysis?.id,
      );

      if (analysesToDelete.length > 0) {
        console.warn('[analyzeRoundHandler] 🗑️ Deleting stale analyses', {
          count: analysesToDelete.length,
          ids: analysesToDelete.map(a => a.id),
        });

        for (const analysis of analysesToDelete) {
          await db.delete(tables.chatModeratorAnalysis)
            .where(eq(tables.chatModeratorAnalysis.id, analysis.id));
        }
      }
    }

    // Get the remaining analysis (if any)
    const existingAnalysis = existingAnalyses.length === 1
      ? existingAnalyses[0]
      : existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETED);

    if (existingAnalysis) {
      console.warn('[analyzeRoundHandler] 🔍 Existing analysis found', {
        analysisId: existingAnalysis.id,
        status: existingAnalysis.status,
        roundNumber: roundNum,
        ageMs: Date.now() - existingAnalysis.createdAt.getTime(),
      });

      // ✅ COMPLETED: Return existing analysis data (no streaming needed)
      if (existingAnalysis.status === AnalysisStatuses.COMPLETED && existingAnalysis.analysisData) {
        console.warn('[analyzeRoundHandler] ✅ Returning completed analysis', existingAnalysis.id);
        return Responses.ok(c, {
          object: {
            ...existingAnalysis.analysisData,
            mode: existingAnalysis.mode,
            roundNumber: existingAnalysis.roundNumber,
            userQuestion: existingAnalysis.userQuestion,
          },
        });
      }

      // ✅ STREAMING: Return 409 Conflict (analysis already in progress)
      // Frontend should use GET /analyses to poll for status, NOT retry POST
      if (existingAnalysis.status === AnalysisStatuses.STREAMING) {
        const ageMs = Date.now() - existingAnalysis.createdAt.getTime();

        console.warn('[analyzeRoundHandler] 🔄 Analysis already streaming, returning 409 Conflict', {
          analysisId: existingAnalysis.id,
          ageMs,
          threadId,
          roundNumber: roundNum,
        });

        // ✅ CRITICAL: Do NOT delete streaming analyses
        // The backend continues streaming in background even if client disconnects
        // Frontend should poll GET /analyses to check completion status
        throw createError.conflict(
          `Analysis is already being generated (age: ${Math.round(ageMs / 1000)}s). Please wait for it to complete.`,
          {
            errorType: 'resource',
            resource: 'moderator_analysis',
            resourceId: existingAnalysis.id,
          },
        );
      }

      // ✅ FAILED: Delete failed analysis to allow retry
      if (existingAnalysis.status === AnalysisStatuses.FAILED) {
        console.warn('[analyzeRoundHandler] 🔄 Deleting failed analysis to allow retry', existingAnalysis.id);
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }

      // ✅ PENDING: Delete immediately instead of trying to claim
      // This is safer during regeneration to prevent race conditions
      if (existingAnalysis.status === AnalysisStatuses.PENDING) {
        console.warn('[analyzeRoundHandler] ♻️ Deleting pending analysis to create fresh one', existingAnalysis.id);
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
        // Fall through to create new analysis
      }
    }

    // ✅ FIX: Auto-calculate participant messages if IDs not provided
    // Frontend may send temporary client IDs that don't match database IDs
    // Instead, query for the most recent N assistant messages where N = participant count
    type MessageWithParticipant = Awaited<ReturnType<typeof db.query.chatMessage.findMany>>[number] & {
      participant: NonNullable<Awaited<ReturnType<typeof db.query.chatParticipant.findFirst>>>;
    };
    let participantMessages: MessageWithParticipant[] | null = null;

    if (body.participantMessageIds && body.participantMessageIds.length > 0) {
      // ✅ OPTION 1: Use provided IDs (if valid database IDs)
      const messageIds = body.participantMessageIds;
      const foundMessages = await db.query.chatMessage.findMany({
        where: (fields, { inArray, eq: eqOp, and: andOp }) =>
          andOp(
            inArray(fields.id, messageIds),
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, 'assistant'),
          ),
        with: {
          participant: true,
        },
        orderBy: [tables.chatMessage.createdAt],
      });

      // ✅ FIX: If provided IDs don't match (client IDs), fall back to auto-query
      if (foundMessages.length === messageIds.length) {
        participantMessages = foundMessages as MessageWithParticipant[];
      } else {
        console.warn('[analyzeRoundHandler] ⚠️ Provided message IDs not found, auto-calculating', {
          providedIds: messageIds,
          foundCount: foundMessages.length,
          threadId,
          roundNumber: roundNum,
        });
      }
    }

    // ✅ OPTION 2: Auto-calculate messages (no IDs provided OR provided IDs were invalid)
    if (!participantMessages) {
      try {
        console.warn('[analyzeRoundHandler] 🔍 Auto-calculating participant messages for round', {
          threadId,
          roundNumber: roundNum,
        });

        // Get active participants for this thread
        const activeParticipants = await db.query.chatParticipant.findMany({
          where: (fields, { and: andOp, eq: eqOp }) =>
            andOp(
              eqOp(fields.threadId, threadId),
              eqOp(fields.isEnabled, true),
            ),
          orderBy: [tables.chatParticipant.priority],
        });

        const participantCount = activeParticipants.length;

        console.warn('[analyzeRoundHandler] 📊 Found active participants', {
          threadId,
          participantCount,
          participantIds: activeParticipants.map(p => p.id),
        });

        if (participantCount === 0) {
          throw createError.badRequest(
            'No active participants found for this thread',
            {
              errorType: 'validation',
              field: 'participants',
            },
          );
        }

        // ✅ CRITICAL FIX: Get messages for the SPECIFIC round, not just recent messages
        // Calculate which messages belong to this round based on chronological order
        const allAssistantMessages = await db.query.chatMessage.findMany({
          where: (fields, { and: andOp, eq: eqOp }) =>
            andOp(
              eqOp(fields.threadId, threadId),
              eqOp(fields.role, 'assistant'),
            ),
          with: {
            participant: true,
          },
          orderBy: [asc(tables.chatMessage.createdAt)], // Oldest first for round calculation
        });

        console.warn('[analyzeRoundHandler] 📝 Queried all assistant messages', {
          threadId,
          totalMessages: allAssistantMessages.length,
          participantCount,
          requestedRound: roundNum,
        });

        // ✅ Extract messages for the requested round
        // Round 1: messages 0 to (participantCount - 1)
        // Round 2: messages participantCount to (2 * participantCount - 1)
        // Round N: messages (N-1)*participantCount to (N * participantCount - 1)
        const roundStartIndex = (roundNum - 1) * participantCount;
        const roundEndIndex = roundNum * participantCount;
        const roundMessages = allAssistantMessages.slice(roundStartIndex, roundEndIndex);

        console.warn('[analyzeRoundHandler] 🎯 Extracted messages for specific round', {
          threadId,
          roundNumber: roundNum,
          roundStartIndex,
          roundEndIndex,
          extractedCount: roundMessages.length,
          expectedCount: participantCount,
          messageIds: roundMessages.map(m => m.id),
        });

        if (roundMessages.length === 0) {
          throw createError.badRequest(
            `No messages found for round ${roundNum}. This round may not exist yet.`,
            {
              errorType: 'validation',
              field: 'roundNumber',
            },
          );
        }

        if (roundMessages.length < participantCount) {
          console.warn('[analyzeRoundHandler] ⚠️ Incomplete round - fewer messages than participants', {
            threadId,
            roundNumber: roundNum,
            found: roundMessages.length,
            expected: participantCount,
          });
        }

        participantMessages = roundMessages as MessageWithParticipant[];

        console.warn('[analyzeRoundHandler] ✅ Auto-calculated participant messages for round', {
          threadId,
          roundNumber: roundNum,
          participantCount,
          foundMessages: participantMessages.length,
          messageIds: participantMessages.map(m => m.id),
        });
      } catch (autoCalcError) {
        console.error('[analyzeRoundHandler] ❌ Auto-calculation failed:', {
          error: autoCalcError instanceof Error ? autoCalcError.message : String(autoCalcError),
          stack: autoCalcError instanceof Error ? autoCalcError.stack : undefined,
          threadId,
          roundNumber: roundNum,
        });
        throw autoCalcError;
      }
    }

    // ✅ Final validation: Ensure we have messages to analyze
    if (participantMessages.length === 0) {
      throw createError.badRequest(
        'No participant messages found for analysis',
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

    // Find the user's question for THIS specific round
    const userMessages = await db.query.chatMessage.findMany({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, 'user'),
        ),
      orderBy: [desc(tables.chatMessage.createdAt)],
      limit: 10,
    });

    const earliestParticipantTime = Math.min(...participantMessages.map(m => m.createdAt.getTime()));
    const relevantUserMessage = userMessages.find(
      m => m.createdAt.getTime() < earliestParticipantTime,
    );

    const userQuestion = relevantUserMessage ? extractTextFromParts(relevantUserMessage.parts) : 'N/A';

    // ✅ Get changelog entries that occurred BEFORE this round started
    // This shows what changed between previous round and current round (participant changes, mode changes, role changes)
    const changelogEntries = await db.query.chatThreadChangelog.findMany({
      where: (fields, { and: andOp, eq: eqOp, lte: lteOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          lteOp(fields.createdAt, new Date(earliestParticipantTime)),
        ),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      limit: 20, // Get recent changelog entries before this round
    });

    console.warn('[analyzeRoundHandler] 📋 Fetched changelog entries before round', {
      threadId,
      roundNumber: roundNum,
      changelogCount: changelogEntries.length,
      changes: changelogEntries.map(c => ({
        type: c.changeType,
        summary: c.changeSummary,
        createdAt: c.createdAt,
      })),
    });

    // Build participant response data for THIS round only
    const participantResponses = participantMessages.map((msg, index) => {
      const participant = msg.participant!;
      const modelName = extractModeratorModelName(participant.modelId);

      return {
        participantIndex: index,
        participantRole: participant.role,
        modelId: participant.modelId,
        modelName,
        responseContent: extractTextFromParts(msg.parts),
      };
    });

    // ✅ Create analysis record with 'streaming' status
    const analysisId = ulid();
    console.warn('[analyzeRoundHandler] 🆕 Creating analysis record for streaming', {
      analysisId,
      threadId,
      roundNumber: roundNum,
      participantCount: participantMessages.length,
    });

    await db.insert(tables.chatModeratorAnalysis).values({
      id: analysisId,
      threadId,
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: participantMessages.map(m => m.id),
      createdAt: new Date(),
    });

    // ✅ AI SDK streamObject(): Stream structured analysis in real-time
    // ✅ CRITICAL FIX: Persistence handled by onFinish callback in generateModeratorAnalysis
    // ✅ ROUND-SPECIFIC ANALYSIS: Only analyzes current round with changelog context
    // This ensures the stream is NOT consumed separately, allowing smooth progressive updates to the frontend
    const result = generateModeratorAnalysis({
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      participantResponses,
      changelogEntries: changelogEntries.map(c => ({
        changeType: c.changeType,
        description: c.changeSummary,
        metadata: c.changeData as Record<string, unknown> | null,
        createdAt: c.createdAt,
      })), // ✅ Pass changelog to understand what changed before this round
      analysisId, // Pass ID for onFinish callback persistence
      threadId, // Pass for logging
      env: c.env,
    });

    console.warn('[analyzeRoundHandler] 🌊 Streaming analysis', {
      analysisId,
      threadId,
      roundNumber: roundNum,
    });

    // ✅ Return streaming response (Content-Type: text/plain; charset=utf-8)
    // The stream will flow directly to the frontend for progressive rendering
    // ✅ CRITICAL: streamObject() onFinish callback persists to database even if client disconnects
    // Unlike streamText(), streamObject() doesn't have consumeStream() but the onFinish callback
    // will still execute when the stream completes, ensuring analysis is persisted
    return result.toTextStreamResponse();
  },
);

/**
 * Background Analysis Processing Handler (Internal Only)
 *
 * DEPRECATED: No longer used - using streaming with onFinish callback instead
 * Background analysis service removed - all analysis now done via real-time streaming
 *
 * POST /chat/analyze-background (internal)
 */
// eslint-disable-next-line ts/no-explicit-any -- Generic Hono context type for internal handler
export async function analyzeBackgroundHandler(c: any): Promise<Response> {
  console.warn('[analyzeBackgroundHandler] ⚠️ DEPRECATED: This handler should not be called. Using streaming with onFinish callback instead.');
  return Responses.customResponse(
    c,
    {
      success: false,
      error: 'This endpoint is deprecated. Analysis is now done via real-time streaming.',
    },
    410, // 410 Gone - resource no longer available
  );
}

/**
 * Get Thread Analyses Handler
 *
 * ✅ Fetches all persisted moderator analyses for a thread
 * ✅ Returns analyses ordered by round number
 * ✅ Deduplicates analyses by round number (returns latest for each round)
 * ✅ NO WATCHDOG: Analyses are handled by streaming with onFinish callback only
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

    // ✅ CLEANUP ORPHANED ANALYSES: Mark stuck streaming analyses as failed
    // This handles cases where streaming was interrupted (page refresh, connection lost)
    // and the onFinish callback never ran to update the status
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    const now = Date.now();
    const orphanedAnalyses = allAnalyses.filter((analysis) => {
      if (analysis.status !== AnalysisStatuses.STREAMING && analysis.status !== AnalysisStatuses.PENDING)
        return false;

      const ageMs = now - analysis.createdAt.getTime();
      return ageMs > TWO_MINUTES_MS;
    });

    if (orphanedAnalyses.length > 0) {
      console.warn('[getThreadAnalysesHandler] 🧹 Cleaning up orphaned analyses', {
        threadId,
        count: orphanedAnalyses.length,
        analyses: orphanedAnalyses.map(a => ({
          id: a.id,
          roundNumber: a.roundNumber,
          status: a.status,
          ageMs: now - a.createdAt.getTime(),
        })),
      });

      // Mark all orphaned analyses as failed
      for (const analysis of orphanedAnalyses) {
        await db.update(tables.chatModeratorAnalysis)
          .set({
            status: AnalysisStatuses.FAILED,
            errorMessage: 'Analysis timed out after 2 minutes. This may have been caused by a page refresh or connection issue during streaming.',
          })
          .where(eq(tables.chatModeratorAnalysis.id, analysis.id));
      }

      // Refetch analyses after cleanup to get updated statuses
      const updatedAnalyses = await db.query.chatModeratorAnalysis.findMany({
        where: eq(tables.chatModeratorAnalysis.threadId, threadId),
        orderBy: [desc(tables.chatModeratorAnalysis.roundNumber), desc(tables.chatModeratorAnalysis.createdAt)],
      });

      // Use updated analyses for deduplication
      const analysesMap = new Map<number, typeof updatedAnalyses[0]>();
      for (const analysis of updatedAnalyses) {
        if (!analysesMap.has(analysis.roundNumber)) {
          analysesMap.set(analysis.roundNumber, analysis);
        }
      }

      // Convert back to array and sort by round number ascending
      const analyses = Array.from(analysesMap.values())
        .sort((a, b) => a.roundNumber - b.roundNumber);

      return Responses.collection(c, analyses);
    }

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
