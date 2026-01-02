/**
 * Streaming Handler - Real-time AI response streaming with SSE
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Refactored to use service layer for better maintainability
 *
 * This handler orchestrates multi-participant AI conversations with streaming responses.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import {
  extractReasoningMiddleware,
  RetryError,
  smoothStream,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { and, asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { executeBatch } from '@/api/common/batch-operations';
import {
  createError,
  structureAIProviderError,
} from '@/api/common/error-handling';
import {
  extractAISdkError,
  getErrorMessage,
  getErrorName,
  getErrorStatusCode,
} from '@/api/common/error-types';
import { createHandler } from '@/api/core';
import {
  FinishReasons,
  MessageRoles,
  ParticipantStreamStatuses,
  UIMessageRoles,
} from '@/api/core/enums';
import {
  finalizeCredits,
  releaseReservation,
  reserveCredits,
} from '@/api/services/credit.service';
import { saveStreamedMessage } from '@/api/services/message-persistence.service';
import {
  getModelById,
  isDeepSeekModel,
  isNanoOrMiniVariant,
  isOSeriesModel,
  needsSmoothStream,
} from '@/api/services/models-config.service';
import {
  initializeOpenRouter,
  openRouterService,
} from '@/api/services/openrouter.service';
import { processParticipantChanges } from '@/api/services/participant-config.service';
import {
  createTrackingContext,
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/api/services/posthog-llm-tracking.service';
import { AI_RETRY_CONFIG, AI_TIMEOUT_CONFIG, estimateStreamingCredits, getSafeMaxOutputTokens } from '@/api/services/product-logic.service';
import { buildParticipantSystemPrompt } from '@/api/services/prompts.service';
import { handleRoundRegeneration } from '@/api/services/regeneration.service';
import {
  markStreamActive,
  markStreamCompleted,
  markStreamFailed,
  setThreadActiveStream,
  updateParticipantStatus,
} from '@/api/services/resumable-stream-kv.service';
import { calculateRoundNumber } from '@/api/services/round.service';
import {
  appendStreamChunk,
  completeStreamBuffer,
  failStreamBuffer,
  initializeStreamBuffer,
} from '@/api/services/stream-buffer.service';
import {
  buildSystemPromptWithContext,
  extractUserQuery,
  loadParticipantConfiguration,
  prepareValidatedMessages,
} from '@/api/services/streaming-orchestration.service';
// ✅ SINGLE SOURCE OF TRUTH: Using global Ai type from cloudflare-env.d.ts
import {
  logModeChange,
  logWebSearchToggle,
} from '@/api/services/thread-changelog.service';
import {
  getUserTier,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import type { CitableSource } from '@/api/types/citations';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { isModeratorMessageMetadata } from '@/db/schemas/chat-metadata';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { completeStreamingMetadata, createStreamingMetadata, getRoundNumber } from '@/lib/utils';

import type { streamChatRoute } from '../route';
import { StreamChatRequestSchema } from '../schema';
import { chatMessagesToUIMessages } from './helpers';

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
      // ✅ PERFORMANCE OPTIMIZATION: Capture executionCtx for non-blocking analytics
      // PostHog tracking will use this to run asynchronously via waitUntil()
      const executionCtx = c.executionCtx;

      const { user } = c.auth();
      const {
        message,
        id: threadId,
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
        throw createError.badRequest('Thread ID is required for streaming');
      }

      const db = await getDbAsync();

      // =========================================================================
      // STEP 2: Load thread and verify ownership
      // =========================================================================
      const thread = await db.query.chatThread.findFirst({
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
      });

      if (!thread) {
        throw createError.notFound('Thread not found');
      }

      if (thread.userId !== user.id) {
        throw createError.unauthorized('Not authorized to access this thread');
      }

      // =========================================================================
      // STEP 3: Calculate round number (needed for pre-search and regeneration)
      // =========================================================================
      const roundResult = await calculateRoundNumber({
        threadId,
        participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        message,
        regenerateRound,
        db,
      });

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
          throw new HTTPException(409, {
            message: `Round ${currentRoundNumber} already has assistant responses. Cannot create new user message in a completed round. Expected round ${currentRoundNumber + 1}.`,
          });
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
      // STEP 5: Handle mode change (if provided)
      // =========================================================================
      if (
        providedMode
        && providedMode !== thread.mode
        && participantIndex === 0
      ) {
        // ✅ CRITICAL FIX: Use nextRoundNumber for consistency with thread.handler.ts
        // Changelog should appear BEFORE the next round (same pattern as thread.handler.ts:488, 571)
        // This ensures changelog appears between current round and next round messages
        const nextRoundNumber = currentRoundNumber + 1;

        // Update thread mode
        await db
          .update(tables.chatThread)
          .set({
            mode: providedMode,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
        await logModeChange(
          threadId,
          nextRoundNumber,
          thread.mode,
          providedMode,
        );

        thread.mode = providedMode;
      }

      // =========================================================================
      // STEP 5.5: Handle web search toggle (if provided)
      // =========================================================================
      if (
        providedEnableWebSearch !== undefined
        && providedEnableWebSearch !== thread.enableWebSearch
        && participantIndex === 0
      ) {
        // ✅ CRITICAL FIX: Use nextRoundNumber for consistency with thread.handler.ts
        // Changelog should appear BEFORE the next round
        const nextRoundNumber = currentRoundNumber + 1;

        // Update thread web search setting
        await db
          .update(tables.chatThread)
          .set({
            enableWebSearch: providedEnableWebSearch,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId));

        // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
        await logWebSearchToggle(
          threadId,
          nextRoundNumber,
          providedEnableWebSearch,
        );

        thread.enableWebSearch = providedEnableWebSearch;
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
      // STEP 8: Load Previous Messages and Prepare for Streaming
      // =========================================================================
      const allDbMessages = await db.query.chatMessage.findMany({
        where: eq(tables.chatMessage.threadId, threadId),
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      // ✅ FIX: Filter out moderator messages from conversation context
      // Moderator messages are round summaries that should not be included in
      // the context sent to AI models - they would cause models to repeat the summary
      const previousDbMessages = allDbMessages.filter(
        msg => !msg.metadata || !isModeratorMessageMetadata(msg.metadata),
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
        const lastMessage = message;
        const existsInDb = await db.query.chatMessage.findFirst({
          where: eq(tables.chatMessage.id, lastMessage.id),
        });

        if (!existsInDb) {
          // Message should have been created via PATCH - log warning if missing
          console.error(`[stream] User message not found in DB, expected pre-persisted: ${lastMessage.id}`);
          // Don't create it here - this indicates a bug in the message persistence flow
        }
      }

      // =========================================================================
      // STEP 10: Initialize OpenRouter and Prepare Messages
      // =========================================================================
      initializeOpenRouter(c.env);
      const client = openRouterService.getClient();
      const userTier = await getUserTier(user.id);

      // Get model info for token limits and pricing
      const modelInfo = getModelById(participant.modelId);
      const modelContextLength = modelInfo?.context_length || 16000;
      const modelPricing = modelInfo
        ? {
            input: Number.parseFloat(modelInfo.pricing.prompt) * 1_000_000,
            output: Number.parseFloat(modelInfo.pricing.completion) * 1_000_000,
          }
        : undefined;

      // Prepare and validate messages
      const modelMessages = await prepareValidatedMessages({
        previousDbMessages,
        newMessage: message,
        r2Bucket: c.env.UPLOADS_R2_BUCKET,
        db,
        attachmentIds,
      }).then(result => result.modelMessages);

      // Build system prompt with RAG context and citation support
      const userQuery = extractUserQuery([
        ...previousMessages,
        message,
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
          attachmentIds,
        });

      const availableSources = citableSources
        .filter((source): source is CitableSource => source.type === 'attachment')
        .map(source => ({
          id: source.id,
          sourceType: source.type,
          title: source.title,
          downloadUrl: source.metadata.downloadUrl,
          filename: source.metadata.filename,
          mimeType: source.metadata.mimeType,
          fileSize: source.metadata.fileSize,
        }));

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
       * Framework type bridge: OpenRouter returns LanguageModelV1 but wrapLanguageModel
       * expects a narrower LanguageModel type. Both are runtime-compatible for streaming.
       * @see AI SDK docs: https://sdk.vercel.ai/docs/ai-sdk-core/middleware
       */
      const modelForStreaming = isDeepSeek
        ? wrapLanguageModel({
            model: baseModel as unknown as Parameters<typeof wrapLanguageModel>[0]['model'],
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
        // ✅ REASONING: Add providerOptions for o1/o3/o4/DeepSeek R1 models
        ...(providerOptions && { providerOptions }),
        // ✅ CHUNK NORMALIZATION: Normalize streaming for models with buffered chunk delivery
        // Some providers (xAI/Grok, DeepSeek, Gemini) buffer server-side, sending large chunks
        // (sometimes entire paragraphs) instead of token-by-token. This causes UI jumpiness.
        //
        // needsSmoothStream() checks PROVIDER_STREAMING_DEFAULTS enum for provider behavior.
        // smoothStream re-chunks at word boundaries with controlled delay for consistent UX.
        // @see /src/api/core/enums/models.ts - StreamingBehaviors enum
        // @see /src/api/services/models-config.service.ts - needsSmoothStream()
        ...(needsSmoothStream(participant.modelId) && {
          experimental_transform: smoothStream({
            delayInMs: 20,
            chunking: 'word',
          }),
        }),
        maxRetries: AI_RETRY_CONFIG.maxAttempts, // AI SDK handles retries
        // ✅ BACKGROUND STREAMING: Only use timeout signal, NOT HTTP abort signal
        // This allows AI generation to continue even if client disconnects
        // Chunks are buffered to KV via consumeSseStream for resumption
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
        // ✅ AI SDK V6 TELEMETRY: Enable experimental telemetry for OpenTelemetry integration
        // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/telemetry
        // This enables automatic trace generation that can be exported to any OpenTelemetry-compatible backend
        experimental_telemetry: {
          isEnabled: true,
          functionId: `chat.thread.${threadId}.participant.${participantIndex}`,
          // Record inputs/outputs for full observability (PostHog best practice)
          recordInputs: true,
          recordOutputs: true,
          // Custom metadata for telemetry traces (enriched with all relevant context)
          metadata: {
            // Thread/conversation context
            thread_id: threadId,
            round_number: currentRoundNumber,
            conversation_mode: thread.mode,

            // Participant context
            participant_id: participant.id,
            participant_index: participantIndex,
            participant_role: participant.role || 'no-role',
            is_first_participant: participantIndex === 0,
            total_participants: participants.length,

            // Model context
            model_id: participant.modelId,
            model_name: modelInfo?.name || participant.modelId,
            model_context_length: modelContextLength,
            max_output_tokens: maxOutputTokens,

            // User context
            user_id: user.id,
            user_tier: userTier,

            // Request context
            is_regeneration: !!regenerateRound,
            rag_enabled: systemPrompt !== baseSystemPrompt,
            has_custom_system_prompt: !!participant.settings?.systemPrompt,

            // Reasoning model context
            is_reasoning_model: modelInfo?.is_reasoning_model ?? false,
            reasoning_enabled: !!providerOptions,

            // Performance expectations
            estimated_input_tokens: estimatedInputTokens,

            // Pricing context (for cost tracking) - only include if defined
            uses_dynamic_pricing: !!modelPricing,
            ...(modelPricing?.input && {
              input_cost_per_million: modelPricing.input,
            }),
            ...(modelPricing?.output && {
              output_cost_per_million: modelPricing.output,
            }),
          },
        },
        // ✅ CONDITIONAL RETRY: Don't retry validation errors (400), authentication errors (401, 403)
        // These are permanent errors that won't be fixed by retrying
        shouldRetry: ({ error }: { error: unknown }) => {
          // ✅ TYPE-SAFE ERROR EXTRACTION: Use utility functions instead of unsafe casting
          const statusCode = getErrorStatusCode(error);
          const errorName = getErrorName(error) || '';
          const aiError = extractAISdkError(error);

          // Don't retry AI SDK type validation errors - these are provider response format issues
          // that won't be fixed by retrying. The stream already partially succeeded.
          if (errorName === 'AI_TypeValidationError') {
            return false;
          }

          // Don't retry validation errors (400) - malformed requests
          if (statusCode === 400) {
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
          if (statusCode === 401 || statusCode === 403) {
            return false;
          }

          // Don't retry model not found errors (404) - model doesn't exist
          if (statusCode === 404) {
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

      // ✅ DEFENSIVE CHECK: Check for existing message with same ID
      // This handles retries and race conditions gracefully
      // Instead of throwing error, log warning and continue with idempotent behavior
      const existingMessage = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, streamMessageId),
      });

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

      // =========================================================================
      // ✅ CREDIT RESERVATION: Reserve credits BEFORE streaming begins
      // Pre-reserve estimated credits to prevent overdraft during streaming
      // Actual credits are finalized in onFinish after token count is known
      // =========================================================================
      const estimatedCredits = estimateStreamingCredits(participants.length);
      await reserveCredits(user.id, streamMessageId, estimatedCredits);

      // =========================================================================
      // ✅ RESUMABLE STREAMS: Initialize stream buffer for resumption
      // =========================================================================
      await initializeStreamBuffer(
        streamMessageId,
        threadId,
        currentRoundNumber,
        participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        c.env,
      );

      // ✅ RESUMABLE STREAMS: Mark stream as active in KV for resume detection
      await markStreamActive(
        threadId,
        currentRoundNumber,
        participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        c.env,
      );

      // ✅ RESUMABLE STREAMS: Set thread-level active stream for AI SDK resume pattern
      // This enables the frontend to detect and resume this stream after page reload
      // ✅ FIX: Pass total participants count for proper round-level tracking
      await setThreadActiveStream(
        threadId,
        streamMessageId,
        currentRoundNumber,
        participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
        participants.length, // ✅ FIX: Track total participants for round completion detection
        c.env,
      );

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
          // ✅ CREDIT RELEASE: Release reserved credits on error
          // We don't know how many credits were reserved, so we pass estimatedCredits
          try {
            await releaseReservation(user.id, streamMessageId, estimatedCredits);
          } catch (releaseError) {
            console.error('[StreamText onError] Failed to release credit reservation:', releaseError);
          }

          // ✅ ERROR LOGGING: Log error for debugging
          console.error('[StreamText onError]', {
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage:
              error instanceof Error ? error.message : String(error),
            modelId: participant.modelId,
            participantId: participant.id,
            threadId,
            roundNumber: currentRoundNumber,
          });

          // ✅ BACKGROUND STREAMING: Detect timeout aborts
          // Since we removed HTTP abort signal (Phase 1.1), abort errors now only come from:
          // - AbortSignal.timeout() - stream exceeded time limit
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
            await markStreamFailed(
              threadId,
              currentRoundNumber,
              participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
              error instanceof Error ? error.message : String(error),
              c.env,
            );
            // ✅ FIX: Update participant status to 'failed' instead of clearing entirely
            // Only clears thread active stream when ALL participants have finished
            await updateParticipantStatus(
              threadId,
              currentRoundNumber,
              participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
              ParticipantStreamStatuses.FAILED,
              c.env,
            );
          } catch {
            // Cleanup errors shouldn't break error handling flow
          }
        },

        // ✅ PERSIST MESSAGE: Save to database after streaming completes
        onFinish: async (finishResult) => {
          const messageId = streamMessageId;

          // ✅ CRITICAL FIX: Detect and handle empty responses before persistence
          // Models like DeepSeek R1, gemini-2.5-flash-lite return empty responses
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
          // - deepseek/deepseek-r1: finishReason='stop', 0 tokens, no text
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
            userId: user.id,
            db,
            citationSourceMap,
            availableSources,
            // ✅ REASONING DURATION: Pass duration for "Thought for X seconds" display
            reasoningDuration: finalReasoningDuration,
            // ✅ EMPTY RESPONSE ERROR: Pass error for messages with no renderable content
            emptyResponseError,
          });

          // =========================================================================
          // ✅ CREDIT FINALIZATION: Deduct actual credits based on token usage
          // Releases reservation and deducts actual credits used
          // =========================================================================
          const actualInputTokens = finishResult.usage?.inputTokens ?? 0;
          const actualOutputTokens = finishResult.usage?.outputTokens ?? 0;

          await finalizeCredits(user.id, streamMessageId, {
            inputTokens: actualInputTokens,
            outputTokens: actualOutputTokens,
            action: 'ai_response',
            threadId,
            messageId,
            modelId: participant.modelId,
          });

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
                            return { type: 'text', text: part.text };
                          }
                          if (part.type === 'image') {
                            return { type: 'image', text: '[image content]' };
                          }
                          return { type: 'unknown', text: '[content]' };
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
            // For multi-step reasoning (e.g., o1, o3, DeepSeek R1), totalUsage includes ALL steps
            const totalUsage
              = 'totalUsage' in finishResult && finishResult.totalUsage
                ? {
                    inputTokens: finishResult.totalUsage.inputTokens ?? 0,
                    outputTokens: finishResult.totalUsage.outputTokens ?? 0,
                    totalTokens:
                      finishResult.totalUsage.totalTokens
                      ?? (finishResult.totalUsage.inputTokens ?? 0)
                      + (finishResult.totalUsage.outputTokens ?? 0),
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
                      promptVersion: 'v1.0', // Version your prompts for experimentation
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
          // ✅ RESUMABLE STREAMS: Mark stream as completed for resume detection
          // =========================================================================
          await markStreamCompleted(
            threadId,
            currentRoundNumber,
            participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
            messageId,
            c.env,
          );

          // ✅ FIX: Update participant status instead of clearing thread active stream
          // Only clears thread active stream when ALL participants have finished
          // This enables proper multi-participant stream resumption after page reload
          await updateParticipantStatus(
            threadId,
            currentRoundNumber,
            participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
            ParticipantStreamStatuses.COMPLETED,
            c.env,
          );
        },
      });

      // ✅ AI SDK V6 OFFICIAL PATTERN: No need to manually consume stream
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
      // The toUIMessageStreamResponse() method handles stream consumption automatically.
      // The onFinish callback will run when the stream completes successfully or on error.
      // Client disconnects are handled by the Response stream - onFinish will still fire.

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
            try {
              const reader = stream.getReader();

              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  // Stream completed - mark buffer as complete
                  await completeStreamBuffer(streamMessageId, c.env);
                  break;
                }

                // Value is already a string from ReadableStream<string>
                // Append chunk to buffer
                await appendStreamChunk(streamMessageId, value, c.env);
              }
            } catch (error) {
              // ✅ BACKGROUND STREAMING: Detect timeout aborts
              // Since we removed HTTP abort signal (Phase 1.1), abort errors now only come from timeouts
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
              await failStreamBuffer(streamMessageId, errorMessage, c.env);
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
          // ✅ TYPE-SAFE ERROR EXTRACTION: Use error utility for consistent error handling
          const streamErrorMessage = getErrorMessage(error);
          const errorName = getErrorName(error);
          const statusCode = getErrorStatusCode(error);

          // ✅ ERROR LOGGING: Log full error details for debugging
          // ✅ TYPE-SAFE: Use extractAISdkError for responseBody extraction
          const aiSdkError = extractAISdkError(error);
          console.error('[Streaming Error]', {
            errorName,
            errorMessage: streamErrorMessage,
            statusCode,
            modelId: participant.modelId,
            participantId: participant.id,
            threadId,
            roundNumber: currentRoundNumber,
            traceId: llmTraceId,
            // Include response body for provider errors (type-safe extraction)
            responseBody: aiSdkError?.responseBody?.substring(0, 500),
          });

          // ✅ BACKGROUND STREAMING: Detect ONLY actual timeout aborts
          // Since we removed HTTP abort signal (Phase 1.1), abort errors now only come from:
          // - AbortSignal.timeout() - stream exceeded time limit
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

          // ✅ PERFORMANCE OPTIMIZATION: Non-blocking error tracking
          // PostHog error tracking runs asynchronously via waitUntil()
          const trackError = async () => {
            try {
              await trackLLMError(
                trackingContext,
                error as Error,
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

          // ✅ DEEPSEEK R1 WORKAROUND: Suppress logprobs validation errors
          // These are non-fatal errors from DeepSeek R1's non-conforming logprobs structure
          // Reference: https://github.com/vercel/ai/issues/9087
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
      // Return the stream - Pre-search now handled by separate /chat/pre-search endpoint
      // =========================================================================
      return baseStreamResponse;
    },
  );
