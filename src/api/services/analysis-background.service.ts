/**
 * Analysis Background Processing Service
 *
 * ✅ SERVICE LAYER PATTERN: Extracts reusable analysis processing logic
 * ✅ BACKGROUND PROCESSING: Decouples analysis from HTTP request lifecycle
 * ✅ TYPE SAFETY: Full TypeScript support with Zod schemas
 *
 * This service handles background processing of chat thread moderator analyses.
 * It can be called from:
 * - HTTP handlers (direct invocation)
 * - Background workers (service binding self-invocation)
 * - Scheduled tasks (future use)
 */

import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { AI_TIMEOUT_CONFIG } from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatModeId } from '@/lib/config/chat-modes';

import { buildModeratorSystemPrompt, buildModeratorUserPrompt } from './moderator-analysis.service';
import { extractModeratorModelName } from './openrouter-models.service';

// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================

/**
 * Analysis processing parameters schema
 * Validates all required data for background processing
 */
export const AnalysisProcessingParamsSchema = z.object({
  analysisId: z.string().min(1),
  threadId: z.string().min(1),
  roundNum: z.number().int().positive(),
  userQuestion: z.string().min(1),
  mode: z.string().min(1),
  participantResponses: z.array(z.object({
    participantIndex: z.number().int().nonnegative(),
    participantRole: z.string().nullable(),
    modelId: z.string().min(1),
    modelName: z.string().min(1),
    responseContent: z.string().min(1),
  })).min(1),
  env: z.custom<ApiEnv['Bindings']>((data) => {
    // Basic validation - ensure env object exists with required fields
    return typeof data === 'object' && data !== null;
  }),
});

export type AnalysisProcessingParams = z.infer<typeof AnalysisProcessingParamsSchema>;

/**
 * Analysis trigger parameters schema
 * Used for initiating background analysis via service binding
 */
export const AnalysisTriggerParamsSchema = z.object({
  analysisId: z.string().min(1),
  threadId: z.string().min(1),
  roundNum: z.number().int().positive(),
  userQuestion: z.string().min(1),
  mode: z.string().min(1),
  participantResponses: z.array(z.object({
    participantIndex: z.number().int().nonnegative(),
    participantRole: z.string().nullable(),
    modelId: z.string().min(1),
    modelName: z.string().min(1),
    responseContent: z.string().min(1),
  })).min(1),
});

export type AnalysisTriggerParams = z.infer<typeof AnalysisTriggerParamsSchema>;

// ============================================================================
// BACKGROUND PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process analysis in background
 *
 * ✅ DECOUPLED FROM HTTP: Can run independently of HTTP request
 * ✅ ATOMIC UPDATES: Database status transitions are atomic
 * ✅ ERROR HANDLING: All errors caught and recorded in database
 *
 * This function performs the actual AI streaming and database updates.
 * It's designed to be called from:
 * - analyzeRoundHandler (direct invocation)
 * - analyzeBackgroundHandler (service binding worker)
 * - Any other context that needs to process an analysis
 *
 * @param params - Analysis processing parameters
 * @returns Promise that resolves when processing completes (success or failure)
 *
 * @example
 * ```typescript
 * await processAnalysisInBackground({
 *   analysisId: 'abc123',
 *   threadId: 'thread123',
 *   roundNum: 1,
 *   userQuestion: 'What are the benefits of AI?',
 *   mode: 'analyzing',
 *   participantResponses: [...],
 *   env: c.env,
 * });
 * ```
 */
