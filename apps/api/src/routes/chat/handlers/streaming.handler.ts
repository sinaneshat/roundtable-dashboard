/**
 * Streaming Handler - Real-time AI response streaming with SSE
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Refactored to use service layer for better maintainability
 *
 * This handler orchestrates multi-participant AI conversations with streaming responses.
 *
 * IMPORTANT: AI SDK is lazy-loaded to reduce worker startup CPU time.
 * This is critical for Cloudflare Workers which have a 400ms startup limit.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import {
  CheckRoundCompletionReasons,
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  ParticipantStreamStatuses,
  PlanTypes,
  RoundOrchestrationMessageTypes,
  UIMessageRoles,
} from '@roundtable/shared/enums';
// ============================================================================
// LAZY AI SDK LOADING
// ============================================================================
// Type-only import for type references (doesn't execute at module load)
import type { wrapLanguageModel as WrapLanguageModelType } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { executeBatch } from '@/common/batch-operations';
import { ErrorContextBuilders } from '@/common/error-contexts';
import {
  createError,
  normalizeError,
  structureAIProviderError,
} from '@/common/error-handling';
import {
  extractAISdkError,
  getErrorMessage,
  getErrorName,
  getErrorStatusCode,
} from '@/common/error-types';
import {
  calculateDynamicLimits,
  estimateMessageSize,
  MemoryBudgetTracker,
} from '@/common/memory-safety';
import { createHandler } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { isModeratorMessageMetadata } from '@/db/schemas/chat-metadata';
import { extractSessionToken } from '@/lib/auth';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { cleanCitationExcerpt, completeStreamingMetadata, createStreamingMetadata, getRoundNumber } from '@/lib/utils';
import {
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  checkFreeUserHasCompletedRound,
  enforceCredits,
  estimateWeightedCredits,
  finalizeCredits,
  getModelCreditMultiplierById,
  getSafeMaxOutputTokens,
  getUserCreditBalance,
  releaseReservation,
  reserveCredits,
  zeroOutFreeUserCredits,
} from '@/services/billing';
import {
  createTrackingContext,
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/services/errors';
import { saveStreamedMessage } from '@/services/messages';
import {
  getModelById,
  initializeOpenRouter,
  isDeepSeekModel,
  isNanoOrMiniVariant,
  isOSeriesModel,
  needsSmoothStream,
  openRouterService,
} from '@/services/models';
import {
  buildSystemPromptWithContext,
  extractUserQuery,
  filterUnsupportedFileParts,
  loadParticipantConfiguration,
  prepareValidatedMessages,
} from '@/services/orchestration';
import { processParticipantChanges } from '@/services/participants';
import { buildParticipantSystemPrompt } from '@/services/prompts';
import {
  initializeRoundExecution,
  markParticipantCompleted,
  markParticipantFailed,
  markParticipantStarted,
} from '@/services/round-orchestration';
import {
  appendParticipantStreamChunk,
  clearActiveParticipantStream,
  completeParticipantStreamBuffer,
  failParticipantStreamBuffer,
  getThreadActiveStream,
  initializeParticipantStreamBuffer,
  markStreamActive,
  markStreamCompleted,
  markStreamFailed,
  setThreadActiveStream,
  updateParticipantStatus,
} from '@/services/streaming';
import {
  calculateRoundNumber,
  handleRoundRegeneration,
  logModeChange,
  logWebSearchToggle,
} from '@/services/threads';
import {
  getUserTier,
} from '@/services/usage';
import type { ApiEnv } from '@/types';
import type { AvailableSource } from '@/types/citations';
import type { CheckRoundCompletionQueueMessage, TriggerModeratorQueueMessage, TriggerParticipantQueueMessage } from '@/types/queues';

import type { streamChatRoute } from '../route';
import { StreamChatRequestSchema } from '../schema';
import { chatMessagesToUIMessages } from './helpers';

// Cache the AI SDK module to avoid repeated dynamic imports
let aiSdkModule: typeof import('ai') | null = null;

async function getAiSdk() {
  if (!aiSdkModule) {
    aiSdkModule = await import('ai');
  }
  return aiSdkModule;
}

// ============================================================================
// Memory Safety Constants
// ============================================================================

/**
 * DEFAULT Maximum messages to load from DB per streaming request
 *
 * Prevents memory exhaustion in Cloudflare Workers (128MB limit)
 * by limiting conversation context. The most recent N messages are kept.
 *
 * REDUCED from 150 to 75 for better memory safety.
 * Dynamic limits may further reduce this based on request complexity.
 *
 * 75 messages × ~2KB avg = ~150KB base, leaving headroom for:
 * - System prompts with RAG context (~100KB max)
 * - Attachment content (limited via dynamic config)
 * - Response buffering and SDK overhead
 */
const DEFAULT_MAX_CONTEXT_MESSAGES = 75;

/**
 * Absolute maximum to prevent extreme memory usage
 */
const ABSOLUTE_MAX_CONTEXT_MESSAGES = 100;

// ============================================================================
// Type Adapters
// ============================================================================

/**
 * Adapter to convert getModelById to ModelForPricing type expected by billing functions
 * Strips Zod .openapi() index signatures from model types
 */
function getModelForPricing(modelId: string): import('@/services/billing').ModelForPricing | undefined {
  const model = getModelById(modelId);
  if (!model)
    return undefined;

  return {
    id: model.id,
    name: model.name,
    pricing: model.pricing,
    context_length: model.context_length,
    pricing_display: model.pricing_display,
    created: model.created,
    provider: model.provider,
    capabilities: model.capabilities,
  };
}

// ============================================================================
// Streaming Chat Handler
// ============================================================================

