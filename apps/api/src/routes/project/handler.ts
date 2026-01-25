import type { RouteHandler } from '@hono/zod-openapi';
import { PROJECT_LIMITS, WebAppEnvs } from '@roundtable/shared';
import { DEFAULT_PROJECT_INDEX_STATUS, SubscriptionTiers, ThreadStatuses } from '@roundtable/shared/enums';
import { and, eq, inArray, like } from 'drizzle-orm';
import { ulid } from 'ulid';

import { invalidatePublicThreadCache } from '@/common/cache-utils';
import { createError } from '@/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  getCursorOrderBy,
  IdParamSchema,
  Responses,
} from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatProjectUpdate, ProjectAttachmentRagMetadata, ProjectMemoryUpdate } from '@/db/validation/project';
import { deductCreditsForAction } from '@/services/billing/credit.service';
import {
  getAggregatedProjectContext,
} from '@/services/context';
import { syncInstructionMemory } from '@/services/projects';
import { generateProjectFileR2Key } from '@/services/search';
import { cancelUploadCleanup, copyFile, deleteFile, isCleanupSchedulerAvailable } from '@/services/uploads';
import { getUserTier } from '@/services/usage';
import {
  enrichProjectWithCounts,
  omitUploadR2Key,
  verifyProjectOwnership,
  verifyUploadOwnership,
} from '@/shared-operations';
import type { ApiEnv } from '@/types';

import type {
  addAttachmentToProjectRoute,
  createProjectMemoryRoute,
  createProjectRoute,
  deleteProjectMemoryRoute,
  deleteProjectRoute,
  getProjectAttachmentRoute,
  getProjectContextRoute,
  getProjectLimitsRoute,
  getProjectMemoryRoute,
  getProjectRoute,
  listProjectAttachmentsRoute,
  listProjectMemoriesRoute,
  listProjectsRoute,
  listProjectThreadsRoute,
  removeAttachmentFromProjectRoute,
  updateProjectAttachmentRoute,
  updateProjectMemoryRoute,
  updateProjectRoute,
} from './route';
import {
  AddUploadToProjectRequestSchema,
  CreateProjectMemoryRequestSchema,
  CreateProjectRequestSchema,
  ListProjectAttachmentsQuerySchema,
  ListProjectMemoriesQuerySchema,
  ListProjectsQuerySchema,
  ListProjectThreadsQuerySchema,
  ProjectAttachmentParamSchema,
  ProjectMemoryParamSchema,
  UpdateProjectAttachmentRequestSchema,
  UpdateProjectMemoryRequestSchema,
  UpdateProjectRequestSchema,
} from './schema';

// ============================================================================
// PROJECT HANDLERS
// ============================================================================

/**
 * List all projects for the authenticated user
 */
export const listProjectsHandler: RouteHandler<typeof listProjectsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ListProjectsQuerySchema,
    operationName: 'listProjects',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();

    // Build filters
    const filters = [eq(tables.chatProject.userId, user.id)];

    if (query.search) {
      filters.push(like(tables.chatProject.name, `%${query.search}%`));
    }

    // ✅ PERF: Fetch projects with relations in single query using Drizzle relational
    const projects = await db.query.chatProject.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatProject.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.chatProject.createdAt, 'desc'),
      limit: query.limit + 1,
      with: {
        attachments: {
          columns: { id: true },
        },
        threads: {
          columns: { id: true },
        },
      },
    });

    // Transform to include counts
    const projectsWithCounts = projects.map((project) => {
      const { attachments, threads, ...projectData } = project;
      return {
        ...projectData,
        attachmentCount: attachments?.length ?? 0,
        threadCount: threads?.length ?? 0,
      };
    });

    // Apply pagination
    const { items, pagination } = applyCursorPagination(
      projectsWithCounts,
      query.limit,
      project => createTimestampCursor(project.createdAt),
    );

    return Responses.cursorPaginated(c, items, pagination);
  },
);

/**
 * Get project limits for current user based on subscription tier
 */
