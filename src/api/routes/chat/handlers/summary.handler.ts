import type { RouteHandler } from '@hono/zod-openapi';
import { streamObject } from 'ai';
import { asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses, STREAMING_CONFIG } from '@/api/core';
import { AIModels } from '@/api/core/ai-models';
import { MessageRoles, MessageStatuses, StreamStatuses, UIMessageRoles } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
import { filterDbToParticipantMessages } from '@/api/services/message-type-guards';
import { extractModeratorModelName } from '@/api/services/models-config.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import {
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/api/services/posthog-llm-tracking.service';
import {
  clearActiveSummaryStream,
  createLiveSummaryResumeStream,
  generateSummaryStreamId,
  getActiveSummaryStreamId,
  getSummaryStreamChunks,
  getSummaryStreamMetadata,
  initializeSummaryStreamBuffer,
} from '@/api/services/summary-stream-buffer.service';
import {
  enforceAnalysisQuota,
  incrementAnalysisUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { formatAgeMs, getTimestampAge, hasTimestampExceededTimeout } from '@/db/utils/timestamps';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas/participant-schemas';
import { requireParticipantMetadata } from '@/lib/utils/metadata';

import type {
  getThreadSummariesRoute,
  resumeSummaryStreamRoute,
  summarizeRoundRoute,
} from '../route';
import type { MessageWithParticipant } from '../schema';
import {
  MessageWithParticipantSchema,
  RoundSummaryAIContentSchema,
  RoundSummaryRequestSchema,
} from '../schema';

/**
 * Build system prompt for round summary generation
 * ✅ AI SDK PATTERN: streamObject with schema for progressive JSON streaming
 * NOTE: For structured outputs, the prompt should focus on WHAT to analyze,
 * not HOW to format - the schema handles the format
 */
function buildSummarySystemPrompt(config: {
  roundNumber: number;
  mode: string;
  userQuestion: string;
  participantResponses: Array<{
    participantIndex: number;
    participantRole: string;
    modelId: string;
    modelName: string;
    responseContent: string;
  }>;
}): string {
  const { roundNumber, mode, userQuestion, participantResponses } = config;

  return `You are an AI moderator analyzing a multi-AI conversation in ${mode} mode.
You MUST respond with a valid JSON object matching the provided schema. Do not include any text outside the JSON.

User Question: ${userQuestion}

Round ${roundNumber} Participant Responses:
${participantResponses.map(p => `${p.participantRole} (${p.modelName}): ${p.responseContent}`).join('\n\n')}

Analyze this conversation round and provide:
1. A concise summary (2-3 sentences) of the key points discussed
2. Rate the conversation on 4 metrics (0-100 scale):
   - engagement: How actively participants contributed
   - insight: Quality and depth of ideas shared
   - balance: How well perspectives were distributed
   - clarity: How clear and understandable the discussion was`;
}

/**
 * Build user prompt for round summary generation
 */
function buildSummaryUserPrompt(): string {
  return 'Analyze this conversation and return the summary and metrics as JSON.';
}

function generateRoundSummary(
  config: {
    roundNumber: number;
    mode: string;
    userQuestion: string;
    participantResponses: Array<{
      participantIndex: number;
      participantRole: string;
      modelId: string;
      modelName: string;
      responseContent: string;
    }>;
    env: ApiEnv['Bindings'];
    summaryId: string;
    threadId: string;
    userId: string;
    sessionId?: string; // PostHog session ID for Session Replay linking
    executionCtx?: ExecutionContext; // Cloudflare Workers ExecutionContext for waitUntil
    streamId?: string;
  },
) {
  const { roundNumber, mode, userQuestion, participantResponses, env, summaryId, threadId, userId, sessionId, executionCtx, streamId } = config;

  const llmTraceId = generateTraceId();
  const llmStartTime = performance.now();

  initializeOpenRouter(env);
  const client = openRouterService.getClient();
  const summaryModelId = AIModels.SUMMARY;
  const summaryModelName = extractModeratorModelName(summaryModelId);
  const systemPrompt = buildSummarySystemPrompt({
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
  });
  const userPrompt = buildSummaryUserPrompt();

  // ✅ AI SDK v5 PATTERN: streamObject with schema for progressive JSON streaming
  // Uses partialObjectStream on client for gradual object building
  // Returns toTextStreamResponse() for HTTP streaming
  // ✅ CRITICAL: Use RoundSummaryAIContentSchema (summary + metrics only)
  // NOT RoundSummaryPayloadSchema (which includes roundNumber, mode, userQuestion metadata)
  return streamObject({
    model: client.chat(AIModels.SUMMARY),
    schema: RoundSummaryAIContentSchema, // ✅ AI-generated content only
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,
    // ✅ CRITICAL: Force structured outputs mode for OpenRouter
    // Without this, some models may ignore the schema and output plain text
    providerOptions: {
      openrouter: {
        structured_outputs: true,
      },
    },
    onFinish: async ({ object: finalObject, error: finishError, usage }) => {
      if (finishError) {
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: MessageStatuses.FAILED,
              errorMessage: finishError instanceof Error ? finishError.message : 'Unknown error',
            })
            .where(eq(tables.chatModeratorAnalysis.id, summaryId));

          if (streamId) {
            await clearActiveSummaryStream(threadId, roundNumber, env);
          }

          const trackError = async () => {
            try {
              await trackLLMError(
                {
                  userId,
                  sessionId,
                  threadId,
                  roundNumber,
                  participantId: 'moderator',
                  participantIndex: NO_PARTICIPANT_SENTINEL,
                  participantRole: 'AI Moderator',
                  modelId: summaryModelId,
                  modelName: summaryModelName,
                  threadMode: mode,
                },
                finishError as Error,
                llmTraceId,
                'round_summary',
              );
            } catch {
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
      if (finalObject) {
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: MessageStatuses.COMPLETE,
              summaryData: finalObject,
              completedAt: new Date(),
            })
            .where(eq(tables.chatModeratorAnalysis.id, summaryId));

          if (streamId) {
            await clearActiveSummaryStream(threadId, roundNumber, env);
          }

          const finishResult = {
            text: JSON.stringify(finalObject),
            finishReason: 'stop' as const,
            usage: usage
              ? {
                  inputTokens: usage.inputTokens || 0,
                  outputTokens: usage.outputTokens || 0,
                  totalTokens: usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0),
                }
              : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          };

          const inputMessages = [{
            role: UIMessageRoles.USER,
            content: userPrompt,
          }];

          const trackAnalytics = async () => {
            try {
              await trackLLMGeneration(
                {
                  userId,
                  sessionId,
                  threadId,
                  roundNumber,
                  participantId: 'moderator',
                  participantIndex: NO_PARTICIPANT_SENTINEL,
                  participantRole: 'AI Moderator',
                  modelId: summaryModelId,
                  modelName: summaryModelName,
                  threadMode: mode,
                },
                finishResult,
                inputMessages,
                llmTraceId,
                llmStartTime,
                {
                  modelConfig: {
                    temperature: 0.3,
                  },
                  promptTracking: {
                    promptId: 'round_summary',
                    promptVersion: 'v1.0',
                  },
                  additionalProperties: {
                    summary_id: summaryId,
                    summary_type: 'round_summary',
                    participant_count: participantResponses.length,
                    response_type: 'structured_json',
                  },
                },
              );
            } catch {
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
                status: MessageStatuses.FAILED,
                errorMessage: `Persistence error: ${updateError instanceof Error ? updateError.message : 'Unknown error during database update'}`,
              })
              .where(eq(tables.chatModeratorAnalysis.id, summaryId));
          } catch {
          }
        }
      }
    },
  });
}
export const summarizeRoundHandler: RouteHandler<typeof summarizeRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    validateBody: RoundSummaryRequestSchema,
    operationName: 'summarizeRound',
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
    const existingSummaries = await db.query.chatModeratorAnalysis.findMany({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.roundNumber, roundNum),
        ),
      orderBy: [desc(tables.chatModeratorAnalysis.createdAt)],
    });
    if (existingSummaries.length > 1) {
      const completedSummary = existingSummaries.find(a => a.status === MessageStatuses.COMPLETE);
      const summariesToDelete = existingSummaries.filter(a =>
        a.id !== completedSummary?.id,
      );
      if (summariesToDelete.length > 0) {
        for (const analysis of summariesToDelete) {
          await db.delete(tables.chatModeratorAnalysis)
            .where(eq(tables.chatModeratorAnalysis.id, analysis.id));
        }
      }
    }
    const existingSummary = existingSummaries.length === 1
      ? existingSummaries[0]
      : existingSummaries.find(a => a.status === MessageStatuses.COMPLETE);
    if (existingSummary) {
      if (existingSummary.status === MessageStatuses.COMPLETE && existingSummary.summaryData) {
        // ✅ CRITICAL FIX: Return raw JSON for useObject compatibility
        // useObject hook expects raw object data, not wrapped in API response
        // Must match the format that streamObject returns
        const completeSummaryData = {
          ...existingSummary.summaryData,
          mode: existingSummary.mode,
          roundNumber: existingSummary.roundNumber,
          userQuestion: existingSummary.userQuestion,
        };
        return Responses.raw(c, completeSummaryData);
      }
      if (existingSummary.status === MessageStatuses.STREAMING) {
        // Check if stream has timed out using clean timestamp utilities
        if (hasTimestampExceededTimeout(existingSummary.createdAt, STREAMING_CONFIG.STREAM_TIMEOUT_MS)) {
          // SSE connections can get interrupted without backend knowing
          // Mark stale streaming analyses as failed so new streams can start
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: MessageStatuses.FAILED,
              errorMessage: `Stream timeout after ${formatAgeMs(getTimestampAge(existingSummary.createdAt))} - SSE connection likely interrupted`,
            })
            .where(eq(tables.chatModeratorAnalysis.id, existingSummary.id));

          // ✅ RESUMABLE STREAMS: Clear any stale buffer for this round
          await clearActiveSummaryStream(threadId, roundNum, c.env);

          // Continue to create new analysis below
        } else {
          // =========================================================================
          // ✅ RESUMABLE STREAMS: Try to return buffered stream instead of 409
          // =========================================================================
          // Instead of rejecting with 409, try to return the buffered stream data
          // This allows clients to resume from where they left off after page refresh

          const existingStreamId = await getActiveSummaryStreamId(threadId, roundNum, c.env);

          if (existingStreamId) {
            // =========================================================================
            // ✅ STALE CHUNK DETECTION: Check if stream has received data recently
            // =========================================================================
            // If no new chunks in last 15 seconds, the original worker likely died
            // (user refreshed page mid-stream). Mark as failed and start fresh.
            const STALE_CHUNK_TIMEOUT_MS = 15 * 1000;
            const chunks = await getSummaryStreamChunks(existingStreamId, c.env);
            const lastChunkTime = chunks && chunks.length > 0
              ? Math.max(...chunks.map(chunk => chunk.timestamp))
              : 0;
            const isStaleStream = lastChunkTime > 0 && Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

            if (isStaleStream) {
              // Stream is stale - clear it and create a new one
              await clearActiveSummaryStream(threadId, roundNum, c.env);
              await db.update(tables.chatModeratorAnalysis)
                .set({
                  status: MessageStatuses.FAILED,
                  errorMessage: `Stream stale - no new data in ${Math.round((Date.now() - lastChunkTime) / 1000)}s (page likely refreshed mid-stream)`,
                })
                .where(eq(tables.chatModeratorAnalysis.id, existingSummary.id));
              // Continue to create new analysis below (fall through)
            } else {
              // =========================================================================
              // ✅ LIVE STREAM RESUMPTION: Return a live stream that polls for new chunks
              // =========================================================================
              // This creates a stream that:
              // 1. Returns all buffered chunks immediately
              // 2. Continues polling KV for new chunks as they arrive
              // 3. Streams new chunks to client in real-time
              // 4. Completes when the original stream finishes (or times out if dead)
              // ✅ PATTERN: Uses Responses.textStream() builder for consistent headers
              const liveStream = createLiveSummaryResumeStream(existingStreamId, c.env);
              return Responses.textStream(liveStream, {
                streamId: existingStreamId,
                resumedFromBuffer: true,
              });
            }
          }

          // =========================================================================
          // ✅ FIX: No active stream ID means stream died or KV unavailable
          // =========================================================================
          // Instead of returning 202 polling (which causes infinite retry loop),
          // treat this like a timed-out stream: mark as failed and create new stream.
          // This handles:
          // 1. KV not available in local dev
          // 2. Stream buffer wasn't initialized due to error
          // 3. KV entry expired or was cleared
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: MessageStatuses.FAILED,
              errorMessage: `Stream buffer not found (KV unavailable or stream not initialized) - restarting analysis`,
            })
            .where(eq(tables.chatModeratorAnalysis.id, existingSummary.id));

          // Continue to create new analysis below (fall through)
        }
      }
      if (existingSummary.status === MessageStatuses.FAILED) {
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingSummary.id));
      }
      if (existingSummary.status === MessageStatuses.PENDING) {
        // ✅ IDEMPOTENT FIX: Update pending summary to streaming and start stream
        // This handles the race condition where message-persistence creates 'pending' summary
        // and frontend immediately calls analyze endpoint
        // Reuse the existing summary ID to maintain consistency

        // Fetch participant messages using the provided IDs
        const messageIds = body.participantMessageIds || existingSummary.participantMessageIds;
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
        // Frontend triggers summary based on optimistic state before backend finishes persistence
        // Return 202 to signal "not ready yet" - frontend's existing polling mechanism will retry
        if (foundMessages.length === 0) {
          return Responses.polling(c, {
            status: 'pending',
            resourceId: existingSummary.id,
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
              participantRole: participant.role || 'AI Assistant',
              modelId: participant.modelId,
              modelName,
              responseContent: extractTextFromParts(msg.parts),
            };
          })
          .sort((a, b) => a.participantIndex - b.participantIndex);

        const summaryId = existingSummary.id;
        await db.update(tables.chatModeratorAnalysis)
          .set({
            status: MessageStatuses.STREAMING,
            participantMessageIds: messageIds,
          })
          .where(eq(tables.chatModeratorAnalysis.id, summaryId));

        const { session } = c.auth();

        const result = generateRoundSummary({
          roundNumber: roundNum,
          mode: thread.mode,
          userQuestion: existingSummary.userQuestion,
          participantResponses,
          env: c.env,
          summaryId,
          threadId,
          userId: user.id,
          executionCtx: c.executionCtx,
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
      // Frontend triggers summary based on optimistic state before backend finishes persistence
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
        'No participant messages found for summary',
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
    const participantResponses = participantMessages
      .map((msg) => {
        const participant = msg.participant!;
        const modelName = extractModeratorModelName(participant.modelId);

        // ✅ TYPE-SAFE METADATA EXTRACTION: Use utility that validates with Zod
        // Throws if metadata is invalid - replaces inline Record<string, unknown> cast
        const metadata = requireParticipantMetadata(msg.metadata);

        return {
          participantIndex: metadata.participantIndex,
          participantRole: participant.role || 'AI Assistant',
          modelId: participant.modelId,
          modelName,
          responseContent: extractTextFromParts(msg.parts),
        };
      })
      .sort((a, b) => a.participantIndex - b.participantIndex);

    // Enforce summary quota before generation
    await enforceAnalysisQuota(user.id);
    await incrementAnalysisUsage(user.id);

    const summaryId = ulid();
    await db.insert(tables.chatModeratorAnalysis).values({
      id: summaryId,
      threadId,
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      status: MessageStatuses.STREAMING, // ✅ Set to STREAMING since stream starts immediately after
      participantMessageIds: participantMessages.map(m => m.id),
      createdAt: new Date(),
    });

    // =========================================================================
    // ✅ RESUMABLE STREAMS: Initialize stream buffer for summary resumption
    // =========================================================================
    const streamId = generateSummaryStreamId(threadId, roundNum);
    await initializeSummaryStreamBuffer(
      streamId,
      threadId,
      roundNum,
      summaryId,
      c.env,
    );

    // =========================================================================
    // ✅ POSTHOG SESSION TRACKING: Use Better Auth session for tracking
    // =========================================================================
    // Using Better Auth session.id provides stable, reliable session tracking
    const { session } = c.auth();

    const result = generateRoundSummary({
      roundNumber: roundNum,
      mode: thread.mode,
      userQuestion,
      participantResponses,
      summaryId,
      threadId,
      userId: user.id,
      executionCtx: c.executionCtx, // ✅ Pass executionCtx for waitUntil
      sessionId: session?.id, // Better Auth session ID (stable, reliable)
      env: c.env,
      streamId, // ✅ RESUMABLE STREAMS: Pass stream ID for cleanup on completion
    });

    // ✅ AI SDK v5 PATTERN: Return toTextStreamResponse() directly
    // Following the exact pattern from AI SDK docs for proper object streaming.
    // The useObject hook on client expects raw text stream with JSON deltas.
    //
    // TEMPORARY: Return raw response to test if streaming works without buffer
    // TODO: Re-enable buffer wrapper once streaming is confirmed working
    return result.toTextStreamResponse();
  },
);
export const getThreadSummariesHandler: RouteHandler<typeof getThreadSummariesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadSummaries',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();
    await verifyThreadOwnership(threadId, user.id, db);
    const allSummaries = await db.query.chatModeratorAnalysis.findMany({
      where: eq(tables.chatModeratorAnalysis.threadId, threadId),
      orderBy: [desc(tables.chatModeratorAnalysis.roundNumber), desc(tables.chatModeratorAnalysis.createdAt)],
    });
    const orphanedSummaries = allSummaries.filter((analysis) => {
      if (analysis.status !== MessageStatuses.STREAMING && analysis.status !== MessageStatuses.PENDING)
        return false;
      // Check if timestamp has exceeded orphan cleanup timeout
      return hasTimestampExceededTimeout(analysis.createdAt, STREAMING_CONFIG.ORPHAN_CLEANUP_TIMEOUT_MS);
    });
    if (orphanedSummaries.length > 0) {
      for (const analysis of orphanedSummaries) {
        await db.update(tables.chatModeratorAnalysis)
          .set({
            status: MessageStatuses.FAILED,
            errorMessage: 'Summary timed out after 2 minutes. This may have been caused by a page refresh or connection issue during streaming.',
          })
          .where(eq(tables.chatModeratorAnalysis.id, analysis.id));
      }
      const updatedSummaries = await db.query.chatModeratorAnalysis.findMany({
        where: eq(tables.chatModeratorAnalysis.threadId, threadId),
        orderBy: [desc(tables.chatModeratorAnalysis.roundNumber), desc(tables.chatModeratorAnalysis.createdAt)],
      });
      const summariesMap = new Map<number, typeof updatedSummaries[0]>();
      for (const analysis of updatedSummaries) {
        if (!summariesMap.has(analysis.roundNumber)) {
          summariesMap.set(analysis.roundNumber, analysis);
        }
      }
      const analyses = Array.from(summariesMap.values())
        .sort((a, b) => a.roundNumber - b.roundNumber);
      return Responses.collection(c, analyses);
    }
    const summariesMap = new Map<number, typeof allSummaries[0]>();
    for (const analysis of allSummaries) {
      if (!summariesMap.has(analysis.roundNumber)) {
        summariesMap.set(analysis.roundNumber, analysis);
      }
    }
    const analyses = Array.from(summariesMap.values())
      .sort((a, b) => a.roundNumber - b.roundNumber);
    return Responses.collection(c, analyses);
  },
);

