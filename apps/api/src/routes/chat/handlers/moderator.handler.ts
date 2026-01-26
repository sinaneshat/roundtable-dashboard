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

import { invalidateMessagesCache } from '@/common/cache-utils';
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
import { getProjectRagContext } from '@/services/context';
import {
  extractModelPricing,
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/services/errors';
import { filterDbToParticipantMessages } from '@/services/messages';
import { extractModeratorModelName, getModelById, initializeOpenRouter, openRouterService } from '@/services/models';
import { extractMemoriesFromRound } from '@/services/projects';
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
import { logMemoriesCreated } from '@/services/threads/thread-changelog.service';
import type { ApiEnv } from '@/types';

import type { councilModeratorRoundRoute } from '../route';
import type { ModeratorGenerationConfig, ModeratorProjectContext, ParticipantResponse } from '../schema';
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

  const { env, executionCtx, messageId, mode, participantResponses, projectContext, projectId, roundNumber, sessionId, threadId, userId, userQuestion } = config;

  const llmTraceId = generateTraceId();
  const llmStartTime = performance.now();

  initializeOpenRouter(env);
  const client = await openRouterService.getClient();
  const moderatorModelId = AIModels.COUNCIL_MODERATOR;
  const moderatorModelName = extractModeratorModelName(moderatorModelId);

  // ✅ SINGLE SOURCE: Uses buildCouncilModeratorSystemPrompt from prompts.service.ts
  // ✅ PROJECT CONTEXT: Pass instructions and RAG context if available
  const systemPrompt = buildCouncilModeratorSystemPrompt(
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
    projectContext,
  );

  // Build initial moderator metadata (streaming state)
  const streamMetadata: DbModeratorMessageMetadata = {
    hasError: false,
    isModerator: true,
    model: moderatorModelId,
    role: MessageRoles.ASSISTANT,
    roundNumber,
  };

  // ✅ TEXT STREAMING: Use streamText like participants
  const finalResult = streamText({
    // ✅ STREAMING TIMEOUT: 15 min for complex moderator analysis
    // Cloudflare has UNLIMITED wall-clock - only constraint is 100s idle timeout
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.moderatorAnalysisMs),
    // ✅ TELEMETRY: Enable OpenTelemetry for moderator analysis streaming
    // Exports traces to configured OTEL collector when instrumentation.ts registers @vercel/otel
    experimental_telemetry: {
      functionId: `chat.thread.${threadId}.moderator`,
      isEnabled: true,
      metadata: {
        conversation_mode: mode,
        is_moderator: true,
        model_id: moderatorModelId,
        model_name: moderatorModelName,
        participant_count: participantResponses.length,
        participant_id: 'moderator',
        participant_index: MODERATOR_PARTICIPANT_INDEX,
        participant_role: 'AI Moderator',
        round_number: roundNumber,
        thread_id: threadId,
        user_id: userId,
      },
      recordInputs: true,
      recordOutputs: true,
    },
    maxOutputTokens: 8192,
    model: client.chat(moderatorModelId),
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
          createdAt: new Date().toISOString(),
          finishReason: finishResult.finishReason,
          usage: finishResult.usage
            ? {
                completionTokens: safeOutputTokens,
                // Map AI SDK format (inputTokens/outputTokens) to schema format (promptTokens/completionTokens)
                promptTokens: safeInputTokens,
                totalTokens: safeTotalTokens,
              }
            : undefined,
        };

        // ✅ PERSISTENCE: Save council moderator as chatMessage with isModerator metadata
        await db.insert(tables.chatMessage).values({
          createdAt: new Date(),
          id: messageId,
          metadata: completeMetadata,
          participantId: null, // No participant for moderator
          parts: [{
            text: finishResult.text,
            type: MessagePartTypes.TEXT,
          }],
          role: MessageRoles.ASSISTANT,
          roundNumber,
          threadId,
        }).onConflictDoUpdate({
          set: {
            metadata: completeMetadata,
            parts: [{
              text: finishResult.text,
              type: MessagePartTypes.TEXT,
            }],
          },
          target: tables.chatMessage.id,
        });

        // ✅ FIX: Invalidate messages cache so next fetch gets fresh data from D1
        // Without this, KV cache returns stale data (missing moderator message) on page refresh
        await invalidateMessagesCache(db, threadId);

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
          action: 'ai_response',
          inputTokens: safeInputTokens,
          messageId,
          modelId: moderatorModelId,
          outputTokens: safeOutputTokens,
          threadId,
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

        // Track analytics with actual provider cost
        const finishData = {
          finishReason: finishResult.finishReason,
          text: finishResult.text,
          usage: {
            inputTokens: safeInputTokens,
            outputTokens: safeOutputTokens,
            totalTokens: safeTotalTokens,
          },
        };

        // Get model pricing for actual cost tracking in PostHog
        const moderatorModel = getModelById(moderatorModelId);
        const moderatorPricing = extractModelPricing(moderatorModel);

        const trackAnalytics = async () => {
          try {
            await trackLLMGeneration(
              {
                modelId: moderatorModelId,
                modelName: moderatorModelName,
                participantId: 'moderator',
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                participantRole: 'AI Moderator',
                roundNumber,
                sessionId,
                threadId,
                threadMode: mode,
                userId,
              },
              finishData,
              [{ content: 'Analyze this council discussion and produce the moderator analysis in markdown format.', role: MessageRoles.USER }],
              llmTraceId,
              llmStartTime,
              {
                additionalProperties: {
                  message_id: messageId,
                  moderator_type: 'text_stream',
                  participant_count: participantResponses.length,
                },
                modelConfig: { temperature: 0.3 },
                modelPricing: moderatorPricing,
                promptTracking: { promptId: 'moderator_summary', promptVersion: 'v3.0' },
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

        // =========================================================================
        // ✅ MEMORY EXTRACTION: Auto-extract memories from project conversations
        // Runs in background after moderator completes successfully
        // =========================================================================
        if (projectId && finishResult.text) {
          const extractMemoriesTask = async () => {
            try {
              console.error('[Memory Extraction] Starting extraction:', {
                projectId,
                roundNumber,
                summaryLength: finishResult.text.length,
                threadId,
              });
              const extractionResult = await extractMemoriesFromRound({
                ai: env.AI,
                db: await getDbAsync(),
                moderatorSummary: finishResult.text,
                projectId,
                roundNumber,
                threadId,
                userId,
                userQuestion,
              });
              console.error('[Memory Extraction] Completed:', extractionResult);

              // ✅ Store memory event in KV for frontend to poll
              if (extractionResult.extracted.length > 0) {
                const memoriesForKV = extractionResult.extracted.map((m, idx) => ({
                  content: m.content.slice(0, 200),
                  id: extractionResult.memoryIds[idx] ?? '',
                  summary: m.summary,
                }));

                const memoryEventKey = `memory-event:${threadId}:${roundNumber}`;
                const memoryEventData = {
                  createdAt: Date.now(),
                  memories: memoriesForKV,
                  memoryIds: extractionResult.memoryIds,
                  projectId,
                };

                try {
                  await env.KV.put(
                    memoryEventKey,
                    JSON.stringify(memoryEventData),
                    { expirationTtl: 300 }, // 5 min TTL
                  );
                  console.error('[Memory Extraction] Memory event stored in KV', {
                    key: memoryEventKey,
                    memoryCount: extractionResult.extracted.length,
                  });
                } catch (kvError) {
                  console.error('[Memory Extraction] Failed to store memory event in KV:', kvError);
                }

                // ✅ Log memory creation to changelog for project threads
                try {
                  await logMemoriesCreated(
                    threadId,
                    roundNumber,
                    projectId,
                    memoriesForKV.map(m => ({ id: m.id, summary: m.summary })),
                  );
                  console.error('[Memory Extraction] Changelog entry created');
                } catch (changelogError) {
                  console.error('[Memory Extraction] Failed to create changelog entry:', changelogError);
                }
              }
            } catch (error) {
              console.error('[Memory Extraction] Failed:', error);
            }
          };

          if (executionCtx) {
            executionCtx.waitUntil(extractMemoriesTask());
          } else {
            extractMemoriesTask().catch(() => {});
          }
        }
      } catch (error) {
        // Stream already completed successfully - log persistence error
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error('[Moderator] PERSISTENCE FAILED:', {
          error: errorMsg,
          messageId,
          roundNumber,
          stack: errorStack,
          threadId,
        });

        // Track error
        const trackError = async () => {
          try {
            await trackLLMError(
              {
                modelId: moderatorModelId,
                modelName: moderatorModelName,
                participantId: 'moderator',
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                participantRole: 'AI Moderator',
                roundNumber,
                sessionId,
                threadId,
                threadMode: mode,
                userId,
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
    prompt: 'Analyze this council discussion and produce the moderator analysis in markdown format.',
    // ✅ MIDDLE-OUT TRANSFORM: Enable automatic context compression
    providerOptions: {
      openrouter: {
        transforms: ['middle-out'],
      },
    },
    system: systemPrompt,
    temperature: 0.3,
  });

  // ✅ PATTERN: Return toUIMessageStreamResponse like participants
  return finalResult.toUIMessageStreamResponse({
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
                completionTokens: safeOutput,
                // Map AI SDK format to schema format
                promptTokens: safeInput,
                totalTokens: safeTotal,
              }
            : undefined,
        };
      }

      return undefined;
    },

    onError: (error) => {
      const streamErrorMessage = getErrorMessage(error);
      const errorName = getErrorName(error);

      console.error('[Council Moderator Error]', {
        errorMessage: streamErrorMessage,
        errorName,
        roundNumber,
        threadId,
        traceId: llmTraceId,
      });

      // Return error as JSON for frontend handling
      return JSON.stringify({
        errorMessage: streamErrorMessage,
        errorName,
        errorType: 'moderator_error',
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
    operationName: 'councilModeratorRound',
    validateBody: RoundModeratorRequestSchema,
    validateParams: ThreadRoundParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { roundNumber, threadId } = c.validated.params;
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
        orderBy: [asc(tables.chatMessage.createdAt)],
        where: (fields, { and: andOp, eq: eqOp }) =>
          andOp(
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, MessageRoles.USER),
            eqOp(fields.roundNumber, roundNum),
          ),
      }),
    ]);

    if (existingMessage) {
      // Check if the message is complete (has text content)
      const hasContent = existingMessage.parts?.some(
        (p: { type: string; text?: string }) => p.type === 'text' && p.text && p.text.length > 0,
      );

      if (hasContent) {
        // Already exists with content - return the message data
        console.info(`[Moderator] existingMessage found with content, returning early id=${existingMessage.id}`);
        return Responses.raw(c, {
          id: existingMessage.id,
          metadata: existingMessage.metadata,
          parts: existingMessage.parts,
          role: existingMessage.role,
          roundNumber: existingMessage.roundNumber,
        });
      }

      // Message exists but is incomplete - delete and regenerate
      console.info(`[Moderator] existingMessage found but incomplete (no content), deleting and regenerating id=${existingMessage.id}`);
      await db.delete(tables.chatMessage).where(eq(tables.chatMessage.id, messageId));
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
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, MessageRoles.ASSISTANT),
          eqOp(fields.roundNumber, roundNum),
        ),
      with: { participant: true },
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
          message: `Waiting for participants to complete (${completedCount}/${roundState.totalParticipants}). Please poll for completion.`,
          retryAfterMs: 1000,
          status: PollingStatuses.PENDING,
        });
      }

      // KV is null or shows MODERATOR phase but D1 has no messages - still processing
      return Responses.polling(c, {
        message: `Messages for round ${roundNum} are still being processed. Please poll for completion.`,
        retryAfterMs: 1000,
        status: PollingStatuses.PENDING,
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
          modelId: participant.modelId,
          modelName,
          participantIndex,
          participantRole: participant.role || 'AI Assistant',
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

    // ✅ PROJECT CONTEXT: Fetch project instructions and RAG context for moderator synthesis
    let projectContext: ModeratorProjectContext | undefined;
    if (thread.projectId) {
      const ragResult = await getProjectRagContext({
        ai: c.env.AI,
        db,
        maxResults: 5,
        projectId: thread.projectId,
        query: userQuestion,
        userId: session.userId,
      });
      if (ragResult.instructions || ragResult.ragContext) {
        projectContext = {
          instructions: ragResult.instructions,
          ragContext: ragResult.ragContext,
        };
      }
    }

    // Generate and return streaming response
    // ✅ SINGLE SOURCE: Mode validated via ChatModeSchema in prompts.service.ts
    return await generateCouncilModerator(
      {
        env: c.env,
        executionCtx: c.executionCtx,
        messageId,
        mode: thread.mode,
        participantResponses,
        projectContext,
        projectId: thread.projectId,
        roundNumber: roundNum,
        sessionId: session?.id,
        threadId,
        userId: user.id,
        userQuestion,
      },
      c,
    );
  },
);