export const getProjectLimitsHandler: RouteHandler<typeof getProjectLimitsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getProjectLimits',
  },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    const tier = await getUserTier(user.id);

    // Get current project count
    const existingProjects = await db.query.chatProject.findMany({
      where: eq(tables.chatProject.userId, user.id),
      columns: { id: true },
    });

    const currentProjects = existingProjects.length;
    const maxProjects = tier === SubscriptionTiers.PRO ? PROJECT_LIMITS.MAX_PROJECTS_PER_USER : 0;
    const maxThreadsPerProject = tier === SubscriptionTiers.PRO ? PROJECT_LIMITS.MAX_THREADS_PER_PROJECT : 0;

    return Responses.ok(c, {
      tier,
      maxProjects,
      currentProjects,
      maxThreadsPerProject,
      canCreateProject: tier === SubscriptionTiers.PRO && currentProjects < maxProjects,
    });
  },
);

/**
 * Get a single project by ID
 */
export const getProjectHandler: RouteHandler<typeof getProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const project = await verifyProjectOwnership(id, user.id, db, {
      includeAttachments: true,
      includeThreads: true,
    });

    return Responses.ok(c, enrichProjectWithCounts(project));
  },
);

/**
 * Create a new project
 */
export const createProjectHandler: RouteHandler<typeof createProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateProjectRequestSchema,
    operationName: 'createProject',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;
    const db = await getDbAsync();

    // Check PRO tier - projects are PRO-only
    const tier = await getUserTier(user.id);
    if (tier === SubscriptionTiers.FREE) {
      throw createError.unauthorized('Projects require Pro subscription', {
        errorType: 'subscription',
        resource: 'project',
      });
    }

    // Check project count limit
    const existingProjects = await db.query.chatProject.findMany({
      where: eq(tables.chatProject.userId, user.id),
      columns: { id: true },
    });

    if (existingProjects.length >= PROJECT_LIMITS.MAX_PROJECTS_PER_USER) {
      throw createError.unauthorized(`Project limit reached (max ${PROJECT_LIMITS.MAX_PROJECTS_PER_USER})`, {
        errorType: 'quota',
        resource: 'project',
      });
    }

    const projectId = ulid();
    const r2FolderPrefix = `projects/${projectId}/`;

    // Determine AutoRAG instance ID based on environment
    const autoragInstanceId
      = body.autoragInstanceId
        || (c.env.WEBAPP_ENV === WebAppEnvs.PROD
          ? 'roundtable-rag-prod'
          : c.env.WEBAPP_ENV === WebAppEnvs.PREVIEW
            ? 'roundtable-rag-preview'
            : 'roundtable-rag-local');

    const [project] = await db
      .insert(tables.chatProject)
      .values({
        id: projectId,
        userId: user.id,
        name: body.name,
        description: body.description,
        color: body.color || 'blue',
        icon: body.icon || 'briefcase',
        customInstructions: body.customInstructions,
        autoragInstanceId,
        r2FolderPrefix,
        settings: body.settings,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Sync custom instructions to project memory if provided
    if (body.customInstructions) {
      console.error('[Project Create] Syncing instruction memory', {
        projectId,
        instructionLength: body.customInstructions.length,
      });
      await syncInstructionMemory({
        db,
        projectId,
        customInstructions: body.customInstructions,
        userId: user.id,
      });
      console.error('[Project Create] Instruction memory sync complete', { projectId });
    }

    return Responses.created(c, {
      ...project,
      attachmentCount: 0,
      threadCount: 0,
    });
  },
);

/**
 * Update an existing project
 */
export const updateProjectHandler: RouteHandler<typeof updateProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateProjectRequestSchema,
    operationName: 'updateProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    await verifyProjectOwnership(id, user.id, db);

    const updateData: ChatProjectUpdate = { updatedAt: new Date() };

    if (body.name !== undefined)
      updateData.name = body.name;
    if (body.description !== undefined)
      updateData.description = body.description || null;
    if (body.color !== undefined)
      updateData.color = body.color ?? undefined;
    if (body.icon !== undefined)
      updateData.icon = body.icon ?? undefined;
    if (body.customInstructions !== undefined)
      updateData.customInstructions = body.customInstructions || null;
    if (body.autoragInstanceId !== undefined)
      updateData.autoragInstanceId = body.autoragInstanceId;
    if (body.settings !== undefined)
      updateData.settings = body.settings;

    const [updated] = await db
      .update(tables.chatProject)
      .set(updateData)
      .where(eq(tables.chatProject.id, id))
      .returning();

    if (body.customInstructions !== undefined) {
      console.error('[Project Update] Syncing instruction memory', {
        projectId: id,
        instructionLength: body.customInstructions?.length ?? 0,
        isClearing: !body.customInstructions,
      });
      await syncInstructionMemory({
        db,
        projectId: id,
        customInstructions: body.customInstructions || null,
        userId: user.id,
      });
      console.error('[Project Update] Instruction memory sync complete', { projectId: id });
    }

    // Fetch counts for response
    const projectWithCounts = await verifyProjectOwnership(id, user.id, db, {
      includeAttachments: true,
      includeThreads: true,
    });

    return Responses.ok(c, {
      ...updated,
      attachmentCount: projectWithCounts.attachments.length,
      threadCount: projectWithCounts.threads.length,
    });
  },
);

