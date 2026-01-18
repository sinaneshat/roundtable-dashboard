/**
 * Moderator Handler - Council moderator text streaming
 *
 * Generates and streams council moderator analysis as text (like participant messages).
 * Council moderator is stored in chatMessage table with metadata.isModerator: true.
 * Frontend renders moderator messages via ChatMessageList component.
 *
 * ✅ ARCHITECTURE: Moderator is a message, not a separate entity
 * ✅ STORAGE: chatMessage table with isModerator metadata flag
 * ✅ RENDERING: ChatMessageList handles both participants and moderator
 * ✅ STREAMING: Uses streamText + toUIMessageStreamResponse pattern
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { MessagePartTypes, MessageRoles, PlanTypes, PollingStatuses, RoundExecutionPhases } from '@roundtable/shared/enums';
import { asc, eq } from 'drizzle-orm';

import { createError } from '@/common/error-handling';
import { getErrorMessage, getErrorName, toError } from '@/common/error-types';
import { verifyThreadOwnership } from '@/common/permissions';
import { AIModels, createHandler, Responses, ThreadRoundParamSchema } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbModeratorMessageMetadata } from '@/db/schemas/chat-metadata';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas/participant-schemas';
import { getParticipantIndex } from '@/lib/utils';
import {
  AI_TIMEOUT_CONFIG,
  checkFreeUserHasCompletedRound,
  enforceCredits,
  finalizeCredits,
  getUserCreditBalance,
  zeroOutFreeUserCredits,
} from '@/services/billing';
import {
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/services/errors';
import { filterDbToParticipantMessages } from '@/services/messages';
import { extractModeratorModelName, initializeOpenRouter, openRouterService } from '@/services/models';
import {
  buildCouncilModeratorSystemPrompt,
} from '@/services/prompts';
import { getRoundExecutionState } from '@/services/round-orchestration';
import {
  appendParticipantStreamChunk,
  clearActiveParticipantStream,
  clearThreadActiveStream,
  completeParticipantStreamBuffer,
  failParticipantStreamBuffer,
  initializeParticipantStreamBuffer,
  markStreamActive,
  setThreadActiveStream,
} from '@/services/streaming';
import type { ApiEnv } from '@/types';

import type { councilModeratorRoundRoute } from '../route';
import type { ModeratorPromptConfig, ParticipantResponse } from '../schema';
import { RoundModeratorRequestSchema } from '../schema';

// ============================================================================
// LAZY AI SDK LOADING
// ============================================================================

// Cache the AI SDK module to avoid repeated dynamic imports
// This is critical for Cloudflare Workers which have a 400ms startup limit
let aiSdkModule: typeof import('ai') | null = null;

async function getAiSdk() {
  if (!aiSdkModule) {
    aiSdkModule = await import('ai');
  }
  return aiSdkModule;
}

// ============================================================================
// Constants
// ============================================================================

/** Moderator participant index sentinel value */
const MODERATOR_PARTICIPANT_INDEX = NO_PARTICIPANT_SENTINEL;

// ============================================================================
// Prompt Building - Uses Centralized Prompts Service
// ============================================================================
// ✅ SINGLE SOURCE: Moderator prompts defined in prompts.service.ts
// See: buildCouncilModeratorSystemPrompt, ParticipantResponse (from schema)

// ============================================================================
// Council Moderator Generation (Text Streaming - Like Participants)
// ============================================================================

/**
 * Extended config for council moderator generation
 * Combines schema-validated prompt config with runtime context
 */
type ModeratorGenerationConfig = {
  env: ApiEnv['Bindings'];
  messageId: string;
  threadId: string;
  userId: string;
  sessionId?: string;
  executionCtx?: ExecutionContext;
} & ModeratorPromptConfig;

/**
 * Generate council moderator using text streaming
 *
 * ✅ SCHEMA-DRIVEN: Uses ModeratorPromptConfig for prompt data
 * ✅ TYPE-SAFE: All participant responses validated via ParticipantResponseSchema
 * ✅ PATTERN: Follows same streaming pattern as participant messages
 * ✅ LAZY LOAD: AI SDK is lazy-loaded at invocation time
 */
