import type { RouteHandler } from '@hono/zod-openapi';
import { streamObject } from 'ai';
import { asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses, STREAMING_CONFIG } from '@/api/core';
import { AIModels } from '@/api/core/ai-models';
import { AnalysisStatuses, MessageRoles, StreamStatuses, UIMessageRoles } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
import {
  clearActiveAnalysisStream,
  createBufferedAnalysisResponse,
  createLiveAnalysisResumeStream,
  generateAnalysisStreamId,
  getActiveAnalysisStreamId,
  getAnalysisStreamChunks,
  getAnalysisStreamMetadata,
  initializeAnalysisStreamBuffer,
} from '@/api/services/analysis-stream-buffer.service';
import { filterDbToParticipantMessages } from '@/api/services/message-type-guards';
import { extractModeratorModelName } from '@/api/services/models-config.service';
import type { ModeratorPromptConfig } from '@/api/services/moderator-analysis.service';
import {
  buildModeratorSystemPrompt,
  buildModeratorUserPrompt,
} from '@/api/services/moderator-analysis.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import {
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/api/services/posthog-llm-tracking.service';
import { buildModeratorAnalysisEnhancedPrompt } from '@/api/services/prompts.service';
import {
  enforceAnalysisQuota,
  getUserTier,
  incrementAnalysisUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { formatAgeMs, getTimestampAge, hasTimestampExceededTimeout } from '@/db/utils/timestamps';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas/participant-schemas';
import { requireParticipantMetadata } from '@/lib/utils/metadata';
import { isObject } from '@/lib/utils/type-guards';

import type {
  analyzeRoundRoute,
  getThreadAnalysesRoute,
  resumeAnalysisStreamRoute,
} from '../route';
import type { MessageWithParticipant } from '../schema';
import {
  MessageWithParticipantSchema,
  ModeratorAnalysisPayloadSchema,
  ModeratorAnalysisRequestSchema,
} from '../schema';

function generateModeratorAnalysis(
  config: ModeratorPromptConfig & {
    env: ApiEnv['Bindings'];
    analysisId: string;
    threadId: string;
    userId: string;
    sessionId?: string; // PostHog session ID for Session Replay linking
    executionCtx?: ExecutionContext; // Cloudflare Workers ExecutionContext for waitUntil
    streamId?: string; // Stream ID for buffer cleanup on completion
  },
) {
  const { roundNumber, mode, userQuestion, participantResponses, changelogEntries, userTier, env, analysisId, threadId, userId, sessionId, executionCtx, streamId } = config;

  // ✅ POSTHOG LLM TRACKING: Initialize trace and timing for moderator analysis
  const llmTraceId = generateTraceId();
  const llmStartTime = performance.now();

  initializeOpenRouter(env);
  const client = openRouterService.getClient();
  const analysisModelId = AIModels.ANALYSIS;
  const analysisModelName = extractModeratorModelName(analysisModelId);
  const systemPrompt = buildModeratorSystemPrompt({
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
    changelogEntries,
    userTier,
  });
  const userPrompt = buildModeratorUserPrompt({
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
    changelogEntries,
    userTier,
  });

  // ✅ AI SDK v5: streamObject streams progressive JSON as it's generated
  // Using Claude Sonnet 3.5 with mode:'json' - tested working configuration
  const enhancedUserPrompt = buildModeratorAnalysisEnhancedPrompt(userPrompt);
  return streamObject({
    model: client.chat(AIModels.ANALYSIS),
    schema: ModeratorAnalysisPayloadSchema,
    mode: 'json',
    system: systemPrompt,
    prompt: enhancedUserPrompt,
    temperature: 0.3,
    onFinish: async ({ object: finalObject, error: finishError, usage }) => {
      if (finishError) {
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.FAILED,
              errorMessage: finishError instanceof Error ? finishError.message : 'Unknown error',
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));

          // ✅ RESUMABLE STREAMS: Clear active stream on failure
          if (streamId) {
            await clearActiveAnalysisStream(threadId, roundNumber, env);
          }

          // ✅ PERFORMANCE OPTIMIZATION: Non-blocking error tracking
          // PostHog error tracking runs asynchronously via waitUntil()
          const trackError = async () => {
            try {
              await trackLLMError(
                {
                  userId,
                  sessionId, // PostHog Best Practice: Link to Session Replay
                  threadId,
                  roundNumber,
                  participantId: 'moderator',
                  participantIndex: NO_PARTICIPANT_SENTINEL, // Moderator is not a participant
                  participantRole: 'AI Moderator',
                  modelId: analysisModelId,
                  modelName: analysisModelName,
                  threadMode: mode,
                },
                finishError as Error,
                llmTraceId,
                'moderator_analysis',
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
        } catch {
        }
        return;
      }

      // ✅ AI SDK v5: finalObject is already validated by schema during streaming
      // No need for manual validation since we use mode:'json' with schema
      if (finalObject) {
        try {
          // ✅ AUTOMATIC COERCION: z.coerce.number() in schemas handles string→number conversion
          // No manual coercion needed - Zod already validated and coerced all numeric fields
          const validatedObject = finalObject;

          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.COMPLETE,
              analysisData: validatedObject,
              completedAt: new Date(),
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));

          // ✅ RESUMABLE STREAMS: Clear active stream on success
          if (streamId) {
            await clearActiveAnalysisStream(threadId, roundNumber, env);
          }

          // =========================================================================
          // ✅ POSTHOG LLM TRACKING: Track successful moderator analysis
          // =========================================================================
          // ✅ AI SDK v5 USAGE: streamObject usage object has inputTokens/outputTokens/totalTokens
          const finishResult = {
            text: JSON.stringify(validatedObject),
            finishReason: 'stop' as const,
            usage: usage
              ? {
                  inputTokens: usage.inputTokens || 0,
                  outputTokens: usage.outputTokens || 0,
                  totalTokens: usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0),
                }
              : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          };

          // Input messages for moderator analysis (simplified for tracking)
          const inputMessages = [{
            role: UIMessageRoles.USER,
            content: userPrompt,
          }];

          // ✅ PERFORMANCE OPTIMIZATION: Non-blocking analytics tracking
          // PostHog tracking runs asynchronously via waitUntil()
          // Expected gain: 100-300ms per analysis
          const trackAnalytics = async () => {
            try {
              await trackLLMGeneration(
                {
                  userId,
                  sessionId, // PostHog Best Practice: Link to Session Replay
                  threadId,
                  roundNumber,
                  participantId: 'moderator',
                  participantIndex: NO_PARTICIPANT_SENTINEL, // Moderator is not a participant
                  participantRole: 'AI Moderator',
                  modelId: analysisModelId,
                  modelName: analysisModelName,
                  threadMode: mode,
                },
                finishResult,
                inputMessages, // PostHog Best Practice: Always include input
                llmTraceId,
                llmStartTime,
                {
                  // Model configuration
                  modelConfig: {
                    temperature: 0.3,
                  },
                  // Prompt tracking for moderator analysis
                  promptTracking: {
                    promptId: 'moderator_round_analysis',
                    promptVersion: 'v1.0',
                  },
                  // Additional properties for analytics
                  additionalProperties: {
                    analysis_id: analysisId,
                    analysis_type: 'moderator_round_analysis',
                    participant_count: participantResponses.length,
                    has_changelog: (changelogEntries || []).length > 0,
                    response_type: 'structured_json',
                  },
                },
              );
            } catch {
              // Silently fail - never break the main flow
            }
          };

          if (executionCtx) {
            executionCtx.waitUntil(trackAnalytics());
          } else {
            trackAnalytics().catch(() => {});
          }
        } catch (updateError) {
          try {
            const db = await getDbAsync();
            await db.update(tables.chatModeratorAnalysis)
              .set({
                status: AnalysisStatuses.FAILED,
                errorMessage: `Persistence error: ${updateError instanceof Error ? updateError.message : 'Unknown error during database update'}`,
              })
              .where(eq(tables.chatModeratorAnalysis.id, analysisId));
          } catch {
          }
        }
      }
    },
  });
}
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
    const roundNum = Number.parseInt(roundNumber, 10);
    // ✅ 0-BASED: Round numbers start at 0 (first round is 0)
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest(
        'Invalid round number. Must be a non-negative integer (0-based indexing).',
        {
          errorType: 'validation',
          field: 'roundNumber',
        },
      );
    }
    const thread = await verifyThreadOwnership(threadId, user.id, db);
    const existingAnalyses = await db.query.chatModeratorAnalysis.findMany({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.roundNumber, roundNum),
        ),
      orderBy: [desc(tables.chatModeratorAnalysis.createdAt)],
    });
    if (existingAnalyses.length > 1) {
      const completedAnalysis = existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETE);
      const analysesToDelete = existingAnalyses.filter(a =>
        a.id !== completedAnalysis?.id,
      );
      if (analysesToDelete.length > 0) {
        for (const analysis of analysesToDelete) {
          await db.delete(tables.chatModeratorAnalysis)
            .where(eq(tables.chatModeratorAnalysis.id, analysis.id));
        }
      }
    }
    const existingAnalysis = existingAnalyses.length === 1
      ? existingAnalyses[0]
      : existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETE);
    if (existingAnalysis) {
      if (existingAnalysis.status === AnalysisStatuses.COMPLETE && existingAnalysis.analysisData) {
        // ✅ CRITICAL FIX: Return raw JSON for useObject compatibility
        // useObject hook expects raw object data, not wrapped in API response
        // Must match the format that streamObject returns
        const completeAnalysisData = {
          ...existingAnalysis.analysisData,
          mode: existingAnalysis.mode,
          roundNumber: existingAnalysis.roundNumber,
          userQuestion: existingAnalysis.userQuestion,
        };
        return Responses.raw(c, completeAnalysisData);
      }
      if (existingAnalysis.status === AnalysisStatuses.STREAMING) {
        // Check if stream has timed out using clean timestamp utilities
        if (hasTimestampExceededTimeout(existingAnalysis.createdAt, STREAMING_CONFIG.STREAM_TIMEOUT_MS)) {
          // SSE connections can get interrupted without backend knowing
          // Mark stale streaming analyses as failed so new streams can start
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.FAILED,
              errorMessage: `Stream timeout after ${formatAgeMs(getTimestampAge(existingAnalysis.createdAt))} - SSE connection likely interrupted`,
            })
            .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));

          // ✅ RESUMABLE STREAMS: Clear any stale buffer for this round
          await clearActiveAnalysisStream(threadId, roundNum, c.env);

          // Continue to create new analysis below
        } else {
          // =========================================================================
          // ✅ RESUMABLE STREAMS: Try to return buffered stream instead of 409
          // =========================================================================
          // Instead of rejecting with 409, try to return the buffered stream data
          // This allows clients to resume from where they left off after page refresh

          const existingStreamId = await getActiveAnalysisStreamId(threadId, roundNum, c.env);

          if (existingStreamId) {
            // =========================================================================
            // ✅ LIVE STREAM RESUMPTION: Return a live stream that polls for new chunks
            // =========================================================================
            // This creates a stream that:
            // 1. Returns all buffered chunks immediately
            // 2. Continues polling KV for new chunks as they arrive
            // 3. Streams new chunks to client in real-time
            // 4. Completes when the original stream finishes
            // ✅ PATTERN: Uses Responses.textStream() builder for consistent headers
            const liveStream = createLiveAnalysisResumeStream(existingStreamId, c.env);
            return Responses.textStream(liveStream, {
              streamId: existingStreamId,
              resumedFromBuffer: true,
            });
          }

          // =========================================================================
          // ✅ FALLBACK: No active stream ID (KV not available in local dev)
          // =========================================================================
          // Return 202 to tell frontend to poll for completion
          const ageMs = getTimestampAge(existingAnalysis.createdAt);
          return Responses.polling(c, {
            status: 'streaming',
            resourceId: existingAnalysis.id,
            message: `Analysis is being generated (age: ${formatAgeMs(ageMs)}). Please poll for completion.`,
            retryAfterMs: 2000,
          });
        }
      }
      if (existingAnalysis.status === AnalysisStatuses.FAILED) {
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }
      if (existingAnalysis.status === AnalysisStatuses.PENDING) {
        // ✅ IDEMPOTENT FIX: Update pending analysis to streaming and start stream
        // This handles the race condition where message-persistence creates 'pending' analysis
        // and frontend immediately calls analyze endpoint
        // Reuse the existing analysis ID to maintain consistency

        // Fetch participant messages using the provided IDs
        const messageIds = body.participantMessageIds || existingAnalysis.participantMessageIds;
        const foundMessages = await db.query.chatMessage.findMany({
          where: (fields, { inArray, eq: eqOp, and: andOp }) =>
            andOp(
              inArray(fields.id, messageIds),
              eqOp(fields.threadId, threadId),
              eqOp(fields.role, MessageRoles.ASSISTANT),
            ),
          with: {
            participant: true,
          },
          orderBy: [
            asc(tables.chatMessage.roundNumber),
            asc(tables.chatMessage.createdAt),
            asc(tables.chatMessage.id),
          ],
        });

        // ✅ RACE CONDITION FIX: Return 202 Accepted if messages not persisted yet
        // Frontend triggers analysis based on optimistic state before backend finishes persistence
        // Return 202 to signal "not ready yet" - frontend's existing polling mechanism will retry
        if (foundMessages.length === 0) {
          return Responses.polling(c, {
            status: 'pending',
            resourceId: existingAnalysis.id,
            message: 'Messages are still being processed. Please poll for completion.',
            retryAfterMs: 1000,
          });
        }

        const validatedMessages = foundMessages.map((msg) => {
          const parsed = MessageWithParticipantSchema.safeParse(msg);
          if (!parsed.success) {
            throw createError.internal(
              `Invalid message format for ID ${msg.id}`,
              {
                errorType: 'validation',
                field: 'message',
              },
            );
          }
          return parsed.data;
        });

        // Transform messages to participant responses format
        const participantResponses = validatedMessages
          .map((msg) => {
            const participant = msg.participant!;
            const modelName = extractModeratorModelName(participant.modelId);
            const metadata = requireParticipantMetadata(msg.metadata);

            return {
              participantIndex: metadata.participantIndex,
              participantRole: participant.role,
              modelId: participant.modelId,
              modelName,
              responseContent: extractTextFromParts(msg.parts),
            };
          })
          .sort((a, b) => a.participantIndex - b.participantIndex);

        const changelogEntries = await db.query.chatThreadChangelog.findMany({
          where: eq(tables.chatThreadChangelog.threadId, threadId),
          orderBy: [
            asc(tables.chatThreadChangelog.roundNumber),
            asc(tables.chatThreadChangelog.createdAt),
          ],
          limit: 20,
        });

        const analysisId = existingAnalysis.id;
        await db.update(tables.chatModeratorAnalysis)
          .set({
            status: AnalysisStatuses.STREAMING,
            participantMessageIds: messageIds,
          })
          .where(eq(tables.chatModeratorAnalysis.id, analysisId));

        const userTier = await getUserTier(user.id);
        const { session } = c.auth();

        const result = generateModeratorAnalysis({
          roundNumber: roundNum,
          mode: thread.mode,
          userQuestion: existingAnalysis.userQuestion,
          participantResponses,
          changelogEntries: changelogEntries.map(c => ({
            changeType: c.changeType,
            description: c.changeSummary,
            // ✅ TYPE-SAFE: changeData validated against ChangelogMetadataSchema (discriminated union)
            // Passes object metadata to moderator analysis (replaces Record<string, unknown>)
            metadata: isObject(c.changeData) ? c.changeData : null,
            createdAt: c.createdAt,
          })),
          userTier,
          env: c.env,
          analysisId,
          threadId,
          userId: user.id,
          executionCtx: c.executionCtx, // ✅ Pass executionCtx for waitUntil
          sessionId: session?.id,
        });

        return result.toTextStreamResponse();
      }
    }
    let participantMessages: MessageWithParticipant[] | null = null;
    if (body.participantMessageIds && body.participantMessageIds.length > 0) {
      const messageIds = body.participantMessageIds;

      // ✅ DETERMINISTIC IDs: Simple direct query
      // Backend generates IDs using format: {threadId}_r{roundNumber}_p{participantId}
      // No client suffix handling needed - collisions are impossible
      // Format is consistent across all participants

      // Query messages directly by deterministic IDs
      const foundMessages = await db.query.chatMessage.findMany({
        where: (fields, { inArray, eq: eqOp, and: andOp }) =>
          andOp(
            inArray(fields.id, messageIds),
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, MessageRoles.ASSISTANT),
          ),
        with: {
          participant: true,
        },
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      // ✅ TYPE-SAFE FILTERING: Use consolidated utility for participant message filtering
      // Replaces inline logic with Zod-validated type guard
      // Protects against frontend accidentally including pre-search message IDs
      const participantOnlyFoundMessages = filterDbToParticipantMessages(foundMessages);

      // Validate query results with Zod schema
      if (participantOnlyFoundMessages.length === messageIds.length) {
        const validationResult = MessageWithParticipantSchema.array().safeParse(participantOnlyFoundMessages);
        if (validationResult.success) {
          participantMessages = validationResult.data;
        } else {
          throw createError.internal(
            'Failed to validate participant messages',
            {
              errorType: 'validation',
              field: 'participantMessageIds',
            },
          );
        }
      } else if (participantOnlyFoundMessages.length > 0 && participantOnlyFoundMessages.length < messageIds.length) {
        // ✅ RECOVERY: Some IDs were pre-search messages - continue with valid participant messages only
        const validationResult = MessageWithParticipantSchema.array().safeParse(participantOnlyFoundMessages);
        if (validationResult.success) {
          participantMessages = validationResult.data;
        }
      }
    }
    if (!participantMessages) {
      const roundMessages = await db.query.chatMessage.findMany({
        where: (fields, { and: andOp, eq: eqOp }) =>
          andOp(
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, MessageRoles.ASSISTANT),
            eqOp(fields.roundNumber, roundNum),
          ),
        with: {
          participant: true,
        },
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      // ✅ TYPE-SAFE FILTERING: Use consolidated utility for participant message filtering
      // Replaces 20+ lines of inline filtering logic with single function call
      // Uses Zod validation to ensure only valid participant messages are analyzed
      //
      // PRE-SEARCH MESSAGES (EXCLUDED):
      // - role: 'assistant' but metadata.isPreSearch: true
      // - NO participantId (not from specific participant)
      //
      // PARTICIPANT MESSAGES (INCLUDED):
      // - role: 'assistant' with valid ParticipantMessageMetadata
      // - metadata.participantId: string (links to chatParticipant table)
      // - participant: { ... } (joined from chatParticipant)
      const participantOnlyMessages = filterDbToParticipantMessages(roundMessages);

      // ✅ RACE CONDITION FIX: Return 202 Accepted if messages not persisted yet
      // Frontend triggers analysis based on optimistic state before backend finishes persistence
      // Return 202 to signal "not ready yet" - frontend's existing polling mechanism will retry
      if (participantOnlyMessages.length === 0) {
        return Responses.polling(c, {
          status: 'pending',
          message: `Messages for round ${roundNum} are still being processed. Please poll for completion.`,
          retryAfterMs: 1000,
        });
      }

      // Validate query results with Zod schema (using filtered messages)
      const validationResult = MessageWithParticipantSchema.array().safeParse(participantOnlyMessages);
      if (validationResult.success) {
        participantMessages = validationResult.data;
      } else {
        throw createError.internal(
          'Failed to validate participant messages',
          {
            errorType: 'validation',
            field: 'participantMessages',
          },
        );
      }
    }
    if (participantMessages.length === 0) {
      throw createError.badRequest(
        'No participant messages found for analysis',
        {
          errorType: 'validation',
          field: 'participantMessageIds',
        },
      );
    }
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
    // ✅ FIX: Use roundNumber matching instead of timestamp comparison to find user's question
    const userMessage = await db.query.chatMessage.findFirst({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, MessageRoles.USER),
          eqOp(fields.roundNumber, roundNum),
        ),
      orderBy: [asc(tables.chatMessage.createdAt)],
    });

    if (!userMessage) {
      throw createError.badRequest(
        `No user message found for round ${roundNum}`,
        {
          errorType: 'validation',
          field: 'roundNumber',
        },
      );
    }

    const userQuestion = extractTextFromParts(userMessage.parts);
    const earliestParticipantTime = Math.min(...participantMessages.map(m => m.createdAt.getTime()));
    const changelogEntries = await db.query.chatThreadChangelog.findMany({
      where: (fields, { and: andOp, eq: eqOp, lte: lteOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          lteOp(fields.createdAt, new Date(earliestParticipantTime)),
        ),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      limit: 20,
    });
    const participantResponses = participantMessages
      .map((msg) => {
        const participant = msg.participant!;
        const modelName = extractModeratorModelName(participant.modelId);

        // ✅ TYPE-SAFE METADATA EXTRACTION: Use utility that validates with Zod
        // Throws if metadata is invalid - replaces inline Record<string, unknown> cast
        const metadata = requireParticipantMetadata(msg.metadata);

        return {
          participantIndex: metadata.participantIndex,
          participantRole: participant.role,
          modelId: participant.modelId,
          modelName,
          responseContent: extractTextFromParts(msg.parts),
        };
      })
      .sort((a, b) => a.participantIndex - b.participantIndex);

    // Enforce analysis quota before generation
    await enforceAnalysisQuota(user.id);
    await incrementAnalysisUsage(user.id);

    // ✅ TIER-AWARE ANALYSIS: Get user's subscription tier for model filtering
    const userTier = await getUserTier(user.id);

    const analysisId = ulid();
    await db.insert(tables.chatModeratorAnalysis).values({
      id: analysisId,
      threadId,
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      status: AnalysisStatuses.STREAMING, // ✅ Set to STREAMING since stream starts immediately after
      participantMessageIds: participantMessages.map(m => m.id),
      createdAt: new Date(),
    });

    // =========================================================================
    // ✅ RESUMABLE STREAMS: Initialize stream buffer for analysis resumption
    // =========================================================================
    const streamId = generateAnalysisStreamId(threadId, roundNum);
    await initializeAnalysisStreamBuffer(
      streamId,
      threadId,
      roundNum,
      analysisId,
      c.env,
    );

    // =========================================================================
    // ✅ POSTHOG SESSION TRACKING: Use Better Auth session for tracking
    // =========================================================================
    // Using Better Auth session.id provides stable, reliable session tracking
    const { session } = c.auth();

    const result = generateModeratorAnalysis({
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      participantResponses,
      changelogEntries: changelogEntries.map(c => ({
        changeType: c.changeType,
        description: c.changeSummary,
        // ✅ TYPE-SAFE: changeData validated against ChangelogMetadataSchema (discriminated union)
        // Passes object metadata to moderator analysis (replaces Record<string, unknown>)
        metadata: isObject(c.changeData) ? c.changeData : null,
        createdAt: c.createdAt,
      })),
      userTier,
      analysisId,
      threadId,
      userId: user.id,
      executionCtx: c.executionCtx, // ✅ Pass executionCtx for waitUntil
      sessionId: session?.id, // Better Auth session ID (stable, reliable)
      env: c.env,
      streamId, // ✅ RESUMABLE STREAMS: Pass stream ID for cleanup on completion
    });

    // ✅ RESUMABLE STREAMS: Wrap response with buffer to enable resumption
    const originalResponse = result.toTextStreamResponse();
    return createBufferedAnalysisResponse(
      originalResponse,
      streamId,
      c.env,
      c.executionCtx,
    );
  },
);
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
    await verifyThreadOwnership(threadId, user.id, db);
    const allAnalyses = await db.query.chatModeratorAnalysis.findMany({
      where: eq(tables.chatModeratorAnalysis.threadId, threadId),
      orderBy: [desc(tables.chatModeratorAnalysis.roundNumber), desc(tables.chatModeratorAnalysis.createdAt)],
    });
    const orphanedAnalyses = allAnalyses.filter((analysis) => {
      if (analysis.status !== AnalysisStatuses.STREAMING && analysis.status !== AnalysisStatuses.PENDING)
        return false;
      // Check if timestamp has exceeded orphan cleanup timeout
      return hasTimestampExceededTimeout(analysis.createdAt, STREAMING_CONFIG.ORPHAN_CLEANUP_TIMEOUT_MS);
    });
    if (orphanedAnalyses.length > 0) {
      for (const analysis of orphanedAnalyses) {
        await db.update(tables.chatModeratorAnalysis)
          .set({
            status: AnalysisStatuses.FAILED,
            errorMessage: 'Analysis timed out after 2 minutes. This may have been caused by a page refresh or connection issue during streaming.',
          })
          .where(eq(tables.chatModeratorAnalysis.id, analysis.id));
      }
      const updatedAnalyses = await db.query.chatModeratorAnalysis.findMany({
        where: eq(tables.chatModeratorAnalysis.threadId, threadId),
        orderBy: [desc(tables.chatModeratorAnalysis.roundNumber), desc(tables.chatModeratorAnalysis.createdAt)],
      });
      const analysesMap = new Map<number, typeof updatedAnalyses[0]>();
      for (const analysis of updatedAnalyses) {
        if (!analysesMap.has(analysis.roundNumber)) {
          analysesMap.set(analysis.roundNumber, analysis);
        }
      }
      const analyses = Array.from(analysesMap.values())
        .sort((a, b) => a.roundNumber - b.roundNumber);
      return Responses.collection(c, analyses);
    }
    const analysesMap = new Map<number, typeof allAnalyses[0]>();
    for (const analysis of allAnalyses) {
      if (!analysesMap.has(analysis.roundNumber)) {
        analysesMap.set(analysis.roundNumber, analysis);
      }
    }
    const analyses = Array.from(analysesMap.values())
      .sort((a, b) => a.roundNumber - b.roundNumber);
    return Responses.collection(c, analyses);
  },
);

