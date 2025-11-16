/**
 * Streaming Handler - Real-time AI response streaming with SSE
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Refactored to use service layer for better maintainability
 *
 * This handler orchestrates multi-participant AI conversations with streaming responses.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { RetryError, streamText } from 'ai';
import { and, asc, eq } from 'drizzle-orm';

import { executeBatch } from '@/api/common/batch-operations';
import { createError, structureAIProviderError } from '@/api/common/error-handling';
import { createHandler } from '@/api/core';
import { AnalysisStatuses } from '@/api/core/enums';
import { saveStreamedMessage } from '@/api/services/message-persistence.service';
import { getModelById } from '@/api/services/models-config.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { processParticipantChanges } from '@/api/services/participant-config.service';
import {
  createTrackingContext,
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/api/services/posthog-llm-tracking.service';
import {
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  getSafeMaxOutputTokens,
} from '@/api/services/product-logic.service';
import { buildParticipantSystemPrompt } from '@/api/services/prompts.service';
import { handleRoundRegeneration } from '@/api/services/regeneration.service';
import { calculateRoundNumber } from '@/api/services/round.service';
import type { CloudflareAiBinding } from '@/api/services/streaming-orchestration.service';
import {
  buildSystemPromptWithContext,
  extractUserQuery,
  loadParticipantConfiguration,
  prepareValidatedMessages,
} from '@/api/services/streaming-orchestration.service';
import { logModeChange, logWebSearchToggle } from '@/api/services/thread-changelog.service';
import {
  enforceMessageQuota,
  getUserTier,
  incrementMessageUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { DEFAULT_PARTICIPANT_INDEX } from '@/lib/schemas/participant-schemas';
import { completeStreamingMetadata, createStreamingMetadata } from '@/lib/utils/metadata-builder';

import type { streamChatRoute } from '../route';
import { StreamChatRequestSchema } from '../schema';
import { chatMessagesToUIMessages } from './helpers';

// ============================================================================
// Streaming Chat Handler
// ============================================================================

export const streamChatHandler: RouteHandler<typeof streamChatRoute, ApiEnv> = createHandler(
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
    const { message, id: threadId, participantIndex, participants: providedParticipants, regenerateRound, mode: providedMode, enableWebSearch: providedEnableWebSearch } = c.validated.body;

    // =========================================================================
    // STEP 1: Validate incoming message
    // =========================================================================
    if (!message) {
      throw createError.badRequest('Message is required', { errorType: 'validation' });
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
          orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
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
    // STEP 3.5: ✅ CRITICAL FIX - Create PENDING pre-search BEFORE streaming
    // =========================================================================
    // BUG FIX: Pre-search record must exist BEFORE streaming orchestration starts
    //
    // FLOW:
    // 1. Calculate round number (STEP 3)
    // 2. Create PENDING pre-search record (THIS STEP)
    // 3. Handle regeneration (STEP 4)
    // 4. Streaming orchestration starts (STEP 6+)
    //
    // Why this order matters:
    // - Frontend PreSearchOrchestrator expects record to exist before streaming
    // - Regeneration may delete existing pre-search, so we create fresh PENDING record first
    // - Record creation is idempotent (checks for existing record)
    //
    // Conditions:
    // 1. Web search is enabled (thread.enableWebSearch OR providedEnableWebSearch)
    // 2. This is the first participant (participantIndex === 0)
    // 3. This is NOT a regeneration (regeneration clears existing pre-search)
    // 4. Pre-search record doesn't already exist for this round
    const isFirstParticipant = (participantIndex ?? DEFAULT_PARTICIPANT_INDEX) === DEFAULT_PARTICIPANT_INDEX;
    const effectiveWebSearchEnabled = providedEnableWebSearch ?? thread.enableWebSearch;

    if (effectiveWebSearchEnabled && isFirstParticipant && !regenerateRound) {
      try {
        // Log pre-search creation attempt for debugging
        // console.log(`[PreSearch] Attempting to create PENDING record for round ${currentRoundNumber} (thread: ${threadId})`);

        const existingPreSearch = await db.query.chatPreSearch.findFirst({
          where: and(
            eq(tables.chatPreSearch.threadId, threadId),
            eq(tables.chatPreSearch.roundNumber, currentRoundNumber),
          ),
        });

        if (!existingPreSearch) {
          const { ulid } = await import('ulid');
          const preSearchId = ulid();

          await db.insert(tables.chatPreSearch).values({
            id: preSearchId,
            threadId,
            roundNumber: currentRoundNumber,
            userQuery: extractTextFromParts(message.parts),
            status: AnalysisStatuses.PENDING,
            createdAt: new Date(),
          });

          // ✅ CRITICAL FIX: Check if pre-search should block participant streaming
          // For OVERVIEW screen (round 0): Pre-search is created during thread creation
          // - Frontend waits for COMPLETE before calling startRound
          // For THREAD screen (round N > 0): Pre-search is created HERE
          // - But we continue to create user message below
          // - Frontend pending message effect will wait for PENDING → COMPLETE before sending
          // - This allows user message to be saved while web search executes
        } else if (existingPreSearch.status === AnalysisStatuses.PENDING || existingPreSearch.status === AnalysisStatuses.STREAMING) {
          // Pre-search exists and is in progress - continue
          // Frontend will wait for completion before triggering participants
        } else {
          // Pre-search complete or failed - OK to proceed with participants
        }
      } catch (error) {
        // ✅ Non-blocking: Don't let pre-search creation errors break streaming
        // But DO log the error for debugging
        console.error(`[PreSearch] ❌ Failed to create pre-search for round ${currentRoundNumber}:`, error);
      }
    } else {
      // Log why pre-search creation was skipped
      // console.log(`[PreSearch] ⏭️  Skipping pre-search creation: webSearch=${effectiveWebSearchEnabled}, firstParticipant=${isFirstParticipant}, notRegeneration=${!regenerateRound}`);
    }

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
    if (providedMode && providedMode !== thread.mode && participantIndex === 0) {
      // ✅ CRITICAL FIX: Use nextRoundNumber for consistency with thread.handler.ts
      // Changelog should appear BEFORE the next round (same pattern as thread.handler.ts:488, 571)
      // This ensures changelog appears between current round and next round messages
      const nextRoundNumber = currentRoundNumber + 1;

      // Update thread mode
      await db.update(tables.chatThread)
        .set({
          mode: providedMode,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatThread.id, threadId));

      // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
      await logModeChange(threadId, nextRoundNumber, thread.mode, providedMode);

      thread.mode = providedMode;
    }

    // =========================================================================
    // STEP 5.5: Handle web search toggle (if provided)
    // =========================================================================
    if (providedEnableWebSearch !== undefined && providedEnableWebSearch !== thread.enableWebSearch && participantIndex === 0) {
      // ✅ CRITICAL FIX: Use nextRoundNumber for consistency with thread.handler.ts
      // Changelog should appear BEFORE the next round
      const nextRoundNumber = currentRoundNumber + 1;

      // Update thread web search setting
      await db.update(tables.chatThread)
        .set({
          enableWebSearch: providedEnableWebSearch,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatThread.id, threadId));

      // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
      await logWebSearchToggle(threadId, nextRoundNumber, providedEnableWebSearch);

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
        // ✅ Execute all operations atomically (INSERT new, UPDATE existing, RE-ENABLE, DISABLE removed)
        await executeBatch(db, [
          ...result.insertOps,
          ...result.updateOps,
          ...result.reenableOps,
          ...result.disableOps,
          ...result.changelogOps,
        ]);
      }
    }

    // =========================================================================
    // STEP 7: Load participants (after persistence)
    // =========================================================================
    const { participants, participant } = await loadParticipantConfiguration({
      threadId,
      participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
      providedParticipants,
      thread,
      db,
    });

    // =========================================================================
    // STEP 8: Load Previous Messages and Prepare for Streaming
    // =========================================================================
    const previousDbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });

    // Convert to UIMessages for validation
    const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

    // =========================================================================
    // STEP 9: Save New User Message (ONLY first participant)
    // =========================================================================
    if ((message as UIMessage).role === 'user' && participantIndex === 0) {
      const lastMessage = message as UIMessage;
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
                metadata: {
                  role: 'user', // ✅ FIX: Add role discriminator for type guard
                  roundNumber: currentRoundNumber,
                },
                createdAt: new Date(),
              });
              await incrementMessageUsage(user.id, 1);
            }
          }
        }
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
    const { modelMessages } = await prepareValidatedMessages({
      previousDbMessages,
      newMessage: message as UIMessage,
    });

    // Build system prompt with RAG context
    const userQuery = extractUserQuery([...previousMessages, message as UIMessage]);
    const baseSystemPrompt = participant.settings?.systemPrompt
      || buildParticipantSystemPrompt(participant.role);
    const systemPrompt = await buildSystemPromptWithContext({
      participant,
      thread,
      userQuery,
      previousDbMessages,
      currentRoundNumber,
      env: { AI: c.env.AI as unknown as CloudflareAiBinding },
      db,
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

    // =========================================================================
    // STEP 11: ✅ OFFICIAL AI SDK v5 STREAMING PATTERN
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
      model: client.chat(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      ...(modelSupportsTemperature && { temperature: temperatureValue }),
      maxRetries: AI_RETRY_CONFIG.maxAttempts, // AI SDK handles retries
      abortSignal: AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
      ]),
      // ✅ AI SDK V5 TELEMETRY: Enable experimental telemetry for OpenTelemetry integration
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

          // Performance expectations
          estimated_input_tokens: estimatedInputTokens,

          // Pricing context (for cost tracking) - only include if defined
          uses_dynamic_pricing: !!modelPricing,
          ...(modelPricing?.input && { input_cost_per_million: modelPricing.input }),
          ...(modelPricing?.output && { output_cost_per_million: modelPricing.output }),
        },
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
    const streamMetadata = createStreamingMetadata({
      roundNumber: currentRoundNumber,
      participantId: participant.id,
      participantIndex: participantIndex ?? DEFAULT_PARTICIPANT_INDEX,
      participantRole: participant.role,
      model: participant.modelId,
    });

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

    // =========================================================================
    // ✅ QUOTA DEDUCTION: Enforce and deduct quota BEFORE streaming begins
    // This ensures user is charged even if connection is lost or stream is aborted
    // =========================================================================
    await enforceMessageQuota(user.id);
    await incrementMessageUsage(user.id, 1);

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
        const messageId = streamMessageId;

        // Delegate to message persistence service
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
          participants,
          threadMode: thread.mode,
          db,
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
          const inputMessages = recentModelMessages.map((msg) => {
            return {
              role: msg.role,
              content: typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                  ? msg.content.map((part) => {
                      if ('text' in part) {
                        return { type: 'text', text: part.text };
                      }
                      if ('image' in part) {
                        return { type: 'image', text: '[image content]' };
                      }
                      return { type: 'unknown', text: '[content]' };
                    })
                  : [],
            };
          });

          // ✅ AI SDK V5 TOKEN USAGE: Extract both usage (final step) and totalUsage (cumulative)
          // Reference: https://sdk.vercel.ai/docs/migration-guides/migration-guide-5-0#distinguish-ai-sdk-usage-reporting-in-50
          // In AI SDK 5.0:
          // - usage: Contains token usage from the FINAL STEP only
          // - totalUsage: Contains CUMULATIVE token usage across ALL STEPS (multi-step reasoning)
          const usage = finishResult.usage
            ? {
                inputTokens: finishResult.usage.inputTokens ?? 0,
                outputTokens: finishResult.usage.outputTokens ?? 0,
                totalTokens: finishResult.usage.totalTokens ?? (finishResult.usage.inputTokens ?? 0) + (finishResult.usage.outputTokens ?? 0),
                cachedInputTokens: finishResult.usage.cachedInputTokens,
              }
            : undefined;

          // ✅ AI SDK V5 MULTI-STEP TRACKING: Use totalUsage for cumulative metrics (if available)
          // For single-step generations, totalUsage === usage
          // For multi-step reasoning (e.g., o1, o3, DeepSeek R1), totalUsage includes ALL steps
          const totalUsage = 'totalUsage' in finishResult && finishResult.totalUsage
            ? {
                inputTokens: finishResult.totalUsage.inputTokens ?? 0,
                outputTokens: finishResult.totalUsage.outputTokens ?? 0,
                totalTokens: finishResult.totalUsage.totalTokens ?? (finishResult.totalUsage.inputTokens ?? 0) + (finishResult.totalUsage.outputTokens ?? 0),
              }
            : usage; // Fallback to usage if totalUsage not available

          // ✅ REASONING TOKENS: Use AI SDK's reasoning token count if available
          // AI SDK v5 tracks reasoning tokens for o1/o3/DeepSeek models
          // Fallback to manual calculation from reasoningDeltas if SDK doesn't provide it
          const reasoningText = reasoningDeltas.join('');
          const reasoningTokens = finishResult.reasoning && finishResult.reasoning.length > 0
            ? finishResult.reasoning.reduce((acc, r) => acc + Math.ceil(r.text.length / 4), 0)
            : Math.ceil(reasoningText.length / 4);

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
                  // AI SDK V5: Use usage (final step only)
                  usage,
                  reasoning: finishResult.reasoning,
                  // AI SDK v5: toolCalls and toolResults are already in correct format (ToolCallPart/ToolResultPart)
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
                    promptId: participant.role ? `role_${participant.role.replace(/\s+/g, '_').toLowerCase()}` : 'default',
                    promptVersion: 'v1.0', // Version your prompts for experimentation
                    systemPromptTokens,
                  },

                  // ✅ AI SDK V5: Pass totalUsage for cumulative metrics
                  totalUsage,

                  // ✅ REASONING TOKENS: Pass calculated reasoning tokens
                  reasoningTokens,

                  // Additional custom properties for analytics
                  additionalProperties: {
                    message_id: messageId,
                    reasoning_length_chars: reasoningText.length,
                    reasoning_from_sdk: !!(finishResult.reasoning && finishResult.reasoning.length > 0),
                    rag_context_used: systemPrompt !== baseSystemPrompt,
                    sdk_version: 'ai-sdk-v5',
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
      },
    });

    // ✅ AI SDK V5 OFFICIAL PATTERN: No need to manually consume stream
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // The toUIMessageStreamResponse() method handles stream consumption automatically.
    // The onFinish callback will run when the stream completes successfully or on error.
    // Client disconnects are handled by the Response stream - onFinish will still fire.

    // Get the base stream response
    // ✅ CRITICAL FIX: Filter out assistant messages from current round
    // AI SDK Bug: toUIMessageStreamResponse() reuses the last assistant message ID
    // instead of calling generateMessageId() when originalMessages ends with assistant
    // For multi-participant: exclude concurrent assistant responses (same round)
    const filteredOriginalMessages = previousMessages.filter((m) => {
      // Exclude the new user message (frontend already has it)
      if (m.id === (message as UIMessage).id)
        return false;

      // ✅ CRITICAL: Exclude assistant messages from current round
      // These are concurrent participant responses, not conversation history
      if (m.role === 'assistant') {
        const msgMeta = m.metadata as { roundNumber?: number } | undefined;
        if (msgMeta?.roundNumber === currentRoundNumber) {
          return false;
        }
      }

      return true;
    });

    const baseStreamResponse = finalResult.toUIMessageStreamResponse({
      sendReasoning: true, // Stream reasoning for o1/o3/DeepSeek models

      // ✅ OFFICIAL PATTERN: Pass original messages for type-safe metadata
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
      // ✅ CRITICAL FIX: Use previousMessages but exclude the new user message
      // The frontend's aiSendMessage() already adds the user message to state
      // Backend shouldn't re-send it in originalMessages to avoid duplication
      // Filter out the new message by ID to handle race conditions where subsequent
      // participants might query the DB after participant 0 saved the message
      originalMessages: filteredOriginalMessages,

      // ✅ DETERMINISTIC MESSAGE ID: Server-side generation using composite key
      // Format: {threadId}_r{roundNumber}_p{participantId}
      // Uniqueness guaranteed by business logic, not random generation
      // No collision risk - each participant can only respond once per round
      generateMessageId: () => streamMessageId,

      // ✅ AI SDK V5 OFFICIAL PATTERN: Inject participant metadata at stream lifecycle events
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

      onError: (error) => {
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
        const err = error as Error & { name?: string };
        if (err?.name === 'AI_TypeValidationError' && err?.message?.includes('logprobs')) {
          // Return empty string to indicate error was handled and stream should continue
          return '';
        }

        // ✅ AI SDK V5 PATTERN: Detect RetryError for retry exhaustion
        // Reference: ai-sdk-v5-crash-course exercise 07.04 - Error Handling in Streaming
        // When all retry attempts are exhausted, AI SDK throws RetryError
        if (RetryError.isInstance(error)) {
          return JSON.stringify({
            errorName: 'RetryError',
            errorType: 'retry_exhausted',
            errorCategory: 'provider_rate_limit',
            errorMessage: 'Maximum retries exceeded. The model provider is currently unavailable. Please try again later.',
            isTransient: true,
            shouldRetry: false, // All retries already exhausted by AI SDK
            participantId: participant.id,
            modelId: participant.modelId,
            participantRole: participant.role,
            traceId: llmTraceId, // ✅ Include trace ID for debugging correlation
          });
        }

        // ✅ REFACTORED: Use shared error utility from /src/api/common/error-handling.ts
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