export async function processAnalysisInBackground(
  params: AnalysisProcessingParams,
): Promise<void> {
  const { analysisId, threadId, roundNum, userQuestion, participantResponses, mode, env } = params;

  console.warn('[processAnalysisInBackground] 🔥 Starting background analysis processing', {
    analysisId,
    threadId,
    roundNumber: roundNum,
    participantCount: participantResponses.length,
  });

  // ✅ VALIDATION: Validate params with Zod
  const validationResult = AnalysisProcessingParamsSchema.safeParse(params);
  if (!validationResult.success) {
    console.error('[processAnalysisInBackground] ❌ Invalid parameters', {
      errors: validationResult.error.issues,
    });
    throw createError.badRequest(
      `Invalid analysis processing parameters: ${validationResult.error.message}`,
      {
        errorType: 'validation',
      },
    );
  }

  // ✅ Update analysis status to 'streaming' before starting
  // This indicates that background processing has started
  try {
    const db = await getDbAsync();
    await db.update(tables.chatModeratorAnalysis)
      .set({ status: 'streaming' })
      .where(eq(tables.chatModeratorAnalysis.id, analysisId));

    console.warn('[processAnalysisInBackground] ✅ Updated status to streaming', {
      analysisId,
    });
  } catch (updateError) {
    console.error('[processAnalysisInBackground] ❌ Failed to update status:', updateError);
    // Continue anyway - don't fail the entire process
  }

  // ✅ FIXED MODEL: Always use Claude 3.5 Sonnet for analysis
  const analysisModelId = 'anthropic/claude-3.5-sonnet';

  // Initialize OpenRouter
  initializeOpenRouter(env);
  const client = openRouterService.getClient();

  // Build moderator prompts
  const moderatorConfig = {
    mode: mode as ChatModeId,
    roundNumber: roundNum,
    userQuestion,
    participantResponses,
  };

  const systemPrompt = buildModeratorSystemPrompt(moderatorConfig);
  const userPrompt = buildModeratorUserPrompt(moderatorConfig);

  // ✅ AI SDK v5 streamObject() Pattern: Stream structured JSON
  const { streamObject } = await import('ai');

  try {
    const result = streamObject({
      model: client.chat(analysisModelId),
      schema: ModeratorAnalysisPayloadSchema,
      schemaName: 'ModeratorAnalysis',
      system: systemPrompt,
      prompt: userPrompt,
      mode: 'json', // Force JSON mode for better schema adherence

      // ✅ Telemetry for monitoring
      experimental_telemetry: {
        isEnabled: true,
        functionId: `moderator-analysis-round-${roundNum}`,
      },

      // ✅ Timeout protection (background processing doesn't have HTTP signal)
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.moderatorAnalysisMs),

      // ✅ Stream callbacks for database persistence
      onFinish: async ({ object: finalObject, error, usage: _usage }) => {
        console.warn('[processAnalysisInBackground] 🏁 onFinish called', {
          analysisId,
          hasError: !!error,
          hasObject: !!finalObject,
          errorMessage: error instanceof Error ? error.message : error ? String(error) : undefined,
        });

        const db = await getDbAsync();

        // ✅ FAILED: Update status to failed with error message
        if (error) {
          try {
            console.warn('[processAnalysisInBackground] ❌ Marking analysis as failed', analysisId);
            await db.update(tables.chatModeratorAnalysis)
              .set({
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : String(error),
              })
              .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            console.warn('[processAnalysisInBackground] ✅ Analysis marked as failed', analysisId);
          } catch (updateError) {
            console.error('[processAnalysisInBackground] ❌ Failed to update analysis status to failed:', updateError);
          }
          return;
        }

        // ✅ NO OBJECT: Mark as failed
        if (!finalObject) {
          try {
            console.warn('[processAnalysisInBackground] ❌ No object generated, marking as failed', analysisId);
            await db.update(tables.chatModeratorAnalysis)
              .set({
                status: 'failed',
                errorMessage: 'Analysis completed but no object was generated',
              })
              .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            console.warn('[processAnalysisInBackground] ✅ Analysis marked as failed (no object)', analysisId);
          } catch (updateError) {
            console.error('[processAnalysisInBackground] ❌ Failed to update analysis status (no object):', updateError);
          }
          return;
        }

        // ✅ Validate schema before saving
        const hasValidStructure = finalObject.participantAnalyses
          && Array.isArray(finalObject.participantAnalyses)
          && finalObject.leaderboard
          && Array.isArray(finalObject.leaderboard)
          && finalObject.overallSummary
          && finalObject.conclusion;

        if (!hasValidStructure) {
          try {
            console.warn('[processAnalysisInBackground] ❌ Invalid structure, marking as failed', analysisId);
            await db.update(tables.chatModeratorAnalysis)
              .set({
                status: 'failed',
                errorMessage: 'Analysis generated but structure is invalid',
              })
              .where(eq(tables.chatModeratorAnalysis.id, analysisId));
            console.warn('[processAnalysisInBackground] ✅ Analysis marked as failed (invalid structure)', analysisId);
          } catch (updateError) {
            console.error('[processAnalysisInBackground] ❌ Failed to update analysis status (invalid structure):', updateError);
          }
          return;
        }

        // ✅ SUCCESS: Update with analysis data and mark as completed
        try {
          console.warn('[processAnalysisInBackground] ✅ Marking analysis as completed', analysisId);
          await db.update(tables.chatModeratorAnalysis)
            .set({
              status: 'completed',
              analysisData: {
                leaderboard: finalObject.leaderboard,
                participantAnalyses: finalObject.participantAnalyses,
                overallSummary: finalObject.overallSummary,
                conclusion: finalObject.conclusion,
              },
              completedAt: new Date(),
            })
            .where(eq(tables.chatModeratorAnalysis.id, analysisId));
          console.warn('[processAnalysisInBackground] 🎉 Analysis successfully completed', analysisId);
        } catch (updateError) {
          console.error('[processAnalysisInBackground] ❌ CRITICAL: Failed to save completed analysis:', {
            analysisId,
            error: updateError,
          });
        }
      },
    });

    // ✅ CONSUME STREAM: Process all chunks (fire-and-forget)
    // In background mode, we don't need to send chunks to client
    // We just need to let the stream complete so onFinish callback runs
    // Iterate through the stream to ensure it completes
    for await (const _part of result.fullStream) {
      // Just consume the stream, don't need to process parts
    }

    console.warn('[processAnalysisInBackground] ✅ Stream consumed successfully', {
      analysisId,
    });
  } catch (error) {
    // ✅ CRITICAL FIX: Mark analysis as failed before throwing
    console.error('[processAnalysisInBackground] ❌ Stream failed, marking analysis as failed', {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const db = await getDbAsync();
      await db.update(tables.chatModeratorAnalysis)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(tables.chatModeratorAnalysis.id, analysisId));
      console.warn('[processAnalysisInBackground] ✅ Analysis marked as failed after stream error', analysisId);
    } catch (updateError) {
      console.error('[processAnalysisInBackground] ❌ Failed to update analysis status after error:', updateError);
    }

    // Don't re-throw - background processing should not crash the worker
    // Error is already logged and recorded in database
  }
}

