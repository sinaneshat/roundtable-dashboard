import type { RouteHandler } from '@hono/zod-openapi';
import { streamObject } from 'ai';
import { asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
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

function generateModeratorAnalysis(
  config: ModeratorPromptConfig & {
    env: ApiEnv['Bindings'];
    analysisId: string;
    threadId: string;
    userId: string;
  },
) {
  const { roundNumber, mode, userQuestion, participantResponses, changelogEntries, env, analysisId, threadId: _threadId, userId: _userId } = config;
  initializeOpenRouter(env);
  const client = openRouterService.getClient();
  const analysisModelId = 'openai/gpt-4o';
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
    changelogEntries,
  });
  return streamObject({
    model: client.chat(analysisModelId),
    schema: ModeratorAnalysisPayloadSchema,
    schemaName: 'ModeratorAnalysis',
    system: systemPrompt,
    prompt: userPrompt,
    mode: 'json',
    temperature: 0.3,
    experimental_telemetry: {
      isEnabled: true,
      functionId: `moderator-analysis-round-${roundNumber}`,
    },
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
        } catch {
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
    if (Number.isNaN(roundNum) || roundNum < 1) {
      throw createError.badRequest(
        'Invalid round number. Must be a positive integer.',
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
      const completedAnalysis = existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETED);
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
      : existingAnalyses.find(a => a.status === AnalysisStatuses.COMPLETED);
    if (existingAnalysis) {
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
      if (existingAnalysis.status === AnalysisStatuses.STREAMING) {
        const ageMs = Date.now() - existingAnalysis.createdAt.getTime();
        throw createError.conflict(
          `Analysis is already being generated (age: ${Math.round(ageMs / 1000)}s). Please wait for it to complete.`,
          {
            errorType: 'resource',
            resource: 'moderator_analysis',
            resourceId: existingAnalysis.id,
          },
        );
      }
      if (existingAnalysis.status === AnalysisStatuses.FAILED) {
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }
      if (existingAnalysis.status === AnalysisStatuses.PENDING) {
        await db.delete(tables.chatModeratorAnalysis)
          .where(eq(tables.chatModeratorAnalysis.id, existingAnalysis.id));
      }
    }
    type MessageWithParticipant = Awaited<ReturnType<typeof db.query.chatMessage.findMany>>[number] & {
      participant: NonNullable<Awaited<ReturnType<typeof db.query.chatParticipant.findFirst>>>;
    };
    let participantMessages: MessageWithParticipant[] | null = null;
    if (body.participantMessageIds && body.participantMessageIds.length > 0) {
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
      if (foundMessages.length === messageIds.length) {
        participantMessages = foundMessages as MessageWithParticipant[];
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
    const changelogEntries = await db.query.chatThreadChangelog.findMany({
      where: (fields, { and: andOp, eq: eqOp, lte: lteOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          lteOp(fields.createdAt, new Date(earliestParticipantTime)),
        ),
      orderBy: [desc(tables.chatThreadChangelog.createdAt)],
      limit: 20,
    });
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
    await incrementAnalysisUsage(user.id);
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
      })),
      analysisId,
      threadId,
      userId: user.id,
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
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    const now = Date.now();
    const orphanedAnalyses = allAnalyses.filter((analysis) => {
      if (analysis.status !== AnalysisStatuses.STREAMING && analysis.status !== AnalysisStatuses.PENDING)
        return false;
      const ageMs = now - analysis.createdAt.getTime();
      return ageMs > TWO_MINUTES_MS;
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
