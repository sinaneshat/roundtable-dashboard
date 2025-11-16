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
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  createProjectRoute,
  deleteKnowledgeFileRoute,
  deleteProjectRoute,
  getProjectRoute,
  listKnowledgeFilesRoute,
  listProjectsRoute,
  updateProjectRoute,
  uploadKnowledgeFileRoute,
} from './route';
import {
  CreateProjectRequestSchema,
  ListKnowledgeFilesQuerySchema,
  ListProjectsQuerySchema,
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

    // Get file counts and thread counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const files = await db.query.projectKnowledgeFile.findMany({
          where: eq(tables.projectKnowledgeFile.projectId, project.id),
        });

        const threads = await db.query.chatThread.findMany({
          where: eq(tables.chatThread.projectId, project.id),
        });

        return {
          ...project,
          fileCount: files.length,
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
    operationName: 'getProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.req.param();

    if (!id) {
      throw createError.badRequest('Project ID is required', {
        errorType: 'validation',
        field: 'id',
      });
    }

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
    const files = await db.query.projectKnowledgeFile.findMany({
      where: eq(tables.projectKnowledgeFile.projectId, project.id),
    });

    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.projectId, project.id),
    });

    return Responses.ok(c, {
      ...project,
      fileCount: files.length,
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
      fileCount: 0,
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
    validateBody: UpdateProjectRequestSchema,
    operationName: 'updateProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.req.param();

    if (!id) {
      throw createError.badRequest('Project ID is required', {
        errorType: 'validation',
        field: 'id',
      });
    }

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
      autoragInstanceId?: string | null;
      settings?: typeof body.settings;
      metadata?: typeof body.metadata;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.name !== undefined)
      updateData.name = String(body.name);
    if (body.description !== undefined)
      updateData.description = body.description ? String(body.description) : null;
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
    const files = await db.query.projectKnowledgeFile.findMany({
      where: eq(tables.projectKnowledgeFile.projectId, id),
    });

    const threads = await db.query.chatThread.findMany({
      where: eq(tables.chatThread.projectId, id),
    });

    return Responses.ok(c, {
      ...updated,
      fileCount: files.length,
      threadCount: threads.length,
    });
  },
);

/**
 * Delete a project (cascades to files and updates threads)
 */
export const deleteProjectHandler: RouteHandler<typeof deleteProjectRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'deleteProject',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.req.param();

    if (!id) {
      throw createError.badRequest('Project ID is required', {
        errorType: 'validation',
        field: 'id',
      });
    }

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

    // Get all knowledge files for R2 cleanup
    const knowledgeFiles = await db.query.projectKnowledgeFile.findMany({
      where: eq(tables.projectKnowledgeFile.projectId, id),
    });

    // Delete project from DB first (critical - must complete)
    await db.delete(tables.chatProject).where(eq(tables.chatProject.id, id));

    // ✅ PERFORMANCE OPTIMIZATION: Non-blocking R2 cleanup
    // Delete R2 files asynchronously via waitUntil() to avoid blocking response
    // Expected gain: 50-200ms per project deletion (depends on file count)
    const deleteR2Files = async () => {
      for (const file of knowledgeFiles) {
        try {
          await c.env.UPLOADS_R2_BUCKET.delete(file.r2Key);
        } catch {
          // Silent failure - R2 cleanup is best-effort
        }
      }
    };

    if (c.executionCtx) {
      c.executionCtx.waitUntil(deleteR2Files());
    } else {
      deleteR2Files().catch(() => {});
    }

    return Responses.ok(c, {
      id,
      deleted: true,
    });
  },
);

// ============================================================================
// KNOWLEDGE FILE HANDLERS
// ============================================================================

/**
 * List knowledge files for a project
 */
