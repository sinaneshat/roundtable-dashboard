import type { RouteHandler } from '@hono/zod-openapi';
import { AutomatedJobStatuses, RoundOrchestrationMessageTypes, ThreadStatuses } from '@roundtable/shared/enums';
import { and, desc, eq, lt } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/common/error-handling';
import { createHandler, IdParamSchema, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db/tables';
import { extractSessionToken, requireAdmin } from '@/lib/auth';
import type { ApiEnv } from '@/types';
import type { StartAutomatedJobQueueMessage } from '@/types/queues';

import type {
  createJobRoute,
  deleteJobRoute,
  getJobRoute,
  listJobsRoute,
  updateJobRoute,
} from './route';
import {
  CreateJobRequestSchema,
  DeleteJobQuerySchema,
  JobListQuerySchema,
  UpdateJobRequestSchema,
} from './schema';

/**
 * Helper: Transform DB job to response format
 */
function transformJob(
  job: typeof tables.automatedJob.$inferSelect,
  threadSlug?: string | null,
  isPublic?: boolean,
) {
  return {
    autoPublish: job.autoPublish,
    createdAt: job.createdAt.toISOString(),
    currentRound: job.currentRound,
    id: job.id,
    initialPrompt: job.initialPrompt,
    isPublic: isPublic ?? false,
    metadata: job.metadata ?? null,
    selectedModels: job.selectedModels ?? null,
    status: job.status,
    threadId: job.threadId,
    threadSlug: threadSlug ?? null,
    totalRounds: job.totalRounds,
    updatedAt: job.updatedAt.toISOString(),
    userId: job.userId,
  };
}

/**
 * List automated jobs (admin only)
 */
export const listJobsHandler: RouteHandler<typeof listJobsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listJobs',
    validateQuery: JobListQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { cursor, limit = 20, status } = c.validated.query;
    const db = await getDbAsync();

    // Build where conditions
    const conditions = [];
    if (status) {
      conditions.push(eq(tables.automatedJob.status, status));
    }
    if (cursor) {
      // Cursor is the createdAt timestamp
      conditions.push(lt(tables.automatedJob.createdAt, new Date(cursor)));
    }

    const jobs = await db
      .select()
      .from(tables.automatedJob)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tables.automatedJob.createdAt))
      .limit(limit + 1); // Fetch one extra to check hasMore

    const hasMore = jobs.length > limit;
    const results = hasMore ? jobs.slice(0, limit) : jobs;

    // Get thread slugs and isPublic for jobs with threads
    const threadIds = results
      .map(j => j.threadId)
      .filter((id): id is string => id !== null);

    const threadMap = new Map<string, { slug: string; isPublic: boolean }>();
    if (threadIds.length > 0) {
      const threads = await db.query.chatThread.findMany({
        columns: { id: true, isPublic: true, slug: true },
        where: (t, { inArray }) => inArray(t.id, threadIds),
      });
      for (const t of threads) {
        threadMap.set(t.id, { isPublic: t.isPublic, slug: t.slug });
      }
    }

    const transformedJobs = results.map((job) => {
      const thread = job.threadId ? threadMap.get(job.threadId) : null;
      return transformJob(job, thread?.slug ?? null, thread?.isPublic ?? false);
    });

    const lastResult = results.at(-1);
    const nextCursor = hasMore && lastResult
      ? lastResult.createdAt.toISOString()
      : null;

    return Responses.ok(c, {
      hasMore,
      jobs: transformedJobs,
      nextCursor,
      total: results.length,
    });
  },
);

/**
 * Create automated job (admin only)
 */
export const createJobHandler: RouteHandler<typeof createJobRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'createJob',
    validateBody: CreateJobRequestSchema,
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    // Extract session token from cookie (same as streaming handler)
    const sessionToken = extractSessionToken(c.req.header('cookie'));

    const body = c.validated.body;
    const db = await getDbAsync();

    // Create job record
    const jobId = ulid();
    const now = new Date();

    const [job] = await db
      .insert(tables.automatedJob)
      .values({
        autoPublish: body.autoPublish,
        createdAt: now,
        currentRound: 0,
        id: jobId,
        initialPrompt: body.initialPrompt,
        status: AutomatedJobStatuses.PENDING,
        totalRounds: body.totalRounds,
        updatedAt: now,
        userId: user.id,
      })
      .returning();

    if (!job) {
      throw createError.internal('Failed to create job', {
        errorType: 'database',
        operation: 'insert',
        table: 'automatedJob',
      });
    }

    // Queue the job for background processing
    let queued = false;
    try {
      const message: StartAutomatedJobQueueMessage = {
        jobId,
        messageId: `start-${jobId}`,
        queuedAt: new Date().toISOString(),
        sessionToken,
        type: RoundOrchestrationMessageTypes.START_AUTOMATED_JOB,
        userId: user.id,
      };

      await c.env.ROUND_ORCHESTRATION_QUEUE.send(message);
      queued = true;
    } catch (err) {
      console.error('[createJob] Failed to queue job:', err);
      // Mark job as failed if we can't queue it
      await db
        .update(tables.automatedJob)
        .set({
          metadata: { errorMessage: 'Failed to queue job for processing' },
          status: 'failed',
        })
        .where(eq(tables.automatedJob.id, jobId));
    }

    return Responses.created(c, {
      job: transformJob(job),
      queued,
    });
  },
);