/**
 * Delete a project with FULL CASCADE
 *
 * Deletes everything related to the project:
 * - All threads and their messages, participants, changelogs, pre-searches, feedback
 * - All project attachments and their R2 files
 * - All project memories (including those from deleted threads)
 * - All junction table records (threadUpload, messageUpload)
 * - All R2 files from thread uploads
 */
export const deleteProjectHandler: RouteHandler<typeof deleteProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    await verifyProjectOwnership(id, user.id, db);

    // =========================================================================
    // STEP 1: Collect all data that needs to be deleted
    // =========================================================================

    // Get all threads with their messages for cascade deletion
    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.projectId, id),
      columns: { id: true, slug: true, isPublic: true, previousSlug: true },
      with: {
        messages: {
          columns: { id: true },
        },
      },
    });

    const threadIds = threads.map(t => t.id);
    const messageIds = threads.flatMap(t => t.messages?.map(m => m.id) ?? []);

    // Get all project attachments for R2 cleanup
    const projectAttachments = await db.query.projectAttachment.findMany({
      where: eq(tables.projectAttachment.projectId, id),
      with: {
        upload: {
          columns: { r2Key: true },
        },
      },
    });

    // Get thread uploads for R2 cleanup (junction table has no FK to thread)
    const threadUploads = threadIds.length > 0
      ? await db.query.threadUpload.findMany({
          where: inArray(tables.threadUpload.threadId, threadIds),
          with: {
            upload: {
              columns: { r2Key: true },
            },
          },
        })
      : [];

    // Get message uploads for R2 cleanup (junction table has no FK to message)
    const messageUploads = messageIds.length > 0
      ? await db.query.messageUpload.findMany({
          where: inArray(tables.messageUpload.messageId, messageIds),
          with: {
            upload: {
              columns: { r2Key: true },
            },
          },
        })
      : [];

    // =========================================================================
    // STEP 2: Delete junction table records (no FK constraints)
    // These MUST be deleted before threads/messages due to missing FKs
    // =========================================================================

    if (threadIds.length > 0) {
      await db.delete(tables.threadUpload)
        .where(inArray(tables.threadUpload.threadId, threadIds));
    }

    if (messageIds.length > 0) {
      await db.delete(tables.messageUpload)
        .where(inArray(tables.messageUpload.messageId, messageIds));
    }

    // =========================================================================
    // STEP 3: Delete project memories (including those from threads)
    // Must delete before threads due to sourceThreadId reference
    // =========================================================================

    await db.delete(tables.projectMemory)
      .where(eq(tables.projectMemory.projectId, id));

    // =========================================================================
    // STEP 4: Invalidate public thread caches before deletion
    // =========================================================================

    if (threads.length > 0) {
      const cacheInvalidationTasks = threads
        .filter((thread): thread is typeof thread & { slug: string } => thread.isPublic && !!thread.slug)
        .flatMap((thread) => {
          const tasks = [
            invalidatePublicThreadCache(db, thread.slug, thread.id, c.env.UPLOADS_R2_BUCKET),
          ];
          if (thread.previousSlug) {
            tasks.push(invalidatePublicThreadCache(db, thread.previousSlug, thread.id, c.env.UPLOADS_R2_BUCKET));
          }
          return tasks;
        });

      if (cacheInvalidationTasks.length > 0 && c.executionCtx) {
        c.executionCtx.waitUntil(Promise.all(cacheInvalidationTasks).catch(() => {}));
      }
    }

    // =========================================================================
    // STEP 5: Delete the project (DB cascade handles threads, attachments)
    // With onDelete: 'cascade' on chatThread.projectId, all threads are deleted
    // Thread cascade then deletes: messages, participants, changelogs, pre-searches, feedback
    // =========================================================================

    await db.delete(tables.chatProject).where(eq(tables.chatProject.id, id));

    // =========================================================================
    // STEP 6: Delete R2 files in background (non-blocking)
    // =========================================================================

    if (c.executionCtx && c.env.UPLOADS_R2_BUCKET) {
      const r2CleanupTasks: Promise<unknown>[] = [];

      // Delete project attachment files
      for (const attachment of projectAttachments) {
        if (attachment.upload?.r2Key) {
          r2CleanupTasks.push(deleteFile(c.env.UPLOADS_R2_BUCKET, attachment.upload.r2Key));
        }
      }

      // Delete thread upload files
      for (const threadUpload of threadUploads) {
        if (threadUpload.upload?.r2Key) {
          r2CleanupTasks.push(deleteFile(c.env.UPLOADS_R2_BUCKET, threadUpload.upload.r2Key));
        }
      }

      // Delete message upload files
      for (const messageUpload of messageUploads) {
        if (messageUpload.upload?.r2Key) {
          r2CleanupTasks.push(deleteFile(c.env.UPLOADS_R2_BUCKET, messageUpload.upload.r2Key));
        }
      }

      if (r2CleanupTasks.length > 0) {
        c.executionCtx.waitUntil(Promise.all(r2CleanupTasks).catch(() => {}));
      }
    }

    return Responses.ok(c, {
      id,
      deleted: true,
      deletedThreadCount: threads.length,
      deletedAttachmentCount: projectAttachments.length,
    });
  },
);

