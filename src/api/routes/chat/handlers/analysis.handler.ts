import type { RouteHandler } from '@hono/zod-openapi';
import { streamObject } from 'ai';
import { asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses, STREAMING_CONFIG } from '@/api/core';
import { AIModels } from '@/api/core/ai-models';
import { AnalysisStatuses, UIMessageRoles } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
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
  },
) {
  const { roundNumber, mode, userQuestion, participantResponses, changelogEntries, userTier, env, analysisId, threadId, userId, sessionId, executionCtx } = config;

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

  // ✅ AI SDK v5: streamObject with mode:'json' (OpenRouter compatibility)
  // mode:'json' uses response_format: {type: 'json_object'} instead of json_schema
  // This prevents "json_schema not supported" errors on OpenAI/DeepSeek/Groq via OpenRouter
  const enhancedUserPrompt = buildModeratorAnalysisEnhancedPrompt(userPrompt);

  return streamObject({
    model: client.chat(AIModels.ANALYSIS),
    schema: ModeratorAnalysisPayloadSchema,
    mode: 'json', // ✅ CRITICAL: Force JSON mode instead of json_schema
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
          // AI SDK guarantees this matches ModeratorAnalysisPayloadSchema
          const validatedObject = finalObject;

          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.COMPLETE,
              analysisData: validatedObject,
              completedAt: new Date(),
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));

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
        return c.json(completeAnalysisData);
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

          // Continue to create new analysis below
        } else {
          // Still within timeout window - reject duplicate request
          const ageMs = getTimestampAge(existingAnalysis.createdAt);
          throw createError.conflict(
            `Analysis is already being generated (age: ${formatAgeMs(ageMs)}). Please wait for it to complete.`,
            {
              errorType: 'resource',
              resource: 'moderator_analysis',
              resourceId: existingAnalysis.id,
            },
          );
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
              eqOp(fields.role, 'assistant'),
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

        if (foundMessages.length === 0) {
          throw createError.badRequest(
            'No participant messages found for analysis',
            {
              errorType: 'validation',
              field: 'participantMessageIds',
            },
          );
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
            eqOp(fields.role, 'assistant'),
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
            eqOp(fields.role, 'assistant'),
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
      if (participantOnlyMessages.length === 0) {
        throw createError.badRequest(
          `No participant messages found for round ${roundNum}. This round may not have participant responses yet.`,
          {
            errorType: 'validation',
            field: 'roundNumber',
          },
        );
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
          eqOp(fields.role, 'user'),
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
        // ✅ TYPE-SAFE: changeData is JSON from database, validate with type guard
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
    });
    return result.toTextStreamResponse();
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