async function generateCouncilModerator(
  config: ModeratorGenerationConfig,
  c: { env: ApiEnv['Bindings'] },
) {
  // ✅ LAZY LOAD AI SDK: Load at invocation, not module startup
  const { streamText } = await getAiSdk();

  const { roundNumber, mode, userQuestion, participantResponses, env, messageId, threadId, userId, sessionId, executionCtx } = config;

  const llmTraceId = generateTraceId();
  const llmStartTime = performance.now();

  initializeOpenRouter(env);
  const client = openRouterService.getClient();
  const moderatorModelId = AIModels.COUNCIL_MODERATOR;
  const moderatorModelName = extractModeratorModelName(moderatorModelId);

  // ✅ SINGLE SOURCE: Uses buildCouncilModeratorSystemPrompt from prompts.service.ts
  const systemPrompt = buildCouncilModeratorSystemPrompt(
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
  );

  // Build initial moderator metadata (streaming state)
  const streamMetadata: DbModeratorMessageMetadata = {
    role: MessageRoles.ASSISTANT,
    isModerator: true,
    roundNumber,
    model: moderatorModelId,
    hasError: false,
  };

  // ✅ TEXT STREAMING: Use streamText like participants
  const finalResult = streamText({
    model: client.chat(moderatorModelId),
    system: systemPrompt,
    prompt: 'Analyze this council discussion and produce the moderator analysis in markdown format.',
    temperature: 0.3,
    maxOutputTokens: 8192,
    // ✅ STREAMING TIMEOUT: 15 min for complex moderator analysis
    // Cloudflare has UNLIMITED wall-clock - only constraint is 100s idle timeout
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.moderatorAnalysisMs),
    // ✅ TELEMETRY: Enable OpenTelemetry for moderator analysis streaming
    // Exports traces to configured OTEL collector when instrumentation.ts registers @vercel/otel
    experimental_telemetry: {
      isEnabled: true,
      functionId: `chat.thread.${threadId}.moderator`,
      recordInputs: true,
      recordOutputs: true,
      metadata: {
        thread_id: threadId,
        round_number: roundNumber,
        conversation_mode: mode,
        participant_id: 'moderator',
        participant_index: MODERATOR_PARTICIPANT_INDEX,
        participant_role: 'AI Moderator',
        model_id: moderatorModelId,
        model_name: moderatorModelName,
        is_moderator: true,
        participant_count: participantResponses.length,
        user_id: userId,
      },
    },
    onFinish: async (finishResult) => {
      try {
        const db = await getDbAsync();

        // ✅ NaN HANDLING: Use Number.isFinite() to handle NaN from failed AI responses
        const rawInputTokens = finishResult.usage?.inputTokens ?? 0;
        const rawOutputTokens = finishResult.usage?.outputTokens ?? 0;
        const rawTotalTokens = finishResult.usage?.totalTokens ?? 0;
        const safeInputTokens = Number.isFinite(rawInputTokens) ? rawInputTokens : 0;
        const safeOutputTokens = Number.isFinite(rawOutputTokens) ? rawOutputTokens : 0;
        const safeTotalTokens = Number.isFinite(rawTotalTokens) ? rawTotalTokens : safeInputTokens + safeOutputTokens;

        // Build complete moderator metadata
        const completeMetadata: DbModeratorMessageMetadata = {
          ...streamMetadata,
          finishReason: finishResult.finishReason,
          usage: finishResult.usage
            ? {
                // Map AI SDK format (inputTokens/outputTokens) to schema format (promptTokens/completionTokens)
                promptTokens: safeInputTokens,
                completionTokens: safeOutputTokens,
                totalTokens: safeTotalTokens,
              }
            : undefined,
          createdAt: new Date().toISOString(),
        };

        // ✅ PERSISTENCE: Save council moderator as chatMessage with isModerator metadata
        await db.insert(tables.chatMessage).values({
          id: messageId,
          threadId,
          role: MessageRoles.ASSISTANT,
          participantId: null, // No participant for moderator
          parts: [{
            type: MessagePartTypes.TEXT,
            text: finishResult.text,
          }],
          roundNumber,
          metadata: completeMetadata,
          createdAt: new Date(),
        }).onConflictDoUpdate({
          target: tables.chatMessage.id,
          set: {
            parts: [{
              type: MessagePartTypes.TEXT,
              text: finishResult.text,
            }],
            metadata: completeMetadata,
          },
        });

        // ✅ RESUMABLE STREAMS: Clear thread active stream now that moderator is complete
        // This marks the round as fully complete (participants + moderator done)
        await clearThreadActiveStream(threadId, env);

        // ✅ FIX: Mark stream buffer as COMPLETED and clear active key immediately
        // The consumeSseStream callback runs in waitUntil (background), so if user refreshes
        // before it completes, KV metadata is still ACTIVE. This causes server to return
        // phase=moderator instead of complete, triggering participant re-execution.
        // By calling these here (in onFinish which runs before response ends), we ensure
        // KV state is correct even if consumeSseStream hasn't finished buffering.
        await completeParticipantStreamBuffer(messageId, env);
        await clearActiveParticipantStream(threadId, roundNumber, MODERATOR_PARTICIPANT_INDEX, env);

        // =========================================================================
        // ✅ CREDIT FINALIZATION: Deduct actual tokens used by moderator
        // Uses actual token counts instead of fixed estimate for accurate billing
        // =========================================================================
        await finalizeCredits(userId, messageId, {
          inputTokens: safeInputTokens,
          outputTokens: safeOutputTokens,
          action: 'ai_response',
          threadId,
          messageId,
          modelId: moderatorModelId,
        });

        // =========================================================================
        // ✅ FREE USER SINGLE-ROUND: Zero out credits after moderator completes
        // For multi-participant threads, the round is only complete after moderator finishes.
        // This is the final step - now we can lock out free users from further usage.
        // =========================================================================
        const creditBalance = await getUserCreditBalance(userId);
        if (creditBalance.planType === PlanTypes.FREE) {
          const roundComplete = await checkFreeUserHasCompletedRound(userId);
          if (roundComplete) {
            await zeroOutFreeUserCredits(userId);
          }
        }

        // Track analytics
        const finishData = {
          text: finishResult.text,
          finishReason: finishResult.finishReason,
          usage: {
            inputTokens: safeInputTokens,
            outputTokens: safeOutputTokens,
            totalTokens: safeTotalTokens,
          },
        };

        const trackAnalytics = async () => {
          try {
            await trackLLMGeneration(
              {
                userId,
                sessionId,
                threadId,
                roundNumber,
                participantId: 'moderator',
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                participantRole: 'AI Moderator',
                modelId: moderatorModelId,
                modelName: moderatorModelName,
                threadMode: mode,
              },
              finishData,
              [{ role: MessageRoles.USER, content: 'Analyze this council discussion and produce the moderator analysis in markdown format.' }],
              llmTraceId,
              llmStartTime,
              {
                modelConfig: { temperature: 0.3 },
                promptTracking: { promptId: 'moderator_summary', promptVersion: 'v3.0' },
                additionalProperties: {
                  message_id: messageId,
                  moderator_type: 'text_stream',
                  participant_count: participantResponses.length,
                },
              },
            );
          } catch {
            // Silently fail analytics
          }
        };

        if (executionCtx) {
          executionCtx.waitUntil(trackAnalytics());
        } else {
          trackAnalytics().catch(() => {});
        }
      } catch (error) {
        // Stream already completed successfully - log persistence error
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Council Moderator] Failed to persist message:', {
          error: errorMsg,
          messageId,
          threadId,
          roundNumber,
        });

        // Track error
        const trackError = async () => {
          try {
            await trackLLMError(
              {
                userId,
                sessionId,
                threadId,
                roundNumber,
                participantId: 'moderator',
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                participantRole: 'AI Moderator',
                modelId: moderatorModelId,
                modelName: moderatorModelName,
                threadMode: mode,
              },
              toError(error),
              llmTraceId,
              'council_moderator',
            );
          } catch {
            // Silently fail
          }
        };

        if (executionCtx) {
          executionCtx.waitUntil(trackError());
        } else {
          trackError().catch(() => {});
        }
      }
    },
  });

  // ✅ PATTERN: Return toUIMessageStreamResponse like participants
  return finalResult.toUIMessageStreamResponse({
    generateMessageId: () => messageId,

    // Inject moderator metadata at stream lifecycle events
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return streamMetadata;
      }

      if (part.type === 'finish') {
        // ✅ NaN HANDLING: Use Number.isFinite() to handle NaN from failed AI responses
        const rawInput = part.totalUsage?.inputTokens ?? 0;
        const rawOutput = part.totalUsage?.outputTokens ?? 0;
        const rawTotal = part.totalUsage?.totalTokens ?? 0;
        const safeInput = Number.isFinite(rawInput) ? rawInput : 0;
        const safeOutput = Number.isFinite(rawOutput) ? rawOutput : 0;
        const safeTotal = Number.isFinite(rawTotal) ? rawTotal : safeInput + safeOutput;

        return {
          ...streamMetadata,
          finishReason: part.finishReason,
          usage: part.totalUsage
            ? {
                // Map AI SDK format to schema format
                promptTokens: safeInput,
                completionTokens: safeOutput,
                totalTokens: safeTotal,
              }
            : undefined,
        };
      }

      return undefined;
    },

    // Buffer SSE chunks for stream resumption
    consumeSseStream: async ({ stream }) => {
      const bufferStream = async () => {
        try {
          const reader = stream.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              await completeParticipantStreamBuffer(messageId, c.env);
              break;
            }

            await appendParticipantStreamChunk(messageId, value, c.env);
          }
        } catch (error) {
          const isAbortError
            = error instanceof Error
              && (error.name === 'AbortError'
                || (error.cause instanceof Error
                  && error.cause.name === 'AbortError'));

          if (isAbortError) {
            return;
          }

          const errorMessage = error instanceof Error ? error.message : 'Stream buffer error';
          await failParticipantStreamBuffer(messageId, errorMessage, c.env);
        }
      };

      if (executionCtx) {
        executionCtx.waitUntil(bufferStream());
      } else {
        bufferStream().catch(() => {});
      }
    },

    onError: (error) => {
      const streamErrorMessage = getErrorMessage(error);
      const errorName = getErrorName(error);

      console.error('[Council Moderator Error]', {
        errorName,
        errorMessage: streamErrorMessage,
        threadId,
        roundNumber,
        traceId: llmTraceId,
      });

      // Return error as JSON for frontend handling
      return JSON.stringify({
        errorName,
        errorType: 'moderator_error',
        errorMessage: streamErrorMessage,
        isModerator: true,
        roundNumber,
        traceId: llmTraceId,
      });
    },
  });
}

