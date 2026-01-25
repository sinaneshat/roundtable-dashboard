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
import type { JobResponse } from './schema';
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
): JobResponse {
  return {
    id: job.id,
    userId: job.userId,
    threadId: job.threadId,
    threadSlug: threadSlug ?? null,
    isPublic: isPublic ?? false,
    initialPrompt: job.initialPrompt,
    totalRounds: job.totalRounds,
    currentRound: job.currentRound,
    autoPublish: job.autoPublish,
    status: job.status,
    selectedModels: job.selectedModels ?? null,
    metadata: job.metadata ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/**
 * List automated jobs (admin only)
 */
export const listJobsHandler: RouteHandler<typeof listJobsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: JobListQuerySchema,
    operationName: 'listJobs',
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { status, limit = 20, cursor } = c.validated.query;
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
        where: (t, { inArray }) => inArray(t.id, threadIds),
        columns: { id: true, slug: true, isPublic: true },
      });
      for (const t of threads) {
        threadMap.set(t.id, { slug: t.slug, isPublic: t.isPublic });
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
      jobs: transformedJobs,
      total: results.length,
      hasMore,
      nextCursor,
    });
  },
);

/**
 * Create automated job (admin only)
 */
export const createJobHandler: RouteHandler<typeof createJobRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateJobRequestSchema,
    operationName: 'createJob',
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
        id: jobId,
        userId: user.id,
        initialPrompt: body.initialPrompt,
        totalRounds: body.totalRounds,
        autoPublish: body.autoPublish,
        status: AutomatedJobStatuses.PENDING,
        currentRound: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!job) {
      throw createError.internal('Failed to create job', {
        errorType: 'database',
        service: 'automatedJob',
      });
    }

    // Queue the job for background processing
    let queued = false;
    try {
      const message: StartAutomatedJobQueueMessage = {
        type: RoundOrchestrationMessageTypes.START_AUTOMATED_JOB,
        messageId: `start-${jobId}`,
        jobId,
        userId: user.id,
        sessionToken,
        queuedAt: new Date().toISOString(),
      };

      await c.env.ROUND_ORCHESTRATION_QUEUE.send(message);
      queued = true;
    } catch (err) {
      console.error('[createJob] Failed to queue job:', err);
      // Mark job as failed if we can't queue it
      await db
        .update(tables.automatedJob)
        .set({
          status: 'failed',
          metadata: { errorMessage: 'Failed to queue job for processing' },
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
    validateParams: IdParamSchema,
    operationName: 'getJob',
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
        where: eq(tables.chatThread.id, job.threadId),
        columns: { slug: true, isPublic: true },
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
    validateParams: IdParamSchema,
    validateBody: UpdateJobRequestSchema,
    operationName: 'updateJob',
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
          status: AutomatedJobStatuses.PENDING,
          currentRound: 0,
          metadata: null,
          updatedAt: new Date(),
        })
        .where(eq(tables.automatedJob.id, id));

      // Queue the job
      const message: StartAutomatedJobQueueMessage = {
        type: RoundOrchestrationMessageTypes.START_AUTOMATED_JOB,
        messageId: `start-${id}-${Date.now()}`,
        jobId: id,
        userId: user.id,
        sessionToken,
        queuedAt: new Date().toISOString(),
      };

      try {
        await c.env.ROUND_ORCHESTRATION_QUEUE.send(message);
      } catch (err) {
        console.error('[updateJob] Failed to queue job:', err);
        await db
          .update(tables.automatedJob)
          .set({
            status: AutomatedJobStatuses.FAILED,
            metadata: { errorMessage: 'Failed to queue job for processing' },
          })
          .where(eq(tables.automatedJob.id, id));
        throw createError.internal('Failed to queue job', {
          errorType: 'queue',
          service: 'automatedJob',
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
        service: 'automatedJob',
      });
    }

    // Get thread slug and isPublic
    let threadSlug: string | null = null;
    let isPublic = false;
    if (updatedJob.threadId) {
      const thread = await db.query.chatThread.findFirst({
        where: eq(tables.chatThread.id, updatedJob.threadId),
        columns: { slug: true, isPublic: true },
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
    validateParams: IdParamSchema,
    validateQuery: DeleteJobQuerySchema,
    operationName: 'deleteJob',
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