// ============================================================================
// PROJECT THREADS HANDLERS
// ============================================================================

/**
 * List threads for a project
 */
export const listProjectThreadsHandler: RouteHandler<typeof listProjectThreadsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateQuery: ListProjectThreadsQuerySchema,
    operationName: 'listProjectThreads',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.validated.params;
    const query = c.validated.query;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.projectId, projectId),
      columns: {
        id: true,
        title: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (thread, { desc }) => [desc(thread.updatedAt)],
      limit: query.limit + 1,
      offset: query.cursor ? 1 : 0,
    });

    const { items, pagination } = applyCursorPagination(
      threads,
      query.limit,
      thread => createTimestampCursor(thread.updatedAt),
    );

    return Responses.cursorPaginated(c, items.map(t => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })), pagination);
  },
);

// ============================================================================
// PROJECT ATTACHMENT HANDLERS (Reference-based, S3/R2 Best Practice)
// ============================================================================

/**
 * List attachments for a project
 */
export const listProjectAttachmentsHandler: RouteHandler<typeof listProjectAttachmentsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateQuery: ListProjectAttachmentsQuerySchema,
    operationName: 'listProjectAttachments',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.validated.params;
    const query = c.validated.query;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const filters = [eq(tables.projectAttachment.projectId, projectId)];
    if (query.indexStatus) {
      filters.push(eq(tables.projectAttachment.indexStatus, query.indexStatus));
    }

    const attachments = await db.query.projectAttachment.findMany({
      where: buildCursorWhereWithFilters(
        tables.projectAttachment.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.projectAttachment.createdAt, 'desc'),
      limit: query.limit + 1,
      with: {
        upload: true,
        addedByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    const transformedAttachments = attachments.map(omitUploadR2Key);

    const { items, pagination } = applyCursorPagination(
      transformedAttachments,
      query.limit,
      attachment => createTimestampCursor(attachment.createdAt),
    );

    return Responses.cursorPaginated(c, items, pagination);
  },
);

/**
 * Add an existing upload to a project (reference-based)
 * S3/R2 Best Practice: Reference existing uploads instead of direct file upload
 */
export const addAttachmentToProjectHandler: RouteHandler<typeof addAttachmentToProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: AddUploadToProjectRequestSchema,
    operationName: 'addUploadToProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);
    const existingUpload = await verifyUploadOwnership(body.uploadId, user.id, db);

    // Check if upload is already in project
    const existingProjectAttachment = await db.query.projectAttachment.findFirst({
      where: and(
        eq(tables.projectAttachment.projectId, projectId),
        eq(tables.projectAttachment.uploadId, body.uploadId),
      ),
    });

    if (existingProjectAttachment) {
      throw createError.conflict(`Upload already in project`, {
        errorType: 'resource',
        resource: 'projectAttachment',
        resourceId: existingProjectAttachment.id,
      });
    }

    // Copy file to project folder for AI Search indexing
    const projectR2Key = generateProjectFileR2Key(projectId, existingUpload.filename);
    const copyResult = await copyFile(
      c.env.UPLOADS_R2_BUCKET,
      existingUpload.r2Key,
      projectR2Key,
    );

    if (!copyResult.success) {
      console.error(`[Project] Failed to copy file to project folder: ${copyResult.error}`);
    }

    const projectAttachmentId = ulid();
    const [projectAttachment] = await db
      .insert(tables.projectAttachment)
      .values({
        id: projectAttachmentId,
        projectId,
        uploadId: body.uploadId,
        addedBy: user.id,
        indexStatus: DEFAULT_PROJECT_INDEX_STATUS,
        ragMetadata: {
          context: body.context,
          description: body.description,
          tags: body.tags,
          projectR2Key: copyResult.success ? projectR2Key : undefined,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Deduct credits for file attachment
    try {
      await deductCreditsForAction(user.id, 'projectFileLink', {
        description: `File linked: ${existingUpload.filename}`,
      });
    } catch {
      // Non-critical - don't fail attachment if billing fails
    }

    if (isCleanupSchedulerAvailable(c.env)) {
      const cancelTask = cancelUploadCleanup(c.env.UPLOAD_CLEANUP_SCHEDULER, body.uploadId).catch(() => {});
      if (c.executionCtx) {
        c.executionCtx.waitUntil(cancelTask);
      }
    }

    const { r2Key: _r2Key, ...uploadWithoutR2Key } = existingUpload;

    return Responses.created(c, {
      ...projectAttachment,
      upload: uploadWithoutR2Key,
      addedByUser: { id: user.id, name: user.name, email: user.email },
    });
  },
);

/**
 * Get a single project attachment
 */
export const getProjectAttachmentHandler: RouteHandler<typeof getProjectAttachmentRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ProjectAttachmentParamSchema,
    operationName: 'getProjectAttachment',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, attachmentId } = c.validated.params;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const projectAttachment = await db.query.projectAttachment.findFirst({
      where: and(
        eq(tables.projectAttachment.id, attachmentId),
        eq(tables.projectAttachment.projectId, projectId),
      ),
      with: {
        upload: true,
        addedByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    if (!projectAttachment) {
      throw createError.notFound(`Attachment not found: ${attachmentId}`, {
        errorType: 'resource',
        resource: 'projectAttachment',
        resourceId: attachmentId,
      });
    }

    return Responses.ok(c, omitUploadR2Key(projectAttachment));
  },
);

/**
 * Update project attachment metadata
 */
export const updateProjectAttachmentHandler: RouteHandler<typeof updateProjectAttachmentRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ProjectAttachmentParamSchema,
    validateBody: UpdateProjectAttachmentRequestSchema,
    operationName: 'updateProjectAttachment',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, attachmentId } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const existing = await db.query.projectAttachment.findFirst({
      where: and(
        eq(tables.projectAttachment.id, attachmentId),
        eq(tables.projectAttachment.projectId, projectId),
      ),
      with: {
        upload: true,
        addedByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    if (!existing) {
      throw createError.notFound(`Attachment not found: ${attachmentId}`, {
        errorType: 'resource',
        resource: 'projectAttachment',
        resourceId: attachmentId,
      });
    }

    const currentMetadata = existing.ragMetadata || {};
    const updatedMetadata: ProjectAttachmentRagMetadata = { ...currentMetadata };

    if (body.context !== undefined)
      updatedMetadata.context = body.context ?? undefined;
    if (body.description !== undefined)
      updatedMetadata.description = body.description ?? undefined;
    if (body.tags !== undefined)
      updatedMetadata.tags = body.tags;

    const [updated] = await db
      .update(tables.projectAttachment)
      .set({ ragMetadata: updatedMetadata, updatedAt: new Date() })
      .where(eq(tables.projectAttachment.id, attachmentId))
      .returning();

    const { r2Key: _r2Key, ...uploadWithoutR2Key } = existing.upload;

    return Responses.ok(c, {
      ...updated,
      upload: uploadWithoutR2Key,
      addedByUser: existing.addedByUser,
    });
  },
);

/**
 * Remove an attachment from a project (reference removal, not file deletion)
 * S3/R2 Best Practice: Only removes the reference, the underlying file remains in the upload table
 */
export const removeAttachmentFromProjectHandler: RouteHandler<typeof removeAttachmentFromProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ProjectAttachmentParamSchema,
    operationName: 'removeAttachmentFromProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, attachmentId } = c.validated.params;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const projectAttachment = await db.query.projectAttachment.findFirst({
      where: and(
        eq(tables.projectAttachment.id, attachmentId),
        eq(tables.projectAttachment.projectId, projectId),
      ),
    });

    if (!projectAttachment) {
      throw createError.notFound(`Attachment not found: ${attachmentId}`, {
        errorType: 'resource',
        resource: 'projectAttachment',
        resourceId: attachmentId,
      });
    }

    // ✅ VALIDATION: Prevent deletion of files linked to active threads
    if (projectAttachment.ragMetadata?.sourceThreadId) {
      const sourceThread = await db.query.chatThread.findFirst({
        where: and(
          eq(tables.chatThread.id, projectAttachment.ragMetadata.sourceThreadId),
          eq(tables.chatThread.status, ThreadStatuses.ACTIVE),
        ),
        columns: { id: true },
      });

      if (sourceThread) {
        throw createError.badRequest(
          'Cannot delete file linked to active thread. Delete the thread first.',
          { errorType: 'validation', resource: 'projectAttachment' },
        );
      }
    }

    if (projectAttachment.ragMetadata?.projectR2Key) {
      const deleteTask = deleteFile(c.env.UPLOADS_R2_BUCKET, projectAttachment.ragMetadata.projectR2Key)
        .then((result) => {
          if (!result.success) {
            console.error(`[Project] Failed to delete project file copy: ${result.error}`);
          }
        })
        .catch(() => {});

      if (c.executionCtx) {
        c.executionCtx.waitUntil(deleteTask);
      }
    }

    await db.delete(tables.projectAttachment).where(eq(tables.projectAttachment.id, attachmentId));

    return Responses.ok(c, { id: attachmentId, deleted: true });
  },
);

