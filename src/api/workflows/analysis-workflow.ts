/**
 * Analysis Workflow - Durable Background Processing
 *
 * ✅ CLOUDFLARE WORKFLOWS: Durable execution that survives worker evictions
 * ✅ SERVICE LAYER PATTERN: Follows established service architecture
 * ✅ AUTOMATIC COMPLETION: Runs to completion even if user navigates away
 * ✅ STATE PERSISTENCE: Accumulates streaming results across hibernation
 *
 * This workflow handles moderator analysis generation in the background.
 * Once triggered, it runs to completion regardless of user navigation.
 *
 * Key Features:
 * - Survives worker evictions and restarts
 * - Automatic retries with exponential backoff
 * - State persistence across steps
 * - No HTTP timeout limitations
 *
 * Reference: backend-patterns.md - Service Layer Patterns
 */

import { streamObject } from 'ai';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { AnalysisStatuses, ChatModeSchema } from '@/api/core/enums';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import {
  buildModeratorSystemPrompt,
  buildModeratorUserPrompt,
} from '@/api/services/moderator-analysis.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { AI_TIMEOUT_CONFIG } from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

// ============================================================================
// WORKFLOW PARAMS SCHEMA
// ============================================================================

/**
 * Analysis workflow parameters
 * Single source of truth for workflow invocation
 */
export const AnalysisWorkflowParamsSchema = z.object({
  analysisId: z.string().min(1),
  threadId: z.string().min(1),
  roundNum: z.number().int().positive(),
  userQuestion: z.string().min(1),
  mode: ChatModeSchema,
  participantResponses: z.array(
    z.object({
      participantIndex: z.number().int().nonnegative(),
      participantRole: z.string().nullable(),
      modelId: z.string().min(1),
      modelName: z.string().min(1),
      responseContent: z.string().min(1),
    }),
  ).min(1),
});

export type AnalysisWorkflowParams = z.infer<typeof AnalysisWorkflowParamsSchema>;

// ============================================================================
// WORKFLOW IMPLEMENTATION
// ============================================================================

/**
 * AnalysisWorkflow - Durable execution for moderator analysis
 *
 * This workflow:
 * 1. Updates analysis status to "streaming"
 * 2. Streams AI analysis with automatic accumulation
 * 3. Saves completed analysis to database
 * 4. Handles errors with automatic retries
 *
 * All state is persisted between steps, surviving worker evictions.
 */