// ============================================================================
// Analysis Stream Resume Handler
// ============================================================================

/**
 * GET /chat/threads/:threadId/rounds/:roundNumber/analyze/resume
 *
 * Resume analysis stream from buffered chunks
 * Returns 204 No Content if no buffer exists or stream has no chunks
 * Returns text stream if buffer has chunks
 *
 * @pattern Following stream-resume.handler.ts pattern for chat streams
 */
export const resumeAnalysisStreamHandler: RouteHandler<typeof resumeAnalysisStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    operationName: 'resumeAnalysisStream',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber } = c.validated.params;

    const roundNum = Number.parseInt(roundNumber, 10);
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest(
        'Invalid round number. Must be a non-negative integer.',
        { errorType: 'validation', field: 'roundNumber' },
      );
    }

    // Verify thread ownership
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);

    // Check for active analysis stream
    const activeStreamId = await getActiveAnalysisStreamId(threadId, roundNum, c.env);

    // No active stream - return 204 No Content
    if (!activeStreamId) {
      return Responses.noContent(c);
    }

    // Get stream buffer metadata
    const metadata = await getAnalysisStreamMetadata(activeStreamId, c.env);

    // No buffer exists - return 204 No Content
    if (!metadata) {
      return Responses.noContent(c);
    }

    // =========================================================================
    // ✅ STREAM STATUS CHECK: Return appropriately based on stream state
    // =========================================================================
    // If stream is COMPLETED, return all buffered chunks as complete text
    // If stream is ACTIVE, check for stale streams (worker died after refresh)
    // If stream is stale, return buffered data or 204 to signal restart

    if (metadata.status === StreamStatuses.COMPLETED) {
      // Stream completed - return all buffered chunks as complete text
      const chunks = await getAnalysisStreamChunks(activeStreamId, c.env);
      if (!chunks || chunks.length === 0) {
        return Responses.noContent(c);
      }

      // Concatenate all chunks into complete JSON
      const completeText = chunks.map(chunk => chunk.data).join('');

      // ✅ PATTERN: Uses Responses.textComplete() builder for consistent headers
      return Responses.textComplete(completeText, {
        streamId: activeStreamId,
        roundNumber: roundNum,
        analysisId: metadata.analysisId,
        streamStatus: 'completed', // ✅ Indicates data is complete
      });
    }

    // =========================================================================
    // ✅ STALE STREAM DETECTION: Detect streams abandoned after page refresh
    // =========================================================================
    // If stream is ACTIVE but createdAt was too long ago (> 30 seconds),
    // the original worker likely died (user refreshed page).
    // Return buffered chunks if available, otherwise signal to restart.
    const STALE_STREAM_TIMEOUT_MS = 30 * 1000; // 30 seconds
    const streamAge = Date.now() - metadata.createdAt;
    const isStaleStream = streamAge > STALE_STREAM_TIMEOUT_MS;

    if (isStaleStream) {
      // Stream is stale - try to return any buffered chunks
      const chunks = await getAnalysisStreamChunks(activeStreamId, c.env);

      if (chunks && chunks.length > 0) {
        // We have partial data - return it as complete
        // Frontend can use this to display partial results
        const partialText = chunks.map(chunk => chunk.data).join('');

        // Clean up stale stream state
        await clearActiveAnalysisStream(threadId, roundNum, c.env);

        return Responses.textComplete(partialText, {
          streamId: activeStreamId,
          roundNumber: roundNum,
          analysisId: metadata.analysisId,
          streamStatus: 'stale-with-data', // ✅ Indicates partial data from stale stream
        });
      }

      // No buffered data - clean up and return 204 to signal restart
      await clearActiveAnalysisStream(threadId, roundNum, c.env);
      return Responses.noContent(c);
    }

    // Stream is still active and not stale - return 202 to indicate polling should continue
    // Frontend should poll /analyses endpoint for completion
    return Responses.accepted(c, {
      status: 'streaming',
      streamId: activeStreamId,
      message: 'Analysis stream is still active. Poll for completion.',
      retryAfterMs: 2000,
    });
  },
);