// ============================================================================
// Summary Stream Resume Handler
// ============================================================================

/**
 * GET /chat/threads/:threadId/rounds/:roundNumber/analyze/resume
 *
 * Resume summary stream from buffered chunks
 * Returns 204 No Content if no buffer exists or stream has no chunks
 * Returns text stream if buffer has chunks
 *
 * @pattern Following stream-resume.handler.ts pattern for chat streams
 */
export const resumeSummaryStreamHandler: RouteHandler<typeof resumeSummaryStreamRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    operationName: 'resumeSummaryStream',
  },
  async (c) => {
    // ✅ LOCAL DEV FIX: If KV is not available, return 204 immediately
    // Without KV, stream resumption cannot work properly.
    if (!c.env?.KV) {
      return Responses.noContent(c);
    }

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

    // Check for active summary stream
    const activeStreamId = await getActiveSummaryStreamId(threadId, roundNum, c.env);

    // No active stream - return 204 No Content
    if (!activeStreamId) {
      return Responses.noContent(c);
    }

    // Get stream buffer metadata
    const metadata = await getSummaryStreamMetadata(activeStreamId, c.env);

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
      const chunks = await getSummaryStreamChunks(activeStreamId, c.env);
      if (!chunks || chunks.length === 0) {
        return Responses.noContent(c);
      }

      // Concatenate all chunks into complete JSON
      const completeText = chunks.map(chunk => chunk.data).join('');

      // ✅ PATTERN: Uses Responses.textComplete() builder for consistent headers
      return Responses.textComplete(completeText, {
        streamId: activeStreamId,
        roundNumber: roundNum,
        summaryId: metadata.summaryId,
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
      const chunks = await getSummaryStreamChunks(activeStreamId, c.env);

      if (chunks && chunks.length > 0) {
        // We have partial data - return it as complete
        // Frontend can use this to display partial results
        const partialText = chunks.map(chunk => chunk.data).join('');

        // Clean up stale stream state
        await clearActiveSummaryStream(threadId, roundNum, c.env);

        return Responses.textComplete(partialText, {
          streamId: activeStreamId,
          roundNumber: roundNum,
          summaryId: metadata.summaryId,
          streamStatus: 'stale-with-data', // ✅ Indicates partial data from stale stream
        });
      }

      // No buffered data - clean up and return 204 to signal restart
      await clearActiveSummaryStream(threadId, roundNum, c.env);
      return Responses.noContent(c);
    }

    // Stream is still active and not stale - return 202 to indicate polling should continue
    // Frontend should poll /analyses endpoint for completion
    return Responses.accepted(c, {
      status: 'streaming',
      streamId: activeStreamId,
      message: 'Summary stream is still active. Poll for completion.',
      retryAfterMs: 2000,
    });
  },
);
