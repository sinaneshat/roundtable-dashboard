import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq, like } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  getCursorOrderBy,
  Responses,
} from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import {
  getAggregatedProjectContext,
} from '@/api/services/project-context.service';
import { generateProjectFileR2Key } from '@/api/services/rag-indexing.service';
import { copyFile, deleteFile } from '@/api/services/storage.service';
import {
  cancelUploadCleanup,
  isCleanupSchedulerAvailable,
} from '@/api/services/upload-cleanup.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  addAttachmentToProjectRoute,
  createProjectMemoryRoute,
  createProjectRoute,
  deleteProjectMemoryRoute,
  deleteProjectRoute,
  getProjectAttachmentRoute,
  getProjectContextRoute,
  getProjectMemoryRoute,
  getProjectRoute,
  listProjectAttachmentsRoute,
  listProjectMemoriesRoute,
  listProjectsRoute,
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

    // Fetch projects with cursor pagination
    const projects = await db.query.chatProject.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatProject.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.chatProject.createdAt, 'desc'),
      limit: query.limit + 1,
    });

    // Get attachment counts and thread counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const attachments = await db.query.projectAttachment.findMany({
          where: eq(tables.projectAttachment.projectId, project.id),
        });

        const threads = await db.query.chatThread.findMany({
          where: eq(tables.chatThread.projectId, project.id),
        });

        return {
          ...project,
          attachmentCount: attachments.length,
          threadCount: threads.length,
        };
      }),
    );

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

    // Fetch project
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, id),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${id}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: id,
      });
    }

    // Get counts
    const attachments = await db.query.projectAttachment.findMany({
      where: eq(tables.projectAttachment.projectId, project.id),
    });

    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.projectId, project.id),
    });

    return Responses.ok(c, {
      ...project,
      attachmentCount: attachments.length,
      threadCount: threads.length,
    });
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

    const projectId = ulid();
    const r2FolderPrefix = `projects/${projectId}/`;

    // Determine AutoRAG instance ID based on environment
    const autoragInstanceId
      = body.autoragInstanceId
        || (c.env.NEXT_PUBLIC_WEBAPP_ENV === 'prod'
          ? 'roundtable-rag-prod'
          : c.env.NEXT_PUBLIC_WEBAPP_ENV === 'preview'
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
        customInstructions: body.customInstructions,
        autoragInstanceId,
        r2FolderPrefix,
        settings: body.settings,
        metadata: body.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    c.status(201);
    return Responses.ok(c, {
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

    // Verify ownership
    const existing = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, id),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!existing) {
      throw createError.notFound(`Project not found: ${id}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: id,
      });
    }

    // Update project - explicitly construct update object for type safety
    const updateData: {
      name?: string;
      description?: string | null;
      color?: typeof body.color;
      customInstructions?: string | null;
      autoragInstanceId?: string | null;
      settings?: typeof body.settings;
      metadata?: typeof body.metadata;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.name !== undefined)
      updateData.name = String(body.name);
    if (body.description !== undefined)
      updateData.description = body.description ? String(body.description) : null;
    if (body.color !== undefined)
      updateData.color = body.color ?? undefined;
    if (body.customInstructions !== undefined)
      updateData.customInstructions = body.customInstructions || null;
    if (body.autoragInstanceId !== undefined)
      updateData.autoragInstanceId = body.autoragInstanceId;
    if (body.settings !== undefined)
      updateData.settings = body.settings;
    if (body.metadata !== undefined)
      updateData.metadata = body.metadata;

    const [updated] = await db
      .update(tables.chatProject)
      .set(updateData)
      .where(eq(tables.chatProject.id, id))
      .returning();

    // Get counts
    const attachments = await db.query.projectAttachment.findMany({
      where: eq(tables.projectAttachment.projectId, id),
    });

    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.projectId, id),
    });

    return Responses.ok(c, {
      ...updated,
      attachmentCount: attachments.length,
      threadCount: threads.length,
    });
  },
);

/**
 * Delete a project (cascades to attachments and updates threads)
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

    // Verify ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, id),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${id}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: id,
      });
    }

    // Delete project from DB (cascade will handle projectAttachment and projectMemory)
    // Note: We don't delete R2 files here since they're managed via the upload table
    await db.delete(tables.chatProject).where(eq(tables.chatProject.id, id));

    return Responses.ok(c, {
      id,
      deleted: true,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Build filters
    const filters = [eq(tables.projectAttachment.projectId, projectId)];

    if (query.indexStatus) {
      filters.push(eq(tables.projectAttachment.indexStatus, query.indexStatus));
    }

    // Fetch attachments with cursor pagination
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
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Transform to response format (omit r2Key from nested upload)
    const transformedAttachments = attachments.map((pa) => {
      const { r2Key: _r2Key, ...uploadWithoutR2Key } = pa.upload;
      return {
        ...pa,
        upload: uploadWithoutR2Key,
      };
    });

    // Apply pagination
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Verify upload exists and user has access
    const existingUpload = await db.query.upload.findFirst({
      where: and(
        eq(tables.upload.id, body.uploadId),
        eq(tables.upload.userId, user.id),
      ),
    });

    if (!existingUpload) {
      throw createError.notFound(`Upload not found: ${body.uploadId}`, {
        errorType: 'resource',
        resource: 'upload',
        resourceId: body.uploadId,
      });
    }

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
    // AI Search uses folder-based multitenancy: projects/{projectId}/
    // Files must be in this folder for the folder filter to find them
    const projectR2Key = generateProjectFileR2Key(projectId, existingUpload.filename);
    const copyResult = await copyFile(
      c.env.UPLOADS_R2_BUCKET,
      existingUpload.r2Key,
      projectR2Key,
    );

    if (!copyResult.success) {
      console.error(`[Project] Failed to copy file to project folder: ${copyResult.error}`);
      // Continue anyway - file may still be accessible, just not via AI Search
    }

    // Create project attachment reference with project-specific R2 key
    const projectAttachmentId = ulid();
    const [projectAttachment] = await db
      .insert(tables.projectAttachment)
      .values({
        id: projectAttachmentId,
        projectId,
        uploadId: body.uploadId,
        addedBy: user.id,
        // Set as pending - AI Search auto-indexes R2 every 6 hours
        indexStatus: 'pending',
        ragMetadata: {
          context: body.context,
          description: body.description,
          tags: body.tags,
          // Store project-specific R2 key for AI Search
          projectR2Key: copyResult.success ? projectR2Key : undefined,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Cancel scheduled cleanup for the attached upload (non-blocking)
    if (isCleanupSchedulerAvailable(c.env)) {
      const cancelTask = cancelUploadCleanup(c.env.UPLOAD_CLEANUP_SCHEDULER, body.uploadId).catch(() => {});
      if (c.executionCtx) {
        c.executionCtx.waitUntil(cancelTask);
      }
    }

    // Get the upload details for response
    const { r2Key: _r2Key, ...uploadWithoutR2Key } = existingUpload;

    c.status(201);
    return Responses.ok(c, {
      ...projectAttachment,
      upload: uploadWithoutR2Key,
      addedByUser: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Get project attachment with related data
    const projectAttachment = await db.query.projectAttachment.findFirst({
      where: and(
        eq(tables.projectAttachment.id, attachmentId),
        eq(tables.projectAttachment.projectId, projectId),
      ),
      with: {
        upload: true,
        addedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
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

    // Transform to response format (omit r2Key)
    const { r2Key: _r2Key, ...uploadWithoutR2Key } = projectAttachment.upload;

    return Responses.ok(c, {
      ...projectAttachment,
      upload: uploadWithoutR2Key,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Get existing project attachment
    const existing = await db.query.projectAttachment.findFirst({
      where: and(
        eq(tables.projectAttachment.id, attachmentId),
        eq(tables.projectAttachment.projectId, projectId),
      ),
      with: {
        upload: true,
        addedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
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

    // Update ragMetadata - explicitly typed to match schema
    const currentMetadata = existing.ragMetadata || {};
    const updatedMetadata: {
      context?: string;
      description?: string;
      tags?: string[];
      indexedAt?: string;
      errorMessage?: string;
    } = { ...currentMetadata };

    if (body.context !== undefined)
      updatedMetadata.context = body.context ?? undefined;
    if (body.description !== undefined)
      updatedMetadata.description = body.description ?? undefined;
    if (body.tags !== undefined)
      updatedMetadata.tags = body.tags;

    const [updated] = await db
      .update(tables.projectAttachment)
      .set({
        ragMetadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(eq(tables.projectAttachment.id, attachmentId))
      .returning();

    // Transform response (omit r2Key)
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Verify attachment exists in project
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

    // Clean up copied file from project folder (if it exists)
    // This removes the file from AI Search's scope
    // ✅ TYPE-SAFE: ragMetadata is already typed via $type<ProjectAttachmentRagMetadata>() in schema
    if (projectAttachment.ragMetadata?.projectR2Key) {
      const deleteTask = deleteFile(c.env.UPLOADS_R2_BUCKET, projectAttachment.ragMetadata.projectR2Key)
        .then((result) => {
          if (!result.success) {
            console.error(`[Project] Failed to delete project file copy: ${result.error}`);
          }
        })
        .catch(() => {}); // Non-blocking, best-effort cleanup

      if (c.executionCtx) {
        c.executionCtx.waitUntil(deleteTask);
      }
    }

    // Remove reference (not the underlying original file)
    await db
      .delete(tables.projectAttachment)
      .where(eq(tables.projectAttachment.id, attachmentId));

    return Responses.ok(c, {
      id: attachmentId,
      deleted: true,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Build filters
    const filters = [eq(tables.projectMemory.projectId, projectId)];

    if (query.source) {
      filters.push(eq(tables.projectMemory.source, query.source));
    }

    if (query.isActive !== undefined) {
      filters.push(eq(tables.projectMemory.isActive, query.isActive === 'true'));
    }

    // Fetch memories with cursor pagination
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
        sourceThread: {
          columns: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Transform to include sourceThreadTitle
    const transformedMemories = memories.map((memory) => {
      const { sourceThread, ...rest } = memory;
      return {
        ...rest,
        sourceThreadTitle: sourceThread?.title || null,
      };
    });

    // Apply pagination
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

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

    c.status(201);
    return Responses.ok(c, {
      ...memory,
      sourceThreadTitle: null,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Get memory with source thread
    const memory = await db.query.projectMemory.findFirst({
      where: and(
        eq(tables.projectMemory.id, memoryId),
        eq(tables.projectMemory.projectId, projectId),
      ),
      with: {
        sourceThread: {
          columns: {
            id: true,
            title: true,
          },
        },
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
    return Responses.ok(c, {
      ...rest,
      sourceThreadTitle: sourceThread?.title || null,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Verify memory exists
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

    // Build update object
    const updateData: {
      content?: string;
      summary?: string | null;
      importance?: number;
      isActive?: boolean;
      metadata?: typeof body.metadata;
      updatedAt: Date;
    } = { updatedAt: new Date() };

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

    // Get source thread for response
    let sourceThreadTitle: string | null = null;
    if (updated.sourceThreadId) {
      const thread = await db.query.chatThread.findFirst({
        where: eq(tables.chatThread.id, updated.sourceThreadId),
        columns: { title: true },
      });
      sourceThreadTitle = thread?.title || null;
    }

    return Responses.ok(c, {
      ...updated,
      sourceThreadTitle,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Verify memory exists
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

    // Delete memory
    await db
      .delete(tables.projectMemory)
      .where(eq(tables.projectMemory.id, memoryId));

    return Responses.ok(c, {
      id: memoryId,
      deleted: true,
    });
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

    // Verify project ownership
    const project = await db.query.chatProject.findFirst({
      where: and(
        eq(tables.chatProject.id, projectId),
        eq(tables.chatProject.userId, user.id),
      ),
    });

    if (!project) {
      throw createError.notFound(`Project not found: ${projectId}`, {
        errorType: 'resource',
        resource: 'project',
        resourceId: projectId,
      });
    }

    // Get aggregated context (using empty thread ID for all threads)
    const context = await getAggregatedProjectContext({
      projectId,
      currentThreadId: '', // Get context from all threads
      userQuery: '', // Not filtering by query
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
          analysis: s.analysis,
        })),
        totalCount: context.searches.totalCount,
      },
      analyses: {
        items: context.analyses.analyses.map(a => ({
          threadTitle: a.threadTitle,
          userQuestion: a.userQuestion,
          summary: a.summary,
        })),
        totalCount: context.analyses.totalCount,
      },
    });
  },
);
