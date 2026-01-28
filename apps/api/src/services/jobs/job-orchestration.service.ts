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

import { AutomatedJobStatuses, MessagePartTypes, MessageRoles, RoundOrchestrationMessageTypes } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { DbAutomatedJobMetadata, getDbAsync } from '@/db';
import * as tables from '@/db';
import { buildSessionAuthHeaders, getBaseUrl } from '@/lib/utils/internal-api';
import type { ApiEnv } from '@/types';
import type {
  CompleteAutomatedJobQueueMessage,
  ContinueAutomatedJobQueueMessage,
} from '@/types/queues';

import { analyzePromptForJob, analyzeRoundPrompt } from './prompt-analysis.service';
import { generateNextRoundPrompt } from './prompt-generation.service';

/**
 * Thread creation API response type
 */
type ThreadCreationResponse = {
  success: boolean;
  data?: {
    thread?: {
      id?: string;
    };
  };
};

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
  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.id, jobId),
  });

  if (!job) {
    return;
  }

  if (job.status !== AutomatedJobStatuses.PENDING) {
    return;
  }

  try {
    await db
      .update(tables.automatedJob)
      .set({
        metadata: {
          ...job.metadata,
          startedAt: new Date().toISOString(),
        },
        status: AutomatedJobStatuses.RUNNING,
      })
      .where(eq(tables.automatedJob.id, jobId));

    const analysis = await analyzePromptForJob(job.initialPrompt, env);

    const baseUrl = getBaseUrl(env);
    const response = await fetch(`${baseUrl}/api/v1/chat/threads`, {
      body: JSON.stringify({
        enableWebSearch: analysis.enableWebSearch,
        firstMessage: job.initialPrompt,
        mode: analysis.mode,
        participants: analysis.participants,
      }),
      headers: buildSessionAuthHeaders(sessionToken, env),
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Thread creation failed: ${response.status} - ${errorText}`);
    }

    const result: ThreadCreationResponse = await response.json();

    if (!result.success || !result.data?.thread?.id) {
      throw new Error('Invalid thread creation response');
    }

    const threadId = result.data.thread.id;

    const updatedMetadata: DbAutomatedJobMetadata = {
      ...job.metadata,
      promptReasoning: analysis.reasoning,
      roundConfigs: [{
        enableWebSearch: analysis.enableWebSearch,
        mode: analysis.mode,
        round: 0,
      }],
      roundPrompts: [job.initialPrompt],
      startedAt: new Date().toISOString(),
    };

    await db
      .update(tables.automatedJob)
      .set({
        currentRound: 0,
        metadata: updatedMetadata,
        selectedModels: analysis.modelIds,
        threadId,
      })
      .where(eq(tables.automatedJob.id, jobId));

    await queue.send({
      messageId: `trigger-${threadId}-r0-p0`,
      participantIndex: 0,
      queuedAt: new Date().toISOString(),
      roundNumber: 0,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
      userId: job.userId,
    });
  } catch (error) {
    await db
      .update(tables.automatedJob)
      .set({
        metadata: {
          ...job.metadata,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
        status: AutomatedJobStatuses.FAILED,
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
  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.id, jobId),
  });

  if (job?.status !== AutomatedJobStatuses.RUNNING) {
    return;
  }

  const nextRound = currentRound + 1;

  if (nextRound >= job.totalRounds) {
    await queue.send({
      autoPublish: job.autoPublish,
      jobId,
      messageId: `complete-${jobId}`,
      queuedAt: new Date().toISOString(),
      threadId,
      type: RoundOrchestrationMessageTypes.COMPLETE_AUTOMATED_JOB,
    } satisfies CompleteAutomatedJobQueueMessage);
    return;
  }

  try {
    const nextPrompt = await generateNextRoundPrompt(
      threadId,
      currentRound,
      job.initialPrompt,
      db,
      env,
    );

    const roundConfig = await analyzeRoundPrompt(nextPrompt, env);

    await db
      .update(tables.chatThread)
      .set({
        enableWebSearch: roundConfig.enableWebSearch,
        mode: roundConfig.mode,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatThread.id, threadId));

    const now = new Date();
    const messageId = ulid();

    await db.insert(tables.chatMessage).values({
      createdAt: now,
      id: messageId,
      metadata: {
        role: MessageRoles.USER,
        roundNumber: nextRound,
      },
      parts: [{ text: nextPrompt, type: MessagePartTypes.TEXT }],
      role: MessageRoles.USER,
      roundNumber: nextRound,
      threadId,
    });

    await db
      .update(tables.chatThread)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(tables.chatThread.id, threadId));

    const roundPrompts = [...(job.metadata?.roundPrompts || []), nextPrompt];
    const roundConfigs = [...(job.metadata?.roundConfigs || []), {
      enableWebSearch: roundConfig.enableWebSearch,
      mode: roundConfig.mode,
      round: nextRound,
    }];

    await db
      .update(tables.automatedJob)
      .set({
        currentRound: nextRound,
        metadata: {
          ...job.metadata,
          roundConfigs,
          roundPrompts,
        },
      })
      .where(eq(tables.automatedJob.id, jobId));

    await queue.send({
      messageId: `trigger-${threadId}-r${nextRound}-p0`,
      participantIndex: 0,
      queuedAt: new Date().toISOString(),
      roundNumber: nextRound,
      sessionToken,
      threadId,
      type: RoundOrchestrationMessageTypes.TRIGGER_PARTICIPANT,
      userId: job.userId,
    });
  } catch (error) {
    await db
      .update(tables.automatedJob)
      .set({
        metadata: {
          ...job.metadata,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
        status: AutomatedJobStatuses.FAILED,
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
  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.id, jobId),
  });

  if (!job) {
    return;
  }

  try {
    await db
      .update(tables.automatedJob)
      .set({
        metadata: {
          ...job.metadata,
          completedAt: new Date().toISOString(),
        },
        status: AutomatedJobStatuses.COMPLETED,
      })
      .where(eq(tables.automatedJob.id, jobId));

    if (autoPublish) {
      await db
        .update(tables.chatThread)
        .set({ isPublic: true, updatedAt: new Date() })
        .where(eq(tables.chatThread.id, threadId));
    }
  } catch {
    // Error during completion - job state already reflects failure in metadata
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
  const job = await db.query.automatedJob.findFirst({
    where: eq(tables.automatedJob.threadId, threadId),
  });

  if (job?.status !== AutomatedJobStatuses.RUNNING) {
    return false;
  }

  await queue.send({
    currentRound: roundNumber,
    jobId: job.id,
    messageId: `continue-${job.id}-r${roundNumber}`,
    queuedAt: new Date().toISOString(),
    sessionToken,
    threadId,
    type: RoundOrchestrationMessageTypes.CONTINUE_AUTOMATED_JOB,
    userId: job.userId,
  } satisfies ContinueAutomatedJobQueueMessage);

  return true;
}