export const streamChatHandler: RouteHandler<typeof streamChatRoute, ApiEnv>
  = createHandler(
    {
      auth: 'session',
      validateBody: StreamChatRequestSchema,
      operationName: 'streamChat',
    },
    async (c) => {
      // ✅ LAZY LOAD AI SDK: Load AI SDK functions at handler invocation, not module startup
      // This is critical for Cloudflare Workers which have a 400ms startup limit
      const aiSdk = await getAiSdk();
      const { extractReasoningMiddleware, RetryError, smoothStream, streamText, wrapLanguageModel } = aiSdk;

      // ✅ PERFORMANCE OPTIMIZATION: Capture executionCtx for non-blocking analytics
      // PostHog tracking will use this to run asynchronously via waitUntil()
      const executionCtx = c.executionCtx;

      const { user } = c.auth();

      // ✅ SESSION TOKEN: Extract for queue-based round orchestration
      // Queue consumers use this cookie to authenticate with Better Auth
      // instead of a separate internal secret
      const sessionToken = extractSessionToken(c.req.header('cookie'));

      const {
        message,
        id: threadId,
        // ✅ CRITICAL FIX: userMessageId allows correct DB lookup for pre-persisted messages
        // AI SDK generates its own message IDs, but user messages are pre-persisted via PATCH/POST
        // with backend ULIDs. Using userMessageId (when provided) ensures we find the correct message.
        userMessageId,
        participantIndex,
        participants: providedParticipants,
        regenerateRound,
        mode: providedMode,
        enableWebSearch: providedEnableWebSearch,
        attachmentIds,
      } = c.validated.body;

      // =========================================================================
      // STEP 1: Validate incoming message
      // =========================================================================
      if (!message) {
        throw createError.badRequest('Message is required', {
          errorType: 'validation',
        });
      }

      if (!threadId) {
        throw createError.badRequest('Thread ID is required for streaming', ErrorContextBuilders.validation('threadId'));
      }

      const db = await getDbAsync();

      // =========================================================================
      // STEP 2: Load thread, verify ownership, and calculate round number (parallelized)
      // =========================================================================
      const [thread, roundResult] = await Promise.all([
        db.query.chatThread.findFirst({
          where: eq(tables.chatThread.id, threadId),
          with: {
            participants: {
              where: eq(tables.chatParticipant.isEnabled, true),
              orderBy: [
                tables.chatParticipant.priority,
                tables.chatParticipant.id,
              ],
            },
          },
        }),
        calculateRoundNumber({
          threadId,
          participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
          // UIMessage is structurally compatible with RoundCalculationMessage (subset of fields)
          // Cast needed due to Zod .openapi() adding index signatures
          message: message as unknown as Parameters<typeof import('@/services/threads/round.service').calculateRoundNumber>[0]['message'],
          regenerateRound,
          db,
        }),
      ]);

      if (!thread) {
        throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId, user.id));
      }

      if (thread.userId !== user.id) {
        throw createError.unauthorized('Not authorized to access this thread', ErrorContextBuilders.authorization('thread', threadId, user.id));
      }

      const currentRoundNumber = roundResult.roundNumber;

      // =========================================================================
      // STEP 3.1: ✅ ROUND INTEGRITY PROTECTION - Prevent overwriting completed rounds
      // =========================================================================
      // CRITICAL: This prevents a frontend bug where messages get reset during navigation
      // from overview to thread screen, causing round 1 to incorrectly calculate as round 0.
      //
      // RULE: A new user message can only be created in a round if:
      // 1. It's a regeneration (explicit intent to redo the round), OR
      // 2. It's a trigger message (empty message to trigger participants for existing round), OR
      // 3. The round has NO participant responses yet (incomplete/new round)
      //
      // NOTE: Pre-search messages have role='assistant' but are NOT participant responses.
      // We must exclude them from this check to allow mid-conversation web search enable.
      //
      // If the round already has PARTICIPANT messages and this isn't a regeneration/trigger,
      // then the frontend incorrectly calculated the round number - reject the request.
      if (
        !roundResult.isRegeneration
        && !roundResult.isTriggerMessage
        && participantIndex === 0
      ) {
        const existingAssistantMessages = await db.query.chatMessage.findMany({
          where: and(
            eq(tables.chatMessage.threadId, threadId),
            eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
            eq(tables.chatMessage.roundNumber, currentRoundNumber),
          ),
          // ✅ FIX: Include participantId for pre-search filtering
          // Pre-search messages have participantId=null, participant messages have participantId set
          columns: { id: true, participantId: true },
        });

        // ✅ FIX: Filter to participant messages only (excludes pre-search)
        // Pre-search messages have role='assistant' but participantId=null
        // Participant messages always have participantId set (foreign key to chatParticipant)
        // This allows web search to be enabled mid-conversation without blocking participants
        const participantResponses = existingAssistantMessages.filter(
          msg => msg.participantId !== null,
        );

        if (participantResponses.length > 0) {
          throw createError.conflict(
            `Round ${currentRoundNumber} already has assistant responses. Cannot create new user message in a completed round. Expected round ${currentRoundNumber + 1}.`,
            { errorType: 'validation', field: 'roundNumber' },
          );
        }
      }

      // =========================================================================
      // STEP 3.5: PRE-SEARCH CREATION (Fixed web search ordering)
      // =========================================================================
      // Pre-search now created before streaming to ensure proper ordering.
      //
      // CURRENT FLOW:
      //   User message → Frontend adds placeholder → Execute endpoint auto-creates + streams → COMPLETE → Participants start
      //
      // IMPLEMENTATION:
      // - Execute endpoint (executePreSearchHandler) auto-creates DB record if not exists
      // - Frontend uses placeholder pre-search for optimistic UI
      // - No separate create endpoint needed - single source of truth
      //
      // REFERENCE:
      // - Endpoint: POST /chat/threads/:threadId/rounds/:roundNumber/pre-search
      // - Handler: executePreSearchHandler in pre-search.handler.ts
      // - Frontend: useStreamingTrigger hook in chat-store-provider

      // =========================================================================
      // STEP 4: Handle regeneration (delete old round data)
      // =========================================================================
      if (regenerateRound) {
        await handleRoundRegeneration({
          threadId,
          regenerateRound,
          participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
          db,
        });
      }

      // =========================================================================
      // STEP 5: Handle mode change and web search toggle (parallelized if both needed)
      // =========================================================================
      const shouldUpdateMode = providedMode && providedMode !== thread.mode && participantIndex === 0;
      const shouldUpdateWebSearch = providedEnableWebSearch !== undefined && providedEnableWebSearch !== thread.enableWebSearch && participantIndex === 0;

      if (shouldUpdateMode || shouldUpdateWebSearch) {
        const nextRoundNumber = currentRoundNumber + 1;
        const updateOperations: Promise<unknown>[] = [];

        if (shouldUpdateMode && providedMode) {
          // Update thread mode
          updateOperations.push(
            db.update(tables.chatThread)
              .set({
                mode: providedMode,
                updatedAt: new Date(),
              })
              .where(eq(tables.chatThread.id, threadId)),
          );

          // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
          updateOperations.push(
            logModeChange(
              threadId,
              nextRoundNumber,
              thread.mode,
              providedMode,
            ),
          );
        }

        if (shouldUpdateWebSearch && providedEnableWebSearch !== undefined) {
          // Update thread web search setting
          updateOperations.push(
            db.update(tables.chatThread)
              .set({
                enableWebSearch: providedEnableWebSearch,
                updatedAt: new Date(),
              })
              .where(eq(tables.chatThread.id, threadId)),
          );

          // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
          updateOperations.push(
            logWebSearchToggle(
              threadId,
              nextRoundNumber,
              providedEnableWebSearch,
            ),
          );
        }

        // Execute all updates in parallel
        await Promise.all(updateOperations);

        // Update local thread object
        if (shouldUpdateMode && providedMode) {
          thread.mode = providedMode;
        }
        if (shouldUpdateWebSearch && providedEnableWebSearch !== undefined) {
          thread.enableWebSearch = providedEnableWebSearch;
        }
      }

      // =========================================================================
      // STEP 6: Persist participant changes (if provided)
      // =========================================================================

      if (providedParticipants && participantIndex === 0) {
        // ✅ SERVICE EXTRACTION: Use participant-config.service for change detection and persistence
        // Replaces 260 lines of inline logic with reusable, testable service module
        // Service handles: validation, change detection, database operations, changelog generation
        const nextRoundNumber = currentRoundNumber + 1;

        const result = processParticipantChanges(
          db,
          thread.participants, // All participants (including disabled)
          providedParticipants,
          threadId,
          nextRoundNumber,
        );

        if (result.hasChanges) {
          // ✅ ROOT CAUSE FIX: Only create changelog if conversation has started
          // Check if at least one AI has responded (assistant message exists)
          // Changes before any AI responds are "initial setup", not meaningful changes to track
          const hasAssistantMessages = await db.query.chatMessage.findFirst({
            where: and(
              eq(tables.chatMessage.threadId, threadId),
              eq(tables.chatMessage.role, MessageRoles.ASSISTANT),
            ),
          });

          // Execute participant operations (always needed)
          // But only include changelog ops if conversation has started
          const opsToExecute = [
            ...result.insertOps,
            ...result.updateOps,
            ...result.reenableOps,
            ...result.disableOps,
            ...(hasAssistantMessages ? result.changelogOps : []), // Only log if conversation started
          ];

          if (opsToExecute.length > 0) {
            await executeBatch(db, opsToExecute);
          }
        }
      }

      // =========================================================================
      // STEP 7: Load participants (after persistence)
      // =========================================================================
      const { participants, participant } = await loadParticipantConfiguration({
        threadId,
        participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        hasPersistedParticipants: !!providedParticipants,
        thread,
        db,
      });

      // =========================================================================
      // STEP 7.5: EARLY CREDIT CHECK - Fail fast if user can't afford the round
      // =========================================================================
      // Only check on first participant (P0) since this is the start of a round
      // Uses the same estimation logic that reserveCredits uses later
      // This prevents wasted computation when the user clearly can't afford it
      const earlyCheckFirstParticipant = participants[0];
      if ((participantIndex ?? 0) === 0 && earlyCheckFirstParticipant !== undefined) {
        let highestMultiplierModel = earlyCheckFirstParticipant;
        let maxMultiplier = getModelCreditMultiplierById(earlyCheckFirstParticipant.modelId, getModelForPricing);
        for (let i = 1; i < participants.length; i++) {
          const p = participants[i];
          if (p === undefined) {
            continue;
          }
          const multiplier = getModelCreditMultiplierById(p.modelId, getModelForPricing);
          if (multiplier > maxMultiplier) {
            maxMultiplier = multiplier;
            highestMultiplierModel = p;
          }
        }
        const earlyEstimatedCredits = estimateWeightedCredits(
          participants.length,
          highestMultiplierModel.modelId,
          getModelForPricing,
        );
        // enforceCredits throws if insufficient - fail fast before loading messages
        await enforceCredits(user.id, earlyEstimatedCredits);
      }

      // =========================================================================
      // STEP 8: Load Previous Messages and Prepare for Streaming (parallelized with user tier check)
      // =========================================================================
      // ✅ MEMORY SAFETY: Dynamic limits prevent Worker memory exhaustion (128MB limit)
      // Calculate complexity-aware limits based on request features

      // First, get a quick message count to estimate complexity
      const messageCountResult = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, threadId),
        columns: { id: true },
        limit: ABSOLUTE_MAX_CONTEXT_MESSAGES + 10,
      });
      const estimatedMessageCount = messageCountResult.length;

      // Calculate dynamic memory limits based on request complexity
      const memoryLimits = calculateDynamicLimits({
        messageCount: estimatedMessageCount,
        attachmentCount: attachmentIds?.length ?? 0,
        hasRag: !!thread.projectId,
        hasWebSearch: thread.enableWebSearch ?? false,
        hasProject: !!thread.projectId,
      });

      // Initialize memory budget tracker for this request
      const memoryTracker = new MemoryBudgetTracker(memoryLimits);

      // Determine actual message limit based on complexity
      const dynamicMessageLimit = Math.min(
        memoryLimits.maxMessages,
        DEFAULT_MAX_CONTEXT_MESSAGES,
        ABSOLUTE_MAX_CONTEXT_MESSAGES,
      );

      // Query in descending order to get most recent messages, then reverse for chronological context
      const [recentDbMessages, userTier] = await Promise.all([
        db.query.chatMessage.findMany({
          where: eq(tables.chatMessage.threadId, threadId),
          orderBy: [
            desc(tables.chatMessage.roundNumber),
            desc(tables.chatMessage.createdAt),
            desc(tables.chatMessage.id),
          ],
          limit: dynamicMessageLimit,
        }),
        getUserTier(user.id),
      ]);

      // Track memory allocation for loaded messages
      const estimatedMsgMemory = estimateMessageSize(recentDbMessages.length);
      if (!memoryTracker.allocate('previousMessages', estimatedMsgMemory)) {
        throw createError.internal(
          'Conversation too large. Try starting a new conversation or reducing attachment count.',
          { errorType: 'configuration', operation: 'memory_allocation' },
        );
      }

      // Reverse to restore chronological order for AI context
      const allDbMessages = recentDbMessages.reverse();

      // ✅ FIX: Filter out moderator messages from conversation context
      // Moderator messages are round summaries that should not be included in
      // the context sent to AI models - they would cause models to repeat the summary
      const previousDbMessages = allDbMessages.filter(
        (msg: typeof allDbMessages[number]) => !msg.metadata || !isModeratorMessageMetadata(msg.metadata),
      );

      // Convert to UIMessages for validation
      const previousMessages
        = await chatMessagesToUIMessages(previousDbMessages);

      // =========================================================================
      // STEP 9: Skip user message creation - messages are now pre-persisted via thread PATCH
      // =========================================================================
      // ✅ NEW ARCHITECTURE: User messages are created via PATCH /threads/:id before streaming
      // The streaming handler should only verify the message exists (for safety)
      // This is a separation of concerns - thread handler manages persistence, streaming handler manages AI
      if (
        message.role === UIMessageRoles.USER
        && participantIndex === 0
      ) {
        // ✅ CRITICAL FIX: Use userMessageId (backend ULID) instead of message.id (AI SDK generated)
        // AI SDK's sendMessage creates messages with its own nanoid-style IDs, but the user message
        // was already persisted via PATCH/POST with a backend-generated ULID. The frontend sends
        // the correct ID in userMessageId so we can find the pre-persisted message.
        const lookupMessageId = userMessageId || message.id;
        const existsInDb = await db.query.chatMessage.findFirst({
          where: eq(tables.chatMessage.id, lookupMessageId),
        });

        if (!existsInDb) {
          // Check if this is an optimistic message (created by frontend before PATCH)
          // Optimistic messages have format: "optimistic-user-{roundNumber}-{timestamp}"
          // For optimistic messages, this is a timing race between store update and streaming
          // The message will be persisted by the PATCH that's running concurrently
          // Note: Non-optimistic messages should have been persisted via PATCH
        }
      }

      // =========================================================================
      // STEP 10: Initialize OpenRouter and Prepare Messages
      // =========================================================================
      initializeOpenRouter(c.env);
      const client = await openRouterService.getClient();

      // Get model info for token limits and pricing
      const modelInfo = getModelById(participant.modelId);
      const modelContextLength = modelInfo?.context_length || 16000;
      const modelPricing = modelInfo
        ? {
            input: Number.parseFloat(modelInfo.pricing.prompt) * 1_000_000,
            output: Number.parseFloat(modelInfo.pricing.completion) * 1_000_000,
          }
        : undefined;

      // ✅ FIX: Resolve attachmentIds from KV for subsequent participants (P1+)
      // P0 receives attachmentIds from request body, P1+ need to fetch from KV
      let resolvedAttachmentIds = attachmentIds;
      if (!resolvedAttachmentIds?.length && (participantIndex ?? 0) > 0) {
        const activeStream = await getThreadActiveStream(threadId, c.env);
        if (activeStream?.attachmentIds?.length) {
          resolvedAttachmentIds = activeStream.attachmentIds;
        }
      }

      // Prepare and validate messages
      // ✅ HYBRID FILE LOADING: Pass params for URL-based delivery of large files (>4MB)
      // Small files use base64, large files get signed public URLs for AI provider access
      const rawModelMessages = await prepareValidatedMessages({
        previousDbMessages,
        newMessage: message as import('ai').UIMessage,
        r2Bucket: c.env.UPLOADS_R2_BUCKET,
        db,
        attachmentIds: resolvedAttachmentIds,
        // Hybrid loading params for large file support
        baseUrl: new URL(c.req.url).origin,
        userId: user.id,
        secret: c.env.BETTER_AUTH_SECRET,
        threadId,
        memoryLimits,
      }).then(result => result.modelMessages);

      // ✅ CAPABILITY FILTER: Strip file/image parts for models that don't support them
      const modelMessages = filterUnsupportedFileParts(rawModelMessages, {
        supportsVision: modelInfo?.supports_vision ?? false,
        supportsFile: modelInfo?.supports_file ?? false,
      });

      // Build system prompt with RAG context and citation support
      const userQuery = extractUserQuery([
        ...previousMessages,
        message as import('ai').UIMessage,
      ]);
      const baseSystemPrompt
        = participant.settings?.systemPrompt
          || buildParticipantSystemPrompt(participant.role, thread.mode);

      const { systemPrompt, citationSourceMap, citableSources }
        = await buildSystemPromptWithContext({
          participant,
          allParticipants: participants,
          thread,
          userQuery,
          previousDbMessages,
          currentRoundNumber,
          env: {
            AI: c.env.AI,
            UPLOADS_R2_BUCKET: c.env.UPLOADS_R2_BUCKET,
          },
          db,
          attachmentIds: resolvedAttachmentIds, // ✅ FIX: Use resolved attachmentIds (includes KV lookup for P1+)
          baseUrl: new URL(c.req.url).origin, // ✅ FIX: Absolute URLs for download links
          memoryLimits,
        });

      // ✅ MEMORY SAFETY: Track system prompt allocation and truncate if needed
      const systemPromptBytes = systemPrompt.length * 2; // UTF-16 encoding
      if (!memoryTracker.allocate('systemPrompt', systemPromptBytes)) {
        // Memory budget exceeded but we continue with what we have
        // The request may fail later but at least we tried to gracefully degrade
      }

      // Include ALL citable sources in metadata (not just attachments)
      // This enables frontend to show citation sources for all types during streaming
      const availableSources: AvailableSource[] = citableSources.map((source): AvailableSource => {
        const baseSource: AvailableSource = {
          id: source.id,
          sourceType: source.type,
          title: source.title,
        };

        if (source.content) {
          baseSource.excerpt = cleanCitationExcerpt(source.content, 300);
        }

        if (source.type === 'attachment') {
          baseSource.downloadUrl = source.metadata.downloadUrl;
          baseSource.filename = source.metadata.filename;
          baseSource.mimeType = source.metadata.mimeType;
          baseSource.fileSize = source.metadata.fileSize;
        }

        if (source.type === 'search') {
          baseSource.url = source.metadata.url;
          baseSource.domain = source.metadata.domain;
        }

        if (source.metadata.threadTitle) {
          baseSource.threadTitle = source.metadata.threadTitle;
        }

        if (source.metadata.description) {
          baseSource.description = source.metadata.description;
        }

        return baseSource;
      });

      // Calculate token limits
      const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
      const averageTokensPerMessage = 200;
      const messageTokens = modelMessages.length * averageTokensPerMessage;
      const estimatedInputTokens = systemPromptTokens + messageTokens + 500;
      const maxOutputTokens = getSafeMaxOutputTokens(
        modelContextLength,
        estimatedInputTokens,
        userTier,
      );

      const modelSupportsTemperature = modelInfo?.supports_temperature ?? true;
      const temperatureValue = modelSupportsTemperature
        ? (participant.settings?.temperature ?? 0.7)
        : undefined;

      const supportsReasoningStream = modelInfo?.supports_reasoning_stream ?? false;

      const isOSeries = isOSeriesModel(participant.modelId);
      const isNanoOrMini = isNanoOrMiniVariant(participant.modelId);
      const reasoningEffort = isOSeries
        ? 'medium'
        : isNanoOrMini
          ? 'minimal'
          : 'low';

      const providerOptions = supportsReasoningStream
        ? {
            openrouter: {
              reasoning: {
                effort: reasoningEffort,
              },
            },
          }
        : undefined;

      const baseModel = client.chat(participant.modelId);
      const isDeepSeek = isDeepSeekModel(participant.modelId);

      /**
       * Type adapter for AI SDK v6 middleware compatibility.
       *
       * OpenRouter provider returns spec v2 models, but wrapLanguageModel expects v3.
       * Runtime behavior is identical for streaming - both implement the same doStream interface.
       *
       * Type incompatibility:
       * - OpenRouter: specificationVersion "v2" (from @openrouter/ai-sdk-provider)
       * - wrapLanguageModel: expects specificationVersion "v3" (from ai package)
       *
       * This adapter function preserves type safety by explicitly documenting the conversion
       * while avoiding unsafe double casts. The model interface is structurally compatible.
       *
       * @see AI SDK Middleware: https://sdk.vercel.ai/docs/ai-sdk-core/middleware
       * @see OpenRouter Provider Issue: Types don't align with latest AI SDK middleware
       */
      function adaptModelForMiddleware<T>(model: T): Parameters<typeof WrapLanguageModelType>[0]['model'] {
        return model as Parameters<typeof WrapLanguageModelType>[0]['model'];
      }

      const modelForStreaming = isDeepSeek
        ? wrapLanguageModel({
            model: adaptModelForMiddleware(baseModel),
            middleware: extractReasoningMiddleware({ tagName: 'think' }),
          })
        : baseModel;

      // Parameters for streamText
      const streamParams = {
        model: modelForStreaming,
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens,
        ...(modelSupportsTemperature && { temperature: temperatureValue }),
        // ✅ REASONING: Add providerOptions for o1/o3/o4 models
        ...(providerOptions && { providerOptions }),
        // ✅ CHUNK NORMALIZATION: Normalize streaming for models with buffered chunk delivery
        // Some providers (xAI/Grok, DeepSeek, Gemini) buffer server-side, sending large chunks
        // (sometimes entire paragraphs) instead of token-by-token. This causes UI jumpiness.
        // smoothStream re-chunks at word boundaries with controlled delay for consistent UX.
        ...(needsSmoothStream(participant.modelId) && {
          experimental_transform: smoothStream({
            delayInMs: 20,
            chunking: 'word',
          }),
        }),
        maxRetries: AI_RETRY_CONFIG.maxAttempts, // AI SDK handles retries
        // ✅ STREAMING TIMEOUT: 30 min to allow long AI responses (reasoning models, complex queries)
        // Cloudflare has UNLIMITED wall-clock duration - only constraint is 100s idle timeout.
        // Active SSE streams sending data are NOT affected by idle timeout.
        // @see https://developers.cloudflare.com/workers/platform/limits/
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.totalMs),
        // ✅ TELEMETRY: Enable telemetry for OpenTelemetry integration
        experimental_telemetry: {
          isEnabled: true,
          functionId: `chat.thread.${threadId}.participant.${participantIndex}`,
          recordInputs: true,
          recordOutputs: true,
          metadata: {
            thread_id: threadId,
            round_number: currentRoundNumber,
            conversation_mode: thread.mode,
            participant_id: participant.id,
            participant_index: participantIndex,
            participant_role: participant.role || 'no-role',
            is_first_participant: participantIndex === 0,
            total_participants: participants.length,
            model_id: participant.modelId,
            model_name: modelInfo?.name || participant.modelId,
            model_context_length: modelContextLength,
            max_output_tokens: maxOutputTokens,
            user_id: user.id,
            user_tier: userTier,
            is_regeneration: !!regenerateRound,
            rag_enabled: systemPrompt !== baseSystemPrompt,
            has_custom_system_prompt: !!participant.settings?.systemPrompt,
            is_reasoning_model: modelInfo?.is_reasoning_model ?? false,
            reasoning_enabled: !!providerOptions,
            estimated_input_tokens: estimatedInputTokens,
            uses_dynamic_pricing: !!modelPricing,
            ...(modelPricing?.input && { input_cost_per_million: modelPricing.input }),
            ...(modelPricing?.output && { output_cost_per_million: modelPricing.output }),
          },
        },
        // ✅ CONDITIONAL RETRY: Don't retry validation errors (400), authentication errors (401, 403)
        // These are permanent errors that won't be fixed by retrying
        shouldRetry: ({ error }: { error: unknown }) => {
          // ✅ TYPE-SAFE ERROR EXTRACTION: Use utility functions instead of unsafe casting
          const statusCode = getErrorStatusCode(error);
          const errorName = getErrorName(error) || '';
          const aiError = extractAISdkError(error);

          // ✅ DEBUG: Concise retry decision log
          const errMsg = getErrorMessage(error).substring(0, 100);
          const respBody = aiError?.responseBody?.substring(0, 200) || '-';
          console.error(`[Stream:P${participantIndex}] RETRY? model=${participant.modelId} status=${statusCode ?? '-'} name=${errorName} msg=${errMsg} body=${respBody}`);

          // Don't retry AI SDK type validation errors - these are provider response format issues
          // that won't be fixed by retrying. The stream already partially succeeded.
          if (errorName === 'AI_TypeValidationError') {
            return false;
          }

          // Don't retry validation errors (400) - malformed requests
          if (statusCode === HttpStatusCodes.BAD_REQUEST) {
            // Check for specific non-retryable error messages
            const errorMessage = getErrorMessage(error);
            const responseBody = aiError?.responseBody || '';

            // Don't retry "Multi-turn conversations are not supported" errors
            if (
              errorMessage.includes(
                'Multi-turn conversations are not supported',
              )
              || responseBody.includes(
                'Multi-turn conversations are not supported',
              )
            ) {
              return false;
            }

            return false;
          }

          // Don't retry authentication errors (401, 403) - requires API key fix
          if (statusCode === HttpStatusCodes.UNAUTHORIZED || statusCode === HttpStatusCodes.FORBIDDEN) {
            return false;
          }

          // Don't retry model not found errors (404) - model doesn't exist
          if (statusCode === HttpStatusCodes.NOT_FOUND) {
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

      // ✅ REASONING DURATION TRACKING: Track how long reasoning takes
      // Used for "Thought for X seconds" display on page refresh
      let reasoningStartTime: number | null = null;
      let reasoningDurationSeconds: number | undefined;

      // ✅ DETERMINISTIC MESSAGE ID GENERATION
      // Message uniqueness is guaranteed by business logic: (threadId, roundNumber, participantIndex)
      // Each participant position can only respond ONCE per round - this is the natural unique constraint
      //
      // Why use participantIndex, not participant.id:
      // - participantIndex represents ORDER in round (0, 1, 2, ...) - always unique per round
      // - participant.id can be reused if same model added multiple times with different roles
      // - Uniqueness is per POSITION in round, not per participant database record
      //
      // Why deterministic > random:
      // - ✅ NO collision risk (composite key based on actual uniqueness)
      // - ✅ Consistent structure across all participants
      // - ✅ Human-readable and debuggable
      // - ✅ Matches natural constraint: (threadId, roundNumber, participantIndex)
      // - ❌ Random IDs (ULID/nanoid) can collide in concurrent scenarios
      // - ❌ Random IDs require defensive frontend code for collision detection
      //
      // ID Format: {threadId}_r{roundNumber}_p{participantIndex}
      // Example: "01K9Q5853A_r1_p0" (first participant), "01K9Q5853A_r1_p1" (second), etc.
      //
      // This follows the principle: Use composite keys when you have deterministic uniqueness,
      // not random IDs that introduce collision risk
      const streamMessageId = `${threadId}_r${currentRoundNumber}_p${participantIndex ?? DEFAULT_PARTICIPANT_INDEX}`;

      // =========================================================================
      // ✅ PARALLELIZED INITIALIZATION: Pre-streaming setup operations
      // =========================================================================
      // ✅ DEFENSIVE CHECK: Check for existing message with same ID
      // This handles retries and race conditions gracefully
      // Instead of throwing error, log warning and continue with idempotent behavior
      const firstParticipant = participants[0];
      if (!firstParticipant) {
        throw createError.badRequest('No participants configured for thread', ErrorContextBuilders.validation('participants'));
      }
      // ✅ PERF: Single pass to find highest multiplier (O(n) instead of O(2n))
      let highestMultiplierModel = firstParticipant;
      let maxMultiplier = getModelCreditMultiplierById(firstParticipant.modelId, getModelForPricing);
      for (let i = 1; i < participants.length; i++) {
        const p = participants[i];
        if (p === undefined) {
          continue;
        }
        const multiplier = getModelCreditMultiplierById(p.modelId, getModelForPricing);
        if (multiplier > maxMultiplier) {
          maxMultiplier = multiplier;
          highestMultiplierModel = p;
        }
      }
      const estimatedCredits = estimateWeightedCredits(
        participants.length,
        highestMultiplierModel.modelId,
        getModelForPricing,
      );

      // ✅ ROUND ORCHESTRATION: Initialize round state when P0 starts
      // This MUST happen before markParticipantStarted/markParticipantCompleted
      // which rely on existing round state in KV
      const effectiveParticipantIndex = participantIndex ?? DEFAULT_PARTICIPANT_INDEX;
      if (effectiveParticipantIndex === 0) {
        await initializeRoundExecution(
          threadId,
          currentRoundNumber,
          participants.length,
          attachmentIds,
          c.env,
        );
      }

      const [existingMessage] = await Promise.all([
        db.query.chatMessage.findFirst({
          where: eq(tables.chatMessage.id, streamMessageId),
        }),
        // ✅ CREDIT RESERVATION: Reserve credits BEFORE streaming begins
        // Pre-reserve estimated credits to prevent overdraft during streaming
        // Actual credits are finalized in onFinish after token count is known
        // Uses highest-cost model among participants for conservative estimation
        // Skip round completion check - participants are PART of the round, not a new round
        reserveCredits(user.id, streamMessageId, estimatedCredits, { skipRoundCheck: true }),
        // ✅ RESUMABLE STREAMS: Initialize stream buffer for resumption
        initializeParticipantStreamBuffer(
          streamMessageId,
          threadId,
          currentRoundNumber,
          effectiveParticipantIndex,
          c.env,
        ),
        // ✅ RESUMABLE STREAMS: Mark stream as active in KV for resume detection
        markStreamActive(
          threadId,
          currentRoundNumber,
          effectiveParticipantIndex,
          c.env,
        ),
        // ✅ ROUND ORCHESTRATION: Mark participant as started for tracking
        markParticipantStarted(
          threadId,
          currentRoundNumber,
          effectiveParticipantIndex,
          c.env,
        ),
        // ✅ RESUMABLE STREAMS: Set thread-level active stream for AI SDK resume pattern
        // This enables the frontend to detect and resume this stream after page reload
        // ✅ FIX: Pass total participants count for proper round-level tracking
        // ✅ FIX: Pass attachmentIds for sharing across all participants in the round
        setThreadActiveStream(
          threadId,
          streamMessageId,
          currentRoundNumber,
          effectiveParticipantIndex,
          participants.length, // ✅ FIX: Track total participants for round completion detection
          c.env,
          undefined, // logger
          attachmentIds, // ✅ FIX: Store attachmentIds in KV for P1+ participants
        ),
      ]);

      if (existingMessage) {
        // Message ID already exists - this could be a retry or race condition
        // Continue processing - the upsert logic will handle updating the existing message (idempotent behavior)
      }

      // =========================================================================
      // ✅ POSTHOG LLM TRACKING: Initialize trace and timing
      // =========================================================================
      const llmTraceId = generateTraceId();
      const llmStartTime = performance.now();

      // =========================================================================
      // ✅ POSTHOG SESSION TRACKING: Use Better Auth session for tracking
      // =========================================================================
      // ✅ POSTHOG SESSION TRACKING: Extract distinct ID and session ID
      // =========================================================================
      // PostHog Best Practice: Link LLM events to Session Replay for debugging
      // Using Better Auth session.id provides stable, reliable session tracking
      // that's consistent with the application's authentication pattern
      const { session } = c.auth();

      // Create tracking context for this LLM generation
      const trackingContext = createTrackingContext(
        user.id,
        session?.id || user.id, // ✅ Better Auth session.id - required for PostHog tracking, fallback to userId
        threadId,
        currentRoundNumber,
        participant,
        participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        thread.mode,
        {
          modelName: modelInfo?.name,
          isRegeneration: !!regenerateRound,
          userTier,
        },
      );

      // =========================================================================
      // ✅ TYPE-SAFE PARTICIPANT METADATA FOR STREAMING
      // =========================================================================
      // Uses type-safe builder that enforces all required fields at compile-time
      // PREVENTS: Missing fields that cause schema validation failures
      // ENSURES: Metadata always matches ParticipantMessageMetadataSchema
      //
      // ✅ FIX: Include availableSources in streaming metadata so frontend can
      // show "Sources" section immediately during streaming (not just after refresh)
      const streamMetadata = createStreamingMetadata({
        roundNumber: currentRoundNumber,
        participantId: participant.id,
        participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        participantRole: participant.role,
        model: participant.modelId,
        // ✅ CITATIONS: Pass availableSources so frontend shows Sources section during streaming
        // Note: Resolved inline citations (citations array) only available after onFinish
        availableSources,
      });

      // =========================================================================
      // ✅ AI SDK V6 BUILT-IN RETRY LOGIC
      // =========================================================================
      // Use AI SDK's built-in retry mechanism instead of custom retry loop
      // Benefits:
      // 1. No duplicate messages on frontend (retries happen internally)
      // 2. Exponential backoff for transient errors
      // 3. Single stream to frontend (cleaner UX)
      // 4. Follows official AI SDK v6 patterns
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

      // ✅ DEBUG: Concise request context log (compare P0 vs P1)
      const msgParts = modelMessages.map(m =>
        Array.isArray(m.content)
          ? m.content.map((p: { type?: string }) => p.type?.[0] || '?').join('')
          : 't',
      ).join(',');
      console.error(`[Stream:P${participantIndex}] START model=${participant.modelId} msgs=${modelMessages.length} parts=[${msgParts}] tokens~${estimatedInputTokens} attach=${resolvedAttachmentIds?.length ?? 0}`);

      // ✅ STREAM RESPONSE: Single stream with built-in AI SDK retry logic
      const finalResult = streamText({
        ...streamParams,

        // ✅ AI SDK V6 BUILT-IN RETRY: Configure retry behavior
        // maxRetries: Maximum number of automatic retries for transient errors
        // Default is 2, which gives us 3 total attempts (1 initial + 2 retries)
        maxRetries: AI_RETRY_CONFIG.maxAttempts - 1, // -1 because maxRetries doesn't count initial attempt

        onChunk: async ({ chunk }) => {
          // ✅ AI SDK v6: Capture reasoning deltas from extractReasoningMiddleware
          // For models with native reasoning (Claude, OpenAI o1/o3), reasoning is captured via
          // finishResult.reasoning in onFinish and handled by extractReasoning() in message-persistence
          if (chunk.type === 'reasoning-delta') {
            // ✅ REASONING DURATION: Start timer on first reasoning chunk
            if (reasoningStartTime === null) {
              reasoningStartTime = Date.now();
            }
            reasoningDeltas.push(chunk.text);
          }

          // ✅ REASONING DURATION: Calculate duration when text starts (reasoning ended)
          // Reasoning typically ends when the model starts outputting text
          if (chunk.type === 'text-delta' && reasoningStartTime !== null && reasoningDurationSeconds === undefined) {
            reasoningDurationSeconds = Math.round((Date.now() - reasoningStartTime) / 1000);
          }
        },

        // ✅ ERROR HANDLING: Catch and propagate streaming errors
        // This includes errors thrown from onFinish (like empty response errors)
        // AI SDK v6 will automatically handle these errors and propagate them to the client
        onError: async ({ error }) => {
          // ✅ DEBUG: Handle both Error instances and plain objects
          const isErrorInstance = error instanceof Error;
          const errName = isErrorInstance ? error.name : 'PlainObject';
          const errMsg = isErrorInstance
            ? error.message.substring(0, 150)
            : (typeof error === 'object' && error !== null ? JSON.stringify(error).substring(0, 500) : String(error));
          const errStatus = error && typeof error === 'object' && 'statusCode' in error ? (error as Record<string, unknown>).statusCode : '-';
          const errBody = error && typeof error === 'object' && 'responseBody' in error
            ? String((error as Record<string, unknown>).responseBody).substring(0, 300)
            : '-';
          const errCause = error && typeof error === 'object' && 'cause' in error
            ? String((error as Record<string, unknown>).cause).substring(0, 100)
            : '-';
          console.error(`[Stream:P${participantIndex}] ERROR model=${participant.modelId} isErr=${isErrorInstance} name=${errName} status=${errStatus}`);
          console.error(`[Stream:P${participantIndex}] ERROR_DETAIL msg=${errMsg}`);
          console.error(`[Stream:P${participantIndex}] ERROR_EXTRA body=${errBody} cause=${errCause}`);

          // ✅ CREDIT RELEASE: Release reserved credits on error
          // We don't know how many credits were reserved, so we pass estimatedCredits
          try {
            await releaseReservation(user.id, streamMessageId, estimatedCredits);
          } catch {
            // Failed to release credit reservation - will be handled by cleanup
          }

          // ✅ BACKGROUND STREAMING: Detect timeout aborts
          // Abort errors come from AbortSignal.timeout() when stream exceeds time limit
          // On timeout, we preserve stream state for potential resumption
          const isAbortError
            = error instanceof Error
              && (error.name === 'AbortError'
                || error.message.includes('abort')
                || error.message.includes('cancel')
                || (error.cause instanceof Error
                  && error.cause.name === 'AbortError'));

          if (isAbortError) {
            // ✅ TIMEOUT: Preserve stream state - partial content may be valid
            // Frontend can poll KV to retrieve buffered chunks
            return;
          }

          // ✅ RESUMABLE STREAMS: Clean up stream state on REAL errors only
          // This ensures failed streams don't block future streaming attempts
          try {
            await Promise.all([
              markStreamFailed(
                threadId,
                currentRoundNumber,
                participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
                error instanceof Error ? error.message : String(error),
                c.env,
              ),
              // ✅ FIX: Update participant status to 'failed' instead of clearing entirely
              // Only clears thread active stream when ALL participants have finished
              updateParticipantStatus(
                threadId,
                currentRoundNumber,
                participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
                ParticipantStreamStatuses.FAILED,
                c.env,
              ),
              // ✅ ROUND ORCHESTRATION: Mark participant as failed for round state tracking
              markParticipantFailed(
                threadId,
                currentRoundNumber,
                participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
                error instanceof Error ? error.message : String(error),
                c.env,
              ),
            ]);
          } catch {
            // Cleanup errors shouldn't break error handling flow
          }
        },

        // ✅ PERSIST MESSAGE: Save to database after streaming completes
        onFinish: async (finishResult) => {
          // ✅ DEBUG: Wrap entire onFinish in try-catch to surface any errors
          try {
            const messageId = streamMessageId;

            // ✅ CRITICAL FIX: Detect and handle empty responses before persistence
            // Models like gemini-2.5-flash-lite return empty responses
            // This prevents AI SDK internal state corruption that causes "Cannot read properties of undefined (reading 'state')" errors
            const hasText = (finishResult.text?.trim().length || 0) > 0;
            // ✅ FIX: Don't count [REDACTED]-only reasoning as valid content
            // When reasoning models (GPT-5 Nano, o3-mini, etc.) exhaust tokens on encrypted reasoning
            // before outputting text, they produce only [REDACTED] which gets filtered on frontend
            // Result: empty message card with no visible content
            // Solution: Treat [REDACTED]-only reasoning as not having meaningful content
            const reasoningContent = reasoningDeltas.join('').trim();
            const isOnlyRedactedReasoning = /^\[REDACTED\]$/i.test(reasoningContent);
            const hasReasoning
              = reasoningDeltas.length > 0
                && reasoningContent.length > 0
                && !isOnlyRedactedReasoning;
            const hasToolCalls
              = finishResult.toolCalls && finishResult.toolCalls.length > 0;
            const hasContent = hasText || hasReasoning || hasToolCalls;

            // ✅ EMPTY RESPONSE HANDLING: Save with error metadata instead of throwing
            // IMPORTANT: Cannot throw here because stream is already open - throwing causes
            // ERR_INCOMPLETE_CHUNKED_ENCODING because response is partially sent
            //
            // Instead: Save message with error metadata so frontend shows error state
            // The message will have hasError: true and errorMessage explaining what happened
            //
            // Examples of empty responses in production:
            // - gemini-2.5-flash-lite: finishReason='unknown', 0 tokens, no text
            // - gpt-5-nano with finishReason='length': exhausted tokens on reasoning
            const emptyResponseError = !hasContent
              ? (isOnlyRedactedReasoning && finishResult.finishReason === FinishReasons.LENGTH
                  ? `Model exhausted token limit during reasoning and could not generate a response.`
                  : `Model did not generate a response.`)
              : null;

            // Delegate to message persistence service
            // ✅ CITATIONS: Pass citationSourceMap for resolving [source_id] markers in AI response
            // ✅ AVAILABLE SOURCES: Pass availableSources for "Sources" UI even without inline citations
            // ✅ REASONING DURATION: Calculate final duration if not already set
            // Handle case where model only outputs reasoning without text (e.g., reasoning-only response)
            // Also handle native reasoning (Claude/OpenAI) which comes via finishResult.reasoning
            let finalReasoningDuration = reasoningDurationSeconds;
            if (finalReasoningDuration === undefined && reasoningStartTime !== null) {
              finalReasoningDuration = Math.round((Date.now() - reasoningStartTime) / 1000);
            }

            await saveStreamedMessage({
              messageId,
              threadId,
              participantId: participant.id,
              participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
              participantRole: participant.role,
              modelId: participant.modelId,
              roundNumber: currentRoundNumber,
              text: finishResult.text,
              reasoningDeltas,
              finishResult,
              db,
              citationSourceMap,
              availableSources,
              // ✅ REASONING DURATION: Pass duration for "Thought for X seconds" display
              reasoningDuration: finalReasoningDuration,
              // ✅ EMPTY RESPONSE ERROR: Pass error for messages with no renderable content
              emptyResponseError,
            });

            // =========================================================================
            // ✅ PARALLELIZED POST-STREAMING OPERATIONS: Credit finalization and balance check
            // =========================================================================
            // NOTE: Use Number.isFinite to properly handle NaN (which ?? doesn't catch)
            const rawInputTokens = finishResult.usage?.inputTokens ?? 0;
            const rawOutputTokens = finishResult.usage?.outputTokens ?? 0;
            const actualInputTokens = Number.isFinite(rawInputTokens) ? rawInputTokens : 0;
            const actualOutputTokens = Number.isFinite(rawOutputTokens) ? rawOutputTokens : 0;

            const [, creditBalance] = await Promise.all([
            // ✅ CREDIT FINALIZATION: Deduct actual credits based on token usage
            // Releases reservation and deducts actual credits used
              finalizeCredits(user.id, streamMessageId, {
                inputTokens: actualInputTokens,
                outputTokens: actualOutputTokens,
                action: 'ai_response',
                threadId,
                messageId,
                modelId: participant.modelId,
              }),
              // ✅ FREE USER SINGLE-ROUND: Check credit balance for zero-out logic
              getUserCreditBalance(user.id),
            ]);

            // =========================================================================
            // ✅ FREE USER SINGLE-ROUND: Zero out credits after round is COMPLETE
            // Free users get exactly ONE round - exhaust credits only after ALL
            // participants have responded AND moderator has completed (for 2+ participants).
            // For single-participant threads, zero out after participant completes (no moderator).
            // For multi-participant threads, moderator.handler.ts handles zeroing after it completes.
            // =========================================================================
            if (creditBalance.planType === PlanTypes.FREE && participants.length < 2) {
            // Single-participant thread: no moderator, so round completes after participant
              const roundComplete = await checkFreeUserHasCompletedRound(user.id);
              if (roundComplete) {
                await zeroOutFreeUserCredits(user.id);
              }
            }
            // Multi-participant threads: moderator.handler.ts calls zeroOutFreeUserCredits after completion

            // =========================================================================
            // ✅ POSTHOG LLM TRACKING: Track generation with official best practices
            // =========================================================================
            // Following PostHog recommendations:
            // - Always include input/output for observability
            // - Link to Session Replay via $session_id
            // - Track prompt ID/version for A/B testing
            // - Include subscription tier for cost analysis
            // - Capture dynamic pricing from OpenRouter API
            //
            // Reference: https://posthog.com/docs/llm-analytics/generations
            try {
            // Convert recent model messages to PostHog input format (last 5 for context)
              const recentModelMessages = modelMessages.slice(-5);
              const inputMessages = recentModelMessages.map((msg): { role: string; content: string | Array<{ type: string; text: string }> } => {
                return {
                  role: msg.role,
                  content:
                  typeof msg.content === 'string'
                    ? msg.content
                    : Array.isArray(msg.content)
                      ? msg.content.map((part: { type: string; text?: string }): { type: string; text: string } => {
                          if ('text' in part && part.text) {
                            return { type: MessagePartTypes.TEXT, text: part.text };
                          }
                          if (part.type === 'image') {
                            return { type: 'image', text: '[image content]' };
                          }
                          return { type: MessagePartTypes.TEXT, text: '[content]' };
                        })
                      : [],
                };
              });

              // ✅ AI SDK V6 TOKEN USAGE: Extract both usage (final step) and totalUsage (cumulative)
              // Reference: https://sdk.vercel.ai/docs/migration-guides/migration-guide-6-0#distinguish-ai-sdk-usage-reporting-in-60
              // In AI SDK 6.0:
              // - usage: Contains token usage from the FINAL STEP only
              // - totalUsage: Contains CUMULATIVE token usage across ALL STEPS (multi-step reasoning)
              const usage = finishResult.usage
                ? {
                    inputTokens: finishResult.usage.inputTokens ?? 0,
                    outputTokens: finishResult.usage.outputTokens ?? 0,
                    totalTokens:
                    finishResult.usage.totalTokens
                    ?? (finishResult.usage.inputTokens ?? 0)
                    + (finishResult.usage.outputTokens ?? 0),
                    // AI SDK v6: inputTokenDetails contains cache metrics
                    inputTokenDetails: finishResult.usage.inputTokenDetails,
                    // AI SDK v6: outputTokenDetails contains reasoning token metrics
                    outputTokenDetails: finishResult.usage.outputTokenDetails,
                  }
                : undefined;

              // ✅ AI SDK V6 MULTI-STEP TRACKING: Use totalUsage for cumulative metrics (if available)
              // For single-step generations, totalUsage === usage
              // For multi-step reasoning (e.g., o1, o3), totalUsage includes ALL steps
              const totalUsage
                = 'totalUsage' in finishResult && finishResult.totalUsage
                  ? {
                      inputTokens: finishResult.totalUsage.inputTokens ?? 0,
                      outputTokens: finishResult.totalUsage.outputTokens ?? 0,
                      totalTokens:
                      finishResult.totalUsage.totalTokens
                      ?? (finishResult.totalUsage.inputTokens ?? 0)
                      + (finishResult.totalUsage.outputTokens ?? 0),
                      inputTokenDetails: finishResult.totalUsage.inputTokenDetails,
                      outputTokenDetails: finishResult.totalUsage.outputTokenDetails,
                    }
                  : usage; // Fallback to usage if totalUsage not available

              // ✅ REASONING TOKENS: Use AI SDK v6's outputTokenDetails.reasoningTokens when available
              // Priority: SDK token count > manual calculation from reasoning parts > estimate from deltas
              const reasoningText = reasoningDeltas.join('');
              const sdkReasoningTokens = finishResult.usage?.outputTokenDetails?.reasoningTokens;
              const reasoningTokens
                = sdkReasoningTokens
                  ?? (finishResult.reasoning && finishResult.reasoning.length > 0
                    ? finishResult.reasoning.reduce(
                        (acc, r) => acc + Math.ceil(r.text.length / 4),
                        0,
                      )
                    : Math.ceil(reasoningText.length / 4));

              // ✅ PERFORMANCE OPTIMIZATION: Non-blocking analytics tracking
              // PostHog tracking runs asynchronously via waitUntil() to avoid blocking response
              // Expected gain: 100-300ms per streaming response
              const trackAnalytics = async () => {
                try {
                  await trackLLMGeneration(
                    trackingContext,
                    {
                      text: finishResult.text,
                      finishReason: finishResult.finishReason,
                      // AI SDK V6: Use usage (final step only)
                      usage,
                      reasoning: finishResult.reasoning,
                      // AI SDK v6: toolCalls and toolResults are already in correct format (ToolCallPart/ToolResultPart)
                      toolCalls: finishResult.toolCalls,
                      toolResults: finishResult.toolResults,
                      response: finishResult.response,
                    },
                    inputMessages, // PostHog Best Practice: Always include input messages
                    llmTraceId,
                    llmStartTime,
                    {
                    // Dynamic model pricing from OpenRouter API
                      modelPricing,

                      // Model configuration tracking
                      modelConfig: {
                        temperature: temperatureValue,
                        maxTokens: maxOutputTokens,
                      },

                      // PostHog Best Practice: Prompt tracking for A/B testing
                      promptTracking: {
                        promptId: participant.role
                          ? `role_${participant.role.replace(/\s+/g, '_').toLowerCase()}`
                          : 'default',
                        promptVersion: 'v3.0', // V3.0: Natural dialogue + CEBR protocol
                        systemPromptTokens,
                      },

                      // ✅ AI SDK V6: Pass totalUsage for cumulative metrics
                      totalUsage,

                      // ✅ REASONING TOKENS: Pass calculated reasoning tokens
                      reasoningTokens,

                      // ✅ POSTHOG OFFICIAL: Provider URL tracking for debugging
                      providerUrls: {
                        baseUrl: 'https://openrouter.ai',
                        requestUrl:
                        'https://openrouter.ai/api/v1/chat/completions',
                      },

                      // Additional custom properties for analytics
                      additionalProperties: {
                        message_id: messageId,
                        reasoning_length_chars: reasoningText.length,
                        reasoning_from_sdk: !!(
                          finishResult.reasoning
                          && finishResult.reasoning.length > 0
                        ),
                        rag_context_used: systemPrompt !== baseSystemPrompt,
                        sdk_version: 'ai-sdk-v6',
                        is_first_participant: participantIndex === 0,
                        total_participants: participants.length,
                        message_persisted: true,
                      },
                    },
                  );
                } catch {
                // Tracking should never break the main flow - silently fail
                }
              };

              // Use waitUntil in production, fire-and-forget in local dev
              if (executionCtx) {
                executionCtx.waitUntil(trackAnalytics());
              } else {
                trackAnalytics().catch(() => {});
              }
            } catch {
            // Error in analytics setup - silently fail
            }

            // =========================================================================
            // ✅ PARALLELIZED STREAM COMPLETION: Mark stream as completed for resume detection
            // =========================================================================
            // ✅ FIX: Mark stream buffer as COMPLETED and clear active key immediately
            // The consumeSseStream callback runs in waitUntil (background), so if user refreshes
            // before it completes, KV metadata is still ACTIVE. This causes server to return
            // phase=participants instead of next phase, triggering participant re-execution.
            // By calling these here (in onFinish which runs before response ends), we ensure
            // KV state is correct even if consumeSseStream hasn't finished buffering.
            await Promise.all([
              markStreamCompleted(
                threadId,
                currentRoundNumber,
                participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
                messageId,
                c.env,
              ),
              // ✅ FIX: Update participant status instead of clearing thread active stream
              // Only clears thread active stream when ALL participants have finished
              // This enables proper multi-participant stream resumption after page reload
              updateParticipantStatus(
                threadId,
                currentRoundNumber,
                participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
                ParticipantStreamStatuses.COMPLETED,
                c.env,
              ),
              // ✅ FIX: Mark buffer as COMPLETED (same fix as moderator.handler.ts)
              completeParticipantStreamBuffer(streamMessageId, c.env),
              // ✅ FIX: Clear active key for this participant (same fix as moderator.handler.ts)
              clearActiveParticipantStream(
                threadId,
                currentRoundNumber,
                participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
                c.env,
              ),
            ]);

            // =========================================================================
            // ✅ SERVER-SIDE ROUND ORCHESTRATION: Continue round in background
            // =========================================================================
            // This is the key fix for "user navigates away" problem:
            // - After each participant completes, server triggers the next one
            // - Uses waitUntil() to run in background, independent of client connection
            // - Client can disconnect - round continues to completion
            //
            // FLOW:
            // 1. Participant N completes → mark completed in round state
            // 2. Check if all participants done
            // 3. If not done → trigger participant N+1 via internal fetch
            // 4. If all done → trigger moderator (for 2+ participants)
            // =========================================================================

            const currentParticipantIdx = participantIndex ?? DEFAULT_PARTICIPANT_INDEX;

            // Update round execution state
            const { allParticipantsComplete } = await markParticipantCompleted(
              threadId,
              currentRoundNumber,
              currentParticipantIdx,
              c.env,
            );

            // Determine next action based on round state
            const nextParticipantIndex = currentParticipantIdx + 1;
            const hasMoreParticipants = nextParticipantIndex < participants.length;
            const needsModerator = participants.length >= 2 && allParticipantsComplete;

            // =========================================================================
            // QUEUE-BASED ORCHESTRATION: Guaranteed delivery via Cloudflare Queues
            // =========================================================================
            // Benefits over waitUntil(fetch):
            // - Guaranteed delivery: Queue retries if worker times out
            // - Decoupled execution: Stream continues regardless of request lifecycle
            // - Built-in retry semantics with exponential backoff
            // =========================================================================

            if (hasMoreParticipants) {
            // ✅ TRIGGER NEXT PARTICIPANT via Queue
              const queueMessage: TriggerParticipantQueueMessage = {
                type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
                messageId: `trigger-${threadId}-r${currentRoundNumber}-p${nextParticipantIndex}`,
                threadId,
                roundNumber: currentRoundNumber,
                participantIndex: nextParticipantIndex,
                userId: user.id,
                sessionToken,
                attachmentIds: resolvedAttachmentIds,
                queuedAt: new Date().toISOString(),
              };

              // Queue binding may be undefined in local dev without Cloudflare simulation
              if (c.env.ROUND_ORCHESTRATION_QUEUE) {
                try {
                  await c.env.ROUND_ORCHESTRATION_QUEUE.send(queueMessage);
                } catch (error) {
                  console.error(`[RoundOrchestration] Failed to queue participant ${nextParticipantIndex}:`, error);
                  // Mark as failed so status endpoint reflects the issue
                  await markParticipantFailed(
                    threadId,
                    currentRoundNumber,
                    nextParticipantIndex,
                    error instanceof Error ? error.message : 'Queue send failed',
                    c.env,
                  );
                }
              }
            } else if (needsModerator) {
            // ✅ TRIGGER MODERATOR via Queue
              const queueMessage: TriggerModeratorQueueMessage = {
                type: RoundOrchestrationMessageTypes.TRIGGER_MODERATOR,
                messageId: `trigger-${threadId}-r${currentRoundNumber}-moderator`,
                threadId,
                roundNumber: currentRoundNumber,
                userId: user.id,
                sessionToken,
                queuedAt: new Date().toISOString(),
              };

              // Queue binding may be undefined in local dev without Cloudflare simulation
              if (c.env.ROUND_ORCHESTRATION_QUEUE) {
                try {
                  await c.env.ROUND_ORCHESTRATION_QUEUE.send(queueMessage);
                } catch (error) {
                  console.error('[RoundOrchestration] Failed to queue moderator:', error);
                }
              }
            }
          } catch (onFinishError) {
            // ✅ DEBUG: Log any errors in onFinish callback
            console.error('[Streaming] onFinish ERROR:', {
              error: onFinishError instanceof Error ? onFinishError.message : String(onFinishError),
              stack: onFinishError instanceof Error ? onFinishError.stack : undefined,
              messageId: streamMessageId,
              threadId,
              roundNumber: currentRoundNumber,
              participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
            });
          }
        },
      });

      // Get the base stream response
      const filteredOriginalMessages = previousMessages.filter((m) => {
        if (m.id === message.id)
          return false;

        // ✅ CRITICAL: Exclude assistant messages from current round
        // These are concurrent participant responses, not conversation history
        if (m.role === UIMessageRoles.ASSISTANT) {
          const msgRoundNumber = getRoundNumber(m.metadata);
          if (msgRoundNumber === currentRoundNumber) {
            return false;
          }
        }

        return true;
      });

      const baseStreamResponse = finalResult.toUIMessageStreamResponse({
        sendReasoning: true,

        originalMessages: filteredOriginalMessages,

        // ✅ DETERMINISTIC MESSAGE ID: Server-side generation using composite key
        // Format: {threadId}_r{roundNumber}_p{participantId}
        // Uniqueness guaranteed by business logic, not random generation
        // No collision risk - each participant can only respond once per round
        generateMessageId: () => streamMessageId,

        // ✅ AI SDK V6 OFFICIAL PATTERN: Inject participant metadata at stream lifecycle events
        // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
        // The callback receives { part } with type: 'start' | 'finish' | 'start-step' | 'finish-step'
        // Send metadata on 'start' to ensure frontend receives participant info immediately
        // Send additional metadata on 'finish' to include usage stats
        messageMetadata: ({ part }) => {
          if (part.type === 'start') {
            return streamMetadata;
          }

          if (part.type === 'finish') {
            return completeStreamingMetadata(streamMetadata, {
              finishReason: part.finishReason,
              usage: undefined,
              totalUsage: part.totalUsage,
            });
          }

          return undefined;
        },

        // ✅ AI SDK RESUME PATTERN: Buffer SSE chunks for stream resumption
        // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-resume-streams
        //
        // AI SDK consumeSseStream provides access to a tee'd copy of the SSE stream.
        // One branch goes to the client response, the other is passed here for buffering.
        //
        // ⚠️ MUST use waitUntil - blocking would delay the client response!
        // The GET /stream endpoint polls KV until chunks are available.
        consumeSseStream: async ({ stream }) => {
          // Buffer the stream asynchronously (don't block the response)
          // The stream continues to the client automatically via the other tee branch
          const bufferStream = async () => {
            const reader = stream.getReader();

            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  // Stream completed - mark buffer as complete
                  await completeParticipantStreamBuffer(streamMessageId, c.env);
                  break;
                }

                // Value is already a string from ReadableStream<string>
                // Append chunk to buffer
                await appendParticipantStreamChunk(streamMessageId, value, c.env);
              }
            } catch (error) {
              // ✅ BACKGROUND STREAMING: Detect timeout aborts
              // Abort errors come from AbortSignal.timeout() when stream exceeds time limit
              // On timeout, we preserve the buffer state - partial content may be valid
              const isAbortError
                = error instanceof Error
                  && (error.name === 'AbortError'
                    || error.message.includes('abort')
                    || error.message.includes('cancel')
                    || (error.cause instanceof Error
                      && error.cause.name === 'AbortError'));

              if (isAbortError) {
                // ✅ TIMEOUT: Do NOT fail buffer on timeout!
                // The partially buffered chunks are still valid for resumption
                // Frontend can poll KV to retrieve whatever was buffered
                return;
              }

              // Buffer failure shouldn't break streaming - only mark failed on real errors
              const errorMessage
                = error instanceof Error ? error.message : 'Stream buffer error';
              await failParticipantStreamBuffer(streamMessageId, errorMessage, c.env);

              // ✅ AUTO-RECOVERY: Queue check-round-completion on stream failure
              // This ensures round can continue even if this stream fails mid-way
              if (c.env.ROUND_ORCHESTRATION_QUEUE) {
                try {
                  const recoveryMessage: CheckRoundCompletionQueueMessage = {
                    type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
                    messageId: `check-${threadId}-r${currentRoundNumber}-stale-${Date.now()}`,
                    threadId,
                    roundNumber: currentRoundNumber,
                    userId: user.id,
                    sessionToken,
                    reason: CheckRoundCompletionReasons.STALE_STREAM,
                    queuedAt: new Date().toISOString(),
                  };
                  await c.env.ROUND_ORCHESTRATION_QUEUE.send(recoveryMessage);
                } catch {
                  // Queue send failed - non-critical
                }
              }
            } finally {
              // ✅ FIX: Always release the reader lock to prevent "unused stream branch" warnings
              // This ensures the stream is properly consumed/cleaned up in Cloudflare Workers
              try {
                reader.releaseLock();
              } catch {
                // Reader already released or stream already closed - ignore
              }
            }
          };

          // Use waitUntil to buffer asynchronously without blocking response
          if (executionCtx) {
            executionCtx.waitUntil(bufferStream());
          } else {
            bufferStream().catch(() => {});
          }
        },

        onError: (error) => {
          // ✅ DEBUG: Handle plain objects (JSON.stringify to see structure)
          const isErrorInstance = error instanceof Error;
          const errMsg = isErrorInstance
            ? error.message.substring(0, 200)
            : (typeof error === 'object' && error !== null ? JSON.stringify(error).substring(0, 500) : String(error));
          console.error(`[Stream:P${participantIndex}] CLIENT_ERR model=${participant.modelId} isErr=${isErrorInstance} msg=${errMsg}`);

          // ✅ TYPE-SAFE ERROR EXTRACTION: Use error utility for consistent error handling
          const streamErrorMessage = getErrorMessage(error);
          const errorName = getErrorName(error);

          // ✅ BACKGROUND STREAMING: Detect ONLY actual timeout aborts
          // Abort errors come from AbortSignal.timeout() when stream exceeds time limit
          // On timeout, we preserve stream state - partial content may be valid
          //
          // ⚠️ IMPORTANT: Do NOT check for generic "abort" or "cancel" strings!
          // Provider errors (rate limits, model unavailable, etc.) may contain these words
          // but should NOT be suppressed. Only suppress actual AbortError instances.
          const isAbortError
            = error instanceof Error
              && (error.name === 'AbortError'
                || (error.cause instanceof Error
                  && error.cause.name === 'AbortError'));

          if (isAbortError) {
            // ✅ TIMEOUT: Return empty string to suppress error
            // Stream buffer remains intact in KV for resumption
            // Frontend can poll GET /api/v1/chat/threads/{id}/stream to retrieve chunks
            return '';
          }

          // =========================================================================
          // ✅ RESUMABLE STREAMS: Mark stream as failed for resume detection (real errors only)
          // =========================================================================
          markStreamFailed(
            threadId,
            currentRoundNumber,
            participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
            streamErrorMessage,
            c.env,
          ).catch(() => {
            // Silently fail - don't break error handling
          });

          // ✅ AUTO-RECOVERY: Queue check-round-completion on stream error
          // This ensures round can continue even if this stream fails
          if (c.env.ROUND_ORCHESTRATION_QUEUE) {
            c.env.ROUND_ORCHESTRATION_QUEUE.send({
              type: RoundOrchestrationMessageTypes.CHECK_ROUND_COMPLETION,
              messageId: `check-${threadId}-r${currentRoundNumber}-error-${Date.now()}`,
              threadId,
              roundNumber: currentRoundNumber,
              userId: user.id,
              sessionToken,
              reason: CheckRoundCompletionReasons.STALE_STREAM,
              queuedAt: new Date().toISOString(),
            } satisfies CheckRoundCompletionQueueMessage).catch(() => {
              // Queue send failed - non-critical
            });
          }

          // ✅ PERFORMANCE OPTIMIZATION: Non-blocking error tracking
          // PostHog error tracking runs asynchronously via waitUntil()
          const trackError = async () => {
            try {
              await trackLLMError(
                trackingContext,
                normalizeError(error),
                llmTraceId,
                'streaming',
              );
            } catch {
              // Silently fail - never break error handling flow
            }
          };

          if (executionCtx) {
            executionCtx.waitUntil(trackError());
          } else {
            trackError().catch(() => {});
          }

          // Suppress DeepSeek logprobs validation errors (non-conforming API structure)
          if (
            errorName === 'AI_TypeValidationError'
            && streamErrorMessage.includes('logprobs')
          ) {
            // Return empty string to indicate error was handled and stream should continue
            return '';
          }

          // ✅ AI SDK V6 PATTERN: Detect RetryError for retry exhaustion
          // Reference: ai-sdk-v6-crash-course exercise 07.04 - Error Handling in Streaming
          // When all retry attempts are exhausted, AI SDK throws RetryError
          if (RetryError.isInstance(error)) {
            return JSON.stringify({
              errorName: 'RetryError',
              errorType: 'retry_exhausted',
              errorCategory: 'provider_rate_limit',
              errorMessage:
                'Maximum retries exceeded. The model provider is currently unavailable. Please try again later.',
              isTransient: true,
              shouldRetry: false, // All retries already exhausted by AI SDK
              participantId: participant.id,
              modelId: participant.modelId,
              participantRole: participant.role,
              traceId: llmTraceId, // ✅ Include trace ID for debugging correlation
            });
          }

          const errorMetadata = structureAIProviderError(
            error,
            {
              id: participant.id,
              modelId: participant.modelId,
              role: participant.role,
            },
            llmTraceId, // ✅ Include trace ID for debugging correlation
          );

          return JSON.stringify(errorMetadata);
        },
      });

      // =========================================================================
      // ✅ AI SDK V6 PATTERN: Consume stream to ensure onFinish runs on client disconnect
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#handling-client-disconnects
      // consumeStream removes backpressure, ensuring the stream completes even if client disconnects.
      // This guarantees onFinish callback runs to queue next participant/moderator.
      // =========================================================================
      finalResult.consumeStream(); // no await - runs in background

      // =========================================================================
      // Return the stream - Pre-search now handled by separate /chat/pre-search endpoint
      // =========================================================================
      return baseStreamResponse;
    },
  );