/**
 * Get job by ID (admin only)
 */
export const getJobHandler: RouteHandler<typeof getJobRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getJob',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { id } = c.validated.params;
    const db = await getDbAsync();

    const job = await db.query.automatedJob.findFirst({
      where: eq(tables.automatedJob.id, id),
    });

    if (!job) {
      throw createError.notFound('Job not found', {
        errorType: 'resource',
        resource: 'automatedJob',
        resourceId: id,
      });
    }

    // Get thread slug and isPublic if exists
    let threadSlug: string | null = null;
    let isPublic = false;
    if (job.threadId) {
      const thread = await db.query.chatThread.findFirst({
        columns: { isPublic: true, slug: true },
        where: eq(tables.chatThread.id, job.threadId),
      });
      threadSlug = thread?.slug ?? null;
      isPublic = thread?.isPublic ?? false;
    }

    return Responses.ok(c, transformJob(job, threadSlug, isPublic));
  },
);

/**
 * Update job (admin only) - retry failed jobs or toggle visibility
 */
export const updateJobHandler: RouteHandler<typeof updateJobRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'updateJob',
    validateBody: UpdateJobRequestSchema,
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    const job = await db.query.automatedJob.findFirst({
      where: eq(tables.automatedJob.id, id),
    });

    if (!job) {
      throw createError.notFound('Job not found', {
        errorType: 'resource',
        resource: 'automatedJob',
        resourceId: id,
      });
    }

    // Handle retry - queue the job for processing
    if (body.status === AutomatedJobStatuses.RUNNING) {
      if (job.status !== AutomatedJobStatuses.FAILED) {
        throw createError.badRequest('Can only retry failed jobs', {
          errorType: 'validation',
        });
      }

      // Extract session token from cookie (same as streaming handler)
      const sessionToken = extractSessionToken(c.req.header('cookie'));

      // Reset job state
      await db
        .update(tables.automatedJob)
        .set({
          currentRound: 0,
          metadata: null,
          status: AutomatedJobStatuses.PENDING,
          updatedAt: new Date(),
        })
        .where(eq(tables.automatedJob.id, id));

      // Queue the job
      const message: StartAutomatedJobQueueMessage = {
        jobId: id,
        messageId: `start-${id}-${Date.now()}`,
        queuedAt: new Date().toISOString(),
        sessionToken,
        type: RoundOrchestrationMessageTypes.START_AUTOMATED_JOB,
        userId: user.id,
      };

      try {
        await c.env.ROUND_ORCHESTRATION_QUEUE.send(message);
      } catch (err) {
        console.error('[updateJob] Failed to queue job:', err);
        await db
          .update(tables.automatedJob)
          .set({
            metadata: { errorMessage: 'Failed to queue job for processing' },
            status: AutomatedJobStatuses.FAILED,
          })
          .where(eq(tables.automatedJob.id, id));
        throw createError.internal('Failed to queue job', {
          errorType: 'queue',
          operation: 'send',
          queueName: 'ROUND_ORCHESTRATION_QUEUE',
        });
      }
    }

    // Handle isPublic toggle
    if (body.isPublic !== undefined && job.threadId) {
      await db
        .update(tables.chatThread)
        .set({
          isPublic: body.isPublic,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatThread.id, job.threadId));
    }

    // Reload job
    const updatedJob = await db.query.automatedJob.findFirst({
      where: eq(tables.automatedJob.id, id),
    });

    if (!updatedJob) {
      throw createError.internal('Failed to reload job', {
        errorType: 'database',
        operation: 'select',
        table: 'automatedJob',
      });
    }

    // Get thread slug and isPublic
    let threadSlug: string | null = null;
    let isPublic = false;
    if (updatedJob.threadId) {
      const thread = await db.query.chatThread.findFirst({
        columns: { isPublic: true, slug: true },
        where: eq(tables.chatThread.id, updatedJob.threadId),
      });
      threadSlug = thread?.slug ?? null;
      isPublic = thread?.isPublic ?? false;
    }

    return Responses.ok(c, transformJob(updatedJob, threadSlug, isPublic));
  },
);

/**
 * Delete job (admin only)
 *
 * Optionally deletes the associated thread if deleteThread=true
 */
export const deleteJobHandler: RouteHandler<typeof deleteJobRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'deleteJob',
    validateParams: IdParamSchema,
    validateQuery: DeleteJobQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { id } = c.validated.params;
    const deleteThread = c.validated.query.deleteThread === 'true';
    const db = await getDbAsync();

    const job = await db.query.automatedJob.findFirst({
      where: eq(tables.automatedJob.id, id),
    });

    if (!job) {
      throw createError.notFound('Job not found', {
        errorType: 'resource',
        resource: 'automatedJob',
        resourceId: id,
      });
    }

    // Optionally delete thread (soft delete via status)
    if (deleteThread && job.threadId) {
      await db
        .update(tables.chatThread)
        .set({
          status: ThreadStatuses.DELETED,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatThread.id, job.threadId));
    }

    // Delete job
    await db.delete(tables.automatedJob).where(eq(tables.automatedJob.id, id));

    return Responses.ok(c, { deleted: true, threadDeleted: deleteThread && !!job.threadId });
  },
);