// ============================================================================
// PROJECT MEMORY HANDLERS
// ============================================================================

/**
 * List memories for a project
 */
export const listProjectMemoriesHandler: RouteHandler<typeof listProjectMemoriesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateQuery: ListProjectMemoriesQuerySchema,
    operationName: 'listProjectMemories',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.validated.params;
    const query = c.validated.query;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const filters = [eq(tables.projectMemory.projectId, projectId)];
    if (query.source) {
      filters.push(eq(tables.projectMemory.source, query.source));
    }
    if (query.isActive !== undefined) {
      filters.push(eq(tables.projectMemory.isActive, query.isActive === 'true'));
    }

    const memories = await db.query.projectMemory.findMany({
      where: buildCursorWhereWithFilters(
        tables.projectMemory.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.projectMemory.createdAt, 'desc'),
      limit: query.limit + 1,
      with: {
        sourceThread: { columns: { id: true, title: true } },
      },
    });

    const transformedMemories = memories.map((memory) => {
      const { sourceThread, ...rest } = memory;
      return { ...rest, sourceThreadTitle: sourceThread?.title || null };
    });

    const { items, pagination } = applyCursorPagination(
      transformedMemories,
      query.limit,
      memory => createTimestampCursor(memory.createdAt),
    );

    return Responses.cursorPaginated(c, items, pagination);
  },
);

