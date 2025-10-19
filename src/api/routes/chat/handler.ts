import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { consumeStream, convertToModelMessages, generateText, streamText, validateUIMessages } from 'ai';
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
  messageHasError,
  MessageMetadataSchema,
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
 * ✅ OPENROUTER PROVIDER ERROR HANDLING: Extract comprehensive error details
 * Reference: https://openrouter.ai/docs#errors
 *
 * OpenRouter returns errors in multiple formats:
 * 1. Standard HTTP errors with JSON body: { error: { message, code, metadata } }
 * 2. AI SDK errors with responseBody containing OpenRouter JSON
 * 3. Model-specific errors from underlying providers
 *
 * @param error - Error from AI SDK (unknown type for safety)
 * @param participant - Participant information for context
 * @param participant.id - Unique identifier for the participant
 * @param participant.modelId - Model ID being used (e.g., "anthropic/claude-3.5-sonnet")
 * @param participant.role - Role description of the participant (nullable)
 * @returns Comprehensive structured error metadata
 */
function structureErrorMetadata(error: unknown, participant: { id: string; modelId: string; role: string | null }) {
  // ✅ STEP 1: Extract base error fields from AI SDK error object
  const err = error as Error & {
    cause?: unknown;
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    code?: string;
    data?: unknown;
  };

  const errorName = err?.name || 'UnknownError';
  let errorMessage = err?.message || 'An unexpected error occurred';
  const errorType = err?.constructor?.name || 'Error';
  const statusCode = err?.statusCode;
  const responseBody = err?.responseBody;
  const responseHeaders = err?.responseHeaders;
  const cause = err?.cause;

  // ✅ STEP 2: Parse OpenRouter-specific error from response body (JSON format)
  let openRouterError: {
    message?: string;
    code?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  } | null = null;

  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      // OpenRouter standard error format: { error: { message, code, metadata } }
      if (parsed.error) {
        openRouterError = {
          message: parsed.error.message || parsed.error,
          code: parsed.error.code,
          type: parsed.error.type,
          metadata: parsed.error.metadata,
        };
        // Override error message with OpenRouter's detailed message
        if (openRouterError.message) {
          errorMessage = String(openRouterError.message);
        }
      } else if (parsed.message) {
        // Alternative format: { message, error }
        openRouterError = {
          message: parsed.message,
          code: parsed.code,
        };
        errorMessage = parsed.message;
      }
    } catch {
      // responseBody is not JSON - may be plain text error
      if (responseBody.length > 0 && responseBody.length < 500) {
        errorMessage = responseBody;
      }
    }
  }

  // ✅ STEP 3: Categorize error and determine retry strategy
  //
  // RETRY STRATEGY:
  // - Provider errors (rate_limit, network, service_unavailable): INFINITE_RETRY_CONFIG (aggressive)
  // - Model errors (content_filter, model_not_found, validation): NO RETRY or very limited (fail fast)
  // - Authentication errors: NO RETRY (permanent - requires user action)
  //
  let errorCategory: 'provider_rate_limit' | 'provider_network' | 'provider_service' | 'model_not_found' | 'model_content_filter' | 'authentication' | 'validation' | 'unknown' = 'unknown';
  let userFriendlyMessage: string;
  let errorIsTransient: boolean;
  let shouldRetry: boolean; // Explicitly control retry behavior

  const errorLower = errorMessage.toLowerCase();
  const openRouterCode = openRouterError?.code ? String(openRouterError.code).toLowerCase() : undefined;

  // ========================================
  // PROVIDER-LEVEL ERRORS (retry aggressively with INFINITE_RETRY_CONFIG)
  // ========================================

  // ✅ PROVIDER: RATE LIMITING (transient - retry indefinitely)
  if (
    statusCode === 429
    || openRouterCode === 'rate_limit_exceeded'
    || errorLower.includes('rate limit')
    || errorLower.includes('quota')
    || errorLower.includes('too many requests')
  ) {
    errorCategory = 'provider_rate_limit';
    errorIsTransient = true;
    shouldRetry = true; // Use INFINITE_RETRY_CONFIG
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  } else if (
    // ✅ PROVIDER: NETWORK/CONNECTIVITY (transient - retry indefinitely)
    statusCode === 502
    || statusCode === 503
    || statusCode === 504
    || openRouterCode === 'service_unavailable'
    || openRouterCode === 'timeout'
    || errorLower.includes('timeout')
    || errorLower.includes('connection')
    || errorLower.includes('network')
    || errorLower.includes('econnrefused')
    || errorLower.includes('dns')
    || errorLower.includes('service unavailable')
    || errorLower.includes('gateway')
  ) {
    errorCategory = 'provider_network';
    errorIsTransient = true;
    shouldRetry = true; // Use INFINITE_RETRY_CONFIG
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  } else if (
    // ========================================
    // MODEL-LEVEL ERRORS (fail fast - don't retry or very limited)
    // ========================================
    // ✅ MODEL: NOT FOUND / NO ENDPOINTS (permanent - don't retry)
    statusCode === 404
    || openRouterCode === 'model_not_found'
    || openRouterCode === 'no_endpoints'
    || errorLower.includes('model not found')
    || errorLower.includes('does not exist')
    || errorLower.includes('no endpoints found')
    || errorLower.includes('model is not available')
    || errorLower.includes('model does not support')
  ) {
    errorCategory = 'model_not_found';
    errorIsTransient = false;
    shouldRetry = false; // Don't retry - model permanently unavailable
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  } else if (
    // ✅ MODEL: CONTENT FILTERING / SAFETY (permanent - don't retry)
    errorLower.includes('content')
    || errorLower.includes('filter')
    || errorLower.includes('safety')
    || errorLower.includes('moderation')
    || errorLower.includes('policy')
    || errorLower.includes('inappropriate')
  ) {
    errorCategory = 'model_content_filter';
    errorIsTransient = false;
    shouldRetry = false; // Don't retry - content violates guidelines
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  } else if (
    // ========================================
    // AUTHENTICATION & VALIDATION ERRORS (permanent - don't retry)
    // ========================================
    // ✅ AUTHENTICATION ERRORS (permanent - requires user action)
    statusCode === 401
    || statusCode === 403
    || openRouterCode === 'unauthorized'
    || openRouterCode === 'forbidden'
    || errorLower.includes('invalid api key')
    || errorLower.includes('unauthorized')
    || errorLower.includes('api key')
    || errorLower.includes('authentication')
  ) {
    errorCategory = 'authentication';
    errorIsTransient = false;
    shouldRetry = false; // Don't retry - requires API key fix
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  } else if (
    // ✅ VALIDATION ERRORS (permanent - bad request)
    statusCode === 400
    || openRouterCode === 'invalid_request'
    || errorLower.includes('invalid')
    || errorLower.includes('malformed')
    || errorLower.includes('bad request')
  ) {
    errorCategory = 'validation';
    errorIsTransient = false;
    shouldRetry = false; // Don't retry - request is malformed
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  } else {
    // ========================================
    // UNKNOWN ERRORS (cautious retry)
    // ========================================
    // ✅ UNKNOWN ERRORS (assume transient but log for investigation)
    errorCategory = 'unknown';
    errorIsTransient = true;
    shouldRetry = true; // Retry but monitor
    userFriendlyMessage = errorMessage; // ✅ RAW ERROR: Show exact OpenRouter error message
  }

  // ✅ STEP 4: Extract OpenRouter request/response IDs for debugging
  const requestId = responseHeaders?.['x-request-id'] || responseHeaders?.['x-trace-id'];

  // ✅ STEP 5: Return comprehensive metadata
  return {
    // Error identification
    errorName,
    errorType,
    errorCategory,

    // User-facing message
    errorMessage: userFriendlyMessage,

    // OpenRouter-specific details
    openRouterError: openRouterError?.message,
    openRouterCode: openRouterError?.code,
    openRouterType: openRouterError?.type,
    openRouterMetadata: openRouterError?.metadata,

    // HTTP details
    statusCode,
    requestId,

    // Technical details for debugging
    rawErrorMessage: errorMessage,
    responseBody: responseBody?.substring(0, 1000), // Limit to 1000 chars
    cause: cause ? String(cause) : undefined,

    // Retry decision
    isTransient: errorIsTransient,
    shouldRetry, // ✅ EXPLICIT: Whether to retry (uses INFINITE_RETRY_CONFIG for provider errors)

    // Participant context
    participantId: participant.id,
    participantRole: participant.role,
    modelId: participant.modelId,
  };
}

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
    const { messages, id: threadId, participantIndex, participants: providedParticipants, regenerateRound } = c.validated.body;

    console.warn('[streamChatHandler] 🚀 REQUEST START', {
      threadId,
      participantIndex,
      userId: user.id,
      messageCount: messages?.length || 0,
      hasProvidedParticipants: !!providedParticipants,
      regenerateRound,
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

        console.warn('[streamChatHandler] ♻️ Round regeneration complete', {
          threadId,
          regenerateRound,
          messagesDeleted: deletedMessages.length,
          analysesDeleted: deletedAnalyses.length,
        });
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

    // ✅ ARCHITECTURAL FIX: Use generateText for validation, streamText for response
    //
    // PREVIOUS BUG: Code validated one stream, then created a FRESH stream that could return
    // completely different content (e.g., refusal instead of valid response). This fresh stream
    // bypassed all retry logic.
    //
    // NEW APPROACH:
    // 1. Use generateText (non-streaming) in retry loop for fast validation
    // 2. Once validated, immediately use streamText (streaming) to send to user
    // 3. Both calls use identical parameters and happen milliseconds apart
    // 4. Much less likely to get different content than old "consume then fresh stream" approach
    //
    const MAX_TOTAL_RETRIES = 10; // Maximum 10 attempts per model
    let totalAttempts = 0;
    let lastError: Error | null = null;
    let validatedSuccessfully = false;

    // Common parameters for both generateText and streamText
    const commonParams = {
      model: client(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      ...(modelSupportsTemperature && { temperature: temperatureValue }),
      maxRetries: AI_RETRY_CONFIG.maxAttempts,
      abortSignal: AbortSignal.any([
        (c.req as unknown as { raw: Request }).raw.signal,
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
      ]),
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat.thread.${threadId}.participant.${participant.id}`,
      },
    };

    // ✅ RETRY LOOP: Use NON-STREAMING generateText for validation
    // This is fast and doesn't consume a stream we need to return to user
    while (totalAttempts < MAX_TOTAL_RETRIES) {
      totalAttempts++;

      console.warn(totalAttempts === 1
        ? '[streamChatHandler] 🚀 Starting validation attempt'
        : '[streamChatHandler] 🔄 Retrying validation', {
        threadId,
        participantIndex,
        participantId: participant.id,
        modelId: participant.modelId,
        modelRole: participant.role,
        attempt: totalAttempts,
        maxAttempts: MAX_TOTAL_RETRIES,
        ...(lastError && { lastError: lastError.message }),
      });

      try {
        // ✅ USE GENERATETEXT: Non-streaming, fast validation
        const validationResult = await generateText(commonParams);

        const text = validationResult.text;
        const usage = validationResult.usage;

        // ✅ CONTENT VALIDATION: Same comprehensive checks as before
        const MIN_CONTENT_LENGTH = 50;
        const trimmedText = (text || '').trim();
        const combinedLength = trimmedText.length;

        // ✅ DETECT REFUSAL PATTERNS
        const refusalPatterns = [
          /^i\s+(cannot|can't|am unable to|apologize|must decline)/i,
          /^sorry,?\s+i\s+(cannot|can't|am unable to)/i,
          /^(unfortunately|regrettably),?\s+i\s+(cannot|can't)/i,
          /i'm\s+(not able to|unable to|sorry)/i,
        ];
        const containsRefusal = refusalPatterns.some(pattern => pattern.test(trimmedText));

        // ✅ COMPREHENSIVE VALIDATION
        const hasInsufficientContent = !trimmedText
          || combinedLength === 0
          || combinedLength < MIN_CONTENT_LENGTH
          || usage.totalTokens === 0
          || containsRefusal;

        console.warn('[streamChatHandler] 📊 Validation result', {
          threadId,
          participantIndex,
          modelId: participant.modelId,
          attempt: totalAttempts,
          totalTokens: usage.totalTokens,
          textLength: text?.length || 0,
          trimmedLength: combinedLength,
          hasInsufficientContent,
          containsRefusal,
          minRequired: MIN_CONTENT_LENGTH,
        });

        if (!hasInsufficientContent) {
          // ✅ SUCCESS: Valid response
          console.warn('[streamChatHandler] ✅ Valid response - will stream to user', {
            threadId,
            participantIndex,
            modelId: participant.modelId,
            attempt: totalAttempts,
            textLength: text.length,
            totalTokens: usage.totalTokens,
          });

          validatedSuccessfully = true;
          lastError = null; // Clear any previous errors
          break; // Exit retry loop
        }

        // ✅ INSUFFICIENT RESPONSE: Determine reason and retry
        const retryReason = containsRefusal
          ? 'model_refusal'
          : combinedLength === 0
            ? 'empty_response'
            : combinedLength < MIN_CONTENT_LENGTH
              ? 'insufficient_content'
              : 'no_tokens';

        // Create error for this attempt
        lastError = new Error(`${retryReason}: ${text.substring(0, 100)}`);

        console.warn('[streamChatHandler] ⚠️ Insufficient response - will retry', {
          threadId,
          participantIndex,
          modelId: participant.modelId,
          attempt: totalAttempts,
          remainingAttempts: MAX_TOTAL_RETRIES - totalAttempts,
          reason: retryReason,
          contentLength: combinedLength,
          minRequired: MIN_CONTENT_LENGTH,
          totalTokens: usage.totalTokens,
          preview: text.substring(0, 100),
        });

        // Don't retry if we've exhausted attempts
        if (totalAttempts >= MAX_TOTAL_RETRIES) {
          console.error('[streamChatHandler] ❌ Max retries exceeded', {
            threadId,
            participantIndex,
            modelId: participant.modelId,
            totalAttempts,
            lastReason: retryReason,
          });
          break;
        }

        // Delay before retry to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        // ✅ CATCH ALL ERRORS: Network, API, validation, etc.
        lastError = error instanceof Error ? error : new Error(String(error));

        console.warn('[streamChatHandler] ❌ Error during validation - will retry', {
          threadId,
          participantIndex,
          modelId: participant.modelId,
          attempt: totalAttempts,
          remainingAttempts: MAX_TOTAL_RETRIES - totalAttempts,
          errorType: lastError.name,
          errorMessage: lastError.message,
        });

        // Don't retry if we've exhausted attempts
        if (totalAttempts >= MAX_TOTAL_RETRIES) {
          console.error('[streamChatHandler] ❌ Max retries exceeded', {
            threadId,
            participantIndex,
            modelId: participant.modelId,
            totalAttempts,
            lastError: lastError.message,
          });
          break;
        }

        // Delay before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // ✅ CHECK IF VALIDATION FAILED: If so, throw error to frontend
    if (!validatedSuccessfully) {
      console.error('[streamChatHandler] ❌ All retries failed - returning error', {
        threadId,
        participantIndex,
        modelId: participant.modelId,
        totalAttempts,
        errorMessage: lastError?.message || 'Unknown error',
      });

      const errorMetadata = {
        errorCategory: 'max_retries_exceeded',
        errorMessage: `Model ${participant.modelId} failed after ${totalAttempts} attempts: ${lastError?.message || 'All attempts returned insufficient content'}`,
        rawErrorMessage: lastError?.message || 'All attempts returned insufficient content',
        errorType: lastError?.name || 'ValidationError',
        participantId: participant.id,
        participantIndex,
        modelId: participant.modelId,
        retryCount: totalAttempts,
        maxRetries: MAX_TOTAL_RETRIES,
        isTransient: false,
      };

      throw new Error(JSON.stringify(errorMetadata));
    }

    // ✅ NOW STREAM THE VALIDATED RESPONSE TO USER
    // Use streamText with IDENTICAL parameters to what was just validated
    // This happens milliseconds after validation, so should return same/similar content
    console.warn('[streamChatHandler] 📤 Streaming validated response to user', {
      threadId,
      participantIndex,
      modelId: participant.modelId,
      attemptsNeeded: totalAttempts,
    });

    const finalResult = streamText({
      ...commonParams,

      // ✅ PERSIST MESSAGE: Save to database after streaming completes
      onFinish: async (finishResult) => {
        const { text, usage, finishReason, providerMetadata, response } = finishResult;

        // ✅ REASONING BUNDLE SUPPORT: Extract reasoning/thinking content from ANY provider
        // Helper function to extract reasoning from various metadata formats
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

        const reasoningText = extractReasoning(providerMetadata);

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

          // ✅ DETECT EMPTY RESPONSES: Check for meaningful content in BOTH text and reasoning
          // Note: Empty responses should have been filtered out by the retry loop
          // If we get here with an empty response, all retries were exhausted
          const trimmedText = (text || '').trim();
          const trimmedReasoning = (reasoningText || '').trim();

          // ✅ REASONING BUNDLE SUPPORT: Consider reasoning content as valid output
          // Some models (o1, o3, DeepSeek-R1, Alibaba DeepResearch) return reasoning bundles
          // where the main content is in the reasoning field, not the text field
          const combinedContent = trimmedText || trimmedReasoning;
          const combinedLength = trimmedText.length + trimmedReasoning.length;

          // ✅ STRICTER CHECK: Require meaningful content (at least 50 characters)
          // This prevents models that return minimal/useless responses from passing
          // Rationale: A substantive response in a conversation needs at least a few sentences
          const MIN_CONTENT_LENGTH = 50;

          // ✅ DETECT REFUSAL PATTERNS: Common phrases indicating model refused to respond
          // Only check main text field - reasoning field typically doesn't contain refusals
          const refusalPatterns = [
            /^i\s+(cannot|can't|am unable to|apologize|must decline)/i,
            /^sorry,?\s+i\s+(cannot|can't|am unable to)/i,
            /^(unfortunately|regrettably),?\s+i\s+(cannot|can't)/i,
            /i'm\s+(not able to|unable to|sorry)/i,
          ];
          const containsRefusal = refusalPatterns.some(pattern => pattern.test(trimmedText));

          // ✅ VALID RESPONSE: Has meaningful content in EITHER text OR reasoning field
          const isEmptyResponse = !combinedContent
            || combinedLength === 0
            || combinedLength < MIN_CONTENT_LENGTH
            || usage?.outputTokens === 0
            || containsRefusal;

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
              // Model refused to respond - no OpenRouter error but empty output
              // ✅ SHOW RAW ERROR: Use exact status/metadata from response, not generic message
              providerMessage = `Model returned empty response. Input: ${inputTokens} tokens, Output: 0 tokens, Status: ${finishReason}`;
              errorMessage = providerMessage; // Show exact same message to user - no generic text
              errorCategory = errorCategory || 'empty_response';
            } else if (containsRefusal) {
              // Model explicitly refused to respond
              providerMessage = `Model refused to respond: "${trimmedText.substring(0, 100)}${trimmedText.length > 100 ? '...' : ''}". Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, Status: ${finishReason}`;
              errorMessage = providerMessage;
              errorCategory = 'refusal';
            } else if (combinedLength < MIN_CONTENT_LENGTH) {
              // Response is too short to be useful
              // ✅ REASONING BUNDLE SUPPORT: Report which field(s) had content
              const contentBreakdown = trimmedText.length > 0 && trimmedReasoning.length > 0
                ? `text: ${trimmedText.length} chars, reasoning: ${trimmedReasoning.length} chars`
                : trimmedText.length > 0
                  ? `text only: ${trimmedText.length} chars`
                  : trimmedReasoning.length > 0
                    ? `reasoning only: ${trimmedReasoning.length} chars`
                    : 'no content';

              providerMessage = `Model returned insufficient content (${combinedLength} characters total [${contentBreakdown}], minimum ${MIN_CONTENT_LENGTH} required). Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, Status: ${finishReason}`;
              errorMessage = providerMessage;
              errorCategory = 'empty_response';
            } else {
              // Rare case: has some tokens but no useful text
              providerMessage = `Model returned ${outputTokens} token(s) but no text. Input: ${inputTokens} tokens, Status: ${finishReason}`;
              errorMessage = providerMessage; // Show exact same message to user - no generic text
              errorCategory = 'empty_response';
            }
          }

          // ✅ SAVE MESSAGE: Content and metadata to database
          const contentToSave = text || '';
          const hasError = isEmptyResponse || !!openRouterError;

          const [savedMessage] = await db.insert(tables.chatMessage)
            .values({
              id: ulid(),
              threadId,
              participantId: participant.id,
              role: 'assistant' as const,
              content: contentToSave,
              reasoning: reasoningText,
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
                isTransient: hasError,
                // ✅ Include retry attempt count for debugging
                retryAttempts: totalAttempts,
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

          // ✅ TRIGGER ANALYSIS: When last participant finishes AND all participants succeeded
          if (participantIndex === participants.length - 1 && savedMessage) {
            const currentRoundNumber = Math.ceil((participantIndex + 1) / participants.length);

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
              console.warn('[streamChatHandler] 🎯 Last participant finished - triggering analysis', {
                threadId,
                participantIndex,
                roundNumber: currentRoundNumber,
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
      retriesPerformed: totalAttempts - 1, // -1 because first attempt isn't a retry
    });

    return finalResult.toUIMessageStreamResponse({
      sendReasoning: true, // Stream reasoning for o1/o3/DeepSeek models

      // ✅ OFFICIAL PATTERN: Pass original messages for type-safe metadata
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
      originalMessages: typedMessages,

      // ✅ OFFICIAL PATTERN: Required for proper abort handling
      // Reference: https://sdk.vercel.ai/docs/09-troubleshooting/14-stream-abort-handling
      // Without this, onFinish callback may not fire when stream is aborted
      consumeSseStream: consumeStream,

      onError: (error) => {
        // ✅ OPENROUTER PROVIDER ERROR HANDLING: Extract comprehensive error details
        const errorMetadata = structureErrorMetadata(error, participant);

        // ✅ ESSENTIAL PROVIDER ERROR LOGGING: Log structured OpenRouter error
        console.error('[streamChatHandler] ❌ OpenRouter Error', {
          threadId,
          participantIndex,
          category: errorMetadata.errorCategory,
          isTransient: errorMetadata.isTransient,
          modelId: errorMetadata.modelId,
          statusCode: errorMetadata.statusCode,
          openRouterCode: errorMetadata.openRouterCode,
          requestId: errorMetadata.requestId,
          message: errorMetadata.rawErrorMessage,
        });

        // ✅ AI SDK v5 PATTERN: Return error metadata as JSON string
        // The frontend will parse this and display appropriate error information
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

    // ✅ CRITICAL FIX: Enhanced idempotency with race condition prevention
    // Multiple simultaneous requests must not create duplicate analyses
    let analysisIdToUse: string | null = null; // Track if we're using existing analysis

    const existingAnalysis = await db.query.chatModeratorAnalysis.findFirst({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.roundNumber, roundNum),
        ),
    });

    if (existingAnalysis) {
      console.warn('[analyzeRoundHandler] 🔍 Existing analysis found', {
        analysisId: existingAnalysis.id,
        status: existingAnalysis.status,
        roundNumber: roundNum,
        ageMs: Date.now() - existingAnalysis.createdAt.getTime(),
      });

      // ✅ COMPLETED: Return existing analysis data
      if (existingAnalysis.status === 'completed' && existingAnalysis.analysisData) {
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

      // ✅ STREAMING: Return 409 Conflict (experimental_useObject can't handle 202)
      if (existingAnalysis.status === 'streaming') {
        console.warn('[analyzeRoundHandler] 🔄 Analysis already streaming, returning 409 Conflict', existingAnalysis.id);
        throw createError.conflict(
          'Analysis is already being generated. Please refresh the page to see the completed analysis.',
          {
            errorType: 'resource',
            resource: 'moderator_analysis',
            resourceId: existingAnalysis.id,
          },
        );
      }

      // ✅ PENDING: Transition to streaming and process it
      // The "pending" status means the backend created the record and is waiting for frontend to trigger
      // When frontend calls /analyze, we should process it, not return 409!
      if (existingAnalysis.status === 'pending') {
        const ageMs = Date.now() - existingAnalysis.createdAt.getTime();
        const TWO_MINUTES_MS = 2 * 60 * 1000;

        if (ageMs > TWO_MINUTES_MS) {
          // Stuck pending - delete to allow fresh retry
          console.warn('[analyzeRoundHandler] ⏱️ Pending analysis stuck (> 2 min), deleting', existingAnalysis.id);
          await db.delete(tables.chatModeratorAnalysis)
            .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
          // Fall through to create new analysis below
        } else {
          // ✅ ATOMIC UPDATE: Transition pending → streaming with race condition protection
          // Only the first request that updates status wins, others will fail and should retry
          console.warn(`[analyzeRoundHandler] ✅ Attempting to claim pending analysis (age: ${ageMs}ms)`, existingAnalysis.id);

          // ✅ CRITICAL: Atomic update - only succeed if status is still 'pending'
          // This prevents multiple requests from processing the same analysis
          const updateResult = await db.update(tables.chatModeratorAnalysis)
            .set({ status: 'streaming' })
            .where(and(
              eq(tables.chatModeratorAnalysis.id, existingAnalysis.id),
              eq(tables.chatModeratorAnalysis.status, 'pending'), // CRITICAL: Only update if still pending
            ))
            .returning();

          // Check if update succeeded (status was pending and we claimed it)
          if (updateResult.length === 0) {
            // Another request already claimed it - return 409 to prevent duplicate
            console.warn('[analyzeRoundHandler] ⚠️ Analysis already claimed by another request', existingAnalysis.id);
            throw createError.conflict(
              'Analysis is already being processed by another request. Please wait.',
              {
                errorType: 'resource',
                resource: 'moderator_analysis',
                resourceId: existingAnalysis.id,
              },
            );
          }

          // ✅ Successfully claimed the pending analysis - process it
          console.warn('[analyzeRoundHandler] ✅ Successfully claimed pending analysis', existingAnalysis.id);
          analysisIdToUse = existingAnalysis.id;
        }
      }

      // ✅ FAILED: Delete failed analysis to allow retry
      if (existingAnalysis.status === 'failed') {
        console.warn('[analyzeRoundHandler] 🔄 Deleting failed analysis to allow retry', existingAnalysis.id);
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

    // ✅ CRITICAL: Create streaming analysis record BEFORE starting stream
    // This acts as a distributed lock to prevent duplicate analysis generation
    // If another request comes in, it will see this streaming record and return 409
    // If we already have a pending analysis that we updated to streaming, use that ID
    const analysisId = analysisIdToUse || ulid();

    if (!analysisIdToUse) {
      // Only create new record if we're not using an existing pending analysis
      console.warn('[analyzeRoundHandler] 🆕 Creating new streaming analysis', {
        analysisId,
        threadId,
        roundNumber: roundNum,
        participantCount: body.participantMessageIds.length,
      });

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

      console.warn('[analyzeRoundHandler] ✅ Streaming analysis created, starting AI stream', analysisId);
    } else {
      console.warn('[analyzeRoundHandler] ✅ Using existing pending analysis, starting AI stream', analysisId);
    }

    // ✅ FINAL SAFEGUARD: Double-check analysis isn't already streaming before starting
    // This prevents race conditions if multiple requests somehow got past earlier checks
    // Skip this check if we just transitioned a pending analysis to streaming ourselves
    if (!analysisIdToUse) {
      const finalCheck = await db.query.chatModeratorAnalysis.findFirst({
        where: eq(tables.chatModeratorAnalysis.id, analysisId),
      });

      if (finalCheck && finalCheck.status === 'streaming') {
        // Someone else is already streaming this analysis
        console.warn('[analyzeRoundHandler] ⚠️ Final check failed - analysis already streaming', analysisId);
        throw createError.conflict(
          'Analysis is already being generated by another request.',
          {
            errorType: 'resource',
            resource: 'moderator_analysis',
            resourceId: analysisId,
          },
        );
      }
    }

    // ✅ AI SDK v5 streamObject() Pattern: Stream structured JSON as it's generated
    // Real streaming approach - sends partial objects as they arrive
    // Frontend uses experimental_useObject() hook from @ai-sdk/react for consumption
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
          console.warn('[analyzeRoundHandler] 🏁 onFinish called', {
            analysisId,
            hasError: !!error,
            hasObject: !!finalObject,
            errorMessage: error instanceof Error ? error.message : error ? String(error) : undefined,
          });

          // ✅ FAILED: Update status to failed with error message
          if (error) {
            try {
              console.warn('[analyzeRoundHandler] ❌ Marking analysis as failed', analysisId);
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: error instanceof Error ? error.message : String(error),
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
              console.warn('[analyzeRoundHandler] ✅ Analysis marked as failed', analysisId);
            } catch (updateError) {
              // ✅ CRITICAL FIX: Log the error instead of suppressing
              console.error('[analyzeRoundHandler] ❌ Failed to update analysis status to failed:', updateError);
            }
            return;
          }

          // ✅ NO OBJECT: Mark as failed
          if (!finalObject) {
            try {
              console.warn('[analyzeRoundHandler] ❌ No object generated, marking as failed', analysisId);
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: 'Analysis completed but no object was generated',
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
              console.warn('[analyzeRoundHandler] ✅ Analysis marked as failed (no object)', analysisId);
            } catch (updateError) {
              // ✅ CRITICAL FIX: Log the error instead of suppressing
              console.error('[analyzeRoundHandler] ❌ Failed to update analysis status to failed (no object):', updateError);
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
              console.warn('[analyzeRoundHandler] ❌ Invalid structure, marking as failed', analysisId);
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: 'failed',
                  errorMessage: 'Analysis generated but structure is invalid',
                })
                .where(eq(tables.chatModeratorAnalysis.id, analysisId));
              console.warn('[analyzeRoundHandler] ✅ Analysis marked as failed (invalid structure)', analysisId);
            } catch (updateError) {
              // ✅ CRITICAL FIX: Log the error instead of suppressing
              console.error('[analyzeRoundHandler] ❌ Failed to update analysis status (invalid structure):', updateError);
            }
            return;
          }

          // ✅ SUCCESS: Update existing record with analysis data and mark as completed
          try {
            console.warn('[analyzeRoundHandler] ✅ Marking analysis as completed', analysisId);
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
            console.warn('[analyzeRoundHandler] 🎉 Analysis successfully completed', analysisId);
          } catch (updateError) {
            // ✅ CRITICAL FIX: Log the error instead of suppressing
            console.error('[analyzeRoundHandler] ❌ CRITICAL: Failed to save completed analysis to database:', {
              analysisId,
              error: updateError,
            });
            // Analysis stays in "streaming" status - this is a critical failure!
          }
        },
      });

      // ✅ AI SDK Pattern: Return streaming text response using toTextStreamResponse()
      // Sets content-type to 'text/plain; charset=utf-8' with streaming
      // Frontend consumes via useObject() hook from @ai-sdk/react
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/object-generation
      return result.toTextStreamResponse();
    } catch (error) {
      // ✅ CRITICAL FIX: Mark analysis as failed before throwing
      // This prevents the analysis from being stuck in "streaming" status forever
      console.error('[analyzeRoundHandler] ❌ Stream failed, marking analysis as failed', {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await db.update(tables.chatModeratorAnalysis)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          })
          .where(eq(tables.chatModeratorAnalysis.id, analysisId));
        console.warn('[analyzeRoundHandler] ✅ Analysis marked as failed after stream error', analysisId);
      } catch (updateError) {
        console.error('[analyzeRoundHandler] ❌ Failed to update analysis status after stream error:', updateError);
      }

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