export class AnalysisWorkflow extends WorkflowEntrypoint<ApiEnv['Bindings'], AnalysisWorkflowParams> {
  async run(event: WorkflowEvent<AnalysisWorkflowParams>, step: WorkflowStep) {
    const { analysisId, threadId, roundNum, userQuestion, mode, participantResponses } = event.payload;

    console.warn('[AnalysisWorkflow] 🚀 Starting workflow', {
      analysisId,
      threadId,
      roundNum,
      participantCount: participantResponses.length,
    });

    // ✅ STEP 1: Mark analysis as streaming
    // This step is cached - won't re-run if workflow restarts
    await step.do('mark-streaming', async () => {
      const db = await getDbAsync();
      await db
        .update(tables.chatModeratorAnalysis)
        .set({ status: AnalysisStatuses.STREAMING })
        .where(eq(tables.chatModeratorAnalysis.id, analysisId));

      console.warn('[AnalysisWorkflow] ✅ Status updated to streaming', { analysisId });
    });

    // ✅ STEP 2: Generate and accumulate analysis
    // Retries automatically on failure with exponential backoff
    // State is persisted - if workflow hibernates, this step won't re-run
    const analysisResult = await step.do(
      'generate-analysis',
      {
        retries: {
          limit: 3,
          delay: '10 seconds',
          backoff: 'exponential',
        },
        timeout: '5 minutes',
      },
      async () => {
        console.warn('[AnalysisWorkflow] 🤖 Starting AI streaming', { analysisId });

        // Initialize OpenRouter client
        initializeOpenRouter(this.env);
        const client = openRouterService.getClient();

        // Build prompts
        const moderatorConfig = {
          mode,
          roundNumber: roundNum,
          userQuestion,
          participantResponses,
        };

        const systemPrompt = buildModeratorSystemPrompt(moderatorConfig);
        const userPrompt = buildModeratorUserPrompt(moderatorConfig);

        // Stream analysis with AI SDK
        const result = streamObject({
          model: client.chat('anthropic/claude-3.5-sonnet'),
          schema: ModeratorAnalysisPayloadSchema,
          schemaName: 'ModeratorAnalysis',
          system: systemPrompt,
          prompt: userPrompt,
          mode: 'json',
          experimental_telemetry: {
            isEnabled: true,
            functionId: `moderator-analysis-workflow-round-${roundNum}`,
          },
          abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.moderatorAnalysisMs),
        });

        // Consume stream and accumulate final object
        // Using unknown type because AI SDK streaming returns DeepPartial with nested optionals
        // We validate with Zod schema below to ensure type safety
        let finalObject: unknown = null;
        let streamError: Error | null = null;

        try {
          for await (const part of result.fullStream) {
            // Accumulate final object
            if (part.type === 'object') {
              finalObject = part.object;
            }
            if (part.type === 'error') {
              streamError = part.error instanceof Error ? part.error : new Error(String(part.error));
              break;
            }
          }
        } catch (error) {
          streamError = error instanceof Error ? error : new Error(String(error));
        }

        // Validate result
        if (streamError) {
          console.error('[AnalysisWorkflow] ❌ Stream error', {
            analysisId,
            error: streamError.message,
          });
          throw streamError;
        }

        if (!finalObject) {
          const noObjectError = new Error('Analysis completed but no object was generated');
          console.error('[AnalysisWorkflow] ❌ No object generated', { analysisId });
          throw noObjectError;
        }

        // Validate structure with Zod schema
        const validationResult = ModeratorAnalysisPayloadSchema.safeParse(finalObject);

        if (!validationResult.success) {
          const invalidStructureError = new Error(
            `Analysis generated but structure is invalid: ${validationResult.error.message}`,
          );
          console.error('[AnalysisWorkflow] ❌ Invalid structure', {
            analysisId,
            errorMessage: validationResult.error.message,
          });
          throw invalidStructureError;
        }

        const validatedAnalysis = validationResult.data;

        console.warn('[AnalysisWorkflow] ✅ Analysis generated successfully', {
          analysisId,
          participantCount: validatedAnalysis.participantAnalyses.length,
        });

        // Return accumulated state (persisted by Workflows)
        return validatedAnalysis;
      },
    );

    // ✅ STEP 3: Save completed analysis
    // Only runs if step 2 succeeds
    await step.do('save-completed', async () => {
      const db = await getDbAsync();
      await db
        .update(tables.chatModeratorAnalysis)
        .set({
          status: AnalysisStatuses.COMPLETED,
          analysisData: {
            leaderboard: analysisResult.leaderboard,
            participantAnalyses: analysisResult.participantAnalyses,
            overallSummary: analysisResult.overallSummary,
            conclusion: analysisResult.conclusion,
          },
          completedAt: new Date(),
        })
        .where(eq(tables.chatModeratorAnalysis.id, analysisId));

      console.warn('[AnalysisWorkflow] 🎉 Analysis completed and saved', { analysisId });
    });

    // Return final status
    return {
      status: 'completed',
      analysisId,
      threadId,
      roundNum,
    };
  }

  /**
   * ✅ ERROR HANDLER: Called when workflow fails
   * Marks analysis as failed in database
   */
  async onError(event: WorkflowEvent<AnalysisWorkflowParams>, error: Error) {
    const { analysisId } = event.payload;

    console.error('[AnalysisWorkflow] ❌ Workflow failed', {
      analysisId,
      error: error.message,
    });

    try {
      const db = await getDbAsync();
      await db
        .update(tables.chatModeratorAnalysis)
        .set({
          status: AnalysisStatuses.FAILED,
          errorMessage: error.message,
        })
        .where(eq(tables.chatModeratorAnalysis.id, analysisId));

      console.warn('[AnalysisWorkflow] ✅ Analysis marked as failed', { analysisId });
    } catch (updateError) {
      console.error('[AnalysisWorkflow] ❌ Failed to mark analysis as failed:', updateError);
    }
  }
}