/**
 * Create a memory for a project
 */
export const createProjectMemoryHandler: RouteHandler<typeof createProjectMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: CreateProjectMemoryRequestSchema,
    operationName: 'createProjectMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const memoryId = ulid();
    const [memory] = await db
      .insert(tables.projectMemory)
      .values({
        id: memoryId,
        projectId,
        content: body.content,
        summary: body.summary,
        source: body.source || 'explicit',
        importance: body.importance || 5,
        isActive: true,
        metadata: body.metadata,
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return Responses.created(c, { ...memory, sourceThreadTitle: null });
  },
);

/**
 * Get a single project memory
 */
export const getProjectMemoryHandler: RouteHandler<typeof getProjectMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ProjectMemoryParamSchema,
    operationName: 'getProjectMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, memoryId } = c.validated.params;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const memory = await db.query.projectMemory.findFirst({
      where: and(
        eq(tables.projectMemory.id, memoryId),
        eq(tables.projectMemory.projectId, projectId),
      ),
      with: {
        sourceThread: { columns: { id: true, title: true } },
      },
    });

    if (!memory) {
      throw createError.notFound(`Memory not found: ${memoryId}`, {
        errorType: 'resource',
        resource: 'projectMemory',
        resourceId: memoryId,
      });
    }

    const { sourceThread, ...rest } = memory;
    return Responses.ok(c, { ...rest, sourceThreadTitle: sourceThread?.title || null });
  },
);

