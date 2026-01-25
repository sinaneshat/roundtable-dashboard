/**
 * Job Orchestration Service
 *
 * Coordinates automated multi-round AI conversations.
 * Handles job lifecycle: start → continue → complete
 *
 * ARCHITECTURE: Uses internal API calls for thread creation to ensure:
 * - Credit enforcement
 * - Free user limits
 * - Cache invalidation
 * - Event tracking
 * - Project auto-linking
 */

import { MessagePartTypes, MessageRoles, RoundOrchestrationMessageTypes } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbAutomatedJobMetadata } from '@/db/tables/job';
import { buildSessionAuthHeaders, getBaseUrl } from '@/lib/utils/internal-api';
import type { ApiEnv } from '@/types';
import type { TypedLogger } from '@/types/logger';
import { LogHelpers } from '@/types/logger';
import type {
  CompleteAutomatedJobQueueMessage,
  ContinueAutomatedJobQueueMessage,
} from '@/types/queues';

import { analyzePromptForJob, analyzeRoundPrompt } from './prompt-analysis.service';
import { generateNextRoundPrompt } from './prompt-generation.service';

// Module-level logger for job orchestration (set by caller)
let logger: TypedLogger | undefined;

/**
 * Set the logger for job orchestration service
 */
export function setJobOrchestrationLogger(l: TypedLogger | undefined): void {
  logger = l;
}

/**
 * Start an automated job
 *
 * 1. Load job from database
 * 2. Select models using AI
 * 3. Call POST /api/v1/chat/threads (creates thread, participants, first message)
 * 4. Update job with threadId and selectedModels
 * 5. Queue first round execution
 *
 * ARCHITECTURE: Calls internal API for thread creation to ensure:
 * - Credit enforcement
 * - Free user limits
 * - Cache invalidation
 * - Event tracking
 */