export const listKnowledgeFilesHandler: RouteHandler<typeof listKnowledgeFilesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ListKnowledgeFilesQuerySchema,
    operationName: 'listKnowledgeFiles',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.req.param();

    if (!projectId) {
      throw createError.badRequest('Project ID is required', {
        errorType: 'validation',
        field: 'id',
      });
    }

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
    const filters = [eq(tables.projectKnowledgeFile.projectId, projectId)];

    if (query.status) {
      filters.push(eq(tables.projectKnowledgeFile.status, query.status));
    }

    // Fetch files with cursor pagination
    const files = await db.query.projectKnowledgeFile.findMany({
      where: buildCursorWhereWithFilters(
        tables.projectKnowledgeFile.createdAt,
        query.cursor,
        'desc',
        filters,
      ),
      orderBy: getCursorOrderBy(tables.projectKnowledgeFile.createdAt, 'desc'),
      limit: query.limit + 1,
      with: {
        uploadedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Apply pagination
    const { items, pagination } = applyCursorPagination(
      files,
      query.limit,
      file => createTimestampCursor(file.createdAt),
    );

    return Responses.cursorPaginated(c, items, pagination);
  },
);

/**
 * Upload a knowledge file to a project
 */
export const uploadKnowledgeFileHandler: RouteHandler<typeof uploadKnowledgeFileRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'uploadKnowledgeFile',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId } = c.req.param();

    if (!projectId) {
      throw createError.badRequest('Project ID is required', {
        errorType: 'validation',
        field: 'id',
      });
    }

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

    // Parse multipart form data
    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file) {
      throw createError.badRequest('No file provided', {
        errorType: 'validation',
        field: 'file',
      });
    }

    // Validate file size (check project settings)
    const maxFileSize = project.settings?.maxFileSize || 10 * 1024 * 1024; // 10MB default
    if (file.size > maxFileSize) {
      throw createError.badRequest(
        `File too large (max ${maxFileSize / 1024 / 1024}MB)`,
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // Validate file type (check project settings)
    const allowedTypes = project.settings?.allowedFileTypes || [
      'application/pdf',
      'text/plain',
      'text/html',
      'text/markdown',
      'text/csv',
      'image/png',
      'image/jpeg',
    ];

    if (!allowedTypes.includes(file.type)) {
      throw createError.badRequest(
        `File type not allowed: ${file.type}`,
        {
          errorType: 'validation',
          field: 'file',
        },
      );
    }

    // Generate R2 key
    const fileId = ulid();
    const sanitizedFilename = file.name.replace(/[^\w.-]/g, '_');
    const r2Key = `${project.r2FolderPrefix}${fileId}_${sanitizedFilename}`;

    // Upload to R2
    const fileBuffer = await file.arrayBuffer();
    await c.env.UPLOADS_R2_BUCKET.put(r2Key, fileBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        projectId,
        uploadedBy: user.id,
        filename: file.name,
        context: (body.context as string) || '',
      },
    });

    // Create DB record
    const [knowledgeFile] = await db
      .insert(tables.projectKnowledgeFile)
      .values({
        id: fileId,
        projectId,
        filename: file.name,
        r2Key,
        uploadedBy: user.id,
        fileSize: file.size,
        fileType: file.type,
        status: 'uploaded', // AutoRAG will index asynchronously
        metadata: {
          description: (body.description as string) || undefined,
          context: (body.context as string) || undefined,
          tags: body.tags ? JSON.parse(body.tags as string) : undefined,
        },
        createdAt: new Date(),
      })
      .returning();

    c.status(201);
    return Responses.ok(c, knowledgeFile);
  },
);

/**
 * Delete a knowledge file
 */
export const deleteKnowledgeFileHandler: RouteHandler<typeof deleteKnowledgeFileRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'deleteKnowledgeFile',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: projectId, fileId } = c.req.param();

    if (!projectId || !fileId) {
      throw createError.badRequest('Project ID and File ID are required', {
        errorType: 'validation',
        field: !projectId ? 'id' : 'fileId',
      });
    }

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

    // Get file
    const file = await db.query.projectKnowledgeFile.findFirst({
      where: and(
        eq(tables.projectKnowledgeFile.id, fileId),
        eq(tables.projectKnowledgeFile.projectId, projectId),
      ),
    });

    if (!file) {
      throw createError.notFound(`File not found: ${fileId}`, {
        errorType: 'resource',
        resource: 'knowledgeFile',
        resourceId: fileId,
      });
    }

    // Delete from DB first (critical - must complete)
    await db
      .delete(tables.projectKnowledgeFile)
      .where(eq(tables.projectKnowledgeFile.id, fileId));

    // ✅ PERFORMANCE OPTIMIZATION: Non-blocking R2 cleanup
    // Delete R2 file asynchronously via waitUntil() to avoid blocking response
    // Expected gain: 50-200ms per file deletion
    const deleteR2File = async () => {
      try {
        await c.env.UPLOADS_R2_BUCKET.delete(file.r2Key);
      } catch {
        // Silent failure - R2 cleanup is best-effort
      }
    };

    if (c.executionCtx) {
      c.executionCtx.waitUntil(deleteR2File());
    } else {
      deleteR2File().catch(() => {});
    }

    return Responses.ok(c, {
      id: fileId,
      deleted: true,
    });
  },
);