// ============================================================================
// Council Moderator Round Handler
// ============================================================================

export const councilModeratorRoundHandler: RouteHandler<typeof councilModeratorRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    validateBody: RoundModeratorRequestSchema,
    operationName: 'councilModeratorRound',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber } = c.validated.params;
    // Note: body.participantMessageIds is validated but D1 is source of truth for finding messages

    const db = await getDbAsync();
    const roundNum = Number.parseInt(roundNumber, 10);

    // Validate round number (0-based)
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest(
        'Invalid round number. Must be a non-negative integer (0-based indexing).',
        { errorType: 'validation', field: 'roundNumber' },
      );
    }

    // ✅ OPTIMIZATION: Parallelize independent queries
    // These queries don't depend on each other and can run simultaneously
    const messageId = `${threadId}_r${roundNum}_moderator`;

    const [thread, existingMessage, userMessage] = await Promise.all([
      verifyThreadOwnership(threadId, user.id, db),
      db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, messageId),
      }),
      db.query.chatMessage.findFirst({
        where: (fields, { and: andOp, eq: eqOp }) =>
          andOp(
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, MessageRoles.USER),
            eqOp(fields.roundNumber, roundNum),
          ),
        orderBy: [asc(tables.chatMessage.createdAt)],
      }),
    ]);

    if (existingMessage) {
      // Already exists - return the message data
      return Responses.raw(c, {
        id: existingMessage.id,
        role: existingMessage.role,
        parts: existingMessage.parts,
        metadata: existingMessage.metadata,
        roundNumber: existingMessage.roundNumber,
      });
    }

    // =========================================================================
    // ✅ D1-FIRST APPROACH: Query database for participant messages FIRST
    // =========================================================================
    // RATIONALE: The onFinish callback in streaming handler runs AFTER the stream
    // response is sent to the client. Order of operations:
    //   1. saveStreamedMessage (D1 write) - awaited
    //   2. markParticipantCompleted (KV update) - runs after saveStreamedMessage
    //   3. Stream response completes, sent to client
    //   4. Frontend sees stream complete, triggers moderator
    //
    // Since saveStreamedMessage completes BEFORE markParticipantCompleted,
    // D1 is the source of truth. If D1 has all participant messages, proceed
    // regardless of KV state. Only fall back to KV check for better error info
    // when D1 doesn't have expected messages.
    // =========================================================================

    // =========================================================================
    // ✅ D1 QUERY: Single attempt - no blocking polling
    // =========================================================================
    // Query D1 once - if data isn't ready, return 202 immediately.
    // The frontend will poll again. No server-side delays.
    // =========================================================================

    // Query by round number (most reliable - doesn't depend on frontend IDs)
    const roundMessages = await db.query.chatMessage.findMany({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, MessageRoles.ASSISTANT),
          eqOp(fields.roundNumber, roundNum),
        ),
      with: { participant: true },
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });

    const participantMessages = filterDbToParticipantMessages(roundMessages);

    // =========================================================================
    // ✅ KV FALLBACK: Check KV when D1 has no messages
    // =========================================================================
    // If D1 doesn't have participant messages, check KV for status
    if (!participantMessages || participantMessages.length === 0) {
      const roundState = await getRoundExecutionState(threadId, roundNum, c.env);

      if (roundState && roundState.phase !== RoundExecutionPhases.MODERATOR) {
        // KV shows participants still running - return detailed status
        const completedCount = roundState.completedParticipants + roundState.failedParticipants;
        return Responses.polling(c, {
          status: PollingStatuses.PENDING,
          message: `Waiting for participants to complete (${completedCount}/${roundState.totalParticipants}). Please poll for completion.`,
          retryAfterMs: 1000,
        });
      }

      // KV is null or shows MODERATOR phase but D1 has no messages - still processing
      return Responses.polling(c, {
        status: PollingStatuses.PENDING,
        message: `Messages for round ${roundNum} are still being processed. Please poll for completion.`,
        retryAfterMs: 1000,
      });
    }

    if (!participantMessages || participantMessages.length === 0) {
      throw createError.badRequest('No participant messages found for council moderator', {
        errorType: 'validation',
        field: 'participantMessageIds',
      });
    }

    if (!userMessage) {
      throw createError.badRequest(`No user message found for round ${roundNum}`, {
        errorType: 'validation',
        field: 'roundNumber',
      });
    }

    const userQuestion = extractTextFromParts(userMessage.parts);

    // Build participant responses with schema-typed structure
    // ✅ LENIENT: Use getParticipantIndex instead of requireParticipantMetadata to avoid strict Zod validation
    // Filter to messages with valid participant data, then map
    const messagesWithParticipants = participantMessages.filter(
      (msg): msg is typeof msg & { participant: NonNullable<typeof msg.participant> } =>
        msg.participant !== null && msg.participant !== undefined,
    );
    const participantResponses: ParticipantResponse[] = messagesWithParticipants
      .map((msg, idx): ParticipantResponse => {
        const { participant } = msg;
        const modelName = extractModeratorModelName(participant.modelId);
        // Lenient extraction - fallback to array index if metadata extraction fails
        const participantIndex = getParticipantIndex(msg.metadata) ?? idx;

        return {
          participantIndex,
          participantRole: participant.role || 'AI Assistant',
          modelId: participant.modelId,
          modelName,
          responseContent: extractTextFromParts(msg.parts),
        };
      })
      .sort((a, b) => a.participantIndex - b.participantIndex);

    // ✅ CREDITS: Enforce credits for moderator generation
    // Skip round completion check because moderator is PART of completing the round
    // Without this, multi-participant threads hit a circular dependency:
    // - Round isn't complete until moderator runs
    // - But enforceCredits blocks moderator if round "appears complete" (all participants done)
    // NOTE: Actual deduction happens in onFinish via finalizeCredits() with real token counts
    await enforceCredits(user.id, 2, { skipRoundCheck: true }); // Analysis requires ~2 credits estimate

    // ✅ RESUMABLE STREAMS: Initialize stream buffer for resumption
    await initializeParticipantStreamBuffer(messageId, threadId, roundNum, MODERATOR_PARTICIPANT_INDEX, c.env);

    // ✅ RESUMABLE STREAMS: Mark moderator stream as active in KV for resume detection
    await markStreamActive(threadId, roundNum, MODERATOR_PARTICIPANT_INDEX, c.env);

    // ✅ RESUMABLE STREAMS: Set thread-level active stream for AI SDK resume pattern
    // Uses MODERATOR_PARTICIPANT_INDEX (-1) and totalParticipants=1 (moderator is single stream)
    await setThreadActiveStream(
      threadId,
      messageId,
      roundNum,
      MODERATOR_PARTICIPANT_INDEX,
      1, // Moderator is a single stream (not multi-participant)
      c.env,
    );

    const { session } = c.auth();

    // Generate and return streaming response
    // ✅ SINGLE SOURCE: Mode validated via ChatModeSchema in prompts.service.ts
    return await generateCouncilModerator(
      {
        roundNumber: roundNum,
        mode: thread.mode,
        userQuestion,
        participantResponses,
        env: c.env,
        messageId,
        threadId,
        userId: user.id,
        executionCtx: c.executionCtx,
        sessionId: session?.id,
      },
      c,
    );
  },
);