/**
 * Update a project memory
 */
export const updateProjectMemoryHandler: RouteHandler<typeof updateProjectMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ProjectMemoryParamSchema,
    validateBody: UpdateProjectMemoryRequestSchema,
    operationName: 'updateProjectMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, memoryId } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const existing = await db.query.projectMemory.findFirst({
      where: and(
        eq(tables.projectMemory.id, memoryId),
        eq(tables.projectMemory.projectId, projectId),
      ),
    });

    if (!existing) {
      throw createError.notFound(`Memory not found: ${memoryId}`, {
        errorType: 'resource',
        resource: 'projectMemory',
        resourceId: memoryId,
      });
    }

    const updateData: ProjectMemoryUpdate = { updatedAt: new Date() };
    if (body.content !== undefined)
      updateData.content = body.content;
    if (body.summary !== undefined)
      updateData.summary = body.summary;
    if (body.importance !== undefined)
      updateData.importance = body.importance;
    if (body.isActive !== undefined)
      updateData.isActive = body.isActive;
    if (body.metadata !== undefined)
      updateData.metadata = body.metadata;

    const [updated] = await db
      .update(tables.projectMemory)
      .set(updateData)
      .where(eq(tables.projectMemory.id, memoryId))
      .returning();

    if (!updated) {
      throw createError.notFound(`Memory not found: ${memoryId}`, {
        errorType: 'resource',
        resource: 'projectMemory',
        resourceId: memoryId,
      });
    }

    let sourceThreadTitle: string | null = null;
    if (updated.sourceThreadId) {
      const thread = await db.query.chatThread.findFirst({
        where: eq(tables.chatThread.id, updated.sourceThreadId),
        columns: { title: true },
      });
      sourceThreadTitle = thread?.title || null;
    }

    return Responses.ok(c, { ...updated, sourceThreadTitle });
  },
);

/**
 * Delete a project memory
 */
export const deleteProjectMemoryHandler: RouteHandler<typeof deleteProjectMemoryRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ProjectMemoryParamSchema,
    operationName: 'deleteProjectMemory',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, memoryId } = c.validated.params;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const memory = await db.query.projectMemory.findFirst({
      where: and(
        eq(tables.projectMemory.id, memoryId),
        eq(tables.projectMemory.projectId, projectId),
      ),
    });

    if (!memory) {
      throw createError.notFound(`Memory not found: ${memoryId}`, {
        errorType: 'resource',
        resource: 'projectMemory',
        resourceId: memoryId,
      });
    }

    await db.delete(tables.projectMemory).where(eq(tables.projectMemory.id, memoryId));

    return Responses.ok(c, { id: memoryId, deleted: true });
  },
);

// ============================================================================
// PROJECT CONTEXT HANDLER
// ============================================================================

/**
 * Get aggregated project context for RAG
 * Includes memories, cross-chat context, search history, and analyses
 */
export const getProjectContextHandler: RouteHandler<typeof getProjectContextRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getProjectContext',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.validated.params;
    const db = await getDbAsync();

    await verifyProjectOwnership(projectId, user.id, db);

    const context = await getAggregatedProjectContext({
      projectId,
      currentThreadId: '',
      userQuery: '',
      db,
    });

    return Responses.ok(c, {
      memories: {
        items: context.memories.memories.map(m => ({
          id: m.id,
          content: m.content,
          summary: m.summary,
          source: m.source,
          importance: m.importance,
        })),
        totalCount: context.memories.totalCount,
      },
      recentChats: {
        threads: context.chats.threads.map(t => ({
          id: t.id,
          title: t.title,
          messageExcerpt: t.messages[0]?.content.slice(0, 200) || '',
        })),
        totalCount: context.chats.totalThreads,
      },
      searches: {
        items: context.searches.searches.map(s => ({
          threadTitle: s.threadTitle,
          userQuery: s.userQuery,
          summary: s.summary,
        })),
        totalCount: context.searches.totalCount,
      },
      moderators: {
        items: context.moderators.moderators.map(m => ({
          threadTitle: m.threadTitle,
          userQuestion: m.userQuestion,
          moderator: m.moderator,
        })),
        totalCount: context.moderators.totalCount,
      },
    });
  },
);
