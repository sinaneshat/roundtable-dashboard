/**
 * Analysis Handlers - Moderator AI analysis operations
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Extracted from monolithic handler.ts for better maintainability
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { streamObject } from 'ai';
import { asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { createHandler, Responses } from '@/api/core';
import { AnalysisStatuses } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
import type { ModeratorPromptConfig } from '@/api/services/moderator-analysis.service';
import {
  buildModeratorSystemPrompt,
  buildModeratorUserPrompt,
} from '@/api/services/moderator-analysis.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { extractModeratorModelName } from '@/api/services/openrouter-models.service';
import {
  checkAnalysisQuota,
  incrementAnalysisUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';

import type {
  analyzeRoundRoute,
  getThreadAnalysesRoute,
} from '../route';
import {
  ModeratorAnalysisPayloadSchema,
  ModeratorAnalysisRequestSchema,
} from '../schema';
import { verifyThreadOwnership } from './helpers';

// ============================================================================
// Analysis Handlers
// ============================================================================

function generateModeratorAnalysis(
  config: ModeratorPromptConfig & {
    env: ApiEnv['Bindings'];
    analysisId: string;
    threadId: string;
    userId: string;
  },
) {
  const { roundNumber, mode, userQuestion, participantResponses, changelogEntries, env, analysisId, threadId: _threadId, userId: _userId } = config;

  // ✅ ESTABLISHED PATTERN: Initialize OpenRouter and get client
  // Reference: src/api/services/analysis-background.service.ts:144-145
  initializeOpenRouter(env);
  const client = openRouterService.getClient();

  // ✅ FAST MODEL: Use GPT-4o for analysis (matches FLOW_DOCUMENTATION.md:144)
  const analysisModelId = 'openai/gpt-4o';

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
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.FAILED,
              errorMessage: finishError instanceof Error ? finishError.message : 'Unknown error',
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));

          // ✅ LOG FAILURE: Critical for debugging analysis issues
          console.error('[Analysis onFinish] Analysis failed during streaming:', {
            analysisId,
            threadId: _threadId,
            roundNumber,
            error: finishError instanceof Error ? finishError.message : String(finishError),
          });
        } catch (updateError) {
          // ✅ LOG DATABASE UPDATE FAILURE: Critical for persistence debugging
          console.error('[Analysis onFinish] Failed to update analysis status to FAILED:', {
            analysisId,
            threadId: _threadId,
            roundNumber,
            originalError: finishError instanceof Error ? finishError.message : String(finishError),
            updateError: updateError instanceof Error ? updateError.message : String(updateError),
          });
        }
        return;
      }

      if (finalObject) {
        try {
          const db = await getDbAsync();
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: AnalysisStatuses.COMPLETED,
              analysisData: finalObject,
              completedAt: new Date(),
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));

          // ✅ QUOTA: Analysis quota already deducted before streaming started (line ~3427)
          // No need to increment again here - quota charged regardless of stream completion

          // ✅ LOG SUCCESS: Confirm analysis completion
          // Removed console.log for production - consider using structured logging if needed
        } catch (updateError) {
          // ✅ CRITICAL: Log persistence failure - analysis generated but not saved
          console.error('[Analysis onFinish] Failed to persist completed analysis:', {
            analysisId,
            threadId: _threadId,
            roundNumber,
            hasData: !!finalObject,
            dataKeys: finalObject ? Object.keys(finalObject) : [],
            error: updateError instanceof Error ? updateError.message : String(updateError),
            stack: updateError instanceof Error ? updateError.stack : undefined,
          });

          // ✅ FALLBACK: Mark as failed with detailed error for debugging
          try {
            const db = await getDbAsync();
            await db.update(tables.chatModeratorAnalysis)
              .set({
                status: AnalysisStatuses.FAILED,
                errorMessage: `Persistence error: ${updateError instanceof Error ? updateError.message : 'Unknown error during database update'}`,
              })
              .where(eq(tables.chatModeratorAnalysis.id, analysisId));
          } catch (fallbackError) {
            console.error('[Analysis onFinish] Fallback status update also failed:', {
              analysisId,
              threadId: _threadId,
              roundNumber,
              fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            });
          }
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
 * ✅ Fast Model: Uses GPT-4o for reliable structured output
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
      // Find the most recent completed analysis (if any)
      const completedAnalysis = existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETED);

      // Delete all except the most recent completed
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

    // Get the remaining analysis (if any)
    const existingAnalysis = existingAnalyses.length === 1
      ? existingAnalyses[0]
      : existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETED);

    if (existingAnalysis) {
      // ✅ COMPLETED: Return existing analysis data (no streaming needed)
      if (existingAnalysis.status === AnalysisStatuses.COMPLETED && existingAnalysis.analysisData) {
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
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }

      // ✅ PENDING: Delete immediately instead of trying to claim
      // This is safer during regeneration to prevent race conditions
      if (existingAnalysis.status === AnalysisStatuses.PENDING) {
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
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      // ✅ FIX: If provided IDs don't match (client IDs), fall back to auto-query
      if (foundMessages.length === messageIds.length) {
        participantMessages = foundMessages as MessageWithParticipant[];
      } else {
        // Intentionally empty

      }
    }

    // ✅ OPTION 2: Auto-calculate messages (no IDs provided OR provided IDs were invalid)
    if (!participantMessages) {
      // ✅ CRITICAL FIX: Query messages by roundNumber field instead of assuming fixed participant counts
      // This handles scenarios where participant counts change between rounds
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

      if (roundMessages.length === 0) {
        throw createError.badRequest(
          `No messages found for round ${roundNum}. This round may not exist yet.`,
          {
            errorType: 'validation',
            field: 'roundNumber',
          },
        );
      }

      participantMessages = roundMessages as MessageWithParticipant[];
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

    // =========================================================================
    // ✅ QUOTA: Enforce analysis quota BEFORE starting
    // Follows established pattern: throw error with proper ErrorContext
    // Error middleware handles formatting and response
    // =========================================================================
    const analysisQuota = await checkAnalysisQuota(user.id);

    if (!analysisQuota.canCreate) {
      const context: ErrorContext = {
        errorType: 'resource',
        resource: 'chat_moderator_analysis',
        userId: user.id,
        resourceId: `${threadId}:${roundNum}`,
      };
      throw createError.badRequest(
        `Analysis generation limit reached. You have used ${analysisQuota.current} of ${analysisQuota.limit} analyses this month. Upgrade your plan for more analysis capacity.`,
        context,
      );
    }

    // ✅ QUOTA DEDUCTION: Deduct quota BEFORE streaming begins
    // This ensures user is charged even if connection is lost or stream is aborted
    await incrementAnalysisUsage(user.id);

    // ✅ Create analysis record with 'streaming' status
    const analysisId = ulid();

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
      userId: user.id, // Pass for quota tracking
      env: c.env,
    });

    // ✅ Return streaming response (Content-Type: text/plain; charset=utf-8)
    // The stream will flow directly to the frontend for progressive rendering
    // ✅ CRITICAL: streamObject() onFinish callback persists to database even if client disconnects
    // Unlike streamText(), streamObject() doesn't have consumeStream() but the onFinish callback
    // will still execute when the stream completes, ensuring analysis is persisted
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