export async function startAutomatedJob(
  jobId: string,
  sessionToken: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
  queue: Queue,
): Promise<void> {
  logger?.info(`Starting job ${jobId}`, LogHelpers.operation({ operationName: 'startAutomatedJob' }));

  // Load job
  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.id, jobId),
  });

  if (!job) {
    logger?.error(`Job not found: ${jobId}`, LogHelpers.operation({ operationName: 'startAutomatedJob' }));
    return;
  }

  if (job.status !== 'pending') {
    logger?.warn(`Job ${jobId} is not pending, status: ${job.status}`, LogHelpers.operation({ operationName: 'startAutomatedJob', status: job.status }));
    return;
  }

  try {
    // Update job to running
    await db
      .update(tables.automatedJob)
      .set({
        status: 'running',
        metadata: {
          ...job.metadata,
          startedAt: new Date().toISOString(),
        },
      })
      .where(eq(tables.automatedJob.id, jobId));

    // Analyze prompt to determine optimal configuration (models, mode, web search)
    const analysis = await analyzePromptForJob(job.initialPrompt, env);

    logger?.info(`Prompt analysis for job ${jobId}`, LogHelpers.operation({ operationName: 'startAutomatedJob' }));

    // Call thread creation API to leverage existing credit/tier enforcement
    const baseUrl = getBaseUrl(env);
    const response = await fetch(`${baseUrl}/api/v1/chat/threads`, {
      method: 'POST',
      headers: buildSessionAuthHeaders(sessionToken),
      body: JSON.stringify({
        firstMessage: job.initialPrompt,
        participants: analysis.participants,
        mode: analysis.mode,
        enableWebSearch: analysis.enableWebSearch,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Thread creation failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      data?: { thread?: { id?: string } };
    };

    // Extract threadId from API response
    // API returns { success: true, data: { thread: { id, ... }, participants, messages } }
    if (!result.success || !result.data?.thread?.id) {
      throw new Error('Invalid thread creation response');
    }

    const threadId = result.data.thread.id;

    // Update job with thread info and analysis results
    const updatedMetadata: DbAutomatedJobMetadata = {
      ...job.metadata,
      promptReasoning: analysis.reasoning,
      roundPrompts: [job.initialPrompt],
      roundConfigs: [{
        round: 0,
        mode: analysis.mode,
        enableWebSearch: analysis.enableWebSearch,
      }],
      startedAt: new Date().toISOString(),
    };

    await db
      .update(tables.automatedJob)
      .set({
        threadId,
        selectedModels: analysis.modelIds,
        currentRound: 0,
        metadata: updatedMetadata,
      })
      .where(eq(tables.automatedJob.id, jobId));

    // Queue first participant trigger
    // The existing round orchestration flow will handle executing the round
    await queue.send({
      type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
      messageId: `trigger-${threadId}-r0-p0`,
      threadId,
      roundNumber: 0,
      participantIndex: 0,
      userId: job.userId,
      sessionToken,
      queuedAt: new Date().toISOString(),
    });

    logger?.info(`Job ${jobId} started with thread ${threadId}`, LogHelpers.operation({ operationName: 'startAutomatedJob', threadId }));
  } catch (error) {
    logger?.error(`Failed to start job ${jobId}`, LogHelpers.operation({ operationName: 'startAutomatedJob', error: error instanceof Error ? error.message : 'Unknown error' }));
    await db
      .update(tables.automatedJob)
      .set({
        status: 'failed',
        metadata: {
          ...job.metadata,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .where(eq(tables.automatedJob.id, jobId));
  }
}

/**
 * Continue an automated job to the next round
 *
 * 1. Generate next prompt using AI
 * 2. Create user message with new prompt
 * 3. Update job currentRound
 * 4. Queue next round execution
 */
export async function continueAutomatedJob(
  jobId: string,
  threadId: string,
  currentRound: number,
  sessionToken: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
  queue: Queue,
): Promise<void> {
  logger?.info(`Continuing job ${jobId}, round ${currentRound + 1}`, LogHelpers.operation({ operationName: 'continueAutomatedJob', roundNumber: currentRound + 1 }));

  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.id, jobId),
  });

  if (!job || job.status !== 'running') {
    logger?.warn(`Job ${jobId} not running, skipping continue`, LogHelpers.operation({ operationName: 'continueAutomatedJob' }));
    return;
  }

  const nextRound = currentRound + 1;

  // Check if we've completed all rounds
  if (nextRound >= job.totalRounds) {
    logger?.info(`Job ${jobId} completed all ${job.totalRounds} rounds`, LogHelpers.operation({ operationName: 'continueAutomatedJob' }));
    await queue.send({
      type: RoundOrchestrationMessageTypes.COMPLETE_AUTOMATED_JOB,
      messageId: `complete-${jobId}`,
      jobId,
      threadId,
      autoPublish: job.autoPublish,
      queuedAt: new Date().toISOString(),
    } satisfies CompleteAutomatedJobQueueMessage);
    return;
  }

  try {
    // Generate next prompt
    const nextPrompt = await generateNextRoundPrompt(
      threadId,
      currentRound,
      job.initialPrompt,
      db,
      env,
    );

    // Analyze the generated prompt to determine round-specific config
    const roundConfig = await analyzeRoundPrompt(nextPrompt, env);

    logger?.info(`Round ${nextRound} analysis`, LogHelpers.operation({ operationName: 'continueAutomatedJob', roundNumber: nextRound }));

    // Update thread settings for this round (web search and mode)
    await db
      .update(tables.chatThread)
      .set({
        mode: roundConfig.mode,
        enableWebSearch: roundConfig.enableWebSearch,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, threadId));

    // Create user message for next round
    const now = new Date();
    const messageId = ulid();

    await db.insert(tables.chatMessage).values({
      id: messageId,
      threadId,
      role: MessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: nextPrompt }],
      roundNumber: nextRound,
      metadata: {
        role: MessageRoles.USER,
        roundNumber: nextRound,
      },
      createdAt: now,
    });

    // Update thread last message time
    await db
      .update(tables.chatThread)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(tables.chatThread.id, threadId));

    // Update job with new round info and round-specific config
    const roundPrompts = [...(job.metadata?.roundPrompts || []), nextPrompt];
    const roundConfigs = [...(job.metadata?.roundConfigs || []), {
      round: nextRound,
      mode: roundConfig.mode,
      enableWebSearch: roundConfig.enableWebSearch,
    }];

    await db
      .update(tables.automatedJob)
      .set({
        currentRound: nextRound,
        metadata: {
          ...job.metadata,
          roundPrompts,
          roundConfigs,
        },
      })
      .where(eq(tables.automatedJob.id, jobId));

    // Queue participant trigger for next round
    await queue.send({
      type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
      messageId: `trigger-${threadId}-r${nextRound}-p0`,
      threadId,
      roundNumber: nextRound,
      participantIndex: 0,
      userId: job.userId,
      sessionToken,
      queuedAt: new Date().toISOString(),
    });

    logger?.info(`Job ${jobId} continuing to round ${nextRound}`, LogHelpers.operation({ operationName: 'continueAutomatedJob', threadId, roundNumber: nextRound }));
  } catch (error) {
    logger?.error(`Failed to continue job ${jobId}`, LogHelpers.operation({ operationName: 'continueAutomatedJob', threadId, error: error instanceof Error ? error.message : 'Unknown error' }));
    await db
      .update(tables.automatedJob)
      .set({
        status: 'failed',
        metadata: {
          ...job.metadata,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .where(eq(tables.automatedJob.id, jobId));
  }
}

/**
 * Complete an automated job
 *
 * 1. Mark job as completed
 * 2. Optionally publish thread if autoPublish is true
 */
export async function completeAutomatedJob(
  jobId: string,
  threadId: string,
  autoPublish: boolean,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  logger?.info(`Completing job ${jobId}`, LogHelpers.operation({ operationName: 'completeAutomatedJob' }));

  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.id, jobId),
  });

  if (!job) {
    logger?.warn(`Job ${jobId} not found`, LogHelpers.operation({ operationName: 'completeAutomatedJob' }));
    return;
  }

  try {
    // Mark job as completed
    await db
      .update(tables.automatedJob)
      .set({
        status: 'completed',
        metadata: {
          ...job.metadata,
          completedAt: new Date().toISOString(),
        },
      })
      .where(eq(tables.automatedJob.id, jobId));

    // Optionally publish thread
    if (autoPublish) {
      await db
        .update(tables.chatThread)
        .set({ isPublic: true, updatedAt: new Date() })
        .where(eq(tables.chatThread.id, threadId));
      logger?.info(`Thread ${threadId} published`, LogHelpers.operation({ operationName: 'completeAutomatedJob', threadId }));
    }

    logger?.info(`Job ${jobId} completed successfully`, LogHelpers.operation({ operationName: 'completeAutomatedJob' }));
  } catch (error) {
    logger?.error(`Failed to complete job ${jobId}`, LogHelpers.operation({ operationName: 'completeAutomatedJob', error: error instanceof Error ? error.message : 'Unknown error' }));
  }
}

/**
 * Check if a thread belongs to an automated job and if it needs continuation
 *
 * Called by round orchestration when moderator completes for a thread.
 */
export async function checkJobContinuation(
  threadId: string,
  roundNumber: number,
  sessionToken: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  queue: Queue,
): Promise<boolean> {
  // Find job by threadId
  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.threadId, threadId),
  });

  if (!job || job.status !== 'running') {
    return false; // Not a job-owned thread or job not running
  }

  // Job found, queue continuation
  await queue.send({
    type: RoundOrchestrationMessageTypes.CONTINUE_AUTOMATED_JOB,
    messageId: `continue-${job.id}-r${roundNumber}`,
    jobId: job.id,
    threadId,
    currentRound: roundNumber,
    userId: job.userId,
    sessionToken,
    queuedAt: new Date().toISOString(),
  } satisfies ContinueAutomatedJobQueueMessage);

  return true;
}