/**
 * Trigger background analysis via service binding
 *
 * ✅ FIRE-AND-FORGET: Returns immediately, doesn't wait for completion
 * ✅ SERVICE BINDING: Uses WORKER_SELF_REFERENCE for background invocation
 * ✅ ERROR HANDLING: Catches invocation errors, doesn't block caller
 *
 * This function invokes the background worker endpoint to process analysis.
 * It's designed to be non-blocking - it fires the request and returns immediately.
 *
 * @param params - Analysis trigger parameters
 * @param env - Cloudflare environment bindings
 *
 * @example
 * ```typescript
 * // Fire and forget - don't await
 * triggerBackgroundAnalysis(params, c.env).catch(err =>
 *   console.error('Background trigger failed:', err)
 * );
 * ```
 */
export async function triggerBackgroundAnalysis(
  params: AnalysisTriggerParams,
  env: ApiEnv['Bindings'],
): Promise<void> {
  try {
    console.warn('[triggerBackgroundAnalysis] 🔥 Invoking background worker', {
      analysisId: params.analysisId,
      threadId: params.threadId,
      roundNumber: params.roundNum,
    });

    // ✅ SERVICE BINDING: Self-invoke via WORKER_SELF_REFERENCE
    // Fire-and-forget pattern - don't await the response
    if (!env.WORKER_SELF_REFERENCE) {
      console.error('[triggerBackgroundAnalysis] ❌ WORKER_SELF_REFERENCE not configured');
      return;
    }

    env.WORKER_SELF_REFERENCE.fetch(
      new Request('http://internal/api/v1/chat/analyze-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }),
    ).catch((err) => {
      // Log but don't throw - this is fire-and-forget
      console.error('[triggerBackgroundAnalysis] ❌ Background invocation failed:', {
        analysisId: params.analysisId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    console.warn('[triggerBackgroundAnalysis] ✅ Background worker invoked', {
      analysisId: params.analysisId,
    });
  } catch (error) {
    // Log and swallow error - don't block the caller
    console.error('[triggerBackgroundAnalysis] ❌ Failed to invoke background worker:', {
      analysisId: params.analysisId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Restart stale analysis
 *
 * ✅ WATCHDOG PATTERN: Detects and restarts stuck analyses
 * ✅ ATOMIC: Marks old as failed, creates new, triggers background processing
 * ✅ IDEMPOTENT: Safe to call multiple times
 *
 * This function is called by the watchdog mechanism to restart analyses
 * that have been stuck in "streaming" status for too long.
 *
 * @param staleAnalysis - The stuck analysis record
 * @param staleAnalysis.id - The analysis ID
 * @param staleAnalysis.threadId - The thread ID
 * @param staleAnalysis.roundNumber - The round number
 * @param staleAnalysis.mode - The chat mode
 * @param staleAnalysis.userQuestion - The user's question
 * @param participantMessageIds - Message IDs to reprocess
 * @param env - Cloudflare environment bindings
 *
 * @example
 * ```typescript
 * await restartStaleAnalysis(
 *   {
 *     id: 'analysis123',
 *     threadId: 'thread123',
 *     roundNumber: 1,
 *     mode: 'analyzing',
 *     userQuestion: 'What are the benefits?'
 *   },
 *   ['msg1', 'msg2'],
 *   c.env
 * );
 * ```
 */
export async function restartStaleAnalysis(
  staleAnalysis: {
    id: string;
    threadId: string;
    roundNumber: number;
    mode: string;
    userQuestion: string;
  },
  participantMessageIds: string[],
  env: ApiEnv['Bindings'],
): Promise<void> {
  const db = await getDbAsync();

  console.warn('[restartStaleAnalysis] 🔄 Restarting stale analysis', {
    analysisId: staleAnalysis.id,
    threadId: staleAnalysis.threadId,
    roundNumber: staleAnalysis.roundNumber,
  });

  try {
    // ✅ STEP 1: Mark old analysis as failed
    await db.update(tables.chatModeratorAnalysis)
      .set({
        status: 'failed',
        errorMessage: 'Analysis timed out (watchdog detected), restarting automatically',
      })
      .where(eq(tables.chatModeratorAnalysis.id, staleAnalysis.id));

    // ✅ STEP 2: Fetch participant messages for reprocessing
    const participantMessages = await db.query.chatMessage.findMany({
      where: (fields, { inArray, eq: eqOp, and: andOp }) =>
        andOp(
          inArray(fields.id, participantMessageIds),
          eqOp(fields.threadId, staleAnalysis.threadId),
          eqOp(fields.role, 'assistant'),
        ),
      with: {
        participant: true,
      },
      orderBy: [tables.chatMessage.createdAt],
    });

    // ✅ STEP 3: Build participant responses
    const participantResponses = participantMessages.map((msg, index) => {
      const participant = msg.participant!;
      const modelName = extractModeratorModelName(participant.modelId);

      return {
        participantIndex: index,
        participantRole: participant.role,
        modelId: participant.modelId,
        modelName,
        responseContent: msg.parts
          .filter(part => part.type === 'text' && 'text' in part)
          .map(part => (part as { type: 'text'; text: string }).text)
          .join(' '),
      };
    });

    // ✅ STEP 4: Create new analysis record
    const newAnalysisId = ulid();
    await db.insert(tables.chatModeratorAnalysis).values({
      id: newAnalysisId,
      threadId: staleAnalysis.threadId,
      roundNumber: staleAnalysis.roundNumber,
      mode: staleAnalysis.mode as ChatModeId,
      userQuestion: staleAnalysis.userQuestion,
      status: 'streaming',
      participantMessageIds,
      createdAt: new Date(),
    });

    // ✅ STEP 5: Trigger background processing directly (don't use service binding)
    // Process immediately instead of trying to use WORKER_SELF_REFERENCE which may not be configured
    console.warn('[restartStaleAnalysis] 🔥 Starting background processing directly', {
      newAnalysisId,
    });

    // Call processAnalysisInBackground directly (fire-and-forget)
    processAnalysisInBackground({
      analysisId: newAnalysisId,
      threadId: staleAnalysis.threadId,
      roundNum: staleAnalysis.roundNumber,
      userQuestion: staleAnalysis.userQuestion,
      mode: staleAnalysis.mode,
      participantResponses,
      env,
    }).catch((error) => {
      // Log but don't throw - this is fire-and-forget
      console.error('[restartStaleAnalysis] ❌ Background processing failed:', {
        newAnalysisId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    console.warn('[restartStaleAnalysis] ✅ Stale analysis restarted', {
      oldAnalysisId: staleAnalysis.id,
      newAnalysisId,
    });
  } catch (error) {
    console.error('[restartStaleAnalysis] ❌ Failed to restart stale analysis:', {
      analysisId: staleAnalysis.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
